import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it, vi } from 'vitest';
import { ModelRegistry } from '../../src/brain/model-registry.js';

it('uses explicit provider settings without importing credentials from host configs or saving environment values', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-provider-fixture-'));
  const config = path.join(dir, 'provider-fixture.json');
  const homeHost = path.join(os.homedir(), '.codex', 'config.json');
  const mockedFetch = vi.fn(async (_url: string, _options: RequestInit) => Response.json({ data: [{ id: 'fixture-gpt-model' }] }));
  vi.stubGlobal('fetch', mockedFetch);
  try {
    fs.mkdirSync(path.dirname(homeHost), { recursive: true });
    fs.writeFileSync(homeHost, JSON.stringify({ model_provider: 'anthropic', model: 'forbidden-host-model', api_key: 'synthetic-host-value' }));
    fs.writeFileSync(config, JSON.stringify({ schemaVersion: 2, providers: { openai: {
      apiKey: 'synthetic-explicit-key', enabled: true, baseUrl: 'https://provider.test/v1', defaultModel: 'test-model',
    } } }));
    const registry = new ModelRegistry(config, { OPENROUTER_API_KEY: 'synthetic-env-value' });
    await registry.init();
    expect(registry.getDiscoveredAgentConfigs()).toEqual([]);
    expect(registry.getProvider('anthropic')).toMatchObject({ enabled: false });
    expect(registry.getProvider('anthropic')?.apiKey).toBeUndefined();
    expect(await registry.listModels('openai')).toEqual([expect.objectContaining({ id: 'fixture-gpt-model' })]);
    expect(mockedFetch).toHaveBeenCalledWith('https://provider.test/v1/models',
      expect.objectContaining({ headers: { Authorization: 'Bearer synthetic-explicit-key' } }));
    await expect(registry.test('openai')).resolves.toMatchObject({ ok: true, modelCount: 1 });
    mockedFetch.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(registry.test('openai')).resolves.toMatchObject({ ok: false, modelCount: 0 });
    await registry.saveProvider('openai', { apiKey: undefined, baseUrl: undefined, defaultModel: 'test-model-next' });
    const persisted = JSON.parse(fs.readFileSync(config, 'utf8'));
    expect(persisted.providers.openai).toMatchObject({ apiKey: 'synthetic-explicit-key', baseUrl: 'https://provider.test/v1', defaultModel: 'test-model-next' });
    expect(persisted.providers.openrouter.apiKey).toBeUndefined();
    expect(JSON.stringify(persisted)).not.toContain('synthetic-host-value');
  } finally {
    vi.unstubAllGlobals();
    fs.unlinkSync(homeHost);
    const canonical = fs.realpathSync.native(dir);
    if (path.dirname(canonical) !== fs.realpathSync.native(os.tmpdir()) || !path.basename(canonical).startsWith('sb-provider-fixture-')) {
      throw new Error('Unexpected fixture path.');
    }
    fs.rmSync(canonical, { recursive: true, force: true });
  }
});
