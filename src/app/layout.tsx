import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import EmbersBackground from "@/components/ui/EmbersBackground";

const atkinson = Atkinson_Hyperlegible({ 
  weight: ['400', '700'],
  subsets: ["latin"],
  variable: '--font-atkinson',
});

const inter = Inter({ 
  subsets: ["latin"],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: "Camp Lawton Staff Hub",
  description: "Offline-first handbook and operational hub for Camp Lawton Staff.",
  manifest: "/manifest.json",
  themeColor: "#0c0a09",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${atkinson.variable} ${inter.variable}`}>
      <body>
        <EmbersBackground />
        <Header />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
          {children}
        </main>
      </body>
    </html>
  );
}
