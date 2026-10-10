import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/error.js";
import { authenticate, requireCapability } from "../../middleware/auth.js";
import * as svc from "./config.service.js";
import {
  applyInput,
  getLdapSettings,
  getLdapSettingsDto,
  resetLdapSettings,
  saveLdapSettings,
} from "../../services/ldapSettings.js";
import { ldapTestConnection } from "../../services/ldap.js";
import { requireUser } from "../../middleware/auth.js";

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

// ——— LDAP / Active Directory (настраивается суперадмином из веб-интерфейса) ———

const ldapSettingsSchema = z.object({
  url: z
    .string()
    .trim()
    .regex(/^ldaps?:\/\/[^\s]+$/i, "Адрес должен начинаться с ldap:// или ldaps://"),
  bindTemplate: z.string().trim().min(1).includes("{username}", { message: "Шаблон входа должен содержать {username}" }),
  searchBase: z.string().trim().min(1, "Укажите базу поиска"),
  searchFilter: z.string().trim().min(1).includes("{username}", { message: "Фильтр поиска должен содержать {username}" }),
  syncBindDn: z.string().trim(),
  syncBindPassword: z.string().optional(),
  clearSyncBindPassword: z.boolean().optional(),
  syncFilter: z.string().trim().min(1, "Укажите фильтр синхронизации"),
  groupSuperadmin: z.string().trim(),
  groupAdmin: z.string().trim(),
  groupIt: z.string().trim(),
  groupBookingManagers: z.string().trim(),
  tlsRejectUnauthorized: z.boolean(),
  timeoutMs: z.number().int().min(1000).max(60000),
});

// GET /api/config/ldap — текущие настройки (без пароля) и их источник: БД или .env.
configRouter.get(
  "/ldap",
  requireCapability("config.manage"),
  asyncHandler(async (_req, res) => {
    res.json(await getLdapSettingsDto());
  }),
);

// PUT /api/config/ldap — сохранить настройки в БД (с этого момента .env для LDAP не используется).
configRouter.put(
  "/ldap",
  requireCapability("config.manage"),
  asyncHandler(async (req, res) => {
    const input = ldapSettingsSchema.parse(req.body);
    res.json(await saveLdapSettings(input, requireUser(req).userName));
  }),
);

// DELETE /api/config/ldap — удалить настройки из БД и вернуться к значениям из .env.
configRouter.delete(
  "/ldap",
  requireCapability("config.manage"),
  asyncHandler(async (_req, res) => {
    res.json(await resetLdapSettings());
  }),
);

// POST /api/config/ldap/test — проверить подключение.
// settings — черновик из формы (проверка до сохранения); без него проверяются действующие настройки.
// testUser — необязательная проверка входа конкретного пользователя и вычисленной роли.
configRouter.post(
  "/ldap/test",
  requireCapability("config.manage"),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        settings: ldapSettingsSchema.optional(),
        testUser: z.object({ userName: z.string().trim().min(1), password: z.string().min(1) }).optional(),
      })
      .parse(req.body ?? {});
    const current = await getLdapSettings();
    const settings = body.settings ? applyInput(current, body.settings) : current;
    res.json(await ldapTestConnection(settings, body.testUser));
  }),
);
