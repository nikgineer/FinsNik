// vite.config.ts
import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";

type CompressionFactory = (typeof import("vite-plugin-compression"))["default"];

let compressionFactory: CompressionFactory | null = null;

try {
  const compressionModule = await import("vite-plugin-compression");
  compressionFactory = compressionModule.default;
} catch {
  compressionFactory = null;
}

const createCompressionPlugins = (): PluginOption[] => {
  if (!compressionFactory) {
    return [];
  }

  return [
    compressionFactory({
      algorithm: "brotliCompress",
      ext: ".br",
      deleteOriginFile: false,
    }),
    compressionFactory({
      algorithm: "gzip",
      ext: ".gz",
      deleteOriginFile: false,
    }),
  ];
};

export default defineConfig(({ mode }) => {
  const isProduction = mode === "production";

  const plugins: PluginOption[] = [react()];

  if (isProduction) {
    plugins.push(...createCompressionPlugins());
  }

  return {
    plugins,
    base: "/",
    build: {
      outDir: "dist",
      target: "es2018",
      cssCodeSplit: true,
      modulePreload: {
        polyfill: false,
      },
      minify: "esbuild",
      reportCompressedSize: false,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          // Allow Rollup to determine the optimal chunk graph automatically.
        },
      },
    },
    esbuild: {
      drop: isProduction ? ["console", "debugger"] : [],
      legalComments: "none",
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-router-dom",
        "framer-motion",
        "recharts",
      ],
    },
  };
});
