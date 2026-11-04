import type { Metadata, Viewport } from "next";
import "./globals.css";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "";

export const metadata: Metadata = {
  title: "VisionForge Enterprise — Agentic Image Intelligence Studio",
  description:
    "Recognise, transform and generate images with CNN diagnostics, an autonomous LangGraph agent, visual RAG and a multi-assistant council (Groq + Gemini). Secure by design.",
  icons: { icon: `${BASE}/favicon.svg` },
  manifest: `${BASE}/manifest.webmanifest`,
  ...(SITE ? { metadataBase: new URL(SITE) } : {}),
  openGraph: { title: "VisionForge Enterprise", description: "Agentic image intelligence studio.", type: "website" },
};

export const viewport: Viewport = { themeColor: "#111111", width: "device-width", initialScale: 1 };

// Applies saved theme/motion/accent before first paint (no flash). Mirrors applyTheme() in lib/themes.ts.
const boot = `try{var d=document.documentElement,s=JSON.parse(localStorage.getItem('vf_theme')||'{}'),r=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
d.setAttribute('data-theme',s.p||'paper');d.setAttribute('data-motion',s.m||(r?'still':'calm'));
if(s.a&&/^#[0-9a-f]{6}$/i.test(s.a)){var n=parseInt(s.a.slice(1),16),R=n>>16,G=(n>>8)&255,B=n&255;
d.style.setProperty('--accent',s.a);d.style.setProperty('--dot',s.a);d.style.setProperty('--accent-ink',(0.299*R+0.587*G+0.114*B)>150?'#000':'#fff')}}catch(e){}`;

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://images.higgs.ai https://d8j0ntlcm91z4.cloudfront.net",
  `connect-src 'self' ${API} https://images.higgs.ai`,
  "object-src 'none'", "base-uri 'self'", "form-action 'self'",
].join("; ");

const person = {
  "@context": "https://schema.org", "@type": "Person", name: "Nikhil Chary Sriramoju",
  jobTitle: "Aspiring Software Engineer — AI/ML & Data Analytics",
  alumniOf: "Vaagdevi College of Engineering",
  sameAs: ["https://github.com/Nikhil-creat", "https://in.linkedin.com/in/nikhil-chary-sriramoju-95041b38a"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="paper" data-motion="calm" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
        {process.env.NODE_ENV === "production" && <meta httpEquiv="Content-Security-Policy" content={csp} />}
        <script dangerouslySetInnerHTML={{ __html: boot }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(person) }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
