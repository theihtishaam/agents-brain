// src/dashboard/v6-dashboard-html.ts — Redesigned v6.0 "Hive Mind" Control Dashboard
// Responsive, glassmorphism, dark/light, Chart.js analytics, command palette (Cmd+K),
// toast notifications, Lucide icons, GSAP transitions. Served at / (default) and /hive.

export const V6_DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en" data-theme="light" data-navmode="simple">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
<meta name="color-scheme" content="dark light">
<title>Shadow Brain v7.2 — Hive Mind Control</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='22' fill='%230a0e1a'/><path d='M50 50 L24 30 M50 50 L76 30 M50 50 L24 70 M50 50 L76 70' stroke='%23ffffff' stroke-opacity='0.28' stroke-width='3'/><circle cx='50' cy='50' r='12' fill='%2318ffff'/><circle cx='24' cy='30' r='7' fill='%2310e68c'/><circle cx='76' cy='30' r='7' fill='%23ffb53f'/><circle cx='24' cy='70' r='7' fill='%23a855f7'/><circle cx='76' cy='70' r='7' fill='%23ec4899'/></svg>">
<link rel="preconnect" href="https://cdn.jsdelivr.net">
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
<style>
  /* ──────────────────────────────────────────────────────────────────── */
  /*  Design System Tokens                                               */
  /* ──────────────────────────────────────────────────────────────────── */
  :root {
    /* Dark theme */
    --bg: #030509;
    --bg-elev-1: #090d17;
    --bg-elev-2: #10152a;
    --bg-elev-3: #18203b;
    --bg-glass: rgba(15, 20, 38, 0.55);
    --bg-glass-strong: rgba(22, 28, 52, 0.78);
    --border: rgba(255, 255, 255, 0.08);
    --border-strong: rgba(255, 255, 255, 0.14);
    --border-accent: rgba(24, 255, 255, 0.32);

    --text: #e8ecf4;
    --text-2: #a4afc4;
    --text-3: #64708a;
    --text-dim: #3e4762;

    --brand-cyan: #18ffff;
    --brand-purple: #a855f7;
    --brand-pink: #ec4899;
    --brand-gradient: linear-gradient(135deg, #18ffff 0%, #a855f7 50%, #ec4899 100%);
    --brand-gradient-soft: linear-gradient(135deg, rgba(24,255,255,0.15), rgba(168,85,247,0.15));

    --success: #10e68c;
    --warning: #ffb53f;
    --danger: #ff5864;
    --info: #4fb6ff;

    --radius-sm: 6px;
    --radius: 10px;
    --radius-lg: 14px;
    --radius-xl: 20px;

    --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
    --shadow: 0 6px 24px -6px rgba(0,0,0,0.5), 0 0 0 1px var(--border);
    --shadow-lg: 0 18px 56px -12px rgba(0,0,0,0.6), 0 0 0 1px var(--border-strong);
    --shadow-glow: 0 0 40px rgba(24,255,255,0.15);
    --card-sheen: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 42%);

    --duration-fast: 120ms;
    --duration: 220ms;
    --duration-slow: 400ms;
    --easing: cubic-bezier(0.4, 0, 0.2, 1);
    --easing-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

    --sidebar-w: 252px;
    --header-h: 64px;
    --ticker-h: 32px;

    --font-sans: 'Inter', -apple-system, system-ui, 'Segoe UI', Roboto, sans-serif;
    --font-mono: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
  }

  /* Light theme — clean, high-contrast, professional */
  html[data-theme="light"] {
    --bg: #f7f8fb;
    --bg-elev-1: #ffffff;
    --bg-elev-2: #f2f4f8;
    --bg-elev-3: #e8ecf2;
    --bg-glass: rgba(255, 255, 255, 0.88);
    --bg-glass-strong: rgba(255, 255, 255, 0.96);
    --border: rgba(15, 23, 42, 0.10);
    --border-strong: rgba(15, 23, 42, 0.18);
    --border-accent: rgba(99, 102, 241, 0.38);
    --text: #0a0f1c;
    --text-2: #2b3648;
    --text-3: #55607a;
    --text-dim: #9ca3af;
    --brand-cyan: #0891b2;
    --brand-purple: #7c3aed;
    --brand-pink: #db2777;
    --brand-gradient: linear-gradient(135deg, #0891b2 0%, #7c3aed 55%, #db2777 100%);
    --brand-gradient-soft: linear-gradient(135deg, rgba(8,145,178,0.10), rgba(124,58,237,0.10));
    --success: #059669;
    --warning: #d97706;
    --danger: #dc2626;
    --info: #2563eb;
    --shadow-sm: 0 1px 2px rgba(15,23,42,0.06);
    --shadow: 0 6px 22px -6px rgba(15,23,42,0.14), 0 0 0 1px var(--border);
    --shadow-lg: 0 18px 50px -12px rgba(15,23,42,0.2), 0 0 0 1px var(--border-strong);
    --shadow-glow: 0 0 32px rgba(8,145,178,0.12);
    --card-sheen: linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0) 42%);
  }
  html[data-theme="light"] body::before {
    background:
      radial-gradient(ellipse at 10% 0%, rgba(124,58,237,0.06) 0%, transparent 45%),
      radial-gradient(ellipse at 90% 100%, rgba(8,145,178,0.05) 0%, transparent 50%);
  }
  html[data-theme="light"] ::-webkit-scrollbar-thumb { background: rgba(15,23,42,0.15); }
  html[data-theme="light"] ::-webkit-scrollbar-thumb:hover { background: rgba(124,58,237,0.35); }

  /* ──────────────────────────────────────────────────────────────────── */
  /*  Reset + base                                                       */
  /* ──────────────────────────────────────────────────────────────────── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    height: 100%;
    font-family: var(--font-sans);
    font-size: 14px;
    background: var(--bg);
    color: var(--text);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    line-height: 1.5;
    overflow: hidden;
  }
  body { display: flex; flex-direction: column; }
  a { color: var(--brand-cyan); text-decoration: none; }
  a:hover { text-decoration: underline; }
  button { font-family: inherit; cursor: pointer; border: none; background: none; color: inherit; }
  input, select, textarea { font-family: inherit; font-size: inherit; color: inherit; }

  /* Ambient backdrop */
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(ellipse at 10% 0%, rgba(168,85,247,0.10) 0%, transparent 45%),
      radial-gradient(ellipse at 90% 100%, rgba(24,255,255,0.08) 0%, transparent 50%),
      radial-gradient(ellipse at 50% 50%, rgba(236,72,153,0.04) 0%, transparent 60%);
    z-index: 0;
  }

  /* ──────────────────────────────────────────────────────────────────── */
  /*  Scrollbars                                                         */
  /* ──────────────────────────────────────────────────────────────────── */
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(168,85,247,0.4); }

  /* ──────────────────────────────────────────────────────────────────── */
  /*  Header                                                             */
  /* ──────────────────────────────────────────────────────────────────── */
  header {
    height: var(--header-h);
    background: var(--bg-glass-strong);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 20px;
    position: relative;
    z-index: 100;
    flex-shrink: 0;
  }
  .brain-hero {
    position: relative;
    width: 44px; height: 44px;
    flex-shrink: 0;
  }
  .brain-hero .aura {
    position: absolute; inset: -8px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(168,85,247,0.55) 0%, rgba(24,255,255,0.15) 40%, transparent 75%);
    animation: auraPulse 3.2s ease-in-out infinite;
    filter: blur(6px);
  }
  @keyframes auraPulse { 50% { transform: scale(1.22); opacity: 1; } }
  .brain-hero svg { position: relative; width: 100%; height: 100%; filter: drop-shadow(0 0 8px rgba(24,255,255,0.4)); }
  .brain-hero .hemi { fill: none; stroke: var(--brand-cyan); stroke-width: 1.4; stroke-linecap: round; opacity: 0.9; }
  .brain-hero .hemi-r { stroke: var(--brand-purple); }
  .brain-hero .synapse { animation: synapse 1.4s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
  @keyframes synapse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
  .brain-hero .charge { stroke-dasharray: 2 6; animation: rot 2s linear infinite; }
  @keyframes rot { to { stroke-dashoffset: -20; } }

  .brand {
    display: flex; flex-direction: column; line-height: 1.15;
  }
  .brand .name {
    font-size: 15px; font-weight: 800; letter-spacing: -0.2px;
    background: var(--brand-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .brand .state {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--brand-cyan);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    display: flex; align-items: center; gap: 5px;
  }
  .brand .state::before {
    content: ""; width: 5px; height: 5px; border-radius: 50%;
    background: var(--success); box-shadow: 0 0 6px var(--success);
    animation: pulse 1.5s infinite;
  }
  @keyframes pulse { 50% { opacity: 0.5; } }

  .header-stats {
    display: flex; gap: 8px; margin-left: 16px;
    flex-wrap: nowrap; overflow-x: auto;
    scrollbar-width: none;
  }
  .header-stats::-webkit-scrollbar { display: none; }
  .stat-pill {
    display: flex; align-items: center; gap: 6px;
    background: var(--bg-glass);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 5px 12px;
    font-size: 11px;
    color: var(--text-2);
    white-space: nowrap;
    transition: all var(--duration) var(--easing);
  }
  .stat-pill:hover { border-color: var(--border-strong); color: var(--text); }
  .stat-pill .n { font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }

  .header-right {
    margin-left: auto;
    display: flex; gap: 8px; align-items: center;
  }
  .icon-btn {
    width: 34px; height: 34px;
    display: flex; align-items: center; justify-content: center;
    background: var(--bg-glass);
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--text-2);
    transition: all var(--duration) var(--easing);
  }
  .icon-btn:hover { background: var(--bg-elev-3); color: var(--text); border-color: var(--border-strong); }
  .icon-btn svg { width: 16px; height: 16px; }
  .kbd-hint {
    background: var(--bg-glass);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 5px 10px;
    font-family: var(--font-mono); font-size: 10px;
    color: var(--text-3);
    display: flex; align-items: center; gap: 6px;
    transition: all var(--duration);
  }
  .kbd-hint:hover { color: var(--text); border-color: var(--brand-cyan); }
  kbd {
    background: var(--bg-elev-3);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 9px;
    font-family: var(--font-mono);
  }

  /* ──────────────────────────────────────────────────────────────────── */
  /*  Layout: sidebar + main                                             */
  /* ──────────────────────────────────────────────────────────────────── */
  .layout {
    display: grid;
    grid-template-columns: var(--sidebar-w) 1fr;
    flex: 1;
    overflow: hidden;
    position: relative;
    z-index: 1;
  }

  aside.sidebar {
    background: var(--bg-glass);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-right: 1px solid var(--border);
    overflow-y: auto;
    padding: 16px 10px;
  }
  .nav-group { margin-bottom: 14px; }
  .nav-group-label {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--text-3); padding: 6px 12px; font-weight: 700;
  }
  /* Simple / Advanced mode toggle */
  .mode-toggle {
    display: flex; gap: 3px; padding: 3px;
    background: var(--bg-elev-1); border: 1px solid var(--border);
    border-radius: 999px; margin: 0 6px 14px;
  }
  .mode-btn {
    flex: 1; padding: 6px 10px; border-radius: 999px;
    font-size: 11.5px; font-weight: 700; color: var(--text-3);
    transition: all var(--duration-fast) var(--easing);
  }
  .mode-btn:hover { color: var(--text-2); }
  .mode-btn.active { background: var(--brand-gradient); color: #fff; box-shadow: 0 2px 10px -2px rgba(168,85,247,0.5); }
  /* In simple mode, advanced groups are hidden entirely. */
  html[data-navmode="simple"] [data-adv] { display: none; }
  .nav-item {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 12px;
    border-radius: 9px;
    cursor: pointer;
    font-size: 12.5px;
    color: var(--text-2);
    transition: background var(--duration-fast) var(--easing), color var(--duration-fast) var(--easing), transform var(--duration-fast) var(--easing);
    position: relative;
    width: 100%; text-align: left;
    font-weight: 500;
  }
  .nav-item:hover { background: var(--bg-elev-2); color: var(--text); transform: translateX(2px); }
  .nav-item.active {
    background: var(--brand-gradient-soft);
    color: var(--text);
    font-weight: 600;
  }
  .nav-item.active::before {
    content: "";
    position: absolute; left: 0; top: 5px; bottom: 5px;
    width: 3px; border-radius: 0 3px 3px 0;
    background: var(--brand-gradient);
    box-shadow: 0 0 10px var(--brand-cyan);
  }
  .nav-item svg { width: 14px; height: 14px; flex-shrink: 0; color: var(--text-3); transition: color var(--duration-fast); }
  .nav-item:hover svg, .nav-item.active svg { color: var(--brand-cyan); }
  .nav-item .badge-count {
    margin-left: auto;
    background: var(--bg-elev-3);
    border-radius: 9px;
    padding: 0px 7px;
    font-size: 10px;
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }
  .nav-item.active .badge-count { background: var(--brand-cyan); color: #000; }

  main {
    overflow-y: auto;
    padding: 20px 26px 48px;
    position: relative;
  }

  /* ──────────────────────────────────────────────────────────────────── */
  /*  Sections                                                           */
  /* ──────────────────────────────────────────────────────────────────── */
  .section { display: none; }
  .section.active { display: block; animation: sectionIn var(--duration-slow) var(--easing); }
  @keyframes sectionIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

  .section-header {
    display: flex; align-items: flex-end; justify-content: space-between;
    margin-bottom: 18px; flex-wrap: wrap; gap: 12px;
  }
  .section-title {
    font-size: 22px; font-weight: 800; letter-spacing: -0.5px;
    display: flex; align-items: center; gap: 10px;
  }
  .section-title svg { color: var(--brand-cyan); width: 22px; height: 22px; }
  .section-subtitle {
    color: var(--text-3); font-size: 12.5px; margin-top: 4px;
  }
  .section-actions { display: flex; gap: 8px; flex-wrap: wrap; }

  /* ──────────────────────────────────────────────────────────────────── */
  /*  Cards                                                              */
  /* ──────────────────────────────────────────────────────────────────── */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 14px;
  }
  .grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
  .grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
  .grid.cols-4 { grid-template-columns: repeat(4, 1fr); }

  .card {
    background: var(--bg-glass);
    backdrop-filter: blur(20px) saturate(150%);
    -webkit-backdrop-filter: blur(20px) saturate(150%);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 18px;
    transition: transform var(--duration) var(--easing), box-shadow var(--duration) var(--easing), border-color var(--duration) var(--easing);
    position: relative;
    overflow: hidden;
    box-shadow: var(--shadow-sm);
  }
  .card::after {
    content: "";
    position: absolute; inset: 0 0 auto 0; height: 50%;
    background: var(--card-sheen);
    pointer-events: none; border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }
  .card:hover { border-color: var(--border-strong); transform: translateY(-2px); box-shadow: var(--shadow); }
  .card.span-2 { grid-column: span 2; }
  .card.span-full { grid-column: 1 / -1; }
  .card.accent::before {
    content: "";
    position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(135deg, rgba(24,255,255,0.08), transparent 50%);
  }
  /* Canvas-bearing cards (constellation, charts, graphs) skip the top sheen so
     visualizations stay crisp — especially in light theme. */
  .card:has(canvas)::after { display: none; }
  .card-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 14px; gap: 8px;
  }
  .card-title {
    font-size: 13px; font-weight: 700; letter-spacing: 0.01em;
    display: flex; align-items: center; gap: 8px;
  }
  .card-title svg { width: 14px; height: 14px; color: var(--brand-cyan); }

  .stat-card { padding: 18px; }
  .stat-card .label { font-size: 11px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
  .stat-card .value { font-size: 32px; font-weight: 900; letter-spacing: -1px; margin: 6px 0 4px; font-variant-numeric: tabular-nums; }
  .stat-card .value.accent { background: var(--brand-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .stat-card .trend { font-size: 11px; color: var(--text-2); display: flex; align-items: center; gap: 4px; }
  .stat-card .trend.up { color: var(--success); }
  .stat-card .trend.down { color: var(--danger); }

  .workflow-strip {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: end;
    margin-bottom: 16px;
  }
  .workflow-path {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-2);
    background: var(--bg-elev-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 12px;
    width: 100%;
  }
  .warning-stack { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
  .warning-banner {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    border: 1px solid rgba(217, 119, 6, 0.38);
    background: rgba(217, 119, 6, 0.10);
    color: var(--warning);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 12px;
  }
  .brain-feed { display: flex; flex-direction: column; gap: 10px; }
  .stack { display: flex; flex-direction: column; gap: 8px; }
  .memory-item {
    border: 1px solid var(--border);
    background: var(--bg-elev-1);
    border-radius: 8px;
    padding: 10px 12px;
  }
  .memory-item .meta {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: 6px;
    font-size: 11px;
    color: var(--text-3);
  }
  .memory-item .content {
    color: var(--text-2);
    font-size: 12px;
    line-height: 1.45;
    word-break: break-word;
  }
  .ops-agent-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
  }
  .ops-agent {
    border: 1px solid var(--border);
    background: var(--bg-elev-1);
    border-radius: 8px;
    padding: 9px 10px;
    font-size: 12px;
  }
  .ops-agent .name { font-weight: 700; margin-bottom: 5px; }
  .ops-agent .status { display: flex; gap: 6px; flex-wrap: wrap; }
  .empty-tight { color: var(--text-3); padding: 18px 4px; font-size: 12px; text-align: center; }

  /* ──────────────────────────────────────────────────────────────────── */
  /*  Rows, pills, badges                                                */
  /* ──────────────────────────────────────────────────────────────────── */
  .row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 9px 6px; border-bottom: 1px solid var(--border);
    gap: 8px; border-radius: 6px;
    transition: background var(--duration-fast) var(--easing);
  }
  .row:hover { background: var(--bg-elev-2); }
  .row:last-child { border: none; }
  .row .k { font-size: 12px; color: var(--text-2); }
  .row .v { font-size: 12.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .row .v.good { color: var(--success); }
  .row .v.warn { color: var(--warning); }
  .row .v.bad { color: var(--danger); }

  .pill {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 9px; border-radius: 999px;
    background: var(--bg-elev-3); border: 1px solid var(--border);
    font-size: 10px; font-weight: 700; letter-spacing: 0.02em;
    color: var(--text-2);
  }
  .pill.green { background: rgba(16,230,140,.12); color: var(--success); border-color: rgba(16,230,140,.3); }
  .pill.red { background: rgba(255,88,100,.12); color: var(--danger); border-color: rgba(255,88,100,.3); }
  .pill.yellow { background: rgba(255,181,63,.12); color: var(--warning); border-color: rgba(255,181,63,.3); }
  .pill.purple { background: rgba(168,85,247,.15); color: var(--brand-purple); border-color: rgba(168,85,247,.3); }
  .pill.cyan { background: rgba(24,255,255,.12); color: var(--brand-cyan); border-color: rgba(24,255,255,.3); }
  .pill.pink { background: rgba(236,72,153,.12); color: var(--brand-pink); border-color: rgba(236,72,153,.3); }

  /* ──────────────────────────────────────────────────────────────────── */
  /*  Buttons                                                            */
  /* ──────────────────────────────────────────────────────────────────── */
  .btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 14px;
    background: var(--bg-elev-2);
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--text);
    font-size: 12.5px;
    font-weight: 600;
    transition: transform var(--duration-fast) var(--easing), box-shadow var(--duration) var(--easing), background var(--duration) var(--easing), border-color var(--duration) var(--easing), filter var(--duration) var(--easing);
    white-space: nowrap;
    box-shadow: var(--shadow-sm);
  }
  .btn:hover { background: var(--bg-elev-3); border-color: var(--border-strong); transform: translateY(-1px); box-shadow: var(--shadow); }
  .btn:active { transform: translateY(0) scale(0.98); }
  .btn svg { width: 13px; height: 13px; }
  .btn.sm { padding: 4px 10px; font-size: 11px; border-radius: 7px; }
  .btn.lg { padding: 11px 18px; font-size: 13px; border-radius: 11px; }
  .btn.primary {
    background: var(--brand-gradient);
    color: #fff;
    border-color: transparent;
    box-shadow: 0 4px 14px -4px rgba(168,85,247,0.5);
  }
  .btn.primary:hover { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 8px 24px -4px rgba(24,255,255,0.4); }
  .btn.ghost { background: transparent; }
  .btn.ghost:hover { background: var(--bg-elev-2); }
  .btn.danger { color: var(--danger); border-color: rgba(255,88,100,.35); }
  .btn.danger:hover { background: rgba(255,88,100,.1); }
  .btn.success { color: var(--success); border-color: rgba(16,230,140,.35); }
  .btn.success:hover { background: rgba(16,230,140,.1); }

  /* ──────────────────────────────────────────────────────────────────── */
  /*  Forms                                                              */
  /* ──────────────────────────────────────────────────────────────────── */
  .field { margin-bottom: 12px; }
  .field label {
    display: block; margin-bottom: 5px;
    font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--text-3);
  }
  .field input, .field textarea, .field select {
    width: 100%;
    background: var(--bg-elev-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 9px 12px;
    font-size: 12.5px;
    color: var(--text);
    transition: all var(--duration) var(--easing);
  }
  .field input:focus, .field textarea:focus, .field select:focus {
    outline: none;
    border-color: var(--brand-cyan);
    box-shadow: 0 0 0 3px rgba(24,255,255,0.12);
  }
  .field textarea { resize: vertical; min-height: 70px; font-family: var(--font-mono); font-size: 12px; }
  .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

  /* Toggle switch */
  .switch { position: relative; display: inline-block; width: 38px; height: 22px; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .switch .slider {
    position: absolute; inset: 0; cursor: pointer;
    background: var(--bg-elev-3);
    border: 1px solid var(--border);
    transition: var(--duration); border-radius: 12px;
  }
  .switch .slider::before {
    content: ""; position: absolute;
    height: 16px; width: 16px; left: 2px; top: 2px;
    background: var(--text-2); transition: var(--duration); border-radius: 50%;
  }
  .switch input:checked + .slider { background: var(--brand-gradient); border-color: transparent; }
  .switch input:checked + .slider::before { transform: translateX(16px); background: #fff; }

  /* ──────────────────────────────────────────────────────────────────── */
  /*  Tables                                                             */
  /* ──────────────────────────────────────────────────────────────────── */
  .table { width: 100%; border-collapse: collapse; }
  .table th, .table td { padding: 11px 14px; text-align: left; font-size: 12px; }
  .table th {
    background: var(--bg-elev-2);
    color: var(--text-3);
    font-weight: 700; letter-spacing: 0.06em;
    text-transform: uppercase; font-size: 10px;
    border-bottom: 1px solid var(--border-strong);
    position: sticky; top: 0; z-index: 1;
  }
  .table tbody tr { border-bottom: 1px solid var(--border); transition: background var(--duration-fast), box-shadow var(--duration-fast); }
  .table tbody tr:last-child { border-bottom: none; }
  .table tbody tr:hover { background: var(--brand-gradient-soft); box-shadow: inset 3px 0 0 var(--brand-cyan); }
  .table code { color: var(--brand-cyan); font-size: 11px; }

  .empty {
    padding: 32px 16px; text-align: center;
    color: var(--text-3); font-size: 12px;
  }
  .empty svg { width: 40px; height: 40px; color: var(--text-dim); margin: 0 auto 10px; display: block; }

  /* Progress meters */
  .meter { height: 6px; background: var(--bg-elev-3); border-radius: 4px; overflow: hidden; position: relative; }
  .meter .fill {
    height: 100%; border-radius: 4px;
    background: var(--brand-gradient);
    transition: width var(--duration-slow) var(--easing);
  }
  .meter .fill.good { background: var(--success); }
  .meter .fill.warn { background: var(--warning); }

  /* ──────────────────────────────────────────────────────────────────── */
  /*  Feature toggles grid                                               */
  /* ──────────────────────────────────────────────────────────────────── */
  .feature-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
  .feature-toggle {
    background: var(--bg-elev-1);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 14px;
    display: flex; align-items: center; gap: 12px;
    transition: all var(--duration) var(--easing);
  }
  .feature-toggle:hover { border-color: var(--border-strong); }
  .feature-toggle .icon {
    width: 32px; height: 32px;
    background: var(--brand-gradient-soft);
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    color: var(--brand-cyan); flex-shrink: 0;
  }
  .feature-toggle .icon svg { width: 16px; height: 16px; }
  .feature-toggle .meta { flex: 1; min-width: 0; }
  .feature-toggle .meta .name { font-size: 12.5px; font-weight: 600; }
  .feature-toggle .meta .desc { font-size: 10.5px; color: var(--text-3); margin-top: 2px; }

  /* ──────────────────────────────────────────────────────────────────── */
  /*  Command palette                                                    */
  /* ──────────────────────────────────────────────────────────────────── */
  .cmd-overlay {
    position: fixed; inset: 0;
    background: rgba(3, 5, 9, 0.72);
    backdrop-filter: blur(8px);
    z-index: 2000;
    display: none; align-items: flex-start; justify-content: center;
    padding-top: 12vh;
    animation: fadeIn var(--duration) var(--easing);
  }
  .cmd-overlay.open { display: flex; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .cmd-palette {
    width: min(640px, 92vw);
    background: var(--bg-glass-strong);
    backdrop-filter: blur(36px);
    border: 1px solid var(--border-strong);
    border-radius: 14px;
    overflow: hidden;
    box-shadow: var(--shadow-lg);
    animation: paletteIn var(--duration-slow) var(--easing-spring);
  }
  @keyframes paletteIn { from { opacity: 0; transform: translateY(-20px) scale(0.96); } to { opacity: 1; transform: none; } }

  .cmd-palette input {
    width: 100%;
    background: transparent; border: none; outline: none;
    padding: 16px 20px;
    font-size: 14px; color: var(--text);
    border-bottom: 1px solid var(--border);
  }
  .cmd-palette .results { max-height: 420px; overflow-y: auto; padding: 6px; }
  .cmd-result {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 12px; border-radius: 7px;
    cursor: pointer; color: var(--text-2);
    transition: all var(--duration-fast);
  }
  .cmd-result:hover, .cmd-result.selected { background: var(--bg-elev-2); color: var(--text); }
  .cmd-result svg { width: 15px; height: 15px; color: var(--brand-cyan); flex-shrink: 0; }
  .cmd-result .meta { flex: 1; font-size: 12.5px; }
  .cmd-result .hint { font-size: 10px; color: var(--text-3); font-family: var(--font-mono); }

  /* ──────────────────────────────────────────────────────────────────── */
  /*  Toasts                                                             */
  /* ──────────────────────────────────────────────────────────────────── */
  .toast-container {
    position: fixed; bottom: 52px; right: 20px;
    display: flex; flex-direction: column; gap: 8px;
    z-index: 1500; pointer-events: none;
  }
  .toast {
    min-width: 260px; max-width: 360px;
    background: var(--bg-glass-strong);
    backdrop-filter: blur(24px);
    border: 1px solid var(--border-strong);
    border-left: 3px solid var(--brand-cyan);
    border-radius: 10px;
    padding: 10px 14px;
    pointer-events: auto;
    display: flex; align-items: flex-start; gap: 10px;
    animation: toastIn var(--duration-slow) var(--easing-spring);
    box-shadow: var(--shadow-lg);
  }
  .toast.success { border-left-color: var(--success); }
  .toast.warn { border-left-color: var(--warning); }
  .toast.error { border-left-color: var(--danger); }
  .toast.removing { animation: toastOut var(--duration-slow) var(--easing) forwards; }
  @keyframes toastIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: none; } }
  @keyframes toastOut { to { opacity: 0; transform: translateX(20px); } }
  .toast svg { width: 15px; height: 15px; color: var(--brand-cyan); flex-shrink: 0; margin-top: 1px; }
  .toast.success svg { color: var(--success); }
  .toast.warn svg { color: var(--warning); }
  .toast.error svg { color: var(--danger); }
  .toast .title { font-size: 12.5px; font-weight: 600; margin-bottom: 2px; }
  .toast .body { font-size: 11.5px; color: var(--text-2); line-height: 1.4; }

  /* ──────────────────────────────────────────────────────────────────── */
  /*  Ticker + log panel                                                 */
  /* ──────────────────────────────────────────────────────────────────── */
  .log-ticker {
    position: fixed; bottom: 0; left: 0; right: 0;
    height: var(--ticker-h);
    background: var(--bg-glass-strong);
    backdrop-filter: blur(24px);
    border-top: 1px solid var(--border);
    display: flex; align-items: center; gap: 12px;
    padding: 0 20px;
    font-family: var(--font-mono); font-size: 10.5px;
    color: var(--text-3);
    z-index: 600;
  }
  .log-ticker .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--success); animation: pulse 1.5s infinite; flex-shrink: 0; }
  .log-ticker .scroll { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .log-panel {
    position: fixed; bottom: var(--ticker-h); left: 0; right: 0;
    height: 300px;
    background: var(--bg-elev-1);
    border-top: 1px solid var(--border);
    padding: 16px 20px;
    overflow-y: auto;
    font-family: var(--font-mono); font-size: 11.5px;
    color: var(--text-2);
    z-index: 599;
    transform: translateY(100%);
    transition: transform var(--duration-slow) var(--easing);
    box-shadow: 0 -8px 32px rgba(0,0,0,0.3);
  }
  .log-panel.open { transform: translateY(0); }
  .log-panel .head {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 10px;
  }
  .log-panel .head .title { color: var(--brand-cyan); font-weight: 700; letter-spacing: 0.04em; }
  .log-row {
    padding: 4px 0;
    border-bottom: 1px solid var(--border);
    display: grid; grid-template-columns: 90px 130px 1fr; gap: 10px; align-items: baseline;
  }
  .log-row .t { color: var(--text-dim); font-size: 10px; }
  .log-row .src { color: var(--brand-purple); font-weight: 600; font-size: 10.5px; }
  .log-row .type { color: var(--brand-cyan); font-weight: 600; font-size: 10.5px; }

  /* ──────────────────────────────────────────────────────────────────── */
  /*  Responsive                                                         */
  /* ──────────────────────────────────────────────────────────────────── */
  .menu-toggle { display: none; }

  @media (max-width: 1024px) {
    .grid.cols-3, .grid.cols-4 { grid-template-columns: repeat(2, 1fr); }
    .card.span-2 { grid-column: 1 / -1; }
  }

  @media (max-width: 768px) {
    header { padding: 0 14px; gap: 10px; }
    .header-stats { display: none; }
    .brand .state { display: none; }
    .menu-toggle { display: flex; }
    aside.sidebar {
      position: fixed;
      top: var(--header-h); bottom: 0;
      width: 280px; z-index: 90;
      transform: translateX(-100%);
      transition: transform var(--duration-slow) var(--easing);
    }
    aside.sidebar.open { transform: translateX(0); box-shadow: var(--shadow-lg); }
    .layout { grid-template-columns: 1fr; }
    main { padding: 14px; padding-bottom: 60px; }
    .grid, .grid.cols-2, .grid.cols-3, .grid.cols-4 { grid-template-columns: 1fr; }
    .card.span-2 { grid-column: auto; }
    .section-title { font-size: 18px; }
    .field-row { grid-template-columns: 1fr; }
  }

  /* Chart canvas wrapper */
  .chart-wrap { position: relative; height: 220px; }
  .chart-wrap.lg { height: 320px; }

  /* Live Graph canvas */
  .graph-wrap {
    position: relative;
    background: radial-gradient(ellipse at center, rgba(168,85,247,0.04) 0%, transparent 70%);
    border-radius: 12px; overflow: hidden;
    border: 1px solid var(--border);
  }
  .graph-wrap canvas { display: block; width: 100%; height: 560px; }

  /* Helpers */
  .mono { font-family: var(--font-mono); font-size: 11.5px; }
  .tag-code { font-family: var(--font-mono); background: var(--bg-elev-2); padding: 1px 6px; border-radius: 4px; font-size: 11px; }
  .flex { display: flex; }
  .flex.center { align-items: center; }
  .flex.gap { gap: 8px; }
  .flex.between { justify-content: space-between; }
  .grow { flex: 1; }
  .hidden { display: none; }
  .mt { margin-top: 10px; } .mt-lg { margin-top: 20px; }
  .mb { margin-bottom: 10px; } .mb-lg { margin-bottom: 20px; }

  /* Accent bar */
  .accent-bar {
    height: 3px; border-radius: 2px;
    background: var(--brand-gradient);
    margin-bottom: 18px;
    box-shadow: 0 0 12px rgba(24,255,255,0.35);
  }

  /* Skeleton loader */
  .skel { background: linear-gradient(90deg, var(--bg-elev-2) 0%, var(--bg-elev-3) 50%, var(--bg-elev-2) 100%); background-size: 200% 100%; animation: skel 1.2s linear infinite; border-radius: 6px; }
  @keyframes skel { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  /* ──────────────────────────────────────────────────────────────────── */
  /*  Realtime activity (v6.1)                                            */
  /* ──────────────────────────────────────────────────────────────────── */
  .live-badge {
    display: inline-flex; align-items: center; gap: 5px;
    font-family: var(--font-mono); font-size: 9px; font-weight: 800; letter-spacing: 0.12em;
    color: var(--success); background: rgba(16,230,140,.12);
    border: 1px solid rgba(16,230,140,.32); border-radius: 999px;
    padding: 2px 8px; vertical-align: middle;
  }
  .live-badge::before {
    content: ""; width: 6px; height: 6px; border-radius: 50%;
    background: var(--success); box-shadow: 0 0 6px var(--success);
    animation: pulse 1.3s infinite;
  }
  .live-badge.paused { color: var(--warning); background: rgba(255,181,63,.12); border-color: rgba(255,181,63,.32); }
  .live-badge.paused::before { background: var(--warning); box-shadow: none; animation: none; }
  .filter-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
  .chip {
    padding: 5px 12px; border-radius: 999px; font-size: 11.5px; font-weight: 600;
    background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--text-2);
    transition: all var(--duration-fast) var(--easing);
  }
  .chip:hover { border-color: var(--border-strong); color: var(--text); }
  .chip.active { background: var(--brand-gradient); color: #fff; border-color: transparent; }
  .act-search {
    background: var(--bg-elev-1); border: 1px solid var(--border); border-radius: 8px;
    padding: 7px 12px; color: var(--text); font-size: 12px; min-width: 180px;
  }
  .act-search:focus { outline: none; border-color: var(--brand-cyan); box-shadow: 0 0 0 3px rgba(24,255,255,0.12); }
  tr.act-fresh { animation: actFreshIn var(--duration-slow) var(--easing); }
  @keyframes actFreshIn { from { background: rgba(24,255,255,0.12); opacity: 0; transform: translateY(-4px); } to { background: transparent; opacity: 1; transform: none; } }
  .conn-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--success); box-shadow: 0 0 6px var(--success); transition: all var(--duration); }
  .conn-dot.offline { background: var(--warning); box-shadow: none; animation: pulse 1s infinite; }

  /* ──────────────────────────────────────────────────────────────────── */
  /*  Memory Constellation (v6.2)                                         */
  /* ──────────────────────────────────────────────────────────────────── */
  .const-wrap {
    position: relative;
    height: 600px;
    background:
      radial-gradient(ellipse at 30% 20%, rgba(24,255,255,0.05) 0%, transparent 55%),
      radial-gradient(ellipse at 75% 80%, rgba(168,85,247,0.06) 0%, transparent 55%);
    overflow: hidden;
    cursor: grab;
  }
  .const-wrap.dragging { cursor: grabbing; }
  .const-wrap canvas { display: block; width: 100%; height: 100%; }
  .const-legend {
    position: absolute; top: 12px; left: 12px;
    display: flex; flex-direction: column; gap: 5px;
    background: var(--bg-glass-strong); backdrop-filter: blur(12px);
    border: 1px solid var(--border); border-radius: 8px; padding: 8px 11px;
    font-size: 11px; color: var(--text-2); pointer-events: none;
  }
  .const-legend .lg-row { display: flex; align-items: center; gap: 7px; }
  .const-legend .lg-dot { width: 9px; height: 9px; border-radius: 50%; box-shadow: 0 0 6px currentColor; }
  .const-meta {
    position: absolute; top: 12px; right: 12px;
    background: var(--bg-glass-strong); backdrop-filter: blur(12px);
    border: 1px solid var(--border); border-radius: 8px; padding: 6px 11px;
    font-family: var(--font-mono); font-size: 10.5px; color: var(--brand-cyan); pointer-events: none;
  }
  .const-hint {
    position: absolute; bottom: 10px; left: 12px;
    font-size: 10.5px; color: var(--text-3); pointer-events: none;
    background: var(--bg-glass); border-radius: 6px; padding: 3px 9px;
  }
  .const-empty {
    position: absolute; inset: 0; display: none;
    flex-direction: column; align-items: center; justify-content: center;
    text-align: center; gap: 8px; padding: 24px;
  }
  .const-empty.show { display: flex; }
  .const-empty svg { width: 52px; height: 52px; color: var(--text-dim); margin-bottom: 4px; }
  .const-empty .ce-title { font-size: 15px; font-weight: 700; color: var(--text-2); }
  .const-empty .ce-msg { font-size: 12px; color: var(--text-3); max-width: 360px; line-height: 1.5; }
  .const-drawer {
    position: absolute; top: 0; right: 0; bottom: 0; width: min(340px, 80%);
    background: var(--bg-glass-strong); backdrop-filter: blur(28px);
    border-left: 1px solid var(--border-strong);
    transform: translateX(100%); transition: transform var(--duration-slow) var(--easing);
    padding: 16px; overflow-y: auto; z-index: 5;
  }
  .const-drawer.open { transform: translateX(0); box-shadow: -12px 0 40px rgba(0,0,0,0.35); }
  .const-drawer-close {
    position: absolute; top: 10px; right: 12px;
    width: 26px; height: 26px; border-radius: 6px; font-size: 18px; line-height: 1;
    color: var(--text-2); background: var(--bg-elev-2); border: 1px solid var(--border);
  }
  .const-drawer-close:hover { color: var(--text); background: var(--bg-elev-3); }
  .cd-type { font-size: 10px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }
  .cd-title { font-size: 15px; font-weight: 700; margin: 6px 0 12px; line-height: 1.35; word-break: break-word; }
  .cd-section { margin-top: 12px; }
  .cd-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-3); margin-bottom: 4px; font-weight: 700; }
  .cd-content { font-size: 12px; color: var(--text-2); line-height: 1.5; word-break: break-word; }
  .const-tip {
    position: absolute; pointer-events: none; z-index: 6; display: none;
    background: var(--bg-glass-strong); backdrop-filter: blur(12px);
    border: 1px solid var(--border-strong); border-radius: 7px; padding: 6px 10px;
    font-size: 11px; color: var(--text); max-width: 260px;
    transform: translate(-50%, calc(-100% - 12px));
  }
  .const-tip.show { display: block; }
  .tag-cloud { display: flex; flex-wrap: wrap; gap: 7px; }
  .tag-cloud .tc {
    border: 1px solid var(--border); border-radius: 999px; padding: 4px 11px;
    font-size: 12px; color: var(--text-2); background: var(--bg-elev-1);
  }
  .tag-cloud .tc b { color: var(--brand-cyan); font-variant-numeric: tabular-nums; }

  /* Overview constellation hero */
  .const-hero { background: linear-gradient(120deg, rgba(24,255,255,0.08), rgba(168,85,247,0.08) 60%, transparent); }
  .const-hero:hover { border-color: var(--border-accent); box-shadow: var(--shadow-glow); }
  .const-hero-inner { display: flex; align-items: center; gap: 20px; }
  .const-hero-art { flex-shrink: 0; width: 132px; height: 96px; }
  .const-hero-art svg { width: 100%; height: 100%; filter: drop-shadow(0 0 8px rgba(24,255,255,0.35)); }
  .const-hero-art .he { stroke: rgba(24,255,255,0.4); stroke-width: 1.2; }
  .const-hero-art circle { animation: synapse 1.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  .const-hero-body { flex: 1; min-width: 0; }
  .const-hero-title { font-size: 19px; font-weight: 800; letter-spacing: -0.4px; background: var(--brand-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .const-hero-sub { font-size: 12.5px; color: var(--text-3); margin: 4px 0 10px; }
  .const-hero-stats { display: flex; gap: 18px; font-size: 12px; color: var(--text-2); }
  .const-hero-stats b { font-size: 17px; font-weight: 800; color: var(--text); font-variant-numeric: tabular-nums; margin-right: 4px; }
  @media (max-width: 768px) { .const-hero-art { display: none; } .const-hero-inner { gap: 12px; } }

  /* ──────────────────────────────────────────────────────────────────── */
  /*  Revived tab visualizations (v6.2)                                   */
  /* ──────────────────────────────────────────────────────────────────── */
  /* Reusable empty-state */
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 8px; padding: 36px 20px; }
  .empty-state svg { width: 44px; height: 44px; color: var(--text-dim); margin-bottom: 4px; }
  .empty-state .es-title { font-size: 14px; font-weight: 700; color: var(--text-2); }
  .empty-state .es-msg { font-size: 12px; color: var(--text-3); max-width: 380px; line-height: 1.5; }
  .empty-state .es-cta { margin-top: 6px; }

  /* Risk gauge + matrix (Pre-Mortem) */
  .risk-head { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; margin-bottom: 16px; }
  .risk-gauge { position: relative; width: 96px; height: 96px; flex-shrink: 0; }
  .risk-gauge canvas { width: 96px; height: 96px; }
  .risk-gauge .rg-num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; }
  .risk-matrix { display: grid; grid-template-columns: 64px repeat(4, 1fr); gap: 5px; margin: 14px 0; }
  .risk-matrix .rm-h { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-3); display: flex; align-items: center; justify-content: center; padding: 4px; }
  .risk-matrix .rm-yl { font-size: 10px; color: var(--text-3); display: flex; align-items: center; justify-content: flex-end; padding-right: 6px; }
  .risk-matrix .rm-cell { aspect-ratio: 2.6/1; border-radius: 6px; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; color: #fff; min-height: 30px; transition: all var(--duration); }
  .risk-matrix .rm-cell.empty { background: var(--bg-elev-1); color: var(--text-dim); font-weight: 400; }
  .fail-card { padding: 12px 14px; background: var(--bg-elev-1); border: 1px solid var(--border); border-left-width: 3px; border-radius: 8px; margin-bottom: 8px; }
  .fail-card .fc-head { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-bottom: 6px; }
  .fail-card .fc-desc { font-size: 12.5px; color: var(--text); line-height: 1.45; }
  .fail-card .fc-mit { font-size: 11.5px; color: var(--text-2); margin-top: 6px; padding-left: 14px; border-left: 2px solid var(--success); }

  /* Attention heat bars */
  .heat-row { margin-bottom: 10px; }
  .heat-row .hr-top { display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; margin-bottom: 4px; gap: 8px; }
  .heat-row .hr-pct { font-family: var(--font-mono); font-weight: 800; flex-shrink: 0; }
  .heat-row .hr-track { height: 22px; background: var(--bg-elev-1); border-radius: 5px; overflow: hidden; border: 1px solid var(--border); }
  .heat-row .hr-fill { height: 100%; border-radius: 5px 0 0 5px; transition: width var(--duration-slow) var(--easing); }
  .heat-row .hr-reason { font-size: 10.5px; color: var(--text-3); margin-top: 3px; }

  /* Reputation trust cards */
  .trust-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
  .trust-card { background: var(--bg-elev-1); border: 1px solid var(--border); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; transition: all var(--duration); }
  .trust-card:hover { border-color: var(--border-accent); transform: translateY(-2px); }
  .trust-ring { position: relative; width: 92px; height: 92px; }
  .trust-ring canvas { width: 92px; height: 92px; }
  .trust-ring .tr-pct { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 19px; font-weight: 900; }
  .trust-card .tc-name { font-weight: 700; font-size: 13px; }
  .trust-card .tc-sub { font-size: 11px; color: var(--text-3); }

  /* Causal / DAG canvas */
  .dag-wrap { position: relative; height: 420px; background: radial-gradient(ellipse at center, rgba(168,85,247,0.04), transparent 70%); border-radius: 10px; overflow: hidden; border: 1px solid var(--border); }
  .dag-wrap canvas { display: block; width: 100%; height: 100%; }
  .dag-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--text-3); font-size: 12.5px; text-align: center; padding: 20px; }
