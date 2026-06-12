import { authAndSetupMachineIfNeeded } from '@/ui/auth';
import { ensureDaemonRunning } from '@/daemon/ensureDaemonRunning';
import { runAcp } from '@/agent/acp/runAcp';

export async function handleReasonixCommand(args: string[]): Promise<void> {
  let startedBy: 'daemon' | 'terminal' | undefined = undefined;
  let permissionMode: string | undefined = undefined;
  let model: string | undefined = undefined;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--started-by') {
      startedBy = args[++i] as 'daemon' | 'terminal';
    } else if (args[i] === '--permission-mode') {
      permissionMode = args[++i];
    } else if (args[i] === '--yolo') {
      permissionMode = 'yolo';
    } else if (args[i] === '--model') {
      model = args[++i];
    } else if (args[i] === '--verbose') {
      verbose = true;
    }
  }

  const { credentials } = await authAndSetupMachineIfNeeded();
  await ensureDaemonRunning();

  const acpArgs = ['acp'];
  if (permissionMode === 'yolo') {
    acpArgs.push('--yolo');
  }
  if (model) {
    acpArgs.push('--model', model);
  }

  await runAcp({
    credentials,
    agentName: 'reasonix',
    command: 'reasonix',
    args: acpArgs,
    startedBy,
    verbose,
    initialPermissionMode: permissionMode,
  });
}
