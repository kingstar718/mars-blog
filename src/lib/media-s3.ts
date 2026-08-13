/**
 * S3 兼容的对象存储后端，形状与本地磁盘实现一致（get/put）。
 *
 * endpoint 指向哪家就用哪家：MinIO、阿里云 OSS、腾讯云 COS、
 * Cloudflare R2 等一切提供 S3 API 的存储都行。
 * 配置存在数据库（s3_config 表），登录后在 /settings 填写并验证。
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/** 两个后端共用的形状：业务代码只依赖这两个方法 */
export interface MediaBucket {
  get(key: string): Promise<{ body: ReadableStream } | null>;
  put(
    key: string,
    value: ArrayBuffer,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
    }
  ): Promise<{ key: string; size: number }>;
}

const client = (config: S3Config) =>
  new S3Client({
    endpoint: config.endpoint,
    region: config.region || "auto",
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

const isNoSuchKey = (error: unknown) =>
  error instanceof Error &&
  (error.name === "NoSuchKey" || error.name === "NotFound");

export const s3Bucket = (config: S3Config): MediaBucket => ({
  async get(key) {
    try {
      const object = await client(config).send(
        new GetObjectCommand({ Bucket: config.bucket, Key: key })
      );
      if (!object.Body) return null;
      return { body: object.Body.transformToWebStream() };
    } catch (error) {
      // 和本地实现一致：不存在的 key 返回 null，其余异常照抛
      if (isNoSuchKey(error)) return null;
      throw error;
    }
  },
  async put(key, value, options) {
    await client(config).send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: new Uint8Array(value),
        ContentType: options?.httpMetadata?.contentType,
        CacheControl: options?.httpMetadata?.cacheControl,
      })
    );
    return { key, size: value.byteLength };
  },
});

/** 连接验证：写一个探测对象再删掉，给 /settings 的「测试连接」用 */
export const testS3Connection = async (config: S3Config) => {
  const probe = `__mars_blog_probe_${crypto.randomUUID()}`;
  try {
    const s3 = client(config);
    await s3.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: probe,
        Body: new Uint8Array([1]),
      })
    );
    await s3.send(
      new DeleteObjectCommand({ Bucket: config.bucket, Key: probe })
    );
    return { ok: true, message: "连接成功，读写正常。" };
  } catch (error) {
    return { ok: false, message: describeS3Error(error) };
  }
};

const describeS3Error = (error: unknown) => {
  if (!(error instanceof Error)) return String(error);
  const detail = error.message.split("\n")[0];
  if (error.name.includes("Credential") || detail.includes("403")) {
    return `认证失败：${detail}`;
  }
  if (error.name.includes("Bucket") || detail.includes("404")) {
    return `桶或地址不对：${detail}`;
  }
  return `${error.name}：${detail}`;
};
