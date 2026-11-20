#!/usr/bin/env node
/**
 * Design-token guard.
 *
 * The theme is driven by the palettes in `theme/palettes/*.css`: those files are
 * the only place allowed to hold a literal color. Everything else must reference
 * a token (`var(--c-*)`) so a palette swap / dark mode keeps working.
 *
 * Checks:
 *   1. no color literals in `*.styl` or in `theme/*.css` (palettes excluded)
 *   2. every `var(--c-*)` used somewhere is defined by the active palette
 *   3. every token the palette declares is used somewhere (dead tokens)
 *
 * Usage: node packages/ui-default/build/check-tokens.js [--quiet]
 */
const fs = require('fs');
const path = require('path');

const PKG = path.resolve(__dirname, '..');
const PALETTE_DIR = path.join(PKG, 'theme/palettes');
const ACTIVE_PALETTE = path.join(PALETTE_DIR, 'claude.css');
const SKIP_DIRS = new Set(['node_modules', '.git', 'public', 'static']);
/** `common/color.inc.styl` is a table of CSS color *names*, not styling. */
const ALLOWED = new Set([path.join(PKG, 'common/color.inc.styl')]);

const CSS_COLOR_NAMES = [
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond',
  'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue',
  'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey',
  'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon',
  'darkseagreen', 'darkslateblue', 'darkslategray', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue',
  'dimgray', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite',
  'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo',
  'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral',
  'lightcyan', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen',
  'lightskyblue', 'lightslategray', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta',
  'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen',
  'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream',
  'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered',
  'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru',
  'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown',
  'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray',
  'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat',
  'white', 'whitesmoke', 'yellow', 'yellowgreen',
];
const COLOR_LITERAL = new RegExp(
  `#[0-9a-fA-F]{3,8}\\b|\\b(?:rgba?|hsla?)\\(\\s*\\d|(?<![\\w$-])(?:${CSS_COLOR_NAMES.join('|')})(?![\\w-])`,
  'g',
);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Strip `/* *\/` and `//` comments so commented-out code does not trip the check. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

/** Drop quoted strings so map keys such as 'blue': 'info' are not read as colors. */
function stripStrings(src) {
  return src.replace(/'[^'\n]*'|"[^"\n]*"/g, "''");
}

const problems = [];
const files = walk(PKG);
const styleFiles = files.filter((f) => f.endsWith('.styl') || (f.endsWith('.css') && !f.startsWith(PALETTE_DIR)));

for (const file of styleFiles) {
  if (ALLOWED.has(file)) continue;
  const rel = path.relative(PKG, file);
  const lines = stripStrings(stripComments(fs.readFileSync(file, 'utf8'))).split('\n');
  lines.forEach((line, i) => {
    // only declaration values carry colors; selector names and at-rules do not
    const colon = line.indexOf(':');
    if (colon === -1 || line.trimStart().startsWith('@')) return;
    const match = line.slice(colon + 1).match(COLOR_LITERAL);
    if (match) problems.push(`${rel}:${i + 1}  literal color "${match[0].trim()}" in "${line.trim()}" — use a token (var(--c-*)) or add one to the palette`);
  });
}

// corner radii come from the shape scale; a literal radius silently breaks the
// geometry contract (a 2px chip next to a pill button reads as two products).
const RADIUS_OK = /^(?:var\(--r(?:-xs|-sm|-lg|-pill)?\)|\$radius(?:-sm|-lg|-pill)?|0|0px|50%|inherit|none)$/;
for (const file of styleFiles) {
  if (ALLOWED.has(file)) continue;
  const rel = path.relative(PKG, file);
  const lines = stripStrings(stripComments(fs.readFileSync(file, 'utf8'))).split('\n');
  lines.forEach((line, i) => {
    const m = line.match(/^\s*border-radius\s*:\s*(.+?)\s*;?\s*$/i);
    if (!m) return;
    const parts = m[1].replace(/!important/i, '').split(/\s+/).filter(Boolean);
    const bad = parts.filter((part) => !RADIUS_OK.test(part));
    if (bad.length) {
      problems.push(`${rel}:${i + 1}  literal radius "${m[1]}" — use var(--r-xs/-sm/--r/--r-lg/--r-pill)`);
    }
  });
}

// token usage vs palette definition
const paletteSrc = fs.readFileSync(ACTIVE_PALETTE, 'utf8');
const defined = new Set();
for (const line of paletteSrc.split('\n')) {
  const m = line.match(/^\s*(--[a-z0-9-]+)\s*:/i);
  if (m) defined.add(m[1]);
}
const used = new Map();
for (const file of styleFiles.concat(files.filter((f) => /\.(tsx?|jsx?|html)$/.test(f) && !f.includes('/build/')))) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/var\((--c-[a-z0-9-]+)/gi)) {
    if (!used.has(m[1])) used.set(m[1], path.relative(PKG, file));
  }
}
for (const [token, where] of used) {
  if (!defined.has(token)) problems.push(`${where}  uses ${token}, which the palette does not define`);
}
for (const token of defined) {
  if (token.startsWith('--c-') && !used.has(token)) problems.push(`palette declares ${token} but nothing uses it`);
}

if (problems.length) {
  console.error(`design tokens: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
if (!process.argv.includes('--quiet')) {
  console.log(`design tokens: ok (${defined.size} tokens, ${styleFiles.length} style files)`);
}
