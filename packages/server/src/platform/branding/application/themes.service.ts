import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { OutboxWriterService } from "../../../shared/events/outbox-writer.service";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { FilesService } from "../../files";
import { BrndThemeEntity, BrndThemeStatus } from "../domain/brnd-theme.entity";
import { ThemePublishedEvent } from "../events/theme-published.event";
import { BrndThemeRepository } from "../infrastructure/brnd-theme.repository";
import {
  INFONEY_DEFAULT_DOCUMENT_CONFIG,
  INFONEY_DEFAULT_LOGIN_CONFIG,
  INFONEY_DEFAULT_THEME_NAME,
  INFONEY_DEFAULT_THEME_TOKENS,
} from "./infoney-default-theme";
import { ThemeDocumentConfig, ThemeLoginConfig } from "./theme-config.types";
import { buildThemeCssVariables, ThemeTokens } from "./theme-tokens.util";

export interface CreateThemeInput {
  name: string;
  tokens: ThemeTokens;
  loginConfig?: ThemeLoginConfig;
  documentConfig?: ThemeDocumentConfig;
  logoFileId?: string | null;
  faviconFileId?: string | null;
}

export interface UpdateThemeInput {
  name?: string;
  tokens?: ThemeTokens;
  loginConfig?: ThemeLoginConfig;
  documentConfig?: ThemeDocumentConfig;
  logoFileId?: string | null;
  faviconFileId?: string | null;
}

/**
 * Resolved output of `preview()`/`getCurrentTheme()` — the CSS-variable
 * bundle a login page or server-side PDF renderer actually consumes
 * (FR-BRND-001.1: "documents/PDF read the same token set server-side").
 */
export interface ResolvedThemeBundle {
  /** Null only for the hardcoded fallback `getCurrentTheme()` returns when no `brnd_theme` row is PUBLISHED yet (pre-seed boot). */
  themeId: string | null;
  name: string;
  status: BrndThemeStatus;
  isFallback: boolean;
  cssVariables: Record<string, string>;
  tokens: ThemeTokens;
  loginConfig: ThemeLoginConfig;
  documentConfig: ThemeDocumentConfig;
  logoFileId: string | null;
  faviconFileId: string | null;
  /** Signed MinIO URL for `logoFileId`, resolved in-process via `FilesService` — null when unset or resolution failed. */
  logoUrl: string | null;
  /** Signed MinIO URL for `faviconFileId` — see `logoUrl`'s comment for the null rules. */
  faviconUrl: string | null;
  /** Signed MinIO URL for `loginConfig.backgroundImageFileId` — see `logoUrl`'s comment for the null rules. */
  loginBackgroundImageUrl: string | null;
  publishedAt: Date | null;
}

/**
 * Max allowed expiry accepted by `SignedUrlQueryDto`/`FilesController`'s own
 * `["60","300","900","3600","86400"]` enum (as seconds, plain `number` here
 * since this is a direct in-process `FilesService.getSignedUrl()` call, never
 * over HTTP — the string-enum typing on that DTO only exists to parse a
 * query-string value, it doesn't apply to this call site). Decorative chrome
 * (logo/favicon/login background), refreshed every 60s via `theme-server.ts`'s
 * own SSR revalidate window anyway, so the longest allowed expiry is fine —
 * not sensitive data.
 */
const SIGNED_URL_EXPIRY_SECONDS = 86400;

/**
 * Theme CRUD (create always starts DRAFT) plus the FR-BRND-002.1 Draft ->
 * Preview -> Publish -> Revert workflow. "At most one PUBLISHED theme" is
 * `uq_brnd_theme_published_p` (partial unique index — see the entity's doc
 * comment); `publish`/`revert` archive the previously-published theme
 * inside the same transaction as setting the new one PUBLISHED
 * (unset-then-set), exactly mirroring
 * `AcademicCalendarService.setCurrentYear`/`.setCurrentTerm`'s pattern for
 * `uq_set_year_current_p`/`uq_set_term_current_p`.
 */
@Injectable()
export class ThemesService {
  private readonly logger = new Logger(ThemesService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly themeRepository: BrndThemeRepository,
    private readonly outboxWriter: OutboxWriterService,
    private readonly filesService: FilesService,
  ) {}

