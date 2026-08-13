import type { APIRoute } from "astro";
import { db, env } from "@/lib/env";
import { safeNext, sessionCookie, signSession } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { getPasswordHash, setPasswordHash } from "@/lib/settings";
import { clientKey, hit, sweep } from "@/lib/ratelimit";

/**
 * 首次设置口令。
 *
 * settings 里还没有 password_hash 时，登录页显示的就是这个表单。
 * 设置成功即视为登录：和 login 一样签发会话，不用再输一遍。
 * 已设置过口令就拒绝（409）——"先到先得"的窗口一旦被抢注，
 * 只能用 scripts/reset-password.mjs 在服务器端重置。
 *
 * 密码长度下限 12 位，与 scripts/hash-password.mjs 一致；两次输入
 * 必须一致。限流复用登录那套，防止脚本在设置窗口期灌请求。
 */
const LIMIT = 5;
const WINDOW_SECONDS = 10 * 60;

export const POST: APIRoute = async ({ request, url, cookies, redirect }) => {
  const database = db();
  if (await getPasswordHash(database)) {
    return new Response("口令已设置", { status: 409 });
  }

  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const next = safeNext(String(form.get("next") ?? ""));

  if (password.length < 12 || password !== confirm) {
    return redirect("/login?e=setup", 302);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const key = await clientKey("setup", ip, env.SESSION_SECRET);
  const { allowed } = await hit(database, key, LIMIT, WINDOW_SECONDS);
  await sweep(database);
  if (!allowed) return redirect("/login?e=slow", 302);

  await setPasswordHash(database, await hashPassword(password));

  const isDev = url.protocol === "http:";
  cookies.set(
    sessionCookie.name,
    await signSession(
      { exp: sessionCookie.expiryFromNow() },
      env.SESSION_SECRET
    ),
    sessionCookie.options(isDev)
  );

  return redirect(next, 302);
};
