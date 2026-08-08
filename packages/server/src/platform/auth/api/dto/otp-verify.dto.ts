import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length, Matches } from "class-validator";

export class OtpVerifyDto {
  @ApiProperty({ example: "+254700000000" })
  @Matches(/^\+\d{6,19}$/, { message: "phone must be E.164, e.g. +254700000000" })
  phone!: string;

  @ApiProperty({ example: "123456" })
  @IsString()
  @Length(6, 6)
  code!: string;
}
