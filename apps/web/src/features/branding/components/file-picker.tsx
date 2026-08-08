"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ImageOff, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useSignedUrl, useUploadFile } from "../hooks/use-file-upload";
import { FILE_ENTITY_TYPE } from "../constants";

export interface FilePickerProps {
  label: string;
  value: string | null;
  onChange: (fileId: string | null) => void;
  accept: string;
  disabled?: boolean;
}

/**
 * The first real file-upload widget anywhere in this app. `entityType` is
 * hardcoded to `FILE_ENTITY_TYPE` ("BRND_THEME") rather than a prop — every
 * caller today is this Branding module, and it's a free-text field
 * server-side (`UploadFileFieldsDto.entityType`). `entityId` is always
 * omitted — a theme being created in this form has no id yet at
 * picker-interaction time, and the field is genuinely optional server-side.
 *
 * **Remove never calls `DELETE /files/:id`** — it only clears the local
 * `value` reference (`onChange(null)`). `FilesService`'s own doc comment
 * (`packages/server/src/platform/files/application/files.service.ts`)
 * documents files as "immutable once uploaded (delete-and-reupload, never
 * edit)" and exposes upload/read/delete/list only — deleting the underlying
 * `file_object` row here would be a real, irreversible action this widget
 * has no business taking on a user's behalf just because they changed their
 * mind about which file a theme references. This leaves orphaned
 * `file_object` rows behind on every swap — an accepted, documented
 * tradeoff (a storage-GC job is separate, deliberately deferred work), not a
 * silently hidden one.
 */
export function FilePicker({ label, value, onChange, accept, disabled }: FilePickerProps) {
  const t = useTranslations("branding.filePicker");
  const tCommon = useTranslations("common");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadFile();
  const signedUrlQuery = useSignedUrl(value);
  const [error, setError] = React.useState<string | null>(null);

  function openPicker() {
    if (disabled || uploadMutation.isPending) return;
    inputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file again later
    if (!file) return;
    setError(null);
    try {
      const created = await uploadMutation.mutateAsync({ file, entityType: FILE_ENTITY_TYPE });
      onChange(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("uploadError"));
    }
  }

  const busy = uploadMutation.isPending;

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => void handleFileSelected(e)}
        disabled={disabled}
      />

      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-border p-3">
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30">
            {signedUrlQuery.isPending ? (
              <span title={t("loadingPreview")}>
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </span>
            ) : signedUrlQuery.isError ? (
              <span title={t("previewError")}>
                <ImageOff className="size-4 text-muted-foreground" />
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- signed URLs are opaque, time-limited MinIO URLs; next/image's remote-pattern allowlist doesn't fit a per-request-signed host.
              <img src={signedUrlQuery.data?.url} alt={label} className="size-full object-cover" />
            )}
          </div>
          <div className="flex flex-1 flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={openPicker} disabled={disabled || busy}>
              {busy ? t("uploading") : t("replace")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)} disabled={disabled || busy}>
              <X className="size-4" />
              {t("remove")}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled || busy}
          className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-8 text-center transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-tint-primary">
            {busy ? <Loader2 className="size-5 animate-spin text-primary" /> : <Upload className="size-5 text-primary" />}
          </span>
          <span className="text-sm font-medium text-foreground">{busy ? t("uploading") : tCommon("upload")}</span>
        </button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
