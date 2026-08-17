import { copyFile, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const publicDir = path.resolve(".output/public");
const pagesHtml = path.join(publicDir, "index.pages.html");
const indexHtml = path.join(publicDir, "index.html");
const notFoundHtml = path.join(publicDir, "404.html");

await rename(pagesHtml, indexHtml);
await copyFile(indexHtml, notFoundHtml);

const headersPath = path.join(publicDir, "_headers");
const headers = await readFile(headersPath, "utf8").catch(() => "");
if (!headers.includes("Access-Control-Allow-Origin")) {
  await writeFile(headersPath, headers);
}
