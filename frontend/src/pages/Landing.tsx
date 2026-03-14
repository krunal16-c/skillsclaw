import { useNavigate } from "react-router-dom";
import { Upload, Cpu, Eye, Bot, ArrowRight, CheckCircle, Play } from "lucide-react";
import BrandMark from "../components/BrandMark";

const steps = [
  {
    icon: Upload,
    step: "01",
    title: "Upload your video",
    description:
      "Upload any Loom, Zoom, or screen recording up to 500MB. We support MP4, WebM, and MOV formats.",
  },
  {
    icon: Cpu,
    step: "02",
    title: "AI processes it",
    description:
      "We transcribe your audio, extract key frames, and use Claude Vision to understand every step of your workflow.",
  },
  {
    icon: Eye,
    step: "03",
    title: "Review & refine",
    description:
      "Edit the generated SKILL.md, tweak trigger phrases, reorder steps, and regenerate until it's perfect.",
  },
  {
    icon: Bot,
    step: "04",
    title: "Install & use",
    description:
      "Download as ZIP, publish to GitHub, copy a snippet, or share on the marketplace. Use it in any Claude project.",
  },
];

const features = [
  {
    title: "Whisper transcription",
    description: "Accurate audio transcription with word-level timestamps using faster-whisper.",
  },
  {
    title: "Vision analysis",
    description: "Claude analyzes every screen frame to understand exactly what tools and actions are used.",
  },
  {
    title: "Smart step synthesis",
    description: "Combines transcript and visual data to generate clean, reusable workflow steps.",
  },
  {
    title: "SKILL.md generation",
    description: "Produces Claude Code-compatible skill files with proper frontmatter and trigger phrases.",
  },
  {
    title: "One-click publishing",
    description: "Publish directly to your GitHub repo, the marketplace, or copy a CLAUDE.md snippet.",
  },
  {
    title: "Live editor",
    description: "Edit trigger phrases, steps, and content with a live preview of the final SKILL.md.",
  },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-800/50 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandMark size={30} label />
          </div>
          <div className="flex items-center gap-3">
            <a href="/marketplace" className="text-gray-400 hover:text-white text-sm transition-colors">
              Marketplace
            </a>
            <button
              onClick={() => navigate("/upload")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-300 hover:bg-yellow-200 text-black font-semibold transition-colors duration-150 shadow-[0_0_18px_-8px_rgba(255,201,42,0.85)] text-sm"
            >
              Get started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-24 pb-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/70 border border-red-700/60 text-yellow-200 text-sm mb-8">
            <span className="w-2 h-2 bg-yellow-300 rounded-full animate-pulse"></span>
            Powered by Claude Sonnet + Vision
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-display font-extrabold text-white mb-6 leading-tight tracking-tight">
            Turn your workflow videos
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-red-500 to-yellow-300">
              into Claude skills
            </span>
          </h1>
          <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            Upload a Loom or Zoom recording of your workflow. Get a production-ready{" "}
            <code className="text-yellow-200 bg-gray-900 px-1.5 py-0.5 rounded text-base">SKILL.md</code>{" "}
            file that teaches Claude exactly how to replicate it.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate("/upload")}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-yellow-300 hover:bg-yellow-200 text-black font-semibold transition-colors duration-150 shadow-lg shadow-yellow-700/25"
            >
              <Upload className="w-5 h-5" />
              Upload a video
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate("/marketplace")}
              className="btn-secondary text-base px-8 py-3"
            >
              <Play className="w-5 h-5" />
              Browse marketplace
            </button>
          </div>
          <p className="text-gray-600 text-sm mt-6">Free plan: 3 skills per month · No credit card required</p>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 border-t border-gray-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white mb-4">How it works</h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              From raw screen recording to a deployable Claude skill in under 3 minutes.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.step} className="relative">
                  <div className="card h-full flex flex-col">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-10 h-10 bg-red-950/70 rounded-lg flex items-center justify-center border border-red-800/60">
                        <Icon className="w-5 h-5 text-yellow-300" />
                      </div>
                      <span className="text-3xl font-black text-gray-800">{s.step}</span>
                    </div>
                    <h3 className="text-white font-semibold text-lg mb-2">{s.title}</h3>
                    <p className="text-gray-400 text-sm leading-relaxed flex-1">{s.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 border-t border-gray-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white mb-4">Everything you need</h2>
            <p className="text-gray-400 text-lg">
              The full pipeline from raw video to production-ready Claude skill.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="card flex gap-4">
                <CheckCircle className="w-5 h-5 text-yellow-300 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-white font-semibold mb-1">{f.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 border-t border-gray-800/50">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-4">
            Ready to build your first skill?
          </h2>
          <p className="text-gray-400 text-lg mb-8">
            Upload any workflow video and have a Claude skill ready in minutes.
          </p>
          <button
            onClick={() => navigate("/upload")}
            className="inline-flex items-center gap-2 px-10 py-4 rounded-lg bg-yellow-300 hover:bg-yellow-200 text-black font-semibold transition-colors duration-150 shadow-xl shadow-yellow-700/25"
          >
            <Upload className="w-5 h-5" />
            Upload a video — it's free
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800/50 py-8 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-gray-600 text-sm">
          <div className="flex items-center gap-2">
            <BrandMark size={18} />
            <span>SkillsClaw</span>
          </div>
          <p>Convert workflows to Claude skills</p>
        </div>
      </footer>
    </div>
  );
}
