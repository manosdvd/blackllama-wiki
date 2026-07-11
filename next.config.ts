import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  workboxOptions: {
    disableDevLogs: true,
  },
});

const nextConfig: NextConfig = {
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      }
    ],
  },
  experimental: {
    optimizePackageImports: ['lucide-react']
  },
  logging: {
    browserToTerminal: 'warn',
    fetches: {
      fullUrl: true,
    },
  },
  ...(process.env.NODE_ENV === 'production'
    ? { transpilePackages: ['firebase-admin', 'jwks-rsa', 'jose'] }
    : {}),
};

export default process.env.NODE_ENV === 'development' ? nextConfig : withPWA(nextConfig);
