import { IsNotEmpty, IsString } from 'class-validator';

export class TwoFactorVerifyDto {
  @IsString()
  @IsNotEmpty()
  pre_auth_token!: string;

  @IsString()
  @IsNotEmpty()
  token!: string;
}
