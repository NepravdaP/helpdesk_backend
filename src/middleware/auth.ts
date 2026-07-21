import type { NextFunction, Request, Response } from "express";
import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { verifyToken } from "../lib/jwt.js";
import { AppError } from "./error.js";
import { can, type Capability } from "../auth/permissions.js";

// Расширяем Request: после authenticate в req.user лежит профиль из БД.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

// Проверяет JWT и подгружает актуальный профиль пользователя.
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractToken(req);
    if (!token) throw new AppError(401, "Требуется авторизация");
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new AppError(401, "Пользователь не найден");
    req.user = user;
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError(401, "Недействительный токен"));
  }
}

// Гарантирует, что пользователь аутентифицирован (для использования внутри обработчиков).
export function requireUser(req: Request): User {
  if (!req.user) throw new AppError(401, "Требуется авторизация");
  return req.user;
}

// Гард по способности (capability) из модели прав.
export function requireCapability(capability: Capability) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = requireUser(req);
    if (!can(user.role, capability)) {
      return next(new AppError(403, "Недостаточно прав"));
    }
    next();
  };
}
