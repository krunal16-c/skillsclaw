import { CheckCircle, Circle, AlertCircle, Loader2, Upload, Mic, GitBranch, Zap } from "lucide-react";
import clsx from "clsx";

interface Step {
  id: string;
  label: string;
  icon: React.FC<{ className?: string }>;
}

const STEPS: Step[] = [
  { id: "pending",          label: "Uploading",              icon: Upload },
  { id: "processing",       label: "Extracting workflow",    icon: Mic },
  { id: "synthesizing",     label: "Building workflow steps",icon: GitBranch },
  { id: "generating_skill", label: "Generating skill",       icon: Zap },
];

const STATUS_ORDER = [
  "pending",
  "processing",
  "synthesizing",
  "generating_skill",
  "ready_for_review",
  "published",
];

type StepStatus = "pending" | "active" | "complete" | "error";

function getStepStatus(stepId: string, currentStatus: string | null, hasError: boolean): StepStatus {
  if (!currentStatus) return "pending";
  if (currentStatus === "failed" && hasError) return "error";

  const currentIdx = STATUS_ORDER.indexOf(currentStatus);
  const stepIdx = STATUS_ORDER.indexOf(stepId);
  if (currentIdx === -1) return "pending";

  if (stepIdx < currentIdx) return "complete";
  if (stepIdx === currentIdx) return "active";
  return "pending";
}

interface ProcessingStepsProps {
  status: string | null;
  progress: number;
  currentStep: string | null;
  error: string | null;
}

export default function ProcessingSteps({ status, progress, currentStep, error }: ProcessingStepsProps) {
  const hasError = status === "failed";

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-400 mb-2">
          <span>{currentStep || "Processing..."}</span>
          <span>{progress}%</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-2">
          <div
            className={clsx(
              "h-2 rounded-full transition-all duration-500",
              hasError ? "bg-red-500" : "bg-brand-500"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps list */}
      {STEPS.map((step, i) => {
        const stepStatus = getStepStatus(step.id, status, hasError);
        const Icon = step.icon;

        return (
          <div
            key={step.id}
            className={clsx(
              "flex items-center gap-4 p-3 rounded-xl transition-all duration-300",
              stepStatus === "active"   && "bg-brand-900/30 border border-brand-800/50",
              stepStatus === "error"    && "bg-red-900/30 border border-red-800/50",
              stepStatus === "complete" && "opacity-60",
              stepStatus === "pending"  && "opacity-40"
            )}
          >
            <div className="flex-shrink-0">
              {stepStatus === "complete" && <CheckCircle className="w-6 h-6 text-yellow-300" />}
              {stepStatus === "active"   && <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />}
              {stepStatus === "error"    && <AlertCircle className="w-6 h-6 text-red-400" />}
              {stepStatus === "pending"  && <Circle className="w-6 h-6 text-gray-600" />}
            </div>

            <div className="flex items-center gap-3 flex-1">
              <Icon
                className={clsx(
                  "w-4 h-4",
                  stepStatus === "active"   && "text-brand-300",
                  stepStatus === "complete" && "text-yellow-300",
                  stepStatus === "error"    && "text-red-400",
                  stepStatus === "pending"  && "text-gray-600"
                )}
              />
              <span
                className={clsx(
                  "text-sm font-medium",
                  stepStatus === "active"   && "text-brand-200",
                  stepStatus === "complete" && "text-gray-300",
                  stepStatus === "error"    && "text-red-300",
                  stepStatus === "pending"  && "text-gray-600"
                )}
              >
                {step.label}
              </span>
            </div>

            <span className="text-xs text-gray-700">{String(i + 1).padStart(2, "0")}</span>
          </div>
        );
      })}

      {hasError && error && (
        <div className="mt-4 p-4 bg-red-900/30 border border-red-800 rounded-xl">
          <p className="text-red-300 text-sm font-medium mb-1">Processing failed</p>
          <p className="text-red-400 text-xs font-mono">{error}</p>
        </div>
      )}
    </div>
  );
}
