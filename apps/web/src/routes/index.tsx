import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { ArchitectureDiagram } from "@/components/architecture-diagram";
import Download3 from "@/icons/download";
import GitHub from "@/icons/github";
import Mcp from "@/icons/mcp";
import Plug from "@/icons/plug";
import Server from "@/icons/server";
import Terminal from "@/icons/terminal";
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
  lang: "sh" | "json";
  icon: React.ReactNode;
  code?: string;
  copy?: string;
  tabs?: {
    id: "npm" | "pnpm" | "bun";
    label: string;
    code: string;
    copy?: string;
  }[];
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
    title: "Install",
    lang: "sh",
    icon: <Download3 size={18} />,
    tabs: [
      {
        id: "npm",
        label: "npm",
        code: "npm i -g web-browser\n\n# or from source\nbun install\nbun run build",
        copy: "npm i -g web-browser",
      },
      {
        id: "pnpm",
        label: "pnpm",
        code: "pnpm add -g web-browser\n\n# or from source\nbun install\nbun run build",
        copy: "pnpm add -g web-browser",
      },
      {
        id: "bun",
        label: "bun",
        code: "bun add -g web-browser\n\n# or from source\nbun install\nbun run build",
        copy: "bun add -g web-browser",
      },
    ],
  },
  {
    title: "One-time setup",
    code:
      "web-browser install-native\n\n# Extension (recommended)\n# 1) Download the extension zip from:\n#    https://github.com/aryasaatvik/web-browser/releases\n# 2) Unzip it\n# 3) chrome://extensions -> Developer mode -> Load unpacked\n#    Select the unzipped folder\n\n# Extension (from source)\nbun run build:extension\n# Load unpacked: packages/extension/.output/chrome-mv3",
    lang: "sh",
    icon: <Plug size={18} />,
    copy: "web-browser install-native",
  },
  {
    title: "Run + connect",
    code: "web-browser daemon\n\nMCP: http://127.0.0.1:49321/mcp",
    lang: "sh",
    icon: <Mcp size={18} />,
    copy: "web-browser daemon",
  },
  {
    title: "MCP server config",
    code:
      "{\n  \"web-browser\": {\n    \"url\": \"http://127.0.0.1:49321/mcp\"\n  }\n\n  // Stdio-only clients: bridge HTTP -> stdio via mcp-remote\n  // \"web-browser\": {\n  //   \"command\": \"npx\",\n  //   \"args\": [\"-y\", \"mcp-remote@latest\", \"http://127.0.0.1:49321/mcp\"]\n  // }\n}\n",
    lang: "json",
    icon: <Server size={18} />,
    copy: "{\n  \"web-browser\": {\n    \"url\": \"http://127.0.0.1:49321/mcp\"\n  }\n}\n",
  },
];

