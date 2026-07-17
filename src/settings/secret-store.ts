import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "crypto";

/** Passphrase-encrypted secret, safe to persist in data.json (ciphertext only). */
export interface EncryptedSecret {
  v: 1;
  salt: string; // hex
  iv: string; // hex
  tag: string; // hex (GCM auth tag)
  data: string; // hex ciphertext
}

const ITERATIONS = 200000;

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return pbkdf2Sync(passphrase, salt, ITERATIONS, 32, "sha256");
}

export function encryptSecret(plain: string, passphrase: string): EncryptedSecret {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: enc.toString("hex"),
  };
}

/** Returns the plaintext, or throws if the passphrase is wrong (GCM auth failure). */
export function decryptSecret(sec: EncryptedSecret, passphrase: string): string {
  const key = deriveKey(passphrase, Buffer.from(sec.salt, "hex"));
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sec.iv, "hex"));
  decipher.setAuthTag(Buffer.from(sec.tag, "hex"));
  const dec = Buffer.concat([decipher.update(Buffer.from(sec.data, "hex")), decipher.final()]);
  return dec.toString("utf8");
}

export function isEncryptedSecret(v: unknown): v is EncryptedSecret {
  const s = v as EncryptedSecret;
  return (
    !!s &&
    typeof s === "object" &&
    s.v === 1 &&
    typeof s.salt === "string" &&
    typeof s.iv === "string" &&
    typeof s.tag === "string" &&
    typeof s.data === "string"
  );
}
