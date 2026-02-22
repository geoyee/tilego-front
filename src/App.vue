<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from "vue";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import OSM from "ol/source/OSM";
import { Style, Fill, Stroke } from "ol/style";
import { Draw } from "ol/interaction";
import { fromExtent } from "ol/geom/Polygon";
import { transformExtent, transform } from "ol/proj";
import type { Feature } from "ol";
import type { Geometry, SimpleGeometry } from "ol/geom";
import type { Extent } from "ol/extent";
import type { Coordinate } from "ol/coordinate";
import {
  useMapStore,
  useSettingsStore,
  useTaskStore,
  useAppStore,
} from "@/stores";
import { useI18n } from "vue-i18n";
import type { BoundingBox, DownloadParams } from "@/types";
import { ElMessage, ElMessageBox } from "element-plus";
import KML from "ol/format/KML";
import GeoJSON from "ol/format/GeoJSON";
import { fileOpen } from "browser-fs-access";

interface UrlTemplate {
  id: string;
  name: string;
  url: string;
  createdAt: number;
}

const DB_NAME = "TileGoTemplates";
const DB_VERSION = 1;
const STORE_NAME = "templates";

const DEFAULT_TEMPLATES: UrlTemplate[] = [
  {
    id: "default-osm",
    name: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    createdAt: 0,
  },
  {
    id: "default-arcgis-imagery",
    name: "ArcGIS World Imagery",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    createdAt: 0,
  },
  {
    id: "default-arcgis-street",
    name: "ArcGIS World Street",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    createdAt: 0,
  },
  {
    id: "default-arcgis-topo",
    name: "ArcGIS World Topo",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    createdAt: 0,
  },
  {
    id: "default-carto-light",
    name: "CartoDB Positron",
    url: "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    createdAt: 0,
  },
];

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
};

const saveTemplate = async (template: UrlTemplate): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(template);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

const getAllTemplates = async (): Promise<UrlTemplate[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
};

const deleteTemplate = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

const clearAllTemplates = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

const mapStore = useMapStore();
const settingsStore = useSettingsStore();
const taskStore = useTaskStore();
const appStore = useAppStore();
const { t, locale } = useI18n();

const mapContainer = ref<HTMLElement | null>(null);
const map = ref<Map | null>(null);
const drawInteraction = ref<Draw | null>(null);
const vectorSource = ref<VectorSource<Feature<Geometry>>>(new VectorSource());
const vectorLayer = ref<VectorLayer<VectorSource<Feature<Geometry>>> | null>(
  null
);
const isDrawing = ref(false);

const activeTab = ref<"download" | "tasks" | "settings">("download");
const sidebarCollapsed = ref(false);

const templates = ref<UrlTemplate[]>([]);
const selectedTemplateId = ref<string>("");
const newTemplateName = ref("");
const urlTemplate = ref("");
const minZoom = ref(0);
const maxZoom = ref(18);
const fileName = ref("tiles");
const format = ref("zxy");
const threads = ref(10);
const timeout = ref(60);
const retries = ref(5);
const proxyUrl = ref("");
const userAgent = ref("");
const referer = ref("");
const skipExisting = ref(true);
const checkMd5 = ref(false);
const minFileSize = ref(100);
const maxFileSize = ref(2097152);
const rateLimit = ref(10);
const useHttp2 = ref(true);
const keepAlive = ref(true);
const batchSize = ref(1000);
const bufferSize = ref(8192);
const apiBaseUrl = ref("http://localhost:8765");

const selectionStyle = new Style({
  fill: new Fill({
    color: "rgba(33, 150, 243, 0.25)",
  }),
  stroke: new Stroke({
    color: "#2196F3",
    width: 2,
  }),
});

const initMap = () => {
  if (!mapContainer.value) return;

  vectorLayer.value = new VectorLayer({
    source: vectorSource.value,
    style: selectionStyle,
  });

  map.value = new Map({
    target: mapContainer.value,
    layers: [
      new TileLayer({
        source: new OSM(),
      }),
      vectorLayer.value,
    ],
    view: new View({
      center: transform([116.4, 39.9], "EPSG:4326", "EPSG:3857"),
      zoom: 5,
    }),
  });
};

const toggleDraw = () => {
  if (isDrawing.value) {
    stopDrawing();
  } else {
    startDrawing();
  }
};

