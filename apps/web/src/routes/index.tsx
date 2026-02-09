import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { ArchitectureDiagram } from "@/components/architecture-diagram";
import Download3 from "@/icons/Download3";
import Plug from "@/icons/Plug";
import Server from "@/icons/Server";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/")({
  component: HomePage,
});

type ToolRow = {
  tool: string;
  description: string;
};

type QuickstartBlock = {
  title: string;
  code: string;
  icon: React.ReactNode;
};

const tools: ToolRow[] = [
  { tool: "navigate", description: "Navigate to a URL" },
  { tool: "computer", description: "Mouse/keyboard actions, screenshots" },
  { tool: "read_page", description: "Get accessibility tree with element refs" },
  { tool: "get_page_text", description: "Get plain text content" },
  { tool: "find", description: "AI-powered natural language element search" },
  { tool: "form_input", description: "Set form field values" },
  { tool: "javascript", description: "Execute JavaScript" },
  { tool: "tabs_list", description: "List managed tabs" },
  { tool: "tabs_create", description: "Create new tab" },
  { tool: "tabs_close", description: "Close tab" },
  { tool: "cookies_get/set", description: "Manage cookies" },
  { tool: "storage_get/set", description: "Manage localStorage/sessionStorage" },
  { tool: "recording_start/stop", description: "Record browser session" },
  { tool: "gif_export", description: "Export as GIF" },
];

const quickstartBlocks: QuickstartBlock[] = [
  {
    title: "1) Install",
    code: "npm i -g web-browser\n\n# or from source\nbun install\nbun run build",
    icon: <Download3 size={18} />,
  },
  {
    title: "2) One-time setup",
    code: "web-browser install-native\n\nchrome://extensions\nLoad unpacked: packages/extension/.output/chrome-mv3",
    icon: <Plug size={18} />,
  },
  {
    title: "3) Run + connect",
    code: "web-browser daemon\n\nMCP: http://127.0.0.1:49321/mcp",
    icon: <Server size={18} />,
  },
];

function HomePage() {
  const [archMode, setArchMode] = useState<"default" | "cdp">("default");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="mx-auto w-full max-w-[1040px] px-5 pb-16">
        <Hero />
        <DocsNav />
        <Section id="quickstart" title="Quickstart">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {quickstartBlocks.map((b) => (
              <CodeCard key={b.title} title={b.title} code={b.code} icon={b.icon} />
            ))}
          </div>
        </Section>
        <Section id="architecture" title="Architecture">
          <div className="rounded-xl border border-border bg-panel p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setArchMode("default")}
                  className={cn(
                    "rounded-md border px-2 py-1 font-mono text-[12px] transition-colors",
                    archMode === "default"
                      ? "border-accent/40 bg-accent/10 text-foreground"
                      : "border-border bg-background text-muted hover:text-foreground",
                  )}
                >
                  Default
                </button>
                <button
                  type="button"
                  onClick={() => setArchMode("cdp")}
                  className={cn(
                    "rounded-md border px-2 py-1 font-mono text-[12px] transition-colors",
                    archMode === "cdp"
                      ? "border-accent/40 bg-accent/10 text-foreground"
                      : "border-border bg-background text-muted hover:text-foreground",
                  )}
                >
                  Direct CDP
                </button>
              </div>
              <a
                className="text-sm text-muted underline-offset-4 hover:underline"
                href="https://github.com/AryaLabsHQ/browser-mcp"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
            </div>
            <ArchitectureDiagram className="h-auto w-full" mode={archMode} />
            <div className="mt-3 font-mono text-[12px] text-muted">
              {archMode === "default"
                ? "Client → Daemon → Bridge → Extension → Chrome"
                : "Client → Daemon → Chrome (CDP)"}
            </div>
          </div>
        </Section>
        <Section id="tools" title="Tools">
          <div className="overflow-hidden rounded-xl border border-border bg-panel">
            <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2">
              {tools.map((t) => (
                <div key={t.tool} className="bg-panel p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-mono text-[13px] text-foreground">
                      {t.tool}
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-muted">{t.description}</div>
                </div>
              ))}
            </div>
          </div>
        </Section>
        <Section id="privacy" title="Security & Privacy">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <InfoCard
              title="Local-first by default"
              body="Most functionality runs locally: daemon on localhost, bridge via native messaging, extension in your browser."
            />
            <InfoCard
              title="AI-powered find is optional"
              body="The `find` tool may call Anthropic if you configure `ANTHROPIC_API_KEY`. If not configured, it won’t make that request."
            />
            <InfoCard
              title="Transparent permissions"
              body="The extension needs access to the active tab to read DOM/a11y trees when you explicitly run tools."
            />
          </div>
        </Section>
        <Footer />
      </main>
    </div>
  );
}

