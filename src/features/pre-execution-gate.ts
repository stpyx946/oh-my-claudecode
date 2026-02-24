import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export interface ExecutionArtifactValidation {
  ok: boolean;
  planPath: string | null;
  missing: string[];
  message: string;
}

const EXECUTION_SKILLS = new Set([
  'ralph',
  'autopilot',
  'team',
  'ultrawork',
  'pipeline',
  'ultrapilot',
  'swarm',
]);

const VAGUE_REQUEST_PATTERNS: RegExp[] = [
  /\bfix\s+it\b/i,
  /\bdo\s+it\b/i,
  /\bmake\s+it\s+better\b/i,
  /\bimprove\s+this\b/i,
  /\bhelp\s+me\b/i,
  /\bsomething\b/i,
  /\bstuff\b/i,
  /\bwhatever\b/i,
];

export function isExecutionSkill(skillName: string | null | undefined): boolean {
  if (!skillName) return false;
  const normalized = skillName.includes(':') ? skillName.split(':').at(-1) : skillName;
  return EXECUTION_SKILLS.has((normalized || '').toLowerCase());
}

export function isVagueRequest(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (!trimmed) return true;

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 6) return true;

  const hasConcreteSignals =
    /\b(src|file|api|endpoint|component|test|spec|acceptance|scope|requirement|bug|issue|function|class|module)\b/i.test(trimmed) ||
    /[#/._-]/.test(trimmed) ||
    /\b\d+\b/.test(trimmed);

  if (hasConcreteSignals) return false;

  return VAGUE_REQUEST_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function shouldForceRalplan(prompt: string): boolean {
  const hasPlanningKeyword = /\b(ralplan|plan|prd|test\s*spec|test\s*plan)\b/i.test(prompt);
  const hasExecutionIntent = /\b(build|fix|implement|create|add|update|refactor|improve|ship|do)\b/i.test(prompt);
  return hasExecutionIntent && isVagueRequest(prompt) && !hasPlanningKeyword;
}

function getLatestPlanPath(root: string): string | null {
  const plansDir = join(root, '.omc', 'plans');
  if (!existsSync(plansDir)) return null;

  const candidates = readdirSync(plansDir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const path = join(plansDir, name);
      const mtime = statSync(path).mtimeMs;
      return { path, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);

  return candidates[0]?.path ?? null;
}

export function validateExecutionArtifacts(root: string): ExecutionArtifactValidation {
  const planPath = getLatestPlanPath(root);
  if (!planPath) {
    return {
      ok: false,
      planPath: null,
      missing: ['plan file in .omc/plans/*.md', '## PRD Scope section', '## Test Spec section'],
      message:
        '[PRE-EXECUTION GATE] Execution blocked. No approved plan artifacts found. Run ralplan first and produce PRD Scope + Test Spec.',
    };
  }

  const content = readFileSync(planPath, 'utf-8');
  const missing: string[] = [];

  if (!/^##\s+PRD\s+Scope\b/im.test(content)) {
    missing.push('## PRD Scope section');
  }

  if (!/^##\s+Test\s+Spec(?:ification)?\b/im.test(content)) {
    missing.push('## Test Spec section');
  }

  if (missing.length > 0) {
    return {
      ok: false,
      planPath,
      missing,
      message:
        `[PRE-EXECUTION GATE] Execution blocked. Missing required artifacts in ${planPath}: ${missing.join(', ')}. ` +
        'Update the plan via ralplan before execution handoff.',
    };
  }

  return {
    ok: true,
    planPath,
    missing: [],
    message: `[PRE-EXECUTION GATE] Artifacts verified: ${planPath}`,
  };
}
