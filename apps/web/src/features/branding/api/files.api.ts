import type { FileObjectResponseDto, SignedUrlResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import { DEFAULT_SIGNED_URL_EXPIRY_SECONDS } from "../constants";

/**
 * Thin wrapper over `FilesController`'s upload + signed-url routes
 * (`packages/server/src/platform/files/api/files.controller.ts`) — the
 * generic file-upload surface every one of this module's `FilePicker`
 * instances sits on top of. `entityId` is never sent from this module — a
 * new/unsaved theme has no id yet at picker-interaction time, and it's
 * genuinely optional server-side (`UploadFileFieldsDto.entityId?`).
 *
 * **First real multipart upload anywhere in this app.** `openapi-fetch`
 * (@0.17.0)'s `defaultBodySerializer` passes a `FormData` instance through
 * untouched (`if (body instanceof FormData) return body;`, confirmed by
 * reading its source directly — Content-Type is deliberately left unset so
 * the browser fills in the multipart boundary itself), but the generated
 * request-body type for `POST /api/v1/files` (a plain `{file, entityType,
 * entityId}` object shape — NestJS/Swagger can't reflect a raw multipart
 * body into anything more specific) doesn't structurally match a real
 * `FormData` instance. Same `as unknown as X` codegen-gap-cast convention
 * `features/users/api/users.api.ts`'s `AssignDepartmentRequestBody` already
 * establishes, applied at this one call boundary — not a new pattern.
 */
export interface UploadFileRequestBody {
  file: string;
  entityType?: string;
}

export async function uploadFile(file: File, entityType: string): Promise<FileObjectResponseDto> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("entityType", entityType);
  return unwrapApiResult<FileObjectResponseDto>(
    await apiClient.POST("/api/v1/files", { body: formData as unknown as UploadFileRequestBody }),
  );
}

/**
 * `expirySeconds` has NO codegen gap — `SignedUrlQueryDto.expirySeconds` is
 * a genuinely closed preset set server-side
 * (`SIGNED_URL_EXPIRY_PRESETS_SECONDS`, `signed-url-query.dto.ts`), and the
 * generated query-param type correctly reflects it as
 * `"60"|"300"|"900"|"3600"|"86400"` (confirmed directly against
 * `generated/openapi-types.ts`'s `FilesController_signedUrl` entry). This
 * function accepts a plain number and narrows it to that exact string
 * literal union at the one call boundary that needs it — a real, narrow,
 * targeted cast reflecting a genuine server-side constraint (not a
 * codegen-gap workaround), safe because every caller in this module only
 * ever passes a value from that same preset set.
 */
type SignedUrlExpiryPreset = "60" | "300" | "900" | "3600" | "86400";

export async function getSignedUrl(
  fileId: string,
  expirySeconds: number = DEFAULT_SIGNED_URL_EXPIRY_SECONDS,
): Promise<SignedUrlResponseDto> {
  return unwrapApiResult<SignedUrlResponseDto>(
    await apiClient.GET("/api/v1/files/{id}/signed-url", {
      params: {
        path: { id: fileId },
        query: { expirySeconds: String(expirySeconds) as SignedUrlExpiryPreset },
      },
    }),
  );
}
