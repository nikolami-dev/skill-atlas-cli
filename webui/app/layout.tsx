import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skill Atlas",
  description: "Browse agent skills found by skill-atlas scan",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
