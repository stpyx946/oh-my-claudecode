import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  isExecutionSkill,
  shouldForceRalplan,
  validateExecutionArtifacts,
} from '../pre-execution-gate.js';

describe('pre-execution gate', () => {
  it('detects execution skills', () => {
    expect(isExecutionSkill('oh-my-claudecode:ralph')).toBe(true);
    expect(isExecutionSkill('team')).toBe(true);
    expect(isExecutionSkill('plan')).toBe(false);
  });

  it('forces ralplan for vague execution requests', () => {
    expect(shouldForceRalplan('fix it')).toBe(true);
    expect(shouldForceRalplan('implement OAuth callback in src/auth with tests')).toBe(false);
    expect(shouldForceRalplan('ralplan fix it')).toBe(false);
  });

  it('requires PRD Scope and Test Spec in latest plan', () => {
    const root = mkdtempSync(join(tmpdir(), 'omc-pre-exec-gate-'));
    const plansDir = join(root, '.omc', 'plans');
    mkdirSync(plansDir, { recursive: true });

    const missing = join(plansDir, 'plan-a.md');
    writeFileSync(missing, '# Plan\n\n## Requirements\n- x\n');

    const failResult = validateExecutionArtifacts(root);
    expect(failResult.ok).toBe(false);
    expect(failResult.missing.length).toBeGreaterThan(0);

    const valid = join(plansDir, 'plan-b.md');
    writeFileSync(
      valid,
      '# Plan\n\n## PRD Scope\n- in scope\n\n## Test Spec\n- unit\n- integration\n'
    );

    const passResult = validateExecutionArtifacts(root);
    expect(passResult.ok).toBe(true);
    expect(passResult.planPath).toBe(valid);
  });
});
