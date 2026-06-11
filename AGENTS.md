# Happy Coder

## 项目简介

Happy Coder 是一个**移动端 + Web 端的 AI 编程 Agent 远程客户端**。它让你能在手机上操控电脑上的 AI 编程工具（Claude Code、Codex、Gemini CLI）。

**核心能力：** 电脑跑 AI 编程 → 手机实时查看输出、批准权限、发消息 → 按任意键切回电脑终端。端到端加密，零信任架构。

**许可证：** MIT · 仓库：https://github.com/slopus/happy · 官网：https://happy.engineering

## 技术栈

| 层 | 技术 |
|---|---|
| 语言 | **TypeScript** 全库 ESM |
| 包管理 | pnpm 10 workspaces monorepo |
| CLI 终端 UI | **Ink 6.x** + React 19（终端内 React 渲染） |
| 手机/Web 端 | **Expo SDK** + React Native |
| 后端服务器 | **Fastify 5.x** + Prisma (PostgreSQL) + Socket.IO |
| 桌面端 | Electron（codium 包） |
| ACP 协议 | `@agentclientprotocol/sdk` — 通用 Agent Client Protocol |
| 加密 | TweetNaCl + @noble/ed25519 |
| 构建/测试 | pkgroll、vitest、TypeScript 5.9 |

## Monorepo 结构（7 个包）

| 包 | 用途 |
|---|---|
| **happy-cli** | 核心包。`happy` CLI 命令，包装 Claude Code / Codex / Gemini 等 |
| **happy-app** | 手机 App + Web（Expo/React Native） |
| **happy-server** | 后端，加密同步 + Socket.IO 实时通信 |
| **happy-agent** | CI/脚本远程控制 CLI |
| **happy-wire** | 共享协议类型（Zod schema） |
| **happy-app-logs** | 日志查看 |
| **codium** | Electron 桌面版 |

## 关键目录结构

```
packages/happy-cli/src/
├── index.ts                                 # CLI 入口，命令分发
├── agent/acp/
│   ├── AcpBackend.ts                        # ACP 后端：spawn 子进程 + ACP 协议通信
│   ├── AcpSessionManager.ts                 # ACP 消息 → SessionEnvelope 映射
│   ├── runAcp.ts                            # 通用 ACP runner
│   └── acpAgentConfig.ts                    # 已知 ACP Agent 注册表
├── claude/
│   ├── runClaude.ts                         # Claude Code runner
│   ├── claudeLocal.ts                       # spawn claude 子进程
│   └── claudeLocalLauncher.ts               # 本地模式启动器
├── codex/
│   └── runCodex.ts                          # Codex runner
├── gemini/
│   └── runGemini.ts                         # Gemini runner（走 ACP）
├── commands/
│   ├── reasonixCommand.ts                   # ✅ 重写 — 现在调用 runAcp + --model
│   └── codexCommand.ts
└── utils/
    └── createSessionMetadata.ts             # ✏️ 加了 'reasonix' flavor

packages/happy-app/sources/
├── sync/
│   ├── persistence.ts                       # ✏️ NewSessionAgentType 加 'reasonix'
│   ├── agentDefaults.ts                     # ✏️ reasonix 默认 yolo/deepseek-v4-pro/max
│   ├── ops.ts                               # ✏️ SpawnSessionOptions + RPC 加 model
│   └── storageTypes.ts                      # ✏️ cliAvailability 加 reasonix
├── components/
│   ├── modelModeOptions.ts                  # ✏️ Reasonix 模型/权限/effort 列表
│   └── Avatar.tsx                           # ✏️ flavorIcons 加 reasonix
└── app/(app)/
    ├── new/index.tsx                         # ✏️ ALL_AGENTS + spawn 透传 model
    ├── settings/agents.tsx                  # ✏️ agentLabels 加 reasonix
    └── machine/[id].tsx                     # ✏️ Reasonix CLI 可用性行
```

## 架构：消息流

### 正确路径（Gemini / ACP 模式）

```
手机 App ← SessionEnvelope ← AcpSessionManager ← AcpBackend ← 子进程 ACP
                                                              ↑
                                                       reasonix acp
```

