#!/usr/bin/env node
/**
 * Copy packages/data-app-template to data-apps/<slug> and set slug/name.
 *
 * Usage:
 *   pnpm create-data-app my-sales-kpi
 *   pnpm create-data-app my-sales-kpi "销售 KPI"
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_SLUG_LENGTH = 255;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', '.git']);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const templateDir = path.join(repoRoot, 'packages', 'data-app-template');
const appsRoot = path.join(repoRoot, 'data-apps');

const slug = process.argv[2]?.trim();
const displayName = process.argv[3]?.trim() || slug;

if (!slug) {
    console.error(
        'Usage: pnpm create-data-app <slug> [display-name]\n' +
            '  slug: lowercase letters, digits, hyphens (e.g. my-sales-kpi)',
    );
    process.exit(1);
}

if (!SLUG_RE.test(slug) || slug.length > MAX_SLUG_LENGTH) {
    console.error(
        `Invalid slug "${slug}". Use lowercase letters, digits, and hyphens; start with a letter or digit.`,
    );
    process.exit(1);
}

if (!fs.existsSync(templateDir)) {
    console.error(`Template not found: ${templateDir}`);
    process.exit(1);
}

const destDir = path.join(appsRoot, slug);
if (fs.existsSync(destDir)) {
    console.error(`Already exists: ${path.relative(repoRoot, destDir)}`);
    process.exit(1);
}

fs.mkdirSync(appsRoot, { recursive: true });
fs.cpSync(templateDir, destDir, {
    recursive: true,
    filter: (source) => {
        const name = path.basename(source);
        return !SKIP_DIR_NAMES.has(name);
    },
});

const packageJsonPath = path.join(destDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
packageJson.name = `@lightdash/data-app-${slug}`;
if (packageJson.dependencies?.['@lightdash/query-sdk']) {
    packageJson.dependencies['@lightdash/query-sdk'] =
        'file:../../packages/query-sdk';
}
fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 4)}\n`,
    'utf8',
);

const manifestPath = path.join(destDir, 'lightdash-app.yml');
const manifest = fs
    .readFileSync(manifestPath, 'utf8')
    .replace(/^slug:.*$/m, `slug: ${slug}`)
    .replace(/^name:.*$/m, `name: ${displayName}`);
fs.writeFileSync(manifestPath, manifest, 'utf8');

const relativeDest = path.relative(repoRoot, destDir).replace(/\\/g, '/');
console.log(`Created ${relativeDest}`);
console.log(`
Next:
  pnpm --filter @lightdash/query-sdk build
  cd ${relativeDest}
  pnpm install
  # edit src/App.jsx (EXPLORE / METRIC)
  pnpm build
  # admin: 浏览 → 全部数据应用 → 上传应用 → 选择本目录
`);
