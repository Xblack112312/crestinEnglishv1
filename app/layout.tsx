import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import Provider from "@/components/Provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Crest In English",
  description: "Learn English. Think with it.",
};

export default function RootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "overflow-x-hidden",
        "antialiased",
        inter.variable,
        "font-sans",
      )}
    >
      <body className="flex min-h-full flex-col">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
