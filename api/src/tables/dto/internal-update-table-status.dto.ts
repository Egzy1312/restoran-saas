import { IsIn } from 'class-validator';

export class InternalUpdateTableStatusDto {
  @IsIn(['free', 'occupied', 'reserved', 'bill_requested'])
  status!: string;
}