1. CLI spawn 子进程（如 `gemini --experimental-acp` 或 `reasonix acp`）
2. `AcpBackend` 通过 stdio JSON-RPC 与子进程通信（ACP 协议）
3. `AcpSessionManager` 将 ACP 事件 → SessionEnvelope
4. SessionEnvelope → Happy Server → 手机 App（渲染消息）

## 当前状态

- ✅ `happy reasonix` CLI 正常工作（ACP 管线 → SessionEnvelope）
- ✅ 手机 App 新建会话可选 Reasonix（需重新 build APK）
- ✅ 支持权限模式（default / yolo）、模型（deepseek-v4-pro 等）、推理强度（max）
- ✅ 启动时 `--model` 透传到 `reasonix acp --model <name>`
- ⚠️ 会话中途不支持切换模型（Reasonix ACP `configOptions=0`）
- ⚠️ Reasonix 有时自称 Claude（DeepSeek system prompt 问题，非集成 bug）

## 构建命令

```bash
# 安装依赖
cd /Users/liz/Codex/Code/git/happy && pnpm install

# 构建 happy-cli
cd packages/happy-cli && pnpm build

# 本地安装（替换系统 happy 命令）
node scripts/install-local.cjs

# 构建 happy-app（Android APK 需要 EAS Build）
cd packages/happy-app
pnpm start        # Expo dev server
eas build --platform android --profile preview  # 云构建 APK
```

## 我们改了什么

### Phase 1 — 修复 happy reasonix 走 ACP 管线
1. `packages/happy-cli/src/index.ts` — 加了 `happy reasonix` 命令入口
2. `packages/happy-cli/src/commands/reasonixCommand.ts` — ✅ 重写：解析参数 → `runAcp({ agentName:'reasonix', command:'reasonix', args:['acp'] })`；支持 `--model`、`--permission-mode`、`--yolo`、`--verbose`
3. `packages/happy-cli/src/reasonix/runReasonix.ts` — ❌ 已删除（错误的 `reasonix code` pipe 实现）
4. `packages/happy-cli/src/utils/createSessionMetadata.ts` — 加了 `'reasonix'` flavor 类型
5. `packages/happy-cli/src/agent/acp/acpAgentConfig.ts` — ✅ `reasonix: { command: 'reasonix', args: ['acp'] }`
6. `packages/happy-cli/src/agent/acp/runAcp.ts` — ✅ `resolveSessionFlavor` 返回 `'reasonix'`，新增 `initialPermissionMode` 参数

### Phase 2 — Reasonix 成为 happy-app 一等公民
7. `packages/happy-cli/src/utils/detectCLI.ts` — CLIAvailability 加 `reasonix: boolean`
8. `packages/happy-cli/src/modules/common/registerCommonHandlers.ts` — SpawnSessionOptions agent union 加 `'reasonix'`，加 `model` 字段
9. `packages/happy-cli/src/daemon/controlServer.ts` — spawn-session schema 加 `'reasonix'` + `model`
10. `packages/happy-cli/src/daemon/run.ts` — tmux / 普通 spawn 都支持 reasonix，透传 `--model`
11. `packages/happy-app/sources/sync/persistence.ts` — NewSessionAgentType 加 `'reasonix'`
12. `packages/happy-app/sources/sync/agentDefaults.ts` — reasonix 默认 `yolo` / `deepseek-v4-pro` / `max`
13. `packages/happy-app/sources/components/modelModeOptions.ts` — Reasonix 模型列表 (deepseek-v4-pro/flash/pro/flash/mimo)、权限 (default/yolo)、effort (low/medium/high/max)
14. `packages/happy-app/sources/app/(app)/new/index.tsx` — ALL_AGENTS + agentIcons 加 Reasonix，spawn 时透传 model
15. `packages/happy-app/sources/components/Avatar.tsx` — flavorIcons 加 reasonix（复用 gpt icon）
16. `packages/happy-app/sources/app/(app)/settings/agents.tsx` — agentLabels 加 reasonix
17. `packages/happy-app/sources/app/(app)/machine/[id].tsx` — 机器详情页加 Reasonix CLI 可用性行
18. `packages/happy-app/sources/sync/storageTypes.ts` — cliAvailability zod schema 加 reasonix
19. `packages/happy-app/sources/sync/ops.ts` — SpawnSessionOptions + RPC 加 model
