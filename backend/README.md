# AI IDE Backend

Full agentic coding AI backend — Cursor/Windsurf level capability.
Powered by Claude claude-opus-4-5 with a multi-step tool-use loop.

## What this does

- **Reads files** before editing them (never blind edits)
- **Patches files** surgically or rewrites them entirely
- **Runs terminal commands** — tests, builds, installs, git
- **Searches the codebase** with grep/regex across all files
- **Browses directories** to understand project structure
- **Fetches web docs** when it needs to look something up
- **Loops autonomously** until the task is complete (up to 50 steps)
- **Streams responses** token-by-token via SSE
- **Remembers context** within a session

## Setup

```bash
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env

npm install
npm run dev
```

Server starts on `http://localhost:3172`.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/agent/chat` | Main agent endpoint — streaming SSE |
| POST | `/api/agent/chat/sync` | Same but waits for full response |
| POST | `/api/agent/confirm` | Confirm a blocked destructive operation |
| POST | `/api/agent/clear` | Clear session conversation history |
| POST | `/api/context` | Set project metadata for a session |
| GET | `/api/health` | Health check |

## Streaming Chat (SSE)

```js
POST /api/agent/chat
{
  "sessionId": "uuid",
  "message": "Add input validation to the signup route",
  "workspaceRoot": "/Users/me/my-project",
  "editorContext": {
    "openFile": "src/routes/auth.js",
    "cursorLine": 24,
    "selection": "router.post('/signup', async (req, res) => {"
  }
}
```

SSE events:
- `text_delta` — Streaming text chunks
- `tool_call` — Agent invoked a tool
- `tool_result` — Tool returned a result
- `done` — Task complete
- `error` — Something went wrong

## Tools available to the agent

| Tool | What it does |
|------|-------------|
| `read_file` | Read file contents (with optional line range) |
| `write_file` | Create or fully overwrite a file |
| `patch_file` | Surgically replace a block of text in a file |
| `delete_file` | Delete a file (requires confirmation) |
| `rename_file` | Move/rename a file |
| `list_directory` | Browse directory tree |
| `search_codebase` | Grep/regex search across all files |
| `find_files` | Find files by name/glob |
| `run_command` | Execute shell commands |
| `web_search` | Search the web |
| `fetch_url` | Fetch a specific URL |
| `get_diagnostics` | TypeScript/ESLint errors |
| `get_symbol_info` | Find definition + usages of a symbol |
| `git_diff` | Current git diff |
| `git_log` | Commit history |
| `remember` / `recall` | Session memory |

## Integrate with your IDE frontend

See `examples/client.js` for a ready-to-use JS client.

```js
import { initAISession, sendMessage } from './examples/client.js';

await initAISession({ sessionId, workspaceRoot });

await sendMessage({
  sessionId,
  message: "Refactor the auth middleware to use async/await",
  workspaceRoot,
  onText: (chunk) => appendToUI(chunk),
  onToolCall: ({ name }) => showBadge(`⚡ ${name}`),
  onDone: ({ iterations }) => console.log(`Done in ${iterations} steps`),
});
```

## Architecture

```
server.js
└── src/
    ├── routes/agent.js     — HTTP endpoints
    ├── loop/agentLoop.js   — Core agentic loop (think → act → observe → repeat)
    ├── tools/
    │   ├── definitions.js  — Tool schemas passed to Claude
    │   └── executor.js     — Actual implementation of each tool
    └── prompts/system.js   — System prompt (the AI's "brain config")
```

## Upgrading web search

The default `web_search` uses DuckDuckGo. For better results, integrate one of:
- **Brave Search API** — `https://api.search.brave.com`
- **Tavily** — `https://api.tavily.com` (made for AI agents)
- **SerpAPI** — `https://serpapi.com`

Add your key to `.env` and update `executor.js`'s `web_search` method.
