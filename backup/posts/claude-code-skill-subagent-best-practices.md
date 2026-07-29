---
pubDatetime: "2026-07-07 18:33"
title: "Claude Code 进阶：Skill 与 Subagent 的分工与实践"
description: "Skill 省重复，Subagent 省上下文：两者的分工、规范与反模式。"
aiGenerated: true
updates:
  - datetime: "2026-07-07 18:33"
    action: 创建
    note: "初次生成全文"
    agent: "Claude Code 2.1.197 / aliyun/glm-5.2[1m]"
  - datetime: "2026-07-28 15:50"
    action: 修改
    note: "精简 description 至一行；去掉重复的 AI 提示行"
    agent: "Claude Code 2.1.220 / claude-opus-5"
---

## 先把结论说在前面

用 Claude Code 写代码，你迟早会撞上两个痛点：

- 同一套规矩——commit message 格式、frontmatter 填法、发布前检查项——每换一个会话就要重新交代一遍，偶尔漏一条，AI 就按自己的"理解"自由发挥。
- 让 AI 去跑测试、翻日志、抓文档，回来时主对话已经被几百行输出撑爆，真正要用结论时反而要往上翻半天。

Claude Code 给了两个机制分别对付这两件事：**Skill** 和 **Subagent**。一句话区分：

> **Skill 省重复，Subagent 省上下文。**

想清楚这一层，后面的所有写法规范都有了支点。

## Skill 的必备组成

一个 Skill 的全部硬性要求，就是一个 `SKILL.md` 文件加两行 frontmatter：

```yaml
---
name: my-skill
description: 做什么 + 何时用，埋触发关键词
---
```

| 字段          | 必填 | 规则                                                           |
| ------------- | ---- | -------------------------------------------------------------- |
| `name`        | 是   | ≤64 字符，仅小写字母/数字/连字符，不能含 `anthropic`、`claude` |
| `description` | 是   | 非空，≤1024 字符，要同时写"做什么"和"何时用"                   |

`references/`、`scripts/`、`assets/` 这些文件夹**全部可选**。它们是"渐进式披露"的载体，不是 Skill 成立的前提。一个目录里只放一个 `SKILL.md`，就是合法的 Skill。

## 写好 Skill 的关键在 description

`description` 决定 Claude 是否在合适场景触发这个 Skill——它是发现机制的全部依据。三条铁律：

- **第三人称**。`description` 会被注入系统提示，第一/二人称会破坏发现。
  - ✅ `Processes Excel files and generates reports. Use when...`
  - ❌ `I can help you process Excel files...`
  - ❌ `You can use this to process Excel files...`
- **"做什么" + "何时用"** 都要写，并埋进用户真实会说的触发词。
- 别泛。`Helps with documents` 这种等于没写。

下面这个真实例子就做得很好：

```yaml
description: "Expert code review of current git changes with a senior engineer lens.
Detects SOLID violations, security risks, and proposes actionable improvements."
```

## 渐进式披露：把 SKILL.md 当目录

Skill 的核心机制叫**渐进式披露**，分三层加载：

1. **元数据**（始终加载，约 100 token/Skill）：只有 `name` + `description` 进系统提示。所以装一堆 Skill 也不贵。
2. **指令**（触发时加载，建议 < 5k token）：命中 `description` 时，Claude 才读 `SKILL.md` 正文。
3. **资源/代码**（按需加载，几乎无限）：正文里提到某个文件时，Claude 才去读它。

这意味着大段详细文档应该拆出去，`SKILL.md` 只留骨架。几条结构守则：

- `SKILL.md` 正文**不超过 500 行**，超了就拆。
- `SKILL.md` 当目录用，细节丢 `references/`，正文写"详见 `references/xxx.md`"。
- **引用只深一级**：所有 reference 直接从 `SKILL.md` 链接，禁止 `A → B → C` 套娃——嵌套引用时 Claude 可能只 `head -100` 预览，信息读不全。
- 长 reference（>100 行）顶部放目录，方便跳读。
- 按领域组织文件名：`reference/finance.md`、`sales.md`，而不是 `doc1.md`、`doc2.md`。

命名上，优先动名词形式：`processing-pdfs`、`analyzing-spreadsheets`；避开 `helper`、`utils`、`tools`、`documents` 这类泛名。

## 脚本与反模式

`scripts/` 里放可执行脚本。Claude 用 bash 跑它，**脚本源码不进上下文，只有输出进上下文**。用法要点：

- 优先用**预制脚本**而非让 Claude 现写——更可靠、省 token、保证一致。
- 脚本要**自己处理错误**，别 `open(path).read()` 然后甩给 Claude 收拾。
- 没有"魔法常量"，每个常量注释为什么是这个值。
- 在正文里**说清是"执行"还是"读作参考"**：`Run analyze.py` ≠ `See analyze.py for the algorithm`。
- 高危操作用 **plan → validate → execute**：先生成中间产物（如 `changes.json`），脚本校验通过后再执行。

几条官方点名的反模式，踩中就别踩：

| 反模式                                  | 正确做法                                  |
| --------------------------------------- | ----------------------------------------- |
| Windows 反斜杠路径 `reference\guide.md` | 一律正斜杠 `reference/guide.md`           |
| 给一堆库让 Claude 选                    | 给一个默认 + escape hatch                 |
| 假设包装已安装                          | 写明 `pip install pypdf`                  |
| 时间敏感表述"2025 年 8 月前用旧 API"    | 旧方案塞进 `<details>` 的 Old patterns 段 |
| 嵌套引用超过一层                        | 所有 reference 直接挂到 `SKILL.md`        |

