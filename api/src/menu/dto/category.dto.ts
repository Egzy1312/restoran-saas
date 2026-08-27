import { IsInt, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateCategoryDto {
  @IsObject()
  name_json!: Record<string, string>;

  @IsOptional()
  @IsInt()
  sort_order?: number;

  /** Format 'HH:mm', npr. za dnevni meni 11:00-14:00 */
  @IsOptional()
  @IsString()
  active_from_time?: string;

  @IsOptional()
  @IsString()
  active_to_time?: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsObject()
  name_json?: Record<string, string>;

  @IsOptional()
  @IsInt()
  sort_order?: number;

  @IsOptional()
  @IsString()
  active_from_time?: string;

  @IsOptional()
  @IsString()
  active_to_time?: string;

  @IsOptional()
  is_active?: boolean;
}
