import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // A dev server holds a lock on its output directory, so a production build run beside one fails
  // on the lock rather than on the code. NEXT_DIST_DIR gives that build somewhere else to write.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // The workspace packages ship TypeScript sources, not built JavaScript.
  transpilePackages: ['@glimpse/shared', '@glimpse/vault', '@glimpse/verifier'],
  // The FAKE test CA is read at run time from PADES_TRUST_ANCHORS, a path the bundler cannot trace.
  outputFileTracingIncludes: {
    '/api/**/*': ['../../tests/fixtures/documents/FAKE-test-ca.pem'],
  },
}

export default nextConfig
