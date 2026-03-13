import { defineConfig } from '@prisma/config';

export default defineConfig({
  datasource: {
    // This maps the environment variable to the Prisma engine
    url: process.env.DATABASE_URL,
  },
});
