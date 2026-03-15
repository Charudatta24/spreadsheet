import type { Metadata } from "next";
import "./globals.css";
import { AppBootstrap } from "@/components/auth/AppBootstrap";

export const metadata: Metadata = {
  title: "FluxWork",
  description: "Real-time collaborative spreadsheets",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AppBootstrap>{children}</AppBootstrap>
      </body>
    </html>
  );
}