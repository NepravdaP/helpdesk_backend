import { Router } from "express";
import { z } from "zod";
import { asyncHandler, AppError } from "../../middleware/error.js";
import { authenticate, requireCapability, requireUser } from "../../middleware/auth.js";
import * as svc from "./tickets.service.js";

export const ticketsRouter = Router();
ticketsRouter.use(authenticate);

const idParam = z.coerce.number().int().positive();
function parseId(raw: string | undefined): number {
  const r = idParam.safeParse(raw);
  if (!r.success) throw new AppError(400, "Некорректный идентификатор");
  return r.data;
}

const prioritySchema = z.enum(["low", "medium", "high"]);
const statusSchema = z.enum(["request", "open", "clarification", "closed"]);

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  type: z.string().min(1),
  priority: prioritySchema,
  equipmentId: z.number().int().positive().nullable().optional(),
  createdById: z.number().int().positive().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  type: z.string().min(1).optional(),
  priority: prioritySchema.optional(),
  equipmentId: z.number().int().positive().nullable().optional(),
});

// GET /api/tickets — список (свои или все, в зависимости от прав).
ticketsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await svc.listTickets(requireUser(req)));
  }),
);

// POST /api/tickets — создать заявку.
ticketsRouter.post(
  "/",
  requireCapability("tickets.create"),
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body);
    res.status(201).json(await svc.createTicket(requireUser(req), input));
  }),
);

// GET /api/tickets/:id — одна заявка.
ticketsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await svc.getTicket(requireUser(req), parseId(req.params.id)));
  }),
);

// PATCH /api/tickets/:id — редактирование полей.
ticketsRouter.patch(
  "/:id",
  requireCapability("tickets.edit"),
  asyncHandler(async (req, res) => {
    const input = updateSchema.parse(req.body);
    res.json(await svc.updateTicket(requireUser(req), parseId(req.params.id), input));
  }),
);

// PATCH /api/tickets/:id/status — смена статуса.
ticketsRouter.patch(
  "/:id/status",
  requireCapability("tickets.edit"),
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: statusSchema }).parse(req.body);
    res.json(await svc.setStatus(requireUser(req), parseId(req.params.id), status));
  }),
);

// PATCH /api/tickets/:id/assignee — назначить/снять исполнителя.
ticketsRouter.patch(
  "/:id/assignee",
  requireCapability("tickets.edit"),
  asyncHandler(async (req, res) => {
    const { assignedToId } = z
      .object({ assignedToId: z.number().int().positive().nullable() })
      .parse(req.body);
    res.json(await svc.setAssignee(requireUser(req), parseId(req.params.id), assignedToId));
  }),
);

// POST /api/tickets/:id/comments — добавить комментарий.
ticketsRouter.post(
  "/:id/comments",
  asyncHandler(async (req, res) => {
    const { text } = z.object({ text: z.string().min(1) }).parse(req.body);
    res.status(201).json(await svc.addComment(requireUser(req), parseId(req.params.id), text));
  }),
);

// GET /api/tickets/:id/activity — лента действий.
ticketsRouter.get(
  "/:id/activity",
  asyncHandler(async (req, res) => {
    res.json(await svc.listActivity(requireUser(req), parseId(req.params.id)));
  }),
);

// DELETE /api/tickets/:id — удалить заявку.
ticketsRouter.delete(
  "/:id",
  requireCapability("tickets.delete"),
  asyncHandler(async (req, res) => {
    await svc.deleteTicket(parseId(req.params.id));
    res.status(204).end();
  }),
);
