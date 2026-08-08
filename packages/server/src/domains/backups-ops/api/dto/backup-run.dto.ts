import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Min, ValidateNested } from "class-validator";
import { BKP_BACKUP_RUN_KINDS, BKP_BACKUP_RUN_STATUSES, BkpBackupRunEntity } from "../../domain/bkp-backup-run.entity";

export class RunBackupDto {
  @ApiProperty({ enum: BKP_BACKUP_RUN_KINDS })
  @IsIn(BKP_BACKUP_RUN_KINDS)
  kind!: (typeof BKP_BACKUP_RUN_KINDS)[number];
}

export class BackupRunResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "date-time" })
  startedAt!: string;

  @ApiProperty({ format: "date-time", nullable: true })
  finishedAt!: string | null;

  @ApiProperty({ enum: BKP_BACKUP_RUN_KINDS })
  kind!: string;

  @ApiProperty({ enum: BKP_BACKUP_RUN_STATUSES })
  status!: string;

  @ApiProperty({ nullable: true, description: "Encrypted archive size in bytes (string — 64-bit safe)" })
  sizeBytes!: string | null;

  @ApiProperty({ nullable: true })
  sha256!: string | null;

  @ApiProperty({ type: [Object], description: "Per-destination upload result (LOCAL/MINIO/OFFSITE_S3)" })
  destinations!: unknown[];

  @ApiProperty({ type: Object, nullable: true, description: "Populated only when status='OK' — sha256/sizeBytes/tableRowCounts/passphraseCheck etc." })
  manifest!: unknown;

  @ApiProperty({ nullable: true })
  error!: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}

export function toBackupRunResponseDto(entity: BkpBackupRunEntity): BackupRunResponseDto {
  return {
    id: entity.id,
    startedAt: entity.startedAt.toISOString(),
    finishedAt: entity.finishedAt ? entity.finishedAt.toISOString() : null,
    kind: entity.kind,
    status: entity.status,
    sizeBytes: entity.sizeBytes,
    sha256: entity.sha256,
    destinations: entity.destinations,
    manifest: entity.manifest,
    error: entity.error,
    createdAt: entity.createdAt.toISOString(),
  };
}

export class ListBackupRunsQueryDto {
  @ApiPropertyOptional({ enum: BKP_BACKUP_RUN_KINDS })
  @IsOptional()
  @IsIn(BKP_BACKUP_RUN_KINDS)
  kind?: (typeof BKP_BACKUP_RUN_KINDS)[number];

  @ApiPropertyOptional({ enum: BKP_BACKUP_RUN_STATUSES })
  @IsOptional()
  @IsIn(BKP_BACKUP_RUN_STATUSES)
  status?: (typeof BKP_BACKUP_RUN_STATUSES)[number];

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class ListBackupRunsResponseDto {
  @ApiProperty({ type: [BackupRunResponseDto] })
  items!: BackupRunResponseDto[];

  @ApiProperty({ type: Object })
  meta!: { total: number; page: number; pageSize: number; pageCount: number };
}

export class VerifyRestoreTargetDto {
  @ApiProperty()
  host!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  port!: number;

  @ApiProperty()
  database!: string;

  @ApiProperty()
  user!: string;

  @ApiProperty()
  password!: string;
}

export class VerifyRestoreDto {
  @ApiProperty({
    type: VerifyRestoreTargetDto,
    description:
      "An ALREADY-REACHABLE target Postgres connection (e.g. a scratch container) — provisioning the target itself is out of this endpoint's scope, see RestoreVerificationService's own doc comment",
  })
  @ValidateNested()
  @Type(() => VerifyRestoreTargetDto)
  target!: VerifyRestoreTargetDto;
}

export class PruneBackupsResponseDto {
  @ApiProperty()
  prunedCount!: number;

  @ApiProperty({ type: [String] })
  prunedRunIds!: string[];
}
