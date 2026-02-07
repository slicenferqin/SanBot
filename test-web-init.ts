/**
 * Minimal WebUI Server Test
 */

import { Agent } from './src/agent.ts';
import { loadConfig } from './src/config/loader.ts';

async function test() {
  console.log('1. Loading config...');
  const config = await loadConfig();
  console.log('✅ Config loaded');

  console.log('2. Creating agent...');
  const agent = new Agent({
    llmConfig: config.llm,
    maxSteps: 999,
  });
  console.log('✅ Agent created');

  console.log('3. Initializing agent...');
  await agent.init();
  console.log('✅ Agent initialized');

  console.log('4. Starting server...');
  const server = Bun.serve({
    port: 3001,
    fetch(req) {
      return new Response('OK');
    },
  });
  console.log(`✅ Server running on http://localhost:${server.port}`);
}

test().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
