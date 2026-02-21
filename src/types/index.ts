export interface BoundingBox {
  minLon: number
  minLat: number
  maxLon: number
  maxLat: number
}

export interface DownloadParams {
  id?: string
  url_template: string
  min_lon: number
  min_lat: number
  max_lon: number
  max_lat: number
  min_zoom: number
  max_zoom: number
  save_dir: string
  format: string
  threads: number
  timeout: number
  retries: number
  proxy_url: string
  user_agent: string
  referer: string
  skip_existing: boolean
  check_md5: boolean
  min_file_size: number
  max_file_size: number
  rate_limit: number
  use_http2: boolean
  keep_alive: boolean
  batch_size: number
  buffer_size: number
}

export type TaskStatus = 'pending' | 'running' | 'stopped' | 'complete' | 'failed'

export interface TaskInfo {
  id: string
  status: TaskStatus
  progress: number
  total: number
  success: number
  failed: number
  skipped: number
  bytes_total: number
  speed: number
  start_time: string
  end_time?: string
}

export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export interface HealthData {
  status: string
  time: string
}

export interface TaskIdData {
  task_id: string
}

export type ThemeMode = 'light' | 'dark'

export type Locale = 'zh-CN' | 'en-US'

export interface GeoJSONFeature {
  type: 'Feature'
  geometry: {
    type: string
    coordinates: number[] | number[][] | number[][][]
  }
  properties?: Record<string, unknown>
}

export interface GeoJSON {
  type: 'FeatureCollection' | 'Feature'
  features?: GeoJSONFeature[]
  geometry?: GeoJSONFeature['geometry']
}
