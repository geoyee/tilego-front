import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
  TaskInfo,
  ThemeMode,
  Locale,
  BoundingBox,
  DownloadParams,
} from "@/types";
import {
  getTasks,
  getTaskStatus,
  createDownloadTask,
  stopTask,
  deleteTask,
  healthCheck,
} from "@/api";
import i18n from "@/locales";
import { ElMessage } from "element-plus";
import {
  saveSettings,
  loadSettings,
  clearSettings,
  type PersistedSettings,
} from "@/utils/storage";

const t = (key: string) => i18n.global.t(key);

export const useAppStore = defineStore("app", () => {
  const theme = ref<ThemeMode>("light");
  const locale = ref<Locale>("zh-CN");
  const apiBaseUrl = ref<string>("http://localhost:8765");
  const backendConnected = ref(false);

  const isDark = computed(() => theme.value === "dark");

  const setTheme = async (newTheme: ThemeMode) => {
    theme.value = newTheme;
    document.documentElement.classList.toggle("dark", newTheme === "dark");
    await saveSettings({ theme: newTheme });
  };

  const setAppLocale = async (newLocale: Locale) => {
    locale.value = newLocale;
    i18n.global.locale.value = newLocale;
    await saveSettings({ locale: newLocale });
  };

  const setApiBaseUrl = async (url: string) => {
    apiBaseUrl.value = url;
    await saveSettings({ apiBaseUrl: url });
  };

  const checkBackendConnection = async () => {
    try {
      const result = await healthCheck();
      backendConnected.value = result.success;
      if (result.success) {
        ElMessage.success(t("message.connectionSuccess"));
      }
    } catch {
      backendConnected.value = false;
      ElMessage.error(t("message.connectionFailed"));
    }
  };

  const initTheme = () => {
    document.documentElement.classList.toggle("dark", theme.value === "dark");
  };

  const loadPersistedSettings = async () => {
    const settings = await loadSettings();
    theme.value = settings.theme as ThemeMode;
    locale.value = settings.locale as Locale;
    apiBaseUrl.value = settings.apiBaseUrl;
    i18n.global.locale.value = settings.locale as Locale;
    return settings;
  };

  return {
    theme,
    locale,
    apiBaseUrl,
    backendConnected,
    isDark,
    setTheme,
    setAppLocale,
    setApiBaseUrl,
    checkBackendConnection,
    initTheme,
    loadPersistedSettings,
  };
});

export const useTaskStore = defineStore("task", () => {
  const tasks = ref<TaskInfo[]>([]);
  const loading = ref(false);
  const currentTaskId = ref<string | null>(null);

  const fetchTasks = async (silent = false) => {
    if (!silent) {
      loading.value = true;
    }
    try {
      const result = await getTasks();
      if (result.success && result.data) {
        tasks.value = result.data;
      }
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
    } finally {
      if (!silent) {
        loading.value = false;
      }
    }
  };

  const fetchTaskStatus = async (taskId: string) => {
    try {
      const result = await getTaskStatus(taskId);
      if (result.success && result.data) {
        const index = tasks.value.findIndex((t) => t.id === taskId);
        if (index >= 0) {
          tasks.value[index] = result.data;
        } else {
          tasks.value.push(result.data);
        }
        return result.data;
      }
    } catch (error) {
      console.error("Failed to fetch task status:", error);
    }
    return null;
  };

  const createTask = async (params: DownloadParams) => {
    try {
      const result = await createDownloadTask(params);
      if (result.success) {
        ElMessage.success(t("message.taskCreated"));
        await fetchTasks();
        return result.data?.task_id || null;
      }
    } catch (error) {
      console.error("Failed to create task:", error);
    }
    return null;
  };

  const stopTaskAction = async (taskId: string) => {
    try {
      const result = await stopTask(taskId);
      if (result.success) {
        ElMessage.success(t("message.taskStopped"));
        await fetchTaskStatus(taskId);
      }
    } catch (error) {
      console.error("Failed to stop task:", error);
    }
  };

  const deleteTaskAction = async (taskId: string) => {
    try {
      const result = await deleteTask(taskId);
      if (result.success) {
        ElMessage.success(t("message.taskDeleted"));
        tasks.value = tasks.value.filter((t) => t.id !== taskId);
      }
    } catch (error) {
      console.error("Failed to delete task:", error);
    }
  };

  const runningTasks = computed(() =>
    tasks.value.filter((t) => t.status === "running")
  );
  const hasRunningTasks = computed(() => runningTasks.value.length > 0);

  return {
    tasks,
    loading,
    currentTaskId,
    runningTasks,
    hasRunningTasks,
    fetchTasks,
    fetchTaskStatus,
    createTask,
    stopTaskAction,
    deleteTaskAction,
  };
});

