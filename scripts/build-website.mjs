// Makes the foodalise.com website (the website/ folder) from the app's own legal
// pages in lib/legal.ts, so the website and the app always say the same thing.
// The App Store links to foodalise.com/privacy.
//
//   node scripts/build-website.mjs
//
// Run it after changing lib/legal.ts, and commit the website/ folder with it.
// Cloudflare Pages serves website/ as it is: no build step there.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'website');

// lib/legal.ts has no imports, so it can be turned into plain JavaScript and run here.
const source = readFileSync(join(root, 'lib/legal.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const legal = {};
new Function('exports', outputText)(legal);
const { CONTACT_EMAIL, OPERATOR, PRIVACY, TERMS, REVIEWS_POLICY } = legal;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Email addresses and ico.org.uk become links.
const linkify = (s) => esc(s)
  .replace(/([\w.+-]+@[\w-]+\.[\w.]+[a-z])/g, '<a href="mailto:$1">$1</a>')
  .replace(/\b(ico\.org\.uk)\b/g, '<a href="https://ico.org.uk">$1</a>');

// The Foodalise symbol (components/Logo.tsx), white loop on dark.
const SYMBOL = `<svg class="symbol" viewBox="-173 -75 346 150" role="img" aria-label="Foodalise">
<path d="M0,0 C-30,-40 -52,-63 -95,-63 C-135,-63 -161,-35 -161,0 C-161,35 -135,63 -95,63 C-52,63 -30,40 0,0 C30,-40 52,-63 95,-63 C135,-63 161,-35 161,0 C161,35 135,63 95,63 C52,63 30,40 0,0" fill="none" stroke="#FFFFFF" stroke-width="22" stroke-linejoin="round"/>
<circle cx="-82" cy="0" r="26" fill="#FFFFFF"/><circle cx="-71" cy="0" r="13.5" fill="#141414"/>
<circle cx="75.5" cy="-8" r="15.5" fill="#E5402F"/>
<path d="M94,-7 Q116,-14.5 122,-37 Q100,-29.5 94,-7 Z" fill="#2FA54F"/>
<path d="M84.5,7.5 A17.5,17.5 0 0 1 119.5,7.5 Z" fill="#FFC233"/>
<path d="M55,7.5 L130,7.5 A37.5,31 0 0 1 55,7.5 Z" fill="#FFFFFF"/>
</svg>`;

const year = new Date().getFullYear();
const shell = ({ title, description, body, depth }) => {
  const up = depth ? '../' : '';
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" href="${up}favicon.png">
<link rel="apple-touch-icon" href="${up}icon.png">
<link rel="stylesheet" href="${up}style.css">
</head>
<body>
<header><a class="brand" href="${up || './'}">${SYMBOL}<span>Foodalise</span></a></header>
<main>
${body}
</main>
<footer>
<nav><a href="${up}privacy/">Privacy policy</a><a href="${up}terms/">Terms of Use</a><a href="${up}reviews-policy/">Reviews policy</a><a href="mailto:${esc(CONTACT_EMAIL)}">Contact</a></nav>
<p>&copy; ${year} ${esc(OPERATOR)}. Restaurant data from the Food Standards Agency under the Open Government Licence v3.0.</p>
</footer>
</body>
</html>
`;
};

const home = shell({
  title: 'Foodalise: rate the dish, not just the restaurant',
  description: 'Photograph, score and share the dishes you eat at restaurants across the UK.',
  depth: 0,
  body: `<section class="hero">
<h1>Rate the dish, not just the restaurant.</h1>
<p class="lead">Foodalise is where you photograph, score and share the dishes you eat at restaurants across the UK. See what's actually good before you order.</p>
<ul class="points">
<li><strong>Score every dish</strong> for taste, looks and value.</li>
<li><strong>Find the best dishes near you</strong>, not just the best restaurants.</li>
<li><strong>Keep a food diary</strong> and a list of what you want to try next.</li>
</ul>
<p class="soon">Coming soon to iPhone.</p>
<p>Questions? Email <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a>.</p>
</section>`,
});

const page = (p, slug) => shell({
  title: `${p.title} | Foodalise`,
  description: `Foodalise ${p.title.toLowerCase()}.`,
  depth: 1,
  body: `<article>
<h1>${esc(p.title)}</h1>
<p class="updated">Last updated ${esc(p.updated)}</p>
${p.sections.map(([title, body]) => `<h2>${esc(title)}</h2>\n<p>${linkify(body)}</p>`).join('\n')}
<p class="contact">${linkify(p.footer)}</p>
</article>`,
});

const CSS = `:root { color-scheme: dark; --ink: #141414; --card: #1E1E1E; --line: #2E2E2E; --text: #FFFFFF; --muted: #A8A8A8; --accent: #FF6B2C; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--ink); color: var(--text); font: 17px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
header, main, footer { max-width: 720px; margin: 0 auto; padding: 0 20px; }
header { padding-top: 24px; }
.brand { display: inline-flex; align-items: center; gap: 10px; color: var(--text); text-decoration: none; font-weight: 900; font-size: 22px; letter-spacing: -0.5px; }
.symbol { height: 26px; width: auto; }
a { color: var(--accent); }
h1 { font-size: clamp(32px, 7vw, 48px); line-height: 1.1; letter-spacing: -1px; margin: 48px 0 16px; }
article h1 { font-size: 34px; margin-top: 40px; }
h2 { font-size: 19px; margin: 28px 0 4px; }
p { margin: 0 0 12px; }
.lead { font-size: 20px; color: var(--muted); }
.points { padding: 0; list-style: none; margin: 28px 0; display: grid; gap: 12px; }
.points li { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; }
.soon { display: inline-block; background: var(--accent); color: var(--ink); font-weight: 800; border-radius: 999px; padding: 8px 18px; margin: 8px 0 20px; }
.updated { color: var(--muted); }
.contact { margin-top: 28px; }
footer { border-top: 1px solid var(--line); margin-top: 56px; padding-top: 20px; padding-bottom: 40px; color: var(--muted); font-size: 14px; }
footer nav { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-bottom: 12px; }
footer nav a { color: var(--text); text-decoration: none; }
`;

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), home);
writeFileSync(join(out, 'style.css'), CSS);
for (const [slug, p] of [['privacy', PRIVACY], ['terms', TERMS], ['reviews-policy', REVIEWS_POLICY]]) {
  mkdirSync(join(out, slug), { recursive: true });
  writeFileSync(join(out, slug, 'index.html'), page(p, slug));
}
copyFileSync(join(root, 'assets/images/icon.png'), join(out, 'icon.png'));
copyFileSync(join(root, 'assets/images/favicon.png'), join(out, 'favicon.png'));
console.log('website/ is up to date');
