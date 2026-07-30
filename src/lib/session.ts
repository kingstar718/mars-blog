/**
 * 会话：一个 HMAC 签名的 cookie，不落库。
 *
 * 单用户站点不需要 session 表——能证明「你输对过口令」就够了，
 * 所以载荷里只有过期时间，没有身份。
 * 代价是签发后无法主动吊销，所以有效期压到 7 天；真要立刻失效就换 SESSION_SECRET。
 */

const COOKIE_NAME = "mars_session";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export interface SessionPayload {
  /** 过期时间，Unix 秒 */
  exp: number;
}

const encoder = new TextEncoder();

const base64UrlEncode = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const base64UrlDecode = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
};

const importKey = (secret: string) =>
  crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

/** token 形如 <base64url(payload)>.<base64url(hmac)> */
export const signSession = async (payload: SessionPayload, secret: string) => {
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await importKey(secret);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${base64UrlEncode(new Uint8Array(mac))}`;
};

export const verifySession = async (
  token: string | undefined,
  secret: string
): Promise<SessionPayload | null> => {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;

  const key = await importKey(secret);
  // crypto.subtle.verify 是常数时间比较，不要换成字符串 ===
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlDecode(mac),
    encoder.encode(body)
  );
  if (!valid) return null;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(body))
    ) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
};

export const sessionCookie = {
  name: COOKIE_NAME,
  maxAge: MAX_AGE_SECONDS,
  /** dev 走 http，Secure 会让 cookie 根本存不下来 */
  options: (isDev: boolean) => ({
    httpOnly: true,
    secure: !isDev,
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  }),
  expiryFromNow: () => Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
};
