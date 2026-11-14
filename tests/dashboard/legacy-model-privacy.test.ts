import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { getGlobalBrain } from '../../src/brain/global-brain.js';
import { DashboardServer } from '../../src/dashboard/server.js';

const mock = vi.hoisted(() => {
  const provider = { id: 'openai', defaultModel: 'fixture-model', enabled: true, displayName: 'Fixture Provider',
    apiKey: 'private-fixture-value', baseUrl: 'https://fixture.test/?private=private-fixture-value', unsafe: 'private-fixture-value' };
  const route = { provider: 'openai', model: 'fixture-model', unsafe: 'private-fixture-value' };
  const intelligence = { leadProvider: 'openai', leadModel: 'fixture-model', fallbackChain: [route], perFeatureModel: { test: route },
    useAgentToolModels: true, preferLocalFirst: false, unsafe: 'private-fixture-value' };
  return { provider, registry: {
    init: vi.fn(), listProviders: vi.fn(() => [provider]), getProvider: vi.fn((id: string) => id === provider.id ? provider : undefined),
    getDiscoveredAgentConfigs: vi.fn(() => { throw new Error('Host discovery called'); }),
    saveProvider: vi.fn(() => provider), getIntelligence: vi.fn(() => intelligence), setIntelligence: vi.fn(() => intelligence),
    listModels: vi.fn(() => [{ id: 'fixture-model', provider: 'openai', displayName: 'Fixture Model', tags: ['remote'], unsafe: 'private-fixture-value' }]),
    test: vi.fn(() => ({ ok: false, error: 'private-fixture-value' })),
  } };
});
vi.mock('../../src/brain/model-registry.js', () => ({ getModelRegistry: () => mock.registry }));

it('exposes only public provider DTOs and disables the obsolete custom-agent configuration endpoint', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-provider-http-'));
  const brain = getGlobalBrain({ dbPath: path.join(dir, 'global.json') });
  const customConfig = path.join(os.homedir(), '.shadow-brain', 'custom-agents.json');
  const customBytes = JSON.stringify({ agents: [{ name: 'fixture-host', apiKey: 'private-fixture-value', path: 'fixture-path' }] });
  fs.mkdirSync(path.dirname(customConfig), { recursive: true });
  fs.writeFileSync(customConfig, customBytes);
  const orchestrator = Object.assign(new EventEmitter(), {
    getStatus: () => ({ projectDir: dir, agents: [] }), getLastHealthScore: () => null, getLastFixes: () => [],
  });
  const dashboard = new DashboardServer(orchestrator as never, { host: '127.0.0.1', port: 0 });
  try {
    const url = await dashboard.start();
    const request = async (route: string, body?: object, status = 200) => {
      const response = await fetch(url + '/api/v6/' + route, body ? {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      } : undefined);
      const text = await response.text();
      expect(response.status, text).toBe(status);
      expect(text).not.toContain('private-fixture-value');
      return JSON.parse(text);
    };
    const publicProvider = { id: 'openai', defaultModel: 'fixture-model', enabled: true, displayName: 'Fixture Provider' };
    expect(await request('providers')).toEqual({ providers: [publicProvider], discovered: [] });
    expect(mock.registry.getDiscoveredAgentConfigs).not.toHaveBeenCalled();
    expect(await request('provider-save', { provider: 'openai', defaultModel: 'new-model' })).toEqual(publicProvider);
    expect(mock.registry.saveProvider).toHaveBeenCalledWith('openai', expect.objectContaining({ defaultModel: 'new-model' }));
    expect(await request('provider-models', { provider: 'openai' })).toEqual([{ id: 'fixture-model', provider: 'openai', displayName: 'Fixture Model', tags: ['remote'] }]);
    expect(await request('provider-test', { provider: 'openai' })).toEqual({ ok: false, error: 'Provider test failed.' });
    expect(await request('config-test', { provider: 'openai' })).toEqual({ ok: false, provider: 'openai', error: 'Use the Models panel to test a configured provider.' });
    const publicIntelligence = await request('intelligence');
    expect(publicIntelligence).toMatchObject({ useAgentToolModels: false, fallbackChain: [{ provider: 'openai', model: 'fixture-model' }] });
    expect(publicIntelligence.perFeatureModel).toEqual({ test: { provider: 'openai', model: 'fixture-model' } });
    await request('intelligence', { leadProvider: 'openai', fallbackChain: [{ provider: 'openai', model: 'fixture-model', unsafe: 'private-fixture-value' }] });
    expect(mock.registry.setIntelligence).toHaveBeenCalledWith({ leadProvider: 'openai', fallbackChain: [{ provider: 'openai', model: 'fixture-model' }] });
    expect(await request('custom-agents')).toEqual({ agents: [], available: false });
    await request('custom-agents', { agents: [] }, 410);
    expect(fs.readFileSync(customConfig, 'utf8')).toBe(customBytes);
  } finally {
    await dashboard.stop();
    await brain.shutdown();
    fs.unlinkSync(customConfig);
    const canonical = fs.realpathSync.native(dir);
    if (path.dirname(canonical) !== fs.realpathSync.native(os.tmpdir()) || !path.basename(canonical).startsWith('sb-provider-http-')) {
      throw new Error('Unexpected fixture path.');
    }
    fs.rmSync(canonical, { recursive: true, force: true });
  }
});