const startDrawing = () => {
  if (!map.value) return;

  vectorSource.value.clear();
  mapStore.clearBoundingBox();

  drawInteraction.value = new Draw({
    source: vectorSource.value,
    type: "Circle",
    geometryFunction: (coordinates, geometryParam) => {
      const coords = coordinates as Coordinate[];
      let geom = geometryParam as SimpleGeometry | null;
      if (!geom) {
        geom = fromExtent([0, 0, 0, 0]);
      }
      const extent: Extent = [
        Math.min(coords[0][0], coords[1][0]),
        Math.min(coords[0][1], coords[1][1]),
        Math.max(coords[0][0], coords[1][0]),
        Math.max(coords[0][1], coords[1][1]),
      ];
      geom.setCoordinates([
        [
          extent.slice(0, 2),
          [extent[2], extent[1]],
          extent.slice(2),
          [extent[0], extent[3]],
          extent.slice(0, 2),
        ],
      ]);
      return geom;
    },
  });

  drawInteraction.value.on("drawend", (event) => {
    const geometry = event.feature.getGeometry();
    if (geometry) {
      const extent = geometry.getExtent();
      const transformedExtent = transformExtent(
        extent,
        "EPSG:3857",
        "EPSG:4326"
      );

      const box: BoundingBox = {
        minLon: parseFloat(transformedExtent[0].toFixed(6)),
        minLat: parseFloat(transformedExtent[1].toFixed(6)),
        maxLon: parseFloat(transformedExtent[2].toFixed(6)),
        maxLat: parseFloat(transformedExtent[3].toFixed(6)),
      };

      mapStore.setBoundingBox(box);
      stopDrawing();
    }
  });

  map.value.addInteraction(drawInteraction.value);
  isDrawing.value = true;
};

const stopDrawing = () => {
  if (map.value && drawInteraction.value) {
    map.value.removeInteraction(drawInteraction.value);
    drawInteraction.value = null;
  }
  isDrawing.value = false;
};

const clearSelection = () => {
  vectorSource.value.clear();
  mapStore.clearBoundingBox();
};

const loadFile = async () => {
  try {
    const file = await fileOpen({
      extensions: [".kml", ".json", ".geojson"],
    });
    const text = await file.text();
    const fileName = file.name.toLowerCase();

    let features: Feature<Geometry>[] = [];

    if (fileName.endsWith(".kml")) {
      const format = new KML();
      features = format.readFeatures(text, {
        featureProjection: "EPSG:3857",
      }) as Feature<Geometry>[];
    } else if (fileName.endsWith(".json") || fileName.endsWith(".geojson")) {
      const format = new GeoJSON();
      features = format.readFeatures(text, {
        featureProjection: "EPSG:3857",
      }) as Feature<Geometry>[];
    } else {
      ElMessage.error(t("message.fileLoadFailed"));
      return;
    }

    if (features.length > 0) {
      vectorSource.value.clear();
      vectorSource.value.addFeatures(features);

      const extent = vectorSource.value.getExtent();
      if (extent) {
        const transformedExtent = transformExtent(
          extent,
          "EPSG:3857",
          "EPSG:4326"
        );

        const box: BoundingBox = {
          minLon: parseFloat(transformedExtent[0].toFixed(6)),
          minLat: parseFloat(transformedExtent[1].toFixed(6)),
          maxLon: parseFloat(transformedExtent[2].toFixed(6)),
          maxLat: parseFloat(transformedExtent[3].toFixed(6)),
        };

        mapStore.setBoundingBox(box);
        map.value?.getView().fit(extent, { padding: [50, 50, 50, 50] });
      }
      ElMessage.success(t("message.fileLoadSuccess"));
    } else {
      ElMessage.error(t("message.fileLoadFailed"));
    }
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      ElMessage.error(t("message.fileLoadFailed"));
    }
  }
};

const formatOptions = [
  { value: "zxy", label: "Z/X/Y" },
  { value: "xyz", label: "X/Y/Z" },
  { value: "quadkey", label: "QuadKey" },
];

