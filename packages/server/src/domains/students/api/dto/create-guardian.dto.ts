import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateGuardianDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  fullName!: string;

  /**
   * Phase 6 Slice 2b, item 4 — optional: a guardian may be created with only
   * an email. `GuardiansService.create()` enforces "at least one of
   * phone/email" (mirroring `UsersService.create()`'s
   * `ck_usr_user_contact_or_parent` pattern), and `ck_std_guardian_contact`
   * (migration `0200`) is the DB-layer defense-in-depth backstop.
   */
  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ maxLength: 160, nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  nationalId?: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "Portal usr_user account link" })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
