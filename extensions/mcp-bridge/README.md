# mcp-bridge

Generic Streamable HTTP MCP-to-Pi tool bridge.

On Pi startup, this extension:

1. reads MCP server config,
2. connects to each configured Streamable HTTP MCP server,
3. lists available MCP tools,
4. registers each MCP tool as a Pi tool named `mcp_<server>_<tool>`, and
5. forwards Pi tool calls to the matching MCP `callTool` request.

## Configuration

Create `~/.pi/agent/mcp.json`:

```json
{
  "mcpServers": {
    "excalidraw": {
      "url": "https://api.excalidraw.com/api/v1/mcp",
      "headers": {
        "Authorization": "Bearer ${EXCALIDRAW_API_KEY}"
      }
    }
  }
}
```

Set secrets in your shell environment, not in git:

```bash
export EXCALIDRAW_API_KEY="..."
```

You can override the config path:

```bash
export PI_MCP_CONFIG=/path/to/mcp.json
```

## Excalidraw+

Excalidraw+ MCP is currently public beta.

- Endpoint: `https://api.excalidraw.com/api/v1/mcp`
- Transport: Streamable HTTP
- Auth: `Authorization: Bearer <API_KEY>`

Tool visibility depends on the permissions assigned to your Excalidraw+ API key.

## Status command

Inside Pi, run:

```text
/mcp-bridge-status
```

This reports connected MCP servers and discovered tool counts.

## Limitations

- v1 supports Streamable HTTP MCP servers only.
- v1 registers tools at startup; reconnect/reload with `/reload` after changing MCP config or API key permissions.
- Non-text MCP content is summarized for Pi instead of rendered natively.
