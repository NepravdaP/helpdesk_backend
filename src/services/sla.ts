import type { TicketStatus } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { parseSchedule, WorkCalendar } from "./slaCalendar.js";

// ───────────────────────────── Модель SLA ─────────────────────────────
// • Срок = момент создания + SLA типа заявки (в рабочих часах) + накопленные паузы.
// • SLA — снимок на заявке: правка типа в конфигурации не меняет сроки уже созданных заявок.
// • Статус «На уточнении» (ждём заявителя) ставит SLA на паузу — как в ITIL.
// • При закрытии фиксируется resolvedAt; переоткрытие его сбрасывает, срок остаётся прежним.

export const calendar = new WorkCalendar(
  parseSchedule(env.SLA_TIMEZONE, env.SLA_WORK_DAYS, env.SLA_WORK_START, env.SLA_WORK_END),
);

const HOUR = 3_600_000;
const AT_RISK_SHARE = 0.25; // «под угрозой», когда осталось ≤ 25% от SLA

export interface SlaFields {
  createdAt: Date;
  slaHours: number | null;
  dueAt: Date | null;
  slaPausedAt: Date | null;
  slaPausedSec: number;
  resolvedAt: Date | null;
}

export type SlaState = "none" | "onTrack" | "atRisk" | "paused" | "breached" | "met";

export interface SlaInfo {
  state: SlaState;
  remainingMs: number | null; // рабочее время до срока (onTrack / atRisk / paused)
  overdueMs: number | null; // насколько просрочена (календарное время) — для breached
}

export function computeDueAt(createdAt: Date, slaHours: number, pausedSec: number, cal = calendar): Date | null {
  if (slaHours <= 0) return null;
  return cal.addWorking(createdAt, slaHours * HOUR + pausedSec * 1000);
}

// Изменения SLA-полей при смене статуса (prev → next) в момент at.
export function applyStatusChange(
  f: SlaFields,
  prev: TicketStatus,
  next: TicketStatus,
  at: Date,
  cal = calendar,
): Partial<SlaFields> {
  if (prev === next) return {};
  const out: Partial<SlaFields> = {};
  let pausedSec = f.slaPausedSec;

  // Выход из паузы: добавляем рабочее время паузы и сдвигаем срок.
  if (prev === "clarification" && f.slaPausedAt) {
    pausedSec += Math.max(0, Math.round(cal.workingBetween(f.slaPausedAt, at) / 1000));
    out.slaPausedSec = pausedSec;
    out.slaPausedAt = null;
    if (f.slaHours) out.dueAt = computeDueAt(f.createdAt, f.slaHours, pausedSec, cal);
  }
  if (next === "clarification") out.slaPausedAt = at;
  if (next === "closed") out.resolvedAt = at;
  if (prev === "closed") out.resolvedAt = null;
  return out;
}

// Пересчёт срока при смене типа заявки (новый SLA, те же паузы).
export function applyTypeChange(f: SlaFields, newSlaHours: number, cal = calendar): Partial<SlaFields> {
  return { slaHours: newSlaHours, dueAt: computeDueAt(f.createdAt, newSlaHours, f.slaPausedSec, cal) };
}

export function slaInfo(f: SlaFields, now = new Date(), cal = calendar): SlaInfo {
  if (!f.slaHours || !f.dueAt) return { state: "none", remainingMs: null, overdueMs: null };
  const due = f.dueAt.getTime();

  if (f.resolvedAt) {
    const late = f.resolvedAt.getTime() > due;
    return { state: late ? "breached" : "met", remainingMs: null, overdueMs: late ? f.resolvedAt.getTime() - due : null };
  }
  // На паузе часы стоят: сравниваем срок с моментом постановки на паузу.
  const ref = f.slaPausedAt ?? now;
  if (ref.getTime() > due) {
    return { state: "breached", remainingMs: null, overdueMs: ref.getTime() - due };
  }
  const remainingMs = cal.workingBetween(ref, f.dueAt);
  if (f.slaPausedAt) return { state: "paused", remainingMs, overdueMs: null };
  const atRisk = remainingMs <= f.slaHours * HOUR * AT_RISK_SHARE;
  return { state: atRisk ? "atRisk" : "onTrack", remainingMs, overdueMs: null };
}

// Чистое рабочее время решения (без пауз) — для отчётов.
export function resolutionWorkingMs(f: SlaFields, cal = calendar): number | null {
  if (!f.resolvedAt) return null;
  return Math.max(0, cal.workingBetween(f.createdAt, f.resolvedAt) - f.slaPausedSec * 1000);
}

// ───────────────────── Досчёт заявок без SLA (slaHours = null) ─────────────────────
// Заявки, созданные до появления SLA (или сидом), восстанавливаются по истории статусов:
// паузы — по периодам «На уточнении», resolvedAt — по последнему закрытию. Идемпотентно.

export interface StatusEvent {
  status: TicketStatus;
  at: Date;
}

export function replaySla(
  createdAt: Date,
  slaHours: number,
  events: StatusEvent[],
  currentStatus: TicketStatus,
  fallbackAt: Date,
  cal = calendar,
): SlaFields {
  let f: SlaFields = {
    createdAt,
    slaHours,
    dueAt: computeDueAt(createdAt, slaHours, 0, cal),
    slaPausedAt: null,
    slaPausedSec: 0,
    resolvedAt: null,
  };
  let status: TicketStatus = "request";
  const ordered = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const e of ordered) {
    f = { ...f, ...applyStatusChange(f, status, e.status, e.at, cal) };
    status = e.status;
  }
  // История могла не дойти до текущего статуса (например, заявка из сида) — доводим.
  if (status !== currentStatus) {
    f = { ...f, ...applyStatusChange(f, status, currentStatus, fallbackAt, cal) };
  }
  return f;
}

export async function backfillSla(): Promise<number> {
  const tickets = await prisma.ticket.findMany({
    where: { slaHours: null },
    select: {
      id: true,
      type: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      activity: { where: { kind: "status" }, select: { status: true, createdAt: true } },
    },
  });
  if (tickets.length === 0) return 0;

  const types = await prisma.ticketType.findMany({ select: { key: true, slaHours: true } });
  const slaByType = new Map(types.map((t) => [t.key, t.slaHours]));

  for (const t of tickets) {
    const events: StatusEvent[] = t.activity
      .filter((a): a is { status: TicketStatus; createdAt: Date } => a.status != null)
      .map((a) => ({ status: a.status, at: a.createdAt }));
    const f = replaySla(t.createdAt, slaByType.get(t.type) ?? 0, events, t.status, t.updatedAt);
    await prisma.ticket.update({
      where: { id: t.id },
      data: {
        slaHours: f.slaHours,
        dueAt: f.dueAt,
        slaPausedAt: f.slaPausedAt,
        slaPausedSec: f.slaPausedSec,
        resolvedAt: f.resolvedAt,
        updatedAt: t.updatedAt, // досчёт не должен менять «дату изменения» заявки
      },
    });
  }
  return tickets.length;
}

export async function slaHoursForType(typeKey: string): Promise<number> {
  const tt = await prisma.ticketType.findUnique({ where: { key: typeKey }, select: { slaHours: true } });
  return tt?.slaHours ?? 0;
}
