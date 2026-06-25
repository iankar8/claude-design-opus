# Claude Design Opus

Scoped design/frontend delegation for Claude Code.

This is a small CLI and skill package for handing a bounded UI task to Opus without handing over the whole repo. It writes a task packet, sends the scoped context to Claude Code, and saves the result, raw output, diff, and summary metadata so the calling agent can review the work before accepting it.

It is meant for leaf frontend work: critique, visual polish, responsive fixes, and tightly scoped implementation. It is not a general refactor tool.

## Why It Exists

Design delegation breaks when the brief is vague or the agent can touch too much. This package makes the boundary explicit:

- mode: `analyze`, `patch`, or `iterate`
- project directory
- allowed files
- optional route, screenshots, brief, and notes
- run artifacts saved under `.claude-design-opus/runs/`

The calling agent still owns final review, tests, screenshots, and commit decisions.

## Install

Use it directly from the repo:

```bash
git clone https://github.com/iankar8/claude-design-opus.git
cd claude-design-opus
npm link
```

Or install from GitHub:

```bash
npm install -g github:iankar8/claude-design-opus
```

As a Claude Code skill:

```bash
mkdir -p ~/.claude/skills
git clone https://github.com/iankar8/claude-design-opus.git ~/.claude/skills/claude-design-opus
```

As a Codex skill:

```bash
mkdir -p ~/.codex/skills
git clone https://github.com/iankar8/claude-design-opus.git ~/.codex/skills/claude-design-opus
```

## Requirements

- Node.js 20+
- Claude Code CLI installed and authenticated
- Git, recommended for diff and scope checks

## Usage

Read-only critique:

```bash
claude-design-opus analyze \
  --cwd /path/to/project \
  --files app/page.tsx,components/Hero.tsx \
  --goal "critique the page and identify the highest-leverage frontend fixes"
```

Scoped implementation:

```bash
claude-design-opus patch \
  --cwd /path/to/project \
  --files app/page.tsx,components/Hero.tsx \
  --goal "improve hierarchy, spacing, typography, and responsive polish"
```

Follow up on a prior run:

```bash
claude-design-opus iterate \
  --cwd /path/to/project \
  --from-run .claude-design-opus/runs/2026-05-31T01-00-00-000Z-12345 \
  --files app/page.tsx,components/Hero.tsx \
  --notes "CTA still feels generic; tighten the above-the-fold composition"
```

If you have not linked or globally installed the package, run the script directly:

```bash
node scripts/claude-design-opus.mjs analyze --cwd . --files app/page.tsx --goal "critique this page"
```

## Modes

### `analyze`

Read-only critique. Produces diagnosis, priorities, implementation plan, and risks.

### `patch`

Allows edits only to files passed through `--files` or `--file`.

### `iterate`

Continues from a prior run directory while keeping the new file scope explicit.

## Useful Options

```text
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
```

## Run Artifacts

Each run writes to:

```text
.claude-design-opus/runs/<timestamp>/
```

Artifacts:

- `task.md` - concise task packet
- `prompt.md` - full prompt sent to Claude
- `claude-result.md` - Claude's final result
- `stdout.txt` and `stderr.txt` - raw CLI output when Claude is invoked
- `diff.patch` - git diff or scoped snapshot diff
- `summary.json` - mode, model, timeout, changed files, and scope metadata

## Safety Defaults

- `analyze` is read-only.
- `patch` and `iterate` only grant edit scope for the files you pass.
- The generated prompt tells Claude not to deploy, install packages, reset git, or run destructive commands.
- In git repos, the summary reports changed files and out-of-scope changes.
- `--no-run` creates the packet without calling Claude, useful for smoke tests and manual review.

## Verify

```bash
npm test
npm pack --dry-run
```

The smoke test creates a temporary project, runs `analyze --no-run`, and checks that the expected run artifacts are produced.

## License

MIT
