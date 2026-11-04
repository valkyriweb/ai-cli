import { createGateway } from "@ai-sdk/gateway";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { gateway, type ImageModel, type LanguageModel } from "ai";

import type { Command } from "./command.js";
import { registerSensitiveValue } from "./redaction.js";

export type ProviderMode = "gateway" | "openai-compatible" | "openai-responses";

export interface ProviderOptions {
  provider?: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  modelsUrl?: string;
}

export interface GatewayProviderConfig {
  mode: "gateway";
  /** Upstream `--base-url` / AI_GATEWAY_BASE_URL in Gateway mode. */
  baseUrl?: string;
}

export interface OpenAICompatibleProviderConfig {
  mode: "openai-compatible" | "openai-responses";
  baseUrl: string;
  apiKeyEnv: string;
  apiKey: string;
  modelsUrl: string;
  headers: Record<string, string>;
}

export type ProviderConfig =
  | GatewayProviderConfig
  | OpenAICompatibleProviderConfig;

const ATTRIBUTION_HEADERS: ReadonlyArray<{
  header: string;
  env: string;
}> = [
  { header: "x-bridge-agent-id", env: "PAPERCLIP_AGENT_ID" },
  { header: "x-bridge-session-id", env: "PAPERCLIP_RUN_ID" },
  { header: "x-pi-session-id", env: "PAPERCLIP_RUN_ID" },
];

/**
 * Adds the fork's custom-provider flags. `--base-url` is upstream's flag: it
 * selects the Gateway baseURL by default and the OpenAI-compatible base URL
 * when `--provider` selects a custom provider. It is only added here for
 * commands that do not already register upstream's Gateway connection flags.
 */
export function addProviderOptions(command: Command): Command {
  if (!command.hasOption("--base-url")) {
    command.option(
      "--base-url <url>",
      "Gateway baseURL, or the API base URL for custom providers"
    );
  }
  return command
    .option(
      "--provider <provider>",
      "Provider: gateway, openai-compatible, or openai-responses"
    )
    .option(
      "--api-key-env <name>",
      "Custom providers: environment variable containing the API key"
    )
    .option(
      "--models-url <url>",
      "Custom providers: optional OpenAI-compatible models endpoint"
    );
}

export function selectedProviderMode(
  options: ProviderOptions = {},
  env: NodeJS.ProcessEnv = process.env
): ProviderMode {
  const raw = (options.provider ?? env.AI_CLI_PROVIDER ?? "gateway")
    .trim()
    .toLowerCase();
  if (raw === "gateway") return "gateway";
  if (raw === "openai-compatible" || raw === "custom") {
    return "openai-compatible";
  }
  if (raw === "openai-responses" || raw === "responses") {
    return "openai-responses";
  }
  throw new Error(
    `--provider must be one of: gateway, openai-compatible, openai-responses (got ${JSON.stringify(raw)})`
  );
}

export function resolveProviderConfig(
  options: ProviderOptions = {},
  env: NodeJS.ProcessEnv = process.env
): ProviderConfig {
  const mode = selectedProviderMode(options, env);
  if (mode === "gateway") {
    const gatewayBaseUrl =
      options.baseUrl ?? (env.AI_GATEWAY_BASE_URL || undefined);
    return gatewayBaseUrl === undefined
      ? { mode }
      : { mode, baseUrl: normalizeHttpUrl(gatewayBaseUrl, "--base-url") };
  }

  // Upstream's `--base-url` flag doubles as the custom-provider base URL.
  const baseUrl = normalizeHttpUrl(
    options.baseUrl ?? env.AI_CLI_BASE_URL,
    "OpenAI-compatible base URL"
  );
  const apiKeyEnv = (options.apiKeyEnv ?? env.AI_CLI_API_KEY_ENV ?? "").trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv)) {
    throw new Error(
      "OpenAI-compatible mode requires --api-key-env or AI_CLI_API_KEY_ENV naming an environment variable"
    );
  }
  const apiKey = env[apiKeyEnv]?.trim();
  if (!apiKey) {
    throw new Error(
      `OpenAI-compatible API key environment variable ${apiKeyEnv} is not set`
    );
  }
  registerSensitiveValue(apiKey);

  return {
    mode,
    baseUrl,
    apiKeyEnv,
    apiKey,
    modelsUrl: normalizeHttpUrl(
      options.modelsUrl ?? env.AI_CLI_MODELS_URL ?? `${baseUrl}/models`,
      "OpenAI-compatible models URL"
    ),
    headers: attributionHeaders(env),
  };
}

export function assertGatewayProvider(
  modality: "video" | "speech" | "transcription",
  options: ProviderOptions = {},
  env: NodeJS.ProcessEnv = process.env
): void {
  if (selectedProviderMode(options, env) !== "gateway") {
    throw new Error(
      `${modality} is not supported by custom providers; use --provider gateway explicitly if you intend to use AI Gateway`
    );
  }
}

export function createImageModel(
  config: ProviderConfig,
  modelId: string
): ImageModel {
  if (config.mode === "gateway") return gatewayFor(config).image(modelId);
  return createOpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
    headers: config.headers,
  }).image(modelId);
}

export function createTextModel(
  config: ProviderConfig,
  modelId: string
): LanguageModel {
  if (config.mode === "gateway") return gatewayFor(config)(modelId);
  if (config.mode === "openai-responses") {
    return createOpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
      headers: config.headers,
    }).responses(modelId);
  }

  return createOpenAICompatible({
    name: "openai-compatible",
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
    headers: config.headers,
  }).chatModel(modelId);
}

function gatewayFor(config: GatewayProviderConfig) {
  return config.baseUrl ? createGateway({ baseURL: config.baseUrl }) : gateway;
}

export function providerRequestHeaders(
  config: OpenAICompatibleProviderConfig
): Record<string, string> {
  return {
    authorization: `Bearer ${config.apiKey}`,
    ...config.headers,
  };
}

function attributionHeaders(env: NodeJS.ProcessEnv): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const { header, env: envName } of ATTRIBUTION_HEADERS) {
    const value = env[envName]?.trim();
    if (!value) continue;
    if (value.length > 256 || /[^\x20-\x7e]/.test(value)) {
      throw new Error(`${envName} contains invalid HTTP header characters`);
    }
    headers[header] = value;
  }
  return headers;
}

function normalizeHttpUrl(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`${label} is required`);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} must use http or https`);
  }
  if (url.username || url.password) {
    throw new Error(`${label} must not contain embedded credentials`);
  }
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}
