import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class ForgotPasswordDto {
  @ApiProperty({ description: "username, email, or phone" })
  @IsString()
  identifier!: string;
}
