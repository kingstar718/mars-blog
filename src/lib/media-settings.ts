/**
 * s3_config 表的读写（单行表，id=1，见 migrations/0014_s3_config.sql）。
 *
 * secret 的「留空沿用旧值」也在这里处理：保存时传空字符串表示不改密钥，
 * 读出来的配置永远带完整密钥（对外回传时由接口负责打码）。
 */
import { now } from "./datetime";
import type { S3Config } from "./media-s3";

export interface StoredS3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  enabled: boolean;
}

interface S3ConfigRow {
  endpoint: string;
  region: string;
  bucket: string;
  access_key_id: string;
  secret_access_key: string;
  force_path_style: number;
  enabled: number;
}

const toStored = (row: S3ConfigRow): StoredS3Config => ({
  endpoint: row.endpoint,
  region: row.region,
  bucket: row.bucket,
  accessKeyId: row.access_key_id,
  secretAccessKey: row.secret_access_key,
  forcePathStyle: row.force_path_style === 1,
  enabled: row.enabled === 1,
});

export const toS3Config = (stored: StoredS3Config): S3Config => ({
  endpoint: stored.endpoint,
  region: stored.region,
  bucket: stored.bucket,
  accessKeyId: stored.accessKeyId,
  secretAccessKey: stored.secretAccessKey,
  forcePathStyle: stored.forcePathStyle,
});

export const getS3Config = async (db: D1Database) => {
  const row = await db
    .prepare(`SELECT * FROM s3_config WHERE id = 1`)
    .first<S3ConfigRow>();
  return row ? toStored(row) : null;
};

/**
 * 保存配置。secretAccessKey 传空字符串时沿用库里的旧值；
 * 返回保存后的完整配置（含密钥），供调用方直接拿去验证/启用。
 */
export const saveS3Config = async (
  db: D1Database,
  input: StoredS3Config
): Promise<StoredS3Config> => {
  const existing = await getS3Config(db);
  const secret = input.secretAccessKey || existing?.secretAccessKey || "";
  const saved: StoredS3Config = { ...input, secretAccessKey: secret };

  await db
    .prepare(
      `INSERT INTO s3_config
         (id, endpoint, region, bucket, access_key_id, secret_access_key,
          force_path_style, enabled, updated_at)
       VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT (id) DO UPDATE SET
         endpoint = ?1, region = ?2, bucket = ?3, access_key_id = ?4,
         secret_access_key = ?5, force_path_style = ?6, enabled = ?7,
         updated_at = ?8`
    )
    .bind(
      saved.endpoint,
      saved.region,
      saved.bucket,
      saved.accessKeyId,
      secret,
      saved.forcePathStyle ? 1 : 0,
      saved.enabled ? 1 : 0,
      now()
    )
    .run();

  return saved;
};
