import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, ArrowRight, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { getSkill, regenerateSkill, type Skill } from "../lib/api";
import SkillEditor from "../components/SkillEditor";
import SkillPreview from "../components/SkillPreview";

export default function SkillReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");

  useEffect(() => {
    if (!id) return;
    getSkill(id)
      .then(setSkill)
      .catch(() => toast.error("Failed to load skill"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleRegenerate = async () => {
    if (!skill) return;
    setRegenerating(true);
    try {
      const updated = await regenerateSkill(skill.id);
      setSkill(updated);
      toast.success("Skill regenerated!");
    } catch {
      toast.error("Failed to regenerate skill");
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 mb-4">Skill not found</p>
          <button onClick={() => navigate("/dashboard")} className="btn-secondary">
            Go to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/dashboard")}
            className="btn-ghost p-2"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-white font-semibold">{skill.title}</h1>
            <p className="text-gray-500 text-xs font-mono">{skill.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="btn-secondary text-sm"
          >
            {regenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Regenerate
          </button>
          <button
            onClick={() => navigate(`/skills/${skill.id}/publish`)}
            className="btn-primary text-sm"
          >
            Approve & Publish
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile tab switcher */}
      <div className="lg:hidden flex border-b border-gray-800">
        <button
          onClick={() => setActiveTab("edit")}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === "edit"
              ? "text-white border-b-2 border-brand-500"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          Edit
        </button>
        <button
          onClick={() => setActiveTab("preview")}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === "preview"
              ? "text-white border-b-2 border-brand-500"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          Preview
        </button>
      </div>

      {/* Split pane */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor pane */}
        <div
          className={`w-full lg:w-1/2 border-r border-gray-800 overflow-hidden ${
            activeTab === "preview" ? "hidden lg:block" : "block"
          }`}
        >
          <SkillEditor skill={skill} onChange={setSkill} />
        </div>

        {/* Preview pane */}
        <div
          className={`w-full lg:w-1/2 overflow-hidden bg-gray-900/30 ${
            activeTab === "edit" ? "hidden lg:block" : "block"
          }`}
        >
          <div className="border-b border-gray-800 px-6 py-3 flex items-center gap-2">
            <span className="text-xs text-gray-500">Live preview</span>
            <span className="badge-gray">SKILL.md</span>
          </div>
          <SkillPreview content={skill.content} />
        </div>
      </div>
    </div>
  );
}
