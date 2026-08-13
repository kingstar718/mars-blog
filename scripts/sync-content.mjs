#!/usr/bin/env node
/**
 * 把 R2 内容桶（mars-blog-content）里的 markdown 同步到 src/content/。
 *
 * 本地构建和 Cloudflare Pages 构建共用这一步：
 *   R2_ENDPOINT=https://<账号ID>.r2.cloudflarestorage.com
 *   R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_CONTENT_BUCKET=mars-blog-content
 *   pnpm sync:content && pnpm build
 */
import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const endpoint = process.env.R2_ENDPOINT;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_CONTENT_BUCKET ?? "mars-blog-content";

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

const PREFIXES = ["posts/", "notes/", "pages/"];
let synced = 0;

for (const prefix of PREFIXES) {
  let cursor;
  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: cursor,
      })
    );
    for (const object of listed.Contents ?? []) {
      if (!object.Key?.endsWith(".md")) continue;
      const fetched = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: object.Key })
      );
      const text = await fetched.Body.transformToString();
      const target = join("src", "content", object.Key);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, text, "utf8");
      synced += 1;
    }
    cursor = listed.NextContinuationToken;
  } while (cursor);
}

console.log(`已同步 ${synced} 个 markdown 到 src/content/`);
