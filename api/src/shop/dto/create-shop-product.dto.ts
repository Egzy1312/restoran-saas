import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

/** SUPER_ADMIN CRUD za webshop proizvode (hardver - termalni printeri i sl., vidi platform-admin/). */
export class CreateShopProductDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** Cijena u NAJMANJOJ jedinici valute (centi/feninzi) - npr. 249.90 KM = 24990. Cijeli brojevi izbjegavaju float greske pri sabiranju narudzbe. */
  @IsInt()
  @Min(0)
  price_cents!: number;

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
