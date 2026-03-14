import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Copy,
  Check,
  ExternalLink,
  Eye,
  Upload,
  Globe,
  Lock,
  Loader2,
} from "lucide-react";
import BrandMark from "../components/BrandMark";
import toast from "react-hot-toast";
import { listSkills, getMe, type Skill, type User } from "../lib/api";

function StatusBadge({ visibility }: { visibility: string }) {
  return visibility === "public" ? (
    <span className="badge-green flex items-center gap-1">
      <Globe className="w-3 h-3" /> Public
    </span>
  ) : (
    <span className="badge-gray flex items-center gap-1">
      <Lock className="w-3 h-3" /> Private
    </span>
  );
}

function SkillCard({ skill }: { skill: Skill }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const copyInstall = async () => {
    if (!skill.install_command) return;
    await navigator.clipboard.writeText(skill.install_command);
    setCopied(true);
    toast.success("Copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-white font-semibold truncate">{skill.title}</h3>
            <StatusBadge visibility={skill.visibility} />
          </div>
          <p className="text-gray-500 text-xs font-mono">{skill.name}</p>
        </div>
        {skill.download_count > 0 && (
          <span className="text-xs text-gray-600 flex-shrink-0">
            {skill.download_count} installs
          </span>
        )}
      </div>

      {skill.trigger_phrases && skill.trigger_phrases.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {skill.trigger_phrases.slice(0, 4).map((p, i) => (
            <span key={i} className="badge-blue text-xs max-w-xs truncate">{p}</span>
          ))}
          {skill.trigger_phrases.length > 4 && (
            <span className="badge-gray text-xs">+{skill.trigger_phrases.length - 4}</span>
          )}
        </div>
      )}

      {skill.install_command && (
        <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2 mb-4">
          <code className="text-xs text-gray-300 flex-1 truncate font-mono">
            {skill.install_command}
          </code>
          <button
            onClick={copyInstall}
            className="text-gray-500 hover:text-white flex-shrink-0"
          >
            {copied ? <Check className="w-4 h-4 text-yellow-300" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => navigate(`/skills/${skill.id}/review`)}
          className="btn-ghost text-xs flex-1 justify-center"
        >
          <Eye className="w-3 h-3" /> Review
        </button>
        <button
          onClick={() => navigate(`/skills/${skill.id}/publish`)}
          className="btn-secondary text-xs flex-1 justify-center"
        >
          <ExternalLink className="w-3 h-3" /> Publish
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      navigate("/");
      return;
    }

    Promise.all([listSkills(), getMe()])
      .then(([s, u]) => {
        setSkills(s);
        setUser(u);
      })
      .catch(() => {
        toast.error("Failed to load dashboard");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrandMark size={26} label />
        </div>
        <div className="flex items-center gap-4">
          {user && (
            <div className="flex items-center gap-2">
              {user.avatar_url && (
                <img
                  src={user.avatar_url}
                  alt={user.name || ""}
                  className="w-8 h-8 rounded-full"
                />
              )}
              <span className="text-sm text-gray-400 hidden sm:inline">
                {user.name || user.github_username}
              </span>
            </div>
          )}
          <button
            onClick={() => navigate("/upload")}
            className="btn-primary text-sm"
          >
            <Plus className="w-4 h-4" />
            New skill
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Quota bar */}
        {user && user.plan === "free" && (
          <div className="mb-8 p-4 bg-gray-900 border border-gray-800 rounded-xl flex items-center justify-between gap-4">
            <div>
              <p className="text-white font-medium text-sm">Free plan</p>
              <p className="text-gray-500 text-xs">
                {user.skills_this_month}/3 skills used this month
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-32 bg-gray-800 rounded-full h-1.5">
                <div
                  className="bg-brand-500 h-1.5 rounded-full"
                  style={{ width: `${(user.skills_this_month / 3) * 100}%` }}
                />
              </div>
              <button className="btn-primary text-xs">Upgrade to Pro</button>
            </div>
          </div>
        )}

        {/* Skills grid */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white font-bold text-xl">Your skills</h2>
          <span className="text-gray-500 text-sm">{skills.length} total</span>
        </div>

        {skills.length === 0 ? (
          <div className="text-center py-24 border-2 border-dashed border-gray-800 rounded-2xl">
            <Upload className="w-12 h-12 text-gray-700 mx-auto mb-4" />
            <h3 className="text-white font-semibold text-lg mb-2">No skills yet</h3>
            <p className="text-gray-500 mb-6">
              Upload a workflow video to generate your first Claude skill.
            </p>
            <button
              onClick={() => navigate("/upload")}
              className="btn-primary"
            >
              <Upload className="w-4 h-4" />
              Upload a video
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {skills.map((skill) => (
              <SkillCard key={skill.id} skill={skill} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
