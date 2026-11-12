import type { Metadata } from "next";
import { Montserrat, Source_Serif_4 } from "next/font/google";
import "./globals.css";

/*
 * The brand guide's sanctioned webfonts are Clavo (headings) and Montserrat
 * (body); Clavo is commercial, so Source Serif 4 stands in for the serif
 * voice of Chronicle. next/font downloads these at build time and serves
 * them from our own origin — important because phones on the meeting wifi
 * often have no route to the internet.
 */
const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ChapterVote",
  description: "Ranked-choice voting for chapter elections",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${montserrat.variable} ${sourceSerif.variable}`}>
      <body className="min-h-screen bg-surface text-on-surface antialiased">
        <div className="app-root">{children}</div>
      </body>
    </html>
  );
}
