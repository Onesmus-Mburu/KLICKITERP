import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayNotEmpty, IsArray, IsIn, IsUUID, ValidateIf } from "class-validator";

const AUDIENCE_KINDS = ["STAFF_ROLE", "EXPLICIT_USER_IDS"] as const;

/**
 * The two `audience_def` shapes `BroadcastsService.send()` currently
 * understands (task brief for this module) — guardian/parent audience
 * kinds are deferred to Module 8 (Students). `roleId`/`userIds` are
 * conditionally required by `kind` (`ValidateIf`), matching
 * `BroadcastsService.resolveUsers()`'s exhaustive switch.
 */
export class AudienceDefDto {
  @ApiProperty({ enum: AUDIENCE_KINDS })
  @IsIn(AUDIENCE_KINDS)
  kind!: "STAFF_ROLE" | "EXPLICIT_USER_IDS";

  @ApiPropertyOptional({ format: "uuid", description: "Required when kind=STAFF_ROLE" })
  @ValidateIf((o: AudienceDefDto) => o.kind === "STAFF_ROLE")
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ type: [String], description: "Required when kind=EXPLICIT_USER_IDS" })
  @ValidateIf((o: AudienceDefDto) => o.kind === "EXPLICIT_USER_IDS")
  @IsArray()
  @ArrayNotEmpty()
  // Every real usr_user.id in this codebase is a UUIDv7 (BaseEntity's own
  // convention), not v4 — a version-locked "4" here (the class-validator
  // default in most examples) would reject every real user id. Unversioned,
  // matching roleId's own plain @IsUUID() above.
  @IsUUID(undefined, { each: true })
  userIds?: string[];
}
