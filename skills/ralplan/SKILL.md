---
name: ralplan
description: Alias for /plan --consensus
---

# Ralplan (Consensus Planning Alias)

Ralplan is a shorthand alias for `/oh-my-claudecode:plan --consensus`. It triggers iterative planning with Planner, Architect, and Critic agents until consensus is reached.

## Usage

```
/oh-my-claudecode:ralplan "task description"
```

## Flags

- `--interactive`: Enables user prompts at key decision points (draft review in step 2 and final approval in step 6). Without this flag the workflow runs fully automated — Planner → Architect → Critic loop — and outputs the final plan without asking for confirmation.

## Usage with interactive mode

```
/oh-my-claudecode:ralplan --interactive "task description"
```

## Behavior

This skill invokes the Plan skill in consensus mode:

```
/oh-my-claudecode:plan --consensus <arguments>
```

The consensus workflow:
1. **Planner** creates initial plan
2. **User feedback** *(--interactive only)*: If `--interactive` is set, use `AskUserQuestion` to present the draft plan before review (Proceed to review / Request changes / Skip review). Otherwise, automatically proceed to review.
3. **Architect** reviews for architectural soundness — **await completion before step 4**
4. **Critic** evaluates against quality criteria — run only after step 3 completes
5. **Re-review loop** (max 5 iterations): Any non-`APPROVE` Critic verdict (`ITERATE` or `REJECT`) MUST run the same full closed loop:
   a. Collect Architect + Critic feedback
   b. Revise the plan with Planner
   c. Return to Architect review
   d. Return to Critic evaluation
   e. Repeat this loop until Critic returns `APPROVE` or 5 iterations are reached
   f. If 5 iterations are reached without `APPROVE`, present the best version to the user
6. On Critic approval *(--interactive only)*: If `--interactive` is set, use `AskUserQuestion` to present the plan with approval options (Approve and execute via ralph / Approve and implement via team / Clear context and implement / Request changes / Reject). Otherwise, output the final plan and stop.
7. *(--interactive only)* User chooses: Approve (ralph or team), Request changes, or Reject
8. *(--interactive only)* On approval: invoke `Skill("oh-my-claudecode:ralph")` for sequential execution or `Skill("oh-my-claudecode:team")` for parallel team execution -- never implement directly

> **Important:** Steps 3 and 4 MUST run sequentially. Do NOT issue both agent Task calls in the same parallel batch. Always await the Architect result before issuing the Critic Task.

## Required Artifacts (Pre-Execution Gate)

The plan produced by ralplan **MUST** contain these sections before any execution handoff (ralph/team/autopilot) is permitted:

- `## PRD Scope` — explicit in-scope / out-of-scope boundaries
- `## Test Spec` — unit/integration/e2e strategy with concrete commands

Without both sections, the pre-execution gate will block Skill invocations to execution modes. See `docs/RALPLAN_EXECUTION_GATE.md` for details.

Follow the Plan skill's full documentation for consensus mode details.
