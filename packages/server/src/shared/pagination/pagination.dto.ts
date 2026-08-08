import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export type SortDirection = "ASC" | "DESC";

/**
 * Page/pageSize query DTO (G-03 server-side pagination). `sortBy` is
 * validated against an allow-list supplied per-endpoint by the paginate()
 * helper, never trusted as a raw column name (SQL-injection-by-orderBy).
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(["ASC", "DESC"])
  sortDir: SortDirection = "ASC";
}
