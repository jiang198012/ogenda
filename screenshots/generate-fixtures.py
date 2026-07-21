#!/usr/bin/env python3
"""Generate screenshot fixtures for ogenda README."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "screenshots" / "fixtures"
FIXTURES.mkdir(parents=True, exist_ok=True)

CSS_VARS = """
:root {
  --background-primary: #ffffff;
  --background-secondary: #f5f5f5;
  --background-modifier-hover: #e8e8e8;
  --background-modifier-active-hover: #dcdcdc;
  --background-modifier-border: #d4d4d4;
  --interactive-accent: #7c3aed;
  --interactive-accent-hover: #6d28d9;
  --text-normal: #1f2937;
  --text-muted: #6b7280;
  --text-faint: #9ca3af;
  --text-on-accent: #ffffff;
  --text-error: #dc2626;
  --font-text-size: 16px;
}
"""

BASE_HTML = """<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
{css_vars}
body {{
  margin: 0;
  padding: 0;
  background: var(--background-primary);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: var(--text-normal);
}}
.viewport {{
  width: {width}px;
  min-height: 800px;
  border: 1px solid var(--background-modifier-border);
  overflow: hidden;
}}
</style>
<link rel="stylesheet" href="../../styles.css">
</head>
<body>
<div class="viewport">
{content}
</div>
</body>
</html>
"""

def panel_shell(body_content: str, width: int = 900) -> str:
    header = """
  <div class="ogenda-panel-head">
    <div class="ogenda-panel-tabs">
      <div class="ogenda-panel-tab active">List</div>
      <div class="ogenda-panel-tab">Day</div>
      <div class="ogenda-panel-tab">Week</div>
      <div class="ogenda-panel-tab">Month</div>
      <div class="ogenda-panel-tab">Stats</div>
    </div>
    <div class="ogenda-panel-nav">
      <span class="ogenda-navbtn">‹</span>
      <span class="ogenda-navtoday">Today · Jul 21</span>
      <span class="ogenda-navbtn">›</span>
      <span class="ogenda-navtoday-btn">Today</span>
    </div>
    <div class="ogenda-panel-newbtn">New event</div>
    <div class="ogenda-panel-syncbtn"><span>Sync</span></div>
  </div>
  <div class="ogenda-panel-body">
