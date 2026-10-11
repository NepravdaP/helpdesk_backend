import type { Role, User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { signToken } from "../../lib/jwt.js";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error.js";
import { describeLdapError, ldapAuthenticate } from "../../services/ldap.js";
import { upsertUserFromLdap } from "../users/users.service.js";
import { mapUser, type UserDto } from "../../lib/serialize.js";
import { registerFailure, registerSuccess, retryAfterSeconds } from "../../lib/loginThrottle.js";

export interface LoginResult {
  token: string;
  user: UserDto;
}

// Коды ошибок входа. Фронтенд показывает по ним локализованный текст (RU/EN),
// поэтому message — только запасной вариант на русском.
export type LoginErrorCode =
  | "INVALID_LOGIN_FORMAT"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_LOCKED"
  | "ACCOUNT_DISABLED"
  | "PASSWORD_EXPIRED"
  | "DIRECTORY_UNAVAILABLE"
  | "TOO_MANY_ATTEMPTS";

// ——— Нормализация логина ———
// В министерстве логин по привычке вводят как «ORG\ivanov» или «ivanov@org.local».
// Приводим к sAMAccountName — шаблон bind и фильтр поиска ждут именно его.
export function normalizeUserName(raw: string): string {
  let u = raw.trim();
  const slash = u.lastIndexOf("\\");
  if (slash >= 0) u = u.slice(slash + 1);
  const at = u.indexOf("@");
  if (at > 0) u = u.slice(0, at);
  return u.trim();
}

// Символы, запрещённые в sAMAccountName, плюс спецсимволы LDAP-фильтра ( ) * \ —
// логин подставляется в фильтр поиска, поэтому это ещё и защита от LDAP-инъекции.
const VALID_USERNAME = /^[^"/\\[\]:;|=,+*?<>()\u0000-\u001f]{1,64}$/;

// ——— Классификация ошибок AD ———
// AD на код 49 (invalidCredentials) добавляет в сообщение подкод «data XXX»:
// по нему отличаем неверный пароль от заблокированной/отключённой учётки.
function classifyLdapError(e: unknown): LoginErrorCode {
  const err = e as { code?: number | string; message?: string };
  const msg = err?.message ?? String(e);

  if (err?.code === 49) {
    const sub = /data ([0-9a-f]{3,4})/i.exec(msg)?.[1]?.toLowerCase();
    switch (sub) {
      case "775":
        return "ACCOUNT_LOCKED";
      case "533": // отключена
      case "701": // срок действия учётки истёк
      case "530": // вход запрещён в это время
      case "531": // вход запрещён с этой рабочей станции
        return "ACCOUNT_DISABLED";
      case "532": // истёк срок пароля
      case "773": // требуется смена пароля при входе
        return "PASSWORD_EXPIRED";
      default:
        return "INVALID_CREDENTIALS"; // 52e и прочее
    }
  }
  // Учётка прошла bind, но не нашлась поиском — для пользователя это тоже «неверный логин».
  if (/Профиль не найден|Не указан пароль/.test(msg)) return "INVALID_CREDENTIALS";
  // Сеть, таймауты, TLS, не заполненные настройки — проблема на стороне сервиса, не пользователя.
  return "DIRECTORY_UNAVAILABLE";
}

const MESSAGES: Record<LoginErrorCode, string> = {
  INVALID_LOGIN_FORMAT: "Некорректный логин",
  INVALID_CREDENTIALS: "Неверный логин или пароль",
  ACCOUNT_LOCKED: "Учётная запись заблокирована. Обратитесь в ИТ-отдел",
  ACCOUNT_DISABLED: "Вход для этой учётной записи запрещён. Обратитесь в ИТ-отдел",
  PASSWORD_EXPIRED: "Срок действия пароля истёк. Смените пароль на рабочем компьютере и повторите вход",
  DIRECTORY_UNAVAILABLE: "Служба каталога недоступна. Попробуйте позже или обратитесь в ИТ-отдел",
  TOO_MANY_ATTEMPTS: "Слишком много неудачных попыток входа",
};

const STATUS: Record<LoginErrorCode, number> = {
  INVALID_LOGIN_FORMAT: 400,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_LOCKED: 403,
  ACCOUNT_DISABLED: 403,
  PASSWORD_EXPIRED: 403,
  DIRECTORY_UNAVAILABLE: 503,
  TOO_MANY_ATTEMPTS: 429,
};

function loginError(code: LoginErrorCode, extra?: string): AppError {
  return new AppError(STATUS[code], extra ? `${MESSAGES[code]}. ${extra}` : MESSAGES[code], code);
}

function minutes(seconds: number): string {
  return `Повторите через ${Math.max(1, Math.ceil(seconds / 60))} мин.`;
}

// ——— Вход ———
// ip нужен для ограничения попыток (см. lib/loginThrottle.ts).
export async function login(rawUserName: string, password: string, ip: string): Promise<LoginResult> {
  const userName = normalizeUserName(rawUserName);
  if (!VALID_USERNAME.test(userName)) throw loginError("INVALID_LOGIN_FORMAT");

  const wait = retryAfterSeconds(ip, userName);
  if (wait > 0) throw loginError("TOO_MANY_ATTEMPTS", minutes(wait));

  let user: User | null;

  if (env.AUTH_DEV_BYPASS) {
    // Режим разработки без AD: вход по userName из БД, пароль игнорируется.
    user = await prisma.user.findFirst({ where: { userName: { equals: userName, mode: "insensitive" } } });
    if (!user) {
      registerFailure(ip, userName);
      throw loginError("INVALID_CREDENTIALS");
    }
  } else {
    if (!password) throw new AppError(400, "Введите пароль", "INVALID_CREDENTIALS");
    let profile;
    try {
      profile = await ldapAuthenticate(userName, password);
    } catch (e) {
      const code = classifyLdapError(e);
      // Подробности — только в лог сервера: наружу текст ошибки каталога не отдаём.
      console.warn(`🔒 Вход отклонён [${code}] login=${userName} ip=${ip}: ${describeLdapError(e)}`);
      if (code === "INVALID_CREDENTIALS") {
        registerFailure(ip, userName);
        const left = retryAfterSeconds(ip, userName);
        if (left > 0) throw loginError("TOO_MANY_ATTEMPTS", minutes(left));
      }
      throw loginError(code);
    }
    // Апсёрт — общая функция с массовой синхронизацией (modules/users/users.service.ts).
    ({ user } = await upsertUserFromLdap(profile));
  }

  registerSuccess(ip, userName);
  const token = signToken({ sub: user.id, role: user.role, userName: user.userName });
  return { token, user: mapUser(user) };
}

// ——— Публичная конфигурация экрана входа ———
export interface DemoUser {
  userName: string;
  fullName: string;
  role: Role;
}

export interface AuthConfig {
  devBypass: boolean;
  // Только в демо-режиме: по одному пользователю на роль для кнопок быстрого входа.
  demoUsers: DemoUser[];
}

const DEMO_ROLES: Role[] = ["superadmin", "admin", "it", "employee"];

export async function getAuthConfig(): Promise<AuthConfig> {
  if (!env.AUTH_DEV_BYPASS) return { devBypass: false, demoUsers: [] };

  const found = await Promise.all(
    DEMO_ROLES.map((role) =>
      prisma.user.findFirst({
        where: { role },
        orderBy: { id: "asc" },
        select: { userName: true, fullName: true, role: true },
      }),
    ),
  );
  return { devBypass: true, demoUsers: found.filter((u): u is DemoUser => u !== null) };
}
