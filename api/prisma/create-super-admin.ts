/**
 * Jednokratni bootstrap za PRVI SUPER_ADMIN (platform-admin) nalog - nema
 * javne registracije za ovu ulogu (namjerno, vidi auth.service.ts:register
 * koje UVIJEK kreira role: 'ADMIN' vezan za nov restoran). Pokrece se rucno:
 *
 *   npm run create-super-admin
 *
 * Cita SUPER_ADMIN_EMAIL/SUPER_ADMIN_PASSWORD/SUPER_ADMIN_FULL_NAME iz .env.
 * Idempotentno (upsert) - siguran za ponovno pokretanje.
 */
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
// Napomena: .env se ovdje ucitava automatski preko @prisma/client-a (isti
// mehanizam kao prisma/seed.ts) - nema potrebe za rucnim dotenv importom.

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const fullName = process.env.SUPER_ADMIN_FULL_NAME ?? 'Platform Admin';

  if (!email || !password) {
    console.error('SUPER_ADMIN_EMAIL i SUPER_ADMIN_PASSWORD moraju biti podešeni u .env.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.staffUser.upsert({
    where: { email },
    update: { passwordHash, role: 'SUPER_ADMIN', fullName, isActive: true },
    create: {
      email,
      passwordHash,
      fullName,
      role: 'SUPER_ADMIN',
      restaurantId: null,
    },
  });

  console.log(`SUPER_ADMIN nalog spreman: ${user.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
