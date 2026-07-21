import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

// Прикладная ошибка с HTTP-статусом — бросаем её в сервисах/роутах.
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

// Оборачивает async-обработчик, чтобы ошибки попадали в errorHandler.
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "Маршрут не найден" });
}

// Единый обработчик ошибок: приводит всё к { error, ... } с корректным статусом.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Ошибка валидации", details: err.flatten() });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "Нарушение уникальности", code: err.code });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({ error: "Запись не найдена", code: err.code });
      return;
    }
    res.status(400).json({ error: "Ошибка базы данных", code: err.code });
    return;
  }
  console.error("Необработанная ошибка:", err);
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
}
