/**
 * Process runner for E2E tests.
 *
 * Launches commands in a workspace, captures output, and provides
 * assertion helpers. This is the foundation for all E2E scenarios.
 */

export interface RunOptions {
  /** Working directory (defaults to workspace root) */
  cwd?: string;
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Input to pipe to stdin */
  stdin?: string;
}

export interface RunResult {
  /** Exit code (null if killed) */
  exitCode: number | null;
  /** Captured stdout */
  stdout: string;
  /** Captured stderr */
  stderr: string;
  /** Whether the process was killed due to timeout */
  timedOut: boolean;
  /** Wall-clock duration in milliseconds */
  durationMs: number;
}

/**
 * Run a command and capture its output.
 *
 * Uses Bun's spawn API for direct process execution (no shell).
 */
export async function run(
  command: string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const { cwd, env, timeout = 30_000, stdin } = options;
  const start = performance.now();

  const proc = Bun.spawn(command, {
    cwd,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
    stdin: stdin ? "pipe" : undefined,
  });

  // Write stdin if provided
  if (stdin && proc.stdin) {
    proc.stdin.write(stdin);
    proc.stdin.end();
  }

  // Race between process completion and timeout
  let timedOut = false;

  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      timedOut = true;
      proc.kill();
      resolve();
    }, timeout);
  });

  await Promise.race([proc.exited, timeoutPromise]);

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  return {
    exitCode: timedOut ? null : proc.exitCode,
    stdout,
    stderr,
    timedOut,
    durationMs: performance.now() - start,
  };
}

/**
 * Run a command and assert it succeeds (exit code 0).
 * Throws with stdout/stderr on failure.
 */
export async function runExpectSuccess(
  command: string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const result = await run(command, options);
  if (result.exitCode !== 0) {
    throw new Error(
      `Command failed: ${command.join(" ")}\n` +
        `Exit code: ${result.exitCode}\n` +
        `stdout: ${result.stdout}\n` +
        `stderr: ${result.stderr}`,
    );
  }
  return result;
}
