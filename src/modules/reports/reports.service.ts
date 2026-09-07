import { prisma } from "../../lib/prisma.js";

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
  ] = await Promise.all([
    prisma.ticket.count(),
    prisma.ticket.groupBy({ by: ["status"], _count: { _all: true } }) as Promise<Group[]>,
    prisma.ticket.groupBy({ by: ["priority"], _count: { _all: true } }) as Promise<Group[]>,
    prisma.ticket.groupBy({ by: ["type"], _count: { _all: true } }) as Promise<Group[]>,
    prisma.equipment.count(),
    prisma.equipment.groupBy({ by: ["status"], _count: { _all: true } }) as Promise<Group[]>,
    prisma.equipment.groupBy({ by: ["type"], _count: { _all: true } }) as Promise<Group[]>,
    prisma.booking.count({ where: { status: "confirmed", endTime: { gt: new Date() } } }),
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
  };
}
