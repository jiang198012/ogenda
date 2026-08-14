// CDP 辅助:连接 Obsidian 调试端口,执行一段 JS,打印 JSON 结果。
// 用法:node scripts/cdp-eval.mjs "表达式"
const expr = process.argv[2];
if (!expr) {
  console.error("usage: node scripts/cdp-eval.mjs '<js>'");
  process.exit(1);
}

const targets = await (await fetch("http://127.0.0.1:9333/json")).json();
const page = targets.find((t) => t.type === "page" && t.title.includes("demo-vault")) ?? targets.find((t) => t.type === "page");
if (!page) {
  console.error("no obsidian page found");
  process.exit(1);
}
console.error(`[cdp] using page: ${page.title}`);

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
    else p.resolve(msg.result);
  }
};

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

const r = await send("Runtime.evaluate", {
  expression: `(async () => { try { return await (${expr}); } catch (e) { return { __error: String(e && e.stack || e) }; } })()`,
  awaitPromise: true,
  returnByValue: true,
});
console.log(JSON.stringify(r.result?.value ?? r, null, 2));
ws.close();
process.exit(0);
