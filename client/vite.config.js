import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev only: Vite serves the React app on 5173 and forwards API calls to the
// Express server on 3000, so the browser talks to a single origin (no CORS).
// In production, Express serves the built files from client/dist directly.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/healthz": "http://localhost:3000",
    },
  },
});
