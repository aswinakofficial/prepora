import fs from 'node:fs';
import path from 'node:path';

const ROUTES = [
  { url: '/', filename: 'home.html' },
  { url: '/search?q=test', filename: 'search.html' },
  { url: '/exams', filename: 'exams.html' },
  { url: '/exams/kerala-psc', filename: 'exam-hub.html' },
  { url: '/question-sets/unit-modulus-elasticity', filename: 'question-sets.html' }
];

async function captureRoute(route) {
  console.log(`Fetching HTML from http://localhost:3000${route.url}...`);
  const res = await fetch(`http://localhost:3000${route.url}`);
  let html = await res.text();

  // Find all stylesheet link hrefs
  const linkRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
  const hrefs = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    hrefs.push(match[1]);
  }

  console.log('Found stylesheets:', hrefs);

  let stylesCombined = '';
  for (const href of hrefs) {
    const cssUrl = href.startsWith('http') ? href : `http://localhost:3000${href.startsWith('/') ? '' : '/'}${href}`;
    console.log(`Fetching CSS from ${cssUrl}...`);
    try {
      const cssRes = await fetch(cssUrl);
      if (cssRes.ok) {
        const cssText = await cssRes.text();
        stylesCombined += `\n/* Stylesheet: ${href} */\n` + cssText + '\n';
      }
    } catch (e) {
      console.warn(`Failed to fetch CSS: ${href}`, e.message);
    }
  }

  // Also read local globals.css as fallback if needed
  try {
    const globalsCssPath = path.resolve('apps/web/app/styles/globals.css');
    if (fs.existsSync(globalsCssPath)) {
      const globalsCss = fs.readFileSync(globalsCssPath, 'utf8');
      stylesCombined += '\n/* Local globals.css */\n' + globalsCss + '\n';
    }
  } catch (e) {
    console.warn('Failed to read local globals.css', e);
  }

  // Strip script tags to ensure clean static snapshot
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Inject inlined style block before </head>
  const styleBlock = `<style>\n${stylesCombined}\n</style>`;
  if (html.includes('</head>')) {
    html = html.replace('</head>', `${styleBlock}\n</head>`);
  } else {
    html = `${styleBlock}\n${html}`;
  }

  // Ensure output directory exists
  fs.mkdirSync('.stitch', { recursive: true });
  const outputPath = `.stitch/${route.filename}`;
  fs.writeFileSync(outputPath, html, 'utf8');
  console.log(`✅ Extracted snapshot written to ${outputPath} (${html.length} bytes)`);
}

async function main() {
  for (const route of ROUTES) {
    try {
      await captureRoute(route);
    } catch (e) {
      console.error(`Failed to capture ${route.url}:`, e);
    }
  }
}

main().catch((err) => {
  console.error('Extraction failed:', err);
  process.exit(1);
});
