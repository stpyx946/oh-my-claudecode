import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join, relative, resolve, sep } from 'path';
import { createInterface } from 'readline/promises';
import { type AutoresearchKeepPolicy, parseSandboxContract, slugifyMissionName } from '../autoresearch/contracts.js';
import {
  buildMissionContent as intakeBuildMissionContent,
  buildSandboxContent as intakeBuildSandboxContent,
  type AutoresearchDeepInterviewResult,
  type AutoresearchSeedInputs,
  isLaunchReadyEvaluatorCommand,
  writeAutoresearchDeepInterviewArtifacts,
} from './autoresearch-intake.js';
import { buildTmuxShellCommand, isTmuxAvailable, wrapWithLoginShell } from './tmux-utils.js';

export interface InitAutoresearchOptions {
  topic: string;
  evaluatorCommand: string;
  keepPolicy?: AutoresearchKeepPolicy;
  slug: string;
  repoRoot: string;
}

export interface InitAutoresearchResult {
  missionDir: string;
  slug: string;
}

export interface GuidedAutoresearchSetupDeps {
  createPromptInterface?: typeof createInterface;
}

export interface AutoresearchQuestionIO { question(prompt: string): Promise<string>; close(): void }

function createQuestionIO(makeInterface: typeof createInterface = createInterface): AutoresearchQuestionIO {
  const rl = makeInterface({ input: process.stdin, output: process.stdout });
  return {
    question(prompt: string) {
      return rl.question(prompt);
    },
    close() {
      rl.close();
    },
  };
}

async function promptWithDefault(io: AutoresearchQuestionIO, prompt: string, currentValue?: string): Promise<string> {
  const suffix = currentValue?.trim() ? ` [${currentValue.trim()}]` : '';
  const answer = await io.question(`${prompt}${suffix}\n> `);
  return answer.trim() || currentValue?.trim() || '';
}

async function promptAction(io: AutoresearchQuestionIO, launchReady: boolean): Promise<'launch' | 'refine'> {
  const answer = (await io.question(`\nNext step [launch/refine further] (default: ${launchReady ? 'launch' : 'refine further'})\n> `)).trim().toLowerCase();
  if (!answer) {
    return launchReady ? 'launch' : 'refine';
  }
  if (answer === 'launch') return 'launch';
  if (answer === 'refine further' || answer === 'refine' || answer === 'r') return 'refine';
  throw new Error('Please choose either "launch" or "refine further".');
}

function ensureLaunchReadyEvaluator(command: string): void {
  if (!isLaunchReadyEvaluatorCommand(command)) {
    throw new Error('Evaluator command is still a placeholder/template. Refine further before launch.');
  }
}

export async function materializeAutoresearchDeepInterviewResult(
  result: AutoresearchDeepInterviewResult,
): Promise<InitAutoresearchResult> {
  ensureLaunchReadyEvaluator(result.compileTarget.evaluatorCommand);
  return initAutoresearchMission(result.compileTarget);
}

function buildMissionContent(topic: string): string {
  return `# Mission

${topic}
`;
}

function buildSandboxContent(evaluatorCommand: string, keepPolicy?: AutoresearchKeepPolicy): string {
  return buildSandboxContentImported(evaluatorCommand, keepPolicy);
}

export async function guidedAutoresearchSetup(
  repoRoot: string,
  seedInputs: AutoresearchSeedInputs = {},
  io: AutoresearchQuestionIO = createQuestionIO(),
): Promise<InitAutoresearchResult> {
  if (!process.stdin.isTTY) {
    throw new Error('Guided setup requires an interactive terminal. Use --mission, --sandbox, --keep-policy, and --slug flags for non-interactive use.');
  }

  let topic = seedInputs.topic?.trim() || '';
  let evaluatorCommand = seedInputs.evaluatorCommand?.trim() || '';
  let keepPolicy: AutoresearchKeepPolicy = seedInputs.keepPolicy || 'score_improvement';
  let slug = seedInputs.slug?.trim() || '';

  try {
    while (true) {
      topic = await promptWithDefault(io, 'Research topic/goal', topic);
      if (!topic) {
        throw new Error('Research topic is required.');
      }

      const evaluatorIntent = await promptWithDefault(io, '
How should OMC judge success? Describe it in plain language', topic);
      evaluatorCommand = await promptWithDefault(
        io,
        '
Evaluator command (leave placeholder to refine further; must output {pass:boolean, score?:number} JSON before launch)',
        evaluatorCommand || `TODO replace with evaluator command for: ${evaluatorIntent}`,
      );

      const keepPolicyInput = await promptWithDefault(io, '
Keep policy [score_improvement/pass_only]', keepPolicy);
      keepPolicy = keepPolicyInput.trim().toLowerCase() === 'pass_only' ? 'pass_only' : 'score_improvement';

      slug = await promptWithDefault(io, '
Mission slug', slug || slugifyMissionName(topic));
      slug = slugifyMissionName(slug);

      const deepInterview = await writeAutoresearchDeepInterviewArtifacts({
        repoRoot,
        topic,
        evaluatorCommand,
        keepPolicy,
        slug,
        seedInputs,
      });

      console.log(`
Draft saved: ${deepInterview.draftArtifactPath}`);
      console.log(`Launch readiness: ${deepInterview.launchReady ? 'ready' : deepInterview.blockedReasons.join(' ')}`);

      const action = await promptAction(io, deepInterview.launchReady);
      if (action === 'refine') {
        continue;
      }

      return materializeAutoresearchDeepInterviewResult(deepInterview);
    }
  } finally {
    io.close();
  }
}

export function checkTmuxAvailable(): boolean {
  return isTmuxAvailable();
}

function resolveMissionRepoRoot(missionDir: string): string {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: missionDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function assertTmuxSessionAvailable(sessionName: string): void {
  try {
    execFileSync('tmux', ['has-session', '-t', sessionName], { stdio: 'ignore' });
  } catch {
    throw new Error(
      `tmux session "${sessionName}" did not stay available after launch. `
      + 'Check the mission command, login-shell environment, and tmux logs, then try again.',
    );
  }
}

export function spawnAutoresearchTmux(missionDir: string, slug: string): void {
  if (!checkTmuxAvailable()) {
    throw new Error('tmux is required for background autoresearch execution. Install tmux and try again.');
  }

  const sessionName = `omc-autoresearch-${slug}`;

  try {
    execFileSync('tmux', ['has-session', '-t', sessionName], { stdio: 'ignore' });
    throw new Error(
      `tmux session "${sessionName}" already exists.\n`
      + `  Attach: tmux attach -t ${sessionName}\n`
      + `  Kill:   tmux kill-session -t ${sessionName}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('already exists')) {
      throw error;
    }
  }

  const repoRoot = resolveMissionRepoRoot(missionDir);
  const omcPath = resolve(join(__dirname, '..', '..', 'bin', 'omc.js'));
  const command = buildTmuxShellCommand(process.execPath, [omcPath, 'autoresearch', missionDir]);
  const wrappedCommand = wrapWithLoginShell(command);

  execFileSync('tmux', ['new-session', '-d', '-s', sessionName, '-c', repoRoot, wrappedCommand], { stdio: 'ignore' });
  assertTmuxSessionAvailable(sessionName);

  console.log('\nAutoresearch launched in background tmux session.');
  console.log(`  Session:  ${sessionName}`);
  console.log(`  Mission:  ${missionDir}`);
  console.log(`  Attach:   tmux attach -t ${sessionName}`);
}

export { buildAutoresearchSetupPrompt } from './autoresearch-setup-session.js';
