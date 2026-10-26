import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bari Ramen | Today’s Queue",
  description: "Live queue numbers and calls at Bari Ramen. Please head to the cashier when your number is called.",
};

export default function TVLayout({ children }: { children: React.ReactNode }) {
  return children;
}
