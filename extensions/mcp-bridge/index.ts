import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type JsonObject = Record<string, unknown>;
type Env = Record<string, string | undefined>;

export type McpServerConfig = {
  name: string;
  url: string;
  headers?: Record<string, string>;
};

export type McpBridgeConfig = {
  servers: McpServerConfig[];
};

type CommonMcpConfig = {
  mcpServers?: Record<
    string,
    {
      url?: string;
      headers?: Record<string, string>;
    }
  >;
};

type BridgeConnection = {
  server: McpServerConfig;
  client: Client;
  transport: StreamableHTTPClientTransport;
  tools: Tool[];
};

const DEFAULT_CONFIG_PATH = "~/.pi/agent/mcp.json";
const MAX_RESULT_TEXT_BYTES = 50 * 1024;

export function expandEnv(value: string, env: Env = process.env): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_match, name: string) => {
    const replacement = env[name];
    if (replacement === undefined || replacement === "") {
      throw new Error(`Missing environment variable ${name}`);
    }
    return replacement;
  });
}

export function loadConfigFromObject(input: unknown, env: Env = process.env): McpBridgeConfig {
  if (!input || typeof input !== "object") {
    throw new Error("MCP config must be a JSON object");
  }

  const common = input as CommonMcpConfig;
  const servers = Object.entries(common.mcpServers ?? {}).map(([name, server]) => {
    if (!server.url) {
      throw new Error(`MCP server ${name} is missing url`);
    }

    const headers = Object.fromEntries(
      Object.entries(server.headers ?? {}).map(([key, value]) => [key, expandEnv(value, env)]),
    );

    return {
      name,
      url: server.url,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    };
  });

  return { servers };
}

export async function loadConfig(path = process.env.PI_MCP_CONFIG ?? DEFAULT_CONFIG_PATH): Promise<McpBridgeConfig | null> {
  const resolvedPath = path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : resolve(path);

  try {
    const raw = await readFile(resolvedPath, "utf8");
    return loadConfigFromObject(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function buildToolName(serverName: string, toolName: string): string {
  const safeServer = serverName.replace(/[^a-zA-Z0-9_]/g, "_");
  const safeTool = toolName.replace(/[^a-zA-Z0-9_]/g, "_");
  return `mcp_${safeServer}_${safeTool}`.replace(/_+/g, "_").toLowerCase();
}

function truncateText(text: string, maxBytes = MAX_RESULT_TEXT_BYTES): string {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= maxBytes) return text;

  const truncated = Buffer.from(text).subarray(0, maxBytes).toString("utf8");
  return `${truncated}\n\n[MCP bridge output truncated: ${maxBytes} of ${bytes} bytes]`;
}

export function normalizeMcpContent(result: unknown): Array<{ type: "text"; text: string }> {
  const output: Array<{ type: "text"; text: string }> = [];
  const data = result && typeof result === "object" ? (result as JsonObject) : {};
  const content = Array.isArray(data.content) ? data.content : [];

  for (const item of content) {
    if (!item || typeof item !== "object") {
      output.push({ type: "text", text: String(item) });
      continue;
    }

    const entry = item as JsonObject;
    if (entry.type === "text" && typeof entry.text === "string") {
      output.push({ type: "text", text: truncateText(entry.text) });
      continue;
    }

    if (entry.type === "image") {
      output.push({ type: "text", text: `[image content: ${String(entry.mimeType ?? "unknown")}]` });
      continue;
    }

    if (entry.type === "resource_link") {
      output.push({ type: "text", text: `[resource link: ${String(entry.uri ?? entry.name ?? "unknown")}]` });
      continue;
    }

    if (entry.type === "resource") {
      output.push({ type: "text", text: `[embedded resource: ${JSON.stringify(entry.resource ?? entry)}]` });
      continue;
    }

    output.push({ type: "text", text: truncateText(JSON.stringify(entry)) });
  }

  if (data.structuredContent !== undefined) {
    output.push({ type: "text", text: truncateText(`Structured content:\n${JSON.stringify(data.structuredContent)}`) });
  }

  return output.length > 0 ? output : [{ type: "text", text: truncateText(JSON.stringify(result ?? null)) }];
}

function normalizeInputSchema(tool: Tool): JsonObject {
  if (tool.inputSchema && typeof tool.inputSchema === "object") {
    return tool.inputSchema as JsonObject;
  }

  return {
    type: "object",
    additionalProperties: true,
  };
}

export async function connectServer(server: McpServerConfig): Promise<BridgeConnection> {
  const client = new Client({ name: "pi-mcp-bridge", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: server.headers ? { headers: server.headers } : undefined,
  });

  await client.connect(transport);

  const tools: Tool[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined);
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);

  return { server, client, transport, tools };
}

function registerMcpTool(pi: ExtensionAPI, connection: BridgeConnection, tool: Tool): void {
  const name = buildToolName(connection.server.name, tool.name);

  pi.registerTool({
    name,
    label: `MCP: ${connection.server.name}/${tool.name}`,
    description: tool.description ?? `Call MCP tool ${tool.name} on ${connection.server.name}`,
    promptSnippet: `Call MCP tool ${connection.server.name}/${tool.name}`,
    parameters: normalizeInputSchema(tool) as never,
    async execute(_toolCallId, params) {
      const result = await connection.client.callTool({
        name: tool.name,
        arguments: params as JsonObject,
      });

      return {
        content: normalizeMcpContent(result),
        details: {
          server: connection.server.name,
          tool: tool.name,
          isError: result.isError === true,
          contentTypes: Array.isArray(result.content)
            ? result.content.map((item) => (item && typeof item === "object" && "type" in item ? item.type : typeof item))
            : [],
          hasStructuredContent: result.structuredContent !== undefined,
        },
      };
    },
  });
}

export default async function mcpBridge(pi: ExtensionAPI) {
  const connections: BridgeConnection[] = [];

  pi.registerCommand("mcp-bridge-status", {
    description: "Show configured MCP bridge servers and tools",
    handler: async (_args, ctx) => {
      if (connections.length === 0) {
        ctx.ui.notify("MCP bridge: no connected servers", "warning");
        return;
      }

      const summary = connections
        .map((connection) => `${connection.server.name}: ${connection.tools.length} tool(s)`)
        .join("; ");
      ctx.ui.notify(`MCP bridge: ${summary}`, "info");
    },
  });

  const config = await loadConfig();
  if (!config || config.servers.length === 0) return;

  for (const server of config.servers) {
    try {
      const connection = await connectServer(server);
      connections.push(connection);
      for (const tool of connection.tools) registerMcpTool(pi, connection, tool);
    } catch (error) {
      console.warn(`mcp-bridge: failed to connect to ${server.name}:`, error);
    }
  }

  pi.on("session_shutdown", async () => {
    await Promise.allSettled(connections.map((connection) => connection.transport.close()));
  });
}
