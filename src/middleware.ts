import { defineMiddleware, sequence } from "astro:middleware";
import { env } from "@/lib/env";
import { sessionCookie, verifySession } from "@/lib/session";
import { shouldCache, withHtmlCacheHeaders } from "@/lib/cache";

/**
 * 后台鉴权。
 *
 * 在中间件里一处拦截，而不是每个页面各写一遍——漏写一个页面就是漏一个洞。
 * 新增后台路由时只要落在 /admin 或 /api/admin 下面，就自动受保护。
 */
const auth = defineMiddleware(async (context, next) => {
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

/**
 * 公开页面走边缘缓存，理由见 lib/cache.ts。
 *
 * 排在鉴权后面：命中缓存就直接返回、连页面代码都不跑，所以绝不能让它
 * 缓存到需要鉴权的东西。shouldCache 已经把 /admin 和 /api 排除掉了，
 * 这个顺序是第二道保险。
 */
const edgeCache = defineMiddleware(async (context, next) => {
  if (context.request.method !== "GET" || !shouldCache(context.url.pathname)) {
    return next();
  }

  const cache = await caches.open("default");
  const key = context.url.toString();
  const hit = await cache.match(key);
  if (hit) {
    // 留一个能从外面看见的信号，否则「缓存到底有没有生效」只能靠猜
    const headers = new Headers(hit.headers);
    headers.set("x-edge-cache", "hit");
    return new Response(hit.body, { status: hit.status, headers });
  }

  const response = await next();
  if (response.status !== 200) return response;

  const cacheable = withHtmlCacheHeaders(response);
  // 存一份克隆，原件继续返回给这次请求
  await cache.put(key, cacheable.clone());

  const headers = new Headers(cacheable.headers);
  headers.set("x-edge-cache", "miss");
  return new Response(cacheable.body, { status: cacheable.status, headers });
});

export const onRequest = sequence(auth, edgeCache);
