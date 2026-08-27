import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

// Sve otpremljene slike zive ovdje na disku, sluzene staticki preko
// app.useStaticAssets() u main.ts (prefiks /uploads). Poznato ogranicenje -
// ovo NE prezivi horizontalno skaliranje (vise instanci API-ja) niti
// efemerne kontejnere bez perzistentnog volumena; prava produkcija bi ovo
// drzala u S3-kompatibilnom object storage-u. Prihvatljiv MVP kompromis.
const UPLOADS_ROOT = join(process.cwd(), 'uploads');

/**
 * Otpremanje slika (meni artikli, webshop proizvodi) - zamjenjuje raniji
 * "zalijepi URL" pristup pravim upload-om sa uredjaja. Namjerno JEDAN
 * generican servis (ne duplirana logika po feature-u) - pozivaoci samo
 * prosljedjuju subfolder radi organizacije (menu-items/{restaurantId}, shop-products).
 */
@Injectable()
export class UploadsService {
  constructor(private readonly config: ConfigService) {}

  async saveImage(file: Express.Multer.File | undefined, subfolder: string): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('Nedostaje fajl slike.');

    const extension = ALLOWED_MIME_TYPES[file.mimetype];
    if (!extension) {
      throw new BadRequestException('Nepodržan format slike - dozvoljeno: JPEG, PNG, WebP, GIF.');
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new BadRequestException('Slika je prevelika (maksimalno 5MB).');
    }

    const dir = join(UPLOADS_ROOT, subfolder);
    await mkdir(dir, { recursive: true });

    const filename = `${randomUUID()}.${extension}`;
    await writeFile(join(dir, filename), file.buffer);

    const publicUrl = this.config.get<string>('API_PUBLIC_URL', 'http://localhost:3010');
    return { url: `${publicUrl.replace(/\/$/, '')}/uploads/${subfolder}/${filename}` };
  }
}
