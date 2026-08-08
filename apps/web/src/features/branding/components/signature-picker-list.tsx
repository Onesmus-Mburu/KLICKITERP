"use client";

import { useTranslations } from "next-intl";
import { FilePicker } from "./file-picker";

export interface SignaturePickerListProps {
  label: string;
  value: string[];
  onChange: (fileIds: string[]) => void;
  disabled?: boolean;
}

/**
 * Thin wrapper over `FilePicker` managing the one genuinely-plural file
 * field in this module (`documentConfig.signatureFileIds: string[]`) — one
 * `FilePicker` per existing id (removing one splices it out of the array,
 * never leaving a gap) plus one trailing empty slot whose non-null
 * `onChange` APPENDS a new id rather than replacing anything. `accept=
 * "image/*"` for every slot — a signature is always an image.
 */
export function SignaturePickerList({ label, value, onChange, disabled }: SignaturePickerListProps) {
  const t = useTranslations("branding.form.documents");

  function handleExistingChange(index: number, fileId: string | null) {
    const next = [...value];
    if (fileId === null) {
      next.splice(index, 1);
    } else {
      next[index] = fileId;
    }
    onChange(next);
  }

  function handleNewChange(fileId: string | null) {
    if (fileId !== null) onChange([...value, fileId]);
  }

  return (
    <div className="space-y-3">
      {value.map((fileId, index) => (
        <FilePicker
          key={`${index}-${fileId}`}
          label={`${label} ${index + 1}`}
          value={fileId}
          onChange={(next) => handleExistingChange(index, next)}
          accept="image/*"
          disabled={disabled}
        />
      ))}
      <FilePicker label={t("addSignature")} value={null} onChange={handleNewChange} accept="image/*" disabled={disabled} />
    </div>
  );
}
