-- 清理旧版登录方案的遗留：settings 表。
--
-- 0a6057c 之前会话密钥存在这张表里（key=session_secret），
-- 之后改为从 ADMIN_PASSWORD 派生（见 src/lib/env.ts），全代码库已无读写。
-- 旧库升级到这里自动删掉；新库从一开始就没有这张表，执行即空操作。
DROP TABLE IF EXISTS settings;
