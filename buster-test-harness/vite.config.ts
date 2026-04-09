import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    dts({ rollupTypes: true }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "BusterTestHarness",
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format === "es" ? "mjs" : "cjs"}`,
    },
    rollupOptions: {
      external: ["node:fs/promises", "node:os", "node:path", "bun"],
    },
  },
});
