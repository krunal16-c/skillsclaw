import { useState, useCallback, useRef } from "react";
import { Plus, X, GripVertical } from "lucide-react";
import { updateSkill, type Skill, type WorkflowStep } from "../lib/api";
import toast from "react-hot-toast";

interface SkillEditorProps {
  skill: Skill;
  onChange: (updated: Skill) => void;
}

export default function SkillEditor({ skill, onChange }: SkillEditorProps) {
  const [saving, setSaving] = useState(false);
  const [newPhrase, setNewPhrase] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    async (updates: Partial<Skill>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setSaving(true);
        try {
          const updated = await updateSkill(skill.id, updates);
          onChange(updated);
        } catch {
          toast.error("Failed to save changes");
        } finally {
          setSaving(false);
        }
      }, 600);
    },
    [skill.id, onChange]
  );

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    onChange({ ...skill, name });
    save({ name });
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...skill, title: e.target.value });
    save({ title: e.target.value });
  };

  const addPhrase = () => {
    if (!newPhrase.trim()) return;
    const phrases = [...(skill.trigger_phrases || []), newPhrase.trim()];
    onChange({ ...skill, trigger_phrases: phrases });
    save({ trigger_phrases: phrases });
    setNewPhrase("");
  };

  const removePhrase = (idx: number) => {
    const phrases = (skill.trigger_phrases || []).filter((_, i) => i !== idx);
    onChange({ ...skill, trigger_phrases: phrases });
    save({ trigger_phrases: phrases });
  };

  const updateStep = (idx: number, field: keyof WorkflowStep, value: string) => {
    const steps = [...(skill.workflow_steps || [])] as WorkflowStep[];
    steps[idx] = { ...steps[idx], [field]: value };
    onChange({ ...skill, workflow_steps: steps });
    save({ workflow_steps: steps });
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-white font-semibold">Edit skill</h2>
        {saving && <span className="text-xs text-gray-500 animate-pulse">Saving...</span>}
      </div>

      {/* Skill name (slug) */}
      <div>
        <label className="label">Skill name (slug)</label>
        <input
          type="text"
          className="input font-mono text-sm"
          value={skill.name}
          onChange={handleNameChange}
          placeholder="my-workflow"
        />
        <p className="text-xs text-gray-600 mt-1">Lowercase letters, numbers, and hyphens only</p>
      </div>

      {/* Title */}
      <div>
        <label className="label">Display title</label>
        <input
          type="text"
          className="input"
          value={skill.title}
          onChange={handleTitleChange}
          placeholder="My Workflow"
        />
      </div>

      {/* Trigger phrases */}
      <div>
        <label className="label">Trigger phrases</label>
        <p className="text-xs text-gray-500 mb-3">
          Natural language phrases a user would say to activate this skill in Claude.
        </p>
        <div className="space-y-2 mb-3">
          {(skill.trigger_phrases || []).map((phrase, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
              <span className="text-gray-400 text-xs w-4">{idx + 1}.</span>
              <span className="flex-1 text-gray-200 text-sm">{phrase}</span>
              <button
                onClick={() => removePhrase(idx)}
                className="text-gray-600 hover:text-red-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            className="input text-sm flex-1"
            value={newPhrase}
            onChange={(e) => setNewPhrase(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPhrase()}
            placeholder="Add trigger phrase..."
          />
          <button onClick={addPhrase} className="btn-secondary px-3">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Workflow steps */}
      <div>
        <label className="label">Workflow steps</label>
        <p className="text-xs text-gray-500 mb-3">
          Edit individual steps. Changes are saved automatically.
        </p>
        <div className="space-y-3">
          {(skill.workflow_steps || []).map((step, idx) => (
            <div key={idx} className="bg-gray-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-gray-600" />
                <span className="text-brand-400 font-mono text-xs">Step {step.step_number}</span>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Name</label>
                <input
                  type="text"
                  className="input text-sm"
                  value={step.name}
                  onChange={(e) => updateStep(idx, "name", e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Description</label>
                <textarea
                  className="input text-sm resize-none"
                  rows={2}
                  value={step.description}
                  onChange={(e) => updateStep(idx, "description", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Tool</label>
                  <input
                    type="text"
                    className="input text-xs"
                    value={step.tool || ""}
                    onChange={(e) => updateStep(idx, "tool", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Command / Action</label>
                  <input
                    type="text"
                    className="input text-xs font-mono"
                    value={step.command_or_action || ""}
                    onChange={(e) => updateStep(idx, "command_or_action", e.target.value)}
                    placeholder="null"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
