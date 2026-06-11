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
├── reasonix/                                # ✅ 已删除 — 不再需要
│   └── runReasonix.ts                       # ❌ 旧的 pipe 实现（已删除）
├── commands/
│   ├── reasonixCommand.ts                   # ✅ 重写 — 现在调用 runAcp
│   └── codexCommand.ts
└── utils/
    └── createSessionMetadata.ts             # ✏️ 加了 'reasonix' flavor
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

### 错误路径（我们当前的实现）

```
reasonix code ──stdout pipe──→ sendSessionEvent({type:'message', …}) ──→ 手机 App ❌
```

直接 pipe 纯文本 stdout，手机 App **不识别**，因此无法渲染。

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

1. `packages/happy-cli/src/index.ts` — 加了 `happy reasonix` 命令入口
2. `packages/happy-cli/src/commands/reasonixCommand.ts` — ✅ 重写：解析参数后调用 `runAcp({ agentName:'reasonix', command:'reasonix', args:['acp'] })`
3. `packages/happy-cli/src/reasonix/runReasonix.ts` — ❌ 已删除（错误的 pipe 实现）
4. `packages/happy-cli/src/utils/createSessionMetadata.ts` — 加了 `'reasonix'` flavor 类型
5. `packages/happy-cli/src/agent/acp/acpAgentConfig.ts` — ✅ 已注册 `reasonix: { command: 'reasonix', args: ['acp'] }`
6. `packages/happy-cli/src/agent/acp/runAcp.ts` — ✅ `resolveSessionFlavor` 返回 `'reasonix'`，新增 `initialPermissionMode` 参数
