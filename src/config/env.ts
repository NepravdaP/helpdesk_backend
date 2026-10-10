import "dotenv/config";
import { z } from "zod";

// Валидируем переменные окружения один раз при старте — дальше работаем с типами.
const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL обязателен"),

  JWT_SECRET: z.string().min(8, "JWT_SECRET слишком короткий"),
  JWT_EXPIRES_IN: z.string().default("8h"),

  LDAP_URL: z.string().default(""),
  LDAP_BIND_TEMPLATE: z.string().default("{username}"),
  LDAP_SEARCH_BASE: z.string().default(""),
  LDAP_SEARCH_FILTER: z.string().default("(sAMAccountName={username})"),
  LDAP_GROUP_SUPERADMIN: z.string().default(""),
  LDAP_GROUP_ADMIN: z.string().default(""),
  LDAP_GROUP_IT: z.string().default(""),
  LDAP_GROUP_BOOKING_MANAGERS: z.string().default(""),

  // Массовая синхронизация каталога (Конфигурация → LDAP → «Синхронизировать»).
  // Отдельная сервисная учётка с правом чтения каталога (bind по полному DN, не по шаблону логина).
  // Если не задана — синхронизация попробует анонимный bind (подходит только для тестовых каталогов).
  LDAP_SYNC_BIND_DN: z.string().default(""),
  LDAP_SYNC_BIND_PASSWORD: z.string().default(""),
  // Фильтр выборки всех учётных записей сотрудников (без {username} — это не поиск одного человека).
  LDAP_SYNC_FILTER: z.string().default("(&(objectClass=user)(objectCategory=person))"),

  // ── Рабочий график для SLA ──
  // Часы SLA считаются только в рабочее время. Для круглосуточной поддержки:
  // SLA_WORK_DAYS=1,2,3,4,5,6,7 SLA_WORK_START=00:00 SLA_WORK_END=24:00
  SLA_TIMEZONE: z.string().default("Europe/Moscow"),
  SLA_WORK_DAYS: z.string().default("1,2,3,4,5"), // ISO: 1 — понедельник … 7 — воскресенье
  SLA_WORK_START: z.string().default("09:00"),
  SLA_WORK_END: z.string().default("18:00"),

  AUTH_DEV_BYPASS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Некорректная конфигурация окружения:");
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
