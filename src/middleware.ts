import { defineMiddleware, sequence } from "astro:middleware";
import { env } from "@/lib/env";
import { sessionCookie, verifySession } from "@/lib/session";
import { shouldCache, withHtmlCacheHeaders } from "@/lib/cache";

/**
 * 鉴权。
 *
 * 站点没有后台页面：编辑就发生在阅读态本身，登录之后页面上长出铅笔。
 * 所以这里只有两件事——认一遍会话，然后守住写接口。
 *
 * 在中间件里一处拦截，而不是每个接口各写一遍：漏写一个就是漏一个洞。
 * 新增写接口时只要落在 /api/admin 下面，就自动受保护。
 */
const auth = defineMiddleware(async (context, next) => {
  // 公开页面也要认一下会话——登录之后列表和文章页要长出编辑按钮、
  // 草稿要进时间线、评论区要出审核操作。
  // 这一步只做 HMAC 验签，不查库，代价可以忽略。
  const session = await verifySession(
    context.cookies.get(sessionCookie.name)?.value,
    env.SESSION_SECRET
  );
  context.locals.session = session ?? undefined;

  if (!context.url.pathname.startsWith("/api/admin/")) return next();
  if (!session) return new Response("未登录", { status: 401 });
  return next();
});

/**
 * 公开页面走边缘缓存，理由见 lib/cache.ts。
 *
 * 排在鉴权后面：命中缓存就直接返回、连页面代码都不跑，所以绝不能让它
 * 缓存到需要鉴权的东西。shouldCache 已经把 /api 排除掉了，
 * 这个顺序是第二道保险。
 */
const edgeCache = defineMiddleware(async (context, next) => {
  if (context.request.method !== "GET" || !shouldCache(context.url.pathname)) {
    return next();
  }

  // 登录状态下的页面多了编辑/删除按钮，绝不能进缓存——那份 HTML 会被
  // 原样发给匿名访客。带会话的请求一律绕开缓存，读和写都不碰。
  if (context.locals.session) return next();

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
