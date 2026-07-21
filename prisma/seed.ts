import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

// ─── Пользователи (из src/data/mock.ts) ───
const users: Prisma.UserCreateManyInput[] = [
  { id: 1, userName: "a.ivanov", role: "it", firstName: "Алексей", lastName: "Иванов", middleName: "Сергеевич", fullName: "Иванов Алексей Сергеевич", email: "a.ivanov@org.local", innerPhone: "1201", mobilePhone: "+7 916 100-10-01", room: "к. 312", orgName: "Минстрой", orgDepartment: "Отдел ИТ", orgDivision: "Управление цифрового развития", orgTitle: "Главный специалист-эксперт" },
  { id: 2, userName: "s.orlov", role: "it", firstName: "Сергей", lastName: "Орлов", middleName: "Петрович", fullName: "Орлов Сергей Петрович", email: "s.orlov@org.local", innerPhone: "1202", mobilePhone: "+7 916 100-10-02", room: "к. 312", orgName: "Минстрой", orgDepartment: "Отдел ИТ", orgDivision: "Управление цифрового развития", orgTitle: "Ведущий специалист-эксперт" },
  { id: 3, userName: "o.kuznetsova", role: "employee", firstName: "Ольга", lastName: "Кузнецова", middleName: "Ивановна", fullName: "Кузнецова Ольга Ивановна", email: "o.kuznetsova@org.local", innerPhone: "1310", mobilePhone: "+7 916 100-10-03", room: "к. 210", orgName: "Минстрой", orgDepartment: "Бухгалтерия", orgDivision: "Финансовое управление", orgTitle: "Консультант" },
  { id: 4, userName: "p.sidorov", role: "it", firstName: "Павел", lastName: "Сидоров", middleName: "Андреевич", fullName: "Сидоров Павел Андреевич", email: "p.sidorov@org.local", innerPhone: "1203", mobilePhone: "+7 916 100-10-04", room: "к. 312", orgName: "Минстрой", orgDepartment: "Отдел ИТ", orgDivision: "Управление цифрового развития", orgTitle: "Специалист-эксперт" },
  { id: 5, userName: "e.petrova", role: "employee", firstName: "Елена", lastName: "Петрова", middleName: "Викторовна", fullName: "Петрова Елена Викторовна", email: "e.petrova@org.local", innerPhone: "1405", mobilePhone: "+7 916 100-10-05", room: "к. 304", orgName: "Минстрой", orgDepartment: "Канцелярия", orgDivision: "Административное управление", orgTitle: "Специалист 1 разряда" },
  { id: 6, userName: "d.volkov", role: "employee", firstName: "Дмитрий", lastName: "Волков", middleName: "Олегович", fullName: "Волков Дмитрий Олегович", email: "d.volkov@org.local", innerPhone: "1322", mobilePhone: "+7 916 100-10-06", room: "к. 118", orgName: "Минстрой", orgDepartment: "Юридический отдел", orgDivision: "Правовое управление", orgTitle: "Советник" },
  { id: 7, userName: "k.smirnov", role: "employee", firstName: "Кирилл", lastName: "Смирнов", middleName: "Александрович", fullName: "Смирнов Кирилл Александрович", email: "k.smirnov@org.local", innerPhone: "1225", mobilePhone: "+7 916 100-10-07", room: "к. 225", orgName: "Минстрой", orgDepartment: "Отдел закупок", orgDivision: "Управление обеспечения", orgTitle: "Ведущий консультант" },
  { id: 8, userName: "m.zaytseva", role: "admin", firstName: "Марина", lastName: "Зайцева", middleName: "Николаевна", fullName: "Зайцева Марина Николаевна", email: "m.zaytseva@org.local", innerPhone: "1401", mobilePhone: "+7 916 100-10-08", room: "к. 401", orgName: "Минстрой", orgDepartment: "Отдел ИТ", orgDivision: "Управление цифрового развития", orgTitle: "Начальник отдела" },
  { id: 9, userName: "n.morozova", role: "employee", firstName: "Наталья", lastName: "Морозова", middleName: "Павловна", fullName: "Морозова Наталья Павловна", email: "n.morozova@org.local", innerPhone: "1317", mobilePhone: "+7 916 100-10-09", room: "к. 117", orgName: "Минстрой", orgDepartment: "Бухгалтерия", orgDivision: "Финансовое управление", orgTitle: "Главный специалист-эксперт" },
];

// Назначим суперадмина для конфигуратора (в моках его нет — берём IT-админа).
const SUPERADMIN_USERNAME = "a.ivanov";

