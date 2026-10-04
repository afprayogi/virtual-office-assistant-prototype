/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Server-only heavy deps must stay out of the client/edge graph.
  experimental: {
    serverComponentsExternalPackages: ['tesseract.js', 'pdf-parse', 'adm-zip'],
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
}

export default nextConfig