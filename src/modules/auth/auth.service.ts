import type { User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { signToken } from "../../lib/jwt.js";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error.js";
import { ldapAuthenticate } from "../../services/ldap.js";
import { mapUser, type UserDto } from "../../lib/serialize.js";

export interface LoginResult {
  token: string;
  user: UserDto;
}

// Синхронизирует профиль из AD в БД (создаёт или обновляет).
async function upsertFromLdap(p: Awaited<ReturnType<typeof ldapAuthenticate>>): Promise<User> {
  return prisma.user.upsert({
    where: { userName: p.userName },
    create: {
      userName: p.userName,
      ldapDn: p.dn,
      role: p.role,
      firstName: p.firstName,
      lastName: p.lastName,
      fullName: p.fullName,
      email: p.email,
      orgName: p.orgName,
      orgDepartment: p.orgDepartment,
      orgDivision: p.orgDivision,
      orgTitle: p.orgTitle,
      canManageBookings: p.canManageBookings,
    },
    update: {
      ldapDn: p.dn,
      role: p.role,
      firstName: p.firstName,
      lastName: p.lastName,
      fullName: p.fullName,
      email: p.email,
      orgName: p.orgName,
      orgDepartment: p.orgDepartment,
      orgDivision: p.orgDivision,
      orgTitle: p.orgTitle,
      // canManageBookings из AD не перетираем, если он назначается вручную суперадмином:
      // обновляем только когда группа явно настроена.
      ...(env.LDAP_GROUP_BOOKING_MANAGERS ? { canManageBookings: p.canManageBookings } : {}),
    },
  });
}

export async function login(userName: string, password: string): Promise<LoginResult> {
  let user: User | null;

  if (env.AUTH_DEV_BYPASS) {
    // Режим разработки без AD: вход по userName из БД, пароль игнорируется.
    user = await prisma.user.findUnique({ where: { userName } });
    if (!user) throw new AppError(401, "Пользователь не найден (dev-режим)");
  } else {
    if (!password) throw new AppError(400, "Не указан пароль");
    const profile = await ldapAuthenticate(userName, password).catch((e) => {
      throw new AppError(401, `Ошибка входа: ${e instanceof Error ? e.message : "LDAP"}`);
    });
    user = await upsertFromLdap(profile);
  }

  const token = signToken({ sub: user.id, role: user.role, userName: user.userName });
  return { token, user: mapUser(user) };
}
