import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

/**
 * TAP's provider-neutral build. TanStack owns routing and SSR; Nitro emits
 * the versioned Cloudflare Worker used in production.
 */
export default defineConfig(({ command }) => ({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
    tsconfigPaths: true,
    dedupe: ["react", "react-dom", "@tanstack/react-query", "@tanstack/query-core"],
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/*.server.*", "**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    command === "build"
      ? nitro({
          preset: "cloudflare-module",
          cloudflare: { nodeCompat: true, deployConfig: true },
        })
      : null,
    react(),
  ],
  server: { host: "::", port: 8080 },
}));
