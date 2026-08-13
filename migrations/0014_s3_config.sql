-- 图片存储的 S3 兼容配置（单行表，登录后在 /settings 配置并验证）。
--
-- 配置存数据库而不是环境变量，和口令/会话密钥同一套思路；
-- secret_access_key 以明文存（与 settings 表里的会话密钥同级），
-- 数据库文件本身的权限就是这层防护。
CREATE TABLE s3_config (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  endpoint          TEXT    NOT NULL,
  region            TEXT    NOT NULL DEFAULT '',
  bucket            TEXT    NOT NULL,
  access_key_id     TEXT    NOT NULL,
  secret_access_key TEXT    NOT NULL,
  force_path_style  INTEGER NOT NULL DEFAULT 1,
  enabled           INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT    NOT NULL
);
