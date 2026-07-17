# ogenda D0 — iCloud CalDAV 传输探针 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 证明 Obsidian `requestUrl` 能对真实 iCloud CalDAV 完成整套双向传输:**discovery(PROPFIND)→ 读(REPORT calendar-query)→ 写(PUT 建事件)→ 删(DELETE)**,并用 iPhone/Mac 日历肉眼确认写入生效。这是双向 CalDAV 引擎的传输地基,最大未知。

**Architecture:** 一个最小探针命令,复用现有插件外壳;新增 `davRequest`(requestUrl 封装,发 PROPFIND/REPORT/PUT/DELETE + Basic auth + Depth/If-Match)、iCloud 凭据设置项、XML 用内建 `DOMParser` 解析。一次性验证件,通过后据结果建 D1。

**Tech Stack:** TypeScript · Obsidian `requestUrl` / `DOMParser` · iCloud CalDAV(basic auth)

## Global Constraints

- iCloud:端点起点 `https://caldav.icloud.com`;认证 = **Apple ID email + 16 位 App 专用密码**(账户需开双重认证)Basic over TLS。
- 传输一律走 `requestUrl({url, method, headers, body, throw:false})`;`method` 用 PROPFIND/REPORT/PUT/DELETE;看状态码(207 读、201/204 写、412 冲突、401 认证失败)。
- discovery 会跳到分区主机 `pNN-caldav.icloud.com`(per-account,**不可硬编码**)——principal/home 的 href 从响应里取。
- iCloud **无 PATCH**:改事件整条 PUT;PUT/DELETE 带 `If-Match: <etag>`。
- 凭据存法沿用已定的明文持久化(`data.json`);探针结束**删除凭据**。
- 一次性探针:不追求优雅,目标是拿到"每步状态码 + 原始响应"。
- 桌面端 only 验证(`requestUrl` 两端可用,但先在桌面测)。

---

### Task D0.1: iCloud 凭据设置 + davRequest + discovery 探针

**Files:** Create `src/net/dav-request.ts`;Modify `src/settings/settings.ts`(加 iCloud 字段)、`src/settings/settings-tab.ts`(加输入)、`src/main.ts`(加 "CalDAV discovery probe" 命令)

- [ ] **Step 1: 写 `src/net/dav-request.ts`**
```ts
import { requestUrl } from "obsidian";

export interface DavResponse {
  status: number;
  text: string;
  etag?: string;
}

export async function davRequest(opts: {
  url: string;
  method: string;
  user: string;
  pass: string;
  body?: string;
  depth?: string;
  contentType?: string;
  ifMatch?: string;
}): Promise<DavResponse> {
  const headers: Record<string, string> = {
    Authorization: "Basic " + btoa(`${opts.user}:${opts.pass}`),
  };
  if (opts.depth) headers["Depth"] = opts.depth;
  if (opts.contentType) headers["Content-Type"] = opts.contentType;
  if (opts.ifMatch) headers["If-Match"] = opts.ifMatch;
  const res = await requestUrl({
    url: opts.url,
    method: opts.method,
    headers,
    body: opts.body,
    throw: false,
  });
  const h = res.headers || {};
  return { status: res.status, text: res.text, etag: h["etag"] ?? h["Etag"] ?? h["ETag"] };
}

/** Tolerant extraction: return the text of the first descendant whose localName matches. */
export function firstTag(xml: string, localName: string): string | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const els = doc.getElementsByTagName("*");
  for (let i = 0; i < els.length; i++) {
    if (els[i].localName === localName) return (els[i].textContent || "").trim();
  }
  return null;
}
```

- [ ] **Step 2: 加 iCloud 设置字段** —— `src/settings/settings.ts` 的 `OgendaSettings` + `DEFAULT_SETTINGS` + `sanitizeSettings` 各加:`icloudUser: string`、`icloudAppPassword: string`(默认 `""`);`src/settings/settings-tab.ts` 加两个 password 输入(`icloudUser` 明文邮箱,`icloudAppPassword` 自动去空格),持久化。

