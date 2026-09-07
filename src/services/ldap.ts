import { Client } from "ldapts";
import type { Role } from "@prisma/client";
import { env } from "../config/env.js";

// Результат проверки учётных данных в каталоге.
export interface LdapProfile {
  userName: string;
  dn: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  middleName?: string;
  orgName?: string;
  orgDepartment?: string;
  orgDivision?: string;
  orgTitle?: string;
  groups: string[];
  role: Role;
  canManageBookings: boolean;
}

// Атрибуты, которые нужны и при входе одного пользователя, и при массовой синхронизации.
const PROFILE_ATTRIBUTES = [
  "distinguishedName",
  "sAMAccountName",
  "displayName",
  "givenName",
  "sn",
  "middleName",
  "mail",
  "company",
  "department",
  "division",
  "title",
  "memberOf",
];

function firstString(v: unknown): string | undefined {
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined;
  return typeof v === "string" ? v : undefined;
}

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return typeof v === "string" ? [v] : [];
}

// Выводит роль из групп AD по настройкам сопоставления (старшая роль выигрывает).
export function roleFromGroups(groups: string[]): Role {
  const has = (needle: string) =>
    needle.length > 0 && groups.some((g) => g.toLowerCase().includes(needle.toLowerCase()));
  if (has(env.LDAP_GROUP_SUPERADMIN)) return "superadmin";
  if (has(env.LDAP_GROUP_ADMIN)) return "admin";
  if (has(env.LDAP_GROUP_IT)) return "it";
  return "employee";
}

function bookingManagerFromGroups(groups: string[]): boolean {
  const needle = env.LDAP_GROUP_BOOKING_MANAGERS;
  return needle.length > 0 && groups.some((g) => g.toLowerCase().includes(needle.toLowerCase()));
}

// Превращает запись каталога в профиль. fallbackUserName подставляется, если
// sAMAccountName вдруг не вернулся (не должно случаться, но на всякий случай).
function mapEntryToProfile(entry: Record<string, unknown>, fallbackUserName: string): LdapProfile {
  const groups = asArray(entry["memberOf"]);
  const lastName = firstString(entry["sn"]) ?? "";
  const firstName = firstString(entry["givenName"]) ?? "";
  const fullName = firstString(entry["displayName"]) ?? `${lastName} ${firstName}`.trim();
  const userName = firstString(entry["sAMAccountName"]) ?? fallbackUserName;

  return {
    userName,
    dn: firstString(entry["distinguishedName"]) ?? String(entry.dn),
    fullName,
    firstName,
    lastName,
    middleName: firstString(entry["middleName"]),
    email: firstString(entry["mail"]) ?? `${userName}@unknown.local`,
    orgName: firstString(entry["company"]),
    orgDepartment: firstString(entry["department"]),
    orgDivision: firstString(entry["division"]),
    orgTitle: firstString(entry["title"]),
    groups,
    role: roleFromGroups(groups),
    canManageBookings: bookingManagerFromGroups(groups),
  };
}

// Проверяет логин/пароль в LDAP и возвращает профиль. Бросает при неудаче.
export async function ldapAuthenticate(userName: string, password: string): Promise<LdapProfile> {
  const client = new Client({ url: env.LDAP_URL });
  const bindDn = env.LDAP_BIND_TEMPLATE.replace("{username}", userName);

  try {
    // 1) bind проверяет пароль
    await client.bind(bindDn, password);

    // 2) search по фильтру забирает атрибуты профиля и группы
    const filter = env.LDAP_SEARCH_FILTER.replace("{username}", userName);
    const { searchEntries } = await client.search(env.LDAP_SEARCH_BASE, {
      scope: "sub",
      filter,
      attributes: PROFILE_ATTRIBUTES,
    });

    const entry = searchEntries[0];
    if (!entry) throw new Error("Профиль не найден в каталоге");

    return mapEntryToProfile(entry as Record<string, unknown>, userName);
  } finally {
    await client.unbind().catch(() => undefined);
  }
}

export interface LdapSyncScanResult {
  profiles: LdapProfile[];
  skipped: number; // записи без sAMAccountName или почты — не могут быть сопоставлены с моделью User
}

// Обходит весь каталог (постранично) и возвращает профили всех найденных учётных записей.
// Используется массовой синхронизацией — в отличие от ldapAuthenticate, здесь нет пароля
// конкретного пользователя, поэтому bind выполняется сервисной учётной записью
// (LDAP_SYNC_BIND_DN/LDAP_SYNC_BIND_PASSWORD) либо анонимно, если она не задана.
export async function ldapSyncAll(): Promise<LdapSyncScanResult> {
  const client = new Client({ url: env.LDAP_URL });

  try {
    if (env.LDAP_SYNC_BIND_DN) {
      await client.bind(env.LDAP_SYNC_BIND_DN, env.LDAP_SYNC_BIND_PASSWORD);
    }
    // если сервисная учётка не настроена — пробуем без bind (анонимный поиск)

    const { searchEntries } = await client.search(env.LDAP_SEARCH_BASE, {
      scope: "sub",
      filter: env.LDAP_SYNC_FILTER,
      paged: true, // ldapts сам пройдёт все страницы и соберёт результат целиком
      attributes: PROFILE_ATTRIBUTES,
    });

    const profiles: LdapProfile[] = [];
    let skipped = 0;
    for (const raw of searchEntries) {
      const entry = raw as Record<string, unknown>;
      const userName = firstString(entry["sAMAccountName"]);
      if (!userName) {
        skipped += 1;
        continue;
      }
      profiles.push(mapEntryToProfile(entry, userName));
    }
    return { profiles, skipped };
  } finally {
    await client.unbind().catch(() => undefined);
  }
}
