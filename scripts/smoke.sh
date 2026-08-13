#!/usr/bin/env bash
# 部署后的冒烟检查。
#
#   ./scripts/smoke.sh                      # 打线上
#   ./scripts/smoke.sh http://localhost:4321  # 打本地
#
# 为什么需要它：部署涉及环境变量、数据库迁移、进程托管好几道环节，
# 哪一道配错都可能在线上才暴露——曾经因此让登录接口在线上 500 而不自知。
# 光有构建和类型检查不够，得真发一个请求。
#
# 只查「能不能用」，不查内容。断言写成期望的状态码，失败时打印实际值。
set -uo pipefail

SITE="${1:-http://localhost:4321}"
failed=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    printf '  ✓ %-28s %s\n' "$name" "$actual"
  else
    printf '  ✗ %-28s 期望 %s，实际 %s\n' "$name" "$expected" "$actual"
    failed=$((failed + 1))
  fi
}

status() { curl -s -o /dev/null -w '%{http_code}' "$SITE$1"; }

echo "冒烟检查 $SITE"

# 分页地址单列出来：它是 /posts/page/2 而不是 /posts/2（见 Pagination.astro），
# 而 /posts/2 这个形状同样会返回 200——它是 id=2 的文章。
# 也就是说分页路由整个坏掉时，上面那一行 /posts 依然是绿的，得单查一条。
# 内容不足一页时会回落到第一页，仍然是 200，所以这条断言不依赖库里有多少篇。
for path in / /posts /notes /posts/1 /posts/page/2 /notes/page/2 /search /login; do
  check "GET $path" 200 "$(status "$path")"
done

check "GET /about -> 301" 301 "$(status /about)"
check "GET /admin (gone)" 404 "$(status /admin)"

# 不存在的文章要出 404 页面，不是白底一行黑字。
# 这一条破例查了内容：两种情况的状态码都是 404，光看状态码分不出来
# （Astro 只在响应体为空时才接管去渲染 404.astro，见 posts/[id].astro）。
check "GET /posts/99999 (404 页面)" "页面未找到" \
  "$(curl -s "$SITE/posts/99999" | grep -o '页面未找到' | head -1)"

# 浏览量白名单跟着分页地址走，改一处忘了另一处的话这里会红。
# 代价是每次冒烟给 /posts/page/2 记一次访问——同 IP 24 小时只算一次
check "POST /api/views (分页地址)" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$SITE/api/views" \
    -H "Origin: $SITE" -H 'Content-Type: application/json' \
    -d '{"path":"/posts/page/2"}')"

# 写接口没有会话必须挡住
check "POST /api/admin/entries" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$SITE/api/admin/entries" \
    -H "Origin: $SITE" -H 'Content-Type: application/json' -d '{}')"

# 登录用一个必然错误的口令：要的是 302 回登录页，不是 500。
# 这一条正是当初漏掉的那个——限流每十分钟五次，跑几次冒烟不会把自己关在门外
check "POST /api/auth/login (bad)" 302 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$SITE/api/auth/login" \
    -H "Origin: $SITE" -F "password=smoke-test-not-the-password")"

# 图片出口：随便取一张已知存在的图，确认 R2 那条链路通着
uid=$(curl -s "$SITE/notes" | grep -o '/media/[0-9a-f-]\{36\}/400\.webp' | head -1)
if [ -n "$uid" ]; then
  check "GET $uid" 200 "$(status "$uid")"
else
  echo "  · 页面上没有图片，跳过图片出口检查"
fi

echo
if [ "$failed" -eq 0 ]; then
  echo "全部通过"
else
  echo "$failed 项失败"
  exit 1
fi
