import { defineMiddleware } from "astro:middleware";
import { env } from "@/lib/env";
import { sessionCookie, verifySession } from "@/lib/session";

/**
 * 后台鉴权。
 *
 * 在中间件里一处拦截，而不是每个页面各写一遍——漏写一个页面就是漏一个洞。
 * 新增后台路由时只要落在 /admin 或 /api/admin 下面，就自动受保护。
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminApi = pathname.startsWith("/api/admin/");
  if (!isAdminPage && !isAdminApi) return next();

  const session = await verifySession(
    context.cookies.get(sessionCookie.name)?.value,
    env.SESSION_SECRET
  );

  if (!session) {
    // 接口返回 401 让前端自己处理，页面则直接送去登录
    return isAdminApi
      ? new Response("未登录", { status: 401 })
      : context.redirect("/api/auth/login", 302);
  }

  context.locals.session = session;
  return next();
});
