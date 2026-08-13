import type { APIRoute } from "astro";
import { db } from "@/lib/env";
import { testS3Connection } from "@/lib/media-s3";
import {
  getS3Config,
  toS3Config,
  type StoredS3Config,
} from "@/lib/media-settings";

/**
 * 连接验证（不保存）：按表单里填的配置真实写读删一次探测对象。
 * secret 留空时沿用库里已存的，方便改 endpoint 时不用重输密钥。
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

  const secret = candidate.secretAccessKey || existing?.secretAccessKey || "";
  if (
    !candidate.endpoint ||
    !candidate.bucket ||
    !candidate.accessKeyId ||
    !secret
  ) {
    return Response.json(
      {
        ok: false,
        message:
          "先填 endpoint、bucket、Access Key 和 Secret（Secret 首次必填）",
      },
      { status: 400 }
    );
  }

  return Response.json(
    await testS3Connection(
      toS3Config({ ...candidate, secretAccessKey: secret })
    )
  );
};
