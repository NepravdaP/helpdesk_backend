import { prisma } from "../../lib/prisma.js";
import { resolutionWorkingMs, slaInfo } from "../../services/sla.js";

export interface ReportSummary {
  tickets: {
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    byType: { key: string; count: number }[];
  };
  assets: {
    total: number;
    byStatus: Record<string, number>;
    byType: { key: string; count: number }[];
  };
  bookings: {
    upcoming: number;
  };
  sla: SlaReport;
}

export interface SlaTypeRow {
  key: string;
  closed: number; // закрыто заявок с SLA
  met: number; // из них в срок
  avgResolutionHours: number | null; // среднее чистое время решения, рабочие часы
}

export interface SlaReport {
  closedWithSla: number;
  met: number;
  metPercent: number | null; // % закрытых в срок
  avgResolutionHours: number | null;
  openOverdue: number; // открытые заявки, срок которых уже прошёл
  openAtRisk: number; // открытые, у которых осталось ≤ 25% SLA
  openPaused: number; // на уточнении (SLA на паузе)
  byType: SlaTypeRow[];
}

const HOUR = 3_600_000;
const round1 = (x: number) => Math.round(x * 10) / 10;

async function getSlaReport(): Promise<SlaReport> {
  const rows = await prisma.ticket.findMany({
    where: { slaHours: { gt: 0 } },
    select: {
      type: true,
      createdAt: true,
      slaHours: true,
      dueAt: true,
      slaPausedAt: true,
      slaPausedSec: true,
      resolvedAt: true,
    },
  });

  const now = new Date();
  const out: SlaReport = {
    closedWithSla: 0,
    met: 0,
    metPercent: null,
    avgResolutionHours: null,
    openOverdue: 0,
    openAtRisk: 0,
    openPaused: 0,
    byType: [],
  };
  const byType = new Map<string, { closed: number; met: number; totalMs: number }>();
  let totalMs = 0;

  for (const r of rows) {
    const info = slaInfo(r, now);
    if (r.resolvedAt) {
      const ms = resolutionWorkingMs(r) ?? 0;
      const met = info.state === "met";
      out.closedWithSla += 1;
      if (met) out.met += 1;
      totalMs += ms;
      const g = byType.get(r.type) ?? { closed: 0, met: 0, totalMs: 0 };
      g.closed += 1;
      if (met) g.met += 1;
      g.totalMs += ms;
      byType.set(r.type, g);
    } else if (info.state === "breached") out.openOverdue += 1;
    else if (info.state === "atRisk") out.openAtRisk += 1;
    else if (info.state === "paused") out.openPaused += 1;
  }

  if (out.closedWithSla > 0) {
    out.metPercent = round1((out.met / out.closedWithSla) * 100);
    out.avgResolutionHours = round1(totalMs / out.closedWithSla / HOUR);
  }
  out.byType = [...byType.entries()]
    .map(([key, g]) => ({
      key,
      closed: g.closed,
      met: g.met,
      avgResolutionHours: g.closed ? round1(g.totalMs / g.closed / HOUR) : null,
    }))
    .sort((a, b) => b.closed - a.closed);
  return out;
}

interface Group {
  status?: string;
  priority?: string;
  type?: string;
  _count: { _all: number };
}

function toRecord(rows: Group[], field: "status" | "priority"): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const key = r[field];
    if (key) out[key] = r._count._all;
  }
  return out;
}

function toList(rows: Group[]): { key: string; count: number }[] {
  return rows
    .filter((r) => r.type)
    .map((r) => ({ key: r.type as string, count: r._count._all }))
    .sort((a, b) => b.count - a.count);
}

export async function getSummary(): Promise<ReportSummary> {
  const [
    ticketsTotal,
    ticketsByStatus,
    ticketsByPriority,
    ticketsByType,
    assetsTotal,
    assetsByStatus,
    assetsByType,
    bookingsUpcoming,
    sla,
  ] = await Promise.all([
    prisma.ticket.count(),
    prisma.ticket.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["priority"], _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.equipment.count(),
    prisma.equipment.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.equipment.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.booking.count({ where: { status: "confirmed", endTime: { gt: new Date() } } }),
    getSlaReport(),
  ]);

  return {
    tickets: {
      total: ticketsTotal as number,
      byStatus: toRecord(ticketsByStatus, "status"),
      byPriority: toRecord(ticketsByPriority, "priority"),
      byType: toList(ticketsByType),
    },
    assets: {
      total: assetsTotal as number,
      byStatus: toRecord(assetsByStatus, "status"),
      byType: toList(assetsByType),
    },
    bookings: {
      upcoming: bookingsUpcoming as number,
    },
    sla,
  };
}
