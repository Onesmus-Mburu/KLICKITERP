import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class GuardianResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ maxLength: 120 })
  fullName!: string;

  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  phone!: string | null;

  @ApiPropertyOptional({ nullable: true })
  email!: string | null;

  @ApiPropertyOptional({ nullable: true })
  nationalId!: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  userId!: string | null;
}

/**
 * Phase 6 Slice 2c — sibling guardian dedup. Purely additive on top of
 * `GuardianResponseDto` (whose own fields are unchanged) — `wasExisting`
 * lets the frontend distinguish "New guardian created" from "Linked to
 * existing guardian {fullName} — looks like a sibling!" instead of staying
 * silent about which happened. Only `GuardiansController.create()` returns
 * this shape; every other guardian endpoint keeps returning plain
 * `GuardianResponseDto`.
 */
export class CreateGuardianResponseDto extends GuardianResponseDto {
  @ApiProperty({
    description:
      "True when an existing guardian (matched by phone, checked first, then email) was found and reused instead of creating a new record.",
  })
  wasExisting!: boolean;
}

export class StudentGuardianLinkResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty({ format: "uuid" })
  guardianId!: string;

  @ApiProperty({ maxLength: 30 })
  relationship!: string;

  @ApiProperty()
  isPrimary!: boolean;

  @ApiProperty()
  receivesBilling!: boolean;
}
