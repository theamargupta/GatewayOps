import { defineConfig } from 'vitest/config';

// Tests run on the host against the docker compose Postgres/Redis (ports 5432/6379).
// Files run one at a time because they share one database and one Redis.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    fileParallelism: false,
    env: {
      // Vitest sets NODE_ENV=test, which config/env.ts rejects (development | production only).
      NODE_ENV: 'development',
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://gatewayops:gatewayops_secret@localhost:5432/gatewayops',
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
      JWT_SECRET: process.env.JWT_SECRET ?? 'test_jwt_secret',
    },
  },
});
