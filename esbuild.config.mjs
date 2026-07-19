import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  // Obsidian desktop (Electron) runs a modern Chromium, so es2020 is safe;
  // keep it as the floor so modern dependency syntax (e.g. ical.js) isn't down-leveled.
  target: "es2020",
  external: ["obsidian", "electron", ...builtins],
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  logLevel: "info",
  outfile: "main.js",
  minify: prod,
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
