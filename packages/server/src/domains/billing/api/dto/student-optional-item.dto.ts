import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsUUID, Matches } from "class-validator";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreateStudentOptionalItemDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  studentId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  termId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  feeCategoryId!: string;

  @ApiPropertyOptional({ type: String, description: "Decimal string", nullable: true })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  amountOverride?: string;
}

export class UpdateStudentOptionalItemDto {
  @ApiPropertyOptional({ type: String, description: "Decimal string", nullable: true })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  amountOverride?: string;
}

export class StudentOptionalItemResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty({ format: "uuid" })
  termId!: string;

  @ApiProperty({ format: "uuid" })
  feeCategoryId!: string;

  @ApiProperty({ type: String, description: "Decimal string", nullable: true })
  amountOverride!: string | null;
}
