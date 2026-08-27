import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffUserDto } from './dto/create-staff-user.dto';
import { UpdateStaffUserDto } from './dto/update-staff-user.dto';

/** Nikad ne vraćati passwordHash klijentu - eksplicitan select umjesto oslanjanja na serijalizaciju da izbjegne curenje. */
const SAFE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class StaffUsersService {
  constructor(private readonly prisma: PrismaService) {}

  list(restaurantId: string) {
    return this.prisma.staffUser.findMany({
      where: { restaurantId },
      select: SAFE_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(restaurantId: string, dto: CreateStaffUserDto) {
    const existing = await this.prisma.staffUser.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Nalog sa ovim emailom već postoji.');

    return this.prisma.staffUser.create({
      data: {
        restaurantId,
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        fullName: dto.full_name,
        role: dto.role,
      },
      select: SAFE_SELECT,
    });
  }

  async update(restaurantId: string, userId: string, currentUserId: string, dto: UpdateStaffUserDto) {
    const target = await this.prisma.staffUser.findFirst({ where: { id: userId, restaurantId } });
    if (!target) throw new NotFoundException('Nalog nije pronađen.');

    if (userId === currentUserId && dto.is_active === false) {
      throw new BadRequestException('Ne možete deaktivirati vlastiti nalog.');
    }

    return this.prisma.staffUser.update({
      where: { id: userId },
      data: {
        fullName: dto.full_name,
        role: dto.role,
        isActive: dto.is_active,
        passwordHash: dto.password ? await bcrypt.hash(dto.password, 10) : undefined,
      },
      select: SAFE_SELECT,
    });
  }

  async remove(restaurantId: string, userId: string, currentUserId: string) {
    if (userId === currentUserId) {
      throw new BadRequestException('Ne možete obrisati vlastiti nalog.');
    }
    const target = await this.prisma.staffUser.findFirst({ where: { id: userId, restaurantId } });
    if (!target) throw new NotFoundException('Nalog nije pronađen.');

    await this.prisma.staffUser.delete({ where: { id: userId } });
  }
}
