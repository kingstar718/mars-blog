-- 站点设置：单用户博客用一张键值表就够。
--
-- password_hash 是站长口令的 PBKDF2 哈希，首次登录时设置（见
-- src/pages/api/auth/setup.ts）；session_secret 是会话 cookie 的 HMAC
-- 密钥，首次启动时自动生成并落库（见 src/lib/env.ts）——换掉它等于
-- 让所有会话立刻失效，语义和以前的环境变量一致，但重启不会丢。
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
