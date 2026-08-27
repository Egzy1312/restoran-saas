import { IsNotEmpty, IsString } from 'class-validator';

export class TwoFactorDisableDto {
  @IsString()
  @IsNotEmpty()
  password!: string;
}
