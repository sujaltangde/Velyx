import crypto from "crypto";

const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlEncodeJson(obj: unknown): string {
  return base64UrlEncode(JSON.stringify(obj));
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(password, salt, 64);
  // format: scrypt:<saltHex>:<hashHex>
  return `scrypt:${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3) return false;
  const [algo, saltHex, hashHex] = parts;
  if (algo !== "scrypt") return false;

  const salt = Buffer.from(saltHex!, "hex");
  const expected = Buffer.from(hashHex!, "hex");
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function signAuthToken(
  payload: { sub: string; email: string | null; name: string | null },
  opts?: { expiresInSeconds?: number }
): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + (opts?.expiresInSeconds ?? DEFAULT_TOKEN_TTL_SECONDS);

  const header = { alg: "HS256", typ: "JWT" };
  const body = { ...payload, iat, exp };

  const encodedHeader = base64UrlEncodeJson(header);
  const encodedBody = base64UrlEncodeJson(body);
  const signingInput = `${encodedHeader}.${encodedBody}`;

  const signature = crypto
    .createHmac("sha256", secret)
    .update(signingInput)
    .digest();

  return `${signingInput}.${base64UrlEncode(signature)}`;
}


