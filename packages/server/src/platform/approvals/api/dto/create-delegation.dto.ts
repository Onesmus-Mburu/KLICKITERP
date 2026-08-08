import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsString, IsUUID } from "class-validator";

export class CreateDelegationDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  fromUserId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  toUserId!: string;

  @ApiProperty({ type: String, format: "date" })
  @IsDateString({ strict: true })
  startsOn!: string;

  @ApiProperty({ type: String, format: "date" })
  @IsDateString({ strict: true })
  endsOn!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
