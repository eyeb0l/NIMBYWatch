import type { Metadata } from "next";
import "./globals.css";
import "mapbox-gl/dist/mapbox-gl.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { Header } from "@/components/header";
export const metadata: Metadata = {
  title: "NIMBYWatch | London planning, in public",
  description:
    "Explore real Camden planning applications, outcomes and source-backed planning evidence.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB">
      <body>
        <Header />
        {children}
        <footer className="site-footer">
          <span>
            NIMBYWatch{" "}
            <span className="muted">
              An independent view of London planning.
            </span>
          </span>
          <a href="/methodology">
            Public records. Visible evidence. Clear limits.
          </a>
        </footer>
      </body>
    </html>
  );
}
