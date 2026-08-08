import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, IsDateString, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from "class-validator";
import { JournalLineInputDto } from "./journal-line-input.dto";

/**
 * No `journalType` field — `journals.controller.ts`'s `POST /accounting/journals`
 * always forces `journalType='MANUAL'` server-side regardless of client
 * input (see that controller's doc comment), so accepting one here would be
 * misleading; SYSTEM/REVERSING/CLOSING/OPENING journals are posted by other
 * services calling `PostingService.post()` directly, never through this
 * public DTO.
 */
export class PostJournalDto {
  @ApiProperty({ type: String, format: "date" })
  @IsDateString({ strict: true })
  journalDate!: string;

  @ApiProperty({ maxLength: 20 })
  @IsString()
  @MaxLength(20)
  sourceModule!: string;

  @ApiPropertyOptional({ maxLength: 30, description: "Defaults to GL_MANUAL when omitted" })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  sourceDocType?: string;

  @ApiPropertyOptional({ format: "uuid", description: "Defaults to the new journal's own id when omitted" })
  @IsOptional()
  @IsUUID()
  sourceDocId?: string;

  @ApiProperty()
  @IsString()
  narration!: string;

  @ApiPropertyOptional({ format: "uuid", description: "Resolved from journalDate via GlPeriodRepository.findCurrentForDate() when omitted" })
  @IsOptional()
  @IsUUID()
  periodId?: string;

  @ApiProperty({ type: [JournalLineInputDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => JournalLineInputDto)
  lines!: JournalLineInputDto[];
}