const equipment: Prisma.EquipmentCreateManyInput[] = [
  { id: 21, inventoryNo: "ПР-000021", type: "printer", model: "Принтер HP LaserJet M404", serialNumber: "CNB1F2A304", status: "in_use", location: "каб. 304", warrantyUntil: new Date("2026-09-01"), assignedToId: 5, attributes: { macAddress: "00:1B:44:11:3A:B7", ipAddress: "10.0.30.21" } },
  { id: 58, inventoryNo: "ММ-000058", type: "multimedia", model: "Монитор Dell U2419", serialNumber: "DLU2419-058", status: "repair", location: "АРМ-58", warrantyUntil: new Date("2025-12-15"), assignedToId: 7, attributes: {} },
  { id: 12, inventoryNo: "ММ-000012", type: "multimedia", model: "Проектор Epson EB-2247U", serialNumber: "EPB2247-012", status: "in_use", location: "переговорная", warrantyUntil: null, assignedToId: null, attributes: {} },
  { id: 73, inventoryNo: "АРМ-000073", type: "workstation", model: "Системный блок Lenovo M70", serialNumber: "LNVM70-073", status: "in_use", location: "АРМ-73", warrantyUntil: new Date("2027-03-01"), assignedToId: 6, attributes: { ipAddress: "10.0.73.10" } },
  { id: 31, inventoryNo: "ПР-000031", type: "printer", model: "МФУ Kyocera M2540", serialNumber: "KYM2540-031", status: "in_use", location: "каб. 210", warrantyUntil: new Date("2026-05-20"), assignedToId: 3, attributes: { macAddress: "00:1B:44:11:3A:C2", ipAddress: "10.0.21.31" } },
  { id: 64, inventoryNo: "АРМ-000064", type: "workstation", model: "Ноутбук HP ProBook 450", serialNumber: "HPPB450-064", status: "in_use", location: "АРМ-64", warrantyUntil: new Date("2026-11-10"), assignedToId: 1, attributes: { ipAddress: "10.0.64.12" } },
  { id: 19, inventoryNo: "АРМ-000019", type: "workstation", model: "Системный блок Dell OptiPlex", serialNumber: "DLOPT-019", status: "in_use", location: "АРМ-19", warrantyUntil: new Date("2027-01-01"), assignedToId: 2, attributes: { ipAddress: "10.0.19.5" } },
  { id: 88, inventoryNo: "ММ-000088", type: "multimedia", model: 'ТВ-панель Samsung 55"', serialNumber: "SMS55-088", status: "decommissioned", location: "склад", warrantyUntil: null, assignedToId: null, attributes: {} },
];

interface SeedTicket {
  id: number; title: string; description: string; type: string;
  priority: "low" | "medium" | "high";
  status: "request" | "open" | "clarification" | "closed";
  createdById: number; assignedToId: number | null; equipmentId: number | null;
  createdAt: string; updatedAt: string;
}
const tickets: SeedTicket[] = [
  { id: 142, title: "Не печатает принтер в 304", description: "Принтер не реагирует на печать, мигает индикатор.", type: "repair", priority: "high", status: "request", createdById: 5, assignedToId: null, equipmentId: 21, createdAt: "2025-06-01T09:12:00Z", updatedAt: "2025-06-01T09:12:00Z" },
  { id: 141, title: "Замена монитора, АРМ-58", description: "Монитор периодически гаснет, требуется замена.", type: "replacement", priority: "medium", status: "open", createdById: 7, assignedToId: 1, equipmentId: 58, createdAt: "2025-05-31T14:03:00Z", updatedAt: "2025-06-02T10:20:00Z" },
  { id: 140, title: "Проектор в переговорной мигает", description: "Изображение мерцает при подключении по HDMI.", type: "repair", priority: "medium", status: "open", createdById: 3, assignedToId: null, equipmentId: 12, createdAt: "2025-05-31T11:40:00Z", updatedAt: "2025-05-31T11:40:00Z" },
  { id: 139, title: "Доступ к сетевой папке отдела", description: "Нужен доступ на чтение/запись к общей папке отдела.", type: "access", priority: "low", status: "clarification", createdById: 6, assignedToId: 4, equipmentId: null, createdAt: "2025-05-30T13:05:00Z", updatedAt: "2025-06-01T08:00:00Z" },
  { id: 138, title: "Установить ПО для бухгалтерии", description: "Установить и настроить бухгалтерское ПО на 2 АРМ.", type: "software", priority: "low", status: "closed", createdById: 9, assignedToId: 4, equipmentId: null, createdAt: "2025-05-29T08:20:00Z", updatedAt: "2025-05-30T16:45:00Z" },
  { id: 137, title: "Не работает сетевой диск", description: "Сетевой диск не монтируется после перезагрузки.", type: "repair", priority: "high", status: "closed", createdById: 2, assignedToId: 1, equipmentId: null, createdAt: "2025-05-28T16:55:00Z", updatedAt: "2025-05-29T09:30:00Z" },
];

