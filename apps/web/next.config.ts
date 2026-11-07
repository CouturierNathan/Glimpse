import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // The workspace packages ship TypeScript sources, not built JavaScript.
  transpilePackages: ['@glimpse/shared', '@glimpse/vault'],
}

export default nextConfig
