import { afterEach, describe, expect, test } from "bun:test";

import { generateText, streamText } from "ai";

import { fetchModels, resetGatewayCache } from "./models.js";
import {
  assertGatewayProvider,
  createTextModel,
  resolveProviderConfig,
  selectedProviderMode,
} from "./provider.js";
import { redactSensitiveText } from "./redaction.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetGatewayCache();
});

describe("provider configuration", () => {
  test("preserves AI Gateway as the default", () => {
    expect(selectedProviderMode({}, {})).toBe("gateway");
    expect(resolveProviderConfig({}, {})).toEqual({ mode: "gateway" });
  });

  test("requires explicit custom credentials and rejects URL userinfo", () => {
    expect(() =>
      resolveProviderConfig(
        { provider: "openai-compatible", baseUrl: "http://localhost:8789/v1" },
        {}
      )
    ).toThrow("requires --api-key-env");

    expect(() =>
      resolveProviderConfig(
        {
          provider: "openai-compatible",
          baseUrl: `https://${"user"}:${"password"}@example.test/v1`,
          apiKeyEnv: "TEST_KEY",
        },
        { TEST_KEY: "secret-value" }
      )
    ).toThrow("must not contain embedded credentials");
  });

  test("builds only allowlisted dynamic attribution headers", () => {
    const config = resolveProviderConfig(
      {
        provider: "openai-compatible",
        baseUrl: "http://localhost:8789/v1/",
        apiKeyEnv: "ROUTER_KEY",
      },
      {
        ROUTER_KEY: "secret-value",
        PAPERCLIP_AGENT_ID: "agent-123",
        PAPERCLIP_RUN_ID: "run-456",
        PRIVATE_CONTEXT: "must-not-be-forwarded",
      }
    );

    expect(config).toMatchObject({
      mode: "openai-compatible",
      baseUrl: "http://localhost:8789/v1",
      modelsUrl: "http://localhost:8789/v1/models",
      headers: {
        "x-bridge-agent-id": "agent-123",
        "x-bridge-session-id": "run-456",
        "x-pi-session-id": "run-456",
      },
    });
    expect(JSON.stringify(config)).not.toContain("must-not-be-forwarded");
  });

  test("fails closed for unsupported modalities", () => {
    for (const modality of [
      "image",
      "video",
      "speech",
      "transcription",
    ] as const) {
      expect(() =>
        assertGatewayProvider(modality, { provider: "openai-compatible" }, {})
      ).toThrow("not supported by custom text providers");
    }
  });
});

describe("openai-compatible wire path", () => {
  test("uses configured model and URLs without contacting AI Gateway", async () => {
    const requests: Array<{ url: string; headers: Headers }> = [];
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      requests.push({ url, headers: new Headers(init?.headers) });
      if (url.endsWith("/models")) {
        return Response.json({
          data: [{ id: "cheap-text-model", owned_by: "router" }],
        });
      }
      if (url.endsWith("/chat/completions")) {
        return Response.json({
          id: "response-1",
          object: "chat.completion",
          created: 1,
          model: "cheap-text-model",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "WIRE_OK" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
      }
      throw new Error(`unexpected request ${url}`);
    }) as typeof fetch;

    const config = resolveProviderConfig(
      {
        provider: "openai-compatible",
        baseUrl: "http://router.test/v1",
        apiKeyEnv: "ROUTER_KEY",
      },
      {
        ROUTER_KEY: "secret-value",
        PAPERCLIP_AGENT_ID: "agent-123",
        PAPERCLIP_RUN_ID: "run-456",
      }
    );
    const models = await fetchModels(config);
    expect(models.text.map((model) => model.id)).toEqual(["cheap-text-model"]);

    const result = await generateText({
      model: createTextModel(config, "cheap-text-model"),
      prompt: "Return WIRE_OK",
    });
    expect(result.text).toBe("WIRE_OK");
    expect(requests.map(({ url }) => url)).toEqual([
      "http://router.test/v1/models",
      "http://router.test/v1/chat/completions",
    ]);
    expect(
      requests.some(({ url }) => url.includes("ai-gateway.vercel.sh"))
    ).toBe(false);
    for (const { headers } of requests) {
      expect(headers.get("authorization")).toBe("Bearer secret-value");
      expect(headers.get("x-bridge-agent-id")).toBe("agent-123");
      expect(headers.get("x-bridge-session-id")).toBe("run-456");
    }
  });

  test("supports the explicit OpenAI Responses wire path", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      requests.push({
        url,
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      const response = {
        id: "response-2",
        object: "response",
        created_at: 1,
        status: "completed",
        model: "openai/gpt-5.6-luna",
        output: [],
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          total_tokens: 2,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 },
        },
      };
      const events = [
        {
          type: "response.output_item.added",
          sequence_number: 0,
          output_index: 0,
          item: {
            id: "message-1",
            type: "message",
            role: "assistant",
            status: "in_progress",
            content: [],
          },
        },
        {
          type: "response.output_text.delta",
          sequence_number: 1,
          item_id: "message-1",
          output_index: 0,
          content_index: 0,
          delta: "RESPONSES_WIRE_OK",
          logprobs: [],
        },
        {
          type: "response.output_item.done",
          sequence_number: 2,
          output_index: 0,
          item: {
            id: "message-1",
            type: "message",
            role: "assistant",
            status: "completed",
            content: [
              {
                type: "output_text",
                text: "RESPONSES_WIRE_OK",
                annotations: [],
              },
            ],
          },
        },
        { type: "response.completed", sequence_number: 3, response },
      ];
      return new Response(
        events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") +
          "data: [DONE]\n\n",
        { headers: { "content-type": "text/event-stream" } }
      );
    }) as typeof fetch;

    const config = resolveProviderConfig(
      {
        provider: "openai-responses",
        baseUrl: "http://router.test/v1",
        apiKeyEnv: "ROUTER_KEY",
      },
      { ROUTER_KEY: "secret-value" }
    );
    const result = streamText({
      model: createTextModel(config, "openai/gpt-5.6-luna"),
      prompt: "Return RESPONSES_WIRE_OK",
    });

    expect(await result.text).toBe("RESPONSES_WIRE_OK");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("http://router.test/v1/responses");
    expect(requests[0]?.body.stream).toBe(true);
    expect(
      requests.some(({ url }) => url.includes("ai-gateway.vercel.sh"))
    ).toBe(false);
  });
});

describe("error redaction", () => {
  test("redacts configured secrets, bearer tokens, and URL credentials", () => {
    resolveProviderConfig(
      {
        provider: "openai-compatible",
        baseUrl: "http://router.test/v1",
        apiKeyEnv: "ARBITRARY_CREDENTIAL_NAME",
      },
      { ARBITRARY_CREDENTIAL_NAME: "registered-secret-value" }
    );
    const credentialUrl = `https://${"user"}:${"password"}@example.test/v1`;
    const text = redactSensitiveText(
      `Bearer abc.def key secret-value and registered-secret-value at ${credentialUrl}`,
      { ROUTER_API_KEY: "secret-value" }
    );
    expect(text).not.toContain("abc.def");
    expect(text).not.toContain("secret-value");
    expect(text).not.toContain("registered-secret-value");
    expect(text).not.toContain(`${"user"}:${"password"}`);
    expect(text).toContain("[REDACTED]");
  });
});
