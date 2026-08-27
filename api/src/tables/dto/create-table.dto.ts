import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateTableDto {
  @IsString()
  table_number!: string;

  @IsOptional()
  @IsString()
  zone_name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsInt()
  pos_x?: number;

  @IsOptional()
  @IsInt()
  pos_y?: number;
}
