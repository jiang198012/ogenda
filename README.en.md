<h1 align="center">Ogenda</h1>

<p align="center">
  <a href="https://github.com/jiang198012/ogenda/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/jiang198012/ogenda?sort=semver"></a>
  <a href="https://github.com/jiang198012/ogenda/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/jiang198012/ogenda/total"></a>
  <a href="https://obsidian.md/plugins?id=ogenda"><img alt="Obsidian plugin" src="https://img.shields.io/badge/Obsidian-market-yellow"></a>
  <a href="https://github.com/jiang198012/ogenda/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/jiang198012/ogenda?style=flat&logo=github"></a>
  <a href="https://opensource.org/licenses/MIT"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg"></a>
</p>

<p align="center">
  <a href="./README.md">简体中文</a> | <strong>English</strong>
</p>

**Ogenda** is an **Obsidian community plugin** that adds a dedicated calendar/agenda panel. Events live in **local Markdown monthly notes** inside your vault while syncing two-way with **CalDAV / iCloud**, so your calendar stays portable and your notes stay in the vault.

> ⚠️ **Desktop and mobile are supported.** Requires Obsidian **1.7.2+**. CalDAV sync needs a reachable server.

<p align="center">
  <img src="screenshots/ogenda-demo.gif" alt="Ogenda demo: create an event (24-hour time input) → day/week views → sync (10s loop)" width="90%"/>
</p>

<p align="center">
  <img src="screenshots/mobile-strip.png" alt="Mobile: day / week / month views" width="90%"/>
</p>

## Highlights

| Capability | What it gives you |
| --- | --- |
| **Two-way sync** | Pull events from CalDAV / iCloud, push local edits back; server changes merge with your manual notes, never overwriting them |
| **Local Markdown storage** | Events are stored in a monthly note per month; add your own prose under any event block |
| **Five views** | List / Day / Week / Month / Stats dashboards |
| **Event editor** | Category chips, status, location, organizer, attendees, recurrence, reminders |
| **Recurring events** | Presets for daily/weekly/monthly… plus custom RRULE; per-occurrence edit ("this / all / skip") |
| **Reminders** | Multiple lead times, synced as separate VALARM components, in-Obsidian notifications when enabled |
| **Day view time grid** | 00:00–24:00 grid: click to create, drag a range, drag cards to move, drag the bottom edge to resize |
| **Week view time grid** | 7 columns × 24 hours: events positioned by time, same drag & drop, cross-day drags |
| **Time-line segments** | Colored time ranges from settings painted as translucent bands on day/week grids |
| **24-hour time input** | No more `12:00 AM` ambiguity; `1423` / `900` format themselves as you type |
| **Quick add (natural language)** | "Quick add event" command: one sentence → date/time/duration/title, e.g. `tomorrow 3pm standup 30min` |
| **Mobile friendly** | Adapts to narrow panes and phones (below 480px) |
| **Bilingual UI** | English / 简体中文 follows the Obsidian locale or the plugin setting |

## Security & permissions

- **What it accesses**: the CalDAV / iCloud credentials you configure (stored locally in Obsidian settings), the monthly event notes you choose inside your vault, and direct connections to the CalDAV server you configure (iCloud, Nextcloud, Fastmail, …).
- **When it runs**: only when you press **Sync**, use the panel, or have enabled sync-on-startup. No background activity otherwise — except **reminders**: while "Enable event reminders" is on (off by default), Ogenda checks for due reminders every 30 seconds while Obsidian is open.
- **What you control**: credentials go **only** to the server you configure — no third party. Turn off sync-on-startup or event reminders anytime.

## Installation

### Requirements

- **Obsidian 1.7.2+** (desktop and mobile)
- For sync: a CalDAV server (iCloud, Nextcloud, Fastmail, …) or an iCloud account with an **app-specific password**

### Community plugins (once listed)

1. Open **Settings → Community plugins → Browse**.
2. Search **"Ogenda"** → **Install** → **Enable**.

### BRAT (beta)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin.
2. BRAT → *Add Beta Plugin* → `jiang198012/ogenda`.
3. Enable Ogenda in **Settings → Community plugins**.

### Manual

