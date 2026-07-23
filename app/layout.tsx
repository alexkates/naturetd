import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Nature's Last Stand",
    template: "%s · Nature's Last Stand",
  },
  description:
    "An endless maze tower-defense game where natural defenses protect the city from a stampede.",
  icons: {
    icon: "/assets/towers/thorn.png",
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
