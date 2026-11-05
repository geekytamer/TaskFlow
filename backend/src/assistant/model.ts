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

/** onDelta: the answer as it is written (streamed), piece by piece; only for calls without tools. */
export type ChatFn = (messages: ChatMessage[], tools: ToolSpec[], onDelta?: (piece: string) => void) => Promise<{ content: string | null; tool_calls?: ToolCall[] }>;

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
  return async (messages, tools, onDelta) => {
    // Stream when someone is watching and no tools are offered (tool-call deltas are not worth parsing for small models).
    const stream = Boolean(onDelta) && tools.length === 0;
    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}) },
        body: JSON.stringify({ model: config.model, messages, ...(tools.length ? { tools, tool_choice: 'auto' } : {}), temperature: 0.2, stream, ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}) }),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch (err) {
      throw new ModelUnavailableError(`The assistant's model is not reachable (${err instanceof Error ? err.message : String(err)}).`);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ModelUnavailableError(`The assistant's model answered ${response.status}: ${text.slice(0, 300)}`);
    }
    // A server that ignores `stream` answers with plain JSON: read it the usual way.
    if (stream && response.body && !(response.headers.get('content-type') ?? '').includes('application/json')) {
      let content = '';
      let buf = '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') continue;
            try {
              const piece = (JSON.parse(data) as { choices?: Array<{ delta?: { content?: string | null } }> }).choices?.[0]?.delta?.content;
              if (typeof piece === 'string' && piece) { content += piece; onDelta!(piece); }
            } catch { /* a keep-alive or a line split oddly: the next one carries on */ }
          }
        }
      } catch (err) {
        throw new ModelUnavailableError(`The assistant's model stopped answering (${err instanceof Error ? err.message : String(err)}).`);
      }
      return { content };
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
