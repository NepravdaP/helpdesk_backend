import type { BookingStatus, User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error.js";

export interface RoomDto {
  id: number;
  name: string;
  capacity: number;
  equipment: string[];
}
export interface BookingDto {
  id: number;
  roomId: number;
  userId: number;
  startTime: string;
  endTime: string;
  purpose: string;
  status: BookingStatus;
}

interface RoomRow {
  id: number;
  name: string;
  capacity: number;
  equipment: string[];
}
interface BookingRow {
  id: number;
  roomId: number;
  userId: number;
  startTime: Date;
  endTime: Date;
  purpose: string;
  status: BookingStatus;
}

const mapRoom = (r: RoomRow): RoomDto => ({
  id: r.id,
  name: r.name,
  capacity: r.capacity,
  equipment: r.equipment,
});
const mapBooking = (b: BookingRow): BookingDto => ({
  id: b.id,
  roomId: b.roomId,
  userId: b.userId,
  startTime: b.startTime.toISOString(),
  endTime: b.endTime.toISOString(),
  purpose: b.purpose,
  status: b.status,
});

export interface BookingFilter {
  from?: string;
  to?: string;
  roomId?: number;
}
export interface CreateBookingInput {
  roomId: number;
  startTime: string;
  endTime: string;
  purpose: string;
  userId?: number;
}

export async function listRooms(): Promise<RoomDto[]> {
  const rows = (await prisma.room.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  })) as RoomRow[];
  return rows.map(mapRoom);
}

export async function listBookings(filter: BookingFilter): Promise<BookingDto[]> {
  const where: Record<string, unknown> = {};
  if (filter.roomId) where.roomId = filter.roomId;
  if (filter.from) where.endTime = { gt: new Date(filter.from) };
  if (filter.to) where.startTime = { lt: new Date(filter.to) };
  const rows = (await prisma.booking.findMany({
    where,
    orderBy: { startTime: "asc" },
  })) as BookingRow[];
  return rows.map(mapBooking);
}

export async function createBooking(user: User, input: CreateBookingInput): Promise<BookingDto> {
  const start = new Date(input.startTime);
  const end = new Date(input.endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new AppError(400, "Некорректные даты брони");
  }
  if (end <= start) throw new AppError(400, "Окончание должно быть позже начала");

  // Бронь за другого сотрудника — только для управляющего бронями.
  let ownerId = user.id;
  if (input.userId && input.userId !== user.id) {
    if (!user.canManageBookings) throw new AppError(403, "Нельзя бронировать за другого сотрудника");
    ownerId = input.userId;
  }

  // Транзакция: проверяем пересечение и создаём бронь атомарно.
  const created = await prisma.$transaction(async (tx: typeof prisma) => {
    const room = await tx.room.findUnique({ where: { id: input.roomId }, select: { id: true } });
    if (!room) throw new AppError(404, "Переговорная не найдена");

    const conflict = await tx.booking.findFirst({
      where: {
        roomId: input.roomId,
        status: "confirmed",
        startTime: { lt: end },
        endTime: { gt: start },
      },
      select: { id: true },
    });
    if (conflict) throw new AppError(409, "Время пересекается с другой бронью этой переговорной");

    return tx.booking.create({
      data: {
        roomId: input.roomId,
        userId: ownerId,
        startTime: start,
        endTime: end,
        purpose: input.purpose,
        status: "confirmed",
      },
    });
  });

  return mapBooking(created as BookingRow);
}

export async function cancelBooking(user: User, id: number): Promise<BookingDto> {
  const existing = (await prisma.booking.findUnique({ where: { id } })) as BookingRow | null;
  if (!existing) throw new AppError(404, "Бронь не найдена");
  if (existing.userId !== user.id && !user.canManageBookings) {
    throw new AppError(403, "Можно отменять только свои брони");
  }
  const updated = (await prisma.booking.update({
    where: { id },
    data: { status: "cancelled" },
  })) as BookingRow;
  return mapBooking(updated);
}
