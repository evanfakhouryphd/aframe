import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NexusFit — Functional Workout Generator",
  description:
    "A constraint-based workout generator for CrossFit, HYROX, and Functional Training. AMRAP, EMOM, For Time, Chipper, Tabata, Partner.",
  applicationName: "NexusFit",
  appleWebApp: {
    capable: true,
    title: "NexusFit",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAFA" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0A0A" },
  ],
};

const themeBootstrap = `
(function () {
  try {
    var stored = localStorage.getItem('nexusfit-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored ? stored === 'dark' : prefersDark;
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="font-sans antialiased min-h-screen">{children}</body>
    </html>
  );
}