"""
    return BASE_HTML.format(title="ogenda", css_vars=CSS_VARS, width=width, content=f"<div class=\"ogenda-panel\">{header}{body_content}\n  </div>\n</div>")


def list_fixture():
    rows = [
        ("Jul 21", "09:00–10:00", "Team weekly standup", "Room A", "confirmed", "Work"),
        ("Jul 21", "14:00–15:00", "Client review", "Zoom", "confirmed", "Work"),
        ("Jul 22", "All day", "Quarterly planning", "", "tentative", "Meeting"),
        ("Jul 23", "10:00–11:00", "Gym session", "Fitness center", "", "Health"),
    ]
    body = '<div class="ogenda-list-statusgroup">\n'
    body += '  <div class="ogenda-list-statusheader">Confirmed · 3</div>\n'
    body += '  <div class="ogenda-list-statusitems">\n'
    for date, time, title, loc, status, cat in rows:
        if status != "confirmed":
            continue
        body += '    <div class="ogenda-event-row" style="border-left-color: #7c3aed;">\n'
        body += f'      <div class="ogenda-event-when"><span class="ogenda-event-date">{date}</span><span class="ogenda-event-time">{time}</span></div>\n'
        body += f'      <div class="ogenda-event-main"><div class="ogenda-event-title">{title}</div>'
        if loc:
            body += f'<div class="ogenda-event-loc">{loc}</div>'
        body += '</div>\n'
        if status:
            body += f'      <span class="ogenda-status-pill" style="color:#fff;background:#22c55e;">Confirmed</span>\n'
        body += f'      <span class="ogenda-cat-pill" style="color:#7c3aed;background:rgba(124,58,237,0.12);">{cat}</span>\n'
        body += '    </div>\n'
    body += '  </div>\n</div>\n'

    body += '<div class="ogenda-list-statusgroup">\n'
    body += '  <div class="ogenda-list-statusheader">Tentative · 1</div>\n'
    body += '  <div class="ogenda-list-statusitems">\n'
    body += '    <div class="ogenda-event-row" style="border-left-color: #f59e0b;">\n'
    body += '      <div class="ogenda-event-when"><span class="ogenda-event-date">Jul 22</span><span class="ogenda-event-time">All day</span></div>\n'
    body += '      <div class="ogenda-event-main"><div class="ogenda-event-title">Quarterly planning</div></div>\n'
    body += '      <span class="ogenda-status-pill" style="color:#fff;background:#f59e0b;">Tentative</span>\n'
    body += '      <span class="ogenda-cat-pill" style="color:#f59e0b;background:rgba(245,158,11,0.12);">Meeting</span>\n'
    body += '    </div>\n'
    body += '  </div>\n</div>\n'
    return panel_shell(body)


def day_fixture():
    card = """
  <div class="ogenda-day-card" style="border-left-color: #7c3aed;">
    <div class="ogenda-day-time">09:00–10:00</div>
    <div class="ogenda-day-titlerow">
      <div class="ogenda-day-title">Team weekly standup</div>
      <span class="ogenda-status-pill" style="color:#fff;background:#22c55e;">Confirmed</span>
    </div>
    <div class="ogenda-field-grid">
      <span class="ogenda-field-key">Location</span><span class="ogenda-field-value">Room A</span>
      <span class="ogenda-field-key">Organizer</span><span class="ogenda-field-value">alice@example.com</span>
      <span class="ogenda-field-key">Attendees</span><span class="ogenda-field-value">bob@example.com, carol@example.com</span>
      <span class="ogenda-field-key">Category</span><span class="ogenda-field-value">Work</span>
    </div>
  </div>
  <div class="ogenda-day-card" style="border-left-color: #06b6d4;">
    <div class="ogenda-day-time">14:00–15:00</div>
    <div class="ogenda-day-titlerow">
      <div class="ogenda-day-title">Client review</div>
      <span class="ogenda-status-pill" style="color:#fff;background:#22c55e;">Confirmed</span>
    </div>
    <div class="ogenda-field-grid">
      <span class="ogenda-field-key">Location</span><span class="ogenda-field-value">Zoom</span>
      <span class="ogenda-field-key">Category</span><span class="ogenda-field-value">Meeting</span>
    </div>
  </div>
"""
    side = """
  <div class="ogenda-day-side">
    <div class="ogenda-mini-cal-month">
      <div class="ogenda-mini-cal-header">July 2026</div>
      <div class="ogenda-mini-cal-grid">
        <div class="ogenda-mini-cal-dow">M</div><div class="ogenda-mini-cal-dow">T</div><div class="ogenda-mini-cal-dow">W</div>
        <div class="ogenda-mini-cal-dow">T</div><div class="ogenda-mini-cal-dow">F</div><div class="ogenda-mini-cal-dow">S</div>
        <div class="ogenda-mini-cal-dow">S</div>
        <div class="ogenda-mini-cal-cell ogenda-mini-cal-othermonth">29</div>
        <div class="ogenda-mini-cal-cell ogenda-mini-cal-othermonth">30</div>
        <div class="ogenda-mini-cal-cell">1</div><div class="ogenda-mini-cal-cell">2</div><div class="ogenda-mini-cal-cell">3</div>
        <div class="ogenda-mini-cal-cell">4</div><div class="ogenda-mini-cal-cell">5</div>
        <div class="ogenda-mini-cal-cell">6</div><div class="ogenda-mini-cal-cell">7</div><div class="ogenda-mini-cal-cell">8</div>
        <div class="ogenda-mini-cal-cell">9</div><div class="ogenda-mini-cal-cell">10</div><div class="ogenda-mini-cal-cell">11</div>
        <div class="ogenda-mini-cal-cell">12</div><div class="ogenda-mini-cal-cell">13</div><div class="ogenda-mini-cal-cell">14</div>
        <div class="ogenda-mini-cal-cell">15</div><div class="ogenda-mini-cal-cell">16</div><div class="ogenda-mini-cal-cell">17</div>
        <div class="ogenda-mini-cal-cell">18</div><div class="ogenda-mini-cal-cell">19</div><div class="ogenda-mini-cal-cell">20</div>
        <div class="ogenda-mini-cal-cell ogenda-mini-cal-selected">21</div><div class="ogenda-mini-cal-cell">22</div>
        <div class="ogenda-mini-cal-cell">23</div><div class="ogenda-mini-cal-cell">24</div><div class="ogenda-mini-cal-cell">25</div>
        <div class="ogenda-mini-cal-cell">26</div>
      </div>
    </div>
  </div>
