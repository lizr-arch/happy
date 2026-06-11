import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockAuthAndSetupMachineIfNeeded: vi.fn(),
  mockEnsureDaemonRunning: vi.fn(),
  mockRunAcp: vi.fn(),
}));

vi.mock('@/ui/auth', () => ({
  authAndSetupMachineIfNeeded: mocks.mockAuthAndSetupMachineIfNeeded,
}));

vi.mock('@/daemon/ensureDaemonRunning', () => ({
  ensureDaemonRunning: mocks.mockEnsureDaemonRunning,
}));

vi.mock('@/agent/acp/runAcp', () => ({
  runAcp: mocks.mockRunAcp,
}));

import { handleReasonixCommand } from './reasonixCommand';

describe('handleReasonixCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAuthAndSetupMachineIfNeeded.mockResolvedValue({
      credentials: { token: 'token', encryption: { type: 'legacy' as const, secret: new Uint8Array(32) } },
    });
    mocks.mockEnsureDaemonRunning.mockResolvedValue(undefined);
    mocks.mockRunAcp.mockResolvedValue(undefined);
  });

  it('authenticates and ensures daemon is running before calling runAcp', async () => {
    await handleReasonixCommand([]);

    expect(mocks.mockAuthAndSetupMachineIfNeeded).toHaveBeenCalledTimes(1);
    expect(mocks.mockEnsureDaemonRunning).toHaveBeenCalledTimes(1);
    expect(mocks.mockRunAcp).toHaveBeenCalledWith({
      credentials: { token: 'token', encryption: { type: 'legacy', secret: expect.any(Uint8Array) } },
      agentName: 'reasonix',
      command: 'reasonix',
      args: ['acp'],
      startedBy: undefined,
      verbose: false,
      initialPermissionMode: undefined,
    });
  });

  it('ensures daemon is started before runAcp is called', async () => {
    await handleReasonixCommand([]);

    expect(
      mocks.mockEnsureDaemonRunning.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.mockRunAcp.mock.invocationCallOrder[0]);
  });

  it('parses --started-by and passes it through', async () => {
    await handleReasonixCommand(['--started-by', 'daemon']);

    expect(mocks.mockRunAcp).toHaveBeenCalledWith(
      expect.objectContaining({ startedBy: 'daemon' }),
    );
  });

  it('parses --permission-mode and passes it as initialPermissionMode', async () => {
    await handleReasonixCommand(['--permission-mode', 'yolo']);

    expect(mocks.mockRunAcp).toHaveBeenCalledWith(
      expect.objectContaining({ initialPermissionMode: 'yolo' }),
    );
  });

  it('parses --yolo as a shortcut for permission mode yolo', async () => {
    await handleReasonixCommand(['--yolo']);

    expect(mocks.mockRunAcp).toHaveBeenCalledWith(
      expect.objectContaining({ initialPermissionMode: 'yolo' }),
    );
  });

  it('parses --verbose flag', async () => {
    await handleReasonixCommand(['--verbose']);

    expect(mocks.mockRunAcp).toHaveBeenCalledWith(
      expect.objectContaining({ verbose: true }),
    );
  });

  it('parses --model and passes it as acp args', async () => {
    await handleReasonixCommand(['--model', 'deepseek-v4-pro']);

    expect(mocks.mockRunAcp).toHaveBeenCalledWith(
      expect.objectContaining({ args: ['acp', '--model', 'deepseek-v4-pro'] }),
    );
  });

  it('uses default args when no --model provided', async () => {
    await handleReasonixCommand([]);

    expect(mocks.mockRunAcp).toHaveBeenCalledWith(
      expect.objectContaining({ args: ['acp'] }),
    );
  });

  it('combines all flags correctly', async () => {
    await handleReasonixCommand([
      '--started-by', 'terminal',
      '--permission-mode', 'yolo',
      '--model', 'deepseek-v4-pro',
      '--verbose',
    ]);

    expect(mocks.mockRunAcp).toHaveBeenCalledWith({
      credentials: { token: 'token', encryption: { type: 'legacy', secret: expect.any(Uint8Array) } },
      agentName: 'reasonix',
      command: 'reasonix',
      args: ['acp', '--model', 'deepseek-v4-pro'],
      startedBy: 'terminal',
      verbose: true,
      initialPermissionMode: 'yolo',
    });
  });

  it('uses --yolo value even when --permission-mode is also specified (last wins)', async () => {
    // --permission-mode ask comes first, then --yolo overrides
    await handleReasonixCommand(['--permission-mode', 'ask', '--yolo']);

    expect(mocks.mockRunAcp).toHaveBeenCalledWith(
      expect.objectContaining({ initialPermissionMode: 'yolo' }),
    );
  });
});
