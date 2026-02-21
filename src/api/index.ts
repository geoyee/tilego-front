import axios from 'axios'
import type { ApiResponse, TaskInfo, HealthData, TaskIdData, DownloadParams } from '@/types'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const healthCheck = async (): Promise<ApiResponse<HealthData>> => {
  const response = await api.get('/api/health')
  return response.data
}

export const createDownloadTask = async (params: DownloadParams): Promise<ApiResponse<TaskIdData>> => {
  const response = await api.post('/api/download', params)
  return response.data
}

export const getTaskStatus = async (taskId: string): Promise<ApiResponse<TaskInfo>> => {
  const response = await api.get(`/api/status/${taskId}`)
  return response.data
}

export const stopTask = async (taskId: string): Promise<ApiResponse> => {
  const response = await api.post(`/api/stop/${taskId}`)
  return response.data
}

export const getTasks = async (): Promise<ApiResponse<TaskInfo[]>> => {
  const response = await api.get('/api/tasks')
  return response.data
}

export const deleteTask = async (taskId: string): Promise<ApiResponse> => {
  const response = await api.delete(`/api/delete/${taskId}`)
  return response.data
}

export default api
