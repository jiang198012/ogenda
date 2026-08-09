#!/usr/bin/env python3
"""Generate Chinese-UI screenshot fixtures for the ogenda README."""
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
<html lang="zh-CN">
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
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
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

# Chinese UI labels, matching src/i18n/zh.ts
TAB_LIST, TAB_DAY, TAB_WEEK, TAB_MONTH, TAB_STATS = "清单", "日", "周", "月", "统计"
NAV_TODAY, BTN_TODAY, BTN_NEW, BTN_SYNC = "今天 · 7月21日", "今天", "+ 新建", "同步"
STATUS_CONFIRMED, STATUS_TENTATIVE, STATUS_CANCELLED = "已确认", "待定", "已取消"
CAT_WORK, CAT_MEETING, CAT_HEALTH, CAT_PERSONAL, CAT_STUDY, CAT_TRAVEL = "工作", "会议", "健康", "个人", "学习", "旅行"
ALL_DAY = "全天"


def panel_shell(body_content: str, width: int = 900) -> str:
    header = f"""
  <div class="ogenda-panel-head">
    <div class="ogenda-panel-tabs">
      <div class="ogenda-panel-tab active">{TAB_LIST}</div>
      <div class="ogenda-panel-tab">{TAB_DAY}</div>
      <div class="ogenda-panel-tab">{TAB_WEEK}</div>
      <div class="ogenda-panel-tab">{TAB_MONTH}</div>
      <div class="ogenda-panel-tab">{TAB_STATS}</div>
    </div>
    <div class="ogenda-panel-nav">
      <span class="ogenda-navbtn">‹</span>
      <span class="ogenda-navtoday">{NAV_TODAY}</span>
      <span class="ogenda-navbtn">›</span>
      <span class="ogenda-navtoday-btn">{BTN_TODAY}</span>
    </div>
    <div class="ogenda-panel-newbtn">{BTN_NEW}</div>
    <div class="ogenda-panel-syncbtn"><span>{BTN_SYNC}</span></div>
  </div>
  <div class="ogenda-panel-body">
"""
    return BASE_HTML.format(
        title="ogenda",
        css_vars=CSS_VARS,
        width=width,
        content=f'<div class="ogenda-panel">{header}{body_content}\n  </div>\n</div>',
    )


