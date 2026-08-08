import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { STD_STUDENT_BOARDING_KINDS, STD_STUDENT_STATUSES } from "../../domain/std-student.entity";

export class StudentResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ maxLength: 30 })
  admissionNo!: string;

  @ApiProperty({ maxLength: 60 })
  firstName!: string;

  @ApiPropertyOptional({ maxLength: 60, nullable: true })
  middleName!: string | null;

  @ApiProperty({ maxLength: 60 })
  lastName!: string;

  @ApiProperty({ description: "Generated column — lower(first + middle + last)" })
  searchName!: string;

  @ApiProperty({ format: "uuid" })
  classId!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  streamId!: string | null;

  @ApiProperty({ enum: STD_STUDENT_STATUSES })
  status!: string;

  @ApiProperty({ enum: STD_STUDENT_BOARDING_KINDS })
  boarding!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  feeGroupId!: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  sponsorId!: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  transportRouteId!: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  photoFileId!: string | null;

  @ApiProperty({ type: "object", additionalProperties: true })
  customFields!: Record<string, unknown>;

  @ApiProperty({ type: String, format: "date" })
  enrolledOn!: string;

  @ApiPropertyOptional({ type: String, format: "date", nullable: true })
  exitedOn!: string | null;

  @ApiProperty()
  exitCleared!: boolean;
}
