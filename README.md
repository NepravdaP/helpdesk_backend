# ИС управления IT-инфраструктурой — серверная часть

Модульный монолит: один процесс Node.js + Express, одна БД PostgreSQL через Prisma,
аутентификация через LDAP/Active Directory, авторизация по ролям (capability-модель).
Контракт API выверен по типам фронтенда (`src/types/index.ts`).

## Стек
Node.js 20 · Express 4 · TypeScript · Prisma ORM · PostgreSQL · ldapts · jsonwebtoken · zod

## Быстрый старт

```bash
npm install
cp .env.example .env          # отредактировать DATABASE_URL и JWT_SECRET
npx prisma generate           # сгенерировать клиент Prisma
npx prisma migrate dev --name init   # создать схему в БД
npm run db:seed               # залить демо-данные (как в моках фронта)
npm run dev                   # старт на http://localhost:4000/api
```

> Проверка типов: `npm run typecheck` (требует выполненного `prisma generate`).

## Режим без Active Directory

Пока нет доступа к контроллеру домена, в `.env` оставьте `AUTH_DEV_BYPASS=true`.
Тогда вход выполняется по `userName` из БД без обращения к LDAP (пароль игнорируется).
Логины из сида: `a.ivanov` (суперадмин), `m.zaytseva` (admin), `s.orlov`/`p.sidorov` (it),
`e.petrova`, `o.kuznetsova` и др. (employee). **В проде `AUTH_DEV_BYPASS=false`.**

Боевой режим: bind проверяет пароль, search достаёт профиль и `memberOf`,
роль выводится из групп AD (см. `LDAP_GROUP_*` в `.env`).

## Настройка LDAP через веб-интерфейс

Суперадмин настраивает подключение в разделе **Конфигурация → LDAP / Active Directory**:
адрес сервера (`ldap://` / `ldaps://`), шаблон входа, базу и фильтры поиска, сервисную
учётку для синхронизации и сопоставление групп AD с ролями.

- Настройки хранятся в таблице `ldap_settings` (одна строка). Пока её нет — используются `LDAP_*` из `.env`.
- Пароль сервисной учётки хранится зашифрованным (AES-256-GCM, ключ выводится из `JWT_SECRET`)
  и никогда не отдаётся в API. При смене `JWT_SECRET` пароль нужно ввести заново.
- Кнопка «Проверить подключение» проверяет черновик до сохранения (bind → пробный поиск);
  «Проверить вход» — вход конкретного пользователя и роль, которую он получит.
- «Сбросить к .env» удаляет строку из БД.
- Если ошибочные настройки закрыли вход: временно `AUTH_DEV_BYPASS=true` и перезапуск бэкенда,
  либо `DELETE FROM ldap_settings;` в БД.

Эндпоинты (право `config.manage`): `GET/PUT/DELETE /api/config/ldap`, `POST /api/config/ldap/test`.

## Структура

```
prisma/
  schema.prisma        модель БД (контракт)
  seed.ts              демо-данные из моков фронта
src/
  config/env.ts        валидация переменных окружения (zod)
  lib/                 prisma-клиент, jwt, сериализация DTO
  auth/permissions.ts  зеркало модели прав фронтенда
  middleware/          authenticate, requireCapability, обработка ошибок
  services/ldap.ts     bind/search + сопоставление групп → роль
  modules/auth/        вход, /me
  modules/tickets/     HelpDesk: роуты, сервис, мапперы
  app.ts, server.ts    сборка приложения и запуск
```

## Эндпоинты (готово в этой версии)

Аутентификация:
- `POST /api/auth/login` `{ userName, password }` → `{ token, user }`
- `GET  /api/auth/me` → текущий пользователь (Bearer-токен)

