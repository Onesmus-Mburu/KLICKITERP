/**
 * Mirrors `packages/server/src/platform/branding/api/dto/theme-tokens.dto.ts`'s
 * own `HEX_COLOR_PATTERN` byte-for-byte (that constant isn't exported through
 * `@klickit/contracts` — only the zod schema's inlined `.regex()` mirror is,
 * per this codebase's DTO/entity boundary). Used by `ColorField` to gate
 * when a typed hex value is committed to the swatch/form value, avoiding
 * mid-keystroke flicker on an invalid partial (e.g. "#57").
 */
export const HEX_COLOR_PATTERN = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

/**
 * `file_object.entity_type` every upload from this module is tagged with —
 * a free-text field server-side (`UploadFileFieldsDto.entityType`), not a
 * real FK/enum. Hardcoded here rather than threaded as a prop through
 * `FilePicker` — every caller today is Branding (logo/favicon/login
 * background/signatures).
 */
export const FILE_ENTITY_TYPE = "BRND_THEME";

/**
 * Mirrors the real DTOs' own `@MaxLength`/class-validator constraints
 * (`theme-tokens.dto.ts`, `login-config.dto.ts`, `document-config.dto.ts`,
 * `create-theme.dto.ts`) — every text `<Input maxLength>` in the 5-section
 * editor binds to one of these, not a re-guessed number.
 */
export const THEME_NAME_MAX_LENGTH = 60;
/** `ThemeRadiusDto`/`ThemeSpacingDto` leaf fields — plain CSS-length strings, e.g. "8px". */
export const TOKEN_LENGTH_MAX_LENGTH = 20;
export const FONT_FAMILY_MAX_LENGTH = 100;
export const LOGIN_WELCOME_TEXT_MAX_LENGTH = 200;
export const DOCUMENT_HEADER_FOOTER_MAX_LENGTH = 200;
export const DOCUMENT_WATERMARK_MAX_LENGTH = 100;

/** Matches `FilesController.signedUrl`'s own default (`DEFAULT_SIGNED_URL_EXPIRY_SECONDS`, `files.controller.ts`) — used whenever a caller doesn't need a longer-lived link. */
export const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 300;

/**
 * Byte-for-byte mirror of `ThemesService.update()`'s real 422 message
 * (`packages/server/src/platform/branding/application/themes.service.ts`):
 * `` `Theme "${theme.name}" is published and cannot be edited in place —
 * create a new draft instead` ``. Centralized here so both Part 2 surfaces
 * that need it — the disabled-Edit `title` attribute on the themes list
 * (`app/(erp)/branding/page.tsx`) and the read-only-when-published notice in
 * `theme-editor-form.tsx` — show the exact same real server rule, not two
 * independently-typed paraphrases that could drift apart.
 *
 * Deliberately NOT run through next-intl — matches this codebase's
 * established "server-generated error text is shown verbatim, never
 * translated" convention (e.g. `theme-editor-form.tsx`'s own `err.message`
 * root-error rendering elsewhere in this same file already does this for
 * every OTHER server error).
 */
export function publishedEditBlockedMessage(themeName: string): string {
  return `Theme "${themeName}" is published and cannot be edited in place — create a new draft instead`;
}
