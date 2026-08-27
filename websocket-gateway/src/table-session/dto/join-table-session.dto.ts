import { IsLatitude, IsLongitude, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Payload za `join_table_session` - klijent (gost) se prikljucuje sesiji
 * stola nakon skeniranja QR koda: https://app.domain.com/r/{slug}/t/{table_id}
 */
export class JoinTableSessionDto {
  @IsUUID()
  table_id!: string;

  /** Sirovi qr_code_token iz URL-a - server ga verifikuje protiv baze
   *  (sprecava da neko pogodi table_id i udje u tudju sesiju). */
  @IsString()
  @IsNotEmpty()
  qr_token!: string;

  /** Anonimni identifikator gosta - generise se i cuva u local storage-u
   *  klijenta pri prvom otvaranju menija, zivi dok traje sesija u browseru. */
  @IsString()
  @IsNotEmpty()
  guest_id!: string;

  /** GPS lokacija gosta (specifikacija, modul A.6 - geofencing) - salje se samo ako je restoran podesio geofenceRadiusMeters i browser dozvolio pristup lokaciji. */
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}
