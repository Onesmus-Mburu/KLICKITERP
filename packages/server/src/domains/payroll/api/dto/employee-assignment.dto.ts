import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsUUID, Matches } from "class-validator";
import { DECIMAL_PATTERN } from "./decimal.util";

export class AssignEmployeeDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  structureId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  basicPay!: string;

  @ApiProperty()
  @IsDateString()
  effectiveFrom!: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class EndAssignmentDto {
  @ApiProperty()
  @IsDateString()
  effectiveTo!: string;
}

export class PyrlEmployeeAssignmentResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  employeeId!: string;

  @ApiProperty({ format: "uuid" })
  structureId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  basicPay!: string;

  @ApiProperty()
  effectiveFrom!: string;

  @ApiProperty({ nullable: true })
  effectiveTo!: string | null;
}
