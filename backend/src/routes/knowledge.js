/**
 * KNOWLEDGE BASE ROUTES
 *
 * GET    /api/knowledge              — List all knowledge items (global + workspace)
 * POST   /api/knowledge              — Create a knowledge item
 * PUT    /api/knowledge/:id          — Update a knowledge item
 * DELETE /api/knowledge/:id          — Delete a knowledge item
 * GET    /api/knowledge/active       — Get active items for AI injection (global + workspace)
 *
 * GET    /api/skills                 — List all available skills from marketplace
 * POST   /api/skills/:id/install     — Install a skill to global or workspace
 * DELETE /api/skills/:id/uninstall   — Uninstall a skill
 */

const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

// Storage: ~/.codegrey/knowledge.json
const STORE_DIR = path.join(os.homedir(), ".codegrey");
const STORE_PATH = path.join(STORE_DIR, "knowledge.json");

function loadStore() {
  try {
    if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
    if (!fs.existsSync(STORE_PATH)) return { items: [], installedSkills: [] };
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    return { items: [], installedSkills: [] };
  }
}

function saveStore(store) {
  if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

// ─── MARKETPLACE SKILLS ──────────────────────────────────────────────────────
const SKILL_MARKETPLACE = [
  {
    id: "clean-code",
    name: "Clean Code",
    description: "Always write clean, well-named, self-documenting code. Avoid magic numbers and abbreviations.",
    category: "Code Quality",
    icon: "CQ",
    content: "Always write clean, readable, and self-documenting code. Use meaningful variable and function names. Avoid abbreviations. Avoid magic numbers — always assign them to named constants. Prefer clarity over brevity.",
  },
  {
    id: "test-first",
    name: "Test-First",
    description: "Write failing tests before implementing features.",
    category: "Workflow",
    icon: "TDD",
    content: "Always follow TDD. Before implementing any feature or fix, write a failing test that captures the expected behavior. Only then write the minimal code to make it pass. Refactor afterward.",
  },
  {
    id: "small-commits",
    name: "Small Commits",
    description: "Make small, atomic, well-described commits frequently.",
    category: "Workflow",
    icon: "GIT",
    content: "Make small, focused commits. Each commit should represent a single logical change. Write descriptive commit messages in the imperative mood (e.g. 'Add user authentication'). Never bundle unrelated changes.",
  },
  {
    id: "no-comments",
    name: "No Obvious Comments",
    description: "Don't write comments that just restate what the code does.",
    category: "Code Quality",
    icon: "CQ",
    content: "Do not add comments that merely restate what the code obviously does. Only add comments to explain WHY something non-obvious is being done, or to document public API contracts. Let the code speak for itself.",
  },
  {
    id: "functional-style",
    name: "Functional Style",
    description: "Prefer immutable data, pure functions, and functional patterns.",
    category: "Architecture",
    icon: "FP",
    content: "Prefer functional programming patterns: pure functions, immutable data, and composability. Avoid side effects where possible. Prefer map/filter/reduce over loops. Avoid mutating arguments or shared state.",
  },
  {
    id: "typescript-strict",
    name: "TypeScript Strict",
    description: "Enforce strict TypeScript: no any, explicit types, no implicit returns.",
    category: "Code Quality",
    icon: "TS",
    content: "Enforce strict TypeScript at all times. Never use 'any'. All function parameters and return types must be explicitly typed. Enable and respect strict mode. Never use non-null assertion unless absolutely necessary and always comment why.",
  },
  {
    id: "security-first",
    name: "Security First",
    description: "Always consider security implications before writing code.",
    category: "Security",
    icon: "SEC",
    content: "Always consider security implications before writing code. Never expose secrets in code. Validate and sanitize all user inputs. Avoid eval or similar dynamic execution. Use parameterized queries for SQL. Follow the principle of least privilege.",
  },
  {
    id: "api-rest",
    name: "RESTful API Design",
    description: "Follow strict REST conventions for all API endpoints.",
    category: "Architecture",
    icon: "API",
    content: "Follow REST conventions strictly. Use nouns not verbs in endpoints. Use correct HTTP methods (GET reads, POST creates, PUT replaces, PATCH updates, DELETE removes). Return proper HTTP status codes. Version your API. Paginate list responses.",
  },
  {
    id: "accessibility",
    name: "Accessibility (a11y)",
    description: "Always write accessible HTML and components.",
    category: "Frontend",
    icon: "A11",
    content: "Always write accessible code. Use semantic HTML elements. Ensure all interactive elements have accessible labels. Support keyboard navigation. Provide alt text for images. Ensure sufficient color contrast. Test with screen reader assumptions in mind.",
  },
  {
    id: "performance",
    name: "Performance Mindset",
    description: "Always consider performance impact of code changes.",
    category: "Architecture",
    icon: "PERF",
    content: "Always consider the performance impact of your code. Avoid unnecessary re-renders in UI frameworks. Prefer lazy loading. Minimize network requests. Use efficient data structures. Profile before optimizing — don't over-optimize prematurely.",
  },
];

// ─── KNOWLEDGE ITEMS ─────────────────────────────────────────────────────────

// GET /api/knowledge
router.get("/knowledge", (req, res) => {
  const store = loadStore();
  res.json({ items: store.items || [] });
});

// POST /api/knowledge
router.post("/knowledge", (req, res) => {
  const { title, content, scope, workspaceId } = req.body;
  if (!title?.trim() || !content?.trim()) {
    return res.status(400).json({ error: "title and content are required" });
  }

  const store = loadStore();
  const item = {
    id: crypto.randomUUID(),
    title: title.trim(),
    content: content.trim(),
    scope: scope === "workspace" ? "workspace" : "global",
    workspaceId: scope === "workspace" ? workspaceId : null,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  store.items = [...(store.items || []), item];
  saveStore(store);
  res.json(item);
});

// PUT /api/knowledge/:id
router.put("/knowledge/:id", (req, res) => {
  const store = loadStore();
  const idx = store.items.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });

  const { title, content, enabled } = req.body;
  const updated = {
    ...store.items[idx],
    ...(title !== undefined && { title: title.trim() }),
    ...(content !== undefined && { content: content.trim() }),
    ...(enabled !== undefined && { enabled }),
    updatedAt: new Date().toISOString(),
  };
  store.items[idx] = updated;
  saveStore(store);
  res.json(updated);
});

