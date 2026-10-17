import {
  createAnthropicModelClient,
  createEmbeddingProvider,
  createOfflineModelClient,
  createWes,
  loadAgentConfig,
  type AgentConfig,
  type EmbeddingProvider,
} from '@wes/agent';

/** The agent and its retrieval embedder, wired from the environment. */
export interface AgentServices {
  config: AgentConfig;
  wes: ReturnType<typeof createWes>;
  embedder: EmbeddingProvider;
}

export function createAgentServices(
  env: Record<string, string | undefined> = process.env,
  now: () => Date = () => new Date(),
): AgentServices {
  const config = loadAgentConfig(env);
  if ((env.APP_ENV ?? env.NODE_ENV) === 'production' && config.mode !== 'live') {
    throw new Error('Production requires ANTHROPIC_API_KEY (Wes cannot run in offline mode).');
  }
  const model =
    config.mode === 'live' ? createAnthropicModelClient(config) : createOfflineModelClient();
  return { config, wes: createWes({ config, model, now }), embedder: createEmbeddingProvider(env) };
}
