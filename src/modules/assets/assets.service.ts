import type { EquipmentStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error.js";
import { mapEquipment, type EquipmentDto } from "./assets.mapper.js";

export interface AssetInput {
  inventoryNo: string;
  type: string;
  model: string;
  serialNumber: string;
  status: EquipmentStatus;
  location: string;
  warrantyUntil: string | null;
  assignedToId: number | null;
  attributes: Record<string, string>;
}

function toData(input: AssetInput) {
  return {
    inventoryNo: input.inventoryNo,
    type: input.type,
    model: input.model,
    serialNumber: input.serialNumber,
    status: input.status,
    location: input.location,
    warrantyUntil: input.warrantyUntil ? new Date(input.warrantyUntil) : null,
    assignedToId: input.assignedToId,
    attributes: input.attributes,
  };
}

export async function listAssets(): Promise<EquipmentDto[]> {
  const rows = await prisma.equipment.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return rows.map(mapEquipment);
}

// Лёгкий список для выпадающих списков (доступен всем аутентифицированным).
export async function listAssetOptions(): Promise<{ value: number; label: string }[]> {
  const rows = (await prisma.equipment.findMany({
    orderBy: { inventoryNo: "asc" },
    select: { id: true, model: true, location: true },
  })) as { id: number; model: string; location: string }[];
  return rows.map((e) => ({ value: e.id, label: `${e.model} — ${e.location}` }));
}

export async function createAsset(input: AssetInput): Promise<EquipmentDto> {
  const row = await prisma.equipment.create({ data: toData(input) });
  return mapEquipment(row);
}

export async function updateAsset(id: number, input: AssetInput): Promise<EquipmentDto> {
  const exists = await prisma.equipment.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new AppError(404, "Актив не найден");
  const row = await prisma.equipment.update({ where: { id }, data: toData(input) });
  return mapEquipment(row);
}

export async function deleteAsset(id: number): Promise<void> {
  const exists = await prisma.equipment.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new AppError(404, "Актив не найден");
  // Снимаем ссылку с заявок, затем удаляем актив (FK на tickets.equipmentId).
  await prisma.$transaction([
    prisma.ticket.updateMany({ where: { equipmentId: id }, data: { equipmentId: null } }),
    prisma.equipment.delete({ where: { id } }),
  ]);
}