const estimatedTiles = computed(() => {
  if (!mapStore.boundingBox) return 0;

  let total = 0;
  const box = mapStore.boundingBox;

  for (let z = minZoom.value; z <= maxZoom.value; z++) {
    const n = Math.pow(2, z);
    const minX = Math.floor(((box.minLon + 180) / 360) * n);
    const maxX = Math.floor(((box.maxLon + 180) / 360) * n);
    const minY = Math.floor(
      ((1 -
        Math.log(
          Math.tan((box.maxLat * Math.PI) / 180) +
            1 / Math.cos((box.maxLat * Math.PI) / 180)
        ) /
          Math.PI) /
        2) *
        n
    );
    const maxY = Math.floor(
      ((1 -
        Math.log(
          Math.tan((box.minLat * Math.PI) / 180) +
            1 / Math.cos((box.minLat * Math.PI) / 180)
        ) /
          Math.PI) /
        2) *
        n
    );

    total += (maxX - minX + 1) * (maxY - minY + 1);
  }

  return total.toLocaleString();
});

const canStartDownload = computed(() => {
  return (
    mapStore.boundingBox &&
    urlTemplate.value &&
    urlTemplate.value.includes("{z}") &&
    urlTemplate.value.includes("{x}") &&
    urlTemplate.value.includes("{y}")
  );
});

const startDownload = async () => {
  if (!mapStore.boundingBox || !urlTemplate.value) {
    ElMessage.warning(t("message.invalidRange"));
    return;
  }

  if (
    !urlTemplate.value.includes("{z}") ||
    !urlTemplate.value.includes("{x}") ||
    !urlTemplate.value.includes("{y}")
  ) {
    ElMessage.warning(t("message.invalidUrl"));
    return;
  }

  const box = mapStore.boundingBox;

  if (box.minLon === box.maxLon || box.minLat === box.maxLat) {
    ElMessage.warning(
      t("message.invalidCoordinates") ||
        "经纬度范围无效，最小值和最大值不能相同"
    );
    return;
  }

  const params: DownloadParams = {
    url_template: urlTemplate.value,
    min_lon: box.minLon,
    min_lat: box.minLat,
    max_lon: box.maxLon,
    max_lat: box.maxLat,
    min_zoom: minZoom.value,
    max_zoom: maxZoom.value,
    save_dir: fileName.value,
    format: format.value,
    threads: threads.value,
    timeout: timeout.value,
    retries: retries.value,
    proxy_url: proxyUrl.value,
    user_agent: userAgent.value,
    referer: referer.value,
    skip_existing: skipExisting.value,
    check_md5: checkMd5.value,
    min_file_size: minFileSize.value,
    max_file_size: maxFileSize.value,
    rate_limit: rateLimit.value,
    use_http2: useHttp2.value,
    keep_alive: keepAlive.value,
    batch_size: batchSize.value,
    buffer_size: bufferSize.value,
  };

  const taskId = await taskStore.createTask(params);
  if (taskId) {
    startTaskPolling();
  }
};

const loadTemplates = async () => {
  const savedTemplates = await getAllTemplates();
  const combined = [
    ...DEFAULT_TEMPLATES,
    ...savedTemplates.filter((t) => !t.id.startsWith("default-")),
  ];
  templates.value = combined;
};

const handleSaveTemplate = async () => {
  if (!urlTemplate.value) {
    ElMessage.warning(t("message.invalidUrl"));
    return;
  }
  if (!newTemplateName.value.trim()) {
    ElMessage.warning(
      t("settings.templateNameRequired") || "Please enter template name"
    );
    return;
  }

  const template: UrlTemplate = {
    id: Date.now().toString(),
    name: newTemplateName.value.trim(),
    url: urlTemplate.value,
    createdAt: Date.now(),
  };

  await saveTemplate(template);
  await loadTemplates();
  newTemplateName.value = "";
  ElMessage.success(t("message.settingsSaved"));
};

const handleSelectTemplate = (id: string) => {
  const template = templates.value.find((t) => t.id === id);
  if (template) {
    urlTemplate.value = template.url;
    selectedTemplateId.value = id;
  }
};

const handleDeleteTemplate = async (id: string) => {
  if (id.startsWith("default-")) {
    ElMessage.warning(
      t("message.cannotDeleteDefault") || "Cannot delete default template"
    );
    return;
  }
  try {
    await ElMessageBox.confirm(t("message.confirmDelete"), {
      confirmButtonText: t("task.delete"),
      cancelButtonText: "Cancel",
      type: "warning",
    });
    await deleteTemplate(id);
    await loadTemplates();
    if (selectedTemplateId.value === id) {
      selectedTemplateId.value = "";
    }
  } catch {
    // User cancelled
  }
};

