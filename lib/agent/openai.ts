import "server-only";
import OpenAI from "openai";
import type { ChatClient, ChatCompletion } from "./run";

// Adapter: wrap the OpenAI SDK behind our tiny ChatClient interface so the
// agent loop stays SDK-agnostic and unit-testable. Returns null when no key.
export function openaiFromEnv(): ChatClient | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey });
  return {
    create: (req) =>
      // The SDK's param/response types are structurally compatible with ours at
      // runtime; cast at this single boundary rather than leaking SDK types out.
      client.chat.completions.create(req as never) as unknown as Promise<ChatCompletion>,
  };
}
