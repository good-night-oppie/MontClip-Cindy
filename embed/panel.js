/* The side panel inside Cindy (framed by the plugin's panel.html; same origin as the editor). 文稿 lists the timeline's
   lines and follows the playhead; a click moves the editor there. 属性 shows the selected clip. The editor tab talks to
   this page over a BroadcastChannel whose name carries this task's own suffix (app.js startHostChannel after the
   editor's claim, MontClip#215 E3): the panel trades the one-time task ticket in its first address for that suffix
   (POST /api/embed/channel), and with no channel — or no editor heard on it lately — a click only says the editor is
   not open. It never falls back to an unscoped UI command, which would move every task's editor at once. */
(function () {
  "use strict";
  const M = window.MontClipPanelModel;
  const $ = (id) => document.getElementById(id);
  let ch = null, channelReady = false, events = null;
  let project = { clips: [], media: [] }, list = [], editor = null, editorSeen = 0, now = -1;
  /* Without a task ticket this page does not know whose task it belongs to (in Cindy the panel is a global tab
     with no session in its address), so it must not read the engine's currently open project, show lines or seek:
     that is how one task's lines used to appear in another task (MontClip-Cindy#48). The two prompts are JJ's
     (#48 issuecomment-6729474414), one for each page; they promise nothing this panel can't do yet (#52). */
  const NO_TASK_LINES = '这里暂时不显示文稿。请在要剪的任务里打开 MontClip 剪辑器，在剪辑器里看字幕。';
  const NO_TASK_PROPS = '这里暂时不显示片段属性。请在要剪的任务里打开 MontClip 剪辑器，在剪辑器里选中片段查看。';
  const linesEmptyText = $("linesEmpty").textContent, propsEmptyText = $("propsEmpty").textContent;
  function showNoTask() {
    project = { clips: [], media: [] }; list = []; editor = null;
    $("lines").textContent = "";
    $("linesEmpty").textContent = NO_TASK_LINES; $("linesEmpty").hidden = false;
    $("props").textContent = "";
    $("propsEmpty").textContent = NO_TASK_PROPS; $("propsEmpty").hidden = false;
  }

  /* The framing page's origin (the browser's ancestorOrigins, else the referrer's): the only origin whose
     montclip-host-ticket answers this page takes. */
  const parentOrigin = (() => {
    try { if (location.ancestorOrigins && location.ancestorOrigins.length) return location.ancestorOrigins[0]; } catch (e) { }
    try { if (document.referrer) return new URL(document.referrer).origin; } catch (e) { }
    return null;
  })();
  function onEditorState(e) {
    const m = e.data || {};
    if (m.type !== "editor-state") return;
    const selChanged = !editor || editor.selId !== m.selId, revChanged = !!editor && editor.revision !== m.revision;
    editor = m; editorSeen = Date.now();
    $("offline").hidden = true;
    if (revChanged) load(); else { follow(); if (selChanged) renderProps(); }
  }
  /* Trade a one-time task ticket for this task's channel suffix and listen on it; anything refused (used,
     expired, another engine's) leaves the panel channel-less, on purpose. */
  async function openChannel(ticket) {
    if (!ticket || typeof BroadcastChannel !== "function") return false;
    try {
      const r = await fetch("/api/embed/channel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket }) });
      if (!r.ok) return false;
      const body = await r.json();
      if (!body || !body.channel) return false;
      if (ch) { try { ch.close(); } catch (e) { } }
      ch = new BroadcastChannel("montclip-editor:" + body.channel);
      ch.onmessage = onEditorState;
      channelReady = true;
      $("linesEmpty").textContent = linesEmptyText; $("propsEmpty").textContent = propsEmptyText;
      ch.postMessage({ type: "hello" });
      // the engine's change signal, only once this page has a task (QQ, #48): without one it listens to nothing
      if (!events) { events = new EventSource("/api/events"); events.addEventListener("change", load); }
      load();
      return true;
    } catch (e) { return false; }
  }
  /* Back to no task: the channel and the change signal both end, and the page says so. */
  function closeChannel() {
    if (ch) { try { ch.close(); } catch (e) { } }
    if (events) { try { events.close(); } catch (e) { } }
    ch = null; events = null; channelReady = false;
    showNoTask();
  }
  function askParentForTicket() {
    if (!parentOrigin || window.parent === window) return;
    try { window.parent.postMessage({ type: "montclip-need-ticket" }, parentOrigin); } catch (e) { }
  }
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent || !parentOrigin || e.origin !== parentOrigin) return;
    const m = e.data || {};
    if (m.type === "montclip-host-ticket" && /^[a-f0-9]{64}$/.test(m.ticket || "")) openChannel(m.ticket);
  });
  /* The first address carries the ticket once; take it out of the address, then trade it. No ticket (or a
     refused one) asks the framing page for a fresh one, the same rule as the editor's reconnect. */
  const firstTicket = (() => {
    const t = new URLSearchParams(location.search).get("ticket");
    if (t) {
      const q = new URLSearchParams(location.search); q.delete("ticket");
      try { history.replaceState(history.state, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash); } catch (e) { }
    }
    return /^[a-f0-9]{64}$/.test(t || "") ? t : null;
  })();
  (async () => { if (!(await openChannel(firstTicket))) askParentForTicket(); })();

  /* tabs: arrow keys move between them, as a tablist should */
  const tabs = [$("tabLines"), $("tabProps")], pages = [$("pageLines"), $("pageProps")];
  function pick(i) {
    tabs.forEach((t, j) => { t.setAttribute("aria-selected", String(i === j)); t.tabIndex = i === j ? 0 : -1; pages[j].hidden = i !== j; });
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => pick(i));
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const j = (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
      pick(j); tabs[j].focus();
    });
  });

  function renderLines() {
    list = M.lines(project);
    const ol = $("lines");
    ol.textContent = "";
    for (const [i, l] of list.entries()) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.i = String(i);
      const time = document.createElement("time");
      time.textContent = M.formatTime(l.start);
      const span = document.createElement("span");
      span.textContent = l.text;
      b.append(time, span);
      b.addEventListener("click", () => seek(l.start));
      li.appendChild(b);
      ol.appendChild(li);
    }
    $("linesEmpty").hidden = list.length > 0;
    now = -1;
    follow();
  }
  function follow() {
    const i = editor ? M.currentIndex(list, editor.time) : -1;
    if (i === now) return;
    const items = $("lines").children;
    if (items[now]) items[now].classList.remove("now");
    now = i;
    if (items[i]) {
      items[i].classList.add("now");
      if (editor && editor.playing) items[i].scrollIntoView({ block: "nearest" });
    }
  }
  function renderProps() {
    const f = editor && editor.selId ? M.clipFacts(project, editor.selId) : null;
    const dl = $("props");
    dl.textContent = "";
    $("propsEmpty").hidden = !!f;
    if (!f) return;
    const rows = [["名称", f.name], ["类型", f.kindLabel], ["轨道", f.track], ["开始", M.formatTime(f.start)], ["结束", M.formatTime(f.end)],
      ["时长", f.duration + " 秒"]];
    if (f.in !== null) rows.push(["素材起点", M.formatTime(f.in)]);
    if (f.media) rows.push(["素材", f.media.name], ["素材信息", [f.media.width && f.media.height ? `${f.media.width}×${f.media.height}` : "",
      f.media.fps ? f.media.fps + " fps" : "", f.media.codec || "", f.media.duration ? M.formatTime(f.media.duration) : ""].filter(Boolean).join(" · ")]);
    for (const [k, v, swatch] of f.props) rows.push([k, v, swatch]);
    if (f.keyframes.length) rows.push(["关键帧", f.keyframes.join("、")]);
    if (f.locked) rows.push(["锁定", "是"]);
    if (f.disabled) rows.push(["停用", "是"]);
    for (const [k, v, swatch] of rows) {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd");
      if (swatch) {   // 颜色: a swatch, then the value
        const chip = document.createElement("span");
        chip.className = "swatch"; chip.style.background = swatch;
        dd.appendChild(chip);
      }
      dd.appendChild(document.createTextNode(v));
      dl.append(dt, dd);
    }
  }
  function seek(t) {
    if (ch && Date.now() - editorSeen < 3000) { ch.postMessage({ type: "seek", t }); return; }
    $("offline").hidden = false;
  }

  async function load() {
    if (!channelReady) { showNoTask(); return; }
    try {
      const r = await fetch("/api/project", { cache: "no-store" });
      if (!r.ok) return;
      project = await r.json();
      renderLines(); renderProps();
    } catch (e) { /* the engine is restarting: the next change event reloads */ }
  }
  /* No timeout on the editor's state: a background tab's timers are slowed (VV, #114: the highlight went after 3 s),
     so silence is not the editor going away. The last highlight and selection stay until the editor says otherwise;
     a click still checks how lately the channel was heard from. */
  window.addEventListener("pagehide", closeChannel);
  showNoTask();
  load();
})();
