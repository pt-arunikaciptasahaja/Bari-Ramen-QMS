import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Bari Ramen | Antrean",
  description: "Pendaftaran dan status antrean meja Bari Ramen.",
  referrer: "no-referrer",
  appleWebApp: { capable: true, title: 'Bari Ramen', statusBarStyle: 'default' },
  icons: {
    icon: { url: '/pwa-icon?v=ios-fit-20261024', type: 'image/png', sizes: '192x192' },
    apple: { url: '/apple-touch-icon.png?v=ios-fit-20261024', type: 'image/png', sizes: '180x180' },
  },
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
