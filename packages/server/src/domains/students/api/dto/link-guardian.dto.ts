import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class LinkGuardianDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  guardianId!: string;

  @ApiProperty({ maxLength: 30, example: "MOTHER" })
  @IsString()
  @MaxLength(30)
  relationship!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  receivesBilling?: boolean;
}
