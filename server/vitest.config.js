const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Run test files serially — SQLite in-memory DBs are per-test but
    // the real server tests bind to random ports; serial avoids any port
    // reuse races between parallel workers.
    singleThread: true,
    // Exclude the legacy hand-rolled test runner (calls process.exit)
    exclude: ['scripts/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.js', 'routes/**/*.js'],
      exclude: ['node_modules', 'scripts'],
      reporter: ['text', 'lcov'],
    },
    testTimeout: 10000,
  },
});
