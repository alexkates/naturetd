import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

const title = "Nature's Last Stand";
const description =
  "Build a living maze of animal guardians and cleanse endless waves of whimsical Blightlings before they reach the Heartwood.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: "%s · Nature's Last Stand",
  },
  description,
  icons: {
    icon: "/assets/towers/thorn.png",
  },
  openGraph: {
    title,
    description,
    siteName: title,
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/og.png",
        width: 1672,
        height: 941,
        alt: "Nature's Last Stand — guard the Heartwood",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#14251a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
