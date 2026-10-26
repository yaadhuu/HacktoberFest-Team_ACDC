/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [{ source: "/explore", destination: "/", permanent: true }];
  },
  // Same-origin proxy to FastAPI so one tunnel/port (ngrok) serves web + API.
  async rewrites() {
    const api = process.env.API_INTERNAL_URL || "http://127.0.0.1:8000";
    return [{ source: "/api-proxy/:path*", destination: `${api}/:path*` }];
  },
  experimental: { proxyTimeout: 180_000 }, // uploads that hit the Gemma verifier can take ~30s
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "i.pravatar.cc" },
    ],
  },
};
export default nextConfig;
