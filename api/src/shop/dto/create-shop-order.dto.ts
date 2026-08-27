import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';

class ShopOrderItemDto {
  @IsUUID()
  product_id!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

/** Kupovina hardvera (printeri i sl.) od platforme - javna ruta, ne zahtijeva prijavu. Cijene se UVIJEK preuzimaju iz baze (vidi ShopService.createOrder), nikad iz ovog payloada. */
export class CreateShopOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ShopOrderItemDto)
  items!: ShopOrderItemDto[];

  @IsString()
  @IsNotEmpty()
  customer_name!: string;

  @IsEmail()
  customer_email!: string;

  @IsOptional()
  @IsString()
  customer_phone?: string;

  @IsString()
  @IsNotEmpty()
  shipping_address!: string;

  /** 'cod' (pouzeće, podrazumijevano - trenutno JEDINO ponuđeno u /shop) ili 'card' (Lemon Squeezy online checkout - spremno u kodu, ali nije izloženo dok se ne poveže prava prodavnica). */
  @IsOptional()
  @IsIn(['cod', 'card'])
  payment_method?: 'cod' | 'card';
}
