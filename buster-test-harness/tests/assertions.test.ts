import { test, expect, describe, afterEach } from "bun:test";
import {
  createWorkspace,
  type Workspace,
  assertFileContains,
  assertFileEquals,
  assertFileExists,
  assertFileNotExists,
  assertGitStatus,
} from "../src/index.ts";
import { run } from "../src/runner.ts";

let ws: Workspace;

afterEach(async () => {
  if (ws) await ws.cleanup();
});

describe("file assertions", () => {
  test("assertFileContains passes when content matches", async () => {
    ws = await createWorkspace({ "test.txt": "hello world" });
    await assertFileContains(ws, "test.txt", "hello");
  });

  test("assertFileContains throws when content missing", async () => {
    ws = await createWorkspace({ "test.txt": "hello world" });
    await expect(
      assertFileContains(ws, "test.txt", "goodbye"),
    ).rejects.toThrow("Expected test.txt to contain");
  });

  test("assertFileEquals passes on exact match", async () => {
    ws = await createWorkspace({ "test.txt": "exact content" });
    await assertFileEquals(ws, "test.txt", "exact content");
  });

  test("assertFileExists passes when file exists", async () => {
    ws = await createWorkspace({ "test.txt": "data" });
    await assertFileExists(ws, "test.txt");
  });

  test("assertFileNotExists passes when file missing", async () => {
    ws = await createWorkspace();
    await assertFileNotExists(ws, "missing.txt");
  });
});

describe("git assertions", () => {
  test("assertGitStatus detects untracked file", async () => {
    ws = await createWorkspace();
    await run(["git", "init"], { cwd: ws.root });
    await ws.writeFile("new-file.txt", "hello");

    await assertGitStatus(ws, "new-file.txt", "untracked");
  });

  test("assertGitStatus detects modified file", async () => {
    ws = await createWorkspace({ "tracked.txt": "original" });
    await run(["git", "init"], { cwd: ws.root });
    await run(["git", "add", "."], { cwd: ws.root });
    await run(["git", "commit", "-m", "init"], { cwd: ws.root });

    await ws.writeFile("tracked.txt", "modified content");
    await assertGitStatus(ws, "tracked.txt", "modified");
  });

  test("assertGitStatus detects clean file", async () => {
    ws = await createWorkspace({ "clean.txt": "content" });
    await run(["git", "init"], { cwd: ws.root });
    await run(["git", "add", "."], { cwd: ws.root });
    await run(["git", "commit", "-m", "init"], { cwd: ws.root });

    await assertGitStatus(ws, "clean.txt", "clean");
  });
});
