import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useJobStatus } from "../lib/sse";
import ProcessingSteps from "../components/ProcessingSteps";

export default function JobStatus() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { status, progress, currentStep, error, skillId, isDone } = useJobStatus(id);

  useEffect(() => {
    if (isDone && status === "ready_for_review" && skillId) {
      navigate(`/skills/${skillId}/review`);
    }
  }, [isDone, status, skillId, navigate]);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate("/upload")}
          className="btn-ghost p-2"
          aria-label="Go back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-white font-semibold">Processing your video</h1>
          <p className="text-gray-500 text-xs font-mono mt-0.5">Job: {id}</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-lg">
          <div className="card">
            <div className="mb-6">
              <h2 className="text-white text-xl font-semibold mb-1">
                {status === "failed"
                  ? "Processing failed"
                  : status === "ready_for_review"
                  ? "Your skill is ready!"
                  : "Generating your skill..."}
              </h2>
              <p className="text-gray-400 text-sm">
                {status === "failed"
                  ? "Something went wrong. You can retry or upload a different video."
                  : status === "ready_for_review"
                  ? "Redirecting you to the review page..."
                  : "This usually takes 1–3 minutes depending on video length."}
              </p>
            </div>

            <ProcessingSteps
              status={status}
              progress={progress}
              currentStep={currentStep}
              error={error}
            />

            {status === "failed" && (
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => navigate("/upload")}
                  className="btn-secondary flex-1"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try again
                </button>
              </div>
            )}

            {status === "ready_for_review" && skillId && (
              <div className="mt-6">
                <button
                  onClick={() => navigate(`/skills/${skillId}/review`)}
                  className="btn-primary w-full justify-center"
                >
                  Review your skill
                </button>
              </div>
            )}
          </div>

          {/* Connection indicator */}
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-600">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
            Live updates via server-sent events
          </div>
        </div>
      </div>
    </div>
  );
}
