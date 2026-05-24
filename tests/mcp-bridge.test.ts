import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildToolName,
  expandEnv,
  loadConfigFromObject,
  normalizeMcpContent,
} from "../extensions/mcp-bridge/index.ts";

describe("mcp-bridge", () => {
  it("expands environment variables in headers", () => {
    const expanded = expandEnv("Bearer ${EXCALIDRAW_API_KEY}", {
      EXCALIDRAW_API_KEY: "test-key",
    });

    assert.equal(expanded, "Bearer test-key");
  });

  it("throws when required environment variable is missing", () => {
    assert.throws(
      () => expandEnv("Bearer ${EXCALIDRAW_API_KEY}", {}),
      /Missing environment variable EXCALIDRAW_API_KEY/,
    );
  });

  it("loads mcpServers config", () => {
    const config = loadConfigFromObject(
      {
        mcpServers: {
          excalidraw: {
            url: "https://api.excalidraw.com/api/v1/mcp",
            headers: { Authorization: "Bearer ${EXCALIDRAW_API_KEY}" },
          },
        },
      },
      { EXCALIDRAW_API_KEY: "test-key" },
    );

    assert.deepEqual(config.servers, [
      {
        name: "excalidraw",
        url: "https://api.excalidraw.com/api/v1/mcp",
        headers: { Authorization: "Bearer test-key" },
      },
    ]);
  });

  it("creates stable pi-safe tool names", () => {
    assert.equal(buildToolName("excalidraw", "list_scenes"), "mcp_excalidraw_list_scenes");
    assert.equal(buildToolName("my-server", "tools/call"), "mcp_my_server_tools_call");
  });

  it("truncates large MCP text content", () => {
    const text = "x".repeat(60 * 1024);
    const [entry] = normalizeMcpContent({ content: [{ type: "text", text }] });

    assert.equal(entry?.text.includes("[MCP bridge output truncated:"), true);
  });

  it("normalizes MCP content for Pi", () => {
    assert.deepEqual(
      normalizeMcpContent({
        content: [
          { type: "text", text: "hello" },
          { type: "image", mimeType: "image/png", data: "abc" },
        ],
        structuredContent: { ok: true },
      }),
      [
        { type: "text", text: "hello" },
        {
          type: "text",
          text: '[image content: image/png]',
        },
        {
          type: "text",
          text: 'Structured content:\n{"ok":true}',
        },
      ],
    );
  });
});
