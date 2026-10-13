import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Selah", template: "%s · Selah" },
  description: "A self-hostable, open source lifestream for daily Bible reading.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased dark:bg-stone-950 dark:text-stone-100">
        {children}
      </body>
    </html>
  );
}
