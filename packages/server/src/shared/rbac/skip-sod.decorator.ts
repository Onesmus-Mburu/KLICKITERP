import { SetMetadata } from "@nestjs/common";

export const SKIP_SOD_METADATA_KEY = "skipSoD";

/**
 * Opts a handler out of `SoDGuard`'s runtime segregation-of-duties check
 * (BR-SEC-01, docs/phase-3/02-communication-authentication.md §2.3). The
 * guard itself is built in the next pass, once usr_sod_rule has service-layer
 * evaluation logic.
 */
export const SkipSoD = (): MethodDecorator & ClassDecorator => SetMetadata(SKIP_SOD_METADATA_KEY, true);
