import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import type { Viewport } from "next";

export const metadata: Metadata = {
  title: "Cifras Litúrgicas",
  description: "Cifras litúrgicas com transposição de acordes offline para músicos católicos",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

import OfflineSyncManager from "@/components/OfflineSyncManager";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: 'document.addEventListener("touchstart", function() {}, {passive: true});' }} />
      </head>
      <body className="min-h-full flex flex-col">
        <OfflineSyncManager>
          {children}
        </OfflineSyncManager>
      </body>
    </html>
  );
}
