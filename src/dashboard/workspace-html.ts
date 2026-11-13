// Dependency-free local workspace. The advanced dashboard is served separately.
import { PROJECT_KIT_MARKUP, PROJECT_KIT_SCRIPT, PROJECT_KIT_STYLE } from './project-kit-html.js';

export const WORKSPACE_HTML = String.raw`<!doctype html>
<html lang="en" data-theme="light" data-motion="system">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Agent Shadow Brain · Workspace</title>
<script>
  try {
    const theme = localStorage.getItem('shadow-brain:workspace:theme');
    const motion = localStorage.getItem('shadow-brain:workspace:motion');
    if (theme === 'dark') document.documentElement.dataset.theme = theme;
    if (motion === 'reduce') document.documentElement.dataset.motion = motion;
  } catch {}
</script>
<style>
  :root {
    color-scheme: light;
    --canvas: #f4f6f9; --surface: #fff; --inset: #eef2f6; --hover: #f2f5f8;
    --ink: #182539; --muted: #4e6176; --line: #dbe2e9; --control: #8a9bae;
    --teal: #096459; --teal-fill: #076b5e; --teal-hover: #05584d; --tint: #dff1ec;
    --bad: #a32940; --bad-bg: #fbeaf0; --focus: #167b9d; --amber: #815116; --amber-bg: #f9edd8;
    --rail: #172539; --rail-ink: #f0f5fc; --rail-muted: #b5c5d7; --rail-line: #35475b;
    --rail-selected: #284657; --rail-highlight: #8ed9cb;
    --agent: #57539a; --agent-bg: #eeecfa; --project: var(--teal); --project-bg: var(--tint);
    --memory: #475f7e; --memory-bg: #eaf0f8;
    --graph-line: #6d8195; --graph-project: #478779; --graph-agent: #746aa5; --graph-dot: #ccd7e0; --accent-ink: #fff;
    --skeleton: #e5ebf0; --r: 9px; --ease: 175ms cubic-bezier(.2,.75,.25,1);
    --header: 62px; --sidebar: 222px; --sticky: 2; --notice: 3;
    font-family: Inter, "Segoe UI", system-ui, sans-serif;
    font-size: 15px;
  }
  html[data-theme="dark"] {
    color-scheme: dark;
    --canvas: #111b2a; --surface: #172437; --inset: #1e2e43; --hover: #23344a;
    --ink: #edf4fb; --muted: #b3c1d1; --line: #334459; --control: #74889e;
    --teal: #94e1d3; --teal-fill: #9be6d6; --teal-hover: #baf2e6; --tint: #203f43;
    --bad: #ffadbd; --bad-bg: #492a3a; --focus: #8cd6f3; --amber: #f4cb89; --amber-bg: #43352a;
    --rail: #101a28; --rail-line: #2e4157; --rail-selected: #233e4f;
    --agent: #c7bffc; --agent-bg: #333451; --memory: #bccfea; --memory-bg: #2a3a50;
    --graph-line: #8295ac; --graph-project: #82bcb1; --graph-agent: #aaa0db; --graph-dot: #34465b; --accent-ink: #15372e;
    --skeleton: #2b3a4d;
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body { margin: 0; color: var(--ink); background: var(--canvas); font-size: .94rem; line-height: 1.5; }
  a { color: var(--teal); text-decoration: none; }
  p, h1, h2, h3, ul, dl, dd { margin: 0; }
  p { max-width: 69ch; overflow-wrap: anywhere; }
  h1, h2, h3 { line-height: 1.22; text-wrap: balance; overflow-wrap: anywhere; }
  h1 { font-size: 2rem; letter-spacing: -.035em; font-weight: 710; }
  h2 { font-size: 1.14rem; letter-spacing: -.015em; font-weight: 690; }
  h3 { font-size: 1rem; font-weight: 650; }
  .muted { color: var(--muted); }
  .small { font-size: .86rem; }
  .mono { font: .81rem/1.52 "Cascadia Code", Consolas, monospace; overflow-wrap: anywhere; }
  .icon { width: 18px; height: 18px; flex: none; vertical-align: middle; }
  .icon.small-icon { width: 15px; height: 15px; }
  :is(a,button,input,textarea,select,summary,[tabindex]):focus-visible {
    outline: 2px solid var(--focus); outline-offset: 3px;
  }
  .skip { position: fixed; top: 10px; left: 10px; z-index: var(--notice); transform: translateY(-160%); }
  .skip:focus { transform: none; }
  .shell { display: grid; grid-template-columns: var(--sidebar) minmax(0, 1fr); min-height: 100vh; }
  .rail {
    position: sticky; top: 0; height: 100vh; height: 100dvh; display: flex; flex-direction: column;
    align-items: stretch; gap: 32px; padding: 24px 15px 18px; background: var(--rail); color: var(--rail-ink);
  }
  .brand { color: var(--rail-ink); display: flex; align-items: center; gap: 11px; padding: 0 7px; font-weight: 710; }
  .brand-mark { width: 33px; height: 33px; display: grid; place-items: center; background: #294354; color: #9ce6d6; border-radius: 8px; }
  .brand-mark .icon { width: 21px; height: 21px; }
  .brand-name { letter-spacing: -.02em; line-height: 1.13; }
  .rail-nav { display: grid; gap: 4px; }
  .nav-link { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 7px; color: var(--rail-muted); font-weight: 580; }
  .nav-link:hover { color: var(--rail-ink); background: #24384d; }
  .nav-link[aria-current="page"] { color: var(--rail-ink); background: var(--rail-selected); }
  .nav-link[aria-current="page"] .icon { color: var(--rail-highlight); }
  .rail :focus-visible { outline-color: #9ce6d6; }
  .rail-foot { margin-top: auto; padding-top: 11px; border-top: 1px solid var(--rail-line); }
  .rail-foot .arrow { margin-left: auto; width: 14px; height: 14px; }
  .rail-build { color: var(--rail-muted); padding: 10px 10px 0; font-size: .78rem; }
  .main { min-width: 0; }
  .top {
    min-height: var(--header); display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 10px 34px; border-bottom: 1px solid var(--line); background: var(--surface);
  }
  .crumb { display: flex; align-items: center; gap: 9px; min-width: 0; }
  .crumb .icon { width: 14px; height: 14px; color: var(--muted); }
  .top-actions { display: flex; align-items: center; gap: 14px; }
  .live-link { white-space: nowrap; }
  .connection { display: inline-flex; gap: 6px; align-items: center; white-space: nowrap; }
  .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; background: currentColor; }
  .connection[data-state="connected"] .dot { color: var(--teal); }
  .connection[data-state="error"] .dot { color: var(--bad); }
  .content { max-width: 1510px; margin: 0 auto; padding: 33px 34px 52px; min-width: 0; }
  .page-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; margin-bottom: 24px; }
  .page-head p { margin-top: 8px; }
  .page-head .button { align-self: center; }
  .panel { border: 1px solid var(--line); background: var(--surface); border-radius: var(--r); min-width: 0; }
  .panel-head { display: flex; justify-content: space-between; gap: 14px; align-items: center; padding: 17px 19px; border-bottom: 1px solid var(--line); }
  .panel-head p { margin-top: 3px; }
  .panel-body { padding: 18px 19px; min-width: 0; }
  .stack { display: grid; gap: 17px; align-content: start; min-width: 0; }
  .split { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); align-items: start; gap: 18px; }
  .button {
    appearance: none; color: var(--ink); background: var(--surface); border: 1px solid var(--control);
    min-height: 37px; padding: 6px 11px; font: inherit; font-size: .88rem; font-weight: 650; border-radius: 7px;
    display: inline-flex; align-items: center; justify-content: center; gap: 7px; text-align: center; line-height: 1.22;
    text-decoration: none; cursor: pointer; transition: background var(--ease), color var(--ease), border-color var(--ease);
  }
  .button:hover, .button[aria-pressed="true"] { background: var(--hover); }
  .button[aria-pressed="true"] { color: var(--teal); border-color: var(--teal); }
  .button.primary { background: var(--teal-fill); color: var(--accent-ink); border-color: var(--teal-fill); }
  .button.primary:hover { background: var(--teal-hover); border-color: var(--teal-hover); }
  .button.quiet { background: transparent; border-color: transparent; color: var(--teal); }
  .button.quiet:hover { background: var(--hover); }
  .button.icon-button { width: 37px; padding: 0; }
  .button:disabled { opacity: .65; cursor: default; }
  .button:active:not(:disabled) { transform: translateY(1px); }
  .label { display: grid; gap: 5px; font-size: .88rem; font-weight: 630; min-width: 0; }
  :is(input:not([type=checkbox]),select,textarea) {
    min-width: 0; width: 100%; color: var(--ink); background: var(--surface); font: inherit; font-weight: 450;
    border: 1px solid var(--control); border-radius: 7px; padding: 8px 10px; min-height: 38px;
  }
  :is(input,textarea)::placeholder { color: var(--muted); opacity: 1; }
  textarea { resize: vertical; }
  .search-field { position: relative; min-width: 0; }
  .search-field > [data-icon] { position: absolute; bottom: 10px; left: 10px; color: var(--muted); pointer-events: none; line-height: 1; }
  .search-field input { padding-left: 34px; }
  .inline-check { display: flex; align-items: flex-start; gap: 7px; min-height: 28px; }
  .inline-check input { accent-color: var(--teal-fill); margin-top: 4px; }
  .form-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .filters { display: grid; grid-template-columns: minmax(155px,1.45fr) repeat(4,minmax(96px,1fr)) auto; gap: 10px; align-items: end; }
  .filter-bar { display: flex; align-items: end; gap: 10px; flex-wrap: wrap; }
  .filter-bar .label { flex: 1 1 155px; }
  .status { padding: 13px 17px; border: 1px solid var(--line); border-radius: 7px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; background: var(--surface); }
  .status.error { background: var(--bad-bg); color: var(--bad); border-color: transparent; }
  .status.error .button { color: var(--bad); }
  .status.error .button:hover { background: var(--surface); }
  .blank { display: grid; gap: 6px; padding: 29px 19px; }
  .blank > .icon { color: var(--teal); margin-bottom: 4px; }
  .blank a { justify-self: start; margin-top: 4px; }
  .skeleton { display: grid; gap: 12px; padding: 19px; }
  .skeleton i { width: 82%; height: 12px; display: block; border-radius: 4px; background: var(--skeleton); }
  .skeleton i:nth-child(2) { width: 63%; }
  .skeleton i:nth-child(3) { width: 71%; }
  .tag {
    background: var(--inset); color: var(--muted); padding: 3px 7px; border-radius: 5px;
    font-size: .79rem; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere;
  }
  .tag.project { background: var(--project-bg); color: var(--project); }
  .tag.agent { background: var(--agent-bg); color: var(--agent); }
  .tag.memory { background: var(--memory-bg); color: var(--memory); }
  .tag.state-active, .tag.check-ok { background: var(--tint); color: var(--teal); }
  .tag.state-contested, .tag.check-warn { background: var(--amber-bg); color: var(--amber); }
  .tag.state-superseded { background: var(--agent-bg); color: var(--agent); }
  .tag.check-error { background: var(--bad-bg); color: var(--bad); }
  .tags { display: flex; align-items: center; flex-wrap: wrap; gap: 5px 7px; }
  .summary {
    display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); background: var(--surface);
    border: 1px solid var(--line); border-radius: var(--r); margin-bottom: 18px;
  }
  .summary-item { display: flex; align-items: center; gap: 13px; min-width: 0; padding: 18px 19px; }
  .summary-item + .summary-item { border-left: 1px solid var(--line); }
  .tile-icon { display: grid; place-items: center; width: 37px; height: 37px; border-radius: 7px; flex: none; background: var(--tint); color: var(--teal); }
  .summary dt { color: var(--muted); font-size: .84rem; font-weight: 600; }
  .summary dd { font-size: 1.3rem; font-weight: 700; line-height: 1.12; font-variant-numeric: tabular-nums; margin-top: 4px; }
  .list { list-style: none; padding: 0; }
  .list > li + li { border-top: 1px solid var(--line); }
  .project-row { display: grid; grid-template-columns: minmax(0,1.5fr) minmax(65px,.55fr) auto; align-items: center; gap: 12px; padding: 12px 19px; }
  .project-name { display: flex; gap: 7px; align-items: center; min-width: 0; font-weight: 650; overflow-wrap: anywhere; }
  .project-name:hover { text-decoration: underline; }
  .project-detail { margin: 3px 0 0 22px; }
  .project-count { color: var(--muted); font-size: .81rem; text-align: right; font-variant-numeric: tabular-nums; }
  .project-meter { display: block; width: 100%; height: 5px; margin-top: 4px; border-radius: 3px; overflow: hidden; background: var(--inset); }
  .project-meter span { display: block; height: 100%; background: var(--teal); border-radius: inherit; opacity: .75; }
  .event { display: grid; grid-template-columns: 27px minmax(0,1fr) auto; gap: 9px; align-items: start; padding: 12px 19px; }
  .event .tile-icon { width: 26px; height: 26px; }
  .event strong { display: block; font-size: .89rem; font-weight: 630; overflow-wrap: anywhere; }
  .event time { color: var(--muted); font-size: .77rem; }
  .event-meta { margin-top: 2px; }
  .overview-memory { display: grid; gap: 5px; padding: 12px 19px; }
  .overview-memory strong { overflow-wrap: anywhere; }
  .toolbar-end { margin-left: auto; }
  .list-footer { border-top: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px 18px; }
  .memory-row { padding: 14px 19px; display: grid; gap: 8px; }
  .memory-head { display: flex; justify-content: space-between; align-items: start; gap: 10px; }
  .memory-head time { white-space: nowrap; }
  .record-link { color: var(--ink); font-weight: 680; text-decoration: underline; text-decoration-color: var(--control); text-underline-offset: 3px; }
  .record-link:hover { color: var(--teal); text-decoration-color: currentColor; }
  .memory-content { white-space: pre-wrap; overflow-wrap: anywhere; max-width: none; }
  .detail-head { display: grid; gap: 9px; }
  .detail-head > .button { justify-self: start; }
  .detail-layout { grid-template-columns: minmax(0,1.45fr) minmax(265px,1fr); }
  .detail-form, .detail-sources, .check-result { display: grid; gap: 9px; }
  .detail-note { white-space: pre-wrap; overflow-wrap: anywhere; }
  .detail-row { display: grid; gap: 7px; padding: 13px 19px; }
  .link-search { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: end; gap: 8px; }
  .save-status:empty { display: none; }
  .inline-error { color: var(--bad); }
  .quality-track { display: flex; width: 100%; height: 12px; background: var(--inset); border-radius: 5px; overflow: hidden; }
  .quality-track > span { flex: none; }
  .quality-active { background: var(--teal-fill); }
  .quality-contested { background: var(--amber); }
  .quality-archived { background: var(--control); }
  .quality-superseded { background: var(--agent); }
  .quality-labels { display: flex; flex-wrap: wrap; gap: 8px 13px; }
  .quality-labels a { display: inline-flex; align-items: center; gap: 6px; color: var(--ink); font-size: .82rem; }
  .quality-labels a:hover { text-decoration: underline; }
  .quality-labels i { width: 8px; height: 8px; border-radius: 2px; }
  .quality-source { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; }
  .check-row { display: grid; grid-template-columns: minmax(130px,.9fr) minmax(0,1.7fr) auto; gap: 10px; align-items: start; padding: 13px 19px; }
  .check-row .tag { justify-self: end; }
  .memory-row p { max-width: 90ch; white-space: pre-wrap; }
  .memory-row details summary { color: var(--teal); font-size: .85rem; font-weight: 650; cursor: pointer; width: fit-content; max-width: 100%; }
  .memory-row details ul { padding-left: 19px; margin-top: 4px; }
  .memory-row details li { overflow-wrap: anywhere; }
  .source { display: flex; align-items: baseline; gap: 6px; color: var(--muted); min-width: 0; }
  .source .icon { align-self: center; }
  .graph-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(225px, 27%); min-width: 0; }
  .graph-stage { position: relative; min-width: 0; height: 480px; background: var(--canvas); overflow: hidden; }
  #graph-svg { display: block; width: 100%; height: 100%; touch-action: none; cursor: grab; user-select: none; }
  #graph-svg.dragging { cursor: grabbing; }
  .cluster-area { fill: var(--project-bg); fill-opacity: .49; stroke: var(--graph-project); stroke-opacity: .25; }
  .graph-node { color: var(--memory); cursor: pointer; }
  .graph-node.project { color: var(--project); }
  .graph-node.agent { color: var(--agent); }
  .graph-node .node-surface { fill: var(--surface); stroke: var(--line); stroke-width: 1.25; }
  .graph-node.project .node-surface { fill: var(--project-bg); stroke: var(--graph-project); }
  .graph-node.agent .node-surface { fill: var(--agent-bg); stroke: var(--graph-agent); }
  .graph-node.dot-node .node-surface { stroke: var(--memory); }
  .graph-node .node-glyph { fill: currentColor; }
  .graph-node text { fill: var(--ink); font-size: 12px; font-weight: 600; }
  .graph-node .node-count { fill: var(--muted); font-size: 11px; font-weight: 550; }
  .graph-node:is(:hover,:focus-visible,[aria-pressed="true"]) .node-surface { stroke: currentColor; stroke-width: 2.2; }
  .graph-node.dot-node:is(:hover,:focus-visible,[aria-pressed="true"]) .node-surface { fill: var(--memory-bg); }
  .graph-node:focus-visible { outline: none; }
  .graph-node.unrelated { opacity: .34; }
  .graph-edge { fill: none; stroke: var(--graph-line); stroke-width: 1.15; opacity: .53; transition: opacity var(--ease); }
  .graph-edge.project-edge { stroke: var(--graph-project); }
  .graph-edge.agent-edge { stroke: var(--graph-agent); stroke-dasharray: 4 3; opacity: .35; }
  .graph-edge.active { stroke: var(--teal); stroke-width: 2.1; opacity: 1; }
  .graph-edge.agent-edge.active { stroke: var(--agent); }
  .graph-edge.recorded-edge { stroke: var(--agent); stroke-width: 1.8; opacity: .8; }
  .graph-edge.contradicts { stroke: var(--bad); stroke-dasharray: 5 3; }
  .graph-edge.supersedes { stroke: var(--teal); stroke-dasharray: 2 2; }
  .graph-edge.recorded-edge.active { stroke-width: 3; opacity: 1; }
  .graph-edge.unrelated { opacity: .13; }
  .graph-edge-hit { fill: none; stroke: transparent; stroke-width: 14; pointer-events: stroke; cursor: pointer; }
  .graph-link-group:is(:hover,:focus-visible) .graph-edge.recorded-edge { opacity: 1; stroke-width: 3; }
  .graph-link-group:focus-visible { outline: none; }
  .graph-arrow { fill: var(--agent); }
  .graph-tooltip { pointer-events: none; }
  .graph-tooltip rect { fill: var(--surface); stroke: var(--memory); }
  .graph-tooltip text { fill: var(--ink); font-size: 12px; font-weight: 650; }
  .graph-tools { position: absolute; bottom: 12px; left: 12px; display: flex; gap: 5px; align-items: center; }
  .graph-tools .button { min-height: 32px; }
  .graph-tools .icon-button { width: 32px; }
  .graph-tools output { padding: 4px 6px; background: var(--surface); color: var(--muted); border-radius: 5px; }
  .graph-inspector { min-width: 0; border-left: 1px solid var(--line); max-height: 480px; overflow-y: auto; }
  .graph-inspector .panel-body { display: grid; gap: 11px; }
  .graph-inspector p { white-space: pre-wrap; }
  .related { display: grid; gap: 5px; }
  .related .button { justify-content: start; overflow-wrap: anywhere; text-align: left; }
  .legend { display: flex; align-items: center; flex-wrap: wrap; gap: 7px 14px; padding: 11px 18px; border-top: 1px solid var(--line); color: var(--muted); font-size: .82rem; }
  .legend > span { display: inline-flex; align-items: center; gap: 5px; }
  .legend-glyph { display: inline-block; width: 9px; height: 9px; background: currentColor; flex: none; }
  .legend-glyph.project { border-radius: 2px; color: var(--project); }
  .legend-glyph.agent { border-radius: 50%; color: var(--agent); }
  .legend-glyph.memory { width: 7px; height: 7px; transform: rotate(45deg); color: var(--memory); margin-right: 2px; }
  .legend-line { display: inline-block; width: 16px; border-top: 2px solid var(--graph-line); }
  .legend-line.project-edge { border-color: var(--graph-project); }
  .legend-line.agent-edge { border-color: var(--graph-agent); border-top-style: dashed; }
  .legend-line.recorded-edge { border-color: var(--agent); }
  .graph-list { min-width: 0; max-height: 480px; overflow-y: auto; }
  .graph-list .graph-row { padding: 9px 12px; }
  .graph-list .button { justify-content: flex-start; text-align: left; width: 100%; }
  .graph-row .tag { margin-left: auto; }
  .context-layout { grid-template-columns: minmax(250px,.9fr) minmax(0,1.35fr); }
  .context-config { display: grid; gap: 12px; }
  .context-preview { white-space: pre-wrap; overflow-wrap: anywhere; background: var(--inset); border-radius: 7px; padding: 13px; margin: 0; max-height: 420px; overflow: auto; }
  .context-reasons { display: grid; gap: 10px; }
  .context-reasons summary { cursor: pointer; font-weight: 650; }
  .context-reasons li { padding: 8px 0; }
  .context-reasons li strong { overflow-wrap: anywhere; }
  .context-reasons li p { margin-top: 2px; }
  .settings { max-width: 930px; }
  .setting { display: flex; align-items: center; justify-content: space-between; gap: 15px; padding: 16px 19px; }
  .setting p { margin-top: 4px; }
  .switch { display: inline-flex; align-items: center; justify-content: end; gap: 7px; min-width: 87px; min-height: 36px; border-color: transparent; background: transparent; }
  .switch-track { width: 32px; height: 18px; border-radius: 11px; position: relative; background: var(--control); }
  .switch-track::after {
    content: ""; width: 12px; height: 12px; position: absolute; left: 3px; top: 3px; border-radius: 50%;
    background: white; transition: transform var(--ease);
  }
  .switch[aria-checked="true"] .switch-track { background: var(--teal-fill); }
  .switch[aria-checked="true"] .switch-track::after { transform: translateX(14px); background: var(--accent-ink); }
  .setting select { width: 131px; flex: none; }
  .save-status { padding: 8px 19px; min-height: 35px; border-top: 1px solid var(--line); }
  .save-status[data-error="true"] { color: var(--bad); }
  .notice { margin: 0 0 16px; }
  :root { --signal: #8fe5d3; --instrument: #142d3b; --instrument-deep: #102333; --instrument-ink: #f3f9fd; --instrument-muted: #b6cbd5; --instrument-line: #395663; }
  .rail { gap: 35px; }
  .nav-link[aria-current="page"] { box-shadow: inset 0 0 0 1px #426371; }
  .rail-live { margin-top: 11px; }
  .rail-live .icon { color: var(--rail-highlight); }
  .page-head h1 { font-size: 2.27rem; }
  .page-head .head-actions { align-items: end; }
  .page-head .head-actions .button { align-self: end; }
  .demo-notice { display: none; }
  html[data-demo="true"] .demo-notice { display: flex; gap: 7px 10px; flex-wrap: wrap; padding: 8px 12px; margin-bottom: 16px; background: var(--amber-bg); color: var(--amber); border-radius: 7px; font-size: .83rem; }
  html[data-demo="true"] .advanced-link { display: none; }
  .overview-summary { display: grid; grid-template-columns: minmax(0,1.1fr) minmax(0,1fr); color: var(--instrument-ink); background: var(--instrument); border-radius: 12px; overflow: hidden; margin-bottom: 17px; }
  .overview-summary .summary { grid-template-columns: repeat(3,minmax(0,1fr)); background: var(--instrument-deep); color: var(--instrument-ink); border: 0; border-radius: 0; margin: 0; }
  .overview-summary .summary-item { flex-direction: column; align-items: start; justify-content: center; gap: 11px; padding: 20px 16px; }
  .overview-summary .summary-item + .summary-item { border-color: var(--instrument-line); }
  .overview-summary .summary dt { color: var(--instrument-muted); font-size: .83rem; }
  .overview-summary .summary dd { font-size: 1.72rem; }
  .overview-summary .tile-icon { color: var(--signal); background: #234550; }
  .overview-lead { display: flex; align-items: center; gap: 19px; padding: 21px; min-width: 0; }
  .overview-lead h2 { font-size: 1.28rem; }
  .overview-lead p { color: var(--instrument-muted); margin-top: 5px; }
  .overview-lead .button { color: var(--signal); border-color: var(--instrument-line); margin-top: 12px; }
  .overview-lead .button:hover { background: #254350; }
  .coverage-ring { flex: none; display: grid; place-items: center; width: 98px; aspect-ratio: 1; border-radius: 50%; background: conic-gradient(var(--signal) var(--coverage), #3b5665 0); }
  .coverage-ring span { display: grid; place-items: center; width: 80px; aspect-ratio: 1; border-radius: 50%; background: var(--instrument); font-size: 1.46rem; font-weight: 720; font-variant-numeric: tabular-nums; }
  .overview-columns { grid-template-columns: minmax(0,1.33fr) minmax(0,1fr); }
  .overview-activity .panel-head { background: var(--inset); }
  .attention-list { max-height: 355px; overflow: auto; }
  .attention-row { display: grid; grid-template-columns: 30px minmax(0,1fr); gap: 11px; align-items: start; padding: 12px 19px; }
  .attention-row .tile-icon { width: 30px; height: 30px; background: var(--amber-bg); color: var(--amber); }
  .attention-row .tags { margin-top: 5px; }
  .graph-stage {
    --canvas: #142534; --surface: #203546; --ink: #f0f7fc; --muted: #bed0db; --line: #4b6679;
    --project: #a3e8d5; --project-bg: #234651; --agent: #d3c5ff; --agent-bg: #3a3e5e; --memory: #c2daf2; --memory-bg: #344d64;
    --graph-line: #8ba9bd; --graph-project: #82b8ab; --graph-agent: #aa9ed0; --graph-dot: #40566a; --teal: #9ce9d8; --bad: #ff9eab;
    height: 520px; color: var(--ink); color-scheme: dark;
  }
  .graph-stage .button:hover { background: #30485a; }
  .graph-stage .cluster-area { fill-opacity: .47; stroke-opacity: .34; }
  .graph-node { transition: opacity var(--ease); }
  .graph-node.selected-memory .node-surface { stroke: var(--teal); }
  .graph-stage .graph-edge.supports { stroke: var(--teal); }
  .graph-inspector, .graph-list { max-height: 520px; }
  .graph-body[data-lens="true"] .graph-stage { height: 390px; }
  .graph-body[data-lens="true"] :is(.graph-inspector,.graph-list) { max-height: 390px; }
  .graph-lens { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px 14px; border-bottom: 1px solid var(--line); }
  .legend-line.supports { border-color: var(--teal); }
  .legend-line.contradicts { border-color: var(--bad); border-top-style: dashed; }
  .legend-line.supersedes { border-color: var(--teal); border-top-style: dotted; }
  .context-layout { grid-template-columns: minmax(255px,.68fr) minmax(0,1.75fr); }
  .context-config { gap: 16px; }
  .context-config .form-actions .primary { width: 100%; }
  .context-settings-pair { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 10px; }
  .context-result-head { background: var(--inset); }
  .context-output-head { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: start; gap: 10px; }
  .context-output-head .form-actions { justify-content: end; }
  .context-metrics { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); border-block: 1px solid var(--line); }
  .context-metrics > div { padding: 11px 10px; min-width: 0; }
  .context-metrics > div + div { border-left: 1px solid var(--line); }
  .context-metrics dt { font-size: .78rem; color: var(--muted); }
  .context-metrics dd { font-size: 1.21rem; font-weight: 710; overflow-wrap: anywhere; }
  .context-budget-track { height: 6px; border-radius: 4px; background: var(--line); overflow: hidden; margin-top: 5px; }
  .context-budget-track span { display: block; height: 100%; background: var(--teal-fill); border-radius: inherit; }
  .context-section { display: grid; gap: 11px; min-width: 0; }
  .context-section > summary, .candidate > summary { cursor: pointer; font-weight: 680; }
  .context-section > summary { color: var(--teal); }
  .context-section[open] > summary { margin-bottom: 10px; }
  .retrieval-flow { display: grid; grid-template-columns: repeat(auto-fit,minmax(97px,1fr)); gap: 1px; list-style: none; padding: 1px; border-radius: 8px; background: var(--instrument-line); overflow: hidden; }
  .retrieval-flow li { display: grid; grid-template-rows: auto 1fr auto; gap: 5px; min-width: 0; background: var(--instrument-deep); color: var(--instrument-ink); padding: 10px; }
  .retrieval-flow strong { font-size: 1.28rem; font-variant-numeric: tabular-nums; }
  .retrieval-flow span { font-size: .78rem; color: var(--instrument-muted); overflow-wrap: anywhere; }
  .retrieval-flow li:last-child { background: var(--instrument); }
  .retrieval-flow li:last-child strong { color: var(--signal); }
  .retrieval-stage-bar { height: 3px; background: var(--instrument-line); border-radius: 2px; overflow: hidden; }
  .retrieval-stage-bar i { display: block; height: 100%; background: var(--signal); opacity: .74; }
  .candidate-list { max-height: 415px; overflow: auto; border-block: 1px solid var(--line); }
  .candidate { padding: 9px 9px 9px 12px; }
  .candidate > summary { color: var(--ink); }
  .candidate > summary:hover { color: var(--teal); }
  .candidate-title { display: inline-grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: baseline; gap: 7px; width: calc(100% - 20px); vertical-align: top; }
  .candidate-title .rank { color: var(--muted); font: .8rem Consolas,monospace; }
  .candidate-body { display: grid; gap: 7px; padding: 9px 0 4px; }
  .candidate-signals { display: grid; grid-template-columns: repeat(auto-fit,minmax(110px,1fr)); gap: 5px; }
  .candidate-signals div { background: var(--inset); border-radius: 5px; padding: 6px; }
  .candidate-signals dt { color: var(--muted); font-size: .75rem; }
  .candidate-signals dd { font-size: .89rem; font-variant-numeric: tabular-nums; }
  .context-compare { display: grid; gap: 8px; }
  .compare-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); border: 1px solid var(--line); border-radius: 7px; overflow: hidden; }
  .compare-grid > div { padding: 10px; min-width: 0; }
  .compare-grid > div + div { border-left: 1px solid var(--line); }
  .compare-grid ul { padding-left: 16px; }
  .compare-grid h3 { margin-bottom: 5px; }
  .integration-meta { display: flex; flex-wrap: wrap; gap: 7px; padding: 12px 19px; border-bottom: 1px solid var(--line); }
  .integration-config { display: grid; gap: 8px; }
  .integration-config > summary { cursor: pointer; color: var(--teal); font-weight: 650; }
  .integration-config[open] > summary { margin-bottom: 8px; }
  .integration-config .context-preview { margin-block: 7px; max-height: 280px; }
  .setting .settings-description { display: flex; align-items: start; gap: 11px; }
  .setting .tile-icon { width: 32px; height: 32px; }
  html[data-motion="reduce"] *, html[data-motion="reduce"] *::before, html[data-motion="reduce"] *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
  }
  @media (max-width: 1140px) {
    :root { --sidebar: 188px; }
    .top, .content { padding-left: 24px; padding-right: 24px; }
    .filters { grid-template-columns: repeat(4,minmax(0,1fr)); }
    .filters .search-field { grid-column: span 3; }
    .filters .button { grid-column: 4; grid-row: 1; }
    .overview-columns { grid-template-columns: minmax(0,1.25fr) minmax(0,1fr); }
    .event { grid-template-columns: 27px minmax(0,1fr); }
    .event time { grid-column: 2; }
  }
  @media (max-width: 900px) {
    :root { --sidebar: 66px; }
    .rail { padding-left: 10px; padding-right: 10px; }
    .rail .brand { justify-content: center; padding: 0; }
    .nav-link { justify-content: center; min-height: 41px; }
    .brand-name, .nav-label, .rail-foot .arrow, .rail-build { display: none; }
    .context-layout { grid-template-columns: minmax(0,1fr); }
  }
  @media (max-width: 690px) {
    :root { --header: 48px; font-size: 14px; }
    .shell { display: block; }
    .rail { z-index: var(--sticky); height: auto; flex-direction: row; align-items: center; gap: 7px; padding: 5px 10px; }
    .rail-live { display: none; }
    .rail-nav { display: flex; gap: 3px; }
    .nav-link { padding: 7px 9px; min-height: 35px; }
    .rail-foot { margin: 0 0 0 auto; padding: 0; border: 0; }
    .brand-mark { width: 30px; height: 30px; }
    .top { padding: 7px 13px; }
    .top-actions { gap: 8px; }
    .content { padding: 22px 12px 32px; }
    h1, .page-head h1 { font-size: 1.68rem; }
    .page-head { gap: 8px; margin-bottom: 17px; flex-wrap: wrap; }
    .summary { margin-bottom: 13px; }
    .summary-item { gap: 6px; padding: 11px 9px; }
    .summary-item .tile-icon { display: none; }
    .split { grid-template-columns: minmax(0,1fr); gap: 13px; }
    .filters { grid-template-columns: repeat(2,minmax(0,1fr)); }
    .filters .search-field { grid-column: 1; }
    .filters .button { grid-column: 2; grid-row: 1; }
    .check-row { grid-template-columns: minmax(0,1fr) auto; padding-left: 12px; padding-right: 12px; }
    .check-row .check-result { grid-column: 1 / -1; grid-row: 2; }
    .check-row .tag { grid-column: 2; grid-row: 1; }
    .graph-body { grid-template-columns: minmax(0,1fr); }
    .graph-stage, .graph-list { height: 365px; }
    .graph-body[data-lens="true"] .graph-stage { height: 310px; }
    .graph-inspector { border-left: 0; border-top: 1px solid var(--line); max-height: 340px; }
    .panel-head, .panel-body, .memory-row, .setting { padding-left: 12px; padding-right: 12px; }
    .project-row, .event { padding-left: 12px; padding-right: 12px; }
    .list-footer { flex-wrap: wrap; }
    .graph-mode { margin-left: 0; }
    .overview-summary { grid-template-columns: minmax(0,1fr); }
    .overview-summary .summary-item { padding: 11px 10px; }
    .overview-summary .summary dd { font-size: 1.42rem; }
    .overview-lead { padding: 15px; gap: 12px; }
    .coverage-ring { width: 77px; }
    .coverage-ring span { width: 63px; font-size: 1.16rem; }
    .context-output-head { grid-template-columns: minmax(0,1fr); }
    .context-output-head .form-actions { justify-content: start; }
    #context-result, #attention-heading { scroll-margin-top: 55px; }
    .context-metrics > div { padding: 8px 6px; }
    .context-metrics dd { font-size: 1rem; }
    .retrieval-flow { grid-template-columns: repeat(3,minmax(0,1fr)); }
    .candidate-title { grid-template-columns: auto minmax(0,1fr); }
    .candidate-title .tag { grid-column: 2; justify-self: start; }
  }
  @media (max-width: 355px) {
    .rail { gap: 3px; }
    .nav-link { padding-left: 5px; padding-right: 5px; }
    .crumb > .muted, .crumb .icon { display: none; }
    .filters { grid-template-columns: repeat(2,minmax(0,1fr)); }
    .filters .search-field { grid-column: 1 / -1; }
    .filters .button { grid-row: auto; grid-column: auto; }
  }
${PROJECT_KIT_STYLE}
</style>
</head>
<body>
<a class="skip button" href="#main-content">Skip to content</a>
<div class="shell">
  <aside class="rail">
    <a class="brand" href="#overview" aria-label="Agent Shadow Brain overview">
      <span class="brand-mark" data-icon="brand"></span><span class="brand-name">Agent Shadow Brain</span>
    </a>
    <nav class="rail-nav" aria-label="Workspace">
      <a class="nav-link" href="#overview" aria-label="Overview" title="Overview" data-view="overview" aria-current="page"><span data-icon="overview"></span><span class="nav-label">Overview</span></a>
      <a class="nav-link" href="#memories" aria-label="Memories" title="Memories" data-view="memories"><span data-icon="memory"></span><span class="nav-label">Memories</span></a>
      <a class="nav-link" href="#graph" aria-label="Graph" title="Graph" data-view="graph"><span data-icon="graph"></span><span class="nav-label">Graph</span></a>
      <a class="nav-link" href="#context" aria-label="Context Lab" title="Context Lab" data-view="context"><span data-icon="context"></span><span class="nav-label">Context Lab</span></a>
      <a class="nav-link" href="#project-kit" aria-label="Project Kit" title="Project Kit" data-view="project-kit"><span data-icon="project"></span><span class="nav-label">Project Kit</span></a>
      <a class="nav-link" href="#integrations" aria-label="Integrations and health" title="Integrations and health" data-view="integrations"><span data-icon="integrations"></span><span class="nav-label">Integrations</span></a>
      <a class="nav-link" href="#features" aria-label="Features" title="Features" data-view="features"><span data-icon="settings"></span><span class="nav-label">Features</span></a>
      <a class="nav-link rail-live" href="/live" aria-label="Live operations" title="Live operations"><span data-icon="activity"></span><span class="nav-label">Live operations</span></a>
    </nav>
    <div class="rail-foot">
      <a class="nav-link advanced-link" href="/advanced" aria-label="Advanced dashboard" title="Advanced dashboard"><span data-icon="advanced"></span><span class="nav-label">Advanced tools</span><span class="arrow" data-icon="diagonal"></span></a>
      <p class="rail-build" id="rail-version">Local workspace</p>
    </div>
  </aside>
  <div class="main">
    <header class="top">
      <div class="crumb"><span class="muted">Workspace</span><span data-icon="chevron"></span><strong id="crumb">Overview</strong></div>
      <div class="top-actions">
        <a class="button quiet live-link" href="/live"><span data-icon="activity"></span>Live</a>
        <span class="connection muted small" id="connection" data-state="loading"><span class="dot"></span><span id="connection-label">Connecting</span></span>
        <button type="button" class="button icon-button quiet" id="theme-toggle" aria-label="Switch to dark theme" title="Switch to dark theme"><span data-icon="moon"></span></button>
      </div>
    </header>
    <main id="main-content" class="content" tabindex="-1">
      <div class="demo-notice"><strong>Synthetic demo</strong><span>Scripted local MCP calls use sample data. Changes affect this temporary demo only.</span></div>
      <div class="project-local-notice"><strong>Project workspace</strong><span>Memory and settings are stored with this project.</span><a href="#project-kit">Open Project Kit</a></div>
      <div class="notice" id="workspace-notice" role="status" hidden></div>
      <section id="page-overview" aria-labelledby="title-overview">
        <div class="page-head">
          <div><h1 id="title-overview" tabindex="-1">Memory workspace</h1><p class="muted">Review saved knowledge and prepare a brief for your next task.</p></div>
          <div class="form-actions head-actions"><label class="label" for="overview-quality-project">Project<select id="overview-quality-project"><option value="">All projects</option></select></label>
          <a href="#context" id="overview-context" class="button primary"><span data-icon="context"></span>Open Context Lab</a></div>
        </div>
        <div id="overview-body" aria-busy="true"></div>
      </section>
      <section id="page-memories" aria-labelledby="title-memories" hidden>
        <div class="page-head"><div><h1 id="title-memories" tabindex="-1">Memories</h1><p class="muted">Search saved lessons and see why they were recalled.</p></div></div>
        <div class="stack">
          <form id="memory-form" class="panel panel-body filters" role="search" aria-label="Search memories">
            <label class="label search-field" for="memory-query">Search<span data-icon="search"></span><input id="memory-query" type="search" maxlength="500" placeholder="Search memories"></label>
            <label class="label" for="memory-project">Project<select id="memory-project"><option value="">All projects</option></select></label>
            <label class="label" for="memory-category">Category<select id="memory-category"><option value="">All categories</option></select></label>
            <label class="label" for="memory-agent">Agent<select id="memory-agent"><option value="">All agents</option></select></label>
            <label class="label" for="memory-state">Status<select id="memory-state"><option value="">All statuses</option><option value="active">Active</option><option value="contested">Needs review</option><option value="archived">Archived</option><option value="superseded">Superseded</option></select></label>
            <button class="button primary" id="memory-search" type="submit"><span data-icon="search"></span>Search</button>
          </form>
          <div id="memory-results" class="panel" aria-busy="true"></div>
        </div>
      </section>
      <section id="page-memory" aria-labelledby="title-memory" hidden>
        <div class="page-head">
          <div class="detail-head"><a id="detail-back" href="#memories" class="button quiet"><span data-icon="left"></span>Memories</a><h1 id="title-memory" tabindex="-1">Memory detail</h1><div id="detail-meta"></div></div>
          <div class="form-actions" id="detail-actions" hidden>
            <a id="detail-graph" class="button" href="#graph"><span data-icon="graph"></span>View on graph</a>
            <a id="detail-context" class="button" href="#context"><span data-icon="context"></span>Assemble context</a>
            <a id="detail-outcome" class="button" href="#project-kit" hidden><span data-icon="activity"></span>Record outcome</a>
          </div>
        </div>
        <div id="detail-body" aria-busy="true"></div>
      </section>
      <section id="page-graph" aria-labelledby="title-graph" hidden>
        <div class="page-head"><div><h1 id="title-graph" tabindex="-1">Graph</h1><p class="muted">Explore project membership, recording agents, and links between memories.</p></div></div>
        <div class="stack">
          <div class="panel panel-body filter-bar">
            <label class="label search-field" for="graph-query">Find a node<span data-icon="search"></span><input id="graph-query" type="search" maxlength="200" placeholder="Filter by name"></label>
            <label class="label" for="graph-project">Project<select id="graph-project"><option value="">All projects</option></select></label>
            <label class="label" for="graph-kind">Node type<select id="graph-kind"><option value="">All types</option><option value="project">Projects</option><option value="agent">Agents</option><option value="memory">Memories</option></select></label>
            <label class="label" for="graph-relation">Relationship<select id="graph-relation"><option value="">All relationships</option><option value="recorded">Memory links</option><option value="belongs-to">Project membership</option><option value="recorded-by">Recording agent</option><option value="related">Related</option><option value="supports">Supports</option><option value="contradicts">Contradicts</option><option value="supersedes">Supersedes</option></select></label>
            <div class="form-actions toolbar-end graph-mode" role="group" aria-label="Graph view">
              <button type="button" class="button" id="graph-mode-map" aria-pressed="true"><span data-icon="graph"></span>Map</button>
              <button type="button" class="button" id="graph-mode-list" aria-pressed="false"><span data-icon="list"></span>List</button>
            </div>
          </div>
          <div class="panel" id="graph-panel" aria-busy="true">
            <div class="panel-head"><h2>Memory relationships</h2><span id="graph-count" class="muted small" role="status"></span></div>
            <div id="graph-lens" class="graph-lens" hidden><p class="small muted" id="graph-lens-label"></p><button class="button" type="button" id="graph-lens-clear">Show full graph</button></div>
            <div id="graph-status"></div>
            <div class="graph-body" id="graph-body" hidden>
              <div class="graph-stage" id="graph-stage">
                <svg id="graph-svg" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Memory relationship map. Use arrow keys to navigate nodes or links."></svg>
                <div class="graph-tools" role="group" aria-label="Map zoom">
                  <button class="button icon-button" type="button" id="graph-out" aria-label="Zoom out" title="Zoom out"><span data-icon="minus"></span></button>
                  <button class="button icon-button" type="button" id="graph-in" aria-label="Zoom in" title="Zoom in"><span data-icon="plus"></span></button>
                  <button class="button" type="button" id="graph-fit">Fit</button>
                  <output id="graph-scale" class="small" aria-label="Zoom level">100%</output>
                </div>
              </div>
              <div id="graph-list" class="graph-list" hidden></div>
              <aside id="graph-inspector" class="graph-inspector" aria-label="Selected node details"></aside>
            </div>
            <div id="graph-legend" class="legend" hidden>
              <span><i class="legend-glyph project"></i> Project</span><span><i class="legend-glyph agent"></i> Agent</span><span><i class="legend-glyph memory"></i> Memory</span>
              <span><i class="legend-line project-edge"></i> Belongs to project</span><span><i class="legend-line agent-edge"></i> Recorded by agent</span>
              <span><i class="legend-line recorded-edge"></i> Related</span><span><i class="legend-line supports"></i> Supports</span>
              <span><i class="legend-line contradicts"></i> Contradicts</span><span><i class="legend-line supersedes"></i> Supersedes</span>
            </div>
          </div>
        </div>
      </section>
      <section id="page-context" aria-labelledby="title-context" hidden>
        <div class="page-head"><div><h1 id="title-context" tabindex="-1">Context Lab</h1><p class="muted">Assemble a task brief, inspect its evidence, and compare retrieval profiles.</p></div></div>
        <div class="split context-layout">
          <div class="panel">
            <div class="panel-head"><h2>Build a brief</h2></div>
            <form class="panel-body context-config" id="context-form">
              <label class="label" for="context-project">Project<select id="context-project" required><option value="">Select a project</option></select></label>
              <label class="label" for="context-task">Task<textarea id="context-task" rows="5" maxlength="4096" required placeholder="Describe what the agent will work on."></textarea></label>
              <div class="context-settings-pair">
                <label class="label" for="context-budget">Token budget<input id="context-budget" type="number" inputmode="numeric" min="0" max="12000" step="1" value="2000" required aria-describedby="context-estimate"></label>
                <label class="label" for="context-profile">Retrieval<select id="context-profile"><option value="adaptive">Adaptive</option><option value="legacy">Legacy</option></select></label>
              </div>
              <p class="small muted" id="context-estimate">Token usage is estimated for the assembled brief.</p>
              <label class="inline-check small" id="context-related-row"><input type="checkbox" id="context-related" checked>Expand through recorded supporting and related links</label>
              <label class="inline-check small" id="context-cross-row" hidden><input type="checkbox" id="context-cross">Include eligible memories from other projects</label>
              <div id="context-gate"></div>
              <div class="form-actions"><button class="button primary" id="context-submit" type="submit" disabled><span data-icon="context"></span>Assemble context</button></div>
            </form>
          </div>
          <div class="panel" id="context-result"><div class="panel-head context-result-head"><h2>Brief and evidence</h2><span class="small muted" id="context-result-state" role="status">Ready for a task</span></div><div id="context-output"></div></div>
        </div>
      </section>
${PROJECT_KIT_MARKUP}
      <section id="page-integrations" aria-labelledby="title-integrations" hidden>
        <div class="page-head">
          <div><h1 id="title-integrations" tabindex="-1">Integrations &amp; health</h1><p class="muted">Check local storage and see which capabilities each agent supports.</p></div>
          <button class="button" type="button" id="integrations-refresh"><span data-icon="refresh"></span>Run checks</button>
        </div>
        <div id="integrations-body" aria-busy="true"></div>
      </section>
      <section id="page-features" aria-labelledby="title-features" hidden>
        <div class="page-head"><div><h1 id="title-features" tabindex="-1">Features</h1><p class="muted">Control how Shadow Brain assembles context and updates the workspace.</p></div></div>
        <div class="stack settings">
          <div class="panel"><div class="panel-head"><h2>Workspace features</h2></div><div id="feature-list" aria-busy="true"></div><p class="save-status small muted" role="status" id="feature-status"></p></div>
          <div class="panel">
            <div class="panel-head"><h2>Display</h2></div>
            <ul class="list">
              <li class="setting"><div><h3><label for="theme-setting">Theme</label></h3><p class="small muted">Choose the workspace color scheme on this device.</p></div><select id="theme-setting"><option value="light">Light</option><option value="dark">Dark</option></select></li>
              <li class="setting"><div><h3><label for="motion-setting">Motion</label></h3><p class="small muted">Follow your system preference or reduce interface motion.</p></div><select id="motion-setting"><option value="system">System</option><option value="reduce">Reduced</option></select></li>
            </ul>
            <p id="display-status" class="save-status small muted" role="status" hidden></p>
          </div>
        </div>
      </section>
    </main>
  </div>
</div>
<script>
'use strict';

const glyphs = {
  brand: '<path d="M12 5 5 9v6l7 4 7-4V9l-7-4v7m-7-3 7 3 7-3m-7 3v7"/><circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/>',
  overview: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9.5h17m-11 0V20"/>',
  memory: '<path d="M4 7.5h16M6 7.5v11a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5v-11M9 12h6"/><rect x="3" y="4" width="18" height="4" rx="1"/>',
  graph: '<path d="m6 6 6 6m0 0 6-6m-6 6v6"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>',
  context: '<path d="M9 8h6m-6 4h6m-6 4h4M6 3h9l4 4v14H6zM15 3v5h4"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2.4" fill="var(--icon-bg, var(--rail))"/><circle cx="15" cy="17" r="2.4" fill="var(--icon-bg, var(--rail))"/>',
  advanced: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="m7.5 9 3 3-3 3m5.5 0h3.5"/>',
  diagonal: '<path d="M6 18 18 6M8 6h10v10"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  left: '<path d="m14 6-6 6 6 6"/>',
  moon: '<path d="M20 15a8.5 8.5 0 0 1-11-11 8.5 8.5 0 1 0 11 11Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19m0-14-1.5 1.5m-11 11L5 19"/>',
  project: '<path d="M3.5 7V6A1.5 1.5 0 0 1 5 4.5h4l2 2h8A1.5 1.5 0 0 1 20.5 8v10A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18Z"/>',
  agent: '<rect x="4.5" y="7" width="15" height="12" rx="3"/><path d="M12 7V4m-8 9H2m20 0h-2m-11-.5h.02m5.98 0H15m-5 3h4"/>',
  activity: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  integrations: '<path d="M9 3v4m6-4v4m-8 0h10v4a5 5 0 0 1-5 5h0a5 5 0 0 1-5-5zm5 9v5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  source: '<path d="M9.5 14.5 14.5 9m-6 8.5-1 1a3.5 3.5 0 0 1-5-5L7 9a3.5 3.5 0 0 1 5 0m3.5-2.5 1-1a3.5 3.5 0 0 1 5 5L17 15a3.5 3.5 0 0 1-5 0"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  warning: '<path d="m12 3 10 17H2L12 3zm0 6v4m0 3h.01"/>',
  refresh: '<path d="M19.5 9a8 8 0 1 0 .3 5.5M20 4v5h-5"/>'
};
const viewNames = { overview: 'Overview', memories: 'Memories', memory: 'Memory detail', graph: 'Graph', context: 'Context Lab', 'project-kit': 'Project Kit', integrations: 'Integrations', features: 'Features' };
const reviewStates = { active: 'Active', contested: 'Needs review', archived: 'Archived', superseded: 'Superseded' };
const linkTypes = { related: 'Related', supports: 'Supports', contradicts: 'Contradicts', supersedes: 'Supersedes' };
const definitions = [
  { id: 'contextAssembly', label: 'Context assembly', description: 'Build a task-specific brief from saved project memories.' },
  { id: 'crossProjectContext', label: 'Cross-project context', description: 'Allow context assembly to include eligible memories from other projects when requested.' },
  { id: 'automaticBriefing', label: 'Automatic briefing', description: 'Include a context brief when a supported agent starts work in a project.' },
  { id: 'liveActivity', label: 'Live activity', description: 'Refresh the workspace activity feed automatically.' },
  { id: 'activityRecording', label: 'Record agent activity', description: 'Record bounded tool timing and explicitly reported session phases.' }
];
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const icon = (name, small = false) => '<svg class="icon' + (small ? ' small-icon' : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (glyphs[name] || '') + '</svg>';
const list = (value) => Array.isArray(value) ? value : [];
const compact = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const shorten = (value, limit) => value.length > limit ? value.slice(0, limit - 1) + '…' : value;
const number = (value) => Number(value || 0).toLocaleString();
const countLabel = (value, singular, plural = singular + 's') => number(value) + ' ' + (Number(value) === 1 ? singular : plural);
const nice = (value) => String(value ?? '').replace(/[-_]/g, ' ').replace(/^./, (char) => char.toUpperCase());
const tags = (items) => '<div class="tags">' + items.filter(([, value]) => value).map(([kind, value]) =>
  '<span class="tag ' + esc(kind) + '">' + esc(value) + '</span>').join('') + '</div>';
const DATE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const TIME = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const state = {
  view: '', route: '', projects: [], overviewLoaded: false, overviewPending: null, overviewScope: '', overviewRequest: 0, overviewRequestScope: '',
  activity: [], activityEnabled: null, activityPending: false, features: null, featurePending: null, featureSaving: false,
  health: { snapshot: null, project: '', filter: '', request: 0 }, projectKit: null,
  memory: { query: null, request: 0, controller: null, limit: 20, offset: 0 },
  detail: { snapshot: null, id: '', project: '', back: '#memories', request: 0, targetRequest: 0, saving: false },
  graph: { snapshot: null, project: null, mode: matchMedia('(max-width: 690px)').matches ? 'list' : 'map', selected: '', selectedEdge: '', focusMemory: '', lens: '', nodes: [], edges: [], layout: null, zoom: 1, panX: 0, panY: 0, request: 0, controller: null, drag: null },
  context: { pack: null, params: null, comparison: null, comparing: false, pending: false, dirty: false, routeProject: '' },
  integrations: { snapshot: null, pending: false }
};

document.querySelectorAll('[data-icon]').forEach((element) => { element.innerHTML = icon(element.dataset.icon); });

function dateMarkup(value, full = false) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const today = new Date();
  const dateText = full || date.getFullYear() !== today.getFullYear() ? DATE.format(date) : TIME.format(date);
  return '<time class="small muted" datetime="' + esc(date.toISOString()) + '" title="' + esc(date.toLocaleString()) + '">' + esc(dateText) + '</time>';
}

function blank(iconName, title, detail, action = '') {
  return '<div class="blank">' + icon(iconName) + '<h3>' + esc(title) + '</h3><p class="small muted">' + esc(detail) + '</p>' + action + '</div>';
}

function skeleton(label) {
  return '<div class="skeleton" role="status"><span class="muted small">' + esc(label) + '</span><i></i><i></i><i></i></div>';
}

function errorMarkup(message, retry) {
  return '<div class="status error" role="alert">' + icon('warning') + '<span>' + esc(message) + '</span>' +
    (retry ? '<button class="button quiet" data-retry="' + retry + '" type="button">Try again</button>' : '') + '</div>';
}

function setBusy(element, isBusy) {
  element.setAttribute('aria-busy', String(isBusy));
}

function connection(value) {
  $('connection').dataset.state = value;
  $('connection-label').textContent = value === 'connected' ? 'Local server' : value === 'error' ? 'Disconnected' : 'Connecting';
}

async function api(path, { body, signal } = {}) {
  let response;
  try {
    response = await fetch('/api/workspace/' + path, {
      headers: body ? { Accept: 'application/json', 'Content-Type': 'application/json' } : { Accept: 'application/json' },
      method: body ? 'POST' : 'GET',
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: signal || AbortSignal.timeout(12000)
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    connection('error');
    throw new Error('Could not reach the local Shadow Brain server.');
  }
  connection('connected');
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const error = new Error(response.ok ? 'The server returned an unreadable response.' : data?.error || 'The server could not complete this request.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function optionSet(id, placeholder, values, preferred) {
  const select = $(id);
  const previous = preferred ?? select.value;
  const choices = values.filter((item) => item && item.id);
  const signature = JSON.stringify(choices);
  if (select.dataset.signature !== signature) {
    select.replaceChildren(new Option(placeholder, ''), ...choices.map((item) => new Option(item.name || item.id, item.id)));
    select.dataset.signature = signature;
  }
  if (previous && Array.from(select.options).some((option) => option.value === previous)) select.value = previous;
  else select.value = '';
}

function queryPath(name, params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== '' && value != null) search.set(key, String(value)); });
  return name + (search.size ? '?' + search : '');
}

function routeLink(view, params) {
  return '#' + queryPath(view, params);
}

function memoryLink(id, project, label, className = 'record-link') {
  if (!id || !project) return esc(label);
  return '<a class="' + className + '" href="' + esc(routeLink('memory', { id, project })) + '">' + esc(label) + '</a>';
}

function reviewLabel(value) {
  return Object.hasOwn(reviewStates, value) ? reviewStates[value] : '';
}

function reviewTag(value) {
  const label = reviewLabel(value);
  return label ? '<span class="tag state-' + value + '">' + label + '</span>' : '';
}

function renderSummary(totals) {
  return '<dl class="summary">' + [
    ['memory', 'Total stored memories', totals.memories], ['project', 'Projects', totals.projects], ['agent', 'Contributing agents', totals.agents]
  ].map(([image, label, value]) => '<div class="summary-item"><span class="tile-icon">' + icon(image) +
    '</span><div><dt>' + label + '</dt><dd>' + number(value) + '</dd></div></div>').join('') + '</dl>';
}

function renderOverviewSummary(data) {
  const counts = data.quality || {};
  const total = Number(counts.total) || 0;
  const sources = Number(counts.sourceBacked) || 0;
  const percent = total ? Math.round(Math.min(1, sources / total) * 100) : 0;
  const project = data.scope?.projectId;
  const scope = project ? state.projects.find((item) => item.id === project)?.name || project : 'All projects';
  return '<div class="overview-summary"><div class="overview-lead"><div class="coverage-ring" aria-hidden="true" style="--coverage:' + percent + '%"><span>' +
    (total ? percent + '%' : '—') + '</span></div><div><h2>Recorded source coverage</h2><p class="small">' +
    esc(scope) + ' · ' + number(sources) + ' of ' + number(total) + (data.truncated ? ' sampled memories' : ' memories') +
    '</p><button class="button quiet" type="button" id="attention-jump">Review attention queue ' + icon('chevron', true) + '</button></div></div>' + renderSummary(data.totals || {}) + '</div>';
}

function renderProjects(projects) {
  if (!projects.length) return blank('project', 'No projects yet', 'Projects appear after an agent stores a memory with a project scope.');
  const max = Math.max(1, ...projects.map((project) => Number(project.memories) || 0));
  return '<ul class="list">' + [...projects].sort((a, b) => b.memories - a.memories).slice(0, 8).map((project) => {
    const size = Math.max(0, Math.min(100, Math.round((Number(project.memories) || 0) / max * 100)));
    const href = routeLink('memories', { project: project.id });
    return '<li class="project-row"><div><a class="project-name" href="' + esc(href) + '">' + icon('project', true) +
      '<span>' + esc(project.name || project.id) + '</span></a>' +
      (project.updatedAt ? '<div class="project-detail">' + dateMarkup(project.updatedAt, true) + '</div>' : '') +
      '</div><div class="project-count">' + countLabel(project.memories, 'memory', 'memories') +
      '<span class="project-meter" aria-hidden="true"><span style="width:' + size + '%"></span></span></div>' +
      '<a class="button icon-button quiet" aria-label="' + esc('View memories for ' + (project.name || project.id)) + '" href="' + esc(href) + '">' + icon('chevron') + '</a></li>';
  }).join('') + '</ul>';
}

function renderOverviewMemories(memories) {
  if (!memories.length) return '';
  return '<div class="panel"><div class="panel-head"><h2>Latest memories</h2><a class="button quiet" href="#memories">Browse ' + icon('chevron', true) +
    '</a></div><ul class="list">' + memories.map((item) => '<li class="overview-memory"><div class="memory-head"><strong>' +
    memoryLink(item.id, item.project, item.title || nice(item.category) || 'Memory') + '</strong>' + dateMarkup(item.updatedAt, true) + '</div>' +
    tags([['project', item.projectName || item.project], ['agent', item.agent], ['memory', nice(item.category)], ['state-' + (item.effectiveState || ''), reviewLabel(item.effectiveState)]]) + '</li>').join('') + '</ul></div>';
}

function renderQuality(data) {
  const quality = data.quality;
  if (!quality || !Number.isFinite(quality.total)) return '';
  const project = data.scope?.projectId || '';
  const scope = data.truncated ? 'Based on the latest ' + number(data.inventoryLimit) + ' stored memories.' :
    project ? 'Stored memories in this project.' : 'Stored memories across projects.';
  const statusCounts = Object.entries(reviewStates).map(([key, label]) => ({ key, label, count: Number(quality[key]) || 0 }));
  const coverage = quality.total ? Math.max(0, Math.min(100, Number(quality.sourceBacked || 0) / quality.total * 100)) : 0;
  const statusBars = statusCounts.map(({ key, count }) =>
    '<span class="quality-' + key + '" style="width:' + Math.max(0, Math.min(100, count / quality.total * 100)) + '%"></span>').join('');
  const statusLinks = statusCounts.map(({ key, label, count }) => '<a href="' + esc(routeLink('memories', { project, state: key })) +
    '"><i aria-hidden="true" class="quality-' + key + '"></i>' + esc(label) + ' <strong>' + number(count) + '</strong></a>').join('');
  return '<div class="panel"><div class="panel-head"><div><h2>Review and sources</h2><p class="small muted">' + esc(scope) +
    '</p></div></div>' + (quality.total ? '<div class="panel-body stack"><div class="stack" style="gap:8px"><h3>Memory status</h3>' +
    '<div class="quality-track" aria-hidden="true">' + statusBars + '</div><div class="quality-labels">' + statusLinks + '</div></div>' +
    '<div class="stack" style="gap:8px"><div class="quality-source"><h3>Recorded sources</h3><span class="small muted">' +
    number(quality.sourceBacked) + ' of ' + number(quality.total) + ' memories</span></div>' +
    '<div class="quality-track" aria-hidden="true"><span class="quality-active" style="width:' + coverage + '%"></span></div></div>' +
    (Number.isFinite(quality.reviewed) ? '<p class="small muted">' + number(quality.reviewed) + ' with a recorded review</p>' : '') +
    '</div>' : blank('memory', 'No memories in scope', 'Save a memory to see review and source counts here.')) + '</div>';
}

const healthIssues = {
  contested: 'Needs review', contradiction: 'Contradictory link', 'orphaned-link': 'Missing linked memory',
  duplicate: 'Repeated content', 'no-source': 'No recorded source', 'older-memory': 'Older than 90 days'
};

function renderAttention() {
  const target = $('attention-results');
  const store = state.health;
  if (!target || !store.snapshot || store.project !== state.overviewScope) return;
  const data = store.snapshot;
  const counts = data.counts || {};
  const rows = list(data.queue).filter((item) => !store.filter || list(item.issues).some((issue) => issue.kind === store.filter));
  const options = Object.entries(healthIssues).map(([value, label]) => '<option value="' + value + '">' + label + '</option>').join('');
  const controls = $('attention-filter');
  if (!controls.childElementCount) controls.innerHTML = '<option value="">All issues</option>' + options;
  controls.value = store.filter;
  controls.disabled = !list(data.queue).length;
  const scopeNote = (data.coverage?.truncated ? 'Checked the latest ' + number(data.coverage.limit) + ' memories in scope.' : 'Checked ' + number(counts.total) + ' memories in scope.');
  $('attention-scope').textContent = scopeNote;
  const warnings = list(data.warnings).map((warning) => '<p class="small muted panel-body">' + esc(warning) + '</p>').join('');
  const count = '<p class="small muted panel-body">Showing ' + number(rows.length) + ' of ' + number(data.queueTotal) + ' flagged memories' +
    (store.filter ? ' · filter applied to loaded items' : '') + '.</p>';
  const items = rows.map((item) => '<li class="attention-row"><span class="tile-icon">' + icon('warning', true) + '</span><div>' +
    memoryLink(item.id, item.projectId, item.title || item.id) + '<div class="tags">' +
    tags([['project', state.projects.find((project) => project.id === item.projectId)?.name || item.projectId], ['memory', nice(item.category)]]) +
    list(item.issues).map((issue) => '<span class="tag check-' + (issue.severity === 'review' ? 'warn' : '') + '">' +
      esc(issue.label || healthIssues[issue.kind] || 'Review') + '</span>').join('') + '</div></div></li>').join('');
  target.innerHTML = rows.length ? count + '<ul class="list attention-list" tabindex="0" aria-label="Flagged memories">' + items + '</ul>' + warnings :
    blank('memory', store.filter ? 'No loaded items match' : 'No attention items', store.filter ? 'Choose another issue or show all loaded items.' : 'Review flags will appear here as the memory store changes.') + warnings;
}

async function loadHealth(project) {
  const target = $('attention-results');
  if (!target) return;
  const store = state.health;
  const request = ++store.request;
  if (store.project !== project) store.filter = '';
  store.project = project;
  store.snapshot = null;
  $('attention-filter').disabled = true;
  $('attention-scope').textContent = '';
  target.innerHTML = skeleton('Checking memory health…');
  setBusy(target, true);
  try {
    const snapshot = await api(queryPath('memory-health', { project, limit: 30 }));
    if (request !== store.request || target !== $('attention-results')) return;
    store.snapshot = snapshot;
    renderAttention();
  } catch (error) {
    if (request === store.request && target === $('attention-results')) target.innerHTML = errorMarkup(error.message, 'health');
  } finally {
    if (request === store.request && target === $('attention-results')) setBusy(target, false);
  }
}

function renderActivity() {
  const target = $('activity-body');
  if (!target) return;
  const enabled = state.activityEnabled;
  $('activity-status').textContent = enabled === true ? 'Live' : enabled === false ? 'Paused' : '';
  if (enabled === false) {
    target.innerHTML = blank('activity', 'Live activity is paused', 'Turn it back on in Features to see recent events.',
      '<a class="button quiet" href="#features">Open Features ' + icon('chevron', true) + '</a>');
    return;
  }
  if (!state.activity.length) {
    target.innerHTML = blank('activity', 'No recent activity', 'Memory and agent events appear here as work happens.');
    return;
  }
  target.innerHTML = '<ul class="list">' + state.activity.slice(0, 8).map((event) => {
    const image = String(event.type ?? '').includes('memory') ? 'memory' : 'activity';
    const meta = [event.agent, event.project].filter(Boolean).join(' · ');
    return '<li class="event"><span class="tile-icon">' + icon(image, true) + '</span><div><strong>' +
      esc(event.label || nice(event.type) || 'Activity') + '</strong>' +
      (meta ? '<p class="event-meta small muted">' + esc(meta) + '</p>' : '') + '</div>' + dateMarkup(event.timestamp) + '</li>';
  }).join('') + '</ul>';
}

function renderOverview(data) {
  const sample = data.truncated ? '<p class="status small muted notice">Project and agent counts reflect the latest ' +
    number(data.inventoryLimit) + ' stored memories.</p>' : '';
  const pending = data.storageHealth?.status === 'pending' ? '<p class="status small muted notice">The memory store has pending writes.</p>' : '';
  const projectNote = state.projects.length > 8 ? 'Top projects by saved memory count' : 'Saved memories by project';
  optionSet('overview-quality-project', 'All projects', state.projects, data.scope?.projectId || '');
  $('overview-context').href = routeLink('context', { project: data.scope?.projectId });
  $('overview-body').innerHTML = '<div id="overview-refresh"></div>' + pending + renderOverviewSummary(data) + sample +
    '<div class="split overview-columns"><div class="stack"><section class="panel" aria-labelledby="attention-heading"><div class="panel-head"><div>' +
    '<h2 id="attention-heading" tabindex="-1">Attention queue</h2><p class="small muted" id="attention-scope"></p></div>' +
    '<label class="label" for="attention-filter">Issue<select id="attention-filter" disabled></select></label></div>' +
    '<div id="attention-results"></div></section>' + renderQuality(data) + '<div class="panel"><div class="panel-head"><div><h2>Project inventory</h2>' +
    '<p class="muted small">' + projectNote + '</p></div><a class="button quiet" href="#memories">Browse ' + icon('chevron', true) +
    '</a></div>' + renderProjects(state.projects) + '</div>' + renderOverviewMemories(list(data.recentMemories)) +
    '</div><div class="panel overview-activity"><div class="panel-head"><div><h2>Recent activity</h2><span id="activity-status" class="small muted"></span></div><a class="button quiet" href="/live">Open live operations ' + icon('chevron', true) + '</a></div><div id="activity-body"></div></div></div>';
  renderActivity();
  if (state.view === 'overview') void loadHealth(data.scope?.projectId || '');
}

function syncProjectOptions() {
  const contextProject = state.context.routeProject || $('context-project').value;
  const graphProject = state.view === 'graph' ? routeParams().get('project') : null;
  optionSet('context-project', 'Select a project', state.projects, contextProject);
  if ($('context-project').value === state.context.routeProject) state.context.routeProject = '';
  optionSet('graph-project', 'All projects', state.projects, $('graph-project').value || graphProject);
}

async function loadOverview(force = false, project = '') {
  if (state.overviewPending && state.overviewRequestScope === project) return state.overviewPending;
  if (state.overviewLoaded && !force && state.overviewScope === project) return;
  const request = ++state.overviewRequest;
  state.overviewRequestScope = project;
  const target = $('overview-body');
  if (!state.overviewLoaded) target.innerHTML = '<div class="panel">' + skeleton('Loading workspace…') + '</div>';
  else if (state.overviewScope !== project && $('overview-refresh')) $('overview-refresh').innerHTML =
    '<div class="notice status small muted" role="status">Loading the selected project. Showing the previous scope.</div>';
  setBusy(target, true);
  state.overviewPending = (async () => {
    try {
      const data = await api(queryPath('overview', { project }));
      if (request !== state.overviewRequest) return;
      state.overviewLoaded = true;
      state.overviewScope = project;
      state.projects = list(data.projects);
      state.projectKit = data.projectKit ?? null;
      state.activity = list(data.activity);
      if (typeof data.features?.liveActivity === 'boolean') state.activityEnabled = data.features.liveActivity;
      if (data.version) $('rail-version').textContent = 'Version ' + data.version;
      syncProjectOptions();
      renderOverview(data);
      renderContextControls();
    } catch (error) {
      if (request !== state.overviewRequest) return;
      if (!state.overviewLoaded) target.innerHTML = errorMarkup(error.message, 'overview');
      else if ($('overview-refresh')) $('overview-refresh').innerHTML = '<div class="notice">' + errorMarkup('Could not refresh the workspace. Showing the last loaded overview.', 'overview') + '</div>';
      renderContextControls();
    } finally {
      if (request === state.overviewRequest) {
        setBusy(target, false);
        state.overviewPending = null;
      }
    }
  })();
  return state.overviewPending;
}

async function refreshActivity() {
  if (document.hidden || state.view !== 'overview' || state.activityEnabled === false || state.activityPending || !state.overviewLoaded) return;
  state.activityPending = true;
  try {
    const data = await api('activity');
    if (state.features?.features?.liveActivity === false) return;
    state.activityEnabled = data.enabled;
    state.activity = list(data.activity);
    renderActivity();
  } catch {
    const status = $('activity-status');
    if (status) status.textContent = 'Refresh unavailable';
  } finally {
    state.activityPending = false;
  }
}

function sourceMarkup(values) {
  const sources = Array.from(new Set(list(values).filter((source) => typeof source === 'string' && source.trim())));
  if (!sources.length) return '<p class="source small">' + icon('source', true) + '<span>No source recorded</span></p>';
  return sources.map((source) => '<p class="source small">' + icon('source', true) + '<span class="mono">' + esc(source) + '</span></p>').join('');
}

function memoryQuery() {
  return {
    q: $('memory-query').value.trim(),
    project: $('memory-project').value,
    category: $('memory-category').value,
    agent: $('memory-agent').value,
    state: $('memory-state').value
  };
}

function renderMemories(data) {
  const target = $('memory-results');
  const items = list(data.items);
  const total = Number.isFinite(data.total) ? data.total : items.length;
  const { offset } = state.memory;
  const activeFilters = Object.values(state.memory.query || {}).some(Boolean);
  const subtitle = state.memory.query?.q ? 'Ranked search results' : 'Most recent first';
  const heading = '<div class="panel-head"><div><h2>' + esc(activeFilters ? 'Results' : 'Recent memories') +
    '</h2><p class="small muted">' + subtitle + '</p></div><span class="small muted" role="status">' + countLabel(total, 'memory', 'memories') + '</span></div>' +
    (data.truncated ? '<p class="panel-body small muted">Filters and counts may be limited to ' + number(data.inventoryLimit) + ' memories.</p>' : '');
  if (!items.length) {
    target.innerHTML = heading + (activeFilters
      ? blank('search', 'No matching memories', 'Try a different query or clear one of the filters.', '<button class="button quiet" data-memory-clear type="button">Clear filters</button>')
      : blank('memory', 'No memories yet', 'Saved memories appear here after an agent stores a lesson or observation.'));
    return;
  }
  target.innerHTML = heading + '<ul class="list">' + items.map((item) => {
    const title = item.title || nice(item.category) || 'Memory';
    const reasons = list(item.reasons);
    const detail = reasons.length ? '<details><summary>Why this matched</summary><ul class="small muted">' +
      reasons.map((reason) => '<li>' + esc(reason) + '</li>').join('') + '</ul></details>' : '';
    const snippet = compact(item.snippet) && compact(item.snippet) !== compact(title) ? '<p>' + esc(item.snippet) + '</p>' : '';
    return '<li class="memory-row"><div class="memory-head"><h3>' + memoryLink(item.id, item.project, title) + '</h3>' + dateMarkup(item.updatedAt, true) + '</div>' +
      tags([['project', item.projectName || item.project], ['agent', item.agent], ['memory', nice(item.category)], ['state-' + (item.effectiveState || ''), reviewLabel(item.effectiveState)]]) + snippet +
      sourceMarkup([...list(item.sources), item.source]) + detail + '</li>';
  }).join('') + '</ul>' + (offset || total > items.length ? '<div class="list-footer"><span class="muted small">' +
    number(offset + 1) + '–' + number(offset + items.length) + ' of ' + number(total) + '</span><div class="form-actions">' +
    '<button type="button" class="button" data-memory-page="prev"' + (offset ? '' : ' disabled') + '>' + icon('left', true) +
    'Previous</button><button type="button" class="button" data-memory-page="next"' + (offset + items.length < total ? '' : ' disabled') +
    '>Next' + icon('chevron', true) + '</button></div></div>' : '');
}

async function loadMemories(query, offset = 0) {
  const target = $('memory-results');
  const store = state.memory;
  const seq = ++store.request;
  store.controller?.abort();
  const controller = new AbortController();
  store.controller = controller;
  store.query = query;
  store.offset = offset;
  setBusy(target, true);
  target.innerHTML = skeleton('Loading memories…');
  try {
    const data = await api(queryPath('memories', { ...query, limit: store.limit, offset }), {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)])
    });
    if (seq !== store.request) return;
    const facets = data.facets || {};
    const toOptions = (values) => list(values).map((value) => ({ id: value, name: nice(value) }));
    const projects = list(facets.projects);
    optionSet('memory-project', 'All projects', projects.length ? projects : state.projects, query.project);
    optionSet('memory-category', 'All categories', toOptions(facets.categories), query.category);
    optionSet('memory-agent', 'All agents', toOptions(facets.agents), query.agent);
    renderMemories(data);
  } catch (error) {
    if (seq === store.request && error.name !== 'AbortError') target.innerHTML = errorMarkup(error.message, 'memories');
  } finally {
    if (seq === store.request) setBusy(target, false);
  }
}

function linkCaption(link, memoryId) {
  if (link.type === 'related') return 'Related to';
  if (link.fromId === memoryId) return linkTypes[link.type] || nice(link.type);
  return { supports: 'Supported by', contradicts: 'Contradicted by', supersedes: 'Superseded by' }[link.type] || nice(link.type);
}

function renderReviewHistory(events) {
  const recent = [...list(events)].sort((a, b) => Number(b.revision) - Number(a.revision)).slice(0, 12);
  if (!recent.length) return '';
  const rows = recent.map((event) => {
    const command = event.command || {};
    const label = command.kind === 'review' ? 'Recorded review · ' + reviewLabel(command.state) :
      command.kind === 'link' ? 'Added link · ' + (linkTypes[command.type] || nice(command.type)) :
      command.kind === 'unlink' ? 'Removed link' : 'Memory change';
    return '<li class="detail-row"><div class="memory-head"><strong>' + esc(label) + '</strong>' + dateMarkup(event.at) + '</div>' +
      (command.note ? '<p class="detail-note small muted">' + esc(command.note) + '</p>' : '') + '</li>';
  }).join('');
  return '<section class="panel"><div class="panel-head"><h2>Recent changes</h2></div><ul class="list">' + rows + '</ul></section>';
}

function renderDetail(snapshot) {
  const { memory, review, links } = snapshot;
  const project = memory.project || memory.projectId || state.detail.project;
  const effective = snapshot.effectiveState || memory.effectiveState || review?.state;
  const title = memory.title || nice(memory.category) || 'Memory detail';
  const content = memory.content ?? memory.snippet;
  const ownState = review?.state || 'active';
  const reviewOptions = Object.entries(reviewStates).filter(([key]) => key !== 'superseded')
    .map(([key, label]) => '<option value="' + key + '"' + (key === ownState ? ' selected' : '') + '>' + label + '</option>').join('');
  const relationOptions = Object.entries(linkTypes).map(([key, label]) => '<option value="' + key + '">' + label + '</option>').join('');
  const replacement = list(links).find((link) => link.type === 'supersedes' && link.toId === memory.id);
  const titleEl = $('title-memory');
  titleEl.textContent = title;
  $('detail-meta').innerHTML = tags([
    ['project', memory.projectName || project], ['agent', memory.agent], ['memory', nice(memory.category)],
    ['state-' + (effective || ''), reviewLabel(effective)]
  ]) + (memory.createdAt || memory.updatedAt ? '<div class="small muted">' + dateMarkup(memory.createdAt || memory.updatedAt, true) + '</div>' : '');
  $('detail-graph').href = routeLink('graph', { project, memory: memory.id });
  $('detail-context').href = routeLink('context', { project });
  const projectFeedback = document.documentElement.dataset.projectLocal === 'true' || state.projectKit?.projectId === project;
  $('detail-outcome').hidden = !projectFeedback;
  $('detail-outcome').href = routeLink('project-kit', { memory: memory.id });
  $('detail-actions').hidden = false;
  const linkRows = list(links).map((link) => {
    const outgoing = link.fromId === memory.id;
    const endpoint = outgoing ? link.toId : link.fromId;
    const endpointTitle = (outgoing ? link.toTitle : link.fromTitle) || endpoint;
    const endpointLink = link.orphaned ? esc(endpointTitle) : memoryLink(endpoint, project, endpointTitle);
    return '<li class="detail-row"><div class="tags"><span class="tag memory">' + esc(linkCaption(link, memory.id)) + '</span>' +
      endpointLink + '</div>' +
      (link.note ? '<p class="detail-note small muted">' + esc(link.note) + '</p>' : '') +
      '<details><summary class="small muted">Remove link</summary><div class="form-actions"><button class="button" type="button" data-unlink="' +
      esc(link.id) + '">Remove this link</button></div></details></li>';
  }).join('');
  const warnings = list(snapshot.warnings).map((warning) => '<p class="status small muted notice">' + esc(warning) + '</p>').join('');
  $('detail-body').innerHTML = warnings + '<div class="split detail-layout"><div class="stack">' +
    '<section class="panel"><div class="panel-head"><h2>Saved memory</h2></div><div class="panel-body">' +
    '<p class="memory-content">' + esc(content || 'No saved text.') + '</p></div></section>' +
    '<section class="panel"><div class="panel-head"><h2>Recorded sources</h2></div><div class="panel-body detail-sources">' +
    sourceMarkup([...list(memory.sources), ...list(snapshot.sources), memory.source]) + '</div></section>' +
    '<section class="panel"><div class="panel-head"><h2>Connections</h2><span class="small muted">' + countLabel(list(links).length, 'link') +
    '</span></div>' + (linkRows ? '<ul class="list">' + linkRows + '</ul>' :
      '<div class="panel-body"><p class="small muted">No links recorded for this memory.</p></div>') +
    '<div class="panel-body"><details id="link-editor"><summary>Add a memory link</summary><div class="detail-form" style="margin-top:10px">' +
    '<form id="link-search" class="link-search"><label class="label" for="link-query">Find a memory in this project<input id="link-query" type="search" maxlength="500" placeholder="Search by keyword"></label>' +
    '<button type="submit" class="button">Find</button></form>' +
    '<form id="link-form" class="detail-form"><label class="label" for="link-target">Target memory<select id="link-target" required><option value="">Choose a memory</option></select></label>' +
    '<p id="link-search-status" class="small muted" role="status"></p>' +
    '<label class="label" for="link-type">Relationship from this memory<select id="link-type">' + relationOptions + '</select></label>' +
    '<label class="label" for="link-note">Note<textarea id="link-note" maxlength="1000" rows="2" placeholder="Describe the relationship"></textarea></label>' +
    '<div class="form-actions"><button class="button primary" id="link-submit" type="submit">Save link</button></div></form></div></details></div>' +
    '<p id="link-edit-status" class="save-status small muted" role="status"></p></section>' +
    '</div><div class="stack"><section class="panel"><div class="panel-head"><h2>Recorded review</h2>' + reviewTag(effective) + '</div>' +
    '<div class="panel-body detail-form">' +
    (effective === 'superseded' ? '<p class="small muted">This memory is superseded' +
      (replacement?.fromId && !replacement.orphaned ? ' by ' + memoryLink(replacement.fromId, project, replacement.fromTitle || replacement.fromId) : '') + '.</p>' : '') +
    (review?.updatedAt ? '<div class="small muted">Reviewed ' + dateMarkup(review.updatedAt, true) + '</div>' :
      '<p class="small muted">No review recorded.</p>') +
    '<form id="review-form" class="detail-form"><label class="label" for="review-state">Manual status<select id="review-state">' +
    reviewOptions + '</select></label><label class="label" for="review-note">Review note<textarea id="review-note" maxlength="1000" rows="3" placeholder="Record what you checked">' +
    esc(review?.note) + '</textarea></label><div class="form-actions"><button class="button primary" id="review-submit" type="submit">Save review</button></div></form>' +
    '</div><p id="detail-status" class="save-status small muted" role="status"></p></section>' +
    renderReviewHistory(snapshot.history) + '</div></div>';
}

async function loadDetail(id, project, failurePrefix = '') {
  const store = state.detail;
  const request = ++store.request;
  store.id = id;
  store.project = project;
  store.snapshot = null;
  $('detail-actions').hidden = true;
  $('title-memory').textContent = 'Memory detail';
  $('detail-meta').replaceChildren();
  const target = $('detail-body');
  setBusy(target, true);
  target.innerHTML = skeleton('Loading memory…');
  try {
    if (!id || !project) {
      target.innerHTML = '<div class="panel">' + blank('memory', 'Choose a memory', 'Open a record from your memories, context, or graph.',
        '<a href="#memories" class="button quiet">Browse memories</a>') + '</div>';
      return false;
    }
    const snapshot = await api(queryPath('memory', { id, project }));
    if (request !== store.request) return false;
    if (snapshot.memory?.id !== id || (snapshot.memory.project || snapshot.memory.projectId) !== project ||
        !Number.isSafeInteger(snapshot.revision)) throw new Error('The server returned an unreadable memory.');
    store.snapshot = snapshot;
    renderDetail(snapshot);
    return true;
  } catch (error) {
    if (request !== store.request) return false;
    target.innerHTML = errorMarkup(failurePrefix + error.message, error.status === 404 ? null : 'detail');
    return false;
  } finally {
    if (request === store.request) setBusy(target, false);
  }
}

async function searchLinkTargets() {
  const store = state.detail;
  if (!store.snapshot || store.saving) return;
  const request = ++store.targetRequest;
  const detailRequest = store.request;
  const target = $('link-search-status');
  target.textContent = 'Looking for memories…';
  try {
    const q = $('link-query').value.trim();
    const result = await api(queryPath('memories', { q, project: store.project, limit: 15 }));
    if (request !== store.targetRequest || detailRequest !== store.request) return;
    const choices = list(result.items).filter((item) => item.id !== store.id && (item.project || item.projectId) === store.project)
      .map((item) => ({ id: item.id, name: item.title || item.id }));
    optionSet('link-target', 'Choose a memory', choices, '');
    target.textContent = choices.length ? countLabel(choices.length, 'memory', 'memories') + ' found.' : 'No other memories matched.';
  } catch (error) {
    if (request === store.targetRequest && detailRequest === store.request) target.textContent = error.message;
  }
}

function detailStatus(id, message, error = false) {
  const status = $(id);
  if (!status) return;
  status.textContent = message;
  status.dataset.error = String(error);
}

async function saveDetail(kind, payload, focus) {
  const store = state.detail;
  if (!store.snapshot || store.saving) return;
  const { id, project, request } = store;
  const status = kind === 'memory-review' ? 'detail-status' : 'link-edit-status';
  const controls = () => $('detail-body').querySelectorAll('button, select, textarea');
  store.saving = true;
  controls().forEach((element) => { element.disabled = true; });
  detailStatus(status, 'Saving…');
  try {
    await api(kind, { body: { projectId: project, expectedRevision: store.snapshot.revision, ...payload } });
    state.graph.snapshot = null;
    state.overviewLoaded = false;
    if (state.context.pack || state.context.pending) {
      state.context.dirty = true;
      if (!state.context.pending) renderContext();
    }
    if (request !== store.request || state.view !== 'memory') return;
    if (await loadDetail(id, project, 'Saved. Could not reload the memory. ')) detailStatus(status, 'Saved.');
  } catch (error) {
    if (request !== store.request || state.view !== 'memory') return;
    if (error.status === 409) {
      if (await loadDetail(id, project, 'This memory changed elsewhere. ')) detailStatus(status, 'This memory changed elsewhere. Review the latest state and try again.', true);
    } else {
      detailStatus(status, error.message, true);
    }
  } finally {
    store.saving = false;
    if (state.view === 'memory' && id === store.id && project === store.project) {
      controls().forEach((element) => { element.disabled = false; });
      if (focus === 'link-editor' && $(focus)) $(focus).querySelector('summary')?.focus();
      else ($(focus) || $('title-memory')).focus();
    }
  }
}

const graphKinds = { project: 'Project', agent: 'Agent', memory: 'Memory' };
const graphEdgeLabels = { 'belongs-to': 'Belongs to project', 'recorded-by': 'Recorded by agent', ...linkTypes };
const graphEdgeClass = { 'belongs-to': ' project-edge', 'recorded-by': ' agent-edge' };
const recordedEdge = (edge) => edge?.id && Object.hasOwn(linkTypes, edge.kind);
const graphMemoryId = (node) => node.memoryId || (node.kind === 'memory' && node.id.startsWith('memory:') ? node.id.slice(7) : '');

function graphNeighbors(edges, id) {
  return edges.filter((edge) => edge.source === id || edge.target === id).map((edge) => ({
    id: edge.source === id ? edge.target : edge.source,
    edge
  }));
}

function graphPillGrid(positions, nodes, width, top, pitch, nodeWidth = pitch - 18) {
  const columns = Math.max(1, Math.floor((width - 28) / pitch));
  for (let index = 0; index < nodes.length; index += columns) {
    const row = nodes.slice(index, index + columns);
    const offset = (width - row.length * pitch) / 2 + (pitch - nodeWidth) / 2;
    row.forEach((node, column) => {
      positions.set(node.id, { x: offset + column * pitch, y: top + Math.floor(index / columns) * 45, width: nodeWidth, height: 33 });
    });
  }
  return Math.ceil(nodes.length / columns) * 45;
}

function projectCluster(hub, memories) {
  const rings = [];
  for (let start = 0, ring = 0; start < memories.length; ring++) {
    const capacity = 13 + ring * 8;
    const members = memories.slice(start, start + capacity);
    rings.push({ members, rx: 86 + ring * 32, ry: 61 + ring * 29 });
    start += members.length;
  }
  const outer = rings.at(-1);
  return { hub, rings, count: memories.length, rx: (outer?.rx || 75) + 17, ry: (outer?.ry || 36) + 17 };
}

function packClusters(clusters, viewport, agentBands) {
  let best;
  for (let columns = 1; columns <= Math.min(clusters.length, 8); columns++) {
    const rows = [];
    for (let index = 0; index < clusters.length; index += columns) rows.push(clusters.slice(index, index + columns));
    const rowWidths = rows.map((row) => row.reduce((sum, cluster) => sum + cluster.rx * 2 + 19, 0));
    const rowHeights = rows.map((row) => Math.max(...row.map((cluster) => cluster.ry)) * 2 + 20);
    const width = Math.max(agentBands.width, 36 + Math.max(...rowWidths));
    const height = 46 + agentBands.height + rowHeights.reduce((sum, value) => sum + value, 0);
    const scale = Math.min(viewport.width / width, (viewport.height - 45) / height);
    if (!best || scale > best.scale) best = { rows, rowWidths, rowHeights, width, height, scale };
  }
  return best;
}

function graphLayout(nodes, edges) {
  const positions = new Map();
  const clusters = [];
  const order = (a, b) => String(a.label || '').localeCompare(String(b.label || '')) || String(a.id).localeCompare(String(b.id));
  const projects = nodes.filter((node) => node.kind === 'project').sort(order);
  const agents = nodes.filter((node) => node.kind === 'agent').sort(order);
  const memories = nodes.filter((node) => node.kind === 'memory').sort(order);
  const byId = new Map(memories.map((node) => [node.id, node]));
  const expanded = state.graph.project && projects.length === 1 && memories.length <= 25;
  if (!projects.length || !memories.length || expanded) {
    const width = Math.max(450, Math.min(5, Math.ceil(Math.sqrt(memories.length * 1.1))) * 184 + 30);
    let height = 28;
    height += graphPillGrid(positions, projects, width, height, 178, 155);
    if (expanded) height += 14;
    height += graphPillGrid(positions, memories, width, height, 184);
    if (expanded) height += 14;
    height += graphPillGrid(positions, agents, width, height, 140, 118);
    return { positions, clusters, width, height: height + 18 };
  }

  const groupMap = new Map(projects.map((node) => [node.id, []]));
  const grouped = new Set();
  for (const edge of edges) {
    if (edge.kind !== 'belongs-to') continue;
    const memory = byId.get(edge.target);
    const group = groupMap.get(edge.source);
    if (!memory || !group || grouped.has(memory.id)) continue;
    group.push(memory);
    grouped.add(memory.id);
  }
  const groups = projects.map((node) => projectCluster(node, groupMap.get(node.id).sort(order)));
  const ungrouped = memories.filter((node) => !grouped.has(node.id));
  const split = Math.ceil(agents.length / 2);
  const topAgents = agents.slice(0, split);
  const bottomAgents = agents.slice(split);
  const agentWidth = Math.min(split, 6) * 132 + 28;
  const agentHeight = (Math.ceil(split / 6) + Math.ceil(bottomAgents.length / 6)) * 45;
  const packed = packClusters(groups, graphViewport(), { width: agentWidth, height: agentHeight });
  const { width, rows, rowWidths, rowHeights } = packed;
  let y = 14 + graphPillGrid(positions, topAgents, width, 14, 132, 112) + 18;
  rows.forEach((row, rowIndex) => {
    let x = (width - rowWidths[rowIndex]) / 2 + 9.5;
    for (const group of row) {
      const cx = x + group.rx;
      const cy = y + rowHeights[rowIndex] / 2;
      clusters.push({ cx, cy, rx: group.rx, ry: group.ry });
      positions.set(group.hub.id, { x: cx - 66, y: cy - 21, width: 132, height: 42, count: group.count });
      group.rings.forEach(({ members, rx, ry }, ringIndex) => {
        members.forEach((node, index) => {
          const angle = (index + (ringIndex % 2 ? .5 : 0)) * Math.PI * 2 / members.length - Math.PI / 2;
          positions.set(node.id, { x: cx + Math.cos(angle) * rx - 11, y: cy + Math.sin(angle) * ry - 11, width: 22, height: 22, dot: true });
        });
      });
      x += group.rx * 2 + 19;
    }
    y += rowHeights[rowIndex];
  });
  y += graphPillGrid(positions, ungrouped, width, y + 3, 184);
  y += graphPillGrid(positions, bottomAgents, width, y + 8, 132, 112);
  return { positions, clusters, width, height: y + 16 };
}

function graphEdgePath(edge, layout) {
  const a = layout.positions.get(edge.source);
  const b = layout.positions.get(edge.target);
  if (!a || !b) return '';
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  const start = 'M' + ax + ' ' + ay;
  if (edge.kind === 'belongs-to') return start + ' L' + bx + ' ' + by;
  if (recordedEdge(edge)) {
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy) || 1;
    const pad = Math.min(b.width / 2 / Math.abs(dx), b.height / 2 / Math.abs(dy), .38);
    const lift = Math.min(63, Math.max(20, length * .25));
    return start + ' Q' + ((ax + bx) / 2 - dy / length * lift) + ' ' + ((ay + by) / 2 + dx / length * lift) +
      ' ' + (bx - dx * pad) + ' ' + (by - dy * pad);
  }
  const bend = (ay + by) / 2;
  return start + ' C' + ax + ' ' + bend + ' ' + bx + ' ' + bend + ' ' + bx + ' ' + by;
}

function graphNodeMarkup(node, position, tabIndex) {
  const { x, y, width, height } = position;
  const label = compact(node.label || node.id);
  const hasCount = Number.isFinite(position.count);
  const mark = node.kind === 'project' ? '<rect class="node-glyph" x="11" y="' + (hasCount ? 10 : 12) + '" width="8" height="8" rx="1"/>'
    : node.kind === 'agent' ? '<circle class="node-glyph" cx="15" cy="16" r="4.5"/>' : '<path class="node-glyph" d="m15 11 5 5-5 5-5-5z"/>';
  const display = shorten(label, Math.floor((width - 30) / 6.1));
  const shape = position.dot
    ? '<circle class="node-surface" cx="11" cy="11" r="9.5"/><path class="node-glyph" d="m11 7 4 4-4 4-4-4z"/>'
    : '<rect class="node-surface" width="' + width + '" height="' + height + '" rx="6"/>' + mark +
      '<text x="26" y="' + (hasCount ? 18 : 21) + '">' + esc(display) + '</text>' +
      (hasCount ? '<text class="node-count" x="26" y="33">' + countLabel(position.count, 'memory', 'memories') + '</text>' : '');
  return '<g class="graph-node ' + node.kind + (position.dot ? ' dot-node' : '') + '" role="button" aria-label="' + esc(graphKinds[node.kind] + ': ' + label) +
    '" data-node="' + esc(node.id) + '" aria-pressed="false" tabindex="' + tabIndex + '" transform="translate(' + x + ' ' + y + ')"><title>' +
    esc(label) + '</title>' + shape + '</g>';
}

function renderGraphList() {
  const graph = state.graph;
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const links = graph.edges.filter(recordedEdge).map((edge) => '<li class="graph-row"><button type="button" class="button" data-edge-record="' +
    esc(edge.id) + '" aria-pressed="false"><span>' + esc(byId.get(edge.source)?.label || edge.source) + ' · ' +
    esc(graphEdgeLabels[edge.kind]) + ' · ' + esc(byId.get(edge.target)?.label || edge.target) + '</span></button></li>').join('');
  $('graph-list').innerHTML = (links ? '<details open class="panel-body"><summary>Recorded memory links</summary><ul class="list">' + links + '</ul></details>' : '') +
    '<ul class="list">' + graph.nodes.map((node) => '<li class="graph-row"><button type="button" class="button" data-node="' +
    esc(node.id) + '" aria-pressed="false">' + icon(node.kind, true) + '<span>' + esc(node.label || node.id) +
    '</span><span class="tag ' + node.kind + '">' + graphKinds[node.kind] + '</span></button></li>').join('') + '</ul>';
}

function renderGraphMap() {
  const graph = state.graph;
  const layout = graph.layout = graphLayout(graph.nodes, graph.edges);
  const svg = $('graph-svg');
  const clusters = layout.clusters.map(({ cx, cy, rx, ry }) => '<ellipse class="cluster-area" cx="' + cx + '" cy="' + cy +
    '" rx="' + rx + '" ry="' + ry + '"/>').join('');
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const structural = [];
  const recordedLinks = [];
  graph.edges.forEach((edge, i) => {
    const path = graphEdgePath(edge, layout);
    const recorded = recordedEdge(edge);
    const visual = '<path class="graph-edge' + (recorded ? ' recorded-edge ' + edge.kind : graphEdgeClass[edge.kind] || '') +
      '" data-edge="' + i + '" d="' + path + '"' + (recorded && edge.kind !== 'related' ? ' marker-end="url(#graph-arrow)"' : '') + '/>';
    if (recorded) {
      const from = byId.get(edge.source)?.label || edge.source;
      const to = byId.get(edge.target)?.label || edge.target;
      const label = from + ' · ' + graphEdgeLabels[edge.kind] + ' · ' + to;
      recordedLinks.push('<g class="graph-link-group" data-edge-record="' + esc(edge.id) + '" role="button" tabindex="-1" aria-pressed="false" aria-label="' +
        esc(label) + '"><title>' + esc(label) + '</title>' + visual + '<path class="graph-edge-hit" d="' + path + '"/></g>');
    } else structural.push(visual);
  });
  const nodes = graph.nodes.map((node, i) => graphNodeMarkup(node, layout.positions.get(node.id), i === 0 ? 0 : -1)).join('');
  svg.innerHTML = '<defs><pattern id="map-dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="var(--graph-dot)"/></pattern>' +
    '<marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="graph-arrow" d="M0 1 9 5 0 9z"/></marker></defs>' +
    '<rect width="100%" height="100%" fill="url(#map-dots)"/><g id="graph-transform"><g aria-hidden="true">' + clusters + structural.join('') + '</g>' +
    recordedLinks.join('') + nodes + '<g class="graph-tooltip" id="graph-tooltip" aria-hidden="true"></g></g>';
  fitGraph();
}

function graphViewport() {
  const rect = $('graph-svg').getBoundingClientRect();
  return { width: Math.max(rect.width, 1), height: Math.max(rect.height, 1) };
}

function updateGraphTransform() {
  const graph = state.graph;
  const transform = $('graph-transform');
  if (!transform || graph.mode !== 'map') return;
  const { width, height } = graphViewport();
  $('graph-svg').setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  transform.setAttribute('transform', 'translate(' + graph.panX + ' ' + graph.panY + ') scale(' + graph.zoom + ')');
  $('graph-scale').textContent = Math.round(graph.zoom * 100) + '%';
  $('graph-out').disabled = graph.zoom <= .06;
  $('graph-in').disabled = graph.zoom >= 2.75;
}

function fitGraph() {
  const graph = state.graph;
  if (!graph.layout || graph.mode !== 'map' || $('graph-body').hidden || state.view !== 'graph') return;
  const { width, height } = graphViewport();
  const { width: mapWidth, height: mapHeight } = graph.layout;
  const widthScale = Math.max(1, width - 24) / mapWidth;
  const heightScale = Math.max(1, height - 54) / mapHeight;
  const zoom = Math.min(1.35, widthScale, heightScale);
  graph.zoom = zoom;
  graph.panX = (width - mapWidth * zoom) / 2;
  graph.panY = Math.max(0, (height - 38 - mapHeight * zoom) / 2);
  updateGraphTransform();
}

function zoomGraph(factor, anchor) {
  const graph = state.graph;
  if (!graph.layout) return;
  const viewport = graphViewport();
  const center = anchor || { x: viewport.width / 2, y: viewport.height / 2 };
  const previous = graph.zoom;
  const target = Math.min(2.75, Math.max(Math.min(.06, previous), previous * factor));
  const ratio = target / previous;
  graph.panX = center.x - (center.x - graph.panX) * ratio;
  graph.panY = center.y - (center.y - graph.panY) * ratio;
  graph.zoom = target;
  updateGraphTransform();
}

function centerGraphNode(id) {
  const graph = state.graph;
  const position = graph.layout?.positions.get(id);
  if (!position || graph.mode !== 'map') return;
  const { width, height } = graphViewport();
  const left = graph.panX + position.x * graph.zoom;
  const top = graph.panY + position.y * graph.zoom;
  if (graph.zoom >= .8 && left >= 14 && top >= 14 && left + position.width * graph.zoom <= width - 14 &&
      top + position.height * graph.zoom <= height - 52) return;
  const zoom = Math.max(.8, graph.zoom);
  graph.zoom = zoom;
  graph.panX = width / 2 - (position.x + position.width / 2) * zoom;
  graph.panY = (height - 38) / 2 - (position.y + position.height / 2) * zoom;
  updateGraphTransform();
}

function renderGraphTooltip(id) {
  const graph = state.graph;
  const tooltip = $('graph-tooltip');
  if (!tooltip) return;
  const point = graph.layout.positions.get(id);
  const node = graph.nodes.find((item) => item.id === id);
  if (!point?.dot || !node) {
    tooltip.replaceChildren();
    return;
  }
  const label = shorten(compact(node.label || node.id), 48);
  const width = Math.max(70, label.length * 6.7 + 18);
  const x = Math.min(graph.layout.width - width - 2, Math.max(2, point.x + 11 - width / 2));
  const y = Math.max(1, point.y - 32);
  tooltip.setAttribute('transform', 'translate(' + x + ' ' + y + ')');
  tooltip.innerHTML = '<rect width="' + width + '" height="26" rx="5"/><text x="9" y="17">' + esc(label) + '</text>';
}

function renderGraphInspector() {
  const graph = state.graph;
  const all = new Map(list(graph.snapshot?.nodes).map((node) => [node.id, node]));
  const selected = all.get(graph.selected);
  const inspector = $('graph-inspector');
  const selectedEdge = graph.edges.find((edge) => recordedEdge(edge) && edge.id === graph.selectedEdge);
  if (selectedEdge) {
    const from = all.get(selectedEdge.source);
    const to = all.get(selectedEdge.target);
    const record = (node) => node ? memoryLink(graphMemoryId(node), node.project, node.label || node.id) : '';
    const endpoint = (label, node) => (selectedEdge.kind === 'related' ? '' : '<p class="small muted">' + label + '</p>') + '<p>' + record(node) + '</p>';
    inspector.innerHTML = '<div class="panel-head"><h3>Link details</h3></div><div class="panel-body">' +
      '<div>' + endpoint('From memory', from) + '</div>' + tags([['memory', graphEdgeLabels[selectedEdge.kind]], ['agent', 'Recorded memory link']]) +
      '<div>' + endpoint('To memory', to) + '</div>' + (selectedEdge.note ? '<p class="small muted detail-note">' + esc(selectedEdge.note) + '</p>' : '') + '</div>';
    return;
  }
  if (!selected) {
    inspector.innerHTML = '<div class="panel-head"><h3>Node details</h3></div>' +
      blank('graph', 'Select a node', 'See its stored details and follow its recorded connections.');
    return;
  }
  const adjacent = graphNeighbors(graph.edges, selected.id).filter((item) => all.has(item.id));
  const connected = adjacent.length ? '<details open><summary>' + countLabel(adjacent.length, 'connection') + '</summary><div class="related">' +
    adjacent.map(({ id, edge }) => {
      const node = all.get(id);
      if (recordedEdge(edge)) return '<button type="button" class="button quiet" data-edge-record="' + esc(edge.id) +
        '"><span>' + esc(linkCaption({ fromId: edge.source, type: edge.kind }, selected.id)) + ' · ' + esc(node.label || node.id) + '</span></button>';
      return '<button type="button" class="button quiet" data-related="' + esc(id) + '" title="' +
        esc(graphEdgeLabels[edge.kind] || nice(edge.kind) || 'Connection') + '">' + icon(node.kind, true) + '<span>' +
        esc(node.label || node.id) + '</span></button>';
    }).join('') + '</div></details>' : '<p class="muted small">No connections in this view.</p>';
  const project = state.projects.find((item) => item.id === selected.project)?.name || selected.project;
  const snippet = compact(selected.snippet) && compact(selected.snippet) !== compact(selected.label)
    ? '<p class="small">' + esc(selected.snippet) + '</p>' : '';
  const canFocus = selected.kind === 'memory' && adjacent.some(({ edge }) => recordedEdge(edge)) && graph.lens !== selected.id;
  inspector.innerHTML = '<div class="panel-head"><h3>Node details</h3></div><div class="panel-body">' +
    tags([[selected.kind, graphKinds[selected.kind]], ['memory', nice(selected.category)], ['state-' + (selected.effectiveState || ''), reviewLabel(selected.effectiveState)]]) +
    '<h3>' + (selected.kind === 'memory' ? memoryLink(graphMemoryId(selected), selected.project, selected.label || selected.id) : esc(selected.label || selected.id)) + '</h3>' +
    (project && selected.kind !== 'project' ? '<p class="muted small">' + esc(project) + '</p>' : '') + snippet +
    (selected.kind === 'memory' ? sourceMarkup([...list(selected.sources), selected.source]) : '') +
    (canFocus ? '<button class="button" type="button" data-graph-lens="' + esc(selected.id) + '">' + icon('graph', true) + 'Focus recorded links</button>' : '') +
    connected + '</div>';
}

function updateGraphSelection() {
  const graph = state.graph;
  const id = graph.selected;
  const selectedEdge = graph.edges.find((edge) => recordedEdge(edge) && edge.id === graph.selectedEdge);
  const connected = new Set(graphNeighbors(graph.edges, id).map((item) => item.id));
  connected.add(id);
  if (selectedEdge) { connected.add(selectedEdge.source); connected.add(selectedEdge.target); }
  const hasSelection = !!id || !!selectedEdge;
  const tabStop = id || selectedEdge?.source || graph.nodes[0]?.id;
  $('graph-body').querySelectorAll('[data-node]').forEach((element) => {
    const nodeId = element.dataset.node;
    element.setAttribute('aria-pressed', String(id === nodeId));
    if (element instanceof SVGElement) {
      element.classList.toggle('unrelated', hasSelection && !connected.has(nodeId));
      element.classList.toggle('selected-memory', id === nodeId && nodeId.startsWith('memory:'));
      element.setAttribute('tabindex', nodeId === tabStop ? '0' : '-1');
    }
  });
  if (graph.mode === 'map') {
    $('graph-svg').querySelectorAll('[data-edge]').forEach((element) => {
      const edge = graph.edges[Number(element.dataset.edge)];
      const active = edge === selectedEdge || edge.source === id || edge.target === id;
      element.classList.toggle('active', active);
      element.classList.toggle('unrelated', hasSelection && !active);
    });
    const linkTabStop = graph.selectedEdge || graph.edges.find(recordedEdge)?.id;
    $('graph-svg').querySelectorAll('[data-edge-record]').forEach((element) => {
      element.setAttribute('aria-pressed', String(element.dataset.edgeRecord === graph.selectedEdge));
      element.setAttribute('tabindex', element.dataset.edgeRecord === linkTabStop ? '0' : '-1');
    });
    renderGraphTooltip(id);
  }
  $('graph-list').querySelectorAll('[data-edge-record]').forEach((element) => {
    element.setAttribute('aria-pressed', String(element.dataset.edgeRecord === graph.selectedEdge));
  });
  renderGraphInspector();
}

function selectGraphNode(id, { center = false, focus = false } = {}) {
  const graph = state.graph;
  graph.selected = id;
  graph.selectedEdge = '';
  updateGraphSelection();
  if (center) centerGraphNode(id);
  if (focus) {
    const target = graph.mode === 'map' ? $('graph-svg') : $('graph-list');
    target.querySelector('[data-node="' + CSS.escape(id) + '"]')?.focus();
  }
}

function selectGraphEdge(id, fromInspector) {
  const graph = state.graph;
  if (!graph.edges.some((edge) => recordedEdge(edge) && edge.id === id)) return;
  graph.selected = '';
  graph.selectedEdge = id;
  updateGraphSelection();
  if (fromInspector) $('graph-inspector').querySelector('a')?.focus();
}

function renderGraph() {
  const graph = state.graph;
  if (!graph.snapshot) return;
  const search = $('graph-query').value.trim().toLowerCase();
  const kind = $('graph-kind').value;
  const relation = $('graph-relation').value;
  const allNodes = list(graph.snapshot.nodes).filter((node) => Object.hasOwn(graphKinds, node.kind));
  const allEdges = list(graph.snapshot.edges);
  const anchor = allNodes.find((node) => node.id === graph.lens);
  const edges = anchor ? allEdges.filter((edge) => recordedEdge(edge) && (edge.source === anchor.id || edge.target === anchor.id)) : allEdges;
  const lensIds = anchor ? new Set([anchor.id, ...edges.flatMap((edge) => [edge.source, edge.target])]) : null;
  const nodes = lensIds ? allNodes.filter((node) => lensIds.has(node.id)) : allNodes;
  $('graph-lens').hidden = !anchor;
  $('graph-body').dataset.lens = String(!!anchor);
  $('graph-lens-label').textContent = anchor ? 'Recorded links for ' + shorten(compact(anchor.label || anchor.id), 94) : '';
  const matches = nodes.filter((node) => (!kind || node.kind === kind) &&
    (!search || [node.label, node.snippet, node.project, node.category].filter(Boolean).join(' ').toLowerCase().includes(search)));
  const ids = new Set(matches.map((node) => node.id));
  if (search && !kind) {
    matches.forEach((node) => graphNeighbors(edges, node.id).forEach((item) => ids.add(item.id)));
  }
  const matchingEdges = edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target) &&
    (!relation || (relation === 'recorded' ? recordedEdge(edge) : edge.kind === relation)));
  if (relation) {
    const endpoints = new Set(matchingEdges.flatMap((edge) => [edge.source, edge.target]));
    for (const id of ids) if (!endpoints.has(id)) ids.delete(id);
  }
  graph.nodes = nodes.filter((node) => ids.has(node.id));
  graph.edges = matchingEdges;
  if (graph.selected && !ids.has(graph.selected)) graph.selected = '';
  if (graph.selectedEdge && !graph.edges.some((edge) => recordedEdge(edge) && edge.id === graph.selectedEdge)) graph.selectedEdge = '';
  const matchingCount = search && matches.length !== graph.nodes.length ? countLabel(matches.length, 'match', 'matches') + ' · ' : '';
  $('graph-count').textContent = matchingCount + countLabel(graph.nodes.length, 'node') + ' · ' + countLabel(graph.edges.length, 'connection');
  $('graph-body').hidden = !graph.nodes.length;
  $('graph-legend').hidden = !graph.nodes.length;
  const note = graph.snapshot.truncated ? '<div class="panel-body small muted">This snapshot includes ' +
    number(graph.snapshot.shownMemories) + ' memories. Filter by project to explore a narrower set.</div>' : '';
  const focused = graph.focusMemory && graph.nodes.find((node) => graphMemoryId(node) === graph.focusMemory);
  const missing = graph.focusMemory && !focused ? '<p class="panel-body small muted">This memory is outside the current graph view.</p>' : '';
  $('graph-status').innerHTML = graph.nodes.length ? note + missing : missing + blank('graph', search || kind || relation ? 'No matching nodes' : 'No relationships yet',
    search || kind || relation ? 'Change the name, node type, or relationship filter.' : 'The graph fills in as project and agent memories are stored.');
  if (!graph.nodes.length) return;
  $('graph-stage').hidden = graph.mode !== 'map';
  $('graph-list').hidden = graph.mode !== 'list';
  $('graph-mode-map').setAttribute('aria-pressed', String(graph.mode === 'map'));
  $('graph-mode-list').setAttribute('aria-pressed', String(graph.mode === 'list'));
  renderGraphList();
  if (graph.mode === 'map') renderGraphMap();
  if (focused) {
    graph.focusMemory = '';
    selectGraphNode(focused.id);
  } else updateGraphSelection();
}

async function loadGraph(project, force = false, memory = '') {
  const graph = state.graph;
  graph.focusMemory = memory;
  if (!force && !memory && graph.snapshot && graph.project === project) {
    renderGraph();
    return;
  }
  const seq = ++graph.request;
  graph.controller?.abort();
  const controller = new AbortController();
  graph.controller = controller;
  graph.snapshot = null;
  if (graph.project !== project || memory) graph.lens = '';
  graph.project = project;
  graph.selected = '';
  graph.selectedEdge = '';
  setBusy($('graph-panel'), true);
  $('graph-status').innerHTML = skeleton('Loading relationships…');
  $('graph-count').textContent = '';
  $('graph-body').hidden = true;
  $('graph-lens').hidden = true;
  $('graph-legend').hidden = true;
  try {
    const snapshot = await api(queryPath('graph', { project, memory }), { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) });
    if (seq !== graph.request) return;
    graph.snapshot = snapshot;
    renderGraph();
  } catch (error) {
    if (seq === graph.request && error.name !== 'AbortError') $('graph-status').innerHTML = errorMarkup(error.message, 'graph');
  } finally {
    if (seq === graph.request) setBusy($('graph-panel'), false);
  }
}

function renderContextControls() {
  const input = $('context-cross');
  const toggle = state.features?.features;
  const canCross = document.documentElement.dataset.projectLocal !== 'true' && toggle?.contextAssembly === true && toggle?.crossProjectContext === true;
  $('context-cross-row').hidden = !canCross;
  if (!canCross) input.checked = false;
  $('context-submit').disabled = !toggle?.contextAssembly || !state.projects.length || state.context.pending;
  $('context-related-row').hidden = $('context-profile').value !== 'adaptive';
  const gate = $('context-gate');
  if (!toggle && state.featurePending) {
    gate.innerHTML = '<p class="muted small" role="status">Checking feature settings…</p>';
  } else if (!toggle) {
    gate.innerHTML = errorMarkup('Could not check context assembly settings.', 'features');
  } else if (!toggle.contextAssembly) {
    gate.innerHTML = '<p class="muted small">Context assembly is turned off. <a href="#features">Manage in Features</a></p>';
  } else if (!state.overviewLoaded && state.overviewPending) {
    gate.innerHTML = '<p class="muted small" role="status">Loading projects…</p>';
  } else if (!state.overviewLoaded) {
    gate.innerHTML = errorMarkup('Could not load projects.', 'overview');
  } else if (!state.projects.length) {
    gate.innerHTML = '<p class="muted small">Store a project memory before assembling context.</p>';
  } else {
    gate.replaceChildren();
  }
}

function contextReasonList(items, format) {
  return '<ul class="list">' + items.map(format).join('') + '</ul>';
}

const contextReasons = {
  selected: 'Included in the brief.', duplicate: 'Matches a memory already considered.', budget: 'Would exceed the selected budget.',
  limit: 'Beyond the brief’s memory limit.', 'candidate-limit': 'Beyond the evaluated candidate limit.', empty: 'Contains no memory text.',
  lookback: 'Falls outside the selected time range.', archived: 'Archived in a recorded review.', contested: 'Marked as needing review.',
  superseded: 'Superseded by a recorded replacement.'
};
const rankScore = (value) => Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : '—';

function renderRetrieval(pack) {
  const retrieval = pack.retrieval;
  if (!retrieval || !pack.enabled) return '';
  const counts = list(retrieval.stages);
  const max = Math.max(1, ...counts.map((stage) => Number(stage.count) || 0));
  const stages = counts.map((stage) => '<li><strong>' + number(stage.count) + '</strong><span>' + esc(stage.label) +
    '</span><div class="retrieval-stage-bar" aria-hidden="true"><i style="width:' + Math.max(0, (Number(stage.count) || 0) / max * 100) + '%"></i></div></li>').join('');
  const candidates = list(retrieval.candidates);
  const labels = new Map([...list(pack.entries), ...candidates].map((item) => [item.id, item.title || shorten(compact(item.excerpt), 95) || item.id]));
  const rows = candidates.map((candidate) => {
    const signals = list(candidate.signals).map((signal) => {
      const sign = signal.label === 'Project task feedback' && signal.value > 0 ? '+' : '';
      return '<div><dt>' + esc(signal.label) + '</dt><dd>' + sign + esc(rankScore(signal.value)) + '</dd></div>';
    }).join('');
    const terms = list(candidate.matchedTerms);
    const fields = list(candidate.matchedFields);
    const paths = list(candidate.paths).map((path) => '<li><span class="tag agent">' + esc(linkTypes[path.relationType] || nice(path.relationType)) +
      '</span> ' + memoryLink(path.fromId, candidate.projectId, labels.get(path.fromId) || path.fromId) + ' ' + icon('chevron', true) + ' ' +
      memoryLink(path.toId, candidate.projectId, labels.get(path.toId) || path.toId) + '</li>').join('');
    const feedback = candidate.feedback;
    const reporters = list(feedback?.reporterKinds).map((kind) => kind === 'agent' ? 'Agent' : 'User');
    const feedbackSource = feedback ? '<p class="small muted">' + countLabel(list(feedback.recordIds).length, 'matching task report') +
      (reporters.length ? ' · ' + esc(reporters.join(' and ')) : '') +
      (state.projectKit?.projectId === candidate.projectId ? ' · <a href="' + esc(routeLink('project-kit', { memory: candidate.id })) + '">Review project outcomes</a>' : '') + '</p>' : '';
    const included = candidate.decision === 'selected';
    return '<li><details class="candidate"><summary><span class="candidate-title"><span class="rank">#' + number(candidate.rank) + '</span>' +
      '<span>' + esc(candidate.title || candidate.id) + '</span><span class="tag check-' + (included ? 'ok' : 'warn') + '">' +
      (included ? 'Included' : 'Excluded') + '</span></span></summary><div class="candidate-body"><p class="small muted">' +
      esc(contextReasons[candidate.reason] || nice(candidate.reason)) + ' Rank score ' + esc(rankScore(candidate.score)) + '.</p>' +
      (terms.length ? '<p class="small"><strong>Matched terms</strong> ' + esc(terms.join(', ')) + '</p>' : '') +
      (fields.length ? '<p class="small"><strong>Matched fields</strong> ' + esc(fields.map(nice).join(', ')) + '</p>' : '') +
      (signals ? '<dl class="candidate-signals" aria-label="Ranking contributions">' + signals + '</dl>' : '') + feedbackSource + sourceMarkup(candidate.sources) +
      (paths ? '<div><h3>Recorded link paths</h3><ul class="list">' + paths + '</ul></div>' : '') +
      '<p>' + memoryLink(candidate.id, candidate.projectId, 'Open memory') + '</p></div></details></li>';
  }).join('');
  const reportCount = retrieval.truncated ? ' Candidate diagnostics are bounded to ' + number(retrieval.candidateLimit) + ' records.' : '';
  return '<section class="context-section" aria-labelledby="retrieval-heading"><h3 id="retrieval-heading">Retrieval pipeline</h3>' +
    '<ol class="retrieval-flow" aria-label="Retrieval stages">' + stages + '</ol><p class="small muted">Scanned ' + number(retrieval.scanned) +
    ' memories. Ranking contributions explain ordering.' + esc(reportCount) + '</p>' +
    (rows ? '<details class="context-section" open><summary>Candidate decisions · ' + number(candidates.length) + '</summary>' +
      '<ul class="list candidate-list" aria-label="Candidate decisions">' + rows + '</ul></details>' : '') + '</section>';
}

function renderComparison() {
  const target = $('context-comparison');
  if (!target) return;
  const { comparison, comparing, dirty } = state.context;
  if (dirty || !comparison && !comparing) {
    target.replaceChildren();
    return;
  }
  if (comparing) {
    target.innerHTML = skeleton('Comparing retrieval profiles…');
    return;
  }
  if (comparison.error) {
    target.innerHTML = errorMarkup(comparison.error);
    return;
  }
  const { legacy, adaptive, delta } = comparison;
  const shared = list(delta?.sharedIds);
  const column = (label, pack, ids) => {
    const unique = new Set(ids);
    const entries = list(pack.entries);
    const differences = entries.filter((entry) => unique.has(entry.id));
    return '<div><h3>' + label + '</h3><p class="small muted">' + countLabel(entries.length, 'included memory', 'included memories') + ' · ' +
      number(pack.budget?.estimatedTokens) + ' estimated tokens</p><p class="small"><strong>' + number(differences.length) + ' unique to ' + label + '</strong></p>' +
      (differences.length ? '<ul class="small">' + differences.map((entry) => '<li>' +
        memoryLink(entry.id, entry.projectId, shorten(compact(entry.excerpt), 95) || entry.id) + '</li>').join('') + '</ul>' : '') + '</div>';
  };
  target.innerHTML = '<h3>Profile comparison</h3><p class="small muted">Same task, scope, and requested budget · ' +
    countLabel(shared.length, 'shared memory', 'shared memories') + '</p><div class="compare-grid">' +
    column('Adaptive', adaptive, list(delta?.addedIds)) + column('Legacy', legacy, list(delta?.removedIds)) + '</div>' +
    list(comparison.warnings).map((warning) => '<p class="small muted">' + esc(warning) + '</p>').join('');
}

function renderContext() {
  const output = $('context-output');
  const { pack, dirty, params } = state.context;
  const status = $('context-result-state');
  if (!pack) {
    const enabled = state.features?.features?.contextAssembly !== false;
    status.textContent = enabled ? '' : 'Disabled';
    output.innerHTML = enabled ? blank('context', 'Ready for a task', 'Choose a project and describe the work to see the context and its sources here.') :
      blank('context', 'Context assembly is turned off', 'Enable it in Features to build a brief.');
    return;
  }
  const entries = list(pack.entries);
  const excluded = list(pack.excluded);
  const budget = pack.budget || {};
  const warnings = list(pack.warnings);
  const allowed = state.features?.features?.contextAssembly === true;
  const canInspect = allowed && !dirty && pack.enabled;
  const canCopy = canInspect && !!pack.markdown && entries.length > 0;
  status.textContent = dirty ? 'Rebuild needed' : pack.enabled ? 'Assembled' : 'Disabled';
  const warningMarkup = warnings.map((warning) => '<p class="small muted">' + esc(warning) + '</p>').join('');
  const selection = contextReasonList(entries, (entry) => {
    const title = shorten(compact(entry.excerpt), 120) || nice(entry.category) || entry.id;
    const reason = list(entry.reasons).map((detail) => '<p class="small muted">' + esc(detail) + '</p>').join('');
    const links = list(entry.related).map((relation) => {
      const directional = { fromId: relation.direction === 'outgoing' ? entry.id : relation.otherMemoryId, type: relation.type };
      return '<p class="small">' + esc(linkCaption(directional, entry.id)) + ' ' +
        memoryLink(relation.otherMemoryId, entry.projectId, relation.title || relation.otherMemoryId) + '</p>';
    }).join('');
    return '<li><strong>' + memoryLink(entry.id, entry.projectId, title) + '</strong><div class="small muted">' +
      esc([entry.projectName, entry.agentTool, nice(entry.category)].filter(Boolean).join(' · ')) +
      '</div>' + reason + sourceMarkup(entry.sources) + links + '</li>';
  });
  const rejections = contextReasonList(excluded, (entry) => '<li><strong class="mono">' +
    memoryLink(entry.id, entry.projectId || (pack.scope === 'project' ? pack.projectId : ''), entry.title || entry.id) +
    '</strong><p class="small muted">' + esc(contextReasons[entry.reason] || nice(entry.reason)) + '</p></li>');
  const projectName = state.projects.find((item) => item.id === pack.projectId)?.name || pack.projectId;
  const scope = pack.scope === 'cross-project' ? 'Cross-project · ' + projectName : projectName;
  const usage = budget.tokenBudget > 0 ? Math.min(100, Math.max(0, budget.estimatedTokens / budget.tokenBudget * 100)) : 0;
  output.innerHTML = '<div class="panel-body stack">' + (dirty ? '<p class="status small" role="status">This preview is out of date. Assemble again to refresh it.</p>' : '') +
    '<div class="context-output-head">' + tags([['project', scope], ['memory', params?.profile === 'adaptive' ? 'Adaptive' : 'Legacy']]) +
    '<div class="form-actions">' + (canInspect && params ? '<button type="button" class="button" id="context-compare-button"' +
      (state.context.comparing ? ' disabled' : '') + '>Compare profiles</button>' : '') +
    (canCopy ? '<button class="button" id="context-download" type="button">Download .md</button>' +
      '<button class="button primary" id="context-copy" type="button">' + icon('copy') + 'Copy brief</button>' : '') + '</div></div>' +
    '<p id="copy-status" class="small muted" role="status" hidden></p><dl class="context-metrics">' +
    '<div><dt>Estimated tokens</dt><dd>' + number(budget.estimatedTokens) + ' / ' + number(budget.tokenBudget) + '</dd><div class="context-budget-track" aria-hidden="true"><span style="width:' + usage + '%"></span></div></div>' +
    '<div><dt>Characters</dt><dd>' + number(budget.usedChars) + ' / ' + number(budget.maxChars) + '</dd></div>' +
    '<div><dt>Included / excluded</dt><dd>' + number(entries.length) + ' / ' + number(excluded.length) + '</dd></div></dl>' +
    warningMarkup + '<section class="context-compare" id="context-comparison" aria-live="polite"></section>' + renderRetrieval(pack) +
    '<div class="context-reasons">' +
    (entries.length ? '<details class="context-section"><summary>Included memories · ' + number(entries.length) + '</summary>' + selection + '</details>' : '') +
    (excluded.length ? '<details class="context-section"><summary>Excluded memories · ' + number(excluded.length) + '</summary>' + rejections + '</details>' : '') +
    '</div>' + (pack.markdown && pack.enabled && entries.length ? '<details class="context-section" open><summary>Assembled brief</summary><pre class="context-preview mono" id="context-text" tabindex="0" aria-label="Assembled context markdown">' + esc(pack.markdown) + '</pre></details>' :
      blank('context', pack.enabled ? 'No memories fit this task' : 'Context assembly is turned off', pack.enabled ? 'Review any exclusions or try a different task.' : 'Enable it in Features to build a brief.')) + '</div>';
  renderComparison();
}

async function assembleContext() {
  const store = state.context;
  const toggle = state.features?.features;
  const query = $('context-task').value.trim();
  const projectId = $('context-project').value;
  const tokenBudget = Number($('context-budget').value);
  if (store.pending || !toggle?.contextAssembly || !projectId) return;
  if (!query) {
    $('context-task').setCustomValidity('Enter a task.');
    $('context-task').reportValidity();
    return;
  }
  const profile = $('context-profile').value;
  const body = { query, projectId, tokenBudget, includeCrossProject: toggle.crossProjectContext && $('context-cross').checked,
    profile, ...(profile === 'adaptive' ? { expandRelated: $('context-related').checked } : {}) };
  store.pending = true;
  store.dirty = false;
  store.pack = null;
  store.params = body;
  store.comparison = null;
  store.comparing = false;
  renderContextControls();
  setBusy($('context-result'), true);
  $('context-result-state').textContent = 'Assembling';
  $('context-output').innerHTML = skeleton('Assembling context…');
  try {
    const pack = await api('context', { body });
    const current = state.features?.features;
    if (store.params === body && current?.contextAssembly && (pack.scope !== 'cross-project' || current.crossProjectContext)) store.pack = pack;
    renderContext();
  } catch (error) {
    if (store.params === body) {
      $('context-result-state').textContent = 'Request failed';
      $('context-output').innerHTML = errorMarkup(error.message, 'context');
    }
  } finally {
    store.pending = false;
    setBusy($('context-result'), false);
    renderContextControls();
  }
}

async function compareContext() {
  const store = state.context;
  if (!store.params || store.dirty || store.pending || store.comparing || !store.pack?.enabled) return;
  const params = store.params;
  const { profile, ...body } = params;
  store.comparing = true;
  $('context-compare-button').disabled = true;
  renderComparison();
  try {
    const result = await api('context-compare', { body });
    if (!result.adaptive || !result.legacy || !result.delta) throw new Error('The server returned an unreadable comparison.');
    if (store.params === params && !store.dirty) store.comparison = result;
  } catch (error) {
    if (store.params === params && !store.dirty) store.comparison = { error: error.message };
  } finally {
    if (store.params === params) {
      store.comparing = false;
      if ($('context-compare-button')) $('context-compare-button').disabled = false;
      renderComparison();
    }
  }
}

function downloadContext() {
  const { pack, dirty } = state.context;
  if (!pack?.markdown || !pack.enabled || dirty || !state.features?.features.contextAssembly) return;
  const url = URL.createObjectURL(new Blob([pack.markdown], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'shadow-brain-context.md';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyContext() {
  const store = state.context;
  const status = $('copy-status');
  if (!store.pack?.markdown || !store.pack.enabled || store.dirty || !status || !state.features?.features.contextAssembly) return;
  try {
    await navigator.clipboard.writeText(store.pack.markdown);
    status.textContent = 'Brief copied.';
  } catch {
    status.textContent = 'Clipboard access is unavailable. Select and copy the preview text.';
  }
  status.hidden = false;
}

const checkStates = { pass: ['ok', 'Passed'], warn: ['warn', 'Review'], unknown: ['', 'Unknown'], error: ['error', 'Error'] };
const installStates = {
  complete: ['ok', 'Files present'], partial: ['warn', 'Some files present'], missing: ['', 'Files missing'],
  'not-checked': ['', 'Unchecked'], blocked: ['error', 'Check blocked']
};

function checkTag(value, labels) {
  const [kind, label] = Object.hasOwn(labels, value) ? labels[value] : ['', 'Unknown'];
  return '<span class="tag check-' + kind + '">' + label + '</span>';
}

function commandMarkup(command) {
  if (typeof command !== 'string' || !command.trim()) return '';
  return '<div class="form-actions"><code class="mono">' + esc(command) + '</code><button type="button" class="button quiet" data-copy-command="' +
    esc(command) + '" aria-label="Copy command">' + icon('copy', true) + 'Copy</button><span class="small muted" role="status"></span></div>';
}

function docsLink(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return '';
    return '<a class="button quiet" href="' + esc(url.href) + '" target="_blank" rel="noopener noreferrer">Documentation ' +
      icon('diagonal', true) + '</a>';
  } catch { return ''; }
}

function renderIntegrations(data) {
  const checks = list(data.checks);
  const agents = list(data.agents);
  const checkRows = checks.map((check) => '<li class="check-row"><h3>' + esc(check.label || check.id) + '</h3><div class="check-result"><p class="small muted">' +
    esc(check.detail) + '</p>' + commandMarkup(check.command) + '</div>' + checkTag(check.status, checkStates) + '</li>').join('');
  const agentRows = agents.map((agent) => '<li class="check-row"><h3>' + esc(agent.label || agent.id) + '</h3><div class="check-result">' +
    tags(list(agent.capabilities).map((value) => ['memory', value])) + (agent.detail ? '<p class="small muted">' + esc(agent.detail) + '</p>' : '') +
    (agent.note ? '<p class="small muted">' + esc(agent.note) + '</p>' : '') + commandMarkup(agent.command) +
    (typeof agent.config?.content === 'string' ? '<details class="integration-config"><summary>View MCP setup example</summary>' +
      '<p class="small muted">' + esc([agent.config.format, agent.config.filename].filter(Boolean).join(' · ')) + '</p>' +
      '<pre class="context-preview mono" tabindex="0">' + esc(agent.config.content) + '</pre>' +
      list(agent.config.notes).map((note) => '<p class="small muted">' + esc(note) + '</p>').join('') +
      '<div class="form-actions"><button type="button" class="button quiet" data-copy-command="' + esc(agent.config.content) + '">' +
      icon('copy', true) + 'Copy example</button><span class="small muted" role="status"></span></div></details>' : '') +
    '<div class="form-actions">' + docsLink(agent.docs) + '</div></div>' + checkTag(agent.installation, installStates) + '</li>').join('');
  $('integrations-body').innerHTML = '<div class="stack"><section class="panel"><div class="panel-head"><div><h2>Local diagnostics</h2>' +
    (data.checkedAt ? '<p class="small muted">Last checked ' + dateMarkup(data.checkedAt) + '</p>' : '') + '</div>' +
    (typeof data.diagnostics === 'string' && data.diagnostics ? '<div class="form-actions"><button class="button" type="button" id="diagnostics-copy">' + icon('copy', true) +
    'Copy report</button><span class="small muted" role="status"></span></div>' : '') + '</div>' +
    (checkRows ? '<ul class="list">' + checkRows + '</ul>' : blank('activity', 'No diagnostic results', 'Run checks to refresh the local status.')) +
    '</section><section class="panel"><div class="panel-head"><div><h2>Supported agents</h2>' +
    '<p class="small muted">Installation status reflects project skill files. Use Live operations to inspect recorded sessions.</p></div></div>' +
    '<div class="integration-meta"><span class="tag project">Project skill files</span><span class="tag memory">MCP setup examples</span><a class="small" href="/live">Recorded sessions ' + icon('chevron', true) + '</a></div>' +
    (agentRows ? '<ul class="list">' + agentRows + '</ul>' : blank('integrations', 'No agent data', 'Run checks to load the support catalog.')) +
    '</section></div>';
}

async function loadIntegrations() {
  const store = state.integrations;
  if (store.pending) return;
  store.pending = true;
  const target = $('integrations-body');
  $('integrations-refresh').disabled = true;
  setBusy(target, true);
  target.innerHTML = '<div class="panel">' + skeleton('Running local checks…') + '</div>';
  try {
    store.snapshot = await api('integrations');
    renderIntegrations(store.snapshot);
  } catch (error) {
    target.innerHTML = errorMarkup(error.message, 'integrations');
  } finally {
    store.pending = false;
    $('integrations-refresh').disabled = false;
    setBusy(target, false);
  }
}

async function copyIntegrationText(value, message, button) {
  const status = button.nextElementSibling;
  if (!value || !status) return;
  try {
    await navigator.clipboard.writeText(value);
    status.textContent = message;
  } catch {
    status.textContent = 'Clipboard access is unavailable.';
  }
}

function projectFeatureLimit(id) {
  if (document.documentElement.dataset.projectLocal !== 'true') return undefined;
  return { crossProjectContext: 'Project memory stays scoped to this project.', automaticBriefing: 'Automatic briefing requires a legacy analysis session.' }[id];
}

function renderFeatures() {
  const target = $('feature-list');
  if (!state.features) return;
  const current = state.features.features;
  const overrides = new Map(list(state.features.definitions).map((item) => [item.id, item]));
  const icons = { contextAssembly: 'context', crossProjectContext: 'graph', automaticBriefing: 'agent', liveActivity: 'activity', activityRecording: 'memory' };
  target.innerHTML = '<ul class="list">' + definitions.map((definition) => {
    const display = overrides.get(definition.id) || definition;
    const reason = projectFeatureLimit(definition.id);
    const on = !reason && current[definition.id] === true;
    return '<li class="setting"><div class="settings-description"><span class="tile-icon">' + icon(icons[definition.id], true) + '</span><div><h3 id="label-' + definition.id + '">' + esc(display.label) + '</h3><p class="muted small" id="desc-' +
      definition.id + '">' + esc(reason || display.description) + '</p></div></div><button type="button" class="button switch" role="switch" aria-checked="' +
      on + '" aria-labelledby="label-' + definition.id + '" aria-describedby="desc-' + definition.id + '" data-feature="' + definition.id + '"' +
      (state.featureSaving || reason ? ' disabled' : '') + '><span aria-hidden="true">' + (reason ? 'Unavailable' : on ? 'On' : 'Off') + '</span><span class="switch-track" aria-hidden="true"></span></button></li>';
  }).join('') + '</ul>';
}

function applyFeatures(snapshot) {
  const before = state.features?.features;
  const current = snapshot.features;
  if (!current || !Number.isSafeInteger(snapshot.revision) || !definitions.every(({ id }) => typeof current[id] === 'boolean')) {
    throw new Error('The server returned unreadable feature settings.');
  }
  if (state.features && snapshot.revision < state.features.revision) return;
  state.features = snapshot;
  state.activityEnabled = current.liveActivity;
  const context = state.context;
  if (!current.contextAssembly || !current.crossProjectContext && context.params?.includeCrossProject) {
    context.pack = null;
    context.params = null;
    context.comparison = null;
    context.comparing = false;
  }
  renderFeatures();
  renderActivity();
  renderContextControls();
  if (!context.pending) renderContext();
  if (current.liveActivity && before?.liveActivity !== true) void refreshActivity();
}

function featureStatus(message, error = false) {
  const target = $('feature-status');
  target.textContent = message;
  target.dataset.error = String(error);
}

async function loadFeatures(force = false) {
  if (state.featurePending) return state.featurePending;
  if (state.features && !force) return;
  const target = $('feature-list');
  if (!state.features) target.innerHTML = skeleton('Loading feature settings…');
  setBusy(target, true);
  state.featurePending = (async () => {
    try {
      applyFeatures(await api('features'));
      return true;
    } catch (error) {
      if (!state.features) target.innerHTML = errorMarkup(error.message, 'features');
      else if (!state.featureSaving) featureStatus(error.message, true);
      return false;
    } finally {
      state.featurePending = null;
      setBusy(target, false);
      renderContextControls();
    }
  })();
  renderContextControls();
  return state.featurePending;
}

async function toggleFeature(key) {
  if (state.featureSaving || !state.features || projectFeatureLimit(key) || !definitions.some((definition) => definition.id === key)) return;
  state.featureSaving = true;
  $('feature-list').querySelectorAll('[data-feature]').forEach((button) => { button.disabled = true; });
  featureStatus('Saving…');
  try {
    const body = { patch: { [key]: !state.features.features[key] }, expectedRevision: state.features.revision };
    applyFeatures(await api('features', { body }));
    featureStatus('Saved.');
  } catch (error) {
    if (error.status === 409) {
      const refreshed = await loadFeatures(true);
      featureStatus(refreshed ? 'Settings changed elsewhere. Review the current settings and try again.' :
        'Settings changed elsewhere. Reload Features to see the current settings.', true);
    } else {
      featureStatus(error.message, true);
    }
  } finally {
    state.featureSaving = false;
    renderFeatures();
    if (state.view === 'features') $('feature-list').querySelector('[data-feature="' + key + '"]')?.focus();
  }
}

function setPreference(key, value, announce = true) {
  document.documentElement.dataset[key] = value;
  let persisted = true;
  if (announce) {
    try {
      localStorage.setItem('shadow-brain:workspace:' + key, value);
    } catch { persisted = false; }
    const status = $('display-status');
    status.hidden = false;
    status.textContent = persisted ? 'Display preference saved on this device.' : 'Display preference applied for this session.';
  }
  $('theme-setting').value = document.documentElement.dataset.theme;
  $('motion-setting').value = document.documentElement.dataset.motion;
  const dark = document.documentElement.dataset.theme === 'dark';
  const label = dark ? 'Switch to light theme' : 'Switch to dark theme';
  const button = $('theme-toggle');
  button.innerHTML = icon(dark ? 'sun' : 'moon');
  button.title = label;
  button.setAttribute('aria-label', label);
  if (announce && !persisted && state.view !== 'features') {
    $('workspace-notice').hidden = false;
    $('workspace-notice').textContent = 'Display preference applied for this session.';
  }
}

function routeParams() {
  return new URLSearchParams(location.hash.split('?')[1] || '');
}

function changeMemorySearch() {
  const query = memoryQuery();
  const route = routeLink('memories', query);
  if (location.hash !== route) location.hash = route;
  else void loadMemories(query);
}

function changeView(moveFocus = false) {
  const hash = location.hash.slice(1).split('?')[0];
  const view = Object.hasOwn(viewNames, hash) ? hash : 'overview';
  const previous = state.view;
  const previousRoute = state.route;
  state.view = view;
  state.route = location.hash || '#overview';
  $('crumb').textContent = viewNames[view];
  document.title = viewNames[view] + ' · Agent Shadow Brain';
  for (const name of Object.keys(viewNames)) {
    const section = $('page-' + name);
    section.hidden = name !== view;
    const link = document.querySelector('[data-view="' + name + '"]');
    if (name === view || name === 'memories' && view === 'memory') link?.setAttribute('aria-current', 'page');
    else link?.removeAttribute('aria-current');
  }
  if (moveFocus && (previous !== view || view === 'memory')) {
    window.scrollTo(0, 0);
    $('title-' + view).focus({ preventScroll: true });
  }
  const params = routeParams();
  const project = params.get('project') || '';
  switch (view) {
    case 'overview':
      void loadOverview(previous !== '' && previous !== 'overview', project);
      void loadFeatures();
      break;
    case 'memories': {
      const query = { q: params.get('q') || '', project, category: params.get('category') || '', agent: params.get('agent') || '', state: params.get('state') || '' };
      $('memory-query').value = query.q;
      if (state.projects.length) optionSet('memory-project', 'All projects', state.projects, query.project);
      $('memory-state').value = query.state;
      void loadMemories(query);
      break;
    }
    case 'memory': {
      if (previous && previous !== 'memory') state.detail.back = previousRoute;
      const back = $('detail-back');
      const name = state.detail.back.slice(1).split('?')[0];
      back.href = state.detail.back;
      back.innerHTML = icon('left', true) + esc(viewNames[name] || 'Memories');
      void loadDetail(params.get('id') || '', project);
      break;
    }
    case 'graph': {
      void loadOverview();
      if (project) optionSet('graph-project', 'All projects', state.projects, project);
      else $('graph-project').value = '';
      const memory = params.get('memory') || '';
      if (memory) ['graph-query', 'graph-kind', 'graph-relation'].forEach((id) => { $(id).value = ''; });
      void loadGraph(project, previous !== '' && previous !== 'graph', memory);
      break;
    }
    case 'context':
      if (project) {
        state.context.routeProject = project;
        syncProjectOptions();
        if (state.context.params && state.context.params.projectId !== project) {
          state.context.dirty = true;
          if (!state.context.pending) renderContext();
        }
      }
      void loadOverview();
      void loadFeatures(previous !== '');
      renderContextControls();
      break;
    case 'features':
      featureStatus('');
      void loadFeatures(true);
      break;
    case 'project-kit':
      void loadProjectKit();
      break;
    case 'integrations':
      if (state.integrations.snapshot) renderIntegrations(state.integrations.snapshot);
      else void loadIntegrations();
      break;
  }
}

function graphSelectFromList(id, fromInspector) {
  if (!state.graph.nodes.some((node) => node.id === id)) {
    $('graph-query').value = '';
    $('graph-kind').value = '';
    $('graph-relation').value = '';
    renderGraph();
  }
  selectGraphNode(id, { center: fromInspector, focus: fromInspector });
}

function handleGraphKeyboard(event) {
  const edge = event.target.closest('[data-edge-record]');
  if (edge) {
    const links = Array.from($('graph-svg').querySelectorAll('[data-edge-record]'));
    const index = links.indexOf(edge);
    const nextIndex = { ArrowLeft: Math.max(index - 1, 0), ArrowRight: Math.min(index + 1, links.length - 1), Home: 0, End: links.length - 1 }[event.key];
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectGraphEdge(edge.dataset.edgeRecord);
    } else if (Number.isInteger(nextIndex)) {
      event.preventDefault();
      const next = links[nextIndex];
      selectGraphEdge(next.dataset.edgeRecord);
      next.focus();
    }
    return;
  }
  const target = event.target.closest('[data-node]');
  if (!target) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    selectGraphNode(target.dataset.node, { center: true });
    return;
  }
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const graph = state.graph;
  const { positions } = graph.layout;
  const points = [...positions.entries()].map(([id, point]) => ({ id, x: point.x + point.width / 2, y: point.y + point.height / 2 }));
  let next;
  if (event.key === 'Home' || event.key === 'End') {
    points.sort((a, b) => a.y - b.y || a.x - b.x);
    next = event.key === 'Home' ? points[0] : points.at(-1);
  } else {
    const current = points.find((point) => point.id === target.dataset.node);
    const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    const sign = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const axis = horizontal ? 'x' : 'y';
    const other = horizontal ? 'y' : 'x';
    const score = (point) => Math.abs(point[axis] - current[axis]) + Math.abs(point[other] - current[other]) * 1.4;
    next = points.filter((point) => (point[axis] - current[axis]) * sign > 3).sort((a, b) => score(a) - score(b))[0];
  }
  if (next) selectGraphNode(next.id, { center: true, focus: true });
}

$('theme-toggle').addEventListener('click', () => setPreference('theme', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
$('theme-setting').addEventListener('change', (event) => setPreference('theme', event.target.value));
$('motion-setting').addEventListener('change', (event) => setPreference('motion', event.target.value));
$('memory-form').addEventListener('submit', (event) => { event.preventDefault(); changeMemorySearch(); });
['memory-project', 'memory-category', 'memory-agent', 'memory-state'].forEach((id) => $(id).addEventListener('change', changeMemorySearch));
$('overview-quality-project').addEventListener('change', (event) => {
  const project = event.target.value;
  const route = routeLink('overview', { project });
  window.history.replaceState(null, '', route);
  state.route = route;
  void loadOverview(true, project).then(() => {
    if (state.view === 'overview' && state.route === route) $('overview-quality-project')?.focus();
  });
});
$('overview-body').addEventListener('change', (event) => {
  if (event.target.id !== 'attention-filter') return;
  state.health.filter = event.target.value;
  renderAttention();
});
$('overview-body').addEventListener('click', (event) => {
  if (event.target.closest('#attention-jump')) $('attention-heading')?.focus();
});
$('integrations-refresh').addEventListener('click', () => { void loadIntegrations(); });
$('graph-query').addEventListener('input', renderGraph);
$('graph-kind').addEventListener('change', renderGraph);
$('graph-relation').addEventListener('change', renderGraph);
$('graph-project').addEventListener('change', (event) => {
  const route = routeLink('graph', { project: event.target.value });
  if (location.hash !== route) location.hash = route;
  else void loadGraph(event.target.value);
});
['map', 'list'].forEach((mode) => $('graph-mode-' + mode).addEventListener('click', () => {
  state.graph.mode = mode;
  $('graph-mode-map').setAttribute('aria-pressed', String(mode === 'map'));
  $('graph-mode-list').setAttribute('aria-pressed', String(mode === 'list'));
  renderGraph();
}));
$('graph-fit').addEventListener('click', () => fitGraph());
$('graph-lens-clear').addEventListener('click', () => {
  const anchor = state.graph.lens;
  state.graph.lens = '';
  renderGraph();
  if (state.graph.nodes.some((node) => node.id === anchor)) selectGraphNode(anchor, { focus: true });
  else $('graph-query').focus();
});
$('graph-in').addEventListener('click', () => zoomGraph(1.35));
$('graph-out').addEventListener('click', () => zoomGraph(1 / 1.35));
$('graph-svg').addEventListener('keydown', handleGraphKeyboard);
$('graph-svg').addEventListener('focusin', (event) => {
  const node = event.target.closest('[data-node]');
  if (node) renderGraphTooltip(node.dataset.node);
});
$('graph-svg').addEventListener('focusout', () => renderGraphTooltip(state.graph.selected));
$('graph-svg').addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !event.isPrimary || event.target.closest('[data-node],[data-edge-record]')) return;
  const graph = state.graph;
  graph.drag = { id: event.pointerId, x: event.clientX - graph.panX, y: event.clientY - graph.panY };
  $('graph-svg').setPointerCapture(event.pointerId);
  $('graph-svg').classList.add('dragging');
});
$('graph-svg').addEventListener('pointermove', (event) => {
  const graph = state.graph;
  if (graph.drag?.id !== event.pointerId) return;
  graph.panX = event.clientX - graph.drag.x;
  graph.panY = event.clientY - graph.drag.y;
  updateGraphTransform();
});
$('graph-svg').addEventListener('lostpointercapture', () => {
  state.graph.drag = null;
  $('graph-svg').classList.remove('dragging');
});
window.addEventListener('resize', () => {
  if (state.view === 'graph' && state.graph.mode === 'map' && state.graph.nodes.length) {
    renderGraphMap();
    updateGraphSelection();
  }
});

$('context-form').addEventListener('submit', (event) => { event.preventDefault(); void assembleContext(); });
$('context-form').addEventListener('input', () => {
  $('context-task').setCustomValidity('');
  $('context-related-row').hidden = $('context-profile').value !== 'adaptive';
  const store = state.context;
  if (store.pack || store.pending) {
    if (!store.dirty) {
      store.dirty = true;
      if (!store.pending) renderContext();
    }
  }
});

$('detail-body').addEventListener('submit', (event) => {
  const { id } = state.detail;
  switch (event.target.id) {
    case 'review-form':
      event.preventDefault();
      void saveDetail('memory-review', { memoryId: id, state: $('review-state').value, note: $('review-note').value.trim() }, 'review-submit');
      break;
    case 'link-search':
      event.preventDefault();
      void searchLinkTargets();
      break;
    case 'link-form':
      event.preventDefault();
      void saveDetail('memory-link', { fromId: id, toId: $('link-target').value, type: $('link-type').value, note: $('link-note').value.trim() }, 'link-editor');
      break;
  }
});

document.addEventListener('click', (event) => {
  const element = event.target.closest('[data-retry],[data-memory-clear],[data-memory-page],[data-node],[data-related],[data-edge-record],[data-graph-lens],[data-feature],[data-unlink],[data-copy-command],#diagnostics-copy,#context-copy,#context-download,#context-compare-button,.skip');
  if (!element) return;
  const data = element.dataset;
  if (data.retry) {
    switch (data.retry) {
      case 'overview': void loadOverview(true, state.view === 'overview' ? routeParams().get('project') || '' : ''); break;
      case 'health': void loadHealth(state.overviewScope); break;
      case 'kit-profile': void loadProjectKit(true); break;
      case 'memories': void loadMemories(state.memory.query || memoryQuery(), state.memory.offset); break;
      case 'graph': void loadGraph(state.graph.project, true, state.graph.focusMemory); break;
      case 'detail': void loadDetail(state.detail.id, state.detail.project); break;
      case 'integrations': void loadIntegrations(); break;
      case 'context': $('context-form').requestSubmit(); break;
      case 'features': void loadFeatures(true); break;
    }
  } else if (Object.hasOwn(data, 'memoryClear')) {
    ['memory-query', 'memory-project', 'memory-category', 'memory-agent', 'memory-state'].forEach((id) => { $(id).value = ''; });
    $('memory-query').focus();
    changeMemorySearch();
  } else if (data.memoryPage) {
    const { query, offset, limit } = state.memory;
    const step = data.memoryPage === 'next' ? limit : -limit;
    $('memory-search').focus();
    void loadMemories(query || memoryQuery(), Math.max(0, offset + step));
  } else if (data.node) {
    selectGraphNode(data.node);
  } else if (data.related) {
    graphSelectFromList(data.related, true);
  } else if (data.edgeRecord) {
    selectGraphEdge(data.edgeRecord, $('graph-inspector').contains(element));
  } else if (data.graphLens) {
    state.graph.lens = data.graphLens;
    ['graph-query', 'graph-kind', 'graph-relation'].forEach((id) => { $(id).value = ''; });
    renderGraph();
    $('graph-lens-clear').focus();
  } else if (data.unlink) {
    void saveDetail('memory-unlink', { memoryId: state.detail.id, linkId: data.unlink }, 'link-editor');
  } else if (data.copyCommand) {
    void copyIntegrationText(data.copyCommand, 'Command copied.', element);
  } else if (data.feature) {
    void toggleFeature(data.feature);
  } else if (element.id === 'context-copy') {
    void copyContext();
  } else if (element.id === 'context-download') {
    downloadContext();
  } else if (element.id === 'context-compare-button') {
    void compareContext();
  } else if (element.id === 'diagnostics-copy') {
    void copyIntegrationText(state.integrations.snapshot?.diagnostics, 'Diagnostic report copied.', element);
  } else if (element.classList.contains('skip')) {
    event.preventDefault();
    $('main-content').focus();
  }
});

${PROJECT_KIT_SCRIPT}

window.addEventListener('hashchange', () => changeView(true));
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshActivity(); });
setInterval(() => { void refreshActivity(); }, 10000);
setPreference('theme', document.documentElement.dataset.theme, false);
renderContext();
changeView();
</script>
</body>
</html>`;
