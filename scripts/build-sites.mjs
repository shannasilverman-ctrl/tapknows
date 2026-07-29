import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const dist = resolve(root, "dist");
const server = resolve(dist, "server");

await rm(dist, { recursive: true, force: true });
await mkdir(server, { recursive: true });
await cp(resolve(root, ".output/server"), server, { recursive: true });
await cp(resolve(root, ".output/public"), resolve(dist, "static"), { recursive: true });

// Sites recognizes this stable server entrypoint. The Nitro worker remains
// intact beside it, so its relative chunks and manifest resolve unchanged.
await writeFile(
  resolve(server, "index.js"),
  'export { default } from "./index.mjs";\nexport * from "./index.mjs";\n',
  "utf8",
);
