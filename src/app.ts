import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { ticketsRouter } from "./modules/tickets/tickets.routes.js";
import { assetsRouter } from "./modules/assets/assets.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { bookingRouter } from "./modules/booking/booking.routes.js";
import { configRouter } from "./modules/config/config.routes.js";
import { reportsRouter } from "./modules/reports/reports.routes.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json());

  // Проверка живости.
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  // Модули.
  app.use("/api/auth", authRouter);
  app.use("/api/tickets", ticketsRouter);
  app.use("/api/assets", assetsRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/booking", bookingRouter);
  app.use("/api/config", configRouter);
  app.use("/api/reports", reportsRouter);

  // 404 и обработчик ошибок — в конце.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
