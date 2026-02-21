import axios from "axios";
import type {
  ApiResponse,
  TaskInfo,
  HealthData,
  TaskIdData,
  DownloadParams,
} from "@/types";

const getBaseUrl = () => {
  return localStorage.getItem("apiBaseUrl") || "http://localhost:8765";
};

const api = axios.create({
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  config.baseURL = getBaseUrl();
  return config;
});

export const healthCheck = async (): Promise<ApiResponse<HealthData>> => {
  const response = await api.get("/api/health");
  return response.data;
};

export const createDownloadTask = async (
  params: DownloadParams
): Promise<ApiResponse<TaskIdData>> => {
  const response = await api.post("/api/download", params);
  return response.data;
};

export const getTaskStatus = async (
  taskId: string
): Promise<ApiResponse<TaskInfo>> => {
  const response = await api.get(`/api/status/${taskId}`);
  return response.data;
};

export const stopTask = async (taskId: string): Promise<ApiResponse> => {
  const response = await api.post(`/api/stop/${taskId}`);
  return response.data;
};

export const getTasks = async (): Promise<ApiResponse<TaskInfo[]>> => {
  const response = await api.get("/api/tasks");
  return response.data;
};

export const deleteTask = async (taskId: string): Promise<ApiResponse> => {
  const response = await api.delete(`/api/delete/${taskId}`);
  return response.data;
};

export default api;
