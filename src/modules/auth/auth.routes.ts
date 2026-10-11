import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/error.js";
import { authenticate, requireUser } from "../../middleware/auth.js";
import { mapUser } from "../../lib/serialize.js";
import { getAuthConfig, login } from "./auth.service.js";

export const authRouter = Router();

const loginSchema = z.object({
  userName: z.string().min(1).max(256),
  password: z.string().max(512).default(""),
});

// GET /api/auth/config — публичные настройки экрана входа (до авторизации).
authRouter.get(
  "/config",
  asyncHandler(async (_req, res) => {
    res.json(await getAuthConfig());
  }),
);

// POST /api/auth/login — вход (LDAP или dev-bypass), возвращает { token, user }.
authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { userName, password } = loginSchema.parse(req.body);
    const result = await login(userName, password, req.ip ?? "unknown");
    res.json(result);
  }),
);

// GET /api/auth/me — текущий пользователь по токену.
authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(mapUser(requireUser(req)));
  }),
);
