/**
 * Jednokratna seed skripta za webshop proizvode (termalni printeri) - da
 * prodavnica nije prazna nakon prve instalacije. Idempotentno (upsert po slug-u).
 *
 * Pokretanje: npx ts-node prisma/seed-shop-products.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PRODUCTS = [
  {
    slug: 'termalni-printer-58mm-lan',
    name: 'Termalni printer 58mm (LAN)',
    description:
      'Kompaktan termalni printer sa Ethernet (LAN) priključkom, spreman za direktnu integraciju sa Print Gateway agentom (ESC/POS, port 9100). Idealan za manje šankove i pomoćne stanice.',
    priceCents: 19900,
    sku: 'PRN-58-LAN',
    stockQty: 15,
  },
  {
    slug: 'termalni-printer-80mm-lan',
    name: 'Termalni printer 80mm (LAN)',
    description:
      'Termalni printer pune širine sa Ethernet (LAN) priključkom - preporučen za kuhinjske stanice sa dužim listama artikala. ESC/POS kompatibilan, CP852 kodna stranica za bosanska/hrvatska/srpska slova (č/ć/š/ž/đ).',
    priceCents: 27900,
    sku: 'PRN-80-LAN',
    stockQty: 10,
  },
];

async function main() {
  for (const product of PRODUCTS) {
    await prisma.shopProduct.upsert({
      where: { slug: product.slug },
      update: {},
      create: product,
    });
    console.log(`Proizvod spreman: ${product.name}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
