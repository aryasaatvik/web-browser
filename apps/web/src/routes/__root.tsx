import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import appCss from "../styles.css?url";
import { useEffect } from "react";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        title: "Web Browser",
      },
      {
        name: "description",
        content: "MCP server for browser automation via Chrome extension.",
      },
      { property: "og:title", content: "Web Browser" },
      {
        property: "og:description",
        content: "MCP server for browser automation via Chrome extension.",
      },
      { property: "og:url", content: "https://web-browser.arya.sh" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Web Browser" },
      {
        name: "twitter:description",
        content: "MCP server for browser automation via Chrome extension.",
      },
    ],
    links: [
      { rel: "icon", href: "/favicon.svg" },
      { rel: "shortcut icon", href: "/favicon.svg" },
      { rel: "apple-touch-icon", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&family=Geist:wght@100..900&display=swap",
      },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (import.meta.env.DEV) {
      import("react-grab/core").then(({ init }) => {
        init({ activationKey: "Meta+c" });
      });
    }
  }, []);

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body
        className="antialiased"
        style={{
          fontFamily: "var(--font-sans)",
          fontVariationSettings: "'wght' 400",
        }}
      >
        {children}
        {process.env.NODE_ENV !== "production" && (
          <TanStackDevtools
            config={{ position: "bottom-right" }}
            plugins={[
              {
                name: "TanStack Router",
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        )}
        <Scripts />
      </body>
    </html>
  );
}
