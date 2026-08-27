import { IsNotEmpty, IsString } from 'class-validator';

/** Payload za `join_staff_session` - KDS/konobarski klijent salje svoj JWT (isti token dobijen od api/POST /auth/login). */
export class JoinStaffSessionDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
