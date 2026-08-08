import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsString, MaxLength } from "class-validator";

/**
 * Phase 6 Slice 2b item 8 — request/response body for
 * `GET/PUT /students/settings/admission-no-autogen`. Backed by a
 * `set_setting` row (key `students.admissionNoAutogenSetting`, via the
 * existing generic `SettingsService`, not a new table) plus a
 * `set_numbering_series` row for `(docType: "STD_ADMISSION", seriesCode:
 * "MAIN")` whose `prefix` is kept in sync via `NumberingService.upsertSeriesPrefix()`.
 * `prefix` is capped at 12 chars to match `set_numbering_series.prefix`'s
 * real `varchar(12)` column width (migration `0030`) — a longer prefix
 * would silently truncate at the DB layer otherwise.
 */
export class AdmissionNoAutogenSettingDto {
  @ApiProperty({ description: "Whether new students may omit admissionNo and have one generated" })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ maxLength: 12, example: "ADM-" })
  @IsString()
  @MaxLength(12)
  prefix!: string;
}
