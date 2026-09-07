import { Router } from "express";
import { asyncHandler } from "../../middleware/error.js";
import { authenticate, requireCapability } from "../../middleware/auth.js";
import * as svc from "./reports.service.js";

export const reportsRouter = Router();
reportsRouter.use(authenticate);

// GET /api/reports/summary — сводка по заявкам, технике и бронированию.
reportsRouter.get(
  "/summary",
  requireCapability("reports.view"),
  asyncHandler(async (_req, res) => {
    res.json(await svc.getSummary());
  }),
);
