/**
 * Seed skripta - kreira jedan pilot restoran sa admin nalogom, par stolova i
 * osnovnim menijem, radi lokalnog razvoja i testiranja cijelog toka
 * (QR -> meni -> narudzba -> KDS -> print) bez rucnog unosa preko admin panela.
 *
 * Pokretanje: npm run seed
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const restaurant = await prisma.restaurant.upsert({
    where: { slug: 'konoba-adriatic' },
    update: {},
    create: {
      name: 'Konoba Adriatic',
      slug: 'konoba-adriatic',
      address: 'Obala bb, Neum',
      currency: 'BAM',
      wifiSsid: 'Adriatic-Guest',
      kitchenPrinterIp: '192.168.1.150',
      kitchenPrinterPort: 9100,
      barPrinterIp: '192.168.1.151',
      barPrinterPort: 9100,
    },
  });

  await prisma.staffUser.upsert({
    where: { email: 'admin@konoba-adriatic.test' },
    update: {},
    create: {
      restaurantId: restaurant.id,
      email: 'admin@konoba-adriatic.test',
      passwordHash: await bcrypt.hash('admin123', 10),
      fullName: 'Vlasnik Restorana',
      role: 'ADMIN',
    },
  });

  const table1 = await prisma.restaurantTable.upsert({
    where: { qrCodeToken: 'seed-token-t1' },
    update: {},
    create: {
      restaurantId: restaurant.id,
      tableNumber: '1',
      zoneName: 'Bašta',
      capacity: 4,
      qrCodeToken: 'seed-token-t1',
    },
  });

  await prisma.restaurantTable.upsert({
    where: { qrCodeToken: 'seed-token-t2' },
    update: {},
    create: {
      restaurantId: restaurant.id,
      tableNumber: '2',
      zoneName: 'Glavna Sala',
      capacity: 2,
      qrCodeToken: 'seed-token-t2',
    },
  });

  const category = await prisma.menuCategory.create({
    data: {
      restaurantId: restaurant.id,
      nameJson: { bs: 'Roštilj', en: 'Grill' },
      sortOrder: 1,
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: category.id,
      nameJson: { bs: 'Ćevapi 10kom', en: 'Ćevapi (10pcs)' },
      descriptionJson: { bs: 'Domaći ćevapi sa lepinjom i kajmakom', en: 'Homemade ćevapi with flatbread and kajmak' },
      price: 12.0,
      allergens: ['gluten'],
      printTarget: 'kitchen',
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: category.id,
      nameJson: { bs: 'Coca-Cola 0.33l', en: 'Coca-Cola 0.33l' },
      price: 4.0,
      printTarget: 'bar',
    },
  });

  console.log('Seed završen.');
  console.log(`Restoran slug: ${restaurant.slug}`);
  console.log(`Test QR link: /r/${restaurant.slug}/t/${table1.id} (token: seed-token-t1)`);
  console.log('Admin login: admin@konoba-adriatic.test / admin123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