</style>
</head>
<body>

<!-- ══════════════════════════════════════════════════════════════════════
     Header
     ══════════════════════════════════════════════════════════════════════ -->
<header>
  <button class="icon-btn menu-toggle" onclick="toggleSidebar()" aria-label="Menu">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
  </button>

  <div class="brain-hero" title="Hive Mind — learning · reflecting · charging">
    <div class="aura"></div>
    <svg viewBox="0 0 100 100">
      <circle class="hemi charge" cx="50" cy="50" r="46"/>
      <circle class="hemi charge" cx="50" cy="50" r="40" style="animation-duration:3s;animation-direction:reverse"/>
      <path class="hemi" d="M 48 22 C 30 22, 18 32, 18 48 C 18 60, 26 72, 38 78 C 42 82, 46 80, 48 76 L 48 22"/>
      <path class="hemi hemi-r" d="M 52 22 C 70 22, 82 32, 82 48 C 82 60, 74 72, 62 78 C 58 82, 54 80, 52 76 L 52 22"/>
      <path class="hemi" d="M 30 40 Q 38 38, 44 44"/>
      <path class="hemi" d="M 28 55 Q 36 55, 44 58"/>
      <path class="hemi" d="M 32 68 Q 40 66, 46 72"/>
      <path class="hemi hemi-r" d="M 70 40 Q 62 38, 56 44"/>
      <path class="hemi hemi-r" d="M 72 55 Q 64 55, 56 58"/>
      <path class="hemi hemi-r" d="M 68 68 Q 60 66, 54 72"/>
      <circle class="synapse" cx="30" cy="42" r="1.8" fill="#18ffff"/>
      <circle class="synapse" cx="70" cy="42" r="1.8" fill="#a855f7" style="animation-delay:0.3s"/>
      <circle class="synapse" cx="35" cy="62" r="1.6" fill="#10e68c" style="animation-delay:0.6s"/>
      <circle class="synapse" cx="65" cy="62" r="1.6" fill="#ffb53f" style="animation-delay:0.9s"/>
      <circle class="synapse" cx="50" cy="35" r="1.4" fill="#ec4899" style="animation-delay:0.15s"/>
      <circle class="synapse" cx="50" cy="70" r="1.4" fill="#18ffff" style="animation-delay:0.75s"/>
    </svg>
  </div>

  <div class="brand">
    <div class="name">Shadow Brain <span style="color:var(--text-3);font-size:10px;font-weight:600">v7.2 Hive Mind</span></div>
    <div class="state" id="brain-state">learning · reflecting · charging</div>
  </div>

  <div class="header-stats" id="header-stats">
    <div class="stat-pill"><span class="n" id="stat-agents">—</span> agents</div>
    <div class="stat-pill"><span class="n" id="stat-memories">—</span> memories</div>
    <div class="stat-pill"><span class="n" id="stat-dreams">—</span> reflections</div>
    <div class="stat-pill"><span class="n" id="stat-tools">—</span> tools</div>
  </div>

  <div class="header-right">
    <span class="conn-dot" id="conn-dot" title="Realtime connection: connecting"></span>
    <button class="kbd-hint" onclick="openCmdPalette()" title="Open command palette">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      Search <kbd>⌘K</kbd>
    </button>
    <button class="icon-btn" onclick="toggleTheme()" title="Toggle theme">
      <svg id="theme-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    </button>
    <button class="icon-btn" onclick="toggleLogPanel()" title="Activity log"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg></button>
    <button class="btn danger sm" onclick="stopBrain()" title="Stop Shadow Brain (npm process)"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>Stop</button>
    <button class="btn primary sm" onclick="refresh()" title="Refresh all"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>Refresh</button>
  </div>
</header>

<!-- ══════════════════════════════════════════════════════════════════════
     Layout: sidebar + main
     ══════════════════════════════════════════════════════════════════════ -->
