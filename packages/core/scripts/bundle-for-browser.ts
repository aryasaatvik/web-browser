#!/usr/bin/env bun
/**
 * Bundle @web-browser/core for browser injection.
 *
 * Creates an IIFE bundle that exposes all core functionality via
 * window.__webBrowserMcpCore for use in CDP backends.
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

// Entry point that re-exports everything and assigns to window
const entryCode = `
import * as core from './src/index.js';

// Expose on window for CDP injection
if (typeof window !== 'undefined') {
  (window as any).__webBrowserMcpCore = core;
}

export default core;
`;

// Write temporary entry file
const tempEntry = resolve(rootDir, '.bundle-entry.ts');
await Bun.write(tempEntry, entryCode);

try {
  // Bundle with Bun
  const result = await Bun.build({
    entrypoints: [tempEntry],
    outdir: resolve(rootDir, 'dist'),
    naming: 'browser-bundle.js',
    target: 'browser',
    format: 'iife',
    minify: false, // Keep readable for debugging
    sourcemap: 'none',
  });

  if (!result.success) {
    console.error('Bundle failed:');
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  // Read the bundle and wrap it properly
  const bundlePath = resolve(rootDir, 'dist/browser-bundle.js');
  const bundleContent = await Bun.file(bundlePath).text();

  // Create a TypeScript file that exports the bundle as a string constant
  const outputTs = `/**
 * @web-browser/core bundled for browser injection.
 * Auto-generated - do not edit directly.
 *
 * This bundle exposes window.__browserMcpCore with all core exports.
 */

export const coreBundleSource = ${JSON.stringify(bundleContent)};

export default coreBundleSource;
`;

  await Bun.write(resolve(rootDir, 'dist/browser-bundle-source.ts'), outputTs);

  // Also create a .js version for direct import
  const outputJs = `/**
 * @web-browser/core bundled for browser injection.
 * Auto-generated - do not edit directly.
 */

export const coreBundleSource = ${JSON.stringify(bundleContent)};

export default coreBundleSource;
`;

  await Bun.write(resolve(rootDir, 'dist/browser-bundle-source.js'), outputJs);

  // Create declaration file
  const outputDts = `/**
 * @web-browser/core bundled for browser injection.
 */

export declare const coreBundleSource: string;
export default coreBundleSource;
`;

  await Bun.write(resolve(rootDir, 'dist/browser-bundle-source.d.ts'), outputDts);

  console.log('✓ Browser bundle created:');
  console.log('  - dist/browser-bundle.js (raw IIFE)');
  console.log('  - dist/browser-bundle-source.js (exportable string)');
  console.log('  - dist/browser-bundle-source.d.ts (types)');
  console.log(`  Bundle size: ${(bundleContent.length / 1024).toFixed(1)}KB`);
} finally {
  // Clean up temp file
  const fs = await import('fs/promises');
  await fs.unlink(tempEntry).catch(() => {});
}