def list_fixture(width: int = 900):
    body = f"""<div class="ogenda-list-statusgroup">
  <div class="ogenda-list-statusheader">{STATUS_CONFIRMED} · 3</div>
  <div class="ogenda-list-statusitems">
    <div class="ogenda-event-row" style="border-left-color: #7c3aed;">
      <div class="ogenda-event-when"><span class="ogenda-event-date">7月21日</span><span class="ogenda-event-time">09:00–10:00</span></div>
      <div class="ogenda-event-main"><div class="ogenda-event-title">团队周会</div><div class="ogenda-event-loc">A 会议室</div></div>
      <span class="ogenda-status-pill" style="color:#fff;background:#22c55e;">{STATUS_CONFIRMED}</span>
      <span class="ogenda-cat-pill" style="color:#7c3aed;background:rgba(124,58,237,0.12);">{CAT_WORK}</span>
    </div>
    <div class="ogenda-event-row" style="border-left-color: #7c3aed;">
      <div class="ogenda-event-when"><span class="ogenda-event-date">7月21日</span><span class="ogenda-event-time">14:00–15:00</span></div>
      <div class="ogenda-event-main"><div class="ogenda-event-title">客户评审</div><div class="ogenda-event-loc">视频会议</div></div>
      <span class="ogenda-status-pill" style="color:#fff;background:#22c55e;">{STATUS_CONFIRMED}</span>
      <span class="ogenda-cat-pill" style="color:#7c3aed;background:rgba(124,58,237,0.12);">{CAT_WORK}</span>
    </div>
    <div class="ogenda-event-row" style="border-left-color: #06b6d4;">
      <div class="ogenda-event-when"><span class="ogenda-event-date">7月21日</span><span class="ogenda-event-time">16:00–17:00</span></div>
      <div class="ogenda-event-main"><div class="ogenda-event-title">设计同步</div></div>
      <span class="ogenda-status-pill" style="color:#fff;background:#22c55e;">{STATUS_CONFIRMED}</span>
      <span class="ogenda-cat-pill" style="color:#06b6d4;background:rgba(6,182,212,0.12);">{CAT_MEETING}</span>
    </div>
  </div>
</div>
<div class="ogenda-list-statusgroup">
  <div class="ogenda-list-statusheader">{STATUS_TENTATIVE} · 1</div>
  <div class="ogenda-list-statusitems">
    <div class="ogenda-event-row" style="border-left-color: #f59e0b;">
      <div class="ogenda-event-when"><span class="ogenda-event-date">7月22日</span><span class="ogenda-event-time">{ALL_DAY}</span></div>
      <div class="ogenda-event-main"><div class="ogenda-event-title">季度规划</div></div>
      <span class="ogenda-status-pill" style="color:#fff;background:#f59e0b;">{STATUS_TENTATIVE}</span>
      <span class="ogenda-cat-pill" style="color:#f59e0b;background:rgba(245,158,11,0.12);">{CAT_MEETING}</span>
    </div>
    <div class="ogenda-event-row" style="border-left-color: #22c55e;">
      <div class="ogenda-event-when"><span class="ogenda-event-date">7月23日</span><span class="ogenda-event-time">10:00–11:00</span></div>
      <div class="ogenda-event-main"><div class="ogenda-event-title">健身房</div><div class="ogenda-event-loc">健身中心</div></div>
      <span class="ogenda-cat-pill" style="color:#22c55e;background:rgba(34,197,94,0.12);">{CAT_HEALTH}</span>
    </div>
  </div>
</div>"""
    return panel_shell(body, width)


