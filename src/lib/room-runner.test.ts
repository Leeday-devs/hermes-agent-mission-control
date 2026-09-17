import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { assertRoomPrompt, spawnSpecialist } from './room-runner';

test('room prompts reject side effects and unknown profiles', () => {
  assert.throws(() => assertRoomPrompt('builder', 'deploy this'), /Approval required/);
  assert.throws(() => assertRoomPrompt('nope', 'hello'), /Unknown/);
});

test('runner uses the enforced hermes-webhook argv boundary', async () => {
  const child = new EventEmitter() as EventEmitter & Pick<ChildProcess, 'stdout' | 'stderr' | 'kill'>;
  child.stdout = new EventEmitter() as ChildProcess['stdout'];
  child.stderr = new EventEmitter() as ChildProcess['stderr'];
  child.kill = () => true;
  const calls: Array<{ cmd: string; args: string[]; opts: { shell: false } }> = [];
  const result = await spawnSpecialist('builder', 'summarize status', (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    setImmediate(() => {
      child.stdout?.emit('data', Buffer.from('token=secret\nanswer'));
      child.emit('close', 0);
    });
    return child as ChildProcess;
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, 'hermes');
  assert.deepEqual(calls[0].args, [
    '-p', 'builder', 'chat', '--toolsets', 'hermes-webhook', '--continue',
    'mission-control-builder', '--create-if-missing', '--query', 'summarize status',
    '--oneshot', '--quiet', '--run-budget', '120',
  ]);
  assert.equal(calls[0].opts.shell, false);
  assert.match(result.result, /\[redacted\]/);
});
