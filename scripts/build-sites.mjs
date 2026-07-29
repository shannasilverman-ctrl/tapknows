import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const dist = resolve(root, "dist");
const server = resolve(dist, "server");

await rm(dist, { recursive: true, force: true });
await mkdir(server, { recursive: true });
await cp(resolve(root, ".output/server"), server, { recursive: true });
// Sites mounts static output from dist/client. Nitro calls the same directory
// "public", so adapt only the staging layout and leave the production build
// untouched.
await cp(resolve(root, ".output/public"), resolve(dist, "client"), { recursive: true });

// Sites recognizes this stable server entrypoint. The Nitro worker remains
// intact beside it, so its relative chunks and manifest resolve unchanged.
await writeFile(
  resolve(server, "index.js"),
  'export { default } from "./index.mjs";\nexport * from "./index.mjs";\n',
  "utf8",
);
