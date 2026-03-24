/**
 * discover.js — Run this first to intercept culpa.info's API calls.
 * It opens culpa.info in a real browser, captures all network requests,
 * and prints any API endpoints it finds. Use this to identify the correct
 * API routes before running the full scraper.
 *
 * Usage: node discover.js
 */

import { chromium } from "playwright";

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

const apiCalls = [];

page.on("request", req => {
  const url = req.url();
  if (
    !url.includes("flytedesk") &&
    !url.includes("_next/static") &&
    !url.includes(".png") &&
    !url.includes(".ico") &&
    !url.includes(".css") &&
    (url.includes("/api/") || url.includes("culpa.info"))
  ) {
    console.log(`[${req.method()}] ${url}`);
    apiCalls.push({ method: req.method(), url });
  }
});

page.on("response", async res => {
  const url = res.url();
  if (url.includes("/api/") && url.includes("culpa.info")) {
    try {
      const body = await res.text();
      console.log(`\n--- RESPONSE: ${url} ---`);
      console.log(body.slice(0, 500));
      console.log("---\n");
    } catch (_) {}
  }
});

console.log("Opening culpa.info — search for a professor and watch the output...");
console.log("Press Ctrl+C when done.\n");

await page.goto("https://culpa.info");

// Keep running until user kills it
await new Promise(() => {});
