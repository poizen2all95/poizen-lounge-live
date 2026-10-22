/* Mobile navigation and a continuous, manually scrollable record tape. */
(function (root) {
  'use strict';
  const PRIMARY = [
    { id: 'live', label: 'Home', icon: 'live' },
    { id: 'research', label: 'Research', icon: 'research' },
    { id: 'me', label: 'My Slips', icon: 'user' },
    { id: 'pickem', label: 'Lounge', icon: 'target' },
    { id: 'more', label: 'More', icon: 'games' },
  ];
  const RESEARCH = ['research', 'games', 'injuries', 'ftd', 'scalp'];
  function groupFor(id) { return RESEARCH.includes(id) ? 'research' : PRIMARY.some(x => x.id === id) ? id : 'more'; }
  function nextOffset(offset, elapsed, cycle, paused) {
    if (paused || cycle <= 0) return offset;
    return (offset + Math.max(0, Math.min(100, elapsed)) * 0.02) % cycle;
  }
  const api = { PRIMARY, RESEARCH, groupFor, nextOffset };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.PZMobile = api;
  const doc = root.document;
  const media = root.matchMedia('(max-width:860px)');
  const reduced = root.matchMedia('(prefers-reduced-motion:reduce)');
  const more = doc.getElementById('mobileMore');
  const record = doc.getElementById('record');
  const pause = doc.getElementById('recordPause');
  let opener;
  let tickerHTML = null, cycle = 0, previous = 0, offset = 0, lastWrite = 0, userPaused = false;
  let resumeAt = 0, hovering = false, touching = false;
  const hold = () => { resumeAt = performance.now() + 3500; };
  function closeMore(restore = true) {
    if (!more.open) return;
    more.close();
    doc.querySelector('[data-mobile-more]')?.setAttribute('aria-expanded', 'false');
    if (restore) opener?.focus();
  }
  function openMore() {
    opener = doc.querySelector('[data-mobile-more]');
    if (more.open) { closeMore(); return; }
    more.showModal();
    opener?.setAttribute('aria-expanded', 'true');
    more.querySelector('[data-close-more]').focus();
  }
  function measureTape() {
    const first = record.firstElementChild;
    if (!first) return;
    const width = first.getBoundingClientRect().width;
    /* Always run as a loop (like a stock ticker): enough copies that the strip never runs dry, even on a wide screen. */
    const loop = width > 0 && !reduced.matches;
    const step = width + 8;
    const copies = loop ? Math.max(1, Math.ceil(record.clientWidth / step)) : 0;
    while (record.children.length - 1 < copies) {
      const copy = first.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true'); copy.inert = true;
      record.appendChild(copy);
    }
    while (record.children.length - 1 > copies) record.children[record.children.length - 1].remove();
    cycle = loop ? step : 0;
    pause.hidden = !cycle;
    record.scrollLeft = cycle ? offset % cycle : offset;
    lastWrite = record.scrollLeft;
    if (!cycle) offset = record.scrollLeft;
  }
  api.setRecord = (html) => {
    if (html === tickerHTML) return;
    tickerHTML = html;
    const group = doc.createElement('div'); group.className = 'record-group'; group.innerHTML = html;
    record.replaceChildren(group);
    root.requestAnimationFrame(measureTape);
  };
  api.renderNav = (active, tabs, icons, counts = {}) => {
    const bottom = doc.getElementById('bottom');
    const group = groupFor(active);
    bottom.innerHTML = PRIMARY.map(x => `<button class="navbtn" type="button" ${x.id === 'more' ? 'data-mobile-more aria-haspopup="dialog" aria-controls="mobileMore" aria-expanded="' + more.open + '"' : 'data-tab="' + x.id + '"'} ${group === x.id ? 'aria-current="page"' : ''}>${icons[x.icon] || ''}<span>${x.label}</span></button>`).join('');
    const grid = more.querySelector('.mobile-more-grid');
    grid.innerHTML = tabs.map(([id, label, icon]) => `<button class="navbtn" type="button" data-tab="${id}" ${active === id ? 'aria-current="page"' : ''}>${icons[icon] || ''}<span>${label}</span>${counts[id] ? '<span class="cnt">' + counts[id] + '</span>' : ''}</button>`).join('');
  };
  api.researchNav = (active, tabs) => !RESEARCH.includes(active) ? '' : `<nav class="mobile-research" aria-label="Research sections">${RESEARCH.map(id => {
    const t = tabs.find(x => x[0] === id);
    return `<button type="button" class="fbtn" data-tab="${id}" ${active === id ? 'aria-current="page"' : ''}>${t[1]}</button>`;
  }).join('')}</nav>`;
  api.afterNavigate = () => { closeMore(false); doc.activeElement?.blur(); };
  api.themeOpened = () => {
    if (media.matches) doc.getElementById('vibeMenu').querySelector('button')?.focus();
  };
  doc.addEventListener('click', e => {
    if (e.target.closest('[data-mobile-more]')) openMore();
    if (e.target.closest('[data-close-more]') || e.target === more) closeMore();
    if (e.target.closest('#recordPause')) {
      userPaused = !userPaused;
      pause.setAttribute('aria-pressed', String(userPaused));
      pause.setAttribute('aria-label', userPaused ? 'Resume record ticker' : 'Pause record ticker');
      pause.textContent = userPaused ? '▶' : 'Ⅱ';
    }
    if (e.target.closest('[data-close-vibe]')) {
      doc.getElementById('vibeMenu').hidden = true;
      doc.getElementById('vibeBtn').setAttribute('aria-expanded', 'false');
      doc.getElementById('vibeBtn').focus();
    }
  });
  more.addEventListener('close', () => doc.querySelector('[data-mobile-more]')?.setAttribute('aria-expanded', 'false'));
  // Trap keyboard focus in the theme sheet without changing the site's page state.
  doc.addEventListener('keydown', e => {
    const menu = doc.getElementById('vibeMenu');
    if (!media.matches || menu.hidden || e.key !== 'Tab') return;
    const controls = [...menu.querySelectorAll('button,input,select,[tabindex="0"]')].filter(x => !x.disabled && !x.hidden);
    const first = controls[0], last = controls[controls.length - 1];
    if (e.shiftKey && (doc.activeElement === first || !menu.contains(doc.activeElement))) { e.preventDefault(); last?.focus(); }
    if (!e.shiftKey && (doc.activeElement === last || !menu.contains(doc.activeElement))) { e.preventDefault(); first?.focus(); }
  });
  record.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') hovering = true; });
  record.addEventListener('pointerleave', () => { hovering = false; hold(); });
  record.addEventListener('pointerdown', () => { touching = true; hold(); });
  root.addEventListener('pointerup', () => { touching = false; offset = record.scrollLeft; hold(); });
  root.addEventListener('pointercancel', () => { touching = false; hold(); });
  record.addEventListener('wheel', hold, { passive: true });
  record.addEventListener('keydown', hold);
  record.addEventListener('focusout', hold);
  record.addEventListener('scroll', () => {
    // Browser scroll offsets can be rounded. Keep the animation's fractional phase.
    if (record.scrollLeft === lastWrite) return;
    offset = record.scrollLeft; hold();
  }, { passive: true });
  function frame(now) {
    const keyboardFocus = record.contains(doc.activeElement) && record.matches(':focus-visible');
    const stopped = doc.hidden || reduced.matches || userPaused || hovering || touching || now < resumeAt || keyboardFocus;
    if (cycle && !stopped) {
      offset = nextOffset(offset, previous ? now - previous : 0, cycle, false);
      record.scrollLeft = offset;
      lastWrite = record.scrollLeft;
    }
    previous = now;
    root.requestAnimationFrame(frame);
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measureTape).observe(record);
  reduced.addEventListener('change', measureTape);
  media.addEventListener('change', () => { if (!media.matches) closeMore(false); });
  function fitKeyboard() {
    const viewport = root.visualViewport;
    if (!viewport) return;
    doc.documentElement.style.setProperty('--mobile-viewport', viewport.height + 'px');
    doc.documentElement.style.setProperty('--mobile-keyboard', Math.max(0, root.innerHeight - viewport.height - viewport.offsetTop) + 'px');
  }
  if (root.visualViewport) { root.visualViewport.addEventListener('resize', fitKeyboard); root.visualViewport.addEventListener('scroll', fitKeyboard); fitKeyboard(); }
  root.requestAnimationFrame(frame);
})(typeof window !== 'undefined' ? window : globalThis);
