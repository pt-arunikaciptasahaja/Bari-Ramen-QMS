import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Bari Ramen | Antrean",
  description:
    "Satu antrean untuk semua tamu Bari Ramen. Ambil nomor, pantau giliran, nikmati ramen.",
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
