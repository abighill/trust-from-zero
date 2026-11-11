import type { Metadata, Viewport } from "next";
import { Noto_Sans, Poppins } from "next/font/google";
import "./globals.css";

// Fonts from the Unstuck design system: Poppins for display moments, Noto Sans for everything else.
// next/font serves them from this site, so visitors' browsers don't contact Google.
const heading = Poppins({ weight: "600", subsets: ["latin"], variable: "--font-heading", display: "swap" });
const body = Noto_Sans({ weight: ["400", "600"], subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "Unstuck",
  description:
    "Got more than one thing wanting the same money? Talk it through and get options with the trade-offs. Guidance, not financial advice.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${heading.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