def day_fixture(width: int = 900):
    card = f"""
  <div class="ogenda-day-card" style="border-left-color: #7c3aed;">
    <div class="ogenda-day-time">09:00–10:00</div>
    <div class="ogenda-day-titlerow">
      <div class="ogenda-day-title">团队周会</div>
      <span class="ogenda-status-pill" style="color:#fff;background:#22c55e;">{STATUS_CONFIRMED}</span>
    </div>
    <div class="ogenda-field-grid">
      <span class="ogenda-field-key">地点</span><span class="ogenda-field-value">A 会议室</span>
      <span class="ogenda-field-key">组织者</span><span class="ogenda-field-value">alice@example.com</span>
      <span class="ogenda-field-key">参与人</span><span class="ogenda-field-value">bob@example.com, carol@example.com</span>
      <span class="ogenda-field-key">分类</span><span class="ogenda-field-value">{CAT_WORK}</span>
    </div>
  </div>
  <div class="ogenda-day-card" style="border-left-color: #06b6d4;">
    <div class="ogenda-day-time">14:00–15:00</div>
    <div class="ogenda-day-titlerow">
      <div class="ogenda-day-title">客户评审</div>
      <span class="ogenda-status-pill" style="color:#fff;background:#22c55e;">{STATUS_CONFIRMED}</span>
    </div>
    <div class="ogenda-field-grid">
      <span class="ogenda-field-key">地点</span><span class="ogenda-field-value">视频会议</span>
      <span class="ogenda-field-key">分类</span><span class="ogenda-field-value">{CAT_MEETING}</span>
    </div>
  </div>
  <div class="ogenda-day-card" style="border-left-color: #22c55e;">
    <div class="ogenda-day-time">10:00–11:00</div>
    <div class="ogenda-day-titlerow">
      <div class="ogenda-day-title">健身房</div>
    </div>
    <div class="ogenda-field-grid">
      <span class="ogenda-field-key">地点</span><span class="ogenda-field-value">健身中心</span>
      <span class="ogenda-field-key">分类</span><span class="ogenda-field-value">{CAT_HEALTH}</span>
    </div>
  </div>
"""
    side = """
  <div class="ogenda-day-side">
    <div class="ogenda-mini-cal-month">
      <div class="ogenda-mini-cal-header">2026年7月</div>
      <div class="ogenda-mini-cal-grid">
        <div class="ogenda-mini-cal-dow">一</div><div class="ogenda-mini-cal-dow">二</div><div class="ogenda-mini-cal-dow">三</div>
        <div class="ogenda-mini-cal-dow">四</div><div class="ogenda-mini-cal-dow">五</div><div class="ogenda-mini-cal-dow">六</div>
        <div class="ogenda-mini-cal-dow">日</div>
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
    return panel_shell(content, width)


def week_fixture(width: int = 900):
    heads = ["周一 20", "周二 21", "周三 22", "周四 23", "周五 24", "周六 25", "周日 26"]
    colors = ["#3B82F6", "#22C55E", "#06B6D4", "#A855F7", "#64748B", "#F59E0B", "#EF4444"]
    events = [
        [("09:00", "团队周会", "A 会议室", "#7c3aed")],
        [("14:00", "客户评审", "视频会议", "#06b6d4"), ("16:00", "设计同步", "", "#7c3aed")],
        [("全天", "季度规划", "", "#f59e0b")],
        [("10:00", "健身房", "健身中心", "#22c55e")],
        [],
        [("11:00", "早午餐", "", "#ef4444")],
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
    return panel_shell(html, width)


def month_fixture(width: int = 900):
    days = list(range(29, 32)) + list(range(1, 32))  # Jul 2026 starts Wed
    events = {
        21: [("团队周会", "#7c3aed"), ("客户评审", "#06b6d4")],
        22: [("季度规划", "#f59e0b")],
        23: [("健身房", "#22c55e")],
        26: [("早午餐", "#ef4444")],
    }
    html = '<div class="ogenda-month-grid">\n'
    for dow in ["一", "二", "三", "四", "五", "六", "日"]:
        html += f'  <div class="ogenda-month-dow">{dow}</div>\n'
    for d in days:
        other = " ogenda-month-othermonth" if d > 28 else ""
        html += f'  <div class="ogenda-month-cell{other}">\n'
        html += f'    <div class="ogenda-month-daynum">{d}</div>\n'
        for title, color in events.get(d, []):
            html += f'    <div class="ogenda-month-mini" style="border-left-color:{color}">{title}</div>\n'
        html += '  </div>\n'
    html += '</div>'
    return panel_shell(html, width)


def stats_fixture(width: int = 900):
    html = f"""
  <div class="ogenda-stat-kpis">
    <div class="ogenda-kpi"><div class="ogenda-kpi-num">12</div><div class="ogenda-kpi-label">本月事件</div></div>
    <div class="ogenda-kpi"><div class="ogenda-kpi-num" style="color:#22c55e">8</div><div class="ogenda-kpi-label">{STATUS_CONFIRMED}</div></div>
    <div class="ogenda-kpi"><div class="ogenda-kpi-num" style="color:#f59e0b">3</div><div class="ogenda-kpi-label">{STATUS_TENTATIVE}</div></div>
    <div class="ogenda-kpi ogenda-kpi-warn"><div class="ogenda-kpi-num" style="color:var(--text-error)">1</div><div class="ogenda-kpi-label">未同步</div></div>
  </div>

  <div class="ogenda-stat-card">
    <div class="ogenda-stat-card-title">状态分布</div>
    <div class="ogenda-stat-bar-row">
      <span class="ogenda-stat-bar-label" style="color:#22c55e">{STATUS_CONFIRMED}</span>
      <div class="ogenda-stat-bar-track"><div class="ogenda-stat-bar-fill" style="width:100%;background:#22c55e"></div></div>
      <span class="ogenda-stat-bar-count">8</span>
    </div>
    <div class="ogenda-stat-bar-row">
      <span class="ogenda-stat-bar-label" style="color:#f59e0b">{STATUS_TENTATIVE}</span>
      <div class="ogenda-stat-bar-track"><div class="ogenda-stat-bar-fill" style="width:38%;background:#f59e0b"></div></div>
      <span class="ogenda-stat-bar-count">3</span>
    </div>
    <div class="ogenda-stat-bar-row">
      <span class="ogenda-stat-bar-label" style="color:#6b7280">未设置</span>
      <div class="ogenda-stat-bar-track"><div class="ogenda-stat-bar-fill" style="width:13%;background:#6b7280"></div></div>
      <span class="ogenda-stat-bar-count">1</span>
    </div>
  </div>

  <div class="ogenda-stat-card">
    <div class="ogenda-stat-card-title">分类分布</div>
    <div class="ogenda-cat-chips">
      <span class="ogenda-cat-chip"><span class="ogenda-cat-chip-bar" style="background:#7c3aed"></span><span>{CAT_WORK}</span><span class="ogenda-cat-chip-count">5</span></span>
      <span class="ogenda-cat-chip"><span class="ogenda-cat-chip-bar" style="background:#06b6d4"></span><span>{CAT_MEETING}</span><span class="ogenda-cat-chip-count">3</span></span>
      <span class="ogenda-cat-chip"><span class="ogenda-cat-chip-bar" style="background:#22c55e"></span><span>{CAT_HEALTH}</span><span class="ogenda-cat-chip-count">2</span></span>
      <span class="ogenda-cat-chip"><span class="ogenda-cat-chip-bar" style="background:#f59e0b"></span><span>{CAT_PERSONAL}</span><span class="ogenda-cat-chip-count">2</span></span>
    </div>
  </div>

  <div class="ogenda-stat-minis">
    <div class="ogenda-stat-mini"><div class="ogenda-stat-mini-label">全天 / 带时间</div><div class="ogenda-stat-mini-val">2 / 10</div></div>
    <div class="ogenda-stat-mini"><div class="ogenda-stat-mini-label">循环事件</div><div class="ogenda-stat-mini-val">3</div></div>
    <div class="ogenda-stat-mini"><div class="ogenda-stat-mini-label">最忙一天</div><div class="ogenda-stat-mini-val">7月21日 · 4</div></div>
  </div>
