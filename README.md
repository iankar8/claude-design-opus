# Claude Design Opus Skill

An agent skill for delegating scoped frontend and design critique or edits to Opus through Claude Code.

The skill wraps a tiny Node script. It creates a run folder, writes a clear handoff prompt, invokes the Claude CLI with a tight file scope, and saves the result, stdout, stderr, diff, and summary metadata for review.

## Requirements

- Node.js 20+
- Claude Code CLI installed and authenticated
- Git, optional but recommended for scope checks

## Install

As a Claude Code skill:

```bash
mkdir -p ~/.claude/skills
git clone https://github.com/iankar8/claude-design-opus.git ~/.claude/skills/claude-design-opus
```

As a local Codex skill, clone it into your Codex skills directory instead:

```bash
mkdir -p ~/.codex/skills
git clone https://github.com/iankar8/claude-design-opus.git ~/.codex/skills/claude-design-opus
```

Optional CLI install:

```bash
npm install -g github:iankar8/claude-design-opus
```

Or from a local clone:

```bash
git clone https://github.com/iankar8/claude-design-opus.git
cd claude-design-opus
npm link
```

## Usage

Read-only critique:

```bash
node scripts/claude-design-opus.mjs analyze \
  --cwd /path/to/project \
  --files app/page.tsx,components/Hero.tsx \
  --goal "critique the page and identify the highest-leverage frontend fixes"
```

Scoped implementation:

```bash
node scripts/claude-design-opus.mjs patch \
  --cwd /path/to/project \
  --files app/page.tsx,components/Hero.tsx \
  --goal "improve hierarchy, spacing, typography, and responsive polish"
```

Follow-up on a prior run:

```bash
node scripts/claude-design-opus.mjs iterate \
  --cwd /path/to/project \
  --from-run .claude-design-opus/runs/2026-05-31T01-00-00-000Z-12345 \
  --files app/page.tsx,components/Hero.tsx \
  --notes "The CTA still feels generic; tighten the above-the-fold composition"
```

If installed with `npm install -g` or `npm link`, you can use `claude-design-opus` instead of `node scripts/claude-design-opus.mjs`.

## Model

The wrapper defaults to the Claude CLI `opus` alias:

```bash
node scripts/claude-design-opus.mjs patch --model opus --files app/page.tsx --goal "polish this UI"
```

If your Claude CLI exposes a specific Opus model string, you can pin it:

```bash
CLAUDE_DESIGN_MODEL=<your-opus-model-name> node scripts/claude-design-opus.mjs patch --files app/page.tsx --goal "polish this UI"
```

## What Gets Saved

Each run writes to:

```text
.claude-design-opus/runs/<timestamp>/
```

Artifacts:

- `task.md` - the concise task packet
- `prompt.md` - the full prompt sent to Claude
- `claude-result.md` - Claude's final result
- `stdout.txt` and `stderr.txt` - raw CLI output
- `diff.patch` - git diff or scoped snapshot diff
- `summary.json` - model, mode, timeout, changed files, and scope metadata

## Safety Defaults

- `analyze` mode is read-only.
- `patch` and `iterate` only grant Claude edit tools for the scoped files you pass.
- The prompt tells Claude not to deploy, install packages, reset git, or run destructive commands.
- In git repos, the summary reports changed files and out-of-scope changes.
- The default timeout is 15 minutes. Override with `--timeout-ms`.

## CLI

```text
claude-design-opus <analyze|patch|iterate> --goal "..." [options]

Options:
  --cwd <path>              Project directory. Defaults to current dir.
  --files <a,b,c>           Comma-separated files Claude may inspect/edit.
  --file <path>             Add one scoped file. Can be repeated.
  --route <url>             Local URL or route being worked on.
  --screenshot <path>       Screenshot or image reference path. Can be repeated.
  --brief <text>            Product/design brief to constrain the pass.
  --brief-file <path>       File containing the brief.
  --notes <text>            Extra constraints or implementation notes.
  --from-run <run-dir>      Prior run directory for iterate mode.
  --model <name>            Claude model alias or full model name. Defaults to opus.
  --effort <level>          Claude effort. Defaults to high.
  --budget <usd>            Optional max Claude spend for the run.
  --permission-mode <mode>  Claude permission mode. Defaults to acceptEdits.
  --timeout-ms <ms>         Max time to wait for Claude. Defaults to 900000.
  --worktree                Ask Claude Code to use its worktree mode.
  --no-run                  Write the packet only; do not call Claude.
  --help                    Show help.
```
