import { prisma } from "../../lib/prisma.js";

// Формы конфигурации совпадают с ConfigContext фронтенда.
export interface TicketTypeConfig {
  key: string;
  name: string;
  slaHours: number;
}
export interface ServiceConfig {
  key: string;
  name: string;
  ticketTypes: TicketTypeConfig[];
}
export interface PositionWeightConfig {
  title: string;
  weight: number;
}
export interface AssetAttributeConfig {
  key: string;
  label: string;
}
export interface AssetTypeConfig {
  key: string;
  name: string;
  attributes: AssetAttributeConfig[];
}
export interface FullConfig {
  services: ServiceConfig[];
  weights: PositionWeightConfig[];
  assetTypes: AssetTypeConfig[];
}

export async function getConfig(): Promise<FullConfig> {
  const [services, weights, assetTypes] = await Promise.all([
    prisma.service.findMany({
      orderBy: { sortOrder: "asc" },
      include: { ticketTypes: { orderBy: { id: "asc" } } },
    }),
    prisma.positionWeight.findMany({ orderBy: { weight: "desc" } }),
    prisma.assetType.findMany({
      orderBy: { id: "asc" },
      include: { attributes: { orderBy: { id: "asc" } } },
    }),
  ]);

  return {
    services: (services as ServiceRow[]).map((s) => ({
      key: s.key,
      name: s.name,
      ticketTypes: s.ticketTypes.map((t) => ({ key: t.key, name: t.name, slaHours: t.slaHours })),
    })),
    weights: (weights as PositionWeightConfig[]).map((w) => ({ title: w.title, weight: w.weight })),
    assetTypes: (assetTypes as AssetTypeRow[]).map((a) => ({
      key: a.key,
      name: a.name,
      attributes: a.attributes.map((at) => ({ key: at.key, label: at.label })),
    })),
  };
}

interface ServiceRow {
  key: string;
  name: string;
  ticketTypes: { key: string; name: string; slaHours: number }[];
}
interface AssetTypeRow {
  key: string;
  name: string;
  attributes: { key: string; label: string }[];
}

// Замена секций целиком (как setServices/setWeights/setAssetTypes на фронте).

export async function replaceServices(services: ServiceConfig[]): Promise<FullConfig> {
  await prisma.$transaction(async (tx: typeof prisma) => {
    await tx.ticketType.deleteMany();
    await tx.service.deleteMany();
    for (let i = 0; i < services.length; i++) {
      const s = services[i]!;
      await tx.service.create({
        data: {
          key: s.key,
          name: s.name,
          sortOrder: i,
          ticketTypes: {
            create: s.ticketTypes.map((t) => ({ key: t.key, name: t.name, slaHours: t.slaHours })),
          },
        },
      });
    }
  });
  return getConfig();
}

export async function replaceWeights(weights: PositionWeightConfig[]): Promise<FullConfig> {
  await prisma.$transaction(async (tx: typeof prisma) => {
    await tx.positionWeight.deleteMany();
    if (weights.length > 0) {
      await tx.positionWeight.createMany({
        data: weights.map((w) => ({ title: w.title, weight: w.weight })),
      });
    }
  });
  return getConfig();
}

export async function replaceAssetTypes(assetTypes: AssetTypeConfig[]): Promise<FullConfig> {
  await prisma.$transaction(async (tx: typeof prisma) => {
    await tx.assetTypeAttribute.deleteMany();
    await tx.assetType.deleteMany();
    for (const a of assetTypes) {
      await tx.assetType.create({
        data: {
          key: a.key,
          name: a.name,
          attributes: { create: a.attributes.map((at) => ({ key: at.key, label: at.label })) },
        },
      });
    }
  });
  return getConfig();
}
