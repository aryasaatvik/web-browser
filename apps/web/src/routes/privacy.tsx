import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy Policy - Web Browser" },
      {
        name: "description",
        content:
          "Privacy Policy for Web Browser Chrome Extension + MCP daemon - Learn how we handle data.",
      },
    ],
  }),
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-[860px] px-5 py-12">
        <header className="mb-10">
          <a
            className="font-mono text-[12px] text-muted underline-offset-4 hover:text-foreground hover:underline"
            href="/"
          >
            ← Back
          </a>
          <h1 className="mt-4 font-semibold text-4xl">Privacy Policy</h1>
          <p className="mt-3 text-sm text-muted">
            Last updated: February 9, 2026
          </p>
        </header>

        <main className="space-y-10 text-sm leading-7 text-muted">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              Overview
            </h2>
            <p>
              Web Browser is a local-first MCP server and Chrome extension for
              browser automation. We aim to minimize data collection and keep
              processing on your device whenever possible.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              What We Collect
            </h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <span className="text-foreground font-medium">
                  We do not run a Web Browser backend service that receives your
                  browsing data by default.
                </span>{" "}
                The daemon runs on your machine and exposes an MCP endpoint on
                localhost.
              </li>
              <li>
                <span className="text-foreground font-medium">
                  The extension may store preferences locally
                </span>{" "}
                (for example: settings) using Chrome storage.
              </li>
              <li>
                <span className="text-foreground font-medium">
                  Optional AI requests:
                </span>{" "}
                If you configure <code className="font-mono">ANTHROPIC_API_KEY</code>
                , the <code className="font-mono">find</code> tool may send a
                description of the page or relevant context to Anthropic to
                locate elements. If not configured, the tool should not perform
                that external request.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              How We Use Information
            </h2>
            <p>
              Web Browser uses local information to automate your browser
              actions when you invoke MCP tools (navigate, click, type, read
              page text, etc.). Optional third-party AI calls are only used to
              improve element search when enabled.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              Chrome Permissions
            </h2>
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-panel p-4">
                <div className="font-mono text-[13px] text-foreground">
                  activeTab
                </div>
                <div className="mt-1">
                  Allows accessing the current tab when you explicitly run a tool
                  that needs it (for example: reading the DOM/a11y tree).
                </div>
              </div>
              <div className="rounded-xl border border-border bg-panel p-4">
                <div className="font-mono text-[13px] text-foreground">
                  storage
                </div>
                <div className="mt-1">
                  Stores preferences locally in your browser (no server sync by
                  us).
                </div>
              </div>
              <div className="rounded-xl border border-border bg-panel p-4">
                <div className="font-mono text-[13px] text-foreground">
                  clipboardWrite
                </div>
                <div className="mt-1">
                  Enables copying results to your clipboard when requested.
                </div>
              </div>
              <div className="rounded-xl border border-border bg-panel p-4">
                <div className="font-mono text-[13px] text-foreground">
                  host_permissions (&lt;all_urls&gt;)
                </div>
                <div className="mt-1">
                  Required for the extension to operate on arbitrary pages when
                  you invoke tools.
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              Data Retention
            </h2>
            <p>
              Web Browser does not store your browsing content on our servers by
              default. Any locally stored preferences remain on your device
              until you clear extension storage or uninstall the extension.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              Contact
            </h2>
            <p>
              For questions about this policy, open an issue on{" "}
              <a
                className="text-foreground underline-offset-4 hover:underline"
                href="https://github.com/AryaLabsHQ/browser-mcp"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
              .
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}

