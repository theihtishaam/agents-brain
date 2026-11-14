// src/brain/model-registry.ts — Unified multi-provider LLM adapter
// v6.0.0 — Hive Mind Edition
//
// Supports explicitly configured Ollama, Anthropic, OpenAI, OpenRouter,
// Moonshot/Kimi, Gemini, DeepSeek, and Mistral providers.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type ProviderId =
  | 'ollama' | 'anthropic' | 'openai' | 'openrouter'
  | 'moonshot' | 'gemini' | 'deepseek' | 'mistral'
  | 'agent-proxy' | 'none';

export interface ProviderConfig {
  id: ProviderId;
  displayName: string;
  baseUrl: string;
  apiKey?: string;
  defaultModel?: string;
  source?: 'user' | 'env' | 'agent-discovered';
  discoveredFrom?: string;
  enabled: boolean;
}

export interface ModelInfo {
  id: string;
  provider: ProviderId;
  displayName: string;
  contextWindow?: number;
  priceInputPerMTok?: number;
  priceOutputPerMTok?: number;
  tags: string[];
}

export interface BrainIntelligenceConfig {
  leadProvider: ProviderId;
  leadModel: string;
  fallbackChain: Array<{ provider: ProviderId; model: string }>;
  perFeatureModel: Record<string, { provider: ProviderId; model: string }>;
  useAgentToolModels: boolean;
  preferLocalFirst: boolean;
}

const CONFIG_DIR = path.join(os.homedir(), '.shadow-brain');
const CONFIG_PATH = path.join(CONFIG_DIR, 'model-registry.json');

const PROVIDER_DEFAULTS: Record<ProviderId, Omit<ProviderConfig, 'id' | 'enabled'>> = {
  ollama:      { displayName: 'Ollama (local)',     baseUrl: 'http://127.0.0.1:11434',                       defaultModel: 'qwen2.5-coder:7b' },
  anthropic:   { displayName: 'Anthropic Claude',   baseUrl: 'https://api.anthropic.com/v1',                  defaultModel: 'claude-opus-4-7' },
  openai:      { displayName: 'OpenAI',             baseUrl: 'https://api.openai.com/v1',                     defaultModel: 'gpt-5.4' },
  openrouter:  { displayName: 'OpenRouter',         baseUrl: 'https://openrouter.ai/api/v1',                  defaultModel: 'anthropic/claude-opus-4.7' },
  moonshot:    { displayName: 'Moonshot (Kimi)',    baseUrl: 'https://api.moonshot.cn/v1',                    defaultModel: 'kimi-latest' },
  gemini:      { displayName: 'Google Gemini',      baseUrl: 'https://generativelanguage.googleapis.com/v1',  defaultModel: 'gemini-2.5-flash' },
  deepseek:    { displayName: 'DeepSeek',           baseUrl: 'https://api.deepseek.com/v1',                   defaultModel: 'deepseek-chat' },
  mistral:     { displayName: 'Mistral',            baseUrl: 'https://api.mistral.ai/v1',                     defaultModel: 'mistral-large-latest' },
  'agent-proxy': { displayName: 'Legacy Agent Proxy (unavailable)', baseUrl: '' },
  none:        { displayName: 'No LLM (fallback)',  baseUrl: '' },
};

const ENV_KEY_MAP: Record<ProviderId, string[]> = {
  ollama: [],
  anthropic: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  moonshot: ['MOONSHOT_API_KEY', 'KIMI_API_KEY'],
  gemini: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
  'agent-proxy': [],
  none: [],
};

interface PersistShape {
  schemaVersion: 2;
  providers: Record<string, Partial<ProviderConfig>>;
  intelligence: BrainIntelligenceConfig;
}

function defaultIntelligence(): BrainIntelligenceConfig {
  return {
    leadProvider: 'ollama',
    leadModel: 'qwen2.5-coder:7b',
    fallbackChain: [
      { provider: 'ollama', model: 'qwen2.5-coder:7b' },
    ],
    perFeatureModel: {},
    useAgentToolModels: false,
    preferLocalFirst: true,
  };
}

export class ModelRegistry {
  private providers: Map<ProviderId, ProviderConfig> = new Map();
  private intelligence: BrainIntelligenceConfig = defaultIntelligence();
  private initialized = false;

  constructor(private readonly configPath = CONFIG_PATH, private readonly providerEnv = process.env) {}

