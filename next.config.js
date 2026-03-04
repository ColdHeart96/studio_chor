/** @type {import('next').NextConfig} */
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
})

const nextConfig = {
  reactStrictMode: true,
  // Silences the Turbopack/webpack conflict warning from next-pwa.
  // PWA webpack config only runs on production builds (disable: dev).
  turbopack: {},
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Allow embedding in WordPress iframe
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          // Or restrict to specific WP domain (uncomment and replace):
          // { key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://your-wordpress-domain.com" },
        ],
      },
    ]
  },
}

module.exports = withPWA(nextConfig)
