# Ralplan-first Execution Gate (Issue #997)

## Why this gate exists

Execution quality drops when implementation starts from vague requests. This gate makes planning artifacts explicit before handoff so execution loops (ralph/team/autopilot) have stable scope and test intent.

**Policy:**
- Underspecified execution requests are routed to `ralplan` first.
- Execution/handoff is blocked unless the latest plan has both:
  - `## PRD Scope`
  - `## Test Spec` (or `## Test Specification`)

## Good vs Bad prompts

### Bad (underspecified)
- `fix it`
- `make this better`
- `do the thing`

### Good (execution-ready)
- `Implement OAuth callback in src/auth/callback.ts. Scope: login callback only, no social providers. Test spec: add unit tests for token parsing and one integration test for callback success/failure.`

### Good (planning-first)
- `/oh-my-claudecode:ralplan --interactive "Design and implement repository-level telemetry aggregation for CI diagnostics"`

## E2E example (copy-paste)

1) Start with planning:

```text
/oh-my-claudecode:ralplan --interactive "Add API key rotation workflow for admin users"
```

2) Ensure plan includes:

```markdown
## PRD Scope
- In scope: Admin UI + backend endpoint for key rotation
- Out of scope: self-serve user key rotation

## Test Spec
- Unit: key rotation service validates old/new key semantics
- Integration: endpoint auth + rotation happy path + invalid key failure
- E2E: admin rotates key and old key stops working
```

3) Approve execution handoff (ralph/team). Pre-tool gate now allows execution.

## Troubleshooting

### "PRE_EXECUTION_GATE_FAILED"
- Cause: missing plan artifacts.
- Fix: update latest `.omc/plans/*.md` with `## PRD Scope` and `## Test Spec`.

### "Request looks underspecified. Route through ralplan first"
- Cause: vague execution intent.
- Fix: either provide concrete scope+tests in the prompt, or run `ralplan --interactive`.

### I already have an old plan
- Gate checks the latest plan file by mtime in `.omc/plans/`.
- Update the latest plan or create a fresh one via `ralplan`.
