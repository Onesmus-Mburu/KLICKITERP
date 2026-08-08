import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, IsUUID, Matches } from "class-validator";
import { PYRL_ONEOFF_KINDS, PyrlOneoffKind } from "../../domain/pyrl-oneoff.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreatePyrlOneoffDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ description: "'YYYY-MM'" })
  @IsString()
  periodKey!: string;

  @ApiProperty({ enum: PYRL_ONEOFF_KINDS })
  @IsIn(PYRL_ONEOFF_KINDS)
  kind!: PyrlOneoffKind;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  componentId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;

  @ApiProperty()
  @IsString()
  reason!: string;
}

export class UpdatePyrlOneoffDto {
  @ApiPropertyOptional({ type: String, description: "Decimal string" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  amount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class PyrlOneoffResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  employeeId!: string;

  @ApiProperty()
  periodKey!: string;

  @ApiProperty({ enum: PYRL_ONEOFF_KINDS })
  kind!: PyrlOneoffKind;

  @ApiProperty({ format: "uuid" })
  componentId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty()
  reason!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;
}