"""
    content = f'<div class="ogenda-day-layout"><div class="ogenda-day-main">{card}</div>{side}</div>'
    return panel_shell(content)


def week_fixture():
    heads = ["Mon 20", "Tue 21", "Wed 22", "Thu 23", "Fri 24", "Sat 25", "Sun 26"]
    colors = ["#3B82F6", "#22C55E", "#06B6D4", "#A855F7", "#64748B", "#F59E0B", "#EF4444"]
    events = [
        [("09:00", "Standup", "Room A", "#7c3aed")],
        [("14:00", "Client review", "Zoom", "#06b6d4"), ("16:00", "Design sync", "", "#7c3aed")],
        [("All day", "Planning", "", "#f59e0b")],
        [("10:00", "Gym", "Fitness", "#22c55e")],
        [],
        [("11:00", "Brunch", "", "#ef4444")],
        [],
    ]
    html = '<div class="ogenda-week-grid">\n'
    for h, c in zip(heads, colors):
        html += f'  <div class="ogenda-week-col-head" style="color:{c}">{h}</div>\n'
    for day_events in events:
        html += '  <div class="ogenda-week-col">\n'
        for time, title, loc, color in day_events:
            html += f'    <div class="ogenda-week-card" style="border-left-color:{color}">\n'
            html += f'      <div class="ogenda-week-card-time">{time}</div>\n'
            html += f'      <div class="ogenda-week-card-title">{title}</div>\n'
            if loc:
                html += f'      <div class="ogenda-week-card-loc">{loc}</div>\n'
            html += '    </div>\n'
        html += '  </div>\n'
    html += '</div>'
    return panel_shell(html)


def month_fixture():
    days = list(range(29, 32)) + list(range(1, 32))  # Jul 2026 starts Wed
    events = {
        21: [("Standup", "#7c3aed"), ("Review", "#06b6d4")],
        22: [("Planning", "#f59e0b")],
        23: [("Gym", "#22c55e")],
        26: [("Brunch", "#ef4444")],
    }
    html = '<div class="ogenda-month-grid">\n'
    for dow in ["M", "T", "W", "T", "F", "S", "S"]:
        html += f'  <div class="ogenda-month-dow">{dow}</div>\n'
    for d in days:
        other = " ogenda-month-othermonth" if d > 28 else ""
        html += f'  <div class="ogenda-month-cell{other}">\n'
        html += f'    <div class="ogenda-month-daynum">{d}</div>\n'
        for title, color in events.get(d, []):
            html += f'    <div class="ogenda-month-mini" style="border-left-color:{color}">{title}</div>\n'
        html += '  </div>\n'
    html += '</div>'
    return panel_shell(html)


def stats_fixture():
    html = """
  <div class="ogenda-stat-kpis">
    <div class="ogenda-kpi"><div class="ogenda-kpi-num">12</div><div class="ogenda-kpi-label">Total events</div></div>
    <div class="ogenda-kpi"><div class="ogenda-kpi-num" style="color:#22c55e">8</div><div class="ogenda-kpi-label">Confirmed</div></div>
    <div class="ogenda-kpi"><div class="ogenda-kpi-num" style="color:#f59e0b">3</div><div class="ogenda-kpi-label">Tentative</div></div>
    <div class="ogenda-kpi ogenda-kpi-warn"><div class="ogenda-kpi-num" style="color:var(--text-error)">2</div><div class="ogenda-kpi-label">Unsynced</div></div>
  </div>

  <div class="ogenda-stat-card">
    <div class="ogenda-stat-card-title">Status distribution</div>
    <div class="ogenda-stat-bar-row">
      <span class="ogenda-stat-bar-label" style="color:#22c55e">Confirmed</span>
      <div class="ogenda-stat-bar-track"><div class="ogenda-stat-bar-fill" style="width:100%;background:#22c55e"></div></div>
      <span class="ogenda-stat-bar-count">8</span>
    </div>
    <div class="ogenda-stat-bar-row">
      <span class="ogenda-stat-bar-label" style="color:#f59e0b">Tentative</span>
      <div class="ogenda-stat-bar-track"><div class="ogenda-stat-bar-fill" style="width:38%;background:#f59e0b"></div></div>
      <span class="ogenda-stat-bar-count">3</span>
    </div>
    <div class="ogenda-stat-bar-row">
      <span class="ogenda-stat-bar-label" style="color:#6b7280">No status</span>
      <div class="ogenda-stat-bar-track"><div class="ogenda-stat-bar-fill" style="width:13%;background:#6b7280"></div></div>
      <span class="ogenda-stat-bar-count">1</span>
    </div>
  </div>

  <div class="ogenda-stat-card">
    <div class="ogenda-stat-card-title">Category distribution</div>
    <div class="ogenda-cat-chips">
      <span class="ogenda-cat-chip"><span class="ogenda-cat-chip-bar" style="background:#7c3aed"></span><span>Work</span><span class="ogenda-cat-chip-count">5</span></span>
      <span class="ogenda-cat-chip"><span class="ogenda-cat-chip-bar" style="background:#06b6d4"></span><span>Meeting</span><span class="ogenda-cat-chip-count">3</span></span>
      <span class="ogenda-cat-chip"><span class="ogenda-cat-chip-bar" style="background:#22c55e"></span><span>Health</span><span class="ogenda-cat-chip-count">2</span></span>
      <span class="ogenda-cat-chip"><span class="ogenda-cat-chip-bar" style="background:#f59e0b"></span><span>Personal</span><span class="ogenda-cat-chip-count">2</span></span>
    </div>
  </div>

  <div class="ogenda-stat-minis">
    <div class="ogenda-stat-mini"><div class="ogenda-stat-mini-label">All-day / Timed</div><div class="ogenda-stat-mini-val">2 / 10</div></div>
    <div class="ogenda-stat-mini"><div class="ogenda-stat-mini-label">Recurring</div><div class="ogenda-stat-mini-val">3</div></div>
    <div class="ogenda-stat-mini"><div class="ogenda-stat-mini-label">Busiest day</div><div class="ogenda-stat-mini-val">Jul 21 · 4</div></div>
  </div>