function Header() {
  return (
    <div className="border-b border-border bg-background/70 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1040px] items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className="h-6 w-6 rounded-md border border-border bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.35),rgba(16,185,129,0.0)_60%),linear-gradient(180deg,#0f0f0f,#0a0a0a)]"
            aria-hidden="true"
          />
          <div className="leading-tight">
            <div className="font-medium text-[15px] text-foreground">Web Browser</div>
            <div className="font-mono text-[12px] text-muted">MCP for browser automation</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a
            className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
            href="/privacy"
          >
            Privacy
          </a>
          <a
            className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
            href="https://github.com/AryaLabsHQ/browser-mcp"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <div className="pt-12 pb-10 md:pt-16">
      <div className="max-w-[820px]">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-1 text-sm text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="font-mono text-[12px]">Streamable HTTP</span>
          <span className="text-muted/70">|</span>
          <span className="font-mono text-[12px]">Chrome extension</span>
          <span className="text-muted/70">|</span>
          <span className="font-mono text-[12px]">CDP fallback</span>
        </div>
        <h1 className="mt-5 text-balance font-semibold text-4xl leading-[1.05] md:text-6xl">
          Automate a real browser via MCP.
        </h1>
        <p className="mt-4 text-pretty text-[15px] leading-7 text-muted md:text-lg">
          Web Browser is an MCP server that controls Chrome through a local
          daemon + native bridge + extension, with an optional direct-CDP mode.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <a
            className="inline-flex items-center justify-center rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
            href="#quickstart"
          >
            Quickstart
          </a>
          <a
            className="inline-flex items-center justify-center rounded-lg border border-border bg-panel px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-border/70"
            href="#tools"
          >
            Tools
          </a>
          <a
            className="inline-flex items-center justify-center rounded-lg border border-border bg-panel px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-border/70"
            href="https://github.com/AryaLabsHQ/browser-mcp#installation"
            target="_blank"
            rel="noreferrer"
          >
            Install
          </a>
        </div>
      </div>
    </div>
  );
}

function DocsNav() {
  const links = useMemo(
    () => [
      { href: "#quickstart", label: "Quickstart" },
      { href: "#architecture", label: "Architecture" },
      { href: "#tools", label: "Tools" },
      { href: "#privacy", label: "Privacy" },
    ],
    [],
  );

  return (
    <div className="mb-10 flex flex-wrap items-center gap-2">
      {links.map((l) => (
        <a
          key={l.href}
          className="rounded-full border border-border bg-panel px-3 py-1.5 text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
          href={l.href}
        >
          {l.label}
        </a>
      ))}
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 py-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 className="font-semibold text-2xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function CodeCard({
  title,
  code,
  icon,
}: {
  title: string;
  code: string;
  icon?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 900);
    } catch {
      // ignore
    }
  }, [code]);

  return (
    <div className="rounded-xl border border-border bg-panel p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-mono text-[12px] text-muted">
          {icon ? (
            <span className="grid h-7 w-7 place-items-center rounded-md border border-border bg-background text-muted transition-colors hover:text-foreground">
              {icon}
            </span>
          ) : null}
          <span>{title}</span>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className={cn(
            "rounded-md border px-2 py-1 font-mono text-[12px] transition-colors",
            copied
              ? "border-accent/40 bg-accent/10 text-foreground"
              : "border-border bg-background text-muted hover:text-foreground",
          )}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <CodeBlock code={code} />
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-auto rounded-lg border border-border bg-black/60 p-3 font-mono text-[12px] leading-5 text-foreground">
      <code>{code}</code>
    </pre>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4 md:p-5">
      <div className="font-medium text-[15px]">{title}</div>
      <div className="mt-2 text-sm leading-6 text-muted">{body}</div>
    </div>
  );
}

function Footer() {
  return (
    <div className="mt-10 border-t border-border pt-8 text-sm text-muted">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="font-mono text-[12px]">
          {new Date().getFullYear()} Web Browser
        </div>
        <div className="flex items-center gap-4">
          <a className="hover:text-foreground" href="/privacy">
            Privacy
          </a>
          <a
            className="hover:text-foreground"
            href="https://github.com/AryaLabsHQ/browser-mcp"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <a className="hover:text-foreground" href="#quickstart">
            Quickstart
          </a>
        </div>
      </div>
    </div>
  );
}
