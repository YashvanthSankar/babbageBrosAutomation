import type { Metadata } from "next";

export const metadata: Metadata = { title: "Attendly API", description: "Attendance risk backend" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f4f8f6", color: "#142521" }}>{children}</body>
    </html>
  );
}
