import type { Equipment } from "@prisma/client";

export interface EquipmentDto {
  id: number;
  inventoryNo: string;
  type: string;
  model: string;
  serialNumber: string;
  status: Equipment["status"];
  location: string;
  warrantyUntil: string | null;
  assignedToId: number | null;
  attributes: Record<string, string>;
}

function toAttrs(value: unknown): Record<string, string> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, string>;
  }
  return {};
}

export function mapEquipment(e: Equipment): EquipmentDto {
  return {
    id: e.id,
    inventoryNo: e.inventoryNo,
    type: e.type,
    model: e.model,
    serialNumber: e.serialNumber,
    status: e.status,
    location: e.location,
    // Гарантия — дата без времени (YYYY-MM-DD), как ждёт форма.
    warrantyUntil: e.warrantyUntil ? e.warrantyUntil.toISOString().slice(0, 10) : null,
    assignedToId: e.assignedToId,
    attributes: toAttrs(e.attributes),
  };
}
