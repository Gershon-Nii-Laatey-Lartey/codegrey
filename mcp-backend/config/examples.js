/**
 * EXAMPLE MCP SERVER CONFIGURATIONS
 *
 * Paste these into POST /api/mcp/servers to add servers to Codegrey.
 * Or add them directly to ~/.codegrey/mcp-servers.json.
 *
 * All stdio servers use npx — they download automatically on first run.
 * Set autoStart: true to connect them when the MCP backend starts.
 */

const EXAMPLE_SERVERS = [
  // ─── FILESYSTEM ─────────────────────────────────────────────────────────────
  // Read/write files outside the workspace, browse directories
  {
    label: "Filesystem",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/Users/YOUR_NAME"],
    autoStart: true,
  },

  // ─── GITHUB ──────────────────────────────────────────────────────────────────
  // Search repos, read files, create issues, open PRs
  {
    label: "GitHub",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_YOUR_TOKEN_HERE",
    },
    autoStart: false,
  },

  // ─── GITLAB ──────────────────────────────────────────────────────────────────
  {
    label: "GitLab",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-gitlab"],
    env: {
      GITLAB_PERSONAL_ACCESS_TOKEN: "glpat_YOUR_TOKEN_HERE",
      GITLAB_API_URL: "https://gitlab.com/api/v4",
    },
    autoStart: false,
  },

  // ─── POSTGRES ────────────────────────────────────────────────────────────────
  // Query a PostgreSQL database
  {
    label: "PostgreSQL",
    transport: "stdio",
    command: "npx",
    args: [
      "-y",
      "@modelcontextprotocol/server-postgres",
      "postgresql://localhost/mydb",
    ],
    autoStart: false,
  },

  // ─── SQLITE ──────────────────────────────────────────────────────────────────
  {
    label: "SQLite",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "/path/to/db.sqlite"],
    autoStart: false,
  },

  // ─── BRAVE SEARCH ────────────────────────────────────────────────────────────
  // Web search (better than the built-in DuckDuckGo fallback)
  {
    label: "Brave Search",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    env: {
      BRAVE_API_KEY: "YOUR_BRAVE_API_KEY",
    },
    autoStart: false,
  },

  // ─── PUPPETEER ───────────────────────────────────────────────────────────────
  // Browser automation — screenshot, click, scrape live pages
  {
    label: "Puppeteer",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-puppeteer"],
    autoStart: false,
  },

  // ─── SLACK ───────────────────────────────────────────────────────────────────
  {
    label: "Slack",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    env: {
      SLACK_BOT_TOKEN: "xoxb-YOUR-BOT-TOKEN",
      SLACK_TEAM_ID: "T0123456789",
    },
    autoStart: false,
  },

  // ─── MEMORY ──────────────────────────────────────────────────────────────────
  // Persistent key-value memory across sessions
  {
    label: "Memory",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    autoStart: true,
  },

  // ─── SEQUENTIAL THINKING ─────────────────────────────────────────────────────
  // Gives Claude a scratchpad for multi-step reasoning
  {
    label: "Sequential Thinking",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    autoStart: true,
  },

  // ─── CUSTOM SSE SERVER ───────────────────────────────────────────────────────
  // Connect to any server that speaks MCP over SSE
  {
    label: "My Custom Server",
    transport: "sse",
    url: "http://localhost:8080/sse",
    headers: {
      Authorization: "Bearer my-secret-token",
    },
    autoStart: false,
  },
];

module.exports = { EXAMPLE_SERVERS };
