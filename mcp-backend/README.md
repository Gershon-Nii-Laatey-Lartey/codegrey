# Codegrey MCP Backend

MCP (Model Context Protocol) server manager + MCP-aware agent backend.
Runs on **port 3173** alongside the AI backend (port 3172).

## What this does

- **Manages MCP servers** — add, start, stop, restart any stdio or SSE MCP server
- **Persists configs** — server configs saved to `~/.codegrey/mcp-servers.json`
- **Auto-starts servers** on boot (configurable per server)
- **Injects MCP tools** into the agent loop — Claude can call any tool from any connected MCP server
- **Full MCP protocol** — tools, resources, and prompts supported for both stdio and SSE transports
- **Same agent API** — identical interface to the AI backend (`/api/agent/chat`) so the frontend needs zero changes to use MCP tools

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Add an optional ANTHROPIC_API_KEY for testing (BYOK preferred)
# cp .env.example .env

# 3. Start the server
npm run dev
```

Server starts on `http://localhost:3173`.

## BYOK Design

Following the core Codegrey architecture, this backend is **BYOK (Bring Your Own Key)**. 
It does not require a hardcoded API key to start. Instead, the frontend client passes `aiSettings` (provider, model, apiKey) with each chat request.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/agent/chat` | Main agentic chat — SSE (includes MCP tools) |
| POST | `/api/mcp/servers` | Register a new MCP server |
| GET  | `/api/mcp/tools` | List all available tools across all servers |

## Add your first MCP server

```bash
curl -X POST http://localhost:3173/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Filesystem",
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/yourname"],
    "autoStart": true
  }'
```

Or use the frontend client (`examples/client.js`).

## API Reference

### MCP Server Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/mcp/servers` | List all servers + connection status |
| POST | `/api/mcp/servers` | Register a new server |
| PATCH | `/api/mcp/servers/:id` | Update server config |
| DELETE | `/api/mcp/servers/:id` | Remove a server |
| POST | `/api/mcp/servers/:id/start` | Connect/spawn server |
| POST | `/api/mcp/servers/:id/stop` | Disconnect/kill server |
| POST | `/api/mcp/servers/:id/restart` | Stop + start |
| GET | `/api/mcp/servers/:id/tools` | List tools from server |
| GET | `/api/mcp/servers/:id/resources` | List resources from server |
| GET | `/api/mcp/servers/:id/prompts` | List prompts from server |
| POST | `/api/mcp/servers/:id/tools/:tool` | Call a tool directly |
| GET | `/api/mcp/tools` | All tools, all connected servers |
| GET | `/api/mcp/health` | Health + connection summary |

### Agent (MCP-aware, same interface as AI backend)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/agent/chat` | Streaming SSE chat with MCP tools |
| POST | `/api/agent/chat/sync` | Sync chat with MCP tools |
| POST | `/api/agent/confirm` | Confirm blocked destructive op |
| POST | `/api/agent/clear` | Clear session history |
| POST | `/api/context` | Set project context |

## How MCP tools work in the agent

When you send a chat message to `/api/agent/chat`, the backend:

1. Fetches all tool definitions from every connected MCP server
2. Namespaces them as `mcp__<serverId>__<toolName>`
3. Merges them with the built-in tools and passes all of them to Claude
4. When Claude calls `mcp__github-mcp__search_repositories`, routes it to the GitHub MCP server
5. Returns the result to Claude and continues the loop

Claude sees a note in its system prompt listing which MCP servers are connected and what tools they have.

## Transport types

### stdio (most common)
```json
{
  "label": "GitHub",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..." }
}
```

### SSE (for remote/hosted servers)
```json
{
  "label": "My Remote Server",
  "transport": "sse",
  "url": "https://my-mcp-server.com/sse",
  "headers": { "Authorization": "Bearer my-token" }
}
```

## Popular MCP servers

See `config/examples.js` for ready-to-use configs for:

- `@modelcontextprotocol/server-filesystem` — read/write files
- `@modelcontextprotocol/server-github` — GitHub repos, issues, PRs
- `@modelcontextprotocol/server-postgres` — query PostgreSQL
- `@modelcontextprotocol/server-sqlite` — query SQLite
- `@modelcontextprotocol/server-brave-search` — web search
- `@modelcontextprotocol/server-puppeteer` — browser automation
- `@modelcontextprotocol/server-slack` — Slack messages/channels
- `@modelcontextprotocol/server-memory` — persistent memory
- `@modelcontextprotocol/server-sequential-thinking` — reasoning scratchpad

Find more at: https://github.com/modelcontextprotocol/servers

## Architecture

```
mcp-backend/
├── server.js                       — Entry point, port 3173
└── src/
    ├── registry/registry.js        — Persist + manage server configs (~/.codegrey/)
    ├── runner/runner.js            — Spawn stdio / connect SSE, JSON-RPC protocol
    ├── proxy/proxy.js              — Bridge between agent loop and MCP servers
    ├── loop/mcpAgentLoop.js        — Agent loop with MCP tool injection
    └── routes/
        ├── mcp.js                  — /api/mcp/* management endpoints
        └── agent.js                — /api/agent/* chat endpoints (MCP-aware)
```

## Run both backends

```bash
# Terminal 1 — AI backend (built-in tools)
cd backend && npm run dev

# Terminal 2 — MCP backend (MCP tools + agent)
cd mcp-backend && npm run dev
```

Point your frontend at port **3173** to get both built-in and MCP tools. Point it at **3172** for built-in tools only.

## Smoke test

```bash
node tests/smoke.js
```

Tests registry CRUD, stdio connection (downloads filesystem server via npx), tool dispatch, and the full agent loop.
