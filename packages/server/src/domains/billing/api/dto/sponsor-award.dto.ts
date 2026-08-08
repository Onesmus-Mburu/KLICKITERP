import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsOptional, IsUUID, Matches } from "class-validator";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreateSponsorAwardDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  sponsorId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  studentId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  termId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;

  @ApiPropertyOptional({ type: [String], nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  categoryScope?: string[];
}

export class UpdateSponsorAwardDto {
  @ApiPropertyOptional({ type: String, description: "Decimal string" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  amount?: string;

  @ApiPropertyOptional({ type: [String], nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  categoryScope?: string[];
}

export class SponsorAwardResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  sponsorId!: string;

  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty({ format: "uuid" })
  termId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty({ type: [String], nullable: true })
  categoryScope!: string[] | null;

  @ApiProperty({ type: String, description: "Decimal string" })
  appliedAmount!: string;
}
