import type { Metadata } from "next";
import "./globals.css";
import { AppBootstrap } from "@/components/auth/AppBootstrap";
import { NamePromptModal } from "@/components/auth/NamePromptModal";
import { AccountTypePromptModal } from "@/components/auth/AccountTypePromptModal";

export const metadata: Metadata = {
  title: "MeasureSheets",
  description: "Real-time collaborative measurement sheets",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AppBootstrap>
          {children}
          <NamePromptModal />
          <AccountTypePromptModal />
        </AppBootstrap>
      </body>
    </html>
  );
}