HelpDesk (Bearer-токен обязателен):
- `GET    /api/tickets` — список (свои или все, по правам) → `TicketRow[]`
- `POST   /api/tickets` — создать (право `tickets.create`)
- `GET    /api/tickets/:id` — одна заявка
- `PATCH  /api/tickets/:id` — редактировать (`tickets.edit`)
- `PATCH  /api/tickets/:id/status` `{ status }` (`tickets.edit`)
- `PATCH  /api/tickets/:id/assignee` `{ assignedToId }` (`tickets.edit`)
- `POST   /api/tickets/:id/comments` `{ text }`
- `GET    /api/tickets/:id/activity` → `ActivityEntry[]`
- `DELETE /api/tickets/:id` (`tickets.delete`)

Инвентаризация (Bearer-токен обязателен):
- `GET    /api/assets` — список техники (`assets.view`)
- `POST   /api/assets` — добавить актив (`assets.create`)
- `PATCH  /api/assets/:id` — редактировать (`assets.edit`)
- `DELETE /api/assets/:id` — удалить, со снятием ссылок у заявок (`assets.delete`)

Пользователи / справочник (Bearer-токен обязателен):
- `GET    /api/users` — список (доступен всем аутентифицированным)
- `PATCH  /api/users/:id` — редактировать профиль (`users.edit`); флаг `canManageBookings` применяется только при праве `booking.assignManagers`
- `PATCH  /api/users/:id/booking-manager` — назначить управляющего бронями (`booking.assignManagers`)

Бронирование (Bearer-токен обязателен):
- `GET    /api/booking/rooms` — переговорные (`booking.view`)
- `GET    /api/booking/bookings?from&to&roomId` — брони с фильтром (`booking.view`)
- `POST   /api/booking/bookings` — создать (транзакция против пересечений; за другого — `canManageBookings`)
- `PATCH  /api/booking/bookings/:id/cancel` — отменить (свою или любую при `canManageBookings`)

Конфигуратор:
- `GET    /api/config` — справочные данные (все аутентифицированные)
- `PUT    /api/config/services` — заменить сервисы/типы (`config.manage`)
- `PUT    /api/config/position-weights` — заменить веса должностей (`config.manage`)
- `PUT    /api/config/asset-types` — заменить типы активов (`config.manage`)

Отчёты:
- `GET    /api/reports/summary` — сводка по заявкам/технике/броням (`reports.view`)

Опции для выпадающих списков:
- `GET    /api/assets/options` — лёгкий список техники (все аутентифицированные)

Служебное: `GET /api/health`.

## Состав модулей
HelpDesk · Инвентаризация · Пользователи/Справочник · Бронирование ·
Конфигуратор · Отчёты — все на едином модульном монолите с общими БД-транзакциями.
```

## SLA (сроки решения заявок)

- SLA задаётся у типа заявки (Конфигурация → Сервисы), в **рабочих часах**.
- При создании заявки SLA типа копируется в заявку (`slaHours`) и вычисляется срок `dueAt`.
  Правка SLA в конфигурации действует только на новые заявки; смена типа у заявки пересчитывает её срок.
- Часы идут только в рабочее время: `SLA_TIMEZONE`, `SLA_WORK_DAYS`, `SLA_WORK_START`, `SLA_WORK_END` в `.env`
  (по умолчанию пн–пт 09:00–18:00, Europe/Moscow). Для круглосуточной поддержки: `1,2,3,4,5,6,7` и `00:00`–`24:00`.
- Статус «На уточнении» ставит SLA на паузу: время ожидания заявителя прибавляется к сроку.
- При закрытии фиксируется `resolvedAt`; переоткрытие его сбрасывает, срок остаётся прежним.
- Состояния: в срок / под угрозой (осталось ≤ 25%) / на паузе / просрочена / выполнено в срок.
- Заявки без рассчитанного SLA (`slaHours = null` — созданные до появления SLA или сидом)
  досчитываются при старте бэкенда по истории смены статусов.
- Логика: `src/services/slaCalendar.ts` (рабочий календарь), `src/services/sla.ts` (правила SLA).
