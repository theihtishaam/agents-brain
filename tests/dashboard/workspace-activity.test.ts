import { afterEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { DashboardServer } from '../../src/dashboard/server.js';
import { getFeatureSettings } from '../../src/brain/feature-settings.js';
import { getBrainBus } from '../../src/brain/brain-bus.js';
import { getGlobalBrain } from '../../src/brain/global-brain.js';

let dashboard: DashboardServer | undefined;
let socket: WebSocket | undefined;
afterEach(async () => {
  socket?.terminate();
  await dashboard?.stop();
  await getGlobalBrain().shutdown();
});

it('uses the real activity flag for socket delivery, backlog, and legacy feed', async () => {
  const projectDir = path.join(os.homedir(), 'project');
  fs.mkdirSync(projectDir, { recursive: true });
  const brain = getGlobalBrain({ dbPath: path.join(os.homedir(), 'activity.json') });
  await brain.init();
  const flags = getFeatureSettings();
  await flags.update({ liveActivity: false });
  const orchestrator = Object.assign(new EventEmitter(), {
    getStatus: () => ({ projectDir, agents: [] }), getLastHealthScore: () => null, getLastFixes: () => [],
  });
  dashboard = new DashboardServer(orchestrator as any, { host: '127.0.0.1', port: 0 });
  const url = await dashboard.start();
  expect(new URL(url).port).not.toBe('0');
  const hub = await (await fetch(url + '/')).text();
  expect(hub).toContain('brain-canvas');
  const workspace = await (await fetch(url + '/workspace')).text();
  expect(workspace).toContain('id="page-context"');
  const advanced = await (await fetch(url + '/advanced')).text();
  expect(advanced).toContain('Open feature controls');
  expect(await (await fetch(url + '/api/v6/activity-log')).json()).toEqual([]);
  getBrainBus().publish({ id: 'before-connect', type: 'fixture', source: 'codex', detail: 'Only a fixture' });
  const messages: any[] = [];
  socket = new WebSocket(url.replace('http:', 'ws:'));
  socket.on('message', message => messages.push(JSON.parse(message.toString())));
  await vi.waitFor(() => expect(messages.some(message => message.type === 'stats')).toBe(true));
  expect(messages.some(message => message.type === 'activity-backlog')).toBe(false);
  getBrainBus().publish({ id: 'while-disabled', type: 'fixture', source: 'codex' });
  await delay(40);
  expect(messages.some(message => message.type === 'activity')).toBe(false);
  await flags.update({ liveActivity: true });
  getBrainBus().publish({ id: 'after-enable', type: 'fixture', source: 'codex' });
  await vi.waitFor(() => expect(messages.some(message => message.type === 'activity' && message.event.id === 'after-enable')).toBe(true));
});
