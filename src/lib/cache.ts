/**
 * 页面缓存（自部署版）。
 *
 * 原来的边缘缓存是 Cloudflare Cache API，自部署后这一层交给 Nginx
 * microcache：公开 GET 页面在 Nginx 层缓存 60 秒左右，带会话的请求
 * 按 cookie 绕开（配置建议见 README 的自部署章节）。
 *
 * 发布接口调用的 purge 在这里变成空操作——短 TTL 负责新鲜度，
 * 不需要也不可能有全局缓存删除。withHtmlCacheHeaders 保留：
 * 它给浏览器设 max-age=0，让每次都回到 Nginx 那层问一遍。
 */

/** 命中后多久重新回源。发布之后最多这么久看到旧内容。 */
const HTML_MAX_AGE_SECONDS = 60;

export const purge = async (_origin: string, _entryId?: number) => {
  // 见文件头的说明：Nginx microcache 的短 TTL 兜新鲜度，
  // 发布后最多 HTML_MAX_AGE_SECONDS 秒就能看到新内容。
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
