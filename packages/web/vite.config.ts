import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// API/WS proxy target: localhost for `npm run dev` on the host,
// http://server:8080 inside the dev compose stack (VITE_API_TARGET).
const apiTarget = process.env.VITE_API_TARGET || "http://localhost:8080";

export default defineConfig({
  base: "./", // relative asset paths so the app works under any mount path
  plugins: [react()],
  server: {
    proxy: {
      "/api": apiTarget,
      "/plugins": apiTarget,
      "/ws": { target: apiTarget.replace(/^http/, "ws"), ws: true },
    },
  },
  build: { chunkSizeWarningLimit: 1200 },
});
