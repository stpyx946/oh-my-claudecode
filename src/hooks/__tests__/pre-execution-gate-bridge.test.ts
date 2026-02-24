import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { processHook } from '../bridge.js';

describe('bridge pre-execution gate integration', () => {
  it('injects ralplan guidance for vague request', async () => {
    const result = await processHook('keyword-detector', {
      sessionId: 's1',
      prompt: 'fix it',
      directory: mkdtempSync(join(tmpdir(), 'omc-bridge-gate-')),
    });

    expect(result.continue).toBe(true);
    expect(result.message).toContain('PRE-EXECUTION GATE');
    expect(result.message).toContain('ralplan');
  });

  it('blocks execution skill invocation without required artifacts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'omc-bridge-gate-'));

    const blocked = await processHook('pre-tool-use', {
      sessionId: 's2',
      toolName: 'Skill',
      toolInput: { skill: 'oh-my-claudecode:ralph' },
      directory: root,
    });

    expect(blocked.continue).toBe(false);
    expect(blocked.reason).toBe('PRE_EXECUTION_GATE_FAILED');
  });

  it('allows execution skill invocation when artifacts are present', async () => {
    const root = mkdtempSync(join(tmpdir(), 'omc-bridge-gate-'));
    const plansDir = join(root, '.omc', 'plans');
    mkdirSync(plansDir, { recursive: true });
    writeFileSync(
      join(plansDir, 'plan.md'),
      '# Plan\n\n## PRD Scope\n- scope\n\n## Test Specification\n- tests\n'
    );

    const result = await processHook('pre-tool-use', {
      sessionId: 's3',
      toolName: 'Skill',
      toolInput: { skill: 'oh-my-claudecode:ralph' },
      directory: root,
    });

    expect(result.continue).toBe(true);
  });
});
