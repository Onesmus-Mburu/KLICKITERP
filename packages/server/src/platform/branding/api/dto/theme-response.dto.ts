import { ApiProperty } from "@nestjs/swagger";
import { BrndThemeStatus } from "../../domain/brnd-theme.entity";
import { DocumentConfigDto } from "./document-config.dto";
import { LoginConfigDto } from "./login-config.dto";
import { ThemeTokensDto } from "./theme-tokens.dto";

const THEME_STATUSES: BrndThemeStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];

/** HTTP response shape for a `brnd_theme` row (CRUD/publish/revert endpoints). */
export class ThemeResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ maxLength: 60 })
  name!: string;

  @ApiProperty({ enum: THEME_STATUSES })
  status!: BrndThemeStatus;

  @ApiProperty({ type: ThemeTokensDto })
  tokens!: ThemeTokensDto;

  @ApiProperty({ nullable: true, format: "uuid", type: String })
  logoFileId!: string | null;

  @ApiProperty({ nullable: true, format: "uuid", type: String })
  faviconFileId!: string | null;

  @ApiProperty({ type: LoginConfigDto })
  loginConfig!: LoginConfigDto;

  @ApiProperty({ type: DocumentConfigDto })
  documentConfig!: DocumentConfigDto;

  @ApiProperty({ nullable: true, type: Date })
  publishedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ nullable: true, format: "uuid", type: String })
  createdBy!: string | null;

  @ApiProperty({ nullable: true, format: "uuid", type: String })
  updatedBy!: string | null;

  @ApiProperty()
  version!: number;
}
