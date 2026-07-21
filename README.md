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

Служебное: `GET /api/health`.

## Дальше по плану
Модули по тому же паттерну: Бронирование (с транзакцией против пересечений),
Конфигуратор (суперадмин), Отчёты.
```
