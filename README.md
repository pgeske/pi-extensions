# pi-extensions

Personal Pi extensions, skills, prompts, and themes.

## Extensions

- [`mcp-bridge`](./extensions/mcp-bridge/README.md): bridges Streamable HTTP MCP servers into Pi tools.

## Install

```bash
pi install git:github.com/pgeske/pi-extensions
```

For local development:

```bash
npm install
npm test
npm run typecheck
pi -e /path/to/pi-extensions
```

## Secrets

Do not commit API keys or tokens. Use environment variables and local config files instead.

See [`.env.example`](./.env.example) for currently supported variables.
