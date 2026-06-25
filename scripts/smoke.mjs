#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tmp = mkdtempSync(join(tmpdir(), "claude-design-opus-smoke-"));

try {
  writeFileSync(join(tmp, "README.md"), "# Smoke Project\n\nSmall fixture for packet generation.\n");

  const result = spawnSync(
    process.execPath,
    [
      join(root, "scripts", "claude-design-opus.mjs"),
      "analyze",
      "--cwd",
      tmp,
      "--files",
      "README.md",
      "--goal",
      "smoke test packet generation",
      "--no-run",
    ],
    { encoding: "utf8" }
  );

  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }

  const runsRoot = join(tmp, ".claude-design-opus", "runs");
  const runs = readdirSync(runsRoot).sort();
  if (runs.length !== 1) {
    throw new Error(`Expected one run directory, found ${runs.length}`);
  }

  const runDir = join(runsRoot, runs[0]);
  for (const file of ["task.md", "prompt.md", "summary.json", "claude-result.md", "diff.patch"]) {
    if (!existsSync(join(runDir, file))) {
      throw new Error(`Missing expected smoke artifact: ${file}`);
    }
  }

  console.log(`Smoke passed: ${runDir}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
