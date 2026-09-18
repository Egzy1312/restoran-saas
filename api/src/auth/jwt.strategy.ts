import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { StaffRole } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  restaurant_id: string;
  role: StaffRole;
  email: string;
}

export interface AuthenticatedUser {
  userId: string;
  restaurantId: string;
  role: StaffRole;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'insecure-dev-secret'),
    });
  }

  /**
   * Namjerno provjerava BAZU na svaki autentifikovan zahtjev (ne samo
   * potpis/istek JWT-a) - bez ovoga, deaktiviran nalog ili SUSPENDOVAN
   * restoran (SUPER_ADMIN akcija) ostaje potpuno funkcionalan do isteka
   * access tokena (do 8h, ili duze uz refresh - refresh token takodjer
   * nikad nije provjeravao ovo). Suspendovanje je do sad stvarno blokiralo
   * SAMO nove narudzbe gostiju (vidi TablesService.findByToken i sl.),
   * osoblje suspendovanog restorana je moglo dalje raditi u admin panelu/
   * KDS-u/konobarskoj app-i neometano - sto poražava svrhu suspendovanja
   * (npr. neplaćena pretplata). Uzgred, koristi SVJEZE role/restaurantId iz
   * baze umjesto onih iz JWT payload-a - promjena uloge se sad odmah
   * primjenjuje, ne tek nakon isteka starog tokena.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.staffUser.findUnique({
      where: { id: payload.sub },
      include: { restaurant: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Nalog je deaktiviran, prijavite se ponovo.');
    }
    if (user.restaurant && !user.restaurant.isActive) {
      throw new UnauthorizedException('Restoran je suspendovan. Kontaktirajte podršku.');
    }

    return {
      userId: user.id,
      restaurantId: user.restaurantId ?? '',
      role: user.role,
      email: user.email,
    };
  }
}
