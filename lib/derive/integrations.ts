import type { N8nNode, N8nWorkflow } from "@/lib/n8n/types";

// Generic detection of the external service ("integration"/"system") a node talks
// to. Replaces the old hardcoded allow-lists that only knew ~10 services and
// missed everything else (Telegram, Tavily, Google Drive, OpenRouter, community
// nodes, langchain sub-nodes…). Signals, in priority order:
//   1. an httpRequest node's predefined credential type (nodeCredentialType);
//   2. any attached credential's type;
//   3. the node type itself (incl. langchain LLM/embeddings/tool sub-nodes and
//      community packages), humanised with brand-correct casing.
// Utility/control nodes (set, filter, agent, schedule…) return null — they are
// not integrations.

// Brand-correct labels, keyed by a lowercased provider token (see providerToken).
const BRAND: Record<string, string> = {
  openai: "OpenAI",
  openrouter: "OpenRouter",
  anthropic: "Anthropic",
  googlegemini: "Google Gemini",
  googlepalm: "Google PaLM",
  cohere: "Cohere",
  mistralcloud: "Mistral",
  mistral: "Mistral",
  groq: "Groq",
  ollama: "Ollama",
  perplexity: "Perplexity",
  huggingface: "Hugging Face",
  youtube: "YouTube",
  googledrive: "Google Drive",
  googlesheets: "Google Sheets",
  googledocs: "Google Docs",
  googlecalendar: "Google Calendar",
  googlebigquery: "BigQuery",
  bigquery: "BigQuery",
  gmail: "Gmail",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  stripe: "Stripe",
  zendesk: "Zendesk",
  slack: "Slack",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  discord: "Discord",
  twilio: "Twilio",
  notion: "Notion",
  intercom: "Intercom",
  airtable: "Airtable",
  postgres: "Postgres",
  postgresql: "Postgres",
  mysql: "MySQL",
  snowflake: "Snowflake",
  mongodb: "MongoDB",
  redis: "Redis",
  elasticsearch: "Elasticsearch",
  supabase: "Supabase",
  pinecone: "Pinecone",
  qdrant: "Qdrant",
  weaviate: "Weaviate",
  serpapi: "SerpAPI",
  tavily: "Tavily",
  wikipedia: "Wikipedia",
  jira: "Jira",
  github: "GitHub",
  gitlab: "GitLab",
  dropbox: "Dropbox",
  wordpress: "WordPress",
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  clickup: "ClickUp",
  asana: "Asana",
  trello: "Trello",
  monday: "Monday.com",
  microsoftoutlook: "Outlook",
  microsoftteams: "Microsoft Teams",
  microsoftexcel: "Excel",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  twitter: "X (Twitter)",
  x: "X (Twitter)",
};

// Node bases that are control/utility, not integrations. Lowercased, suffix-stripped.
const UTILITY = new Set([
  "set",
  "filter",
  "if",
  "switch",
  "merge",
  "code",
  "function",
  "functionitem",
  "noop",
  "stickynote",
  "wait",
  "splitout",
  "splitinbatches",
  "aggregate",
  "itemlists",
  "datetime",
  "renamekeys",
  "sort",
  "limit",
  "removeduplicates",
  "html",
  "xml",
  "markdown",
  "extractfromfile",
  "converttofile",
  "editimage",
  "crypto",
  "compression",
  "respondtowebhook",
  "webhook",
  "form",
  "manual",
  "schedule",
  "cron",
  "interval",
  "executeworkflow",
  "errortrigger",
  "chat",
  "executecommand",
  "ssh",
  // langchain orchestration (the agent/chain itself is not an integration; its
  // LLM/tool sub-nodes are detected separately)
  "agent",
  "chainllm",
  "chainretrievalqa",
  "chainsummarization",
  "memorybufferwindow",
  "memorymanager",
  "outputparserstructured",
  "outputparseritemlist",
  "outputparserautofixing",
  "textsplittercharactertextsplitter",
  "textsplitterrecursivecharactertextsplitter",
  "toolworkflow",
  "toolcode",
  "toolthink",
]);

// langchain sub-node prefixes to strip so the provider surfaces
// (lmChatOpenRouter → openrouter, embeddingsOpenAi → openai, toolSerpApi → serpapi).
const LC_PREFIXES = [
  "lmchat",
  "lmopen",
  "lm",
  "embeddings",
  "vectorstore",
  "retriever",
  "documentloader",
  "textsplitter",
  "outputparser",
  "memory",
  "tool",
];

/** Short node "base", e.g. "n8n-nodes-base.stripeTool" → "stripeTool". */
function baseName(type: string): string {
  return type.split(".").pop() ?? type;
}

/** camelCase / PascalCase → "Title Case" fallback for unknown providers. */
function titleCase(base: string): string {
  const spaced = base
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Match a node base or credential type against the brand table, trying several
 * reductions — because n8n's `xxxApi` convention over-strips some brands
 * (`serpApi` must stay `serpapi`, but `telegramApi` must reduce to `telegram`).
 * We generate candidate tokens and take the first that is a known brand.
 */
function matchBrand(raw: string): string | null {
  const lower = raw.toLowerCase();
  const candidates: string[] = [lower];
  const noOauth = lower.replace(/(oauth2api|oauth2)$/g, "");
  candidates.push(noOauth, noOauth.replace(/(api|account)$/g, ""));
  for (const p of LC_PREFIXES) {
    if (lower.startsWith(p) && lower.length > p.length) {
      candidates.push(lower.slice(p.length));
      break;
    }
  }
  for (const c of candidates) if (BRAND[c]) return BRAND[c];
  return null;
}

/** Brand inferred from an httpRequest's URL host (e.g. serpapi.com → SerpAPI). */
function urlBrand(node: N8nNode): string | null {
  const url = node.parameters?.url;
  if (typeof url !== "string") return null;
  const m = url.match(/https?:\/\/([^/\s{}]+)/i);
  if (!m) return null;
  const parts = m[1].toLowerCase().split(".").filter(Boolean);
  const sld = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return sld ? (BRAND[sld] ?? null) : null;
}

/** The credential type strings referenced by a node (attached or predefined). */
export function credentialTypes(node: N8nNode): string[] {
  const types = Object.keys(node.credentials ?? {});
  const predefined = node.parameters?.nodeCredentialType;
  if (typeof predefined === "string" && predefined.length > 0) types.push(predefined);
  return types;
}

/** The external service this node talks to, or null for a utility/control node. */
export function integrationForNode(node: N8nNode): string | null {
  // 1 + 2 — credential type (predefined on httpRequest, or an attached credential).
  for (const credType of credentialTypes(node)) {
    const brand = matchBrand(credType);
    if (brand) return brand;
  }

  const base = baseName(node.type);
  const normalized = base.replace(/(Tool|Trigger)$/g, "").toLowerCase();
  if (UTILITY.has(normalized)) return null;

  // 3 — node type (known brand → correct casing).
  const brand = matchBrand(base);
  if (brand) return brand;

  // httpRequest is generic: only an integration if its URL host is a known brand.
  if (normalized === "httprequest") return urlBrand(node);

  // Unknown but non-utility node (a community app node) — surface it title-cased
  // rather than silently drop a real integration.
  return titleCase(base.replace(/(Tool|Trigger)$/g, ""));
}

/** Distinct integrations across every node in a workflow (incl. sub-nodes), sorted. */
export function workflowIntegrations(workflow: N8nWorkflow): string[] {
  const set = new Set<string>();
  for (const node of workflow.nodes) {
    const s = integrationForNode(node);
    if (s) set.add(s);
  }
  return [...set].sort();
}
