import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../env";
import { putContent, triggerDeploy } from "../lib/content";

/**
 * POST /api/memos-hook — memos webhook 接收端。
 *
 * memos（https://github.com/usememos/memos）在 memo 创建/更新/删除/评论时
 * 按 Standard Webhooks 规范投递本端点：
 * - payload: { activityType, creator, memo }，memo 是完整对象
 * - 签名头: webhook-id / webhook-timestamp / webhook-signature（v1,<base64 HMAC>）
 * - 密钥: 创建 webhook 时生成的 whsec_<base64>，配置为 MEMOS_WEBHOOK_SECRET
 *
 * 行为：
 * - created/updated 且 visibility=PUBLIC → 写入 notes/<memo-id>.md（幂等覆盖）
 * - deleted → 删除对应 notes 文件
 * - 非 PUBLIC、评论事件 → 忽略，返回 {code:0} 避免 memos 重试
 * - 所有写操作都触发 Deploy Hook 重建
 */

const SIGNED_CONTENT_VERSION = "v1";
/** 时间戳容差（秒），超出视为重放 */
const MAX_TS_SKEW_SECONDS = 5 * 60;

const base64Encode = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

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

/** 按 Standard Webhooks 规范校验签名（文档见 usememos.com/docs/integrations/webhooks） */
const verifySignature = async (
  secret: string,
  headers: Headers,
  rawBody: string
) => {
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

  // 签名内容 = <id>.<timestamp>.<raw-body>
  const [version, signatureB64] = signatureHeader.split(",");
  if (version !== SIGNED_CONTENT_VERSION || !signatureB64) return false;

  const expected = await hmacSha256(key, `${msgId}.${timestamp}.${rawBody}`);
  const received = base64Decode(signatureB64);
  return timingSafeEqual(expected, received);
};

/** notes 的 frontmatter + 正文；pubDatetime 用 memo 的创建时间（RFC3339，合法 ISO8601） */
const buildNoteMarkdown = (createTime: string, content: string) =>
  `---\npubDatetime: "${createTime}"\n---\n\n${content}\n`;

interface MemosMemo {
  name: string;
  content?: string;
  visibility?: string;
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
  const ok = await verifySignature(
    env.MEMOS_WEBHOOK_SECRET,
    request.headers,
    rawBody
  );
  if (!ok) {
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

  // 只同步公开 memo；PROTECTED/PRIVATE 不上博客
  if (memo.visibility !== "PUBLIC") return Response.json({ code: 0 });

  const content = memo.content?.trim();
  if (!content) return Response.json({ code: 0 });

  if (!memo.createTime) {
    return Response.json(
      { code: 1, message: "memo missing createTime" },
      { status: 400 }
    );
  }

  await putContent(env, key, buildNoteMarkdown(memo.createTime, content));
  await triggerDeploy(env);
  return Response.json({ code: 0 });
};
