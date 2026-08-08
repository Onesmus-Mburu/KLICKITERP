import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength } from "class-validator";

export class UnregisterDeviceTokenDto {
  @ApiProperty({ maxLength: 300 })
  @IsString()
  @MaxLength(300)
  token!: string;
}
