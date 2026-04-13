import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Scanner",
  description: "Job scanner dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
