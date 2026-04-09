import { test, expect, describe, afterEach } from "bun:test";
import { createWorkspace, type Workspace } from "../src/index.ts";

let ws: Workspace;

afterEach(async () => {
  if (ws) await ws.cleanup();
});

describe("createWorkspace", () => {
  test("creates an empty workspace", async () => {
    ws = await createWorkspace();
    expect(ws.root).toBeTruthy();
    const files = await ws.listDir();
    expect(files).toEqual([]);
  });

  test("seeds files from a flat tree", async () => {
    ws = await createWorkspace({
      "main.ts": "console.log('hello');",
      "package.json": '{ "name": "test" }',
    });

    const content = await ws.readFile("main.ts");
    expect(content).toBe("console.log('hello');");

    const pkg = await ws.readFile("package.json");
    expect(pkg).toBe('{ "name": "test" }');
  });

  test("seeds nested directory structures", async () => {
    ws = await createWorkspace({
      src: {
        "main.ts": "import './lib';",
        lib: {
          "utils.ts": "export const add = (a: number, b: number) => a + b;",
        },
      },
    });

    expect(await ws.exists("src/main.ts")).toBe(true);
    expect(await ws.exists("src/lib/utils.ts")).toBe(true);

    const content = await ws.readFile("src/lib/utils.ts");
    expect(content).toContain("export const add");
  });

  test("writeFile creates intermediate directories", async () => {
    ws = await createWorkspace();
    await ws.writeFile("deep/nested/dir/file.txt", "hello");

    expect(await ws.exists("deep/nested/dir/file.txt")).toBe(true);
    expect(await ws.readFile("deep/nested/dir/file.txt")).toBe("hello");
  });

  test("cleanup removes the workspace", async () => {
    ws = await createWorkspace({ "test.txt": "data" });
    const root = ws.root;
    await ws.cleanup();

    const { existsSync } = await import("node:fs");
    expect(existsSync(root)).toBe(false);
  });
});
