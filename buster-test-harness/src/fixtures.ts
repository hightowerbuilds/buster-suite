/**
 * Filesystem fixture management for E2E tests.
 *
 * Creates isolated workspace directories seeded with files,
 * runs tests against them, and cleans up afterward.
 */

import { mkdtemp, rm, mkdir, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface FileTree {
  [path: string]: string | FileTree;
}

export interface Workspace {
  /** Absolute path to the workspace root */
  root: string;
  /** Write a file relative to the workspace root */
  writeFile(relativePath: string, content: string): Promise<void>;
  /** Read a file relative to the workspace root */
  readFile(relativePath: string): Promise<string>;
  /** Check if a file exists relative to the workspace root */
  exists(relativePath: string): Promise<boolean>;
  /** List files in a directory relative to the workspace root */
  listDir(relativePath?: string): Promise<string[]>;
  /** Clean up the workspace (delete the temp directory) */
  cleanup(): Promise<void>;
}

/**
 * Create an isolated workspace for testing.
 *
 * @param files - Optional initial file tree to seed the workspace with.
 *                Keys are relative paths, values are file contents.
 *
 * @example
 * ```ts
 * const ws = await createWorkspace({
 *   "src/main.ts": "console.log('hello');",
 *   "package.json": '{ "name": "test" }',
 * });
 * // ... run tests ...
 * await ws.cleanup();
 * ```
 */
export async function createWorkspace(files?: FileTree): Promise<Workspace> {
  const root = await mkdtemp(join(tmpdir(), "buster-test-"));

  const ws: Workspace = {
    root,

    async writeFile(relativePath: string, content: string) {
      const fullPath = join(root, relativePath);
      const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
      await mkdir(dir, { recursive: true });
      await writeFile(fullPath, content, "utf-8");
    },

    async readFile(relativePath: string) {
      return readFile(join(root, relativePath), "utf-8");
    },

    async exists(relativePath: string) {
      try {
        await stat(join(root, relativePath));
        return true;
      } catch {
        return false;
      }
    },

    async listDir(relativePath = ".") {
      return readdir(join(root, relativePath));
    },

    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };

  // Seed initial files
  if (files) {
    await seedFiles(ws, files, "");
  }

  return ws;
}

async function seedFiles(ws: Workspace, tree: FileTree, prefix: string): Promise<void> {
  for (const [name, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (typeof value === "string") {
      await ws.writeFile(path, value);
    } else {
      await seedFiles(ws, value, path);
    }
  }
}
