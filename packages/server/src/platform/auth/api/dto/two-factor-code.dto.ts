import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

/** Shared by `/auth/2fa/activate` and `/auth/2fa/disable` — both take just a TOTP/recovery code. */
export class TwoFactorCodeDto {
  @ApiProperty({ example: "123456" })
  @IsString()
  @Length(6, 10)
  code!: string;
}