function HomePage() {
  const [archMode, setArchMode] = useState<"default" | "cdp">("default");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="mx-auto w-full max-w-[1040px] px-5 pb-16">
        <Hero />
        <Section id="quickstart" title="Quickstart">
          <div className="flex flex-col gap-4">
            {quickstartBlocks.map((b) => (
              <CodeCard
                key={b.title}
                title={b.title}
                code={b.code}
                tabs={b.tabs}
                lang={b.lang}
                icon={b.icon}
              />
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
                className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
                href="https://github.com/aryasaatvik/web-browser"
                target="_blank"
                rel="noreferrer"
              >
                <GitHub size={16} className="text-muted" />
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
        <div className="hidden items-center gap-4 md:flex">
          <a
            className="text-sm text-muted hover:text-foreground"
            href="#quickstart"
          >
            Quickstart
          </a>
          <a
            className="text-sm text-muted hover:text-foreground"
            href="#architecture"
          >
            Architecture
          </a>
          <a
            className="text-sm text-muted hover:text-foreground"
            href="#tools"
          >
            Tools
          </a>
          <a
            className="text-sm text-muted hover:text-foreground"
            href="/privacy"
          >
            Privacy
          </a>
          <a
            className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
            href="https://github.com/aryasaatvik/web-browser"
            target="_blank"
            rel="noreferrer"
          >
            <GitHub size={16} className="text-muted" />
            GitHub
          </a>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  const command = "npm i -g web-browser";

  return (
    <div className="relative pt-12 pb-10 md:pt-16">
      <div
        className="pointer-events-none absolute inset-[-40px] opacity-[0.22]"
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(closest-side at 30% 30%, black 0%, transparent 72%)",
          WebkitMaskImage:
            "radial-gradient(closest-side at 30% 30%, black 0%, transparent 72%)",
        }}
      />

      <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-2 md:gap-10">
        <div className="max-w-[820px]">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-1 text-sm text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            <span className="font-mono text-[12px]">Streamable HTTP</span>
            <span className="text-muted/70">|</span>
            <span className="font-mono text-[12px]">Chrome extension</span>
            <span className="text-muted/70">|</span>
            <span className="font-mono text-[12px]">Direct CDP</span>
          </div>
          <h1 className="mt-5 text-balance font-semibold text-4xl leading-[1.05] md:text-6xl">
            Automate a real browser via MCP.
          </h1>
          <p className="mt-4 text-pretty text-[15px] leading-7 text-muted md:text-lg">
            Web Browser controls Chrome through a local daemon + native bridge +
            extension, with an optional direct-CDP mode.
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <CommandBar command={command} />
            <div className="flex flex-wrap items-center gap-3">
              <NavButton variant="primary" href="#quickstart">
                Get started
              </NavButton>
              <NavButton
                href="https://github.com/aryasaatvik/web-browser#installation"
                target="_blank"
                rel="noreferrer"
                title="Opens the GitHub README installation section (CLI + extension setup)."
              >
                <GitHub size={16} className="-ml-0.5" />
                GitHub install
              </NavButton>
            </div>
          </div>
        </div>

        <HeroCodePanel />
      </div>
    </div>
  );
}

function CommandBar({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 900);
    } catch {
      // ignore
    }
  }, [command]);

  return (
    <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-panel px-3 py-2">
      <div className="flex items-center gap-2 text-muted">
        <Terminal size={18} />
        <div className="font-mono text-[13px] text-foreground">{command}</div>
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
  );
}

