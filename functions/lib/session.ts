import type { Env } from "../env";

/**
 * 会话：一个 HMAC 签名的 cookie，不落库。
 *
 * 单用户站点不需要 session 表——能证明「你输对过口令」就够了，
 * 所以载荷里只有过期时间，没有身份。签名密钥由 ADMIN_PASSWORD 派生，
 * 换口令即全部下线。
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

/** 会话密钥由口令派生，不单独配置 */
export const deriveSessionSecret = async (password: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`mars-blog:session-key:v1:${password}`)
  );
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
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

  try {
    const key = await importKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(mac),
      encoder.encode(body)
    );
    if (!valid) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(body))
    ) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
};

/** 从 Cookie 头里取指定名字的值 */
export const readCookie = (request: Request, name: string) => {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
};

/** 登录后拿到会话，换口令之前一直有效；7 天过期 */
export const sessionFor = async (
  request: Request,
  env: Env
): Promise<SessionPayload | null> => {
  const secret = await deriveSessionSecret(env.ADMIN_PASSWORD);
  return verifySession(readCookie(request, COOKIE_NAME), secret);
};

export const newSessionValue = async (env: Env) => {
  const secret = await deriveSessionSecret(env.ADMIN_PASSWORD);
  return signSession(
    { exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS },
    secret
  );
};

export const sessionCookieHeaders = {
  set: (value: string, secure: boolean) => ({
    "set-cookie": `${COOKIE_NAME}=${value}; Path=/; HttpOnly; ${
      secure ? "Secure; " : ""
    }SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`,
  }),
  clear: { "set-cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0` },
};