- [ ] **Step 3: 在 `src/main.ts` 加命令 "CalDAV discovery probe"**
```ts
this.addCommand({
  id: "ogenda-caldav-discovery",
  name: "CalDAV discovery probe",
  callback: () => void this.caldavDiscover(),
});
```
并加方法(用 `davRequest`/`firstTag`,import 之):
```ts
async caldavDiscover(): Promise<void> {
  const user = this.settings.icloudUser;
  const pass = this.settings.icloudAppPassword;
  if (!user || !pass) { new Notice("先在设置里填 iCloud 邮箱 + App 专用密码"); return; }
  try {
    // 1. current-user-principal
    const r1 = await davRequest({
      url: "https://caldav.icloud.com/", method: "PROPFIND", user, pass, depth: "0",
      contentType: "application/xml; charset=utf-8",
      body: `<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`,
    });
    console.log("[ogenda] principal status", r1.status, r1.text);
    const principalHref = firstTag(r1.text, "href");
    // 2. calendar-home-set (principal 可能是完整 URL 或路径,按需拼 host)
    const principalUrl = principalHref!.startsWith("http") ? principalHref! : "https://caldav.icloud.com" + principalHref;
    const r2 = await davRequest({
      url: principalUrl, method: "PROPFIND", user, pass, depth: "0",
      contentType: "application/xml; charset=utf-8",
      body: `<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`,
    });
    console.log("[ogenda] home status", r2.status, r2.text);
    const homeHref = firstTag(r2.text, "href");
    // 3. list calendars
    const r3 = await davRequest({
      url: homeHref!, method: "PROPFIND", user, pass, depth: "1",
      contentType: "application/xml; charset=utf-8",
      body: `<d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>`,
    });
    console.log("[ogenda] calendars status", r3.status, "\n" + r3.text);
    new Notice(`discovery: principal=${r1.status} home=${r2.status} calendars=${r3.status}(见控制台)`);
  } catch (e) {
    console.error("[ogenda] discovery failed", e);
    new Notice("discovery 出错: " + (e as Error).message);
  }
}
```

- [ ] **Step 4: 构建** —— `npm run build` exit 0。

- [ ] **Step 5: 手动验证(集成 · 关键第一关)** —— demo-vault reload 插件 → 设置填 iCloud 邮箱 + App 专用密码 → `Cmd+Opt+I` 控制台 → 运行 "CalDAV discovery probe"。
  Expected(GO 信号):`principal=207 home=207 calendars=207`;控制台第 3 段 XML 里能看到你的日历列表(displayname + resourcetype 含 `calendar`)。挑一个日历的 `href`(通常是 home 下的子路径)记下,D0.2 要用。
  若 `401` → 凭据/2FA 问题;若 PROPFIND 被 requestUrl 挡(方法不被发出/网络错)→ 记录,评估退回 Node https。

- [ ] **Step 6: Commit** —— `git add -A && git commit -m "spike(caldav): iCloud discovery via requestUrl PROPFIND"`

---

### Task D0.2: 读(calendar-query)+ 写(PUT)+ 删(DELETE)探针

**Files:** Modify `src/main.ts`(加 "CalDAV read/write/delete probe" 命令,针对一个选定日历 URL)

- [ ] **Step 1: 加命令 + 方法**(在 `main.ts`;`CAL_URL` 用 D0.1 记下的某个日历 href,先硬编码进设置或命令里)
```ts
async caldavRWProbe(): Promise<void> {
  const user = this.settings.icloudUser, pass = this.settings.icloudAppPassword;
  const calUrl = this.settings.icloudCalUrl; // 新增设置项:粘 D0.1 得到的日历 URL
  if (!user || !pass || !calUrl) { new Notice("先填 iCloud 凭据 + 日历 URL"); return; }
  try {
    // 读:calendar-query 最近的 VEVENT
    const q = await davRequest({
      url: calUrl, method: "REPORT", user, pass, depth: "1",
      contentType: "application/xml; charset=utf-8",
      body: `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
        <d:prop><d:getetag/><c:calendar-data/></d:prop>
        <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter>
      </c:calendar-query>`,
    });
    console.log("[ogenda] query status", q.status, "\n" + q.text.slice(0, 2000));

    // 写:PUT 一个测试事件
    const uid = "ogenda-d0-probe-1@ogenda";
    const putUrl = calUrl.replace(/\/?$/, "/") + uid + ".ics";
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ogenda//d0//EN",
      "BEGIN:VEVENT", `UID:${uid}`, "DTSTAMP:20260714T090000Z",
      "DTSTART:20260718T060000Z", "DTEND:20260718T070000Z",
      "SUMMARY:ogenda D0 测试事件", "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const put = await davRequest({
      url: putUrl, method: "PUT", user, pass,
      contentType: "text/calendar; charset=utf-8", body: ics,
    });
    console.log("[ogenda] PUT status", put.status, "etag", put.etag);

    // 删:DELETE(带 If-Match,如果 PUT 返回了 etag)
    const del = await davRequest({
      url: putUrl, method: "DELETE", user, pass, ifMatch: put.etag,
    });
    console.log("[ogenda] DELETE status", del.status);
    new Notice(`read=${q.status} put=${put.status} delete=${del.status}(见控制台)`);
  } catch (e) {
    console.error("[ogenda] RW probe failed", e);
    new Notice("RW probe 出错: " + (e as Error).message);
  }
}
```
(同时给 `OgendaSettings` 加 `icloudCalUrl: string` 字段 + 设置输入,粘 D0.1 得到的日历 URL。)

