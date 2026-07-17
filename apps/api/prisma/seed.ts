import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seed(): Promise<void> {
  await prisma.pickupLocation.upsert({
    where: { code: 'orenburg-lipovaya-20' },
    update: {
      name: 'Магазин Pro Dessert',
      addressText: 'Оренбург, Липовая улица, 20',
      active: true,
    },
    create: {
      code: 'orenburg-lipovaya-20',
      name: 'Магазин Pro Dessert',
      addressText: 'Оренбург, Липовая улица, 20',
      timezone: 'Asia/Yekaterinburg',
      active: true,
    },
  });

  await prisma.setting.upsert({
    where: { scope_key: { scope: 'STORE', key: 'defaultReservationHours' } },
    update: { value: 24, version: { increment: 1 } },
    create: { scope: 'STORE', key: 'defaultReservationHours', value: 24 },
  });
}

seed()
  .catch((error: unknown) => {
    console.error('foundation_seed_failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
