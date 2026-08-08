/**
 * The single mirroring convention used by both the generator
 * (`generate-zod-schemas.ts`) and the completeness check
 * (`src/__tests__/completeness.spec.ts`), so both sides can never drift from
 * each other by construction.
 *
 * `packages/server/src/platform/users/api/dto/create-user.dto.ts`
 *   -> `packages/contracts/src/platform/users/create-user.schema.ts`
 *
 * i.e.: drop the `api/dto/` segment (redundant once the file lives under a
 * package whose whole purpose is "the DTO/schema layer"), keep the module
 * path exactly, swap the `.dto.ts` suffix for `.schema.ts`. Files with no
 * `api/dto/` segment (e.g. `shared/pagination/pagination.dto.ts`, which lives
 * directly under `shared/`) keep their full relative directory unchanged.
 */
export function computeOutRelativePath(relativePathFromServerSrc: string): string {
  return relativePathFromServerSrc.replace(/\/api\/dto\//, "/").replace(/\.dto\.ts$/, ".schema.ts");
}

export function schemaVarNameFor(className: string): string {
  return `${className}Schema`;
}
