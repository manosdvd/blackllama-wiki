import type { Metadata, Viewport } from "next";
import { Inter, Atkinson_Hyperlegible } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import EmbersBackground from "@/components/ui/EmbersBackground";
import { AuthProvider } from "@/components/auth/AuthContext";
import PwaUpdater from "@/components/layout/PwaUpdater";

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const atkinson = Atkinson_Hyperlegible({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-atkinson', display: 'swap' });

export const metadata: Metadata = {
  title: "Camp Lawton Staff Hub",
  description: "Offline-first handbook and operational hub for Camp Lawton Staff.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0c0a09",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${atkinson.variable}`}>
      <body>
        <AuthProvider>
          <a href="#main-content" className="skip-link">Skip to Main Content</a>
          <EmbersBackground />
          <Header />
          <main id="main-content" tabIndex={-1} style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1, outline: 'none' }}>
            {children}
          </main>
          <BottomNav />
          <PwaUpdater />
        </AuthProvider>
      </body>
    </html>
  );
}
