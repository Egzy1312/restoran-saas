import { IsUUID } from 'class-validator';

/** Payload za `close_table` - konobar naplati/pospremi sto, vraca ga na 'free' i cisti eventualnu zaostalu korpu. */
export class CloseTableDto {
  @IsUUID()
  table_id!: string;
}
