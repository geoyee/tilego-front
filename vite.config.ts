import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

function transformHtmlPlugin(): Plugin {
  return {
    name: "transform-html",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const fileName in bundle) {
        if (fileName.endsWith(".html")) {
          const htmlFile = bundle[fileName];
          if (
            htmlFile.type === "asset" &&
            typeof htmlFile.source === "string"
          ) {
            let source = htmlFile.source;
            source = source.replace(/\s*type="module"\s*/g, " ");
            source = source.replace(/\s*crossorigin\s*/g, " ");
            const scriptMatch = source.match(
              /<script[^>]*src="[^"]*"[^>]*><\/script>/i
            );
            if (scriptMatch) {
              source = source.replace(scriptMatch[0], "");
              source = source.replace("</body>", scriptMatch[0] + "</body>");
            }
            htmlFile.source = source;
          }
        }
      }
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [vue(), transformHtmlPlugin()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:8765",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    minify: false,
    modulePreload: false,
    rollupOptions: {
      output: {
        format: "iife",
        manualChunks: undefined,
        chunkFileNames: "js/[name]-[hash].js",
        entryFileNames: "js/[name]-[hash].js",
        assetFileNames: "[ext]/[name]-[hash].[ext]",
      },
    },
    chunkSizeWarningLimit: 2000,
  },
});
