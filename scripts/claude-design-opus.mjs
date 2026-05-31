#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const MODES = new Set(["analyze", "patch", "iterate"]);
const DEFAULT_MODEL = process.env.CLAUDE_DESIGN_MODEL || "opus";
const DEFAULT_EFFORT = process.env.CLAUDE_DESIGN_EFFORT || "high";
const DEFAULT_PERMISSION_MODE = process.env.CLAUDE_DESIGN_PERMISSION_MODE || "acceptEdits";
const DEFAULT_TIMEOUT_MS = Number(process.env.CLAUDE_DESIGN_TIMEOUT_MS || 900000);
const RUNS_DIR = ".claude-design-opus";

function usage(exitCode = 0) {
  const text = `
Usage:
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
  --model <name>            Claude model alias or full model name. Defaults to ${DEFAULT_MODEL}.
  --effort <level>          Claude effort. Defaults to ${DEFAULT_EFFORT}.
  --budget <usd>            Optional max Claude spend for the run.
  --permission-mode <mode>  Claude permission mode. Defaults to ${DEFAULT_PERMISSION_MODE}.
  --timeout-ms <ms>         Max time to wait for Claude. Defaults to ${DEFAULT_TIMEOUT_MS}.
  --worktree                Ask Claude Code to use its worktree mode.
  --no-run                  Write the packet only; do not call Claude.
  --help                    Show this help.

Examples:
  claude-design-opus analyze --files app/page.tsx --goal "critique the hero"
  claude-design-opus patch --files app/page.tsx,components/Hero.tsx --goal "make this feel polished"
  claude-design-opus iterate --from-run .claude-design-opus/runs/2026-05-31T01-00-00-000Z-12345 --notes "CTA still feels generic"
`;
  console.log(text.trim());
  process.exit(exitCode);
}

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  if (!mode || mode === "--help" || mode === "-h") usage(0);
  if (!MODES.has(mode)) {
    console.error(`Unknown mode: ${mode}`);
    usage(1);
  }

  const opts = {
    mode,
    cwd: process.cwd(),
    files: [],
    screenshots: [],
    model: DEFAULT_MODEL,
    effort: DEFAULT_EFFORT,
    budget: null,
    permissionMode: DEFAULT_PERMISSION_MODE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    run: true,
    worktree: false,
  };

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    const next = () => {
      const value = rest[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      i += 1;
      return value;
    };

    if (arg === "--cwd") opts.cwd = next();
    else if (arg === "--goal") opts.goal = next();
    else if (arg === "--files") opts.files.push(...splitList(next()));
    else if (arg === "--file") opts.files.push(next());
    else if (arg === "--route") opts.route = next();
    else if (arg === "--screenshot") opts.screenshots.push(next());
    else if (arg === "--brief") opts.brief = next();
    else if (arg === "--brief-file") opts.briefFile = next();
    else if (arg === "--notes") opts.notes = next();
    else if (arg === "--from-run") opts.fromRun = next();
    else if (arg === "--model") opts.model = next();
    else if (arg === "--effort") opts.effort = next();
    else if (arg === "--budget") opts.budget = next();
    else if (arg === "--permission-mode") opts.permissionMode = next();
    else if (arg === "--timeout-ms") opts.timeoutMs = Number(next());
    else if (arg === "--worktree") opts.worktree = true;
    else if (arg === "--no-run") opts.run = false;
    else if (arg === "--help" || arg === "-h") usage(0);
    else throw new Error(`Unknown option: ${arg}`);
  }

  opts.cwd = resolve(opts.cwd);
  opts.files = unique(opts.files.map((file) => normalizeScopedPath(opts.cwd, file)));
  opts.screenshots = unique(opts.screenshots.map((file) => normalizeScopedPath(opts.cwd, file)));

  if (!opts.goal && opts.mode !== "iterate") {
    throw new Error("--goal is required for analyze and patch");
  }
  if (opts.mode === "iterate" && !opts.fromRun) {
    throw new Error("--from-run is required for iterate");
  }
  if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number");
  }
  if (opts.briefFile) {
    opts.briefFile = normalizeScopedPath(opts.cwd, opts.briefFile);
    opts.brief = readFileSync(resolve(opts.cwd, opts.briefFile), "utf8");
  }
  if (opts.fromRun) opts.fromRun = resolve(opts.cwd, opts.fromRun);

  return opts;
}

