import { test, expect, describe } from "bun:test";
import { run, runExpectSuccess } from "../src/index.ts";

describe("run", () => {
  test("captures stdout", async () => {
    const result = await run(["echo", "hello world"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello world");
    expect(result.timedOut).toBe(false);
  });

  test("captures stderr", async () => {
    const result = await run(["ls", "/nonexistent-path-xyz"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toBeTruthy();
  });

  test("respects timeout", async () => {
    const result = await run(["sleep", "60"], { timeout: 200 });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
  });

  test("passes stdin", async () => {
    const result = await run(["cat"], { stdin: "hello from stdin" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("hello from stdin");
  });

  test("tracks duration", async () => {
    const result = await run(["echo", "fast"]);
    expect(result.durationMs).toBeLessThan(5000);
    expect(result.durationMs).toBeGreaterThan(0);
  });
});

describe("runExpectSuccess", () => {
  test("returns result on success", async () => {
    const result = await runExpectSuccess(["echo", "ok"]);
    expect(result.stdout.trim()).toBe("ok");
  });

  test("throws on failure", async () => {
    await expect(runExpectSuccess(["ls", "/nonexistent-xyz"])).rejects.toThrow(
      "Command failed",
    );
  });
});
