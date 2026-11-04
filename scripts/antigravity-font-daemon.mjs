#!/usr/bin/env node
/**
 * Backward-compatible scripts/ entry point (Stable Channel) -> delegates to v5.0.0 ../core/daemon.mjs
 */
if (!process.argv.some((a) => a === '--channel' || a.startsWith('--channel='))) {
  process.argv.push('--channel', 'stable');
}
await import('../core/daemon.mjs');
