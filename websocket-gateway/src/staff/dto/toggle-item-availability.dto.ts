import { IsBoolean, IsUUID } from 'class-validator';

/** Payload za `toggle_item_availability` - "86-ing", kuhar/sank oznacava artikal (ne)dostupnim. */
export class ToggleItemAvailabilityDto {
  @IsUUID()
  menu_item_id!: string;

  @IsBoolean()
  is_available!: boolean;
}
