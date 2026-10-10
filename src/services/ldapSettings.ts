import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";

// Настройки LDAP, с которыми реально работают вход и синхронизация.
// Источник — строка ldap_settings (id = 1), заданная через веб-интерфейс;
// если её нет, используются переменные окружения LDAP_* из .env.
export interface LdapSettings {
  url: string;
  bindTemplate: string;
  searchBase: string;
  searchFilter: string;
  syncBindDn: string;
  syncBindPassword: string; // в открытом виде — только в памяти процесса
  syncFilter: string;
  groupSuperadmin: string;
  groupAdmin: string;
  groupIt: string;
  groupBookingManagers: string;
  tlsRejectUnauthorized: boolean;
  timeoutMs: number;
}

export type LdapSettingsSource = "db" | "env";

// То, что уходит на фронтенд: пароль никогда не возвращается, только признак его наличия.
export interface LdapSettingsDto extends Omit<LdapSettings, "syncBindPassword"> {
  hasSyncBindPassword: boolean;
  source: LdapSettingsSource;
  updatedAt: string | null;
  updatedBy: string | null;
  // AUTH_DEV_BYPASS=true: вход идёт без проверки пароля в AD — интерфейс об этом предупреждает.
  authDevBypass: boolean;
}

// Входные данные формы. syncBindPassword: undefined/"" — оставить прежний,
// clearSyncBindPassword: true — стереть.
export interface LdapSettingsInput extends Omit<LdapSettings, "syncBindPassword"> {
  syncBindPassword?: string;
  clearSyncBindPassword?: boolean;
}

interface Loaded {
  settings: LdapSettings;
  source: LdapSettingsSource;
  updatedAt: Date | null;
  updatedBy: string | null;
}

// ——— Шифрование пароля сервисной учётки ———
// Ключ выводится из JWT_SECRET: в БД пароль лежит не в открытом виде,
// а дамп базы без .env не раскрывает учётные данные к каталогу.
// ВНИМАНИЕ: при смене JWT_SECRET пароль придётся ввести в веб-интерфейсе заново.
const KEY = crypto.createHash("sha256").update(`ldap-settings:${env.JWT_SECRET}`).digest();

function encrypt(plain: string): string {
  if (!plain) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, data].map((b) => b.toString("base64")).join(".");
}

function decrypt(enc: string): string {
  if (!enc) return "";
  try {
    const [iv, tag, data] = enc.split(".").map((p) => Buffer.from(p, "base64"));
    if (!iv || !tag || !data) throw new Error("bad format");
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    console.warn("⚠ Не удалось расшифровать пароль LDAP (сменился JWT_SECRET?) — введите его заново в Конфигурации");
    return "";
  }
}

// ——— Значения по умолчанию из .env ———
export function ldapSettingsFromEnv(): LdapSettings {
  return {
    url: env.LDAP_URL,
    bindTemplate: env.LDAP_BIND_TEMPLATE,
    searchBase: env.LDAP_SEARCH_BASE,
    searchFilter: env.LDAP_SEARCH_FILTER,
    syncBindDn: env.LDAP_SYNC_BIND_DN,
    syncBindPassword: env.LDAP_SYNC_BIND_PASSWORD,
    syncFilter: env.LDAP_SYNC_FILTER,
    groupSuperadmin: env.LDAP_GROUP_SUPERADMIN,
    groupAdmin: env.LDAP_GROUP_ADMIN,
    groupIt: env.LDAP_GROUP_IT,
    groupBookingManagers: env.LDAP_GROUP_BOOKING_MANAGERS,
    tlsRejectUnauthorized: true,
    timeoutMs: 5000,
  };
}

// ——— Кэш: настройки читаются на каждом входе, поэтому держим их в памяти ———
let cache: Loaded | null = null;

function isMissingTable(e: unknown): boolean {
  // P2021 — таблицы ещё нет (не применили prisma db push). Не роняем вход, работаем от .env.
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2021";
}

async function load(): Promise<Loaded> {
  if (cache) return cache;
  let row = null;
  try {
    row = await prisma.ldapSettings.findUnique({ where: { id: 1 } });
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    console.warn("⚠ Таблица ldap_settings не найдена — используются LDAP_* из .env (выполните prisma db push)");
  }

  cache = row
    ? {
        settings: {
          url: row.url,
          bindTemplate: row.bindTemplate,
          searchBase: row.searchBase,
          searchFilter: row.searchFilter,
          syncBindDn: row.syncBindDn,
          syncBindPassword: decrypt(row.syncBindPasswordEnc),
          syncFilter: row.syncFilter,
          groupSuperadmin: row.groupSuperadmin,
          groupAdmin: row.groupAdmin,
          groupIt: row.groupIt,
          groupBookingManagers: row.groupBookingManagers,
          tlsRejectUnauthorized: row.tlsRejectUnauthorized,
          timeoutMs: row.timeoutMs,
        },
        source: "db",
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
      }
    : { settings: ldapSettingsFromEnv(), source: "env", updatedAt: null, updatedBy: null };
  return cache;
}

export async function getLdapSettings(): Promise<LdapSettings> {
  return (await load()).settings;
}

function toDto(l: Loaded): LdapSettingsDto {
  const { syncBindPassword, ...rest } = l.settings;
  return {
    ...rest,
    hasSyncBindPassword: syncBindPassword.length > 0,
    source: l.source,
    updatedAt: l.updatedAt ? l.updatedAt.toISOString() : null,
    updatedBy: l.updatedBy,
    authDevBypass: env.AUTH_DEV_BYPASS,
  };
}

export async function getLdapSettingsDto(): Promise<LdapSettingsDto> {
  return toDto(await load());
}

// Накладывает черновик из формы на текущие настройки (пароль — по правилам LdapSettingsInput).
// Используется и при сохранении, и при «Проверить подключение» до сохранения.
export function applyInput(base: LdapSettings, input: LdapSettingsInput): LdapSettings {
  const { syncBindPassword, clearSyncBindPassword, ...rest } = input;
  let password = base.syncBindPassword;
  if (clearSyncBindPassword) password = "";
  else if (syncBindPassword) password = syncBindPassword;
  return { ...rest, syncBindPassword: password };
}

export async function saveLdapSettings(input: LdapSettingsInput, updatedBy: string): Promise<LdapSettingsDto> {
  const next = applyInput(await getLdapSettings(), input);
  const { syncBindPassword, ...plain } = next;
  const data = { ...plain, syncBindPasswordEnc: encrypt(syncBindPassword), updatedBy };

  await prisma.ldapSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  cache = null;
  return getLdapSettingsDto();
}

// Удаляет настройки из БД — бэкенд снова работает от .env.
export async function resetLdapSettings(): Promise<LdapSettingsDto> {
  await prisma.ldapSettings.deleteMany({});
  cache = null;
  return getLdapSettingsDto();
}
