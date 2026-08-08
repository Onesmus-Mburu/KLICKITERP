import { ApiProperty } from "@nestjs/swagger";
import { BKP_RESTORE_RUN_STATUSES, BkpRestoreRunEntity } from "../../domain/bkp-restore-run.entity";

export class RestoreRunResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: Object })
  fromManifest!: unknown;

  @ApiProperty({ format: "date-time" })
  startedAt!: string;

  @ApiProperty({ format: "date-time", nullable: true })
  finishedAt!: string | null;

  @ApiProperty({ enum: BKP_RESTORE_RUN_STATUSES })
  status!: string;

  @ApiProperty({ nullable: true })
  notes!: string | null;
}

export function toRestoreRunResponseDto(entity: BkpRestoreRunEntity): RestoreRunResponseDto {
  return {
    id: entity.id,
    fromManifest: entity.fromManifest,
    startedAt: entity.startedAt.toISOString(),
    finishedAt: entity.finishedAt ? entity.finishedAt.toISOString() : null,
    status: entity.status,
    notes: entity.notes,
  };
}
