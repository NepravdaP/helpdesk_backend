import type { Prisma } from "@prisma/client";

// Include для заявки со связанными именами (как ждёт TicketRow на фронте).
export const ticketInclude = {
  createdBy: { select: { fullName: true } },
  assignedTo: { select: { fullName: true } },
} satisfies Prisma.TicketInclude;

type TicketWithNames = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

export interface TicketRowDto {
  id: number;
  title: string;
  description: string;
  type: string;
  priority: TicketWithNames["priority"];
  status: TicketWithNames["status"];
  createdById: number;
  assignedToId: number | null;
  equipmentId: number | null;
  createdAt: string;
  updatedAt: string;
  requesterName: string;
  assigneeName: string | null;
}

export function mapTicketRow(t: TicketWithNames): TicketRowDto {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    type: t.type,
    priority: t.priority,
    status: t.status,
    createdById: t.createdById,
    assignedToId: t.assignedToId,
    equipmentId: t.equipmentId,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    requesterName: t.createdBy.fullName,
    assigneeName: t.assignedTo?.fullName ?? null,
  };
}

// Include для записи ленты действий.
export const activityInclude = {
  author: { select: { fullName: true } },
  assignee: { select: { fullName: true } },
} satisfies Prisma.ActivityEntryInclude;

type ActivityWithNames = Prisma.ActivityEntryGetPayload<{ include: typeof activityInclude }>;

export interface ActivityEntryDto {
  id: number;
  kind: ActivityWithNames["kind"];
  at: string;
  author: string;
  status?: ActivityWithNames["status"];
  assignee?: string | null;
  comment?: string;
}

export function mapActivity(a: ActivityWithNames): ActivityEntryDto {
  return {
    id: a.id,
    kind: a.kind,
    at: a.createdAt.toISOString(),
    author: a.author.fullName,
    status: a.status ?? undefined,
    assignee: a.kind === "assignee" ? (a.assignee?.fullName ?? null) : undefined,
    comment: a.comment ?? undefined,
  };
}
