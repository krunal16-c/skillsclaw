import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Upload as UploadIcon, Film, FileText, ClipboardList, AlertCircle, ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import { presignUpload, completeUpload, pasteText } from "../lib/api";

function parseS3UploadError(status: number, statusText: string, responseText: string): string {
  if (!responseText) return `Upload failed (${status}): ${statusText || "Unknown error"}`;

  // MinIO/S3 often returns XML with <Code> and <Message>.
  try {
    const code = responseText.match(/<Code>([^<]+)<\/Code>/)?.[1];
    const message = responseText.match(/<Message>([^<]+)<\/Message>/)?.[1];
    if (code || message) {
      return `Upload failed (${status}): ${message || code}`;
    }
  } catch {
    // Fall through to generic message.
  }

  return `Upload failed (${status}): ${statusText || "Unknown error"}`;
}

// Video / audio
const MAX_VIDEO_SIZE = 500 * 1024 * 1024;
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "audio/mpeg", "audio/mp4"];
const VIDEO_EXTS = [".mp4", ".webm", ".mov", ".avi", ".mp3", ".m4a"];

// SOP documents
const MAX_SOP_SIZE = 20 * 1024 * 1024;
const SOP_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
];
const SOP_EXTS = [".pdf", ".docx", ".txt", ".md"];

type Tab = "video" | "sop" | "paste";

