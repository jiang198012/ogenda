# Ogenda SEO / 仓库元数据

GitHub 仓库的 SEO 由三块组成:**description**、**topics**、**homepage**。它们决定仓库在 GitHub 搜索、Obsidian 市场、搜索引擎里的可发现性。配置用 `gh` CLI 维护,配置本身不入库(git 无法追踪 GitHub 侧的元数据),**本文档是唯一的事实来源(single source of truth)**。

> 最近更新:2026-08-09。更新元数据后请同步刷新本文档。

## 当前配置

| 项 | 值 |
| --- | --- |
| **description** | `Obsidian 日历议程面板:CalDAV / iCloud 双向同步,本地 Markdown 存储 — Two-way calendar sync (CalDAV/iCloud) with an agenda panel in Obsidian. 五种视图 / 24 小时制时间输入 / 双语界面` |
| **homepage** | `https://obsidian.md/plugins?id=ogenda` |
| **topics** | `obsidian`, `obsidian-plugin`, `calendar`, `caldav`, `icloud`, `agenda`, `sync`, `calendar-sync`, `ical`, `markdown`, `obsidian-md`, `notes`, `vault`, `typescript`, `productivity` |

## 检查当前值

```bash
# description + homepage
gh api repos/jiang198012/ogenda --jq '{description, homepage}'
# topics
gh api repos/jiang198012/ogenda/topics --jq '.names'
```

## 更新

### description / homepage

```bash
gh api -X PATCH repos/jiang198012/ogenda \
  -f description="<新描述>" \
  -f homepage="<新主页>" \
  --jq '{description, homepage}'
```

### topics

topics 用 **JSON 数组**传,不能用 `-f`:

```bash
echo '{"names":["obsidian","obsidian-plugin","calendar","caldav","icloud","agenda","sync","markdown","obsidian-md","typescript","calendar-sync","ical","notes","vault","productivity"]}' \
  | gh api -X PUT repos/jiang198012/ogenda/topics \
      -H "Accept: application/vnd.github+json" --input - --jq '.names'
```

## 命名规范

- **description**:中英双语,埋核心关键词(Obsidian、CalDAV/iCloud 双向同步、Markdown、视图等),但保持自然可读,不堆砌。
- **topics**:小写、连字符分隔;优先覆盖 `obsidian`、`obsidian-plugin`、核心功能词(calendar/sync/caldav/icloud)、语言(typescript)、生态词(markdown/notes/vault)。
- **homepage**:指向 Obsidian 市场页 `https://obsidian.md/plugins?id=ogenda`,让市场页能反链到仓库。

## 其它 SEO 载体

- **README 头部 meta 注释**(`README.md` 顶部 `<!-- project: ... -->` 块):供 AI 搜索引擎(structured 数据)读取,含 project / domain / audience / runtime / status / license。
- **README 内容**:中英双语、功能亮点表、动图、截图、FAQ——这些都参与 GitHub 与搜索引擎的索引。
- **Release notes**:每个版本在 GitHub Release 的描述也参与搜索,写版本时顺带带上关键词。