const handleClearAllTemplates = async () => {
  try {
    await ElMessageBox.confirm(t("message.confirmDelete"), {
      confirmButtonText: t("task.delete"),
      cancelButtonText: "Cancel",
      type: "warning",
    });
    await clearAllTemplates();
    await loadTemplates();
    selectedTemplateId.value = "";
    urlTemplate.value = "";
  } catch {
    // User cancelled
  }
};

const handleThemeChange = (theme: "light" | "dark") => {
  appStore.setTheme(theme);
};

const handleLocaleChange = (lang: "zh-CN" | "en-US") => {
  locale.value = lang;
  appStore.setAppLocale(lang);
};

const handleSaveApiUrl = async () => {
  appStore.setApiBaseUrl(apiBaseUrl.value);
  await appStore.checkBackendConnection();
};

const boundingBox = computed(() => mapStore.boundingBox);

let taskPollingInterval: ReturnType<typeof setInterval> | null = null;

const startTaskPolling = () => {
  if (taskPollingInterval) return;
  taskPollingInterval = setInterval(async () => {
    if (appStore.backendConnected) {
      await taskStore.fetchTasks(true);
      if (!taskStore.hasRunningTasks) {
        stopTaskPolling();
      }
    }
  }, 2000);
};

const stopTaskPolling = () => {
  if (taskPollingInterval) {
    clearInterval(taskPollingInterval);
    taskPollingInterval = null;
  }
};

watch(selectedTemplateId, (id) => {
  if (id) {
    handleSelectTemplate(id);
  }
});

watch(activeTab, (tab) => {
  if (tab === "tasks") {
    taskStore.fetchTasks();
  }
});

onMounted(async () => {
  initMap();
  loadTemplates();
  await appStore.loadPersistedSettings();
  await settingsStore.loadSavedParams();
  loadSavedSettings();
  appStore.initTheme();
  apiBaseUrl.value = appStore.apiBaseUrl;
  await appStore.checkBackendConnection();
  await taskStore.fetchTasks();
  if (taskStore.hasRunningTasks) {
    startTaskPolling();
  }
});

onUnmounted(() => {
  stopDrawing();
  stopTaskPolling();
  if (map.value) {
    map.value.setTarget(undefined);
  }
});

const loadSavedSettings = () => {
  settingsStore.loadSavedParams();
  const params = settingsStore.defaultParams;

  minZoom.value = params.min_zoom ?? 0;
  maxZoom.value = params.max_zoom ?? 18;
  fileName.value = params.save_dir ?? "tiles";
  format.value = params.format ?? "zxy";
  threads.value = params.threads ?? 10;
  timeout.value = params.timeout ?? 60;
  retries.value = params.retries ?? 5;
  proxyUrl.value = params.proxy_url ?? "";
  userAgent.value = params.user_agent ?? "";
  referer.value = params.referer ?? "";
  skipExisting.value = params.skip_existing ?? true;
  checkMd5.value = params.check_md5 ?? false;
  minFileSize.value = params.min_file_size ?? 100;
  maxFileSize.value = params.max_file_size ?? 2097152;
  rateLimit.value = params.rate_limit ?? 10;
  useHttp2.value = params.use_http2 ?? true;
  keepAlive.value = params.keep_alive ?? true;
  batchSize.value = params.batch_size ?? 1000;
  bufferSize.value = params.buffer_size ?? 8192;
};

const getTaskStatusType = (
  status: string
): "success" | "warning" | "info" | "danger" | "" => {
  const statusMap: Record<
    string,
    "success" | "warning" | "info" | "danger" | ""
  > = {
    pending: "info",
    running: "warning",
    stopped: "danger",
    complete: "success",
    failed: "danger",
  };
  return statusMap[status] || "info";
};

