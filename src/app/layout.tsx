import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Inter, Lexend } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import EmbersBackground from "@/components/ui/EmbersBackground";
import { AuthProvider } from "@/components/auth/AuthContext";

const atkinson = Atkinson_Hyperlegible({ 
  weight: ['400', '700'],
  subsets: ["latin"],
  variable: '--font-atkinson',
});

const inter = Inter({ 
  subsets: ["latin"],
  variable: '--font-inter',
});

const lexend = Lexend({
  subsets: ["latin"],
  variable: '--font-lexend',
});

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
    <html lang="en" className={`${atkinson.variable} ${inter.variable} ${lexend.variable}`}>
      <body>
        <AuthProvider>
          <EmbersBackground />
          <Header />
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
