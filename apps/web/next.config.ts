import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // The workspace packages ship TypeScript sources, not built JavaScript.
  transpilePackages: ['@glimpse/shared', '@glimpse/vault', '@glimpse/verifier'],
  // The FAKE test CA is read at run time from PADES_TRUST_ANCHORS, a path the bundler cannot trace.
  outputFileTracingIncludes: {
    '/api/**/*': ['../../tests/fixtures/documents/FAKE-test-ca.pem'],
  },
}

export default nextConfig