  async init(): Promise<void> {
    if (this.initialized) return;
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });

    // Seed defaults
    for (const id of Object.keys(PROVIDER_DEFAULTS) as ProviderId[]) {
      const d = PROVIDER_DEFAULTS[id];
      this.providers.set(id, { id, displayName: d.displayName, baseUrl: d.baseUrl, defaultModel: d.defaultModel, enabled: id === 'ollama', source: 'user' });
    }

    // Load saved config
    if (fs.existsSync(this.configPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.configPath, 'utf-8')) as PersistShape;
        for (const [id, cfg] of Object.entries(parsed.providers ?? {})) {
          const existing = this.providers.get(id as ProviderId);
          if (existing) this.providers.set(id as ProviderId, { ...existing, ...cfg, id: id as ProviderId });
        }
        if (parsed.intelligence) this.intelligence = { ...defaultIntelligence(), ...parsed.intelligence };
      } catch {
        /* skip corrupt file */
      }
    }

    // Pull env-based API keys
    for (const [id, envKeys] of Object.entries(ENV_KEY_MAP)) {
      if (!envKeys.length) continue;
      const p = this.providers.get(id as ProviderId);
      if (!p) continue;
      for (const k of envKeys) {
        const v = this.providerEnv[k];
        if (v && !p.apiKey) { p.apiKey = v; p.source = 'env'; p.enabled = true; break; }
      }
    }

    this.initialized = true;
  }

  /** List all providers and their current status. */
  listProviders(): ProviderConfig[] {
    return Array.from(this.providers.values());
  }

  getProvider(id: ProviderId): ProviderConfig | undefined {
    return this.providers.get(id);
  }

  async saveProvider(id: ProviderId, patch: Partial<ProviderConfig>): Promise<ProviderConfig> {
    await this.init();
    const existing = this.providers.get(id);
    if (!existing) throw new Error('Unknown provider: ' + id);
    const updated = { ...existing, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
      id, source: patch.apiKey !== undefined ? 'user' : existing.source };
    this.providers.set(id, updated);
    await this.persist();
    return updated;
  }

  getIntelligence(): BrainIntelligenceConfig { return { ...this.intelligence }; }

  async setIntelligence(patch: Partial<BrainIntelligenceConfig>): Promise<BrainIntelligenceConfig> {
    await this.init();
    this.intelligence = { ...this.intelligence, ...patch };
    await this.persist();
    return this.getIntelligence();
  }

  /** Fetch available models from a provider (uses /v1/models or provider-specific endpoint). */
  async listModels(providerId: ProviderId): Promise<ModelInfo[]> {
    await this.init();
    const p = this.providers.get(providerId);
    if (!p) return [];

    if (providerId === 'ollama') return this.fetchOllamaModels(p);
    if (providerId === 'anthropic') return this.fetchAnthropicModels(p);
    if (providerId === 'openai') return this.fetchOpenAIModels(p);
    if (providerId === 'openrouter') return this.fetchOpenRouterModels(p);
    if (providerId === 'moonshot' || providerId === 'deepseek' || providerId === 'mistral') return this.fetchOpenAICompatibleModels(p);
    if (providerId === 'gemini') return this.fetchGeminiModels(p);
    return [];
  }

  /** Test connectivity to a provider. */
  async test(providerId: ProviderId): Promise<{ ok: boolean; error?: string; modelCount?: number }> {
    try {
      const models = await this.listModels(providerId);
      return models.length ? { ok: true, modelCount: models.length } :
        { ok: false, modelCount: 0, error: 'The provider did not return a model list.' };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  }

  /** Generate text via the lead model (or fallbacks), returning unified response shape. */
  async generate(prompt: string, opts: { system?: string; featureName?: string; maxTokens?: number } = {}): Promise<{ text: string; provider: ProviderId; model: string; durationMs: number; inputTokens?: number; outputTokens?: number }> {
    await this.init();
    const chain: Array<{ provider: ProviderId; model: string }> = [];
    const override = opts.featureName ? this.intelligence.perFeatureModel[opts.featureName] : undefined;
    if (override) chain.push(override);
    chain.push({ provider: this.intelligence.leadProvider, model: this.intelligence.leadModel });
    chain.push(...this.intelligence.fallbackChain);

    const seen = new Set<string>();
    for (const { provider, model } of chain) {
      const key = provider + '::' + model;
      if (seen.has(key)) continue;
      seen.add(key);
      const p = this.providers.get(provider);
      if (!p || !p.enabled) continue;
      if ((provider === 'anthropic' || provider === 'openai' || provider === 'openrouter' || provider === 'moonshot' || provider === 'deepseek' || provider === 'mistral' || provider === 'gemini') && !p.apiKey) continue;

      const start = Date.now();
      try {
        const out = await this.dispatch(provider, p, model, prompt, opts);
        if (out) return { ...out, provider, model, durationMs: Date.now() - start };
      } catch {
        /* try next in fallback chain */
      }
    }

    return { text: '[no-llm-available] ' + prompt.slice(0, 140), provider: 'none', model: 'fallback', durationMs: 0 };
  }

  /** Compatibility method. Host configuration discovery is disabled. */
  getDiscoveredAgentConfigs(): AgentDiscovered[] { return []; }

  // ── Provider-specific calls ────────────────────────────────────────────

  private async dispatch(provider: ProviderId, p: ProviderConfig, model: string, prompt: string, opts: { system?: string; maxTokens?: number }): Promise<{ text: string; inputTokens?: number; outputTokens?: number } | null> {
    switch (provider) {
      case 'ollama':      return this.callOllama(p, model, prompt, opts);
      case 'anthropic':   return this.callAnthropic(p, model, prompt, opts);
      case 'openai':
      case 'openrouter':
      case 'moonshot':
      case 'deepseek':
      case 'mistral':     return this.callOpenAICompatible(p, model, prompt, opts);
      case 'gemini':      return this.callGemini(p, model, prompt, opts);
      default: return null;
    }
  }

  private async callOllama(p: ProviderConfig, model: string, prompt: string, opts: { system?: string; maxTokens?: number }) {
    const res = await fetch(p.baseUrl + '/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, system: opts.system, stream: false, options: { num_predict: opts.maxTokens ?? 1024 } }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { response?: string; prompt_eval_count?: number; eval_count?: number };
    return { text: json.response ?? '', inputTokens: json.prompt_eval_count, outputTokens: json.eval_count };
  }

  private async callAnthropic(p: ProviderConfig, model: string, prompt: string, opts: { system?: string; maxTokens?: number }) {
    const res = await fetch(p.baseUrl + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': p.apiKey!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: opts.maxTokens ?? 1024, system: opts.system, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { content?: Array<{ text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
    return {
      text: (json.content ?? []).map(c => c.text ?? '').join(''),
      inputTokens: json.usage?.input_tokens,
      outputTokens: json.usage?.output_tokens,
    };
  }

  private async callOpenAICompatible(p: ProviderConfig, model: string, prompt: string, opts: { system?: string; maxTokens?: number }) {
    const messages = opts.system ? [{ role: 'system', content: opts.system }, { role: 'user', content: prompt }] : [{ role: 'user', content: prompt }];
    const res = await fetch(p.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.apiKey },
      body: JSON.stringify({ model, messages, max_tokens: opts.maxTokens ?? 1024 }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    return {
      text: json.choices?.[0]?.message?.content ?? '',
      inputTokens: json.usage?.prompt_tokens,
      outputTokens: json.usage?.completion_tokens,
    };
  }

  private async callGemini(p: ProviderConfig, model: string, prompt: string, opts: { system?: string; maxTokens?: number }) {
    const url = p.baseUrl + '/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(p.apiKey || '');
    const contents = [{ role: 'user', parts: [{ text: (opts.system ? opts.system + '\n\n' : '') + prompt }] }];
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: opts.maxTokens ?? 1024 } }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
    return {
      text: (json.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? '').join(''),
      inputTokens: json.usageMetadata?.promptTokenCount,
      outputTokens: json.usageMetadata?.candidatesTokenCount,
    };
  }

  // ── Model discovery ────────────────────────────────────────────────────

  private async fetchOllamaModels(p: ProviderConfig): Promise<ModelInfo[]> {
    try {
      const res = await fetch(p.baseUrl + '/api/tags', { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return [];
      const json = await res.json() as { models?: Array<{ name: string; size?: number; details?: { parameter_size?: string } }> };
      return (json.models ?? []).map(m => ({
        id: m.name,
        provider: 'ollama',
        displayName: m.name + (m.details?.parameter_size ? ' (' + m.details.parameter_size + ')' : ''),
        tags: ['local', 'free'],
      }));
    } catch { return []; }
  }

  private async fetchAnthropicModels(p: ProviderConfig): Promise<ModelInfo[]> {
    if (!p.apiKey) return [];
    try {
      const res = await fetch(p.baseUrl + '/models', {
        headers: { 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return this.anthropicDefaults();
      const json = await res.json() as { data?: Array<{ id: string; display_name?: string; type?: string }> };
      return (json.data ?? []).map(m => ({
        id: m.id,
        provider: 'anthropic',
        displayName: m.display_name ?? m.id,
        tags: ['remote'],
      }));
    } catch { return this.anthropicDefaults(); }
  }

  private anthropicDefaults(): ModelInfo[] {
    return ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'].map(id => ({
      id, provider: 'anthropic' as ProviderId, displayName: id, tags: ['remote'],
    }));
  }

  private async fetchOpenAIModels(p: ProviderConfig): Promise<ModelInfo[]> {
    if (!p.apiKey) return [];
    try {
      const res = await fetch(p.baseUrl + '/models', { headers: { 'Authorization': 'Bearer ' + p.apiKey }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return [];
      const json = await res.json() as { data?: Array<{ id: string }> };
      return (json.data ?? []).filter(m => /gpt|o1|o3|o4|chatgpt/i.test(m.id)).map(m => ({
        id: m.id, provider: 'openai' as ProviderId, displayName: m.id, tags: ['remote'],
      }));
    } catch { return []; }
  }

  private async fetchOpenRouterModels(p: ProviderConfig): Promise<ModelInfo[]> {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return [];
      const json = await res.json() as { data?: Array<{ id: string; name?: string; context_length?: number; pricing?: { prompt?: string; completion?: string } }> };
      return (json.data ?? []).slice(0, 100).map(m => ({
        id: m.id, provider: 'openrouter' as ProviderId,
        displayName: m.name ?? m.id,
        contextWindow: m.context_length,
        priceInputPerMTok: m.pricing?.prompt ? parseFloat(m.pricing.prompt) * 1_000_000 : undefined,
        priceOutputPerMTok: m.pricing?.completion ? parseFloat(m.pricing.completion) * 1_000_000 : undefined,
        tags: ['remote', 'router'],
      }));
    } catch { return []; }
  }

  private async fetchOpenAICompatibleModels(p: ProviderConfig): Promise<ModelInfo[]> {
    if (!p.apiKey) return [];
    try {
      const res = await fetch(p.baseUrl + '/models', { headers: { 'Authorization': 'Bearer ' + p.apiKey }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return [];
      const json = await res.json() as { data?: Array<{ id: string }> };
      return (json.data ?? []).map(m => ({ id: m.id, provider: p.id, displayName: m.id, tags: ['remote'] }));
    } catch { return []; }
  }

  private async fetchGeminiModels(p: ProviderConfig): Promise<ModelInfo[]> {
    if (!p.apiKey) return [];
    try {
      const res = await fetch(p.baseUrl + '/models?key=' + encodeURIComponent(p.apiKey), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return [];
      const json = await res.json() as { models?: Array<{ name: string; displayName?: string; inputTokenLimit?: number }> };
      return (json.models ?? []).filter(m => /gemini/i.test(m.name)).map(m => ({
        id: m.name.replace(/^models\//, ''),
        provider: 'gemini' as ProviderId,
        displayName: m.displayName ?? m.name,
        contextWindow: m.inputTokenLimit,
        tags: ['remote'],
      }));
    } catch { return []; }
  }

  private async persist(): Promise<void> {
    try {
      const shape: PersistShape = {
        schemaVersion: 2,
        providers: Object.fromEntries(
          Array.from(this.providers.entries()).map(([id, p]) => [id, { apiKey: p.source === 'env' ? undefined : p.apiKey,
            baseUrl: p.baseUrl, defaultModel: p.defaultModel, enabled: p.enabled, source: p.source }])
        ),
        intelligence: this.intelligence,
      };
      const tmp = this.configPath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(shape, null, 2));
      fs.renameSync(tmp, this.configPath);
    } catch { /* non-fatal */ }
  }
}

export interface AgentDiscovered {
  agent: string;
  provider: ProviderId;
  model: string;
  apiKey?: string;
  sourcePath: string;
}

let _instance: ModelRegistry | null = null;
export function getModelRegistry(): ModelRegistry {
  if (!_instance) _instance = new ModelRegistry();
  return _instance;
}
export function resetModelRegistryForTests(): void { _instance = null; }
