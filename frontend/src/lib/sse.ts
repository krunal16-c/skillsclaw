import { useState, useEffect, useRef } from "react";

export interface JobStatusEvent {
  job_id: string;
  status: string;
  current_step: string | null;
  progress: number;
  error: string | null;
  skill_id: string | null;
}

export interface UseJobStatusResult {
  status: string | null;
  progress: number;
  currentStep: string | null;
  error: string | null;
  skillId: string | null;
  isConnected: boolean;
  isDone: boolean;
}

const BASE_URL = import.meta.env.VITE_API_URL || "";

export function useJobStatus(jobId: string | null | undefined): UseJobStatusResult {
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skillId, setSkillId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  useEffect(() => {
    if (!jobId) return;

    const terminalStatuses = new Set(["ready_for_review", "published", "failed"]);

    function connect() {
      if (esRef.current) {
        esRef.current.close();
      }

      const url = `${BASE_URL}/api/jobs/${jobId}/status`;
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener("open", () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
      });

      es.addEventListener("status", (event: MessageEvent) => {
        try {
          const data: JobStatusEvent = JSON.parse(event.data);
          setStatus(data.status);
          setProgress(data.progress);
          setCurrentStep(data.current_step);
          setError(data.error);
          setSkillId(data.skill_id);

          if (terminalStatuses.has(data.status)) {
            setIsDone(true);
          }
        } catch {
          // ignore parse errors
        }
      });

      es.addEventListener("done", () => {
        setIsDone(true);
        es.close();
        setIsConnected(false);
      });

      es.addEventListener("error", () => {
        es.close();
        setIsConnected(false);

        if (!isDone) {
          const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 30000);
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      });
    }

    connect();

    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [jobId]);

  return { status, progress, currentStep, error, skillId, isConnected, isDone };
}
