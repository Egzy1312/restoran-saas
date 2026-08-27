import { IsEmail, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateReservationDto {
  @IsOptional()
  @IsUUID()
  table_id?: string;

  @IsString()
  customer_name!: string;

  @IsString()
  customer_phone!: string;

  @IsOptional()
  @IsEmail()
  customer_email?: string;

  @IsISO8601()
  reservation_time!: string;

  @IsInt()
  @Min(1)
  guest_count!: number;

  @IsOptional()
  @IsString()
  special_requests?: string;
}

export class UpdateReservationStatusDto {
  @IsIn(['confirmed', 'cancelled', 'completed', 'no_show'])
  status!: string;
}
