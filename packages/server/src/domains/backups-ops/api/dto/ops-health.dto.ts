import { ApiProperty } from "@nestjs/swagger";

/** Mirrors `OpsHealthSummary` (application/ops-health.service.ts) — nested checks stay `type: Object` (same precedent `ListSyncLogResponseDto.meta`/`BackupRunResponseDto.manifest` set) rather than a fully-typed Swagger class per sub-check, proportionate to how loosely-shaped each check's optional fields are. */
export class OpsHealthResponseDto {
  @ApiProperty({ type: Object, description: "DB connectivity (SELECT 1) + pg_database_size(current_database())" })
  database!: unknown;

  @ApiProperty({ type: Object, description: "Redis PING" })
  redis!: unknown;

  @ApiProperty({ type: Object, description: "MinIO connectivity (bucket list)" })
  minio!: unknown;

  @ApiProperty({ type: Object, description: "Disk usage via fs.statfs — {available:false} on platforms/Node builds where it's unavailable" })
  disk!: unknown;

  @ApiProperty({ type: Object, description: "Last successful (status=OK) bkp_backup_run" })
  lastBackup!: unknown;

  @ApiProperty()
  appVersion!: string;

  @ApiProperty({ description: "Real license state read via raw SQL against license.v_state (Phase 6 Slice 25) — 'NOT_PROVISIONED' when no license row exists yet" })
  licenseState!: string;

  @ApiProperty({ type: Object, description: "N/A — no queue infrastructure wired up in this codebase yet" })
  queueDepths!: unknown;

  @ApiProperty({ type: Object, description: "Reflects LOG_LEVEL env var only — no runtime-mutable Logger abstraction exists yet" })
  logLevel!: unknown;

  @ApiProperty({ format: "date-time" })
  generatedAt!: string;
}
