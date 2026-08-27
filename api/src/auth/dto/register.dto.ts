import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

/** Self-service registracija - kreira NOV restoran (tenant) + prvi nalog (ADMIN) za njega. */
export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  restaurant_name!: string;

  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsString()
  @IsNotEmpty()
  owner_full_name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
