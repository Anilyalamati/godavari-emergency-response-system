import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundleDirectory = join(repositoryRoot, 'apps/web/dist');
const sentinel = 'GODAVARI_SERVER_ONLY_KEY_SENTINEL_7f41c66f';

const buildEnvironment = {
  ...process.env,
  NODE_ENV: 'production',
  SUPABASE_URL: 'https://placeholder.supabase.invalid',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_bundle_test_value',
  SUPABASE_SECRET_KEY: sentinel,
  SUPABASE_SERVICE_ROLE_KEY: sentinel,
  VITE_PUBLIC_API_BASE_URL: '/api',
  VITE_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.invalid',
  VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_bundle_test_value',
  VITE_PUBLIC_SUPABASE_SECRET_KEY: sentinel,
  VITE_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: sentinel,
  VITE_SUPABASE_SERVICE_ROLE_KEY: sentinel,
};

const build = spawnSync('pnpm', ['--filter', '@godavari/web', 'exec', 'vite', 'build'], {
  cwd: repositoryRoot,
  env: buildEnvironment,
  stdio: 'inherit',
  timeout: 120_000,
  shell: true,
});

if (build.error) {
  throw new Error(
    `The browser bundle check could not start the frontend build: ${build.error.message}`,
  );
}
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const files = await collectFiles(bundleDirectory);
if (files.length === 0) {
  throw new Error('The browser build produced no files to scan.');
}

const forbiddenMarkers = [sentinel, 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const leakedFiles = [];
for (const file of files) {
  const contents = await readFile(file);
  if (forbiddenMarkers.some((marker) => contents.includes(Buffer.from(marker)))) {
    leakedFiles.push(relative(repositoryRoot, file));
  }
}

if (leakedFiles.length > 0) {
  console.error(`Server-only key marker found in browser output: ${leakedFiles.join(', ')}`);
  process.exit(1);
}

console.log(`Browser bundle secret check passed (${files.length} files scanned).`);
