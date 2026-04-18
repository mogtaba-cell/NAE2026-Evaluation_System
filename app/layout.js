import "./globals.css";

export const metadata = {
  title: "National Art Expressions",
  description: "Evaluation and selection platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
