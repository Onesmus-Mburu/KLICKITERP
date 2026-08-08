import { Injectable } from "@nestjs/common";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { CommChannel, CommTemplateEntity } from "../domain/comm-template.entity";
import { CommTemplateRepository } from "../infrastructure/comm-template.repository";

export interface CreateTemplateInput {
  eventCode: string;
  channel: CommChannel;
  locale?: string;
  subject?: string | null;
  body: string;
  variables?: unknown;
  isActive?: boolean;
}

export interface UpdateTemplateInput {
  subject?: string | null;
  body?: string;
  variables?: unknown;
  isActive?: boolean;
}

export interface RenderedTemplate {
  subject?: string;
  body: string;
}

const DEFAULT_LOCALE = "en";
/** `{{variableName}}` — simple, no nested expressions/conditionals (task brief for this module). */
const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * CRUD for `comm_template` plus `render()` — a simple `{{variableName}}`
 * substitution against the resolved template's `body`/`subject`, falling
 * back to `locale='en'` when the requested locale has no row for
 * `(eventCode, channel)`, and throwing `NotFoundException` if neither
 * exists. Substitution never fails on an unmatched placeholder or an unused
 * supplied variable — it just leaves unmatched `{{...}}` tokens verbatim in
 * the rendered output, matching this module's "simple" substitution scope.
 */
@Injectable()
export class TemplatesService {
  constructor(private readonly templateRepository: CommTemplateRepository) {}

  async create(input: CreateTemplateInput, actorId: string | null): Promise<CommTemplateEntity> {
    return this.templateRepository.create({
      eventCode: input.eventCode,
      channel: input.channel,
      locale: input.locale ?? DEFAULT_LOCALE,
      subject: input.subject ?? null,
      body: input.body,
      variables: input.variables ?? {},
      isActive: input.isActive ?? true,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async list(): Promise<CommTemplateEntity[]> {
    return this.templateRepository.list();
  }

  async findByIdOrFail(id: string): Promise<CommTemplateEntity> {
    return this.templateRepository.findByIdOrFail(id);
  }

  async update(id: string, changes: UpdateTemplateInput, actorId: string | null): Promise<CommTemplateEntity> {
    const template = await this.templateRepository.findByIdOrFail(id);
    if (changes.subject !== undefined) template.subject = changes.subject;
    if (changes.body !== undefined) template.body = changes.body;
    if (changes.variables !== undefined) template.variables = changes.variables;
    if (changes.isActive !== undefined) template.isActive = changes.isActive;
    template.updatedBy = actorId;
    return this.templateRepository.save(template);
  }

  async delete(id: string): Promise<void> {
    await this.templateRepository.findByIdOrFail(id);
    await this.templateRepository.deleteById(id);
  }

  /**
   * Resolves `(eventCode, channel, locale)`, falling back to `'en'` when the
   * requested locale has no row, then substitutes `variables` into
   * `body`/`subject`. Throws `NotFoundException` when neither the requested
   * locale nor `'en'` has a matching template.
   */
  async render(
    eventCode: string,
    channel: CommChannel,
    locale: string,
    variables: Record<string, string>,
  ): Promise<RenderedTemplate> {
    let template = await this.templateRepository.findByEventChannelLocale(eventCode, channel, locale);
    if (!template && locale !== DEFAULT_LOCALE) {
      template = await this.templateRepository.findByEventChannelLocale(eventCode, channel, DEFAULT_LOCALE);
    }
    if (!template) {
      throw new NotFoundException("CommTemplate", `${eventCode}/${channel}/${locale} (and no '${DEFAULT_LOCALE}' fallback)`);
    }

    return {
      subject: template.subject ? substitute(template.subject, variables) : undefined,
      body: substitute(template.body, variables),
    };
  }
}

function substitute(text: string, variables: Record<string, string>): string {
  return text.replace(PLACEHOLDER_PATTERN, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : match,
  );
}
