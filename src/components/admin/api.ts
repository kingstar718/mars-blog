import type { EntryRow } from "@/lib/db";
import type { DraftInput } from "@/lib/schema";

export type { EntryRow };

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    // 401 说明会话过期了，直接送回登录，不要在页面上留一个坏掉的编辑器
    if (response.status === 401) {
      location.href = "/api/auth/login";
      throw new Error("会话已过期");
    }
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
};

export const listEntries = () =>
  request<{ entries: EntryRow[] }>("/api/admin/entries");

export const fetchEntry = (id: number) =>
  request<{ entry: EntryRow }>(`/api/admin/entries/${id}`);

export const createEntry = (input: DraftInput) =>
  request<{ id: number; updatedAt: string }>("/api/admin/entries", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const saveEntry = (id: number, input: DraftInput) =>
  request<{ id: number; updatedAt: string }>(`/api/admin/entries/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

export const removeEntry = (id: number) =>
  request<{ ok: true }>(`/api/admin/entries/${id}`, { method: "DELETE" });

/** 发布失败不抛错——校验错误要摊回表单，不是异常 */
export const publishEntry = async (id: number, note?: string) => {
  const response = await fetch(`/api/admin/entries/${id}/publish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note }),
  });
  return (await response.json()) as {
    ok: boolean;
    errors?: Record<string, string>;
  };
};

/** 图片走 FormData，不能带 content-type: application/json 的默认头 */
export const uploadImage = async (form: FormData) => {
  const response = await fetch("/api/admin/images", {
    method: "POST",
    body: form,
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as { uid: string; markdown: string };
};

export const unpublishEntry = (id: number) =>
  request<{ ok: true }>(`/api/admin/entries/${id}/publish`, {
    method: "DELETE",
  });
