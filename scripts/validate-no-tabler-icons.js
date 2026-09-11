#!/usr/bin/env node

/**
 * Fails the build if any hand-written source file references a Tabler icon
 * class (`ti`, `ti-*`).
 *
 * The Tabler icon webfont was dropped in #9491 — `@tabler/core` (the CSS
 * framework) is still a dependency, but `@tabler/icons-webfont` is not, so
 * nothing in the shipped stylesheets defines a `.ti-*` glyph. Markup that
 * still emits `class="ti ti-foo"` therefore renders as blank space instead
 * of an icon, and it does so silently: no console error, no build warning.
 * #9752 found six templates (plus five webpack bundles) that had drifted
 * back in this way, five of them building the class name dynamically so the
 * usual `grep 'class="ti '` audit missed them.
 *
 * Font Awesome is the only permitted icon library — see
 * `.agents/skills/churchcrm/icon-management.md`, which carries the
 * Tabler -> Font Awesome mapping table to use when replacing a hit.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCAN_ROOTS = ['src', 'webpack'];
const EXTENSIONS = new Set(['.php', '.js', '.jsx', '.ts', '.tsx', '.html', '.twig', '.css', '.scss']);

// Directory names that are never ours to fix wherever they appear:
// dependencies and Propel-generated model code.
const SKIP_DIR_NAMES = new Set([
    'node_modules',
    'vendor',
    'Base', // Propel-generated
    'Map', // Propel-generated
]);

// Specific trees, matched by their path relative to the repo root. These are
// deliberately *not* matched by bare directory name: `src/skin/v2/` is webpack
// build output and must be skipped, while the application's own `src/v2/`
// source tree must be scanned — it is one of the two trees that drifted back
// to Tabler classes in #9752.
const SKIP_DIR_PATHS = new Set([
    path.join('src', 'skin', 'external'), // vendored front-end libraries
    path.join('src', 'skin', 'v2'), // webpack build output
]);

// `ti-foo` as a standalone token (so `multi-line`, `anti-aliased` etc. are
// not matches), and the bare variant class in `class="ti ..."`.
const PATTERNS = [
    { re: /\bti-[a-z][a-z0-9]*(?:-[a-z0-9]+)*\b/g, what: 'Tabler icon name' },
    { re: /class\s*=\s*(?:["'`{]|\\")\s*ti[\s"'`]/g, what: 'Tabler `ti` variant class' },
];

function walk(dir, out) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (SKIP_DIR_NAMES.has(entry.name) || SKIP_DIR_PATHS.has(path.relative(ROOT, full))) {
                continue;
            }
            walk(full, out);
        } else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) {
            out.push(full);
        }
    }
    return out;
}

console.log('🔍 Tabler Icon Class Validation');
console.log('===============================\n');

const files = [];
for (const scanRoot of SCAN_ROOTS) {
    const abs = path.join(ROOT, scanRoot);
    if (fs.existsSync(abs)) {
        walk(abs, files);
    }
}
console.log(`📋 Checking ${files.length} file(s) under ${SCAN_ROOTS.join('/, ')}/\n`);

const hits = [];

for (const filePath of files) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    lines.forEach((line, index) => {
        for (const { re, what } of PATTERNS) {
            re.lastIndex = 0;
            const match = re.exec(line);
            if (match) {
                hits.push({
                    filePath: path.relative(ROOT, filePath),
                    line: index + 1,
                    what,
                    text: line.trim(),
                });
                return; // one report per line is enough
            }
        }
    });
}

if (hits.length > 0) {
    console.error(`❌ Found ${hits.length} Tabler icon reference(s):\n`);
    for (const { filePath, line, what, text } of hits) {
        console.error(`  ${filePath}:${line} — ${what}`);
        console.error(`    ${text}\n`);
    }
    console.error('The Tabler icon webfont is not shipped, so these render as blank space.');
    console.error('Fix: use the Font Awesome equivalent (`fa-solid fa-...`). Mapping table:');
    console.error('  .agents/skills/churchcrm/icon-management.md → "Tabler → Font Awesome Equivalents"');
    process.exit(1);
}

console.log('✨ No Tabler icon classes found — every icon is Font Awesome!');
