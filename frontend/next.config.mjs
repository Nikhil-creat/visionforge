const isExport = process.env.STATIC_EXPORT === "1";

/** @type {import('next').NextConfig} */
export default {
  // Docker / Node hosts: standalone server.  GitHub Pages / Cloudflare Pages: `npm run export` -> static ./out
  output: isExport ? "export" : "standalone",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  trailingSlash: isExport,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  // Response headers only apply on a Node server (static hosts ignore them; the CSP <meta> in layout.tsx still applies).
  async headers() {
    if (isExport || process.env.NODE_ENV !== "production") return [];
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      ],
    }];
  },
};
