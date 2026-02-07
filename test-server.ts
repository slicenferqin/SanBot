/**
 * Test server
 */

const server = Bun.serve({
  port: 3000,
  fetch(req) {
    return new Response("Hello World");
  },
});

console.log(`Server running on http://localhost:${server.port}`);
