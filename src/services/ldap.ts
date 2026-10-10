import { Client } from "ldapts";
import type { Role } from "@prisma/client";
import { getLdapSettings, type LdapSettings } from "./ldapSettings.js";

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
  // Настроена ли группа управляющих бронями: если нет — флаг назначается вручную и не перетирается.
  bookingGroupConfigured: boolean;
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

function inGroup(groups: string[], needle: string): boolean {
  return needle.length > 0 && groups.some((g) => g.toLowerCase().includes(needle.toLowerCase()));
}

// Выводит роль из групп AD по настройкам сопоставления (старшая роль выигрывает).
export function roleFromGroups(groups: string[], s: LdapSettings): Role {
  if (inGroup(groups, s.groupSuperadmin)) return "superadmin";
  if (inGroup(groups, s.groupAdmin)) return "admin";
  if (inGroup(groups, s.groupIt)) return "it";
  return "employee";
}

function createClient(s: LdapSettings): Client {
  // ВАЖНО: ldapts включает TLS при любом переданном tlsOptions, даже для ldap://,
  // поэтому передаём их только для ldaps://.
  const secure = /^ldaps:\/\//i.test(s.url);
  return new Client({
    url: s.url,
    timeout: s.timeoutMs,
    connectTimeout: s.timeoutMs,
    ...(secure ? { tlsOptions: { rejectUnauthorized: s.tlsRejectUnauthorized } } : {}),
  });
}

export function assertConfigured(s: LdapSettings): void {
  if (!s.url || !s.searchBase) {
    throw new Error("LDAP не настроен: укажите адрес сервера и базу поиска в Конфигурации → LDAP");
  }
}

// Превращает запись каталога в профиль. fallbackUserName подставляется, если
// sAMAccountName вдруг не вернулся (не должно случаться, но на всякий случай).
function mapEntryToProfile(entry: Record<string, unknown>, fallbackUserName: string, s: LdapSettings): LdapProfile {
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
    role: roleFromGroups(groups, s),
    canManageBookings: inGroup(groups, s.groupBookingManagers),
    bookingGroupConfigured: s.groupBookingManagers.length > 0,
  };
}

// Проверяет логин/пароль в LDAP и возвращает профиль. Бросает при неудаче.
// settings можно передать явно (проверка черновика настроек), иначе берутся действующие.
export async function ldapAuthenticate(
  userName: string,
  password: string,
  settings?: LdapSettings,
): Promise<LdapProfile> {
  const s = settings ?? (await getLdapSettings());
  assertConfigured(s);
  // Пустой пароль в AD означает «анонимный bind» и формально проходит — запрещаем явно.
  if (!password) throw new Error("Не указан пароль");

  const client = createClient(s);
  const bindDn = s.bindTemplate.replace("{username}", userName);

  try {
    // 1) bind проверяет пароль
    await client.bind(bindDn, password);

    // 2) search по фильтру забирает атрибуты профиля и группы
    const filter = s.searchFilter.replace("{username}", userName);
    const { searchEntries } = await client.search(s.searchBase, {
      scope: "sub",
      filter,
      attributes: PROFILE_ATTRIBUTES,
    });

    const entry = searchEntries[0];
    if (!entry) throw new Error("Профиль не найден в каталоге");

    return mapEntryToProfile(entry as Record<string, unknown>, userName, s);
  } finally {
    await client.unbind().catch(() => undefined);
  }
}

export interface LdapSyncScanResult {
  profiles: LdapProfile[];
  skipped: number; // записи без sAMAccountName — не могут быть сопоставлены с моделью User
}

