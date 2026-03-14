import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { getSkill, type Skill } from "../lib/api";
import InstallOptions from "../components/InstallOptions";
import SkillPreview from "../components/SkillPreview";

export default function SkillPublish() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!id) return;
    getSkill(id)
      .then(setSkill)
      .catch(() => toast.error("Failed to load skill"))
      .finally(() => setLoading(false));
  }, [id]);

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
            onClick={() => navigate(`/skills/${skill.id}/review`)}
            className="btn-ghost p-2"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-white font-semibold">Publish skill</h1>
            <p className="text-gray-500 text-xs font-mono">{skill.name}</p>
          </div>
        </div>
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="btn-secondary text-sm"
        >
          <Eye className="w-4 h-4" />
          {showPreview ? "Hide" : "Preview"}
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {/* Install options */}
        <div className={`${showPreview ? "hidden lg:flex" : "flex"} flex-1 flex-col items-center justify-start p-8 overflow-y-auto`}>
          <div className="w-full max-w-xl space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Choose how to deploy</h2>
              <p className="text-gray-400">
                Pick the delivery method that fits your workflow. You can use multiple methods for the same skill.
              </p>
            </div>

            {/* Skill summary */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex gap-4">
              <div className="w-10 h-10 bg-brand-900/50 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-brand-400 font-bold text-sm">SK</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-medium truncate">{skill.title}</h3>
                <p className="text-gray-500 text-xs font-mono">{skill.name}</p>
                {skill.trigger_phrases && skill.trigger_phrases.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {skill.trigger_phrases.slice(0, 3).map((p, i) => (
                      <span key={i} className="badge-gray text-xs">{p.slice(0, 30)}{p.length > 30 ? "..." : ""}</span>
                    ))}
                    {skill.trigger_phrases.length > 3 && (
                      <span className="badge-gray text-xs">+{skill.trigger_phrases.length - 3} more</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <InstallOptions skill={skill} onUpdated={setSkill} />
          </div>
        </div>

        {/* Preview panel */}
        {showPreview && (
          <div className="w-full lg:w-2/5 border-l border-gray-800 overflow-hidden bg-gray-900/30">
            <div className="border-b border-gray-800 px-6 py-3">
              <span className="text-xs text-gray-500">SKILL.md preview</span>
            </div>
            <SkillPreview content={skill.content} />
          </div>
        )}
      </div>
    </div>
  );
}
