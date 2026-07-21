import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`🚀 Сервер запущен: http://localhost:${env.PORT}/api`);
  if (env.AUTH_DEV_BYPASS) {
    console.log("⚠️  AUTH_DEV_BYPASS=true — вход без LDAP (только для разработки)");
  }
});

async function shutdown(signal: string) {
  console.log(`\n${signal} получен — завершаю работу…`);
  server.close(() => undefined);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
