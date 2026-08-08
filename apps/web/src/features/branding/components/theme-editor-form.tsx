"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm, type Control, type Path, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CreateThemeDtoSchema,
  UpdateThemeDtoSchema,
  type CreateThemeDto,
  type CurrentThemeResponseDto,
  type DocumentConfigDto,
  type LoginConfigDto,
  type ThemeResponseDto,
  type ThemeTokensDto,
} from "@klickit/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError, parseFieldErrors } from "@/lib/api-error";
import { useCreateTheme, useUpdateTheme } from "../hooks/use-themes";
import type { UpdateThemePayload } from "../api/themes.api";
import { publishedEditBlockedMessage } from "../constants";
import { IdentitySection } from "./identity-section";
import { ColorsSection } from "./colors-section";
import { LoginSection } from "./login-section";
import { DocumentsSection } from "./documents-section";
import { ThemeDefaultsSection } from "./theme-defaults-section";

/**
 * Shared create/edit form shape — a structural superset of
 * `CreateThemeDto`/`UpdateThemeDto` (same "one local type, pick the zod
 * schema by mode" convention `StudentForm`'s own `StudentFormValues`
 * establishes). `tokens`/`loginConfig`/`documentConfig` are always FULLY
 * populated objects here (never `undefined`) even in edit mode, where the
 * real `UpdateThemeDtoSchema` marks them optional — a present object still
 * validates fine against each nested schema (every one of ITS OWN leaf
 * fields is independently optional), and always populating them keeps every
 * section component's `Controller` bindings simple (no "is this whole
 * sub-object present yet" branch anywhere in the 5 section components).
 *
 * **File-id fields use `undefined` (never `null`) as the form-internal "no
 * file" sentinel.** The real zod schemas have no `.nullable()` on
 * `logoFileId`/`faviconFileId`/`loginConfig.backgroundImageFileId`
 * (confirmed directly against each schema file) — a `null` reaching
 * `zodResolver` would fail validation for real, not just trip a TS gap.
 * Every `FilePicker` binding coalesces at the boundary:
 * `value={field.value ?? null}` / `onChange={(v) => field.onChange(v ??
 * undefined)}`.
 */
export interface ThemeFormValues {
  name: string;
  tokens: ThemeTokensDto;
  loginConfig: {
    backgroundImageFileId?: string;
    welcomeText?: string;
  };
  documentConfig: {
    headerText?: string;
    footerText?: string;
    watermarkText?: string;
    signatureFileIds: string[];
  };
  logoFileId?: string;
  faviconFileId?: string;
}

function defaultValuesFor(mode: "create" | "edit", theme?: ThemeResponseDto, seed?: CurrentThemeResponseDto): ThemeFormValues {
  if (mode === "edit" && theme) {
    return {
      name: theme.name,
      tokens: theme.tokens,
      loginConfig: {
        backgroundImageFileId: theme.loginConfig.backgroundImageFileId ?? undefined,
        welcomeText: theme.loginConfig.welcomeText ?? undefined,
      },
      documentConfig: {
        headerText: theme.documentConfig.headerText ?? undefined,
        footerText: theme.documentConfig.footerText ?? undefined,
        watermarkText: theme.documentConfig.watermarkText ?? undefined,
        signatureFileIds: theme.documentConfig.signatureFileIds ?? [],
      },
      logoFileId: theme.logoFileId ?? undefined,
      faviconFileId: theme.faviconFileId ?? undefined,
    };
  }

  // Create mode — `seed` is always supplied by the page before this
  // component renders (`branding/new/page.tsx` pre-fetches `/api/theme` via
  // `<QueryBoundary>`, so there's no internal loading branch needed here).
  const s = seed as CurrentThemeResponseDto;
  return {
    // Deliberately NOT `s.name` — two themes sharing a name would be
    // indistinguishable in the list, and `name` is the one field that
    // exists specifically to identify THIS draft, unlike every other field
    // here, which legitimately starts from "whatever's currently live."
    name: "",
    tokens: s.tokens,
    loginConfig: {
      backgroundImageFileId: s.loginConfig.backgroundImageFileId ?? undefined,
      welcomeText: s.loginConfig.welcomeText ?? undefined,
    },
    documentConfig: {
      headerText: s.documentConfig.headerText ?? undefined,
      footerText: s.documentConfig.footerText ?? undefined,
      watermarkText: s.documentConfig.watermarkText ?? undefined,
      signatureFileIds: s.documentConfig.signatureFileIds ?? [],
    },
    logoFileId: s.logoFileId ?? undefined,
    faviconFileId: s.faviconFileId ?? undefined,
  };
}

