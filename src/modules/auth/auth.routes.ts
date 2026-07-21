import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/error.js";
import { authenticate, requireUser } from "../../middleware/auth.js";
import { mapUser } from "../../lib/serialize.js";
import { login } from "./auth.service.js";

export const authRouter = Router();

const loginSchema = z.object({
  userName: z.string().min(1),
  password: z.string().default(""),
});

// POST /api/auth/login — вход (LDAP или dev-bypass), возвращает { token, user }.
authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { userName, password } = loginSchema.parse(req.body);
    const result = await login(userName, password);
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