function splitList(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(items) {
  return [...new Set(items)];
}

function normalizeScopedPath(cwd, file) {
  const abs = resolve(cwd, file);
  const rel = relative(cwd, abs);
  if (!rel || rel.startsWith("..")) {
    throw new Error(`Scoped paths must live under --cwd: ${file}`);
  }
  return rel;
}

function shell(cmd, cwd) {
  return spawnSync(cmd[0], cmd.slice(1), {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function hasCommand(name) {
  const result = shell(["/usr/bin/env", "which", name], process.cwd());
  return result.status === 0;
}

function timestamp() {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;
}

function readIfExists(path) {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

function buildFileContext(cwd, files) {
  if (files.length === 0) {
    return "No scoped files were provided. Provide analysis only and ask for a tighter file scope before implementation.\n";
  }

  return files
    .map((file) => {
      const abs = resolve(cwd, file);
      if (!existsSync(abs)) return `## ${file}\n\n[MISSING]\n`;
      const content = readFileSync(abs, "utf8");
      return `## ${file}\n\n\`\`\`\n${content}\n\`\`\`\n`;
    })
    .join("\n");
}

function buildPrompt(opts, runDirRel) {
  const allowed = opts.files.length ? opts.files.map((file) => `- ${file}`).join("\n") : "- No scoped files provided";
  const screenshots = opts.screenshots.length ? opts.screenshots.map((file) => `- ${file}`).join("\n") : "- None";
  const prior = opts.fromRun ? readIfExists(resolve(opts.fromRun, "claude-result.md")) : "";
  const brief = opts.brief || "None provided. Use the existing product, component, and style context in the scoped files.";
  const modeRule =
    opts.mode === "patch"
      ? "You may edit only the scoped files. If the right fix requires another file, stop and explain why."
      : opts.mode === "iterate"
        ? "Continue from the prior run. You may edit only the scoped files from the current packet."
        : "Do not edit or write files. Produce critique, priorities, and concrete implementation guidance only.";
  const resultRule =
    opts.mode === "analyze"
      ? "Return your final result in stdout. The wrapper will save it as the run result."
      : `Write your final result to ${runDirRel}/claude-result.md.`;
  const blockerRule =
    opts.mode === "analyze"
      ? "If blocked, return the blocker and the exact missing context in stdout."
      : `If blocked, write the blocker and the exact missing context to ${runDirRel}/claude-result.md.`;

  return `# Frontend Delegation

You are Claude Code acting as a senior frontend engineer and product designer.
Your job is to critique or improve the requested UI while preserving the product's existing intent and behavior.

## Mode
${opts.mode}

## Goal
${opts.goal || opts.notes || "Iterate on the prior run."}

## Route / Target
${opts.route || "Not provided"}

## Scoped Files
${allowed}

## Screenshots / References
${screenshots}

## Brief
${brief}

## Notes
${opts.notes || "None"}

## Prior Result
${prior || "None"}

## Rules
- ${modeRule}
- Preserve existing product intent, data semantics, and user flows.
- Prefer existing components, tokens, utilities, and local patterns over inventing new primitives.
- Do not add dependencies unless the goal is impossible without one.
- Do not deploy, install packages, reset git, check out branches, or run destructive commands.
- ${resultRule}
- If you edit files, include a concise changed-files list and rationale in ${runDirRel}/claude-result.md.
- ${blockerRule}

## Output Shape
For analyze mode:
1. Diagnosis
2. Highest-leverage frontend/design changes
3. File-by-file implementation plan
4. Risks or unknowns

For patch or iterate mode:
1. What changed
2. Why it improves the UI
3. Files changed
4. Verification needed
`;
}

function writePacket(opts, runDir) {
  const relRunDir = relative(opts.cwd, runDir);
  const packet = `# Frontend Delegation Task

Mode: ${opts.mode}
Goal: ${opts.goal || ""}
Route: ${opts.route || ""}
Files:
${opts.files.map((file) => `- ${file}`).join("\n") || "- None"}
Screenshots:
${opts.screenshots.map((file) => `- ${file}`).join("\n") || "- None"}
Brief:
${opts.brief || "None"}
Notes: ${opts.notes || ""}

## File Context

${buildFileContext(opts.cwd, opts.files)}
`;

  const prompt = buildPrompt(opts, relRunDir);
  writeFileSync(resolve(runDir, "task.md"), packet);
  writeFileSync(resolve(runDir, "prompt.md"), prompt);
}

function gitStatus(cwd) {
  const result = shell(["git", "status", "--short", "--untracked-files=all"], cwd);
  return result.status === 0 ? result.stdout : "";
}

function gitAvailable(cwd) {
  return shell(["git", "rev-parse", "--is-inside-work-tree"], cwd).status === 0;
}

function gitDiff(cwd) {
  const result = shell(["git", "diff", "--", "."], cwd);
  return result.status === 0 ? result.stdout : "";
}

function snapshotFiles(cwd, files, dest) {
  mkdirSync(dest, { recursive: true });
  for (const file of files) {
    const source = resolve(cwd, file);
    if (!existsSync(source)) continue;
    const target = resolve(dest, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(source));
  }
}

function fileState(base, file) {
  const path = resolve(base, file);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function changedScopedFiles(beforeDir, afterDir, files) {
  return files.filter((file) => fileState(beforeDir, file) !== fileState(afterDir, file));
}

function snapshotDiff(beforeDir, afterDir) {
  const result = shell(["diff", "-ruN", beforeDir, afterDir], process.cwd());
  return result.status === 0 || result.status === 1 ? result.stdout : result.stderr;
}

function changedFilesFromStatus(status) {
  return status
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^..\s+/, "").replace(/^.* -> /, ""));
}

function findOutOfScope(changed, scoped, runDirRel) {
  const scopedSet = new Set(scoped);
  return changed.filter((file) => {
    if (scopedSet.has(file)) return false;
    if (file.startsWith(`${runDirRel}/`)) return false;
    if (file.startsWith(`${RUNS_DIR}/`)) return false;
    return true;
  });
}

function runClaude(opts, runDir) {
  if (!hasCommand("claude")) {
    throw new Error("Claude CLI was not found on PATH");
  }

  const prompt = readFileSync(resolve(runDir, "prompt.md"), "utf8");
  const args = [
    "-p",
    "--model",
    opts.model,
    "--effort",
    opts.effort,
    "--permission-mode",
    opts.permissionMode,
    "--tools",
    opts.mode === "analyze" ? "Read,Grep,Glob" : "Read,Write,Edit,MultiEdit,Grep,Glob",
  ];

  if (opts.budget) args.push("--max-budget-usd", opts.budget);
  if (opts.worktree) args.push("--worktree");

  args.push("--add-dir", opts.cwd);

  return spawnSync("claude", args, {
    cwd: opts.cwd,
    encoding: "utf8",
    input: prompt,
    timeout: opts.timeoutMs,
    maxBuffer: 50 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function main() {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const runDir = resolve(opts.cwd, RUNS_DIR, "runs", timestamp());
    mkdirSync(runDir, { recursive: true });

    const hasGit = gitAvailable(opts.cwd);
    const beforeStatus = hasGit ? gitStatus(opts.cwd) : "";
    const beforeSnapshot = resolve(runDir, "snapshots", "before");
    const afterSnapshot = resolve(runDir, "snapshots", "after");

    snapshotFiles(opts.cwd, opts.files, beforeSnapshot);
    writePacket(opts, runDir);

    let claudeStatus = null;
    let claudeSignal = null;
    let claudeError = null;

    if (opts.run) {
      console.log(`Run: ${runDir}`);
      console.log(`Packet: ${resolve(runDir, "task.md")}`);
      console.log(`Invoking Claude (${opts.model}, effort ${opts.effort}, timeout ${opts.timeoutMs}ms)...`);
      const result = runClaude(opts, runDir);
      claudeStatus = result.status;
      claudeSignal = result.signal || null;
      claudeError = result.error ? result.error.message : null;

      writeFileSync(resolve(runDir, "stdout.txt"), result.stdout || "");
      writeFileSync(resolve(runDir, "stderr.txt"), `${result.stderr || ""}${claudeError ? `\n${claudeError}\n` : ""}`);

      if (!existsSync(resolve(runDir, "claude-result.md"))) {
        const timeoutNote = result.error && result.error.code === "ETIMEDOUT" ? `Claude timed out after ${opts.timeoutMs}ms.\n` : "";
        writeFileSync(resolve(runDir, "claude-result.md"), timeoutNote || result.stdout || "Claude produced no stdout and no result file.\n");
      }
    } else {
      writeFileSync(resolve(runDir, "claude-result.md"), "Not run. Re-run without --no-run to invoke Claude.\n");
    }

    snapshotFiles(opts.cwd, opts.files, afterSnapshot);

    const afterStatus = hasGit ? gitStatus(opts.cwd) : "";
    const scopedChanges = changedScopedFiles(beforeSnapshot, afterSnapshot, opts.files);
    const diff = hasGit ? gitDiff(opts.cwd) : snapshotDiff(beforeSnapshot, afterSnapshot);
    writeFileSync(resolve(runDir, "diff.patch"), diff);

    const runDirRel = relative(opts.cwd, runDir);
    const changedFiles = unique([...changedFilesFromStatus(afterStatus), ...scopedChanges]);
    const outOfScope = hasGit ? findOutOfScope(changedFiles, opts.files, runDirRel) : [];
    const claudeTimedOut = claudeError ? claudeError.includes("ETIMEDOUT") || claudeError.includes("timed out") : false;

    const summary = {
      mode: opts.mode,
      cwd: opts.cwd,
      runDir,
      model: opts.model,
      effort: opts.effort,
      ranClaude: opts.run,
      claudeStatus,
      claudeSignal,
      claudeError,
      claudeTimedOut,
      timeoutMs: opts.timeoutMs,
      scopedFiles: opts.files,
      changedFiles,
      outOfScope,
      gitAvailable: hasGit,
      scopeCheck: hasGit ? "git" : "scoped-snapshot-only",
      diffSource: hasGit ? "git" : "scoped-snapshot",
      hadPreexistingChanges: beforeStatus.trim().length > 0,
    };
    writeFileSync(resolve(runDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

    console.log(`Completed run: ${runDir}`);
    console.log(`Result: ${resolve(runDir, "claude-result.md")}`);
    console.log(`Diff: ${resolve(runDir, "diff.patch")}`);

    if (outOfScope.length) {
      console.log(`Out-of-scope changes detected: ${outOfScope.join(", ")}`);
      process.exitCode = 2;
    } else if (claudeTimedOut) {
      process.exitCode = 124;
    } else if (claudeStatus && claudeStatus !== 0) {
      process.exitCode = claudeStatus;
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

main();
