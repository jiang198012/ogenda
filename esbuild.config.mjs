import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  // es2020+ required: imapflow deps (pino, ip-address) use BigInt literals,
  // which esbuild cannot down-level to es2018. Obsidian desktop (Electron)
  // runs a modern Chromium, so es2020 is safe.
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