"""
    return panel_shell(html)


def form_fixture():
    content = """
<div class="ogenda-form-title" style="padding:1em 1.5em 0;font-size:1.2em;font-weight:700;">New event</div>
<div style="padding:1em 1.5em;">
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">Title *</div></div><div class="setting-item-control"><input type="text" value="Team weekly standup" style="width:100%"></div></div>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">All day</div></div><div class="setting-item-control"><input type="checkbox"></div></div>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">Start *</div></div><div class="setting-item-control"><input type="datetime-local" value="2026-07-21T09:00" class="ogenda-form-datetime"></div></div>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">End</div></div><div class="setting-item-control"><input type="datetime-local" value="2026-07-21T10:00" class="ogenda-form-datetime"></div></div>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">Location</div></div><div class="setting-item-control"><input type="text" value="Room A" style="width:100%"></div></div>
  <div class="setting-item">
    <div class="setting-item-info"><div class="setting-item-name">Category</div><div class="setting-item-description">Select a preset or type a custom category.</div></div>
    <div class="setting-item-control" style="flex-direction:column;align-items:stretch;">
      <div class="ogenda-form-cat-chips">
        <div class="ogenda-form-cat-chip active" style="border-left-color:#7c3aed">Work</div>
        <div class="ogenda-form-cat-chip" style="border-left-color:#06b6d4">Personal</div>
        <div class="ogenda-form-cat-chip" style="border-left-color:#22c55e">Study</div>
        <div class="ogenda-form-cat-chip" style="border-left-color:#f59e0b">Meeting</div>
        <div class="ogenda-form-cat-chip" style="border-left-color:#ef4444">Travel</div>
        <div class="ogenda-form-cat-chip" style="border-left-color:#a855f7">Health</div>
      </div>
      <input type="text" value="Work" class="ogenda-form-cat-input">
    </div>
  </div>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">Description</div></div><div class="setting-item-control"><textarea class="ogenda-form-desc">Weekly sync with the product team.</textarea></div></div>
  <div class="ogenda-form-more-toggle">▸ More options</div>
  <div class="ogenda-form-error"></div>
  <div class="ogenda-form-buttons"><button class="mod-cta">Save</button></div>
