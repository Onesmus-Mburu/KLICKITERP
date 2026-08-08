import { buildPassphraseCheck, deriveBackupKeyBase64, passphraseMatches } from "../application/backup-encryption.util";

describe("backup-encryption.util", () => {
  it("deriveBackupKeyBase64 is deterministic and yields a valid 32-byte AES-256 key", () => {
    const key1 = deriveBackupKeyBase64("correct horse battery staple");
    const key2 = deriveBackupKeyBase64("correct horse battery staple");
    expect(key1).toBe(key2);
    expect(Buffer.from(key1, "base64")).toHaveLength(32);
  });

  it("different passphrases derive different keys", () => {
    expect(deriveBackupKeyBase64("passphrase-a")).not.toBe(deriveBackupKeyBase64("passphrase-b"));
  });

  it("passphraseMatches returns true for the SAME passphrase the check block was built with", () => {
    const key = deriveBackupKeyBase64("the-real-backup-passphrase");
    const check = buildPassphraseCheck(key);
    expect(passphraseMatches(check, key)).toBe(true);
  });

  it("passphraseMatches returns false (never throws) for a WRONG passphrase", () => {
    const rightKey = deriveBackupKeyBase64("the-real-backup-passphrase");
    const wrongKey = deriveBackupKeyBase64("a-completely-different-passphrase");
    const check = buildPassphraseCheck(rightKey);
    expect(passphraseMatches(check, wrongKey)).toBe(false);
  });

  it("passphraseMatches returns false (never throws) for corrupted/garbage input", () => {
    const key = deriveBackupKeyBase64("any-passphrase");
    expect(passphraseMatches("not-valid-base64-ciphertext", key)).toBe(false);
    expect(passphraseMatches("", key)).toBe(false);
  });
});
