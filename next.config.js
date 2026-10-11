/** @type {import('next').NextConfig} */
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
})

const nextConfig = {
  reactStrictMode: true,
  // Les types Supabase sont générés (src/types/database.types.ts) :
  // le build échoue sur une erreur de type.
  typescript: { ignoreBuildErrors: false },
  // Silences the Turbopack/webpack conflict warning from next-pwa.
  // PWA webpack config only runs on production builds (disable: dev).
  turbopack: {},
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Anti-clickjacking : seule l'app elle-même peut s'embarquer.
          // Pour autoriser un site précis (ex. WordPress), ajouter son origine :
          //   "frame-ancestors 'self' https://votre-site.fr"
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Le micro est nécessaire (enregistrement) ; caméra/géoloc/etc. sont coupés.
          { key: 'Permissions-Policy', value: 'microphone=(self), camera=(), geolocation=(), payment=()' },
        ],
      },
    ]
  },
}

module.exports = withPWA(nextConfig)
