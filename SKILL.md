---
name: claude-design-opus
description: "Use when the user wants to delegate scoped frontend or design critique, visual polish, UI implementation, or interface redesign work to Opus through Claude Code. This skill wraps the bundled claude-design-opus script and keeps the calling agent responsible for scope, review, and verification."
user_invocable: true
---

# Claude Design Opus

Delegate scoped frontend and design work to Opus while the calling agent keeps ownership of orchestration, repo safety, and final verification.

This skill is intentionally small:

- `analyze` asks Opus for read-only critique and an implementation plan.
- `patch` lets Opus edit only the files passed in `--files` or `--file`.
- `iterate` continues from a previous run directory with new notes.

## Tool

Run the bundled script from this skill directory:

```bash
node scripts/claude-design-opus.mjs <mode> [options]
```

The script defaults to the Claude CLI `opus` model alias. Override with `--model` or `CLAUDE_DESIGN_MODEL` when you need a specific model string.

## Workflow

1. Decide whether the task is safe to delegate:
   - Use this for leaf frontend work: pages, components, visual polish, responsive fixes, UI critique, and scoped redesign.
   - Do not use this for shared infrastructure, auth, data models, build systems, routing foundations, or broad repo rewrites without first producing a plan.
2. Identify the target project directory.
3. Choose the smallest useful file scope.
4. Run `analyze` first when the request is vague, subjective, or multi-file.
5. Run `patch` only when the goal and file scope are concrete.
6. Inspect the run artifacts:
   - `.claude-design-opus/runs/<timestamp>/summary.json`
   - `.claude-design-opus/runs/<timestamp>/claude-result.md`
   - `.claude-design-opus/runs/<timestamp>/diff.patch`
7. If `summary.json.outOfScope` is non-empty, stop and report it before continuing.
8. Run the relevant local verification yourself. Do not treat Opus output as accepted until it has been reviewed and checked.

## Common Commands

Read-only critique:

```bash
node scripts/claude-design-opus.mjs analyze \
  --cwd /path/to/project \
  --files app/page.tsx,components/Hero.tsx \
  --goal "critique this page and identify the highest-leverage frontend fixes"
```

Scoped implementation:

```bash
node scripts/claude-design-opus.mjs patch \
  --cwd /path/to/project \
  --files app/page.tsx,components/Hero.tsx \
  --goal "improve hierarchy, spacing, typography, and responsive polish"
```

Follow-up pass:

```bash
node scripts/claude-design-opus.mjs iterate \
  --cwd /path/to/project \
  --from-run .claude-design-opus/runs/<timestamp> \
  --files app/page.tsx,components/Hero.tsx \
  --notes "The CTA still feels generic; tighten the above-the-fold composition"
```

## Rules

- Keep `--files` tight. It is the safety boundary.
- Use `--screenshot <path>` when a current UI screenshot or reference image exists.
- Use `--route <url>` when the work maps to a local page.
- Use `--brief` or `--brief-file` for product constraints, user goals, and style constraints.
- Use `--no-run` when you only want the handoff packet for manual review.
- Use `--worktree` for larger patch attempts in git repos.
- Do not run broad repo-level patch requests. Run `analyze` first, then patch scoped files.
- The calling agent owns final tests, builds, screenshots, review, and the final user-facing summary.
