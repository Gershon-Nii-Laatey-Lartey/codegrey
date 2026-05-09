import {
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  Download,
  Globe,
  Plus,
  Search,
  Sparkles,
  Trash2,
  ToggleLeft,
  ToggleRight,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE = "http://localhost:3172/api";

type KnowledgeScope = "global" | "workspace";

type KnowledgeItem = {
  id: string;
  title: string;
  content: string;
  scope: KnowledgeScope;
  workspaceId: string | null;
  enabled: boolean;
  createdAt: string;
};

type MarketplaceSkill = {
  id: string;
  name: string;
  description: string;
  content: string;
  category: string;
  icon: string;
  installed: boolean;
};

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, opts);
  return res.json();
}

const CATEGORIES = ["All", "Code Quality", "Architecture", "Workflow", "Security", "Frontend"];

export function KnowledgePage({
  onBack,
  activeWorkspaceId,
}: {
  onBack: () => void;
  activeWorkspaceId?: string | null;
}) {
  const [tab, setTab] = useState<"knowledge" | "skills">("knowledge");
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [skills, setSkills] = useState<MarketplaceSkill[]>([]);
  const [scope, setScope] = useState<KnowledgeScope>("global");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadKnowledge = useCallback(async () => {
    const data = await api("/knowledge");
    setItems(data.items || []);
  }, []);

  const loadSkills = useCallback(async () => {
    const data = await api("/skills");
    setSkills(data.skills || []);
  }, []);

  useEffect(() => {
    void loadKnowledge();
    void loadSkills();
  }, [loadKnowledge, loadSkills]);

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      if (item.scope !== scope) return false;
      if (scope === "workspace" && item.workspaceId !== activeWorkspaceId) return false;
      return true;
    });
  }, [items, scope, activeWorkspaceId]);

  const filteredSkills = useMemo(() => {
    return skills.filter((s) => {
      const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.description.toLowerCase().includes(search.toLowerCase());
      const matchCat = category === "All" || s.category === category;
      return matchSearch && matchCat;
    });
  }, [skills, search, category]);

  const handleSave = async () => {
    if (!formTitle.trim() || !formContent.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await api(`/knowledge/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: formTitle, content: formContent }),
        });
      } else {
        await api("/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: formTitle,
            content: formContent,
            scope,
            workspaceId: scope === "workspace" ? activeWorkspaceId : null,
          }),
        });
      }
      setFormTitle("");
      setFormContent("");
      setShowForm(false);
      setEditingId(null);
      void loadKnowledge();
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (item: KnowledgeItem) => {
    await api(`/knowledge/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !item.enabled }),
    });
    void loadKnowledge();
  };

  const handleDelete = async (id: string) => {
    await api(`/knowledge/${id}`, { method: "DELETE" });
    void loadKnowledge();
  };

  const handleInstall = async (skill: MarketplaceSkill) => {
    if (skill.installed) {
      await api(`/skills/${skill.id}/uninstall`, { method: "DELETE" });
    } else {
      await api(`/skills/${skill.id}/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "global" }),
      });
    }
    void loadSkills();
  };

  const startEdit = (item: KnowledgeItem) => {
    setEditingId(item.id);
    setFormTitle(item.title);
    setFormContent(item.content);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setFormTitle("");
    setFormContent("");
    setEditingId(null);
  };

  return (
    <div className="knowledge-page">
      <div className="knowledge-header">
        <div className="knowledge-header-left">
          <Brain size={18} className="knowledge-header-icon" />
          <div>
            <h2>Knowledge & Skills</h2>
            <p>Rules and instructions the AI follows in every conversation</p>
          </div>
        </div>
        <button className="settings-close-btn" onClick={onBack} type="button">
          <X size={16} />
        </button>
      </div>

      <div className="knowledge-tabs">
        <button className={tab === "knowledge" ? "active" : ""} onClick={() => setTab("knowledge")}>
          <BookOpen size={13} />
          Knowledge
        </button>
        <button className={tab === "skills" ? "active" : ""} onClick={() => setTab("skills")}>
          <Sparkles size={13} />
          Skills Marketplace
        </button>
      </div>

      <div className="knowledge-body">
        {tab === "knowledge" && (
          <div className="knowledge-view">
            <div className="knowledge-toolbar">
              <div className="knowledge-scope-toggle">
                <button
                  className={scope === "global" ? "active" : ""}
                  onClick={() => setScope("global")}
                >
                  <Globe size={12} />
                  Global
                </button>
                <button
                  className={scope === "workspace" ? "active" : ""}
                  onClick={() => setScope("workspace")}
                  disabled={!activeWorkspaceId}
                >
                  <BookOpen size={12} />
                  Workspace
                </button>
              </div>
              <button
                className="knowledge-add-btn"
                onClick={() => { setShowForm(true); setEditingId(null); setFormTitle(""); setFormContent(""); }}
                type="button"
              >
                <Plus size={13} />
                Add Rule
              </button>
            </div>

            {showForm && (
              <div className="knowledge-form">
                <input
                  className="knowledge-form-input"
                  placeholder="Rule title (e.g. Always use TypeScript)"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  autoFocus
                />
                <textarea
                  className="knowledge-form-textarea"
                  placeholder="Describe the rule in plain language. The AI will follow it in every response..."
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  rows={4}
                />
                <div className="knowledge-form-actions">
                  <button className="knowledge-btn-secondary" onClick={cancelForm} type="button">
                    Cancel
                  </button>
                  <button
                    className="knowledge-btn-primary"
                    onClick={handleSave}
                    disabled={saving || !formTitle.trim() || !formContent.trim()}
                    type="button"
                  >
                    {saving ? "Saving…" : editingId ? <><Check size={13} /> Update</> : <><Plus size={13} /> Add Rule</>}
                  </button>
                </div>
              </div>
            )}

            {visibleItems.length === 0 && !showForm ? (
              <div className="knowledge-empty">
                <Brain size={36} opacity={0.1} />
                <p>No {scope} rules yet</p>
                <small>
                  {scope === "global"
                    ? "Global rules apply to every workspace and conversation."
                    : "Workspace rules apply only to this project."}
                </small>
              </div>
            ) : (
              <div className="knowledge-list">
                {visibleItems.map((item) => (
                  <div key={item.id} className={`knowledge-item ${!item.enabled ? "disabled" : ""}`}>
                    <div className="knowledge-item-main">
                      <div className="knowledge-item-title">{item.title}</div>
                      <div className="knowledge-item-content">{item.content}</div>
                    </div>
                    <div className="knowledge-item-actions">
                      <button
                        className="knowledge-toggle-btn"
                        onClick={() => handleToggle(item)}
                        title={item.enabled ? "Disable" : "Enable"}
                        type="button"
                      >
                        {item.enabled ? <ToggleRight size={18} className="toggle-on" /> : <ToggleLeft size={18} />}
                      </button>
                      <button
                        className="knowledge-action-btn"
                        onClick={() => startEdit(item)}
                        type="button"
                        title="Edit"
                      >
                        Edit
                      </button>
                      <button
                        className="knowledge-action-btn danger"
                        onClick={() => handleDelete(item.id)}
                        type="button"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "skills" && (
          <div className="knowledge-marketplace">
            <div className="knowledge-search-bar">
              <Search size={14} />
              <input
                placeholder="Search skills..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="knowledge-categories">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  className={category === c ? "active" : ""}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="knowledge-skill-grid">
              {filteredSkills.map((skill) => (
                <div key={skill.id} className={`knowledge-skill-card ${skill.installed ? "installed" : ""}`}>
                  <div className="knowledge-skill-top">
                    <span className="knowledge-skill-icon">{skill.icon}</span>
                    <span className="knowledge-skill-cat">{skill.category}</span>
                  </div>
                  <div className="knowledge-skill-name">{skill.name}</div>
                  <div className="knowledge-skill-desc">{skill.description}</div>
                  <button
                    className={`knowledge-skill-btn ${skill.installed ? "installed" : ""}`}
                    onClick={() => handleInstall(skill)}
                    type="button"
                  >
                    {skill.installed ? (
                      <><Check size={12} /> Installed</>
                    ) : (
                      <><Download size={12} /> Install</>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