- [ ] **Step 2: 构建** —— `npm run build` exit 0。

- [ ] **Step 3: 手动验证(集成 · 通过标准)**
  1. 设置里粘一个日历 URL(D0.1 得到)。
  2. 运行命令。Expected:`read=207 put=201 delete=204`(或 200/204 系)。
  3. **在 PUT 之后、DELETE 之前**若想肉眼确认:临时把 DELETE 那步注释掉重跑,打开 **iPhone/Mac 日历**看有没有"ogenda D0 测试事件"(2026-07-18);确认后再跑 DELETE 版删掉。
  - GO 信号:PUT 得到 2xx **且** iPhone 日历真出现该事件;DELETE 2xx 且事件消失。→ **双向传输成立**。
  - 若 PUT 4xx/5xx:记录状态码 + 响应体(可能 URL 拼法/Content-Type/If-Match 需调),按现象修后重试。

- [ ] **Step 4: Commit** —— `git add -A && git commit -m "spike(caldav): iCloud read (calendar-query) + write (PUT) + DELETE via requestUrl"`

---

### Task D0.3: 探针报告 + GO/NO-GO + 清理

**Files:** Create `docs/superpowers/spikes/2026-07-14-icloud-caldav-spike.md`

- [ ] **Step 1: 按真实观测写报告**(模板)
```markdown
# iCloud CalDAV 传输探针 (2026-07-14)

## 结论:GO / NO-GO —— <填>

## 观测(requestUrl 对真实 iCloud)
- discovery: principal=<> home=<> calendars=<>;分区主机=<pNN-caldav...>;拿到日历=<列表>
- 读 calendar-query: status=<> 事件数≈<> 有 etag=<Y/N>
- 写 PUT: status=<> etag=<>;iPhone/Mac 日历肉眼可见=<Y/N>
- 删 DELETE: status=<> 事件消失=<Y/N>

## 为跑通做的调整
- requestUrl 是否真发出 PROPFIND/REPORT/PUT/DELETE:<是/否 + 现象>
- URL 拼接 / href 解析 / Content-Type / If-Match 的坑:<...>

## 决策
- GO → 据此建 D1(只读导入连接器:discover + calendar-query + icalToEvents + 存 href/etag)。
- NO-GO(requestUrl 挡了某方法)→ 退回桌面端 Node https,重评审传输层。

## 清理
- [ ] 删除 demo-vault `data.json` 里的 iCloud App 专用密码。
- [ ] 移除/隔离探针命令(discovery / RW probe)。
```

- [ ] **Step 2: 清理凭据** —— `rm -f "$VAULT_PATH/.obsidian/plugins/ogenda/data.json"`(VAULT_PATH=demo-vault),确认删除。

- [ ] **Step 3: Commit** —— `git add docs/... && git commit -m "docs(spike): iCloud CalDAV transport outcome + GO/NO-GO"`

---

## Self-Review

**Spec coverage:** 覆盖 bidirectional spec §9 探针的四步(discovery/read/PUT/DELETE);§4 iCloud 事实(端点/app密码/分区主机/无PATCH)体现在 Global Constraints + 命令;传输走 §5 的 requestUrl。D1+ 不在本计划。
**Placeholder scan:** 无占位;D0.3 报告是探针产物模板(填真实观测)。`CAL_URL`/日历 URL 是执行时从 D0.1 输出粘入的设置项,非占位。
**Type consistency:** `davRequest`/`firstTag`(D0.1)被 D0.2 复用;`DavResponse.etag` 用于 PUT→DELETE 的 If-Match;`OgendaSettings` 新增 `icloudUser/icloudAppPassword/icloudCalUrl` 贯穿设置/命令一致。

## 备注:后续
D0 GO 后写 D1(只读导入)计划:把探针的 discovery+query 演进成正式 `CalDavConnector`(实现现有 `Connector` 接口),`icalToEvents`(加 protocol 参数)归一化,月度文件多存 `href::/etag::/base_hash::`,接入 SyncService。
