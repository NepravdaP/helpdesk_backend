// Рабочий календарь для SLA: «сколько рабочего времени между двумя моментами»
// и «какой момент наступит через N рабочих часов». Без внешних зависимостей —
// часовой пояс учитывается через Intl, поэтому сервер может работать в UTC.

export interface WorkSchedule {
  timeZone: string; // IANA, например Europe/Moscow
  workDays: number[]; // ISO-дни недели: 1 — пн … 7 — вс
  startMin: number; // начало рабочего дня, минут от полуночи
  endMin: number; // конец рабочего дня, минут от полуночи (1440 = 24:00)
}

const MIN = 60_000;
const MAX_DAYS = 3660; // предохранитель от бесконечного цикла (~10 лет)

interface LocalDate {
  y: number;
  m: number; // 1..12
  d: number;
}

export function parseTime(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`Неверное время «${hhmm}», ожидается ЧЧ:ММ`);
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  if (minutes > 1440 || Number(m[2]) > 59) throw new Error(`Неверное время «${hhmm}»`);
  return minutes;
}

export function parseSchedule(timeZone: string, days: string, start: string, end: string): WorkSchedule {
  // Проверяем часовой пояс сразу, чтобы ошибка была понятной при старте, а не при первом расчёте.
  new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  const workDays = [...new Set(days.split(",").map((x) => Number(x.trim())))].filter(
    (x) => Number.isInteger(x) && x >= 1 && x <= 7,
  );
  const startMin = parseTime(start);
  const endMin = parseTime(end);
  if (workDays.length === 0) throw new Error("SLA_WORK_DAYS: не задано ни одного рабочего дня");
  if (endMin <= startMin) throw new Error("SLA_WORK_END должно быть позже SLA_WORK_START");
  return { timeZone, workDays, startMin, endMin };
}

export class WorkCalendar {
  private readonly fmt: Intl.DateTimeFormat;

  constructor(readonly schedule: WorkSchedule) {
    this.fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: schedule.timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
  }

  // Смещение часового пояса (мс) в данный момент: местное время − UTC.
  private offset(ts: number): number {
    const p: Record<string, number> = {};
    for (const part of this.fmt.formatToParts(new Date(ts))) {
      if (part.type !== "literal") p[part.type] = Number(part.value);
    }
    const local = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour! % 24, p.minute!, p.second!);
    return local - (ts - (ts % 1000));
  }

  private localDate(ts: number): LocalDate {
    const shifted = new Date(ts + this.offset(ts));
    return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() };
  }

  // Момент (UTC, мс), соответствующий местной дате + минутам от полуночи.
  private toUtc(date: LocalDate, minutes: number): number {
    const wall = Date.UTC(date.y, date.m - 1, date.d) + minutes * MIN;
    const guess = wall - this.offset(wall);
    return wall - this.offset(guess);
  }

  private nextDay(date: LocalDate): LocalDate {
    const n = new Date(Date.UTC(date.y, date.m - 1, date.d + 1));
    return { y: n.getUTCFullYear(), m: n.getUTCMonth() + 1, d: n.getUTCDate() };
  }

  private isWorkDay(date: LocalDate): boolean {
    const dow = new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay(); // 0 — вс
    return this.schedule.workDays.includes(dow === 0 ? 7 : dow);
  }

  // Рабочее окно местного дня [start, end) в UTC или null для выходного.
  private window(date: LocalDate): [number, number] | null {
    if (!this.isWorkDay(date)) return null;
    return [this.toUtc(date, this.schedule.startMin), this.toUtc(date, this.schedule.endMin)];
  }

  // Момент, который наступит через ms рабочего времени после start.
  // Если start вне рабочего времени, отсчёт начинается с ближайшего рабочего окна.
  addWorking(start: Date, ms: number): Date {
    let cursor = start.getTime();
    let remaining = Math.max(0, ms);
    let date = this.localDate(cursor);
    for (let i = 0; i < MAX_DAYS; i++) {
      const w = this.window(date);
      if (w) {
        const from = Math.max(cursor, w[0]);
        if (from < w[1]) {
          const available = w[1] - from;
          if (remaining <= available) return new Date(from + remaining);
          remaining -= available;
        }
      }
      date = this.nextDay(date);
    }
    throw new Error("Не удалось рассчитать срок SLA: проверьте рабочий график");
  }

  // Рабочее время (мс) между a и b; если b раньше a — отрицательное значение.
  workingBetween(a: Date, b: Date): number {
    const from = a.getTime();
    const to = b.getTime();
    if (to < from) return -this.workingBetween(b, a);
    let total = 0;
    let date = this.localDate(from);
    for (let i = 0; i < MAX_DAYS; i++) {
      if (this.toUtc(date, 0) >= to) break;
      const w = this.window(date);
      if (w) {
        const s = Math.max(from, w[0]);
        const e = Math.min(to, w[1]);
        if (e > s) total += e - s;
      }
      date = this.nextDay(date);
    }
    return total;
  }
}
