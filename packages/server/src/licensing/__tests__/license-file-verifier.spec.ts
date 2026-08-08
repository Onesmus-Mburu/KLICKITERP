import { generateKeyPairSync } from "node:crypto";
import { LicenseFilePayload, signLicensePayload, verifyLicenseBlob } from "../infrastructure/crypto/license-file-verifier";
import { ValidationException } from "../../shared/exceptions/validation.exception";

describe("license-file-verifier — Ed25519 signature verify/reject", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }) as string;
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;

  const payload: LicenseFilePayload = {
    school_id: "11111111-1111-7111-8111-111111111111",
    plan: "STANDARD",
    features: ["billing", "payroll"],
    valid_from: "2026-01-01",
    valid_to: "2027-01-01",
    grace_days: 14,
  };

  it("verifies a real signature and returns the exact payload", () => {
    const blob = signLicensePayload(payload, privateKeyPem);
    const result = verifyLicenseBlob(blob, publicKeyPem);
    expect(result).toEqual(payload);
  });

  it("rejects a tampered payload (signature no longer matches the mutated body)", () => {
    const blob = signLicensePayload(payload, privateKeyPem);
    const envelope = JSON.parse(blob) as { payload: LicenseFilePayload; signature: string };
    envelope.payload = { ...envelope.payload, plan: "PREMIUM" };
    const tampered = JSON.stringify(envelope);

    expect(() => verifyLicenseBlob(tampered, publicKeyPem)).toThrow(ValidationException);
  });

  it("rejects a signature produced by a different keypair", () => {
    const other = generateKeyPairSync("ed25519");
    const otherPrivatePem = other.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const blob = signLicensePayload(payload, otherPrivatePem);

    expect(() => verifyLicenseBlob(blob, publicKeyPem)).toThrow(ValidationException);
  });

  it("rejects malformed JSON", () => {
    expect(() => verifyLicenseBlob("not valid json", publicKeyPem)).toThrow(ValidationException);
  });

  it("rejects a well-formed JSON envelope missing payload/signature", () => {
    expect(() => verifyLicenseBlob(JSON.stringify({ foo: "bar" }), publicKeyPem)).toThrow(ValidationException);
  });
});
