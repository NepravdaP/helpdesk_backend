import { Router } from "express";
import { z } from "zod";
import { asyncHandler, AppError } from "../../middleware/error.js";
import { authenticate, requireCapability } from "../../middleware/auth.js";
import * as svc from "./assets.service.js";

export const assetsRouter = Router();
assetsRouter.use(authenticate);

const idParam = z.coerce.number().int().positive();
function parseId(raw: string | undefined): number {
  const r = idParam.safeParse(raw);
  if (!r.success) throw new AppError(400, "Некорректный идентификатор");
  return r.data;
}

const assetSchema = z.object({
  inventoryNo: z.string().min(1),
  type: z.string().min(1),
  model: z.string().min(1),
  serialNumber: z.string().default(""),
  status: z.enum(["in_use", "repair", "decommissioned"]),
  location: z.string().default(""),
  warrantyUntil: z.string().nullable().default(null),
  assignedToId: z.number().int().positive().nullable().default(null),
  attributes: z.record(z.string(), z.string()).default({}),
});

// GET /api/assets — список техники.
assetsRouter.get(
  "/",
  requireCapability("assets.view"),
  asyncHandler(async (_req, res) => {
    res.json(await svc.listAssets());
  }),
);

// POST /api/assets — добавить актив.
assetsRouter.post(
  "/",
  requireCapability("assets.create"),
  asyncHandler(async (req, res) => {
    const input = assetSchema.parse(req.body);
    res.status(201).json(await svc.createAsset(input));
  }),
);

// PATCH /api/assets/:id — редактировать актив.
assetsRouter.patch(
  "/:id",
  requireCapability("assets.edit"),
  asyncHandler(async (req, res) => {
    const input = assetSchema.parse(req.body);
    res.json(await svc.updateAsset(parseId(req.params.id), input));
  }),
);

// DELETE /api/assets/:id — удалить актив.
assetsRouter.delete(
  "/:id",
  requireCapability("assets.delete"),
  asyncHandler(async (req, res) => {
    await svc.deleteAsset(parseId(req.params.id));
    res.status(204).end();
  }),
);
