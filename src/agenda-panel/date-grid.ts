export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Monday-first start of the week containing d. */
export function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  const dow = (day.getDay() + 6) % 7; // JS getDay(): 0=Sun..6=Sat -> 0=Mon..6=Sun
  return addDays(day, -dow);
}

/** Monday-first weeks (each 7 consecutive days) covering the calendar month containing anchor. */
export function monthGridWeeks(anchor: Date): Date[][] {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const gridStart = startOfWeek(firstOfMonth);
  const gridEnd = addDays(startOfWeek(lastOfMonth), 7); // exclusive

  const weeks: Date[][] = [];
  for (let cursor = gridStart; cursor < gridEnd; cursor = addDays(cursor, 7)) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) week.push(addDays(cursor, i));
    weeks.push(week);
  }
  return weeks;
}
