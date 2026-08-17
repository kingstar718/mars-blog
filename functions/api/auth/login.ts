import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../env";
import { clientIP, jsonError } from "../../lib/http";
import { clientKey, hit } from "../../lib/ratelimit";
import {
  deriveSessionSecret,
  newSessionValue,
  safeEqual,
  sessionCookieHeaders,
} from "../../lib/session";

/** 同一 IP 十分钟内最多试 10 次口令；成功登录会清掉自己的桶 */
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_SECONDS = 10 * 60;

/** 口令登录：对了发会话 cookie，错了统一 401 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const form = await request.formData().catch(() => null);
  if (!form) return jsonError("表单格式不对");

  const password = String(form.get("password") ?? "");
  const secret = await deriveSessionSecret(env.ADMIN_PASSWORD);
  const key = await clientKey("login", clientIP(request), secret);
  const { allowed } = await hit(env.DB, key, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS);
  if (!allowed) return jsonError("尝试太频繁，过一会儿再来", 429);

  if (!password || !(await safeEqual(password, env.ADMIN_PASSWORD))) {
    return jsonError("口令不对", 401);
  }

  // 登录成功把限流桶清掉，自己输错几次攒的计数不留到下次
  await env.DB.prepare(`DELETE FROM rate_limits WHERE key = ?1`)
    .bind(key)
    .run();

  const secure = new URL(request.url).protocol === "https:";
  const value = await newSessionValue(env);
  return new Response(null, {
    status: 204,
    headers: sessionCookieHeaders.set(value, secure),
  });
};
