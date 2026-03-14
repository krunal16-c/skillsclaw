import axios, { type AxiosInstance } from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "";

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("access_token");
      window.location.href = "/";
    }
    return Promise.reject(error);
  }
);

// --- Auth ---
export interface User {
  id: string;
  email: string | null;
  github_username: string | null;
  name: string | null;
  avatar_url: string | null;
  plan: string;
  skills_this_month: number;
  stripe_customer_id: string | null;
}

export const getMe = async (): Promise<User> => {
  const res = await api.get("/api/auth/me");
  return res.data;
};

export const logout = async (): Promise<void> => {
  await api.post("/api/auth/logout");
  localStorage.removeItem("access_token");
};

// --- Upload ---
export interface PresignResponse {
  job_id: string;
  presigned_url: string;
  fields: Record<string, string>;
  r2_key: string;
}

export const presignUpload = async (
  filename: string,
  content_type: string,
  file_size: number
): Promise<PresignResponse> => {
  const res = await api.post("/api/upload/presign", {
    filename,
    content_type,
    file_size,
  });
  return res.data;
};

export const completeUpload = async (
  job_id: string
): Promise<{ job_id: string; status: string }> => {
  const res = await api.post("/api/upload/complete", { job_id });
  return res.data;
};

export const pasteText = async (
  text: string
): Promise<{ job_id: string; status: string }> => {
  const res = await api.post("/api/upload/paste", { text });
  return res.data;
};

// --- Jobs ---
export interface Job {
  id: string;
  user_id: string | null;
  r2_key: string;
  original_filename: string | null;
  file_size: number | null;
  duration_seconds: number | null;
  status: string;
  current_step: string | null;
  progress: number;
  transcript: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  frames_count: number;
  skill_id: string | null;
}

export const getJob = async (jobId: string): Promise<Job> => {
  const res = await api.get(`/api/jobs/${jobId}`);
  return res.data;
};

// --- Skills ---
export interface Skill {
  id: string;
  job_id: string;
  user_id: string | null;
  name: string;
  title: string;
  description: string;
  content: string;
  workflow_steps: WorkflowStep[] | null;
  trigger_phrases: string[] | null;
  visibility: string;
  published_at: string | null;
  github_repo_url: string | null;
  install_command: string | null;
  download_count: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStep {
  step_number: number;
  name: string;
  description: string;
  tool: string;
  command_or_action: string | null;
  input: string;
  output: string;
}

export const listSkills = async (): Promise<Skill[]> => {
  const res = await api.get("/api/skills");
  return res.data;
};

export const getSkill = async (skillId: string): Promise<Skill> => {
  const res = await api.get(`/api/skills/${skillId}`);
  return res.data;
};

export const updateSkill = async (
  skillId: string,
  updates: Partial<Pick<Skill, "name" | "title" | "description" | "content" | "trigger_phrases" | "workflow_steps">>
): Promise<Skill> => {
  const res = await api.patch(`/api/skills/${skillId}`, updates);
  return res.data;
};

export interface PublishRequest {
  delivery_method: "zip" | "github" | "snippet" | "marketplace";
}

export interface PublishResponse {
  skill_id: string;
  delivery_method: string;
  install_command: string | null;
  github_repo_url: string | null;
  snippet: string | null;
  download_url: string | null;
  marketplace_url: string | null;
}

export const publishSkill = async (
  skillId: string,
  data: PublishRequest
): Promise<PublishResponse> => {
  const res = await api.post(`/api/skills/${skillId}/publish`, data);
  return res.data;
};

export const getSkillSnippet = async (skillId: string): Promise<{ snippet: string }> => {
  const res = await api.post(`/api/skills/${skillId}/snippet`);
  return res.data;
};

export const regenerateSkill = async (skillId: string): Promise<Skill> => {
  const res = await api.post(`/api/skills/${skillId}/regenerate`);
  return res.data;
};

export const downloadSkill = (skillId: string): void => {
  const url = `${BASE_URL}/api/skills/${skillId}/download`;
  const a = document.createElement("a");
  a.href = url;
  a.setAttribute("download", "");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

// --- Marketplace ---
export interface MarketplaceSkill {
  id: string;
  name: string;
  title: string;
  description: string;
  trigger_phrases: string[] | null;
  install_command: string | null;
  download_count: number;
  published_at: string | null;
  user_github_username: string | null;
}

export const listMarketplace = async (
  q?: string,
  page = 1,
  limit = 20
): Promise<MarketplaceSkill[]> => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q) params.set("q", q);
  const res = await api.get(`/api/marketplace?${params}`);
  return res.data;
};

export const getMarketplaceSkill = async (skillId: string): Promise<MarketplaceSkill> => {
  const res = await api.get(`/api/marketplace/${skillId}`);
  return res.data;
};

export default api;
