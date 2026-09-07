import type { User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { signToken } from "../../lib/jwt.js";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error.js";
import { ldapAuthenticate } from "../../services/ldap.js";
import { upsertUserFromLdap } from "../users/users.service.js";
import { mapUser, type UserDto } from "../../lib/serialize.js";

export interface LoginResult {
  token: string;
  user: UserDto;
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
    // Апсёрт — общая функция с массовой синхронизацией (modules/users/users.service.ts).
    ({ user } = await upsertUserFromLdap(profile));
  }

  const token = signToken({ sub: user.id, role: user.role, userName: user.userName });
  return { token, user: mapUser(user) };
}
