import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Bari Ramen | Antrean",
  description: "Pendaftaran dan status antrean meja Bari Ramen.",
  referrer: "no-referrer",
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
