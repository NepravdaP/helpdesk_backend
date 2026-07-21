import type { Role } from "@prisma/client";

// Зеркало модели прав фронтенда (src/auth/permissions.ts).
// ВАЖНО: держать в синхроне с фронтом — здесь источник истины для сервера.

export type Capability =
  | "tickets.viewAll"
  | "tickets.filter"
  | "tickets.create"
  | "tickets.edit"
  | "tickets.delete"
  | "booking.view"
  | "booking.manage"
  | "booking.assignManagers"
  | "assets.view"
  | "assets.create"
  | "assets.edit"
  | "assets.delete"
  | "users.view"
  | "users.edit"
  | "directory.view"
  | "dashboard.own"
  | "dashboard.full"
  | "reports.view"
  | "config.manage";

export const ALL_CAPABILITIES: Capability[] = [
  "tickets.viewAll",
  "tickets.filter",
  "tickets.create",
  "tickets.edit",
  "tickets.delete",
  "booking.view",
  "booking.manage",
  "booking.assignManagers",
  "assets.view",
  "assets.create",
  "assets.edit",
  "assets.delete",
  "users.view",
  "users.edit",
  "directory.view",
  "dashboard.own",
  "dashboard.full",
  "reports.view",
  "config.manage",
];

const IT: Capability[] = [
  "tickets.viewAll",
  "tickets.filter",
  "tickets.create",
  "tickets.edit",
  "booking.view",
  "assets.view",
  "assets.edit",
  "users.view",
  "users.edit",
  "directory.view",
  "dashboard.own",
];

const ADMIN: Capability[] = [
  ...IT,
  "tickets.delete",
  "assets.create",
  "assets.delete",
  "booking.assignManagers",
  "reports.view",
  "dashboard.full",
];

export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  employee: ["tickets.create", "booking.view", "directory.view"],
  it: IT,
  admin: ADMIN,
  superadmin: ALL_CAPABILITIES,
};

// booking.manage ролью не выдаётся: его даёт пер-юзерный флаг canManageBookings.
export function can(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}
