/**
 * 登录后回跳地址校验：只放行站内路径，堵住 `//evil.com` 这类
 * 协议相对地址造成的开放重定向。
 */
export const safeNext = (value: string | null | undefined) => {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
};