</div>
"""
    return BASE_HTML.format(title="ogenda form", css_vars=CSS_VARS, width=520, content=content)


def settings_fixture():
    content = """
<div style="padding:1em 1.5em;max-width:600px;">
  <div style="font-size:1.2em;font-weight:700;margin-bottom:1em;">Ogenda settings</div>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">Language</div></div><div class="setting-item-control"><select><option>Auto</option><option>简体中文</option><option selected>English</option></select></div></div>
  <h3 style="margin-top:1.5em;">Category</h3>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">Default category</div><div class="setting-item-description">Used when creating new events.</div></div><div class="setting-item-control"><select><option>Custom</option><option selected>Work</option><option>Personal</option></select><input type="text" value="Work" style="margin-left:0.5em;"></div></div>
  <h3 style="margin-top:1.5em;">Calendar sync</h3>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">Sync provider</div></div><div class="setting-item-control"><select><option>None</option><option>iCloud</option><option selected>CalDAV</option><option>ICS</option></select></div></div>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">CalDAV URL</div></div><div class="setting-item-control"><input type="text" value="https://caldav.example.com/calendars/home" style="width:100%"></div></div>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">CalDAV user</div></div><div class="setting-item-control"><input type="text" value="user@example.com" style="width:100%"></div></div>
  <h3 style="margin-top:1.5em;">Storage</h3>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">Storage folder</div></div><div class="setting-item-control"><input type="text" value="Agenda" style="width:100%"></div></div>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">Timezone</div></div><div class="setting-item-control"><select><option>Follow system</option><option>Asia/Shanghai</option><option>America/Los_Angeles</option></select></div></div>
</div>
"""
    return BASE_HTML.format(title="ogenda settings", css_vars=CSS_VARS, width=600, content=content)


fixtures = {
    "list": list_fixture,
    "day": day_fixture,
    "week": week_fixture,
    "month": month_fixture,
    "stats": stats_fixture,
    "form": form_fixture,
    "settings": settings_fixture,
}

for name, fn in fixtures.items():
    (FIXTURES / f"{name}.html").write_text(fn(), encoding="utf-8")

print("Fixtures generated:", ", ".join(fixtures.keys()))
