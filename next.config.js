/** @type {import('next').NextConfig} */
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
})

const nextConfig = {
  reactStrictMode: true,
  // Supabase generated types not present — suppress TS errors at build time
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Silences the Turbopack/webpack conflict warning from next-pwa.
  // PWA webpack config only runs on production builds (disable: dev).
  turbopack: {},
  async headers() {
    // Set NEXT_PUBLIC_FRAME_ANCESTORS in .env.local to restrict iframe embedding,
    // e.g. NEXT_PUBLIC_FRAME_ANCESTORS='self' https://your-wordpress-domain.com
    const frameAncestors = process.env.NEXT_PUBLIC_FRAME_ANCESTORS || "'self'"
    return [
      {
        source: '/(.*)',
        headers: [
          // CSP frame-ancestors supersedes X-Frame-Options in modern browsers.
          { key: 'Content-Security-Policy', value: `frame-ancestors ${frameAncestors}` },
          // Keep X-Frame-Options as fallback for older browsers.
          { key: 'X-Frame-Options', value: frameAncestors === "'self'" ? 'SAMEORIGIN' : 'ALLOWALL' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

module.exports = withPWA(nextConfig)
