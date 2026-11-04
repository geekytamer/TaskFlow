/**
 * The model is a text-in, text-out service anywhere on the network: any
 * OpenAI-compatible chat endpoint (Ollama, llama.cpp, vLLM). It never sees a
 * TaskFlow login and cannot act; the agent on the server does that.
 *
 *   AI_BASE_URL  e.g. http://100.64.0.5:11434/v1 (Ollama over Tailscale)
 *   AI_MODEL     e.g. qwen3-coder:30b
 *   AI_API_KEY   optional bearer, for a proxy in front of the model
 *   AI_TOOL_MODE  text (default: code in a ```js block) | native (OpenAI tool calls)
 *   AI_REASONING_EFFORT  optional; "none" turns a thinking model's reasoning
 *                off (Ollama), which makes qwen3 answer in seconds, not minutes
 */
export interface ModelConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  reasoningEffort?: string;
  /** 'text' (default): code in a ```js block; 'native': OpenAI tool calls. */
  toolMode: 'text' | 'native';
  timeoutMs: number;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export type ChatFn = (messages: ChatMessage[], tools: ToolSpec[]) => Promise<{ content: string | null; tool_calls?: ToolCall[] }>;

export function modelConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ModelConfig | null {
  const baseUrl = env.AI_BASE_URL?.trim();
  const model = env.AI_MODEL?.trim();
  if (!baseUrl || !model) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    model,
    ...(env.AI_API_KEY ? { apiKey: env.AI_API_KEY } : {}),
    ...(env.AI_REASONING_EFFORT?.trim() ? { reasoningEffort: env.AI_REASONING_EFFORT.trim() } : {}),
    toolMode: env.AI_TOOL_MODE?.trim() === 'native' ? 'native' : 'text',
    timeoutMs: Number(env.AI_TIMEOUT_MS) > 0 ? Number(env.AI_TIMEOUT_MS) : 180_000,
  };
}

export class ModelUnavailableError extends Error {}

export function openAiChat(config: ModelConfig): ChatFn {
  return async (messages, tools) => {
    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}) },
        body: JSON.stringify({ model: config.model, messages, ...(tools.length ? { tools, tool_choice: 'auto' } : {}), temperature: 0.2, stream: false, ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}) }),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch (err) {
      throw new ModelUnavailableError(`The assistant's model is not reachable (${err instanceof Error ? err.message : String(err)}).`);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ModelUnavailableError(`The assistant's model answered ${response.status}: ${text.slice(0, 300)}`);
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }> };
    const message = data.choices?.[0]?.message;
    if (!message) throw new ModelUnavailableError('The assistant\'s model sent an empty answer.');
    return {
      content: message.content ?? null,
      ...(message.tool_calls?.length ? { tool_calls: message.tool_calls.map((c, i) => ({ ...c, id: c.id || `call_${i}`, type: 'function' as const })) } : {}),
    };
  };
}
