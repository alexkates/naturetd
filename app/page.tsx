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
    "Build a living maze of animal guardians and cleanse endless waves of whimsical Blightlings before they reach the Heartwood.";

  return {
    title: { absolute: title },
    description,
    openGraph: {
      title,
      description,
      images: [{ url: `${origin}/og-v2.png`, width: 1672, height: 941 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/og-v2.png`],
    },
  };
}

export default function Home() {
  return <NatureDefenseGame />;
}
