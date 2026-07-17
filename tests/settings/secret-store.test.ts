import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret, isEncryptedSecret } from "../../src/settings/secret-store";

describe("secret-store", () => {
  it("round-trips: decrypt(encrypt(x, pw), pw) === x", () => {
    const enc = encryptSecret("abcd efgh ijkl mnop", "my-passphrase");
    expect(decryptSecret(enc, "my-passphrase")).toBe("abcd efgh ijkl mnop");
  });
  it("wrong passphrase throws (never returns garbage)", () => {
    const enc = encryptSecret("secret", "correct");
    expect(() => decryptSecret(enc, "wrong")).toThrow();
  });
  it("ciphertext does not contain the plaintext", () => {
    const enc = encryptSecret("PLAINTEXTSECRET", "pw");
    expect(JSON.stringify(enc)).not.toContain("PLAINTEXTSECRET");
  });
  it("isEncryptedSecret validates shape", () => {
    expect(isEncryptedSecret(encryptSecret("x", "p"))).toBe(true);
    expect(isEncryptedSecret(null)).toBe(false);
    expect(isEncryptedSecret({ v: 1, salt: "a" })).toBe(false);
  });
});
