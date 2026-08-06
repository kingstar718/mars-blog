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

  try {
    const key = await importKey(secret);
    // crypto.subtle.verify 是常数时间比较，不要换成字符串 ===
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

/**
 * 登录后要跳回哪里。只接受站内路径。
 *
 * 两个条件缺一不可：`//evil.com` 是协议相对地址，它以 "/" 开头，
 * 但浏览器会当成 https://evil.com 去跳——只查 startsWith("/") 的话
 * 就是一个开放重定向，钓鱼链接可以挂在你自己的域名下。
 *
 * 放在这里而不是各自写一份：登录接口和登录页都要用它，
 * 而这条规则写错一次就是一个洞（曾经就是页面那份漏了 `//` 的判断）。
 */
export const safeNext = (value: string | null | undefined) =>
  value && value.startsWith("/") && !value.startsWith("//") ? value : "/";

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
