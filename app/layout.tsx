import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClutchTopUp",
  description: "Digital gaming top-up platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}