  async create(input: CreateThemeInput, actorId: string | null): Promise<BrndThemeEntity> {
    return this.themeRepository.create({
      name: input.name,
      status: "DRAFT",
      tokens: input.tokens,
      loginConfig: input.loginConfig ?? {},
      documentConfig: input.documentConfig ?? {},
      logoFileId: input.logoFileId ?? null,
      faviconFileId: input.faviconFileId ?? null,
      publishedAt: null,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async list(): Promise<BrndThemeEntity[]> {
    return this.themeRepository.list();
  }

  async findByIdOrFail(id: string): Promise<BrndThemeEntity> {
    return this.themeRepository.findByIdOrFail(id);
  }

  /**
   * Edits a theme's fields in place. Rejected once `status = 'PUBLISHED'` —
   * the workflow is Draft -> Preview -> Publish -> Revert (FR-BRND-002.1);
   * changing what's currently live means creating a new draft and
   * publishing that, not silently mutating the row serving the login
   * page/documents right now.
   */
  async update(id: string, changes: UpdateThemeInput, actorId: string | null): Promise<BrndThemeEntity> {
    const theme = await this.themeRepository.findByIdOrFail(id);
    if (theme.status === "PUBLISHED") {
      throw new ValidationException(
        `Theme "${theme.name}" is published and cannot be edited in place — create a new draft instead`,
        { themeId: id },
      );
    }

    if (changes.name !== undefined) theme.name = changes.name;
    if (changes.tokens !== undefined) theme.tokens = changes.tokens;
    if (changes.loginConfig !== undefined) theme.loginConfig = changes.loginConfig;
    if (changes.documentConfig !== undefined) theme.documentConfig = changes.documentConfig;
    if (changes.logoFileId !== undefined) theme.logoFileId = changes.logoFileId;
    if (changes.faviconFileId !== undefined) theme.faviconFileId = changes.faviconFileId;
    theme.updatedBy = actorId;
    return this.themeRepository.save(theme);
  }

  /** No side effects — assembles the same resolved bundle shape as `getCurrentTheme()`, for any theme regardless of status, for FR-BRND-002.1's side-by-side preview step. */
  async preview(themeId: string): Promise<ResolvedThemeBundle> {
    const theme = await this.themeRepository.findByIdOrFail(themeId);
    return await this.toBundle(theme);
  }

  /** Archives the previously-published theme (if any) and publishes `id`, atomically. A no-op if `id` is already PUBLISHED. */
  async publish(id: string, actorId: string | null): Promise<BrndThemeEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const target = await this.themeRepository.findByIdOrFail(id, manager);
      if (target.status === "PUBLISHED") {
        return target;
      }

      const previous = await this.themeRepository.findPublished(manager);
      if (previous && previous.id !== target.id) {
        previous.status = "ARCHIVED";
        previous.updatedBy = actorId;
        await this.themeRepository.save(previous, manager);
      }

      target.status = "PUBLISHED";
      target.publishedAt = new Date();
      target.updatedBy = actorId;
      const saved = await this.themeRepository.save(target, manager);

      await this.writePublishedEvent(manager, saved, previous, false, actorId);
      return saved;
    });
  }

  /** Re-publishes a previously ARCHIVED theme — same unset-then-set transactional swap as `publish()`. */
  async revert(id: string, actorId: string | null): Promise<BrndThemeEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const target = await this.themeRepository.findByIdOrFail(id, manager);
      if (target.status !== "ARCHIVED") {
        throw new ValidationException(
          `Only an ARCHIVED theme can be reverted to — "${target.name}" is ${target.status}`,
          { themeId: id, status: target.status },
        );
      }

      const previous = await this.themeRepository.findPublished(manager);
      if (previous && previous.id !== target.id) {
        previous.status = "ARCHIVED";
        previous.updatedBy = actorId;
        await this.themeRepository.save(previous, manager);
      }

      target.status = "PUBLISHED";
      target.publishedAt = new Date();
      target.updatedBy = actorId;
      const saved = await this.themeRepository.save(target, manager);

