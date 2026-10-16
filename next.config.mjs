/** @type {import('next').NextConfig} */
const config = {
  poweredByHeader: false,
  experimental: { cpus: 2 },
  async headers() {
    return [
      { source: '/sw.js', headers: [
        { key:'Content-Type', value:'application/javascript; charset=utf-8' },
        { key:'Cache-Control', value:'no-cache, no-store, must-revalidate' },
        { key:'Service-Worker-Allowed', value:'/' },
      ] },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
