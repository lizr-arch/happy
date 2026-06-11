import { spawn } from 'cross-spawn';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ApiClient } from '@/api/api';
import { logger } from '@/ui/logger';
import { Credentials, readSettings } from '@/persistence';
import { initialMachineMetadata } from '@/daemon/run';
import { configuration } from '@/configuration';
import { projectPath } from '@/projectPath';
import packageJson from '../../package.json';
import { createSessionMetadata } from '@/utils/createSessionMetadata';
import { setupOfflineReconnection } from '@/utils/setupOfflineReconnection';
import { notifyDaemonSessionStarted } from '@/daemon/controlClient';
import { encodeBase64, decodeBase64 } from '@/api/encryption';
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler';
import { connectionState } from '@/utils/serverConnectionErrors';
import type { PermissionMode, Session as ApiSession } from '@/api/types';

const DEFAULT_REASONIX_PERMISSION_MODE: PermissionMode = 'yolo';

export async function runReasonix(opts: {
  credentials: Credentials;
  startedBy?: 'daemon' | 'terminal';
  permissionMode?: PermissionMode;
}): Promise<void> {
  // ── Verify reasonix is installed ──
  try {
    const { execSync } = await import('node:child_process');
    execSync('reasonix --version', { encoding: 'utf8', stdio: 'pipe', windowsHide: true });
  } catch {
    console.error('\n\x1b[1m\x1b[33mReasonix is not installed\x1b[0m\n');
    console.error('Please install Reasonix:\n');
    console.error('  \x1b[36mnpm install -g reasonix\x1b[0m\n');
    console.error('Or use: happy claude / happy codex\n');
    process.exit(1);
  }

  logger.debug(`[REASONIX] Starting Reasonix mode`);

  const workingDirectory = process.cwd();
  const sessionTag = randomUUID();

  connectionState.setBackend('Reasonix');

  // ── API + Machine setup ──
  const api = await ApiClient.create(opts.credentials);
  const settings = await readSettings();
  const machineId = settings?.machineId;
  if (!machineId) {
    console.error('[REASONIX] No machine ID found in settings');
    process.exit(1);
  }
  await api.getOrCreateMachine({ machineId, metadata: initialMachineMetadata });

  const initialPermissionMode = opts.permissionMode ?? DEFAULT_REASONIX_PERMISSION_MODE;

  const { state, metadata } = createSessionMetadata({
    flavor: 'reasonix',
    machineId,
    startedBy: opts.startedBy,
    dangerouslySkipPermissions: initialPermissionMode === 'yolo',
  });

  // ── Create session ──
  const reconnectSessionId = process.env.HAPPY_RECONNECT_SESSION_ID;
  const reconnectKeyBase64 = process.env.HAPPY_RECONNECT_ENCRYPTION_KEY;
  const reconnectVariant = process.env.HAPPY_RECONNECT_ENCRYPTION_VARIANT as 'legacy' | 'dataKey' | undefined;

  let response: ApiSession | null;
  if (reconnectSessionId && reconnectKeyBase64 && reconnectVariant) {
    response = {
      id: reconnectSessionId,
      seq: parseInt(process.env.HAPPY_RECONNECT_SEQ || '0', 10),
      encryptionKey: decodeBase64(reconnectKeyBase64),
      encryptionVariant: reconnectVariant,
      metadata,
      metadataVersion: parseInt(process.env.HAPPY_RECONNECT_METADATA_VERSION || '0', 10),
      agentState: state,
      agentStateVersion: parseInt(process.env.HAPPY_RECONNECT_AGENT_STATE_VERSION || '0', 10),
    };
  } else {
    response = await api.getOrCreateSession({ tag: sessionTag, metadata, state });
  }

  const { session, reconnectionHandle } = setupOfflineReconnection({
    api, sessionTag, metadata, state, response,
    onSessionSwap: () => { /* no-op — reasonix doesn't swap sessions */ },
  });

  // Report to daemon
  if (response) {
    try {
      await notifyDaemonSessionStarted(response.id, metadata, {
        encryptionKey: encodeBase64(response.encryptionKey),
        encryptionVariant: response.encryptionVariant,
        seq: response.seq,
        metadataVersion: response.metadataVersion,
        agentStateVersion: response.agentStateVersion,
      });
    } catch (error) {
      logger.debug('[REASONIX] Failed to report to daemon:', error);
    }
  }

  // ── Spawn reasonix code ──
  let child = spawn('reasonix', ['code'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: workingDirectory,
    env: { ...process.env },
    windowsHide: true,
  });

  // ── stdout/stderr → Happy session → mobile ──
  const sendOutput = (text: string) => {
    session.sendSessionEvent({
      type: 'message',
      message: text,
    });
  };

  let outputBuffer = '';
  child.stdout?.on('data', (data: Buffer) => {
    const text = data.toString();
    outputBuffer += text;
    sendOutput(text);
  });

  child.stderr?.on('data', (data: Buffer) => {
    const text = data.toString();
    outputBuffer += text;
    sendOutput(text);
  });

  // ── Mobile input → stdin ──
  session.onUserMessage((message) => {
    if (message.content?.text) {
      child.stdin?.write(message.content.text + '\n');
    }
  });

  // ── Cleanup on exit ──
  const cleanup = async () => {
    if (child && !child.killed) {
      child.kill();
    }
    session.sendSessionDeath();
    await session.flush();
    await session.close();
    if (reconnectionHandle) reconnectionHandle.cancel();
  };

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
  registerKillSessionHandler(session.rpcHandlerManager, cleanup);

  // ── Wait for reasonix to exit ──
  await new Promise<void>((resolve) => {
    child.on('exit', (code) => {
      logger.debug(`[REASONIX] Process exited with code ${code}`);
      cleanup();
      resolve();
    });
    child.on('error', (err) => {
      logger.debug(`[REASONIX] Process error: ${err}`);
      cleanup();
      resolve();
    });
  });

  process.exit(0);
}
