import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";
import type { Role } from "@prisma/client";

// Полезная нагрузка токена: достаточно id и роли, остальное берём из БД при /me.
export interface JwtPayload {
  sub: number; // user id
  role: Role;
  userName: string;
}

export function signToken(payload: JwtPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === "string") throw new Error("Некорректный токен");
  const { sub, role, userName } = decoded as Record<string, unknown>;
  if (typeof sub !== "number" || typeof role !== "string" || typeof userName !== "string") {
    throw new Error("Некорректная полезная нагрузка токена");
  }
  return { sub, role: role as Role, userName };
}
