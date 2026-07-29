-- 时间格式从 ISO8601 UTC 改成站点时间（Asia/Shanghai）的 'YYYY-MM-DD HH:mm:ss'。
-- 原因见 src/lib/datetime.ts 的注释：日期控件去掉之后，存 UTC 的理由没有了。
--
-- +8 hours 是硬编码的，Asia/Shanghai 自 1991 年起不用夏令时，站内不存在更早的内容。
-- LIKE '%T%' 只挑还没转过的行，重复执行不会把时间越加越晚。

UPDATE entries SET
  pub_datetime = strftime('%Y-%m-%d %H:%M:%S', datetime(pub_datetime, '+8 hours'))
WHERE pub_datetime LIKE '%T%';

UPDATE entries SET
  created_at = strftime('%Y-%m-%d %H:%M:%S', datetime(created_at, '+8 hours'))
WHERE created_at LIKE '%T%';

UPDATE entries SET
  updated_at = strftime('%Y-%m-%d %H:%M:%S', datetime(updated_at, '+8 hours'))
WHERE updated_at LIKE '%T%';

UPDATE entry_updates SET
  datetime = strftime('%Y-%m-%d %H:%M:%S', datetime(datetime, '+8 hours'))
WHERE datetime LIKE '%T%';

UPDATE entry_revisions SET
  created_at = strftime('%Y-%m-%d %H:%M:%S', datetime(created_at, '+8 hours'))
WHERE created_at LIKE '%T%';

UPDATE images SET
  created_at = strftime('%Y-%m-%d %H:%M:%S', datetime(created_at, '+8 hours'))
WHERE created_at LIKE '%T%';

UPDATE comments SET
  created_at = strftime('%Y-%m-%d %H:%M:%S', datetime(created_at, '+8 hours'))
WHERE created_at LIKE '%T%';

UPDATE pages SET
  updated_at = strftime('%Y-%m-%d %H:%M:%S', datetime(updated_at, '+8 hours'))
WHERE updated_at LIKE '%T%';

-- entry_revisions.frontmatter_json 里也有一份 pubDatetime，是发布当时的快照，
-- 按原样留着：它记录的是「那一刻库里长什么样」，改了就不是快照了。
