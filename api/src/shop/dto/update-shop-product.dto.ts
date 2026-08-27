import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateShopProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  price_cents?: number;

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock_qty?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
