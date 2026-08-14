/**
 * 客户端会话检测。
 *
 * v3 是纯静态站，没有服务端 session；登录态靠 /api/auth/session 判断。
 * 结果缓存在模块作用域里：同一页面上多个编辑器共用一次请求。
 */
let cached: Promise<boolean> | null = null;

export const checkSession = () =>
  (cached ??= fetch("/api/auth/session")
    .then(response => response.ok)
    .catch(() => false));

export const isAdmin = async () => {
  const ok = await checkSession();
  if (ok) document.documentElement.dataset.session = "1";
  return ok;
};
