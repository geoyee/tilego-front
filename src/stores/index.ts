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

const t = (key: string) => i18n.global.t(key);

export const useAppStore = defineStore("app", () => {
  const theme = ref<ThemeMode>(
    (localStorage.getItem("theme") as ThemeMode) || "light"
  );
  const locale = ref<Locale>(
    (localStorage.getItem("locale") as Locale) || "zh-CN"
  );
  const apiBaseUrl = ref<string>(
    localStorage.getItem("apiBaseUrl") || "http://localhost:8765"
  );
  const backendConnected = ref(false);

  const isDark = computed(() => theme.value === "dark");

  const setTheme = (newTheme: ThemeMode) => {
    theme.value = newTheme;
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
  };

  const setAppLocale = (newLocale: Locale) => {
    locale.value = newLocale;
    i18n.global.locale.value = newLocale;
    localStorage.setItem("locale", newLocale);
  };

  const setApiBaseUrl = (url: string) => {
    apiBaseUrl.value = url;
    localStorage.setItem("apiBaseUrl", url);
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
  };
});

export const useTaskStore = defineStore("task", () => {
  const tasks = ref<TaskInfo[]>([]);
  const loading = ref(false);
  const currentTaskId = ref<string | null>(null);

  const fetchTasks = async () => {
    loading.value = true;
    try {
      const result = await getTasks();
      if (result.success && result.data) {
        tasks.value = result.data;
      }
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
    } finally {
      loading.value = false;
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
    save_dir: "./tiles",
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

  const loadSavedParams = () => {
    const saved = localStorage.getItem("downloadParams");
    if (saved) {
      try {
        defaultParams.value = { ...defaultParams.value, ...JSON.parse(saved) };
      } catch (e) {
        console.error("Failed to load saved params:", e);
      }
    }
  };

  const saveParams = () => {
    localStorage.setItem("downloadParams", JSON.stringify(defaultParams.value));
  };

  const resetParams = () => {
    defaultParams.value = {
      min_zoom: 0,
      max_zoom: 18,
      save_dir: "./tiles",
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
    localStorage.removeItem("downloadParams");
  };

  return {
    defaultParams,
    loadSavedParams,
    saveParams,
    resetParams,
  };
});
