/**
 * 公开页面的边缘缓存。
 *
 * Worker 返回的响应不会被 Cloudflare 自动缓存——不显式用 Cache API 存一份的话，
 * 每一次访问都要跑一遍 SSR 加若干条 D1 查询。首页尤其亏：一次请求要读整条时间线。
 *
 * 只缓存不随人变化的东西：公开页面和图片。接口和搜索一律绕过
 * （搜索的 query 是任意的，缓存下去只会把 key 空间撑爆）。
 * 登录态的页面也不缓存，那一层判断在 middleware 里。
 */

/** 命中后多久重新回源。发布之后最多这么久看到旧内容。 */
const HTML_MAX_AGE_SECONDS = 60;

export const shouldCache = (pathname: string) =>
  !pathname.startsWith("/api/") &&
  !pathname.startsWith("/search") &&
  pathname !== "/login";

/**
 * 发布后要清掉的地址。
 *
 * 注意 Cache API 的 delete 只作用于当前 colo，不是全球清除——
 * 你自己刷新时多半命中的就是这个 colo，所以体感是即时的；
 * 别的地区要等 HTML_MAX_AGE_SECONDS 到期。真正的一致性靠的是那个 TTL，
 * 这里的清除只是让「发完马上看一眼」这件事不别扭。
 */
const purgeUrls = (origin: string, entryId?: number) => {
  const paths = ["/", "/posts", "/notes", "/about"];
  // 列表页有分页，翻不到底就清前几页——再深的页面等 TTL 过期
  for (let page = 2; page <= 5; page += 1) {
    paths.push(`/posts/${page}`, `/notes/${page}`);
  }
  if (entryId) paths.push(`/posts/${entryId}`);
  return paths.map(path => `${origin}${path}`);
};

export const purge = async (origin: string, entryId?: number) => {
  const cache = await caches.open("default");
  await Promise.all(purgeUrls(origin, entryId).map(url => cache.delete(url)));
};

export const withHtmlCacheHeaders = (response: Response) => {
  const headers = new Headers(response.headers);
  // max-age=0 让浏览器每次都回来问，s-maxage 才是边缘那一层的寿命：
  // 浏览器缓存住的话，你自己刷新都看不到刚发的东西
  headers.set(
    "cache-control",
    `public, max-age=0, s-maxage=${HTML_MAX_AGE_SECONDS}`
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