<div class="layout">
  <aside class="sidebar" id="sidebar">
    <div class="mode-toggle" id="mode-toggle" title="Simple shows the essentials. Advanced reveals every feature.">
      <button class="mode-btn active" data-mode="simple" onclick="setMode('simple')">Simple</button>
      <button class="mode-btn" data-mode="advanced" onclick="setMode('advanced')">Advanced</button>
    </div>

    <div class="nav-group">
      <div class="nav-group-label">Main</div>
      <button class="nav-item active" data-tab="overview" data-title="Home" title="Your starting point — a quick summary of everything the brain knows and is doing.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        Home
      </button>
      <button class="nav-item" data-tab="intelligence" data-title="Brain Map" title="A visual map of everything the brain remembers — memories, projects, and the tools that created them.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><line x1="7" y1="7" x2="10" y2="10.5"/><line x1="17" y1="7" x2="14" y2="10.5"/><line x1="7" y1="17" x2="10" y2="13.5"/><line x1="17" y1="17" x2="14" y2="13.5"/></svg>
        Brain Map<span class="badge-count" id="badge-intelligence">0</span>
      </button>
      <button class="nav-item" data-tab="memory" data-title="Memories" title="Browse and search everything the brain has learned and saved.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
        Memories
      </button>
      <button class="nav-item" data-tab="chat" data-title="Ask the Brain" title="Ask a question in plain language and get answers from the brain's memory.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        Ask the Brain
      </button>
      <button class="nav-item" data-tab="activity" data-title="Activity" title="A live feed of what the brain and your tools are doing right now.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        Activity
      </button>
      <button class="nav-item" data-tab="agents" data-title="Client setup" title="Inspect coding-client configuration and recorded tool identities.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Client setup<span class="badge-count" id="badge-agents">0</span>
      </button>
      <button class="nav-item" data-tab="livebrain" data-title="Brain Health" title="A health check of your brain's memory quality, with tips to improve it.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        Brain Health
      </button>
      <button class="nav-item" data-tab="config" data-title="Settings" title="Set up and adjust how Shadow Brain works.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        Settings
      </button>
    </div>

    <div class="nav-group" data-adv="1">
      <div class="nav-group-label">Explore</div>
      <button class="nav-item" data-tab="ww2br" data-title="Project Memory" title="Memory and status for one specific project.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5"/><path d="M4 6h9l1 2h6v8h-9l-1-2H4"/></svg>
        Project Memory<span class="badge-count" id="badge-ww2br">0</span>
      </button>
      <button class="nav-item" data-tab="graph" data-title="Recorded network" title="Configured clients and newly observed recorded events.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/></svg>
        Recorded network
      </button>
      <button class="nav-item" data-tab="seeder" data-title="Add Knowledge" title="Research a topic and save it as verified, source-backed knowledge.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M5 9c0-3 2-5 7-7 5 2 7 4 7 7 0 5-4 8-7 8s-7-3-7-8z"/><path d="M8 12h8"/></svg>
        Add Knowledge<span class="badge-count" id="badge-seeder">0</span>
      </button>
      <button class="nav-item" data-tab="garden" data-title="Memory Garden" title="A relaxing visual of your memories growing over time.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s-8-4-8-12c0-4 3-7 8-7s8 3 8 7c0 8-8 12-8 12z"/><path d="M12 17v-5M12 7V5"/></svg>
        Memory Garden
      </button>
    </div>

    <div class="nav-group" data-adv="1">
      <div class="nav-group-label">How the Brain Thinks</div>
      <button class="nav-item" data-tab="sabb" data-title="Sub-Agents" title="When a tool spawns helper agents, the brain shares the right context with them.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        Sub-Agents<span class="badge-count" id="badge-sabb">0</span>
      </button>
      <button class="nav-item" data-tab="causal" data-title="Decision Trails" title="Trace why a decision was made — what led to it and what it caused.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        Decision Trails<span class="badge-count" id="badge-causal">0</span>
      </button>
      <button class="nav-item" data-tab="dream" data-title="Reflections" title="While idle, the brain reviews past work and finds patterns and lessons.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        Reflections<span class="badge-count" id="badge-dream">0</span>
      </button>
      <button class="nav-item" data-tab="debate" data-title="Debates" title="Have multiple AI viewpoints argue a tough decision, then get a verdict.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        Debates
      </button>
      <button class="nav-item" data-tab="premortem" data-title="Risk Check" title="Before a big task, see what went wrong last time so you can avoid it.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        Risk Check
      </button>
      <button class="nav-item" data-tab="branch" data-title="Branch Memory" title="Memory that follows your git branch, so each branch has its own context.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
        Branch Memory
      </button>
      <button class="nav-item" data-tab="forget" data-title="Memory Cleanup" title="Old, unused memories fade while important ones are kept — like human memory.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        Memory Cleanup
      </button>
    </div>

    <div class="nav-group" data-adv="1">
      <div class="nav-group-label">Safety &amp; Trust</div>
      <button class="nav-item" data-tab="collision" data-title="Conflicts" title="Catches two tools about to edit the same code at the same time.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
        Conflicts<span class="badge-count" id="badge-collision">0</span>
      </button>
      <button class="nav-item" data-tab="reputation" data-title="Trust Scores" title="How reliable each AI tool has been, based on its track record.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>
        Trust Scores
      </button>
      <button class="nav-item" data-tab="calibration" data-title="Accuracy" title="How well each tool's confidence matches how often it's actually right.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
        Accuracy
      </button>
      <button class="nav-item" data-tab="attention" data-title="Focus Map" title="Shows which memories most influenced a particular decision.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="21.17" y1="8" x2="12" y2="8"/></svg>
        Focus Map
      </button>
      <button class="nav-item" data-tab="formal" data-title="Code Rules" title="Turn plain-language rules into checks your linters can enforce.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        Code Rules
      </button>
      <button class="nav-item" data-tab="privacy" data-title="Privacy &amp; Safety" title="Keep everything offline and block risky actions.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        Privacy &amp; Safety
      </button>
    </div>

    <div class="nav-group" data-adv="1">
      <div class="nav-group-label">Cost &amp; Sharing</div>
      <button class="nav-item" data-tab="tokens" data-title="Cost &amp; Usage" title="Track how much your AI tools are spending and where you can save.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        Cost &amp; Usage
      </button>
      <button class="nav-item" data-tab="pr" data-title="Code Review" title="Generate a review for a pull request using what the brain knows.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>
        Code Review
      </button>
      <button class="nav-item" data-tab="voice" data-title="Voice" title="Talk to the brain and hear answers, hands-free.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
        Voice
      </button>
      <button class="nav-item" data-tab="team" data-title="Team Sync" title="Share brain memory with your teammates.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Team Sync
      </button>
      <button class="nav-item" data-tab="exchange" data-title="Share Brain" title="Export a memory pack to share, or import one from someone else.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
        Share Brain
      </button>
    </div>

    <div class="nav-group" data-adv="1">
      <div class="nav-group-label">System</div>
      <button class="nav-item" data-tab="features" data-title="Features" title="Turn individual brain features on or off.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="5" width="22" height="14" rx="7"/><circle cx="16" cy="12" r="3"/></svg>
        Features
      </button>
      <button class="nav-item" data-tab="models" data-title="AI Models" title="Choose and configure which AI models the brain uses.">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
        AI Models
      </button>
    </div>
  </aside>

  <main id="main">

    <!-- ════ OVERVIEW ════════════════════════════════════════════════ -->
    <section class="section active" id="tab-overview">
      <div class="accent-bar"></div>
      <div class="section-header">
        <div>
          <h1 class="section-title"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>Welcome to your Shadow Brain</h1>
          <div class="section-subtitle">A shared memory for your AI coding tools — private, on your machine. Here's what it knows and is doing right now.</div>
        </div>
        <div class="section-actions">
          <button class="btn" onclick="runDream()" title="Have the brain review recent work and find patterns"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>Reflect Now</button>
          <button class="btn" onclick="runForget()" title="Tidy memory — fade old entries, keep the important ones"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>Clean Up</button>
          <button class="btn danger" onclick="toggleAirGap()" title="Block all outgoing network — fully offline"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Go Offline</button>
        </div>
      </div>

      <div class="grid cols-4">
        <div class="card stat-card accent">
          <div class="label">Recorded tools</div>
          <div class="value accent" id="ov-agents">—</div>
          <div class="trend">AI tools linked to your brain</div>
        </div>
        <div class="card stat-card accent">
          <div class="label">Memories Stored</div>
          <div class="value" id="ov-memories">—</div>
          <div class="trend" id="ov-memories-sub">across all projects</div>
        </div>
        <div class="card stat-card accent">
          <div class="label">Helper Agents</div>
          <div class="value" id="ov-subagents">—</div>
          <div class="trend" id="ov-subagents-sub">graduated / quarantined</div>
        </div>
        <div class="card stat-card accent">
          <div class="label">Active Tool</div>
          <div class="value" style="font-size:22px" id="ov-current-agent">—</div>
          <div class="trend" id="ov-current-agent-sub">using the brain right now</div>
        </div>
      </div>

      <div class="card accent span-full mt-lg const-hero" onclick="switchTab('intelligence','')" style="cursor:pointer">
        <div class="const-hero-inner">
          <div class="const-hero-art">
            <svg viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg">
              <line x1="60" y1="45" x2="24" y2="20" class="he"/><line x1="60" y1="45" x2="98" y2="22" class="he"/>
              <line x1="60" y1="45" x2="22" y2="68" class="he"/><line x1="60" y1="45" x2="100" y2="66" class="he"/>
              <line x1="60" y1="45" x2="60" y2="14" class="he"/><line x1="24" y1="20" x2="22" y2="68" class="he"/>
              <circle cx="60" cy="45" r="9" fill="#18ffff"/>
              <circle cx="24" cy="20" r="5" fill="#10e68c"/><circle cx="98" cy="22" r="5" fill="#ffb53f"/>
              <circle cx="22" cy="68" r="5" fill="#a855f7"/><circle cx="100" cy="66" r="4" fill="#18ffff"/>
              <circle cx="60" cy="14" r="4" fill="#ec4899"/>
            </svg>
          </div>
          <div class="const-hero-body">
            <div class="const-hero-title">Memory Constellation</div>
            <div class="const-hero-sub">Explore every memory, project, agent &amp; tag as a living, importance-ranked graph.</div>
            <div class="const-hero-stats">
              <span><b id="hero-const-nodes">—</b> nodes</span>
              <span><b id="hero-const-edges">—</b> links</span>
              <span><b id="hero-const-mem">—</b> memories</span>
            </div>
          </div>
          <button class="btn primary lg" onclick="event.stopPropagation();switchTab('intelligence','')">Explore <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>
        </div>
      </div>

      <div class="grid cols-3 mt-lg">
        <div class="card span-2">
          <div class="card-header"><div class="card-title"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>Reported Token Usage by Tool</div></div>
          <div class="chart-wrap"><canvas id="chart-tokens"></canvas></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Recent Activity</div></div>
          <div id="ov-timeline" style="max-height:220px;overflow-y:auto;font-size:11.5px"></div>
        </div>
      </div>

      <div class="grid cols-2 mt-lg">
        <div class="card span-full accent">
          <div class="card-header">
            <div class="card-title"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>Live Pulse <span class="live-badge" id="ov-pulse-badge">LIVE</span></div>
            <span class="pill cyan" id="ov-pulse-rate">0 / min</span>
          </div>
          <div id="ov-pulse" class="brain-feed" style="max-height:300px;overflow-y:auto"><div class="empty-tight">Awaiting live activity…</div></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Module Status</div></div>
          <div id="ov-modules"></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">System Health</div></div>
          <div id="ov-health"></div>
        </div>
      </div>
    </section>

    <!-- ════ INTELLIGENCE (Memory Constellation + Analytics) ═════════ -->
    <section class="section" id="tab-intelligence">
      <div class="accent-bar"></div>
      <div class="section-header">
        <div>
          <h1 class="section-title"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><line x1="7" y1="7" x2="10" y2="10.5"/><line x1="17" y1="7" x2="14" y2="10.5"/><line x1="7" y1="17" x2="10" y2="13.5"/><line x1="17" y1="17" x2="14" y2="13.5"/></svg>Intelligence</h1>
          <div class="section-subtitle">Memory Constellation — every memory, project, agent &amp; tag as a living graph, sized by importance</div>
        </div>
        <div class="section-actions">
          <input id="const-search" class="act-search" placeholder="Search nodes…" oninput="highlightConstSearch()">
          <button class="btn" onclick="rebuildConstellation()" title="Rebuild from the latest brain state"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>Rebuild</button>
          <button class="btn" onclick="resetConstellationView()" title="Reset zoom &amp; pan"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>Reset</button>
        </div>
      </div>

      <div class="filter-chips" id="const-chips">
        <button class="chip active" data-ntype="" onclick="setConstFilter(this,'')">All</button>
        <button class="chip" data-ntype="memory" onclick="setConstFilter(this,'memory')">Memories</button>
        <button class="chip" data-ntype="project" onclick="setConstFilter(this,'project')">Projects</button>
        <button class="chip" data-ntype="agent" onclick="setConstFilter(this,'agent')">Agents</button>
        <button class="chip" data-ntype="tag" onclick="setConstFilter(this,'tag')">Tags</button>
      </div>

      <div class="card" style="padding:0;overflow:hidden">
        <div class="const-wrap" id="const-wrap">
          <canvas id="const-canvas"></canvas>
          <div class="const-legend">
            <div class="lg-row"><span class="lg-dot" style="background:#18ffff"></span>Memory</div>
            <div class="lg-row"><span class="lg-dot" style="background:#10e68c"></span>Project</div>
            <div class="lg-row"><span class="lg-dot" style="background:#ffb53f"></span>Agent</div>
            <div class="lg-row"><span class="lg-dot" style="background:#a855f7"></span>Tag</div>
          </div>
          <div class="const-meta" id="const-meta">—</div>
          <div class="const-hint">scroll to zoom · drag to pan · click a node</div>
          <div class="const-empty" id="const-empty">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/></svg>
            <div class="ce-title">No memories yet</div>
            <div class="ce-msg">Attach Shadow Brain to your agents and let them work — memories will appear here as a living constellation.</div>
          </div>
          <div class="const-drawer" id="const-drawer">
            <button class="const-drawer-close" onclick="closeConstDrawer()" aria-label="Close">×</button>
            <div id="const-drawer-body"></div>
          </div>
          <div class="const-tip" id="const-tip"></div>
        </div>
      </div>

      <!-- Analytics strip -->
      <div class="grid cols-4 mt-lg">
        <div class="card stat-card accent"><div class="label">Total Memories</div><div class="value accent" id="intel-total">—</div><div class="trend" id="intel-total-sub">in the brain</div></div>
        <div class="card stat-card accent"><div class="label">Source Coverage</div><div class="value" id="intel-coverage">—</div><div class="meter mt"><div class="fill" id="intel-coverage-meter" style="width:0%"></div></div></div>
        <div class="card stat-card accent"><div class="label">Fresh (24h)</div><div class="value" id="intel-recent">—</div><div class="trend up" id="intel-recent-sub">new memories</div></div>
        <div class="card stat-card accent"><div class="label">High Importance</div><div class="value" id="intel-highimp">—</div><div class="trend" id="intel-highimp-sub">score ≥ 0.75</div></div>
      </div>
      <div class="grid cols-2 mt-lg">
        <div class="card"><div class="card-header"><div class="card-title">Top Agents by Contribution</div></div><div class="chart-wrap"><canvas id="chart-intel-agents"></canvas></div></div>
        <div class="card"><div class="card-header"><div class="card-title">Memory Categories</div></div><div class="chart-wrap"><canvas id="chart-intel-cats"></canvas></div></div>
      </div>
      <div class="grid cols-2 mt-lg">
        <div class="card"><div class="card-header"><div class="card-title">Top Tags</div></div><div id="intel-tags" class="tag-cloud"></div></div>
        <div class="card"><div class="card-header"><div class="card-title">Recent Memories</div></div><div id="intel-recent-list" class="stack" style="max-height:260px;overflow-y:auto"></div></div>
      </div>
    </section>

    <!-- ════ LIVE GRAPH ══════════════════════════════════════════════ -->
    <!-- WW2BR BRAIN -->
    <section class="section" id="tab-ww2br">
      <div class="accent-bar"></div>
      <div class="section-header">
        <div>
          <h1 class="section-title">WW2BR Brain View</h1>
          <div class="section-subtitle">Live project memory, recall, and integration status for the current game-development workflow</div>
        </div>
        <div class="section-actions">
          <button class="btn primary" onclick="refreshWW2BR()">Refresh</button>
        </div>
      </div>

      <div class="workflow-strip">
        <div>
          <div class="field" style="margin:0">
            <label>Active project path</label>
            <input class="workflow-path" id="ww2-project-path" value="D:\\New Game"/>
          </div>
        </div>
        <button class="btn" onclick="refreshWW2BR()">Load</button>
      </div>

      <div id="ww2-warnings" class="warning-stack"></div>

      <div class="grid cols-4">
        <div class="card stat-card">
          <div class="label">Global Memories</div>
          <div class="value accent" id="ww2-stat-memories">0</div>
          <div class="trend" id="ww2-stat-scope">project scoped</div>
        </div>
        <div class="card stat-card">
          <div class="label">Brain Projects</div>
          <div class="value" id="ww2-stat-projects">0</div>
          <div class="trend">known roots</div>
        </div>
        <div class="card stat-card">
          <div class="label">Agent Hooks</div>
          <div class="value" id="ww2-stat-hooks">0</div>
          <div class="trend">wired for this path</div>
        </div>
        <div class="card stat-card">
          <div class="label">Hit Rate</div>
          <div class="value" id="ww2-stat-hit">0%</div>
          <div class="trend" id="ww2-stat-sync">last sync unknown</div>
        </div>
      </div>

      <div class="grid cols-3 mt-lg">
        <div class="card">
          <div class="card-header"><div class="card-title">Memory Quality</div></div>
          <div id="ww2-quality" class="stack"></div>
        </div>
        <div class="card span-2">
          <div class="card-header">
            <div class="card-title">Context Continuity Pack</div>
            <button class="btn sm" onclick="openWW2ResumePack()">Markdown</button>
          </div>
          <div id="ww2-resume-pack"></div>
        </div>
      </div>

      <div class="grid cols-3 mt-lg">
        <div class="card span-2">
          <div class="card-header">
            <div class="card-title">Recent Brain Timeline</div>
            <button class="btn sm" onclick="refreshWW2BR()">Refresh</button>
          </div>
          <div id="ww2-timeline" class="brain-feed"></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Agent Integrations</div></div>
          <div id="ww2-agents" class="ops-agent-grid"></div>
        </div>
      </div>

      <div class="grid cols-3 mt-lg">
        <div class="card">
          <div class="card-header"><div class="card-title">Memory Categories</div></div>
          <div id="ww2-categories"></div>
        </div>
        <div class="card span-2">
          <div class="card-header"><div class="card-title">Recall Query</div></div>
          <div class="grid cols-3">
            <div class="field span-2"><label>Query</label><input id="ww2-query" placeholder="Gate 2, operator proof, lobby blocker"/></div>
            <div class="field"><label>Category</label><input id="ww2-category" placeholder="optional"/></div>
          </div>
          <div class="flex gap">
            <button class="btn primary" onclick="runWW2Recall()">Recall</button>
            <button class="btn" onclick="setWW2Query('Gate 2 visual proof')">Gate 2</button>
            <button class="btn" onclick="setWW2Query('operator hands rifle hold')">Operator</button>
            <button class="btn" onclick="setWW2Query('lobby verification blockers')">Lobby</button>
          </div>
          <div id="ww2-recall-results" class="brain-feed mt"></div>
        </div>
      </div>
    </section>

    <section class="section" id="tab-graph">
      <div class="accent-bar"></div>
      <div class="section-header">
        <div>
          <h1 class="section-title">Live Agent Network</h1>
          <div class="section-subtitle">Real-time signal flow: brain ↔ agents ↔ sub-agents</div>
        </div>
      </div>
      <div class="card" style="padding:0">
        <div class="graph-wrap"><canvas id="graph-canvas" width="1600" height="600"></canvas></div>
        <div style="padding:10px 14px;display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:var(--text-2)">
          <span><span style="color:var(--success)">●</span> memory-write</span>
          <span><span style="color:var(--brand-cyan)">●</span> subagent-spawn</span>
          <span><span style="color:var(--brand-purple)">●</span> dream</span>
          <span><span style="color:var(--danger)">●</span> collision</span>
          <span><span style="color:var(--warning)">●</span> firewall-block</span>
          <span id="graph-meta" style="margin-left:auto;color:var(--text-3)"></span>
        </div>
      </div>
    </section>

    <!-- ════ AGENTS ══════════════════════════════════════════════════ -->
    <section class="section" id="tab-agents">
      <div class="accent-bar"></div>
      <div class="section-header">
        <div>
          <h1 class="section-title">Agent Connections</h1>
          <div class="section-subtitle">Connect or disconnect Shadow Brain hooks per agent · per-agent native mechanisms</div>
        </div>
        <div class="section-actions">
          <button class="btn success" onclick="attachAll()">Attach All</button>
          <button class="btn danger" onclick="detachAll()">Detach All</button>
        </div>
      </div>
      <div class="card" style="padding:0">
        <table class="table">
          <thead><tr><th>Agent</th><th>Detected</th><th>Hook Status</th><th>Install Path</th><th style="text-align:right">Action</th></tr></thead>
          <tbody id="agents-table"></tbody>
        </table>
      </div>
    </section>

    <!-- ════ CHAT WITH BRAIN ═════════════════════════════════════════ -->
    <section class="section" id="tab-chat">
      <div class="accent-bar"></div>
      <div class="section-header">
        <div>
          <h1 class="section-title"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Chat with Your Brain</h1>
          <div class="section-subtitle">Ask anything — Shadow Brain retrieves relevant memories via semantic search and cites them. Uses your configured lead model.</div>
        </div>
        <div class="section-actions">
          <button class="btn" onclick="newChat()">New Chat</button>
          <button class="btn danger" onclick="clearAllChats()">Clear All</button>
        </div>
      </div>
      <div class="grid" style="grid-template-columns: 260px 1fr; gap: 14px">
        <div class="card" style="height: calc(100vh - 220px); overflow-y: auto; padding: 12px">
          <div class="card-title" style="margin-bottom: 10px">Conversations</div>
          <div id="chat-conversations"></div>
        </div>
        <div class="card" style="height: calc(100vh - 220px); display: flex; flex-direction: column; padding: 0">
          <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 16px"></div>
          <div style="border-top: 1px solid var(--border); padding: 12px; display: flex; gap: 8px">
            <input id="chat-input" placeholder="Ask your brain — e.g. 'What did Cursor decide about bcrypt?'" style="flex:1;background:var(--bg-elev-1);border:1px solid var(--border);border-radius:8px;padding:10px 14px;color:var(--text);font-size:13px" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChat()}"/>
            <button class="btn primary" onclick="sendChat()" id="chat-send-btn">Send</button>
          </div>
          <div class="mono" style="padding: 4px 16px 10px; font-size: 10px; color: var(--text-3)" id="chat-status">idle</div>
        </div>
      </div>
    </section>

    <!-- ════ MEMORY BROWSER ══════════════════════════════════════════ -->
    <section class="section" id="tab-memory">
      <div class="accent-bar"></div>
      <div class="section-header">
        <div>
          <h1 class="section-title">Memory Browser</h1>
          <div class="section-subtitle">Full-text search plus live memory quality, provenance, freshness, and agent coverage</div>
        </div>
      </div>
      <div class="card">
        <div class="grid cols-4">
          <div class="field"><label>Search query</label><input id="mem-query" placeholder="e.g. auth, react, bcrypt…"/></div>
          <div class="field"><label>Agent</label><select id="mem-agent"><option value="">all agents</option><option>claude-code</option><option>cursor</option><option>codex</option><option>cline</option><option>copilot</option><option>windsurf</option><option>kilo-code</option><option>roo-code</option><option>aider</option><option>opencode</option></select></div>
          <div class="field"><label>Category</label><input id="mem-category" placeholder="e.g. security"/></div>
          <div class="field"><label>Min importance</label><input id="mem-importance" type="number" min="0" max="1" step="0.1" value="0"/></div>
        </div>
        <button class="btn primary" onclick="searchMemory()">Search</button>
      </div>
      <div class="card mt">
        <table class="table"><thead><tr><th>ID</th><th>Agent</th><th>Category</th><th>Content</th><th>Importance</th><th>Created</th></tr></thead>
          <tbody id="mem-results"></tbody>
        </table>
      </div>
    </section>

    <!-- ════ LIVE BRAIN ═══════════════════════════════════════════════ -->
    <!-- MEMORY SEEDER -->
    <section class="section" id="tab-seeder">
      <div class="accent-bar"></div>
      <div class="section-header">
        <div>
          <h1 class="section-title">Memory Seeder</h1>
          <div class="section-subtitle">Research drafts, approval gates, and source-backed global brain writes</div>
        </div>
        <div class="section-actions">
          <button class="btn" onclick="refreshSeedDrafts()">Refresh</button>
        </div>
      </div>

      <div class="grid cols-3">
        <div class="card span-2">
          <div class="card-header"><div class="card-title">Seed Research Draft</div></div>
          <div class="grid cols-2">
            <div class="field"><label>Project path</label><input id="seed-project-path" placeholder="C:\\path\\to\\project"/></div>
            <div class="field"><label>Topic</label><input id="seed-topic" placeholder="memory routing, architecture, release, debugging"/></div>
          </div>
          <div class="field"><label>Objective</label><input id="seed-objective" placeholder="what the next agent must learn and reuse"/></div>
          <div class="grid cols-3">
            <div class="field"><label>Research agent</label><select id="seed-research-agent"><option>codex</option><option>claude-code</option><option>cursor</option><option>cline</option><option>copilot</option><option>windsurf</option><option>kilo-code</option><option>roo-code</option><option>aider</option><option>opencode</option></select></div>
            <div class="field"><label>Approver</label><select id="seed-approver-agent"><option>user</option><option>codex</option><option>claude-code</option><option>cursor</option><option>cline</option><option>copilot</option><option>windsurf</option><option>kilo-code</option><option>roo-code</option><option>aider</option><option>opencode</option></select></div>
            <div class="field"><label>Approval mode</label><select id="seed-approval-mode"><option>user</option><option>agent</option><option>dual</option></select></div>
          </div>
          <div class="grid cols-3">
            <div class="field"><label>Category</label><input id="seed-category" value="project.research"/></div>
            <div class="field"><label>Tags</label><input id="seed-tags" placeholder="enterprise,memory,release"/></div>
            <div class="field"><label>Importance</label><input id="seed-importance" type="number" min="0.05" max="1" step="0.05" value="0.78"/></div>
          </div>
          <div class="field"><label>Sources</label><textarea id="seed-sources" rows="2" placeholder="README.md, CHANGELOG.md, docs/launch/RELEASE_NOTES_v6.0.3.md"></textarea></div>
          <div class="field"><label>Research notes</label><textarea id="seed-content" rows="4" placeholder="facts, constraints, tradeoffs, exact commands, source-backed decisions"></textarea></div>
          <div class="flex gap">
            <button class="btn primary" onclick="quickSeed()" title="Create, approve, and save to the brain in one step">⚡ Quick Save</button>
            <button class="btn" onclick="createSeedDraft()" title="Create a draft that waits for approval">Create Draft (review first)</button>
            <button class="btn" onclick="copyLivePathToSeeder()">Use Live Brain Path</button>
          </div>
          <div class="section-subtitle" style="margin-top:8px">Quick Save is the fast, one-click path. Use "Create Draft" when you want a review/approval step before it's saved.</div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Seeder Status</div></div>
          <div id="seed-status" class="stack"></div>
        </div>
      </div>

      <div class="card mt-lg">
        <div class="card-header">
          <div class="card-title">Approval Queue</div>
          <button class="btn sm" onclick="refreshSeedDrafts()">Refresh</button>
        </div>
        <div id="seed-drafts" class="brain-feed"></div>
      </div>
    </section>

    <section class="section" id="tab-livebrain">
      <div class="accent-bar"></div>
      <div class="section-header">
        <div>
          <h1 class="section-title">Live Brain</h1>
          <div class="section-subtitle">Memory health, source coverage, recall eval, and agent briefing for the current workspace</div>
        </div>
        <div class="section-actions">
          <button class="btn" onclick="openSeederForLiveBrain()">Seed Memory</button>
          <button class="btn primary" onclick="refreshLiveBrain()">Refresh</button>
        </div>
      </div>
      <div class="grid cols-4">
        <div class="card stat-card"><div class="label">Total Memories</div><div class="value" id="mem-total">0</div><div class="trend" id="mem-sampled">sampled</div></div>
        <div class="card stat-card"><div class="label">Source Coverage</div><div class="value" id="mem-source">0%</div><div class="trend">evidence-backed records</div></div>
        <div class="card stat-card"><div class="label">Fresh 7 Days</div><div class="value" id="mem-fresh">0</div><div class="trend">recent learning</div></div>
        <div class="card stat-card"><div class="label">Seed Queue</div><div class="value" id="mem-seed-open">0</div><div class="trend" id="mem-seed-sub">approval queue</div></div>
      </div>
      <div class="grid cols-3 mt">
        <div class="card"><div class="card-header"><div class="card-title">Top Categories</div></div><div id="mem-categories"></div></div>
        <div class="card"><div class="card-header"><div class="card-title">Agent Coverage</div></div><div id="mem-agents"></div></div>
        <div class="card"><div class="card-header"><div class="card-title">Top Tags</div></div><div id="mem-tags"></div></div>
      </div>
      <div class="card mt">
        <div class="field-row">
          <div class="field"><label>Project path</label><input id="live-project-path" placeholder="C:\\path\\to\\project"/></div>
          <div class="field"><label>Eval queries</label><input id="live-queries" placeholder="current blocker|do not repeat|verified command"/></div>
        </div>
      </div>
      <div class="grid cols-4 mt">
        <div class="card stat-card"><div class="label">Memories</div><div class="value" id="live-memories">0</div><div class="trend" id="live-scope">scope</div></div>
        <div class="card stat-card"><div class="label">Quality</div><div class="value" id="live-quality">0</div><div class="trend">average score</div></div>
        <div class="card stat-card"><div class="label">Sources</div><div class="value" id="live-sources">0%</div><div class="trend">coverage</div></div>
        <div class="card stat-card"><div class="label">Recall</div><div class="value" id="live-recall">0</div><div class="trend">avg hits/query</div></div>
      </div>
      <div class="grid cols-2 mt-lg">
        <div class="card">
          <div class="card-header"><div class="card-title">Recommended Actions</div></div>
          <div id="live-actions" class="stack"></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Recall Eval</div></div>
          <div id="live-eval" class="stack"></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Top Memories</div></div>
          <div id="live-top" class="stack"></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Agent Briefing</div></div>
          <pre class="mono" id="live-brief" style="max-height:360px;overflow:auto;background:var(--bg-elev-1);padding:12px;border-radius:6px;white-space:pre-wrap"></pre>
        </div>
      </div>
    </section>

    <!-- ════ ACTIVITY LOG ════════════════════════════════════════════ -->
    <section class="section" id="tab-activity">
      <div class="accent-bar"></div>
      <div class="section-header">
        <div>
          <h1 class="section-title">Activity Log <span class="live-badge" id="act-live-badge" title="Streaming live over WebSocket">LIVE</span></h1>
          <div class="section-subtitle">Realtime stream: memory writes, SABB spawns, collisions, dreams, seeds, consolidations, firewall blocks</div>
        </div>
        <div class="section-actions">
          <input id="act-search" class="act-search" placeholder="Search activity…" oninput="renderActivityTable()">
          <button class="btn" id="act-pause-btn" onclick="toggleActivityPause()" title="Pause/resume the live stream">Pause</button>
          <button class="btn danger" onclick="clearActivity()" title="Clear the activity view">Clear</button>
          <button class="btn" onclick="refreshActivity()">Refresh</button>
        </div>
      </div>
      <div class="filter-chips" id="act-chips">
        <button class="chip active" data-type="" onclick="setActivityFilter(this,'')">All</button>
        <button class="chip" data-type="memory-write" onclick="setActivityFilter(this,'memory-write')">Memory</button>
        <button class="chip" data-type="dream" onclick="setActivityFilter(this,'dream')">Dreams</button>
        <button class="chip" data-type="seed-draft" onclick="setActivityFilter(this,'seed-draft')">Seeds</button>
        <button class="chip" data-type="collision" onclick="setActivityFilter(this,'collision')">Collisions</button>
        <button class="chip" data-type="subagent-spawn" onclick="setActivityFilter(this,'subagent-spawn')">Sub-Agents</button>
        <button class="chip" data-type="consolidation" onclick="setActivityFilter(this,'consolidation')">Consolidation</button>
      </div>
      <div class="grid cols-2 mb">
        <div class="card">
          <div class="card-header"><div class="card-title">Events / min</div><span class="pill cyan" id="act-rate-pill">0 / min</span></div>
          <div class="chart-wrap" style="height:120px"><canvas id="act-spark"></canvas></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Stream Stats</div></div>
          <div class="row"><span class="k">Events buffered</span><span class="v" id="act-stat-total">0</span></div>
          <div class="row"><span class="k">Live status</span><span class="v good" id="act-stat-live">streaming</span></div>
          <div class="row"><span class="k">Last event</span><span class="v" id="act-stat-last">—</span></div>
        </div>
      </div>
      <div class="card" style="padding:0">
        <table class="table"><thead><tr><th>Time</th><th>Source</th><th>Type</th><th>Detail</th></tr></thead><tbody id="activity-table"></tbody></table>
      </div>
    </section>

    <!-- ════ SABB ════════════════════════════════════════════════════ -->
    <section class="section" id="tab-sabb">
      <div class="accent-bar"></div>
      <div class="section-header">
        <div>
          <h1 class="section-title">Sub-Agent Brain Bridge</h1>
          <div class="section-subtitle">Context slivers + quarantine for Claude Task / Cursor Composer / CrewAI / LangGraph / AutoGen</div>
        </div>
      </div>
      <div class="grid cols-2">
        <div class="card">
          <div class="card-header"><div class="card-title">SABB Stats</div></div>
          <div id="sabb-stats"></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Compute Context Sliver</div></div>
          <div class="field"><label>Parent agent</label><select id="sabb-parent"><option>claude-code</option><option>cursor</option><option>cline</option><option>codex</option></select></div>
          <div class="field"><label>Framework</label><select id="sabb-framework"><option>claude-code-task</option><option>cursor-composer</option><option>cline-substep</option><option>crewai</option><option>langgraph</option><option>autogen</option><option>generic</option></select></div>
          <div class="field"><label>Task description</label><input id="sabb-task" placeholder="e.g. refactor auth middleware"/></div>
          <div class="field-row">
            <div class="field"><label>Token budget</label><input id="sabb-budget" value="300"/></div>
            <div class="field"><label>&nbsp;</label><button class="btn primary" onclick="computeSliver()" style="width:100%">Generate</button></div>
          </div>
          <pre class="mono" id="sabb-sliver-output" style="margin-top:10px;max-height:220px;overflow:auto;background:var(--bg-elev-1);padding:10px;border-radius:6px"></pre>
        </div>
      </div>
      <div class="card mt-lg" style="padding:0">
        <div style="padding:14px 18px 6px"><div class="card-title">Quarantined Memories</div></div>
        <table class="table"><thead><tr><th>ID</th><th>Sub-Agent</th><th>Category</th><th>Conf.</th><th>Content</th><th style="text-align:right">Action</th></tr></thead><tbody id="sabb-quarantine"></tbody></table>
      </div>
    </section>

    <!-- ════ CAUSAL CHAINS ═══════════════════════════════════════════ -->
    <section class="section" id="tab-causal">
      <div class="accent-bar"></div>
      <div class="section-header">
        <div><h1 class="section-title">Causal Memory Chains</h1><div class="section-subtitle">Trace the full causal history of any decision</div></div>
      </div>
      <div class="grid cols-3">
        <div class="card">
          <div class="card-header"><div class="card-title">Stats</div></div>
          <div id="causal-stats"></div>
        </div>
        <div class="card span-2">
          <div class="card-header"><div class="card-title">Trace Ancestors / Descendants</div></div>
          <div class="field"><label>Memory ID</label><input id="causal-mem-id" placeholder="abc123…"/></div>
          <div class="field-row">
            <div class="field"><label>Max depth</label><input id="causal-depth" value="8"/></div>
            <div class="field"><label>&nbsp;</label><div style="display:flex;gap:6px"><button class="btn primary" onclick="traceCausal()" style="flex:1">Ancestors</button><button class="btn" onclick="influenceCausal()" style="flex:1">Descendants</button></div></div>
          </div>
        </div>
      </div>
      <div class="card mt-lg" style="padding:0">
        <div style="padding:14px 18px 6px"><div class="card-title">Causal Chain Graph</div></div>
        <div class="dag-wrap" id="causal-dag-wrap" style="margin:0 14px 14px">
          <canvas id="causal-dag"></canvas>
          <div class="dag-empty" id="causal-dag-empty">Enter a memory ID and trace ancestors or descendants to render its causal chain.</div>
        </div>
      </div>
      <div class="card mt-lg">
        <div class="card-header"><div class="card-title">Record a Causal Link</div></div>
        <div class="grid cols-3">
          <div class="field"><label>Effect ID</label><input id="causal-effect"/></div>
          <div class="field"><label>Cause ID</label><input id="causal-cause"/></div>
          <div class="field"><label>Rationale (optional)</label><input id="causal-rationale"/></div>
        </div>
        <button class="btn primary" onclick="linkCausal()">Record Link</button>
      </div>
    </section>

    <!-- ════ COLLISION ═══════════════════════════════════════════════ -->
    <section class="section" id="tab-collision">
      <div class="accent-bar"></div>
      <div class="section-header"><div><h1 class="section-title">Agent Collision Detective</h1><div class="section-subtitle">Real-time conflict detection across agent edit intents</div></div></div>
      <div class="grid cols-2">
        <div class="card"><div class="card-header"><div class="card-title">Stats</div></div><div id="collision-stats"></div></div>
        <div class="card"><div class="card-header"><div class="card-title">Active Alerts</div></div><div id="collision-alerts"></div></div>
      </div>
      <div class="card mt-lg" style="padding:0">
        <div style="padding:14px 18px 6px"><div class="card-title">Active Edit Intents</div></div>
        <table class="table"><thead><tr><th>Agent</th><th>File</th><th>Lines</th><th>Intent</th><th>Expires</th></tr></thead><tbody id="collision-intents"></tbody></table>
      </div>
    </section>

    <!-- ════ DREAM ═══════════════════════════════════════════════════ -->
    <section class="section" id="tab-dream">
      <div class="accent-bar"></div>
      <div class="section-header">
        <div><h1 class="section-title">Dream Engine</h1><div class="section-subtitle">Background idle reflection — local-first via Ollama</div></div>
        <div class="section-actions"><button class="btn primary" onclick="runDream()">Run Cycle</button><button class="btn" onclick="startDreamLoop()">Start Loop</button></div>
      </div>
      <div class="grid cols-3">
        <div class="card"><div class="card-header"><div class="card-title">Stats</div></div><div id="dream-stats"></div></div>
        <div class="card span-2"><div class="card-header"><div class="card-title">Dream Type Distribution</div></div><div class="chart-wrap"><canvas id="chart-dreams"></canvas></div></div>
      </div>
      <div class="card mt-lg" style="padding:0">
        <div style="padding:14px 18px 6px"><div class="card-title">Recent Dreams</div></div>
        <table class="table"><thead><tr><th>Type</th><th>Content</th><th>Conf.</th><th>Action</th><th></th></tr></thead><tbody id="dream-list"></tbody></table>
      </div>
    </section>

    <!-- ════ REPUTATION ══════════════════════════════════════════════ -->
    <section class="section" id="tab-reputation">
      <div class="accent-bar"></div>
      <div class="section-header"><div><h1 class="section-title">Agent Reputation Ledger</h1><div class="section-subtitle">Ed25519-signed decision receipts · portable trust score</div></div></div>
      <div class="grid cols-2">
        <div class="card"><div class="card-header"><div class="card-title">Ledger Stats</div></div><div id="reputation-stats"></div></div>
        <div class="card">
          <div class="card-header"><div class="card-title">Generate Badge</div></div>
          <div class="field-row">
            <div class="field"><label>Agent</label><select id="rep-agent"><option>claude-code</option><option>cursor</option><option>codex</option><option>cline</option></select></div>
            <div class="field"><label>Version</label><input id="rep-ver" placeholder="4.7"/></div>
          </div>
          <button class="btn primary" onclick="genBadge()">Generate</button>
          <pre class="mono" id="rep-badge-output" style="margin-top:10px;background:var(--bg-elev-1);padding:10px;border-radius:6px"></pre>
        </div>
      </div>
      <div class="card mt-lg">
        <div class="card-header"><div class="card-title">Agent Trust</div></div>
        <div id="rep-trust-grid" class="trust-grid"></div>
      </div>
      <div class="card mt-lg" style="padding:0">
        <div style="padding:14px 18px 6px"><div class="card-title">Agent Leaderboard</div></div>
        <table class="table"><thead><tr><th>Agent</th><th>Accuracy</th><th>Decisions</th><th>Correct/Incorrect/Partial</th></tr></thead><tbody id="rep-leaderboard"></tbody></table>
      </div>
    </section>

    <!-- ════ DEBATE ══════════════════════════════════════════════════ -->
    <section class="section" id="tab-debate">
      <div class="accent-bar"></div>
      <div class="section-header"><div><h1 class="section-title">Swarm Debate Protocol</h1><div class="section-subtitle">Pro / con / arbiter multi-agent debate for critical decisions</div></div></div>
      <div class="card">
        <div class="field"><label>Question</label><input id="debate-question" placeholder="e.g. Redis or Postgres for session storage?"/></div>
        <div class="field"><label>Context</label><textarea id="debate-context" rows="2" placeholder="e.g. 10k users, read-heavy workload"></textarea></div>
        <div class="field-row"><div class="field"><label>Turns per side</label><input id="debate-turns" value="2"/></div><div class="field"><label>&nbsp;</label><button class="btn primary" onclick="runDebate()" style="width:100%">Run Debate</button></div></div>
        <pre class="mono" id="debate-output" style="margin-top:12px;max-height:420px;overflow:auto;background:var(--bg-elev-1);padding:12px;border-radius:6px"></pre>
      </div>
    </section>

    <!-- ════ PREMORTEM ═══════════════════════════════════════════════ -->
    <section class="section" id="tab-premortem">
      <div class="accent-bar"></div>
      <div class="section-header"><div><h1 class="section-title">Pre-Mortem Assistant</h1><div class="section-subtitle">Surface past failures from YOUR project before significant tasks</div></div></div>
      <div class="card">
        <div class="field"><label>Task description</label><input id="pm-task" placeholder="e.g. migrate auth to passkeys"/></div>
        <button class="btn primary" onclick="runPremortem()">Run Pre-Mortem</button>
        <div id="pm-output" style="margin-top:14px"></div>
      </div>
    </section>

    <!-- ════ ATTENTION ═══════════════════════════════════════════════ -->
    <section class="section" id="tab-attention">
      <div class="accent-bar"></div>
      <div class="section-header"><div><h1 class="section-title">Attention Heatmap</h1><div class="section-subtitle">See which memories shaped a decision — weighted attribution</div></div></div>
      <div class="card">
        <div class="field"><label>Decision text</label><input id="att-decision" placeholder="e.g. use parameterized SQL queries"/></div>
        <div class="field"><label>Candidate memory IDs (comma-separated, optional — blank uses recent)</label><input id="att-memories" placeholder="id1, id2, id3"/></div>
        <button class="btn primary" onclick="runAttention()">Compute Attention</button>
        <div id="att-output" style="margin-top:14px"></div>
      </div>
    </section>

    <!-- ════ TOKENS ══════════════════════════════════════════════════ -->
    <section class="section" id="tab-tokens">
      <div class="accent-bar"></div>
      <div class="section-header"><div><h1 class="section-title">Token Economy Engine</h1><div class="section-subtitle">Cross-agent spend tracking · savings suggestions · routing advice</div></div></div>
      <div class="grid cols-4">
        <div class="card stat-card"><div class="label">Current Agent</div><div class="value" id="tok-agent">—</div><div class="trend" id="tok-runtime">runtime context</div></div>
        <div class="card stat-card"><div class="label">Total Spend</div><div class="value" id="tok-total">$—</div><div class="trend">all historical records</div></div>
        <div class="card stat-card"><div class="label">Last 7 Days</div><div class="value" id="tok-recent">$—</div><div class="trend">recent records only</div></div>
        <div class="card stat-card"><div class="label">Total Calls</div><div class="value" id="tok-calls">—</div><div class="trend" id="tok-calls-sub"></div></div>
      </div>
      <div class="grid cols-2 mt">
        <div class="card stat-card"><div class="label">Monthly Projection</div><div class="value" id="tok-proj">$—</div><div class="trend">from last 7 days</div></div>
        <div class="card stat-card"><div class="label">Estimated opportunity</div><div class="value" style="color:var(--success)" id="tok-save">$—</div><div class="trend up">manual ledger · pricing estimates</div></div>
      </div>
      <div class="warning-banner mt" id="tok-runtime-note"><strong>Accuracy</strong><span>Token records are historical. Current agent and model spend are shown separately.</span></div>
      <div class="grid cols-2 mt-lg">
        <div class="card"><div class="card-header"><div class="card-title">Recent Spend by Agent</div></div><div class="chart-wrap"><canvas id="chart-tokens-agent"></canvas></div><div id="tok-agent-table" class="mt"></div></div>
        <div class="card"><div class="card-header"><div class="card-title">Historical Spend by Model</div></div><div class="chart-wrap"><canvas id="chart-tokens-model"></canvas></div><div id="tok-model-table" class="mt"></div></div>
        <div class="card span-2"><div class="card-header"><div class="card-title">Savings Suggestions</div></div><div id="tok-suggestions"></div></div>
      </div>
    </section>

    <!-- ════ FORGET ══════════════════════════════════════════════════ -->
    <section class="section" id="tab-forget">
      <div class="accent-bar"></div>
      <div class="section-header"><div><h1 class="section-title">Forgetting Curve + Sleep Consolidation</h1><div class="section-subtitle">Ebbinghaus-inspired natural decay · tier promotion</div></div><div class="section-actions"><button class="btn primary" onclick="runForget()">Run Consolidation Cycle</button></div></div>
      <div class="grid cols-2">
        <div class="card"><div class="card-header"><div class="card-title">Last Cycle</div></div><div id="forget-output"></div></div>
        <div class="card"><div class="card-header"><div class="card-title">Memory Strength Distribution</div></div><div class="chart-wrap"><canvas id="chart-forget"></canvas></div></div>
      </div>
    </section>

    <!-- ════ FORMAL ══════════════════════════════════════════════════ -->
    <section class="section" id="tab-formal">
      <div class="accent-bar"></div>
      <div class="section-header"><div><h1 class="section-title">Formal Verification Bridge</h1><div class="section-subtitle">Natural-language rules → ESLint / Semgrep / LSP diagnostics</div></div></div>
      <div class="grid cols-2">
        <div class="card">
          <div class="card-header"><div class="card-title">Generate Rule</div></div>
          <div class="field"><label>Natural-language rule</label><textarea id="formal-text" rows="3" placeholder="e.g. always use parameterized SQL queries"></textarea></div>
          <button class="btn primary" onclick="genFormal()">Generate</button>
          <pre class="mono" id="formal-output" style="margin-top:12px;max-height:220px;overflow:auto;background:var(--bg-elev-1);padding:10px;border-radius:6px"></pre>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Exports</div></div>
          <div class="flex gap"><button class="btn" onclick="exportEslint()">ESLint</button><button class="btn" onclick="exportSemgrep()">Semgrep YAML</button></div>
          <pre class="mono" id="formal-export" style="margin-top:12px;max-height:280px;overflow:auto;background:var(--bg-elev-1);padding:10px;border-radius:6px"></pre>
        </div>
      </div>
    </section>

    <!-- ════ CALIBRATION ═════════════════════════════════════════════ -->
    <section class="section" id="tab-calibration">
      <div class="accent-bar"></div>
      <div class="section-header"><div><h1 class="section-title">Confidence Calibration Monitor</h1><div class="section-subtitle">Brier scores &amp; trust weight per agent per category</div></div></div>
      <div class="card mb-lg">
        <div class="card-header"><div class="card-title">Brier Score vs Trust Weight by Agent</div></div>
        <div class="chart-wrap"><canvas id="chart-calibration"></canvas></div>
      </div>
      <div class="card" style="padding:0">
        <table class="table"><thead><tr><th>Agent</th><th>Category</th><th>Brier</th><th>Cal. Error</th><th>Overconf.</th><th>Trust Weight</th><th>Samples</th></tr></thead><tbody id="calibration-table"></tbody></table>
      </div>
    </section>

    <!-- ════ BRANCH ══════════════════════════════════════════════════ -->
    <section class="section" id="tab-branch">
      <div class="accent-bar"></div>
      <div class="section-header"><div><h1 class="section-title">Branch Brains</h1><div class="section-subtitle">Git-branch-aware memory context</div></div></div>
      <div class="grid cols-4" id="branch-cards"></div>
      <div class="card mt-lg"><div class="card-header"><div class="card-title">Branch-Specific Categories</div></div><div id="branch-cats" class="tag-cloud"></div></div>
    </section>

    <!-- ════ PRIVACY ═════════════════════════════════════════════════ -->
    <section class="section" id="tab-privacy">
      <div class="accent-bar"></div>
      <div class="section-header"><div><h1 class="section-title">Privacy & Safety</h1><div class="section-subtitle">Air-Gap mode · encryption · hallucination quarantine</div></div></div>
      <div class="grid cols-2">
        <div class="card">
          <div class="card-header"><div class="card-title">Air-Gap Mode</div></div>
          <div id="airgap-state"></div>
          <div class="flex gap mt"><button class="btn success" onclick="enableAirGap()">Enable (strict)</button><button class="btn danger" onclick="disableAirGap()">Disable</button></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Hallucination Quarantine</div></div>
          <div id="quarantine-state"></div>
        </div>
      </div>
      <div class="card mt-lg" style="padding:0">
        <div style="padding:14px 18px 6px"><div class="card-title">Pending Quarantine Queue</div></div>
        <table class="table"><thead><tr><th>ID</th><th>Source</th><th>Claim</th><th>Reason</th><th style="text-align:right">Action</th></tr></thead><tbody id="quarantine-list"></tbody></table>
      </div>
    </section>

    <!-- ════ VOICE ═══════════════════════════════════════════════════ -->
    <section class="section" id="tab-voice">
      <div class="accent-bar"></div>
      <div class="section-header"><div><h1 class="section-title">Voice Mode</h1><div class="section-subtitle">Process voice transcripts · local Whisper-compatible</div></div></div>
      <div class="card">
        <div class="field"><label>Transcript</label><input id="voice-input" placeholder="e.g. brain status"/></div>
        <button class="btn primary" onclick="sendVoice()">Process</button>
        <pre class="mono" id="voice-output" style="margin-top:12px;background:var(--bg-elev-1);padding:10px;border-radius:6px"></pre>
      </div>
    </section>

    <!-- ════ GARDEN ══════════════════════════════════════════════════ -->
    <section class="section" id="tab-garden">
      <div class="accent-bar"></div>
      <div class="section-header"><div><h1 class="section-title">Brain Garden</h1><div class="section-subtitle">Living constellation visualization of the brain</div></div></div>
      <div class="card">
        <canvas id="garden-canvas" width="1200" height="500" style="width:100%;background:radial-gradient(ellipse at center, rgba(24,255,255,0.04), transparent);border-radius:8px;display:block"></canvas>
        <div class="mono mt" id="garden-stats"></div>
      </div>
    </section>

    <!-- ════ PR REVIEW ═══════════════════════════════════════════════ -->
    <section class="section" id="tab-pr">
      <div class="accent-bar"></div>
      <div class="section-header"><div><h1 class="section-title">PR Auto-Review</h1><div class="section-subtitle">Generate GitHub PR comments from brain memories</div></div></div>
      <div class="card">
        <div class="grid cols-2">
          <div class="field"><label>Repo (owner/name)</label><input id="pr-repo" placeholder="theihtisham/agent-shadow-brain"/></div>
          <div class="field"><label>PR number</label><input id="pr-num" placeholder="42"/></div>
        </div>
        <div class="field"><label>Changed files (comma-separated)</label><input id="pr-files"/></div>
        <div class="field"><label>Diff summary</label><textarea id="pr-diff" rows="4"></textarea></div>
        <button class="btn primary" onclick="genPRReview()">Generate Review</button>
        <pre class="mono" id="pr-output" style="margin-top:14px;max-height:400px;overflow:auto;background:var(--bg-elev-1);padding:14px;border-radius:6px"></pre>
      </div>
    </section>

    <!-- ════ TEAM ════════════════════════════════════════════════════ -->
    <section class="section" id="tab-team">
      <div class="accent-bar"></div>
      <div class="section-header"><div><h1 class="section-title">Team Brain Sync</h1><div class="section-subtitle">Peer-to-peer brain sync (WebRTC, no server)</div></div></div>
      <div class="grid cols-2">
        <div class="card"><div class="card-header"><div class="card-title">My Peer Info</div></div><div id="team-self"></div></div>
        <div class="card"><div class="card-header"><div class="card-title">Connected Peers</div></div><div id="team-peers"></div></div>
      </div>
    </section>

    <!-- ════ EXCHANGE ════════════════════════════════════════════════ -->
    <section class="section" id="tab-exchange">
      <div class="accent-bar"></div>
      <div class="section-header"><div><h1 class="section-title">Brain Exchange</h1><div class="section-subtitle">Export / import curated shareable brain slices</div></div></div>
      <div class="grid cols-2">
        <div class="card">
          <div class="card-header"><div class="card-title">Export Package</div></div>
          <div class="field"><label>Name</label><input id="ex-name" placeholder="react-patterns-v1"/></div>
          <div class="field"><label>Description</label><input id="ex-desc"/></div>
          <div class="field-row">
            <div class="field"><label>Author</label><input id="ex-author" value="anonymous"/></div>
            <div class="field"><label>Tags (csv)</label><input id="ex-tags" placeholder="react, auth"/></div>
          </div>
          <button class="btn primary" onclick="exportPackage()">Export</button>
          <div class="mono mt" id="ex-out"></div>
        </div>
        <div class="card"><div class="card-header"><div class="card-title">Local Packages</div></div><div id="ex-list"></div></div>
      </div>
    </section>

    <!-- ════ FEATURE TOGGLES ═════════════════════════════════════════ -->
    <section class="section" id="tab-features">
      <div class="accent-bar"></div>
      <div class="section-header"><div><h1 class="section-title">Feature controls</h1><div class="section-subtitle">Manage context, briefings, and the activity feed in the workspace.</div></div></div>
      <div class="card"><div class="feature-grid" id="feature-grid"></div></div>
    </section>

    <!-- ════ MODELS & INTELLIGENCE ═══════════════════════════════════ -->
    <section class="section" id="tab-models">
      <div class="accent-bar"></div>
      <div class="section-header">
        <div>
          <h1 class="section-title">Models & Brain Intelligence</h1>
          <div class="section-subtitle">Route the Hive Mind through Ollama · Anthropic · OpenAI · OpenRouter · Moonshot/Kimi · Gemini · DeepSeek · Mistral using the provider settings configured for Shadow Brain</div>
        </div>
        <div class="section-actions"><button class="btn" onclick="refreshModels()">Refresh</button></div>
      </div>

      <div class="card mb-lg">
        <div class="card-header"><div class="card-title">Brain Intelligence Configuration</div></div>
        <div class="grid cols-2">
          <div class="field"><label>Lead Provider</label><select id="intel-provider"></select></div>
          <div class="field"><label>Lead Model</label><select id="intel-model"></select></div>
        </div>
        <div class="feature-toggle"><div class="icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div><div class="meta"><div class="name">Prefer Local-First (Ollama)</div><div class="desc">Route everything through Ollama when possible · zero cost · offline-ready</div></div><label class="switch"><input type="checkbox" id="intel-local-first"><span class="slider"></span></label></div>
        <button class="btn primary mt" onclick="saveIntelligence()">Save Intelligence Config</button>
        <div class="mono mt" id="intel-result"></div>
      </div>

      <div class="card mb-lg">
        <div class="card-header"><div class="card-title">Provider Configuration</div></div>
        <div class="grid cols-2" id="providers-grid"></div>
      </div>

    </section>

    <!-- ════ CONFIG ══════════════════════════════════════════════════ -->
    <section class="section" id="tab-config">
      <div class="accent-bar"></div>
      <div class="section-header"><div><h1 class="section-title">Configuration</h1><div class="section-subtitle">LLM provider · API keys · MCP server · global settings</div></div></div>
      <div class="grid cols-2">
        <div class="card">
          <div class="card-header"><div class="card-title">LLM Provider</div></div>
          <div class="field"><label>Provider</label><select id="cfg-provider"><option value="ollama">Ollama (local)</option><option value="anthropic">Anthropic</option><option value="openai">OpenAI</option><option value="gemini">Gemini</option><option value="deepseek">DeepSeek</option></select></div>
          <div class="field"><label>API Key (blank = env var)</label><input type="password" id="cfg-apikey"/></div>
          <div class="field"><label>Model</label><input id="cfg-model" placeholder="claude-opus-4-7"/></div>
          <div class="flex gap"><button class="btn primary" onclick="saveConfig()">Save</button><button class="btn" onclick="testConnection()">Test</button></div>
          <div class="mono mt" id="cfg-result"></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">MCP Server</div></div>
          <div class="field"><label>Port</label><input id="mcp-port" value="7342"/></div>
          <div class="field"><label>Auth Token (optional)</label><input id="mcp-token" type="password"/></div>
          <div class="flex gap"><button class="btn primary" onclick="startMCP()">Start</button><button class="btn danger" onclick="stopMCP()">Stop</button></div>
          <div class="mono mt" id="mcp-result"></div>
        </div>
        <div class="card span-2">
          <div class="card-header"><div class="card-title">System Status</div></div>
          <div id="config-state"></div>
        </div>
      </div>
    </section>

  </main>
