#!/usr/bin/env node
/**
 * 给老图补 `_meta/<uid>.json` 变体清单（一次性的数据修复）。
 *
 * 上传时写 _meta 清单是新提交才开始的行为，之前的图片桶里只有
 * `uid/<宽度>.<扩展名>` 变体、没有清单，导致构建期的 rehype 不知道
 * 有哪些档位，短引用只能靠代理列桶兜底、也拿不到宽高。
 *
 * 这个脚本扫 MEDIA 桶里所有变体对象，用文件头解析宽高（不整图解码），
 * 为缺清单的 uid 补写 `_meta/<uid>.json`。跑完后重新
 * `pnpm sync:content && pnpm build`，老图就会和新图一样走响应式重写。
 *
 * 用法（凭据同 sync-content）：
 *   R2_ENDPOINT=https://<账号ID>.r2.cloudflarestorage.com \
 *   R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
 *   R2_MEDIA_BUCKET=mars-blog-media pnpm backfill:media-meta
 */
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const endpoint = process.env.R2_ENDPOINT;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const mediaBucket = process.env.R2_MEDIA_BUCKET ?? "mars-blog-media";

if (!endpoint || !accessKeyId || !secretAccessKey) {
  console.error(
    "缺少 R2 凭据：需要 R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY"
  );
  process.exit(1);
}

const client = new S3Client({
  endpoint,
  region: process.env.R2_REGION || "auto",
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

/**
 * 从 jpeg 文件头解析宽高：按 marker 顺序跳过 APPn/DQT 等段，
 * 读到 SOF 就返回、读到 SOS（压缩数据开始）就放弃。
 * 不能只在前 64 字节里找：带 EXIF 的照片 SOF 往往在第几百字节之后。
 */
const jpegSize = buf => {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 7 < buf.length) {
    // 跳过 0xFF 填充字节，取 marker
    while (i < buf.length && buf[i] === 0xff) i += 1;
    if (i >= buf.length) return null;
    const marker = buf[i];
    i += 1;
    if (marker === 0xd8) continue; // SOI
    if (marker === 0xd9 || marker === 0xda) break; // EOI / SOS
    // RSTn、TEM 没有长度字段
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (i + 2 > buf.length) return null;
    const len = (buf[i] << 8) | buf[i + 1];
    if (len < 2) return null;
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      // SOF0–SOF15：段内固定偏移，precision 后是高(2)、宽(2)
      const height = (buf[i + 3] << 8) | buf[i + 4];
      const width = (buf[i + 5] << 8) | buf[i + 6];
      if (width > 0 && height > 0) return { width, height };
      return null;
    }
    // 普通段：len 含长度字段自身，跳到下一个 marker
    i += len;
  }
  return null;
};

const u24le = (buf, off) =>
  buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);

/** webp 头：VP8X（extended）/ VP8（lossy）/ VP8L（lossless） */
const webpSize = buf => {
  if (
    buf.length < 30 ||
    buf.toString("ascii", 0, 4) !== "RIFF" ||
    buf.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }
  const fourCC = buf.toString("ascii", 12, 16);
  if (fourCC === "VP8X" && buf.length >= 30) {
    return { width: 1 + u24le(buf, 24), height: 1 + u24le(buf, 27) };
  }
  if (fourCC === "VP8 " && buf.length >= 30) {
    return {
      width: (buf[26] | (buf[27] << 8)) & 0x3fff,
      height: (buf[28] | (buf[29] << 8)) & 0x3fff,
    };
  }
  if (fourCC === "VP8L" && buf.length >= 25) {
    return {
      width: 1 + (buf[21] | ((buf[22] & 0x3f) << 8)),
      height: 1 + ((buf[22] >> 6) | (buf[23] << 2) | ((buf[24] & 0x0f) << 10)),
    };
  }
  return null;
};

// 第一遍：列出全部对象，按 uid 分组，并记下已存在的 _meta 清单
const byUid = new Map();
const metaKeys = new Set();
let cursor;
do {
  const listed = await client.send(
    new ListObjectsV2Command({
      Bucket: mediaBucket,
      ContinuationToken: cursor,
    })
  );
  for (const object of listed.Contents ?? []) {
    if (object.Key?.startsWith("_meta/")) {
      metaKeys.add(object.Key);
      continue;
    }
    const uid = object.Key?.split("/")[0];
    if (!uid) continue;
    if (!byUid.has(uid)) byUid.set(uid, []);
    byUid.get(uid).push(object.Key);
  }
  cursor = listed.NextContinuationToken;
} while (cursor);

let written = 0;
let skipped = 0;
for (const [uid, keys] of byUid) {
  const metaKey = `_meta/${uid}.json`;
  if (metaKeys.has(metaKey)) {
    skipped += 1;
    continue;
  }

  const variants = [];
  for (const key of keys) {
    const match = key.match(/(\d+)\.(webp|jpe?g)$/);
    if (!match) continue;
    const width = Number(match[1]);
    const format = match[2] === "webp" ? "webp" : "jpeg";
    const fetched = await client.send(
      new GetObjectCommand({
        Bucket: mediaBucket,
        Key: key,
        // 64KB 足够覆盖 SOF 段（EXIF/APPn 都在它前面）；不整图下载
        Range: "bytes=0-65535",
      })
    );
    const buf = Buffer.from(await fetched.Body.transformToByteArray());
    const size = format === "webp" ? webpSize(buf) : jpegSize(buf);
    variants.push({ key, width, height: size?.height ?? 0, format });
  }

  if (variants.length === 0) {
    console.warn(`跳过 ${uid}：没有可解析的变体`);
    continue;
  }

  await client.send(
    new PutObjectCommand({
      Bucket: mediaBucket,
      Key: metaKey,
      Body: JSON.stringify({ uid, variants }),
      ContentType: "application/json",
    })
  );
  written += 1;
  console.log(`已补写 ${metaKey}（${variants.length} 个变体）`);
}

console.log(`完成：补写 ${written} 个清单，跳过已有 ${skipped} 个`);