function HeroCodePanel() {
  const configCode = `{\n  \"web-browser\": {\n    \"url\": \"http://127.0.0.1:49321/mcp\"\n  }\n\n  // If your client only supports stdio, use mcp-remote:\n  // \"web-browser\": {\n  //   \"command\": \"npx\",\n  //   \"args\": [\"-y\", \"mcp-remote@latest\", \"http://127.0.0.1:49321/mcp\"]\n  // }\n}\n`;

  const endpointCode = `# Start the daemon\nweb-browser daemon\n\n# MCP endpoint (Streamable HTTP)\nhttp://127.0.0.1:49321/mcp\n`;

  const [copied, setCopied] = useState<"config" | "endpoint" | null>(null);
  const onCopy = useCallback(async (which: "config" | "endpoint") => {
    try {
      const text = which === "config" ? configCode : endpointCode;
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 900);
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-panel">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.22]"
        aria-hidden="true"
        style={{
          backgroundImage:
            "radial-gradient(closest-side at 20% 15%, rgba(16,185,129,0.30), transparent 60%)",
        }}
      />
      <div className="relative border-b border-border px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#2a2a2a]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#2a2a2a]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#2a2a2a]" />
        </div>
      </div>

      <div className="relative bg-black/50">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 text-[12px] text-muted">
          <div className="flex items-center gap-3">
            <span className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px]">
              Step 1
            </span>
            <span className="font-mono">endpoint</span>
          </div>
          <button
            type="button"
            onClick={() => onCopy("endpoint")}
            className={cn(
              "rounded-md border px-2 py-1 font-mono text-[12px] transition-colors",
              copied === "endpoint"
                ? "border-accent/40 bg-accent/10 text-foreground"
                : "border-border bg-background text-muted hover:text-foreground",
            )}
            aria-label="Copy endpoint"
          >
            {copied === "endpoint" ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="max-h-[200px] overflow-auto p-4 font-mono text-[12px] leading-5 text-foreground">
          <HighlightedCode code={endpointCode} lang="sh" />
        </div>

        <div className="flex items-center justify-between gap-3 border-y border-border px-4 py-2 text-[12px] text-muted">
          <div className="flex items-center gap-3">
            <span className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px]">
              Step 2
            </span>
            <span className="font-mono">mcp.config.jsonc</span>
          </div>
          <button
            type="button"
            onClick={() => onCopy("config")}
            className={cn(
              "rounded-md border px-2 py-1 font-mono text-[12px] transition-colors",
              copied === "config"
                ? "border-accent/40 bg-accent/10 text-foreground"
                : "border-border bg-background text-muted hover:text-foreground",
            )}
            aria-label="Copy config"
          >
            {copied === "config" ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="max-h-[260px] overflow-auto p-4 font-mono text-[12px] leading-5 text-foreground">
          <HighlightedCode code={configCode} lang="json" />
        </div>
      </div>
    </div>
  );
}

function HighlightedCode(props: { code: string; lang: "sh" | "json" }) {
  const lines = props.code.replace(/\n$/, "").split("\n");

  return (
    <div className="grid grid-cols-[34px_1fr] gap-x-3">
      {lines.map((line, idx) => (
        <div key={idx} className="contents">
          <div className="select-none text-right text-[11px] text-muted/70">
            {String(idx + 1).padStart(2, " ")}
          </div>
          <div className="whitespace-pre">
            {props.lang === "json"
              ? highlightJsonLine(line, idx)
              : highlightShellLine(line, idx)}
          </div>
        </div>
      ))}
    </div>
  );
}

function highlightShellLine(line: string, keyBase: number) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("#")) {
    return (
      <span key={keyBase} className="text-muted">
        {line}
      </span>
    );
  }

  const parts = line.split(/(\s+)/);
  let k = keyBase * 1000;
  return parts.map((p) => {
    if (p.trim() === "") return <span key={k++}>{p}</span>;
    if (/^https?:\/\//.test(p)) {
      return (
        <span key={k++} className="text-[#5EEAD4]">
          {p}
        </span>
      );
    }
    if (p === "web-browser" || p === "npx") {
      return (
        <span key={k++} className="text-[#34D399]">
          {p}
        </span>
      );
    }
    if (p.startsWith("-")) {
      return (
        <span key={k++} className="text-[#FCD34D]">
          {p}
        </span>
      );
    }
    return <span key={k++}>{p}</span>;
  });
}

function highlightJsonLine(line: string, keyBase: number) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("//")) {
    return (
      <span key={keyBase} className="text-muted">
        {line}
      </span>
    );
  }

  // Minimal JSON tokenizer: keys, strings, numbers, booleans/null, punctuation.
  const out: React.ReactNode[] = [];
  let i = 0;
  let k = keyBase * 1000;

  const push = (text: string, cls?: string) => {
    if (!text) return;
    out.push(
      <span key={k++} className={cls}>
        {text}
      </span>,
    );
  };

  const isNumStart = (c: string) => c === "-" || (c >= "0" && c <= "9");

  while (i < line.length) {
    const c = line[i];

    if (c === " " || c === "\t") {
      let j = i + 1;
      while (j < line.length && (line[j] === " " || line[j] === "\t")) j++;
      push(line.slice(i, j));
      i = j;
      continue;
    }

    if (c === '"' /* string */) {
      let j = i + 1;
      let escaped = false;
      while (j < line.length) {
        const cc = line[j];
        if (!escaped && cc === '"') {
          j++;
          break;
        }
        escaped = !escaped && cc === "\\";
        j++;
      }
      const str = line.slice(i, j);

      // Detect key: "foo": ...
      let t = j;
      while (t < line.length && (line[t] === " " || line[t] === "\t")) t++;
      const isKey = line[t] === ":";
      push(str, isKey ? "text-[#93C5FD]" : "text-[#5EEAD4]");
      i = j;
      continue;
    }

    if ("{}[]:,".includes(c)) {
      push(c, "text-muted/80");
      i++;
      continue;
    }

    if (isNumStart(c)) {
      let j = i + 1;
      while (j < line.length && /[0-9.]/.test(line[j])) j++;
      push(line.slice(i, j), "text-[#FCD34D]");
      i = j;
      continue;
    }

    const rest = line.slice(i);
    const kw =
      rest.startsWith("true")
        ? "true"
        : rest.startsWith("false")
          ? "false"
          : rest.startsWith("null")
            ? "null"
            : null;
    if (kw) {
      push(kw, "text-[#34D399]");
      i += kw.length;
      continue;
    }

    // Fallback: emit one char
    push(c);
    i++;
  }

  return out;
}