/**
 * `logoFileId`/`faviconFileId` three-way diff — mirrors the exact
 * convention `EditDepartmentDialog`'s `headUserId` handling established in
 * Slice 13 Part 3: omit entirely when unchanged, send `null` only when
 * actively cleared, send the new id otherwise. Valid here (unlike
 * `loginConfig.backgroundImageFileId`, see that field's own comment in
 * `onValid` below) because `UpdateThemeDto.logoFileId`/`faviconFileId` are
 * confirmed genuinely nullable server-side (`nullable: true` on both,
 * `update-theme.dto.ts`).
 */
function diffFileId(original: string | null, current: string | undefined): string | null | undefined {
  const next = current ?? null;
  return next === original ? undefined : next;
}

export interface ThemeEditorFormProps {
  mode: "create" | "edit";
  theme?: ThemeResponseDto;
  seed?: CurrentThemeResponseDto;
}

export function ThemeEditorForm({ mode, theme, seed }: ThemeEditorFormProps) {
  const t = useTranslations("branding.form");
  const tEdit = useTranslations("branding.editPage");
  const router = useRouter();
  const createMutation = useCreateTheme();
  const updateMutation = useUpdateTheme();
  const mutation = mode === "create" ? createMutation : updateMutation;
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  /**
   * Phase 6 Slice 14 Part 2 — matches the real 422 `PATCH
   * /branding/themes/:id` now returns once `status === "PUBLISHED"`
   * (`ThemesService.update()`). Client-side prevention, not just a UI
   * courtesy around the server rule: `onValid` below returns before ever
   * calling `updateMutation`, and every section is rendered `disabled` so
   * the fields can't even be edited in the first place.
   */
  const isReadOnly = mode === "edit" && theme?.status === "PUBLISHED";
  const fieldsDisabled = mutation.isPending || isReadOnly;

  const form = useForm<ThemeFormValues>({
    // Bound directly to the real CreateThemeDtoSchema/UpdateThemeDtoSchema
    // (`@klickit/contracts`) — no hand-tightened local mirror, same cast
    // convention `student-form.tsx` already establishes for this exact
    // "one shared form type, pick the schema by mode" shape.
    resolver: zodResolver(mode === "create" ? CreateThemeDtoSchema : UpdateThemeDtoSchema) as unknown as Resolver<ThemeFormValues>,
    defaultValues: defaultValuesFor(mode, theme, seed),
  });

  // "Stays on the page" success alert (edit mode only) clears itself as soon
  // as the admin touches the form again, so it never lingers as a stale
  // claim about the CURRENT (possibly now-different) form state.
  React.useEffect(() => {
    const subscription = form.watch(() => setSuccessMessage(null));
    return () => subscription.unsubscribe();
  }, [form]);

  async function onValid(values: ThemeFormValues) {
    // Belt-and-suspenders: the submit button is hidden and every field is
    // disabled in this state (see `isReadOnly` above), so this should be
    // unreachable in practice — kept as an explicit early return anyway,
    // per the plan's own "do NOT attempt to call PATCH at all in this
    // state" instruction, not relying on those alone.
    if (isReadOnly) return;
    setSuccessMessage(null);
    try {
      if (mode === "create") {
        const payload: CreateThemeDto = {
          name: values.name,
          tokens: values.tokens,
          loginConfig: {
            backgroundImageFileId: values.loginConfig.backgroundImageFileId,
            welcomeText: values.loginConfig.welcomeText || undefined,
          },
          documentConfig: {
            headerText: values.documentConfig.headerText || undefined,
            footerText: values.documentConfig.footerText || undefined,
            watermarkText: values.documentConfig.watermarkText || undefined,
            signatureFileIds: values.documentConfig.signatureFileIds,
          },
          logoFileId: values.logoFileId,
          faviconFileId: values.faviconFileId,
        };
        await createMutation.mutateAsync(payload);
        router.push("/branding");
        return;
      }

      if (!theme) return;
      const payload: UpdateThemePayload = {};

      if (values.name !== theme.name) payload.name = values.name;

      if (JSON.stringify(values.tokens) !== JSON.stringify(theme.tokens)) {
        payload.tokens = values.tokens;
      }

      // `loginConfig.backgroundImageFileId` has NO `logoFileId`-style
      // nullable gap — confirmed directly against `LoginConfigDto`'s DTO
      // class, generated OpenAPI type, AND zod schema: all three agree it's
      // plain `string | undefined`, never `null` (unlike `logoFileId`/
      // `faviconFileId`, which explicitly declare `nullable: true`).
      // `loginConfig` is sent as one atomic whole-object replacement when it
      // changes at all (`UpdateThemeDto.loginConfig`), so simply OMITTING
      // `backgroundImageFileId` from the reconstructed object below already
      // clears it server-side — no explicit `null` sentinel is needed, or
      // (per the real type) even accepted, here.
      const nextLoginConfig: LoginConfigDto = {
        backgroundImageFileId: values.loginConfig.backgroundImageFileId,
        welcomeText: values.loginConfig.welcomeText || undefined,
      };
      if (JSON.stringify(nextLoginConfig) !== JSON.stringify(theme.loginConfig)) {
        payload.loginConfig = nextLoginConfig;
      }

      const nextDocumentConfig: DocumentConfigDto = {
        headerText: values.documentConfig.headerText || undefined,
        footerText: values.documentConfig.footerText || undefined,
        watermarkText: values.documentConfig.watermarkText || undefined,
        signatureFileIds: values.documentConfig.signatureFileIds,
      };
      if (JSON.stringify(nextDocumentConfig) !== JSON.stringify(theme.documentConfig)) {
        payload.documentConfig = nextDocumentConfig;
      }

      const nextLogoFileId = diffFileId(theme.logoFileId, values.logoFileId);
      if (nextLogoFileId !== undefined) payload.logoFileId = nextLogoFileId;

      const nextFaviconFileId = diffFileId(theme.faviconFileId, values.faviconFileId);
      if (nextFaviconFileId !== undefined) payload.faviconFileId = nextFaviconFileId;

      if (Object.keys(payload).length === 0) {
        return;
      }

      await updateMutation.mutateAsync({ id: theme.id, dto: payload });
      setSuccessMessage(t("saveSuccess"));
    } catch (err) {
      if (err instanceof ApiError) {
        const parsed = parseFieldErrors(err);
        if (Object.keys(parsed).length > 0) {
          for (const [field, message] of Object.entries(parsed)) {
            form.setError(field as Path<ThemeFormValues>, { message });
          }
          form.setError("root", { message: t("genericError") });
          return;
        }
      }
      form.setError("root", { message: err instanceof ApiError ? err.message : t("genericError") });
    }
  }

  const rootError = form.formState.errors.root?.message;
  const control: Control<ThemeFormValues> = form.control;

  return (
    <form onSubmit={form.handleSubmit(onValid)} className="space-y-6">
      {isReadOnly && theme && (
        <Alert variant="warning">
          <AlertTitle>{tEdit("publishedGuardTitle")}</AlertTitle>
          <AlertDescription className="space-y-2">
            {/* The exact real server message, verbatim — see
                `publishedEditBlockedMessage`'s own doc comment for why this
                is deliberately not run through next-intl. */}
            <p>{publishedEditBlockedMessage(theme.name)}</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/branding/new">{tEdit("publishedGuardCta")}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {rootError && (
        <Alert variant="destructive">
          <AlertDescription>{rootError}</AlertDescription>
        </Alert>
      )}
      {successMessage && (
        <Alert variant="success">
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      <section className="space-y-3 rounded-lg border border-border p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("identity.title")}</h3>
          <p className="text-xs text-muted-foreground">{t("identity.description")}</p>
        </div>
        <IdentitySection control={control} disabled={fieldsDisabled} />
      </section>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("colors.title")}</h3>
          <p className="text-xs text-muted-foreground">{t("colors.description")}</p>
        </div>
        <ColorsSection control={control} disabled={fieldsDisabled} />
      </section>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("login.title")}</h3>
          <p className="text-xs text-muted-foreground">{t("login.description")}</p>
        </div>
        <LoginSection control={control} disabled={fieldsDisabled} />
      </section>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("documents.title")}</h3>
          <p className="text-xs text-muted-foreground">{t("documents.description")}</p>
        </div>
        <DocumentsSection control={control} disabled={fieldsDisabled} />
      </section>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("defaults.title")}</h3>
          <p className="text-xs text-muted-foreground">{t("defaults.description")}</p>
        </div>
        <ThemeDefaultsSection control={control} disabled={fieldsDisabled} />
      </section>

      <div className="flex items-center gap-3 pt-2">
        {/* Hidden, not just disabled, once read-only — there is nothing this
            button could legitimately do in this state (see `onValid`'s own
            early return above), so showing a permanently-disabled submit
            button here would just be a second, redundant "no" next to the
            warning Alert already explaining why. */}
        {!isReadOnly && (
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? t("submitting") : mode === "create" ? t("submitCreate") : t("submitEdit")}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
