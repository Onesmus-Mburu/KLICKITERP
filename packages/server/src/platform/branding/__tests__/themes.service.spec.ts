import { DataSource, EntityManager } from "typeorm";
import { ThemesService } from "../application/themes.service";
import { INFONEY_DEFAULT_THEME_NAME, INFONEY_DEFAULT_THEME_TOKENS } from "../application/infoney-default-theme";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { BrndThemeEntity } from "../domain/brnd-theme.entity";

const SAMPLE_TOKENS = {
  colors: {
    primary: "#573399",
    secondary: "#FBF80D",
    accent: "#CFA22D",
    primaryLight: "#9371F8",
    primarySoft: "#A972FA",
    primaryLavender: "#CCACF4",
    surface: "#FDFDFE",
    dark: "#341E40",
    black: "#000000",
  },
  fontFamily: "Poppins, sans-serif",
  radius: { sm: "4px", md: "8px", lg: "16px", xl: "24px" },
  spacing: { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "24px", xxl: "32px", xxxl: "48px" },
};

describe("ThemesService", () => {
  let dataSource: DataSource;
  let themeRepository: {
    findById: jest.Mock;
    findByIdOrFail: jest.Mock;
    findByName: jest.Mock;
    findPublished: jest.Mock;
    list: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let outboxWriter: { write: jest.Mock };
  let filesService: { getSignedUrl: jest.Mock };
  let service: ThemesService;

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;

    themeRepository = {
      findById: jest.fn(),
      findByIdOrFail: jest.fn(),
      findByName: jest.fn(async () => null),
      findPublished: jest.fn(async () => null),
      list: jest.fn(),
      create: jest.fn(async (data: Partial<BrndThemeEntity>) => ({ id: "theme-new", ...data }) as BrndThemeEntity),
      save: jest.fn(async (entity: BrndThemeEntity) => entity),
    };
    outboxWriter = { write: jest.fn(async () => undefined) };
    filesService = { getSignedUrl: jest.fn(async (fileId: string) => `https://signed.example/${fileId}`) };

    service = new ThemesService(dataSource, themeRepository as never, outboxWriter as never, filesService as never);
  });

  describe("create", () => {
    it("always starts a new theme as DRAFT", async () => {
      const created = await service.create({ name: "Custom", tokens: SAMPLE_TOKENS }, "actor-1");

      expect(themeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Custom", status: "DRAFT", publishedAt: null }),
      );
      expect(created.status).toBe("DRAFT");
    });
  });

  describe("update — PUBLISHED guard", () => {
    it("rejects editing a theme that is currently PUBLISHED", async () => {
      themeRepository.findByIdOrFail.mockResolvedValue({ id: "t-1", name: "Live", status: "PUBLISHED" });

      await expect(service.update("t-1", { name: "New Name" }, "actor-1")).rejects.toBeInstanceOf(
        ValidationException,
      );
      expect(themeRepository.save).not.toHaveBeenCalled();
    });

    it("allows editing a DRAFT theme", async () => {
      themeRepository.findByIdOrFail.mockResolvedValue({ id: "t-1", name: "Draft", status: "DRAFT" });

      await service.update("t-1", { name: "Renamed Draft" }, "actor-1");

      expect(themeRepository.save).toHaveBeenCalledWith(expect.objectContaining({ name: "Renamed Draft" }));
    });

    it("allows editing an ARCHIVED theme", async () => {
      themeRepository.findByIdOrFail.mockResolvedValue({ id: "t-1", name: "Old", status: "ARCHIVED" });

      await service.update("t-1", { name: "Renamed Old" }, "actor-1");

      expect(themeRepository.save).toHaveBeenCalledWith(expect.objectContaining({ name: "Renamed Old" }));
    });
  });

  describe("publish — exactly-one-PUBLISHED (uq_brnd_theme_published_p)", () => {
    it("archives the previously-published theme before publishing the new one, inside one transaction", async () => {
      const previous = { id: "theme-1", name: "Old", status: "PUBLISHED", tokens: SAMPLE_TOKENS };
      const target = { id: "theme-2", name: "New", status: "DRAFT", tokens: SAMPLE_TOKENS };
      themeRepository.findByIdOrFail.mockResolvedValue(target);
      themeRepository.findPublished.mockResolvedValue(previous);

      const result = await service.publish("theme-2", "actor-1");

      expect(themeRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "theme-1", status: "ARCHIVED" }),
        expect.anything(),
      );
      expect(themeRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "theme-2", status: "PUBLISHED" }),
        expect.anything(),
      );
      expect(result.status).toBe("PUBLISHED");
      expect(result.publishedAt).toBeInstanceOf(Date);
      expect(outboxWriter.write).toHaveBeenCalledTimes(1);
    });

    it("is a no-op unset when there is no previously-published theme", async () => {
      const target = { id: "theme-1", name: "First", status: "DRAFT", tokens: SAMPLE_TOKENS };
      themeRepository.findByIdOrFail.mockResolvedValue(target);
      themeRepository.findPublished.mockResolvedValue(null);

      await service.publish("theme-1", null);

      expect(themeRepository.save).toHaveBeenCalledTimes(1);
      expect(themeRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "theme-1", status: "PUBLISHED" }),
        expect.anything(),
      );
    });

    it("is a no-op re-save when the target is already PUBLISHED", async () => {
      const target = { id: "theme-1", name: "Live", status: "PUBLISHED", tokens: SAMPLE_TOKENS };
      themeRepository.findByIdOrFail.mockResolvedValue(target);

      const result = await service.publish("theme-1", "actor-1");

      expect(themeRepository.save).not.toHaveBeenCalled();
      expect(outboxWriter.write).not.toHaveBeenCalled();
      expect(result).toBe(target);
    });
  });

  describe("revert", () => {
    it("re-publishes a previously ARCHIVED theme, archiving whatever is currently published", async () => {
      const currentlyPublished = { id: "theme-2", name: "Live", status: "PUBLISHED", tokens: SAMPLE_TOKENS };
      const target = { id: "theme-1", name: "Old", status: "ARCHIVED", tokens: SAMPLE_TOKENS };
      themeRepository.findByIdOrFail.mockResolvedValue(target);
      themeRepository.findPublished.mockResolvedValue(currentlyPublished);

      const result = await service.revert("theme-1", "actor-1");

      expect(themeRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "theme-2", status: "ARCHIVED" }),
        expect.anything(),
      );
      expect(themeRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "theme-1", status: "PUBLISHED" }),
        expect.anything(),
      );
      expect(result.status).toBe("PUBLISHED");
      expect(outboxWriter.write).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ payload: expect.objectContaining({ isRevert: true }) }),
      );
    });

    it("rejects reverting a theme that is not ARCHIVED", async () => {
      themeRepository.findByIdOrFail.mockResolvedValue({ id: "theme-1", name: "Draft", status: "DRAFT" });

      await expect(service.revert("theme-1", "actor-1")).rejects.toBeInstanceOf(ValidationException);
      expect(themeRepository.save).not.toHaveBeenCalled();
    });
  });

  describe("preview", () => {
    it("resolves any theme (regardless of status) to a CSS-variable bundle with no side effects", async () => {
      themeRepository.findByIdOrFail.mockResolvedValue({
        id: "theme-1",
        name: "Draft",
        status: "DRAFT",
        tokens: SAMPLE_TOKENS,
        loginConfig: { welcomeText: "Hi" },
        documentConfig: { headerText: "Header" },
        logoFileId: null,
        faviconFileId: null,
        publishedAt: null,
      });

      const bundle = await service.preview("theme-1");

      expect(bundle.isFallback).toBe(false);
      expect(bundle.cssVariables["--color-primary"]).toBe("#573399");
      expect(bundle.loginConfig).toEqual({ welcomeText: "Hi" });
      expect(themeRepository.save).not.toHaveBeenCalled();
    });
  });

  describe("toBundle — signed URL resolution (Slice 14 Part 3)", () => {
    it("resolves logoUrl/faviconUrl/loginBackgroundImageUrl via FilesService when all 3 file ids are set", async () => {
      themeRepository.findByIdOrFail.mockResolvedValue({
        id: "theme-1",
        name: "Fully Branded",
        status: "DRAFT",
        tokens: SAMPLE_TOKENS,
        loginConfig: { welcomeText: "Hi", backgroundImageFileId: "bg-file-1" },
        documentConfig: {},
        logoFileId: "logo-file-1",
        faviconFileId: "favicon-file-1",
        publishedAt: null,
      });

      const bundle = await service.preview("theme-1");

      expect(bundle.logoUrl).toBe("https://signed.example/logo-file-1");
      expect(bundle.faviconUrl).toBe("https://signed.example/favicon-file-1");
      expect(bundle.loginBackgroundImageUrl).toBe("https://signed.example/bg-file-1");
      expect(filesService.getSignedUrl).toHaveBeenCalledTimes(3);
      expect(filesService.getSignedUrl).toHaveBeenCalledWith("logo-file-1", 86400);
      expect(filesService.getSignedUrl).toHaveBeenCalledWith("favicon-file-1", 86400);
      expect(filesService.getSignedUrl).toHaveBeenCalledWith("bg-file-1", 86400);
    });

    it("returns null for each URL field whose file id is unset, without calling FilesService for it", async () => {
      themeRepository.findByIdOrFail.mockResolvedValue({
        id: "theme-1",
        name: "No Branding Assets",
        status: "DRAFT",
        tokens: SAMPLE_TOKENS,
        loginConfig: {},
        documentConfig: {},
        logoFileId: null,
        faviconFileId: null,
        publishedAt: null,
      });

      const bundle = await service.preview("theme-1");

      expect(bundle.logoUrl).toBeNull();
      expect(bundle.faviconUrl).toBeNull();
      expect(bundle.loginBackgroundImageUrl).toBeNull();
      expect(filesService.getSignedUrl).not.toHaveBeenCalled();
    });

    it("resolves null for one URL without failing the whole bundle when FilesService.getSignedUrl rejects for that id", async () => {
      themeRepository.findByIdOrFail.mockResolvedValue({
        id: "theme-1",
        name: "One Broken Reference",
        status: "DRAFT",
        tokens: SAMPLE_TOKENS,
        loginConfig: {},
        documentConfig: {},
        logoFileId: "logo-file-missing",
        faviconFileId: "favicon-file-ok",
        publishedAt: null,
      });
      filesService.getSignedUrl.mockImplementation(async (fileId: string) => {
        if (fileId === "logo-file-missing") {
          throw new Error("file_object not found");
        }
        return `https://signed.example/${fileId}`;
      });

      const bundle = await service.preview("theme-1");

      expect(bundle.logoUrl).toBeNull();
      expect(bundle.faviconUrl).toBe("https://signed.example/favicon-file-ok");
      expect(bundle.name).toBe("One Broken Reference");
    });
  });

  describe("getCurrentTheme", () => {
    it("returns the resolved bundle for the PUBLISHED theme when one exists", async () => {
      themeRepository.findPublished.mockResolvedValue({
        id: "theme-1",
        name: "Live",
        status: "PUBLISHED",
        tokens: SAMPLE_TOKENS,
        loginConfig: {},
        documentConfig: {},
        logoFileId: "logo-1",
        faviconFileId: null,
        publishedAt: new Date("2026-01-01T00:00:00Z"),
      });

      const bundle = await service.getCurrentTheme();

      expect(bundle.isFallback).toBe(false);
      expect(bundle.themeId).toBe("theme-1");
      expect(bundle.logoFileId).toBe("logo-1");
    });

    it("falls back to the hardcoded Infoney default bundle when nothing is published yet", async () => {
      themeRepository.findPublished.mockResolvedValue(null);

      const bundle = await service.getCurrentTheme();

      expect(bundle.isFallback).toBe(true);
      expect(bundle.themeId).toBeNull();
      expect(bundle.name).toBe(INFONEY_DEFAULT_THEME_NAME);
      expect(bundle.cssVariables["--color-primary"]).toBe(INFONEY_DEFAULT_THEME_TOKENS.colors.primary);
      expect(bundle.cssVariables["--font-family"]).toBe(INFONEY_DEFAULT_THEME_TOKENS.fontFamily);
    });
  });
});