## Subagent：独立上下文的工人

Subagent 是一个跑在**独立上下文窗口**里的 AI 助手，有自己的 system prompt、工具白名单和独立权限。干完活，只把**摘要**返回主对话。

它和 Skill 的本质区别：

|            | Skill         | Subagent                                  |
| ---------- | ------------- | ----------------------------------------- |
| 运行上下文 | 主对话上下文  | 独立上下文窗口                            |
| 隔离性     | 共享          | 隔离，只返回摘要                          |
| 解决的痛点 | 省重复        | 省上下文                                  |
| 形态       | 指令/资源文件 | 有独立 system prompt + 工具白名单的 agent |

文件格式是 markdown + YAML frontmatter，正文就是子 agent 的 system prompt：

```yaml
---
name: code-reviewer
description: Reviews code for quality. Use proactively after code changes.
tools: Read, Grep, Glob, Bash # 省略则继承全部工具
model: inherit # sonnet/opus/haiku/fable/inherit
---
You are a senior code reviewer. ...
```

存放位置决定作用域，优先级从高到低：managed settings > `--agents` CLI > `.claude/agents/`（项目级，入版本控制）> `~/.claude/agents/`（用户级）> 插件 `agents/`。

frontmatter 只 `name` + `description` 必填，其余可选：`tools` / `disallowedTools` / `model` / `permissionMode` / `maxTurns` / `skills`（预加载 Skill 进上下文）/ `mcpServers` / `hooks` / `memory` / `background` / `effort` / `isolation: worktree` / `color`。注意插件 agent 不支持 `hooks`、`mcpServers`、`permissionMode`（安全限制，会被忽略）。

## 上下文隔离的几个关键事实

Subagent 的隔离不是绝对的，这几个边界要记牢：

- 子 agent **不见**主对话历史、你已调过的 Skill、已读的文件（fork 例外）。Claude 写一条 delegation message 交代任务。
- **但会加载**：`CLAUDE.md` 全层级 + 记忆 + git status 快照（`Explore` 和 `Plan` 例外，这俩为了快和省而跳过）。
- 所以"忽略 `vendor/` 目录"这类规则若必须到达子 agent，要在派活时重述进 prompt。
- 可**嵌套**，最深 5 层；fork 不能再生 fork。
- 可 **resume**（`SendMessage` + agentId），保留完整历史；`Explore`、`Plan` 是 one-shot，不能 resume。

触发方式从弱到强：自动委派（Claude 看 `description`）→ 自然语言点名 → `@agent-<name>`（保证跑这一个）→ `claude --agent <name>`（整场会话换成该 agent 的 system prompt）。

## 何时用主对话、Skill 还是 Subagent

这三者的选择，取决于任务的形状：

| 场景                                                     | 选择     |
| -------------------------------------------------------- | -------- |
| 频繁来回、多阶段共享上下文、快速小改、延迟敏感           | 主对话   |
| 产出冗长输出（跑测试、抓文档、处理日志）且主对话不再引用 | Subagent |
| 要工具限制或独立权限                                     | Subagent |
| 工作自包含、可返回摘要                                   | Subagent |
| 可复用的提示/工作流，想在主上下文跑                      | Skill    |

Subagent 最有效的用法，是**隔离高产输出操作**：

```text
Use a subagent to run the test suite and report only the failing tests
```

测试的几百行输出留在子 agent 的上下文里，主对话只收到"3 个失败 + 错误信息"。其次是**并行研究**——独立的调查派多个子 agent 同时跑，各自探索完由 Claude 综合；以及**链式工作流**——`code-reviewer 找问题 → optimizer 修复`。

写 Subagent 的最佳实践就四条：每个 agent 专精一件事；`description` 写详细（决定委派时机）；最小工具权限（只读 review 就别给 `Edit`、`Write`）；项目级 agent 入版本控制，团队共享。

## 一个真实的反面教材

我本地有个插件 agent `scanner.md`，正文写得相当好——专精扫描 Java/Spring 项目的对外服务入口，输出结构化 JSON，明确约束"不猜测、不编造"，产出落盘到 `.claude/entries-scan.json`。是 Subagent 专精化的好范例。

**但它没有 YAML frontmatter。**

按官方规范，Subagent 文件必须有 `name` + `description` 才能被 Claude Code 识别为可自动委派的 agent。它现在能跑，是靠 `commands/` 里显式调用，而不是靠自动委派。想让 Claude 在用户说"扫一下入口""梳理对外能力"时自动派给它，得补上：

```yaml
---
name: scanner
description: 扫描 Java/Spring 项目对外服务入口（Controller/Feign/Dubbo/gRPC/MQ/定时任务），输出结构化 JSON 清单。Use when 需要梳理项目对外能力、能力映射、或增量扫描入口。
tools: Read, Grep, Glob, Write
---
```

`description` 里埋的中文触发词，就是自动委派的钥匙。

## 小结

回到开头那句话：**Skill 省重复，Subagent 省上下文**。

Skill 把"同一套规矩"固化为文件，靠 `description` 在合适场景被自动加载，核心是渐进式披露——`SKILL.md` 当目录，细节丢 `references/`，脚本丢 `scripts/`。Subagent 把"会产生大量输出的边活"丢进独立上下文，只把摘要收回主对话，核心是专精 + 最小权限。

两者不是二选一，而是配合：用 Skill 沉淀规范，用 Subagent 隔离脏活。把 `description` 写好，是这两者共同的最关键一步。