</div>

<!-- ══════════════════════════════════════════════════════════════════════
     Command Palette overlay (Cmd+K)
     ══════════════════════════════════════════════════════════════════════ -->
<div class="cmd-overlay" id="cmd-overlay" onclick="if(event.target===this)closeCmdPalette()">
  <div class="cmd-palette">
    <input id="cmd-input" placeholder="Search features, actions, memories…" autocomplete="off"/>
    <div class="results" id="cmd-results"></div>
  </div>
</div>

<!-- Toast container -->
<div class="toast-container" id="toast-container"></div>

<!-- Log ticker -->
<div class="log-ticker">
  <div class="dot"></div>
  <div class="scroll" id="log-scroll">Hive Mind initializing…</div>
  <button class="icon-btn" style="width:28px;height:24px;padding:0" onclick="toggleLogPanel()" title="Open log"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg></button>
</div>

<!-- Expandable log panel -->
<div class="log-panel" id="log-panel">
  <div class="head">
    <div class="title">LIVE ACTIVITY</div>
    <div class="flex gap">
      <button class="btn sm ghost" onclick="clearLogs()">Clear</button>
      <button class="btn sm ghost" onclick="toggleLogPanel()">Close</button>
    </div>
  </div>
  <div id="log-panel-list"></div>
</div>

<!-- ══════════════════════════════════════════════════════════════════════
     Scripts
     ══════════════════════════════════════════════════════════════════════ -->
<script>
const FEATURES = [
  ['intelligence','Brain Map','Visual map of every memory, project and tool'],
  ['memory','Memories','Browse and search saved knowledge'],
  ['chat','Ask the Brain','Ask questions in plain language'],
  ['activity','Activity','Live feed of what the brain is doing'],
  ['agents','Client setup','Client configuration and recorded tools'],
  ['livebrain','Brain Health','Memory quality with tips to improve'],
  ['ww2br','Project Memory','Memory and status for one project'],
  ['graph','Recorded network','Configured clients and newly observed recorded events'],
  ['seeder','Add Knowledge','Research a topic and save it as verified knowledge'],
  ['garden','Memory Garden','Watch your memories grow over time'],
  ['sabb','Sub-Agents','Share the right context with helper agents'],
  ['causal','Decision Trails','Trace why a decision was made'],
  ['dream','Reflections','Idle-time review that finds patterns and lessons'],
  ['debate','Debates','Multiple AI viewpoints argue a tough decision'],
  ['premortem','Risk Check','See what went wrong last time before a big task'],
  ['branch','Branch Memory','Memory that follows your git branch'],
  ['forget','Memory Cleanup','Old memories fade, important ones stay'],
  ['collision','Conflicts','Catch two tools editing the same code'],
  ['reputation','Trust Scores','How reliable each AI tool has been'],
  ['calibration','Accuracy','How well confidence matches being right'],
  ['attention','Focus Map','Which memories shaped a decision'],
  ['formal','Code Rules','Turn plain rules into linter checks'],
  ['privacy','Privacy & Safety','Stay offline and block risky actions'],
  ['tokens','Cost & Usage','Track AI spend and find savings'],
  ['pr','Code Review','Generate a pull-request review'],
  ['voice','Voice','Talk to the brain hands-free'],
  ['team','Team Sync','Share memory with teammates'],
  ['exchange','Share Brain','Export or import memory packs'],
  ['features','Features','Turn individual features on or off'],
  ['models','AI Models','Choose which AI models the brain uses'],
  ['config','Settings','Set up and adjust Shadow Brain'],
  ['overview','Home','Your starting point and summary'],
];

let ws = null;
let state = { hive: null, lastRefreshAt: 0 };
let charts = {};

// ──── Tab switching ────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(el => el.addEventListener('click', () => switchTab(el.dataset.tab, el.dataset.title)));
function switchTab(id, title) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.tab === id));
  document.querySelectorAll('.section').forEach(el => el.classList.toggle('active', el.id === 'tab-' + id));
  if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
  onTabOpen(id);
  animateSectionIn(id);
}
// Subtle staggered card entrance on real tab switches. Guarded so it no-ops
// if GSAP's CDN failed to load. NOT called from the 5s refresh loop, so cards
// don't re-fade on every poll.
function animateSectionIn(id) {
  if (!window.gsap) return;
  const sec = document.getElementById('tab-' + id);
  if (!sec) return;
  const cards = sec.querySelectorAll('.card');
  if (!cards.length) return;
  try { window.gsap.from(cards, { opacity: 0, y: 12, duration: 0.34, stagger: 0.035, ease: 'power2.out', clearProps: 'opacity,transform' }); } catch (e) {}
}
function onTabOpen(tab) {
  const fn = { overview: refreshOverview, intelligence: refreshIntelligence, ww2br: refreshWW2BR, graph: startGraph, agents: refreshAgents, memory: () => { refreshMemoryIntelligence(); searchMemory(); }, seeder: refreshSeedDrafts, livebrain: refreshLiveBrain, chat: refreshChat, activity: refreshActivity,
    sabb: refreshSABB, causal: refreshCausal, collision: refreshCollision, dream: refreshDream, reputation: refreshReputation,
    tokens: refreshTokens, forget: refreshForget, formal: null, calibration: refreshCalibration, branch: refreshBranch,
    privacy: refreshPrivacy, garden: refreshGarden, team: refreshTeam, exchange: refreshExchange, features: refreshFeatures,
    models: refreshModels, config: refreshConfig }[tab];
  if (fn) fn();
}

// ──── Sidebar mobile ───────────────────────────────────────────────────
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

// ──── Theme toggle ─────────────────────────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const newT = html.dataset.theme === 'light' ? 'dark' : 'light';
  html.dataset.theme = newT;
  try { localStorage.setItem('hive.theme', newT); } catch {}
  if (charts.tokens) updateChartColors();
}
(function initTheme(){
  try {
    const t = localStorage.getItem('hive.theme');
    // Default to light for better readability
    document.documentElement.dataset.theme = t || 'light';
  } catch { document.documentElement.dataset.theme = 'light'; }
})();

// ──── Simple / Advanced navigation mode ────────────────────────────────
function setMode(mode) {
  const m = mode === 'advanced' ? 'advanced' : 'simple';
  document.documentElement.dataset.navmode = m;
  try { localStorage.setItem('hive.navmode', m); } catch {}
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  // If we just hid the tab the user is on, gently return them to Home.
  if (m === 'simple') {
    const active = document.querySelector('.nav-item.active');
    if (active && active.closest('[data-adv]')) switchTab('overview', 'Home');
  }
}
(function initMode(){
  let m = 'simple';
  try { m = localStorage.getItem('hive.navmode') || 'simple'; } catch {}
  setMode(m);
})();