// Конфиг сервисов/типов заявок (из ConfigContext).
const services = [
  { key: "hardware", name: "Техника", sortOrder: 0, types: [
    { key: "repair", name: "Ремонт оборудования", slaHours: 8 },
    { key: "replacement", name: "Замена оборудования", slaHours: 24 },
  ] },
  { key: "software", name: "Программное обеспечение", sortOrder: 1, types: [
    { key: "software", name: "Установка ПО", slaHours: 16 },
  ] },
  { key: "access", name: "Доступы", sortOrder: 2, types: [
    { key: "access", name: "Предоставление доступа", slaHours: 8 },
  ] },
  { key: "other", name: "Прочее", sortOrder: 3, types: [
    { key: "other", name: "Прочее", slaHours: 48 },
  ] },
];

const assetTypes = [
  { key: "workstation", name: "АРМ", attributes: [{ key: "ipAddress", label: "IP-адрес" }] },
  { key: "printer", name: "Принтер", attributes: [{ key: "macAddress", label: "MAC-адрес" }, { key: "ipAddress", label: "IP-адрес" }] },
  { key: "multimedia", name: "Мультимедиа", attributes: [] as { key: string; label: string }[] },
];

const positionWeights: Record<string, number> = {
  "Министр": 220, "Первый заместитель Министра": 200, "Заместитель Министра": 200,
  "Приемная Зам.Министра": 190, "Директор департамента": 180, "Заместитель директора департамента": 170,
  "Помощник Министра": 160, "Советник Министра": 150, "Приемная Департамента": 140,
  "Помощник Директора департамента": 135, "Начальник отдела": 130, "Заместитель начальника отдела": 120,
  "Референт": 110, "Ведущий советник": 100, "Советник": 90, "Ведущий консультант": 80,
  "Консультант": 70, "Главный специалист-эксперт": 60, "Ведущий специалист-эксперт": 50,
  "Специалист-эксперт": 40, "Старший специалист 1 разряда": 30, "Специалист 1 разряда": 20,
  "Специалист 2 разряда": 10,
};

async function main() {
  // Чистим в порядке, безопасном по внешним ключам.
  await prisma.activityEntry.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.ticketType.deleteMany();
  await prisma.service.deleteMany();
  await prisma.assetTypeAttribute.deleteMany();
  await prisma.assetType.deleteMany();
  await prisma.positionWeight.deleteMany();
  await prisma.room.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({ data: users });
  await prisma.user.update({ where: { userName: SUPERADMIN_USERNAME }, data: { role: "superadmin" } });

  await prisma.equipment.createMany({ data: equipment });

  for (const svc of services) {
    await prisma.service.create({
      data: {
        key: svc.key, name: svc.name, sortOrder: svc.sortOrder,
        ticketTypes: { create: svc.types.map((t) => ({ key: t.key, name: t.name, slaHours: t.slaHours })) },
      },
    });
  }

  for (const at of assetTypes) {
    await prisma.assetType.create({
      data: { key: at.key, name: at.name, attributes: { create: at.attributes } },
    });
  }

  await prisma.positionWeight.createMany({
    data: Object.entries(positionWeights).map(([title, weight]) => ({ title, weight })),
  });

  // Заявки + стартовая лента действий (повторяет seedActivity на фронте).
  for (const t of tickets) {
    await prisma.ticket.create({
      data: {
        id: t.id, title: t.title, description: t.description, type: t.type,
        priority: t.priority, status: t.status, createdById: t.createdById,
        assignedToId: t.assignedToId, equipmentId: t.equipmentId,
        createdAt: new Date(t.createdAt), updatedAt: new Date(t.updatedAt),
      },
    });
    const entries: Prisma.ActivityEntryCreateManyInput[] = [
      { ticketId: t.id, kind: "created", authorId: t.createdById, createdAt: new Date(t.createdAt) },
    ];
    if (t.assignedToId !== null) {
      entries.push({ ticketId: t.id, kind: "assignee", authorId: t.assignedToId, assigneeId: t.assignedToId, createdAt: new Date(t.updatedAt) });
    }
    if (t.status !== "open") {
      entries.push({ ticketId: t.id, kind: "status", status: t.status, authorId: t.assignedToId ?? t.createdById, createdAt: new Date(t.updatedAt) });
    }
    await prisma.activityEntry.createMany({ data: entries });
  }

  // Выровняем последовательности автоинкремента после явных id.
  await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('users','id'), (SELECT MAX(id) FROM "users"))`);
  await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('equipment','id'), (SELECT MAX(id) FROM "equipment"))`);
  await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('tickets','id'), (SELECT MAX(id) FROM "tickets"))`);

  console.log("✅ Сид завершён: пользователи, техника, заявки, конфиг.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
