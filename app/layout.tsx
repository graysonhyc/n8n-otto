import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "n8n Backoffice",
  description:
    "The operational control room for enterprise automations and AI agents.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