export const useMapStore = defineStore("map", () => {
  const boundingBox = ref<BoundingBox | null>(null);
  const selectedFormat = ref<string>("zxy");

  const setBoundingBox = (box: BoundingBox | null) => {
    boundingBox.value = box;
  };

  const clearBoundingBox = () => {
    boundingBox.value = null;
  };

  const hasValidSelection = computed(() => boundingBox.value !== null);

  return {
    boundingBox,
    selectedFormat,
    setBoundingBox,
    clearBoundingBox,
    hasValidSelection,
  };
});

export const useSettingsStore = defineStore("settings", () => {
  const defaultParams = ref<Partial<DownloadParams>>({
    min_zoom: 0,
    max_zoom: 18,
    save_dir: "tiles",
    format: "zxy",
    threads: 10,
    timeout: 60,
    retries: 5,
    proxy_url: "",
    user_agent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    referer: "",
    skip_existing: true,
    check_md5: false,
    min_file_size: 100,
    max_file_size: 2097152,
    rate_limit: 10,
    use_http2: true,
    keep_alive: true,
    batch_size: 1000,
    buffer_size: 8192,
  });

  const loadSavedParams = async () => {
    const settings = await loadSettings();
    defaultParams.value = {
      min_zoom: settings.minZoom,
      max_zoom: settings.maxZoom,
      save_dir: settings.fileName,
      format: settings.format,
      threads: settings.threads,
      timeout: settings.timeout,
      retries: settings.retries,
      proxy_url: settings.proxyUrl,
      user_agent: settings.userAgent,
      referer: settings.referer,
      skip_existing: settings.skipExisting,
      check_md5: settings.checkMd5,
      min_file_size: settings.minFileSize,
      max_file_size: settings.maxFileSize,
      rate_limit: settings.rateLimit,
      use_http2: settings.useHttp2,
      keep_alive: settings.keepAlive,
      batch_size: settings.batchSize,
      buffer_size: settings.bufferSize,
    };
  };

  const saveParamsToStorage = async () => {
    await saveSettings({
      minZoom: defaultParams.value.min_zoom,
      maxZoom: defaultParams.value.max_zoom,
      fileName: defaultParams.value.save_dir,
      format: defaultParams.value.format,
      threads: defaultParams.value.threads,
      timeout: defaultParams.value.timeout,
      retries: defaultParams.value.retries,
      proxyUrl: defaultParams.value.proxy_url,
      userAgent: defaultParams.value.user_agent,
      referer: defaultParams.value.referer,
      skipExisting: defaultParams.value.skip_existing,
      checkMd5: defaultParams.value.check_md5,
      minFileSize: defaultParams.value.min_file_size,
      maxFileSize: defaultParams.value.max_file_size,
      rateLimit: defaultParams.value.rate_limit,
      useHttp2: defaultParams.value.use_http2,
      keepAlive: defaultParams.value.keep_alive,
      batchSize: defaultParams.value.batch_size,
      bufferSize: defaultParams.value.buffer_size,
    });
  };

  const resetParams = async () => {
    defaultParams.value = {
      min_zoom: 0,
      max_zoom: 18,
      save_dir: "tiles",
      format: "zxy",
      threads: 10,
      timeout: 60,
      retries: 5,
      proxy_url: "",
      user_agent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      referer: "",
      skip_existing: true,
      check_md5: false,
      min_file_size: 100,
      max_file_size: 2097152,
      rate_limit: 10,
      use_http2: true,
      keep_alive: true,
      batch_size: 1000,
      buffer_size: 8192,
    };
    await clearSettings();
  };

  return {
    defaultParams,
    loadSavedParams,
    saveParamsToStorage,
    resetParams,
  };
});
