import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { FileObjectEntity } from "../../files";

export type BrndThemeStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/**
 * Maps to `brnd_theme` (docs/phase-4/02-schema-platform-accounting.md §4).
 * `tokens`/`login_config`/`document_config` are opaque jsonb from this
 * entity's point of view — their structured shapes are documented at
 * `application/theme-tokens.util.ts` (`ThemeTokens`) and
 * `application/theme-config.types.ts` (`ThemeLoginConfig`/`ThemeDocumentConfig`)
 * and validated at the DTO layer (`api/dto/*`); nothing here parses them,
 * mirroring `SetSettingEntity.value`'s "opaque jsonb" convention.
 *
 * `logoFileId`/`faviconFileId` are nullable FKs to `file_object`
 * (`platform/files`, imported via its public barrel per
 * `crossSiblingImportPolicy` in module-deps.json — see that module's
 * `index.ts` doc comment, which names Branding as its first documented
 * consumer) — RESTRICT, so a file still referenced by a theme can't be
 * hard-deleted out from under it.
 *
 * `uq_brnd_theme_published_p` is a partial unique index (`WHERE status =
 * 'PUBLISHED'`) enforcing "at most one published theme at a time" at the DB
 * layer — mirrors `set_academic_year.uq_set_year_current_p` /
 * `set_term.uq_set_term_current_p` exactly. `ThemesService.publish`/`.revert`
 * archive the previously-published theme inside the same transaction as
 * setting the new one PUBLISHED (unset-then-set), so this index is never
 * violated mid-flight — see that service's doc comment.
 */
@Entity("brnd_theme")
@Index("uq_brnd_theme_published_p", ["status"], { unique: true, where: `"status" = 'PUBLISHED'` })
@Check("ck_brnd_theme_status", `"status" IN ('DRAFT','PUBLISHED','ARCHIVED')`)
export class BrndThemeEntity extends MutableBaseEntity {
  @Column({ type: "varchar", length: 60, name: "name" })
  name!: string;

  @Column({ type: "varchar", length: 10, name: "status" })
  status!: BrndThemeStatus;

  @Column({ type: "jsonb", name: "tokens" })
  tokens!: unknown;

  @Column({ type: "uuid", name: "logo_file_id", nullable: true })
  logoFileId!: string | null;

  @ManyToOne(() => FileObjectEntity, { onDelete: "RESTRICT", nullable: true })
  @JoinColumn({ name: "logo_file_id" })
  logoFile?: FileObjectEntity | null;

  @Column({ type: "uuid", name: "favicon_file_id", nullable: true })
  faviconFileId!: string | null;

  @ManyToOne(() => FileObjectEntity, { onDelete: "RESTRICT", nullable: true })
  @JoinColumn({ name: "favicon_file_id" })
  faviconFile?: FileObjectEntity | null;

  @Column({ type: "jsonb", name: "login_config" })
  loginConfig!: unknown;

  @Column({ type: "jsonb", name: "document_config" })
  documentConfig!: unknown;

  @Column({ type: "timestamptz", name: "published_at", nullable: true })
  publishedAt!: Date | null;
}
