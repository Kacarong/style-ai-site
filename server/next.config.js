/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow <img src> from inference server (localhost in dev, tailnet IP in prod).
  // We use plain <img> not next/image, so this is mostly informational.
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: '25mb' },
  },
};

module.exports = nextConfig;
