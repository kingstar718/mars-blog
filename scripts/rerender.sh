#!/usr/bin/env bash
# 重新渲染所有已发布内容的 body_html。
#
#   MARS_SESSION=<cookie 值> pnpm rerender                       # 打线上
#   MARS_SESSION=<cookie 值> SITE=http://localhost:4321 pnpm rerender
#
# 什么时候要跑：**改了渲染链之后**。body_html 是发布那一刻算好存进库的，
# 之后再改 render.ts（换 shiki 主题、改标题 id 的算法、改图片标签的拼法）
# 都不会影响已经发出去的内容——它们会一直停在旧的 HTML 上。
#
# 会话 cookie 从浏览器里取：登录后打开 devtools → Application → Cookies →
# 复制 mars_session 的值。这个接口没有页面入口是有意的——它是运维动作，
# 不是写作动作，不该在读者能看到的界面上占一个按钮。
set -uo pipefail

SITE="${SITE:-https://mars-blog.wujinxing718.workers.dev}"

if [ -z "${MARS_SESSION:-}" ]; then
  echo "需要 MARS_SESSION：登录后从 devtools 里复制 mars_session 这个 cookie 的值" >&2
  exit 1
fi

echo "对 $SITE 重新渲染已发布内容…"
code=$(curl -sS -X POST "$SITE/api/admin/rerender" \
  -H "Origin: $SITE" \
  -H "Cookie: mars_session=$MARS_SESSION" \
  -o /tmp/rerender.json -w '%{http_code}')

if [ "$code" != "200" ]; then
  echo "失败：HTTP $code" >&2
  head -c 300 /tmp/rerender.json >&2
  echo >&2
  [ "$code" = "401" ] && echo "（401 = cookie 过期或复制错了，重新登录再取一次）" >&2
  exit 1
fi

cat /tmp/rerender.json
echo
