/**
 * 客户端真实 IP。
 *
 * 自部署后反代（NPM/Nginx）把真实地址放在 X-Forwarded-For 里，
 * 旧的 Cloudflare 专属头 cf-connecting-ip 不再存在——读它只会拿到
 * "unknown"，所有人共用一个限流桶：浏览量冻结、评论限流失效、
 * 登录限流变成全站共享（任何人刷五次错口令就能把站长锁十分钟）。
 *
 * 只信反代会覆盖的头：本部署里容器端口不对外，反代是唯一入口。
 * X-Forwarded-For 可能是逗号分隔的多级链，取最靠近客户端的那一个。
 */
export const clientIP = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
};
