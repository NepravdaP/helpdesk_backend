import { PrismaClient } from "@prisma/client";

// Единый экземпляр Prisma на процесс (модульный монолит — одно подключение к БД).
export const prisma = new PrismaClient();