// DELETE /api/knowledge/:id
router.delete("/knowledge/:id", (req, res) => {
  const store = loadStore();
  store.items = (store.items || []).filter((i) => i.id !== req.params.id);
  saveStore(store);
  res.json({ deleted: true });
});

// GET /api/knowledge/active - Used by AI to inject context
router.get("/knowledge/active", (req, res) => {
  const { workspaceId } = req.query;
  const store = loadStore();

  const activeItems = (store.items || []).filter((item) => {
    if (!item.enabled) return false;
    if (item.scope === "global") return true;
    if (item.scope === "workspace" && item.workspaceId === workspaceId) return true;
    return false;
  });

  // Also include installed skills that are active
  const activeSkills = (store.installedSkills || [])
    .filter((s) => {
      if (!s.enabled) return false;
      if (s.scope === "global") return true;
      if (s.scope === "workspace" && s.workspaceId === workspaceId) return true;
      return false;
    })
    .map((s) => {
      const skill = SKILL_MARKETPLACE.find((m) => m.id === s.skillId);
      return skill ? { ...s, content: skill.content, title: skill.name } : null;
    })
    .filter(Boolean);

  res.json({ items: activeItems, skills: activeSkills });
});

// ─── SKILLS MARKETPLACE ──────────────────────────────────────────────────────

// GET /api/skills
router.get("/skills", (req, res) => {
  const store = loadStore();
  const installed = store.installedSkills || [];

  const skills = SKILL_MARKETPLACE.map((skill) => ({
    ...skill,
    installed: installed.some((s) => s.skillId === skill.id),
  }));

  res.json({ skills });
});

// POST /api/skills/:id/install
router.post("/skills/:id/install", (req, res) => {
  const { scope, workspaceId, workspaceRoot } = req.body;
  const skill = SKILL_MARKETPLACE.find((s) => s.id === req.params.id);
  if (!skill) return res.status(404).json({ error: "Skill not found" });

  const store = loadStore();
  store.installedSkills = store.installedSkills || [];

  // Remove existing installation of this skill first
  store.installedSkills = store.installedSkills.filter((s) => s.skillId !== skill.id);

  store.installedSkills.push({
    id: crypto.randomUUID(),
    skillId: skill.id,
    scope: scope === "workspace" ? "workspace" : "global",
    workspaceId: scope === "workspace" ? workspaceId : null,
    enabled: true,
    installedAt: new Date().toISOString(),
  });

  saveStore(store);

  // Write skill file to workspace so it appears in the file tree
  let filePath = null;
  const targetRoot = workspaceRoot || null;
  if (targetRoot) {
    try {
      const skillsDir = path.join(targetRoot, ".codegrey", "skills");
      if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });
      filePath = path.join(skillsDir, `${skill.id}.md`);
      const fileContent = [
        `# ${skill.name}`,
        ``,
        `> **Category:** ${skill.category}`,
        ``,
        skill.content,
        ``,
        `---`,
        `_Installed by Codegrey Skills Marketplace_`,
      ].join("\n");
      fs.writeFileSync(filePath, fileContent, "utf8");
    } catch (err) {
      console.warn("[knowledge] Could not write skill file:", err.message);
    }
  }

  res.json({ installed: true, filePath });
});

// DELETE /api/skills/:id/uninstall
router.delete("/skills/:id/uninstall", (req, res) => {
  const store = loadStore();
  // Find the skill before removing so we can delete the file
  const entry = (store.installedSkills || []).find((s) => s.skillId === req.params.id);
  store.installedSkills = (store.installedSkills || []).filter((s) => s.skillId !== req.params.id);
  saveStore(store);

  // Remove skill file from any workspace that has it
  if (entry) {
    try {
      // Attempt to clean up if workspaceRoot can be inferred
      // (the frontend should pass workspaceRoot as query param on uninstall)
      const wr = req.query.workspaceRoot;
      if (wr) {
        const filePath = path.join(wr, ".codegrey", "skills", `${req.params.id}.md`);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.warn("[knowledge] Could not remove skill file:", err.message);
    }
  }

  res.json({ uninstalled: true });
});

module.exports = router;