const capitalize = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const formatSpeed = (bytesPerSecond: number): string => {
  if (bytesPerSecond < 1024) {
    return `${bytesPerSecond.toFixed(2)} B/s`;
  } else if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`;
  } else {
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
  }
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes.toFixed(2)} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
};

const formatNumber = (num: number): number => {
  return Math.round(num);
};

const getDisplayProgress = (task: {
  progress: number;
  total: number;
  status: string;
}): number => {
  if (task.status === "complete") {
    return task.total;
  }
  return Math.min(task.progress, task.total);
};

const cancelTask = async (taskId: string) => {
  try {
    await taskStore.stopTaskAction(taskId);
    await taskStore.deleteTaskAction(taskId);
  } catch (error) {
    console.error("Failed to cancel task:", error);
  }
};
</script>

<template>
  <div class="main-layout" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <aside class="sidebar">
      <div class="sidebar-header">
        <span v-if="sidebarCollapsed" class="sidebar-title"></span>
        <span v-else class="sidebar-title-expanded">TileGo</span>
        <el-button
          :icon="sidebarCollapsed ? 'Expand' : 'Fold'"
          text
          @click="sidebarCollapsed = !sidebarCollapsed"
          class="collapse-btn"
        />
      </div>

      <el-collapse-transition>
        <div v-show="!sidebarCollapsed" class="sidebar-body">
          <el-tabs v-model="activeTab" class="sidebar-tabs">
            <el-tab-pane name="download" :label="t('nav.map')">
              <div class="panel-section">
                <div class="section-label">{{ t("download.urlTemplate") }}</div>
                <el-select
                  v-model="selectedTemplateId"
                  :placeholder="
                    t('settings.selectTemplate') || 'Select template'
                  "
                  clearable
                  style="width: 100%; margin-bottom: 8px"
                >
                  <el-option
                    v-for="tpl in templates"
                    :key="tpl.id"
                    :label="tpl.name"
                    :value="tpl.id"
                  >
                    <div class="template-option">
                      <span>{{ tpl.name }}</span>
                      <el-button
                        v-if="!tpl.id.startsWith('default-')"
                        type="danger"
                        size="small"
                        text
                        @click.stop="handleDeleteTemplate(tpl.id)"
                      >
                        <el-icon><Delete /></el-icon>
                      </el-button>
                    </div>
                  </el-option>
                </el-select>
                <el-input
                  v-model="urlTemplate"
                  :placeholder="t('download.urlTemplatePlaceholder')"
                  clearable
                  style="margin-bottom: 8px"
                />
                <div class="save-template-row">
                  <el-input
                    v-model="newTemplateName"
                    :placeholder="t('settings.templateName') || 'Template name'"
                    style="flex: 1"
                  />
                  <el-button type="primary" @click="handleSaveTemplate">
                    <el-icon><Plus /></el-icon>
                  </el-button>
                </div>
              </div>

              <div class="panel-section">
                <div class="section-label">{{ t("map.selectRange") }}</div>
                <div class="tool-row">
                  <el-button
                    :type="isDrawing ? 'primary' : 'default'"
                    @click="toggleDraw"
                    style="flex: 1"
                  >
                    <el-icon><Edit /></el-icon>
                    {{ isDrawing ? "..." : t("map.drawBox") }}
                  </el-button>
                  <el-button @click="loadFile" style="flex: 1">
                    <el-icon><FolderOpened /></el-icon>
                    {{ t("map.loadFile") }}
                  </el-button>
                  <el-button type="danger" @click="clearSelection">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>

              <div class="panel-section">
                <div class="section-label">{{ t("map.currentExtent") }}</div>
                <div class="extent-grid" v-if="boundingBox">
                  <div class="extent-item">
                    <span class="label">{{ t("map.minLon") }}</span>
                    <span class="value">{{ boundingBox.minLon }}</span>
                  </div>
                  <div class="extent-item">
                    <span class="label">{{ t("map.maxLon") }}</span>
                    <span class="value">{{ boundingBox.maxLon }}</span>
                  </div>
                  <div class="extent-item">
                    <span class="label">{{ t("map.minLat") }}</span>
                    <span class="value">{{ boundingBox.minLat }}</span>
                  </div>
                  <div class="extent-item">
                    <span class="label">{{ t("map.maxLat") }}</span>
                    <span class="value">{{ boundingBox.maxLat }}</span>
                  </div>
                </div>
                <div class="extent-placeholder" v-else>
                  {{ t("map.selectArea") }}
                </div>
              </div>

              <div class="panel-section">
                <div class="section-label">{{ t("download.zoomRange") }}</div>
                <div class="zoom-row">
                  <el-input-number
                    v-model="minZoom"
                    :min="0"
                    :max="22"
                    :precision="0"
                    :step="1"
                    size="small"
                    style="width: 80px"
                  />
                  <span class="sep">-</span>
                  <el-input-number
                    v-model="maxZoom"
                    :min="0"
                    :max="22"
                    :precision="0"
                    :step="1"
                    size="small"
                    style="width: 80px"
                  />
                  <div class="estimated">
                    <el-icon><Grid /></el-icon>
                    {{ estimatedTiles }}
                  </div>
                </div>
              </div>

              <div class="panel-section">
                <div class="section-label">{{ t("download.fileName") }}</div>
                <el-input
                  v-model="fileName"
                  :placeholder="t('download.fileNamePlaceholder')"
                  size="small"
                />
              </div>

              <div class="panel-section">
                <div class="section-label">{{ t("download.format") }}</div>
                <el-select v-model="format" size="small" style="width: 100%">
                  <el-option
                    v-for="opt in formatOptions"
                    :key="opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </div>

              <el-collapse class="advanced-collapse">
                <el-collapse-item :title="t('download.advancedSettings')">
                  <div class="advanced-grid">
                    <div class="adv-item">
                      <span class="adv-label">{{ t("download.threads") }}</span>
                      <el-input-number
                        v-model="threads"
                        :min="1"
                        :max="100"
                        :precision="0"
                        :step="1"
                        size="small"
                      />
                    </div>
                    <div class="adv-item">
                      <span class="adv-label">{{ t("download.timeout") }}</span>
                      <el-input-number
                        v-model="timeout"
                        :min="1"
                        :max="300"
                        :precision="0"
                        :step="1"
                        size="small"
                      />
                    </div>
                    <div class="adv-item">
                      <span class="adv-label">{{ t("download.retries") }}</span>
                      <el-input-number
                        v-model="retries"
                        :min="0"
                        :max="20"
                        :precision="0"
                        :step="1"
                        size="small"
                      />
                    </div>
                    <div class="adv-item">
                      <span class="adv-label">{{
                        t("download.rateLimit")
                      }}</span>
                      <el-input-number
                        v-model="rateLimit"
                        :min="1"
                        :max="100"
                        :precision="0"
                        :step="1"
                        size="small"
                      />
                    </div>
                  </div>
                  <div class="adv-row">
                    <div class="adv-label" style="margin-bottom: 4px">
                      {{ t("download.proxyUrl") }}
                    </div>
                    <el-input
                      v-model="proxyUrl"
                      :placeholder="t('download.proxyUrlPlaceholder')"
                      size="small"
                    />
                    <div class="adv-hint">{{ t("download.proxyUrlHint") }}</div>
                  </div>
                  <div class="adv-checkboxes">
                    <el-checkbox v-model="skipExisting" size="small">{{
                      t("download.skipExisting")
                    }}</el-checkbox>
                    <el-checkbox v-model="checkMd5" size="small">{{
                      t("download.checkMd5")
                    }}</el-checkbox>
                  </div>
                </el-collapse-item>
              </el-collapse>

              <div class="start-btn-wrapper">
                <el-button
                  type="primary"
                  :disabled="!canStartDownload"
                  @click="startDownload"
                  class="start-btn"
                >
                  <el-icon><Download /></el-icon>
                  {{ t("download.startDownload") }}
                </el-button>
              </div>
            </el-tab-pane>

            <el-tab-pane name="tasks" :label="t('nav.tasks')">
              <div class="panel-section">
                <div class="task-header">
                  <span class="section-label">{{ t("task.title") }}</span>
                  <el-button size="small" @click="taskStore.fetchTasks">
                    <el-icon><Refresh /></el-icon>
                  </el-button>
                </div>
              </div>

              <div v-if="taskStore.loading" class="task-loading">
                <el-icon class="is-loading"><Loading /></el-icon>
                <span>{{ t("task.loading") || "Loading..." }}</span>
              </div>

              <div v-else-if="taskStore.tasks.length === 0" class="task-empty">
                {{ t("task.noTasks") }}
              </div>

              <div v-else class="task-list">
                <div
                  v-for="task in taskStore.tasks"
                  :key="task.id"
                  class="task-item"
                >
                  <div class="task-header-row">
                    <span class="task-id">{{ task.id }}</span>
                    <el-tag :type="getTaskStatusType(task.status)" size="small">
                      {{ t(`task.status${capitalize(task.status)}`) }}
                    </el-tag>
                  </div>
                  <div class="task-progress">
                    <el-progress
                      :percentage="
                        task.status === 'complete'
                          ? 100
                          : task.total > 0
                          ? Math.min(
                              100,
                              Math.round(
                                (getDisplayProgress(task) / task.total) * 100
                              )
                            )
                          : 0
                      "
                      :status="
                        task.status === 'complete'
                          ? 'success'
                          : task.status === 'failed'
                          ? 'exception'
                          : ''
                      "
                      :stroke-width="6"
                    />
                  </div>
                  <div class="task-stats">
                    <span
                      >{{ t("task.progress") }}:
                      {{ formatNumber(getDisplayProgress(task)) }}/{{
                        formatNumber(task.total)
                      }}</span
                    >
                    <span
                      >{{ t("task.success") }}:
                      {{ formatNumber(task.success) }}</span
                    >
                    <span
                      >{{ t("task.failed") }}:
                      {{ formatNumber(task.failed) }}</span
                    >
                    <span
                      >{{ t("task.skipped") }}:
                      {{ formatNumber(task.skipped) }}</span
                    >
                    <span v-if="task.bytes_total > 0"
                      >{{ t("task.size") }}:
                      {{ formatBytes(task.bytes_total) }}</span
                    >
                  </div>
                  <div v-if="task.speed > 0" class="task-speed">
                    {{ t("task.speed") }}: {{ formatSpeed(task.speed) }}
                  </div>
                  <div class="task-actions">
                    <el-button
                      v-if="
                        task.status === 'running' || task.status === 'pending'
                      "
                      type="danger"
                      size="small"
                      style="width: 100%"
                      @click="cancelTask(task.id)"
                    >
                      <el-icon><Close /></el-icon>
                      {{ t("task.cancel") }}
                    </el-button>
                    <el-button
                      v-else
                      type="danger"
                      size="small"
                      style="width: 100%"
                      @click="taskStore.deleteTaskAction(task.id)"
                    >
                      <el-icon><Delete /></el-icon>
                      {{ t("task.delete") }}
                    </el-button>
                  </div>
                </div>
              </div>
            </el-tab-pane>

            <el-tab-pane name="settings" :label="t('nav.settings')">
              <div class="panel-section">
                <div class="section-label">{{ t("settings.theme") }}</div>
                <el-radio-group
                  v-model="appStore.theme"
                  @change="handleThemeChange"
                >
                  <el-radio-button value="light">{{
                    t("settings.lightMode")
                  }}</el-radio-button>
                  <el-radio-button value="dark">{{
                    t("settings.darkMode")
                  }}</el-radio-button>
                </el-radio-group>
              </div>

              <div class="panel-section">
                <div class="section-label">{{ t("settings.language") }}</div>
                <el-radio-group
                  :model-value="locale"
                  @change="handleLocaleChange"
                >
                  <el-radio-button value="zh-CN">{{
                    t("settings.chinese")
                  }}</el-radio-button>
                  <el-radio-button value="en-US">{{
                    t("settings.english")
                  }}</el-radio-button>
                </el-radio-group>
              </div>

              <div class="panel-section">
                <div class="section-label">{{ t("settings.apiAddress") }}</div>
                <el-input
                  v-model="apiBaseUrl"
                  :placeholder="t('settings.apiAddressPlaceholder')"
                  size="small"
                  style="margin-bottom: 8px"
                />
                <el-button
                  type="primary"
                  size="small"
                  @click="handleSaveApiUrl"
                  style="width: 100%"
                >
                  {{ t("settings.save") }}
                </el-button>
                <div
                  class="connection-status"
                  :class="{
                    connected: appStore.backendConnected,
                    disconnected: !appStore.backendConnected,
                  }"
                >
                  <el-icon :size="12">
                    <CircleCheck v-if="appStore.backendConnected" />
                    <CircleClose v-else />
                  </el-icon>
                  <span>{{
                    appStore.backendConnected
                      ? t("settings.connected")
                      : t("settings.disconnected")
                  }}</span>
                </div>
              </div>

              <div class="panel-section">
                <div class="section-label">
                  {{ t("settings.clearTemplates") || "Clear Templates" }}
                </div>
                <el-button
                  type="danger"
                  @click="handleClearAllTemplates"
                  style="width: 100%"
                >
                  <el-icon><Delete /></el-icon>
                  {{ t("settings.clearTemplates") || "Clear All Templates" }}
                </el-button>
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </el-collapse-transition>
    </aside>

    <main class="map-area">
      <div ref="mapContainer" class="map-container"></div>
    </main>
  </div>
</template>

<style scoped>
.main-layout {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.sidebar {
  width: 320px;
  min-width: 320px;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-light);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease, min-width 0.3s ease;
}

.main-layout.sidebar-collapsed .sidebar {
  width: 56px;
  min-width: 56px;
}

.sidebar-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-light);
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 44px;
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.sidebar-title-expanded {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.collapse-btn {
  padding: 8px;
}

.sidebar-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sidebar-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.sidebar-tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 12px;
}

.sidebar-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.sidebar-tabs :deep(.el-tab-pane) {
  height: 100%;
}

.panel-section {
  margin-bottom: 16px;
}

.section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.template-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.save-template-row {
  display: flex;
  gap: 8px;
}

.save-template-row .el-input,
.save-template-row .el-button {
  height: 32px;
}

.save-template-row .el-button {
  min-width: 32px;
  padding: 0 12px;
}

.tool-row {
  display: flex;
  gap: 8px;
}

.tool-row .el-button {
  height: 32px;
  padding: 0 12px;
}

.extent-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  background: var(--el-fill-color-light);
  padding: 10px;
  border-radius: 6px;
}

.extent-item {
  display: flex;
  flex-direction: column;
}

.extent-item .label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.extent-item .value {
  font-size: 12px;
  font-weight: 500;
  font-family: monospace;
}

.extent-placeholder {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  text-align: center;
  padding: 16px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}

.zoom-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.zoom-row .el-input-number {
  width: 80px;
  height: 32px;
}

.zoom-row .sep {
  color: var(--el-text-color-secondary);
}

.zoom-row .estimated {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-color-primary);
  font-weight: 500;
}

.panel-section .el-input,
.panel-section .el-select {
  height: 32px;
}

.panel-section .el-input :deep(.el-input__wrapper),
.panel-section .el-select :deep(.el-select__wrapper) {
  min-height: 32px;
}

.advanced-collapse {
  margin-bottom: 12px;
  border: none;
}

.advanced-collapse :deep(.el-collapse-item__header) {
  font-size: 12px;
  height: 36px;
}

.advanced-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.adv-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.adv-item .el-input-number {
  width: 100%;
  height: 32px;
}

.adv-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.adv-row {
  margin-bottom: 8px;
}

.adv-row .el-input {
  height: 32px;
}

.adv-hint {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  margin-top: 4px;
  line-height: 1.4;
}

.adv-checkboxes {
  display: flex;
  gap: 16px;
}

.start-btn-wrapper {
  margin-top: 16px;
  padding-bottom: 24px;
}

.start-btn {
  width: 100%;
  height: 40px;
  font-size: 14px;
}

.map-area {
  flex: 1;
  min-width: 0;
  position: relative;
}

.map-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

.panel-section .el-radio-group {
  display: flex;
}

.panel-section .el-radio-button {
  flex: 1;
}

.panel-section .el-radio-button :deep(.el-radio-button__inner) {
  width: 100%;
  height: 32px;
  line-height: 30px;
  padding: 0 12px;
}

.panel-section .el-button {
  height: 32px;
}

.connection-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 10px;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
}

.connection-status.connected {
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}

.connection-status.disconnected {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.task-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--el-text-color-secondary);
}

.task-empty {
  text-align: center;
  padding: 24px;
  color: var(--el-text-color-placeholder);
  background: var(--el-fill-color-light);
  border-radius: 6px;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-item {
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
}

.task-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.task-id {
  font-family: monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.task-progress {
  margin-bottom: 8px;
}

.task-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.task-speed {
  font-size: 11px;
  color: var(--el-color-primary);
  margin-bottom: 8px;
}

.task-actions {
  display: flex;
  gap: 8px;
}

.task-actions .el-button {
  flex: 1;
}
</style>
