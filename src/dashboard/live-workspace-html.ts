// Local, read-only operations console for the Shadow Brain event journal.
export const LIVE_WORKSPACE_HTML = String.raw`<!doctype html>
<html lang="en" data-motion="system">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Live operations · Agent Shadow Brain</title>
<script>
  try {
    if (localStorage.getItem('shadow-brain:workspace:motion') === 'reduce') document.documentElement.dataset.motion = 'reduce';
  } catch {}
</script>
<style>
  :root {
    color-scheme: dark;
    --canvas: #101923; --header: #131e2a; --surface: #162230; --inset: #111d29; --hover: #213345;
    --line: #314153; --ink: #edf5fb; --muted: #aabed1; --control: #738ba1; --focus: #9bdff3;
    --cyan: #86dbe3; --cyan-ink: #102f38; --cyan-tint: #1d3b46;
    --amber: #f5ce91; --amber-tint: #3a3027; --rose: #ffacba; --rose-tint: #432936;
    --node: #203b4c; --graph-line: #567589; --grid: #2c4153;
    --ease: 190ms cubic-bezier(.2,.75,.25,1); --radius: 9px;
    font: 15px/1.5 Inter, "Segoe UI", system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body { margin: 0; background: var(--canvas); color: var(--ink); }
  h1,h2,h3,p,ul,dl,dd { margin: 0; }
  h1,h2,h3 { line-height: 1.22; text-wrap: balance; overflow-wrap: anywhere; }
  h1 { font-size: 2rem; letter-spacing: -.035em; font-weight: 710; }
  h2 { font-size: 1.1rem; font-weight: 680; letter-spacing: -.013em; }
  h3 { font-size: .94rem; font-weight: 650; }
  p { overflow-wrap: anywhere; max-width: 69ch; }
  a { color: var(--cyan); text-decoration: none; }
  a:hover { text-decoration: underline; }
  :is(button,a,select,summary,[tabindex]):focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
  .muted { color: var(--muted); }
  .small { font-size: .86rem; }
  .mono { font: .82rem/1.45 "Cascadia Code", Consolas, monospace; overflow-wrap: anywhere; }
  .icon { width: 18px; height: 18px; flex: none; vertical-align: middle; }
  .icon.compact { width: 15px; height: 15px; }
  .skip { position: fixed; top: 7px; left: 8px; z-index: 3; transform: translateY(-150%); }
  .skip:focus { transform: none; }
  .topbar { background: var(--header); border-bottom: 1px solid var(--line); }
  .top-inner { max-width: 1560px; margin: 0 auto; min-height: 59px; padding: 9px 27px; display: flex; align-items: center; gap: 22px; }
  .brand { display: inline-flex; align-items: center; gap: 9px; color: var(--ink); font-weight: 690; white-space: nowrap; }
  .brand:hover { text-decoration: none; }
  .brand-mark { display: grid; place-items: center; width: 34px; height: 34px; background: var(--cyan-tint); color: var(--cyan); border-radius: 7px; }
  .main-nav { display: flex; align-items: center; gap: 7px; }
  .main-nav a { display: inline-flex; min-height: 34px; align-items: center; padding: 5px 9px; border-radius: 5px; color: var(--muted); font-size: .88rem; }
  .main-nav a[aria-current="page"] { color: var(--cyan); background: var(--cyan-tint); font-weight: 650; }
  .top-state { display: flex; align-items: center; gap: 10px; margin-left: auto; }
  .tag { display: inline-flex; align-items: center; gap: 6px; font-size: .77rem; font-weight: 620; line-height: 1.25; padding: 4px 7px; border-radius: 5px; background: var(--hover); color: var(--muted); max-width: 100%; overflow-wrap: anywhere; }
  .tag.ok { background: var(--cyan-tint); color: var(--cyan); }
  .tag.warn { background: var(--amber-tint); color: var(--amber); }
  .tag.bad { background: var(--rose-tint); color: var(--rose); }
  .dot { display: inline-block; width: 7px; height: 7px; background: currentColor; border-radius: 50%; flex: none; }
  main { max-width: 1560px; padding: 26px 27px 44px; margin: 0 auto; min-width: 0; }
  .head { display: flex; justify-content: space-between; align-items: start; gap: 15px; margin-bottom: 17px; }
  .head p { margin-top: 6px; }
  .controls { display: flex; flex-wrap: wrap; justify-content: end; gap: 7px; align-items: end; }
  .button,select {
    color: var(--ink); background: var(--surface); border: 1px solid var(--control); border-radius: 6px;
    min-height: 36px; padding: 6px 10px; font: inherit; font-size: .85rem; font-weight: 650; transition: background var(--ease), border-color var(--ease);
  }
  .button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; line-height: 1.2; }
  .button:hover, select:hover { background: var(--hover); text-decoration: none; }
  .button:disabled { opacity: .56; cursor: default; }
  .button.primary { border-color: var(--cyan); color: var(--cyan-ink); background: var(--cyan); }
  .button.primary:hover { background: #b3ebee; }
  .button.quiet { background: transparent; border-color: transparent; color: var(--cyan); }
  .button.quiet:hover, .button[aria-pressed="true"] { background: var(--cyan-tint); }
  .label { display: grid; gap: 3px; min-width: 0; font-size: .79rem; color: var(--muted); font-weight: 630; }
  .notice { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; padding: 9px 12px; min-height: 40px; border-radius: 6px; border: 1px solid var(--line); background: var(--inset); color: var(--muted); font-size: .84rem; margin-bottom: 14px; }
  .notice.error { background: var(--rose-tint); border-color: transparent; color: var(--rose); }
  .stats { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); margin-bottom: 15px; }
  .stat { display: grid; gap: 4px; min-width: 0; padding: 13px 15px; }
  .stat + .stat { border-left: 1px solid var(--line); }
  .stat dt { color: var(--muted); font-size: .82rem; font-weight: 590; }
  .stat dd { font-size: 1.37rem; font-variant-numeric: tabular-nums; font-weight: 710; line-height: 1.15; overflow-wrap: anywhere; }
  .stat .danger { color: var(--rose); }
  .panel { border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); min-width: 0; overflow: hidden; }
  .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 55px; padding: 11px 14px; border-bottom: 1px solid var(--line); }
  .panel-head p { margin-top: 3px; }
  .panel-body { padding: 12px 14px; min-width: 0; }
  .blank { min-height: 112px; display: grid; align-content: start; gap: 6px; padding: 17px 14px; color: var(--muted); }
  .blank h3 { color: var(--ink); }
  .blank .icon { color: var(--cyan); margin-bottom: 3px; }
  .ops-grid { display: grid; grid-template-columns: minmax(190px,.72fr) minmax(0,2.55fr) minmax(233px,.95fr); gap: 14px; margin-bottom: 15px; align-items: stretch; }
  .list { list-style: none; padding: 0; }
  .list > li + li { border-top: 1px solid var(--line); }
  .session-list, .inspect-body { max-height: 445px; overflow: auto; }
  .session-row { width: 100%; border: 0; background: transparent; color: var(--ink); display: grid; grid-template-columns: 29px minmax(0,1fr); align-items: start; text-align: left; gap: 8px; padding: 11px 12px; font: inherit; cursor: pointer; }
  .session-row:hover, .session-row[aria-pressed="true"] { background: var(--hover); }
  .session-row[aria-pressed="true"] .session-glyph { background: var(--cyan-tint); color: var(--cyan); }
  .session-glyph { width: 29px; height: 29px; border-radius: 6px; background: var(--inset); color: var(--muted); display: grid; place-items: center; }
  .session-label { display: block; font-weight: 630; overflow-wrap: anywhere; }
  .session-detail { display: grid; gap: 4px; justify-items: start; min-width: 0; }
  .network-body { min-height: 405px; position: relative; display: grid; align-items: center; background: var(--inset); }
  #network-svg { display: block; width: 100%; height: 405px; }
  .topology-ring { fill: none; stroke: var(--graph-line); stroke-width: 1; stroke-opacity: .29; stroke-dasharray: 2 5; }
  .network-edge { fill: none; stroke: var(--graph-line); stroke-width: 1.2; opacity: .62; transition: opacity var(--ease), stroke var(--ease); }
  .network-edge.active { stroke: var(--cyan); stroke-width: 1.8; opacity: .9; }
  .network-edge.dimmed { opacity: .3; }
  .network-edge.reported { stroke: var(--amber); stroke-dasharray: 3 4; }
  .network-node { cursor: pointer; color: var(--muted); }
  .network-node .node-surface { fill: var(--node); stroke: var(--graph-line); stroke-width: 1.25; }
  .network-node .node-indicator { fill: currentColor; }
  .network-node.live { color: var(--cyan); }
  .network-node.reported { color: var(--amber); }
  .network-node.failed { color: var(--rose); }
  .network-node:is(:hover,:focus-visible,[aria-pressed="true"]) .node-surface { stroke: currentColor; stroke-width: 2.4; }
  .network-node:focus-visible { outline: none; }
  .network-node text, .network-core text { fill: var(--ink); font-size: 12px; font-weight: 650; pointer-events: none; }
  .network-node .node-subtitle, .network-core .node-subtitle { fill: var(--muted); font-size: 10px; font-weight: 550; }
  .network-core circle { fill: var(--cyan-tint); stroke: var(--cyan); stroke-width: 1.4; }
  .network-core .core-inner { fill: var(--surface); stroke: var(--graph-line); }
  .pulse { pointer-events: none; fill: var(--cyan); }
  .pulse.reported { fill: var(--amber); }
  .pulse.failed { fill: var(--rose); }
  .network-caption { padding: 8px 13px; border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 5px 12px; color: var(--muted); font-size: .78rem; }
  .network-caption span { display: inline-flex; align-items: center; gap: 5px; }
  .legend-line { width: 17px; border-top: 2px solid var(--cyan); }
  .legend-line.reported { border-color: var(--amber); border-top-style: dashed; }
  .inspect-body .panel-body { display: grid; gap: 10px; }
  .facts { display: grid; gap: 7px; }
  .facts div { display: flex; align-items: start; justify-content: space-between; gap: 8px; }
  .facts dt { color: var(--muted); font-size: .83rem; }
  .facts dd { text-align: right; font-size: .83rem; overflow-wrap: anywhere; }
  .stages { display: flex; flex-wrap: wrap; gap: 4px; }
  .stage { border: 1px solid var(--line); color: var(--muted); border-radius: 4px; padding: 4px 6px; font-size: .78rem; }
  .stage.seen { border-color: var(--amber); color: var(--amber); }
  .stage.current { background: var(--amber-tint); font-weight: 680; }
  .charts { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; margin-bottom: 15px; }
  .chart-svg { width: 100%; height: 150px; display: block; }
  .chart-grid { stroke: var(--line); stroke-width: 1; }
  .chart-label { fill: var(--muted); font-size: 11px; }
  .chart-bar { fill: var(--cyan); }
  .chart-error { fill: var(--rose); }
  .chart-duration { stroke: var(--amber); fill: none; stroke-width: 2; }
  .chart-point { fill: var(--amber); }
  .chart-data summary { cursor: pointer; color: var(--cyan); }
  .chart-data table { border-collapse: collapse; width: 100%; margin-top: 6px; font-size: .82rem; }
  .chart-data th,.chart-data td { text-align: left; padding: 4px 7px; border-bottom: 1px solid var(--line); }
  .events { max-height: 550px; overflow: auto; }
  .event-row { display: grid; grid-template-columns: 105px minmax(135px,.7fr) minmax(0,1.2fr) auto; gap: 9px; align-items: start; padding: 9px 14px; }
  .event-row.new { animation: arrive var(--ease) both; }
  .event-meta { overflow-wrap: anywhere; }
  .event-title { font-weight: 630; overflow-wrap: anywhere; }
  .event-link { border: 0; background: transparent; color: var(--ink); padding: 0; text-align: left; font: inherit; cursor: pointer; }
  .event-link:hover, .event-link[aria-pressed="true"] { color: var(--cyan); text-decoration: underline; }
  .event-row .tag { justify-self: end; }
  h1 { font-size: 2.25rem; }
  .stats { background: #172b38; }
  .stat { padding: 15px 16px; }
  .stat dd { font-size: 1.55rem; }
  .stat:first-child dd { color: var(--cyan); }
  .network-body { background: radial-gradient(ellipse at 50% 50%, #1c3c4b, #121f2d 64%); }
  .network-panel { border-color: #456679; }
  .topology-ring { stroke-opacity: .44; }
  .network-core .core-ring { fill: none; stroke: var(--cyan); stroke-width: 1; stroke-opacity: .36; stroke-dasharray: 2 5; }
  .network-edge.failed { stroke: var(--rose); }
  .network-edge.active.failed { stroke: var(--rose); }
  .network-edge.active.reported { stroke: var(--amber); }
  .network-node.selected-event .node-surface { stroke-width: 2.6; stroke: currentColor; }
  .session-row[aria-pressed="true"] { box-shadow: inset 0 0 0 1px #526e80; }
  .legend-line.failed { border-color: var(--rose); }
  .replay-bar { display: grid; grid-template-columns: auto minmax(150px,1fr) auto; align-items: end; gap: 11px; margin-bottom: 15px; padding: 12px 15px; background: #192d3b; }
  .replay-bar h2 { color: var(--cyan); margin-bottom: 4px; }
  .replay-bar .replay-caption { grid-column: 1 / -1; color: var(--muted); }
  .replay-scrub { display: grid; gap: 3px; min-width: 0; }
  .replay-scrub label { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 4px; color: var(--muted); }
  .replay-scrub input { width: 100%; min-height: 30px; margin: 0; accent-color: var(--cyan); }
  .replay-buttons { display: flex; flex-wrap: wrap; gap: 5px; }
  .replay-buttons .icon-button { width: 36px; padding: 0; }
  .demo-notice { display: none; }
  html[data-demo="true"] .demo-notice { display: flex; gap: 7px 10px; flex-wrap: wrap; padding: 8px 12px; margin-bottom: 14px; background: var(--amber-tint); color: var(--amber); border-radius: 7px; font-size: .83rem; }
  .project-journal-notice { display: none; }
  html[data-project-local="true"] .project-journal-notice { display: flex; gap: 4px 10px; flex-wrap: wrap; padding: 8px 12px; margin-bottom: 14px; background: var(--cyan-tint); color: var(--cyan); border-radius: 7px; font-size: .83rem; }
  .project-journal-notice a { text-decoration: underline; text-underline-offset: 3px; }
  .event-row[data-selected="true"] { background: var(--cyan-tint); }
  .event-row[data-selected="true"] .event-link { color: var(--cyan); }
  @keyframes arrive { from { background: var(--cyan-tint); opacity: .8; } to { background: transparent; opacity: 1; } }
  html[data-motion="reduce"] *, html[data-motion="reduce"] *::before, html[data-motion="reduce"] *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
  }
  @media (max-width: 1150px) {
    .ops-grid { grid-template-columns: minmax(175px,.7fr) minmax(0,2.3fr); }
    .inspect-panel { grid-column: 1 / -1; }
    .inspect-body { max-height: 300px; }
  }
  @media (max-width: 750px) {
    :root { font-size: 14px; }
    .top-inner,main { padding-left: 12px; padding-right: 12px; }
    .top-inner { gap: 9px; flex-wrap: wrap; }
    .main-nav { gap: 2px; }
    .top-version { display: none; }
    .head { flex-wrap: wrap; }
    h1 { font-size: 1.82rem; }
    .controls { justify-content: start; }
    .replay-bar { grid-template-columns: minmax(0,1fr); }
    .stats { grid-template-columns: repeat(2,minmax(0,1fr)); }
    .stat + .stat { border-left: 0; }
    .stat:nth-child(even) { border-left: 1px solid var(--line); }
    .stat:nth-child(n+3) { border-top: 1px solid var(--line); }
    .stat:last-child { grid-column: 1 / -1; }
    .ops-grid,.charts { grid-template-columns: minmax(0,1fr); }
    .network-panel { grid-row: 1; }
    .network-body { min-height: 280px; }
    #network-svg { height: 280px; }
    .session-list,.inspect-body { max-height: 320px; }
    .event-row { grid-template-columns: minmax(0,1fr) auto; }
    .event-row .event-meta { grid-column: 1; }
    .event-row .tag { grid-column: 2; grid-row: 1; }
    .event-row .event-title { grid-column: 1 / -1; }
  }
</style>
</head>
<body>
<a class="skip button" href="#live-main">Skip to content</a>
<header class="topbar">
  <div class="top-inner">
    <a class="brand" href="/" aria-label="Agent Shadow Brain workspace"><span class="brand-mark" data-icon="brand"></span><span>Agent Shadow Brain</span></a>
    <nav class="main-nav" aria-label="Navigation"><a href="/">Workspace</a><a href="/live" aria-current="page">Live</a></nav>
    <div class="top-state"><span class="small muted mono top-version">7.21.0</span><span id="demo-tag" class="tag warn" hidden>Synthetic demo</span><span id="stream-tag" class="tag"><span class="dot"></span><span id="stream-label">Connecting</span></span></div>
  </div>
</header>
<main id="live-main" tabindex="-1">
  <div class="demo-notice"><strong>Synthetic demo</strong><span>Scripted local MCP calls use sample data. Changes affect this temporary demo only.</span></div>
  <div class="project-journal-notice"><strong>Project journal</strong><span>Live activity comes from this project’s local store.</span><a href="/#project-kit">Open Project Kit</a></div>
  <div class="head">
    <div><h1>Live operations</h1><p class="muted small">Follow recorded agent sessions, tool calls, and reported task phases.</p></div>
    <div class="controls" aria-label="Live view controls">
      <label for="time-window" class="label">Window<select id="time-window"><option value="1">1 minute</option><option value="5">5 minutes</option><option value="15" selected>15 minutes</option><option value="60">1 hour</option></select></label>
      <button class="button" type="button" id="motion-control" aria-pressed="false"><span data-icon="motion"></span>Reduce motion</button>
      <button class="button" type="button" id="refresh"><span data-icon="refresh"></span>Refresh</button>
      <button class="button" type="button" id="replay-start" disabled><span data-icon="replay"></span>Replay loaded events</button>
      <button class="button primary" type="button" id="pause"><span data-icon="pause"></span><span id="pause-label">Pause stream</span></button>
    </div>
  </div>
  <div class="notice" id="stream-notice" role="status">Connecting to the local event journal…</div>
  <section class="panel replay-bar" id="replay-bar" aria-labelledby="replay-heading" hidden>
    <div><h2 id="replay-heading" tabindex="-1">Journal replay</h2><div class="replay-buttons" aria-label="Replay controls">
      <button class="button icon-button" type="button" id="replay-prev" aria-label="Previous event" title="Previous event"><span data-icon="prev"></span></button>
      <button class="button" type="button" id="replay-play">Play</button>
      <button class="button icon-button" type="button" id="replay-next" aria-label="Next event" title="Next event"><span data-icon="next"></span></button>
    </div></div>
    <div class="replay-scrub"><label for="replay-range"><span>Event position</span><output for="replay-range" class="small mono" id="replay-position" aria-live="off"></output></label>
      <input type="range" min="0" max="0" value="0" id="replay-range" aria-describedby="replay-caption"></div>
    <button class="button primary" type="button" id="replay-exit">Return to live</button>
    <p class="small replay-caption" id="replay-caption"></p>
  </section>
  <dl class="stats" id="live-stats" aria-label="Tool metrics in the selected window"></dl>
  <div class="ops-grid">
    <section class="panel">
      <div class="panel-head"><h2>Sessions</h2><span id="session-count" class="tag">0</span></div>
      <div id="sessions" class="session-list"></div>
    </section>
    <section class="panel network-panel">
      <div class="panel-head"><div><h2>Activity network</h2><p class="small muted" id="network-count">Recorded session activity</p></div><span id="network-status" class="tag"></span></div>
      <div class="network-body"><svg id="network-svg" viewBox="0 0 720 405" role="group" aria-label="Activity network. Use arrow keys to navigate sessions."></svg></div>
      <div class="network-caption"><span><i class="legend-line"></i>Measured activity</span><span><i class="legend-line reported"></i>Host-reported activity</span><span><i class="legend-line failed"></i>Error or cancellation</span></div>
    </section>
    <section class="panel inspect-panel">
      <div class="panel-head"><h2>Session details</h2></div><div id="inspection" class="inspect-body"></div>
    </section>
  </div>
  <div class="charts">
    <section class="panel"><div class="panel-head"><div><h2>Tool throughput</h2><p class="small muted">Recorded tool results per interval</p></div></div><div class="panel-body" id="throughput"></div></section>
    <section class="panel"><div class="panel-head"><div><h2>Tool duration</h2><p class="small muted">Median measured duration per interval</p></div></div><div class="panel-body" id="duration"></div></section>
  </div>
  <section class="panel">
    <div class="panel-head"><div><h2>Event timeline</h2><p class="small muted" id="timeline-scope">All sessions</p></div><div class="controls">
      <label class="label" for="event-filter">Event source<select id="event-filter"><option value="">All sources</option><option value="measured">Measured</option><option value="reported">Reported</option></select></label>
      <label class="label" for="transport-filter">Transport<select id="transport-filter"><option value="">All transports</option><option value="mcp">MCP</option><option value="cli">CLI</option><option value="host">Host</option></select></label>
      <button class="button quiet" type="button" id="clear-session" hidden>Show all sessions</button></div>
    </div><div id="events" class="events"></div>
  </section>
</main>
<script>
'use strict';
const $ = (id) => document.getElementById(id);
const glyphs = {
  brand: '<path d="M12 5 5 9v6l7 4 7-4V9l-7-4v7m-7-3 7 3 7-3m-7 3v7"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  motion: '<path d="M3 8h14M5 12h16M3 16h12"/><circle cx="19" cy="8" r="1.4"/><circle cx="17" cy="16" r="1.4"/>',
  refresh: '<path d="M19.5 9a8 8 0 1 0 .3 5.5M20 4v5h-5"/>',
  pause: '<path d="M9 5v14m6-14v14"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  replay: '<path d="M4 11a8 8 0 1 1 2 6M4 5v6h6m2-3v5l3 2"/>',
  prev: '<path d="M6 5v14m12-13-9 6 9 6z"/>',
  next: '<path d="M18 5v14M6 6l9 6-9 6z"/>',
  agent: '<rect x="4.5" y="7" width="15" height="12" rx="3"/><path d="M12 7V4m-8 9H2m20 0h-2m-11-.5h.02m5.98 0H15m-5 3h4"/>',
  activity: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  warning: '<path d="m12 3 10 17H2L12 3zm0 6v4m0 3h.01"/>'
};
const phases = { understand: 'Understand', plan: 'Plan', work: 'Work', verify: 'Verify' };
const transports = { mcp: 'MCP', cli: 'CLI', host: 'Host' };
const outcomes = { success: 'Succeeded', error: 'Error', cancelled: 'Cancelled' };
const names = { codex: 'Codex', 'claude-code': 'Claude Code', opencode: 'OpenCode', deepseek: 'DeepSeek', 'deepseek-harness': 'DeepSeek Harness' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const icon = (name, compact = false) => '<svg aria-hidden="true" class="icon' + (compact ? ' compact' : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' + (glyphs[name] || '') + '</svg>';
const clip = (value, length) => value.length > length ? value.slice(0, length - 1) + '…' : value;
const number = (value) => Number(value).toLocaleString();
const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const tick = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const tag = (label, kind = '') => '<span class="tag ' + kind + '">' + esc(label) + '</span>';
const MAX_EVENTS = 500;
const ACTIVE_AGE_MS = 120_000;
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const state = {
  events: [], journalId: null, cursor: null, retained: 0, dropped: 0, gap: false, reset: false,
  loaded: false, paused: false, pending: false, controller: null, problem: '', checkedAt: 0, recording: null, delivery: null, demo: false,
  selected: '', selectedEvent: '', renderKey: '', model: null, newIds: new Set(), replay: null
};

document.querySelectorAll('[data-icon]').forEach((element) => { element.innerHTML = icon(element.dataset.icon); });

function labelAgent(value, transport) {
  if (value) return Object.hasOwn(names, value) ? names[value] : value;
  return (transports[transport] || 'Tool') + ' session';
}

function clockText(value, formatter = clock) {
  const time = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(time) ? formatter.format(time) : '';
}

function timeMarkup(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '';
  return '<time class="mono muted" datetime="' + esc(value) + '" title="' + esc(new Date(time).toLocaleString()) + '">' + esc(clockText(time)) + '</time>';
}

function durationText(value) {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1000) return (value / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' s';
  if (value > 0 && value < .01) return '<0.01 ms';
  return value.toLocaleString(undefined, { maximumFractionDigits: value < 1 ? 2 : 1 }) + ' ms';
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function blank(image, title, detail) {
  return '<div class="blank">' + icon(image) + '<h3>' + esc(title) + '</h3><p class="small">' + esc(detail) + '</p></div>';
}

function sessionKey(event) {
  return JSON.stringify([event.projectId || '', event.sessionId || '', event.sessionId ? '' : event.agent || '', event.sessionId ? '' : event.transport]);
}

function spanKey(event) {
  return JSON.stringify([sessionKey(event), event.correlationId]);
}

function describeEvent(event) {
  const tool = event.tool || 'Tool';
  switch (event.kind) {
    case 'session-start': return 'Session started';
    case 'session-end': return 'Session ended';
    case 'phase': return 'Reported phase · ' + (phases[event.phase] || 'Unknown');
    case 'tool-start': return tool + ' started';
    case 'tool-end': return tool + ' · ' + (outcomes[event.outcome] || 'Result recorded');
    default: return 'Journal event';
  }
}

function eventClass(event) {
  if (event.outcome === 'error' || event.outcome === 'cancelled') return 'failed';
  return event.source === 'reported' ? 'reported' : 'live';
}

function buildModel(now, minutes, events = state.events) {
  const start = now - minutes * 60_000;
  const measuredStarts = new Map();
  const matched = [];
  const sessions = new Map();
  const ended = new Set();
  const visible = [];
  let unmatchedEnds = 0;
  for (const event of events) {
    const timestamp = Date.parse(event.timestamp);
    if (!Number.isFinite(timestamp) || timestamp > now) continue;
    const key = sessionKey(event);
    if (event.kind === 'session-end') ended.add(key);
    if (event.kind === 'session-start') ended.delete(key);
    if (event.source === 'measured' && event.correlationId) {
      const correlation = spanKey(event);
      if (event.kind === 'tool-start') measuredStarts.set(correlation, event);
      if (event.kind === 'tool-end') {
        const began = measuredStarts.get(correlation);
        measuredStarts.delete(correlation);
        if (timestamp >= start) {
          if (began) matched.push(event);
          else unmatchedEnds++;
        }
      }
    }
    if (timestamp < start) continue;
    visible.push(event);
    const session = sessions.get(key) || {
      key, project: event.projectId || '', sessionId: event.sessionId || '', agent: '', transport: event.transport,
      events: [], phases: new Map(), transports: new Set(), results: [], pending: [], stale: 0, latest: null, ended: false
    };
    if (event.agent) session.agent = event.agent;
    if (transports[event.transport]) session.transports.add(transports[event.transport]);
    session.events.push(event);
    session.latest = event;
    if (event.kind === 'phase' && event.source === 'reported' && phases[event.phase]) session.phases.set(event.phase, event);
    sessions.set(key, session);
  }
  matched.forEach((event) => sessions.get(sessionKey(event))?.results.push(event));
  let pending = 0;
  let stale = 0;
  for (const event of measuredStarts.values()) {
    const key = sessionKey(event);
    const session = sessions.get(key);
    if (Date.parse(event.timestamp) < start || !session) continue;
    if (ended.has(key) || now - Date.parse(event.timestamp) > ACTIVE_AGE_MS) {
      session.stale++;
      stale++;
    } else {
      session.pending.push(event);
      pending++;
    }
  }
  for (const session of sessions.values()) session.ended = ended.has(session.key);
  const ordered = [...sessions.values()].sort((a, b) => b.latest.sequence - a.latest.sequence);
  const errors = matched.filter((event) => event.outcome === 'error').length;
  const durations = matched.map((event) => event.durationMs).filter(Number.isFinite);
  return { now, start, minutes, visible, sessions: ordered, matched, pending, stale, errors, unmatchedEnds, median: median(durations) };
}

function sessionStatus(session) {
  if (session.pending.length) return ['Awaiting tool result', 'warn'];
  if (session.ended) return ['Ended', ''];
  if (session.latest?.outcome === 'error') return ['Latest result error', 'bad'];
  if (session.stale) return ['Result unavailable', 'warn'];
  if (session.latest?.source === 'reported') return ['Phase or status reported', 'warn'];
  return ['Activity recorded', 'ok'];
}

function sessionTransports(session) {
  return [...session.transports].sort().join(' · ');
}

function renderStats(model) {
  const cells = [
    ['Observed sessions', model.sessions.length], ['Matched tool results', model.matched.length],
    ['Awaiting result', model.pending], ['Tool errors', model.errors], ['Median duration', durationText(model.median)]
  ];
  $('live-stats').innerHTML = cells.map(([label, value], index) => '<div class="stat"><dt>' + label + '</dt><dd' +
    (index === 3 && value ? ' class="danger"' : '') + '>' + esc(state.loaded ? typeof value === 'number' ? number(value) : value : '—') + '</dd></div>').join('');
}

function renderSessions(model) {
  $('session-count').textContent = number(model.sessions.length);
  if (!model.sessions.length) {
    $('sessions').innerHTML = blank('agent', state.loaded ? 'No sessions in this window' : 'Loading sessions',
      state.loaded ? 'Sessions appear when Shadow Brain records a supported action.' : 'Reading retained journal events.');
    return;
  }
  $('sessions').innerHTML = '<ul class="list">' + model.sessions.map((session) => {
    const [status, kind] = sessionStatus(session);
    return '<li><button class="session-row" type="button" data-session="' + esc(session.key) + '" aria-pressed="' + (session.key === state.selected) +
      '"><span class="session-glyph">' + icon('agent', true) + '</span><span class="session-detail"><span class="session-label">' +
      esc(labelAgent(session.agent, session.transport)) + '</span><span class="small muted">' +
      esc([session.project, sessionTransports(session)].filter(Boolean).join(' · ')) + '</span>' + tag(status, kind) + '</span></button></li>';
  }).join('') + '</ul>';
}

function layoutNetwork(sessions) {
  const width = 720;
  const height = 405;
  const core = { x: width / 2, y: height / 2 };
  const ordered = [...sessions].sort((a, b) => a.key.localeCompare(b.key));
  const phase = ordered.length <= 2 ? 0 : Math.PI / 4;
  return { core, nodes: ordered.map((session, index) => {
    const angle = index * Math.PI * 2 / ordered.length + phase;
    const point = { x: core.x + Math.cos(angle) * 202, y: core.y + Math.sin(angle) * 113 };
    const satellites = session.events.slice(-12).map((event, i) => {
      const turn = (i % 6 - 2.5) * .27;
      const ray = angle + turn;
      const distance = i < 6 ? 76 : 96;
      return { event, x: point.x + Math.cos(ray) * distance, y: point.y + Math.sin(ray) * distance * .72 };
    });
    return { session, point, satellites };
  }) };
}

function pointPath(a, b, control = 0) {
  const x = (a.x + b.x) / 2;
  const y = (a.y + b.y) / 2 - control;
  return 'M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + ' Q' + x.toFixed(1) + ' ' + y.toFixed(1) + ' ' +
    b.x.toFixed(1) + ' ' + b.y.toFixed(1);
}

function motionAllowed() {
  return document.documentElement.dataset.motion !== 'reduce' && !motionPreference.matches && !state.paused && !state.replay && !document.hidden;
}

function pulse(path, tone, index) {
  const delay = (index % 5) * .085;
  return '<circle class="pulse ' + tone + '" r="3.9" opacity="0" data-delay="' + delay +
    '"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.13;.68;1" dur=".95s" begin="indefinite"/>' +
    '<animateMotion path="' + path + '" dur=".95s" begin="indefinite"/></circle>';
}

function renderNetwork(model, animate) {
  const svg = $('network-svg');
  const selectedSession = model.sessions.find((session) => session.key === state.selected);
  const mapSessions = model.sessions.slice(0, 10);
  if (selectedSession && !mapSessions.includes(selectedSession)) mapSessions[mapSessions.length - 1] = selectedSession;
  const { core, nodes } = layoutNetwork(mapSessions);
  const displayedEvents = nodes.reduce((sum, node) => sum + node.satellites.length, 0);
  $('network-count').textContent = displayedEvents ? number(displayedEvents) + ' recent events across ' + number(mapSessions.length) + ' displayed sessions' :
    'Recorded session activity';
  const omitted = model.sessions.length - mapSessions.length;
  $('network-status').textContent = omitted > 0 ? number(omitted) + ' more in Sessions' : state.replay ? 'Replay' : state.paused ? 'Paused' : '';
  $('network-status').hidden = !omitted && !state.paused && !state.replay;
  const first = state.selected || nodes[0]?.session.key;
  const primary = [];
  const links = [];
  const satellites = [];
  const pulses = [];
  const firstEvent = state.selectedEvent || nodes[0]?.satellites[0]?.event.id;
  for (const { session, point, satellites: events } of nodes) {
    const selected = session.key === state.selected;
    const tone = session.pending.length ? 'live' : eventClass(session.latest);
    const source = session.latest.source === 'reported' ? ' reported' : tone === 'failed' ? ' failed' : '';
    links.push('<path class="network-edge' + source + (selected ? ' active' : state.selected ? ' dimmed' : '') +
      '" d="' + pointPath(core, point, 10) + '"/>');
    for (const item of events) {
      const event = item.event;
      const eventTone = eventClass(event);
      const path = pointPath(point, item, 4);
      links.push('<path class="network-edge' + (eventTone === 'reported' ? ' reported' : eventTone === 'failed' ? ' failed' : '') +
        (event.id === state.selectedEvent ? ' active' : state.selected && !selected ? ' dimmed' : '') + '" d="' + path + '"/>');
      if (animate && state.newIds.has(event.id)) {
        pulses.push(pulse(pointPath(core, point, 10), eventTone, pulses.length));
        pulses.push(pulse(path, eventTone, pulses.length));
      }
      const eventLabel = describeEvent(event) + ' · ' + labelAgent(session.agent, session.transport);
      satellites.push('<g class="network-node ' + eventTone + (event.id === state.selectedEvent ? ' selected-event' : '') + '" data-live-event="' + esc(event.id) + '" role="button" tabindex="' +
        (event.id === firstEvent ? 0 : -1) + '" aria-pressed="' + (event.id === state.selectedEvent) + '" aria-label="' + esc(eventLabel) +
        '" transform="translate(' + item.x.toFixed(1) + ' ' + item.y.toFixed(1) + ')"><title>' + esc(eventLabel) +
        '</title><circle r="8" fill="transparent"/><circle class="node-surface" r="5.5"/><circle class="node-indicator" r="2.3"/></g>');
    }
    const label = labelAgent(session.agent, session.transport);
    const [status] = sessionStatus(session);
    const full = [label, session.project, status].filter(Boolean).join(' · ');
    const subtitle = clip(session.project || transports[session.transport] || 'Recorded session', 18);
    primary.push('<g class="network-node ' + tone + '" data-session="' + esc(session.key) + '" role="button" tabindex="' +
      (session.key === first ? 0 : -1) + '" aria-pressed="' + selected + '" aria-label="' + esc(full) + '" transform="translate(' +
      (point.x - 68).toFixed(1) + ' ' + (point.y - 18).toFixed(1) + ')"><title>' + esc(full) +
      '</title><rect class="node-surface" width="136" height="36" rx="6"/><circle class="node-indicator" cx="13" cy="13" r="3.6"/><text x="23" y="16">' +
      esc(clip(label, 17)) + '</text><text class="node-subtitle" x="23" y="29">' + esc(subtitle) + '</text></g>');
  }
  const base = '<defs><pattern id="network-grid" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="var(--grid)"/></pattern></defs>' +
    '<rect width="720" height="405" fill="url(#network-grid)"/><ellipse class="topology-ring" cx="360" cy="202.5" rx="239" ry="143"/>' +
    '<ellipse class="topology-ring" cx="360" cy="202.5" rx="202" ry="113"/><ellipse class="topology-ring" cx="360" cy="202.5" rx="131" ry="79"/>';
  const hub = '<g class="network-core" aria-label="Local event journal"><circle class="core-ring" cx="360" cy="202.5" r="64"/><circle cx="360" cy="202.5" r="54"/>' +
    '<circle class="core-inner" cx="360" cy="202.5" r="47"/><text text-anchor="middle" x="360" y="201">Shadow Brain</text>' +
    '<text class="node-subtitle" text-anchor="middle" x="360" y="217">Event journal</text></g>';
  svg.innerHTML = base + '<g aria-hidden="true">' + links.join('') + '</g>' + hub + satellites.join('') + primary.join('') +
    '<g id="network-pulses" aria-hidden="true">' + pulses.slice(0, 20).join('') + '</g>';
  svg.querySelectorAll('#network-pulses [data-delay]').forEach((element) => {
    for (const animation of element.children) animation.beginElementAt?.(Number(element.dataset.delay));
  });
}

function fact(label, value) {
  return value ? '<div><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>' : '';
}

function renderInspector(model) {
  const session = model.sessions.find((item) => item.key === state.selected);
  const target = $('inspection');
  if (!session) {
    target.innerHTML = blank('activity', 'Select a session or event', 'Inspect the recorded action, phase, and timing details.');
    return;
  }
  const event = session.events.find((item) => item.id === state.selectedEvent);
  const [status, kind] = sessionStatus(session);
  const current = [...session.phases.values()].sort((a, b) => b.sequence - a.sequence)[0];
  const phaseMarkup = Object.entries(phases).map(([key, label]) => {
    const observation = session.phases.get(key);
    return '<span class="stage' + (observation ? ' seen' : '') + (current?.phase === key ? ' current' : '') +
      '"' + (observation ? ' title="' + esc('Reported at ' + clockText(observation.timestamp)) + '"' : '') + '>' + label + '</span>';
  }).join('');
  const eventDetails = event ? '<div><h3>Selected event</h3><p class="small">' + esc(describeEvent(event)) + '</p></div><dl class="facts">' +
    fact('Source', event.source === 'reported' ? 'Host report' : 'Measured') +
    fact('Recorded at', clockText(event.timestamp)) + fact('Transport', transports[event.transport]) +
    fact('Duration', Number.isFinite(event.durationMs) ? durationText(event.durationMs) : '') +
    fact('Correlation ID', event.correlationId) +
    fact('Sequence', String(event.sequence)) + '</dl>' : '';
  const projectLink = session.project ? '<a class="button quiet" href="/#memories?project=' + esc(encodeURIComponent(session.project)) +
    '">Open project memories</a>' : '';
  target.innerHTML = '<div class="panel-body"><div><h3>' + esc(labelAgent(session.agent, session.transport)) + '</h3>' + tag(status, kind) +
    '</div><dl class="facts">' + fact('Project', session.project || 'Unscoped') + fact('Transports', sessionTransports(session)) +
    fact('Session ID', session.sessionId) + fact('Latest event', clockText(session.latest.timestamp)) +
    fact('Matched results', String(session.results.length)) + fact('Awaiting result', session.pending.length ? String(session.pending.length) : '') +
    fact('Unresolved starts', session.stale ? String(session.stale) : '') + '</dl>' +
    '<div><h3>Task phases</h3>' + (current ? '<p class="small muted">Latest report at ' + esc(clockText(current.timestamp)) +
    '</p><div class="stages">' + phaseMarkup + '</div>' : '<p class="small muted">No phase reports in this window.</p>') + '</div>' +
    eventDetails + projectLink + '</div>';
}

function chartBuckets(model) {
  const size = 10;
  const width = (model.now - model.start) / size;
  const buckets = Array.from({ length: size }, (_, index) => ({ time: model.start + index * width, results: 0, errors: 0, durations: [] }));
  for (const result of model.matched) {
    const position = Math.min(size - 1, Math.max(0, Math.floor((Date.parse(result.timestamp) - model.start) / width)));
    const bucket = buckets[position];
    bucket.results++;
    if (result.outcome === 'error') bucket.errors++;
    if (Number.isFinite(result.durationMs)) bucket.durations.push(result.durationMs);
  }
  return buckets.map(({ durations, ...bucket }) => ({ ...bucket, duration: median(durations) }));
}

function chartData(buckets, type, open, formatter) {
  const timing = type === 'duration';
  const headings = timing ? '<th scope="col">Median duration</th>' : '<th scope="col">Results</th><th scope="col">Errors</th>';
  return '<details class="chart-data"' + (open ? ' open' : '') + '><summary class="small">View chart data</summary>' +
    '<table><thead><tr><th scope="col">Interval start</th>' + headings + '</tr></thead><tbody>' + buckets.map((bucket) => {
      const values = timing ? '<td>' + esc(durationText(bucket.duration)) + '</td>' : '<td>' + number(bucket.results) + '</td><td>' + number(bucket.errors) + '</td>';
      return '<tr><th scope="row">' + esc(clockText(bucket.time, formatter)) + '</th>' + values + '</tr>';
    }).join('') + '</tbody></table></details>';
}

function renderChart(id, buckets) {
  const target = $(id);
  const timing = id === 'duration';
  const open = target.querySelector('details')?.open;
  const formatter = buckets[1].time - buckets[0].time < 60_000 ? clock : tick;
  const values = buckets.map((bucket) => timing ? bucket.duration : bucket.results).filter(Number.isFinite);
  if (timing ? !values.length : !values.some(Boolean)) {
    target.innerHTML = blank('activity', timing ? 'No measured durations in this window' : 'No matched tool results in this window',
      'Matching start and result events will populate this chart.');
    return;
  }
  const max = Math.max(1, ...values);
  const left = 63;
  const right = 529;
  const baseline = 119;
  const top = 20;
  const step = (right - left) / buckets.length;
  const height = (value) => (baseline - top) * value / max;
  let previous = null;
  const marks = buckets.map((bucket, index) => {
    const center = left + step * (index + .5);
    if (!timing) {
      const regular = bucket.results - bucket.errors;
      const w = step * .65;
      return '<g><title>' + esc(clockText(bucket.time, formatter) + ' · ' + bucket.results + ' results · ' + bucket.errors + ' errors') +
        '</title><rect class="chart-bar" x="' + (center - w / 2) + '" y="' + (baseline - height(regular)) + '" width="' + w +
        '" height="' + height(regular) + '"/><rect class="chart-error" x="' + (center - w / 2) + '" y="' +
        (baseline - height(bucket.results)) + '" width="' + w + '" height="' + height(bucket.errors) + '"/></g>';
    }
    if (!Number.isFinite(bucket.duration)) {
      previous = null;
      return '';
    }
    const y = baseline - height(bucket.duration);
    const line = previous ? '<path class="chart-duration" d="M' + previous.x + ' ' + previous.y + ' L' + center + ' ' + y + '"/>' : '';
    previous = { x: center, y };
    return line + '<circle class="chart-point" cx="' + center + '" cy="' + y + '" r="3.7"><title>' +
      esc(clockText(bucket.time, formatter) + ' · ' + durationText(bucket.duration)) + '</title></circle>';
  }).join('');
  const maximum = timing ? durationText(max) : number(max);
  const axis = [top, (top + baseline) / 2, baseline].map((y) => '<path class="chart-grid" d="M' + left + ' ' + y + 'H' + right + '"/>').join('');
  const captions = [0, 4, 9].map((index) => '<text class="chart-label" x="' + (left + step * (index + .5)) +
    '" y="139" text-anchor="middle">' + esc(clockText(buckets[index].time, formatter)) + '</text>').join('');
  target.innerHTML = '<svg class="chart-svg" aria-hidden="true" viewBox="0 0 548 148">' + axis + marks + captions +
    '<text class="chart-label" x="5" y="24">' + esc(maximum) + '</text><text class="chart-label" x="5" y="123">0</text></svg>' +
    (!timing ? '<p class="small muted"><span style="color:var(--cyan)">■</span> Succeeded or cancelled <span style="color:var(--rose)">■</span> Errors</p>' : '') +
    chartData(buckets, id, open, formatter);
}

function renderEvents(model) {
  const session = model.sessions.find((item) => item.key === state.selected);
  const filter = $('event-filter').value;
  const transport = $('transport-filter').value;
  const data = (session ? session.events : model.visible).filter((event) => (!filter || event.source === filter) && (!transport || event.transport === transport));
  $('timeline-scope').textContent = (session ? labelAgent(session.agent, session.transport) + ' session' : 'All sessions') +
    ' · ' + number(data.length) + ' recorded events';
  $('clear-session').hidden = !session;
  const target = $('events');
  if (!data.length) {
    target.innerHTML = blank('activity', 'No matching events', state.loaded ? 'Choose a different window, source, or transport.' : 'Reading retained journal events.');
    return;
  }
  target.innerHTML = '<ul class="list">' + [...data].reverse().slice(0, 150).map((event) => {
    const tone = eventClass(event);
    const source = event.source === 'reported' ? 'Reported' : 'Measured';
    const extra = Number.isFinite(event.durationMs) ? ' · ' + durationText(event.durationMs) : '';
    const meta = [event.agent ? labelAgent(event.agent, event.transport) : '', transports[event.transport], event.projectId].filter(Boolean).join(' · ');
    return '<li class="event-row' + (state.newIds.has(event.id) ? ' new' : '') + '" data-selected="' + (event.id === state.selectedEvent) + '">' + timeMarkup(event.timestamp) +
      '<span class="event-meta small muted">' + esc(meta) + '</span><div class="event-title"><button class="event-link" type="button" data-live-event="' +
      esc(event.id) + '" aria-pressed="' + (event.id === state.selectedEvent) + '">' + esc(describeEvent(event)) +
      '</button><span class="small muted">' + esc(extra) + '</span></div>' + tag(source, tone === 'reported' ? 'warn' : tone === 'failed' ? 'bad' : 'ok') + '</li>';
  }).join('') + '</ul>' + (data.length > 150 ? '<p class="panel-body small muted">Showing the latest 150 events in this view.</p>' : '');
}

function renderStatus(model) {
  const badge = $('stream-tag');
  const label = state.replay ? 'Replay' : state.problem ? 'Disconnected' : !state.loaded ? 'Connecting' : state.paused ? 'Paused' : !state.delivery ? 'Delivery off' : 'Live';
  badge.className = 'tag ' + (state.replay ? 'warn' : state.problem ? 'bad' : state.loaded && state.delivery && !state.paused ? 'ok' : 'warn');
  badge.title = state.checkedAt ? 'Last checked ' + clockText(state.checkedAt) : '';
  $('stream-label').textContent = label;
  const demoBanner = document.documentElement.dataset.demo === 'true';
  $('demo-tag').hidden = !state.demo || demoBanner;
  $('pause-label').textContent = state.paused ? 'Resume stream' : 'Pause stream';
  $('pause').querySelector('[data-icon]').innerHTML = icon(state.paused ? 'play' : 'pause');
  $('pause').hidden = !!state.replay;
  $('pause').disabled = !state.loaded || state.delivery === false;
  $('refresh').hidden = !!state.replay;
  $('refresh').disabled = state.pending || !!state.replay;
  $('replay-start').hidden = !!state.replay;
  $('replay-start').disabled = !state.events.length || !!state.replay || state.delivery === false;
  const messages = [];
  if (state.replay) messages.push('Replaying a frozen snapshot of ' + number(state.replay.events.length) + ' loaded events.');
  else if (state.problem) messages.push(state.problem);
  else if (!state.loaded) messages.push('Connecting to the local event journal…');
  else {
    messages.push(number(model.visible.length) + ' loaded events · Last ' + model.minutes + (model.minutes === 1 ? ' minute' : ' minutes'));
    if (state.demo && !demoBanner) messages.push('Scripted local activity.');
    if (state.recording === false) messages.push('Activity recording is off.');
    if (state.delivery === false) messages.push('Live delivery is off.');
    if (state.paused) messages.push('Stream paused.');
    const oldest = Date.parse(state.events[0]?.timestamp);
    const incomplete = state.gap || (state.dropped > 0 || state.retained > state.events.length) &&
      (!Number.isFinite(oldest) || oldest > model.start);
    if (incomplete) messages.push('The window may be partial because older events are outside the loaded journal.');
    if (state.reset) messages.push('The journal restarted.');
    if (model.unmatchedEnds || model.stale) messages.push('Unmatched spans are excluded from measured result metrics.');
  }
  const notice = $('stream-notice');
  notice.className = 'notice' + (state.problem && !state.replay ? ' error' : '');
  const settings = state.loaded && (state.recording === false || state.delivery === false);
  const markup = messages.map((message) => '<span>' + esc(message) + '</span>').join('') +
    (settings ? '<a class="button quiet" href="/#features">Open Features</a>' : '');
  if (notice.innerHTML !== markup) notice.innerHTML = markup;
}

function renderReplay() {
  const replay = state.replay;
  $('replay-bar').hidden = !replay;
  if (!replay) return;
  const { events, index, timer, incomplete } = replay;
  const event = events[index];
  const slider = $('replay-range');
  slider.max = String(events.length - 1);
  slider.value = String(index);
  slider.disabled = events.length < 2;
  const position = number(index + 1) + ' / ' + number(events.length) + ' · ' + clockText(event.timestamp);
  slider.setAttribute('aria-valuetext', position + ', ' + describeEvent(event));
  $('replay-position').textContent = position;
  $('replay-prev').disabled = index === 0;
  $('replay-next').disabled = index === events.length - 1;
  $('replay-play').disabled = events.length < 2;
  $('replay-play').textContent = timer ? 'Pause replay' : index === events.length - 1 ? 'Play from start' : 'Play replay';
  $('replay-caption').textContent = 'Loaded sequence ' + number(events[0].sequence) + '–' + number(events.at(-1).sequence) +
    ' · Playback advances two events per second. The time window ends at the selected event.' +
    (incomplete ? ' Earlier events may be outside this snapshot.' : '');
}

function stopReplayPlayback() {
  if (!state.replay?.timer) return;
  clearInterval(state.replay.timer);
  state.replay.timer = null;
}

function moveReplay(index) {
  const replay = state.replay;
  if (!replay || !Number.isInteger(index)) return;
  replay.index = Math.max(0, Math.min(replay.events.length - 1, index));
  if (replay.index === replay.events.length - 1) stopReplayPlayback();
  const event = replay.events[replay.index];
  state.selected = sessionKey(event);
  state.selectedEvent = event.id;
  render(true);
}

function startReplay() {
  if (!state.events.length || state.replay || state.delivery === false) return;
  state.controller?.abort();
  state.replay = { events: [...state.events], index: 0, timer: null,
    incomplete: state.gap || state.dropped > 0 || state.retained > state.events.length || state.events[0].sequence > 1 };
  moveReplay(state.replay.events.length - 1);
  $('replay-heading').focus();
}

function exitReplay() {
  stopReplayPlayback();
  state.replay = null;
  state.paused = false;
  render(true);
  $('replay-start').focus();
  void poll();
}

function focusKey() {
  const active = document.activeElement;
  const value = active?.dataset.session || active?.dataset.liveEvent;
  if (!value) return null;
  const section = active.closest('#network-svg,#sessions,#events');
  return section ? { section, key: active.dataset.session ? 'data-session' : 'data-live-event', value } : null;
}

function render(force = false, animate = false) {
  const replay = state.replay;
  const replayEvent = replay?.events[replay.index];
  const now = replayEvent ? Date.parse(replayEvent.timestamp) : Math.max(state.checkedAt || Date.now(), Date.parse(state.events.at(-1)?.timestamp) || 0);
  const minutes = Number($('time-window').value);
  const model = buildModel(now, minutes, replay ? replay.events.slice(0, replay.index + 1) : state.events);
  state.model = model;
  renderStatus(model);
  renderReplay();
  const key = [state.loaded, state.journalId, state.cursor, Math.floor(now / 15000), minutes, replayEvent?.sequence].join('|');
  if (!force && key === state.renderKey) return;
  state.renderKey = key;
  if (!model.sessions.some((session) => session.key === state.selected)) state.selected = '';
  if (!model.visible.some((event) => event.id === state.selectedEvent)) state.selectedEvent = '';
  const focus = focusKey();
  const scrolls = ['sessions', 'inspection', 'events'].map((id) => [$(id), $(id).scrollTop]);
  renderStats(model);
  renderSessions(model);
  renderNetwork(model, animate && motionAllowed());
  renderInspector(model);
  const buckets = chartBuckets(model);
  renderChart('throughput', buckets);
  renderChart('duration', buckets);
  renderEvents(model);
  for (const [target, scroll] of scrolls) target.scrollTop = scroll;
  if (focus) focus.section.querySelector('[' + focus.key + '="' + CSS.escape(focus.value) + '"]')?.focus({ preventScroll: true });
  state.newIds.clear();
}

async function loadPage(signal) {
  const query = new URLSearchParams({ limit: '200' });
  if (state.cursor !== null) query.set('cursor', String(state.cursor));
  if (state.journalId) query.set('journalId', state.journalId);
  const response = await fetch('/api/workspace/telemetry?' + query, { cache: 'no-store', headers: { Accept: 'application/json' }, signal });
  const data = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(data?.events) || !Number.isSafeInteger(data.nextAfterSequence ?? data.cursor)) {
    throw new Error(data?.error || 'The local event journal could not be read.');
  }
  return data;
}

function acceptPage(page, animate) {
  if (page.liveEnabled === false) {
    state.events = [];
    state.journalId = null;
    state.cursor = null;
    state.retained = 0;
    state.dropped = 0;
    state.gap = false;
    state.reset = false;
    state.recording = page.recordingEnabled;
    state.delivery = false;
    state.demo = page.demo === true;
    state.checkedAt = Date.parse(page.checkedAt) || Date.now();
    state.loaded = true;
    state.newIds.clear();
    return;
  }
  const reset = page.reset || (state.journalId && page.journalId !== state.journalId);
  state.reset = !!reset;
  if (reset) {
    state.events = [];
    state.gap = false;
  }
  if (page.gap) state.gap = true;
  const merged = new Map(state.events.map((event) => [event.sequence, event]));
  for (const event of page.events) {
    if (!Number.isSafeInteger(event.sequence) || typeof event.id !== 'string' || !Number.isFinite(Date.parse(event.timestamp))) continue;
    if (animate && !merged.has(event.sequence)) state.newIds.add(event.id);
    merged.set(event.sequence, event);
  }
  state.events = [...merged.values()].sort((a, b) => a.sequence - b.sequence).slice(-MAX_EVENTS);
  state.journalId = page.journalId;
  state.cursor = page.nextAfterSequence ?? page.cursor;
  state.retained = page.retainedCount;
  state.dropped = page.droppedCount;
  state.recording = page.recordingEnabled;
  state.delivery = page.liveEnabled;
  state.demo = page.demo === true;
  state.checkedAt = Date.parse(page.checkedAt) || Date.now();
  state.loaded = true;
}

async function poll(manual = false) {
  if (state.pending || state.replay || (!manual && (state.paused || state.delivery === false || document.hidden))) return;
  state.pending = true;
  $('refresh').disabled = true;
  const controller = new AbortController();
  state.controller = controller;
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
  const animate = state.loaded && state.delivery !== false && motionAllowed();
  try {
    for (let i = 0; i < 3; i++) {
      const page = await loadPage(signal);
      if (signal.aborted) return;
      acceptPage(page, animate);
      if (!page.hasMore) break;
    }
    state.problem = '';
  } catch (error) {
    if (!controller.signal.aborted) state.problem = error.message || 'The event journal is unavailable.';
  } finally {
    state.pending = false;
    state.controller = null;
    render(manual, animate);
  }
}

function chooseSession(key) {
  state.selected = key;
  state.selectedEvent = '';
  render(true);
}

function chooseEvent(id) {
  const event = state.model?.visible.find((item) => item.id === id);
  if (!event) return;
  state.selected = sessionKey(event);
  state.selectedEvent = id;
  render(true);
}

function keyboardNetwork(event) {
  const target = event.target.closest('[data-session],[data-live-event]');
  if (!target) return;
  const eventKey = target.dataset.liveEvent;
  const attr = eventKey ? 'data-live-event' : 'data-session';
  const items = [...$('network-svg').querySelectorAll('[' + attr + ']')];
  const index = items.indexOf(target);
  const activate = (item) => {
    if (eventKey) chooseEvent(item.dataset.liveEvent);
    else chooseSession(item.dataset.session);
  };
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    activate(target);
    return;
  }
  const next = { ArrowLeft: index - 1, ArrowUp: index - 1, ArrowRight: index + 1, ArrowDown: index + 1, Home: 0, End: items.length - 1 }[event.key];
  if (!Number.isInteger(next)) return;
  event.preventDefault();
  const selected = items[(next + items.length) % items.length];
  const value = eventKey ? selected.dataset.liveEvent : selected.dataset.session;
  activate(selected);
  $('network-svg').querySelector('[' + attr + '="' + CSS.escape(value) + '"]')?.focus({ preventScroll: true });
}

function syncMotion() {
  const reduced = document.documentElement.dataset.motion === 'reduce' || motionPreference.matches;
  $('motion-control').setAttribute('aria-pressed', String(reduced));
  $('motion-control').title = motionPreference.matches ? 'Your system preference reduces motion' : '';
  if (reduced) $('network-pulses')?.replaceChildren();
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-session],[data-live-event]');
  if (target?.dataset.session) chooseSession(target.dataset.session);
  else if (target?.dataset.liveEvent) chooseEvent(target.dataset.liveEvent);
});
$('network-svg').addEventListener('keydown', keyboardNetwork);
$('time-window').addEventListener('change', () => render(true));
$('event-filter').addEventListener('change', () => renderEvents(state.model));
$('transport-filter').addEventListener('change', () => renderEvents(state.model));
$('clear-session').addEventListener('click', () => chooseSession(''));
$('refresh').addEventListener('click', () => { void poll(true); });
$('replay-start').addEventListener('click', startReplay);
$('replay-exit').addEventListener('click', exitReplay);
$('replay-range').addEventListener('input', (event) => {
  stopReplayPlayback();
  moveReplay(Number(event.target.value));
});
$('replay-prev').addEventListener('click', () => {
  stopReplayPlayback();
  moveReplay(state.replay.index - 1);
});
$('replay-next').addEventListener('click', () => {
  stopReplayPlayback();
  moveReplay(state.replay.index + 1);
});
$('replay-play').addEventListener('click', () => {
  const replay = state.replay;
  if (!replay) return;
  if (replay.timer) {
    stopReplayPlayback();
    renderReplay();
    return;
  }
  if (replay.index === replay.events.length - 1) moveReplay(0);
  replay.timer = setInterval(() => moveReplay(replay.index + 1), 500);
  renderReplay();
});
$('pause').addEventListener('click', () => {
  state.paused = !state.paused;
  if (state.paused) {
    state.controller?.abort();
    $('network-pulses')?.replaceChildren();
    render(true);
  } else {
    render(true);
    void poll();
  }
});
$('motion-control').addEventListener('click', () => {
  const value = document.documentElement.dataset.motion === 'reduce' ? 'system' : 'reduce';
  document.documentElement.dataset.motion = value;
  try { localStorage.setItem('shadow-brain:workspace:motion', value); } catch {}
  syncMotion();
});
motionPreference.addEventListener('change', syncMotion);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    $('network-pulses')?.replaceChildren();
    stopReplayPlayback();
    renderReplay();
  }
  else void poll();
});
syncMotion();
render(true);
void poll(true);
setInterval(() => { void poll(); }, 1900);
</script>
</body>
</html>`;
