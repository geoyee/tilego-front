# tilego-front

地图瓦片下载器前端，基于 Vue 3 + OpenLayers 构建的瓦片下载管理界面。

## 项目结构

```
tilego-front/
├── src/
│   ├── api/                    # API 请求层
│   ├── locales/                # 国际化语言包
│   ├── stores/                 # Pinia 状态管理
│   ├── types/                  # TypeScript 类型定义
│   ├── App.vue                 # 主应用组件
│   ├── main.ts                 # 应用入口
│   └── style.css               # 全局样式
├── index.html
├── vite.config.ts              # Vite 配置
├── package.json
└── README.md
```

## 功能特性

- **地图交互**：基于 OpenLayers 的地图显示和交互
  - 框选下载范围
  - 加载 KML/GeoJSON 文件
  - OSM 底图显示

- **下载管理**
  - 预设 URL 模板（OpenStreetMap、ArcGIS、CartoDB 等）
  - 自定义模板保存与管理
  - 缩放级别范围设置
  - 预估瓦片数量计算
  - 高级参数配置（并发数、超时、重试、代理等）

- **界面特性**
  - 中英文国际化支持
  - 浅色/深色主题切换
  - 响应式布局设计
  - 可折叠侧边栏

## 快速开始

### 环境要求

- Node.js >= 20.19.0 或 >= 22.12.0
- npm 或 yarn

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

前端界面将运行在 http://localhost:3000

### 生产构建

```bash
npm run build
```

构建产物将输出到 `dist/` 目录。

### 预览构建结果

```bash
npm run preview
```

## 配置说明

### 后端服务地址

本项目需要配合 [tilego](https://github.com/geoyee/tilego) 后端服务使用。默认连接 `http://localhost:8765`，可在设置页面修改。

### API 接口

| 接口 | 方法 | 描述 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/download` | POST | 创建下载任务 |
| `/api/status/{id}` | GET | 查询任务状态 |
| `/api/stop/{id}` | POST | 停止任务 |
| `/api/tasks` | GET | 获取任务列表 |
| `/api/delete/{id}` | DELETE | 删除任务 |
