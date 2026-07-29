---
pubDatetime: "2026-07-07 17:33"
title: "用 Claude Code Skills 打造个人 AI 工作流"
description: "用 SKILL.md 把提交规范、写作流程和状态栏固化成可复用的 AI 指令。"
aiGenerated: true
updates:
  - datetime: "2026-07-07 17:35"
    action: 创建
    note: "初次生成全文"
    agent: "Claude Code 2.1.201 / deepseek-v4-pro[1m]"
  - datetime: "2026-07-28 12:14"
    action: 修改
    note: "更正已失效的举例：schema 移除 modDatetime、tags 后，相关描述改为当前仍成立的说法"
    agent: "Claude Code 2.1.220 / claude-opus-5"
  - datetime: "2026-07-28 15:43"
    action: 修改
    note: "更新记录一节改写为三段式演进，示例换成 frontmatter 的 updates 数组；修正流程里过时的 UTC 时间和 <details> 说法"
    agent: "Claude Code 2.1.220 / claude-opus-5"
  - datetime: "2026-07-28 15:50"
    action: 修改
    note: "精简 description 至一行；正文另有三处「文末更新记录」的说法改为 updates；去掉重复的 AI 提示行"
    agent: "Claude Code 2.1.220 / claude-opus-5"
---

## 问题

用 AI 写代码半年，最大的痛点不是 AI 不够聪明，而是**每次都要把同一套规矩重新说一遍**。

commit message 用什么格式、文章 frontmatter 怎么填、发布前检查哪些项、AI 归属信息写在哪——这些规则每换一个会话就要重复交代，偶尔漏掉一两条，AI 就按自己的"理解"自由发挥。

