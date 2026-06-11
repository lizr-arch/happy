# Happy Reasonix — 改造计划

## 目标

在 Happy Coder 中加一个 `happy reasonix` 命令，让手机（Android/iOS）通过 Happy Coder App 远程操控 Mac 上的 Reasonix CLI。

## 架构

```
手机 App (Happy Coder, Expo/React Native)
      ↕ WebSocket + libsodium 加密
Happy Server (中继服务器, 已有)
      ↕ 加密隧道
Happy CLI ──→ cross-spawn ──→ reasonix code
```

手机 App 和 Happy Server **不需要改**，只改 CLI 层。

---

## 第一步：添加命令入口

### 文件：`packages/happy-cli/src/index.ts`

**改 3 处：**

**① import** — 参照第 36 行 Codex 的 import，加：
```ts
import { handleReasonixCommand } from './commands/reasonixCommand'
```

**② 命令分发** — 参照第 138 行 `else if (subcommand === 'codex')`，在它后面加：
```ts
} else if (subcommand === 'reasonix') {
    try {
      await handleReasonixCommand(args.slice(1));
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error')
      if (process.env.DEBUG) console.error(error)
      process.exit(1)
    }
    return;
```

**③ help 文本** — 在 help 输出里加一行：
```
  happy reasonix          Start Reasonix mode
```

---

## 第二步：创建命令处理器

### 新建：`packages/happy-cli/src/commands/reasonixCommand.ts`

参照 `codexCommand.ts` 结构，简化：

```ts
import { authAndSetupMachineIfNeeded } from '@/ui/auth'
import { ensureDaemonRunning } from '@/daemon/ensureDaemonRunning'
import { runReasonix } from '@/reasonix/runReasonix'

export async function handleReasonixCommand(args: string[]): Promise<void> {
  let startedBy: 'daemon' | 'terminal' | undefined = undefined
  let permissionMode: 'yolo' | 'ask' | 'auto' | undefined = undefined

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--started-by') {
      startedBy = args[++i] as 'daemon' | 'terminal'
    } else if (args[i] === '--permission-mode') {
      permissionMode = args[++i] as any
    } else if (args[i] === '--yolo') {
      permissionMode = 'yolo'
    }
  }

  const { credentials } = await authAndSetupMachineIfNeeded()
  await ensureDaemonRunning()

  await runReasonix({ credentials, startedBy, permissionMode })
}
```

---

## 第三步：创建 Reasonix Runner

### 新建目录：`packages/happy-cli/src/reasonix/`

### 新建：`packages/happy-cli/src/reasonix/runReasonix.ts`

这是最核心的文件。参照 `codex/runCodex.ts` 的思路，但**大幅简化**——Reasonix 不需要 Codex 那套复杂的 thread/message/session protocol，只需要：

1. 用 `cross-spawn` 启动 `reasonix code`
2. 通过 Happy 的 API/SDK 把输入/输出加密转发到手机

核心逻辑（伪代码）：

```ts
import { spawn } from 'cross-spawn'
import { ApiClient } from '@/api/api'
import { logger } from '@/ui/logger'
import type { Credentials } from '@/persistence'
import type { PermissionMode } from '@/api/types'

export async function runReasonix(opts: {
  credentials: Credentials
  startedBy?: 'daemon' | 'terminal'
  permissionMode?: PermissionMode
}): Promise<void> {
  // 1. 验证 reasonix 已安装
  try {
    execSync('reasonix --version', { encoding: 'utf8', stdio: 'pipe' })
  } catch {
    console.error('reasonix is not installed. Run: npm install -g reasonix')
    process.exit(1)
  }

  // 2. 创建 API session（复用 Happy 的 session/加密层）
  const api = await ApiClient.create(opts.credentials)
  const session = await api.getOrCreateSession({...})

  // 3. Spawn reasonix 子进程
  const child = spawn('reasonix', ['code'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd(),
    env: { ...process.env }
  })

  // 4. 绑定 stdin/stdout → Happy 加密通道 → 手机
  child.stdout.on('data', (data) => {
    // 加密后推送到手机
    session.sendOutput(data.toString())
  })
  child.stderr.on('data', (data) => {
    session.sendOutput(data.toString())
  })

  // 5. 监听手机输入 → 写入 stdin
  session.onInput((text) => {
    child.stdin.write(text + '\n')
  })

  // 6. 等待退出
  await new Promise((resolve) => child.on('exit', resolve))
}
```

### 关键差异与 Claude Code：

| 方面 | Claude Code | Reasonix |
|---|---|---|
| 启动命令 | `node claude_local_launcher.cjs` | `reasonix code` |
| 输出格式 | SDK JSON Lines → 协议映射 | 纯文本 stdout，直接转发 |
| 会话恢复 | 复杂 hook 系统 | 不需要，reasonix chat 自带 session |
| 权限管理 | sandbox + permission mode | 走 reasonix.toml 的 yolo mode |

所以 Reasonix runner 可以比 Codex runner **简单 80%**。

---

## 第四步：build & 测试

```bash
cd packages/happy-cli
pnpm install
pnpm build
# 本地安装
node scripts/install-local.cjs
# 测试
happy reasonix
```

---

## 文件清单

| 操作 | 文件 |
|---|---|
| 修改 | `packages/happy-cli/src/index.ts` |
| 新建 | `packages/happy-cli/src/commands/reasonixCommand.ts` |
| 新建 | `packages/happy-cli/src/reasonix/runReasonix.ts` |

总共 **3 个文件**，~150 行代码。

---

## 时间线

| 步骤 | 预估 |
|---|---|
| Fork + 改入口 | 15 min |
| 写 reasonixCommand.ts | 15 min |
| 写 runReasonix.ts | 45 min |
| 构建 + 测试 | 30 min |
| **总计** | **~2 小时** |
