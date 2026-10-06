import "./globals.css";

export const metadata = {
  title: "REIGN OSINT | Business Discovery",
  description: "Discover and enrich public business intelligence by ZIP code and quadrant.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
