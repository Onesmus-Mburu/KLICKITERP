import { TemplatesService } from "../application/templates.service";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { CommTemplateEntity } from "../domain/comm-template.entity";

describe("TemplatesService", () => {
  let templateRepository: {
    findByEventChannelLocale: jest.Mock;
    findByIdOrFail: jest.Mock;
    list: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    deleteById: jest.Mock;
  };
  let service: TemplatesService;

  beforeEach(() => {
    templateRepository = {
      findByEventChannelLocale: jest.fn(),
      findByIdOrFail: jest.fn(),
      list: jest.fn(),
      create: jest.fn(async (data: Partial<CommTemplateEntity>) => ({ id: "tpl-1", ...data }) as CommTemplateEntity),
      save: jest.fn(async (e: CommTemplateEntity) => e),
      deleteById: jest.fn(),
    };
    service = new TemplatesService(templateRepository as never);
  });

  describe("render", () => {
    it("substitutes {{variableName}} placeholders in body and subject", async () => {
      templateRepository.findByEventChannelLocale.mockResolvedValueOnce({
        subject: "Hello {{name}}",
        body: "Dear {{name}}, your balance is {{balance}}.",
      } as CommTemplateEntity);

      const result = await service.render("FEE_DUE", "EMAIL", "en", { name: "Amina", balance: "KES 500" });

      expect(result.subject).toBe("Hello Amina");
      expect(result.body).toBe("Dear Amina, your balance is KES 500.");
    });

    it("leaves unmatched placeholders verbatim", async () => {
      templateRepository.findByEventChannelLocale.mockResolvedValueOnce({
        subject: null,
        body: "Hi {{name}}, code {{missing}}",
      } as CommTemplateEntity);

      const result = await service.render("FEE_DUE", "EMAIL", "en", { name: "Amina" });

      expect(result.body).toBe("Hi Amina, code {{missing}}");
      expect(result.subject).toBeUndefined();
    });

    it("falls back to locale='en' when the requested locale has no row", async () => {
      templateRepository.findByEventChannelLocale.mockImplementation(
        async (_eventCode: string, _channel: string, locale: string) => {
          if (locale === "en") {
            return { subject: null, body: "Hello {{name}}" } as CommTemplateEntity;
          }
          return null;
        },
      );

      const result = await service.render("FEE_DUE", "SMS", "sw", { name: "Juma" });

      expect(result.body).toBe("Hello Juma");
      expect(templateRepository.findByEventChannelLocale).toHaveBeenNthCalledWith(1, "FEE_DUE", "SMS", "sw");
      expect(templateRepository.findByEventChannelLocale).toHaveBeenNthCalledWith(2, "FEE_DUE", "SMS", "en");
    });

    it("throws NotFoundException when neither the requested locale nor 'en' has a template", async () => {
      templateRepository.findByEventChannelLocale.mockResolvedValue(null);

      await expect(service.render("UNKNOWN_EVENT", "SMS", "sw", {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it("does not attempt an 'en' fallback lookup when the requested locale already is 'en'", async () => {
      templateRepository.findByEventChannelLocale.mockResolvedValue(null);

      await expect(service.render("UNKNOWN_EVENT", "SMS", "en", {})).rejects.toBeInstanceOf(NotFoundException);
      expect(templateRepository.findByEventChannelLocale).toHaveBeenCalledTimes(1);
    });
  });
});
