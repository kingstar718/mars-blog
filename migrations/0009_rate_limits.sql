-- 提交限流的计数桶。
--
-- 之前防垃圾只有两道：一个蜜罐字段，和「新评论一律 pending」的人工审核。
-- 两道都不限速——一个脚本可以在一分钟里往 pending 里灌几千条，
-- 审核队列当场作废，而且每一条都是一次 D1 写入。
--
-- key 存的是 IP 加盐后的 SHA-256，不是 IP 本身：限流只需要「是不是同一个人」，
-- 不需要知道是谁。盐用 SESSION_SECRET，换掉它等于清空所有限流状态。
CREATE TABLE rate_limits (
  key          TEXT    PRIMARY KEY,
  count        INTEGER NOT NULL,
  -- 窗口起点，站点时间的 'YYYY-MM-DD HH:mm:ss'
  window_start TEXT    NOT NULL
);

-- 过期的桶要能被扫出来删掉，否则这张表只增不减
CREATE INDEX idx_rate_limits_window ON rate_limits (window_start);
