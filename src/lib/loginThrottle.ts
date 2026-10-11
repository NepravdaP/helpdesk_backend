import { env } from "../config/env.js";

// Ограничение неудачных попыток входа (in-memory, на процесс).
// Зачем: перебор паролей через портал иначе упрётся в политику блокировки AD
// и заблокирует учётную запись сотрудника в домене — защищаем каталог заранее.
// Считаем по двум ключам: «IP + логин» (подбор пароля к одной учётке)
// и «IP» целиком (перебор логинов с одного адреса).

interface Bucket {
  fails: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const IP_MULTIPLIER = 4; // на один IP допускаем в 4 раза больше неудач, чем на одну учётку

function windowMs(): number {
  return env.LOGIN_LOCK_MINUTES * 60_000;
}

function keys(ip: string, userName: string): Array<{ key: string; limit: number }> {
  return [
    { key: `u:${ip}|${userName.toLowerCase()}`, limit: env.LOGIN_MAX_ATTEMPTS },
    { key: `ip:${ip}`, limit: env.LOGIN_MAX_ATTEMPTS * IP_MULTIPLIER },
  ];
}

function sweep(now: number): void {
  // Дешёвая уборка протухших записей, чтобы Map не рос бесконечно.
  if (buckets.size < 1000) return;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

// Сколько секунд ещё ждать; 0 — вход разрешён.
export function retryAfterSeconds(ip: string, userName: string): number {
  if (env.LOGIN_MAX_ATTEMPTS <= 0) return 0; // 0 — ограничение выключено
  const now = Date.now();
  let wait = 0;
  for (const { key, limit } of keys(ip, userName)) {
    const b = buckets.get(key);
    if (!b) continue;
    if (b.resetAt <= now) {
      buckets.delete(key);
      continue;
    }
    if (b.fails >= limit) wait = Math.max(wait, Math.ceil((b.resetAt - now) / 1000));
  }
  return wait;
}

export function registerFailure(ip: string, userName: string): void {
  if (env.LOGIN_MAX_ATTEMPTS <= 0) return;
  const now = Date.now();
  sweep(now);
  for (const { key } of keys(ip, userName)) {
    const b = buckets.get(key);
    if (!b || b.resetAt <= now) buckets.set(key, { fails: 1, resetAt: now + windowMs() });
    else b.fails += 1;
  }
}

// Успешный вход снимает счётчик по учётке (счётчик IP оставляем — он про перебор логинов).
export function registerSuccess(ip: string, userName: string): void {
  buckets.delete(`u:${ip}|${userName.toLowerCase()}`);
}
