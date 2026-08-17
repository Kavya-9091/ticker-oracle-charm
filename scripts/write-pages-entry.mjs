import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const publicDir = path.resolve(".output/public");
const assetsDir = path.join(publicDir, "assets");
const files = await readdir(assetsDir);

const css = files.find((file) => file.startsWith("styles-") && file.endsWith(".css"));
const entry = files.find((file) => file.startsWith("index-") && file.endsWith(".js"));
const routes = files.find((file) => file.startsWith("routes-") && file.endsWith(".js"));

if (!css || !entry || !routes) {
  throw new Error("Could not find built CSS and JavaScript assets for GitHub Pages.");
}

const headers = await readFile(path.join(publicDir, "_headers"), "utf8").catch(() => "");
const base = "/ticker-oracle-charm/";
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tickerscope - Live Stock Prices & Company Financials</title>
    <meta name="description" content="Enter any stock symbol to see stock prices, charts, financial metrics, and AI research." />
    <link rel="icon" href="${base}favicon.ico" />
    <link rel="stylesheet" href="${base}assets/${css}" />
    <script>
      window.__TSR_SSR__ = false;
    </script>
    <script type="module" crossorigin src="${base}assets/${entry}"></script>
    <link rel="modulepreload" crossorigin href="${base}assets/${routes}" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

await writeFile(path.join(publicDir, "index.html"), html);
await writeFile(path.join(publicDir, "404.html"), html);
if (!headers.includes("Access-Control-Allow-Origin")) {
  await writeFile(path.join(publicDir, "_headers"), headers);
}
