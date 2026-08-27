import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Oznacava rutu kao javno dostupnu (bez JWT-a) - npr. gost meni, login. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
