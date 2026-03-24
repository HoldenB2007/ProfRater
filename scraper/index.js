/**
 * index.js — Main scraper entry point.
 *
 * Before running:
 * 1. Run `node discover.js` to find culpa.info's API endpoints
 * 2. Update API_BASE and the scraping logic below to match
 * 3. Copy .env.example to .env and fill in your Supabase credentials
 * 4. Run `npm install` then `node index.js`
 */

import { chromium } from "playwright";
import { upsertProfessor, upsertReviews } from "./db.js";

// TODO: update these after running discover.js
const CULPA_BASE = "https://culpa.info";
let API_BASE = null; // e.g. "https://culpa.info/api"

async function scrapeProfessors(page) {
  // Strategy: intercept API calls made by the SPA to discover endpoints,
  // then replay them to paginate through all professors.

  const discovered = new Set();

  page.on("request", req => {
    const url = req.url();
    if (url.includes("/api/") && url.includes("culpa")) {
      discovered.add(url);
      if (!API_BASE) {
        // Infer base from first API call seen
        const match = url.match(/(https?:\/\/[^/]+\/api)/);
        if (match) {
          API_BASE = match[1];
          console.log(`[discover] Found API base: ${API_BASE}`);
        }
      }
    }
  });

  console.log("Loading culpa.info to discover API...");
  await page.goto(`${CULPA_BASE}/search`);
  await page.waitForLoadState("networkidle");

  if (discovered.size > 0) {
    console.log("Discovered API calls:");
    for (const url of discovered) console.log(" ", url);
  } else {
    console.log("No API calls intercepted. Update this scraper manually after running discover.js");
    return [];
  }

  // TODO: once API_BASE is known, implement pagination here.
  // Example pattern (update to match actual API):
  //
  // const professors = [];
  // let page_num = 1;
  // while (true) {
  //   const res = await page.evaluate(async (url) => {
  //     const r = await fetch(url);
  //     return r.json();
  //   }, `${API_BASE}/professors?page=${page_num}`);
  //
  //   if (!res.professors?.length) break;
  //   professors.push(...res.professors);
  //   page_num++;
  // }
  // return professors;

  return [];
}

async function scrapeReviews(page, professorId) {
  // TODO: fetch reviews for a professor once API is known
  // Example:
  // return page.evaluate(async (url) => {
  //   const r = await fetch(url);
  //   const j = await r.json();
  //   return j.reviews || [];
  // }, `${API_BASE}/reviews?professor_id=${professorId}`);
  return [];
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment.");
    console.error("Copy .env.example to .env and fill in your credentials.");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const professors = await scrapeProfessors(page);
    console.log(`Found ${professors.length} professors`);

    for (const prof of professors) {
      try {
        const reviews = await scrapeReviews(page, prof.id);
        const dbId = await upsertProfessor(prof);
        await upsertReviews(dbId, reviews);
        console.log(`Saved: ${prof.first_name} ${prof.last_name}`);
      } catch (e) {
        console.error(`Failed: ${prof.first_name} ${prof.last_name}`, e.message);
      }
    }

    console.log("Done.");
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
