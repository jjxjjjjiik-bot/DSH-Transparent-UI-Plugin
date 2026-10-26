/* Pre-commit guard for the liquid glass plugin.
 * Reads client.js as text and checks the things that have actually broken it:
 *   1. a backtick inside the CSS template truncates the stylesheet
 *   2. unbalanced braces inside the CSS template
 *   3. positioning properties that would re-anchor the shell's fixed controls
 *   4. backdrop-filter landing on anything other than a ::before/::after
 *   5. required pieces still present
 */
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || 'D:/chat for dsh/dsh-liquid-glass/client.js';
const src = fs.readFileSync(file, 'utf8');
let failed = 0;
const fail = (msg) => { failed += 1; console.log('FAIL  ' + msg); };
const ok = (msg) => console.log('ok    ' + msg);

// ---- 1. locate the CSS template literal ----
const start = src.indexOf('const CSS = `');
if (start < 0) { fail('CSS template not found'); process.exit(1); }
const bodyStart = start + 'const CSS = `'.length;
let i = bodyStart;
let css = '';
while (i < src.length) {
  const ch = src[i];
  if (ch === '\\') { css += src.slice(i, i + 2); i += 2; continue; }
  if (ch === '`') break;
  css += ch; i += 1;
}
if (i >= src.length) fail('CSS template is not terminated (a stray backtick truncated it)');
else ok('CSS template terminated at char ' + i);

// A backtick inside the sheet truncates it and the FIRST backtick becomes the
// terminator, so the stray-backtick count above cannot see it. Assert instead
// that the extracted text reaches the end of the real sheet.
const TAIL = '.lg-switch[aria-checked';
if (css.slice(-400).includes(TAIL)) ok('CSS template reaches the last rule');
else fail('CSS template was truncated - it ends before ' + TAIL);

const strayBackticks = (css.match(/`/g) || []).length;
if (strayBackticks > 0) fail(strayBackticks + ' backtick(s) inside the CSS template');
else ok('no backticks inside the CSS template');

// ---- 2. brace balance ----
const open = (css.match(/\{/g) || []).length;
const close = (css.match(/\}/g) || []).length;
if (open !== close) fail(`CSS braces unbalanced: ${open} open / ${close} close`);
else ok(`CSS braces balanced: ${open}/${close}`);

// ---- 3. declaration scan, split per rule ----
const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
const rules = [];
let m;
while ((m = ruleRe.exec(css)) !== null) rules.push({ selector: m[1].trim(), body: m[2] });

const HOST_HINTS = ['sidebarCol', 'centerCol', 'rightbarCol', 'bottomRow', 'data-composer-card', "role='menu'", "role='listbox'"];
const FORBIDDEN_ON_HOST = /(^|;|\s)(backdrop-filter|filter|transform|perspective|will-change|contain|isolation|opacity)\s*:/;
// `isolation` creates a stacking context on a host element, so it fails this
// guard everywhere except the one documented exception: the composer card needs
// it so that its ::before backdrop blur lands above the card's own fill instead
// of escaping into an ancestor context. Anything else must not use it.
const ISOLATION_EXCEPTIONS = ['data-composer-card'];

let hostRules = 0;
for (const rule of rules) {
  if (rule.body.trim().length === 0) continue;
  const sel = rule.selector;
  const onPseudo = /::(before|after)\b/.test(sel);
  const onHost = HOST_HINTS.some((hint) => sel.includes(hint));
  if (!onHost) continue;
  hostRules += 1;
  if (onPseudo) continue;
  const exceptIsolation = ISOLATION_EXCEPTIONS.some((hint) => sel.includes(hint));
  const body = exceptIsolation ? rule.body.replace(/isolation\s*:\s*[^;]+;?/g, '') : rule.body;
  const hit = body.match(FORBIDDEN_ON_HOST);
  if (hit) fail(`containing-block/stacking property "${hit[1]}" on host element: ${sel.replace(/\s+/g, ' ').slice(0, 120)}`);
}
ok(`scanned ${hostRules} host-element rules`);

// ---- 4. every backdrop-filter must sit on a pseudo-element ----
let backdropRules = 0;
for (const rule of rules) {
  if (!/backdrop-filter\s*:/.test(rule.body)) continue;
  backdropRules += 1;
  if (!/::(before|after)\b/.test(rule.selector)) {
    fail('backdrop-filter outside a pseudo-element: ' + rule.selector.replace(/\s+/g, ' ').slice(0, 120));
  }
}
ok(`all ${backdropRules} backdrop-filter declarations are on pseudo-elements`);

// ---- 5. required pieces ----
const need = [
  ['field node attribute', "FIELD_ATTR"],
  ['pointer node attribute', "POINTER_ATTR"],
  ['pointer above shell', 'z-index: 50'],
  ['glass blur on ::before', 'backdrop-filter: blur(var(--lg-glass'],
  ['pane rim', "inset -1px 0 0 rgba(255, 255, 255, 0.88)"],
  ['settings slot', "settings.general.item"],
  ['pointermove listener', "addEventListener('pointermove'"],
  ['teardown removes pointer', 'pointer?.remove()'],
];
for (const [label, needle] of need) {
  if (src.includes(needle)) ok(`present: ${label}`);
  else fail(`missing: ${label}`);
}

// ---- 6. the pointer node must be appended to body, not the field ----
const ptrFn = src.slice(src.indexOf('function createPointer'), src.indexOf('function Slider'));
if (/document\.body\.appendChild/.test(ptrFn)) ok('pointer node is appended to body (above the shell)');
else fail('createPointer no longer appends to document.body');

console.log(failed === 0 ? '\nGUARD PASS' : `\nGUARD FAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
