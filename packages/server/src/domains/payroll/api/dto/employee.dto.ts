import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { PYRL_EMPLOYMENT_TYPES, PyrlEmploymentType } from "../../domain/pyrl-employee.entity";

export class CreatePyrlEmployeeDto {
  @ApiProperty({ maxLength: 20 })
  @IsString()
  @MaxLength(20)
  staffNo!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ maxLength: 20 })
  @IsString()
  @MaxLength(20)
  nationalId!: string;

  @ApiProperty({ maxLength: 15 })
  @IsString()
  @MaxLength(15)
  kraPin!: string;

  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  nssfNo?: string;

  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  shifNo?: string;

  @ApiProperty({ enum: PYRL_EMPLOYMENT_TYPES })
  @IsString()
  employmentType!: PyrlEmploymentType;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  departmentId!: string;

  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  jobTitle!: string;

  @ApiProperty()
  @IsDateString()
  hireDate!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  costCenterId!: string;

  @ApiPropertyOptional({ type: "object", additionalProperties: true, nullable: true, description: "Opaque — AES-256-GCM envelope-encrypted before storage" })
  @IsOptional()
  payDetails?: unknown;

  @ApiPropertyOptional({ type: "object", additionalProperties: true, nullable: true, description: "Opaque — AES-256-GCM envelope-encrypted before storage" })
  @IsOptional()
  bankName?: unknown;

  @ApiPropertyOptional({ type: "object", additionalProperties: true, nullable: true, description: "Opaque — AES-256-GCM envelope-encrypted before storage" })
  @IsOptional()
  branch?: unknown;

  @ApiPropertyOptional({ type: "object", additionalProperties: true, nullable: true, description: "Opaque — AES-256-GCM envelope-encrypted before storage" })
  @IsOptional()
  account?: unknown;
}

export class UpdatePyrlEmployeeDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  jobTitle?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  costCenterId?: string;

  @ApiPropertyOptional({ enum: PYRL_EMPLOYMENT_TYPES })
  @IsOptional()
  @IsString()
  employmentType?: PyrlEmploymentType;

  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  nssfNo?: string | null;

  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  shifNo?: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  userId?: string | null;

  @ApiPropertyOptional({ type: "object", additionalProperties: true, nullable: true })
  @IsOptional()
  payDetails?: unknown;

  @ApiPropertyOptional({ type: "object", additionalProperties: true, nullable: true })
  @IsOptional()
  bankName?: unknown;

  @ApiPropertyOptional({ type: "object", additionalProperties: true, nullable: true })
  @IsOptional()
  branch?: unknown;

  @ApiPropertyOptional({ type: "object", additionalProperties: true, nullable: true })
  @IsOptional()
  account?: unknown;
}

export class ExitPyrlEmployeeDto {
  @ApiProperty()
  @IsDateString()
  exitDate!: string;
}

/**
 * The default, broadly-reachable read shape — `pay_details`/`bank_name`/
 * `branch`/`account` are REDACTED (`"***"` or `null`), never real
 * ciphertext/plaintext. See `EmployeesController`'s own doc comment for the
 * `payroll:employee:view` vs `payroll:employee:manage`-gated
 * `getDecrypted()` split.
 */
export class PyrlEmployeeResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  staffNo!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  userId!: string | null;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  nationalId!: string;

  @ApiProperty()
  kraPin!: string;

  @ApiProperty({ nullable: true })
  nssfNo!: string | null;

  @ApiProperty({ nullable: true })
  shifNo!: string | null;

  @ApiProperty({ enum: PYRL_EMPLOYMENT_TYPES })
  employmentType!: PyrlEmploymentType;

  @ApiProperty({ format: "uuid" })
  departmentId!: string;

  @ApiProperty()
  jobTitle!: string;

  @ApiProperty()
  hireDate!: string;

  @ApiProperty({ nullable: true })
  exitDate!: string | null;

  @ApiProperty({ type: "object", additionalProperties: true, nullable: true, description: "Redacted (\"***\") when present, or the real plaintext when returned by the decrypted endpoint" })
  payDetails!: unknown | null;

  @ApiProperty({ type: "object", additionalProperties: true, nullable: true })
  bankName!: unknown | null;

  @ApiProperty({ type: "object", additionalProperties: true, nullable: true })
  branch!: unknown | null;

  @ApiProperty({ type: "object", additionalProperties: true, nullable: true })
  account!: unknown | null;

  @ApiProperty({ format: "uuid" })
  costCenterId!: string;

  @ApiProperty()
  isActive!: boolean;
}

export class SearchPyrlEmployeeQueryDto {
  @ApiProperty()
  @IsString()
  q!: string;
}
