// Minimal OpenAI-compatible chat client (works with DeepSeek, OpenAI, local gateways).

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type Msg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};
export type Usage = { prompt_tokens: number; completion_tokens: number; total_tokens: number };

export function llmConfig() {
  return {
    baseUrl: (process.env.LLM_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, ""),
    model: process.env.LLM_MODEL ?? "deepseek-chat",
    key: process.env.LLM_API_KEY ?? "",
  };
}

export async function chat(messages: Msg[], tools?: readonly unknown[]): Promise<{ message: Msg; usage: Usage }> {
  const { baseUrl, model, key } = llmConfig();
  if (!key) throw new Error("LLM_API_KEY tanımlı değil (.env.local içine yaz).");

  // The bearer key goes to whatever host this names, so refuse plain http except for a local gateway.
  const host = new URL(baseUrl);
  if (host.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(host.hostname)) {
    throw new Error("LLM_BASE_URL https olmalı");
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, tools, temperature: 0.1, max_tokens: 700 }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return { message: json.choices[0].message as Msg, usage: json.usage as Usage };
}
