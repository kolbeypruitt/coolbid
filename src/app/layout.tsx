import type { Metadata } from "next";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://coolbid.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "coolbid — Floorplan in. Bill of materials out.",
    template: "%s · coolbid",
  },
  description:
    "HVAC estimating for residential contractors. Upload a floorplan, get a priced bill of materials in about a minute.",
  applicationName: "coolbid",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/brand/icons/mark-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/icons/mark-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/brand/icons/mark-192.png",
  },
  openGraph: {
    type: "website",
    siteName: "coolbid",
    title: "coolbid — Floorplan in. Bill of materials out.",
    description:
      "HVAC estimating for residential contractors. Upload a floorplan, get a priced bill of materials in about a minute.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "coolbid — Floorplan in. Bill of materials out.",
    description:
      "HVAC estimating for residential contractors. Upload a floorplan, get a priced bill of materials in about a minute.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
