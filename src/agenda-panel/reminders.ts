// 提醒调度(纯逻辑):从事件里挑出「下一个到点该提醒」的提醒。
// 只读事件列表 + 当前时间,不碰 Obsidian API,便于单测。
// 重复事件按下一个即将到来的实例计算提醒时刻。
import { AgendaEvent, getReminderMinutes } from "../core/event";
import { expandOccurrences } from "./occurrences";

export interface DueReminder {
  uid: string;
  title: string;
  /** 事件开始时间(ISO)。 */
  start: string;
  /** 提醒触发时间(ISO,本地)。 */
  due: string;
}

/**
 * 找出当前时刻之后最近一条到点的提醒。
 * - 只看有 reminder(s) 字段的事件;
 * - 重复事件取未来 60 天窗口内第一个实例;
 * - nowIso 为本地时间 ISO。
 * 返回 null 表示没有待触发提醒。
 */
export function nextDueReminder(events: AgendaEvent[], nowIso: string): DueReminder | null {
  const now = new Date(nowIso);
  if (isNaN(now.getTime())) return null;

  let best: DueReminder | null = null;
  const consider = (uid: string, title: string, start: string, due: Date): void => {
    if (due.getTime() <= now.getTime()) return;
    const dueIso = localIso(due);
    if (!best || dueIso < best.due) {
      best = { uid, title, start, due: dueIso };
    }
  };

  for (const ev of events) {
    const reminderMinutes = getReminderMinutes(ev);
    if (!reminderMinutes.length) continue;
    if (!ev.start) continue;

    if (ev.rrule) {
      // 重复事件:未来 60 天窗口内,取第一个「触发点还没到」的实例
      // (实例本身可能已经开始,但今天的触发点已过 → 看下一个实例)。
      const rangeEnd = new Date(now.getTime() + 60 * 24 * 3600_000);
      const occs = expandOccurrences([ev], now, rangeEnd);
      for (const occ of occs) {
        let hasFutureReminder = false;
        for (const minutes of reminderMinutes) {
          const due = new Date(new Date(occ.start).getTime() - minutes * 60_000);
          if (due.getTime() > now.getTime()) {
            hasFutureReminder = true;
            consider(ev.uid, ev.title, occ.start, due);
          }
        }
        if (hasFutureReminder) break;
      }
      continue;
    }

    for (const minutes of reminderMinutes) {
      consider(ev.uid, ev.title, ev.start, new Date(new Date(ev.start).getTime() - minutes * 60_000));
    }
  }

  return best;
}

/** Date → "YYYY-MM-DDTHH:MM:SS"(本地时间,与事件时间同域)。 */
function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
