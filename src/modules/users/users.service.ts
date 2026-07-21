import type { Role, User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error.js";
import { can } from "../../auth/permissions.js";
import { mapUser, type UserDto } from "../../lib/serialize.js";

export interface UserUpdateInput {
  firstName: string;
  lastName: string;
  middleName?: string | null;
  fullName: string;
  role: Role;
  innerPhone?: string | null;
  mobilePhone?: string | null;
  room?: string | null;
  orgName?: string | null;
  orgDepartment?: string | null;
  orgDivision?: string | null;
  orgTitle?: string | null;
  canManageBookings?: boolean;
}

const opt = (v: string | null | undefined): string | null => v ?? null;

export async function listUsers(): Promise<UserDto[]> {
  const rows = await prisma.user.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
  return rows.map(mapUser);
}

export async function updateUser(
  actor: User,
  id: number,
  input: UserUpdateInput,
): Promise<UserDto> {
  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new AppError(404, "Пользователь не найден");

  // Флаг управления бронями вправе менять только тот, у кого есть booking.assignManagers.
  const mayAssignBooking = can(actor.role, "booking.assignManagers");

  const row = await prisma.user.update({
    where: { id },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      middleName: opt(input.middleName),
      fullName: input.fullName,
      role: input.role,
      innerPhone: opt(input.innerPhone),
      mobilePhone: opt(input.mobilePhone),
      room: opt(input.room),
      orgName: opt(input.orgName),
      orgDepartment: opt(input.orgDepartment),
      orgDivision: opt(input.orgDivision),
      orgTitle: opt(input.orgTitle),
      ...(mayAssignBooking && input.canManageBookings !== undefined
        ? { canManageBookings: input.canManageBookings }
        : {}),
    },
  });
  return mapUser(row);
}

export async function setBookingManager(id: number, value: boolean): Promise<UserDto> {
  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new AppError(404, "Пользователь не найден");
  const row = await prisma.user.update({ where: { id }, data: { canManageBookings: value } });
  return mapUser(row);
}
