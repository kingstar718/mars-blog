import { defineMiddleware, sequence } from "astro:middleware";
import { env } from "@/lib/env";
import { sessionCookie, verifySession } from "@/lib/session";

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

export const onRequest = sequence(auth);