Claude Code 的 Skills 机制提供了一个解法：把规范和流程写成 Markdown 文件，放在约定目录下。AI 在触发对应场景时自动加载、严格遵循。我把自己常用的三套规范整理成 [my-skills](https://github.com/kingstar718/my-skills)，同时适配 Claude Code 和 Codex。

## Skills 是怎么工作的

Skill 就是一个目录，里面一个 `SKILL.md`。文件头部的 YAML frontmatter 声明名称和触发描述，正文就是给 AI 的完整指令。

```yaml
---
name: git-commit-convention
description: Use when the user asks to create, revise, or execute a Git commit.
---
```

AI 读到这个文件后，会把它当作当前会话的行为准则——不是"参考"，是"必须遵守"。描述字段（`description`）决定了什么时候触发：当用户说"帮我提交"时，AI 匹配到 `git-commit-convention`，加载它的 SKILL.md，然后严格按照其中的流程执行。

目录结构如下：

```text
my-skills/
├── .claude-plugin/
│   ├── plugin.json          # Claude Code 插件清单
│   └── marketplace.json     # marketplace 注册信息
└── plugins/my-skills/
    ├── .codex-plugin/
    │   └── plugin.json      # Codex 插件清单
    └── skills/
        ├── git-commit-convention/
        │   └── SKILL.md
        ├── my-blog-build/
        │   └── SKILL.md
        └── my-statusline/
            ├── SKILL.md
            └── statusline.js
```

两份 `plugin.json` 指向同一个 `skills/` 目录，两套 AI 工具共用同一套规范文件。新增 skill 只需新建目录和 `SKILL.md`，不需要改清单、不需要重新注册——框架自动扫描 `skills/` 下的所有子目录。

## 三个 Skill 的设计决策

### git-commit-convention：安全比方便重要

这个 skill 解决的是最高频的操作——每次 commit 都要确认格式。但设计方案时，安全约束比格式规范花了更多心思。

**不自动提交**。AI 生成 commit message 不等于授权执行。只有用户明确说"提交"时，才按流程暂存和提交。这条规则避免了 AI 在用户还在调整改动时擅自提交。

**逐文件暂存**。禁止 `git add -A` 和 `git add .`。必须逐项 `git add <目标文件>`，提交前再 `git diff --cached` 确认暂存内容与 message 一致。这保证了每次提交的粒度可控——不会把无关改动混进去。

**AI 归属单行记录**。在 message 末尾追加一行：

```text
AI-Generated-By: Claude Code 2.1.201 / deepseek-v4-pro[1m]
```

Agent 版本和模型名按当前运行环境自动探测，会话内缓存复用。某项无法获取时写 `unknown`——不推测，不编造。这使得 `git log` 中人和 AI 的贡献边界一目了然。

**中文 subject + 英文 type**。`feat(post): 新增字体方案文章`——type 和 scope 用英文（与 Conventional Commits 生态兼容），描述用中文（阅读时更自然）。

### my-blog-build：把"记得"写进规范

写博客文章看起来简单，但每次都有七八个细节容易遗漏：日期更新了吗？frontmatter 有没有混进 schema 已经不认的字段？更新记录加了吗？

这个 skill 的设计思路是**把"记得"全部写死**——做成检查清单，AI 逐项执行，用户不需要提醒。

一篇新文章的完整流程：

1. 确认 `src/content/posts/` 下无同名文件
2. 填充 frontmatter 字段（对齐 Zod schema），时间取当前北京时间
3. 正文按 Markdown 写作约定组织
4. 在 frontmatter 的 `updates` 里追加一条记录
5. 本地 `pnpm build` 验证
6. 逐文件暂存、确认 diff、提交推送

每一步都写成明确指令，不留给 AI "自己判断"的空间。

更新记录是这个 skill 最有意思的设计，也是改得最多的地方。最初用 HTML 注释（`<!-- -->`），对读者不可见；后来改成正文里可见的 `<details>` 折叠表格；现在它是 frontmatter 里的一个数组：

```yaml
updates:
  - datetime: "2026-07-07 17:29"
    action: 修改
    note: 补充第三节示例代码
    agent: "Claude Code 2.3.0 / claude-opus-4-8"
  - datetime: "2026-07-07 17:23"
    action: 创建
    note: 初次生成全文
    agent: "Claude Code 2.1.201 / deepseek-v4-pro[1m]"
```

搬进 frontmatter 是因为它本来就是元数据而不是正文。写在正文里，四列表格在手机上没法看，格式写错也没人拦；换成 schema 校验的字段之后，日期格式、操作类型、说明非空都由构建把关，排版则交给组件，跟正文样式互不牵扯。

页面上它收在标题下方，和日期、目录并排，默认折叠。读者能看到文章的 AI 辅助历程，作者（我）翻源文件时也能快速定位上次改了什么。

写作质量也有显式标准——六条，每条带具体判断依据：

- **简洁**：删掉"众所周知""值得一提的是"等冗余引导词，每段一个信息点
- **明了**：新技术术语首次出现时用一句话解释
- **流畅**：从"是什么"到"为什么"再到"怎么做"的顺序展开
- **用词规范**：同一概念通篇用同一个词，技术术语参考业界通用译法
- **可读性**：段落不超过 5 行，操作步骤用有序列表
- **复验**：生成后通读一遍，检查语法、逻辑、术语一致性

### my-statusline：信息密度与视觉负担的平衡

Claude Code 支持在终端底部显示自定义状态栏。这个 skill 做的是一个纯 Node.js 脚本，从 stdin 读取会话 JSON，输出一行彩色状态栏：

```
Claude Opus 4.8 | interview-wiki | main | ▓▓▓▓░░░░░░ 23k/1m | 5h 24% 12:34 | 7d 41% 7/11 10:24
```

六个信息段，按认知优先级从左到右排列：模型 → 目录 → 分支 → 上下文用量 → 5h 用量 → 7d 用量。每段独立颜色（模型青、目录蓝、分支绿），用量段按百分比自动变色——<70% 绿、70-89% 黄、≥90% 红。

设计上的取舍：用量窗口附带了重置时刻（如 `12:34`、`7/11 10:24`）。加这几个数字让状态栏长了约 15 个字符，但避免了"看到 90% 却不知道什么时候恢复"的焦虑。纯内置模块 + git CLI，不依赖任何 npm 包，Win/Linux/Mac 三端通用。

## 三条设计原则

回头看三个 skill 中反复出现的模式，归纳出三条原则。

**安全优先**。AI 的"自动"能力越强，安全护栏就要越明确。git-commit-convention 的三条安全规则（不自动提交、逐文件暂存、禁止跳过 hooks）都是不可协商的硬约束。所有不可逆操作（提交、推送、覆盖文件）必须显式授权。

**规范写死，不靠记忆**。my-blog-build 把 frontmatter 的每个字段、写作约定、更新记录的格式都写成模板。AI 不需要"理解"规范，只需要"遵循"规范——这比口头交代可靠得多，也避免了"这次记得说，下次忘了"的问题。

**可审计**。每次 AI 操作都留下可追溯的记录：commit message 中的 `AI-Generated-By`、文章的 `updates` 记录。人和 AI 的贡献边界清晰，回头翻 git log 或文章源文件时不会困惑"这段是谁写的、什么时候改的"。

## 实际效果

现在日常开发的体验变化很具体。

写博客文章时，不再需要交代 frontmatter 格式、写作约定、更新记录的写法。AI 自动按 my-blog-build 的检查清单逐项执行，并追加一条带时间戳的更新记录。我只需要确认内容，然后说"推送"。

提交代码时，AI 生成中文 Conventional Commits、标注 AI 归属、逐文件暂存，不会把无关改动混进提交。commit message 的格式和内容不再需要每次纠正。

状态栏让上下文用量始终可见，超出阈值前就能感知，不需要刻意去查。

这些看起来都是小事，但高频出现时就不再是小事。把每次都要口头交代的规范固化成 Skill，节省的不是几分钟，是持续分散的注意力。
