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
