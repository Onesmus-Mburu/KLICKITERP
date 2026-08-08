import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { STD_STUDENT_BOARDING_KINDS, StdStudentBoarding } from "../../domain/std-student.entity";

export class CreateStudentDto {
  /**
   * Phase 6 Slice 2b item 8 — optional: when omitted, `StudentsService.create()`
   * auto-generates one via `NumberingService.allocate(manager, "STD_ADMISSION")`
   * IF the `students.admissionNoAutogenSetting` setting has `enabled: true`
   * (`GET/PUT /students/settings/admission-no-autogen`); otherwise the
   * service rejects the omission with a clear validation error.
   */
  @ApiPropertyOptional({ maxLength: 30, description: "Omit to auto-generate (if enabled) — see admission-no-autogen setting" })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  admissionNo?: string;

  @ApiProperty({ maxLength: 60 })
  @IsString()
  @MaxLength(60)
  firstName!: string;

  @ApiPropertyOptional({ maxLength: 60, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  middleName?: string;

  @ApiProperty({ maxLength: 60 })
  @IsString()
  @MaxLength(60)
  lastName!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  classId!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  streamId?: string;

  /**
   * Phase 6 Slice 2b follow-up item 3 — optional: when omitted,
   * `StudentsService.create()` defaults it to `"DAY"` (a plain code
   * default, not a nullable DB column — `std_student.boarding` stays
   * `NOT NULL` with no default at the DB level; every read path in this
   * domain already assumes a valid non-null enum, e.g.
   * `student-response.dto.ts`/the repository row-mapper, and this default
   * keeps that assumption true rather than rippling a nullable column
   * through them).
   */
  @ApiPropertyOptional({ enum: STD_STUDENT_BOARDING_KINDS, description: "Defaults to DAY when omitted" })
  @IsOptional()
  @IsIn(STD_STUDENT_BOARDING_KINDS)
  boarding?: StdStudentBoarding;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  feeGroupId?: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "Forward reference to Billing/Module 9's bill_sponsor — no FK yet" })
  @IsOptional()
  @IsUUID()
  sponsorId?: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "Forward reference to Billing/Module 9's bill_transport_route — no FK yet" })
  @IsOptional()
  @IsUUID()
  transportRouteId?: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  photoFileId?: string;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;

  @ApiProperty({ type: String, format: "date" })
  @IsDateString({ strict: true })
  enrolledOn!: string;
}