export default function Upload() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("video");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pasteContent, setPasteContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Shared file upload logic (video or SOP)
  const handleFile = useCallback(
    async (file: File, type: "video" | "sop") => {
      setError(null);

      const maxSize = type === "video" ? MAX_VIDEO_SIZE : MAX_SOP_SIZE;
      const allowedTypes = type === "video" ? VIDEO_TYPES : SOP_TYPES;
      const allowedExts = type === "video" ? VIDEO_EXTS : SOP_EXTS;
      const ext = "." + file.name.split(".").pop()?.toLowerCase();

      if (file.size > maxSize) {
        const limitMb = Math.round(maxSize / 1024 / 1024);
        setError(`File too large. Maximum ${limitMb}MB.`);
        return;
      }
      if (file.type && !allowedTypes.includes(file.type)) {
        setError(`Unsupported MIME type '${file.type}'. Allowed: ${allowedTypes.join(", ")}`);
        return;
      }
      if (!allowedExts.includes(ext)) {
        setError(`Unsupported format. Allowed: ${allowedExts.join(", ")}`);
        return;
      }

      setUploading(true);
      setUploadProgress(0);

      try {
        const contentType = file.type || (type === "video" ? "video/mp4" : "application/pdf");
        const presignData = await presignUpload(file.name, contentType, file.size);
        setUploadProgress(5);

        const formData = new FormData();
        Object.entries(presignData.fields || {}).forEach(([k, v]) => {
          formData.append(k, v as string);
        });
        formData.append("file", file);

        const xhr = new XMLHttpRequest();
        await new Promise<void>((resolve, reject) => {
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              setUploadProgress(Math.round((e.loaded / e.total) * 85) + 5);
            }
          });
          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
              return;
            }
            reject(new Error(parseS3UploadError(xhr.status, xhr.statusText, xhr.responseText)));
          });
          xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
          xhr.open("POST", presignData.presigned_url);
          xhr.send(formData);
        });

        setUploadProgress(92);
        await completeUpload(presignData.job_id);
        setUploadProgress(100);

        toast.success("Upload complete! Processing started.");
        navigate(`/jobs/${presignData.job_id}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setError(message);
        toast.error(message);
        setUploading(false);
        setUploadProgress(0);
      }
    },
    [navigate]
  );

  const handlePasteSubmit = useCallback(async () => {
    setError(null);
    const text = pasteContent.trim();
    if (text.length < 50) {
      setError("Please paste at least 50 characters of workflow description.");
      return;
    }
    setUploading(true);
    try {
      const { job_id } = await pasteText(text);
      toast.success("Processing started.");
      navigate(`/jobs/${job_id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to submit text";
      setError(message);
      toast.error(message);
      setUploading(false);
    }
  }, [pasteContent, navigate]);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, type: "video" | "sop") => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file, type);
    },
    [handleFile]
  );

  const TABS: { id: Tab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: "video", label: "Video / Audio", icon: Film },
    { id: "sop",   label: "SOP Document",  icon: FileText },
    { id: "paste", label: "Paste Text",    icon: ClipboardList },
  ];

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate("/")} className="btn-ghost p-2" aria-label="Go back">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-white font-semibold text-lg">Create a skill</h1>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl space-y-6">

          {/* Tab switcher */}
          <div className="flex gap-1 bg-gray-900 p-1 rounded-xl border border-gray-800">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { setTab(id); setError(null); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
                  tab === id
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {/* --- Video / Audio tab --- */}
          {tab === "video" && (
            <>
              <DropZone
                dragOver={dragOver}
                uploading={uploading}
                uploadProgress={uploadProgress}
                onDragOver={() => setDragOver(true)}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => handleDrop(e, "video")}
                onBrowse={() => document.getElementById("video-input")?.click()}
                accept={VIDEO_EXTS.join(",")}
                inputId="video-input"
                onFileChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f, "video"); }}
                title={dragOver ? "Drop your video here" : "Drop your workflow video or audio"}
                extensions={VIDEO_EXTS}
                maxLabel="Max 500MB"
              />
              <TipBox tips={[
                "Narrate your actions as you work — audio quality drives skill quality",
                "Keep recordings focused on a single workflow end-to-end",
                "Aim for 2–10 minutes for best results",
                "Loom, Zoom, QuickTime, and OBS recordings all work great",
              ]} />
            </>
          )}

          {/* --- SOP Document tab --- */}
          {tab === "sop" && (
            <>
              <DropZone
                dragOver={dragOver}
                uploading={uploading}
                uploadProgress={uploadProgress}
                onDragOver={() => setDragOver(true)}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => handleDrop(e, "sop")}
                onBrowse={() => document.getElementById("sop-input")?.click()}
                accept={SOP_EXTS.join(",")}
                inputId="sop-input"
                onFileChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f, "sop"); }}
                title={dragOver ? "Drop your document here" : "Drop your SOP document"}
                extensions={SOP_EXTS}
                maxLabel="Max 20MB"
              />
              <TipBox tips={[
                "Works with existing runbooks, SOPs, checklists, and how-to docs",
                "The more detailed the document, the more precise the skill",
                "Word documents and PDFs extract text automatically",
              ]} />
            </>
          )}

          {/* --- Paste Text tab --- */}
          {tab === "paste" && (
            <div className="space-y-4">
              <div className="card">
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Paste your workflow description or SOP
                </label>
                <textarea
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  placeholder="Describe the workflow step-by-step, or paste your existing SOP / runbook text here..."
                  rows={12}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl p-4 text-gray-200 text-sm
                             placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  disabled={uploading}
                />
                <div className="flex justify-between items-center mt-3">
                  <span className={`text-xs ${pasteContent.length < 50 ? "text-gray-600" : "text-gray-400"}`}>
                    {pasteContent.length} / 100,000 characters {pasteContent.length < 50 && "(minimum 50)"}
                  </span>
                  <button
                    onClick={handlePasteSubmit}
                    disabled={uploading || pasteContent.trim().length < 50}
                    className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {uploading ? "Processing..." : "Generate Skill"}
                  </button>
                </div>
              </div>
              <TipBox tips={[
                "Write in plain language — no special formatting needed",
                "Include the tools, commands, and order of operations",
                "Copy-paste from Notion, Confluence, or any doc that describes how you work",
              ]} />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-900/30 border border-red-800 rounded-xl flex gap-3 text-red-300">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- sub-components ----

interface DropZoneProps {
  dragOver: boolean;
  uploading: boolean;
  uploadProgress: number;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onBrowse: () => void;
  accept: string;
  inputId: string;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  title: string;
  extensions: string[];
  maxLabel: string;
}

function DropZone({
  dragOver, uploading, uploadProgress,
  onDragOver, onDragLeave, onDrop, onBrowse,
  accept, inputId, onFileChange, title, extensions, maxLabel,
}: DropZoneProps) {
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => !uploading && onBrowse()}
      className={`
        relative border-2 border-dashed rounded-2xl p-16 text-center transition-all duration-200
        ${dragOver ? "border-brand-500 bg-brand-900/20" : "border-gray-700 hover:border-gray-600 bg-gray-900/50"}
        ${uploading ? "pointer-events-none opacity-75" : "cursor-pointer"}
      `}
    >
      <input
        id={inputId}
        type="file"
        accept={accept}
        className="hidden"
        onChange={onFileChange}
        disabled={uploading}
      />
      <div className="flex flex-col items-center gap-4">
        {uploading ? (
          <>
            <div className="w-16 h-16 rounded-2xl bg-brand-900/50 flex items-center justify-center">
              <UploadIcon className="w-8 h-8 text-brand-400 animate-pulse" />
            </div>
            <div className="w-full max-w-xs">
              <div className="flex justify-between text-sm text-gray-400 mb-2">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className="bg-brand-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center">
              <UploadIcon className="w-8 h-8 text-gray-400" />
            </div>
            <div>
              <p className="text-white text-xl font-semibold mb-2">{title}</p>
              <p className="text-gray-400">or click to browse</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {extensions.map((ext) => (
                <span key={ext} className="badge-gray">{ext.toUpperCase()}</span>
              ))}
              <span className="badge-gray">{maxLabel}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TipBox({ tips }: { tips: string[] }) {
  return (
    <div className="card">
      <h3 className="text-white font-semibold mb-3">Tips for best results</h3>
      <ul className="space-y-2 text-sm text-gray-400">
        {tips.map((tip, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-brand-400">•</span>
            {tip}
          </li>
        ))}
      </ul>
    </div>
  );
}
