/**
 * discover.js — Automatically navigates culpa.info and dumps page structure
 * so we can understand the DOM and build a proper scraper.
 */

import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Capture any API-like requests just in case
const requests = [];
page.on("request", req => {
  const url = req.url();
  if (!url.includes("flytedesk") && !url.match(/\.(png|ico|css|woff|jpg)$/)) {
    requests.push(`[${req.method()}] ${url}`);
  }
});

console.log("=== Loading culpa.info homepage ===");
await page.goto("https://culpa.info", { waitUntil: "networkidle" });
console.log("Title:", await page.title());
console.log("\n--- Page HTML (first 3000 chars) ---");
console.log((await page.content()).slice(0, 3000));

console.log("\n=== Navigating to /browse ===");
try {
  await page.goto("https://culpa.info/browse", { waitUntil: "networkidle" });
  console.log("Title:", await page.title());
  console.log("\n--- Browse page HTML (first 3000 chars) ---");
  console.log((await page.content()).slice(0, 3000));
} catch (e) {
  console.log("No /browse page:", e.message);
}

console.log("\n=== Trying search ===");
try {
  await page.goto("https://culpa.info/search?q=Blaer", { waitUntil: "networkidle" });
  console.log("Title:", await page.title());
  console.log("\n--- Search results HTML (first 3000 chars) ---");
  console.log((await page.content()).slice(0, 3000));
} catch (e) {
  console.log("No search page:", e.message);
}

console.log("\n=== Network requests captured ===");
requests.forEach(r => console.log(r));

await browser.close();
