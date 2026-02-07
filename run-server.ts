#!/usr/bin/env bun

try {
  await import('./src/web/server.ts');
} catch (error) {
  console.error('❌ Error loading server:', error);
  process.exit(1);
}
