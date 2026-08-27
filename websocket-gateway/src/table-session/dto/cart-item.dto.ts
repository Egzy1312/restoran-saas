import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CartModifierDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  @Min(0)
  price!: number;
}

/** Payload za `add_cart_item` - gost dodaje artikal u zajednicku korpu stola. */
export class AddCartItemDto {
  @IsUUID()
  table_id!: string;

  @IsUUID()
  menu_item_id!: string;

  @IsString()
  @IsNotEmpty()
  guest_id!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  @Min(0)
  unit_price!: number;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  item_notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartModifierDto)
  selected_modifiers?: CartModifierDto[];
}

/** Payload za `update_cart_item` (promjena kolicine ili napomene) i `remove_cart_item`. */
export class MutateCartItemDto {
  @IsUUID()
  table_id!: string;

  @IsString()
  @IsNotEmpty()
  guest_id!: string;

  @IsString()
  @IsNotEmpty()
  cart_item_id!: string;

  @IsOptional()
  @IsInt()
  @Min(0) // 0 = ekvivalent brisanju stavke
  quantity?: number;

  @IsOptional()
  @IsString()
  item_notes?: string;
}
