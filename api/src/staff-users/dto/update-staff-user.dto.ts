import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateStaffUserDto {
  @IsOptional()
  @IsString()
  full_name?: string;

  @IsOptional()
  @IsIn(['ADMIN', 'MANAGER', 'WAITER', 'KITCHEN', 'BAR'])
  role?: 'ADMIN' | 'MANAGER' | 'WAITER' | 'KITCHEN' | 'BAR';

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  /** Ako je poslano, resetuje lozinku naloga (npr. "Resetuj lozinku" akcija u admin panelu). */
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
