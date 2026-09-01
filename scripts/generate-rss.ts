#!/usr/bin/env tsx
/**
 * pnpm content:rss
 *
 * Generates an RSS XML feed of the most recently published exams and question sets.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE_URL = process.env.APP_URL ?? "https://prepora.in";
const OUT = resolve(import.meta.dirname, "../apps/web/public");

// Mock Data - In the future, this will come from the DB
const recentUpdates = [
  {
    title: "Kerala PSC Assistant Engineer",
    link: `${BASE_URL}/exams/kerala-psc`,
    description: "Added highly requested Kerala PSC previous year question papers for Civil Engineering.",
    pubDate: new Date("2026-09-01T10:00:00Z").toUTCString(),
    guid: "exam-kerala-psc-20260901",
  },
  {
    title: "Microsoft Azure Administrator (AZ-104)",
    link: `${BASE_URL}/exams/azure-az-104`,
    description: "Updated Azure AZ-104 question banks with 2026 compliance and RBAC scenarios.",
    pubDate: new Date("2026-08-30T14:30:00Z").toUTCString(),
    guid: "exam-az-104-20260830",
  },
  {
    title: "ISTQB Certified Tester Foundation",
    link: `${BASE_URL}/exams/istqb-ctfl`,
    description: "Added 40 new questions for ISTQB Foundation level certification preparation.",
    pubDate: new Date("2026-08-28T09:15:00Z").toUTCString(),
    guid: "exam-istqb-ctfl-20260828",
  },
];

function generateRSS() {
  const items = recentUpdates
    .map(
      (item) => `
    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${item.link}</link>
      <description><![CDATA[${item.description}]]></description>
      <pubDate>${item.pubDate}</pubDate>
      <guid isPermaLink="false">${item.guid}</guid>
    </item>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>Prepora - Latest Updates</title>
    <link>${BASE_URL}</link>
    <description>Latest exams, question sets, and subjects added to the Prepora knowledge index.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${items}
  </channel>
</rss>`;
}

writeFileSync(`${OUT}/rss.xml`, generateRSS().trim());
console.log("✅ RSS feed generated at apps/web/public/rss.xml");
