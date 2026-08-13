import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../env";
import { newSessionValue, sessionCookieHeaders } from "../../lib/session";

/** 口令登录：对了发会话 cookie，错了统一 401 */
export const onRequestPost: PagesFunction<Env> = async ({
  request,
  env,
}) => {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  if (!password || password !== env.ADMIN_PASSWORD) {
    return Response.json({ ok: false, message: "口令不对" }, { status: 401 });
  }

  const secure = new URL(request.url).protocol === "https:";
  const value = await newSessionValue(env);
  return new Response(null, {
    status: 204,
    headers: sessionCookieHeaders.set(value, secure),
  });
};
