import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Keep or Return — A little clarity for your skincare shelf",
  description:
    "A personal skincare diary powered by YouCam. Track product claims against your own baseline and make a considered decision before the return window closes.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
