import { ObjectLiteral, SelectQueryBuilder } from "typeorm";
import { PaginationQueryDto } from "./pagination.dto";

export interface PaginatedResult<T> {
  items: T[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
  };
}

export interface PaginateOptions<T extends ObjectLiteral> {
  /** Alias-qualified column names (e.g. "user.createdAt") allowed as sort targets. */
  allowedSortColumns: readonly string[];
  /** Alias-qualified fallback sort column when `sortBy` is absent or not allow-listed. */
  defaultSortColumn: string;
  /** Optional hook to apply additional WHERE/JOIN filtering before counting/paginating. */
  filter?: (qb: SelectQueryBuilder<T>) => void;
}

/**
 * Applies pagination, allow-listed sorting, and an optional filter hook to a
 * TypeORM SelectQueryBuilder (G-03). `sortBy` is only ever taken from the
 * allow-list — never interpolated directly from client input — to close off
 * SQL injection via ORDER BY.
 */
export async function paginate<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  query: PaginationQueryDto,
  options: PaginateOptions<T>,
): Promise<PaginatedResult<T>> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;

  if (options.filter) {
    options.filter(qb);
  }

  const sortColumn =
    query.sortBy && options.allowedSortColumns.includes(query.sortBy)
      ? query.sortBy
      : options.defaultSortColumn;
  const sortDir = query.sortDir ?? "ASC";

  qb.orderBy(sortColumn, sortDir)
    .skip((page - 1) * pageSize)
    .take(pageSize);

  const [items, total] = await qb.getManyAndCount();

  return {
    items,
    meta: {
      total,
      page,
      pageSize,
      pageCount: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    },
  };
}
