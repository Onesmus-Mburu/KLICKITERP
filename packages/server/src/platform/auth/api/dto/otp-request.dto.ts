import { ApiProperty } from "@nestjs/swagger";
import { Matches } from "class-validator";

export class OtpRequestDto {
  @ApiProperty({ example: "+254700000000" })
  @Matches(/^\+\d{6,19}$/, { message: "phone must be E.164, e.g. +254700000000" })
  phone!: string;
}
