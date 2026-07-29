import type { APIRoute } from "astro";
import { env } from "@/lib/env";

/**
 * 跳转到 GitHub 授权页。
 *
 * 不申请任何 scope：我们只需要 /user 返回的 login 字段判断是不是站长，
 * 空 scope 就能拿到公开资料。多要一个权限都是多余的暴露面。
 */
export const GET: APIRoute = ({ url, cookies, redirect }) => {
  // state 防 CSRF：随机值同时写进 cookie 和 URL，回调时比对
  const state = crypto.randomUUID();
  cookies.set("mars_oauth_state", state, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorize.searchParams.set(
    "redirect_uri",
    new URL("/api/auth/callback", url).toString()
  );
  authorize.searchParams.set("state", state);

  return redirect(authorize.toString(), 302);
};
