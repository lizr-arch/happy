import { authAndSetupMachineIfNeeded } from '@/ui/auth'
import { ensureDaemonRunning } from '@/daemon/ensureDaemonRunning'
import { runReasonix } from '@/reasonix/runReasonix'
import type { PermissionMode } from '@/api/types'

export async function handleReasonixCommand(args: string[]): Promise<void> {
  let startedBy: 'daemon' | 'terminal' | undefined = undefined
  let permissionMode: PermissionMode | undefined = undefined

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--started-by') {
      startedBy = args[++i] as 'daemon' | 'terminal'
    } else if (args[i] === '--permission-mode') {
      permissionMode = args[++i] as PermissionMode
    } else if (args[i] === '--yolo') {
      permissionMode = 'yolo'
    }
  }

  const { credentials } = await authAndSetupMachineIfNeeded()
  await ensureDaemonRunning()

  await runReasonix({
    credentials,
    startedBy,
    permissionMode,
  })
}
