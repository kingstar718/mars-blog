import type { APIRoute } from "astro";
import { db } from "@/lib/env";
import { reloadMedia } from "@/lib/media";
import { testS3Connection } from "@/lib/media-s3";
import {
  getS3Config,
  saveS3Config,
  toS3Config,
  type StoredS3Config,
} from "@/lib/media-settings";

/** 打码后的配置，可以安全回给浏览器 */
const masked = (config: StoredS3Config | null) =>
  config
    ? { ...config, secretAccessKey: config.secretAccessKey ? "******" : "" }
    : null;

/** 当前配置。secret 只回「是否已设置」，不回明文 */
export const GET: APIRoute = async () =>
  Response.json(masked(await getS3Config(db())));

/**
 * 保存配置。勾了启用就先做连接验证，验证不过不保存——
 * 宁可停在本地磁盘，也不要一个保存完就写不进去图的配置。
 */
export const POST: APIRoute = async ({ request }) => {
  const body = (await request
    .json()
    .catch(() => null)) as Partial<StoredS3Config> | null;
  if (!body)
    return Response.json(
      { ok: false, message: "请求不是合法 JSON" },
      { status: 400 }
    );

  const existing = await getS3Config(db());
  const candidate: StoredS3Config = {
    endpoint: String(body.endpoint ?? "").trim(),
    region: String(body.region ?? "").trim(),
    bucket: String(body.bucket ?? "").trim(),
    accessKeyId: String(body.accessKeyId ?? "").trim(),
    secretAccessKey: String(body.secretAccessKey ?? "").trim(),
    forcePathStyle: body.forcePathStyle !== false,
    enabled: body.enabled === true,
  };

  const missing = ["endpoint", "bucket", "accessKeyId"].filter(
    field => !candidate[field as keyof StoredS3Config]
  );
  if (missing.length > 0) {
    return Response.json(
      { ok: false, message: `缺少必填项：${missing.join("、")}` },
      { status: 400 }
    );
  }
  if (!candidate.secretAccessKey && !existing?.secretAccessKey) {
    return Response.json(
      { ok: false, message: "Secret Access Key 不能为空（首次配置必填）" },
      { status: 400 }
    );
  }

  // 启用前先验证：用「现有密钥 + 本次表单」拼出候选配置去探测
  const resolved = {
    ...candidate,
    secretAccessKey: candidate.secretAccessKey || existing!.secretAccessKey,
  };
  if (candidate.enabled) {
    const test = await testS3Connection(toS3Config(resolved));
    if (!test.ok) {
      return Response.json(
        { ok: false, message: `验证失败，未保存：${test.message}` },
        { status: 400 }
      );
    }
  }

  const saved = await saveS3Config(db(), resolved);
  await reloadMedia(db());
  return Response.json({ ok: true, config: masked(saved) });
};
