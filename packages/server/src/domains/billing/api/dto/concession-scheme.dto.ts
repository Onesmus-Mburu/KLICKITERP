import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";
import {
  BILL_CONCESSION_CALCS,
  BILL_CONCESSION_KINDS,
  BillConcessionCalc,
  BillConcessionKind,
} from "../../domain/bill-concession-scheme.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreateConcessionSchemeDto {
  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ enum: BILL_CONCESSION_KINDS })
  @IsIn(BILL_CONCESSION_KINDS)
  kind!: BillConcessionKind;

  @ApiProperty({ enum: BILL_CONCESSION_CALCS })
  @IsIn(BILL_CONCESSION_CALCS)
  calc!: BillConcessionCalc;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  value!: string;

  @ApiPropertyOptional({ type: [String], nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  categoryScope?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowsStacking?: boolean;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  glAccountId!: string;
}

export class UpdateConcessionSchemeDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ enum: BILL_CONCESSION_KINDS })
  @IsOptional()
  @IsIn(BILL_CONCESSION_KINDS)
  kind?: BillConcessionKind;

  @ApiPropertyOptional({ enum: BILL_CONCESSION_CALCS })
  @IsOptional()
  @IsIn(BILL_CONCESSION_CALCS)
  calc?: BillConcessionCalc;

  @ApiPropertyOptional({ type: String, description: "Decimal string" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  value?: string;

  @ApiPropertyOptional({ type: [String], nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  categoryScope?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowsStacking?: boolean;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  glAccountId?: string;
}

export class ConcessionSchemeResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: BILL_CONCESSION_KINDS })
  kind!: string;

  @ApiProperty({ enum: BILL_CONCESSION_CALCS })
  calc!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  value!: string;

  @ApiProperty({ type: [String], nullable: true })
  categoryScope!: string[] | null;

  @ApiProperty()
  allowsStacking!: boolean;

  @ApiProperty({ format: "uuid" })
  glAccountId!: string;

  @ApiProperty()
  isActive!: boolean;
}
