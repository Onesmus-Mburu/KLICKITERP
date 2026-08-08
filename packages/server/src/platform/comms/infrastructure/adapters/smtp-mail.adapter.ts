import { createTransport, Transporter } from "nodemailer";
import { MailPort } from "../ports/mail.port";
import { SendResult } from "../ports/send-result";

/** Sourced from a `set_integration_config` row of `kind='SMTP'` (decrypted by `AdapterResolverService`), never raw env vars. */
export interface SmtpMailConfig {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  fromAddress: string;
  fromName?: string;
}

/**
 * Real `nodemailer`-based `MailPort` implementation. `meta?.subject` carries
 * the rendered subject line (see `MailPort`'s doc comment); `body` is sent
 * as HTML — every template in this codebase is authored as plain text with
 * `{{variable}}` placeholders (`TemplatesService.render()`), which is valid
 * (if unstyled) HTML too, so no separate plain-text branch is needed.
 */
export class SmtpMailAdapter implements MailPort {
  private readonly transporter: Transporter;

  constructor(private readonly config: SmtpMailConfig) {
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? false,
      auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
    });
  }

  async send(recipient: string, body: string, meta?: Record<string, unknown>): Promise<SendResult> {
    const subject = typeof meta?.subject === "string" ? meta.subject : "(no subject)";
    const from = this.config.fromName ? `"${this.config.fromName}" <${this.config.fromAddress}>` : this.config.fromAddress;

    const info = await this.transporter.sendMail({
      from,
      to: recipient,
      subject,
      html: body,
    });

    return { providerRef: info.messageId };
  }
}
