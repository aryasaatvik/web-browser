export function ArchitectureDiagram(props: {
  className?: string;
  mode: "default" | "cdp";
}) {
  const client = { x: 40, y: 110, w: 220, h: 78 };
  const daemon = { x: 300, y: 100, w: 300, h: 98 };
  const chrome = { x: 660, y: 110, w: 280, h: 78 };
  // Give the lower nodes a little more height so subtitle + meta don't overlap.
  const bridge = { x: 300, y: 232, w: 300, h: 86 };
  const extension = { x: 660, y: 232, w: 280, h: 86 };

  const clientRight = client.x + client.w;
  const clientCenterY = client.y + client.h / 2;

  const daemonLeft = daemon.x;
  const daemonRight = daemon.x + daemon.w;
  const daemonBottom = daemon.y + daemon.h;
  const daemonCenterY = daemon.y + daemon.h / 2;

  const chromeLeft = chrome.x;
  const chromeBottom = chrome.y + chrome.h;
  const chromeCenterY = chrome.y + chrome.h / 2;

  const bridgeTop = bridge.y;
  const bridgeRight = bridge.x + bridge.w;
  const bridgeCenterY = bridge.y + bridge.h / 2;

  const extensionLeft = extension.x;
  const extensionTop = extension.y;
  const extensionCenterY = extension.y + extension.h / 2;

  const gap = 10;
  const isDefault = props.mode === "default";

  return (
    <svg
      className={props.className}
      viewBox="0 0 980 380"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Web Browser architecture diagram"
    >
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(237,237,237,0.65)" />
        </marker>
        <marker
          id="arrowAccent"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(16,185,129,0.9)" />
        </marker>

        <radialGradient id="glow" cx="35%" cy="25%" r="70%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
          <stop offset="60%" stopColor="#10b981" stopOpacity="0" />
        </radialGradient>
        <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow
            dx="0"
            dy="8"
            stdDeviation="10"
            floodColor="#000000"
            floodOpacity="0.35"
          />
        </filter>
      </defs>

      {/* subtle background (card provides the panel) */}
      <rect x="0" y="0" width="980" height="380" fill="url(#glow)" />

      {/* Nodes */}
      <Node
        x={client.x}
        y={client.y}
        w={client.w}
        h={client.h}
        title="Client"
        subtitle="Cursor / Claude"
      />
      <Node
        x={daemon.x}
        y={daemon.y}
        w={daemon.w}
        h={daemon.h}
        title="Daemon"
        subtitle="web-browser daemon"
        meta="127.0.0.1:49321/mcp"
        accent
      />
      <Node
        x={chrome.x}
        y={chrome.y}
        w={chrome.w}
        h={chrome.h}
        title="Chrome"
        subtitle="real browser"
      />

      {isDefault ? (
        <>
          <Node
            x={bridge.x}
            y={bridge.y}
            w={bridge.w}
            h={bridge.h}
            title="Bridge"
            subtitle="native host"
            meta="/tmp/web-browser-$USER"
          />
          <Node
            x={extension.x}
            y={extension.y}
            w={extension.w}
            h={extension.h}
            title="Extension"
            subtitle="native messaging"
            meta="MV3"
          />
        </>
      ) : null}

      {/* Arrows */}
      <Arrow
        from={{ x: clientRight + gap, y: clientCenterY }}
        to={{ x: daemonLeft - gap, y: daemonCenterY }}
        accent
      />
      {isDefault ? (
        <>
          <Arrow
            from={{ x: daemon.x + daemon.w / 2, y: daemonBottom + gap }}
            to={{ x: bridge.x + bridge.w / 2, y: bridgeTop - gap }}
          />
          <Arrow
            from={{ x: bridgeRight + gap, y: bridgeCenterY }}
            to={{ x: extensionLeft - gap, y: extensionCenterY }}
          />
          <Arrow
            from={{ x: extension.x + extension.w / 2, y: extensionTop - gap }}
            to={{ x: chrome.x + chrome.w / 2, y: chromeBottom + gap }}
          />
        </>
      ) : (
        <Arrow
          from={{ x: daemonRight + gap, y: daemonCenterY }}
          to={{ x: chromeLeft - gap, y: chromeCenterY }}
          dashed
        />
      )}
    </svg>
  );
}

function Node(props: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  subtitle?: string;
  meta?: string;
  accent?: boolean;
}) {
  const { x, y, w, h, title, subtitle, meta, accent } = props;
  const stroke = accent ? "rgba(16,185,129,0.55)" : "rgba(33,33,33,1)";
  const fill = accent ? "rgba(16,185,129,0.06)" : "rgba(13,13,13,1)";

  // Slightly increase internal padding so content doesn't feel cramped,
  // especially on the shorter nodes (h=70).
  const padX = 22;
  const titleY = y + 30;
  const subtitleY = titleY + 22;
  const metaY = Math.min(subtitleY + 20, y + h - 14);

  return (
    <g filter="url(#softShadow)">
      <rect x={x} y={y} width={w} height={h} rx="16" fill={fill} stroke={stroke} />
      <text
        x={x + padX}
        y={titleY}
        fill="rgba(237,237,237,0.92)"
        fontFamily="Geist, system-ui, -apple-system, Segoe UI, sans-serif"
        fontSize="14"
        fontWeight="600"
      >
        {title}
      </text>
      {subtitle ? (
        <text
          x={x + padX}
          y={subtitleY}
          fill="rgba(157,157,157,0.92)"
          fontFamily="Geist Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace"
          fontSize="12"
        >
          {subtitle}
        </text>
      ) : null}
      {meta ? (
        <text
          x={x + padX}
          y={metaY}
          fill="rgba(157,157,157,0.85)"
          fontFamily="Geist Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace"
          fontSize="11"
        >
          {meta}
        </text>
      ) : null}
    </g>
  );
}

function Arrow(props: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  label?: string;
  accent?: boolean;
  dashed?: boolean;
  labelOffset?: { x: number; y: number };
}) {
  const { from, to, label, accent, dashed, labelOffset } = props;
  const stroke = accent
    ? "rgba(16,185,129,0.9)"
    : dashed
      ? "rgba(157,157,157,0.75)"
      : "rgba(237,237,237,0.65)";

  const labelX = (from.x + to.x) / 2 + (labelOffset?.x ?? 0);
  const labelY = (from.y + to.y) / 2 - 8 + (labelOffset?.y ?? 0);
  return (
    <g>
      <path
        d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`}
        stroke={stroke}
        strokeWidth="2.2"
        strokeDasharray={dashed ? "6 6" : undefined}
        markerEnd={`url(#${accent ? "arrowAccent" : "arrow"})`}
      />
      {label ? (
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          fill="rgba(157,157,157,0.92)"
          stroke="rgba(10,10,10,0.9)"
          strokeWidth="3"
          paintOrder="stroke"
          fontFamily="Geist Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace"
          fontSize="11"
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}