// Обходит весь каталог (постранично) и возвращает профили всех найденных учётных записей.
// Bind выполняется сервисной учётной записью из настроек, либо анонимно, если она не задана.
export async function ldapSyncAll(): Promise<LdapSyncScanResult> {
  const s = await getLdapSettings();
  assertConfigured(s);
  const client = createClient(s);

  try {
    if (s.syncBindDn) await client.bind(s.syncBindDn, s.syncBindPassword);

    const { searchEntries } = await client.search(s.searchBase, {
      scope: "sub",
      filter: s.syncFilter,
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
      profiles.push(mapEntryToProfile(entry, userName, s));
    }
    return { profiles, skipped };
  } finally {
    await client.unbind().catch(() => undefined);
  }
}

// ——— Проверка подключения (кнопка «Проверить» в веб-интерфейсе) ———

export type LdapTestStepKey = "serviceBind" | "search" | "userAuth";

export interface LdapTestStep {
  key: LdapTestStepKey;
  ok: boolean;
  message: string;
  durationMs: number;
}

export interface LdapTestResult {
  ok: boolean;
  steps: LdapTestStep[];
  user?: {
    userName: string;
    fullName: string;
    email: string;
    orgTitle?: string;
    role: Role;
    canManageBookings: boolean;
    groupsCount: number;
  };
}

const SAMPLE_LIMIT = 50;

// Переводит типичные ошибки ldapts/сети в понятное сообщение.
export function describeLdapError(e: unknown): string {
  const err = e as { code?: number | string; message?: string };
  const raw = err?.message ?? String(e);
  switch (err?.code) {
    case 49:
      return `Неверный DN/логин или пароль (${raw})`;
    case 32:
      return `Объект не найден — проверьте базу поиска (${raw})`;
    case 50:
      return `Недостаточно прав у учётной записи (${raw})`;
    case "ECONNREFUSED":
      return `Сервер отклонил подключение — проверьте адрес и порт (${raw})`;
    case "ENOTFOUND":
      return `Не удалось разрешить имя сервера (${raw})`;
    case "ETIMEDOUT":
      return `Сервер не ответил вовремя (${raw})`;
  }
  if (/timeout/i.test(raw)) return `Сервер не ответил вовремя (${raw})`;
  if (/certificate|self.signed|CERT_/i.test(raw)) {
    return `Ошибка TLS-сертификата — для самоподписанного сертификата отключите его проверку (${raw})`;
  }
  return raw;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: unknown; durationMs: number }> {
  const start = Date.now();
  try {
    const value = await fn();
    return { value, durationMs: Date.now() - start };
  } catch (error) {
    return { error, durationMs: Date.now() - start };
  }
}

// 1) подключение и bind сервисной учёткой (или анонимно),
// 2) пробный поиск по фильтру синхронизации,
// 3) опционально — вход тестового пользователя и вычисленная по группам роль.
export async function ldapTestConnection(
  s: LdapSettings,
  testUser?: { userName: string; password: string },
): Promise<LdapTestResult> {
  const steps: LdapTestStep[] = [];
  try {
    assertConfigured(s);
  } catch (e) {
    steps.push({ key: "serviceBind", ok: false, durationMs: 0, message: describeLdapError(e) });
    return { ok: false, steps };
  }
  const client = createClient(s);

  try {
    const bind = await timed(async () => {
      if (s.syncBindDn) await client.bind(s.syncBindDn, s.syncBindPassword);
    });
    steps.push({
      key: "serviceBind",
      ok: !bind.error,
      durationMs: bind.durationMs,
      message: bind.error
        ? describeLdapError(bind.error)
        : s.syncBindDn
          ? `Подключение к ${s.url} установлено, вход выполнен как ${s.syncBindDn}`
          : `Подключение к ${s.url}: сервисная учётка не задана, используется анонимный доступ`,
    });

    if (!bind.error) {
      const search = await timed(() =>
        client.search(s.searchBase, {
          scope: "sub",
          filter: s.syncFilter,
          sizeLimit: SAMPLE_LIMIT,
          attributes: ["sAMAccountName"],
        }),
      );
      const sizeLimitHit = (search.error as { code?: number } | undefined)?.code === 4;
      const count = search.value?.searchEntries.length ?? 0;
      steps.push({
        key: "search",
        ok: sizeLimitHit || (!search.error && count > 0),
        durationMs: search.durationMs,
        message: sizeLimitHit
          ? `Поиск работает: найдено не менее ${SAMPLE_LIMIT} учётных записей`
          : search.error
            ? describeLdapError(search.error)
            : count > 0
              ? `Поиск работает: найдено учётных записей — ${count}`
              : "Поиск выполнен, но ничего не найдено — проверьте базу поиска и фильтр синхронизации",
      });
    }
  } finally {
    await client.unbind().catch(() => undefined);
  }

  let user: LdapTestResult["user"];
  if (testUser) {
    const auth = await timed(() => ldapAuthenticate(testUser.userName, testUser.password, s));
    const p = auth.value;
    steps.push({
      key: "userAuth",
      ok: !auth.error,
      durationMs: auth.durationMs,
      message: p ? `Вход выполнен: ${p.fullName} (${p.email})` : describeLdapError(auth.error),
    });
    if (p) {
      user = {
        userName: p.userName,
        fullName: p.fullName,
        email: p.email,
        orgTitle: p.orgTitle,
        role: p.role,
        canManageBookings: p.canManageBookings,
        groupsCount: p.groups.length,
      };
    }
  }

  return { ok: steps.every((st) => st.ok), steps, user };
}
