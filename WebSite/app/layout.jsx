import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata = {
  title: "LEJAK — Work lighter. Move faster.",
  description:
    "LEJAK builds websites, chatbots and automations, and trains teams to use them. Technology that gives people time back.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
