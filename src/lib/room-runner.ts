import { spawn as defaultSpawn, type ChildProcess } from 'node:child_process';
import { validateMessage } from './specialists';
import { classifyApproval } from './hermes-approval';
import { redact } from '../../hermes-bridge/lib/operational.mjs';

export type SpawnLike = (command: string, args: string[], options: { shell: false; stdio: ['ignore','pipe','pipe'] }) => ChildProcess;
export function assertRoomPrompt(profile: unknown, prompt: unknown) {
  const value = validateMessage(profile, prompt);
  const approval = classifyApproval({ kind: 'chat', title: value, prompt: value });
  if (approval.sideEffecting) throw new Error(`Approval required: ${approval.reason}`);
  return value;
}
export function spawnSpecialist(profileId: string, prompt: string, spawnProcess: SpawnLike = defaultSpawn): Promise<{ result: string; durationMs: number }> {
  const validated = assertRoomPrompt(profileId, prompt);
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawnProcess('hermes', ['-p', profileId, 'chat', '--toolsets', 'hermes-webhook', '--continue', `mission-control-${profileId}`, '--create-if-missing', '--query', validated, '--oneshot', '--quiet', '--run-budget', '120'], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', error = '', exceeded = false, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 120000);
    const collect = (chunk: Buffer, stderr: boolean) => { if (output.length + error.length + chunk.length > 32000) { exceeded = true; child.kill('SIGKILL'); return; } if (stderr) error += chunk.toString(); else output += chunk.toString(); };
    child.stdout?.on('data', c => collect(c, false)); child.stderr?.on('data', c => collect(c, true));
    child.on('error', () => { clearTimeout(timer); reject(new Error('Hermes executable unavailable')); });
    child.on('close', code => { clearTimeout(timer); if (timedOut || exceeded) reject(new Error(timedOut ? 'Hermes timed out after 120 seconds' : 'Hermes output exceeded limit')); else if (code !== 0) reject(new Error(/No Codex credentials stored/i.test(error + output) ? 'Auth required: No Codex credentials stored' : 'Hermes failed; raw provider diagnostics withheld')); else resolve({ result: redact(output.trim()), durationMs: Date.now() - started }); });
  });
}
