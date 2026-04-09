/**
 * IDE-specific assertion helpers for E2E tests.
 *
 * These build on the runner and fixtures to provide high-level
 * assertions like "file should contain X" or "git should show file as modified."
 */

import type { Workspace } from "./fixtures.ts";
import { run } from "./runner.ts";

/**
 * Assert that a file in the workspace contains a specific string.
 */
export async function assertFileContains(
  ws: Workspace,
  relativePath: string,
  expected: string,
): Promise<void> {
  const content = await ws.readFile(relativePath);
  if (!content.includes(expected)) {
    throw new Error(
      `Expected ${relativePath} to contain "${expected}"\n` +
        `Actual content:\n${content}`,
    );
  }
}

/**
 * Assert that a file in the workspace matches exact content.
 */
export async function assertFileEquals(
  ws: Workspace,
  relativePath: string,
  expected: string,
): Promise<void> {
  const content = await ws.readFile(relativePath);
  if (content !== expected) {
    throw new Error(
      `Expected ${relativePath} to equal:\n${expected}\n\nActual:\n${content}`,
    );
  }
}

/**
 * Assert that a file exists in the workspace.
 */
export async function assertFileExists(
  ws: Workspace,
  relativePath: string,
): Promise<void> {
  const exists = await ws.exists(relativePath);
  if (!exists) {
    throw new Error(`Expected ${relativePath} to exist, but it does not`);
  }
}

/**
 * Assert that a file does NOT exist in the workspace.
 */
export async function assertFileNotExists(
  ws: Workspace,
  relativePath: string,
): Promise<void> {
  const exists = await ws.exists(relativePath);
  if (exists) {
    throw new Error(`Expected ${relativePath} to not exist, but it does`);
  }
}

/**
 * Assert that git status shows a file in a specific state.
 */
export async function assertGitStatus(
  ws: Workspace,
  relativePath: string,
  expectedStatus: "modified" | "untracked" | "added" | "deleted" | "clean",
): Promise<void> {
  const result = await run(["git", "status", "--porcelain", relativePath], {
    cwd: ws.root,
  });

  const statusLine = result.stdout.trim();
  const statusMap: Record<string, string[]> = {
    modified: ["M ", " M", "MM"],
    untracked: ["??"],
    added: ["A ", "AM"],
    deleted: ["D ", " D"],
    clean: [""],
  };

  const validPrefixes = statusMap[expectedStatus];
  if (!validPrefixes) {
    throw new Error(`Unknown status: ${expectedStatus}`);
  }

  const prefix = statusLine.slice(0, 2);
  const isClean = expectedStatus === "clean" && statusLine === "";

  if (!isClean && !validPrefixes.includes(prefix)) {
    throw new Error(
      `Expected ${relativePath} to be ${expectedStatus}, ` +
        `but git status shows: "${statusLine}"`,
    );
  }
}

/**
 * Assert that a command completes within a time budget (performance test).
 */
export async function assertCompletesWithin(
  command: string[],
  maxMs: number,
  options: { cwd?: string } = {},
): Promise<void> {
  const result = await run(command, { ...options, timeout: maxMs * 2 });

  if (result.timedOut) {
    throw new Error(
      `Command timed out: ${command.join(" ")} (budget: ${maxMs}ms)`,
    );
  }

  if (result.durationMs > maxMs) {
    throw new Error(
      `Command too slow: ${command.join(" ")} ` +
        `took ${result.durationMs.toFixed(0)}ms, budget was ${maxMs}ms`,
    );
  }
}
