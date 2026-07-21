import type { TicketPriority, TicketStatus, User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error.js";
import { can } from "../../auth/permissions.js";
import {
  activityInclude,
  mapActivity,
  mapTicketRow,
  ticketInclude,
  type ActivityEntryDto,
  type TicketRowDto,
} from "./tickets.mapper.js";

export interface CreateTicketInput {
  title: string;
  description: string;
  type: string;
  priority: TicketPriority;
  equipmentId?: number | null;
  createdById?: number; // заявитель; по умолчанию — текущий пользователь
}

export interface UpdateTicketInput {
  title?: string;
  description?: string;
  type?: string;
  priority?: TicketPriority;
  equipmentId?: number | null;
}

// Видит ли пользователь конкретную заявку: либо все, либо свою (как заявитель/исполнитель).
function canAccess(user: User, t: { createdById: number; assignedToId: number | null }): boolean {
  if (can(user.role, "tickets.viewAll")) return true;
  return t.createdById === user.id || t.assignedToId === user.id;
}

async function rowById(id: number): Promise<TicketRowDto> {
  const t = await prisma.ticket.findUnique({ where: { id }, include: ticketInclude });
  if (!t) throw new AppError(404, "Заявка не найдена");
  return mapTicketRow(t);
}

export async function listTickets(user: User): Promise<TicketRowDto[]> {
  const where = can(user.role, "tickets.viewAll")
    ? {}
    : { OR: [{ createdById: user.id }, { assignedToId: user.id }] };
  const tickets = await prisma.ticket.findMany({
    where,
    include: ticketInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return tickets.map(mapTicketRow);
}

export async function getTicket(user: User, id: number): Promise<TicketRowDto> {
  const t = await prisma.ticket.findUnique({ where: { id }, include: ticketInclude });
  if (!t) throw new AppError(404, "Заявка не найдена");
  if (!canAccess(user, t)) throw new AppError(403, "Нет доступа к заявке");
  return mapTicketRow(t);
}

export async function createTicket(user: User, input: CreateTicketInput): Promise<TicketRowDto> {
  // Заявитель по умолчанию — текущий пользователь. Указать другого можно
  // только с правом видеть все заявки (IT/админ/суперадмин) — «создание от имени».
  let creatorId = user.id;
  if (input.createdById && input.createdById !== user.id) {
    if (!can(user.role, "tickets.viewAll")) {
      throw new AppError(403, "Нельзя создавать заявку от имени другого сотрудника");
    }
    const exists = await prisma.user.findUnique({
      where: { id: input.createdById },
      select: { id: true },
    });
    if (!exists) throw new AppError(400, "Заявитель не найден");
    creatorId = input.createdById;
  }

  const created = await prisma.ticket.create({
    data: {
      title: input.title,
      description: input.description,
      type: input.type,
      priority: input.priority,
      status: "request",
      createdById: creatorId,
      equipmentId: input.equipmentId ?? null,
      activity: {
        create: { kind: "created", authorId: creatorId },
      },
    },
  });
  return rowById(created.id);
}

async function assertExists(id: number): Promise<{ createdById: number; assignedToId: number | null }> {
  const t = await prisma.ticket.findUnique({
    where: { id },
    select: { createdById: true, assignedToId: true },
  });
  if (!t) throw new AppError(404, "Заявка не найдена");
  return t;
}

export async function updateTicket(
  user: User,
  id: number,
  input: UpdateTicketInput,
): Promise<TicketRowDto> {
  await assertExists(id);
  await prisma.ticket.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.equipmentId !== undefined ? { equipmentId: input.equipmentId } : {}),
      activity: { create: { kind: "edited", authorId: user.id } },
    },
  });
  return rowById(id);
}

export async function setStatus(
  user: User,
  id: number,
  status: TicketStatus,
): Promise<TicketRowDto> {
  await assertExists(id);
  await prisma.ticket.update({
    where: { id },
    data: { status, activity: { create: { kind: "status", status, authorId: user.id } } },
  });
  return rowById(id);
}

export async function setAssignee(
  user: User,
  id: number,
  assignedToId: number | null,
): Promise<TicketRowDto> {
  await assertExists(id);
  if (assignedToId !== null) {
    const exists = await prisma.user.findUnique({ where: { id: assignedToId }, select: { id: true } });
    if (!exists) throw new AppError(400, "Назначаемый пользователь не найден");
  }
  await prisma.ticket.update({
    where: { id },
    data: {
      assignedToId,
      activity: { create: { kind: "assignee", assigneeId: assignedToId, authorId: user.id } },
    },
  });
  return rowById(id);
}

export async function addComment(
  user: User,
  id: number,
  text: string,
): Promise<ActivityEntryDto> {
  const t = await assertExists(id);
  if (!canAccess(user, t)) throw new AppError(403, "Нет доступа к заявке");
  const entry = await prisma.activityEntry.create({
    data: { ticketId: id, kind: "comment", comment: text, authorId: user.id },
    include: activityInclude,
  });
  // Касаемся updatedAt заявки.
  await prisma.ticket.update({ where: { id }, data: { updatedAt: new Date() } });
  return mapActivity(entry);
}

export async function deleteTicket(id: number): Promise<void> {
  await assertExists(id);
  await prisma.ticket.delete({ where: { id } });
}

export async function listActivity(user: User, id: number): Promise<ActivityEntryDto[]> {
  const t = await assertExists(id);
  if (!canAccess(user, t)) throw new AppError(403, "Нет доступа к заявке");
  const entries = await prisma.activityEntry.findMany({
    where: { ticketId: id },
    include: activityInclude,
    orderBy: { id: "asc" },
  });
  return entries.map(mapActivity);
}