      await this.writePublishedEvent(manager, saved, previous, true, actorId);
      return saved;
    });
  }

  /**
   * The one PUBLISHED theme, resolved to a CSS-variable bundle — or the
   * hardcoded Infoney-default fallback if no theme has ever been published
   * (boot-time / pre-seed / pre-Docker environments, per
   * docs/phase-5/PROGRESS.md "Environment status"). This is what the public
   * `GET /branding/theme/current` endpoint serves.
   */
  async getCurrentTheme(): Promise<ResolvedThemeBundle> {
    const published = await this.themeRepository.findPublished();
    if (published) {
      return await this.toBundle(published);
    }
    // No brnd_theme row published yet — the hardcoded fallback has no file
    // references at all (logoFileId/faviconFileId are already null here),
    // so all 3 new URL fields are trivially null too; no FilesService call
    // needed on this branch.
    return {
      themeId: null,
      name: INFONEY_DEFAULT_THEME_NAME,
      status: "PUBLISHED",
      isFallback: true,
      cssVariables: buildThemeCssVariables(INFONEY_DEFAULT_THEME_TOKENS),
      tokens: INFONEY_DEFAULT_THEME_TOKENS,
      loginConfig: INFONEY_DEFAULT_LOGIN_CONFIG,
      documentConfig: INFONEY_DEFAULT_DOCUMENT_CONFIG,
      logoFileId: null,
      faviconFileId: null,
      logoUrl: null,
      faviconUrl: null,
      loginBackgroundImageUrl: null,
      publishedAt: null,
    };
  }

  /**
   * Resolves a persisted theme row to the full public bundle, including the
   * 3 signed-URL fields — an in-process DI call to `FilesService`
   * (constructor-injected, `platform/files` exported and already permitted
   * by `module-deps.json`'s `platform/branding.mayImport`), never over HTTP,
   * so `GET /files/:id/signed-url`'s `files:file:view` permission guard is
   * never in the request path. This is what lets the sidebar logo (any
   * authenticated user, regardless of `files:file:view`), the browser's own
   * favicon request (zero bearer token), and the pre-auth login page
   * background all resolve a displayable image from the already-`@Public()`
   * `GET /branding/theme/current` response.
   *
   * Each of the 3 lookups is resolved independently via `resolveFileUrl()`,
   * which swallows any failure to `null` rather than rejecting — a single
   * corrupt/orphaned `file_object` reference (which the `ON DELETE RESTRICT`
   * FK makes vanishingly unlikely in practice, but not impossible for a row
   * written before that constraint existed, or a storage-layer failure)
   * must not 500 the entire public bundle every authenticated/unauthenticated
   * page load depends on.
   */
  private async toBundle(theme: BrndThemeEntity): Promise<ResolvedThemeBundle> {
    const tokens = theme.tokens as ThemeTokens;
    const loginConfig = (theme.loginConfig ?? {}) as ThemeLoginConfig;

    const [logoUrl, faviconUrl, loginBackgroundImageUrl] = await Promise.all([
      this.resolveFileUrl(theme.logoFileId),
      this.resolveFileUrl(theme.faviconFileId),
      this.resolveFileUrl(loginConfig.backgroundImageFileId ?? null),
    ]);

    return {
      themeId: theme.id,
      name: theme.name,
      status: theme.status,
      isFallback: false,
      cssVariables: buildThemeCssVariables(tokens),
      tokens,
      loginConfig,
      documentConfig: (theme.documentConfig ?? {}) as ThemeDocumentConfig,
      logoFileId: theme.logoFileId,
      faviconFileId: theme.faviconFileId,
      logoUrl,
      faviconUrl,
      loginBackgroundImageUrl,
      publishedAt: theme.publishedAt,
    };
  }

  /** Null when `fileId` is null/unset, OR when `FilesService.getSignedUrl()` rejects for any reason — see `toBundle()`'s doc comment. */
  private async resolveFileUrl(fileId: string | null | undefined): Promise<string | null> {
    if (!fileId) return null;
    try {
      return await this.filesService.getSignedUrl(fileId, SIGNED_URL_EXPIRY_SECONDS);
    } catch (error) {
      this.logger.warn(
        `Failed to resolve signed URL for file_object ${fileId} while building a theme bundle — returning null for this field instead of failing the whole bundle: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async writePublishedEvent(
    manager: EntityManager,
    saved: BrndThemeEntity,
    previous: BrndThemeEntity | null,
    isRevert: boolean,
    actorId: string | null,
  ): Promise<void> {
    await this.outboxWriter.write(
      manager,
      new ThemePublishedEvent(saved.id, {
        fromThemeId: previous && previous.id !== saved.id ? previous.id : null,
        toThemeId: saved.id,
        isRevert,
        actorId,
      }),
    );
  }
}
