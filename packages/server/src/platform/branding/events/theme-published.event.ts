import { BaseDomainEvent } from "../../../shared/events/domain-event";

export interface ThemePublishedPayload extends Record<string, unknown> {
  fromThemeId: string | null;
  toThemeId: string;
  isRevert: boolean;
  actorId: string | null;
}

/**
 * Published (via the transactional outbox) whenever `ThemesService.publish`
 * or `.revert` flips `status` to `PUBLISHED` on a new `brnd_theme` row. No
 * in-process handler subscribes yet — the future `web` app / reporting
 * engine will react to this to bust cached theme CSS (see the task brief for
 * this module).
 */
export class ThemePublishedEvent extends BaseDomainEvent<ThemePublishedPayload> {
  readonly eventType = "branding.theme.published";
  readonly aggregateType = "brnd_theme";

  constructor(themeId: string, payload: ThemePublishedPayload) {
    super(themeId, payload);
  }
}