1. Download `main.js`, `manifest.json`, `styles.css` from the [latest release](https://github.com/jiang198012/ogenda/releases/latest).
2. Copy them into `.obsidian/plugins/ogenda/` inside your vault.
3. Restart Obsidian and enable Ogenda.

## Quick start

1. Install and enable the plugin.
2. Open **Settings → Ogenda** and pick your **sync provider**: `CalDAV` / `iCloud` / `ICS`.
3. Fill in the provider details (URL, user, password / app-specific password).
4. Pick a **storage folder** (default `Agenda`).
5. Click **Sync** in the panel toolbar.

The first sync creates one Markdown file per month, e.g. `Agenda/2026-07.md`. You can add your own notes under any event block; Ogenda preserves them on later syncs.

## Usage

- **Open the panel**: run the command **"Ogenda: Open agenda panel"** or click the calendar ribbon icon.
- **Quick add**: run **"Ogenda: Quick add event"** and type one line, e.g. `tomorrow 3pm standup 30min`, `周五 10:00 周会 1小时`, `明天下午3点 和经理开会`. Date (今天/明天/周五/下周一/7-25/today/next monday…), time (15:00 / 下午3点 / 3pm / 晚上8点半), duration and title are parsed and the form is prefilled (defaults: today, 09:00, 1 hour).
- **Views**: switch between List / Day / Week / Month / Stats tabs.
- **Day view drag & drop**: click an empty slot to create at that hour; drag an empty area to create a time range; drag an event card to move it; drag the card's **bottom edge** to change the end time. All-day events sit in a strip above the grid with a red "now" line. In Week/Month views you can drag a card onto another day.
- **Recurring events**: pick a repeat in the form (daily / weekdays / weekly / monthly / yearly / custom RRULE). Clicking an occurrence of a recurring event asks: **this occurrence only** (becomes a separate event, and the original time is excluded from the series via EXDATE), **all occurrences**, or **skip this occurrence** (EXDATE only).
- **Reminders**: the form's "Reminder" field has one unit-bearing lead time per row; click **Add reminder** to add more (for example, `1 day`, `1 hour`, `30 minutes`). Comma-separated values are also accepted for compatibility. They are written to the calendar as separate VALARM components so phone calendars see them too. Legacy bare minute values are still accepted. Turn on **Settings → Ogenda → Reminders → Enable event reminders** to get in-Obsidian notifications (checked every 30 s); a default lead time for new events is configurable.
- **Events**: click **New event** or an existing card to edit — categories, status, location, organizer, attendees, recurrence, reminders.
- **24-hour time input**: type `1423` → formats to `14:23` as you type; `900` → `09:00`; blur pads `9` → `09:00`. Midnight is `00:00`, noon is `12:00` — a morning meeting ending at noon is clearly `09:00 → 12:00`.
- **Navigation**: use the **Today** button or the arrow buttons.
- **Sync**: press **Sync** in the toolbar, or run **"Ogenda: Sync now"**.

## Settings

| Group | Setting | Description | Default |
| --- | --- | --- | --- |
| Sync | Provider | `CalDAV` / `iCloud` / `ICS` / off | Off |
| | iCloud account | Apple ID email | — |
| | iCloud app password | Show/hide toggle with guidance | — |
| | iCloud calendar | One-click discovery; pick from a dropdown | — |
| | CalDAV details | URL / user / password | — |
| | ICS file | Read-only `.ics` file URL | — |
| | Sync on startup | Sync once after Obsidian launches | Off |
| Storage | Storage folder | Folder for the monthly event notes | `Agenda` |
| | Timezone | Display timezone, defaults to system | System |
| Reminders | Enable event reminders | Show a notification when a reminder is due (checked every 30 s) | Off |
| | Default reminder | Lead time applied to new events (per-event override in the form) | No reminder |
| Appearance | Language | Auto (Obsidian) / 简体中文 / English | Auto |
| Category | Default category | Default category for new events | Work |

## iCloud calendar discovery

After entering your Apple ID and app-specific password in settings, click the **search button** next to the calendar field to list your writable calendars and pick one from a dropdown — no need to copy the private calendar URL.

## What's New

**Latest: v1.3.0**

- **v1.3.0** — **Views follow the segment window, adapting to content**: day/week grids show only the configured time ranges (default 06:00–23:00), but the timeline auto-extends whenever a night event exists. **Week-view time rulers**: through-running 06:00/12:00/18:00 lines plus per-column hourly lines. Event labels are compact title-only everywhere. New default palette (adjacent hues ≥44° apart). Fixes: event blocks no longer misalign with segment bands; through-lines align exactly with bands/blocks.
- **v1.2.0** — **Time-line segments**: define colored time ranges in settings (name, 24h start/end — midnight-crossing allowed — and fill color); day/week grids paint them as translucent bands so you can see time ranges at a glance. Both views show **only the configured segment window** (default 06:00–23:00; unconfigured hours like before dawn don't take up space, events outside the window are hidden, crossing events are clipped; no segments → full 24h). The **week view is now a 7-column × 24h time grid** (events positioned by real time, overlap columns, all-day strip, same drag & drop as the day view). Defaults: 清晨 06:00–08:30 / 上午 08:30–12:00 / 中午 12:00–14:00 / 下午 14:00–17:00 / 傍晚 17:00–20:00 / 晚上 20:00–23:00 six segments, off when cleared.
- **v1.1.0** — **Reminders**: per-event lead times (VALARM, CalDAV-synced) with optional in-Obsidian notifications; **recurrence editing**: form presets + custom RRULE, per-occurrence "this / all / skip" with EXDATE sync; **day-view time grid with drag & drop** (create by clicking/dragging, move cards, resize from the bottom edge; week/month views accept cross-day drags); **natural-language quick add**: `明天下午3点 和经理开会` or `tomorrow 3pm standup 30min` becomes an event in one command.
- **v1.0.3** — **Dense month views stay usable**: days with more than 6 events fold into a "+N more" expander, and the month's last week always scrolls into view. The week view shows all 7 columns in a narrow side pane (weekend columns are no longer cut off). RSVP shows localized labels ("Accepted") instead of the raw enum.
- **v1.0.2** — **Narrow side panes no longer overflow**: day/month views now use container queries and respond to the panel's own width. Drag an Obsidian side pane narrow and the day view stacks vertically, the month grid shows all 7 columns, and the tab bar wraps — no more clipped text.
- **v1.0.1** — **24-hour time input**: the event form no longer follows the OS locale's 12-hour clock. Times are entered and shown as `09:00`–`23:59`; noon is clearly `12:00` (never `12:00 AM`). Shorthand like `1423` / `900` formats itself as you type.
- **v1.0.0** — First stable release. **Sync hardening**: adopt server-known UIDs, incremental flushing, paced writes with 503 backoff, one bad event no longer aborts a round. **iCloud compatibility**: DTEND always emitted, all-day DTEND defaults to the next day. **Mobile usability** improvements.
- **v0.0.9** — Sync fixes: auto-refresh after sync, 30s CalDAV timeout, writable event calendars only, keep the clock time when leaving all-day mode.
- Earlier versions — see [CHANGELOG](CHANGELOG.md).

## Troubleshooting (FAQ)

**Sync fails with 401 / 403?** Bad credentials or app-specific password. Re-enter your user/password; iCloud needs an app-specific password (not your login password).

**Events not appearing after sync?** Wrong CalDAV URL or no writable calendars. Check the URL and confirm the account has at least one writable event calendar.

**Duplicate events appear?** UID collision after import/export. Delete the duplicate blocks manually and re-sync.

**Mobile layout looks cramped?** The Obsidian pane is too narrow. Drag it wider or rotate the device; Ogenda adapts below 480px.

**Times show as AM/PM?** Since v1.0.1 time input is fixed to 24-hour. Upgrade and restart Obsidian if you still see AM/PM.

## Development

```bash
npm install    # install dependencies
npm run dev    # development build (esbuild watch)
npm run build  # production build (tsc type-check + esbuild bundle)
npm test       # run tests (vitest, 438 tests)
```

## Related projects

- **Workbuddian** — another plugin by the same author: an AI chat assistant powered by the local CodeBuddy CLI right inside your vault (streaming replies, `@` mentions, MCP, one-click undo).

## Support

- Report bugs or request features: [GitHub Issues](https://github.com/jiang198012/ogenda/issues) (check the FAQ first).

## License

MIT. See [LICENSE](LICENSE).
