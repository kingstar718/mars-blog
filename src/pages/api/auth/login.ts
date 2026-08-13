import type { APIRoute } from "astro";
import { db, env } from "@/lib/env";
import { safeNext, sessionCookie, signSession } from "@/lib/session";
import { clientKey, hit, sweep } from "@/lib/ratelimit";
import { clientIP } from "@/lib/client-ip";

/**
 * 口令登录。
 *
 * 只有一个人能登录，用不着 OAuth 那一整套（三个 secret、一个回调地址、
 * 换域名还要回第三方改配置）。会话机制没变——签名 cookie 那部分本来就
 * 和验证方式无关，这里换掉的只是"签发之前那一下"。
 *
 * 没有限流的口令登录才是真危险。限流复用评论那套（SQLite 固定窗口）：
 * 同一个 IP 十分钟五次，二十位的随机口令在这个速率下没有意义。
 */

/** 十分钟五次。自己登录一次就够，输错三次也还有余量 */
const LIMIT = 5;
const WINDOW_SECONDS = 10 * 60;

export const POST: APIRoute = async ({ request, url, cookies, redirect }) => {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const next = safeNext(String(form.get("next") ?? ""));

  const ip = clientIP(request);
  const key = await clientKey("login", ip, env.SESSION_SECRET);
  const { allowed } = await hit(db(), key, LIMIT, WINDOW_SECONDS);
  // 顺带清掉过期的限流桶。清扫原来只挂在评论路径上——没人评论时
  // 这张表就只增不减，而登录正是它的高频写入方之一。
  await sweep(db());
  if (!allowed) return redirect("/login?e=slow", 302);

  // 口令不对、没填——对外都是同一句「口令不对」，逐项报错等于告诉
  // 对方"这一步过了"。明文比对：单用户站点，拦人的是强口令 + 限流。
  if (!password || password !== env.ADMIN_PASSWORD) {
    return redirect("/login?e=1", 302);
  }

  // TLS 在反代终止，协议判断走 X-Forwarded-Proto，否则永远当成 http，
  // Secure 标志就永远不设置（见 src/lib/client-ip.ts 的说明）
  const isSecure =
    url.protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";
  cookies.set(
    sessionCookie.name,
    await signSession(
      { exp: sessionCookie.expiryFromNow() },
      env.SESSION_SECRET
    ),
    sessionCookie.options(!isSecure)
  );

  return redirect(next, 302);
};
