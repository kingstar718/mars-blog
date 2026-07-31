#!/usr/bin/env bash
# 部署后的冒烟检查。
#
#   ./scripts/smoke.sh                      # 打线上
#   ./scripts/smoke.sh http://localhost:4321  # 打本地
#
# 为什么需要它：这个项目有一类问题只在线上出现——Workers 的运行时限制
# （比如 PBKDF2 迭代次数上限）本地 miniflare 不拦，构建和类型检查也看不见，
# 只有真发一个请求才会暴露。曾经因此让登录接口在线上 500 而不自知。
#
# 只查「能不能用」，不查内容。断言写成期望的状态码，失败时打印实际值。
set -uo pipefail

SITE="${1:-https://mars-blog.wujinxing718.workers.dev}"
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

for path in / /posts /notes /posts/1 /search /login; do
  check "GET $path" 200 "$(status "$path")"
done

check "GET /about -> 301" 301 "$(status /about)"
check "GET /admin (gone)" 404 "$(status /admin)"

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
