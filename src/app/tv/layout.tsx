import type { Metadata } from "next";
import localFont from "next/font/local";

const archivo = localFont({ src: "../../../public/fonts/archivo-latin-variable.woff2", weight: "400 900", display: "swap", variable: "--font-tv" });

export const metadata: Metadata = {
  title: "Bari Ramen | Today’s Queue",
  description: "Live queue numbers and calls at Bari Ramen. Please head to the cashier when your number is called.",
};

export default function TVLayout({ children }: { children: React.ReactNode }) {
  return <div className={archivo.variable}>{children}</div>;
}
