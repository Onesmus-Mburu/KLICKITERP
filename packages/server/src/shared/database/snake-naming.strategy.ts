import { DefaultNamingStrategy, NamingStrategyInterface, Table } from "typeorm";

function toSnakeCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

/**
 * Per-module table-name prefixes (docs/phase-4/01-standards-and-migrations.md
 * §2 "Module prefixes" row). TypeORM's NamingStrategyInterface only receives
 * the entity class name at `tableName()` time — it has no notion of "which
 * module owns this entity" — so this map is exposed for entity authors to
 * compose explicit `@Entity(\`${MODULE_TABLE_PREFIXES.users}_user\`)` names
 * consistently, rather than the naming strategy guessing a prefix from the
 * class name (which would be fragile). Kept here, alongside the snake-case
 * strategy, so it is discovered and extended as each future module lands.
 */
export const MODULE_TABLE_PREFIXES = {
  users: "usr",
  settings: "set",
  branding: "brnd",
  files: "file",
  comms: "comm",
  approvals: "appr",
  accounting: "gl",
  students: "std",
  billing: "bill",
  payments: "pay",
  wallet: "wall",
  procurement: "proc",
  inventory: "inv",
  expenses: "exp",
  payroll: "pyrl",
  banking: "bank",
  fixedAssets: "fa",
  reporting: "rpt",
  integrations: "intg",
  backups: "bkp",
  outbox: "obx",
} as const;

/**
 * Converts camelCase entity property names to snake_case column/table names
 * (docs/phase-4/01-standards-and-migrations.md §2). Table names are almost
 * always given explicitly via `@Entity('usr_user')` to match the DDL 1:1;
 * this strategy's `tableName()` still snake-cases the class name as a
 * fallback for the rare entity that omits an explicit name.
 */
export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  tableName(targetName: string, userSpecifiedName: string | undefined): string {
    return userSpecifiedName ? userSpecifiedName : toSnakeCase(targetName);
  }

  columnName(propertyName: string, customName: string | undefined, embeddedPrefixes: string[]): string {
    return toSnakeCase(embeddedPrefixes.concat(customName ? customName : propertyName).join("_"));
  }

  relationName(propertyName: string): string {
    return toSnakeCase(propertyName);
  }

  joinColumnName(relationName: string, referencedColumnName: string): string {
    return toSnakeCase(`${relationName}_${referencedColumnName}`);
  }

  joinTableName(firstTableName: string, secondTableName: string): string {
    return toSnakeCase(`${firstTableName}_${secondTableName}`);
  }

  joinTableColumnName(tableName: string, propertyName: string, columnName?: string): string {
    return toSnakeCase(`${tableName}_${columnName ? columnName : propertyName}`);
  }

  classTableInheritanceParentColumnName(parentTableName: string, parentTableIdPropertyName: string): string {
    return toSnakeCase(`${parentTableName}_${parentTableIdPropertyName}`);
  }

  primaryKeyName(tableOrName: Table | string, _columnNames: string[]): string {
    const table = typeof tableOrName === "string" ? tableOrName : tableOrName.name;
    return `pk_${table}`;
  }

  uniqueConstraintName(tableOrName: Table | string, columnNames: string[]): string {
    const table = typeof tableOrName === "string" ? tableOrName : tableOrName.name;
    return `uq_${table}_${columnNames.join("_")}`;
  }

  foreignKeyName(
    tableOrName: Table | string,
    columnNames: string[],
    _referencedTablePath?: string,
    _referencedColumnNames?: string[],
  ): string {
    const table = typeof tableOrName === "string" ? tableOrName : tableOrName.name;
    return `fk_${table}_${columnNames.join("_")}`;
  }

  indexName(tableOrName: Table | string, columnNames: string[]): string {
    const table = typeof tableOrName === "string" ? tableOrName : tableOrName.name;
    return `ix_${table}_${columnNames.join("_")}`;
  }
}
