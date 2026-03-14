import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Copy, Check, Download, Bot, ArrowLeft, Loader2, Globe } from "lucide-react";
import toast from "react-hot-toast";
import { listMarketplace, type MarketplaceSkill } from "../lib/api";
import BrandMark from "../components/BrandMark";

function SkillCard({ skill }: { skill: MarketplaceSkill }) {
  const [copied, setCopied] = useState(false);

  const copyInstall = async () => {
    if (!skill.install_command) return;
    await navigator.clipboard.writeText(skill.install_command);
    setCopied(true);
    toast.success("Install command copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold truncate">{skill.title}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-gray-500 text-xs font-mono">{skill.name}</span>
            {skill.user_github_username && (
              <span className="text-gray-600 text-xs">by @{skill.user_github_username}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-600 flex-shrink-0">
          <Download className="w-3 h-3" />
          <span>{skill.download_count}</span>
        </div>
      </div>

      {/* Trigger phrases */}
      {skill.trigger_phrases && skill.trigger_phrases.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {skill.trigger_phrases.slice(0, 3).map((p, i) => (
            <span key={i} className="badge-blue text-xs max-w-xs truncate">{p}</span>
          ))}
          {skill.trigger_phrases.length > 3 && (
            <span className="badge-gray text-xs">+{skill.trigger_phrases.length - 3}</span>
          )}
        </div>
      )}

      {/* Description excerpt */}
      {skill.description && (
        <p className="text-gray-500 text-xs leading-relaxed mb-4 line-clamp-2">
          {skill.description.replace(/Use this skill when the user says things like:?\s*/i, "").split("\n")[0]}
        </p>
      )}

      {/* Install */}
      {skill.install_command ? (
        <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
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
      ) : (
        <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2 opacity-50">
          <code className="text-xs text-gray-500 font-mono">No install command available</code>
        </div>
      )}
    </div>
  );
}

export default function Marketplace() {
  const navigate = useNavigate();
  const [skills, setSkills] = useState<MarketplaceSkill[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchSkills = useCallback(async (q: string, p: number, replace = false) => {
    if (p === 1) setSearching(true);
    try {
      const results = await listMarketplace(q || undefined, p, 20);
      setSkills((prev) => replace || p === 1 ? results : [...prev, ...results]);
      setHasMore(results.length === 20);
    } catch {
      toast.error("Failed to load marketplace");
    } finally {
      setLoading(false);
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills("", 1, true);
  }, [fetchSkills]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchSkills(query, 1, true);
    }, 400);
    return () => clearTimeout(timer);
  }, [query, fetchSkills]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchSkills(query, next, false);
  };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/")} className="btn-ghost p-2">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <BrandMark size={22} />
            <h1 className="text-white font-bold text-lg">Skill Marketplace</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/upload")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-300 hover:bg-yellow-200 text-black font-semibold transition-colors duration-150 shadow-[0_0_18px_-8px_rgba(255,201,42,0.85)] text-sm"
          >
            <Bot className="w-4 h-4" />
            Create skill
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero */}
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-white mb-3">
            Community Claude Skills
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Discover and install workflow skills created by the community. One command to add any skill to your Claude projects.
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-8 max-w-xl mx-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input pl-11 py-3 text-base"
            placeholder="Search skills by name, description, or tool..."
          />
          {searching && (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 animate-spin" />
          )}
        </div>

        {/* Skills grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
          </div>
        ) : skills.length === 0 ? (
          <div className="text-center py-24">
            <Globe className="w-12 h-12 text-gray-700 mx-auto mb-4" />
            <h3 className="text-white font-semibold text-lg mb-2">
              {query ? "No skills found" : "No public skills yet"}
            </h3>
            <p className="text-gray-500 mb-6">
              {query
                ? `No skills match "${query}". Try a different search.`
                : "Be the first to publish a skill to the marketplace!"}
            </p>
            <button onClick={() => navigate("/upload")} className="btn-primary">
              <Bot className="w-4 h-4" />
              Create the first skill
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {skills.map((skill) => (
                <SkillCard key={skill.id} skill={skill} />
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center mt-8">
                <button onClick={loadMore} className="btn-secondary">
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
