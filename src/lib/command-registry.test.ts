import { afterEach, describe, it, expect, vi } from "vitest";
import { registry } from "./command-registry";

describe("CommandRegistry", () => {
  // Clear registry between tests to avoid leaking state
  const ids: string[] = [];
  function reg(cmd: Parameters<typeof registry.register>[0]) {
    registry.register(cmd);
    ids.push(cmd.id);
  }
  afterEach(() => {
    for (const id of ids) registry.unregister(id);
    ids.length = 0;
  });

  it("registers and retrieves commands", () => {
    reg({ id: "test.a", label: "Test A", execute: () => {} });
    reg({ id: "test.b", label: "Test B", execute: () => {} });
    const all = registry.getAll();
    expect(all.some(c => c.id === "test.a")).toBe(true);
    expect(all.some(c => c.id === "test.b")).toBe(true);
  });

  it("unregisters commands", () => {
    reg({ id: "test.rm", label: "Remove Me", execute: () => {} });
    expect(registry.getAll().some(c => c.id === "test.rm")).toBe(true);
    registry.unregister("test.rm");
    ids.pop();
    expect(registry.getAll().some(c => c.id === "test.rm")).toBe(false);
  });

  it("search finds commands by label", () => {
    reg({ id: "test.save", label: "Save", category: "File", execute: () => {} });
    reg({ id: "test.settings", label: "Settings", category: "View", execute: () => {} });
    const results = registry.search("sav");
    expect(results.some(c => c.id === "test.save")).toBe(true);
  });

  it("search returns all when query is empty", () => {
    reg({ id: "test.x", label: "X", execute: () => {} });
    const results = registry.search("");
    expect(results.some(c => c.id === "test.x")).toBe(true);
  });

  it("search filters by category + label", () => {
    reg({ id: "test.fs", label: "Save", category: "File", execute: () => {} });
    const results = registry.search("file save");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("test.fs");
  });

  it("execute calls the command callback", () => {
    const fn = vi.fn();
    reg({ id: "test.exec", label: "Exec", execute: fn });
    registry.execute("test.exec");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("execute does nothing for unknown id", () => {
    expect(() => registry.execute("nonexistent")).not.toThrow();
  });

  it("respects when guard in getAll", () => {
    let enabled = false;
    reg({ id: "test.guarded", label: "Guarded", when: () => enabled, execute: () => {} });
    expect(registry.getAll().some(c => c.id === "test.guarded")).toBe(false);
    enabled = true;
    expect(registry.getAll().some(c => c.id === "test.guarded")).toBe(true);
  });

  it("respects when guard in execute", () => {
    const fn = vi.fn();
    reg({ id: "test.blocked", label: "Blocked", when: () => false, execute: fn });
    registry.execute("test.blocked");
    expect(fn).not.toHaveBeenCalled();
  });
});