function NavButton(
  props: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    variant?: "primary" | "secondary";
  },
) {
  const { variant = "secondary", className, ...rest } = props;
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors";
  const styles =
    variant === "primary"
      ? "border-transparent bg-foreground text-background hover:bg-foreground/90"
      : "border-border bg-panel text-foreground hover:border-border/70";
  return <a className={cn(base, styles, className)} {...rest} />;
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
  lang,
  tabs,
  copy,
  icon,
}: {
  title: string;
  code?: string;
  lang: "sh" | "json";
  tabs?: {
    id: "npm" | "pnpm" | "bun";
    label: string;
    code: string;
    copy?: string;
  }[];
  copy?: string;
  icon?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"npm" | "pnpm" | "bun">(tabs?.[0]?.id ?? "npm");

  const activeCode = tabs ? tabs.find((t) => t.id === tab)?.code ?? tabs[0].code : code ?? "";
  const copyText =
    tabs
      ? tabs.find((t) => t.id === tab)?.copy ?? firstShellCommand(activeCode) ?? activeCode
      : copy ?? (lang === "sh" ? firstShellCommand(activeCode) ?? activeCode : activeCode);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 900);
    } catch {
      // ignore
    }
  }, [copyText]);

  return (
    <div className="rounded-xl border border-border bg-panel p-4 md:p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex items-center gap-2 font-mono text-[12px] text-muted">
          {icon ? (
            <span className="grid h-7 w-7 place-items-center rounded-md border border-border bg-background text-muted transition-colors hover:text-foreground">
              {icon}
            </span>
          ) : null}
          <span>{title}</span>
        </div>
        {tabs ? (
          <div className="hidden items-center gap-1 rounded-full border border-border bg-background p-1 sm:flex">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded-full px-2.5 py-1 font-mono text-[12px] transition-colors",
                  tab === t.id
                    ? "bg-panel text-foreground"
                    : "text-muted hover:text-foreground",
                )}
                aria-label={`Show ${t.label} install`}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          onClick={onCopy}
          className={cn(
            "ml-auto rounded-md border px-2 py-1 font-mono text-[12px] transition-colors",
            copied
              ? "border-accent/40 bg-accent/10 text-foreground"
              : "border-border bg-background text-muted hover:text-foreground",
          )}
          title="Copies the recommended command/snippet (not the entire block)."
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <CodeBlock code={activeCode} lang={lang} />
    </div>
  );
}

function firstShellCommand(code: string) {
  // Pick the first non-empty, non-comment line as the "recommended" command.
  for (const raw of code.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    return line;
  }
  return null;
}

function CodeBlock({ code, lang }: { code: string; lang: "sh" | "json" }) {
  return (
    <div className="overflow-auto rounded-lg border border-border bg-black/60 p-3 font-mono text-[12px] leading-5 text-foreground">
      <HighlightedCode code={code} lang={lang} />
    </div>
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
          Web Browser
        </div>
        <div className="flex items-center gap-4">
          <a className="hover:text-foreground" href="/privacy">
            Privacy
          </a>
          <a
            className="inline-flex items-center gap-2 hover:text-foreground"
            href="https://github.com/aryasaatvik/web-browser"
            target="_blank"
            rel="noreferrer"
          >
            <GitHub size={16} className="text-muted" />
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
