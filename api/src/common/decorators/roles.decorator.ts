import { SetMetadata } from '@nestjs/common';
import { StaffRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Ogranicava rutu na navedene uloge osoblja, npr. @Roles('ADMIN', 'MANAGER'). */
export const Roles = (...roles: StaffRole[]) => SetMetadata(ROLES_KEY, roles);
