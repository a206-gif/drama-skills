# AGENTS.md

## 重要改动必须留笔记

决策笔记放在 `.agents/notes/{proposed,implemented,rejected}/{feature,bug-fix,simplification,architecture,process,testing}/yyyy-mm-dd-topic.md`，沿用 DeepSeek Harness 的 agent-notes 约定（方法见 https://github.com/czm15053/write-notes-like-deepseek）。正文中文，小节标题保留英文。

1. 非平凡改动（改了行为、架构、跨文件或跨 skill 契约、流程与工具链、测试策略、落盘格式）动手前，先在 `.agents/notes/` 里搜同主题旧笔记：有归属就地更新事实；没有就先写 `proposed/`，落地时随同代码改动在同一次提交里转 `implemented/`。纯机械改动（排版、改名、版本号、不改行为的补丁、常规 CRUD）直接提交，不写。
2. 每篇必有 `## Problem`、`## Decision`（现在时，只写已落地事实）或 `## Proposal`、`## Alternatives considered`（每个被否方案先写它最强的理由再写为何不用，没考虑过的不要编）、`## Consequences`（收益和代价都写）。
3. 禁止把一篇笔记改写成相反的决定：事实（路径、名字、默认值）就地改；决定翻转就另开一篇并互链。
4. 不建 `INDEX.md`，目录位置就是状态；检索用 `rg --hidden .agents/notes/`。

## 每轮工作必须有记忆存档

本会话后续每轮工作先读 `漫画改编/记忆存档.md` 和涉及的当前源文件；开始时记录本轮范围，结束前更新实际完成、依据、检查结果、未决与下一步。技能/工具修改也记录，不能只靠聊天记忆。工作记忆不复制对白，不替代唯一分镜或伪造已完成状态；旧稿对照与当前修订必须明确区分。

## 本会话的轮末选项与漫画技巧回写

创作者要求每次对话结束都给下一步选项：说明本轮实际完成/未决后，列出2–3个具体可执行方向并标推荐，不把已完成内容再当下一步，不重复询问已认可画风；新付费/外部出图仍需准确批次确认。

制作漫画发现的优化技巧在同轮回写`skills/static-comic/SKILL.md`及所属`references/`，不只留在`漫画改编/记忆存档.md`。项目事实/人名/服装/素材留项目；通用技巧标明适用场景、做法、实际证据与未验证边界，不把一次成功升级为普遍硬规则。
