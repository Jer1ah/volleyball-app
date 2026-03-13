/** @type {import('next').NextConfig} */
const nextConfig = {
  // This forces Next.js to inject these into the server runtime
  env: {
    DATABASE_URL: process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL,
  },
};

export default nextConfig;
