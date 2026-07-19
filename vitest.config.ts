import { defineConfig } from "vitest/config";

// The "obsidian" npm package ships type declarations only (no runtime JS,
// no valid package.json "main"/"exports"), so Vite's resolver cannot load it
// while collecting tests — any module that does `import ... from "obsidian"`
// fails to even load under Vitest, regardless of whether the import is used.
// esbuild.config.mjs already marks "obsidian" external for the real plugin
// build; Obsidian's app supplies the real module at runtime. This stub only
// exists so that specifier resolves during `vitest run`; connectors needing
// it (e.g. IcsConnector) accept an injectable fetch implementation and tests
// never actually invoke requestUrl.
export default defineConfig({
  plugins: [
    {
      name: "stub-obsidian-for-tests",
      enforce: "pre",
      resolveId(id: string) {
        if (id === "obsidian") return "\0obsidian-stub";
      },
      load(id: string) {
        if (id === "\0obsidian-stub") {
          return `export function requestUrl() { throw new Error("obsidian.requestUrl stub: tests must inject a fetchImpl instead of calling this"); }`;
        }
      },
    },
  ],
});
