# ogenda D3 — 删除传播 Implementation Plan

> 分小步 TDD。冲突体验打磨(弹窗选/持久化冲突记录)不在 D3,留到下一轮。

**Goal:** 本地删事件块 → 服务器 DELETE(If-Match);服务器删事件 → 本地**标记**(不自动删块,保护散文)。

**核心机制:** 新增同步状态清单 `<storageFolder>/.ogenda-sync-state.json`,记录"上次同步后已知被追踪的 `{uid: {href, etag}}`"。单靠"这一轮本地快照 vs 这一轮服务器快照"分不清"服务器全新事件"和"以前同步过、本地已删的事件"——必须多存一份历史记录做三方差异。

## 拍板记录(本轮讨论定的,别再问)
1. **本地删除检测** = 用户方案 A:独立的 vault 内 JSON 清单文件,不塞进插件 `data.json`。
2. **服务器删除** = 不自动删本地块(怕连带丢散文笔记),改为在块里标记 `server_deleted:: true`,让用户自己决定留还是删。
3. **冲突体验打磨**(弹窗选/持久化日志)本轮不做,D3 只做删除传播。

## Global Constraints
- 复用 D2:`davRequest`、`planSync` 现有四分支(pushUpdate/pushCreate/applyServer/conflicts)不动,只**新增**两个分支。
- DELETE 和 D0 探针验证过的一样带 `If-Match: etag`;返回 404(资源已不存在)按成功处理(幂等,不算错误)。
- `server_deleted:: true` 只是标记字段,不影响 `hashEvent`(不属于日历字段)。

---

### D3.1 SyncState 读写(纯,TDD)
- `src/store/sync-state.ts`:
  - `export interface SyncState { tracked: Record<string, { href: string; etag: string }> }`
  - `readSyncState(store: FileStore, folder: string): Promise<SyncState>` — 读 `${folder}/.ogenda-sync-state.json`;不存在或解析失败 → 返回 `{ tracked: {} }`(不抛错,当空清单处理)。
  - `writeSyncState(store: FileStore, folder: string, state: SyncState): Promise<void>` — `JSON.stringify(state, null, 2)`。
- 测试用 `InMemoryFileStore`:写了读一致;文件不存在返回空清单;写入内容格式不对(比如手滑改坏了 JSON)时 `readSyncState` 也不抛错、返回空清单。

### D3.2 AgendaEvent 加 serverDeleted 标记(纯,TDD)
- `src/core/event.ts`:`AgendaEvent` 加 `serverDeleted?: boolean`;`eventToFields` 加 `set("server_deleted", ev.serverDeleted ? "true" : undefined)`。
- `hashEvent` **不要**把这个字段算进去(和 etag/href/base_hash 一样,是同步元数据,不是日历字段)。
- 测试:`eventToFields({..., serverDeleted: true})` 输出含 `server_deleted: "true"`;`hashEvent` 前后不变(比照现有"metadata 变、hash 不变"那组测试写法)。

### D3.3 planSync 扩展:deleteRemote + markServerDeleted(纯,TDD——核心)
- `src/sync/plan.ts`:`planSync` 签名加第三个参数 `tracked: Record<string, { href: string; etag: string }>`(默认值 `{}`,保持向后兼容——D2.6 目前调用处暂不传,行为不变)。
- `SyncPlan` 新增两个字段:
  ```typescript
  deleteRemote: { uid: string; href: string; etag: string }[];
  markServerDeleted: AgendaEvent[];
  ```
- 新增逻辑(遍历 `Object.keys(tracked)`,对每个 `trackedUid` 判断 `localUids.has(trackedUid)` 与 `serverByUid.has(trackedUid)`):
  | tracked 里有 | 本地还有 | 服务器还有 | 动作 |
  |---|---|---|---|
  | 是 | 否 | 是 | **本地删了** → `deleteRemote.push({uid, href: server 当前 href, etag: server 当前 etag})`(用服务器**当前**的 etag,不用 tracked 里存的旧 etag——更不容易误 412) |
  | 是 | 是 | 否 | **服务器删了** → `markServerDeleted.push({...重建的本地 AgendaEvent, serverDeleted: true})`(复用 D2.4 已有的内部 `fieldsToEvent` 逻辑重建,别再另写一个) |
  | 是 | 否 | 否 | 两边都没了,忽略(下次落 SyncState 时自然从 tracked 里消失) |
  | 是 | 是 | 是 | 已经被现有四分支处理过,这里不重复处理 |
