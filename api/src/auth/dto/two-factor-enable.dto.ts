import { IsNotEmpty, IsString } from 'class-validator';

export class TwoFactorEnableDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
