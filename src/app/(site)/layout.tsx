import localFont from "next/font/local";

import { SiteFooter } from "@/components/site/site-footer";

// The public site's one theme: the feed, permalinks, tag and passage pages.
// A single calm column set in Source Serif 4, which is served from this site
// (src/fonts/source-serif-4, SIL Open Font License) and also draws the Open
// Graph images, so a shared item previews in the type it is read in. The
// styles are the `.site` rules in src/app/globals.css.
const serif = localFont({
  src: [
    { path: "../../fonts/source-serif-4/SourceSerif4-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../fonts/source-serif-4/SourceSerif4-It.woff2", weight: "400", style: "italic" },
    { path: "../../fonts/source-serif-4/SourceSerif4-Semibold.woff2", weight: "600", style: "normal" },
    { path: "../../fonts/source-serif-4/SourceSerif4-SemiboldIt.woff2", weight: "600", style: "italic" },
  ],
  variable: "--font-site-serif",
  display: "swap",
});

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`site ${serif.variable}`}>
      {children}
      <SiteFooter />
    </div>
  );
}