- 测试覆盖上表前三行 + 一个"tracked 为空(向后兼容,D2 行为不变)"的回归测试。

### D3.4 CalDavWriter.deleteEvent(集成,无单测)
- `src/connectors/caldav/caldav-writer.ts` 加:
  ```typescript
  async deleteEvent(url: string, ifMatch: string): Promise<{ status: number }> {
    const res = await davRequest({ url, method: "DELETE", user: this.cfg.user, pass: this.cfg.pass, ifMatch });
    return { status: res.status };
  }
  ```
- 和 `putEvent` 同一惯例:纯 `davRequest` 包装,不写单测(I/O 边界,靠 D3.6 真机 e2e)。

### D3.5 bidirectional.ts 编排扩展(集成)
- `CalDavSource` 接口加 `deleteEvent(url: string, ifMatch: string): Promise<{ status: number }>`。
- `syncBidirectional` 签名**不加** `folder` 参数——`MonthlyStore` 已经持有 `folder`,新增的 `readSyncState()`/`writeSyncState()` 转发方法内部自己用 `this.folder`,调用方不需要重复传。
- 流程:
  1. 同步开始时 `store.readSyncState()`(**新增 `MonthlyStore.readSyncState()`/`writeSyncState()` 两个薄转发方法**,内部转调 `readSyncState(this.store, this.folder)`/`writeSyncState(this.store, this.folder, state)`,而不是给 `store` 加公开 getter 破坏封装)。
  2. `plan = planSync(server, local, syncState.tracked)`。
  3. 对 `plan.deleteRemote` 逐条 `source.deleteEvent(href, etag)`:状态码 2xx **或 404** 都算成功(资源已不存在,目标达成)→ 记入本轮"确认已删除"的 uid 集合,不再写入 `toApply`(即从月度文件里也拿掉这个块——**这里要给 `MonthlyStore` 加一个 `removeByUid(uids: string[]): Promise<void>` 方法**,遍历月度文件删掉对应 block,复用 `parseMonthlyDoc`/`serializeMonthlyDoc`);412(服务器又变了)→ 跳过、notify"跳过,保留本地供下轮重试"(不计入"确认已删除")。
  4. 对 `plan.markServerDeleted` 直接推进 `toApply`(照常走 `store.sync`,`server_deleted:: true` 字段会被写进块里,散文原样保留)。
  5. 同步结束后重新计算新 `tracked`:从旧 `tracked` 里**去掉**两类 uid——本轮"确认已删除"的、以及本轮判定为"两边都没了"的(即 `!localUids.has(uid) && !serverByUid.has(uid)` 那一行,§D3.3 第三行)——再用 `toApply` 里每个带 `href` 的事件 `{ [uid]: { href, etag } }` 覆盖/追加,得到最终 `tracked`,写 `writeSyncState`。这样"两边都没了"的条目才会真正从状态文件里清掉,不会无限累积。
- 新增 `BidirectionalSummary` 字段:`deleted: number`、`markedServerDeleted: number`。

### D3.6 真机 e2e 验证
- 用 demo-vault:
  1. 挑一个之前同步过的测试事件,把 Obsidian 里的整个块删掉,存盘,跑 "Sync iCloud (two-way)"→ 确认 iPhone/Mac 日历上这条真的消失了。
  2. 反过来:在 iPhone 上删一个 ogenda 追踪过的测试事件,回 Obsidian 跑同步 → 确认对应块**还在**,但多了 `- server_deleted:: true`,且散文(如果写了纪要)完好无损。
