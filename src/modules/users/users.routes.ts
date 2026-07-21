import { Router } from "express";
import { z } from "zod";
import { asyncHandler, AppError } from "../../middleware/error.js";
import { authenticate, requireCapability, requireUser } from "../../middleware/auth.js";
import * as svc from "./users.service.js";

export const usersRouter = Router();
usersRouter.use(authenticate);

const idParam = z.coerce.number().int().positive();
function parseId(raw: string | undefined): number {
  const r = idParam.safeParse(raw);
  if (!r.success) throw new AppError(400, "Некорректный идентификатор");
  return r.data;
}

const optStr = z.string().nullable().optional();
const updateSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  middleName: optStr,
  fullName: z.string().min(1),
  role: z.enum(["employee", "it", "admin", "superadmin"]),
  innerPhone: optStr,
  mobilePhone: optStr,
  room: optStr,
  orgName: optStr,
  orgDepartment: optStr,
  orgDivision: optStr,
  orgTitle: optStr,
  canManageBookings: z.boolean().optional(),
});

// GET /api/users — список (справочник доступен всем аутентифицированным).
usersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await svc.listUsers());
  }),
);

// PATCH /api/users/:id — редактировать профиль (users.edit).
usersRouter.patch(
  "/:id",
  requireCapability("users.edit"),
  asyncHandler(async (req, res) => {
    const input = updateSchema.parse(req.body);
    res.json(await svc.updateUser(requireUser(req), parseId(req.params.id), input));
  }),
);

// PATCH /api/users/:id/booking-manager — назначить управляющего бронями (booking.assignManagers).
usersRouter.patch(
  "/:id/booking-manager",
  requireCapability("booking.assignManagers"),
  asyncHandler(async (req, res) => {
    const { value } = z.object({ value: z.boolean() }).parse(req.body);
    res.json(await svc.setBookingManager(parseId(req.params.id), value));
  }),
);
