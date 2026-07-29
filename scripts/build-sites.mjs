import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const dist = resolve(root, "dist");
const server = resolve(dist, "server");

if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    "Sites builds require VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY so the client can hydrate.",
  );
}

await rm(dist, { recursive: true, force: true });
await mkdir(server, { recursive: true });
await cp(resolve(root, ".output/server"), server, { recursive: true });
// Sites mounts static output from dist/client. Nitro calls the same directory
// "public", so adapt only the staging layout and leave the production build
// untouched.
await cp(resolve(root, ".output/public"), resolve(dist, "client"), { recursive: true });
await writeFile(resolve(dist, "client", ".assetsignore"), "wrangler.json\n.dev.vars\n", "utf8");

const wranglerPath = resolve(server, "wrangler.json");
const wrangler = JSON.parse(await readFile(wranglerPath, "utf8"));
wrangler.assets = {
  ...(wrangler.assets ?? {}),
  directory: "../client",
};
await writeFile(wranglerPath, `${JSON.stringify(wrangler, null, 2)}\n`, "utf8");

// Sites recognizes this stable server entrypoint. The Nitro worker remains
// intact beside it, so its relative chunks and manifest resolve unchanged.
await writeFile(
  resolve(server, "index.js"),
  'export { default } from "./index.mjs";\nexport * from "./index.mjs";\n',
  "utf8",
);