"""
    return panel_shell(html, width)


def form_fixture(width: int = 520):
    content = f"""
<div class="ogenda-form-title" style="padding:1em 1.5em 0;font-size:1.2em;font-weight:700;">新建事件</div>
<div style="padding:1em 1.5em;">
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">标题 *</div></div><div class="setting-item-control"><input type="text" value="团队周会" style="width:100%"></div></div>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">全天</div></div><div class="setting-item-control"><input type="checkbox"></div></div>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">开始时间 *</div></div><div class="setting-item-control"><input type="date" value="2026-07-21" class="ogenda-form-date"><input type="text" value="09:00" class="ogenda-form-time"></div></div>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">结束时间</div><div class="setting-item-description">可留空</div></div><div class="setting-item-control"><input type="date" value="2026-07-21" class="ogenda-form-date"><input type="text" value="10:00" class="ogenda-form-time"></div></div>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">地点</div></div><div class="setting-item-control"><input type="text" value="A 会议室" style="width:100%"></div></div>
  <div class="setting-item">
    <div class="setting-item-info"><div class="setting-item-name">分类</div><div class="setting-item-description">点选已有分类,或输入新分类</div></div>
    <div class="setting-item-control" style="flex-direction:column;align-items:stretch;">
      <div class="ogenda-form-cat-chips">
        <div class="ogenda-form-cat-chip active" style="border-left-color:#7c3aed">{CAT_WORK}</div>
        <div class="ogenda-form-cat-chip" style="border-left-color:#06b6d4">{CAT_PERSONAL}</div>
        <div class="ogenda-form-cat-chip" style="border-left-color:#22c55e">{CAT_STUDY}</div>
        <div class="ogenda-form-cat-chip" style="border-left-color:#f59e0b">{CAT_MEETING}</div>
        <div class="ogenda-form-cat-chip" style="border-left-color:#ef4444">{CAT_TRAVEL}</div>
        <div class="ogenda-form-cat-chip" style="border-left-color:#a855f7">{CAT_HEALTH}</div>
      </div>
      <input type="text" value="工作" class="ogenda-form-cat-input">
    </div>
  </div>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">备注</div></div><div class="setting-item-control"><textarea class="ogenda-form-desc">与产品团队每周同步。</textarea></div></div>
  <div class="ogenda-form-more-toggle">▸ 更多选项</div>
  <div class="ogenda-form-error"></div>
  <div class="ogenda-form-buttons"><button class="mod-cta">保存</button></div>
