import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';

export class CreateStaffUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  full_name!: string;

  @IsIn(['ADMIN', 'MANAGER', 'WAITER', 'KITCHEN', 'BAR'])
  role!: 'ADMIN' | 'MANAGER' | 'WAITER' | 'KITCHEN' | 'BAR';
}
