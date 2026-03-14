import { useState } from "react";
import { Download, Github, Code2, Globe, Copy, Check, ExternalLink, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import clsx from "clsx";
import { publishSkill, getSkillSnippet, downloadSkill, type Skill } from "../lib/api";

interface InstallOptionsProps {
  skill: Skill;
}

type Tab = "zip" | "github" | "snippet" | "marketplace";

export default function InstallOptions({ skill }: InstallOptionsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("zip");
  const [loading, setLoading] = useState(false);
  const [snippet, setSnippet] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<{ install_command?: string | null; github_repo_url?: string | null; marketplace_url?: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePublish = async (method: Tab) => {
    setLoading(true);
    try {
      const result = await publishSkill(skill.id, { delivery_method: method });
      setPublishResult(result);

      if (method === "snippet") {
        const snippetData = await getSkillSnippet(skill.id);
        setSnippet(snippetData.snippet);
      }
      toast.success(
        method === "zip"
          ? "Ready to download!"
          : method === "github"
          ? "Published to GitHub!"
          : method === "snippet"
          ? "Snippet generated!"
          : "Published to marketplace!"
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to publish";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: "zip", label: "ZIP Download", icon: Download },
    { id: "github", label: "GitHub", icon: Github },
    { id: "snippet", label: "Copy Snippet", icon: Code2 },
    { id: "marketplace", label: "Marketplace", icon: Globe },
  ];

  return (
    <div className="card">
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 p-1 bg-gray-800 rounded-xl">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={clsx(
              "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-150",
              activeTab === id
                ? "bg-gray-700 text-white shadow-sm"
                : "text-gray-500 hover:text-gray-300"
            )}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ZIP Download */}
      {activeTab === "zip" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-white font-semibold mb-1">Download as ZIP</h3>
            <p className="text-gray-400 text-sm">
              Get a ZIP file containing your <code>SKILL.md</code> and a README. Extract to{" "}
              <code>.claude/skills/{skill.name}/</code> in your project.
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 font-mono text-sm text-gray-300">
            <p className="text-gray-500 text-xs mb-2"># After downloading, install with:</p>
            <p>mkdir -p .claude/skills/{skill.name}</p>
            <p>cp {skill.name}/SKILL.md .claude/skills/{skill.name}/</p>
          </div>
          <button
            onClick={() => downloadSkill(skill.id)}
            className="btn-primary w-full justify-center"
          >
            <Download className="w-4 h-4" />
            Download {skill.name}.zip
          </button>
        </div>
      )}

      {/* GitHub */}
      {activeTab === "github" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-white font-semibold mb-1">Publish to GitHub</h3>
            <p className="text-gray-400 text-sm">
              Automatically create or update a{" "}
              <code className="text-brand-300">skillsclaw-skills</code> repository in your GitHub
              account and commit the skill file.
            </p>
          </div>

          {publishResult?.install_command ? (
            <div className="space-y-3">
              <div className="bg-brand-900/20 border border-brand-700 rounded-lg p-4">
                <p className="text-yellow-200 text-sm font-medium mb-2">Published successfully!</p>
                {publishResult.github_repo_url && (
                  <a
                    href={publishResult.github_repo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-400 text-sm flex items-center gap-1 hover:underline mb-3"
                  >
                    View on GitHub <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-2">Install command:</p>
                <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-3">
                  <code className="text-sm text-gray-200 flex-1 font-mono">
                    {publishResult.install_command}
                  </code>
                  <button
                    onClick={() => copyToClipboard(publishResult.install_command!)}
                    className="text-gray-400 hover:text-white"
                  >
                    {copied ? <Check className="w-4 h-4 text-yellow-300" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => handlePublish("github")}
              disabled={loading}
              className="btn-primary w-full justify-center"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
              Publish to GitHub
            </button>
          )}
        </div>
      )}

      {/* Snippet */}
      {activeTab === "snippet" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-white font-semibold mb-1">Copy CLAUDE.md snippet</h3>
            <p className="text-gray-400 text-sm">
              Add this block to your project's <code>CLAUDE.md</code> to activate the skill inline.
            </p>
          </div>

          {snippet ? (
            <div className="space-y-3">
              <pre className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap">
                {snippet}
              </pre>
              <button
                onClick={() => copyToClipboard(snippet)}
                className="btn-primary w-full justify-center"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied!" : "Copy to clipboard"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => handlePublish("snippet")}
              disabled={loading}
              className="btn-primary w-full justify-center"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Code2 className="w-4 h-4" />}
              Generate snippet
            </button>
          )}
        </div>
      )}

      {/* Marketplace */}
      {activeTab === "marketplace" && (
        <div className="space-y-4">
          <div>
            <h3 className="text-white font-semibold mb-1">Publish to Marketplace</h3>
            <p className="text-gray-400 text-sm">
              Make your skill publicly discoverable on the SkillsClaw marketplace. Others can
              browse, preview, and install it.
            </p>
          </div>

          {skill.visibility === "public" && skill.install_command ? (
            <div className="space-y-3">
              <div className="bg-brand-900/20 border border-brand-700 rounded-lg p-4">
                <p className="text-yellow-200 text-sm font-medium mb-1">Live on marketplace!</p>
                <a
                  href={`/marketplace/${skill.id}`}
                  className="text-brand-400 text-sm flex items-center gap-1 hover:underline"
                >
                  View public listing <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-2">Install command:</p>
                <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-3">
                  <code className="text-sm text-gray-200 flex-1 font-mono">{skill.install_command}</code>
                  <button
                    onClick={() => copyToClipboard(skill.install_command!)}
                    className="text-gray-400 hover:text-white"
                  >
                    {copied ? <Check className="w-4 h-4 text-yellow-300" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => handlePublish("marketplace")}
              disabled={loading}
              className="btn-primary w-full justify-center"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
              Publish to marketplace
            </button>
          )}
        </div>
      )}
    </div>
  );
}