</div>
"""
    return BASE_HTML.format(title="ogenda form", css_vars=CSS_VARS, width=width, content=content)


def settings_fixture(width: int = 600):
    content = f"""
<div style="padding:1em 1.5em;max-width:600px;">
  <div style="font-size:1.2em;font-weight:700;margin-bottom:1em;">Ogenda 设置</div>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">语言</div></div><div class="setting-item-control"><select><option>跟随 Obsidian</option><option selected>简体中文</option><option>English</option></select></div></div>
  <h3 style="margin-top:1.5em;">分类</h3>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">默认分类</div><div class="setting-item-description">新建事件时的默认分类</div></div><div class="setting-item-control"><select><option>自定义</option><option selected>工作</option><option>个人</option></select><input type="text" value="工作" style="margin-left:0.5em;"></div></div>
  <h3 style="margin-top:1.5em;">日历同步</h3>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">同步方式</div></div><div class="setting-item-control"><select><option>关闭</option><option>iCloud (CalDAV)</option><option selected>通用 CalDAV</option><option>ICS 订阅(只读)</option></select></div></div>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">CalDAV 日历 URL</div></div><div class="setting-item-control"><input type="text" value="https://caldav.example.com/calendars/home" style="width:100%"></div></div>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">用户名</div></div><div class="setting-item-control"><input type="text" value="user@example.com" style="width:100%"></div></div>
  <h3 style="margin-top:1.5em;">存储</h3>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">存储文件夹</div></div><div class="setting-item-control"><input type="text" value="Agenda" style="width:100%"></div></div>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">时区</div></div><div class="setting-item-control"><select><option>跟随系统</option><option>Asia/Shanghai</option><option>America/Los_Angeles</option></select></div></div>
  <div class="setting-item"><div class="setting-item-info"><div class="setting-item-name">启动时自动同步</div></div><div class="setting-item-control"><input type="checkbox" checked></div></div>
</div>
"""
    return BASE_HTML.format(title="ogenda settings", css_vars=CSS_VARS, width=width, content=content)


fixtures = {
    "list": list_fixture,
    "day": day_fixture,
    "week": week_fixture,
    "month": month_fixture,
    "stats": stats_fixture,
    "form": form_fixture,
    "settings": settings_fixture,
}

# Desktop variants: the width the panel is framed at.
DESKTOP_WIDTH = {
    "list": 900, "day": 900, "week": 900, "month": 900, "stats": 900,
    "form": 520, "settings": 600,
}
# Mobile variants: 375px phones for the README strip.
MOBILE_VIEWS = ["list", "day", "week", "month"]

for name, fn in fixtures.items():
    (FIXTURES / f"{name}.html").write_text(fn(DESKTOP_WIDTH[name]), encoding="utf-8")

for name in MOBILE_VIEWS:
    (FIXTURES / f"{name}-mobile.html").write_text(fixtures[name](375), encoding="utf-8")

print("Fixtures generated:", ", ".join(fixtures.keys()))
print("Mobile variants:", ", ".join(MOBILE_VIEWS))
