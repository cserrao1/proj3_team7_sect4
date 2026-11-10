import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// GLM-OCR runs outside the browser (Ollama, vLLM, ...). The app calls /ocr/... and this
// dev server forwards it, which avoids CORS problems and keeps any API key off the page.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ""); // "" = also read variables without a VITE_ prefix
  const ocrProxy = {
    "/ocr": {
      target: env.OCR_URL || "http://localhost:11434", // Ollama's default address
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/ocr/, ""),
      timeout: 10 * 60 * 1000, // scanning can be slow on CPU-only machines
      proxyTimeout: 10 * 60 * 1000,
      configure(proxy) {
        proxy.on("proxyReq", (proxyReq) => {
          proxyReq.removeHeader("origin");
          if (env.OCR_API_KEY) proxyReq.setHeader("Authorization", `Bearer ${env.OCR_API_KEY}`);
        });
      },
    },
  };

  // The API server (npm run server) runs next to Vite; /api/... is forwarded to it.
  const apiProxy = {
    "/api": { target: `http://127.0.0.1:${env.API_PORT || 3001}`, changeOrigin: true },
  };
  const proxy = { ...ocrProxy, ...apiProxy };

  return {
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
    // Pre-bundle the two big libraries at startup so Vite doesn't reload the page the first time
    // you upload a PDF or an Excel file.
    optimizeDeps: {
      include: ["pdfjs-dist", "xlsx"],
      esbuildOptions: { target: "esnext" },
    },
    build: { target: "esnext" },
  };
});
