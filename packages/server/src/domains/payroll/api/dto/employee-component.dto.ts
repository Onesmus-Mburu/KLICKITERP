import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsUUID, Matches } from "class-validator";
import { DECIMAL_PATTERN } from "./decimal.util";

export class AddEmployeeComponentDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  componentId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;

  @ApiProperty()
  @IsDateString()
  effectiveFrom!: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class EndEmployeeComponentDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  componentId!: string;

  @ApiProperty()
  @IsDateString()
  effectiveTo!: string;
}

export class PyrlEmployeeComponentResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  employeeId!: string;

  @ApiProperty({ format: "uuid" })
  componentId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty()
  effectiveFrom!: string;

  @ApiProperty({ nullable: true })
  effectiveTo!: string | null;
}
