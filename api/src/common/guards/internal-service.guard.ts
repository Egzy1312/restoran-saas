import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Stiti /internal/* rute - koriste ih iskljucivo drugi servisi unutar naseg
 * sistema (npr. websocket-gateway kad gost posalje `place_order`), nikad
 * javni klijenti. Provjerava dijeljeni tajni header umjesto JWT-a jer ovi
 * pozivi nemaju ulogovanog korisnika.
 */
@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const provided = request.headers['x-internal-secret'];
    const expected = this.config.get<string>('INTERNAL_SERVICE_SECRET');

    if (!expected || provided !== expected) {
      throw new UnauthorizedException('Nevažeći interni servisni token.');
    }
    return true;
  }
}
