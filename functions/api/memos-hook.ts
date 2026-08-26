import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../env";
import { putContent, triggerDeploy } from "../lib/content";

/**
 * POST /api/memos-hook — memos webhook 接收端。
 *
 * memos 在 memo 创建/更新/删除/评论时投递本端点。兼容两种 memos 行为：
 * - 0.29.x（当前实例）：无签名投递，仅带 content-type，需用 URL token 鉴权
 * - 新版本（Standard Webhooks）：带 webhook-id/timestamp/signature 签名头
 *
 * 鉴权（二选一，都通过即接受）：
 * - URL query `token` = MEMOS_WEBHOOK_SECRET（memos 0.29 无签名模式）
 * - HMAC 签名校验通过（新版本签名模式）
 *
 * 行为：
 * - created/updated 且 visibility=PUBLIC → 写入 notes/<memo-id>.md（幂等覆盖）
 * - deleted → 删除对应 notes 文件
 * - 非 PUBLIC、评论事件 → 忽略，返回 {code:0} 避免 memos 重试
 * - 所有写操作都触发 Deploy Hook 重建
 *
 * payload 结构（0.29.1 实测）：
 * { url, activityType, creator, memo: { name, content, visibility(数字), create_time:{seconds} } }
 */

const SIGNED_CONTENT_VERSION = "v1";
/** 时间戳容差（秒），超出视为重放 */
const MAX_TS_SKEW_SECONDS = 5 * 60;

const base64Decode = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/** 常量时间比较，防时序侧信道 */
const timingSafeEqual = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
};

const hmacSha256 = async (key: Uint8Array, data: string) => {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(data)
  );
  return new Uint8Array(signature);
};

/** Standard Webhooks 签名校验（新版本 memos），失败返回 false */
const verifySignature = async (
  secret: string,
  headers: Headers,
  rawBody: string
): Promise<boolean> => {
  const msgId = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatureHeader = headers.get("webhook-signature");
  if (!msgId || !timestamp || !signatureHeader) return false;

  // 时间戳容差，超窗拒绝
  const now = Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_TS_SKEW_SECONDS)
    return false;

  // 密钥：去掉 whsec_ 前缀后 base64 解码；非 whsec_ 前缀按原样使用
  const key = secret.startsWith("whsec_")
    ? base64Decode(secret.slice("whsec_".length))
    : new TextEncoder().encode(secret);

  const [version, signatureB64] = signatureHeader.split(",");
  if (version !== SIGNED_CONTENT_VERSION || !signatureB64) return false;

  const expected = await hmacSha256(key, `${msgId}.${timestamp}.${rawBody}`);
  const received = base64Decode(signatureB64);
  return timingSafeEqual(expected, received);
};

/** memos 0.29 的 visibility 是数字枚举：0 未指定 / 1 PRIVATE / 2 PROTECTED / 3 PUBLIC */
const isPublic = (visibility: unknown): boolean => {
  if (visibility === "PUBLIC" || visibility === 3) return true;
  if (visibility === 0 || visibility === 1 || visibility === 2) return false;
  return false;
};

/** create_time 可能是 {seconds} 对象（0.29）或 RFC3339 字符串（新版本），统一转 ISO */
const normalizeTime = (value: unknown): string | null => {
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (value && typeof value === "object") {
    const seconds = (value as { seconds?: number }).seconds;
    if (typeof seconds === "number") {
      return new Date(seconds * 1000).toISOString();
    }
  }
  return null;
};

/** notes 的 frontmatter + 正文 */
const buildNoteMarkdown = (createTime: string, content: string) =>
  `---\npubDatetime: "${createTime}"\n---\n\n${content}\n`;

interface MemosMemo {
  name: string;
  content?: string;
  visibility?: unknown;
  create_time?: unknown;
  createTime?: string;
}

interface MemosPayload {
  activityType?: string;
  memo?: MemosMemo;
}

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  if (!env.MEMOS_WEBHOOK_SECRET) {
    return Response.json(
      { code: 1, message: "MEMOS_WEBHOOK_SECRET not configured" },
      { status: 503 }
    );
  }

  const rawBody = await request.text();

  // 鉴权：签名模式或 URL token 模式，任一通过即可
  const signed = await verifySignature(
    env.MEMOS_WEBHOOK_SECRET,
    request.headers,
    rawBody
  );
  let queryToken: string | null = null;
  try {
    queryToken = new URL(request.url).searchParams.get("token");
  } catch {
    // URL 解析失败按无 token 处理
  }
  const tokenOk =
    queryToken !== null && queryToken === env.MEMOS_WEBHOOK_SECRET;
  if (!signed && !tokenOk) {
    return Response.json(
      { code: 1, message: "signature verification failed" },
      { status: 401 }
    );
  }

  let payload: MemosPayload;
  try {
    payload = JSON.parse(rawBody) as MemosPayload;
  } catch {
    return Response.json({ code: 1, message: "invalid JSON" }, { status: 400 });
  }

  const { activityType, memo } = payload;
  if (!memo?.name) return Response.json({ code: 0 });
  const memoId = memo.name.split("/").pop();
  if (!memoId) return Response.json({ code: 0 });
  const key = `notes/memos-${memoId}.md`;

  if (activityType === "memos.memo.deleted") {
    await env.CONTENT.delete(key);
    await triggerDeploy(env);
    return Response.json({ code: 0 });
  }

  // 只处理创建/更新；评论等其它事件忽略
  if (
    activityType !== "memos.memo.created" &&
    activityType !== "memos.memo.updated"
  ) {
    return Response.json({ code: 0 });
  }

  // 只同步公开 memo；PRIVATE/PROTECTED 不上博客
  if (!isPublic(memo.visibility)) return Response.json({ code: 0 });

  const content = memo.content?.trim();
  if (!content) return Response.json({ code: 0 });

  const createTime = normalizeTime(memo.create_time ?? memo.createTime);
  if (!createTime) {
    return Response.json(
      { code: 1, message: "memo missing createTime" },
      { status: 400 }
    );
  }

  await putContent(env, key, buildNoteMarkdown(createTime, content));
  await triggerDeploy(env);
  return Response.json({ code: 0 });
};
