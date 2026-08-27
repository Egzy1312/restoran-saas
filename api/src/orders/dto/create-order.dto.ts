import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

class SelectedModifierDto {
  @IsUUID()
  id!: string;
}

class OrderItemInputDto {
  @IsUUID()
  menu_item_id!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  item_notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedModifierDto)
  selected_modifiers?: SelectedModifierDto[];

  /** guest_id gosta koji je dodao bas ovu stavku u korpu - za "split by item" (modul A.5). Nedostaje kod rucnog unosa konobara. */
  @IsOptional()
  @IsString()
  added_by?: string;
}

export class CreateOrderDto {
  @IsOptional()
  @IsUUID()
  table_id?: string;

  @IsOptional()
  @IsIn(['dine_in', 'takeaway'])
  order_type?: string;

  @IsOptional()
  @IsIn(['cash', 'card', 'online'])
  payment_method?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items!: OrderItemInputDto[];

  /** Ko je poslao narudzbu - guest_id gosta ili staff_id konobara (za rucni unos). Samo za log/attribution, ne za auth. */
  @IsOptional()
  @IsString()
  placed_by?: string;

  // --- Takeaway/Pickup (modul D.3) - relevantno samo kad je order_type='takeaway' ---
  @IsOptional()
  @IsISO8601()
  pickup_time?: string;

  @IsOptional()
  @IsString()
  customer_name?: string;

  @IsOptional()
  @IsString()
  customer_phone?: string;
}