// ──── API helpers ──────────────────────────────────────────────────────
async function api(path, body) {
  try {
    const opts = body !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
    const res = await fetch(path, opts);
    if (!res.ok) { toast('API error', res.status + ' ' + path, 'error'); return null; }
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? await res.json() : await res.text();
  } catch (err) { toast('Network error', err.message, 'error'); return null; }
}
function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function fmtDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'unknown' : d.toLocaleString();
}
// Reusable animated empty-state. cta = {label, onclick} or null.
// title/msg are inserted as-is (allow pre-escaped entities) — author-controlled strings only.
function emptyState(icon, title, msg, cta) {
  const icons = {
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    'git-branch': '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
    brain: '<circle cx="12" cy="12" r="3"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  };
  const path = icons[icon] || icons.inbox;
  let btn = '';
  if (cta && cta.label) {
    const handler = cta.onclick ? ' onclick="' + cta.onclick + '"' : '';
    btn = '<button class="btn primary es-cta"' + handler + '>' + htmlEscape(cta.label) + '</button>';
  }
  return '<div class="empty-state"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg><div class="es-title">' + title + '</div><div class="es-msg">' + msg + '</div>' + btn + '</div>';
}

// ──── Toasts ───────────────────────────────────────────────────────────
function toast(title, body, variant='success') {
  const c = document.getElementById('toast-container');
  const icons = { success:'<path d="M20 6 9 17l-5-5"/>', warn:'<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', error:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', info:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>' };
  const el = document.createElement('div');
  el.className = 'toast ' + variant;
  el.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">\${icons[variant] || icons.info}</svg><div><div class="title">\${title}</div>\${body ? '<div class="body">' + body + '</div>' : ''}</div>\`;
  c.appendChild(el);
  setTimeout(() => { el.classList.add('removing'); setTimeout(() => el.remove(), 400); }, 3800);
}

// ──── Animated counters ────────────────────────────────────────────────
const _counterState = {};
function animateNum(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseFloat((el.textContent || '0').replace(/[^\d.-]/g, '')) || 0;
  if (start === target) { el.textContent = target.toLocaleString(); return; }
  if (_counterState[id]) cancelAnimationFrame(_counterState[id]);
  const startTime = performance.now();
  const duration = 650;
  const step = now => {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = start + (target - start) * eased;
    el.textContent = Math.round(val).toLocaleString();
    if (t < 1) _counterState[id] = requestAnimationFrame(step);
    else { el.textContent = target.toLocaleString(); delete _counterState[id]; }
  };
  _counterState[id] = requestAnimationFrame(step);
}
function animateMoney(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseFloat((el.textContent || '0').replace(/[^\d.-]/g, '')) || 0;
  if (Math.abs(start - target) < 0.001) { el.textContent = '$' + target.toFixed(2); return; }
  if (_counterState[id]) cancelAnimationFrame(_counterState[id]);
  const startTime = performance.now();
  const duration = 650;
  const step = now => {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = start + (target - start) * eased;
    el.textContent = '$' + val.toFixed(2);
    if (t < 1) _counterState[id] = requestAnimationFrame(step);
    else { el.textContent = '$' + target.toFixed(2); delete _counterState[id]; }
  };
  _counterState[id] = requestAnimationFrame(step);
}

// ──── Main refresh ─────────────────────────────────────────────────────
async function refresh() {
  const hive = await api('/api/v6/hive-status');
  if (!hive) return;
  state.hive = hive;
  state.lastRefreshAt = Date.now();

  animateNum('stat-agents', hive.totalRecordedAgents ?? hive.totalAgentsConnected ?? 0);
  animateNum('stat-memories', hive.totalMemoriesStored ?? 0);
  animateNum('stat-dreams', hive.modules.dream?.totalDreams ?? 0);
  animateNum('stat-tools', hive.totalRecordedAgents ?? hive.totalAgentsConnected ?? 0);
  document.getElementById('badge-sabb').textContent = hive.modules.sabb?.totalSpawns ?? 0;
  document.getElementById('badge-causal').textContent = hive.modules.causal?.totalLinks ?? 0;
  document.getElementById('badge-collision').textContent = hive.modules.collision?.collisionsDetected ?? 0;
  document.getElementById('badge-dream').textContent = hive.modules.dream?.totalDreams ?? 0;
  const activeTab = document.querySelector('.nav-item.active')?.dataset.tab;
  if (activeTab) onTabOpen(activeTab);
}

// ──── Overview ─────────────────────────────────────────────────────────
async function refreshOverview() {
  const hive = state.hive || await api('/api/v6/hive-status');
  if (!hive) return;
  animateNum('ov-agents', hive.totalRecordedAgents ?? hive.totalAgentsConnected ?? 0);
  animateNum('ov-memories', hive.totalMemoriesStored ?? 0);
  animateNum('ov-subagents', hive.modules.sabb?.totalSpawns ?? 0);
  document.getElementById('ov-subagents-sub').textContent = \`grad: \${hive.modules.sabb?.graduated ?? 0} · quar: \${hive.modules.sabb?.quarantined ?? 0}\`;
  const rt = hive.runtime || {};
  document.getElementById('ov-current-agent').textContent = rt.currentAgentDisplay || 'Unknown';
  document.getElementById('ov-current-agent-sub').textContent = rt.provider ? (rt.provider + (rt.model ? ' / ' + rt.model : '')) : 'using the brain right now';
  loadConstHeroStats();

  const moduleRows = [
    ['SABB spawns', hive.modules.sabb?.totalSpawns ?? 0, 'good'],
    ['Causal links', hive.modules.causal?.totalLinks ?? 0, 'good'],
    ['Collisions detected', hive.modules.collision?.collisionsDetected ?? 0, 'warn'],
    ['Dreams recorded', hive.modules.dream?.totalDreams ?? 0, 'good'],
    ['Reputation receipts', hive.modules.reputation?.totalReceipts ?? 0, 'good'],
    ['Formal rules', hive.modules.formalBridge?.totalRules ?? 0, 'good'],
  ];
  document.getElementById('ov-modules').innerHTML = moduleRows.map(([k, v, cls]) =>
    \`<div class="row"><span class="k">\${k}</span><span class="v \${cls || ''}">\${v}</span></div>\`
  ).join('');

  const health = [
    ['Local-first', hive.localFirst ? 'ON' : 'OFF', hive.localFirst ? 'good' : 'warn'],
    ['Current agent', hive.runtime?.currentAgentDisplay || 'Unknown', hive.runtime?.currentAgentTool === 'codex' ? 'good' : ''],
    ['Air-gap', hive.modules.airGap?.enabled ? 'ENABLED' : 'disabled', hive.modules.airGap?.enabled ? 'good' : ''],
    ['Version', hive.version, ''],
    ['Monthly cost', '$' + (hive.modules.tokenEconomy?.monthlyProjectionUsd?.toFixed?.(2) ?? '0.00'), 'warn'],
    ['Estimated savings opportunity', '$' + (hive.modules.tokenEconomy?.savingsOpportunitiesUsd?.toFixed?.(2) ?? '0.00'), 'good'],
  ];
  document.getElementById('ov-health').innerHTML = health.map(([k, v, cls]) => \`<div class="row"><span class="k">\${k}</span><span class="v \${cls}">\${v}</span></div>\`).join('');

  // Tokens chart
  const tok = hive.modules.tokenEconomy;
  if (tok) drawTokensChart(tok.recentByAgent || tok.byAgent || {});

  // Timeline
  const timeline = await api('/api/v6/activity-log?limit=15') ?? [];
  document.getElementById('ov-timeline').innerHTML = timeline.length
    ? timeline.slice(0, 10).map(e => \`<div style="padding:5px 0;border-bottom:1px solid var(--border);display:flex;gap:8px"><span style="color:var(--text-dim);flex-shrink:0">\${new Date(e.timestamp).toLocaleTimeString()}</span><span class="pill \${typeToPill(e.type)}">\${e.type}</span><span style="color:var(--text-2);font-size:11px">\${(e.detail||'').slice(0,90)}</span></div>\`).join('')
    : '<div class="empty">No activity yet</div>';
}
function typeToPill(type) {
  if (type === 'memory-write') return 'green';
  if (type === 'subagent-spawn') return 'cyan';
  if (type === 'collision') return 'red';
  if (type === 'quarantine') return 'yellow';
  if (type === 'seed-draft') return 'yellow';
  if (type === 'memory-seeded') return 'green';
  if (['dream','revisit','counterfactual','consolidation','pattern-discovery','contradiction'].includes(type)) return 'purple';
  return '';
}

function getWW2ProjectPath() {
  return document.getElementById('ww2-project-path')?.value?.trim() || 'D:\\\\New Game';
}
async function refreshWW2BR() {
  const projectDir = getWW2ProjectPath();
  const data = await api('/api/v6/ww2br-ops?projectDir=' + encodeURIComponent(projectDir));
  if (!data) return;

  const stats = data.stats || {};
  const hooked = (data.agents || []).filter(a => a.hookInstalled).length;
  document.getElementById('badge-ww2br').textContent = data.recent?.length ?? 0;
  animateNum('ww2-stat-memories', stats.totalEntries ?? 0);
  animateNum('ww2-stat-projects', stats.totalProjects ?? 0);
  animateNum('ww2-stat-hooks', hooked);
  document.getElementById('ww2-stat-hit').textContent = Math.round((stats.hitRate ?? 0) * 100) + '%';
  document.getElementById('ww2-stat-scope').textContent = data.projectScoped ? 'project scoped' : 'global fallback';
  document.getElementById('ww2-stat-sync').textContent = stats.lastSync ? 'sync ' + fmtDate(stats.lastSync) : 'last sync unknown';

  const warnings = data.warnings || [];
  document.getElementById('ww2-warnings').innerHTML = warnings.length
    ? warnings.map(w => '<div class="warning-banner"><strong>Warning</strong><span>' + htmlEscape(w) + '</span></div>').join('')
    : '';

  document.getElementById('ww2-timeline').innerHTML = renderMemoryItems(data.recent || [], 'No memories found for this workflow yet.');
  document.getElementById('ww2-agents').innerHTML = renderWW2Agents(data.agents || []);
  document.getElementById('ww2-categories').innerHTML = renderWW2Categories(data.categories || {});
  document.getElementById('ww2-quality').innerHTML = renderWW2Quality(data.quality);
  document.getElementById('ww2-resume-pack').innerHTML = renderWW2ResumePack(data.resumePack);

  const query = document.getElementById('ww2-query');
  if (query && !query.value) query.value = 'Gate 2 visual proof';
  if (!document.getElementById('ww2-recall-results').innerHTML.trim()) {
    document.getElementById('ww2-recall-results').innerHTML = '<div class="empty-tight">Run a recall query to inspect relevant brain memory.</div>';
  }
}
function renderMemoryItems(items, emptyMessage) {
  if (!items || !items.length) return '<div class="empty-tight">' + htmlEscape(emptyMessage) + '</div>';
  return items.map(item => {
    const importancePct = item.importance !== undefined ? Math.round((item.importance || 0) * 100) + '%' : '';
    // v7.1.3: real blended recall confidence (recency + importance + corroboration + usage + relevance).
    const conf = item.confidence && typeof item.confidence.score === 'number' ? item.confidence : null;
    const confCls = conf ? (conf.level === 'high' ? 'green' : conf.level === 'medium' ? 'yellow' : 'red') : '';
    const confBadge = conf ? '<span class="pill ' + confCls + '" title="Heuristic recall score (not probability of truth) ' + Math.round(conf.score * 100) + '% (' + htmlEscape(conf.level) + ') | relevance ' + conf.signals.relevance + ', creation-age recency ' + conf.signals.recency + ', importance ' + conf.signals.importance + ', matching-content agent reports ' + conf.signals.corroboration + ', usage ' + conf.signals.usage + '">\u2737 ' + Math.round(conf.score * 100) + '%</span>' : '';
    const sources = item.sources || (item.metadata && item.metadata.sources) || [];
    const tags = item.tags || (item.metadata && item.metadata.tags) || [];
    const quality = item.qualityScore !== undefined ? '<span class="pill">Q ' + htmlEscape(item.qualityScore) + '</span>' : '';
    const sourceLine = sources.length
      ? '<div class="content" style="font-size:10.5px;color:var(--text-3);margin-top:6px">Sources: ' + sources.slice(0, 3).map(s => '<code>' + htmlEscape(s) + '</code>').join(' · ') + '</div>'
      : '<div class="content" style="font-size:10.5px;color:var(--warning);margin-top:6px">Sources: none recorded</div>';
    const tagLine = tags.length ? '<span class="pill">' + tags.slice(0, 3).map(htmlEscape).join(', ') + '</span>' : '';
    return '<div class="memory-item">' +
      '<div class="meta">' +
        '<span class="pill cyan">' + htmlEscape(item.agentTool || item.agent || 'brain') + '</span>' +
        '<span class="pill">' + htmlEscape(item.category || 'memory') + '</span>' +
        confBadge +
        (importancePct ? '<span class="pill" title="Author-assigned importance">imp ' + importancePct + '</span>' : '') +
        quality +
        tagLine +
        '<span>' + fmtDate(item.createdAt || item.lastAccessed) + '</span>' +
      '</div>' +
      '<div class="content">' + htmlEscape(item.content || item.detail || '').slice(0, 420) + '</div>' +
      sourceLine +
    '</div>';
  }).join('');
}
function renderWW2Quality(quality) {
  if (!quality) return '<div class="empty-tight">No memory quality data.</div>';
  const sourcePct = Math.round((quality.sourceCoverage || 0) * 100);
  const scoreCls = quality.avgScore >= 75 ? 'good' : quality.avgScore >= 55 ? 'warn' : 'bad';
  return [
    '<div class="row"><span class="k">Average score</span><span class="v ' + scoreCls + '">' + htmlEscape(quality.avgScore ?? 0) + '/100</span></div>',
    '<div class="row"><span class="k">Source coverage</span><span class="v ' + (sourcePct >= 70 ? 'good' : 'warn') + '">' + sourcePct + '%</span></div>',
    '<div class="row"><span class="k">Stale memories</span><span class="v ' + (quality.stale ? 'warn' : 'good') + '">' + htmlEscape(quality.stale || 0) + '</span></div>',
    '<div class="row"><span class="k">Duplicate clusters</span><span class="v ' + (quality.duplicates?.length ? 'warn' : 'good') + '">' + htmlEscape(quality.duplicates?.length || 0) + '</span></div>',
  ].join('');
}
function renderWW2ResumePack(pack) {
  if (!pack) return '<div class="empty-tight">No resume pack generated.</div>';
  const warnings = pack.warnings && pack.warnings.length
    ? '<div class="warning-stack" style="margin:10px 0 0">' + pack.warnings.slice(0, 3).map(w => '<div class="warning-banner"><strong>Review</strong><span>' + htmlEscape(w) + '</span></div>').join('') + '</div>'
    : '';
  const blockers = pack.blockers && pack.blockers.length
    ? '<div class="brain-feed mt">' + renderMemoryItems(pack.blockers.slice(0, 3), 'No blockers in pack.') + '</div>'
    : '<div class="empty-tight">No blockers in pack.</div>';
  const stats = pack.stats || {};
  return '<div class="grid cols-3">' +
    '<div class="row"><span class="k">Docs</span><span class="v">' + htmlEscape(stats.docCount ?? 0) + '</span></div>' +
    '<div class="row"><span class="k">Memories</span><span class="v">' + htmlEscape(stats.memoryCount ?? 0) + '</span></div>' +
    '<div class="row"><span class="k">Quality</span><span class="v">' + htmlEscape(stats.avgQualityScore ?? 0) + '/100</span></div>' +
    '</div>' +
    '<div class="mt" style="font-size:12px;color:var(--text-2)">Generated ' + htmlEscape(fmtDate(pack.generatedAt)) + '. Uses visible docs and stored memories only.</div>' +
    warnings +
    '<div class="mt">' + blockers + '</div>';
}
function openWW2ResumePack() {
  const url = '/api/v6/resume-pack?format=markdown&projectDir=' + encodeURIComponent(getWW2ProjectPath());
  window.open(url, '_blank', 'noopener');
}
function renderWW2Agents(agents) {
  if (!agents.length) return '<div class="empty-tight">No known agent integrations returned.</div>';
  return agents.map(agent => {
    const cls = agent.hookInstalled ? 'green' : agent.detected ? 'cyan' : '';
    const hook = agent.hookInstalled ? 'hooked' : 'not wired';
    const detected = agent.detected ? 'detected' : 'not found';
    return '<div class="ops-agent">' +
      '<div class="name">' + htmlEscape(agent.displayName || agent.name) + '</div>' +
      '<div class="status">' +
        '<span class="pill ' + cls + '">' + hook + '</span>' +
        '<span class="pill">' + detected + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
}
function renderWW2Categories(categories) {
  const rows = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return '<div class="empty-tight">No categories yet.</div>';
  return rows.map(([name, count]) => '<div class="row"><span class="k">' + htmlEscape(name) + '</span><span class="v">' + count + '</span></div>').join('');
}
function setWW2Query(query) {
  document.getElementById('ww2-query').value = query;
  runWW2Recall();
}
async function runWW2Recall() {
  const resultsEl = document.getElementById('ww2-recall-results');
  const query = document.getElementById('ww2-query').value.trim();
  const category = document.getElementById('ww2-category').value.trim();
  resultsEl.innerHTML = '<div class="empty-tight">Searching brain memory...</div>';
  const data = await api('/api/v6/ww2br-recall', {
    projectDir: getWW2ProjectPath(),
    query,
    category: category || undefined,
    limit: 12,
  });
  if (!data) return;
  const prefix = data.projectScoped ? '' : '<div class="warning-banner"><strong>Fallback</strong><span>No project-scoped matches; showing global brain recall results.</span></div>';
  resultsEl.innerHTML = prefix + renderMemoryItems(data.results || [], 'No recall matches for that query.');
}

// ──── Charts ───────────────────────────────────────────────────────────
function chartTheme() {
  const dark = document.documentElement.dataset.theme !== 'light';
  return { grid: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', text: dark ? '#a4afc4' : '#3d4864' };
}
function spendLabels(buckets) {
  return Object.keys(buckets || {}).sort((a, b) => (buckets[b]?.spendUsd || 0) - (buckets[a]?.spendUsd || 0));
}
function drawSpendBarChart(canvasId, chartKey, buckets) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  const labels = spendLabels(buckets);
  const data = labels.map(l => buckets[l].spendUsd || 0);
  const t = chartTheme();
  if (charts[chartKey]) charts[chartKey].destroy();
  charts[chartKey] = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Spend (USD)', data, backgroundColor: ['#18ffff','#a855f7','#ec4899','#10e68c','#ffb53f','#4fb6ff'], borderRadius: 6 }] }, options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{grid:{color:t.grid},ticks:{color:t.text}},y:{grid:{color:t.grid},ticks:{color:t.text,callback:v=>'$'+Number(v).toFixed(2)}}} } });
}
function drawTokensChart(byAgent) {
  drawSpendBarChart('chart-tokens', 'tokens', byAgent || {});
}
function drawTokensAgentChart(byAgent) {
  drawSpendBarChart('chart-tokens-agent', 'tokensAgent', byAgent || {});
}
function drawTokensModelChart(byModel) {
  const ctx = document.getElementById('chart-tokens-model');
  if (!ctx) return;
  const labels = spendLabels(byModel);
  const data = labels.map(l => byModel[l].spendUsd || 0);
  const t = chartTheme();
  if (charts.tokensModel) charts.tokensModel.destroy();
  charts.tokensModel = new Chart(ctx, { type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: ['#18ffff','#a855f7','#ec4899','#10e68c','#ffb53f','#4fb6ff'], borderWidth:0 }] }, options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'right',labels:{color:t.text,boxWidth:12}}} } });
}
function renderSpendRows(buckets, emptyMessage) {
  const labels = spendLabels(buckets).slice(0, 8);
  if (!labels.length) return '<div class="empty-tight">' + htmlEscape(emptyMessage) + '</div>';
  return labels.map(label => {
    const b = buckets[label] || {};
    const last = b.lastSeen ? new Date(b.lastSeen).toLocaleString() : '—';
    return \`<div class="row"><span class="k">\${htmlEscape(label)} <span class="tag-code">\${b.calls || 0} calls</span></span><span class="v">$\${Number(b.spendUsd || 0).toFixed(4)} <span class="mono" style="color:var(--text-3)">\${last}</span></span></div>\`;
  }).join('');
}
function drawDreamChart(byType) {
  const ctx = document.getElementById('chart-dreams');
  if (!ctx) return;
  const labels = Object.keys(byType);
  const data = labels.map(l => byType[l]);
  const t = chartTheme();
  if (charts.dreams) charts.dreams.destroy();
  charts.dreams = new Chart(ctx, { type:'polarArea', data:{labels,datasets:[{data,backgroundColor:['#18ffff88','#a855f788','#ec489988','#10e68c88','#ffb53f88']}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:t.text}}},scales:{r:{grid:{color:t.grid},ticks:{color:t.text,backdropColor:'transparent'}}}} });
}
function drawForgetChart(states) {
  const ctx = document.getElementById('chart-forget');
  if (!ctx) return;
  const buckets = { strong: 0, medium: 0, weak: 0, fading: 0 };
  for (const s of states || []) {
    if (s.currentStrength >= 0.8) buckets.strong++;
    else if (s.currentStrength >= 0.5) buckets.medium++;
    else if (s.currentStrength >= 0.2) buckets.weak++;
    else buckets.fading++;
  }
  const t = chartTheme();
  if (charts.forget) charts.forget.destroy();
  charts.forget = new Chart(ctx, { type:'bar', data:{labels:Object.keys(buckets),datasets:[{data:Object.values(buckets),backgroundColor:['#10e68c','#18ffff','#ffb53f','#ff5864'],borderRadius:4}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:t.grid},ticks:{color:t.text}},y:{grid:{color:t.grid},ticks:{color:t.text}}}} });
}
function updateChartColors() { for (const k of Object.keys(charts)) { charts[k].destroy(); delete charts[k]; } refresh(); }

// ──── SABB ─────────────────────────────────────────────────────────────
async function refreshSABB() {
  const hive = state.hive || await api('/api/v6/hive-status');
  const s = hive?.modules.sabb ?? {};
  document.getElementById('sabb-stats').innerHTML = \`
    <div class="row"><span class="k">Total spawns</span><span class="v">\${s.totalSpawns ?? 0}</span></div>
    <div class="row"><span class="k">Quarantined</span><span class="v">\${s.quarantined ?? 0}</span></div>
    <div class="row"><span class="k">Graduated</span><span class="v good">\${s.graduated ?? 0}</span></div>
    <div class="row"><span class="k">Rejected</span><span class="v bad">\${s.rejected ?? 0}</span></div>
    <div class="row"><span class="k">Avg sliver tokens</span><span class="v">\${Math.round(s.avgSliverTokens ?? 0)}</span></div>
    <div class="row"><span class="k">Avg graduation</span><span class="v">\${Math.round(s.avgGraduationMs ?? 0)}ms</span></div>\`;
  const q = await api('/api/v6/subagent-quarantine') ?? [];
  document.getElementById('sabb-quarantine').innerHTML = q.length ? q.map(e =>
    \`<tr><td><code>\${e.id.slice(0,10)}</code></td><td><span class="pill purple">\${e.parentAgent}</span></td><td>\${e.category}</td><td>\${(e.confidence||0).toFixed(2)}</td><td>\${(e.content||'').slice(0,100)}</td><td style="text-align:right"><button class="btn sm success" onclick="graduate('\${e.id}')">Graduate</button> <button class="btn sm danger" onclick="rejectMem('\${e.id}')">Reject</button></td></tr>\`
  ).join('') : '<tr><td colspan="6"><div class="empty">No quarantined memories</div></td></tr>';
}
async function computeSliver() {
  const res = await api('/api/v6/subagent-sliver', {
    parentAgent: document.getElementById('sabb-parent').value,
    framework: document.getElementById('sabb-framework').value,
    taskDescription: document.getElementById('sabb-task').value,
    tokenBudget: parseInt(document.getElementById('sabb-budget').value || '300'),
  });
  if (res) { document.getElementById('sabb-sliver-output').textContent = res.markdown; toast('Sliver computed', res.memories.length + ' memories · ' + res.tokenCount + ' tokens'); }
}
async function graduate(id) { const r = await api('/api/v6/subagent-graduate', { memoryId: id }); if (r?.ok) { toast('Graduated', id.slice(0,10)); refreshSABB(); } }
async function rejectMem(id) { const r = await api('/api/v6/subagent-reject', { memoryId: id, reason: 'manual-reject' }); if (r?.ok) { toast('Rejected', id.slice(0,10), 'warn'); refreshSABB(); } }

// ──── Causal ───────────────────────────────────────────────────────────
async function refreshCausal() {
  const hive = state.hive || await api('/api/v6/hive-status');
  const s = hive?.modules.causal ?? {};
  document.getElementById('causal-stats').innerHTML = \`<div class="row"><span class="k">Total links</span><span class="v">\${s.totalLinks ?? 0}</span></div><div class="row"><span class="k">Effects</span><span class="v">\${s.effects ?? 0}</span></div><div class="row"><span class="k">Causes</span><span class="v">\${s.causes ?? 0}</span></div>\`;
}
async function traceCausal() {
  const id = document.getElementById('causal-mem-id').value;
  if (!id) return toast('Missing', 'Enter a memory ID', 'warn');
  const res = await api('/api/v6/causal-trace', { memoryId: id, maxDepth: parseInt(document.getElementById('causal-depth').value || '8') });
  if (res) renderCausalDag(res, id);
}
async function influenceCausal() {
  const id = document.getElementById('causal-mem-id').value;
  if (!id) return toast('Missing', 'Enter a memory ID', 'warn');
  const res = await api('/api/v6/causal-influence', { memoryId: id, maxDepth: 6 });
  if (res) renderCausalDag(res, id);
}
function renderCausalDag(chain, rootId) {
  const wrap = document.getElementById('causal-dag-wrap');
  const cv = document.getElementById('causal-dag');
  const empty = document.getElementById('causal-dag-empty');
  if (!cv || !wrap) return;
  const nodes = (chain && chain.nodes) || [];
  if (!nodes.length) { if (empty) { empty.style.display = 'flex'; empty.textContent = 'No causal links recorded for this memory yet.'; } return; }
  if (empty) empty.style.display = 'none';
  cv.width = wrap.clientWidth || 800; cv.height = wrap.clientHeight || 420;
  const W = cv.width, H = cv.height, ctx = cv.getContext('2d');
  // Layer nodes by depth
  const byDepth = {};
  let maxDepth = 0;
  for (const n of nodes) { const d = n.depth || 0; (byDepth[d] = byDepth[d] || []).push(n); if (d > maxDepth) maxDepth = d; }
  const pos = new Map();
  const layers = maxDepth + 1;
  for (let d = 0; d <= maxDepth; d++) {
    const row = byDepth[d] || [];
    const y = layers === 1 ? H / 2 : 40 + (d / Math.max(1, maxDepth)) * (H - 80);
    row.forEach((n, i) => { pos.set(n.id, { x: (i + 1) / (row.length + 1) * W, y: y, n: n }); });
  }
  ctx.clearRect(0, 0, W, H);
  // Links
  for (const l of (chain.links || [])) {
    const a = pos.get(l.causeId), b = pos.get(l.effectId);
    if (!a || !b) continue;
    ctx.strokeStyle = 'rgba(24,255,255,' + (0.25 + 0.5 * (l.strength || 0.5)) + ')';
    ctx.lineWidth = 1 + (l.strength || 0.5) * 2;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    // arrowhead
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.fillStyle = 'rgba(24,255,255,0.7)';
    ctx.beginPath(); ctx.moveTo(b.x - 11 * Math.cos(ang - 0.4), b.y - 11 * Math.sin(ang - 0.4)); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x - 11 * Math.cos(ang + 0.4), b.y - 11 * Math.sin(ang + 0.4)); ctx.fill();
  }
  // Nodes
  for (const p of pos.values()) {
    const isRoot = p.n.id === rootId;
    const col = isRoot ? '#ec4899' : '#a855f7';
    const r = isRoot ? 13 : 9;
    const halo = ctx.createRadialGradient(p.x, p.y, r * 0.4, p.x, p.y, r * 2.4);
    halo.addColorStop(0, col + '88'); halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0b1020'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = document.documentElement.dataset.theme === 'light' ? '#1a2030' : '#e8ecf4';
    ctx.font = '10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lbl = String(p.n.content || p.n.category || p.n.id).slice(0, 22);
    ctx.fillText(lbl, p.x, p.y + r + 10);
  }
  toast('Causal chain', nodes.length + ' nodes · ' + ((chain.links || []).length) + ' links');
}
async function linkCausal() {
  const r = await api('/api/v6/causal-link', {
    effectId: document.getElementById('causal-effect').value,
    causeId: document.getElementById('causal-cause').value,
    rationale: document.getElementById('causal-rationale').value,
  });
  if (r) { toast('Link recorded'); refreshCausal(); }
}

// ──── Collision ────────────────────────────────────────────────────────
async function refreshCollision() {
  const hive = state.hive || await api('/api/v6/hive-status');
  const s = hive?.modules.collision ?? {};
  document.getElementById('collision-stats').innerHTML = \`<div class="row"><span class="k">Active intents</span><span class="v">\${s.activeIntents ?? 0}</span></div><div class="row"><span class="k">Collisions detected</span><span class="v warn">\${s.collisionsDetected ?? 0}</span></div><div class="row"><span class="k">Resolved</span><span class="v good">\${s.collisionsResolved ?? 0}</span></div><div class="row"><span class="k">Avg overlap</span><span class="v">\${(s.avgOverlapLines ?? 0).toFixed(1)} lines</span></div>\`;
  const data = await api('/api/v6/collision-list') ?? { intents: [], alerts: [] };
  document.getElementById('collision-alerts').innerHTML = data.alerts.length
    ? data.alerts.map(a => \`<div style="padding:10px;background:var(--bg-elev-2);border-left:3px solid var(--danger);border-radius:6px;margin-bottom:6px"><div style="font-weight:600;font-size:12px">\${(a.filePath||'').split(/[\\\\/]/).pop()}</div><div class="mono" style="margin-top:4px;color:var(--text-2)">\${a.suggestedResolution}</div></div>\`).join('')
    : '<div class="empty">No active alerts</div>';
  document.getElementById('collision-intents').innerHTML = data.intents.length ? data.intents.map(i =>
    \`<tr><td><span class="pill cyan">\${i.agentTool}</span></td><td><code>\${(i.filePath||'').split(/[\\\\/]/).pop()}</code></td><td>\${i.startLine}-\${i.endLine}</td><td>\${(i.intent||'').slice(0,80)}</td><td class="mono">\${new Date(i.expiresAt).toLocaleTimeString()}</td></tr>\`
  ).join('') : '<tr><td colspan="5"><div class="empty">No active intents</div></td></tr>';
}

// ──── Dream ────────────────────────────────────────────────────────────
async function refreshDream() {
  const hive = state.hive || await api('/api/v6/hive-status');
  const s = hive?.modules.dream ?? {};
  document.getElementById('dream-stats').innerHTML = \`<div class="row"><span class="k">Total</span><span class="v">\${s.totalDreams ?? 0}</span></div><div class="row"><span class="k">Actionable</span><span class="v good">\${s.actionableCount ?? 0}</span></div><div class="row"><span class="k">Acknowledged</span><span class="v">\${s.acknowledgedCount ?? 0}</span></div><div class="row"><span class="k">Avg confidence</span><span class="v">\${((s.avgConfidence ?? 0) * 100).toFixed(0)}%</span></div>\`;
  if (s.byType) drawDreamChart(s.byType);
  const dreams = await api('/api/v6/dream-list') ?? [];
  document.getElementById('dream-list').innerHTML = dreams.length ? dreams.map(d =>
    \`<tr><td><span class="pill purple">\${d.type}</span></td><td>\${(d.content||'').slice(0,160)}</td><td>\${((d.confidence||0)*100).toFixed(0)}%</td><td>\${d.actOnNextSession ? '<span class="pill green">yes</span>' : '—'}</td><td><button class="btn sm" onclick="ackDream('\${d.id}')">Ack</button></td></tr>\`
  ).join('') : '<tr><td colspan="5"><div class="empty">No dreams yet. Run a cycle.</div></td></tr>';
}
async function runDream() { const d = await api('/api/v6/dream-run', {}); if (d) { toast('Dreams generated', (d.length || 0) + ' new'); refreshDream(); } }
async function startDreamLoop() { await api('/api/v6/dream-start', {}); toast('Dream loop', 'Background reflection active'); }
async function ackDream(id) { await api('/api/v6/dream-ack', { id }); refreshDream(); }

// ──── Reputation ───────────────────────────────────────────────────────
async function refreshReputation() {
  const hive = state.hive || await api('/api/v6/hive-status');
  const s = hive?.modules.reputation ?? {};
  document.getElementById('reputation-stats').innerHTML = \`<div class="row"><span class="k">Total agents</span><span class="v">\${s.totalAgents ?? 0}</span></div><div class="row"><span class="k">Total receipts</span><span class="v">\${s.totalReceipts ?? 0}</span></div><div class="row"><span class="k">Verified</span><span class="v good">\${s.verifiedReceipts ?? 0}</span></div><div class="row"><span class="k">Avg accuracy</span><span class="v">\${((s.averageAccuracy ?? 0) * 100).toFixed(1)}%</span></div>\`;
  const top = s.topAgents ?? [];
  document.getElementById('rep-leaderboard').innerHTML = top.length ? top.map(a =>
    \`<tr><td><span class="pill cyan">\${a.agentTool}</span></td><td>\${((a.accuracy ?? 0) * 100).toFixed(1)}%</td><td>\${a.decisions}</td><td class="mono">—</td></tr>\`
  ).join('') : '<tr><td colspan="4"><div class="empty">No signed decisions yet</div></td></tr>';
  const grid = document.getElementById('rep-trust-grid');
  if (grid) {
    if (!top.length) {
      grid.innerHTML = emptyState('shield', 'No trust receipts yet', 'Agents build a portable trust score by signing decision receipts. Run: shadow-brain reputation sign --agent &lt;name&gt;', null);
    } else {
      grid.innerHTML = top.map(function (a, i) {
        return '<div class="trust-card"><div class="trust-ring"><canvas id="trust-ring-' + i + '"></canvas><div class="tr-pct">' + Math.round((a.accuracy || 0) * 100) + '</div></div><div class="tc-name">' + htmlEscape(a.agentTool) + '</div><div class="tc-sub">' + a.decisions + ' decisions</div></div>';
      }).join('');
      top.forEach(function (a, i) { drawTrustRing('trust-ring-' + i, a.accuracy || 0); });
    }
  }
}
function drawTrustRing(id, frac) {
  const cv = document.getElementById(id); if (!cv || !cv.getContext) return;
  cv.width = 92; cv.height = 92;
  const ctx = cv.getContext('2d'), cx = 46, cy = 46, r = 38;
  ctx.clearRect(0, 0, 92, 92);
  ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(120,140,180,0.18)';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  const col = frac >= 0.8 ? '#10e68c' : frac >= 0.5 ? '#ffb53f' : '#ff5864';
  ctx.strokeStyle = col; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
}
async function genBadge() {
  const res = await api('/api/v6/reputation-badge', { agentTool: document.getElementById('rep-agent').value, agentVersion: document.getElementById('rep-ver').value || undefined });
  document.getElementById('rep-badge-output').textContent = res?.badge || 'No reputation data yet. Sign a decision first via CLI: shadow-brain reputation sign --agent ... --ver ...';
}

// ──── Debate ───────────────────────────────────────────────────────────
async function runDebate() {
  const res = await api('/api/v6/debate-run', {
    question: document.getElementById('debate-question').value,
    context: document.getElementById('debate-context').value,
    turns: parseInt(document.getElementById('debate-turns').value || '2'),
  });
  if (res) {
    document.getElementById('debate-output').textContent = res.turns.map(t => '[' + t.position + '] ' + t.statement).join('\\n\\n') + '\\n\\nVERDICT: ' + res.verdict;
    toast('Debate complete', res.durationMs + 'ms');
  }
}

// ──── Pre-mortem ───────────────────────────────────────────────────────
async function runPremortem() {
  const task = document.getElementById('pm-task').value;
  if (!task.trim()) return toast('Missing', 'Describe the task first', 'warn');
  const res = await api('/api/v6/premortem-run', { taskDescription: task, projectDir: '' });
  if (!res) return;
  const out = document.getElementById('pm-output');
  const sevColor = { critical: '#ff5864', high: '#ffb53f', medium: '#ffca28', low: '#10e68c' };
  const riskCol = res.riskScore > 0.6 ? '#ff5864' : res.riskScore > 0.3 ? '#ffb53f' : '#10e68c';
  const failures = res.failures || [];
  // Risk matrix buckets: rows = severity (crit..low), cols = probability quartile
  const sevOrder = ['critical', 'high', 'medium', 'low'];
  const cells = {};
  for (const f of failures) {
    const col = Math.min(3, Math.floor((f.probability || 0) * 4));
    const key = (f.severity || 'low') + ':' + col;
    cells[key] = (cells[key] || 0) + 1;
  }
  const cellColor = (sev, col) => {
    const sevW = { critical: 3, high: 2, medium: 1, low: 0 }[sev];
    const risk = (sevW + col) / 6;
    return risk > 0.6 ? 'rgba(255,88,100,0.85)' : risk > 0.35 ? 'rgba(255,181,63,0.8)' : 'rgba(16,230,140,0.7)';
  };
  let matrix = '<div class="risk-matrix"><div class="rm-h"></div><div class="rm-h">P 0-25%</div><div class="rm-h">25-50%</div><div class="rm-h">50-75%</div><div class="rm-h">75-100%</div>';
  for (const sev of sevOrder) {
    matrix += '<div class="rm-yl">' + sev + '</div>';
    for (let col = 0; col < 4; col++) {
      const c = cells[sev + ':' + col] || 0;
      matrix += c ? '<div class="rm-cell" style="background:' + cellColor(sev, col) + '">' + c + '</div>' : '<div class="rm-cell empty">·</div>';
    }
  }
  matrix += '</div>';
  let html = '<div class="risk-head"><div class="risk-gauge"><canvas id="pm-gauge"></canvas><div class="rg-num" style="color:' + riskCol + '">' + Math.round(res.riskScore * 100) + '</div></div>';
  html += '<div><div style="font-size:13px;font-weight:700;margin-bottom:4px">Overall Risk Score</div><div style="font-size:12px;color:var(--text-2);max-width:520px;line-height:1.5">' + htmlEscape(res.summary || '') + '</div></div></div>';
  html += matrix;
  html += failures.map(function (f) {
    const col = sevColor[f.severity] || '#10e68c';
    return '<div class="fail-card" style="border-left-color:' + col + '"><div class="fc-head"><span class="pill" style="color:' + col + ';border-color:' + col + '">' + htmlEscape(f.severity) + '</span><span class="pill">p=' + (f.probability || 0).toFixed(2) + '</span><span class="pill">' + htmlEscape(f.source || '') + '</span></div><div class="fc-desc">' + htmlEscape(f.description || '') + '</div>' + (f.mitigation ? '<div class="fc-mit">' + htmlEscape(f.mitigation) + '</div>' : '') + '</div>';
  }).join('') || emptyState('check', 'No predicted failures', 'The pre-mortem surfaced no significant risks for this task based on past incidents and similar projects.', null);
  out.innerHTML = html;
  drawRiskGauge('pm-gauge', res.riskScore, riskCol);
}
function drawRiskGauge(id, frac, col) {
  const cv = document.getElementById(id); if (!cv || !cv.getContext) return;
  cv.width = 96; cv.height = 96;
  const ctx = cv.getContext('2d'), cx = 48, cy = 48, r = 38;
  ctx.clearRect(0, 0, 96, 96);
  ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(120,140,180,0.18)';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.max(0.02, frac) * Math.PI * 2); ctx.stroke();
}

// ──── Attention ────────────────────────────────────────────────────────
async function runAttention() {
  const ids = document.getElementById('att-memories').value.split(',').map(s => s.trim()).filter(Boolean);
  const res = await api('/api/v6/attention-heatmap', { decisionText: document.getElementById('att-decision').value, candidateMemoryIds: ids });
  const out = document.getElementById('att-output');
  if (!res) return;
  const weights = res.weights || [];
  if (!weights.length) { out.innerHTML = emptyState('target', 'No attention weights', 'Provide a decision and some candidate memory IDs (or let it use recent memories) to see which ones carried the most weight.', null); return; }
  out.innerHTML = '<div style="font-size:11.5px;color:var(--text-3);margin-bottom:10px">' + res.totalMemoriesConsidered + ' memories considered for: <strong style="color:var(--text-2)">' + htmlEscape(res.decisionText || '') + '</strong></div>' + weights.map(function (w) {
    const pct = (w.weight || 0) * 100;
    const col = pct > 60 ? '#ff5864' : pct > 30 ? '#ffb53f' : '#18ffff';
    return '<div class="heat-row"><div class="hr-top"><span>' + htmlEscape((w.memoryContent || '').slice(0, 80)) + '</span><span class="hr-pct" style="color:' + col + '">' + pct.toFixed(1) + '%</span></div><div class="hr-track"><div class="hr-fill" style="width:' + Math.max(2, pct) + '%;background:' + col + '"></div></div>' + (w.reasoning ? '<div class="hr-reason">' + htmlEscape(w.reasoning) + '</div>' : '') + '</div>';
  }).join('');
}

// ──── Tokens ───────────────────────────────────────────────────────────
async function refreshTokens() {
  const res = await api('/api/v6/tokens-report');
  if (!res) return;
  const runtime = res.runtime || {};
  document.getElementById('tok-agent').textContent = runtime.currentAgentDisplay || 'Unknown';
  document.getElementById('tok-runtime').textContent = (runtime.provider || 'provider') + (runtime.model ? ' / ' + runtime.model : '');
  document.getElementById('tok-runtime-note').innerHTML = \`<strong>Accuracy</strong><span>\${htmlEscape(runtime.note || 'Token records are historical. Current agent and model spend are shown separately.')}</span>\`;
  document.getElementById('tok-total').textContent = '$' + (res.totalSpendUsd || 0).toFixed(4);
  document.getElementById('tok-recent').textContent = '$' + (res.recentSpendUsd || 0).toFixed(4);
  document.getElementById('tok-proj').textContent = '$' + (res.monthlyProjectionUsd || 0).toFixed(2);
  document.getElementById('tok-save').textContent = '$' + (res.savingsOpportunitiesUsd || 0).toFixed(2);
  const calls = Object.values(res.byAgent || {}).reduce((a, b) => a + b.calls, 0);
  document.getElementById('tok-calls').textContent = calls;
  document.getElementById('tok-calls-sub').textContent = \`\${(res.totalInputTokens || 0).toLocaleString()} in · \${(res.totalOutputTokens || 0).toLocaleString()} out\`;
  drawTokensAgentChart(res.recentByAgent || res.byAgent || {});
  drawTokensModelChart(res.byModel || {});
  document.getElementById('tok-agent-table').innerHTML = renderSpendRows(res.recentByAgent || res.byAgent || {}, 'No recent agent spend records.');
  document.getElementById('tok-model-table').innerHTML = renderSpendRows(res.byModel || {}, 'No model spend records.');
  document.getElementById('tok-suggestions').innerHTML = (res.suggestions || []).map(s => \`<div style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;gap:8px"><span style="color:var(--success);flex-shrink:0">💡</span><span style="font-size:12px">\${s}</span></div>\`).join('') || '<div class="empty">Running lean — no suggestions</div>';
}

// ──── Forget ───────────────────────────────────────────────────────────
async function refreshForget() {
  drawForgetChart([]);
}
async function runForget() {
  const r = await api('/api/v6/forget-consolidate', {});
  if (!r) return;
  document.getElementById('forget-output').innerHTML = \`
    <div class="row"><span class="k">Cycle</span><span class="v">\${r.cycle}</span></div>
    <div class="row"><span class="k">Promoted</span><span class="v good">\${r.promoted}</span></div>
    <div class="row"><span class="k">Demoted</span><span class="v">\${r.demoted}</span></div>
    <div class="row"><span class="k">Forgotten</span><span class="v bad">\${r.forgotten}</span></div>
    <div class="row"><span class="k">Strengthened</span><span class="v good">\${r.strengthened}</span></div>
    <div class="row"><span class="k">Duration</span><span class="v">\${r.durationMs}ms</span></div>\`;
  toast('Consolidation cycle', 'cycle #' + r.cycle);
}

// ──── Formal ───────────────────────────────────────────────────────────
async function genFormal() {
  const res = await api('/api/v6/formal-generate', { text: document.getElementById('formal-text').value });
  if (res) { document.getElementById('formal-output').textContent = JSON.stringify(res, null, 2); toast('Rule generated'); }
}
async function exportEslint() {
  const res = await fetch('/api/v6/formal-export-eslint').then(r => r.text());
  document.getElementById('formal-export').textContent = res;
}
async function exportSemgrep() {
  const res = await fetch('/api/v6/formal-export-semgrep').then(r => r.text());
  document.getElementById('formal-export').textContent = res;
}

// ──── Calibration ──────────────────────────────────────────────────────
async function refreshCalibration() {
  const scores = await api('/api/v6/calibration-scores') ?? [];
  document.getElementById('calibration-table').innerHTML = scores.length ? scores.map(s =>
    \`<tr><td><span class="pill cyan">\${s.agentTool}</span></td><td>\${s.category}</td><td>\${s.brierScore}</td><td>\${s.calibrationError}</td><td>\${(s.overconfidenceRatio * 100).toFixed(0)}%</td><td class="v \${s.trustWeight > 0.8 ? 'good' : s.trustWeight > 0.5 ? '' : 'warn'}">\${s.trustWeight}</td><td>\${s.sampleSize}</td></tr>\`
  ).join('') : '<tr><td colspan="7"><div class="empty">No calibration data yet</div></td></tr>';
  drawCalibrationChart(scores);
}
function drawCalibrationChart(scores) {
  const cv = document.getElementById('chart-calibration'); if (!cv || !window.Chart) return;
  const t = chartTheme();
  if (charts.calibration) charts.calibration.destroy();
  const rows = (scores || []).slice(0, 8);
  const labels = rows.map(function (s) { return s.agentTool + '/' + String(s.category).slice(0, 10); });
  charts.calibration = new Chart(cv, {
    type: 'bar',
    data: { labels: labels, datasets: [
      { label: 'Brier (lower better)', data: rows.map(function (s) { return s.brierScore; }), backgroundColor: '#ff5864', borderRadius: 4 },
      { label: 'Trust weight', data: rows.map(function (s) { return s.trustWeight; }), backgroundColor: '#10e68c', borderRadius: 4 },
    ] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: t.text } } }, scales: { x: { grid: { color: t.grid }, ticks: { color: t.text } }, y: { beginAtZero: true, max: 1, grid: { color: t.grid }, ticks: { color: t.text } } } },
  });
}

// ──── Branch ───────────────────────────────────────────────────────────
async function refreshBranch() {
  const r = await api('/api/v6/branch-state');
  const cards = document.getElementById('branch-cards');
  const cats = document.getElementById('branch-cats');
  if (!r) { if (cards) cards.innerHTML = emptyState('git-branch', 'No branch data', 'Branch-aware memory activates inside a git repository. Open a project with branches to see scoped memory here.', null); return; }
  if (cards) cards.innerHTML =
    '<div class="card stat-card accent"><div class="label">Current Branch</div><div class="value" style="font-size:20px" id="br-cur">' + htmlEscape(r.currentBranch || '—') + '</div><div class="trend">active context</div></div>' +
    '<div class="card stat-card accent"><div class="label">Branch Memories</div><div class="value">' + (r.branchMemoryCount ?? 0) + '</div><div class="trend">scoped to branch</div></div>' +
    '<div class="card stat-card accent"><div class="label">Global Memories</div><div class="value">' + (r.globalMemoryCount ?? 0) + '</div><div class="trend">all branches</div></div>' +
    '<div class="card stat-card accent"><div class="label">Active IDs</div><div class="value">' + ((r.activeMemoryIds || []).length) + '</div><div class="trend">in working set</div></div>';
  if (cats) {
    const list = r.branchSpecificCategories || [];
    cats.innerHTML = list.length ? list.map(function (c) { return '<span class="tc">' + htmlEscape(String(c)) + '</span>'; }).join('') : '<div class="empty-tight">No branch-specific categories.</div>';
  }
}

// ──── Privacy ──────────────────────────────────────────────────────────
async function refreshPrivacy() {
  const hive = state.hive || await api('/api/v6/hive-status');
  const a = hive?.modules.airGap ?? {};
  document.getElementById('airgap-state').innerHTML = \`
    <div class="row"><span class="k">Enabled</span><span class="v \${a.enabled ? 'good' : ''}">\${a.enabled ? 'YES' : 'no'}</span></div>
    <div class="row"><span class="k">Policy</span><span class="v">\${a.policy || '—'}</span></div>
    <div class="row"><span class="k">Blocked outbound</span><span class="v bad">\${a.blockedOutboundCount ?? 0}</span></div>
    <div class="row"><span class="k">Allowed local</span><span class="v good">\${a.allowedLocalCount ?? 0}</span></div>\`;
  const qlist = await api('/api/v6/quarantine-list?pendingOnly=true') ?? [];
  document.getElementById('quarantine-state').innerHTML = \`<div class="row"><span class="k">Pending</span><span class="v">\${qlist.length}</span></div><div class="row"><span class="k">Auto-delete after</span><span class="v">7 days</span></div>\`;
  document.getElementById('quarantine-list').innerHTML = qlist.length ? qlist.map(e =>
    \`<tr><td><code>\${e.id.slice(0,10)}</code></td><td><span class="pill">\${e.source}</span></td><td>\${(e.claim||'').slice(0,100)}</td><td class="mono">\${e.reasonFlagged}</td><td style="text-align:right"><button class="btn sm success">Promote</button> <button class="btn sm danger">Reject</button></td></tr>\`
  ).join('') : '<tr><td colspan="5"><div class="empty">No quarantined claims</div></td></tr>';
}
async function enableAirGap() { await api('/api/v6/airgap-enable', { policy: 'strict' }); toast('Air-gap enabled','strict mode'); refresh(); refreshPrivacy(); }
async function disableAirGap() { await api('/api/v6/airgap-disable', {}); toast('Air-gap disabled','', 'warn'); refresh(); refreshPrivacy(); }
async function toggleAirGap() { const hive = state.hive || await api('/api/v6/hive-status'); if (hive?.modules.airGap?.enabled) disableAirGap(); else enableAirGap(); }

// ──── Voice ────────────────────────────────────────────────────────────
async function sendVoice() {
  const r = await api('/api/v6/voice-process', { transcript: document.getElementById('voice-input').value });
  if (r) document.getElementById('voice-output').textContent = \`Intent: \${r.intent}\\n\\n\${r.response}\`;
}

// ──── Garden ───────────────────────────────────────────────────────────
async function refreshGarden() {
  const snap = await api('/api/v6/garden-snapshot?limit=200') ?? [];
  const stats = await api('/api/v6/garden-stats') ?? { nodes: 0, avgBloom: 0, linkedFraction: 0 };
  document.getElementById('garden-stats').textContent = \`Nodes: \${stats.nodes} · avg bloom: \${stats.avgBloom} · linked: \${Math.round((stats.linkedFraction||0) * 100)}%\`;
  drawGarden(snap);
}
function drawGarden(nodes) {
  const c = document.getElementById('garden-canvas');
  if (!c) return;
  const ctx = c.getContext('2d'); const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  if (!nodes.length) { ctx.fillStyle = '#556080'; ctx.font = '14px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.fillText('No garden yet. Let the brain grow.', W/2, H/2); return; }
  const pos = nodes.map((n, i) => {
    const a = i / nodes.length * Math.PI * 2;
    const r = 110 + (1 - n.bloom) * 170 + Math.sin(i * 1.3) * 30;
    return { x: W/2 + Math.cos(a) * r, y: H/2 + Math.sin(a) * r * 0.75, node: n };
  });
  ctx.strokeStyle = 'rgba(24,255,255,0.1)'; ctx.lineWidth = 1;
  for (const p of pos) for (const c of p.node.connections) { const t = pos.find(x => x.node.id === c); if (t) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(t.x, t.y); ctx.stroke(); } }
  for (const p of pos) {
    const col = p.node.kind === 'decision' ? '#a855f7' : p.node.kind === 'pattern' ? '#18ffff' : '#10e68c';
    const rad = 4 + p.node.bloom * 9;
    const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad * 2.5);
    grd.addColorStop(0, col + 'cc'); grd.addColorStop(1, col + '00');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(p.x, p.y, rad * 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col; ctx.globalAlpha = Math.max(0.4, p.node.bloom);
    ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ──── PR Review ────────────────────────────────────────────────────────
async function genPRReview() {
  const r = await api('/api/v6/pr-review-generate', {
    repo: document.getElementById('pr-repo').value,
    prNumber: parseInt(document.getElementById('pr-num').value || '0'),
    changedFiles: document.getElementById('pr-files').value.split(',').map(s => s.trim()).filter(Boolean),
    diffSummary: document.getElementById('pr-diff').value,
  });
  if (r) { document.getElementById('pr-output').textContent = r.body; toast('Review generated'); }
}

// ──── Team ─────────────────────────────────────────────────────────────
async function refreshTeam() {
  const self = await api('/api/v6/team-self') ?? {};
  const peers = await api('/api/v6/team-peers') ?? [];
  document.getElementById('team-self').innerHTML = \`<div class="row"><span class="k">Peer ID</span><span class="v mono">\${self.peerId || '—'}</span></div><div class="row"><span class="k">Display name</span><span class="v">\${self.displayName || '—'}</span></div>\`;
  document.getElementById('team-peers').innerHTML = peers.length ? peers.map(p => \`<div class="row"><span class="k">\${p.displayName}</span><span class="v mono">\${p.peerId}</span></div>\`).join('') : '<div class="empty">No peers connected. Connect via WebRTC.</div>';
}

// ──── Exchange ─────────────────────────────────────────────────────────
async function refreshExchange() {
  const packages = await api('/api/v6/exchange-list') ?? [];
  document.getElementById('ex-list').innerHTML = packages.length ? packages.map(p => \`<div class="row"><span class="k"><code>\${p.name}</code><br/><span style="font-size:10px;color:var(--text-3)">by \${p.author}</span></span><span class="v">\${p.memoryCount} memories</span></div>\`).join('') : '<div class="empty">No local packages yet</div>';
}
async function exportPackage() {
  const res = await api('/api/v6/exchange-export', {
    name: document.getElementById('ex-name').value || 'untitled',
    description: document.getElementById('ex-desc').value,
    author: document.getElementById('ex-author').value,
    tags: document.getElementById('ex-tags').value.split(',').map(s => s.trim()).filter(Boolean),
  });
  if (res) { document.getElementById('ex-out').textContent = 'Saved → ' + res.filePath; toast('Package exported'); refreshExchange(); }
}

// ──── Features ─────────────────────────────────────────────────────────
async function refreshFeatures() {
  document.getElementById('feature-grid').innerHTML = '<div><p>Runtime controls have moved to the workspace. Each switch describes the behavior it changes.</p><p style="margin-top:16px"><a class="btn primary" href="/#features">Open feature controls</a></p></div>';
}

// ──── Models & Intelligence ────────────────────────────────────────────
let _providers = [];
let _allModels = {};
async function refreshModels() {
  const data = await api('/api/v6/providers');
  if (!data) return;
  _providers = data.providers ?? [];

  // Provider cards
  document.getElementById('providers-grid').innerHTML = _providers.map(p => {
    return \`<div class="card" style="padding:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><div style="font-weight:700;font-size:13px">\${htmlEscape(p.displayName)}</div><span class="pill \${p.enabled ? 'green' : ''}">\${p.enabled ? 'enabled' : 'off'}</span></div>
      <div class="field" style="margin-bottom:6px"><label>API key</label><input type="password" id="pkey-\${p.id}" placeholder="Leave blank to keep the current setting" autocomplete="off"/></div>
      <div class="field" style="margin-bottom:6px"><label>Default Model</label><input id="pmodel-\${p.id}" value="\${htmlEscape(p.defaultModel)}"/></div>
      <div class="flex gap">
        <button class="btn sm primary" onclick="saveProvider('\${p.id}')">Save</button>
        <button class="btn sm" onclick="testProvider('\${p.id}')">Test</button>
        <button class="btn sm" onclick="fetchProviderModels('\${p.id}')">Fetch Models</button>
      </div>
      <div class="mono mt" id="pmodels-\${p.id}" style="max-height:120px;overflow-y:auto;font-size:10.5px;color:var(--text-3)"></div>
    </div>\`;
  }).join('');

  // Intelligence config
  const intel = await api('/api/v6/intelligence');
  if (intel) {
    const provSel = document.getElementById('intel-provider');
    provSel.innerHTML = _providers.map(p => \`<option value="\${p.id}" \${intel.leadProvider === p.id ? 'selected' : ''}>\${htmlEscape(p.displayName)}</option>\`).join('');
    // Populate model field
    const modelInput = document.getElementById('intel-model');
    modelInput.innerHTML = \`<option value="\${htmlEscape(intel.leadModel)}">\${htmlEscape(intel.leadModel)}</option>\`;
    document.getElementById('intel-local-first').checked = intel.preferLocalFirst;
  }

}
async function saveProvider(id) {
  const apiKey = document.getElementById('pkey-' + id).value;
  const defaultModel = document.getElementById('pmodel-' + id).value;
  const r = await api('/api/v6/provider-save', { provider: id, apiKey: apiKey || undefined, defaultModel, enabled: true });
  if (r) { toast('Saved', id); refreshModels(); }
}
async function testProvider(id) {
  const r = await api('/api/v6/provider-test', { provider: id });
  toast(r?.ok ? 'Connected' : 'Failed', r?.ok ? (r.modelCount + ' models available') : (r?.error || 'Unknown error'), r?.ok ? 'success' : 'error');
}
async function fetchProviderModels(id) {
  const models = await api('/api/v6/provider-models', { provider: id });
  if (!models) return;
  _allModels[id] = models;
  document.getElementById('pmodels-' + id).innerHTML = models.length
    ? models.slice(0, 50).map(m => \`<div style="padding:3px 0"><span class="tag-code">\${htmlEscape(m.id)}</span>\${m.tags.length ? ' <span style="color:var(--text-dim)">' + m.tags.map(htmlEscape).join(' · ') + '</span>' : ''}</div>\`).join('')
    : '<div>No models (check API key + network)</div>';
  toast('Fetched', models.length + ' models from ' + id);
}
async function saveIntelligence() {
  const provId = document.getElementById('intel-provider').value;
  const model = document.getElementById('intel-model').value;
  const local = document.getElementById('intel-local-first').checked;
  const r = await api('/api/v6/intelligence', {
    leadProvider: provId, leadModel: model,
    preferLocalFirst: local,
  });
  document.getElementById('intel-result').textContent = r ? '✓ Intelligence config saved · lead: ' + provId + ' / ' + model : '✗ Save failed';
  if (r) toast('Intelligence updated');
}
// ──── Chat with Brain ──────────────────────────────────────────────────
let currentConversationId = null;
async function refreshChat() {
  const list = await api('/api/v6/chat-conversations');
  const el = document.getElementById('chat-conversations');
  el.innerHTML = (list || []).map(c => \`<div class="row" onclick="loadConv('\${c.id}')" style="cursor:pointer"><span class="k" style="min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${c.preview || '(new)'}</span><span class="v mono" style="font-size:10px">\${c.turnCount}</span></div>\`).join('') || '<div class="empty">No chats yet</div>';
  if (!currentConversationId) renderChatMessages([]);
}
async function loadConv(id) { currentConversationId = id; const turns = await api('/api/v6/chat-conversation', { conversationId: id }) ?? []; renderChatMessages(turns); }
function newChat() { currentConversationId = null; renderChatMessages([]); document.getElementById('chat-input').focus(); }
async function clearAllChats() { if (!confirm('Clear ALL chat history?')) return; await api('/api/v6/chat-clear-all', {}); currentConversationId = null; refreshChat(); renderChatMessages([]); toast('Chat history cleared','','warn'); }
function renderChatMessages(turns) {
  const el = document.getElementById('chat-messages');
  if (!turns.length) { el.innerHTML = '<div class="empty"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Ask your brain anything.<br/>It will search memories + cite them.</div>'; return; }
  el.innerHTML = turns.map(t => {
    const isUser = t.role === 'user';
    const cites = (t.citations || []).length ? \`<div style="margin-top:8px;padding:8px;background:var(--bg-elev-1);border-radius:6px"><div style="font-size:10px;color:var(--text-3);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em">Citations (\${t.citations.length})</div>\${t.citations.map((c, i) => \`<div style="padding:4px 0;border-bottom:1px solid var(--border);font-size:11px"><span class="pill cyan">[\${i+1}]</span> <span class="pill">\${c.agent}/\${c.category}</span> \${c.content.slice(0, 180)} <span style="color:var(--text-dim)">(\${(c.score*100).toFixed(0)}%)</span></div>\`).join('')}</div>\` : '';
    const meta = !isUser && t.provider ? \`<div class="mono" style="font-size:10px;color:var(--text-3);margin-top:6px">\${t.provider}/\${t.model || ''} · \${t.tokensUsed || 0} tok\${t.cached ? ' · cached' : ''}</div>\` : '';
    return \`<div style="display:flex;gap:10px;margin-bottom:14px;\${isUser ? '' : 'background:var(--bg-elev-1);padding:12px;border-radius:10px'}"><div style="width:28px;height:28px;border-radius:50%;background:\${isUser ? 'var(--brand-gradient)' : 'var(--bg-elev-3)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;font-weight:700">\${isUser ? 'You' : '🧠'}</div><div style="flex:1;min-width:0"><div style="white-space:pre-wrap;font-size:13px;line-height:1.5">\${(t.content || '').replace(/\\</g, '&lt;')}</div>\${cites}\${meta}</div></div>\`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}
async function sendChat() {
  const input = document.getElementById('chat-input');
  const question = input.value.trim();
  if (!question) return;
  input.value = '';
  const btn = document.getElementById('chat-send-btn');
  btn.disabled = true;
  document.getElementById('chat-status').textContent = 'Searching memories + calling LLM...';
  const turns = currentConversationId ? (await api('/api/v6/chat-conversation', { conversationId: currentConversationId }) ?? []) : [];
  turns.push({ role: 'user', content: question, createdAt: new Date() });
  renderChatMessages(turns);
  try {
    const res = await api('/api/v6/chat', { question, conversationId: currentConversationId, maxCitations: 6 });
    if (res) {
      currentConversationId = res.conversationId;
      const updated = await api('/api/v6/chat-conversation', { conversationId: currentConversationId }) ?? [];
      renderChatMessages(updated);
      refreshChat();
      document.getElementById('chat-status').textContent = 'Answered in ' + (res.ms || '?') + 'ms · ' + (res.citations?.length || 0) + ' citations';
    }
  } finally {
    btn.disabled = false;
  }
}

// ──── Stop button ──────────────────────────────────────────────────────
async function stopBrain() {
  if (!confirm('Stop Shadow Brain?\\n\\nThe npm process will exit. You will need to restart it from your terminal.')) return;
  try {
    await fetch('/api/v6/shutdown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  } catch { /* server is shutting down */ }
  toast('Shutting down', 'Shadow Brain is stopping...', 'warn');
  setTimeout(() => { document.body.style.filter = 'grayscale(1) brightness(0.4)'; document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#888;font-family:ui-monospace,monospace;font-size:16px;flex-direction:column;gap:16px"><div>⏻ Shadow Brain stopped</div><div style="font-size:12px">Restart with: <code style="background:#222;padding:4px 8px;border-radius:4px">npm run dev</code> or <code style="background:#222;padding:4px 8px;border-radius:4px">shadow-brain dash .</code></div></div>'; }, 1500);
}

// When the intel provider changes, re-fetch its models to populate the model dropdown
document.addEventListener('change', async e => {
  if (e.target && e.target.id === 'intel-provider') {
    const id = e.target.value;
    const models = _allModels[id] || await api('/api/v6/provider-models', { provider: id });
    _allModels[id] = models || [];
    const sel = document.getElementById('intel-model');
    if (sel) sel.innerHTML = (models || []).map(m => \`<option value="\${htmlEscape(m.id)}">\${htmlEscape(m.displayName)}</option>\`).join('') || '<option>no models available</option>';
  }
});

// ──── Config ───────────────────────────────────────────────────────────
async function refreshConfig() {
  const hive = state.hive || await api('/api/v6/hive-status');
  if (!hive) return;
  document.getElementById('config-state').innerHTML = \`
    <div class="row"><span class="k">Version</span><span class="v">\${hive.version}</span></div>
    <div class="row"><span class="k">Local-first</span><span class="v \${hive.localFirst ? 'good' : 'warn'}">\${hive.localFirst ? 'YES' : 'no'}</span></div>
    <div class="row"><span class="k">Recorded tools</span><span class="v">\${hive.totalAgentsConnected}</span></div>
    <div class="row"><span class="k">Memories stored</span><span class="v">\${hive.totalMemoriesStored}</span></div>
    <div class="row"><span class="k">Modules active</span><span class="v good">\${Object.keys(hive.modules || {}).length}</span></div>\`;
}
async function saveConfig() { const r = await api('/api/v6/config-save', { provider: document.getElementById('cfg-provider').value, apiKey: document.getElementById('cfg-apikey').value || undefined, model: document.getElementById('cfg-model').value || undefined }); document.getElementById('cfg-result').textContent = r?.ok ? '✓ Saved' : '✗ Failed'; if (r?.ok) toast('Config saved'); }
async function testConnection() { const r = await api('/api/v6/config-test', { provider: document.getElementById('cfg-provider').value }); document.getElementById('cfg-result').textContent = r?.ok ? '✓ Connected' : '✗ ' + (r?.error || 'Failed'); toast(r?.ok ? 'Connection OK' : 'Connection failed', r?.error || '', r?.ok ? 'success' : 'error'); }
async function startMCP() { const r = await api('/api/v6/mcp-start', { port: parseInt(document.getElementById('mcp-port').value || '7342'), authToken: document.getElementById('mcp-token').value || undefined }); document.getElementById('mcp-result').textContent = r?.ok ? '✓ Started at :' + (r.port ?? 7342) : '✗ ' + (r?.error || 'Failed'); toast(r?.ok ? 'MCP started' : 'MCP failed', r?.error, r?.ok ? 'success' : 'error'); }
async function stopMCP() { const r = await api('/api/v6/mcp-stop', {}); document.getElementById('mcp-result').textContent = r?.ok ? '✓ Stopped' : '✗ ' + (r?.error || 'Failed'); toast('MCP stopped', '', 'warn'); }

// ──── Agents ───────────────────────────────────────────────────────────
async function refreshAgents() {
  const list = await api('/api/v6/agents-list', {}) ?? [];
  document.getElementById('badge-agents').textContent = list.filter(a => a.hookInstalled).length;
  document.getElementById('agents-table').innerHTML = list.map(a => \`
    <tr>
      <td><strong>\${a.displayName}</strong><br/><code style="color:var(--text-3);font-size:10px">\${a.name}</code></td>
      <td>\${a.detected ? '<span class="pill green">detected</span>' : '<span class="pill">not found</span>'}</td>
      <td>\${a.hookInstalled ? '<span class="pill cyan">active</span>' : '<span class="pill">not wired</span>'}</td>
      <td class="mono">\${a.hookPath ? a.hookPath.slice(0, 70) : '—'}</td>
      <td style="text-align:right">\${a.hookInstalled ? \`<button class="btn sm danger" onclick="detachOne('\${a.name}')">Disconnect</button>\` : \`<button class="btn sm success" onclick="attachOne('\${a.name}')">Connect</button>\`}</td>
    </tr>\`).join('') || '<tr><td colspan="5"><div class="empty">No agents detected</div></td></tr>';
}
async function attachOne(agent) { const r = await api('/api/v6/agents-attach', { agent }); if (r?.ok) toast('Attached', agent); else toast('No change', r?.error || r?.report?.failed?.[0]?.reason || 'Attachment failed.', 'warn'); refreshAgents(); }
async function detachOne(agent) { const r = await api('/api/v6/agents-detach', { agent }); if (r?.ok) toast('Detached', agent, 'warn'); else toast('No change', r?.error || r?.report?.failed?.[0]?.reason || 'No hook was removed.', 'warn'); refreshAgents(); }
async function attachAll() { const r = await api('/api/v6/agents-attach-all', {}); if (r) { toast('Attach All', (r.attached?.length ?? 0) + ' agents wired'); refreshAgents(); } }
async function detachAll() { if (!confirm('Detach Shadow Brain hooks from ALL agents?')) return; const r = await api('/api/v6/agents-detach-all', {}); if (r) { toast('Detach All', (r.attached?.length ?? 0) + ' agents', 'warn'); refreshAgents(); } }

// ──── Memory browser ───────────────────────────────────────────────────
function renderCountRows(rows, emptyMessage) {
  if (!rows || !rows.length) return '<div class="empty-tight">' + htmlEscape(emptyMessage) + '</div>';
  return rows.slice(0, 8).map(row =>
    '<div class="row"><span class="k">' + htmlEscape(row.name) + '</span><span class="v">' + htmlEscape(row.count) + '</span></div>'
  ).join('');
}
async function refreshMemoryIntelligence() {
  const data = await api('/api/v6/memory-intelligence?limit=500');
  if (!data) return;
  document.getElementById('mem-total').textContent = data.totalEntries ?? 0;
  document.getElementById('mem-sampled').textContent = (data.sampledEntries ?? 0) + ' shown in intelligence sample';
  document.getElementById('mem-source').textContent = Math.round((data.sourceCoverage || 0) * 100) + '%';
  document.getElementById('mem-fresh').textContent = data.recent7d ?? 0;
  document.getElementById('mem-seed-open').textContent = data.openSeedDrafts ?? 0;
  document.getElementById('mem-seed-sub').textContent = (data.pendingApprovals ?? 0) + ' need approval';
  document.getElementById('mem-categories').innerHTML = renderCountRows(data.byCategory, 'No categories yet.');
  document.getElementById('mem-agents').innerHTML = renderCountRows(data.byAgent, 'No agent memory writes yet.');
  document.getElementById('mem-tags').innerHTML = renderCountRows(data.topTags, 'No tags yet.');
}
async function searchMemory() {
  const r = await api('/api/v6/memory-browser', {
    query: document.getElementById('mem-query').value,
    agent: document.getElementById('mem-agent').value,
    category: document.getElementById('mem-category').value,
    minImportance: parseFloat(document.getElementById('mem-importance').value || '0'),
  });
  if (!r) return;
  document.getElementById('mem-results').innerHTML = r.length ? r.map(m =>
    \`<tr><td><code>\${m.id.slice(0, 10)}</code></td><td><span class="pill cyan">\${m.agentTool}</span></td><td>\${m.category}</td><td>\${(m.content || '').slice(0, 140)}</td><td>\${(m.importance || 0).toFixed(2)}</td><td class="mono">\${new Date(m.createdAt).toLocaleDateString()}</td></tr>\`
  ).join('') : '<tr><td colspan="6"><div class="empty">No memories match your filters</div></td></tr>';
}

// ──── Activity ─────────────────────────────────────────────────────────
// Live Brain
// Memory Seeder
function seedProjectPath() {
  return document.getElementById('seed-project-path')?.value?.trim()
    || document.getElementById('live-project-path')?.value?.trim()
    || document.getElementById('ww2-project-path')?.value?.trim()
    || '';
}
function copyLivePathToSeeder() {
  const value = document.getElementById('live-project-path')?.value?.trim()
    || document.getElementById('ww2-project-path')?.value?.trim()
    || '';
  if (value) document.getElementById('seed-project-path').value = value;
}
function openSeederForLiveBrain() {
  const projectDir = liveProjectPath() || document.getElementById('ww2-project-path')?.value?.trim() || '';
  switchTab('seeder', 'Memory Seeder');
  if (projectDir) document.getElementById('seed-project-path').value = projectDir;
  const topic = document.getElementById('seed-topic');
  const objective = document.getElementById('seed-objective');
  if (topic && !topic.value) topic.value = 'Source-backed live brain improvement';
  if (objective && !objective.value) objective.value = 'Capture verified project knowledge that future agents should recall before complex work.';
  refreshSeedDrafts();
}
function seedDraftStatusClass(status) {
  if (status === 'seeded') return 'green';
  if (status === 'approved') return 'cyan';
  if (status === 'rejected') return 'red';
  return 'yellow';
}
function renderSeedStatus(drafts) {
  const counts = { draft: 0, approved: 0, seeded: 0, rejected: 0 };
  for (const d of drafts || []) counts[d.status] = (counts[d.status] || 0) + 1;
  return [
    '<div class="row"><span class="k">Open drafts</span><span class="v warn">' + counts.draft + '</span></div>',
    '<div class="row"><span class="k">Approved</span><span class="v good">' + counts.approved + '</span></div>',
    '<div class="row"><span class="k">Seeded</span><span class="v good">' + counts.seeded + '</span></div>',
    '<div class="row"><span class="k">Rejected</span><span class="v bad">' + counts.rejected + '</span></div>',
    '<div class="row"><span class="k">Current project</span><span class="v mono">' + htmlEscape(seedProjectPath() || 'dashboard default') + '</span></div>',
  ].join('');
}
function seedJsArg(value) {
  return JSON.stringify(String(value || ''));
}
function renderSeedDrafts(drafts) {
  if (!drafts || !drafts.length) return '<div class="empty-tight">No seed drafts yet.</div>';
  return drafts.map(d => {
    const approvedBy = new Set((d.approvals || []).map(a => a.by));
    const required = d.requiredApprovals || [];
    const pending = required.filter(a => !approvedBy.has(a));
    const agentApprover = d.approverAgent && d.approverAgent !== 'user' ? d.approverAgent : d.researchAgent;
    const warnings = (d.warnings || []).length
      ? '<div class="warning-stack" style="margin-top:8px">' + d.warnings.map(w => '<div class="warning-banner"><strong>Review</strong><span>' + htmlEscape(w) + '</span></div>').join('') + '</div>'
      : '';
    const sources = (d.sources || []).slice(0, 5).map(s => '<code>' + htmlEscape(s) + '</code>').join(' ');
    let actions = '';
    if (d.status === 'draft') {
      actions += '<button class="btn sm success" onclick="approveSeedDraft(' + seedJsArg(d.id) + ',' + seedJsArg('user') + ')">User Approve</button> ';
      actions += '<button class="btn sm" onclick="approveSeedDraft(' + seedJsArg(d.id) + ',' + seedJsArg(agentApprover) + ')">Agent Approve</button> ';
      actions += '<button class="btn sm danger" onclick="rejectSeedDraft(' + seedJsArg(d.id) + ')">Reject</button>';
    }
    if (d.status === 'approved') {
      actions += '<button class="btn sm primary" onclick="commitSeedDraft(' + seedJsArg(d.id) + ')">Seed to Brain</button> ';
      actions += '<button class="btn sm danger" onclick="rejectSeedDraft(' + seedJsArg(d.id) + ')">Reject</button>';
    }
    if (d.status === 'seeded') {
      actions += '<span class="pill green">memory ' + htmlEscape((d.seededMemoryId || '').slice(0, 10)) + '</span> ';
      actions += '<button class="btn sm" onclick="handoffToAgent(' + seedJsArg(d.researchAgent) + ')" title="Generate a briefing to hand this knowledge back to an agent">↩ Hand to Agent</button>';
    }
    return '<div class="memory-item">' +
      '<div class="meta">' +
        '<span class="pill ' + seedDraftStatusClass(d.status) + '">' + htmlEscape(d.status) + '</span>' +
        '<span class="pill purple">' + htmlEscape(d.researchAgent) + '</span>' +
        '<span class="pill cyan">' + htmlEscape(d.approvalMode) + '</span>' +
        '<span>' + htmlEscape(new Date(d.updatedAt || d.createdAt).toLocaleString()) + '</span>' +
      '</div>' +
      '<div style="display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap">' +
        '<div style="min-width:260px;flex:1">' +
          '<div style="font-weight:700;margin-bottom:4px">' + htmlEscape(d.topic) + '</div>' +
          '<div class="content">' + htmlEscape(d.objective || '').slice(0, 260) + '</div>' +
          '<div class="mono" style="font-size:11px;color:var(--text-3);margin-top:6px">pending: ' + htmlEscape(pending.join(', ') || 'none') + ' | category: ' + htmlEscape(d.category) + '</div>' +
          '<div style="font-size:11px;color:var(--text-3);margin-top:6px">' + (sources || 'No sources') + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">' + actions + '</div>' +
      '</div>' +
      warnings +
      '<pre class="mono" style="margin-top:10px;max-height:180px;overflow:auto;background:var(--bg-elev-1);padding:10px;border-radius:6px;white-space:pre-wrap">' + htmlEscape(d.content || '') + '</pre>' +
    '</div>';
  }).join('');
}
async function refreshSeedDrafts() {
  const input = document.getElementById('seed-project-path');
  if (input && !input.value) input.value = seedProjectPath();
  const drafts = await api('/api/v6/seed-drafts?limit=50') ?? [];
  const open = drafts.filter(d => d.status === 'draft' || d.status === 'approved').length;
  const badge = document.getElementById('badge-seeder');
  if (badge) badge.textContent = open;
  const status = document.getElementById('seed-status');
  if (status) status.innerHTML = renderSeedStatus(drafts);
  const list = document.getElementById('seed-drafts');
  if (list) list.innerHTML = renderSeedDrafts(drafts);
}
async function createSeedDraft() {
  const topic = document.getElementById('seed-topic').value.trim();
  if (!topic) { toast('Topic required', 'Add a seed topic before creating a draft.', 'warn'); return; }
  const draft = await api('/api/v6/seed-draft', {
    projectDir: seedProjectPath(),
    topic,
    objective: document.getElementById('seed-objective').value,
    researchAgent: document.getElementById('seed-research-agent').value,
    approverAgent: document.getElementById('seed-approver-agent').value,
    approvalMode: document.getElementById('seed-approval-mode').value,
    category: document.getElementById('seed-category').value,
    tags: document.getElementById('seed-tags').value,
    importance: parseFloat(document.getElementById('seed-importance').value || '0.78'),
    sources: document.getElementById('seed-sources').value,
    content: document.getElementById('seed-content').value,
  });
  if (draft) {
    toast('Seed draft created', draft.status);
    refreshSeedDrafts();
  }
}
// One-click path: create → approve → save to brain. The "single seed".
async function quickSeed() {
  const topic = document.getElementById('seed-topic').value.trim();
  if (!topic) { toast('Topic required', 'Add a topic before quick-saving.', 'warn'); return; }
  const draft = await api('/api/v6/seed-draft', {
    projectDir: seedProjectPath(),
    topic,
    objective: document.getElementById('seed-objective').value,
    researchAgent: document.getElementById('seed-research-agent').value,
    approverAgent: 'user',
    approvalMode: 'user',
    category: document.getElementById('seed-category').value,
    tags: document.getElementById('seed-tags').value,
    importance: parseFloat(document.getElementById('seed-importance').value || '0.78'),
    sources: document.getElementById('seed-sources').value,
    content: document.getElementById('seed-content').value,
  });
  if (!draft || !draft.id) return;
  const approved = await api('/api/v6/seed-approve', { id: draft.id, approvedBy: 'user' });
  if (!approved) { toast('Saved as draft', 'Approve it in the queue to finish.', 'warn'); refreshSeedDrafts(); return; }
  const committed = await api('/api/v6/seed-commit', { id: draft.id, seededBy: 'user' });
  if (committed) {
    toast('Saved to brain ⚡', 'Knowledge is now in memory.', 'success');
    refreshSeedDrafts();
    try { refreshLiveBrain(); } catch (e) {}
  } else {
    toast('Approved', 'Couldn\\'t finalize — finish from the queue.', 'warn');
    refreshSeedDrafts();
  }
}
async function approveSeedDraft(id, approvedBy) {
  const draft = await api('/api/v6/seed-approve', { id, approvedBy });
  if (draft) {
    toast('Approval recorded', draft.status);
    refreshSeedDrafts();
  }
}
async function rejectSeedDraft(id) {
  const reason = prompt('Reject reason', 'Not verified enough');
  if (reason === null) return;
  const draft = await api('/api/v6/seed-reject', { id, reason, rejectedBy: 'user' });
  if (draft) {
    toast('Draft rejected', draft.topic, 'warn');
    refreshSeedDrafts();
  }
}
async function commitSeedDraft(id) {
  const draft = await api('/api/v6/seed-commit', { id, seededBy: 'user' });
  if (draft) {
    toast('Seeded to brain', (draft.seededMemoryId || '').slice(0, 10));
    refreshSeedDrafts();
    refreshLiveBrain();
  }
}
// Two-way: hand the brain's knowledge back to an agent as a ready briefing.
async function handoffToAgent(toAgent) {
  const md = await api('/api/v6/agent-handoff', { projectDir: seedProjectPath(), fromAgent: 'user', toAgent: toAgent || 'claude-code', format: 'markdown' });
  if (!md) return;
  try {
    await navigator.clipboard.writeText(typeof md === 'string' ? md : JSON.stringify(md, null, 2));
    toast('Handoff copied', 'Briefing for ' + (toAgent || 'agent') + ' is on your clipboard — paste it into the agent.', 'success');
  } catch (e) {
    toast('Handoff ready', 'Copy it from the Activity log if clipboard is blocked.', 'warn');
  }
}

function liveProjectPath() {
  return document.getElementById('live-project-path')?.value?.trim() || '';
}
function liveActionPill(priority) {
  if (priority === 'critical' || priority === 'high') return 'red';
  if (priority === 'medium') return 'yellow';
  return 'cyan';
}
async function refreshLiveBrain() {
  const projectDir = liveProjectPath();
  const queries = document.getElementById('live-queries')?.value?.trim() || '';
  const url = '/api/v6/live-brain?projectDir=' + encodeURIComponent(projectDir) + (queries ? '&queries=' + encodeURIComponent(queries) : '');
  const data = await api(url);
  if (!data) return;

  const quality = data.memoryQuality || {};
  document.getElementById('live-memories').textContent = quality.totalEntries ?? 0;
  document.getElementById('live-quality').textContent = (quality.avgScore ?? 0) + '/100';
  document.getElementById('live-sources').textContent = Math.round((quality.sourceCoverage ?? 0) * 100) + '%';
  document.getElementById('live-recall').textContent = data.recallEval?.avgHitCount ?? 0;
  document.getElementById('live-scope').textContent = data.projectScoped ? 'project scoped' : 'global fallback';

  document.getElementById('live-actions').innerHTML = (data.learningActions || []).length
    ? data.learningActions.map(a => \`<div class="memory-item"><div class="meta"><span class="pill \${liveActionPill(a.priority)}">\${a.priority}</span><span>\${a.title}</span></div><div class="content">\${a.reason}</div>\${a.command ? '<code>' + a.command + '</code>' : ''}</div>\`).join('')
    : '<div class="empty">No immediate hygiene actions.</div>';

  document.getElementById('live-eval').innerHTML = (data.recallEval?.cases || []).map(c =>
    \`<div class="row"><span class="k">\${c.query}</span><span class="v \${c.hitCount ? 'good' : 'bad'}">\${c.hitCount} hits - \${c.sourceBackedHits} sourced</span></div>\`
  ).join('') || '<div class="empty">No eval cases.</div>';

  document.getElementById('live-top').innerHTML = (data.topMemories || []).slice(0, 8).map(m =>
    \`<div class="memory-item"><div class="meta"><span class="pill purple">\${m.agentTool}</span><span>\${m.category}</span><span>score \${m.qualityScore}/100</span></div><div class="content">\${(m.content || '').slice(0, 260)}</div></div>\`
  ).join('') || '<div class="empty">No memories.</div>';

  document.getElementById('live-brief').textContent = data.agentBriefing || '';
}

// ──── Realtime Activity Stream (v6.1) ──────────────────────────────────
let activityBuffer = [];
const activitySeen = new Set();
const activitySeenOrder = [];
let activityFilter = '';
let activityPaused = false;
let activityRate = [];
let lastIngestFresh = false;

function activityKey(e) { return (e.type || '') + '|' + (e.source || '') + '|' + String(e.detail || '').slice(0, 60); }
function actEpoch(e) {
  if (typeof e.ts === 'number') return e.ts;
  if (e.timestamp) { const t = Date.parse(e.timestamp); if (!isNaN(t)) return t; }
  return Date.now();
}
function ingestActivity(raw, fresh) {
  const e = { ts: actEpoch(raw), type: raw.type || 'event', source: raw.source || 'brain', detail: String(raw.detail || '') };
  const key = activityKey(e);
  if (activitySeen.has(key)) return false;
  activitySeen.add(key); activitySeenOrder.push(key);
  if (activitySeenOrder.length > 1200) { const drop = activitySeenOrder.splice(0, activitySeenOrder.length - 1200); for (const k of drop) activitySeen.delete(k); }
  activityBuffer.unshift(e);
  if (activityBuffer.length > 500) activityBuffer.length = 500;
  activityRate.push(e.ts);
  const cutoff = Date.now() - 30 * 60 * 1000;
  while (activityRate.length && activityRate[0] < cutoff) activityRate.shift();
  if (!activityPaused) {
    appendLog(e.source, e.type, e.detail);
    if (fresh) {
      // Graph animation consumes the deduplicated stored-event stream in pullTopology.
      lastIngestFresh = true;
    }
  }
  return true;
}
function typeMatchesFilter(type, filter) {
  if (!filter) return true;
  if (filter === 'seed-draft') return type === 'seed-draft' || type === 'seed-commit';
  return type === filter;
}
function renderActivityTable() {
  const tbody = document.getElementById('activity-table');
  if (!tbody) return;
  const searchEl = document.getElementById('act-search');
  const q = (searchEl ? searchEl.value : '').toLowerCase().trim();
  let rows = activityBuffer.filter(e => typeMatchesFilter(e.type, activityFilter));
  if (q) rows = rows.filter(e => (e.source + ' ' + e.type + ' ' + e.detail).toLowerCase().includes(q));
  const fresh = lastIngestFresh; lastIngestFresh = false;
  rows = rows.slice(0, 200);
  tbody.innerHTML = rows.length
    ? rows.map((e, i) => '<tr' + (i === 0 && fresh ? ' class="act-fresh"' : '') + '><td class="mono">' + new Date(e.ts).toLocaleTimeString() + '</td><td><span class="pill purple">' + htmlEscape(e.source) + '</span></td><td><span class="pill ' + typeToPill(e.type) + '">' + htmlEscape(e.type) + '</span></td><td class="mono">' + htmlEscape(e.detail.slice(0, 200)) + '</td></tr>').join('')
    : '<tr><td colspan="4"><div class="empty">No activity</div></td></tr>';
  const total = document.getElementById('act-stat-total'); if (total) total.textContent = activityBuffer.length;
  const last = document.getElementById('act-stat-last'); if (last) last.textContent = activityBuffer[0] ? new Date(activityBuffer[0].ts).toLocaleTimeString() : '—';
}
function eventsPerMin() { const c = Date.now() - 60000; return activityRate.filter(t => t >= c).length; }
function renderSparkline() {
  const rate = eventsPerMin();
  const ratePill = document.getElementById('act-rate-pill'); if (ratePill) ratePill.textContent = rate + ' / min';
  const ovRate = document.getElementById('ov-pulse-rate'); if (ovRate) ovRate.textContent = rate + ' / min';
  const cv = document.getElementById('act-spark');
  if (!cv || !cv.getContext) return;
  const now = Date.now();
  const buckets = new Array(10).fill(0);
  for (const t of activityRate) { const age = now - t; if (age < 0 || age > 10 * 60000) continue; const idx = 9 - Math.floor(age / 60000); if (idx >= 0 && idx < 10) buckets[idx]++; }
  const pw = (cv.parentElement ? cv.parentElement.clientWidth : 0) || 600;
  cv.width = pw; cv.height = 120;
  const ctx = cv.getContext('2d'); const W = cv.width, H = cv.height; ctx.clearRect(0, 0, W, H);
  let max = 1; for (const b of buckets) if (b > max) max = b;
  const bw = W / 10;
  for (let i = 0; i < 10; i++) {
    const h = (buckets[i] / max) * (H - 12);
    const x = i * bw + 3, y = H - h;
    ctx.fillStyle = i === 9 ? '#18ffff' : 'rgba(168,85,247,0.55)';
    ctx.fillRect(x, y, bw - 6, Math.max(0, h));
  }
}
function renderLivePulse() {
  const el = document.getElementById('ov-pulse');
  if (!el) return;
  const items = activityBuffer.slice(0, 8);
  el.innerHTML = items.length
    ? items.map(e => '<div class="memory-item"><div class="meta"><span class="pill ' + typeToPill(e.type) + '">' + htmlEscape(e.type) + '</span><span class="pill purple">' + htmlEscape(e.source) + '</span><span>' + new Date(e.ts).toLocaleTimeString() + '</span></div><div class="content">' + htmlEscape(e.detail.slice(0, 200)) + '</div></div>').join('')
    : '<div class="empty-tight">Awaiting live activity…</div>';
}
function setActivityFilter(btn, type) {
  activityFilter = type;
  const chips = document.querySelectorAll('#act-chips .chip');
  chips.forEach(c => c.classList.toggle('active', c === btn));
  renderActivityTable();
}
function toggleActivityPause() {
  activityPaused = !activityPaused;
  const btn = document.getElementById('act-pause-btn'); if (btn) btn.textContent = activityPaused ? 'Resume' : 'Pause';
  const badge = document.getElementById('act-live-badge'); if (badge) { badge.classList.toggle('paused', activityPaused); badge.textContent = activityPaused ? 'PAUSED' : 'LIVE'; }
  const live = document.getElementById('act-stat-live'); if (live) { live.textContent = activityPaused ? 'paused' : 'streaming'; live.className = 'v ' + (activityPaused ? 'warn' : 'good'); }
  if (!activityPaused) renderActivityTable();
}
function clearActivity() {
  activityBuffer = []; activitySeen.clear(); activitySeenOrder.length = 0; activityRate = [];
  renderActivityTable(); renderSparkline(); renderLivePulse();
}
function setConn(online) {
  const d = document.getElementById('conn-dot'); if (d) { d.classList.toggle('offline', !online); d.title = 'Realtime connection: ' + (online ? 'live' : 'reconnecting'); }
  if (activityPaused) return;
  const badge = document.getElementById('act-live-badge'); if (badge) { badge.classList.toggle('paused', !online); badge.textContent = online ? 'LIVE' : 'OFFLINE'; }
  const live = document.getElementById('act-stat-live'); if (live) { live.textContent = online ? 'streaming' : 'reconnecting'; live.className = 'v ' + (online ? 'good' : 'bad'); }
}
async function refreshActivity() {
  const log = await api('/api/v6/activity-log?limit=200');
  if (Array.isArray(log)) for (let i = log.length - 1; i >= 0; i--) ingestActivity(log[i], false);
  renderActivityTable(); renderSparkline();
}

// ──── Live Graph ───────────────────────────────────────────────────────
let graphObservedEvents = new Set(), graphObserved = false;
let graphFrame = 0, graphNodes = [], graphEdges = [], graphSignals = [], graphTimer = null, graphPullTimer = null;
const signalColors = { 'memory-write':'#10e68c','subagent-spawn':'#18ffff','dream':'#a855f7','revisit':'#a855f7','counterfactual':'#a855f7','consolidation':'#a855f7','contradiction':'#ff5864','pattern-discovery':'#10e68c','collision':'#ff5864','quarantine':'#ec4899','firewall-block':'#ffb53f' };
async function startGraph() { await pullTopology(); if (graphTimer) cancelAnimationFrame(graphTimer); graphLoop(); if (graphPullTimer) clearInterval(graphPullTimer); graphPullTimer = setInterval(pullTopology, 3000); }
async function pullTopology() {
  const topo = await api('/api/v6/topology', {});
  if (!topo) return;
  const canvas = document.getElementById('graph-canvas');
  if (!canvas) return;
  const W = canvas.width, H = canvas.height, cx = W/2, cy = H/2;
  const prev = new Map(graphNodes.map(n => [n.id, { x: n.x, y: n.y }]));
  graphNodes = [{ id:'brain', label:'HIVE MIND', x: cx, y: cy, r: 50, type:'brain', color:'#a855f7' }];
  (topo.agents || []).filter(a => a.configurationDetected).forEach((a, i, arr) => {
    const ang = (i / arr.length) * Math.PI * 2 - Math.PI / 2, r = 240;
    const p = prev.get(a.id);
    graphNodes.push({ id: a.id, label: a.displayName, x: p?.x ?? cx + Math.cos(ang) * r, y: p?.y ?? cy + Math.sin(ang) * r, targetX: cx + Math.cos(ang) * r, targetY: cy + Math.sin(ang) * r, r: 20, type:'agent', connected: false, color: '#8695aa' });
  });
  (topo.subAgents || []).forEach((s, i, arr) => {
    const parent = graphNodes.find(n => n.id === s.parent), ang = (i / Math.max(arr.length,1)) * Math.PI * 2, r = 130;
    const p = prev.get(s.id);
    graphNodes.push({ id: s.id, label: (s.task || '').slice(0, 18), x: p?.x ?? (parent?.x ?? cx) + Math.cos(ang) * 40, y: p?.y ?? (parent?.y ?? cy) + Math.sin(ang) * 40, targetX: cx + Math.cos(ang) * r, targetY: cy + Math.sin(ang) * r, r: 12, type:'subagent', parent: s.parent, color: '#a855f7' });
  });
  graphEdges = [];
  for (const n of graphNodes) {
    if (n.type === 'agent') graphEdges.push({ from:'brain', to: n.id, active: false });
    if (n.type === 'subagent') graphEdges.push({ from: n.parent ?? 'brain', to: n.id, active: false });
  }
  const now = Date.now();
  for (const e of (topo.events || [])) {
    const eventKey = e.id || JSON.stringify([e.type,e.source,e.target,e.timestamp]);
    if (graphObservedEvents.has(eventKey)) continue;
    graphObservedEvents.add(eventKey);
    if (!graphObserved) continue;
    const src = e.source ?? 'brain';
    const srcN = graphNodes.find(n => n.id === src);
    const dstN = e.type === 'subagent-spawn' ? graphNodes.find(n => n.id === e.target) : graphNodes.find(n => n.id === 'brain');
    if (!srcN || !dstN) continue;
    graphSignals.push({ fromId: srcN.id, toId: dstN.id, type: e.type, color: signalColors[e.type] || '#18ffff', progress: 0, spawnedAt: now });
  }
  graphObserved = true;
  if (graphObservedEvents.size > 500) graphObservedEvents = new Set([...graphObservedEvents].slice(-500));
  if (graphSignals.length > 100) graphSignals = graphSignals.slice(-100);
  document.getElementById('graph-meta').textContent = \`\${(topo.agents || []).filter(a => a.configurationDetected).length} configured/detected clients · \${(topo.subAgents || []).length} recorded sub-agents · \${graphSignals.length} new event signals\`;
}
function graphLoop() {
  const c = document.getElementById('graph-canvas');
  if (!c) return;
  const ctx = c.getContext('2d'), W = c.width, H = c.height;
  const now = Date.now();
  ctx.clearRect(0, 0, W, H);
  // Ambient backdrop with a soft vignette.
  const grd = ctx.createRadialGradient(W/2, H/2, 40, W/2, H/2, Math.max(W,H)/1.4);
  grd.addColorStop(0, 'rgba(168,85,247,0.10)'); grd.addColorStop(0.5, 'rgba(24,255,255,0.03)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);

  for (const n of graphNodes) if (n.targetX != null) { n.x += (n.targetX - n.x) * 0.08; n.y += (n.targetY - n.y) * 0.08; }

  // ── Edges: curved, with a gentle animated dash flow on active links ──────
  for (const e of graphEdges) {
    const a = graphNodes.find(n => n.id === e.from), b = graphNodes.find(n => n.id === e.to);
    if (!a || !b) continue;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    // Curve control point nudged perpendicular for an organic arc.
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx*dx + dy*dy) || 1;
    const cxp = mx - (dy / len) * 26, cyp = my + (dx / len) * 26;
    if (e.active) {
      const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      g.addColorStop(0, 'rgba(24,255,255,0.05)'); g.addColorStop(0.5, 'rgba(24,255,255,0.34)'); g.addColorStop(1, 'rgba(168,85,247,0.18)');
      ctx.strokeStyle = g; ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 7]); ctx.lineDashOffset = -(now / 45) % 12;
    } else {
      ctx.strokeStyle = 'rgba(96,108,140,0.14)'; ctx.lineWidth = 1; ctx.setLineDash([3, 5]); ctx.lineDashOffset = 0;
    }
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(cxp, cyp, b.x, b.y); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.lineDashOffset = 0;

  // ── Signals: glowing head + fading motion trail ──────────────────────────
  graphSignals = graphSignals.filter(s => now - s.spawnedAt < 3500);
  for (const s of graphSignals) {
    const from = graphNodes.find(n => n.id === s.fromId), to = graphNodes.find(n => n.id === s.toId);
    if (!from || !to) continue;
    s.progress = Math.min(1, (now - s.spawnedAt) / 2400);
    const t = s.progress;
    const ease = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;
    // Trail: several fading dots behind the head.
    for (let k = 0; k < 5; k++) {
      const tt = Math.max(0, ease - k * 0.045);
      const x = from.x + (to.x - from.x) * tt, y = from.y + (to.y - from.y) * tt;
      const alpha = (1 - k / 5) * (1 - Math.abs(t - 0.5)) * 0.9;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(x, y, 3.2 - k * 0.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const hx = from.x + (to.x - from.x) * ease, hy = from.y + (to.y - from.y) * ease;
    const tail = ctx.createRadialGradient(hx, hy, 0, hx, hy, 20);
    tail.addColorStop(0, s.color); tail.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = tail; ctx.beginPath(); ctx.arc(hx, hy, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, hy, 2.2, 0, Math.PI * 2); ctx.fill();
  }

  // ── Nodes: layered glow, ring, core, label chip ──────────────────────────
  for (const n of graphNodes) {
    const isBrain = n.type === 'brain';
    const pulse = isBrain ? Math.sin(graphFrame / 15) * 4 : Math.sin((graphFrame + (n.x|0)) / 22) * 1.5;
    const r = n.r + pulse;
    const halo = ctx.createRadialGradient(n.x, n.y, r * 0.4, n.x, n.y, r * 2.8);
    halo.addColorStop(0, n.color + '77'); halo.addColorStop(0.6, n.color + '1a'); halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(n.x, n.y, r * 2.8, 0, Math.PI * 2); ctx.fill();
    // Rotating accent ring on the brain hub.
    if (isBrain) {
      ctx.save(); ctx.translate(n.x, n.y); ctx.rotate((now / 1600) % (Math.PI * 2));
      ctx.strokeStyle = n.color + '88'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 9]);
      ctx.beginPath(); ctx.arc(0, 0, r + 10, 0, Math.PI * 2); ctx.stroke();
      ctx.restore(); ctx.setLineDash([]);
    }
    const fill = ctx.createRadialGradient(n.x - r*0.3, n.y - r*0.3, r*0.2, n.x, n.y, r);
    fill.addColorStop(0, isBrain ? '#1b2142' : '#121a30'); fill.addColorStop(1, isBrain ? '#0a0e1f' : '#080c16');
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = n.color; ctx.lineWidth = isBrain ? 2.5 : 1.8; ctx.stroke();
    ctx.fillStyle = n.color; ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(2, r * 0.34), 0, Math.PI * 2); ctx.fill();
    // Label
    ctx.fillStyle = n.color;
    ctx.font = isBrain ? '800 13px Inter, sans-serif' : '600 11px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(n.label, n.x, isBrain ? n.y : n.y + r + 13);
  }
  graphFrame++;
  graphTimer = requestAnimationFrame(graphLoop);
}

// ──── Memory Constellation (Intelligence hub) ──────────────────────────
let constNodes = [], constEdges = [], constStats = null, constIdMap = new Map();
let constView = { zoom: 1, panX: 0, panY: 0 };
let constSim = { running: false, alpha: 1, raf: null };
let constFilter = '', constFocus = null, constHover = null;
let constDragNode = null, constPanning = false, constLoaded = false, constMoved = false;
let constLast = { x: 0, y: 0 };
let constLiveTimer = null;
const NODE_COLORS = { memory: '#18ffff', project: '#10e68c', agent: '#ffb53f', tag: '#a855f7' };

async function refreshIntelligence() {
  bindConstellation();
  refreshIntelAnalytics();
  if (!constLoaded) { await loadConstellation(); }
  else { sizeConstCanvas(); startConstSim(); }
}

async function loadConstellation() {
  const snap = await api('/api/v6/memory-graph?limit=400&maxNodes=180');
  applyConstellation(snap);
  constLoaded = true;
}

function applyConstellation(snap) {
  const cv = document.getElementById('const-canvas');
  const empty = document.getElementById('const-empty');
  constNodes = []; constEdges = []; constIdMap = new Map();
  const nodes = (snap && snap.nodes) || [];
  constStats = (snap && snap.stats) || null;
  if (empty) empty.classList.toggle('show', nodes.length === 0);
  const badge = document.getElementById('badge-intelligence');
  if (badge) badge.textContent = constStats ? constStats.memories : 0;
  if (!nodes.length) { drawConstellation(); return; }
  sizeConstCanvas();
  const W = cv ? cv.width : 800, H = cv ? cv.height : 600, cx = W / 2, cy = H / 2;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const ang = (i / nodes.length) * Math.PI * 2;
    const rad = 60 + Math.random() * Math.min(W, H) * 0.32;
    constNodes.push({
      id: n.id, label: n.label || '', type: n.type, score: n.score || 0,
      size: n.size || 9, degree: n.degree || 0, meta: n.meta || {},
      x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad, vx: 0, vy: 0,
    });
  }
  for (const node of constNodes) constIdMap.set(node.id, node);
  for (const e of (snap.edges || [])) {
    const sn = constIdMap.get(e.source), tn = constIdMap.get(e.target);
    if (sn && tn) constEdges.push({ sn: sn, tn: tn, w: e.weight || 1, type: e.type });
  }
  const meta = document.getElementById('const-meta');
  if (meta && constStats) meta.textContent = constStats.memories + ' mem · ' + constStats.projects + ' proj · ' + constStats.agents + ' agent · ' + constStats.tags + ' tag · ' + constStats.edges + ' links' + (constStats.droppedNodes ? ' (+' + constStats.droppedNodes + ' hidden)' : '');
  updateConstHero();
  constView = { zoom: 1, panX: 0, panY: 0 };
  constSim.alpha = 1;
  startConstSim();
}

function sizeConstCanvas() {
  const cv = document.getElementById('const-canvas'), wrap = document.getElementById('const-wrap');
  if (!cv || !wrap) return;
  cv.width = wrap.clientWidth || 800;
  cv.height = wrap.clientHeight || 600;
}

function startConstSim() {
  if (constSim.running || !constNodes.length) return;
  constSim.running = true;
  constSim.alpha = Math.max(constSim.alpha, 0.5);
  constLoop();
}

function constLoop() {
  const sec = document.getElementById('tab-intelligence');
  if (!sec || !sec.classList.contains('active')) { constSim.running = false; constSim.raf = null; return; }
  stepConstPhysics();
  drawConstellation();
  constSim.raf = requestAnimationFrame(constLoop);
}

function stepConstPhysics() {
  const cv = document.getElementById('const-canvas'); if (!cv) return;
  const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
  const a = constSim.alpha;
  const N = constNodes.length;
  if (a > 0.01) {
    for (let i = 0; i < N; i++) {
      const ni = constNodes[i];
      for (let j = i + 1; j < N; j++) {
        const nj = constNodes[j];
        let dx = ni.x - nj.x, dy = ni.y - nj.y;
        let d2 = dx * dx + dy * dy; if (d2 < 1) d2 = 1;
        const d = Math.sqrt(d2);
        let rep = (3600 * a) / d2;
        // Hard separation: keep node circles from visually overlapping.
        const minD = ni.size + nj.size + 12;
        if (d < minD) rep += (minD - d) * 0.28 * a;
        const ux = dx / d, uy = dy / d;
        ni.vx += ux * rep; ni.vy += uy * rep;
        nj.vx -= ux * rep; nj.vy -= uy * rep;
      }
    }
    for (const e of constEdges) {
      let dx = e.tn.x - e.sn.x, dy = e.tn.y - e.sn.y;
      let d = Math.sqrt(dx * dx + dy * dy) || 1;
      const ideal = 94;
      const f = ((d - ideal) * 0.015 * a) * Math.min(2, e.w);
      const ux = dx / d, uy = dy / d;
      e.sn.vx += ux * f; e.sn.vy += uy * f;
      e.tn.vx -= ux * f; e.tn.vy -= uy * f;
    }
    for (const n of constNodes) {
      if (n === constDragNode) continue;
      n.vx += (cx - n.x) * 0.010 * a;
      n.vy += (cy - n.y) * 0.010 * a;
      n.vx *= 0.86; n.vy *= 0.86;
      const sp = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (sp > 20) { n.vx = n.vx / sp * 20; n.vy = n.vy / sp * 20; }
      n.x += n.vx; n.y += n.vy;
    }
    constSim.alpha *= 0.99;
    if (constSim.alpha < 0.01) constSim.alpha = 0.01;
  }
}

function constNodeOpacity(n) {
  if (constFilter && n.type !== constFilter) return 0.12;
  if (constFocus) {
    if (n.id === constFocus) return 1;
    const f = constIdMap.get(constFocus);
    if (f && f._neighbors && f._neighbors.has(n.id)) return 0.95;
    return 0.14;
  }
  return 1;
}

function drawConstellation() {
  const cv = document.getElementById('const-canvas'); if (!cv || !cv.getContext) return;
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.translate(constView.panX, constView.panY);
  ctx.scale(constView.zoom, constView.zoom);

  for (const e of constEdges) {
    const oa = Math.min(constNodeOpacity(e.sn), constNodeOpacity(e.tn));
    const lit = constFocus && (e.sn.id === constFocus || e.tn.id === constFocus);
    ctx.strokeStyle = lit ? 'rgba(24,255,255,' + (0.55 * oa) + ')' : 'rgba(120,140,180,' + (0.16 * oa) + ')';
    ctx.lineWidth = lit ? 1.6 : 0.7;
    ctx.beginPath(); ctx.moveTo(e.sn.x, e.sn.y); ctx.lineTo(e.tn.x, e.tn.y); ctx.stroke();
  }
  for (const n of constNodes) {
    const op = constNodeOpacity(n);
    const col = NODE_COLORS[n.type] || '#9aa7c0';
    const r = n.size;
    const halo = ctx.createRadialGradient(n.x, n.y, r * 0.4, n.x, n.y, r * 2.4);
    halo.addColorStop(0, col + Math.round(op * 90).toString(16).padStart(2, '0'));
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(n.x, n.y, r * 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = op;
    ctx.fillStyle = '#0b1020'; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = (n.id === constFocus || n.id === constHover) ? 3 : 1.6;
    ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(2, r * 0.42), 0, Math.PI * 2); ctx.fill();
    const showLabel = r > 15 || n.id === constHover || n.id === constFocus || n.type !== 'memory';
    if (showLabel && op > 0.4) {
      ctx.globalAlpha = op;
      ctx.fillStyle = document.documentElement.dataset.theme === 'light' ? '#1a2030' : '#e8ecf4';
      ctx.font = (n.id === constFocus ? 'bold ' : '') + Math.max(10, Math.min(14, 9 + r * 0.18)) + 'px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lbl = n.label.length > 26 ? n.label.slice(0, 25) + '…' : n.label;
      ctx.fillText(lbl, n.x, n.y + r + 9);
    }
    ctx.globalAlpha = 1;
  }
}

function constMouseWorld(e) {
  const cv = document.getElementById('const-canvas'); const rect = cv.getBoundingClientRect();
  const sx = (e.clientX - rect.left) * (cv.width / rect.width);
  const sy = (e.clientY - rect.top) * (cv.height / rect.height);
  return { sx: sx, sy: sy, wx: (sx - constView.panX) / constView.zoom, wy: (sy - constView.panY) / constView.zoom };
}
function constHitTest(wx, wy) {
  for (let i = constNodes.length - 1; i >= 0; i--) {
    const n = constNodes[i];
    const dx = wx - n.x, dy = wy - n.y;
    if (dx * dx + dy * dy <= (n.size + 4) * (n.size + 4)) return n;
  }
  return null;
}
function computeNeighbors(id) {
  const n = constIdMap.get(id); if (!n) return;
  if (n._neighbors) return;
  const set = new Set();
  for (const e of constEdges) { if (e.sn.id === id) set.add(e.tn.id); if (e.tn.id === id) set.add(e.sn.id); }
  n._neighbors = set;
}
function openConstDrawer(n) {
  const drawer = document.getElementById('const-drawer'), body = document.getElementById('const-drawer-body');
  if (!drawer || !body) return;
  const m = n.meta || {};
  let h = '<div class="cd-type" style="color:' + (NODE_COLORS[n.type] || '#9aa7c0') + '">' + n.type + '</div>';
  h += '<div class="cd-title">' + htmlEscape(n.label) + '</div>';
  h += '<div class="row"><span class="k">Importance</span><span class="v">' + (n.score * 100).toFixed(0) + '/100</span></div>';
  h += '<div class="row"><span class="k">Connections</span><span class="v">' + n.degree + '</span></div>';
  if (n.type === 'memory') {
    if (m.category) h += '<div class="row"><span class="k">Category</span><span class="v">' + htmlEscape(String(m.category)) + '</span></div>';
    if (m.agentTool) h += '<div class="row"><span class="k">Agent</span><span class="v">' + htmlEscape(String(m.agentTool)) + '</span></div>';
    if (m.projectName) h += '<div class="row"><span class="k">Project</span><span class="v">' + htmlEscape(String(m.projectName)) + '</span></div>';
    if (m.content) h += '<div class="cd-section"><div class="cd-label">Content</div><div class="cd-content">' + htmlEscape(String(m.content)) + '</div></div>';
    const tags = Array.isArray(m.tags) ? m.tags : [];
    if (tags.length) h += '<div class="cd-section"><div class="cd-label">Tags</div><div class="tag-cloud">' + tags.map(function (t) { return '<span class="tc">#' + htmlEscape(String(t)) + '</span>'; }).join('') + '</div></div>';
    const src = Array.isArray(m.sources) ? m.sources : [];
    if (src.length) h += '<div class="cd-section"><div class="cd-label">Sources</div><div class="cd-content mono">' + src.map(function (s) { return htmlEscape(String(s)); }).join('<br>') + '</div></div>';
  } else {
    h += '<div class="cd-section"><div class="cd-content">This ' + n.type + ' node links ' + n.degree + ' memories in the constellation. Click connected nodes to explore.</div></div>';
  }
  body.innerHTML = h;
  drawer.classList.add('open');
}
function closeConstDrawer() {
  const drawer = document.getElementById('const-drawer'); if (drawer) drawer.classList.remove('open');
  constFocus = null;
}

function bindConstellation() {
  const wrap = document.getElementById('const-wrap'); if (!wrap || wrap._bound) return;
  wrap._bound = true;
  const cv = document.getElementById('const-canvas');
  wrap.addEventListener('wheel', function (e) {
    e.preventDefault();
    const p = constMouseWorld(e);
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const nz = Math.max(0.25, Math.min(4, constView.zoom * factor));
    constView.panX = p.sx - p.wx * nz;
    constView.panY = p.sy - p.wy * nz;
    constView.zoom = nz;
    if (!constSim.running) drawConstellation();
  }, { passive: false });
  wrap.addEventListener('mousedown', function (e) {
    const p = constMouseWorld(e); const hit = constHitTest(p.wx, p.wy);
    constMoved = false; constLast = { x: e.clientX, y: e.clientY };
    if (hit) { constDragNode = hit; constSim.alpha = Math.max(constSim.alpha, 0.4); startConstSim(); }
    else { constPanning = true; wrap.classList.add('dragging'); }
  });
  window.addEventListener('mousemove', function (e) {
    if (constDragNode) {
      const p = constMouseWorld(e); constDragNode.x = p.wx; constDragNode.y = p.wy; constDragNode.vx = 0; constDragNode.vy = 0; constMoved = true;
      return;
    }
    if (constPanning) {
      constView.panX += e.clientX - constLast.x; constView.panY += e.clientY - constLast.y;
      constLast = { x: e.clientX, y: e.clientY }; constMoved = true;
      if (!constSim.running) drawConstellation();
      return;
    }
    const sec = document.getElementById('tab-intelligence');
    if (!sec || !sec.classList.contains('active')) return;
    const p = constMouseWorld(e); const hit = constHitTest(p.wx, p.wy);
    const tip = document.getElementById('const-tip');
    constHover = hit ? hit.id : null;
    if (hit && tip) {
      tip.innerHTML = '<b style="color:' + (NODE_COLORS[hit.type] || '#fff') + '">' + htmlEscape(hit.label) + '</b><br>' + hit.type + ' · ' + (hit.score * 100).toFixed(0) + '/100 · ' + hit.degree + ' links';
      const rect = cv.getBoundingClientRect();
      tip.style.left = (e.clientX - rect.left) + 'px'; tip.style.top = (e.clientY - rect.top) + 'px';
      tip.classList.add('show');
    } else if (tip) tip.classList.remove('show');
  });
  window.addEventListener('mouseup', function (e) {
    if (constDragNode && !constMoved) { constFocus = constDragNode.id; computeNeighbors(constFocus); openConstDrawer(constDragNode); }
    else if (constPanning && !constMoved) {
      const p = constMouseWorld(e); const hit = constHitTest(p.wx, p.wy);
      if (!hit) { constFocus = null; closeConstDrawer(); }
    }
    constDragNode = null; constPanning = false; wrap.classList.remove('dragging');
  });
}
function setConstFilter(btn, type) {
  constFilter = type;
  const chips = document.querySelectorAll('#const-chips .chip');
  chips.forEach(function (c) { c.classList.toggle('active', c === btn); });
  if (!constSim.running) drawConstellation();
}
function highlightConstSearch() {
  const q = (document.getElementById('const-search').value || '').toLowerCase().trim();
  if (!q) { constFocus = null; if (!constSim.running) drawConstellation(); return; }
  const hit = constNodes.find(function (n) { return n.label.toLowerCase().includes(q); });
  if (hit) { constFocus = hit.id; computeNeighbors(hit.id); openConstDrawer(hit); }
  if (!constSim.running) drawConstellation();
}
function rebuildConstellation() { constLoaded = false; toast('Rebuilding', 'Recomputing the memory constellation…', 'info'); loadConstellation(); }
function resetConstellationView() { constView = { zoom: 1, panX: 0, panY: 0 }; constFocus = null; closeConstDrawer(); constSim.alpha = 0.6; startConstSim(); }
function constLiveBump() {
  if (!constLoaded) return;
  constSim.alpha = Math.max(constSim.alpha, 0.5); startConstSim();
  if (constLiveTimer) clearTimeout(constLiveTimer);
  constLiveTimer = setTimeout(function () { constLoaded = false; loadConstellation(); }, 4000);
}

// ──── Intelligence analytics strip ─────────────────────────────────────
async function refreshIntelAnalytics() {
  const d = await api('/api/v6/memory-intelligence');
  if (!d) return;
  animateNum('intel-total', d.totalEntries || 0);
  const cov = Math.round((d.sourceCoverage || 0) * 100);
  const covEl = document.getElementById('intel-coverage'); if (covEl) covEl.textContent = cov + '%';
  const covM = document.getElementById('intel-coverage-meter'); if (covM) covM.style.width = cov + '%';
  animateNum('intel-recent', d.recent24h || 0);
  animateNum('intel-highimp', d.highImportance || 0);
  drawIntelAgents(d.byAgent || []);
  drawIntelCats(d.byCategory || []);
  renderTagCloud(d.topTags || []);
  renderIntelRecent(d.recent || []);
}
function drawIntelAgents(rows) {
  const cv = document.getElementById('chart-intel-agents'); if (!cv || !window.Chart) return;
  const t = chartTheme(); const top = rows.slice(0, 6);
  if (charts.intelAgents) charts.intelAgents.destroy();
  charts.intelAgents = new Chart(cv, { type: 'bar', data: { labels: top.map(function (r) { return r.name; }), datasets: [{ data: top.map(function (r) { return r.count; }), backgroundColor: '#18ffff', borderRadius: 5 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: t.grid }, ticks: { color: t.text } }, y: { grid: { display: false }, ticks: { color: t.text } } } } });
}
function drawIntelCats(rows) {
  const cv = document.getElementById('chart-intel-cats'); if (!cv || !window.Chart) return;
  const t = chartTheme(); const top = rows.slice(0, 6);
  if (charts.intelCats) charts.intelCats.destroy();
  charts.intelCats = new Chart(cv, { type: 'doughnut', data: { labels: top.map(function (r) { return r.name; }), datasets: [{ data: top.map(function (r) { return r.count; }), backgroundColor: ['#18ffff', '#a855f7', '#ec4899', '#10e68c', '#ffb53f', '#4fb6ff'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: t.text, boxWidth: 12 } } } } });
}
function renderTagCloud(rows) {
  const el = document.getElementById('intel-tags'); if (!el) return;
  el.innerHTML = rows.length ? rows.slice(0, 18).map(function (r) { return '<span class="tc">#' + htmlEscape(r.name) + ' <b>' + r.count + '</b></span>'; }).join('') : '<div class="empty-tight">No tags yet.</div>';
}
function renderIntelRecent(rows) {
  const el = document.getElementById('intel-recent-list'); if (!el) return;
  el.innerHTML = rows.length ? rows.slice(0, 10).map(function (e) { return '<div class="memory-item"><div class="meta"><span class="pill purple">' + htmlEscape(e.agentTool || 'agent') + '</span><span>' + htmlEscape(e.category || '') + '</span></div><div class="content">' + htmlEscape(String(e.content || '').slice(0, 160)) + '</div></div>'; }).join('') : '<div class="empty-tight">No memories yet.</div>';
}

// ──── Overview constellation hero ──────────────────────────────────────
function updateConstHero() {
  if (!constStats) return;
  const nodes = constStats.memories + constStats.projects + constStats.agents + constStats.tags;
  const n = document.getElementById('hero-const-nodes'); if (n) n.textContent = nodes;
  const e = document.getElementById('hero-const-edges'); if (e) e.textContent = constStats.edges;
  const m = document.getElementById('hero-const-mem'); if (m) m.textContent = constStats.memories;
}
async function loadConstHeroStats() {
  if (constStats) { updateConstHero(); return; }
  const snap = await api('/api/v6/memory-graph?limit=400&maxNodes=180');
  if (snap && snap.stats) { constStats = snap.stats; updateConstHero(); }
}

// ──── Command Palette ──────────────────────────────────────────────────
const commands = [
  ...FEATURES.map(([id, name, desc]) => ({ type: 'nav', label: name, target: id, hint: desc || 'Go to' })),
  { type: 'action', label: 'Run Reflections now', fn: 'runDream' },
  { type: 'action', label: 'Clean up memory now', fn: 'runForget' },
  { type: 'action', label: 'Toggle dark / light theme', fn: 'toggleTheme' },
  { type: 'action', label: 'Connect all tools', fn: 'attachAll' },
  { type: 'action', label: 'Refresh everything', fn: 'refresh' },
];
let cmdSelected = 0;
function openCmdPalette() {
  document.getElementById('cmd-overlay').classList.add('open');
  const input = document.getElementById('cmd-input');
  input.value = ''; cmdSelected = 0;
  renderCmdResults(commands);
  setTimeout(() => input.focus(), 50);
}
function closeCmdPalette() { document.getElementById('cmd-overlay').classList.remove('open'); }
function renderCmdResults(items) {
  document.getElementById('cmd-results').innerHTML = items.map((c, i) => \`<div class="cmd-result \${i === cmdSelected ? 'selected' : ''}" onclick="runCmd(\${i})" data-idx="\${i}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\${c.type === 'nav' ? '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>' : '<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>'}</svg><div class="meta">\${c.label}</div><span class="hint">\${c.hint || c.type}</span></div>\`).join('');
}
function runCmd(i) {
  const filtered = filterCmds(document.getElementById('cmd-input').value);
  const c = filtered[i];
  if (!c) return;
  closeCmdPalette();
  if (c.type === 'nav') switchTab(c.target, '');
  else if (c.type === 'action' && typeof window[c.fn] === 'function') window[c.fn]();
}
function filterCmds(q) {
  if (!q) return commands;
  const l = q.toLowerCase();
  return commands.filter(c => c.label.toLowerCase().includes(l));
}
document.getElementById('cmd-input').addEventListener('input', e => { cmdSelected = 0; renderCmdResults(filterCmds(e.target.value)); });
document.getElementById('cmd-input').addEventListener('keydown', e => {
  const filtered = filterCmds(e.target.value);
  if (e.key === 'ArrowDown') { e.preventDefault(); cmdSelected = Math.min(cmdSelected + 1, filtered.length - 1); renderCmdResults(filtered); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); cmdSelected = Math.max(cmdSelected - 1, 0); renderCmdResults(filtered); }
  else if (e.key === 'Enter') { e.preventDefault(); runCmd(cmdSelected); }
  else if (e.key === 'Escape') closeCmdPalette();
});
document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openCmdPalette(); } });

// ──── Live log / ticker ────────────────────────────────────────────────
const logEntries = [];
function appendLog(source, type, detail) {
  logEntries.unshift({ t: new Date(), source, type, detail: String(detail || '').slice(0, 320) });
  if (logEntries.length > 200) logEntries.length = 200;
  renderTicker(); renderLogPanel(); morphBrainState(type);
}
function renderTicker() {
  const el = document.getElementById('log-scroll');
  if (!el) return;
  const recent = logEntries.slice(0, 6).map(e => \`\${e.t.toLocaleTimeString()} · \${e.source}/\${e.type} · \${e.detail.slice(0, 60)}\`).join('  ||  ');
  el.textContent = recent || 'Awaiting activity…';
}
function renderLogPanel() {
  const panel = document.getElementById('log-panel-list');
  if (!panel) return;
  panel.innerHTML = logEntries.slice(0, 80).map(e => \`<div class="log-row"><span class="t">\${htmlEscape(e.t.toLocaleTimeString())}</span><span class="src">\${htmlEscape(e.source)}</span><span class="type">\${htmlEscape(e.type)}</span><span>\${htmlEscape(e.detail)}</span></div>\`).join('');
}
function toggleLogPanel() { document.getElementById('log-panel').classList.toggle('open'); if (document.getElementById('log-panel').classList.contains('open')) renderLogPanel(); }
function clearLogs() { logEntries.length = 0; renderTicker(); renderLogPanel(); }
const BRAIN_STATES = { 'memory-write':'learning · writing memory','subagent-spawn':'sub-agent dispatched','dream':'dreaming · reflecting','revisit':'revisiting recent','counterfactual':'running counterfactual','consolidation':'consolidating','contradiction':'resolving conflict','quarantine':'isolating suspect','collision':'arbitrating collision','firewall-block':'blocking risky action' };
let stateTimer = null;
function morphBrainState(type) {
  const el = document.getElementById('brain-state');
  el.textContent = BRAIN_STATES[type] || 'learning · reflecting · charging';
  if (stateTimer) clearTimeout(stateTimer);
  stateTimer = setTimeout(() => { el.textContent = 'learning · reflecting · charging'; }, 6000);
}
async function pullRecentActivity() {
  // Reconciliation safety net: pick up anything the WebSocket missed
  // (e.g. a dropped frame). ingestActivity dedups, so live events that
  // already arrived over the socket are ignored here.
  const log = await api('/api/v6/activity-log?limit=60');
  if (!Array.isArray(log)) return;
  for (let i = log.length - 1; i >= 0; i--) ingestActivity(log[i], false);
  renderSparkline(); renderLivePulse();
  if (document.getElementById('tab-activity')?.classList.contains('active')) renderActivityTable();
}

// ──── WebSocket ────────────────────────────────────────────────────────
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(\`\${proto}://\${location.host}\`);
  ws.onopen = () => { appendLog('ws','connected','dashboard WebSocket online'); setConn(true); toast('Connected', 'live updates enabled', 'success'); };
  ws.onmessage = e => { try { const m = JSON.parse(e.data);
    if (m.type === 'activity' && m.event) {
      if (ingestActivity(m.event, true)) {
        renderSparkline(); renderLivePulse();
        if (document.getElementById('tab-activity')?.classList.contains('active')) renderActivityTable();
        if (m.event.type === 'memory-write' && document.getElementById('tab-intelligence')?.classList.contains('active')) constLiveBump();
      }
      return;
    }
    if (m.type === 'activity-backlog' && Array.isArray(m.events)) {
      for (let i = m.events.length - 1; i >= 0; i--) ingestActivity(m.events[i], false);
      renderSparkline(); renderLivePulse();
      if (document.getElementById('tab-activity')?.classList.contains('active')) renderActivityTable();
      return;
    }
    if (m.type === 'insights' || m.type === 'modules') refresh();
    if (m.type === 'insights' && m.insights) for (const ins of m.insights.slice(0,5)) appendLog(ins.sourceAgent || 'brain','insight',ins.title || ins.content);
    if (m.type === 'injection') appendLog(m.adapter || 'agent','injection', m.insightTitle || 'context injected');
    if (m.type === 'info') appendLog('brain','info', m.message);
    if (m.type === 'error') { appendLog('brain','error', m.error); toast('Brain error', m.error, 'error'); }
    if (m.type === 'agents-detected') appendLog('brain','agents', (m.agents || []).join(', '));
  } catch {} };
  ws.onclose = () => { appendLog('ws','disconnected','reconnecting'); setConn(false); setTimeout(connectWS, 2000); };
  ws.onerror = () => { setConn(false); };
}

// ──── Bootstrapping ────────────────────────────────────────────────────
connectWS();
refresh();
pullRecentActivity();
setInterval(refresh, 5000);            // dashboard cards heartbeat
setInterval(pullRecentActivity, 15000); // reconciliation only — live events arrive via WebSocket
setInterval(renderSparkline, 10000);    // keep the events/min window current
if (window.lucide) try { window.lucide.createIcons(); } catch {}

// Welcome toast
setTimeout(() => toast('Welcome to Shadow Brain', 'Showing the essentials. Flip to Advanced (top-left) for every feature, or press ⌘K to search.', 'info'), 800);
</script>
</body>
</html>`;
