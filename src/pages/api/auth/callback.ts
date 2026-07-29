import type { APIRoute } from "astro";
import { env } from "@/lib/env";
import { sessionCookie, signSession } from "@/lib/session";

const deny = (reason: string) =>
  new Response(reason, {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = cookies.get("mars_oauth_state")?.value;
  cookies.delete("mars_oauth_state", { path: "/" });

  if (!code) return deny("缺少 code");
  if (!state || state !== expectedState)
    return deny("state 不匹配，请重新登录");

  const tokenResponse = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: new URL("/api/auth/callback", url).toString(),
      }),
    }
  );

  const token = (await tokenResponse.json()) as {
    access_token?: string;
    error_description?: string;
  };
  if (!token.access_token) {
    return deny(`换取令牌失败：${token.error_description ?? "未知原因"}`);
  }

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      authorization: `Bearer ${token.access_token}`,
      accept: "application/vnd.github+json",
      // GitHub API 强制要求 UA，缺了会直接 403
      "user-agent": "mars-blog",
    },
  });
  if (!userResponse.ok) return deny("读取 GitHub 用户信息失败");

  const user = (await userResponse.json()) as { login?: string };

  // 单用户站点：只认这一个账号，其他人拿到 OAuth 授权也进不来
  if (!user.login || user.login !== env.ADMIN_GITHUB_LOGIN) {
    return deny(`${user.login ?? "该账号"} 无权访问后台`);
  }

  const isDev = url.protocol === "http:";
  cookies.set(
    sessionCookie.name,
    await signSession(
      { login: user.login, exp: sessionCookie.expiryFromNow() },
      env.SESSION_SECRET
    ),
    sessionCookie.options(isDev)
  );

  return redirect("/admin", 302);
};
