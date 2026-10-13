import type { Metadata } from "next";

import { OwnerBar } from "@/components/owner/owner-bar";
import { getSiteTitle } from "@/lib/site";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const title = await getSiteTitle();
  return {
    title: { default: title, template: `%s · ${title}` },
    description: "A self-hostable, open source lifestream for daily Bible reading.",
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased dark:bg-stone-950 dark:text-stone-100">
        <OwnerBar />
        {children}
      </body>
    </html>
  );
}
