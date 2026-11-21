/** Console chrome lives outside the live view so an incoming event cannot dismiss a menu. */
export const HUB_SHELL_STYLE = String.raw`
:root[data-hub-theme="daylight"] {
  color-scheme: light;
  --ground:#f1f5f9; --surface:#fff; --raised:#edf3f8; --ink:#192c40; --muted:#415a70;
  --border:#c1cfdb; --strong:#708699; --cyan:#006863; --blue:#214f9e; --pink:#77358a;
  --amber:#865009; --red:#a51f39; --green:#11613e;
}
:root[data-hub-theme="contrast"] {
  --ground:#040509; --surface:#0c0e14; --raised:#171b24; --ink:#fff; --muted:#d4dae2;
  --border:#7d8797; --strong:#b6c1d1; --cyan:#8ffcf0; --amber:#ffdb7f;
}
:root[data-hub-theme] :is(.panel-head,.rail-title,.graph-foot,.receipt,.trace-list,.graph-finder) {
  background:var(--surface);color:var(--ink)
}
:root[data-hub-theme] :is(.entry,.rail-entry,.btn):is(:hover,[aria-pressed=true]) {
  background:var(--raised);color:var(--ink);border-color:var(--strong)
}
:root[data-hub-theme="daylight"] :is(.chip,pre,.focus-label,.graph-empty) {
  background:var(--raised);color:var(--ink)
}
:root[data-hub-theme="daylight"] .chip:is(.green,.cyan) {background:#ddf3ed;color:#125a49}
:root[data-hub-theme="daylight"] .chip.amber {background:#ffefcc;color:#704504}
:root[data-hub-theme="daylight"] .chip.red {background:#ffebef;color:#98203a}
:root[data-hub-theme="daylight"] .chip.pink {background:#f4e9fb;color:#683888}
:root[data-hub-theme="daylight"] .btn.primary {background:#006863;color:#fff}
.hub-theme {display:flex;align-items:center;gap:.45rem;color:var(--muted);font-size:.82rem}
#hub-menu {width:min(25rem,calc(100vw - 2rem));max-height:80dvh;border:1px solid var(--strong);
  background:var(--surface);color:var(--ink);padding:0;border-radius:10px;overflow:auto}
#hub-menu::backdrop {background:rgb(3 11 22 / .54)}
.hub-menu-head {padding:.7rem 1rem;border-bottom:1px solid var(--border)}
.hub-menu-options {display:grid;padding:.4rem}
.hub-menu-options button {display:block;text-align:left;background:transparent;border:0;border-radius:5px;
  color:var(--ink);padding:.55rem .7rem;font:inherit}
.hub-menu-options button:is(:hover,:focus-visible) {background:var(--raised);color:var(--cyan)}
@media(max-width:680px){.top .actions{gap:6px}.hub-theme select{max-width:116px}}
`;

export const HUB_MENU = String.raw`
<dialog id="hub-menu" aria-labelledby="hub-menu-title">
  <div class="row hub-menu-head"><h2 id="hub-menu-title">Workspace actions</h2><button type="button" id="menu-close" class="btn quiet">Close</button></div>
  <div class="hub-menu-options" id="hub-menu-options"></div>
</dialog>`;

export const HUB_SHELL_CLIENT = String.raw`
function openFileContext(path) {
  if (!path || !local) return;
  state.contextInput = { ...state.contextInput, query: path, profile: 'adaptive' };
  state.context = null;
  state.comparison = null;
  openView('context');
}
function installHubShell() {
  const theme = $('hub-theme');
  const key = 'shadow-brain:hub-appearance';
  try {
    const saved = localStorage.getItem(key);
    if ([...theme.options].some(option => option.value === saved)) theme.value = saved;
  } catch {}
  const applyTheme = () => { document.documentElement.dataset.hubTheme = theme.value; };
  applyTheme();
  theme.addEventListener('change', () => {
    applyTheme();
    try { localStorage.setItem(key, theme.value); } catch {}
  });

  const dialog = $('hub-menu');
  const menuItems = $('hub-menu-options');
  function showMenu(target, pickedNode) {
    const node = pickedNode || target?.closest('[data-node]')?.dataset.node;
    const agent = target?.closest('[data-dock-tool]')?.dataset.dockTool;
    const eventId = target?.closest('[data-event]')?.dataset.event;
    const record = arr(state.graph?.nodes).find(item => item.id === node);
    const entries = [];
    const add = (label, run) => entries.push({label, run});
    if (record) {
      add('Inspect record', () => chooseMemory(record.id));
      add('See related records', async () => {
        await chooseMemory(record.id);
        if (state.picked === record.id) { state.inspector='relations'; renderInspector(); }
      });
      if (local) add('Find context for this record', () => openFileContext(record.label));
    }
    if (agent) add('Inspect ' + hostName(agent), () => {
      dockTool=agent;pickDockRecord();dockPinned=true;updateAgentDock();
    });
    if (eventId) add('Inspect recorded exchange', () => {
      openView('overview');setReplay(state.events.findIndex(item => item.id === eventId));
    });
    for (const [id, label] of Object.entries(nav)) {
      if (id !== state.view && (local || id !== 'files')) add(label, () => openView(id));
    }
    $('hub-menu-title').textContent = record?.label || (agent && hostName(agent)) || (eventId && 'Exchange actions') || 'Workspace actions';
    menuItems.replaceChildren();
    for (const entry of entries) {
      const button=document.createElement('button');
      button.type='button';button.textContent=entry.label;
      button.addEventListener('click', () => { dialog.close(); void entry.run(); });
      menuItems.append(button);
    }
    if (!dialog.open) dialog.showModal();
    menuItems.querySelector('button')?.focus();
  }
  $('menu-launch').addEventListener('click', () => showMenu(null));
  $('menu-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  const contextual = '[data-node],[data-dock-tool],[data-event]';
  $('main').addEventListener('contextmenu', event => {
    if (!event.target.closest(contextual)) return;
    event.preventDefault(); showMenu(event.target);
  });
  $('main').addEventListener('hub-record-menu', event => showMenu(null,event.detail));
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || state.pending) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault(); if (dialog.open) dialog.close(); else showMenu(document.activeElement);
    }
    if (event.shiftKey && event.key === 'F10' && event.target.closest(contextual)) {
      event.preventDefault(); showMenu(event.target);
    }
  });
}
`;
