import type { Metadata } from "next";
import { headers } from "next/headers";
import NatureDefenseGame from "./game";

export async function generateMetadata(): Promise<Metadata> {
  const incomingHeaders = await headers();
  const host =
    incomingHeaders.get("x-forwarded-host") ??
    incomingHeaders.get("host") ??
    "localhost";
  const protocol =
    incomingHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "Nature's Last Stand";
  const description =
    "Build a living maze and hold back an endless animal stampede in this browser tower-defense game.";

  return {
    title: { absolute: title },
    description,
    openGraph: {
      title,
      description,
      images: [{ url: `${origin}/og.png`, width: 1731, height: 909 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export default function Home() {
  return <NatureDefenseGame />;
}
