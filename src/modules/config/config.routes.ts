import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/error.js";
import { authenticate, requireCapability } from "../../middleware/auth.js";
import * as svc from "./config.service.js";

export const configRouter = Router();
configRouter.use(authenticate);

const ticketType = z.object({ key: z.string().min(1), name: z.string().min(1), slaHours: z.number().int().nonnegative() });
const serviceSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  ticketTypes: z.array(ticketType),
});
const weightSchema = z.object({ title: z.string().min(1), weight: z.number().int() });
const attrSchema = z.object({ key: z.string().min(1), label: z.string().min(1) });
const assetTypeSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  attributes: z.array(attrSchema),
});

// GET /api/config — справочные данные (доступны всем аутентифицированным).
configRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await svc.getConfig());
  }),
);

// PUT /api/config/services — заменить сервисы и типы заявок.
configRouter.put(
  "/services",
  requireCapability("config.manage"),
  asyncHandler(async (req, res) => {
    const { services } = z.object({ services: z.array(serviceSchema) }).parse(req.body);
    res.json(await svc.replaceServices(services));
  }),
);

// PUT /api/config/position-weights — заменить веса должностей.
configRouter.put(
  "/position-weights",
  requireCapability("config.manage"),
  asyncHandler(async (req, res) => {
    const { weights } = z.object({ weights: z.array(weightSchema) }).parse(req.body);
    res.json(await svc.replaceWeights(weights));
  }),
);

// PUT /api/config/asset-types — заменить типы активов и их атрибуты.
configRouter.put(
  "/asset-types",
  requireCapability("config.manage"),
  asyncHandler(async (req, res) => {
    const { assetTypes } = z.object({ assetTypes: z.array(assetTypeSchema) }).parse(req.body);
    res.json(await svc.replaceAssetTypes(assetTypes));
  }),
);
