import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import { describe, it } from "node:test";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import { connectServer, normalizeMcpContent } from "../extensions/mcp-bridge/index.ts";

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

describe("mcp-bridge integration", () => {
  it("connects to a Streamable HTTP MCP server, lists tools, and calls a tool", async () => {
    const makeMcpServer = () => {
      const mcpServer = new McpServer({ name: "test-mcp", version: "1.0.0" });
      mcpServer.registerTool(
        "greet",
        {
          description: "Return a greeting",
          inputSchema: { name: z.string() },
        },
        async ({ name }) => ({
          content: [{ type: "text", text: `Hello, ${name}!` }],
          structuredContent: { greeted: name },
        }),
      );
      return mcpServer;
    };

    const httpServer = createServer(async (req, res) => {
      if (req.method !== "POST" || req.url !== "/mcp") {
        res.writeHead(404).end();
        return;
      }

      const mcpServer = makeMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      try {
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, await readJsonBody(req));
      } catch (error) {
        res.writeHead(500).end(String(error));
      } finally {
        await transport.close();
        await mcpServer.close();
      }
    });

    let connection: Awaited<ReturnType<typeof connectServer>> | undefined;
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const address = httpServer.address();
    assert(address && typeof address === "object");

    try {
      connection = await connectServer({
        name: "test",
        url: `http://127.0.0.1:${address.port}/mcp`,
      });
      assert.equal(connection.tools.length, 1);
      assert.equal(connection.tools[0]?.name, "greet");

      const result = await connection.client.callTool({
        name: "greet",
        arguments: { name: "Pi" },
      });

      assert.deepEqual(normalizeMcpContent(result), [
        { type: "text", text: "Hello, Pi!" },
        { type: "text", text: 'Structured content:\n{"greeted":"Pi"}' },
      ]);
    } finally {
      await connection?.transport.close();
      await new Promise<void>((resolve, reject) => httpServer.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
