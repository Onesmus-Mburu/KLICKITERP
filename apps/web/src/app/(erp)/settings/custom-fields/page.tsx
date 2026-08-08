"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { CUSTOM_FIELD_ENTITIES } from "@/features/settings/constants";
import { useCustomFields } from "@/features/settings/hooks/use-custom-fields";
import { CreateCustomFieldDialog } from "@/features/settings/components/create-custom-field-dialog";
import { EditCustomFieldDialog } from "@/features/settings/components/edit-custom-field-dialog";
import type { CustomFieldDefResponse, CustomFieldEntityType } from "@/features/settings/types";

const ALL_ENTITIES_VALUE = "ALL";

/**
 * `settings:custom-field:view`/`:manage` — the entity filter (STUDENT/
 * SUPPLIER/EMPLOYEE/ASSET) is a real server-side query param
 * (`GET /custom-fields?entity=`, `../hooks/use-custom-fields.ts`'s
 * `useCustomFields(entity)` refetches on change), not a client-side filter
 * over an already-fetched full list — Radix `<Select.Item>` can't carry an
 * empty-string value, so `ALL_ENTITIES_VALUE` is a local sentinel mapped to
 * `entity: undefined` before it ever reaches the hook.
 */
export default function CustomFieldsPage() {
  const t = useTranslations("settings.customFields");
  const [entityFilter, setEntityFilter] = React.useState<string>(ALL_ENTITIES_VALUE);
  const fieldsQuery = useCustomFields(entityFilter === ALL_ENTITIES_VALUE ? undefined : (entityFilter as CustomFieldEntityType));

  const columns = React.useMemo<ColumnDef<CustomFieldDefResponse>[]>(
    () => [
      { id: "entity", header: t("entity"), cell: ({ row }) => <Badge variant="soft-secondary">{t(`entities.${row.original.entity}`)}</Badge> },
      { accessorKey: "key", header: t("key") },
      { accessorKey: "label", header: t("label") },
      { id: "fieldType", header: t("fieldType"), cell: ({ row }) => t(`fieldTypes.${row.original.fieldType}`) },
      {
        id: "isRequired",
        header: t("isRequiredLabel"),
        cell: ({ row }) => <Badge variant={row.original.isRequired ? "soft-warning" : "soft-secondary"}>{row.original.isRequired ? t("required") : t("optional")}</Badge>,
      },
      { id: "actions", header: t("actionsHeader"), cell: ({ row }) => <EditCustomFieldDialog field={row.original} /> },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <CreateCustomFieldDialog />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="max-w-xs space-y-1.5">
            <Label>{t("filterByEntity")}</Label>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ENTITIES_VALUE}>{t("allEntities")}</SelectItem>
                {CUSTOM_FIELD_ENTITIES.map((entity) => (
                  <SelectItem key={entity} value={entity}>
                    {t(`entities.${entity}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={fieldsQuery} isEmpty={(d) => d.length === 0}>
            {(fields) => <DataTable columns={columns} data={fields} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
