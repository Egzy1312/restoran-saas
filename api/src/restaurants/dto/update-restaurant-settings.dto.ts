import { IsBoolean, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Max, Min } from 'class-validator';

/** Sve postavke restorana editabilne kroz admin panel "Postavke" ekran - profil, printeri, anti-fraud, odobravanje, kredencijali trecih servisa (po restoranu, ne globalna .env). */
export class UpdateRestaurantSettingsDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsString()
  kitchen_printer_ip?: string;

  @IsOptional()
  @IsInt()
  kitchen_printer_port?: number;

  @IsOptional()
  @IsString()
  bar_printer_ip?: string;

  @IsOptional()
  @IsInt()
  bar_printer_port?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(5000)
  geofence_radius_meters?: number;

  @IsOptional()
  @IsString()
  allowed_ip?: string;

  @IsOptional()
  @IsBoolean()
  require_order_approval?: boolean;

  @IsOptional()
  @IsString()
  twilio_account_sid?: string;

  @IsOptional()
  @IsString()
  twilio_auth_token?: string;

  @IsOptional()
  @IsString()
  twilio_from_number?: string;

  @IsOptional()
  @IsString()
  stripe_secret_key?: string;

  @IsOptional()
  @IsString()
  stripe_webhook_secret?: string;
}
