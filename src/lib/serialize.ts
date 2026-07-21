import type { User } from "@prisma/client";

// Приводим записи БД к формам, которые ожидает фронтенд (src/types/index.ts).

export interface UserDto {
  id: number;
  userName: string;
  role: User["role"];
  firstName: string;
  lastName: string;
  middleName?: string;
  fullName: string;
  email: string;
  innerPhone?: string;
  mobilePhone?: string;
  room?: string;
  avatarUrl?: string | null;
  orgName?: string;
  orgDepartment?: string;
  orgDivision?: string;
  orgTitle?: string;
  canManageBookings?: boolean;
}

const opt = (v: string | null): string | undefined => v ?? undefined;

export function mapUser(u: User): UserDto {
  return {
    id: u.id,
    userName: u.userName,
    role: u.role,
    firstName: u.firstName,
    lastName: u.lastName,
    middleName: opt(u.middleName),
    fullName: u.fullName,
    email: u.email,
    innerPhone: opt(u.innerPhone),
    mobilePhone: opt(u.mobilePhone),
    room: opt(u.room),
    avatarUrl: u.avatarUrl,
    orgName: opt(u.orgName),
    orgDepartment: opt(u.orgDepartment),
    orgDivision: opt(u.orgDivision),
    orgTitle: opt(u.orgTitle),
    canManageBookings: u.canManageBookings,
  };
}
