import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { UsrUserStatus, UsrUserType } from "../../domain/usr-user.entity";

/**
 * Response shape for `usr_user` (Phase 6 Slice 13 Part 1 — security fix).
 * Deliberately excludes `passwordHash` (bcrypt), `twofaSecretEnc`, and
 * `recoveryCodesEnc` (encrypted Buffers) — before this DTO existed,
 * `UsersController`'s handlers returned the raw entity with no mapping and
 * no `ClassSerializerInterceptor` registered anywhere, so any caller holding
 * `users:user:view` received all three secret fields verbatim in the
 * response body. `toView()` in `users.controller.ts` is what actually stops
 * that — this DTO only documents the shape for Swagger/codegen.
 */
export class UserResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ maxLength: 60 })
  username!: string;

  @ApiPropertyOptional({ maxLength: 160, nullable: true })
  email!: string | null;

  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  phone!: string | null;

  @ApiProperty({ maxLength: 120 })
  fullName!: string;

  @ApiProperty({ enum: ["INVITED", "ACTIVE", "SUSPENDED", "DEACTIVATED"] })
  status!: UsrUserStatus;

  @ApiProperty({ enum: ["STAFF", "PARENT", "SYSTEM"] })
  userType!: UsrUserType;

  @ApiProperty()
  mustChangePassword!: boolean;

  @ApiProperty()
  twofaEnabled!: boolean;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  departmentId!: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Joined from the department relation; null if unassigned" })
  departmentName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: "Decimal string, KES (FR-USER-005.1)" })
  authorityLimitAmount!: string | null;

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  lastLoginAt!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  passwordChangedAt!: string;

  @ApiProperty({ maxLength: 8 })
  locale!: string;
}

export class CreateUserResponseDto {
  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;

  @ApiProperty({ description: "Plaintext temporary password — shown to the creating admin exactly once, never persisted anywhere beyond this response" })
  temporaryPassword!: string;
}

export class UserListResponseDto {
  @ApiProperty({ type: [UserResponseDto] })
  items!: UserResponseDto[];

  @ApiProperty({ description: "Total row count matching the applied filters, ignoring page/pageSize" })
  total!: number;
}
