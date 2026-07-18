# iCloud CalDAV 传输探针报告 (2026-07-14)

## 结论:**GO** ✅

Obsidian `requestUrl` 能对真实 iCloud CalDAV 完成整套双向传输:discovery(PROPFIND)、读(REPORT calendar-query)、写(PUT)、删(DELETE)。双向 CalDAV 引擎的传输地基成立。

## 观测(真实中国区 iCloud 账户)

| 步骤 | 状态码 | 证据 |
|---|---|---|
| PROPFIND current-user-principal | 207 | `<current-user-principal><href>/……/principal/` |
| PROPFIND calendar-home-set | 207 | 落到分区主机 `https://p205-caldav.icloud.com.cn:443/……/calendars/`(**中国区 .com.cn**) |
| PROPFIND 列日历 Depth:1 | 207 | 家庭/个人(`/home/`)/工作/提醒 等;resourcetype 含 `<calendar>` |
| REPORT calendar-query | 207 | 读到真实事件(如「出差北京」),带 `<getetag>` + `<calendar-data>`(CDATA 包完整 VCALENDAR) |
| PUT 测试事件 | **201** | 返回 etag `"mrpmvv5x"`;iCloud 接受并存储 |
| DELETE 测试事件 | **204** | 删除成功 |

## 关键事实(D1 要用)

- **认证**:Apple ID email + App 专用密码(**必须带横杠** `abcd-efgh-ijkl-mnop`,去横杠会 401)。凭据现按"照抄原样、只 trim"处理(见 [[credentials-verbatim]])。
- **中国区**:home-set 落 `pNN-caldav.icloud.com.cn`;discovery 入口 `caldav.icloud.com` 仍可用。
- **href 是路径**:calendar-home-set 给完整 URL(带主机),但列出的各日历 href 是**路径**(如 `/……/calendars/home/`),要拼上分区主机才是完整 URL。
- **calendar-data 形状**:`<calendar-data>` 用 `<![CDATA[ BEGIN:VCALENDAR … ]]>` 包一个完整 VCALENDAR(含 VTIMEZONE + VEVENT)→ 直接喂 `icalToEvents`。
- **要跳过的 response**:日历集合自身那条 `<response>` 的 calendar-data 返回 404;`inbox`/`outbox`/`notification` 是调度/通知集合,非用户日历。D1 只处理有 calendar-data(200)的成员资源。
- **传输**:`requestUrl` 发 PROPFIND/REPORT/PUT/DELETE 全部成功;PUT 用 `Content-Type: text/calendar`,资源名不必等于 UID(用 URL-safe 文件名)。

## 决策 → D1

GO → 写 D1(只读导入连接器):把探针的 discovery + calendar-query 演进成正式 `CalDavConnector`(实现现有 `Connector` 接口),解析 `<calendar-data>` CDATA → `icalToEvents`(加 protocol=caldav 参数)→ 月度文件(多存 `href::`/`etag::`)。之后 D2 写回。

## 清理

- iCloud 凭据**暂不删除**(D1 开发/端到端要继续用;明文存 vault 是已接受的取舍)。探针命令(discovery/write/delete)保留为 D1 脚手架,D1 完成时移除。
