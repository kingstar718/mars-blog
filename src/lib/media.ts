/**
 * 当前图片后端（本地磁盘 / S3 兼容）的切换点。
 *
 * 启动时和每次保存 S3 配置后调用 reloadMedia；请求时走 media()。
 * 这样换存储不需要重启服务——保存时先验证、验证过了才切。
 */
import { localBucket } from "./media-local";
import { s3Bucket, type MediaBucket } from "./media-s3";
import { getS3Config, toS3Config } from "./media-settings";

let current: MediaBucket = localBucket(".data/media");

const pick = async (db: D1Database): Promise<MediaBucket> => {
  const stored = await getS3Config(db);
  if (stored?.enabled && stored.secretAccessKey) {
    try {
      return s3Bucket(toS3Config(stored));
    } catch {
      // 配置异常时退回本地磁盘，别让整站图片一起挂
    }
  }
  return localBucket(process.env.MARS_MEDIA_DIR ?? ".data/media");
};

export const media = () => current;

export const reloadMedia = async (db: D1Database) => {
  current = await pick(db);
};
