/**
 * 前端到 Pages Functions 的 API 客户端。
 *
 * 401 统一送回登录页（带 next 回跳）；其余错误把响应体抛给调用方摊回表单。
 */
const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);
  if (!response.ok) {
    if (response.status === 401) {
      location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
      throw new Error("会话已过期");
    }
    throw new Error(await response.text());
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
};

/** 读 markdown 原文（R2 内容桶） */
export const fetchContent = async (key: string) => {
  const response = await fetch(`/api/content/${key}`, {
    headers: { accept: "text/markdown" },
  });
  if (!response.ok) {
    if (response.status === 401) {
      location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
      throw new Error("会话已过期");
    }
    throw new Error(await response.text());
  }
  return response.text();
};

/** 写 markdown（R2 + Deploy Hook 重建） */
export const saveContent = (key: string, text: string) =>
  request<{ ok: true }>(`/api/content/${key}`, {
    method: "PUT",
    headers: { "content-type": "text/markdown; charset=utf-8" },
    body: text,
  });

/** 删除 markdown（R2 + Deploy Hook 重建） */
export const removeContent = (key: string) =>
  request<{ ok: true }>(`/api/content/${key}`, { method: "DELETE" });

/** 图片走 FormData，不能带 content-type 头 */
export const uploadImage = (form: FormData) =>
  request<{ uid: string; markdown: string }>("/api/admin/images", {
    method: "POST",
    body: form,
  });
