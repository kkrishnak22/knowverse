// On-page frame meter: add ?perf to the URL (before the #) to show it.
//
// It measures what the user's own browser is doing: frames per second, the slowest recent
// frame, how many frames were dropped, and which script caused any long frame. "Copy report"
// puts the numbers on the clipboard so they can be pasted into a bug report.
//
// This is the one place allowed to call requestAnimationFrame directly: it has to observe
// every frame, including the ones the shared loop chooses to skip.

const WINDOW_MS = 1000;

export function showPerfMeter() {
  if (document.getElementById('perf-meter')) return;
  const el = document.createElement('div');
  el.id = 'perf-meter';
  el.style.cssText =
    'position:fixed;left:12px;bottom:12px;z-index:9999;padding:8px 10px;border-radius:10px;font:11px/1.45 ui-monospace,Consolas,monospace;' +
    'color:#d7defa;background:rgba(5,7,12,.88);border:1px solid rgba(255,255,255,.16);white-space:pre;pointer-events:auto;user-select:none';
  const text = document.createElement('div');
  const copy = document.createElement('button');
  copy.textContent = 'Copy report';
  copy.style.cssText = 'margin-top:6px;padding:2px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.2);color:inherit;font:inherit;cursor:pointer';
  el.append(text, copy);
  document.body.append(el);

  const frames = []; // { t, dt } for the last second
  const longFrames = []; // attributed long frames, newest last
  const session = { frames: 0, dropped: 0, worst: 0, scrollFrames: 0, scrollDropped: 0, scrollWorst: 0 };
  let last = performance.now();
  let lastScroll = -Infinity;
  let refresh = 16.7; // estimated display frame time: the shortest frame seen

  // Capture phase catches scrolling in any container.
  document.addEventListener('scroll', () => (lastScroll = performance.now()), { capture: true, passive: true });

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const script = [...(e.scripts || [])].sort((a, b) => b.duration - a.duration)[0];
        const where = script ? `${(script.sourceURL || '').split('/').slice(-2).join('/').split('?')[0]} ${script.sourceFunctionName || script.invoker || ''}`.trim() : 'rendering (no script)';
        longFrames.push({ ms: Math.round(e.duration), where });
        if (longFrames.length > 8) longFrames.shift();
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {
    /* not supported in this browser: the frame counts still work */
  }

  function tick(now) {
    const dt = now - last;
    last = now;
    if (dt > 4 && dt < refresh) refresh = dt;
    frames.push({ t: now, dt });
    while (frames.length && now - frames[0].t > WINDOW_MS) frames.shift();
    const dropped = dt > refresh * 1.5 ? Math.round(dt / refresh) - 1 : 0;
    const scrolling = now - lastScroll < 150;
    session.frames++;
    session.dropped += dropped;
    session.worst = Math.max(session.worst, dt);
    if (scrolling) {
      session.scrollFrames++;
      session.scrollDropped += dropped;
      session.scrollWorst = Math.max(session.scrollWorst, dt);
    }
    if (session.frames % 10 === 0) render();
    requestAnimationFrame(tick);
  }

  function report() {
    const worst = Math.max(0, ...frames.map((f) => f.dt));
    const pct = (a, b) => (b ? ((a / (a + b)) * 100).toFixed(1) : '0.0');
    return [
      `fps ${frames.length}   worst frame ${worst.toFixed(0)} ms   display ${(1000 / refresh).toFixed(0)} Hz`,
      `all:    ${session.dropped} dropped of ${session.frames + session.dropped} (${pct(session.dropped, session.frames)}%), worst ${session.worst.toFixed(0)} ms`,
      `scroll: ${session.scrollDropped} dropped of ${session.scrollFrames + session.scrollDropped} (${pct(session.scrollDropped, session.scrollFrames)}%), worst ${session.scrollWorst.toFixed(0)} ms`,
      ...longFrames.slice(-3).map((f) => `long ${f.ms} ms: ${f.where}`),
    ].join('\n');
  }

  const render = () => (text.textContent = report());
  copy.addEventListener('click', () => {
    const full = `${report()}\n${location.hash}  ${innerWidth}x${innerHeight} @${devicePixelRatio}x  ${navigator.userAgent.match(/(Chrome|Firefox|Edg|Safari)\/[\d.]+/g)?.join(' ') || ''}`;
    navigator.clipboard?.writeText(full).then(() => (copy.textContent = 'Copied'), () => (copy.textContent = 'Copy failed'));
    setTimeout(() => (copy.textContent = 'Copy report'), 1500);
  });
  el.addEventListener('dblclick', () => Object.assign(session, { frames: 0, dropped: 0, worst: 0, scrollFrames: 0, scrollDropped: 0, scrollWorst: 0 }));
  requestAnimationFrame(tick);
}
