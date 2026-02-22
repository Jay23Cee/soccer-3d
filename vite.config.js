import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // @react-three/cannon only declares `module`, which can fail resolution in Vitest SSR mode.
    alias: {
      "@react-three/cannon": path.resolve(
        __dirname,
        "node_modules/@react-three/cannon/dist/index.js"
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.js",
    exclude: ["e2e/**", "node_modules/**"],
  },
});
