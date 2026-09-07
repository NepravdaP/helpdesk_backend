import { Router } from "express";
import { z } from "zod";
import { asyncHandler, AppError } from "../../middleware/error.js";
import { authenticate, requireCapability, requireUser } from "../../middleware/auth.js";
import * as svc from "./booking.service.js";

export const bookingRouter = Router();
bookingRouter.use(authenticate);

const idParam = z.coerce.number().int().positive();
function parseId(raw: string | undefined): number {
  const r = idParam.safeParse(raw);
  if (!r.success) throw new AppError(400, "Некорректный идентификатор");
  return r.data;
}

// GET /api/booking/rooms — переговорные.
bookingRouter.get(
  "/rooms",
  requireCapability("booking.view"),
  asyncHandler(async (_req, res) => {
    res.json(await svc.listRooms());
  }),
);

// GET /api/booking/bookings?from&to&roomId — брони (с фильтром по диапазону).
bookingRouter.get(
  "/bookings",
  requireCapability("booking.view"),
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        roomId: z.coerce.number().int().positive().optional(),
      })
      .parse(req.query);
    res.json(await svc.listBookings(q));
  }),
);

// POST /api/booking/bookings — создать бронь (за себя; за другого — управляющий бронями).
bookingRouter.post(
  "/bookings",
  requireCapability("booking.view"),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        roomId: z.number().int().positive(),
        startTime: z.string().min(1),
        endTime: z.string().min(1),
        purpose: z.string().min(1),
        userId: z.number().int().positive().optional(),
      })
      .parse(req.body);
    res.status(201).json(await svc.createBooking(requireUser(req), input));
  }),
);

// PATCH /api/booking/bookings/:id/cancel — отменить бронь.
bookingRouter.patch(
  "/bookings/:id/cancel",
  requireCapability("booking.view"),
  asyncHandler(async (req, res) => {
    res.json(await svc.cancelBooking(requireUser(req), parseId(req.params.id)));
  }),
);
