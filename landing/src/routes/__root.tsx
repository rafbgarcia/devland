import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"

import appCss from "../styles.css?url"

export const Route = createRootRoute({
  head: () => {
    const baseUrl = import.meta.env.BASE_URL;

    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: "Devland" },
        {
          name: "description",
          content: "Integrated per-repository development environment",
        },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "icon", href: `${baseUrl}favicon.ico`, sizes: "any" },
        { rel: "apple-touch-icon", href: `${baseUrl}devland.png` },
        { rel: "manifest", href: `${baseUrl}manifest.json` },
        {
          rel: "preconnect",
          href: "https://fonts.googleapis.com",
        },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossOrigin: "anonymous",
        },
      ],
    };
  },
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-zinc-950 font-sans antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
