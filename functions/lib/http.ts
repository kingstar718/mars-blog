/** 客户端 IP：优先 cf-connecting-ip，回退 x-forwarded-for 的第一个值 */
export const clientIP = (request: Request) =>
  request.headers.get("cf-connecting-ip") ??
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  "unknown";

/** 统一的错误响应：{ ok: false, message } + 状态码 */
export const jsonError = (message: string, status = 400) =>
  Response.json({ ok: false, message }, { status });
