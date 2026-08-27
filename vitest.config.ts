import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Server configuration is validated as a whole at import time, so unit
    // tests must supply the full set even when the module under test only needs
    // one value. These are throwaway test values: nothing here points at a real
    // service, and no test disables a real integration to pass.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://unit-test/unused',
      VALKEY_URL: 'redis://unit-test/unused',
      JWT_SECRET: 'unit-test-signing-key-that-is-long-enough-32',
      APP_ORIGIN: 'http://localhost:5173',
      CORS_ORIGINS: '',
    },
    include: ['server/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
  },
});
