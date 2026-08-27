import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateItemDto {
  @IsUUID()
  category_id!: string;

  @IsObject()
  name_json!: Record<string, string>;

  @IsOptional()
  @IsObject()
  description_json?: Record<string, string>;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergens?: string[];

  @IsOptional()
  @IsIn(['kitchen', 'bar'])
  print_target?: string;
}

export class UpdateItemDto {
  @IsOptional()
  @IsObject()
  name_json?: Record<string, string>;

  @IsOptional()
  @IsObject()
  description_json?: Record<string, string>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergens?: string[];

  @IsOptional()
  @IsIn(['kitchen', 'bar'])
  print_target?: string;

  /** "86-ing" - kuhar oznacava artikal nedostupnim, momentalno nestaje iz gost menija. */
  @IsOptional()
  @IsBoolean()
  is_available?: boolean;

  /** Redoslijed prevlačenjem (drag-and-drop) unutar kategorije u admin meniju. */
  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;
}

export class CreateModifierDto {
  @IsObject()
  name_json!: Record<string, string>;

  @IsNumber()
  @Min(0)
  price!: number;
}
