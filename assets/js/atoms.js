(() => {
  const CFG = window.ABUTWINS || window.ATOMS || {};
  if (!window.ABUTWINS && window.ATOMS) {
    window.ABUTWINS = window.ATOMS;
  }
  const state = {
    bootstrap: null,
    branchId: null,
    flash: null,
    report: { preset: 'today', from: '', to: '' },
    audit: { q: '', action: '', entity_type: '', from: '', to: '', page: 1 },
    customerId: null,
    supplierId: null,
    transferId: null,
    purchaseId: null,
    swapId: null,
    repairId: null,
    returnId: null,
    customerInvoice: null,
    productFocusId: null,
    countId: null,
    approvalId: null,
    expenseId: null,
    searchQ: '',
    inboundTab: 'queue',
    pager: {},
  };

  let renderGen = 0;
  let lastRenderedKey = null;
  const routeMemoryCache = new Map();
  const ROUTE_CACHE_MAX = 20;

  const prefetchByPage = {
    dashboard: (bid) => [`dashboard?branch_id=${bid}`],
    inventory: () => ['inventory?branch_id=', 'products'],
    pos: () => ['products'],
    purchases: () => ['purchases', 'products', 'suppliers'],
    inbound: (bid) => [`inbound/desk?branch_id=${bid}`],
    transfers: () => ['transfers'],
    stocktake: (bid) => [`stock-counts?branch_id=${bid}`],
    returns: (bid) => [`returns?branch_id=${bid}`],
    swaps: (bid) => [`swaps?branch_id=${bid}`],
    repairs: (bid) => [`repairs?branch_id=${bid}`],
    expenses: (bid) => [`expenses?branch_id=${bid}`],
    suppliers: () => ['suppliers'],
    customers: (bid) => [`customers?branch_id=${bid}`],
    analytics: (bid) => [`analytics?days=14&branch_id=${bid}`],
    notifications: () => ['notifications'],
    approvals: () => ['approvals'],
    settings: () => ['settings'],
  };

  let routeProgressTimer = null;

  function routeCacheKey() {
    return [
      location.hash,
      state.branchId,
      state.purchaseId,
      state.countId,
      state.customerId,
      state.supplierId,
      state.transferId,
      state.repairId,
      state.returnId,
      state.swapId,
      state.approvalId,
      state.expenseId,
      state.productFocusId,
      state.searchQ,
      state.report?.preset,
      state.report?.from,
      state.report?.to,
      state.audit?.page,
      state.inboundTab,
      JSON.stringify(state.pager || {}),
    ].join('|');
  }

  function trimRouteCache() {
    while (routeMemoryCache.size > ROUTE_CACHE_MAX) {
      const first = routeMemoryCache.keys().next().value;
      routeMemoryCache.delete(first);
    }
  }

  function pageSkeleton() {
    return `<div class="atoms-route-skeleton" aria-busy="true" aria-label="Loading page">
      <div class="atoms-sk-header">
        <div class="atoms-sk-line w35"></div>
        <div class="atoms-sk-line w60"></div>
        <div class="atoms-sk-line w45"></div>
      </div>
      <div class="atoms-sk-kpis">
        <div class="atoms-sk-card"></div>
        <div class="atoms-sk-card"></div>
        <div class="atoms-sk-card"></div>
        <div class="atoms-sk-card"></div>
      </div>
      <div class="atoms-sk-table">
        <div class="atoms-sk-line w100"></div>
        <div class="atoms-sk-line w100"></div>
        <div class="atoms-sk-line w92"></div>
        <div class="atoms-sk-line w96"></div>
      </div>
    </div>`;
  }

  function startRouteProgress(mode = 'full') {
    const track = document.getElementById('atoms-route-progress');
    if (!track) return;
    const bar = track.querySelector('.atoms-route-progress-bar');
    track.hidden = false;
    track.dataset.mode = mode;
    track.classList.remove('is-done');
    track.classList.add('is-active');
    if (bar) bar.style.width = mode === 'soft' ? '28%' : '12%';
    clearInterval(routeProgressTimer);
    let width = mode === 'soft' ? 28 : 12;
    routeProgressTimer = setInterval(() => {
      width = Math.min(width + (mode === 'soft' ? 3 : 6), mode === 'soft' ? 88 : 90);
      if (bar) bar.style.width = `${width}%`;
    }, 100);
  }

  function finishRouteProgress() {
    clearInterval(routeProgressTimer);
    const track = document.getElementById('atoms-route-progress');
    if (!track) return;
    const bar = track.querySelector('.atoms-route-progress-bar');
    if (bar) bar.style.width = '100%';
    track.classList.add('is-done');
    track.classList.remove('is-active');
    window.setTimeout(() => {
      track.hidden = true;
      track.classList.remove('is-done');
      if (bar) bar.style.width = '0%';
    }, 260);
  }

  function updateNavActive(current = page()) {
    document.querySelectorAll('#atoms-nav a[href^="#/"], #atoms-dock a[href^="#/"]').forEach((a) => {
      const hash = (a.getAttribute('href') || '').replace('#/', '').split('?')[0];
      a.classList.toggle('active', hash === current);
    });
  }

  function prefetchForHash(hash) {
    const name = String(hash || '').replace('#/', '').split('?')[0];
    const fn = prefetchByPage[name];
    if (!fn) return;
    const bid = state.branchId || '';
    fn(bid).forEach((path) => {
      api(path).catch(() => {});
    });
  }

  function wireNavPrefetch() {
    const onHover = (e) => {
      const a = e.target.closest('a[href^="#/"]');
      if (a) prefetchForHash(a.getAttribute('href'));
    };
    document.getElementById('atoms-nav')?.addEventListener('mouseover', onHover, { passive: true });
    document.getElementById('atoms-dock')?.addEventListener('mouseover', onHover, { passive: true });
  }

  const SIDEBAR_COLLAPSED_KEY = 'atoms_sidebar_collapsed';

  function isDesktopNav() {
    return window.matchMedia('(min-width: 961px)').matches;
  }

  function sidebarCollapsedPref() {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  }

  function setSidebarCollapsed(collapsed, persist = true) {
    const root = document.getElementById('atoms-root');
    const btn = document.getElementById('atoms-sidebar-toggle');
    const menuToggle = document.getElementById('atoms-menu-toggle');
    if (!root) return;
    const active = Boolean(collapsed && isDesktopNav());
    root.classList.toggle('sidebar-collapsed', active);
    document.documentElement.classList.remove('atoms-prefers-sidebar-collapsed');
    if (persist) {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, active ? '1' : '0');
    }
    if (btn) {
      btn.setAttribute('aria-expanded', active ? 'false' : 'true');
      btn.setAttribute('aria-label', active ? 'Expand sidebar' : 'Collapse sidebar');
      btn.title = active ? 'Expand sidebar' : 'Collapse sidebar';
      const icon = btn.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = active ? 'chevron_right' : 'chevron_left';
    }
    if (menuToggle) {
      const menuIcon = menuToggle.querySelector('.material-symbols-outlined');
      if (menuIcon) menuIcon.textContent = active ? 'menu_open' : 'menu';
      menuToggle.setAttribute('aria-label', active ? 'Expand sidebar' : 'Toggle navigation menu');
    }
  }

  function toggleSidebarCollapsed() {
    const root = document.getElementById('atoms-root');
    if (!root) return;
    if (!isDesktopNav()) {
      root.classList.toggle('nav-open');
      return;
    }
    setSidebarCollapsed(!root.classList.contains('sidebar-collapsed'));
  }

  function initSidebarCollapse() {
    setSidebarCollapsed(sidebarCollapsedPref(), false);
    document.getElementById('atoms-sidebar-toggle')?.addEventListener('click', () => {
      toggleSidebarCollapsed();
    });
    window.matchMedia('(min-width: 961px)').addEventListener('change', (e) => {
      if (!e.matches) {
        document.getElementById('atoms-root')?.classList.remove('sidebar-collapsed');
        document.getElementById('atoms-root')?.classList.remove('nav-open');
      } else {
        setSidebarCollapsed(sidebarCollapsedPref(), false);
      }
    });
  }

  function mountPageContent(root, html, gen, routeKey) {
    if (gen !== renderGen) return false;
    root.innerHTML = flashHtml() + html;
    state.flash = null;
    routeMemoryCache.set(routeKey, html);
    trimRouteCache();
    lastRenderedKey = routeKey;
    root.classList.remove('is-loading', 'is-navigating', 'is-soft-loading', 'is-revalidating');
    root.classList.add('is-entering');
    bind();
    refreshBell();
    if (state.productFocusId) {
      const focus = document.getElementById(`prod-row-${state.productFocusId}`);
      if (focus) {
        focus.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        window.scrollTo(0, 0);
      }
    } else {
      window.scrollTo(0, 0);
    }
    document.getElementById('atoms-root')?.classList.remove('nav-open');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => root.classList.remove('is-entering'));
    });
    finishRouteProgress();
    return true;
  }

  const navGroups = [
    {
      id: 'floor',
      label: 'Daily operations',
      items: [
        { hash: 'dashboard', label: 'Store overview', icon: 'dashboard', cap: 'atoms_read' },
        { hash: 'pos', label: 'Checkout (POS)', icon: 'point_of_sale', cap: 'atoms_create_sale' },
        { hash: 'imei', label: 'Device lookup', icon: 'smartphone', cap: 'atoms_view_imei' },
        { hash: 'returns', label: 'Returns & refunds', icon: 'keyboard_return', cap: 'atoms_create_return' },
        { hash: 'swaps', label: 'Trade-ins & swaps', icon: 'swap_horiz', cap: 'atoms_create_swap' },
        { hash: 'repairs', label: 'Repairs', icon: 'build', cap: 'atoms_manage_repairs' },
      ],
    },
    {
      id: 'stock',
      label: 'Stock & purchasing',
      items: [
        { hash: 'inventory', label: 'Product catalog', icon: 'inventory_2', cap: 'atoms_read' },
        { hash: 'inbound', label: 'Inbound manifest', icon: 'move_to_inbox', cap: 'atoms_manage_inbound', altCap: 'atoms_manage_purchases' },
        { hash: 'purchases', label: 'Purchase orders', icon: 'local_shipping', cap: 'atoms_manage_purchases' },
        { hash: 'transfers', label: 'Stock transfers', icon: 'sync_alt', cap: 'atoms_manage_transfers' },
        { hash: 'stocktake', label: 'Stock count', icon: 'fact_check', cap: 'atoms_manage_inventory' },
      ],
    },
    {
      id: 'pricing',
      label: 'Pricing & governance',
      items: [
        { hash: 'pricing', label: 'Price desk', icon: 'sell', cap: 'atoms_read' },
        { hash: 'pricing-bulk', label: 'Bulk price update', icon: 'price_change', cap: 'atoms_manage_pricing', altCap: 'atoms_manage_products' },
        { hash: 'pricing-import', label: 'Market price import', icon: 'upload_file', cap: 'atoms_manage_pricing', altCap: 'atoms_manage_products' },
        { hash: 'pricing-history', label: 'Price history', icon: 'history', cap: 'atoms_read' },
      ],
    },
    {
      id: 'money',
      label: 'Money & reports',
      items: [
        { hash: 'customers', label: 'Customers', icon: 'group', cap: 'atoms_read' },
        { hash: 'suppliers', label: 'Suppliers', icon: 'storefront', cap: 'atoms_manage_suppliers' },
        { hash: 'expenses', label: 'Expenses', icon: 'receipt_long', cap: 'atoms_manage_expenses' },
        { hash: 'reports', label: 'Reports', icon: 'analytics', cap: 'atoms_view_reports' },
        { hash: 'analytics', label: 'Trends & charts', icon: 'monitoring', cap: 'atoms_view_reports' },
      ],
    },
    {
      id: 'office',
      label: 'Administration',
      items: [
        { hash: 'notifications', label: 'Alerts', icon: 'notifications', cap: 'atoms_read' },
        { hash: 'approvals', label: 'Approvals', icon: 'verified_user', cap: 'atoms_approve' },
        { hash: 'audit', label: 'Activity log', icon: 'history', cap: 'atoms_view_audit' },
        { hash: 'settings', label: 'Settings', icon: 'tune', cap: 'atoms_manage_settings' },
      ],
    },
  ];

  const nav = navGroups.flatMap((g) => g.items);

  function canNav(item) {
    if (can(item.cap)) return true;
    if (item.altCap && can(item.altCap)) return true;
    return item.hash === 'approvals' && can('atoms_approve_adjustments');
  }

  function can(cap) {
    return (state.bootstrap?.user?.capabilities || []).includes(cap);
  }

  function canInbound() {
    return can('atoms_manage_inbound') || can('atoms_manage_purchases');
  }

  function canReceivePurchases() {
    return can('atoms_manage_purchases');
  }

  function tablePasteToCsv(text, headers) {
    const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rows = lines.map((line) => {
      const parts = line.includes('\t') ? line.split('\t') : line.split(',');
      return parts.map((p) => String(p).trim());
    });
    return [headers.join(',')].concat(rows.map((parts) => parts.join(','))).join('\n');
  }

  function money(kobo) {
    const n = Number(kobo || 0) / 100;
    return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function saleTypeLabel(type) {
    const key = String(type || 'retail').toLowerCase();
    return key === 'wholesale' ? 'Wholesale' : 'Retail';
  }

  async function openAppLink(link) {
    if (!link || !link.screen) return;
    switch (link.screen) {
      case 'repairs':
        state.repairId = Number(link.id);
        goHash('#/repairs');
        break;
      case 'returns':
        state.returnId = Number(link.id);
        goHash('#/returns');
        break;
      case 'transfers':
        state.transferId = Number(link.id);
        goHash('#/transfers');
        break;
      case 'stocktake':
        state.countId = Number(link.id);
        goHash('#/stocktake');
        break;
      case 'purchases':
        state.purchaseId = Number(link.id);
        goHash('#/purchases');
        break;
      case 'expenses':
        state.expenseId = Number(link.id);
        goHash('#/expenses');
        break;
      case 'approvals':
        state.approvalId = link.id ? Number(link.id) : null;
        goHash('#/approvals');
        break;
      case 'product':
        state.productFocusId = Number(link.id);
        goHash('#/inventory');
        break;
      case 'imei':
        state.searchQ = link.imei || '';
        goHash('#/imei');
        break;
      case 'customer':
        state.customerId = Number(link.id);
        state.customerInvoice = link.invoice || null;
        goHash('#/customers');
        break;
      case 'invoice':
        if (link.invoice) {
          try {
            const sale = await api(`sales/invoice/${encodeURIComponent(link.invoice)}`);
            printInvoice(sale);
          } catch (err) {
            setFlash(err.message, 'error');
            render();
          }
        }
        break;
      default:
        break;
    }
  }

  function labelStatus(status) {
    const map = {
      available: 'In stock', reserved: 'Reserved', sold: 'Sold', returned: 'Returned',
      faulty: 'Faulty', under_repair: 'In repair', transferred: 'In transit', disposed: 'Disposed',
      pending: 'Waiting', pending_approval: 'Waiting for approval', completed: 'Posted', posted: 'Posted',
      open: 'Open', requested: 'Requested', approved: 'Approved', dispatched: 'On the way',
      received: 'Received', inspecting: 'Inspecting', cancelled: 'Cancelled', rejected: 'Rejected',
      voided: 'Voided', match: 'Match', missing: 'Missing', wrong_branch: 'Wrong branch',
      unknown: 'Unknown', unexpected_status: 'Unexpected status', paid: 'Paid',
    };
    return map[status] || String(status || '').replace(/_/g, ' ');
  }

  function labelEvent(event) {
    const map = {
      purchase_received: 'Received from supplier',
      reserve_for_sale: 'Reserved for sale',
      release_reserve: 'Reservation released',
      complete_sale: 'Sold',
      return_good: 'Returned (good)',
      return_faulty: 'Returned (faulty)',
      return_warranty: 'Returned under warranty',
      return_exchange: 'Exchanged',
      send_to_repair: 'Sent to repair',
      repair_complete: 'Repair finished',
      repair_return_customer: 'Returned to customer',
      repair_unfixable: 'Could not be repaired',
      transfer_dispatch: 'Sent to another branch',
      transfer_receive: 'Received at branch',
      transfer_cancel: 'Transfer cancelled',
      swap_in: 'Taken in on swap',
      swap_out: 'Given out on swap',
      supplier_return: 'Returned to supplier',
      dispose: 'Disposed',
      count_missing: 'Missing at stock count',
      mark_faulty: 'Marked faulty',
      mark_available: 'Marked in stock',
    };
    return map[event] || String(event || '').replace(/_/g, ' ');
  }

  function badge(status) {
    const map = {
      available: 'ok', completed: 'ok', posted: 'ok', received: 'ok', paid: 'ok', match: 'ok',
      pending: 'warn', requested: 'warn', approved: 'info', inspecting: 'warn', reserved: 'warn', transferred: 'warn',
      pending_approval: 'warn', open: 'info', cancelled: 'info', dispatched: 'warn',
      missing: 'bad', wrong_branch: 'warn', unknown: 'bad', unexpected_status: 'warn',
      sold: 'info', voided: 'bad', faulty: 'bad', rejected: 'bad', disposed: 'bad',
    };
    return `<span class="atoms-badge ${map[status] || 'info'}">${escapeHtml(labelStatus(status))}</span>`;
  }

  function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function api(path, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const headers = {
      'Content-Type': 'application/json',
      'X-WP-Nonce': CFG.nonce,
      ...(options.headers || {}),
    };
    if (options.idempotencyKey) {
      headers['X-Idempotency-Key'] = options.idempotencyKey;
    }
    let res;
    try {
      res = await fetch(CFG.root + path.replace(/^\//, ''), {
        credentials: 'same-origin',
        ...options,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (err) {
      if (method === 'GET') {
        const hit = readCache(path);
        if (hit !== undefined) return hit;
      }
      const e = new Error('Network unavailable. The request was not sent.');
      e.offline = true;
      throw e;
    }
    const raw = await res.text();
    let json = {};
    try {
      json = raw ? JSON.parse(raw) : {};
    } catch (_) {
      const plain = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      throw new Error(plain.includes('Fatal error') ? 'Server error loading inventory API. Refresh after the plugin update finishes.' : (plain.slice(0, 180) || `Request failed (${res.status})`));
    }
    if (!res.ok) {
      const rawMsg = json.message || json.data?.message || `Request failed (${res.status})`;
      const msg = String(rawMsg).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const e = new Error(msg || `Request failed (${res.status})`);
      e.status = res.status;
      e.code = json.code || '';
      throw e;
    }
    if (method === 'GET' && canCacheGet(path)) {
      writeCache(path, json.data);
    }
    return json.data;
  }

  function offlineManifest() {
    return state.bootstrap?.offline || {
      queue_posts: ['sales', 'returns', 'customers'],
      queue_post_patterns: ['customers/[0-9]+/payments'],
      cache_prefixes: ['bootstrap', 'dashboard', 'imei', 'customers', 'products', 'returns/locate', 'sales/invoice'],
      warm_gets: ['products', 'customers?q='],
      max_queue: 200,
      max_retries: 8,
    };
  }

  function canQueuePost(path) {
    const p = String(path || '').replace(/^\//, '').split('?')[0];
    const m = offlineManifest();
    if ((m.queue_posts || []).includes(p)) return true;
    return (m.queue_post_patterns || []).some((pat) => {
      try { return new RegExp(`^${pat}$`).test(p); } catch (_) { return false; }
    });
  }

  function canCacheGet(path) {
    const p = String(path || '').replace(/^\//, '').toLowerCase();
    return (offlineManifest().cache_prefixes || []).some((prefix) => (
      p === prefix || p.startsWith(prefix + '/') || p.startsWith(prefix + '?')
    ));
  }

  function clientId() {
    if (window.crypto?.randomUUID) return crypto.randomUUID().replace(/-/g, '');
    return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }

  function queueLabel(path, body) {
    const imei = body?.items?.[0]?.imei || '';
    const p = String(path || '').replace(/^\//, '').split('?')[0];
    if (p === 'returns') return imei ? `Return ${imei}` : 'Return';
    if (p === 'customers') return body?.name ? `Customer ${body.name}` : 'New customer';
    if (/^customers\/\d+\/payments$/.test(p)) {
      return body?.amount != null ? `Payment ₦${body.amount}` : 'Customer payment';
    }
    return imei ? `Sale ${imei}` : 'Sale';
  }

  function readCache(path) {
    try {
      const all = JSON.parse(localStorage.getItem('atoms_cache') || '{}');
      if (!Object.prototype.hasOwnProperty.call(all, path)) return undefined;
      return all[path];
    } catch (_) {
      return undefined;
    }
  }

  function writeCache(path, data) {
    try {
      const all = JSON.parse(localStorage.getItem('atoms_cache') || '{}');
      all[path] = data;
      const keys = Object.keys(all);
      if (keys.length > 120) keys.slice(0, keys.length - 120).forEach((k) => delete all[k]);
      localStorage.setItem('atoms_cache', JSON.stringify(all));
    } catch (_) { /* quota */ }
  }

  function readQueue() {
    try {
      return JSON.parse(localStorage.getItem('atoms_queue') || '[]');
    } catch (_) {
      return [];
    }
  }

  function writeQueue(q) {
    localStorage.setItem('atoms_queue', JSON.stringify(q));
    syncOnline();
  }

  function enqueueOffline(item) {
    const max = Number(offlineManifest().max_queue || 200);
    const q = readQueue();
    const client_id = item.client_id || item.body?.client_id || clientId();
    const body = { ...(item.body || {}), client_id };
    q.push({
      ...item,
      body,
      client_id,
      at: item.at || Date.now(),
      retries: Number(item.retries || 0),
      label: item.label || queueLabel(item.path, body),
    });
    while (q.length > max) {
      const dropIdx = q.findIndex((i) => i.failed);
      q.splice(dropIdx >= 0 ? dropIdx : 0, 1);
    }
    writeQueue(q);
    requestBackgroundSync();
  }

  function dropQueueItem(at) {
    writeQueue(readQueue().filter((i) => Number(i.at) !== Number(at)));
  }

  function requestBackgroundSync() {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.ready) return;
    navigator.serviceWorker.ready.then((reg) => {
      if (reg.sync?.register) {
        reg.sync.register('atoms-flush').catch(() => {});
      }
    }).catch(() => {});
  }

  async function warmOfflineCache() {
    if (!navigator.onLine) return;
    const paths = offlineManifest().warm_gets || [];
    for (const path of paths) {
      try { await api(path); } catch (_) { /* ignore */ }
    }
  }

  function isRetryableSyncError(err) {
    if (err?.offline) return true;
    const status = Number(err?.status || 0);
    if (status === 429 || status >= 500) return true;
    const msg = String(err?.message || '').toLowerCase();
    return msg.includes('too many requests') || msg.includes('try again') || msg.includes('temporar');
  }

  function page() {
    return (location.hash.replace('#/', '') || 'dashboard').split('?')[0];
  }

  function hashQuery() {
    const raw = location.hash.replace('#/', '') || 'dashboard';
    const idx = raw.indexOf('?');
    if (idx < 0) return {};
    const out = {};
    new URLSearchParams(raw.slice(idx + 1)).forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }

  function flashHtml() {
    if (!state.flash) return '';
    return `<div class="atoms-flash ${state.flash.type}">${escapeHtml(state.flash.text)}</div>`;
  }

  function setFlash(text, type = 'ok') {
    state.flash = { text, type };
  }

  /** Wrap native selects so CSS can draw a clear chevron and focus ring. */
  function decorateSelectHtml(html) {
    return String(html || '')
      .replace(/<select(\s[^>]*)?>/gi, (match, attrs = '') => {
        const a = attrs || '';
        if (/\batoms-select\b/.test(a)) return match;
        if (/\bclass\s*=/.test(a)) {
          return `<select${a.replace(/class\s*=\s*(["'])/, 'class=$1atoms-select ')}>`;
        }
        return `<select class="atoms-select"${a}>`;
      })
      .replace(/(<select\b[\s\S]*?<\/select>)/gi, (sel) => {
        if (/atoms-select-wrap/.test(sel)) return sel;
        return `<div class="atoms-select-wrap"><span class="material-symbols-outlined atoms-select-icon" aria-hidden="true">unfold_more</span>${sel}</div>`;
      });
  }

  function field(label, html) {
    return `<div class="atoms-field"><label>${label}</label>${decorateSelectHtml(html)}</div>`;
  }

  function scanInput(id, placeholder, extra = '') {
    return `<div class="atoms-scan-row">
      <input id="${id}" data-atoms-scan-input="1" inputmode="numeric" placeholder="${placeholder}" autocomplete="off" ${extra}>
      <button type="button" class="atoms-btn sm js-scan" data-target="${id}" title="Scan with camera or USB scanner"><span class="material-symbols-outlined">qr_code_scanner</span> Scan</button>
    </div>`;
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
  }

  function pageShell(opts = {}) {
    const { group = '', trail = '', title = '', subtitle = '', actions = '', back = '', compact = false } = opts;
    const breadcrumb = group
      ? `<div class="atoms-breadcrumb"><span>${escapeHtml(group)}</span>${trail ? `<span class="material-symbols-outlined">chevron_right</span><span class="current">${escapeHtml(trail)}</span>` : ''}</div>`
      : '';
    return `
      <div class="atoms-page-shell${compact ? ' is-compact' : ''}">
        ${back ? `<div class="atoms-back-bar">${back}</div>` : ''}
        <div class="atoms-header-row">
          <div class="atoms-page-intro">
            ${compact ? '' : breadcrumb}
            <h1 class="atoms-h1">${escapeHtml(title)}</h1>
            ${subtitle ? `<p class="atoms-sub">${subtitle}</p>` : ''}
          </div>
          ${actions ? `<div class="atoms-header-actions">${actions}</div>` : ''}
        </div>
      </div>`;
  }

  /** Convenience header used by Pricing screens (wraps pageShell). */
  function pageHeader(title, subtitle = '', actions = '') {
    return pageShell({
      group: 'Pricing & governance',
      trail: title,
      title,
      subtitle,
      actions,
    });
  }

  function setTopHeading(title = '', subtitle = '') {
    const wrap = document.getElementById('atoms-top-heading');
    const titleEl = document.getElementById('atoms-top-heading-title');
    const subEl = document.getElementById('atoms-top-heading-sub');
    if (!wrap || !titleEl || !subEl) return;
    if (!title) {
      wrap.hidden = true;
      titleEl.textContent = '';
      subEl.textContent = '';
      return;
    }
    wrap.hidden = false;
    titleEl.textContent = title;
    subEl.textContent = subtitle || '';
    subEl.hidden = !subtitle;
  }

  function kpiCard(label, value, footer = '', tone = '', icon = '') {
    const raw = String(value ?? '');
    const isMoney = raw.includes('₦');
    const iconHtml = icon
      ? `<span class="atoms-kpi-icon${tone ? ` tone-${tone}` : ''}" aria-hidden="true"><span class="material-symbols-outlined">${icon}</span></span>`
      : '';
    const foot = footer
      ? (String(footer).includes('<') ? footer : escapeHtml(footer))
      : '';
    return `<div class="atoms-kpi-card${tone ? ` tone-${tone}` : ''}${isMoney ? ' is-money' : ''}">
      <div class="atoms-kpi-top">
        ${iconHtml || '<span></span>'}
      </div>
      <div class="atoms-kpi-label">${escapeHtml(label)}</div>
      <div class="atoms-kpi-value${isMoney ? ' is-money' : ''}">${value}</div>
      ${foot ? `<div class="atoms-kpi-foot">${foot}</div>` : ''}
    </div>`;
  }

  function kpiTrendFoot(text, direction = '') {
    if (!text) return '';
    const dirClass = direction === 'up' ? ' is-up' : (direction === 'down' ? ' is-down' : '');
    const arrow = direction === 'up'
      ? '<span class="material-symbols-outlined">trending_up</span>'
      : (direction === 'down' ? '<span class="material-symbols-outlined">trending_down</span>' : '');
    return `<span class="atoms-kpi-trend${dirClass}">${arrow}${escapeHtml(text)}</span>`;
  }

  function attentionPill(icon, label, href, tone = 'info') {
    return `<a class="atoms-attention-pill ${tone}" href="${href}"><span class="material-symbols-outlined">${icon}</span>${escapeHtml(label)}</a>`;
  }

  function quickAction(href, icon, title, desc) {
    return `<a class="atoms-quick-action" href="${href}"><span class="material-symbols-outlined">${icon}</span><strong>${escapeHtml(title)}</strong><span>${escapeHtml(desc)}</span></a>`;
  }

  function sectionPanel(title, body, opts = {}) {
    const { icon = '', subtitle = '', collapsed = false } = opts;
    return `
      <section class="atoms-section-panel${collapsed ? ' is-collapsed' : ''}">
        <header class="atoms-section-head">
          <div class="atoms-section-title-wrap">
            ${icon ? `<span class="material-symbols-outlined atoms-section-icon">${icon}</span>` : ''}
            <div>
              <h2 class="atoms-section-title">${escapeHtml(title)}</h2>
              ${subtitle ? `<p class="atoms-section-sub">${escapeHtml(subtitle)}</p>` : ''}
            </div>
          </div>
          <button type="button" class="atoms-section-toggle js-section-toggle" aria-expanded="${collapsed ? 'false' : 'true'}" aria-label="Toggle section">
            <span class="material-symbols-outlined">expand_more</span>
          </button>
        </header>
        <div class="atoms-section-body">${body}</div>
      </section>`;
  }

  function tableCard(title, body, subtitle = '') {
    return `<div class="atoms-table-card">
      <div class="atoms-table-card-head">
        <div>
          <h3>${escapeHtml(title)}</h3>
          ${subtitle ? `<p class="atoms-section-sub">${escapeHtml(subtitle)}</p>` : ''}
        </div>
      </div>
      <div class="atoms-table-wrap">${body}</div>
    </div>`;
  }

  const TABLE_PAGE_SIZE = 25;

  function pagerPage(key) {
    if (!state.pager || typeof state.pager !== 'object') state.pager = {};
    return Math.max(1, Number(state.pager[key] || 1));
  }

  function setPagerPage(key, page) {
    if (!state.pager || typeof state.pager !== 'object') state.pager = {};
    state.pager[key] = Math.max(1, Number(page) || 1);
  }

  /** Slice a list for on-screen tables. Resets page when the list shrinks below the current page. */
  function paginateList(items, key, perPage = TABLE_PAGE_SIZE) {
    const list = Array.isArray(items) ? items : [];
    const per = Math.max(5, Number(perPage) || TABLE_PAGE_SIZE);
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / per) || 1);
    let page = pagerPage(key);
    if (page > pages) {
      page = pages;
      setPagerPage(key, page);
    }
    const start = (page - 1) * per;
    return {
      key,
      page,
      pages,
      per,
      total,
      items: list.slice(start, start + per),
      start: total ? start + 1 : 0,
      end: Math.min(total, start + per),
    };
  }

  function pagerBar(p) {
    if (!p || !p.key) return '';
    if (p.total <= 0) return '';
    if (p.total <= p.per) {
      return `<div class="atoms-pager"><span class="atoms-pager-meta">${p.total} row${p.total === 1 ? '' : 's'}</span></div>`;
    }
    return `<div class="atoms-pager" role="navigation" aria-label="Table pages">
      <span class="atoms-pager-meta">${p.start}–${p.end} of ${p.total}</span>
      <div class="atoms-pager-controls">
        <button type="button" class="atoms-btn ghost sm js-pager" data-pager="${escapeHtml(p.key)}" data-page="1" ${p.page <= 1 ? 'disabled' : ''} title="First page" aria-label="First page">«</button>
        <button type="button" class="atoms-btn ghost sm js-pager" data-pager="${escapeHtml(p.key)}" data-page="${p.page - 1}" ${p.page <= 1 ? 'disabled' : ''} aria-label="Previous page">Previous</button>
        <span class="atoms-pager-page">Page ${p.page} of ${p.pages}</span>
        <button type="button" class="atoms-btn ghost sm js-pager" data-pager="${escapeHtml(p.key)}" data-page="${p.page + 1}" ${p.page >= p.pages ? 'disabled' : ''} aria-label="Next page">Next</button>
        <button type="button" class="atoms-btn ghost sm js-pager" data-pager="${escapeHtml(p.key)}" data-page="${p.pages}" ${p.page >= p.pages ? 'disabled' : ''} title="Last page" aria-label="Last page">»</button>
      </div>
    </div>`;
  }

  function renderNav() {
    const current = page();
    document.getElementById('atoms-nav').innerHTML = navGroups.map((group) => {
      const items = group.items.filter(canNav);
      if (!items.length) return '';
      return `<div class="atoms-nav-group">
        <div class="atoms-nav-label">${escapeHtml(group.label)}</div>
        ${items.map((item) => `
          <a href="#/${item.hash}" class="${item.hash === current ? 'active' : ''}" data-nav-label="${escapeHtml(item.label)}">
            <span class="material-symbols-outlined">${item.icon || 'circle'}</span>
            <span class="atoms-nav-text">${escapeHtml(item.label)}</span>
          </a>
        `).join('')}
      </div>`;
    }).join('');
    const u = state.bootstrap.user;
    const initials = String(u.name || 'U')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('') || 'U';
    document.getElementById('atoms-user').innerHTML = `
      <span class="atoms-user-avatar" aria-hidden="true">${escapeHtml(initials)}</span>
      <span class="atoms-user-text">${escapeHtml(u.name)} <small>${escapeHtml((u.roles || []).join(', '))}</small></span>
    `;
    paintBrand();
    const select = document.getElementById('atoms-branch');
    select.innerHTML = (state.bootstrap.branches || [])
      .map((b) => `<option value="${b.id}" ${Number(b.id) === Number(state.branchId) ? 'selected' : ''}>${escapeHtml(b.name)}</option>`)
      .join('');
    const dock = [
      { hash: 'pos', label: 'Sale', icon: 'point_of_sale', cap: 'atoms_create_sale' },
      { hash: 'imei', label: 'Devices', icon: 'smartphone', cap: 'atoms_view_imei' },
      { hash: 'dashboard', label: 'Home', icon: 'dashboard', cap: 'atoms_read' },
      { hash: 'notifications', label: 'Alerts', icon: 'notifications', cap: 'atoms_read' },
    ].filter(canNav);
    const dockEl = document.getElementById('atoms-dock');
    if (dockEl) {
      dockEl.innerHTML = dock.map((item) => `
        <a href="#/${item.hash}" class="${item.hash === current ? 'active' : ''}">
          <span class="material-symbols-outlined">${item.icon || 'circle'}</span>
          <span>${escapeHtml(item.label)}</span>
        </a>
      `).join('');
    }
  }

  async function render(options = {}) {
    const gen = ++renderGen;
    const root = document.getElementById('atoms-page');
    if (!root) return;

    const screens = {
      dashboard: screenDashboard,
      pos: screenPos,
      imei: screenImei,
      inventory: screenInventory,
      pricing: screenPricingDesk,
      'pricing-bulk': screenPricingBulk,
      'pricing-import': screenPricingImport,
      'pricing-history': screenPricingHistory,
      inbound: screenInbound,
      purchases: screenPurchases,
      transfers: screenTransfers,
      stocktake: screenStocktake,
      returns: screenReturns,
      swaps: screenSwaps,
      repairs: screenRepairs,
      expenses: screenExpenses,
      suppliers: screenSuppliers,
      customers: screenCustomers,
      reports: screenReports,
      analytics: screenAnalytics,
      notifications: screenNotifications,
      approvals: screenApprovals,
      audit: screenAudit,
      settings: screenSettings,
    };

    const routeKey = routeCacheKey();
    const isNewRoute = routeKey !== lastRenderedKey;
    const hadMemoryCache = !options.force && isNewRoute && routeMemoryCache.has(routeKey);
    const memoryCached = hadMemoryCache ? routeMemoryCache.get(routeKey) : null;

    updateNavActive(page());
    syncOnline();
    document.body.classList.toggle('atoms-route-analytics', page() === 'analytics');
    if (page() === 'analytics') {
      setTopHeading('Analytics desk', '');
    } else if (page() !== 'dashboard') {
      setTopHeading('', '');
    }

    if (memoryCached) {
      root.innerHTML = flashHtml() + memoryCached;
      root.classList.remove('is-loading', 'is-navigating', 'is-soft-loading');
      root.classList.add('is-revalidating');
      bind();
      startRouteProgress('soft');
    } else if (isNewRoute || options.force) {
      root.classList.remove('is-soft-loading', 'is-revalidating', 'is-loading');
      root.classList.add('is-navigating');
      root.innerHTML = flashHtml() + pageSkeleton();
      startRouteProgress('full');
    } else {
      root.classList.remove('is-navigating', 'is-revalidating', 'is-loading');
      root.classList.add('is-soft-loading');
      startRouteProgress('soft');
    }

    try {
      const screenFn = screens[page()] || screenDashboard;
      const html = await screenFn();
      if (gen !== renderGen) return;
      mountPageContent(root, html, gen, routeKey);
    } catch (err) {
      if (gen !== renderGen) return;
      root.classList.remove('is-loading', 'is-navigating', 'is-soft-loading', 'is-revalidating', 'is-entering');
      if (hadMemoryCache) {
        root.insertAdjacentHTML('afterbegin', `<div class="atoms-flash warn">${escapeHtml(err.message)}</div>`);
        finishRouteProgress();
        return;
      }
      root.innerHTML = `<div class="atoms-flash error">${escapeHtml(err.message)}</div>`;
      finishRouteProgress();
    }
  }

  function homePersona() {
    const roles = (state.bootstrap?.user?.roles || []).map((r) => String(r).toLowerCase());
    if (roles.some((r) => r.includes('engineer'))) return 'engineer';
    if (roles.some((r) => r.includes('vault') || r.includes('inventory') || r.includes('inbound'))) return 'stock';
    if (roles.some((r) => r.includes('cashier') || r.includes('sales_officer'))) return 'cashier';
    if (roles.some((r) => r.includes('accountant'))) return 'money';
    if (roles.some((r) => r.includes('administrator') || r.includes('ceo') || r.includes('director'))) return 'owner';
    if (roles.some((r) => r.includes('branch_manager') || r.includes('auditor'))) return 'manager';
    return 'manager';
  }

  function homePersonaLabel(persona) {
    const map = {
      cashier: 'Sales floor',
      stock: 'Stock desk',
      engineer: 'Service desk',
      money: 'Finance desk',
      manager: 'Branch manager',
      owner: 'Executive view',
    };
    return map[persona] || 'Operations';
  }

  function dashTake(rows, limit = 5) {
    return (rows || []).slice(0, limit);
  }

  function dashQueueEmpty(message, ctaHref = '', ctaLabel = '') {
    return `<div class="atoms-home-queue-empty">
      <span class="material-symbols-outlined" aria-hidden="true">inbox</span>
      <p>${escapeHtml(message)}</p>
      ${ctaHref ? `<a class="atoms-btn ghost xs" href="${ctaHref}">${escapeHtml(ctaLabel)}</a>` : ''}
    </div>`;
  }

  function homeDashboardManifest() {
    return state.bootstrap?.settings?.home_dashboard || { layout: {}, widgets: [], personas: [], defaults: {} };
  }

  function homeUserPrefs() {
    return state.bootstrap?.user?.home || {};
  }

  function homeKpiLayout(persona) {
    const user = homeUserPrefs();
    if (user.persona === persona && Array.isArray(user.effective_kpis) && user.effective_kpis.length) {
      return user.effective_kpis;
    }
    const manifest = homeDashboardManifest();
    const layout = manifest.layout || {};
    if (Array.isArray(layout[persona]) && layout[persona].length) return layout[persona];
    if (Array.isArray(manifest.defaults?.[persona]) && manifest.defaults[persona].length) return manifest.defaults[persona];
    return manifest.defaults?.manager || [];
  }

  function homeShowTrends() {
    const user = homeUserPrefs();
    if (user && Object.prototype.hasOwnProperty.call(user, 'show_trends')) return !!user.show_trends;
    return state.bootstrap?.settings?.home_show_trends !== false;
  }

  function homeQueueTabPref() {
    const server = homeUserPrefs().queue_tab;
    if (server && ['sales', 'money', 'stock', 'ops'].includes(server)) return server;
    try {
      const v = localStorage.getItem('atoms_home_queue_tab');
      return ['sales', 'money', 'stock', 'ops'].includes(v) ? v : 'sales';
    } catch (_) {
      return 'sales';
    }
  }

  let homeQueueTabSyncTimer = null;
  function setHomeQueueTabPref(tab) {
    try {
      localStorage.setItem('atoms_home_queue_tab', tab);
    } catch (_) { /* ignore */ }
    clearTimeout(homeQueueTabSyncTimer);
    homeQueueTabSyncTimer = setTimeout(() => {
      api('home-layout', { method: 'POST', body: { queue_tab: tab } }).then((home) => {
        if (state.bootstrap?.user) state.bootstrap.user.home = home;
      }).catch(() => {});
    }, 400);
  }

  function homeKpiSortListHtml(personaId, layoutIds, widgets, opts = {}) {
    const picked = Array.isArray(layoutIds) ? [...layoutIds] : [];
    const rest = widgets.map((w) => w.id).filter((id) => !picked.includes(id));
    const order = [...picked, ...rest];
    const idPrefix = opts.idPrefix || personaId;
    const userAttr = opts.userCustomize ? ' data-user-customize="1"' : '';
    return `<ul class="atoms-home-kpi-sort" data-persona="${escapeHtml(personaId)}"${userAttr}>
      ${order.map((id) => {
        const w = widgets.find((x) => x.id === id);
        if (!w) return '';
        const checked = picked.includes(id) ? 'checked' : '';
        return `<li class="atoms-home-kpi-sort-item" draggable="true" data-id="${escapeHtml(id)}">
          <span class="material-symbols-outlined atoms-home-kpi-drag" aria-hidden="true">drag_indicator</span>
          <label class="atoms-home-kpi-check"><input type="checkbox" class="js-home-kpi-check" id="home-kpi-${escapeHtml(idPrefix)}-${escapeHtml(id)}" ${checked}> ${escapeHtml(w.label)}</label>
        </li>`;
      }).join('')}
    </ul>`;
  }

  function initHomeKpiSortable(root = document) {
    root.querySelectorAll('.atoms-home-kpi-sort').forEach((list) => {
      let dragEl = null;
      list.querySelectorAll('.atoms-home-kpi-sort-item').forEach((item) => {
        item.addEventListener('dragstart', (e) => {
          dragEl = item;
          item.classList.add('is-dragging');
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', item.dataset.id || ''); } catch (_) { /* ignore */ }
        });
        item.addEventListener('dragend', () => {
          dragEl?.classList.remove('is-dragging');
          list.querySelectorAll('.atoms-home-kpi-sort-item').forEach((el) => el.classList.remove('is-over'));
          dragEl = null;
        });
        item.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (!dragEl || dragEl === item) return;
          const rect = item.getBoundingClientRect();
          const after = (e.clientY - rect.top) > rect.height / 2;
          list.insertBefore(dragEl, after ? item.nextSibling : item);
        });
        item.addEventListener('dragenter', () => item.classList.add('is-over'));
        item.addEventListener('dragleave', () => item.classList.remove('is-over'));
      });
    });
  }

  function homeKpiCard(id, d) {
    const imei = (d.imei && !Array.isArray(d.imei)) ? d.imei : {};
    const qtyStock = d.quantity_stock || {};
    const today = d.today || { net: 0, collected: 0, by_type: { retail: { net: 0 }, wholesale: { net: 0 } } };
    const builders = {
      sales_today: () => kpiCard('Total sales', money(today.net), kpiTrendFoot(`Retail ${money(today.by_type?.retail?.net || 0)} today`), '', 'point_of_sale'),
      cash_collected: () => kpiCard('Payment received', money(d.today_cash_snapshot?.inflows ?? today.collected), kpiTrendFoot('Cash & transfers in today', 'up'), 'ok', 'payments'),
      customer_balances: () => kpiCard('Customer balances', money(d.receivables), kpiTrendFoot('Outstanding credit'), '', 'account_balance_wallet'),
      supplier_payables: () => kpiCard('Payment sent', money(d.payables), kpiTrendFoot('Supplier payables open'), 'info', 'request_quote'),
      overdue_invoices: () => kpiCard('Overdue invoices', String(d.overdue_invoices || 0), kpiTrendFoot(`${d.debt_days || 7}+ days late`, (d.overdue_invoices || 0) > 0 ? 'down' : ''), (d.overdue_invoices || 0) > 0 ? 'danger' : '', 'warning'),
      unread_alerts: () => kpiCard('Unread alerts', String(d.notify_unread || 0), kpiTrendFoot('Needs attention'), (d.notify_unread || 0) > 0 ? 'warn' : '', 'notifications_active'),
      devices_in_stock: () => kpiCard('Devices in stock', String(imei.available || 0), kpiTrendFoot('Available at this branch', 'up'), 'ok', 'smartphone'),
      accessories_stock: () => kpiCard('Accessories on hand', String(qtyStock.qty || 0), kpiTrendFoot(`${qtyStock.sku_count || 0} SKU(s)`), '', 'headphones'),
      low_stock_items: () => kpiCard('Low stock items', String((d.low_stock || []).length), kpiTrendFoot('At or below threshold', (d.low_stock || []).length ? 'down' : ''), (d.low_stock || []).length ? 'warn' : '', 'inventory_2'),
      in_transit: () => kpiCard('In transit', String(d.in_transit || 0), kpiTrendFoot('Transfers on the way'), '', 'local_shipping'),
      open_repairs: () => kpiCard('Open repairs', String(d.open_repairs || 0), kpiTrendFoot('Active tickets'), '', 'build'),
      stuck_repairs: () => kpiCard('Stuck repairs', String(d.operations_snapshot?.stuck_repair_count || 0), kpiTrendFoot(`${d.repair_days || 3}+ days`, (d.operations_snapshot?.stuck_repair_count || 0) > 0 ? 'down' : ''), (d.operations_snapshot?.stuck_repair_count || 0) > 0 ? 'warn' : '', 'schedule'),
      faulty_devices: () => kpiCard('Faulty devices', String(d.operations_snapshot?.faulty_device_count || 0), kpiTrendFoot('Awaiting resolution'), '', 'phonelink_erase'),
      repairs_today: () => kpiCard('Repairs completed', String((d.today_repair_lines || []).length), kpiTrendFoot('Closed tickets today', 'up'), 'ok', 'task_alt'),
      net_cash_today: () => kpiCard('Net cash today', money(d.today_cash_snapshot?.net || d.executive_snapshot?.cash_net_today || 0), kpiTrendFoot('In minus out'), '', 'account_balance'),
      receivables: () => kpiCard('Receivables', money(d.receivables), kpiTrendFoot(`${d.executive_snapshot?.receivable_party_count || 0} customers`), '', 'trending_up'),
      payables: () => kpiCard('Payables', money(d.payables), kpiTrendFoot(`${d.executive_snapshot?.payable_party_count || 0} suppliers`), '', 'trending_down'),
      pending_approvals: () => kpiCard('Pending approvals', String(d.pending_approvals || 0), kpiTrendFoot('Waiting for review'), (d.pending_approvals || 0) > 0 ? 'warn' : '', 'approval'),
      wholesale_today: () => kpiCard('Wholesale today', money(today.by_type?.wholesale?.net || 0), kpiTrendFoot('Wholesale channel'), '', 'store'),
    };
    return builders[id] ? builders[id]() : '';
  }

  function dashboardPulseKpis(d, persona) {
    const layout = homeKpiLayout(persona);
    const hero = layout.slice(0, 4).map((id) => homeKpiCard(id, d)).filter(Boolean);
    const more = layout.slice(4).map((id) => homeKpiCard(id, d)).filter(Boolean);
    return `
      <div class="atoms-kpi-grid atoms-home-kpis">${hero.join('') || kpiCard('Total sales', money(d.today?.net || 0), kpiTrendFoot('Today'), '', 'point_of_sale')}</div>
      ${more.length ? `<div class="atoms-kpi-grid atoms-home-kpis-more">${more.join('')}</div>` : ''}
    `;
  }

  function readHomeKpiSettingsFromDom() {
    const out = {};
    document.querySelectorAll('.atoms-home-kpi-sort:not([data-user-customize])').forEach((ul) => {
      const personaId = ul.dataset.persona || '';
      if (!personaId || personaId === 'me') return;
      out[personaId] = [...ul.querySelectorAll('.atoms-home-kpi-sort-item')]
        .map((li) => li.dataset.id)
        .filter((id) => document.getElementById(`home-kpi-${personaId}-${id}`)?.checked);
    });
    return out;
  }

  function readUserHomeKpiFromDom() {
    const ul = document.querySelector('.atoms-home-kpi-sort[data-user-customize="1"]');
    if (!ul) return [];
    return [...ul.querySelectorAll('.atoms-home-kpi-sort-item')]
      .map((li) => li.dataset.id)
      .filter((id) => document.getElementById(`home-kpi-me-${id}`)?.checked);
  }

  function dashboardUserCustomizeBar(persona) {
    const user = homeUserPrefs();
    const widgets = user.widgets?.length ? user.widgets : (homeDashboardManifest().widgets || []);
    const layout = homeKpiLayout(persona);
    const storeLayout = user.store_kpis || layout;
    const personalBadge = user.has_override;
    return `<div class="atoms-home-customize-bar">
      <button type="button" class="atoms-btn ghost sm js-home-customize-toggle" aria-expanded="false" aria-controls="atoms-home-customize-panel">
        <span class="material-symbols-outlined" aria-hidden="true">tune</span> Customize my overview
      </button>
      ${personalBadge ? '<span class="atoms-badge info">Personal layout</span>' : ''}
      <div class="atoms-home-customize-panel hidden" id="atoms-home-customize-panel">
        <p class="atoms-sub">Drag to reorder KPI cards for ${escapeHtml(homePersonaLabel(persona))}. Uncheck any you do not want. This overrides the store default for your account only.</p>
        ${homeKpiSortListHtml('me', layout, widgets, { userCustomize: true, idPrefix: 'me' })}
        <label class="atoms-home-kpi-check" style="margin-top:12px">
          <input type="checkbox" id="home-user-show-trends" ${homeShowTrends() ? 'checked' : ''}> Show trends snapshot on overview
        </label>
        <div class="atoms-actions" style="margin-top:12px">
          <button type="button" class="atoms-btn primary js-home-user-save">Save my layout</button>
          <button type="button" class="atoms-btn ghost js-home-user-reset" ${personalBadge ? '' : 'disabled'}>Reset to store default</button>
        </div>
        ${user.has_kpi_override ? `<p class="atoms-muted atoms-home-customize-store">Store default: ${storeLayout.map((id) => widgets.find((w) => w.id === id)?.label || id).join(' · ')}</p>` : ''}
      </div>
    </div>`;
  }

  function homeKpiSettingsBlock(ops) {
    const manifest = ops.home_dashboard || {};
    const layout = manifest.layout || {};
    const personas = manifest.personas || [];
    const widgets = manifest.widgets || [];
    if (!personas.length || !widgets.length) return '';
    const blocks = personas.map((persona) => {
      const picked = layout[persona.id] || [];
      return `<div class="atoms-home-kpi-persona">
        <h4>${escapeHtml(persona.label)}</h4>
        ${homeKpiSortListHtml(persona.id, picked, widgets)}
      </div>`;
    }).join('');
    return `<div class="atoms-card" style="margin-bottom:16px">
      <div class="atoms-pos-section-title">
        <span class="material-symbols-outlined" style="color:var(--atoms-primary);">dashboard</span>
        <span>Home overview layout</span>
      </div>
      <p class="atoms-sub">Drag widgets to reorder. Checked KPIs appear on the store overview for each desk type. Staff can still personalize their own view from the overview page.</p>
      <form class="atoms-form" id="home-layout-form">
        ${field('Trends snapshot on home', `<label><input type="checkbox" id="home-show-trends" ${ops.home_show_trends !== false ? 'checked' : ''}> Show the mini sales chart on the overview (users with report access)</label>`)}
        <div class="atoms-home-kpi-grid">${blocks}</div>
        <div class="atoms-actions">
          <button class="atoms-btn primary" type="submit">Save home layout</button>
        </div>
      </form>
    </div>`;
  }

  function dashboardSalesQueue(d) {
    const rows = dashTake(d.today_sales_lines);
    if (!rows.length) {
      return dashQueueEmpty('No sales posted today yet.', '#/pos', 'Start a sale');
    }
    return `<table class="atoms-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Devices</th><th>Total</th><th>Paid</th></tr></thead><tbody>
      ${rows.map((l) => `<tr>
        <td>${l.invoice_number ? `<button type="button" class="atoms-link js-invoice" data-inv="${escapeHtml(l.invoice_number)}">${escapeHtml(l.invoice_number)}</button>` : '—'}</td>
        <td>${l.customer_id ? `<button type="button" class="atoms-link js-aging-cust" data-id="${l.customer_id}">${escapeHtml(l.customer_name || '')}</button>` : escapeHtml(l.customer_name || 'Walk-in')}</td>
        <td>${escapeHtml(l.device_summary || '—')}</td>
        <td>${money(l.total)}</td>
        <td>${money(l.paid_amount)}</td>
      </tr>`).join('')}
    </tbody></table>
    <p class="atoms-home-queue-foot"><a href="#/pos">New sale</a>${(d.today_sales_lines || []).length > 5 ? ` · <a href="#/analytics">All sales in trends</a>` : ''}</p>`;
  }

  function dashboardMoneyQueue(d) {
    const payments = dashTake(d.today_payment_lines);
    const overdue = dashTake(d.overdue_lines);
    if (!payments.length && !overdue.length) {
      return dashQueueEmpty('No collections or overdue invoices right now.', '#/customers', 'Open customers');
    }
    let html = '';
    if (payments.length) {
      html += `<h4 class="atoms-home-queue-sub">Payments today</h4>
        <table class="atoms-table"><thead><tr><th>Customer</th><th>Invoice</th><th>Amount</th><th>Method</th></tr></thead><tbody>
          ${payments.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-aging-cust" data-id="${l.customer_id}">${escapeHtml(l.customer_name || '')}</button></td>
            <td>${l.invoice_number ? `<button type="button" class="atoms-link js-invoice" data-inv="${escapeHtml(l.invoice_number)}">${escapeHtml(l.invoice_number)}</button>` : '—'}</td>
            <td>${money(l.amount)}</td>
            <td>${escapeHtml(l.method || '')}</td>
          </tr>`).join('')}
        </tbody></table>`;
    }
    if (overdue.length) {
      html += `<h4 class="atoms-home-queue-sub">Overdue (${d.debt_days || 7}+ days)</h4>
        <table class="atoms-table"><thead><tr><th>Customer</th><th>Invoice</th><th>Due</th><th>Age</th></tr></thead><tbody>
          ${overdue.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-dash-overdue" data-id="${l.id}">${escapeHtml(l.name || '')}</button></td>
            <td>${escapeHtml(l.invoice_number || '')}</td>
            <td>${money(l.amount)}</td>
            <td>${l.days}d</td>
          </tr>`).join('')}
        </tbody></table>`;
    }
    html += `<p class="atoms-home-queue-foot"><a href="#/customers">Customer accounts</a> · <a href="#/analytics">Receivables desk</a></p>`;
    return html;
  }

  function dashboardStockQueue(d) {
    const low = dashTake(d.low_stock);
    const transit = dashTake(d.transit_lines);
    const transfers = dashTake(d.today_transfer_lines);
    if (!low.length && !transit.length && !transfers.length) {
      return dashQueueEmpty('Stock looks healthy — no low items or transfers waiting.', '#/inventory', 'View stock');
    }
    let html = '';
    if (low.length) {
      html += `<h4 class="atoms-home-queue-sub">Low stock</h4>
        <table class="atoms-table"><thead><tr><th>Product</th><th>Available</th><th>Threshold</th></tr></thead><tbody>
          ${low.map((a) => `<tr>
            <td><a class="atoms-link" href="#/inventory?filter=low&product=${Number(a.product_id || 0)}">${escapeHtml(a.name)}</a>${a.variant_label ? `<br><span class="atoms-muted">${escapeHtml(a.variant_label)}</span>` : ''}</td>
            <td><strong>${a.qty}</strong></td>
            <td>${a.low_stock_threshold}</td>
          </tr>`).join('')}
        </tbody></table>`;
    }
    if (transit.length) {
      html += `<h4 class="atoms-home-queue-sub">In transit</h4>
        <table class="atoms-table"><thead><tr><th>Transfer</th><th>Route</th><th>Devices</th></tr></thead><tbody>
          ${transit.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-dash-transit" data-id="${l.id}">${escapeHtml('#' + l.id)}</button></td>
            <td>${escapeHtml(l.from_branch_name || '')} → ${escapeHtml(l.to_branch_name || '')}</td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
          </tr>`).join('')}
        </tbody></table>`;
    }
    if (transfers.length) {
      html += `<h4 class="atoms-home-queue-sub">Transfers today</h4>
        <table class="atoms-table"><thead><tr><th>Transfer</th><th>Route</th><th>Status</th></tr></thead><tbody>
          ${transfers.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-dash-transit" data-id="${l.id}">${escapeHtml('#' + l.id)}</button></td>
            <td>${escapeHtml(l.from_branch_name || '')} → ${escapeHtml(l.to_branch_name || '')}</td>
            <td>${badge(l.status)}</td>
          </tr>`).join('')}
        </tbody></table>`;
    }
    html += `<p class="atoms-home-queue-foot"><a href="#/inventory">Products & stock</a> · <a href="#/transfers">Transfers</a></p>`;
    return html;
  }

  function dashboardOpsQueue(d) {
    const approvals = dashTake(d.approval_lines);
    const repairs = dashTake(d.repair_lines);
    const alerts = dashTake(d.notify_lines);
    const expenses = dashTake(d.expense_lines);
    if (!approvals.length && !repairs.length && !alerts.length && !expenses.length) {
      return dashQueueEmpty('No approvals, repairs, or alerts need you right now.', '#/notifications', 'View alerts');
    }
    let html = '';
    if (approvals.length && (can('atoms_approve') || can('atoms_approve_adjustments'))) {
      html += `<h4 class="atoms-home-queue-sub">Pending approvals</h4>
        <table class="atoms-table"><thead><tr><th>#</th><th>Request</th><th>Summary</th><th></th></tr></thead><tbody>
          ${approvals.map((a) => `<tr>
            <td><button type="button" class="atoms-link js-dash-approval" data-id="${a.id}">${a.id}</button></td>
            <td>${escapeHtml(a.type_label || a.type)}</td>
            <td>${escapeHtml(a.summary || '')}</td>
            <td><a class="atoms-btn ghost xs" href="#/approvals">Review</a></td>
          </tr>`).join('')}
        </tbody></table>`;
    }
    if (repairs.length) {
      html += `<h4 class="atoms-home-queue-sub">Open repairs</h4>
        <table class="atoms-table"><thead><tr><th>Ticket</th><th>Customer</th><th>Status</th><th>Age</th></tr></thead><tbody>
          ${repairs.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-dash-repair" data-id="${l.id}">${escapeHtml(l.ticket_number || '')}</button></td>
            <td>${escapeHtml(l.customer_name || 'Walk-in')}</td>
            <td>${badge(l.status)}</td>
            <td>${l.days}d</td>
          </tr>`).join('')}
        </tbody></table>`;
    }
    if (expenses.length) {
      html += `<h4 class="atoms-home-queue-sub">Pending expenses</h4>
        <table class="atoms-table"><thead><tr><th>Expense</th><th>Vendor</th><th>Amount</th></tr></thead><tbody>
          ${expenses.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-exp-open" data-id="${l.id}">${escapeHtml('#' + l.id)}</button></td>
            <td>${escapeHtml(l.vendor || '—')}</td>
            <td>${money(l.amount)}</td>
          </tr>`).join('')}
        </tbody></table>`;
    }
    if (alerts.length) {
      html += `<h4 class="atoms-home-queue-sub">Recent alerts</h4>
        <table class="atoms-table"><thead><tr><th>Alert</th><th>When</th><th></th></tr></thead><tbody>
          ${alerts.map((n) => `<tr class="${Number(n.is_read) ? '' : 'is-unread'}">
            <td>${escapeHtml(n.title || '')}<br><span class="atoms-muted">${escapeHtml(n.body || '')}</span></td>
            <td>${escapeHtml(n.created_at || '')}</td>
            <td>${n.link ? `<button type="button" class="atoms-link js-notify-open" data-link="${escapeHtml(JSON.stringify(n.link))}">Open</button>` : ''}</td>
          </tr>`).join('')}
        </tbody></table>`;
    }
    html += `<p class="atoms-home-queue-foot"><a href="#/approvals">Approvals</a> · <a href="#/repairs">Repairs</a> · <a href="#/notifications">All alerts</a></p>`;
    return html;
  }

  function dashboardWorkQueuesPanel(d) {
    const salesCount = (d.today_sales_lines || []).length;
    const moneyCount = (d.today_payment_lines || []).length + (d.overdue_lines || []).length;
    const stockCount = (d.low_stock || []).length + (d.transit_lines || []).length;
    const opsCount = (d.approval_lines || []).length + (d.repair_lines || []).length + (d.notify_lines || []).filter((n) => !Number(n.is_read)).length;
    const activeQueue = homeQueueTabPref();
    const tabBtn = (id, label, count) => `<button type="button" class="atoms-seg-tab js-home-queue-tab${activeQueue === id ? ' is-active' : ''}" data-queue="${id}" role="tab" aria-selected="${activeQueue === id ? 'true' : 'false'}">${label}${count ? ` (${count})` : ''}</button>`;
    return `<div class="atoms-panel atoms-home-queues">
      <div class="atoms-panel-head">
        <div class="atoms-panel-title-wrap">
          <span class="material-symbols-outlined atoms-panel-icon" aria-hidden="true">list_alt</span>
          <div>
            <h2 class="atoms-panel-title">Work queues</h2>
            <p class="atoms-panel-sub">Today’s sales, money, stock, and operations — top items only.</p>
          </div>
        </div>
        <div class="atoms-seg-tabs atoms-home-queue-tabs" role="tablist" aria-label="Work queue views">
          ${tabBtn('sales', 'Sales', salesCount)}
          ${tabBtn('money', 'Money', moneyCount)}
          ${tabBtn('stock', 'Stock', stockCount)}
          ${tabBtn('ops', 'Ops', opsCount)}
        </div>
      </div>
      <div class="atoms-panel-body atoms-home-queue-body">
        <div class="atoms-home-queue-pane${activeQueue === 'sales' ? '' : ' hidden'}" data-queue-pane="sales">${dashboardSalesQueue(d)}</div>
        <div class="atoms-home-queue-pane${activeQueue === 'money' ? '' : ' hidden'}" data-queue-pane="money">${dashboardMoneyQueue(d)}</div>
        <div class="atoms-home-queue-pane${activeQueue === 'stock' ? '' : ' hidden'}" data-queue-pane="stock">${dashboardStockQueue(d)}</div>
        <div class="atoms-home-queue-pane${activeQueue === 'ops' ? '' : ' hidden'}" data-queue-pane="ops">${dashboardOpsQueue(d)}</div>
      </div>
    </div>`;
  }

  function dashboardChartsPanel(d) {
    if (!can('atoms_view_reports')) return '';
    const trend = d.trend_lines || [];
    const mix = d.payment_mix_lines || [];
    const hasAny = trend.some((t) => t.invoices || t.net) || mix.length;
    if (!hasAny) {
      return `<div class="atoms-home-stage">
        <div class="atoms-chart-card">
          <div class="atoms-chart-card-head">
            <div>
              <h3>Sales &amp; collections</h3>
              <p class="atoms-chart-card-sub">Last 14 days</p>
            </div>
            <a class="atoms-btn ghost sm" href="#/analytics">Full analytics</a>
          </div>
          <p class="atoms-muted">No chart data yet — complete a few sales to populate trends.</p>
        </div>
      </div>`;
    }
    return `<div class="atoms-home-stage">
      <div class="atoms-chart-card">
        <div class="atoms-chart-card-head">
          <div>
            <h3>Sales trend</h3>
            <p class="atoms-chart-card-sub">Net sales · last 14 days</p>
          </div>
          <a class="atoms-btn ghost sm" href="#/analytics"><span class="material-symbols-outlined">open_in_new</span> Analytics</a>
        </div>
        ${barChart(trend, 'net', 'date', 'Net sales', { home: true })}
      </div>
      <div class="atoms-chart-card">
        <div class="atoms-chart-card-head">
          <div>
            <h3>Payment mix</h3>
            <p class="atoms-chart-card-sub">Collected by method</p>
          </div>
        </div>
        ${doughnutChart(mix, 'collected', 'method', 'Collected', { home: true })}
      </div>
    </div>`;
  }

  function dashboardRecentInvoicesCard(d) {
    const rows = dashTake(d.today_sales_lines, 6);
    const body = rows.length
      ? `<div class="atoms-table-wrap"><table class="atoms-table"><thead><tr>
          <th>Invoice</th><th>Customer</th><th>Date</th><th>Paid</th><th>Status</th>
        </tr></thead><tbody>
        ${rows.map((l) => {
          const paid = Number(l.paid_amount || 0);
          const total = Number(l.total || 0);
          const status = paid >= total && total > 0
            ? '<span class="atoms-status-pill">Paid</span>'
            : (paid > 0
              ? '<span class="atoms-status-pill is-warn">Partial</span>'
              : '<span class="atoms-status-pill is-info">Open</span>');
          const when = l.sold_at || l.created_at || l.sale_date || 'Today';
          return `<tr>
            <td>${l.invoice_number ? `<button type="button" class="atoms-link js-invoice" data-inv="${escapeHtml(l.invoice_number)}">${escapeHtml(l.invoice_number)}</button>` : '—'}</td>
            <td>${l.customer_id ? `<button type="button" class="atoms-link js-aging-cust" data-id="${l.customer_id}">${escapeHtml(l.customer_name || '')}</button>` : escapeHtml(l.customer_name || 'Walk-in')}</td>
            <td>${escapeHtml(String(when).slice(0, 16))}</td>
            <td>${money(paid)}</td>
            <td>${status}</td>
          </tr>`;
        }).join('')}
      </tbody></table></div>
      <p class="atoms-home-queue-foot"><a href="#/pos">New sale</a>${(d.today_sales_lines || []).length > 6 ? ' · <a href="#/analytics">See all sales</a>' : ''}</p>`
      : dashQueueEmpty('No sales posted today yet.', '#/pos', 'Start a sale');

    return `<div class="atoms-panel atoms-home-recent-invoices">
      <div class="atoms-panel-head">
        <div class="atoms-panel-title-wrap">
          <span class="material-symbols-outlined atoms-panel-icon" aria-hidden="true">receipt_long</span>
          <div>
            <h2 class="atoms-panel-title">Recent invoices</h2>
            <p class="atoms-panel-sub">Sales posted today at this branch</p>
          </div>
        </div>
        <a class="atoms-btn ghost sm" href="#/pos">Sales invoice</a>
      </div>
      <div class="atoms-panel-body">${body}</div>
    </div>`;
  }

  function dashboardStockPulseCard(d) {
    const imei = (d.imei && !Array.isArray(d.imei)) ? d.imei : {};
    const qtyStock = d.quantity_stock || {};
    const low = (d.low_stock || []).length;
    const devices = Number(imei.available || 0);
    return `<div class="atoms-panel atoms-stock-pulse">
      <div class="atoms-panel-head">
        <div class="atoms-panel-title-wrap">
          <span class="material-symbols-outlined atoms-panel-icon" aria-hidden="true">inventory_2</span>
          <div>
            <h2 class="atoms-panel-title">Stock pulse</h2>
            <p class="atoms-panel-sub">Branch inventory snapshot</p>
          </div>
        </div>
        <a class="atoms-btn ghost sm" href="#/inventory">7 days</a>
      </div>
      <div class="atoms-panel-body">
        <div class="atoms-stock-pulse-stats">
          <div class="atoms-stock-pulse-stat">
            <span class="atoms-muted">Total sales items</span>
            <strong>${devices}</strong>
            ${kpiTrendFoot('Devices available', devices > 0 ? 'up' : '')}
          </div>
          <div class="atoms-stock-pulse-stat">
            <span class="atoms-muted">Accessories on hand</span>
            <strong>${Number(qtyStock.qty || 0)}</strong>
            <span class="atoms-kpi-foot">${escapeHtml(String(qtyStock.sku_count || 0))} SKU(s)</span>
          </div>
          <div class="atoms-stock-pulse-stat">
            <span class="atoms-muted">Low stock items</span>
            <strong>${low}</strong>
            ${kpiTrendFoot(low ? 'Needs reorder' : 'Healthy', low ? 'down' : 'up')}
          </div>
        </div>
      </div>
    </div>`;
  }

  function dashboardHeroBottom(d) {
    return `<div class="atoms-home-hero-bottom">
      ${dashboardRecentInvoicesCard(d)}
      ${dashboardStockPulseCard(d)}
    </div>`;
  }

  function dashboardInsightsTeaser(d) {
    if (!can('atoms_view_reports') || !homeShowTrends()) return '';
    const cash = d.today_cash_snapshot;
    if (!cash) return '';
    return `<div class="atoms-panel atoms-home-insights">
      <div class="atoms-panel-head">
        <div class="atoms-panel-title-wrap">
          <span class="material-symbols-outlined atoms-panel-icon" aria-hidden="true">account_balance</span>
          <div>
            <h2 class="atoms-panel-title">Cash today</h2>
            <p class="atoms-panel-sub">Inflows vs outflows for the selected branch</p>
          </div>
        </div>
        <a class="atoms-btn ghost sm" href="#/reports"><span class="material-symbols-outlined">summarize</span> Reports</a>
      </div>
      <div class="atoms-panel-body">
        <div class="atoms-home-cash-strip">
          <div><span class="atoms-muted">Cash in</span><strong>${money(cash.inflows || 0)}</strong></div>
          <div><span class="atoms-muted">Outflows</span><strong>${money(cash.outflows || 0)}</strong></div>
          <div><span class="atoms-muted">Net today</span><strong>${money(cash.net || 0)}</strong></div>
        </div>
      </div>
    </div>`;
  }

  function canManagePricing() {
    return can('atoms_manage_pricing') || can('atoms_manage_products');
  }

  function pricingTabs(active) {
    const tabs = [
      { id: 'pricing', label: 'Desk' },
      { id: 'pricing-bulk', label: 'Bulk update' },
      { id: 'pricing-import', label: 'Market import' },
      { id: 'pricing-history', label: 'History' },
    ];
    return `<div class="atoms-home-queue-tabs" role="tablist" aria-label="Pricing sections">
      ${tabs.map((t) => `<a class="atoms-btn ${t.id === active ? 'primary' : 'ghost'} sm" href="#/${t.id}" role="tab" aria-selected="${t.id === active ? 'true' : 'false'}">${escapeHtml(t.label)}</a>`).join('')}
      ${can('atoms_approve') ? '<a class="atoms-btn ghost sm" href="#/approvals">Price approvals</a>' : ''}
    </div>`;
  }

  function pricingChangeRows(changes, limit = 20) {
    const rows = (changes || []).slice(0, limit);
    if (!rows.length) return '<p class="atoms-muted">No price changes.</p>';
    return `<div class="atoms-table-wrap"><table class="atoms-table">
      <thead><tr><th>Product</th><th>From</th><th>To</th><th></th></tr></thead>
      <tbody>${rows.map((c) => `<tr>
        <td>${escapeHtml(c.name || c.sku || '')}${c.requires_approval ? ' <span class="atoms-badge warn">Approval</span>' : ''}</td>
        <td class="atoms-table-mono">${money(c.from || 0)}</td>
        <td class="atoms-table-mono"><strong>${money(c.to || 0)}</strong></td>
        <td>${c.direction === 'up' ? '↑' : c.direction === 'down' ? '↓' : ''}</td>
      </tr>`).join('')}</tbody>
    </table></div>${(changes || []).length > limit ? `<p class="atoms-muted">Showing ${limit} of ${changes.length}.</p>` : ''}`;
  }

  async function screenPricingDesk() {
    const dash = await api('pricing/dashboard');
    const current = await api('pricing/current?limit=40');
    const items = current.items || [];
    const pricePage = paginateList(items, 'pricing-current');
    const recentPage = paginateList(dash.recent || [], 'pricing-recent');
    return `
      ${pageHeader('Price desk', 'React to market moves with controlled, auditable catalog pricing.', `
        ${canManagePricing() ? '<a class="atoms-btn primary sm" href="#/pricing-bulk"><span class="material-symbols-outlined">price_change</span> Bulk update</a>' : ''}
        ${canManagePricing() ? '<a class="atoms-btn ghost sm" href="#/pricing-import"><span class="material-symbols-outlined">upload_file</span> Import</a>' : ''}
      `)}
      ${pricingTabs('pricing')}
      <div class="atoms-kpi-grid atoms-home-kpis" style="margin-top:16px">
        ${kpiCard('Today’s changes', String(dash.today_changes || 0), 'Applied today', '', 'sell')}
        ${kpiCard('Products updated', String(dash.products_updated || 0), 'Distinct SKUs', '', 'inventory_2')}
        ${kpiCard('Upward', String(dash.upward || 0), 'Increases today', 'ok', 'trending_up')}
        ${kpiCard('Downward', String(dash.downward || 0), 'Decreases today', (dash.downward || 0) ? 'warn' : '', 'trending_down')}
        ${kpiCard('Pending approvals', String(dash.pending_approvals || 0), 'Large reductions', (dash.pending_approvals || 0) ? 'warn' : '', 'verified_user')}
        ${kpiCard('Scheduled', String(dash.scheduled_pending || 0), 'Future activation', '', 'event')}
      </div>
      <section class="atoms-panel" style="margin-top:16px">
        <header class="atoms-panel-head">
          <div class="atoms-panel-title-wrap">
            <span class="material-symbols-outlined atoms-panel-icon">list_alt</span>
            <div>
              <h2 class="atoms-panel-title">Current selling prices</h2>
              <p class="atoms-panel-sub">Cost · Minimum · Current · Market. Reductions of ${escapeHtml(String(dash.reduction_threshold_pct || 10))}%+ need approval.</p>
            </div>
          </div>
        </header>
        <div class="atoms-panel-body">
          <div class="atoms-table-wrap"><table class="atoms-table">
            <thead><tr><th></th><th>Product</th><th>Cost</th><th>Minimum</th><th>Current</th><th>Market</th></tr></thead>
            <tbody>
              ${pricePage.items.length ? pricePage.items.map((p) => `<tr>
                <td class="atoms-td-check"><input type="checkbox" class="js-price-pick" value="${p.id}" aria-label="Select ${escapeHtml(p.name)}"></td>
                <td><strong>${escapeHtml(p.name)}</strong><div class="atoms-muted">${escapeHtml(p.sku || '')}${p.brand ? ` · ${escapeHtml(p.brand)}` : ''}</div></td>
                <td class="atoms-table-mono">${money(p.default_cost_price || 0)}</td>
                <td class="atoms-table-mono">${money(p.min_selling_price || 0)}</td>
                <td class="atoms-table-mono"><strong>${money(p.current_selling_price || p.min_selling_price || 0)}</strong></td>
                <td class="atoms-table-mono">${money(p.market_price || 0)}</td>
              </tr>`).join('') : '<tr><td colspan="6" class="atoms-empty">No active products.</td></tr>'}
            </tbody>
          </table></div>
          ${pagerBar(pricePage)}
          <p class="atoms-muted" style="margin-top:10px">Select rows then open Bulk update to raise/lower them together.</p>
        </div>
      </section>
      <section class="atoms-panel" style="margin-top:16px">
        <header class="atoms-panel-head">
          <div class="atoms-panel-title-wrap">
            <span class="material-symbols-outlined atoms-panel-icon">history</span>
            <div><h2 class="atoms-panel-title">Recent price changes</h2><p class="atoms-panel-sub">Latest applied catalog updates.</p></div>
          </div>
        </header>
        <div class="atoms-panel-body">
          ${pricingHistoryTable(recentPage.items)}
          ${pagerBar(recentPage)}
        </div>
      </section>`;
  }

  function pricingHistoryTable(rows) {
    if (!(rows || []).length) return '<p class="atoms-muted">No price history yet.</p>';
    return `<div class="atoms-table-wrap"><table class="atoms-table">
      <thead><tr><th>When</th><th>Product</th><th>Field</th><th>Old</th><th>New</th><th>By</th><th>Reason</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td>${escapeHtml(String(r.created_at || '').replace('T', ' ').slice(0, 16))}</td>
        <td>${escapeHtml(r.product_name || r.sku || ('#' + r.product_id))}</td>
        <td>${escapeHtml(r.field || '')}</td>
        <td class="atoms-table-mono">${money(r.old_price || 0)}</td>
        <td class="atoms-table-mono"><strong>${money(r.new_price || 0)}</strong></td>
        <td>${escapeHtml(r.created_by_name || '')}</td>
        <td>${escapeHtml(r.reason || r.change_type || '')}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  async function screenPricingBulk() {
    const products = await api('products');
    const brands = uniqueCatalogValues(products, 'brand');
    const categories = uniqueCatalogValues(products, 'category');
    const brandOpts = brands.map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
    const catOpts = categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    const branches = (state.bootstrap?.branches || []).map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
    return `
      ${pageHeader('Bulk price update', 'Change current, minimum, market, or cost prices for many products in one action — by selection, brand, category, or recent inbound.', `
        <a class="atoms-btn ghost sm" href="#/pricing">Back to desk</a>
      `)}
      ${pricingTabs('pricing-bulk')}
      ${!canManagePricing() ? '<div class="atoms-flash warn">You can view pricing but need Pricing permission to apply changes.</div>' : ''}
      <section class="atoms-panel" style="margin-top:16px">
        <div class="atoms-panel-body">
          <form class="atoms-form" id="pricing-bulk-form">
            <div class="atoms-form-grid cols-3">
              ${field('Which products', `<select id="px-scope">
                <option value="selected">Selected rows on Price desk</option>
                <option value="brand">One brand</option>
                <option value="category">One category</option>
                <option value="track">By tracking type</option>
                <option value="recent_inbound">Received in last N days</option>
                <option value="all">Entire active catalog</option>
              </select>`)}
              ${field('Brand', `<select id="px-brand"${brands.length ? '' : ' disabled'}><option value="">Choose brand</option>${brandOpts}</select>`)}
              ${field('Category', `<select id="px-category"${categories.length ? '' : ' disabled'}><option value="">Choose category</option>${catOpts}</select>`)}
            </div>
            <div class="atoms-form-grid cols-3" style="margin-top:12px">
              ${field('Price field', `<select id="px-field">
                <option value="current">Current selling price</option>
                <option value="min">Minimum selling price</option>
                <option value="market">Market selling price</option>
                <option value="cost">Cost price</option>
              </select>`)}
              ${field('How to change', `<select id="px-mode">
                <option value="amount">Add or subtract ₦</option>
                <option value="percent">Raise or lower by %</option>
                <option value="set">Set every selected to ₦</option>
              </select>`)}
              ${field('Value', '<input id="px-value" type="number" step="0.01" placeholder="e.g. 5000, -3, or 780000">')}
            </div>
            <div class="atoms-form-grid cols-3" style="margin-top:12px">
              ${field('Apply to', `<select id="px-apply">
                <option value="both">Products and variants</option>
                <option value="products">Products only</option>
                <option value="variants">Variants only</option>
              </select>`)}
              ${field('Inbound days', '<input id="px-inbound-days" type="number" min="1" max="60" value="7">')}
              ${field('Branch override (optional)', `<select id="px-branch"><option value="">All branches (catalog)</option>${branches}</select>`)}
            </div>
            <div class="atoms-form-grid cols-2" style="margin-top:12px">
              ${field('Effective date (optional)', '<input id="px-effective" type="datetime-local">')}
              ${field('Reason', '<input id="px-reason" type="text" placeholder="e.g. Market price increase" maxlength="200">')}
            </div>
            <p class="atoms-muted" style="margin-top:10px">Large reductions auto-queue for approval. Future effective dates schedule activation. Posted invoices are never rewritten.</p>
            <div class="atoms-actions" style="margin-top:12px">
              <button type="button" class="atoms-btn ghost" id="px-preview" ${canManagePricing() ? '' : 'disabled'}>Preview</button>
              <button type="submit" class="atoms-btn primary" ${canManagePricing() ? '' : 'disabled'}>Apply update</button>
            </div>
          </form>
          <div id="px-preview-box" class="atoms-bulk-preview hidden" style="margin-top:16px"></div>
        </div>
      </section>`;
  }

  async function screenPricingImport() {
    return `
      ${pageHeader('Market price import', 'Broadcast new market prices from a CSV — the fast path when management shares a price list.', '')}
      ${pricingTabs('pricing-import')}
      <section class="atoms-panel" style="margin-top:16px">
        <div class="atoms-panel-body">
          <p class="atoms-sub">CSV headers: <code>sku</code> (or <code>product_id</code>), then any of <code>current_price</code>, <code>market_price</code>, <code>min_price</code>, <code>cost_price</code>.</p>
          <form class="atoms-form" id="pricing-import-form">
            ${field('Default field when using a single Price column', `<select id="pi-field">
              <option value="market">Market selling price</option>
              <option value="current">Current selling price</option>
              <option value="min">Minimum selling price</option>
              <option value="cost">Cost price</option>
            </select>`)}
            ${field('Reason', '<input id="pi-reason" type="text" value="Market price broadcast" maxlength="200">')}
            ${field('CSV', '<textarea id="pi-csv" rows="10" placeholder="sku,market_price\\ni14-pro,780000\\na55,420000"></textarea>')}
            <div class="atoms-actions" style="margin-top:12px">
              <button type="button" class="atoms-btn ghost" id="pi-preview" ${canManagePricing() ? '' : 'disabled'}>Preview</button>
              <button type="submit" class="atoms-btn primary" ${canManagePricing() ? '' : 'disabled'}>Import prices</button>
            </div>
          </form>
          <div id="pi-preview-box" class="atoms-bulk-preview hidden" style="margin-top:16px"></div>
        </div>
      </section>`;
  }

  async function screenPricingHistory() {
    const hist = await api('pricing/history?limit=200');
    const page = paginateList(hist.items || [], 'pricing-history');
    return `
      ${pageHeader('Price history', 'Every catalog price change is recorded with who, when, and why.', '')}
      ${pricingTabs('pricing-history')}
      <section class="atoms-panel" style="margin-top:16px">
        <div class="atoms-panel-body">${pricingHistoryTable(page.items)}${pagerBar(page)}</div>
      </section>`;
  }

  async function screenDashboard() {
    const queued = readQueue();
    let d = null;
    let dashWarn = '';
    try {
      d = await api(`dashboard?branch_id=${state.branchId || ''}`);
    } catch (err) {
      dashWarn = `<div class="atoms-flash warn"><span class="material-symbols-outlined">wifi_off</span> ${escapeHtml(err.message)} Numbers below may be empty until you reconnect.</div>`;
      d = {
        today: { net: 0, collected: 0, by_type: { retail: { net: 0 }, wholesale: { net: 0 } } },
        receivables: 0,
        payables: 0,
        imei: {},
        open_repairs: 0,
        in_transit: 0,
        pending_approvals: 0,
        overdue_invoices: 0,
        debt_days: 7,
        low_stock: [],
        inventory: { products: [] },
      };
    }
    const persona = homePersona();
    const branchName = (state.bootstrap.branches || []).find((b) => Number(b.id) === Number(state.branchId))?.name || 'Your store';
    const attention = [];
    if ((d.overdue_invoices || 0) > 0) {
      attention.push(attentionPill('warning', `${d.overdue_invoices} overdue payment(s)`, '#/customers', 'danger'));
    }
    if ((d.pending_approvals || 0) > 0) {
      attention.push(attentionPill('verified_user', `${d.pending_approvals} approval(s) waiting`, '#/approvals', 'warn'));
    }
    if ((d.notify_unread || 0) > 0) {
      attention.push(attentionPill('notifications', `${d.notify_unread} unread alert(s)`, '#/notifications', 'info'));
    }
    if ((d.low_stock || []).length) {
      attention.push(attentionPill('inventory_2', `${d.low_stock.length} low-stock item(s)`, '#/inventory?filter=low', 'warn'));
    }
    if ((d.inbound_reserved || 0) > 0) {
      attention.push(attentionPill('local_shipping', `${d.inbound_reserved} inbound reserved`, '#/inbound', 'info'));
    }
    const quickActions = [
      can('atoms_create_sale') ? quickAction('#/pos', 'point_of_sale', 'New sale', 'Devices & accessories') : '',
      can('atoms_create_payment') ? quickAction('#/customers', 'payments', 'Collect payment', 'Record customer payment') : '',
      can('atoms_view_imei') ? quickAction('#/imei', 'smartphone', 'Find device', 'Search by IMEI or invoice') : '',
      canReceivePurchases() ? quickAction('#/purchases', 'local_shipping', 'Receive stock', 'Log supplier delivery') : (canInbound() ? quickAction('#/inbound', 'move_to_inbox', 'Inbound manifest', 'Pre-register expected goods') : ''),
      can('atoms_view_reports') ? quickAction('#/analytics', 'monitoring', 'See trends', 'Charts and performance') : '',
    ].filter(Boolean).join('');
    return `
      ${pageShell({
        group: 'Your store',
        trail: 'Overview',
        title: 'Dashboard Overview',
        subtitle: `Good ${greeting()}, ${escapeHtml(branchName)} · ${homePersonaLabel(persona)}`,
        compact: true,
        actions: `${can('atoms_create_sale') ? '<a class="atoms-btn primary" href="#/pos"><span class="material-symbols-outlined">point_of_sale</span> New sale</a>' : ''}${can('atoms_create_payment') ? '<a class="atoms-btn accent" href="#/customers"><span class="material-symbols-outlined">payments</span> Collect payment</a>' : ''}`,
      })}
      ${dashWarn}
      ${queueCard(queued)}
      ${attention.length ? `<div class="atoms-attention-bar">${attention.join('')}</div>` : ''}
      <div class="atoms-home-desk">
        ${dashboardPulseKpis(d, persona)}
        ${dashboardChartsPanel(d)}
        ${dashboardHeroBottom(d)}
        ${dashboardUserCustomizeBar(persona)}
        ${quickActions ? `<div class="atoms-quick-actions">${quickActions}</div>` : ''}
        ${dashboardWorkQueuesPanel(d)}
        ${dashboardInsightsTeaser(d)}
      </div>`;
  }

  function queueCard(q) {
    if (!q.length) return '';
    const pending = q.filter((i) => !i.failed);
    return `
      <div class="atoms-card atoms-queue-card" id="atoms-queue-card">
        <h3>Offline outbox on this device</h3>
        <p class="atoms-muted">${pending.length} waiting to sync${q.length - pending.length ? ` · ${q.length - pending.length} need attention` : ''}. Idempotent replay — reconnect and they post once, never twice.</p>
        ${q.map((item) => `
          <div class="atoms-queue-row ${item.failed ? 'is-failed' : ''}">
            <div>
              <strong>${escapeHtml(item.label || item.path)}</strong>
              <div class="atoms-muted">${item.failed ? escapeHtml(item.error || 'Could not post') : new Date(item.at).toLocaleString('en-NG')}${item.client_id ? ` · <span class="atoms-table-mono">${escapeHtml(String(item.client_id).slice(0, 8))}…</span>` : ''}</div>
            </div>
            ${item.failed ? `<button type="button" class="atoms-btn ghost js-queue-drop" data-at="${item.at}">Dismiss</button>` : ''}
          </div>`).join('')}
        <div class="atoms-actions" style="margin-top:12px">
          ${pending.length ? '<button type="button" class="atoms-btn primary js-queue-flush">Sync now</button>' : ''}
        </div>
      </div>`;
  }

  function lowStockCard(alerts) {
    if (!alerts?.length) return '';
    return `<div class="atoms-card" style="margin-top:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px">
        <h3 style="margin:0">Low stock at this branch</h3>
        <a class="atoms-btn ghost sm" href="#/inventory?filter=low">View in Stock Central</a>
      </div>
      <p class="atoms-sub">Devices and accessories at or below the product threshold.</p>
      <table class="atoms-table"><thead><tr><th>Product</th><th>Type</th><th>Available</th><th>Threshold</th></tr></thead><tbody>
        ${alerts.map((a) => `<tr>
          <td><a class="atoms-link" href="#/inventory?filter=low&product=${Number(a.product_id || 0)}">${escapeHtml(a.name)}</a>${a.variant_label ? `<br><span class="atoms-muted">${escapeHtml(a.variant_label)}</span>` : ''}</td>
          <td><span class="atoms-badge">${a.track_mode === 'quantity' ? 'Accessory' : 'Device'}</span></td>
          <td><strong>${a.qty}</strong></td>
          <td>${a.low_stock_threshold}</td>
        </tr>`).join('')}
      </tbody></table>
    </div>`;
  }

  function inventoryTable(products) {
    if (!products.length) {
      return `<table class="atoms-table"><tbody><tr><td class="atoms-empty">No available stock yet.</td></tr></tbody></table>`;
    }
    return `<table class="atoms-table"><thead><tr><th>Product</th><th>By branch</th><th>Total</th></tr></thead><tbody>
      ${products.map((p) => `<tr${p.is_low ? ' class="is-low-stock"' : ''}>
        <td>
          <div class="atoms-catalog-name">${escapeHtml(p.name)}</div>
          ${p.variant_label ? `<div class="atoms-catalog-meta">${escapeHtml(p.variant_label)}</div>` : ''}
          ${p.track_mode === 'quantity' ? '<span class="atoms-badge">Qty stock</span> ' : ''}${p.is_low ? '<span class="atoms-badge bad">Low stock</span>' : ''}
        </td>
        <td>${(p.branches || []).map((b) => `<span class="atoms-branch-qty">${escapeHtml(b.branch_name || b)} <strong>${b.qty != null ? b.qty : b}</strong></span>`).join('')}</td>
        <td><strong>${p.total}</strong></td>
      </tr>`).join('')}
    </tbody></table>`;
  }

  function stockRowsToProducts(rows) {
    const grouped = {};
    (rows || []).forEach((r) => {
      const key = `${r.product_id}:${r.variant_id || 0}:${r.track_mode || 'imei'}`;
      grouped[key] = grouped[key] || {
        name: r.name,
        variant_label: r.variant_label || '',
        track_mode: r.track_mode || 'imei',
        low_stock_threshold: Number(r.low_stock_threshold || 0),
        branches: [],
        total: 0,
      };
      grouped[key].branches.push({ branch_name: r.branch_name, qty: Number(r.qty) });
      grouped[key].total += Number(r.qty);
    });
    return Object.values(grouped).map((p) => {
      if (p.low_stock_threshold > 0 && p.total <= p.low_stock_threshold) {
        p.is_low = true;
      }
      return p;
    });
  }

  function variantSelectHtml(id, products, productId, selectedId = '') {
    const product = (products || []).find((p) => Number(p.id) === Number(productId));
    const variants = product?.variants || [];
    if (!variants.length) {
      return decorateSelectHtml(`<select id="${id}" disabled><option value="">Same as product</option></select>`);
    }
    return decorateSelectHtml(`<select id="${id}">${variants.map((v) => `<option value="${v.id}"${String(v.id) === String(selectedId) ? ' selected' : ''} data-min="${(v.min_selling_price || 0) / 100}" data-cost="${(v.cost_price || 0) / 100}">${escapeHtml(v.label || v.variant_name || `${v.color || ''} ${v.storage || ''}`.trim())}</option>`).join('')}</select>`);
  }

  async function screenPos() {
    const method = localStorage.getItem('atoms_pay_method') || 'cash';
    const payLabels = { cash: 'Cash', transfer: 'Bank Transfer', pos: 'POS Terminal' };
    const methods = ['cash', 'transfer', 'pos']
      .map((m) => `<option value="${m}"${m === method ? ' selected' : ''}>${payLabels[m]}</option>`)
      .join('');
    const me = String(state.bootstrap.user?.id || '');
    const sellers = state.bootstrap.staff?.sellers?.length
      ? state.bootstrap.staff.sellers
      : [{ id: me, name: state.bootstrap.user?.name || 'Me' }];
    const sellerOpts = sellers.map((s) => `<option value="${s.id}"${String(s.id) === me ? ' selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
    let qtyProducts = [];
    if (can('atoms_read')) {
      try {
        const catalog = await api('products');
        qtyProducts = (catalog || []).filter((p) => p.track_mode === 'quantity');
      } catch (e) {
        qtyProducts = [];
      }
    }
    const accessoryOpts = qtyProducts.map((p) => `<option value="${p.id}" data-min="${(p.min_selling_price || 0) / 100}">${escapeHtml(p.name)} · ${escapeHtml(p.sku || '')}</option>`).join('');
    return `
      ${pageShell({
        group: 'Daily operations',
        trail: 'Checkout',
        title: 'Point of sale',
        subtitle: 'Scan devices or add accessory lines, set prices, and complete checkout in one invoice.',
        actions: '<a class="atoms-back-btn" href="#/dashboard"><span class="material-symbols-outlined">arrow_back</span><span>Back to overview</span></a><a class="atoms-btn ghost sm" href="#/customers"><span class="material-symbols-outlined">group</span> Customers</a>',
      })}
      <div class="atoms-pos-layout">
        <div class="atoms-pos-card">
          <div class="atoms-pos-section-title">
            <span class="material-symbols-outlined" style="color:var(--atoms-primary);">qr_code_scanner</span>
            <span>Scan & checkout</span>
          </div>
          <form class="atoms-form" id="pos-form">
            ${field('Device IMEI / Barcode', scanInput('pos-imei', 'Scan barcode or type 15-digit IMEI', 'autofocus'))}
            <div id="pos-imei-info" class="atoms-pos-device-preview atoms-muted">
              <span class="material-symbols-outlined" style="font-size:18px; vertical-align:middle;">info</span>
              <span>Scan a device, then add it to the order. Mix phones and accessories on one invoice.</span>
            </div>
            <div class="atoms-actions" style="margin-top:8px">
              <button type="button" class="atoms-btn secondary sm" id="pos-add-device"><span class="material-symbols-outlined">add</span> Add device to order</button>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              ${field('Selling Price (₦)', '<input id="pos-price" type="number" min="0" step="0.01" placeholder="0.00">')}
              ${field('Amount Paid Now (₦)', '<input id="pos-paid" type="number" min="0" step="0.01" placeholder="0.00">')}
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              ${field('Payment Method', `<select id="pos-method">${methods}</select>`)}
              ${field('Sales Representative', `<select id="pos-seller">${sellerOpts}</select>`)}
            </div>
            ${field('Customer Account / Phone', '<input id="pos-customer-q" placeholder="Type customer name or phone (leave blank for walk-in)">')}
            <div id="pos-customer-results"></div>
            <input type="hidden" id="pos-customer-id">
            <details class="atoms-more" style="margin-top:4px;">
              <summary><span class="material-symbols-outlined" style="font-size:16px; vertical-align:middle;">tune</span> Advanced Options (Discount & Wholesale)</summary>
              <div style="margin-top:10px; display:grid; gap:10px;">
                ${field('Transaction Tier', '<select id="pos-type"><option value="retail">Retail Sale</option><option value="wholesale">Wholesale Order</option></select><p id="pos-type-hint" class="atoms-muted" style="margin:4px 0 0"></p>')}
                ${field('Discount Amount (₦)', '<input id="pos-discount" type="number" min="0" step="0.01" value="0">')}
              </div>
            </details>
            ${qtyProducts.length ? `<details class="atoms-more" style="margin-top:8px;">
              <summary><span class="material-symbols-outlined" style="font-size:16px; vertical-align:middle;">inventory_2</span> Sell accessory (quantity stock)</summary>
              <div style="margin-top:10px; display:grid; gap:10px;">
                ${field('Product', `<select id="pos-accessory-product"><option value="">— Pick an accessory —</option>${accessoryOpts}</select>`)}
                ${field('Quantity', '<input id="pos-accessory-qty" type="number" min="1" step="1" value="1">')}
                ${field('Line price (₦ each)', '<input id="pos-accessory-price" type="number" min="0" step="0.01" placeholder="Uses minimum if blank">')}
                <div class="atoms-actions">
                  <button type="button" class="atoms-btn secondary sm" id="pos-add-accessory"><span class="material-symbols-outlined">add_shopping_cart</span> Add accessory to order</button>
                </div>
              </div>
            </details>` : ''}
            <div class="atoms-actions" style="margin-top:16px;">
              <button class="atoms-btn primary" type="submit" style="width:100%; min-height:44px; font-size:14px; font-weight:700;">
                <span class="material-symbols-outlined">shopping_cart_checkout</span> Complete Sale & Issue Invoice
              </button>
            </div>
          </form>
        </div>
        <div class="atoms-pos-receipt">
          <div class="atoms-pos-section-title">
            <span class="material-symbols-outlined" style="color:var(--atoms-accent);">receipt</span>
            <span>Order summary</span>
          </div>
          <div id="pos-basket" class="atoms-pos-lines atoms-muted" style="min-height:160px; display:flex; align-items:center; justify-content:center; text-align:center;">
            <div>
              <span class="material-symbols-outlined" style="font-size:36px; color:#cbd5e1; display:block; margin-bottom:6px;">shopping_bag</span>
              <span>Add devices and accessories to build a mixed invoice.</span>
            </div>
          </div>
        </div>
      </div>`;
  }

  async function screenImei() {
    const preset = escapeHtml(state.searchQ || '');
    return `
      ${pageShell({
        group: 'Daily operations',
        trail: 'Device lookup',
        title: 'Find a device',
        subtitle: 'Search by IMEI, invoice number, or customer name to see full history — purchase, sale, repair, and location.',
        actions: '<a class="atoms-back-btn" href="#/dashboard"><span class="material-symbols-outlined">arrow_back</span><span>Back to overview</span></a><a class="atoms-btn ghost sm" href="#/pos"><span class="material-symbols-outlined">point_of_sale</span> New sale</a>',
      })}
      <div class="atoms-card" style="max-width:540px;">
        <div class="atoms-pos-section-title">
          <span class="material-symbols-outlined" style="color:var(--atoms-primary);">search</span>
          <span>Search Central Registry</span>
        </div>
        <form class="atoms-form" id="imei-form">
          ${field('Device IMEI, Invoice Number, or Customer Name', scanInput('imei-q', 'Scan barcode or type 15 digits', preset ? `value="${preset}"` : ''))}
          <div class="atoms-actions">
            <button class="atoms-btn primary" type="submit">
              <span class="material-symbols-outlined">search</span> Search Device History
            </button>
          </div>
        </form>
      </div>
      <div id="imei-result" style="margin-top:20px">
        <div class="atoms-empty">
          <span class="material-symbols-outlined" style="font-size:40px; color:#cbd5e1; display:block; margin-bottom:8px;">smartphone</span>
          Type or scan a 15-digit IMEI, Invoice number, or Customer name to view complete audit trail.
        </div>
      </div>`;
  }

  function trackLabel(mode) {
    if (mode === 'quantity') return 'Quantity';
    if (mode === 'serial') return 'Serial';
    return 'IMEI';
  }

  function uniqueCatalogValues(products, key) {
    return [...new Set((products || []).map((p) => String(p[key] || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function bulkPricePanel(products) {
    if (!canManagePricing() || !(products || []).length) return '';
    return `<section class="atoms-panel" id="bulk-price-panel">
      <header class="atoms-panel-head">
        <div class="atoms-panel-title-wrap">
          <span class="material-symbols-outlined atoms-panel-icon">sell</span>
          <div>
            <h2 class="atoms-panel-title">Pricing &amp; price governance</h2>
            <p class="atoms-panel-sub">Bulk updates, market imports, history, and approvals live on the Price desk — not one-by-one product edits.</p>
          </div>
        </div>
        <a class="atoms-btn primary sm" href="#/pricing"><span class="material-symbols-outlined">open_in_new</span> Open Price desk</a>
      </header>
    </section>`;
  }

  function catalogProductRows(products) {
    if (!(products || []).length) {
      return '<tr><td colspan="7" class="atoms-empty">No products in the catalog yet. Add a model above.</td></tr>';
    }
    return products.map((p) => {
      const focused = Number(state.productFocusId) === Number(p.id);
      const variants = p.variants || [];
      const variantCells = variants.length
        ? variants.map((v) => {
          const label = v.label || v.variant_name || [v.color, v.storage].filter(Boolean).join(' / ') || 'Variant';
          return `<div class="atoms-variant-chip">
            <span>${escapeHtml(label)}${v.min_selling_price ? ` · <span class="atoms-table-mono">${money(v.min_selling_price)}</span>` : ''}</span>
            <button type="button" class="atoms-btn ghost xs js-var-edit" data-product="${p.id}" data-id="${v.id}" data-color="${escapeHtml(v.color || '')}" data-storage="${escapeHtml(v.storage || '')}" data-min="${(v.min_selling_price || 0) / 100}" title="Edit variant"><span class="material-symbols-outlined">edit</span></button>
          </div>`;
        }).join('')
        : '<span class="atoms-muted">No colour / storage yet</span>';
      return `<tr class="atoms-catalog-row${focused ? ' is-focused' : ''}" id="prod-row-${p.id}">
        <td class="atoms-td-check"><input type="checkbox" class="js-price-pick" value="${p.id}" aria-label="Select ${escapeHtml(p.name)}"></td>
        <td>
          <div class="atoms-catalog-name">${escapeHtml(p.name)}</div>
          <div class="atoms-catalog-meta"><span class="atoms-table-mono">${escapeHtml(p.sku || '—')}</span>${p.brand ? ` · ${escapeHtml(p.brand)}` : ''}</div>
        </td>
        <td>${escapeHtml(p.category || '—')}</td>
        <td><span class="atoms-badge">${trackLabel(p.track_mode)}</span></td>
        <td class="atoms-table-mono">${money(p.min_selling_price || 0)}</td>
        <td><div class="atoms-variant-list">${variantCells}</div></td>
        <td class="atoms-td-actions">
          <button type="button" class="atoms-btn ghost sm js-prod-edit" data-id="${p.id}"><span class="material-symbols-outlined">edit</span> Edit</button>
          <button type="button" class="atoms-btn ghost sm js-prod-archive" data-id="${p.id}" data-name="${escapeHtml(p.name)}"><span class="material-symbols-outlined">archive</span> Archive</button>
        </td>
      </tr>`;
    }).join('');
  }

  async function screenInventory() {
    const invQ = hashQuery();
    if (invQ.product) {
      state.productFocusId = Number(invQ.product);
    }
    const lowOnly = invQ.filter === 'low';
    const rows = await api('inventory?branch_id=');
    const products = can('atoms_manage_products') ? await api('products') : [];
    let archived = [];
    if (can('atoms_manage_products')) {
      try { archived = await api('products/archived'); } catch (e) { archived = []; }
    }
    const stock = stockRowsToProducts(rows);
    let deviceStock = stock.filter((p) => p.track_mode !== 'quantity');
    let qtyStock = stock.filter((p) => p.track_mode === 'quantity');
    if (lowOnly) {
      deviceStock = deviceStock.filter((p) => p.is_low);
      qtyStock = qtyStock.filter((p) => p.is_low);
    }
    const defaultTab = lowOnly && deviceStock.length === 0 && qtyStock.length > 0 ? 'accessories' : 'devices';
    const warrantyDefault = Number(state.bootstrap?.settings?.warranty_days || 365);
    const productForm = can('atoms_manage_products') ? `
      <section class="atoms-panel" id="product-form-panel">
        <header class="atoms-panel-head">
          <div class="atoms-panel-title-wrap">
            <span class="material-symbols-outlined atoms-panel-icon">add_box</span>
            <div>
              <h2 class="atoms-panel-title" id="product-form-title">Add product</h2>
              <p class="atoms-panel-sub">Define the model first, then optional colour / storage. Pricing rules apply across branches.</p>
            </div>
          </div>
        </header>
        <div class="atoms-panel-body">
          <form class="atoms-form atoms-inv-form" id="product-form">
            <input type="hidden" id="pr-id" value="">
            <div class="atoms-form-block">
              <div class="atoms-form-block-label">Identity</div>
              <div class="atoms-form-grid cols-3">
                ${field('Product category', '<select id="pr-category"><option value="Phone">Phone / device (IMEI)</option><option value="Tablet">Tablet (serial)</option><option value="Accessory">Accessory (quantity)</option><option value="Charger">Charger / cable (quantity)</option><option value="Other">Other</option></select>')}
                ${field('How stock is tracked', '<select id="pr-track"><option value="imei">IMEI — unique 15-digit code</option><option value="serial">Serial — unit serial number</option><option value="quantity">Quantity — count only</option></select>')}
                ${field('Brand', '<input id="pr-brand" placeholder="e.g. Apple">')}
              </div>
              <div class="atoms-form-grid cols-2" style="margin-top:12px">
                ${field('SKU code', '<input id="pr-sku" required placeholder="e.g. IPH-14PM">')}
                ${field('Product / model name', '<input id="pr-name" required placeholder="e.g. iPhone 14 Pro Max">')}
              </div>
            </div>
            <div class="atoms-form-block">
              <div class="atoms-form-block-label">Pricing &amp; stock rules</div>
              <div class="atoms-form-grid cols-4">
                ${field('Floor price (₦)', '<input id="pr-min" type="number" step="0.01" placeholder="0.00">')}
                ${field('Current selling (₦)', '<input id="pr-current" type="number" step="0.01" placeholder="Default POS price">')}
                ${field('Market price (₦)', '<input id="pr-market" type="number" step="0.01" placeholder="Management market">')}
                ${field('Estimated cost (₦)', '<input id="pr-cost" type="number" step="0.01" placeholder="0.00">')}
                ${field('Low-stock threshold', '<input id="pr-threshold" type="number" min="0" value="2" title="Alert when stock hits this count. 0 = off">')}
                ${field('Warranty (days)', `<input id="pr-warranty" type="number" min="0" value="${warrantyDefault}">`)}
              </div>
            </div>
            <div class="atoms-form-block is-optional">
              <div class="atoms-form-block-label">First variant <span class="atoms-form-optional">optional</span></div>
              <div class="atoms-form-grid cols-3">
                ${field('Colour', '<input id="pr-color" placeholder="Space Black">')}
                ${field('Storage', '<input id="pr-storage" placeholder="256GB">')}
                ${field('Variant floor price (₦)', '<input id="pr-var-min" type="number" step="0.01" placeholder="Uses product floor if blank">')}
              </div>
            </div>
            <div class="atoms-form-footer">
              <button class="atoms-btn primary" type="submit" id="pr-submit"><span class="material-symbols-outlined">save</span> Save product</button>
              <button type="button" class="atoms-btn ghost" id="pr-cancel" style="display:none">Cancel</button>
            </div>
          </form>
        </div>
      </section>` : '';

    const catalogPage = paginateList(products, 'inventory-catalog');
    const catalogPanel = can('atoms_manage_products') && products.length ? `
      <section class="atoms-panel" id="catalog-panel">
        <header class="atoms-panel-head">
          <div class="atoms-panel-title-wrap">
            <span class="material-symbols-outlined atoms-panel-icon">category</span>
            <div>
              <h2 class="atoms-panel-title">Product catalog</h2>
              <p class="atoms-panel-sub">${products.length} active model${products.length === 1 ? '' : 's'} · colour &amp; storage specs</p>
            </div>
          </div>
        </header>
        <div class="atoms-table-wrap">
          <table class="atoms-table atoms-catalog-table">
            <thead>
              <tr>
                <th class="atoms-td-check"><input type="checkbox" id="bp-select-all" title="Select all" aria-label="Select all products on this page"></th>
                <th>Product</th>
                <th>Category</th>
                <th>Tracking</th>
                <th>Floor price</th>
                <th>Variants</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${catalogProductRows(catalogPage.items)}</tbody>
          </table>
        </div>
        ${pagerBar(catalogPage)}
        <div class="atoms-panel-body atoms-variant-form-wrap" id="variant-form-wrap">
          <form class="atoms-form" id="variant-form">
            <div class="atoms-form-block">
              <div class="atoms-form-block-label" id="variant-form-title">Add variant</div>
              <input type="hidden" id="pv-id" value="">
              <div class="atoms-form-grid cols-4">
                ${field('Parent model', `<select id="pv-product">${products.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select>`)}
                ${field('Colour', '<input id="pv-color" placeholder="Deep Purple">')}
                ${field('Storage', '<input id="pv-storage" placeholder="512GB">')}
                ${field('Min price (₦)', '<input id="pv-min" type="number" step="0.01" placeholder="0.00">')}
              </div>
            </div>
            <div class="atoms-form-footer">
              <button class="atoms-btn accent" type="submit" id="pv-submit"><span class="material-symbols-outlined">add</span> Add variant</button>
              <button type="button" class="atoms-btn ghost" id="pv-cancel" style="display:none">Cancel</button>
            </div>
          </form>
        </div>
      </section>` : '';

    const stockPanel = `
      <section class="atoms-panel" id="inventory-table-wrap">
        <header class="atoms-panel-head">
          <div class="atoms-panel-title-wrap">
            <span class="material-symbols-outlined atoms-panel-icon">inventory_2</span>
            <div>
              <h2 class="atoms-panel-title">Live stock</h2>
              <p class="atoms-panel-sub">On-hand units by branch for the current catalog</p>
            </div>
          </div>
          <div class="atoms-seg-tabs" role="tablist" aria-label="Stock type">
            <button type="button" role="tab" class="atoms-seg-tab js-inv-tab${defaultTab === 'devices' ? ' is-active' : ''}" data-tab="devices" aria-selected="${defaultTab === 'devices'}">Devices (${deviceStock.length})</button>
            <button type="button" role="tab" class="atoms-seg-tab js-inv-tab${defaultTab === 'accessories' ? ' is-active' : ''}" data-tab="accessories" aria-selected="${defaultTab === 'accessories'}">Accessories (${qtyStock.length})</button>
          </div>
        </header>
        <div class="atoms-table-wrap" id="inv-panel-devices"${defaultTab !== 'devices' ? ' hidden' : ''}>${(() => { const p = paginateList(deviceStock, 'inventory-devices'); return inventoryTable(p.items) + pagerBar(p); })()}</div>
        <div class="atoms-table-wrap" id="inv-panel-accessories"${defaultTab !== 'accessories' ? ' hidden' : ''}>${(() => { const p = paginateList(qtyStock, 'inventory-accessories'); return inventoryTable(p.items) + pagerBar(p); })()}</div>
      </section>`;

    const archivedPage = paginateList(archived, 'inventory-archived');
    const archivedPanel = archived.length ? `
      <section class="atoms-panel">
        <header class="atoms-panel-head">
          <div class="atoms-panel-title-wrap">
            <span class="material-symbols-outlined atoms-panel-icon">archive</span>
            <div>
              <h2 class="atoms-panel-title">Archived models</h2>
              <p class="atoms-panel-sub">Hidden from the active catalog — restore anytime</p>
            </div>
          </div>
        </header>
        <div class="atoms-table-wrap">
          <table class="atoms-table">
            <thead><tr><th>Product</th><th>SKU</th><th></th></tr></thead>
            <tbody>
              ${archivedPage.items.map((p) => `<tr>
                <td><strong>${escapeHtml(p.name)}</strong></td>
                <td class="atoms-table-mono">${escapeHtml(p.sku || '—')}</td>
                <td class="atoms-td-actions">
                  <button type="button" class="atoms-btn accent sm js-prod-restore" data-id="${p.id}"><span class="material-symbols-outlined">restore</span> Restore</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${pagerBar(archivedPage)}
      </section>` : '';

    return `
      ${pageShell({
        group: 'Stock & purchasing',
        trail: 'Products & pricing',
        title: 'Products & stock',
        subtitle: 'Manage device models, colour and storage variants, minimum prices, and see live stock by branch.',
        actions: '<a class="atoms-back-btn" href="#/dashboard"><span class="material-symbols-outlined">arrow_back</span><span>Back to overview</span></a><button type="button" class="atoms-btn ghost sm js-copy-sheet" data-target="#inventory-table-wrap table"><span class="material-symbols-outlined">content_copy</span> Copy for Sheets</button>',
      })}
      ${lowOnly ? `<div class="atoms-flash warn" style="margin-bottom:16px">Showing <strong>low-stock</strong> items only (${deviceStock.length + qtyStock.length}). <a class="atoms-link" href="#/inventory">Show all stock</a></div>` : ''}
      <div class="atoms-inv-stack">
        ${productForm}
        ${bulkPricePanel(products)}
        ${catalogPanel}
        ${stockPanel}
        ${archivedPanel}
      </div>`;
  }

  async function screenInbound() {
    if (!canInbound()) {
      return `${pageShell({
        group: 'Stock & purchasing',
        trail: 'Inbound',
        title: 'Inbound manifest',
        subtitle: 'You do not have permission to manage pre-arrival supplier manifests.',
      })}<div class="atoms-flash warn">Ask an administrator to assign the Inbound Coordinator role or inbound manifest capability.</div>`;
    }
    const desk = await api(`inbound/desk?branch_id=${state.branchId || ''}`);
    const tab = state.inboundTab || 'queue';
    const orders = desk.orders || [];
    const inboundPage = paginateList(orders, 'inbound-queue');
    const suppliers = desk.suppliers || [];
    const products = desk.products || [];
    const importTypes = desk.import_types || [];
    const branchCode = desk.branch_code || '';
    const deviceProducts = products.filter((p) => p.track_mode !== 'quantity');
    const openPoOpts = orders.map((o) => `<option value="${o.id}">${escapeHtml(o.invoice_number || ('PO #' + o.id))} · ${escapeHtml(o.supplier_name || '')} · ${badge(o.status)}</option>`).join('');
    const supplierOpts = suppliers.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    const productOpts = products.map((p) => `<option value="${p.id}" data-track="${escapeHtml(p.track_mode || 'imei')}" data-cost="${(p.cost || 0) / 100}">${escapeHtml(p.name)} · ${escapeHtml(p.sku || '')}</option>`).join('');
    const deviceOpts = deviceProducts.map((p) => `<option value="${p.id}">${escapeHtml(p.name)} · ${escapeHtml(p.sku || '')}</option>`).join('');
    const importOpts = importTypes.map((t) => `<option value="${escapeHtml(t.id)}" data-notes="${escapeHtml(t.notes || '')}">${escapeHtml(t.label)}</option>`).join('');

    const tabBtn = (id, label, icon) => `<button type="button" class="atoms-btn ${tab === id ? 'primary' : 'ghost'} sm js-inbound-tab" data-tab="${id}"><span class="material-symbols-outlined">${icon}</span>${escapeHtml(label)}</button>`;

    let panel = '';
    if (tab === 'queue') {
      panel = `<div class="atoms-table-card">
        <div class="atoms-table-toolbar"><strong>Open expected shipments</strong><span class="atoms-muted">Ordered or inspecting — units stay reserved until vault receives goods</span></div>
        <div class="atoms-table-wrap">
          <table class="atoms-table"><thead><tr><th>Reference</th><th>Supplier</th><th>Status</th><th>Units</th><th>Reserved</th><th>Expected</th><th></th></tr></thead><tbody>
            ${inboundPage.items.map((o) => `<tr>
              <td><button type="button" class="atoms-link js-inbound-po" data-id="${o.id}"><span class="atoms-table-mono">${escapeHtml(o.invoice_number || ('PO-' + o.id))}</span></button></td>
              <td>${escapeHtml(o.supplier_name || '—')}</td>
              <td>${badge(o.status)}</td>
              <td>${o.received || 0} / ${o.units || 0}</td>
              <td><span class="atoms-badge ${Number(o.inbound_reserved) > 0 ? 'warn' : 'info'}">${o.inbound_reserved || 0}</span></td>
              <td>${escapeHtml(o.expected_arrival || '—')}</td>
              <td><button type="button" class="atoms-btn ghost sm js-inbound-po" data-id="${o.id}">Manage</button></td>
            </tr>`).join('') || '<tr><td colspan="7" class="atoms-empty">No open inbound shipments. Create an expected manifest below.</td></tr>'}
          </tbody></table>
        </div>
        ${pagerBar(inboundPage)}
      </div>`;
    } else if (tab === 'shipment') {
      panel = `<div class="atoms-card">
        <div class="atoms-pos-section-title"><span class="material-symbols-outlined" style="color:var(--atoms-primary);">local_shipping</span><span>Add expected shipment (one order)</span></div>
        <p class="atoms-sub">Register upcoming goods before they arrive. Devices can be pre-registered as <em>Reserved</em> after the PO exists.</p>
        <form class="atoms-form" id="inbound-shipment-form">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            ${field('Supplier', `<select id="ib-supplier" required>${supplierOpts}</select>`)}
            ${field('Supplier invoice / waybill', '<input id="ib-invoice" placeholder="e.g. INV-2026-0412" required>')}
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            ${field('Expected arrival', '<input id="ib-arrival" type="date">')}
            ${field('Product line', `<select id="ib-product">${productOpts}</select>`)}
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            ${field('Quantity', '<input id="ib-qty" type="number" min="1" value="1" required>')}
            ${field('Unit cost (₦)', '<input id="ib-cost" type="number" min="0" step="0.01">')}
          </div>
          <div class="atoms-actions"><button class="atoms-btn primary" type="submit"><span class="material-symbols-outlined">save</span> Save expected shipment</button></div>
        </form>
      </div>`;
    } else if (tab === 'paste-po') {
      panel = `<div class="atoms-card">
        <div class="atoms-pos-section-title"><span class="material-symbols-outlined" style="color:var(--atoms-primary);">table_rows</span><span>Paste PO lines from spreadsheet</span></div>
        <p class="atoms-sub">Copy rows from Excel or Google Sheets — one line per product. Creates a single purchase order in <strong>Ordered</strong> status.</p>
        <form class="atoms-form" id="inbound-paste-po-form">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            ${field('Supplier', `<select id="ibp-supplier" required>${supplierOpts}</select>`)}
            ${field('PO invoice reference', '<input id="ibp-invoice" required placeholder="Supplier invoice number">')}
          </div>
          ${field('Expected arrival', '<input id="ibp-arrival" type="date">')}
          ${field('Table data (sku, quantity, cost_price)', `<textarea id="ibp-table" rows="8" placeholder="SKU001\t5\t250000\nSKU002\t10\t1500"></textarea><p class="atoms-muted">Columns: sku · quantity · cost_price (tab or comma separated). Optional headers row is ignored if it contains "sku".</p>`)}
          <div class="atoms-actions"><button class="atoms-btn primary" type="submit"><span class="material-symbols-outlined">upload</span> Import PO lines</button></div>
        </form>
      </div>`;
    } else if (tab === 'unit') {
      panel = `<div class="atoms-card">
        <div class="atoms-pos-section-title"><span class="material-symbols-outlined" style="color:var(--atoms-primary);">smartphone</span><span>Pre-register one device</span></div>
        <p class="atoms-sub">Add a single IMEI to an open PO. It appears as <em>Reserved</em> in the system until goods are physically received.</p>
        <form class="atoms-form" id="inbound-unit-form">
          ${field('Open purchase order', `<select id="ibu-po" required>${openPoOpts || '<option value="">Create a shipment first</option>'}</select>`)}
          ${field('Product line', `<select id="ibu-product" required>${deviceOpts}</select>`)}
          ${field('IMEI', scanInput('ibu-imei', '15-digit IMEI', 'required'))}
          ${field('Serial (optional)', '<input id="ibu-serial" placeholder="Serial number">')}
          <div class="atoms-actions"><button class="atoms-btn primary" type="submit"><span class="material-symbols-outlined">save</span> Pre-register device</button></div>
        </form>
      </div>`;
    } else if (tab === 'paste-imei') {
      panel = `<div class="atoms-card">
        <div class="atoms-pos-section-title"><span class="material-symbols-outlined" style="color:var(--atoms-primary);">table_rows</span><span>Paste IMEI manifest from spreadsheet</span></div>
        <p class="atoms-sub">Paste supplier IMEI lists. Creates the PO if needed and pre-registers each unit as reserved. Branch code: <strong>${escapeHtml(branchCode)}</strong></p>
        <form class="atoms-form" id="inbound-paste-imei-form">
          ${field('Supplier name (for new POs)', `<input id="ibpi-supplier" list="ib-supplier-names" placeholder="${escapeHtml(suppliers[0]?.name || 'Supplier name')}" required>`)}
          <datalist id="ib-supplier-names">${suppliers.map((s) => `<option value="${escapeHtml(s.name)}">`).join('')}</datalist>
          ${field('Table data', `<textarea id="ibpi-table" rows="10" placeholder="PO-INV-001\tSKU001\t356938035643809\tSN-001"></textarea><p class="atoms-muted">Columns: po_invoice · sku · imei · serial_number (optional). Tab or comma separated.</p>`)}
          <div class="atoms-actions"><button class="atoms-btn primary" type="submit"><span class="material-symbols-outlined">upload</span> Pre-register pasted IMEIs</button></div>
        </form>
      </div>`;
    } else if (tab === 'csv') {
      panel = `<div class="atoms-card">
        <div class="atoms-pos-section-title"><span class="material-symbols-outlined" style="color:var(--atoms-primary);">upload_file</span><span>CSV file import</span></div>
        <p class="atoms-sub">Upload supplier CSV manifests — expected PO lines or IMEI pre-registration lists.</p>
        <form class="atoms-form" id="inbound-csv-form">
          ${field('Import type', `<select id="ibc-type">${importOpts}</select>`)}
          ${field('CSV file', '<input id="ibc-file" type="file" accept=".csv,text/csv,text/plain" required>')}
          <p class="atoms-muted" id="ibc-notes">${escapeHtml(importTypes[0]?.notes || '')}</p>
          <div class="atoms-actions">
            <button type="button" class="atoms-btn ghost" id="ibc-template"><span class="material-symbols-outlined">download</span> Download template</button>
            <button class="atoms-btn primary" type="submit"><span class="material-symbols-outlined">upload</span> Run import</button>
          </div>
        </form>
      </div>`;
    }

    return `${pageShell({
      group: 'Stock & purchasing',
      trail: 'Inbound manifest',
      title: 'Pre-arrival inbound manifest',
      subtitle: 'Populate expected supplier goods and pre-register devices before physical arrival — CSV, spreadsheet paste, or one-by-one.',
      actions: `<a class="atoms-back-btn" href="#/dashboard"><span class="material-symbols-outlined">arrow_back</span><span>Back to overview</span></a>${canReceivePurchases() ? '<a class="atoms-btn ghost sm" href="#/purchases"><span class="material-symbols-outlined">inventory</span> Receive goods</a>' : ''}`,
    })}
      <div class="atoms-presets" style="margin-bottom:16px; flex-wrap:wrap;">
        ${tabBtn('queue', 'Open queue', 'inbox')}
        ${tabBtn('shipment', 'One shipment', 'add_box')}
        ${tabBtn('paste-po', 'Paste PO lines', 'table_rows')}
        ${tabBtn('unit', 'One device', 'smartphone')}
        ${tabBtn('paste-imei', 'Paste IMEIs', 'qr_code_2')}
        ${tabBtn('csv', 'CSV file', 'upload_file')}
      </div>
      ${panel}`;
  }

  async function screenPurchases() {
    if (!canInbound() && !canReceivePurchases()) {
      return `${pageShell({ group: 'Stock & purchasing', trail: 'Purchases', title: 'Supplier orders', subtitle: 'Access restricted.' })}<div class="atoms-flash warn">You do not have permission to view purchase orders.</div>`;
    }
    if (state.purchaseId) {
      return screenPurchaseDesk(state.purchaseId);
    }
    const list = await api('purchases');
    const products = await api('products');
    state._purchaseProducts = products;
    const suppliers = await api('suppliers');
    const poPage = paginateList(list, 'purchases');
    return `
      ${pageShell({
        group: 'Stock & purchasing',
        trail: 'Supplier orders',
        title: 'Supplier orders & intake',
        subtitle: 'Create purchase orders, pre-register inbound IMEIs from supplier manifests, receive goods, and register devices into stock.',
        actions: '<a class="atoms-back-btn" href="#/dashboard"><span class="material-symbols-outlined">arrow_back</span><span>Back to overview</span></a><button type="button" class="atoms-btn ghost sm js-copy-sheet" data-target="#po-table-wrap table"><span class="material-symbols-outlined">content_copy</span> Copy for Sheets</button>',
      })}
      <div class="atoms-row">
        <div class="atoms-card">
          <div class="atoms-pos-section-title">
            <span class="material-symbols-outlined" style="color:var(--atoms-primary);">post_add</span>
            <span>Draft Purchase Order</span>
          </div>
          <form class="atoms-form" id="purchase-form">
            ${field('Vendor / Supplier', `<select id="p-supplier">${suppliers.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}</select>`)}
            ${field('Supplier Invoice / Waybill Reference', '<input id="p-invoice" placeholder="e.g. INV-9842">')}
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              ${field('Purchase Date', '<input id="p-date" type="date">')}
              ${field('Expected Arrival', '<input id="p-arrive" type="date">')}
            </div>
            ${field('Device Model', `<select id="p-product">${products.map((p) => `<option value="${p.id}" data-cost="${(p.default_cost_price || 0) / 100}">${escapeHtml(p.name)}</option>`).join('')}</select>`)}
            ${field('Color / Storage Variant', variantSelectHtml('p-variant', products, products[0]?.id || ''))}
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              ${field('Cost Price per Unit (₦)', '<input id="p-cost" type="number" step="0.01" placeholder="0.00">')}
              ${field('Quantity Ordered', '<input id="p-qty" type="number" min="1" value="1">')}
            </div>
            <div class="atoms-actions">
              <button class="atoms-btn primary" type="submit">
                <span class="material-symbols-outlined">add_shopping_cart</span> Create Purchase Order
              </button>
            </div>
          </form>
        </div>
        <div class="atoms-table-card" id="po-table-wrap">
          <div class="atoms-table-toolbar">
            <div style="font-size:14px; font-weight:700; display:flex; align-items:center; gap:8px;">
              <span class="material-symbols-outlined" style="color:var(--atoms-primary);">receipt_long</span>
              <span>Purchase Orders & Intake Logs</span>
            </div>
          </div>
          <div class="atoms-table-wrap">
            <table class="atoms-table"><thead><tr><th>PO Number</th><th>Supplier</th><th>Status</th><th>Actions</th></tr></thead><tbody>
              ${poPage.items.map((p) => `<tr>
                <td><button type="button" class="atoms-link js-purchase-open" data-id="${p.id}"><span class="atoms-table-mono">${escapeHtml(p.invoice_number)}</span></button></td>
                <td>${escapeHtml(p.supplier_name || 'Vendor')}</td>
                <td>${badge(p.status)}</td>
                <td>
                  <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    ${canReceivePurchases() ? `<button class="atoms-btn ghost sm js-receive" data-id="${p.id}"><span class="material-symbols-outlined" style="font-size:14px;">inventory</span> Receive</button>
                    <button class="atoms-btn accent sm js-imeis" data-id="${p.id}"><span class="material-symbols-outlined" style="font-size:14px;">qr_code_scanner</span> IMEIs</button>` : ''}
                    ${canInbound() ? `<button class="atoms-btn ghost sm js-purchase-open" data-id="${p.id}"><span class="material-symbols-outlined" style="font-size:14px;">move_to_inbox</span> Manifest</button>` : ''}
                  </div>
                </td>
              </tr>`).join('') || '<tr><td colspan="4" class="atoms-empty">No purchase orders created yet.</td></tr>'}
            </tbody></table>
          </div>
          ${pagerBar(poPage)}
          <div style="padding:16px; border-top:1px solid var(--atoms-line);">
            <form class="atoms-form" id="imei-reg-form" style="display:none">
              <input type="hidden" id="reg-purchase-id">
              <div class="atoms-pos-section-title">
                <span class="material-symbols-outlined" style="color:var(--atoms-accent);">qr_code_2</span>
                <span>Batch IMEI Intake Registration</span>
              </div>
              ${field('Intake Product Line', '<select id="reg-product-id"></select>')}
              ${field('Device IMEIs (one per line: IMEI or IMEI,serial)', '<textarea id="reg-imeis" rows="6" placeholder="356938035643809,SN-A36-1"></textarea><button type="button" class="atoms-btn ghost sm js-scan" data-target="reg-imeis" style="margin-top:6px;"><span class="material-symbols-outlined">photo_camera</span> Scan via Camera</button>')}
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                ${field('Device Physical Condition', '<select id="reg-condition"><option value="new" selected>Brand New (Sealed)</option><option value="used">Pre-Owned (Clean)</option><option value="refurbished">Certified Refurbished</option></select>')}
                ${field('Bulk CSV / Barcode File', '<input id="reg-file" type="file" accept=".csv,.txt,text/plain">')}
              </div>
              <div class="atoms-actions">
                <button class="atoms-btn primary" type="submit">
                  <span class="material-symbols-outlined">save</span> Register Devices into Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>`;
  }

  async function screenPurchaseDesk(id) {
    const p = await api(`purchases/${id}`);
    const qtyPending = (p.items || []).some((it) => it.track_mode === 'quantity' && Number(it.received_qty) < Number(it.quantity));
    const unitPending = (p.items || []).some((it) => it.track_mode !== 'quantity' && Number(it.received_qty) < Number(it.quantity));
    const reserved = Number(p.inbound_reserved || 0);
    return `
      ${pageShell({
        group: 'Stock & purchasing',
        trail: p.invoice_number || ('PO #' + p.id),
        title: p.invoice_number || ('PO #' + p.id),
        subtitle: `Supplier #${p.supplier_id} · ${badge(p.status)}${reserved ? ` · <strong>${reserved}</strong> inbound reserved` : ''} · Created ${escapeHtml(p.created_at || 'recently')}`,
        actions: `<a class="atoms-back-btn" href="#/purchases"><span class="material-symbols-outlined">arrow_back</span><span>Back to orders</span></a>
          ${canReceivePurchases() && p.status === 'ordered' ? `<button type="button" class="atoms-btn ghost sm js-receive" data-id="${p.id}"><span class="material-symbols-outlined">inventory</span> Receive goods</button>` : ''}
          ${canInbound() && unitPending ? `<button type="button" class="atoms-btn ghost sm js-pre-imeis" data-id="${p.id}"><span class="material-symbols-outlined">upload</span> Pre-register IMEIs</button>` : ''}
          ${canReceivePurchases() && qtyPending ? `<button type="button" class="atoms-btn accent sm js-receive-qty" data-id="${p.id}"><span class="material-symbols-outlined">add_shopping_cart</span> Receive accessories</button>` : ''}
          ${canReceivePurchases() && ['ordered', 'inspecting', 'received'].includes(p.status) ? `<button type="button" class="atoms-btn accent sm js-imeis" data-id="${p.id}"><span class="material-symbols-outlined">qr_code_scanner</span> Register IMEIs</button>` : ''}`,
      })}
      <div class="atoms-table-card">
        <div class="atoms-table-wrap">
          <table class="atoms-table"><thead><tr><th>Product Model</th><th>Tracking</th><th>Specification</th><th>Unit Cost</th><th>Ordered Qty</th><th>Received Qty</th></tr></thead><tbody>
            ${(p.items || []).map((it) => `<tr>
              <td><strong>${escapeHtml(it.product_name || '')}</strong></td>
              <td><span class="atoms-badge">${it.track_mode === 'quantity' ? 'Quantity' : (it.track_mode === 'serial' ? 'Serial' : 'IMEI')}</span></td>
              <td>${escapeHtml(it.variant_label || '—')}</td>
              <td class="atoms-table-mono">${money(it.cost_price)}</td>
              <td><strong>${it.quantity}</strong></td>
              <td><span class="atoms-badge ${Number(it.received_qty) >= Number(it.quantity) ? 'ok' : 'warn'}">${it.received_qty} / ${it.quantity}</span></td>
            </tr>`).join('')}
          </tbody></table>
        </div>
      </div>
      ${canInbound() && unitPending ? `<div class="atoms-card" id="pre-imei-panel" style="margin-top:16px">
        <div class="atoms-pos-section-title">
          <span class="material-symbols-outlined" style="color:var(--atoms-primary);">upload</span>
          <span>Pre-register inbound manifest</span>
        </div>
        <p class="atoms-sub">Paste IMEIs from the supplier before goods arrive. They appear as <em>Reserved</em> until you click Receive goods.</p>
        <form class="atoms-form" id="pre-imei-form">
          <input type="hidden" id="pre-purchase-id" value="${p.id}">
          ${field('Product line', `<select id="pre-product-id">${(p.items || []).filter((it) => it.track_mode !== 'quantity').map((it) => `<option value="${it.product_id}" data-variant="${it.variant_id || ''}">${escapeHtml(it.product_name || '')}${it.variant_label ? ' · ' + escapeHtml(it.variant_label) : ''}</option>`).join('')}</select>`)}
          ${field('IMEIs (one per line)', '<textarea id="pre-imeis" rows="6" placeholder="356938035643809"></textarea>')}
          <div class="atoms-actions">
            <button class="atoms-btn primary" type="submit"><span class="material-symbols-outlined">save</span> Pre-register as reserved</button>
          </div>
        </form>
      </div>` : ''}`;
  }

  async function screenTransfers() {
    if (state.transferId) {
      return screenTransferDesk(state.transferId);
    }
    const list = await api('transfers');
    const transferPage = paginateList(list, 'transfers');
    return `
      ${pageShell({
        group: 'Stock & purchasing',
        trail: 'Branch transfers',
        title: 'Inter-branch transfers',
        subtitle: 'Request, approve, dispatch, and receive device shipments between branches with live IMEI custody.',
        actions: '<a class="atoms-back-btn" href="#/dashboard"><span class="material-symbols-outlined">arrow_back</span><span>Back to overview</span></a><button type="button" class="atoms-btn ghost sm js-copy-sheet" data-target="#transfers-table-wrap table"><span class="material-symbols-outlined">content_copy</span> Copy for Sheets</button>',
      })}
      <div class="atoms-row">
        <div class="atoms-card">
          <div class="atoms-pos-section-title">
            <span class="material-symbols-outlined" style="color:var(--atoms-primary);">sync_alt</span>
            <span>Request Stock Transfer</span>
          </div>
          <form class="atoms-form" id="transfer-form">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              ${field('Dispatching Branch (Origin)', branchSelect('t-from'))}
              ${field('Receiving Branch (Destination)', branchSelect('t-to'))}
            </div>
            ${field('Device IMEIs (one per line)', '<textarea id="t-imeis" rows="5" placeholder="Enter 15-digit IMEIs to transfer..."></textarea><button type="button" class="atoms-btn ghost sm js-scan" data-target="t-imeis" style="margin-top:6px;"><span class="material-symbols-outlined">photo_camera</span> Scan via Camera</button>')}
            <div class="atoms-actions">
              <button class="atoms-btn primary" type="submit">
                <span class="material-symbols-outlined">send</span> Request Transfer
              </button>
            </div>
          </form>
        </div>
        <div class="atoms-table-card" id="transfers-table-wrap">
          <div class="atoms-table-toolbar">
            <div style="font-size:14px; font-weight:700; display:flex; align-items:center; gap:8px;">
              <span class="material-symbols-outlined" style="color:var(--atoms-primary);">local_shipping</span>
              <span>Active Transfer Shipments</span>
            </div>
          </div>
          <div class="atoms-table-wrap">
            <table class="atoms-table"><thead><tr><th>Transfer ID & Route</th><th>Status & Devices</th><th>Actions</th></tr></thead><tbody>
              ${transferPage.items.map((t) => `<tr>
                <td><button type="button" class="atoms-link js-transfer-open" data-id="${t.id}"><strong>#TR-${t.id}</strong></button> <span style="color:#64748b; font-size:12px;">(${escapeHtml(t.from_branch_name || ('#' + t.from_branch_id))} → ${escapeHtml(t.to_branch_name || ('#' + t.to_branch_id))})</span></td>
                <td>${badge(t.status)} <span style="font-size:12px; color:#64748b; margin-left:4px;">· <strong>${t.device_count || 0}</strong> unit(s)</span></td>
                <td>
                  <div style="display:flex; gap:6px;">
                    <button class="atoms-btn ghost sm js-t-approve" data-id="${t.id}"><span class="material-symbols-outlined" style="font-size:14px;">check</span> Approve</button>
                    <button class="atoms-btn ghost sm js-t-dispatch" data-id="${t.id}"><span class="material-symbols-outlined" style="font-size:14px;">local_shipping</span> Dispatch</button>
                    <button class="atoms-btn accent sm js-t-receive" data-id="${t.id}"><span class="material-symbols-outlined" style="font-size:14px;">inventory</span> Receive</button>
                  </div>
                </td>
              </tr>`).join('') || '<tr><td colspan="3" class="atoms-empty">No inter-branch transfers active.</td></tr>'}
            </tbody></table>
          </div>
          ${pagerBar(transferPage)}
        </div>
      </div>`;
  }

  async function screenTransferDesk(id) {
    const t = await api(`transfers/${id}`);
    return `
      ${pageShell({
        group: 'Stock & purchasing',
        trail: 'Transfer #' + t.id,
        title: 'Transfer #' + t.id,
        subtitle: `${escapeHtml(t.from_branch_name || '')} → ${escapeHtml(t.to_branch_name || '')} · ${badge(t.status)}`,
        actions: `<a class="atoms-back-btn" href="#/transfers"><span class="material-symbols-outlined">arrow_back</span><span>Back to transfers</span></a>
          ${t.status === 'requested' ? `<button type="button" class="atoms-btn ghost sm js-t-approve" data-id="${t.id}"><span class="material-symbols-outlined">check</span> Approve</button>` : ''}
          ${t.status === 'approved' ? `<button type="button" class="atoms-btn ghost sm js-t-dispatch" data-id="${t.id}"><span class="material-symbols-outlined">local_shipping</span> Dispatch</button>` : ''}
          ${t.status === 'dispatched' ? `<button type="button" class="atoms-btn accent sm js-t-receive" data-id="${t.id}"><span class="material-symbols-outlined">inventory</span> Confirm receipt</button>` : ''}`,
      })}
      <div class="atoms-table-card">
        <div class="atoms-table-wrap">
          <table class="atoms-table"><thead><tr><th>Device IMEI</th><th>Product Model</th><th>Specification</th><th>Serial Number</th></tr></thead><tbody>
            ${(t.items || []).map((it) => `<tr>
              <td><button type="button" class="atoms-link js-open-imei" data-imei="${escapeHtml(it.imei)}"><span class="atoms-imei-pill">${escapeHtml(it.imei)}</span></button></td>
              <td><strong>${escapeHtml(it.product_name || '')}</strong></td>
              <td>${escapeHtml(it.variant_label || '—')}</td>
              <td class="atoms-table-mono">${escapeHtml(it.serial_number || '—')}</td>
            </tr>`).join('') || '<tr><td colspan="4" class="atoms-empty">No device units on this transfer.</td></tr>'}
          </tbody></table>
        </div>
      </div>`;
  }

  async function screenStocktake() {
    if (state.countId) {
      return screenStockCountDesk(state.countId);
    }
    const list = await api(`stock-counts?branch_id=${state.branchId || ''}`);
    const historyPage = paginateList(list, 'stocktake-history');
    const open = list.find((c) => c.status === 'open' || c.status === 'pending_approval');
    const current = open ? await api(`stock-counts/${open.id}`) : null;
    const lines = current?.lines || [];
    const deviceLines = lines.filter((l) => (l.track_mode || 'imei') !== 'quantity');
    const qtyLines = lines.filter((l) => (l.track_mode || '') === 'quantity');
    const countPage = paginateList(deviceLines, 'stocktake-lines');
    return `
      ${pageShell({
        group: 'Stock & purchasing',
        trail: 'Stocktake',
        title: 'Physical stock audit',
        subtitle: 'Floor reconciliation, blind scan verification, and manager approval for variances.',
        actions: '<a class="atoms-back-btn" href="#/dashboard"><span class="material-symbols-outlined">arrow_back</span><span>Back to overview</span></a><button type="button" class="atoms-btn ghost sm js-copy-sheet" data-target="#count-lines-wrap table"><span class="material-symbols-outlined">content_copy</span> Copy for Sheets</button>',
      })}
      <div class="atoms-row">
        <div class="atoms-card">
          ${current ? `
            <div class="atoms-pos-section-title">
              <span class="material-symbols-outlined" style="color:var(--atoms-primary);">fact_check</span>
              <span>Active Audit Count #STK-${current.id}</span>
            </div>
            <div style="margin-bottom:12px;">${badge(current.status)}</div>
            <input type="hidden" id="sc-id" value="${current.id}">
            <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-bottom:16px;">
              <div class="atoms-card" style="padding:10px; background:#f8fafc;"><span style="font-size:11px; color:#64748b; font-weight:700; text-transform:uppercase;">Expected Units</span><div class="atoms-metric" style="font-size:20px;">${current.expected_qty}</div></div>
              <div class="atoms-card" style="padding:10px; background:#f8fafc;"><span style="font-size:11px; color:#64748b; font-weight:700; text-transform:uppercase;">Counted Units</span><div class="atoms-metric" style="font-size:20px; color:#047857;">${current.counted_qty}</div></div>
              <div class="atoms-card" style="padding:10px; background:#f8fafc;"><span style="font-size:11px; color:#64748b; font-weight:700; text-transform:uppercase;">Missing Items</span><div class="atoms-metric" style="font-size:20px; color:${Number(current.missing_qty) > 0 ? '#b91c1c' : '#047857'};">${current.missing_qty}</div></div>
              <div class="atoms-card" style="padding:10px; background:#f8fafc;"><span style="font-size:11px; color:#64748b; font-weight:700; text-transform:uppercase;">Extra Scans</span><div class="atoms-metric" style="font-size:20px;">${current.extra_qty}</div></div>
            </div>
            ${current.status === 'open' ? `
              <form class="atoms-form" id="count-scan-form">
                ${field('Scan IMEI on the Floor', scanInput('sc-imei', 'Scan barcode or type 15-digit IMEI', 'autofocus'))}
                <div class="atoms-actions">
                  <button class="atoms-btn primary" type="submit">
                    <span class="material-symbols-outlined">qr_code_scanner</span> Record Found Device
                  </button>
                </div>
              </form>
              ${qtyLines.length ? `
              <form class="atoms-form" id="count-qty-form" style="margin-top:18px; border-top:1px solid var(--atoms-line); padding-top:14px;">
                <div class="atoms-pos-section-title">
                  <span class="material-symbols-outlined" style="color:var(--atoms-primary);">inventory</span>
                  <span>Count accessories & quantity stock</span>
                </div>
                ${qtyLines.map((l) => `
                  <div class="atoms-row" style="align-items:end; gap:10px; margin-bottom:10px;">
                    <div style="flex:1;">
                      <label class="atoms-label">${escapeHtml(l.product_name || 'Accessory')}${l.variant_label ? ' · ' + escapeHtml(l.variant_label) : ''}</label>
                      <div class="atoms-muted" style="font-size:12px;">System expects ${l.expected_qty} on hand</div>
                    </div>
                    <div style="width:120px;">
                      <input type="number" min="0" class="js-qty-count" data-product-id="${l.product_id}" data-variant-id="${l.variant_id || ''}" value="${Number(l.counted_qty) || ''}" placeholder="${l.expected_qty}">
                    </div>
                  </div>
                `).join('')}
                <div class="atoms-actions">
                  <button class="atoms-btn secondary" type="submit"><span class="material-symbols-outlined">save</span> Save accessory counts</button>
                </div>
              </form>
              ` : ''}
              <form class="atoms-form" id="count-submit-form" style="margin-top:18px; border-top:1px solid var(--atoms-line); padding-top:14px;">
                ${field('Variance Explanation (Required if missing items exist)', '<textarea id="sc-reason" rows="2" placeholder="e.g. Vault recount completed after transfer..."></textarea>')}
                <div class="atoms-actions">
                  <button class="atoms-btn accent" type="submit"><span class="material-symbols-outlined">done_all</span> Submit Count for Approval</button>
                  <button class="atoms-btn danger" type="button" id="sc-cancel"><span class="material-symbols-outlined">close</span> Cancel Count</button>
                </div>
              </form>
            ` : '<div class="atoms-flash warn"><span class="material-symbols-outlined">hourglass_empty</span> Variance submitted. Waiting for manager authorization. Stock remains locked.</div>'}
          ` : `
            <div class="atoms-pos-section-title">
              <span class="material-symbols-outlined" style="color:var(--atoms-primary);">play_circle</span>
              <span>Initiate Stocktake Session</span>
            </div>
            <form class="atoms-form" id="count-open-form">
              <p class="atoms-sub" style="margin-bottom:14px;">Take an instant freeze snapshot of all available devices and quantity accessories in this branch, then perform live physical audit verification.</p>
              <button class="atoms-btn primary" type="submit">
                <span class="material-symbols-outlined">fact_check</span> Start Physical Count
              </button>
            </form>
          `}
        </div>
        <div class="atoms-table-card" id="count-lines-wrap">
          <div class="atoms-table-toolbar">
            <div style="font-size:14px; font-weight:700; display:flex; align-items:center; gap:8px;">
              <span class="material-symbols-outlined" style="color:var(--atoms-primary);">checklist</span>
              <span>Current Floor Audit Item Manifest</span>
            </div>
          </div>
          <div class="atoms-table-wrap">
            <table class="atoms-table"><thead><tr><th>Type</th><th>Identifier</th><th>Product Model</th><th>Specification</th><th>Expected</th><th>Counted</th><th>Variance</th></tr></thead><tbody>
              ${countPage.items.map((l) => `<tr>
                <td><span class="atoms-badge">Device</span></td>
                <td><span class="atoms-imei-pill">${escapeHtml(l.imei)}</span>${l.serial_number ? `<br><small style="color:#64748b;">SN: ${escapeHtml(l.serial_number)}</small>` : ''}</td>
                <td><strong>${escapeHtml(l.product_name || '—')}</strong></td>
                <td>${escapeHtml(l.variant_label || '—')}</td>
                <td>${l.expected_status ? badge(l.expected_status) : '—'}</td>
                <td><span class="atoms-badge ${Number(l.counted) ? 'ok' : 'bad'}">${Number(l.counted) ? '✓ Found' : '✗ Unscanned'}</span></td>
                <td>${badge(l.variance)}</td>
              </tr>`).join('')}
              ${qtyLines.map((l) => `<tr>
                <td><span class="atoms-badge accent">Qty</span></td>
                <td><span class="atoms-table-mono">${escapeHtml(l.imei)}</span></td>
                <td><strong>${escapeHtml(l.product_name || '—')}</strong></td>
                <td>${escapeHtml(l.variant_label || '—')}</td>
                <td>${l.expected_qty}</td>
                <td><span class="atoms-badge ${Number(l.counted_qty) === Number(l.expected_qty) ? 'ok' : (Number(l.counted_qty) ? 'warn' : 'bad')}">${Number(l.counted_qty) || 0}</span></td>
                <td>${badge(l.variance)}</td>
              </tr>`).join('')}
              ${lines.length ? '' : '<tr><td colspan="7" class="atoms-empty">No active stocktake session in progress.</td></tr>'}
            </tbody></table>
          </div>
          ${pagerBar(countPage)}
          <div class="atoms-table-toolbar" style="border-top:1px solid var(--atoms-line);">
            <div style="font-size:14px; font-weight:700; display:flex; align-items:center; gap:8px;">
              <span class="material-symbols-outlined" style="color:var(--atoms-primary);">history</span>
              <span>Past Audit History Logs</span>
            </div>
          </div>
          <div class="atoms-table-wrap">
            <table class="atoms-table"><thead><tr><th>Session</th><th>Status</th><th>Missing Units</th><th>Date Posted</th><th></th></tr></thead><tbody>
              ${historyPage.items.map((c) => `<tr>
                <td>${c.status === 'open'
                  ? `<button type="button" class="atoms-link js-count-resume" data-id="${c.id}"><strong>Resume #STK-${c.id}</strong></button>`
                  : `<button type="button" class="atoms-link js-count-open" data-id="${c.id}"><strong>#STK-${c.id}</strong></button>`}</td>
                <td>${badge(c.status)}</td>
                <td style="color:${Number(c.missing_qty) > 0 ? '#b91c1c' : '#047857'}; font-weight:700;">${c.missing_qty} unit(s)</td>
                <td>${escapeHtml(c.posted_at || c.created_at || '')}</td>
                <td>${c.status === 'open' ? `<button type="button" class="atoms-btn secondary sm js-count-resume" data-id="${c.id}"><span class="material-symbols-outlined">play_arrow</span> Resume</button>` : ''}</td>
              </tr>`).join('') || '<tr><td colspan="5" class="atoms-empty">No past stock count sessions recorded.</td></tr>'}
            </tbody></table>
          </div>
          ${pagerBar(historyPage)}
        </div>
      </div>`;
  }

  async function screenStockCountDesk(id) {
    const c = await api(`stock-counts/${id}`);
    const lines = c.lines || [];
    const summary = c.summary || {};
    const lineRow = (l) => {
      if ((l.track_mode || '') === 'quantity') {
        return `<tr>
          <td><span class="atoms-badge accent">Qty</span></td>
          <td><span class="atoms-table-mono">${escapeHtml(l.imei || '')}</span></td>
          <td><strong>${escapeHtml(l.product_name || '—')}</strong></td>
          <td>${escapeHtml(l.variant_label || '—')}</td>
          <td>${l.expected_qty ?? '—'}</td>
          <td><span class="atoms-badge ${Number(l.counted_qty) === Number(l.expected_qty) ? 'ok' : (Number(l.counted_qty) ? 'warn' : 'bad')}">${Number(l.counted_qty) || 0}</span></td>
          <td>${badge(l.variance)}</td>
        </tr>`;
      }
      return `<tr>
        <td><span class="atoms-badge">Device</span></td>
        <td><span class="atoms-imei-pill">${escapeHtml(l.imei)}</span>${l.serial_number ? `<br><small style="color:#64748b;">SN: ${escapeHtml(l.serial_number)}</small>` : ''}</td>
        <td><strong>${escapeHtml(l.product_name || '—')}</strong></td>
        <td>${escapeHtml(l.variant_label || '—')}</td>
        <td>${l.expected_status ? badge(l.expected_status) : '—'}</td>
        <td><span class="atoms-badge ${Number(l.counted) ? 'ok' : 'bad'}">${Number(l.counted) ? '✓ Found' : '✗ Unscanned'}</span></td>
        <td>${badge(l.variance)}</td>
      </tr>`;
    };
    const resumeAction = c.status === 'open'
      ? '<button type="button" class="atoms-btn primary sm js-count-resume" data-id="' + c.id + '"><span class="material-symbols-outlined">play_arrow</span><span>Resume counting</span></button>'
      : '';
    return `
      ${pageShell({
        group: 'Stock & purchasing',
        trail: 'Audit #' + c.id,
        title: 'Stock audit #' + c.id,
        subtitle: `${badge(c.status)} · Expected ${c.expected_qty} · Counted ${c.counted_qty} · Missing ${c.missing_qty} · devices and accessories`,
        actions: '<a class="atoms-back-btn" href="#/stocktake"><span class="material-symbols-outlined">arrow_back</span><span>Back to stocktake</span></a>' + resumeAction,
      })}
      ${c.reason ? `<div class="atoms-card" style="margin-bottom:16px"><div class="atoms-pos-section-title"><span class="material-symbols-outlined" style="color:var(--atoms-warn);">warning</span><span>Variance explanation</span></div><p>${escapeHtml(c.reason)}</p></div>` : ''}
      <div class="atoms-table-card">
        <div class="atoms-table-wrap">
          <table class="atoms-table"><thead><tr><th>Type</th><th>Identifier</th><th>Product</th><th>Specification</th><th>Expected</th><th>Counted</th><th>Variance</th></tr></thead><tbody>
            ${lines.map(lineRow).join('') || '<tr><td colspan="7" class="atoms-empty">No line items on this audit.</td></tr>'}
          </tbody></table>
        </div>
        ${summary.missing ? `<div style="padding:12px 16px; background:#fef2f2; color:#b91c1c; font-size:13px; font-weight:600; border-top:1px solid #fecaca;">Missing: ${summary.missing} items · Extra: ${summary.extra || 0} · Reconciled: ${summary.matched || 0}</div>` : ''}
      </div>`;
  }

  async function screenReturns() {
    if (state.returnId) {
      return screenReturnDesk(state.returnId);
    }
    const list = await api(`returns?branch_id=${state.branchId || ''}`);
    const returnPage = paginateList(list, 'returns');
    return `
      ${pageShell({
        group: 'Daily operations',
        trail: 'Returns',
        title: 'Customer returns',
        subtitle: 'Locate the original sale by IMEI, verify warranty, and post refunds or replacements.',
        actions: '<a class="atoms-back-btn" href="#/dashboard"><span class="material-symbols-outlined">arrow_back</span><span>Back to overview</span></a><button type="button" class="atoms-btn ghost sm js-copy-sheet" data-target="#returns-table-wrap table"><span class="material-symbols-outlined">content_copy</span> Copy for Sheets</button>',
      })}
      <div class="atoms-row">
        <div class="atoms-card" style="max-width:640px">
          <div class="atoms-pos-section-title">
            <span class="material-symbols-outlined" style="color:var(--atoms-primary);">keyboard_return</span>
            <span>Process Return / Exchange</span>
          </div>
          <form class="atoms-form" id="return-form">
            ${field('Returned Device IMEI', scanInput('r-imei', 'Scan barcode or enter 15-digit IMEI', 'autofocus'))}
            <div id="r-info" class="atoms-pos-device-preview atoms-muted">Scan a sold device IMEI to verify original purchase invoice and warranty validity.</div>
            ${field('Matched Invoice Reference', '<input id="r-invoice" readonly placeholder="Auto-detected from IMEI">')}
            <input type="hidden" id="r-sale-id">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              ${field('Return Condition', '<select id="r-type"><option value="good">Good Condition (Resellable)</option><option value="faulty">Faulty (Hardware Defect)</option><option value="warranty">Warranty Claim</option><option value="exchange">Customer Model Exchange</option></select>')}
              ${field('Resolution Action', '<select id="r-res"><option value="refund">Cash / Transfer Refund</option><option value="replacement">Device Replacement</option><option value="repair">Send to Repair Desk</option><option value="store_credit">Issue Store Credit</option></select>')}
            </div>
            ${field('Replacement Device IMEI (If replacement)', '<input id="r-repl" placeholder="Scan or enter replacement unit IMEI">')}
            ${field('Return Reason & Technical Diagnosis', '<textarea id="r-reason" rows="2" placeholder="Describe customer stated issue or diagnostic test results..."></textarea>')}
            <div class="atoms-actions">
              <button class="atoms-btn primary" type="submit">
                <span class="material-symbols-outlined">check_circle</span> Process & Post Return
              </button>
            </div>
          </form>
        </div>
        <div class="atoms-table-card" id="returns-table-wrap">
          <div class="atoms-table-toolbar">
            <div style="font-size:14px; font-weight:700; display:flex; align-items:center; gap:8px;">
              <span class="material-symbols-outlined" style="color:var(--atoms-primary);">history</span>
              <span>Recent Return Transactions</span>
            </div>
          </div>
          <div class="atoms-table-wrap">
            <table class="atoms-table"><thead><tr><th>Date</th><th>Invoice</th><th>Device</th><th>Resolution</th></tr></thead><tbody>
              ${returnPage.items.map((r) => `<tr>
                <td>${escapeHtml(r.posted_at || '')}</td>
                <td><button type="button" class="atoms-link js-return-open" data-id="${r.id}"><span class="atoms-table-mono">${escapeHtml(r.invoice_number || ('Return #' + r.id))}</span></button></td>
                <td><span class="atoms-imei-pill">${escapeHtml(r.imei || '')}</span>${r.variant_label ? `<br><small style="color:#64748b;">${escapeHtml(r.product_name || '')} · ${escapeHtml(r.variant_label)}</small>` : (r.product_name ? `<br><small style="color:#64748b;">${escapeHtml(r.product_name)}</small>` : '')}</td>
                <td>${badge(r.return_type)} · ${badge(r.resolution)}</td>
              </tr>`).join('') || '<tr><td colspan="4" class="atoms-empty">No device returns recorded.</td></tr>'}
            </tbody></table>
          </div>
          ${pagerBar(returnPage)}
        </div>
      </div>`;
  }

  async function screenReturnDesk(id) {
    const r = await api(`returns/${id}`);
    const items = r.items || [];
    const replacement = r.replacement || null;
    return `
      ${pageShell({
        group: 'Daily operations',
        trail: 'Return #' + r.id,
        title: 'Return · ' + (r.invoice_number || ('#' + r.id)),
        subtitle: `${escapeHtml(r.customer?.name || 'Walk-in customer')}${r.customer?.phone ? ' · ' + escapeHtml(r.customer.phone) : ''} · ${badge(r.return_type)} · ${badge(r.resolution)}`,
        actions: `<a class="atoms-back-btn" href="#/returns"><span class="material-symbols-outlined">arrow_back</span><span>Back to returns</span></a>${r.invoice_number ? ` <button type="button" class="atoms-btn ghost sm js-invoice" data-inv="${escapeHtml(r.invoice_number)}"><span class="material-symbols-outlined">print</span> Print receipt</button>` : ''}`,
      })}
      <div class="atoms-row">
        <div class="atoms-table-card">
          <div class="atoms-table-toolbar">
            <div style="font-size:14px; font-weight:700;">Returned Device Item(s)</div>
          </div>
          <div class="atoms-table-wrap">
            <table class="atoms-table"><thead><tr><th>Device IMEI</th><th>Product Model</th><th>Refunded Amount</th></tr></thead><tbody>
              ${items.map((it) => `<tr>
                <td><button type="button" class="atoms-link js-open-imei" data-imei="${escapeHtml(it.imei || '')}"><span class="atoms-imei-pill">${escapeHtml(it.imei || '—')}</span></button></td>
                <td><strong>${escapeHtml(it.product_name || '')}</strong>${it.variant_label ? `<br><small style="color:#64748b;">${escapeHtml(it.variant_label)}</small>` : ''}</td>
                <td class="atoms-table-mono">${money(it.refund_amount)}</td>
              </tr>`).join('') || '<tr><td colspan="3" class="atoms-empty">No line items.</td></tr>'}
            </tbody></table>
          </div>
          ${Number(r.refund_amount || 0) > 0 ? `<div style="padding:12px 16px; background:#f8fafc; font-weight:700; border-top:1px solid var(--atoms-line);">Total Refund: ${money(r.refund_amount)}</div>` : ''}
        </div>
        ${replacement ? `<div class="atoms-card">
          <div class="atoms-pos-section-title"><span class="material-symbols-outlined" style="color:var(--atoms-accent);">devices</span><span>Replacement Device Issued</span></div>
          <p><button type="button" class="atoms-link js-open-imei" data-imei="${escapeHtml(replacement.imei || '')}"><span class="atoms-imei-pill">${escapeHtml(replacement.imei || '—')}</span></button></p>
          <p><strong>${escapeHtml(replacement.product?.name || '')}</strong>${replacement.variant_label ? ` · ${escapeHtml(replacement.variant_label)}` : ''}</p>
        </div>` : ''}
        ${r.reason ? `<div class="atoms-card"><div class="atoms-pos-section-title"><span class="material-symbols-outlined" style="color:var(--atoms-info);">notes</span><span>Diagnostic Notes</span></div><p>${escapeHtml(r.reason)}</p></div>` : ''}
      </div>`;
  }

  async function screenSwaps() {
    if (state.swapId) {
      return screenSwapDesk(state.swapId);
    }
    const products = await api('products');
    state._swapProducts = products;
    const list = await api(`swaps?branch_id=${state.branchId || ''}`);
    const swapPage = paginateList(list, 'swaps');
    const method = localStorage.getItem('atoms_pay_method') || 'cash';
    const payLabels = { cash: 'Cash', transfer: 'Transfer', pos: 'POS' };
    const methods = ['cash', 'transfer', 'pos']
      .map((m) => `<option value="${m}"${m === method ? ' selected' : ''}>${payLabels[m]}</option>`)
      .join('');
    return `
      ${pageShell({
        group: 'Daily operations',
        trail: 'Trade-ins',
        title: 'Swap / trade-in',
        subtitle: 'Customer phone in, shop phone out. The price difference posts to the ledger — nothing is edited after posting.',
        actions: '<a class="atoms-back-btn" href="#/dashboard"><span class="material-symbols-outlined">arrow_back</span><span>Back to overview</span></a>',
      })}
      <div class="atoms-row">
        <div class="atoms-card">
          <form class="atoms-form" id="swap-form">
            ${field('Customer phone or name', '<input id="sw-customer-q" placeholder="Search — pick from the list or enter a new phone">')}
            <div id="sw-customer-results"></div>
            <input type="hidden" id="sw-customer-id">
            ${field('Name (if they are new)', '<input id="sw-customer-name" placeholder="Only needed for a new customer">')}
            ${field('Incoming IMEI', scanInput('sw-in-imei', 'Scan the customer’s phone'))}
            ${field('Incoming model', `<select id="sw-in-product">${products.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select>`)}
            ${field('Incoming colour / storage', variantSelectHtml('sw-in-variant', products, products[0]?.id || ''))}
            ${field('Incoming value (₦)', '<input id="sw-in-value" type="number" step="0.01" required>')}
            ${field('Outgoing IMEI (from stock)', scanInput('sw-out-imei', 'Scan the shop phone'))}
            <div id="sw-out-info" class="atoms-muted">Scan a device in stock to fill the price.</div>
            ${field('Outgoing price (₦)', '<input id="sw-out-price" type="number" step="0.01" required>')}
            ${field('Customer pays now (₦)', '<input id="sw-paid" type="number" step="0.01" value="0">')}
            ${field('How they paid', `<select id="sw-method">${methods}</select>`)}
            <div id="sw-diff" class="atoms-muted">Enter trade-in value and the new phone price.</div>
            <button class="atoms-btn primary" type="submit">Complete swap</button>
          </form>
        </div>
        <div class="atoms-card">
          <h3>Recent swaps</h3>
          <table class="atoms-table"><thead><tr><th>Ticket</th><th>Customer</th><th>Trade-in</th><th>Shop phone</th><th>Difference</th></tr></thead><tbody>
            ${swapPage.items.map((s) => `<tr>
              <td><button type="button" class="atoms-link js-swap-open" data-id="${s.id}">${escapeHtml(s.invoice_number || '')}</button></td>
              <td>${escapeHtml(s.customer_name || '—')}</td>
              <td>${escapeHtml(s.incoming_imei || '')}${s.incoming_variant_label ? `<br><span class="atoms-muted">${escapeHtml(s.incoming_product_name || '')} · ${escapeHtml(s.incoming_variant_label)}</span>` : (s.incoming_product_name ? `<br><span class="atoms-muted">${escapeHtml(s.incoming_product_name)}</span>` : '')}</td>
              <td>${escapeHtml(s.outgoing_imei || '')}${s.outgoing_variant_label ? `<br><span class="atoms-muted">${escapeHtml(s.outgoing_product_name || '')} · ${escapeHtml(s.outgoing_variant_label)}</span>` : (s.outgoing_product_name ? `<br><span class="atoms-muted">${escapeHtml(s.outgoing_product_name)}</span>` : '')}</td>
              <td>${escapeHtml(s.summary || money(s.difference))}</td>
            </tr>`).join('') || '<tr><td colspan="5">No swaps yet.</td></tr>'}
          </tbody></table>
          ${pagerBar(swapPage)}
        </div>
      </div>`;
  }

  async function screenSwapDesk(id) {
    const s = await api(`swaps/${id}`);
    const incoming = s.incoming || {};
    const outgoing = s.outgoing || {};
    return `
      ${pageShell({
        group: 'Daily operations',
        trail: s.invoice_number || ('Swap #' + s.id),
        title: s.invoice_number || ('Swap #' + s.id),
        subtitle: `${escapeHtml(s.customer_name || 'Walk-in')} · ${escapeHtml(s.summary || money(s.difference))}`,
        actions: '<a class="atoms-back-btn" href="#/swaps"><span class="material-symbols-outlined">arrow_back</span><span>Back to swaps</span></a>',
      })}
      <div class="atoms-row">
        <div class="atoms-card">
          <h3>Trade-in from customer</h3>
          <p><button type="button" class="atoms-link js-open-imei" data-imei="${escapeHtml(incoming.imei || '')}">${escapeHtml(incoming.imei || '—')}</button></p>
          <p>${escapeHtml(incoming.product?.name || '')}${incoming.variant_label ? ` · ${escapeHtml(incoming.variant_label)}` : ''}</p>
          <p class="atoms-muted">Value ${money(s.incoming_value)}</p>
        </div>
        <div class="atoms-card">
          <h3>Shop phone out</h3>
          <p><button type="button" class="atoms-link js-open-imei" data-imei="${escapeHtml(outgoing.imei || '')}">${escapeHtml(outgoing.imei || '—')}</button></p>
          <p>${escapeHtml(outgoing.product?.name || '')}${outgoing.variant_label ? ` · ${escapeHtml(outgoing.variant_label)}` : ''}</p>
          <p class="atoms-muted">Sold at ${money(s.outgoing_price)} · Paid ${money(s.paid_amount)}</p>
        </div>
      </div>`;
  }

  async function screenRepairs() {
    if (state.repairId) {
      return screenRepairDesk(state.repairId);
    }
    const products = await api('products');
    const list = await api('repairs');
    const repairPage = paginateList(list, 'repairs');
    const me = Number(state.bootstrap.user?.id || 0);
    const engineers = state.bootstrap.staff?.engineers?.length
      ? state.bootstrap.staff.engineers
      : [{ id: me, name: state.bootstrap.user?.name || 'Me' }];
    const engineerOpts = engineers.map((e) => `<option value="${e.id}"${Number(e.id) === me ? ' selected' : ''}>${escapeHtml(e.name)}</option>`).join('');
    return `
      ${pageShell({
        group: 'Daily operations',
        trail: 'Repairs',
        title: 'Repairs',
        subtitle: 'Receive devices, assign engineers, and track progress through to completion or return.',
        actions: '<a class="atoms-back-btn" href="#/dashboard"><span class="material-symbols-outlined">arrow_back</span><span>Back to overview</span></a>',
      })}
      <div class="atoms-row">
        <div class="atoms-card">
          <form class="atoms-form" id="repair-form">
            ${field('IMEI', scanInput('rp-imei', 'Scan device'))}
            ${field('Model (if new IMEI)', `<select id="rp-product">${products.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select>`)}
            ${field('Customer phone or name', '<input id="rp-customer-q" placeholder="Optional — search or leave blank">')}
            <div id="rp-customer-results"></div>
            <input type="hidden" id="rp-customer-id">
            ${field('Name (if they are new)', '<input id="rp-customer-name" placeholder="Only if they are not in the list">')}
            ${field('Fault', '<textarea id="rp-fault" rows="3" required></textarea>')}
            ${field('Engineer', `<select id="rp-engineer">${engineerOpts}</select>`)}
            ${field('Charge (₦)', '<input id="rp-charge" type="number" step="0.01" value="0">')}
            <button class="atoms-btn primary" type="submit">Receive device</button>
          </form>
        </div>
        <div class="atoms-card">
          <table class="atoms-table"><thead><tr><th>Ticket</th><th>Device</th><th>Engineer</th><th>Status</th><th></th></tr></thead><tbody>
            ${repairPage.items.map((r) => `<tr>
              <td><button type="button" class="atoms-link js-repair-open" data-id="${r.id}">${escapeHtml(r.ticket_number)}</button><br><span class="atoms-muted">${escapeHtml(r.imei || '')}</span></td>
              <td>${escapeHtml(r.product_name || '—')}${r.variant_label ? `<br><span class="atoms-muted">${escapeHtml(r.variant_label)}</span>` : ''}</td>
              <td>${escapeHtml(r.engineer_name || '—')}</td>
              <td>${badge(r.status)}</td>
              <td>
                <button class="atoms-btn ghost js-rp-adv" data-id="${r.id}" data-s="diagnosing">Diagnose</button>
                <button class="atoms-btn ghost js-rp-adv" data-id="${r.id}" data-s="repairing">Repair</button>
                <button class="atoms-btn accent js-rp-res" data-id="${r.id}" data-o="customer">Return to customer</button>
                <button class="atoms-btn ghost js-rp-res" data-id="${r.id}" data-o="stock">Back to stock</button>
                <button class="atoms-btn danger js-rp-res" data-id="${r.id}" data-o="unfixable">Unfixable</button>
              </td>
            </tr>`).join('') || '<tr><td colspan="4">No open repairs.</td></tr>'}
          </tbody></table>
          ${pagerBar(repairPage)}
        </div>
      </div>`;
  }

  async function screenRepairDesk(id) {
    const r = await api(`repairs/${id}`);
    const device = r.imei || {};
    return `
      ${pageShell({
        group: 'Daily operations',
        trail: r.ticket_number || ('Repair #' + r.id),
        title: r.ticket_number || ('Repair #' + r.id),
        subtitle: `${escapeHtml(r.customer?.name || 'Walk-in customer')}${r.customer?.phone ? ' · ' + escapeHtml(r.customer.phone) : ''} · ${badge(r.status)} · Engineer ${escapeHtml(r.engineer_name || '—')}`,
        actions: '<a class="atoms-back-btn" href="#/repairs"><span class="material-symbols-outlined">arrow_back</span><span>Back to repairs</span></a>',
      })}
      <div class="atoms-row">
        <div class="atoms-card">
          <h3>Device</h3>
          <p><button type="button" class="atoms-link js-open-imei" data-imei="${escapeHtml(device.imei || '')}">${escapeHtml(device.imei || '—')}</button></p>
          <p>${escapeHtml(r.product_name || device.product?.name || '')}${r.variant_label ? ` · ${escapeHtml(r.variant_label)}` : (device.variant_label ? ` · ${escapeHtml(device.variant_label)}` : '')}</p>
          <p class="atoms-muted">${escapeHtml(labelStatus(device.status || ''))} · Charge ${money(r.charge_amount)}</p>
        </div>
        <div class="atoms-card">
          <h3>Fault & diagnosis</h3>
          <p>${escapeHtml(r.fault_description || '—')}</p>
          ${r.diagnosis ? `<p class="atoms-muted" style="margin-top:12px">Diagnosis: ${escapeHtml(r.diagnosis)}</p>` : ''}
          ${r.resolution ? `<p class="atoms-muted">Outcome: ${escapeHtml(r.resolution)}</p>` : ''}
        </div>
        <div class="atoms-card">
          <h3>Actions</h3>
          <div class="atoms-actions">
            <button class="atoms-btn ghost js-rp-adv" data-id="${r.id}" data-s="diagnosing">Diagnose</button>
            <button class="atoms-btn ghost js-rp-adv" data-id="${r.id}" data-s="repairing">Repair</button>
            <button class="atoms-btn accent js-rp-res" data-id="${r.id}" data-o="customer">Return to customer</button>
            <button class="atoms-btn ghost js-rp-res" data-id="${r.id}" data-o="stock">Back to stock</button>
            <button class="atoms-btn danger js-rp-res" data-id="${r.id}" data-o="unfixable">Unfixable</button>
          </div>
        </div>
      </div>`;
  }

  async function screenExpenses() {
    if (state.expenseId) {
      return screenExpenseDesk(state.expenseId);
    }
    const list = await api('expenses');
    const expensePage = paginateList(list, 'expenses');
    return `
      ${pageShell({
        group: 'Finance & accounts',
        trail: 'Expenses',
        title: 'Expenses',
        subtitle: 'Submit branch expenses. Amounts above the threshold wait for manager approval before posting.',
        actions: '<a class="atoms-back-btn" href="#/dashboard"><span class="material-symbols-outlined">arrow_back</span><span>Back to overview</span></a>',
      })}
      <div class="atoms-row">
        <div class="atoms-card">
          <form class="atoms-form" id="expense-form">
            ${field('Category', '<select id="ex-cat"><option>rent</option><option>fuel</option><option>salary</option><option>transport</option><option>utility</option><option>repairs</option><option>other</option></select>')}
            ${field('Amount (₦)', '<input id="ex-amt" type="number" step="0.01" required>')}
            ${field('Vendor', '<input id="ex-vendor">')}
            ${field('Description', '<textarea id="ex-desc" rows="3" required></textarea>')}
            <button class="atoms-btn primary" type="submit">Submit expense</button>
          </form>
        </div>
        <div class="atoms-card">
          <table class="atoms-table"><thead><tr><th>When</th><th>Category</th><th>Vendor</th><th>Description</th><th>Branch</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>
            ${expensePage.items.map((e) => `<tr>
              <td>${escapeHtml(e.posted_at || e.created_at || '')}</td>
              <td>${escapeHtml(e.category)}</td>
              <td>${escapeHtml(e.vendor || '—')}</td>
              <td>${escapeHtml(e.description || '')}</td>
              <td>${escapeHtml(e.branch_name || '—')}</td>
              <td>${money(e.amount)}</td>
              <td>${badge(e.status)}</td>
              <td><button type="button" class="atoms-link js-exp-open" data-id="${e.id}">Open</button></td>
            </tr>`).join('') || '<tr><td colspan="8">None</td></tr>'}
          </tbody></table>
          ${pagerBar(expensePage)}
        </div>
      </div>`;
  }

  async function screenExpenseDesk(id) {
    const e = await api(`expenses/${id}`);
    return `
      ${pageShell({
        group: 'Finance & accounts',
        trail: 'Expense #' + e.id,
        title: 'Expense #' + e.id,
        subtitle: `${escapeHtml(e.category || '')} · ${money(e.amount)} · ${badge(e.status)} · ${escapeHtml(e.branch_name || '')}`,
        actions: `<a class="atoms-back-btn" href="#/expenses"><span class="material-symbols-outlined">arrow_back</span><span>Back to expenses</span></a>${e.approval_id && e.status === 'pending_approval' ? ` <button type="button" class="atoms-btn accent js-exp-approval" data-id="${e.approval_id}">Open approval</button>` : ''}`,
      })}
      <div class="atoms-row">
        <div class="atoms-card">
          <h3>Details</h3>
          <p><strong>Vendor:</strong> ${escapeHtml(e.vendor || '—')}</p>
          <p><strong>Description:</strong> ${escapeHtml(e.description || '—')}</p>
          <p><strong>Submitted:</strong> ${escapeHtml(e.created_at || '')}</p>
          ${e.posted_at ? `<p><strong>Posted:</strong> ${escapeHtml(e.posted_at)}${e.poster_name ? ` · ${escapeHtml(e.poster_name)}` : ''}</p>` : ''}
        </div>
      </div>`;
  }

  async function screenSuppliers() {
    if (state.supplierId) {
      return screenSupplierDesk(state.supplierId);
    }
    const list = await api('suppliers');
    const supplierPage = paginateList(list, 'suppliers');
    let archived = [];
    if (can('atoms_manage_suppliers')) {
      try { archived = await api('suppliers/archived'); } catch (e) { archived = []; }
    }
    return `
      ${pageShell({
        group: 'Stock & purchasing',
        trail: 'Suppliers',
        title: 'Suppliers',
        subtitle: 'Vendor accounts, what we owe, payments, and device returns to suppliers.',
        actions: '<a class="atoms-back-btn" href="#/dashboard"><span class="material-symbols-outlined">arrow_back</span><span>Back to overview</span></a>',
      })}
      <div class="atoms-row">
        <div class="atoms-card">
          <form class="atoms-form" id="sup-form">
            ${field('Name', '<input id="s-name" required>')}
            ${field('Contact person', '<input id="s-contact">')}
            ${field('Phone', '<input id="s-phone">')}
            ${field('Address', '<textarea id="s-address" rows="2" placeholder="Yard / warehouse"></textarea>')}
            <button class="atoms-btn primary" type="submit">Save supplier</button>
          </form>
          <form class="atoms-form" id="sup-pay-form" style="margin-top:20px">
            <h3>Pay supplier</h3>
            ${field('Supplier', `<select id="sp-id">${list.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}</select>`)}
            ${field('Amount (₦)', '<input id="sp-amt" type="number" step="0.01" required>')}
            ${field('Method', '<select id="sp-method"><option>transfer</option><option>cash</option><option>pos</option></select>')}
            <button class="atoms-btn accent" type="submit">Post payment</button>
          </form>
          <form class="atoms-form" id="sup-return-form" style="margin-top:20px">
            <h3>Return device to supplier</h3>
            ${field('Supplier', `<select id="sr-id">${list.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}</select>`)}
            ${field('IMEI', scanInput('sr-imei', '15-digit IMEI'))}
            <button class="atoms-btn ghost" type="submit">Return to supplier</button>
          </form>
        </div>
        <div class="atoms-card">
          <table class="atoms-table"><thead><tr><th>Supplier</th><th>Phone</th><th>Address</th><th>We owe</th></tr></thead><tbody>
            ${supplierPage.items.map((s) => `<tr>
              <td><button type="button" class="atoms-link js-sup-open" data-id="${s.id}">${escapeHtml(s.name)}</button></td>
              <td>${escapeHtml(s.phone || '')}</td>
              <td>${escapeHtml(s.address || '—')}</td>
              <td>${money(s.balance)}</td>
            </tr>`).join('') || '<tr><td colspan="4">No suppliers yet.</td></tr>'}
          </tbody></table>
          ${pagerBar(supplierPage)}
        </div>
      </div>
      ${archived.length ? `<div class="atoms-card" style="margin-top:16px">
        <h3>Archived suppliers</h3>
        ${archived.map((s) => `<div class="atoms-queue-row" style="justify-content:space-between;gap:12px">
          <div>${escapeHtml(s.name)}</div>
          <button type="button" class="atoms-btn accent js-sup-restore" data-id="${s.id}">Restore</button>
        </div>`).join('')}
      </div>` : ''}`;
  }

  async function screenSupplierDesk(id) {
    const s = await api(`suppliers/${id}`);
    const supLedgerPage = paginateList(s.ledger || [], 'supplier-ledger');
    const supPayPage = paginateList(s.payments || [], 'supplier-payments');
    const supReturnPage = paginateList(s.returns || [], 'supplier-returns');
    return `
      ${pageShell({
        group: 'Stock & purchasing',
        trail: s.name,
        title: s.name,
        subtitle: `${escapeHtml(s.contact_person || '')} ${escapeHtml(s.phone || '')} · ${escapeHtml(s.address || '')} · Balance ${money(s.balance)}`,
        actions: `<a class="atoms-back-btn" href="#/suppliers"><span class="material-symbols-outlined">arrow_back</span><span>Back to suppliers</span></a>${can('atoms_manage_suppliers') && !s.balance ? ` <button type="button" class="atoms-btn danger js-sup-archive" data-id="${s.id}">Archive supplier</button>` : ''}`,
      })}
      <div class="atoms-row">
        <div class="atoms-card">
          ${can('atoms_manage_suppliers') ? `<form class="atoms-form" id="sup-edit-form" style="margin-bottom:20px">
            <h3>Edit supplier</h3>
            <input type="hidden" id="se-id" value="${s.id}">
            ${field('Name', `<input id="se-name" value="${escapeHtml(s.name || '')}" required>`)}
            ${field('Contact person', `<input id="se-contact" value="${escapeHtml(s.contact_person || '')}">`)}
            ${field('Phone', `<input id="se-phone" value="${escapeHtml(s.phone || '')}">`)}
            ${field('Address', `<textarea id="se-address" rows="2">${escapeHtml(s.address || '')}</textarea>`)}
            <button class="atoms-btn primary" type="submit">Update supplier</button>
          </form>` : ''}
          <form class="atoms-form" id="sup-pay-form">
            <h3>Pay supplier</h3>
            <input type="hidden" id="sp-id" value="${s.id}">
            ${field('Amount (₦)', '<input id="sp-amt" type="number" step="0.01" required>')}
            ${field('Method', '<select id="sp-method"><option>transfer</option><option>cash</option><option>pos</option></select>')}
            <button class="atoms-btn accent" type="submit">Post payment</button>
          </form>
          <form class="atoms-form" id="sup-return-form" style="margin-top:20px">
            <h3>Return device to supplier</h3>
            <input type="hidden" id="sr-id" value="${s.id}">
            ${field('IMEI', scanInput('sr-imei', '15-digit IMEI'))}
            <button class="atoms-btn ghost" type="submit">Return to supplier</button>
          </form>
        </div>
        <div class="atoms-card">
          <h3>Ledger</h3>
          <table class="atoms-table"><thead><tr><th>When</th><th>Event</th><th>Context</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>
            ${supLedgerPage.items.map((e) => `<tr>
              <td>${escapeHtml(e.posted_at || '')}</td>
              <td>${escapeHtml(e.description || e.reference_type || '')}</td>
              <td>${e.context?.invoice_number ? `<button type="button" class="atoms-link js-sup-purchase" data-id="${e.reference_id}">${escapeHtml(e.context.invoice_number)}</button>` : ''}${e.context?.variant_summary ? `<br><span class="atoms-muted">${escapeHtml(e.context.variant_summary)}</span>` : ''}${e.context?.imei ? `<button type="button" class="atoms-link js-open-imei" data-imei="${escapeHtml(e.context.imei)}">${escapeHtml(e.context.imei)}</button>${e.context.variant_summary ? `<br><span class="atoms-muted">${escapeHtml(e.context.variant_summary)}</span>` : ''}` : ''}${!e.context ? '—' : ''}</td>
              <td>${e.entry_type === 'debit' ? money(e.amount) : ''}</td>
              <td>${e.entry_type === 'credit' ? money(e.amount) : ''}</td>
              <td>${money(e.balance_after)}</td>
            </tr>`).join('') || '<tr><td colspan="6">No ledger events.</td></tr>'}
          </tbody></table>
          ${pagerBar(supLedgerPage)}
          ${(s.open_purchases || []).length ? `<h3 style="margin-top:20px">Open purchase orders</h3>
          <table class="atoms-table"><thead><tr><th>PO invoice</th><th>Variants</th><th>Amount</th><th>Age</th><th></th></tr></thead><tbody>
            ${s.open_purchases.map((p) => `<tr>
              <td>${escapeHtml(p.invoice_number || '')}</td>
              <td>${escapeHtml(p.variant_summary || '—')}</td>
              <td>${money(p.amount)}</td>
              <td>${p.days}d</td>
              <td><button type="button" class="atoms-link js-sup-purchase" data-id="${p.purchase_id}">Open PO</button></td>
            </tr>`).join('')}
          </tbody></table>` : ''}
          <h3 style="margin-top:20px">Payments</h3>
          <table class="atoms-table"><thead><tr><th>When</th><th>Amount</th><th>Method</th><th>PO invoice</th></tr></thead><tbody>
            ${supPayPage.items.map((p) => `<tr>
              <td>${escapeHtml(p.posted_at || '')}</td>
              <td>${money(p.amount)}</td>
              <td>${escapeHtml(p.method || '')}</td>
              <td>${p.purchase_invoice ? `<button type="button" class="atoms-link js-sup-purchase" data-id="${p.purchase_id}">${escapeHtml(p.purchase_invoice)}</button>` : '—'}</td>
            </tr>`).join('') || '<tr><td colspan="4">No payments posted yet.</td></tr>'}
          </tbody></table>
          ${pagerBar(supPayPage)}
          <h3 style="margin-top:20px">Devices returned</h3>
          <table class="atoms-table"><thead><tr><th>When</th><th>IMEI</th><th>Product</th><th>Variant</th><th>Credited</th></tr></thead><tbody>
            ${supReturnPage.items.map((r) => `<tr>
              <td>${escapeHtml(r.posted_at || '')}</td>
              <td><button type="button" class="atoms-link js-open-imei" data-imei="${escapeHtml(r.imei || '')}">${escapeHtml(r.imei || '—')}</button></td>
              <td>${escapeHtml(r.product_name || '')}</td>
              <td>${escapeHtml(r.variant_label || '—')}</td>
              <td>${money(r.amount)}</td>
            </tr>`).join('') || '<tr><td colspan="5">No devices returned yet.</td></tr>'}
          </tbody></table>
          ${pagerBar(supReturnPage)}
        </div>
      </div>`;
  }

  async function screenCustomers() {
    if (state.customerId) {
      return screenCustomerStatement(state.customerId);
    }
    const listRaw = await api('customers?q=');
    const list = Array.isArray(listRaw) ? listRaw : [];
    let archived = [];
    if (can('atoms_manage_customers')) {
      try {
        const archivedRaw = await api('customers/archived');
        archived = Array.isArray(archivedRaw) ? archivedRaw : [];
      } catch (e) { archived = []; }
    }
    const custPage = paginateList(list, 'customers');
    return `
      ${pageShell({
        group: 'Finance & accounts',
        trail: 'Customers',
        title: 'Customer accounts & debts',
        subtitle: 'Ledger statements, payment history, credit aging, and WhatsApp reminders.',
        actions: '<a class="atoms-back-btn" href="#/dashboard"><span class="material-symbols-outlined">arrow_back</span><span>Back to overview</span></a><button type="button" class="atoms-btn ghost sm js-copy-sheet" data-target="#cust-table-wrap table"><span class="material-symbols-outlined">content_copy</span> Copy for Sheets</button>',
      })}
      <div class="atoms-row">
        <div class="atoms-card">
          <div class="atoms-pos-section-title">
            <span class="material-symbols-outlined" style="color:var(--atoms-primary);">person_add</span>
            <span>Register New Customer</span>
          </div>
          <form class="atoms-form" id="cust-form">
            ${field('Customer Full Name', '<input id="c-name" required placeholder="e.g. Ibrahim Abubakar">')}
            ${field('Phone Number (WhatsApp)', '<input id="c-phone" required placeholder="e.g. 08012345678">')}
            ${field('Delivery / Shop Address', '<textarea id="c-address" rows="2" placeholder="Street address, city" data-places="address"></textarea>')}
            <div class="atoms-actions">
              <button class="atoms-btn primary" type="submit">
                <span class="material-symbols-outlined">save</span> Save Customer
              </button>
            </div>
          </form>
        </div>
        <div class="atoms-table-card" id="cust-table-wrap">
          <div class="atoms-table-toolbar">
            <div style="font-size:14px; font-weight:700; display:flex; align-items:center; gap:8px;">
              <span class="material-symbols-outlined" style="color:var(--atoms-primary);">group</span>
              <span>Customer Directory</span>
            </div>
          </div>
          <div class="atoms-table-wrap">
            <table class="atoms-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact Phone</th>
                  <th style="text-align:right;">Outstanding Balance</th>
                </tr>
              </thead>
              <tbody>
                ${custPage.items.map((c) => {
                  const initial = (c.name || 'C').charAt(0).toUpperCase();
                  const isDebt = Number(c.balance || 0) > 0;
                  return `<tr>
                    <td>
                      <div style="display:flex; align-items:center; gap:8px;">
                        <div class="atoms-avatar">${initial}</div>
                        <button type="button" class="atoms-link js-cust-open" data-id="${c.id}">${escapeHtml(c.name)}</button>
                      </div>
                    </td>
                    <td>${escapeHtml(c.phone)}</td>
                    <td style="text-align:right;" class="atoms-table-mono ${isDebt ? 'atoms-badge bad' : ''}">${money(c.balance)}</td>
                  </tr>`;
                }).join('') || '<tr><td colspan="3" class="atoms-empty">No customers registered yet.</td></tr>'}
              </tbody>
            </table>
          </div>
          ${pagerBar(custPage)}
        </div>
      </div>
      ${archived.length ? `<div class="atoms-card" style="margin-top:18px">
        <h3>Archived Customer Accounts</h3>
        ${archived.map((c) => `<div class="atoms-queue-row" style="justify-content:space-between;gap:12px">
          <div>${escapeHtml(c.name)} · ${escapeHtml(c.phone || '')}</div>
          <button type="button" class="atoms-btn accent sm js-cust-restore" data-id="${c.id}"><span class="material-symbols-outlined">restore</span> Restore</button>
        </div>`).join('')}
      </div>` : ''}`;
  }

  async function screenCustomerStatement(id) {
    const c = await api(`customers/${id}`);
    let invoicePanel = '';
    if (state.customerInvoice) {
      try {
        const sale = await api(`sales/invoice/${encodeURIComponent(state.customerInvoice)}`);
        invoicePanel = `
          <div class="atoms-card" style="margin-bottom:16px;border:2px solid var(--atoms-accent,#A9B94A)">
            <div class="atoms-actions" style="justify-content:space-between;margin-bottom:12px">
              <h3 style="margin:0">${escapeHtml(sale.invoice_number)} · ${badge(sale.status)}</h3>
              <div class="atoms-actions">
                <button type="button" class="atoms-btn ghost js-invoice" data-inv="${escapeHtml(sale.invoice_number)}">Print</button>
                <button type="button" class="atoms-btn ghost" id="js-cust-inv-close">Close</button>
              </div>
            </div>
            <p class="atoms-sub">${escapeHtml(sale.posted_at || '')} · ${escapeHtml(saleTypeLabel(sale.sale_type))} · Total ${money(sale.total)} · Due ${money(sale.due_amount)}</p>
            <table class="atoms-table"><thead><tr><th>IMEI</th><th>Product</th><th>Variant</th><th>Price</th></tr></thead><tbody>
              ${(sale.items || []).map((it) => `<tr>
                <td><button type="button" class="atoms-link js-open-imei" data-imei="${escapeHtml(it.imei || '')}">${escapeHtml(it.imei || '—')}</button></td>
                <td>${escapeHtml(it.product_name || '')}</td>
                <td>${escapeHtml(it.variant_label || '—')}</td>
                <td>${money(it.selling_price)}</td>
              </tr>`).join('') || '<tr><td colspan="4">No devices on this invoice.</td></tr>'}
            </tbody></table>
          </div>`;
      } catch (_) {
        invoicePanel = `<div class="atoms-card" style="margin-bottom:16px"><p class="atoms-muted">Could not load ${escapeHtml(state.customerInvoice)}.</p></div>`;
      }
    }
    const canVoid = can('atoms_void');
    const canPay = can('atoms_create_payment');
    const custInvPage = paginateList(c.invoices || [], 'customer-invoices');
    const custPayPage = paginateList(c.payments || [], 'customer-payments');
    const custLedgerPage = paginateList(c.ledger || [], 'customer-ledger');
    return `
      ${pageShell({
        group: 'Finance & accounts',
        trail: c.name,
        title: c.name,
        subtitle: `${escapeHtml(c.phone || '')} · Balance ${money(c.balance)}`,
        actions: `<a class="atoms-back-btn" href="#/customers"><span class="material-symbols-outlined">arrow_back</span><span>Back to customers</span></a>${c.whatsapp_url ? ` <a class="atoms-btn accent" href="${escapeHtml(c.whatsapp_url)}" target="_blank" rel="noopener">WhatsApp reminder</a>` : ''} <button type="button" class="atoms-btn ghost" id="js-stmt-csv">CSV statement</button>${can('atoms_manage_customers') && !c.balance ? ` <button type="button" class="atoms-btn danger js-cust-archive" data-id="${c.id}">Archive customer</button>` : ''}`,
      })}
      ${invoicePanel}
      <div class="atoms-row">
        <div class="atoms-card">
          ${can('atoms_manage_customers') ? `<form class="atoms-form" id="cust-edit-form" style="margin-bottom:20px">
            <h3>Edit customer</h3>
            <input type="hidden" id="ce-id" value="${c.id}">
            ${field('Name', `<input id="ce-name" value="${escapeHtml(c.name || '')}" required>`)}
            ${field('Phone', `<input id="ce-phone" value="${escapeHtml(c.phone || '')}" required>`)}
            ${field('Address', `<textarea id="ce-address" rows="2">${escapeHtml(c.address || '')}</textarea>`)}
            <button class="atoms-btn primary" type="submit">Update customer</button>
          </form>` : ''}
          ${canPay ? `<form class="atoms-form" id="pay-form">
            <h3>Post payment</h3>
            <input type="hidden" id="pay-id" value="${c.id}">
            ${field('Amount (₦)', '<input id="pay-amt" type="number" step="0.01" required>')}
            ${field('Method', '<select id="pay-method"><option>cash</option><option>transfer</option><option>pos</option></select>')}
            <button class="atoms-btn accent" type="submit">Add payment</button>
          </form>` : ''}
          <h3 style="margin-top:20px">Invoices</h3>
          <table class="atoms-table"><thead><tr><th>Invoice</th><th>Total</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>
            ${custInvPage.items.map((inv) => `<tr>
              <td><button type="button" class="atoms-link js-cust-invoice" data-inv="${escapeHtml(inv.invoice_number)}">${escapeHtml(inv.invoice_number)}</button></td>
              <td>${money(inv.total)}</td>
              <td>${money(inv.due_amount)}</td>
              <td>${badge(inv.status)}</td>
              <td>${canVoid && inv.status === 'completed' ? `<button type="button" class="atoms-btn danger js-void" data-id="${inv.id}">Void</button>` : ''}</td>
            </tr>`).join('') || '<tr><td colspan="5">No invoices.</td></tr>'}
          </tbody></table>
          ${pagerBar(custInvPage)}
          <h3 style="margin-top:20px">Payments</h3>
          <table class="atoms-table"><thead><tr><th>When</th><th>Amount</th><th>Method</th><th>Invoice</th><th>Status</th></tr></thead><tbody>
            ${custPayPage.items.map((p) => `<tr>
              <td>${escapeHtml(p.posted_at || '')}</td>
              <td>${money(p.amount)}</td>
              <td>${escapeHtml(p.method || '')}</td>
              <td>${p.invoice_number ? `<button type="button" class="atoms-link js-cust-invoice" data-inv="${escapeHtml(p.invoice_number)}">${escapeHtml(p.invoice_number)}</button>` : '—'}</td>
              <td>${badge(p.status)}</td>
            </tr>`).join('') || '<tr><td colspan="5">No payments posted yet.</td></tr>'}
          </tbody></table>
          ${pagerBar(custPayPage)}
        </div>
        <div class="atoms-card">
          <h3>Ledger</h3>
          <table class="atoms-table"><thead><tr><th>When</th><th>Event</th><th>Context</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>
            ${custLedgerPage.items.map((e) => `<tr>
              <td>${escapeHtml(e.posted_at || '')}</td>
              <td>${escapeHtml(e.description || e.reference_type || '')}</td>
              <td>${e.context?.invoice_number ? `<button type="button" class="atoms-link js-cust-invoice" data-inv="${escapeHtml(e.context.invoice_number)}">${escapeHtml(e.context.invoice_number)}</button>` : '—'}${e.context?.device_summary ? `<br><span class="atoms-muted">${escapeHtml(e.context.device_summary)}</span>` : ''}</td>
              <td>${e.entry_type === 'debit' ? money(e.amount) : ''}</td>
              <td>${e.entry_type === 'credit' ? money(e.amount) : ''}</td>
              <td>${money(e.balance_after)}</td>
            </tr>`).join('') || '<tr><td colspan="6">No ledger events.</td></tr>'}
          </tbody></table>
          ${pagerBar(custLedgerPage)}
        </div>
      </div>`;
  }

  async function screenReports() {
    const r = state.report || { preset: 'today', from: '', to: '' };
    const params = new URLSearchParams({
      preset: r.preset || 'today',
      from: r.from || '',
      to: r.to || '',
      branch_id: state.branchId || '',
    });
    const pack = await api(`reports/pack?${params}`);
    state.report = {
      preset: pack.period?.preset || r.preset,
      from: pack.period?.from || r.from,
      to: pack.period?.to || r.to,
    };
    const sales = pack.sales || {};
    const saleDevices = pack.sales_devices || [];
    const cash = pack.cash || {};
    const inv = pack.inventory || {};
    const imei = (pack.imei && !Array.isArray(pack.imei)) ? pack.imei : {};
    const invoicePage = paginateList(sales.lines || [], 'report-invoices');
    const deviceSoldPage = paginateList(saleDevices, 'report-devices');
    const invProdPage = paginateList(inv.products || [], 'report-inv-products');
    const recvPage = paginateList(pack.receivables?.parties || [], 'report-receivables');
    const payPage = paginateList(pack.payables?.parties || [], 'report-payables');
    const openInvPage = paginateList(pack.receivable_invoices || [], 'report-open-invoices');
    const openPoPage = paginateList(pack.payable_purchases || [], 'report-open-pos');
    const openRepairPage = paginateList(pack.open_repairs || [], 'report-open-repairs');
    const faultyPage = paginateList(pack.faulty_devices || [], 'report-faulty');
    const recentSalesPage = paginateList(pack.recent_sales || [], 'report-recent-sales');
    const recentPayPage = paginateList(pack.recent_payments || [], 'report-recent-payments');
    const recentReturnPage = paginateList(pack.recent_returns || [], 'report-recent-returns');
    const pendingExpPage = paginateList(pack.pending_expenses || [], 'report-pending-expenses');
    const wholesaleRecvPage = paginateList(pack.wholesale_receivables || [], 'report-wholesale-recv');
    const retailRecvPage = paginateList(pack.retail_receivables || [], 'report-retail-recv');
    const presets = ['today', 'week', 'month', 'year'];
    const exports = [
      ['sales', 'Sales'],
      ['inventory', 'Inventory'],
      ['inventory_valuation', 'Inventory valuation'],
      ['imei', 'IMEI'],
      ['imei_status', 'IMEI status'],
      ['cash', 'Cash'],
      ['expenses', 'Expenses'],
      ['expense_snapshot', 'Expense snapshot'],
      ['intake_snapshot', 'Intake snapshot'],
      ['operations_snapshot', 'Operations snapshot'],
      ['receivables_snapshot', 'Receivables snapshot'],
      ['payables_snapshot', 'Payables snapshot'],
      ['adjustments_snapshot', 'Adjustments snapshot'],
      ['performance_snapshot', 'Performance snapshot'],
      ['staff_snapshot', 'Staff snapshot'],
      ['movement_snapshot', 'Movement snapshot'],
      ['ledger_snapshot', 'Ledger snapshot'],
      ['repair_snapshot', 'Repair snapshot'],
      ['compliance_snapshot', 'Compliance snapshot'],
      ['trade_snapshot', 'Trade snapshot'],
      ['aging_snapshot', 'Aging snapshot'],
      ['executive_snapshot', 'Executive snapshot'],
      ['branch_snapshot', 'Branch snapshot'],
      ['mix_snapshot', 'Mix snapshot'],
      ['product_snapshot', 'Product snapshot'],
      ['trend_snapshot', 'Trend snapshot'],
      ['cashflow_snapshot', 'Cashflow snapshot'],
      ['staff_device_snapshot', 'Staff device snapshot'],
      ['stock_snapshot', 'Stock snapshot'],
      ['imei_snapshot', 'IMEI snapshot'],
      ['transfer_snapshot', 'Transfer snapshot'],
      ['purchase_snapshot', 'Purchase snapshot'],
      ['returns_snapshot', 'Returns snapshot'],
      ['faulty_snapshot', 'Faulty snapshot'],
      ['customer_snapshot', 'Customer snapshot'],
      ['supplier_snapshot', 'Supplier snapshot'],
      ['count_snapshot', 'Count snapshot'],
      ['approval_snapshot', 'Approval snapshot'],
      ['audit_snapshot', 'Audit snapshot'],
      ['collection_snapshot', 'Collection snapshot'],
      ['alert_snapshot', 'Alert snapshot'],
      ['sales_snapshot', 'Sales snapshot'],
      ['payment_snapshot', 'Payment snapshot'],
      ['swap_snapshot', 'Swap snapshot'],
      ['return_snapshot', 'Return snapshot'],
      ['adjustment_snapshot', 'Adjustment snapshot'],
      ['procurement_snapshot', 'Procurement snapshot'],
      ['receiving_snapshot', 'Receiving snapshot'],
      ['payable_snapshot', 'Payable snapshot'],
      ['receivable_snapshot', 'Receivable snapshot'],
      ['workflow_snapshot', 'Workflow snapshot'],
      ['transit_snapshot', 'Transit snapshot'],
      ['stockflow_snapshot', 'Stockflow snapshot'],
      ['service_snapshot', 'Service snapshot'],
      ['countflow_snapshot', 'Countflow snapshot'],
      ['approvalflow_snapshot', 'Approvalflow snapshot'],
      ['auditflow_snapshot', 'Auditflow snapshot'],
      ['collectionflow_snapshot', 'Collectionflow snapshot'],
      ['alertflow_snapshot', 'Alertflow snapshot'],
      ['expenseflow_snapshot', 'Expenseflow snapshot'],
      ['performanceflow_snapshot', 'Performanceflow snapshot'],
      ['customerflow_snapshot', 'Customerflow snapshot'],
      ['intakeflow_snapshot', 'Intakeflow snapshot'],
      ['supplierflow_snapshot', 'Supplierflow snapshot'],
      ['inventoryflow_snapshot', 'Inventoryflow snapshot'],
      ['staffflow_snapshot', 'Staffflow snapshot'],
      ['branchflow_snapshot', 'Branchflow snapshot'],
      ['cashflowflow_snapshot', 'Cashflowflow snapshot'],
      ['mixflow_snapshot', 'Mixflow snapshot'],
      ['trendflow_snapshot', 'Trendflow snapshot'],
      ['productflow_snapshot', 'Productflow snapshot'],
      ['ledgerflow_snapshot', 'Ledgerflow snapshot'],
      ['executiveflow_snapshot', 'Executiveflow snapshot'],
      ['agingflow_snapshot', 'Agingflow snapshot'],
      ['tradeflow_snapshot', 'Tradeflow snapshot'],
      ['movement', 'Movement'],
      ['payables', 'Payables'],
      ['receivables', 'Receivables'],
      ['receivable_invoices', 'Receivable invoices'],
      ['receivable_aging', 'Receivable aging'],
      ['payable_purchases', 'Payable purchases'],
      ['payable_aging', 'Payable aging'],
      ['open_repairs', 'Open repairs'],
      ['faulty_devices', 'Faulty devices'],
      ['open_stock_counts', 'Open stock counts'],
      ['recent_returns', 'Recent returns'],
      ['today_returns', 'Today returns'],
      ['pending_expenses', 'Pending expenses'],
      ['pending_approvals', 'Pending approvals'],
      ['wholesale_receivables', 'Wholesale receivables'],
      ['retail_receivables', 'Retail receivables'],
      ['recent_swaps', 'Recent swaps'],
      ['today_swaps', 'Today swaps'],
      ['recent_sales', 'Recent sales'],
      ['today_sales', 'Today sales'],
      ['recent_payments', 'Recent payments'],
      ['today_payments', 'Today payments'],
      ['supplier_payments', 'Supplier payments'],
      ['today_supplier_payments', 'Today supplier payments'],
      ['recent_purchases', 'Recent purchases'],
      ['today_purchases', 'Today purchases'],
      ['supplier_returns', 'Supplier returns'],
      ['today_supplier_returns', 'Today supplier returns'],
      ['payment_reversals', 'Payment reversals'],
      ['today_reversals', 'Today reversals'],
      ['voided_sales', 'Voided sales'],
      ['today_voided_sales', 'Today voided sales'],
      ['recent_expenses', 'Recent expenses'],
      ['today_expenses', 'Today expenses'],
      ['recent_audit', 'Recent audit'],
      ['today_audit', 'Today audit'],
      ['today_alerts', 'Today alerts'],
      ['unread_alerts', 'Unread alerts'],
      ['recent_transfers', 'Recent transfers'],
      ['today_transfers', 'Today transfers'],
      ['recent_stock_counts', 'Recent stock counts'],
      ['today_stock_counts', 'Today stock counts'],
      ['recent_repairs', 'Recent repairs'],
      ['today_repairs', 'Today repairs'],
      ['recent_approvals', 'Recent approvals'],
      ['today_approvals', 'Today approvals'],
      ['recent_customers', 'Recent customers'],
      ['today_customers', 'Today customers'],
      ['recent_imeis', 'Recent IMEIs'],
      ['today_imeis', 'Today IMEIs'],
      ['low_stock', 'Low stock'],
      ['top_products', 'Top products'],
      ['payment_mix', 'Payment mix'],
      ['sale_types', 'Sale types'],
      ['sales_trend', 'Sales trend'],
      ['slow_movers', 'Slow movers'],
      ['branches', 'Branches'],
      ['staff', 'Staff'],
      ['staff_devices', 'Staff devices'],
    ];
    return `
      ${pageShell({
        group: 'Money & reports',
        trail: 'Reports',
        title: 'Reports & exports',
        subtitle: 'Sales, cash, inventory, and account balances for the period you choose. Download as spreadsheet, PDF, or Word.',
        actions: '<a class="atoms-back-btn" href="#/dashboard"><span class="material-symbols-outlined">arrow_back</span><span>Back to overview</span></a>',
      })}
      <div class="atoms-presets">
        ${presets.map((p) => `<button type="button" class="atoms-btn ${state.report.preset === p ? 'primary' : 'ghost'} sm js-rep-preset" data-preset="${p}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}
      </div>
      <div class="atoms-card atoms-export-desk" style="margin-bottom:18px; padding:16px;">
        <div class="atoms-pos-section-title" style="margin-bottom:12px">
          <span class="material-symbols-outlined" style="color:var(--atoms-primary);">download</span>
          <span>Download report</span>
        </div>
        <form class="atoms-form" id="report-export-form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;align-items:end;">
          ${field('Report', `<select id="rep-export-type">${exports.map(([v, l]) => `<option value="${v}"${v === 'sales' ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select>`)}
          ${field('Format', `<select id="rep-export-format">
            <option value="csv">Spreadsheet (.csv / Sheets)</option>
            <option value="pdf">PDF (print / save)</option>
            <option value="docx">Word (.docx)</option>
          </select>`)}
          <div class="atoms-actions" style="margin:0;">
            <button class="atoms-btn primary" type="submit"><span class="material-symbols-outlined">file_download</span> Download</button>
            <button type="button" class="atoms-btn ghost js-copy-sheet" data-target="#report-invoices-wrap table"><span class="material-symbols-outlined">content_copy</span> Copy invoices</button>
          </div>
        </form>
        <p class="atoms-muted" style="margin:10px 0 0">Uses the date range below. Spreadsheet opens in Excel or Google Sheets. PDF opens a print window — choose “Save as PDF”. Word downloads a .docx table.</p>
      </div>
      <div class="atoms-card" style="margin-bottom:18px; padding:16px;">
        <form class="atoms-form" id="report-form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;align-items:end;">
          ${field('From Date', `<input id="rep-from" type="date" value="${escapeHtml(state.report.from)}">`)}
          ${field('To Date', `<input id="rep-to" type="date" value="${escapeHtml(state.report.to)}">`)}
          <div class="atoms-actions" style="margin:0;"><button class="atoms-btn primary" type="submit"><span class="material-symbols-outlined">refresh</span> Run Custom Range</button></div>
        </form>
      </div>
      ${sales.reconciled === false ? `<div class="atoms-flash warn">Invoice lines (${money(sales.lines_total || 0)}) do not match net sales (${money(sales.net || 0)}). Recheck voids or filters.</div>` : ''}
      <div class="atoms-grid" style="margin:18px 0">
        <div class="atoms-card">
          <div class="atoms-card-top"><span class="atoms-card-label">Gross Revenue</span><div class="atoms-card-icon-badge indigo"><span class="material-symbols-outlined">trending_up</span></div></div>
          <div class="atoms-metric atoms-metric-mono">${money(sales.gross)}</div>
          <div class="atoms-card-footer">Total billed revenue</div>
        </div>
        <div class="atoms-card">
          <div class="atoms-card-top"><span class="atoms-card-label">Net Sales</span><div class="atoms-card-icon-badge emerald"><span class="material-symbols-outlined">payments</span></div></div>
          <div class="atoms-metric atoms-metric-mono">${money(sales.net)}</div>
          <div class="atoms-card-footer" style="color:#047857;">After discounts</div>
        </div>
        <div class="atoms-card">
          <div class="atoms-card-top"><span class="atoms-card-label">Retail Volume</span><div class="atoms-card-icon-badge sky"><span class="material-symbols-outlined">shopping_bag</span></div></div>
          <div class="atoms-metric atoms-metric-mono">${money(sales.by_type?.retail?.net || 0)}</div>
          <div class="atoms-card-footer">${sales.by_type?.retail?.invoices || 0} invoices</div>
        </div>
        <div class="atoms-card">
          <div class="atoms-card-top"><span class="atoms-card-label">Wholesale Volume</span><div class="atoms-card-icon-badge indigo"><span class="material-symbols-outlined">inventory</span></div></div>
          <div class="atoms-metric atoms-metric-mono">${money(sales.by_type?.wholesale?.net || 0)}</div>
          <div class="atoms-card-footer">${sales.by_type?.wholesale?.invoices || 0} bulk orders</div>
        </div>
        <div class="atoms-card">
          <div class="atoms-card-top"><span class="atoms-card-label">Gross Profit</span><div class="atoms-card-icon-badge emerald"><span class="material-symbols-outlined">query_stats</span></div></div>
          <div class="atoms-metric atoms-metric-mono">${money(sales.profit)}</div>
          <div class="atoms-card-footer" style="color:#047857;">Revenue minus device cost</div>
        </div>
        <div class="atoms-card">
          <div class="atoms-card-top"><span class="atoms-card-label">Cash Inflows</span><div class="atoms-card-icon-badge emerald"><span class="material-symbols-outlined">account_balance</span></div></div>
          <div class="atoms-metric atoms-metric-mono">${money(cash.inflows)}</div>
          <div class="atoms-card-footer">Actual receipts collected</div>
        </div>
        <div class="atoms-card">
          <div class="atoms-card-top"><span class="atoms-card-label">Available Stock Value</span><div class="atoms-card-icon-badge sky"><span class="material-symbols-outlined">storefront</span></div></div>
          <div class="atoms-metric atoms-metric-mono">${money(inv.available_value)}</div>
          <div class="atoms-card-footer">Cost value of sellable units</div>
        </div>
        <div class="atoms-card">
          <div class="atoms-card-top"><span class="atoms-card-label">Total Floor Valuation</span><div class="atoms-card-icon-badge amber"><span class="material-symbols-outlined">warehouse</span></div></div>
          <div class="atoms-metric atoms-metric-mono">${money(inv.on_hand_value)}</div>
          <div class="atoms-card-footer">Incl. faulty & in repair</div>
        </div>
      </div>
      <div class="atoms-row">
        <div class="atoms-table-card" id="report-invoices-wrap">
          <div class="atoms-table-toolbar">
            <div style="font-size:14px; font-weight:700; display:flex; align-items:center; gap:8px;">
              <span class="material-symbols-outlined" style="color:var(--atoms-primary);">receipt</span>
              <span>Invoices Issued (${escapeHtml(state.report.from)} – ${escapeHtml(state.report.to)})</span>
            </div>
          </div>
          <div class="atoms-table-wrap">
            <table class="atoms-table"><thead><tr><th>Invoice</th><th>Type</th><th>Customer</th><th>Total</th><th>Paid</th><th>Due</th><th></th></tr></thead><tbody>
              ${invoicePage.items.map((l) => `<tr>
                <td><button type="button" class="atoms-link js-invoice" data-inv="${escapeHtml(l.invoice_number)}">${escapeHtml(l.invoice_number)}</button></td>
                <td>${badge(saleTypeLabel(l.sale_type))}</td>
                <td>${escapeHtml(l.customer_name || 'Walk-in')}</td>
                <td class="atoms-table-mono">${money(l.total)}</td>
                <td class="atoms-table-mono">${money(l.paid_amount)}</td>
                <td class="atoms-table-mono" style="color:${Number(l.due_amount || 0) > 0 ? '#b91c1c' : '#047857'};">${money(l.due_amount)}</td>
                <td>${can('atoms_void') ? `<button type="button" class="atoms-btn danger sm js-void" data-id="${l.id}"><span class="material-symbols-outlined" style="font-size:14px;">cancel</span> Void</button>` : ''}</td>
              </tr>`).join('') || '<tr><td colspan="7" class="atoms-empty">No sales recorded in this period.</td></tr>'}
            </tbody></table>
          </div>
          ${pagerBar(invoicePage)}
          <div class="atoms-table-toolbar" style="border-top:1px solid var(--atoms-line);">
            <div style="font-size:14px; font-weight:700; display:flex; align-items:center; gap:8px;">
              <span class="material-symbols-outlined" style="color:var(--atoms-primary);">devices</span>
              <span>Device Items Sold Breakdown</span>
            </div>
          </div>
          <div class="atoms-table-wrap">
            <table class="atoms-table"><thead><tr><th>Invoice</th><th>Salesperson</th><th>IMEI</th><th>Product</th><th>Variant</th><th>Selling Price</th></tr></thead><tbody>
              ${deviceSoldPage.items.map((l) => `<tr>
                <td><button type="button" class="atoms-link js-invoice" data-inv="${escapeHtml(l.invoice_number)}">${escapeHtml(l.invoice_number)}</button></td>
                <td>${escapeHtml(l.salesperson_name || '—')}</td>
                <td><span class="atoms-imei-pill">${escapeHtml(l.imei || '')}</span></td>
                <td><strong>${escapeHtml(l.product_name || '')}</strong></td>
                <td>${escapeHtml(l.variant_label || '—')}</td>
                <td class="atoms-table-mono"><strong>${money(l.selling_price)}</strong></td>
              </tr>`).join('') || '<tr><td colspan="6" class="atoms-empty">No device items sold in this period.</td></tr>'}
            </tbody></table>
          </div>
          ${pagerBar(deviceSoldPage)}
        </div>
        <div class="atoms-card">
          <h3>IMEI status</h3>
          <table class="atoms-table"><thead><tr><th>Status</th><th>Qty</th></tr></thead><tbody>
            ${Object.keys(imei).length ? Object.entries(imei).map(([status, qty]) => `<tr><td>${badge(status)}</td><td>${qty}</td></tr>`).join('') : '<tr><td colspan="2">No devices.</td></tr>'}
          </tbody></table>
          <h3 style="margin-top:20px">Stock movement</h3>
          <table class="atoms-table"><thead><tr><th>Event</th><th>Qty</th></tr></thead><tbody>
            ${(pack.movement?.events || []).map((e) => `<tr><td>${escapeHtml(labelEvent(e.event_type))}</td><td>${e.qty}</td></tr>`).join('') || '<tr><td colspan="2">No IMEI events in this period.</td></tr>'}
          </tbody></table>
          <h3 style="margin-top:20px">Movement by variant</h3>
          <table class="atoms-table"><thead><tr><th>Event</th><th>Product</th><th>Variant</th><th>Qty</th></tr></thead><tbody>
            ${(pack.movement?.by_variant || []).map((e) => `<tr><td>${escapeHtml(labelEvent(e.event_type))}</td><td>${escapeHtml(e.product_name || '')}</td><td>${escapeHtml(e.variant_label || '—')}</td><td>${e.qty}</td></tr>`).join('') || '<tr><td colspan="4">No variant movement in this period.</td></tr>'}
          </tbody></table>
        </div>
      </div>
      <div class="atoms-row" style="margin-top:16px">
        <div class="atoms-card">
          <h3>Cash position</h3>
          <p>At sale ${money(cash.at_sale_total)} · Later collections ${money(cash.collections_total)}</p>
          <p>Expenses ${money(cash.expenses)} · Supplier payments ${money(cash.supplier_payments)} · Refunds ${money(cash.refunds)}</p>
          <table class="atoms-table"><thead><tr><th>Method</th><th>At sale</th></tr></thead><tbody>
            ${(cash.at_sale || []).map((m) => `<tr><td>${escapeHtml(m.method)}</td><td>${money(m.amount)}</td></tr>`).join('') || '<tr><td colspan="2">None</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Inventory by product</h3>
          <table class="atoms-table"><thead><tr><th>Product</th><th>Qty</th><th>Value</th></tr></thead><tbody>
            ${invProdPage.items.map((p) => `<tr><td>${escapeHtml(p.name)}</td><td>${p.total}</td><td>${money(p.valuation)}</td></tr>`).join('') || '<tr><td colspan="3">No available stock.</td></tr>'}
          </tbody></table>
          ${pagerBar(invProdPage)}
        </div>
      </div>
      <div class="atoms-row" style="margin-top:16px">
        <div class="atoms-card">
          <h3>Receivables ${money(pack.receivables?.total)}</h3>
          <table class="atoms-table"><thead><tr><th>Customer</th><th>Balance</th></tr></thead><tbody>
            ${recvPage.items.map((p) => `<tr><td>${escapeHtml(p.name || ('#' + p.party_id))}</td><td>${money(p.balance_after)}</td></tr>`).join('') || '<tr><td colspan="2">None</td></tr>'}
          </tbody></table>
          ${pagerBar(recvPage)}
        </div>
        <div class="atoms-card">
          <h3>Payables ${money(pack.payables?.total)}</h3>
          <table class="atoms-table"><thead><tr><th>Supplier</th><th>Balance</th></tr></thead><tbody>
            ${payPage.items.map((p) => `<tr><td>${escapeHtml(p.name || ('#' + p.party_id))}</td><td>${money(p.balance_after)}</td></tr>`).join('') || '<tr><td colspan="2">None</td></tr>'}
          </tbody></table>
          ${pagerBar(payPage)}
        </div>
      </div>
      <div class="atoms-row" style="margin-top:16px">
        <div class="atoms-card">
          <h3>Open invoices (all branches)</h3>
          <table class="atoms-table"><thead><tr><th>Customer</th><th>Invoice</th><th>Devices</th><th>Due</th><th>Age</th></tr></thead><tbody>
            ${openInvPage.items.map((l) => `<tr>
              <td><button type="button" class="atoms-link js-aging-cust" data-id="${l.id}">${escapeHtml(l.name || '')}</button></td>
              <td>${escapeHtml(l.invoice_number || '')}</td>
              <td>${escapeHtml(l.device_summary || '—')}</td>
              <td>${money(l.amount)}</td>
              <td>${l.days}d</td>
            </tr>`).join('') || '<tr><td colspan="5">No outstanding invoices.</td></tr>'}
          </tbody></table>
          ${pagerBar(openInvPage)}
        </div>
      </div>
      <div class="atoms-row" style="margin-top:16px">
        <div class="atoms-card">
          <h3>Open purchase orders (all branches)</h3>
          <table class="atoms-table"><thead><tr><th>Supplier</th><th>PO invoice</th><th>Variants</th><th>Amount</th><th>Age</th></tr></thead><tbody>
            ${openPoPage.items.map((l) => `<tr>
              <td><button type="button" class="atoms-link js-payable-sup" data-id="${l.id}">${escapeHtml(l.name || '')}</button></td>
              <td>${escapeHtml(l.invoice_number || '')}</td>
              <td>${escapeHtml(l.variant_summary || '—')}</td>
              <td>${money(l.amount)}</td>
              <td>${l.days}d</td>
            </tr>`).join('') || '<tr><td colspan="5">No outstanding purchase orders.</td></tr>'}
          </tbody></table>
          ${pagerBar(openPoPage)}
        </div>
        <div class="atoms-card">
          <h3>Open repairs (all branches)</h3>
          <table class="atoms-table"><thead><tr><th>Ticket</th><th>Customer</th><th>Device</th><th>Status</th><th>Engineer</th><th>Age</th></tr></thead><tbody>
            ${openRepairPage.items.map((l) => `<tr>
              <td>${escapeHtml(l.ticket_number || '')}</td>
              <td>${escapeHtml(l.customer_name || 'Walk-in')}</td>
              <td>${escapeHtml(l.device_summary || '—')}</td>
              <td>${badge(l.status)}</td>
              <td>${escapeHtml(l.engineer_name || '—')}</td>
              <td>${l.days}d</td>
            </tr>`).join('') || '<tr><td colspan="6">No open repairs.</td></tr>'}
          </tbody></table>
          ${pagerBar(openRepairPage)}
        </div>
        <div class="atoms-card">
          <h3>Faulty devices (all branches)</h3>
          <table class="atoms-table"><thead><tr><th>IMEI</th><th>Device</th><th>Age</th></tr></thead><tbody>
            ${faultyPage.items.map((l) => `<tr>
              <td>${escapeHtml(l.imei || '')}</td>
              <td>${escapeHtml(l.device_summary || '—')}</td>
              <td>${l.days}d</td>
            </tr>`).join('') || '<tr><td colspan="3">No faulty devices waiting.</td></tr>'}
          </tbody></table>
          ${pagerBar(faultyPage)}
        </div>
        <div class="atoms-card">
          <h3>Open stock counts (all branches)</h3>
          <table class="atoms-table"><thead><tr><th>Count</th><th>Branch</th><th>Status</th><th>Missing</th><th>Extra</th><th>Devices</th><th>Age</th></tr></thead><tbody>
            ${(pack.open_stock_counts || []).map((l) => `<tr>
              <td>${escapeHtml('#' + l.id)}</td>
              <td>${escapeHtml(l.branch_name || '')}</td>
              <td>${badge(l.status)}</td>
              <td>${l.missing_qty || 0}</td>
              <td>${l.extra_qty || 0}</td>
              <td>${escapeHtml(l.missing_summary || '—')}</td>
              <td>${l.days}d</td>
            </tr>`).join('') || '<tr><td colspan="7">No open stock counts.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Recent returns (14 days)</h3>
          <table class="atoms-table"><thead><tr><th>Return</th><th>Invoice</th><th>Customer</th><th>Device</th><th>Type</th><th>Refund</th></tr></thead><tbody>
            ${recentReturnPage.items.map((l) => `<tr>
              <td>${escapeHtml('#' + l.id)}</td>
              <td>${escapeHtml(l.invoice_number || '')}</td>
              <td>${escapeHtml(l.customer_name || 'Walk-in')}</td>
              <td>${escapeHtml(l.device_summary || '—')}</td>
              <td>${badge(l.return_type)} · ${badge(l.resolution)}</td>
              <td>${money(l.refund_amount)}</td>
            </tr>`).join('') || '<tr><td colspan="6">No returns in this window.</td></tr>'}
          </tbody></table>
          ${pagerBar(recentReturnPage)}
        </div>
        <div class="atoms-card">
          <h3>Pending expenses</h3>
          <table class="atoms-table"><thead><tr><th>Expense</th><th>Branch</th><th>Category</th><th>Vendor</th><th>Amount</th><th>Age</th></tr></thead><tbody>
            ${pendingExpPage.items.map((l) => `<tr>
              <td>${escapeHtml('#' + l.id)}</td>
              <td>${escapeHtml(l.branch_name || '')}</td>
              <td>${badge(l.category)}</td>
              <td>${escapeHtml(l.vendor || '—')}</td>
              <td>${money(l.amount)}</td>
              <td>${l.days}d</td>
            </tr>`).join('') || '<tr><td colspan="6">No pending expenses.</td></tr>'}
          </tbody></table>
          ${pagerBar(pendingExpPage)}
        </div>
        <div class="atoms-card">
          <h3>Open wholesale invoices</h3>
          <table class="atoms-table"><thead><tr><th>Customer</th><th>Invoice</th><th>Devices</th><th>Due</th><th>Age</th></tr></thead><tbody>
            ${wholesaleRecvPage.items.map((l) => `<tr>
              <td>${escapeHtml(l.name || '')}</td>
              <td>${escapeHtml(l.invoice_number || '')}</td>
              <td>${escapeHtml(l.device_summary || '—')}</td>
              <td>${money(l.amount)}</td>
              <td>${l.days}d</td>
            </tr>`).join('') || '<tr><td colspan="5">No open wholesale invoices.</td></tr>'}
          </tbody></table>
          ${pagerBar(wholesaleRecvPage)}
        </div>
        <div class="atoms-card">
          <h3>Open retail invoices</h3>
          <table class="atoms-table"><thead><tr><th>Customer</th><th>Invoice</th><th>Devices</th><th>Due</th><th>Age</th></tr></thead><tbody>
            ${retailRecvPage.items.map((l) => `<tr>
              <td>${escapeHtml(l.name || '')}</td>
              <td>${escapeHtml(l.invoice_number || '')}</td>
              <td>${escapeHtml(l.device_summary || '—')}</td>
              <td>${money(l.amount)}</td>
              <td>${l.days}d</td>
            </tr>`).join('') || '<tr><td colspan="5">No open retail invoices.</td></tr>'}
          </tbody></table>
          ${pagerBar(retailRecvPage)}
        </div>
        <div class="atoms-card">
          <h3>Recent sales (14 days)</h3>
          <table class="atoms-table"><thead><tr><th>Invoice</th><th>Type</th><th>Customer</th><th>Devices</th><th>Total</th><th>Due</th></tr></thead><tbody>
            ${recentSalesPage.items.map((l) => `<tr>
              <td>${escapeHtml(l.invoice_number || '')}</td>
              <td>${escapeHtml(l.sale_type_label || l.sale_type || 'Retail')}</td>
              <td>${escapeHtml(l.customer_name || 'Walk-in')}</td>
              <td>${escapeHtml(l.device_summary || '—')}</td>
              <td>${money(l.total)}</td>
              <td>${money(l.due_amount)}</td>
            </tr>`).join('') || '<tr><td colspan="6">No sales in this window.</td></tr>'}
          </tbody></table>
          ${pagerBar(recentSalesPage)}
        </div>
        <div class="atoms-card">
          <h3>Recent collections (14 days)</h3>
          <table class="atoms-table"><thead><tr><th>Customer</th><th>Invoice</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead><tbody>
            ${recentPayPage.items.map((l) => `<tr>
              <td>${escapeHtml(l.customer_name || '')}</td>
              <td>${escapeHtml(l.invoice_number || '—')}</td>
              <td>${money(l.amount)}</td>
              <td>${escapeHtml(l.method || '')}</td>
              <td>${badge(l.status)}</td>
            </tr>`).join('') || '<tr><td colspan="5">No collections in this window.</td></tr>'}
          </tbody></table>
          ${pagerBar(recentPayPage)}
        </div>
        <div class="atoms-card">
          <h3>Recent supplier payments (14 days)</h3>
          <table class="atoms-table"><thead><tr><th>Supplier</th><th>PO invoice</th><th>Amount</th><th>Method</th></tr></thead><tbody>
            ${(pack.supplier_payments || []).map((l) => `<tr>
              <td>${escapeHtml(l.supplier_name || '')}</td>
              <td>${escapeHtml(l.purchase_invoice || '—')}</td>
              <td>${money(l.amount)}</td>
              <td>${escapeHtml(l.method || '')}</td>
            </tr>`).join('') || '<tr><td colspan="4">No supplier payments in this window.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Recent purchases (14 days)</h3>
          <table class="atoms-table"><thead><tr><th>Supplier</th><th>PO invoice</th><th>Items</th><th>Total</th><th>Units</th></tr></thead><tbody>
            ${(pack.recent_purchases || []).map((l) => `<tr>
              <td>${escapeHtml(l.supplier_name || '')}</td>
              <td>${escapeHtml(l.invoice_number || '')}</td>
              <td>${escapeHtml(l.item_summary || '—')}</td>
              <td>${money(l.total)}</td>
              <td>${l.units}</td>
            </tr>`).join('') || '<tr><td colspan="5">No purchases in this window.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Recent supplier returns (14 days)</h3>
          <table class="atoms-table"><thead><tr><th>Supplier</th><th>Device</th><th>Credit</th><th>Posted</th></tr></thead><tbody>
            ${(pack.supplier_returns || []).map((l) => `<tr>
              <td>${escapeHtml(l.supplier_name || '')}</td>
              <td>${escapeHtml(l.device_summary || '—')}</td>
              <td>${money(l.amount)}</td>
              <td>${escapeHtml(l.posted_at || '')}</td>
            </tr>`).join('') || '<tr><td colspan="4">No supplier returns in this window.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Recent payment reversals (14 days)</h3>
          <table class="atoms-table"><thead><tr><th>Customer</th><th>Invoice</th><th>Amount</th><th>Reason</th></tr></thead><tbody>
            ${(pack.payment_reversals || []).map((l) => `<tr>
              <td>${escapeHtml(l.customer_name || '')}</td>
              <td>${escapeHtml(l.invoice_number || '—')}</td>
              <td>${money(l.amount)}</td>
              <td>${escapeHtml(l.notes || '—')}</td>
            </tr>`).join('') || '<tr><td colspan="4">No reversals in this window.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Recent voided sales (14 days)</h3>
          <table class="atoms-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Devices</th><th>Total</th><th>Reason</th></tr></thead><tbody>
            ${(pack.voided_sales || []).map((l) => `<tr>
              <td>${escapeHtml(l.invoice_number || '')}</td>
              <td>${escapeHtml(l.customer_name || 'Walk-in')}</td>
              <td>${escapeHtml(l.device_summary || '—')}</td>
              <td>${money(l.total)}</td>
              <td>${escapeHtml(l.void_reason || '—')}</td>
            </tr>`).join('') || '<tr><td colspan="5">No voided sales in this window.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Recent posted expenses (14 days)</h3>
          <table class="atoms-table"><thead><tr><th>Category</th><th>Vendor</th><th>Branch</th><th>Amount</th></tr></thead><tbody>
            ${(pack.recent_expenses || []).map((l) => `<tr>
              <td>${badge(l.category)}</td>
              <td>${escapeHtml(l.vendor || '—')}</td>
              <td>${escapeHtml(l.branch_name || '')}</td>
              <td>${money(l.amount)}</td>
            </tr>`).join('') || '<tr><td colspan="4">No posted expenses in this window.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Recent audit activity (14 days)</h3>
          <table class="atoms-table"><thead><tr><th>When</th><th>Action</th><th>User</th><th>Summary</th></tr></thead><tbody>
            ${(pack.recent_audit || []).map((a) => `<tr>
              <td>${escapeHtml(a.created_at || '')}</td>
              <td>${escapeHtml(a.action_label || '')}</td>
              <td>${escapeHtml(a.user_name || '')}</td>
              <td>${escapeHtml(a.summary || '')}</td>
            </tr>`).join('') || '<tr><td colspan="4">No audit events in this window.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Recent transfers (14 days)</h3>
          <table class="atoms-table"><thead><tr><th>Transfer</th><th>Route</th><th>Status</th><th>Devices</th></tr></thead><tbody>
            ${(pack.recent_transfers || []).map((l) => `<tr>
              <td>${escapeHtml('#' + l.id)}</td>
              <td>${escapeHtml(l.from_branch_name || '')} → ${escapeHtml(l.to_branch_name || '')}</td>
              <td>${badge(l.status)}</td>
              <td>${escapeHtml(l.device_summary || '—')}</td>
            </tr>`).join('') || '<tr><td colspan="4">No transfers in this window.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Recent stock counts (14 days)</h3>
          <table class="atoms-table"><thead><tr><th>Count</th><th>Branch</th><th>Expected</th><th>Missing</th><th>Extra</th></tr></thead><tbody>
            ${(pack.recent_stock_counts || []).map((l) => `<tr>
              <td>${escapeHtml('#' + l.id)}</td>
              <td>${escapeHtml(l.branch_name || '')}</td>
              <td>${l.expected_qty || 0}</td>
              <td>${l.missing_qty || 0}</td>
              <td>${l.extra_qty || 0}</td>
            </tr>`).join('') || '<tr><td colspan="5">No posted counts in this window.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Recent completed repairs (14 days)</h3>
          <table class="atoms-table"><thead><tr><th>Ticket</th><th>Customer</th><th>Device</th><th>Engineer</th><th>Outcome</th></tr></thead><tbody>
            ${(pack.recent_repairs || []).map((l) => `<tr>
              <td>${escapeHtml(l.ticket_number || '')}</td>
              <td>${escapeHtml(l.customer_name || 'Walk-in')}</td>
              <td>${escapeHtml(l.device_summary || '—')}</td>
              <td>${escapeHtml(l.engineer_name || '—')}</td>
              <td>${badge(l.status)}</td>
            </tr>`).join('') || '<tr><td colspan="5">No completed repairs in this window.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Recent approval decisions (14 days)</h3>
          <table class="atoms-table"><thead><tr><th>#</th><th>Request</th><th>Summary</th><th>Decision</th><th>Reviewer</th></tr></thead><tbody>
            ${(pack.recent_approvals || []).map((a) => `<tr>
              <td>${a.id}</td>
              <td>${escapeHtml(a.type_label || '')}</td>
              <td>${escapeHtml(a.summary || '')}</td>
              <td>${badge(a.status)}</td>
              <td>${escapeHtml(a.reviewer_name || '—')}</td>
            </tr>`).join('') || '<tr><td colspan="5">No approval decisions in this window.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>New customers (14 days)</h3>
          <table class="atoms-table"><thead><tr><th>Customer</th><th>Phone</th><th>Balance</th><th>Created</th></tr></thead><tbody>
            ${(pack.recent_customers || []).map((l) => `<tr>
              <td>${escapeHtml(l.name || '')}</td>
              <td>${escapeHtml(l.phone || '')}</td>
              <td>${money(l.balance)}</td>
              <td>${escapeHtml(l.created_at || '')}</td>
            </tr>`).join('') || '<tr><td colspan="4">No new customers in this window.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Recent IMEI intake (14 days)</h3>
          <table class="atoms-table"><thead><tr><th>IMEI</th><th>Device</th><th>Status</th><th>Source</th></tr></thead><tbody>
            ${(pack.recent_imeis || []).map((l) => `<tr>
              <td>${escapeHtml(l.imei || '')}</td>
              <td>${escapeHtml(l.device_summary || '—')}</td>
              <td>${badge(l.status)}</td>
              <td>${escapeHtml(l.source_type || '')}</td>
            </tr>`).join('') || '<tr><td colspan="4">No IMEIs registered in this window.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Intake snapshot (today)</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.intake_snapshot ? `<tr><td>Purchases</td><td>${pack.intake_snapshot.purchase_count || 0}</td><td>${money(pack.intake_snapshot.purchase_total || 0)}</td></tr>
            <tr><td>IMEIs registered</td><td>${pack.intake_snapshot.imei_count || 0}</td><td>—</td></tr>
            <tr><td>Inbound reserved</td><td>${pack.intake_snapshot.inbound_reserved_count || 0}</td><td>—</td></tr>
            <tr><td>Supplier payments</td><td>${pack.intake_snapshot.supplier_payment_count || 0}</td><td>${money(pack.intake_snapshot.supplier_payment_total || 0)}</td></tr>
            <tr><td>Swaps</td><td>${pack.intake_snapshot.swap_count || 0}</td><td>${money(pack.intake_snapshot.swap_collected || 0)}</td></tr>` : '<tr><td colspan="3">No intake today.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Operations snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Queue</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.operations_snapshot ? `<tr><td>Open repairs</td><td>${pack.operations_snapshot.open_repair_count || 0}</td><td>—</td></tr>
            <tr><td>Pending approvals</td><td>${pack.operations_snapshot.pending_approval_count || 0}</td><td>—</td></tr>
            <tr><td>In transit</td><td>${pack.operations_snapshot.in_transit_count || 0}</td><td>—</td></tr>
            <tr><td>Open stock counts</td><td>${pack.operations_snapshot.open_stock_count_count || 0}</td><td>—</td></tr>
            <tr><td>Faulty devices</td><td>${pack.operations_snapshot.faulty_device_count || 0}</td><td>—</td></tr>
            <tr><td>Pending expenses</td><td>${pack.operations_snapshot.pending_expense_count || 0}</td><td>${money(pack.operations_snapshot.pending_expense_total || 0)}</td></tr>
            <tr><td>Open purchases</td><td>${pack.operations_snapshot.open_purchase_count || 0}</td><td>${money(pack.operations_snapshot.open_purchase_total || 0)}</td></tr>
            <tr><td>Inbound reserved</td><td>${pack.operations_snapshot.inbound_reserved_count || 0}</td><td>—</td></tr>
            <tr><td>Accessory stock</td><td>${pack.operations_snapshot.quantity_stock_qty || 0}</td><td>${pack.operations_snapshot.quantity_sku_count || 0} SKUs</td></tr>
            <tr><td>Stuck repairs</td><td>${pack.operations_snapshot.stuck_repair_count || 0}</td><td>—</td></tr>
            <tr><td>Stuck transfers</td><td>${pack.operations_snapshot.stuck_transfer_count || 0}</td><td>—</td></tr>
            <tr><td>Stuck faulty devices</td><td>${pack.operations_snapshot.stuck_faulty_count || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No queue data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Transfers today</h3>
          <table class="atoms-table"><thead><tr><th>Transfer</th><th>Route</th><th>Status</th><th>Devices</th></tr></thead><tbody>
            ${(pack.today_transfers || []).map((l) => `<tr>
              <td>#${l.id || ''}</td>
              <td>${escapeHtml(l.from_branch_name || '')} → ${escapeHtml(l.to_branch_name || '')}</td>
              <td>${badge(l.status)}</td>
              <td>${escapeHtml(l.device_summary || '—')}</td>
            </tr>`).join('') || '<tr><td colspan="4">No transfer activity today.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Repairs completed today</h3>
          <table class="atoms-table"><thead><tr><th>Ticket</th><th>Customer</th><th>Device</th><th>Engineer</th><th>Outcome</th></tr></thead><tbody>
            ${(pack.today_repairs || []).map((l) => `<tr>
              <td>${escapeHtml(l.ticket_number || '')}</td>
              <td>${escapeHtml(l.customer_name || 'Walk-in')}</td>
              <td>${escapeHtml(l.device_summary || '—')}</td>
              <td>${escapeHtml(l.engineer_name || '—')}</td>
              <td>${badge(l.status)}</td>
            </tr>`).join('') || '<tr><td colspan="5">No repairs completed today.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Audit activity today</h3>
          <table class="atoms-table"><thead><tr><th>When</th><th>Action</th><th>User</th><th>Summary</th></tr></thead><tbody>
            ${(pack.today_audit || []).map((a) => `<tr>
              <td>${escapeHtml(a.created_at || '')}</td>
              <td>${escapeHtml(a.action_label || a.action || '')}</td>
              <td>${escapeHtml(a.user_name || '')}</td>
              <td>${escapeHtml(a.summary || '')}</td>
            </tr>`).join('') || '<tr><td colspan="4">No audit events today.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Receivables snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.receivables_snapshot ? `<tr><td>Overdue invoices</td><td>${pack.receivables_snapshot.overdue_count || 0}</td><td>${money(pack.receivables_snapshot.overdue_total || 0)}</td></tr>
            <tr><td>Open retail invoices</td><td>${pack.receivables_snapshot.retail_count || 0}</td><td>${money(pack.receivables_snapshot.retail_total || 0)}</td></tr>
            <tr><td>Open wholesale invoices</td><td>${pack.receivables_snapshot.wholesale_count || 0}</td><td>${money(pack.receivables_snapshot.wholesale_total || 0)}</td></tr>
            <tr><td>All open invoices</td><td>${pack.receivables_snapshot.open_invoice_count || 0}</td><td>${money(pack.receivables_snapshot.open_invoice_total || 0)}</td></tr>
            <tr><td>Collections today</td><td>${pack.receivables_snapshot.collection_count || 0}</td><td>${money(pack.receivables_snapshot.collection_total || 0)}</td></tr>
            <tr><td>Unread alerts</td><td>${pack.receivables_snapshot.notify_unread || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No receivables data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Approvals reviewed today</h3>
          <table class="atoms-table"><thead><tr><th>Request</th><th>Type</th><th>Summary</th><th>Decision</th><th>Reviewer</th></tr></thead><tbody>
            ${(pack.today_approvals || []).map((a) => `<tr>
              <td>#${a.id || ''}</td>
              <td>${escapeHtml(a.type_label || a.type || '')}</td>
              <td>${escapeHtml(a.summary || '—')}</td>
              <td>${badge(a.status)}</td>
              <td>${escapeHtml(a.reviewer_name || '—')}</td>
            </tr>`).join('') || '<tr><td colspan="5">No approvals reviewed today.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>New customers today</h3>
          <table class="atoms-table"><thead><tr><th>Customer</th><th>Phone</th><th>Balance</th><th>Created</th></tr></thead><tbody>
            ${(pack.today_customers || []).map((l) => `<tr>
              <td>${escapeHtml(l.name || '')}</td>
              <td>${escapeHtml(l.phone || '')}</td>
              <td>${money(l.balance)}</td>
              <td>${escapeHtml(l.created_at || '')}</td>
            </tr>`).join('') || '<tr><td colspan="4">No new customers today.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Payables snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.payables_snapshot ? `<tr><td>Open payables</td><td>${pack.payables_snapshot.open_payable_count || 0}</td><td>${money(pack.payables_snapshot.open_payable_total || 0)}</td></tr>
            <tr><td>Aged payables</td><td>${pack.payables_snapshot.aged_payable_count || 0}</td><td>${money(pack.payables_snapshot.aged_payable_total || 0)}</td></tr>
            <tr><td>Open purchase orders</td><td>${pack.payables_snapshot.open_purchase_count || 0}</td><td>${money(pack.payables_snapshot.open_purchase_total || 0)}</td></tr>
            <tr><td>Supplier payments today</td><td>${pack.payables_snapshot.supplier_payment_count || 0}</td><td>${money(pack.payables_snapshot.supplier_payment_total || 0)}</td></tr>
            <tr><td>Supplier returns today</td><td>${pack.payables_snapshot.supplier_return_count || 0}</td><td>${money(pack.payables_snapshot.supplier_return_total || 0)}</td></tr>` : '<tr><td colspan="3">No payables data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Supplier returns today</h3>
          <table class="atoms-table"><thead><tr><th>Supplier</th><th>IMEI</th><th>Device</th><th>Credit</th></tr></thead><tbody>
            ${(pack.today_supplier_returns || []).map((l) => `<tr>
              <td>${escapeHtml(l.supplier_name || '')}</td>
              <td>${escapeHtml(l.imei || '')}</td>
              <td>${escapeHtml(l.device_summary || '—')}</td>
              <td>${money(l.amount)}</td>
            </tr>`).join('') || '<tr><td colspan="4">No supplier returns today.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Stock counts posted today</h3>
          <table class="atoms-table"><thead><tr><th>Count</th><th>Branch</th><th>Expected</th><th>Missing</th><th>Extra</th></tr></thead><tbody>
            ${(pack.today_stock_counts || []).map((l) => `<tr>
              <td>#${l.id || ''}</td>
              <td>${escapeHtml(l.branch_name || '')}</td>
              <td>${l.expected_qty || 0}</td>
              <td>${l.missing_qty || 0}</td>
              <td>${l.extra_qty || 0}</td>
            </tr>`).join('') || '<tr><td colspan="5">No stock counts posted today.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Adjustments snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.adjustments_snapshot ? `<tr><td>Returns today</td><td>${pack.adjustments_snapshot.return_count || 0}</td><td>${money(pack.adjustments_snapshot.return_total || 0)}</td></tr>
            <tr><td>Payment reversals today</td><td>${pack.adjustments_snapshot.reversal_count || 0}</td><td>${money(pack.adjustments_snapshot.reversal_total || 0)}</td></tr>
            <tr><td>Voided sales today</td><td>${pack.adjustments_snapshot.voided_count || 0}</td><td>${money(pack.adjustments_snapshot.voided_total || 0)}</td></tr>` : '<tr><td colspan="3">No adjustments today.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Returns today</h3>
          <table class="atoms-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Device</th><th>Refund</th></tr></thead><tbody>
            ${(pack.today_returns || []).map((l) => `<tr>
              <td>${escapeHtml(l.invoice_number || '')}</td>
              <td>${escapeHtml(l.customer_name || 'Walk-in')}</td>
              <td>${escapeHtml(l.device_summary || '—')}</td>
              <td>${money(l.refund_amount)}</td>
            </tr>`).join('') || '<tr><td colspan="4">No returns posted today.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Payment reversals today</h3>
          <table class="atoms-table"><thead><tr><th>Customer</th><th>Invoice</th><th>Amount</th><th>Reason</th></tr></thead><tbody>
            ${(pack.today_reversals || []).map((l) => `<tr>
              <td>${escapeHtml(l.customer_name || '')}</td>
              <td>${escapeHtml(l.invoice_number || '')}</td>
              <td>${money(l.amount)}</td>
              <td>${escapeHtml(l.notes || '—')}</td>
            </tr>`).join('') || '<tr><td colspan="4">No payment reversals today.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Voided sales today</h3>
          <table class="atoms-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Devices</th><th>Total</th><th>Reason</th></tr></thead><tbody>
            ${(pack.today_voided_sales || []).map((l) => `<tr>
              <td>${escapeHtml(l.invoice_number || '')}</td>
              <td>${escapeHtml(l.customer_name || 'Walk-in')}</td>
              <td>${escapeHtml(l.device_summary || '—')}</td>
              <td>${money(l.total)}</td>
              <td>${escapeHtml(l.void_reason || '—')}</td>
            </tr>`).join('') || '<tr><td colspan="5">No voided sales today.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Performance snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.performance_snapshot ? `<tr><td>Low stock alerts</td><td>${pack.performance_snapshot.low_stock_count || 0}</td><td>—</td></tr>
            <tr><td>Slow movers</td><td>${pack.performance_snapshot.slow_mover_count || 0}</td><td>—</td></tr>
            <tr><td>Top sellers (14d)</td><td>${pack.performance_snapshot.top_seller_count || 0}</td><td>${money(pack.performance_snapshot.top_seller_revenue || 0)}</td></tr>
            <tr><td>Top seller units (14d)</td><td>${pack.performance_snapshot.top_seller_units || 0}</td><td>—</td></tr>
            <tr><td>Unread alerts</td><td>${pack.performance_snapshot.notify_unread || 0}</td><td>—</td></tr>
            <tr><td>Alerts today</td><td>${pack.performance_snapshot.alert_today_count || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No performance data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Alerts today</h3>
          <table class="atoms-table"><thead><tr><th>Alert</th><th>Detail</th><th>When</th></tr></thead><tbody>
            ${(pack.today_alerts || []).map((n) => `<tr>
              <td>${escapeHtml(n.title || '')}</td>
              <td>${escapeHtml(n.body || '')}</td>
              <td>${escapeHtml(n.created_at || '')}</td>
            </tr>`).join('') || '<tr><td colspan="3">No alerts today.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Staff snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.staff_snapshot ? `<tr><td>Staff with sales (14d)</td><td>${pack.staff_snapshot.staff_count || 0}</td><td>—</td></tr>
            <tr><td>Staff invoices (14d)</td><td>${pack.staff_snapshot.staff_invoices || 0}</td><td>${money(pack.staff_snapshot.staff_revenue || 0)}</td></tr>
            <tr><td>Staff profit (14d)</td><td>${pack.staff_snapshot.staff_invoices || 0}</td><td>${money(pack.staff_snapshot.staff_profit || 0)}</td></tr>
            <tr><td>Top staff revenue (14d)</td><td>1</td><td>${money(pack.staff_snapshot.top_staff_revenue || 0)}</td></tr>
            <tr><td>Active branches (14d)</td><td>${pack.staff_snapshot.branch_count || 0}</td><td>${money(pack.staff_snapshot.branch_revenue || 0)}</td></tr>
            <tr><td>Top branch revenue (14d)</td><td>1</td><td>${money(pack.staff_snapshot.top_branch_revenue || 0)}</td></tr>
            <tr><td>Sales today</td><td>${pack.staff_snapshot.sales_today_count || 0}</td><td>${money(pack.staff_snapshot.sales_today_total || 0)}</td></tr>` : '<tr><td colspan="3">No staff performance data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Movement snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.movement_snapshot ? `<tr><td>Transfers today</td><td>${pack.movement_snapshot.transfer_count || 0}</td><td>—</td></tr>
            <tr><td>IMEIs registered today</td><td>${pack.movement_snapshot.imei_count || 0}</td><td>—</td></tr>
            <tr><td>Stock counts posted today</td><td>${pack.movement_snapshot.stock_count_count || 0}</td><td>—</td></tr>
            <tr><td>In transit now</td><td>${pack.movement_snapshot.in_transit_count || 0}</td><td>—</td></tr>
            <tr><td>Stuck transfers</td><td>${pack.movement_snapshot.stuck_transfer_count || 0}</td><td>—</td></tr>
            <tr><td>IMEI events (14d)</td><td>${pack.movement_snapshot.movement_14d_count || 0}</td><td>—</td></tr>
            <tr><td>Sale events (14d)</td><td>${pack.movement_snapshot.sale_event_count || 0}</td><td>—</td></tr>
            <tr><td>Transfer events (14d)</td><td>${pack.movement_snapshot.transfer_event_count || 0}</td><td>—</td></tr>
            <tr><td>Intake events (14d)</td><td>${pack.movement_snapshot.intake_event_count || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No movement data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Ledger snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.ledger_snapshot ? `<tr><td>Customer receivables</td><td>${pack.ledger_snapshot.receivable_party_count || 0}</td><td>${money(pack.ledger_snapshot.receivable_total || 0)}</td></tr>
            <tr><td>Supplier payables</td><td>${pack.ledger_snapshot.payable_party_count || 0}</td><td>${money(pack.ledger_snapshot.payable_total || 0)}</td></tr>
            <tr><td>Overdue invoices</td><td>${pack.ledger_snapshot.overdue_count || 0}</td><td>${money(pack.ledger_snapshot.overdue_total || 0)}</td></tr>
            <tr><td>Open payables</td><td>${pack.ledger_snapshot.payable_party_count || 0}</td><td>${money(pack.ledger_snapshot.open_payable_total || 0)}</td></tr>
            <tr><td>Cash in (14d)</td><td>1</td><td>${money(pack.ledger_snapshot.cash_in_14d || 0)}</td></tr>
            <tr><td>Net cash (14d)</td><td>1</td><td>${money(pack.ledger_snapshot.cash_net_14d || 0)}</td></tr>
            <tr><td>Net cash today</td><td>1</td><td>${money(pack.ledger_snapshot.cash_net_today || 0)}</td></tr>
            <tr><td>Sales (14d)</td><td>1</td><td>${money(pack.ledger_snapshot.sales_14d || 0)}</td></tr>
            <tr><td>Collected (14d)</td><td>1</td><td>${money(pack.ledger_snapshot.collected_14d || 0)}</td></tr>
            <tr><td>Collections today</td><td>1</td><td>${money(pack.ledger_snapshot.collections_today || 0)}</td></tr>` : '<tr><td colspan="3">No ledger data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Repair snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.repair_snapshot ? `<tr><td>Open repairs</td><td>${pack.repair_snapshot.open_repair_count || 0}</td><td>—</td></tr>
            <tr><td>Stuck repairs</td><td>${pack.repair_snapshot.stuck_repair_count || 0}</td><td>—</td></tr>
            <tr><td>Completed today</td><td>${pack.repair_snapshot.completed_today_count || 0}</td><td>—</td></tr>
            <tr><td>Completed (14d)</td><td>${pack.repair_snapshot.completed_14d_count || 0}</td><td>—</td></tr>
            <tr><td>Faulty devices</td><td>${pack.repair_snapshot.faulty_device_count || 0}</td><td>—</td></tr>
            <tr><td>Stuck faulty devices</td><td>${pack.repair_snapshot.stuck_faulty_count || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No repair data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Compliance snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.compliance_snapshot ? `<tr><td>Pending approvals</td><td>${pack.compliance_snapshot.pending_approval_count || 0}</td><td>—</td></tr>
            <tr><td>Approvals reviewed today</td><td>${pack.compliance_snapshot.approval_reviewed_today_count || 0}</td><td>—</td></tr>
            <tr><td>Audit events today</td><td>${pack.compliance_snapshot.audit_today_count || 0}</td><td>—</td></tr>
            <tr><td>Audit events (14d)</td><td>${pack.compliance_snapshot.audit_14d_count || 0}</td><td>—</td></tr>
            <tr><td>New customers today</td><td>${pack.compliance_snapshot.new_customer_today_count || 0}</td><td>—</td></tr>
            <tr><td>New customers (14d)</td><td>${pack.compliance_snapshot.new_customer_14d_count || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No compliance data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Trade snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.trade_snapshot ? `<tr><td>Wholesale owing</td><td>${pack.trade_snapshot.wholesale_owing_count || 0}</td><td>${money(pack.trade_snapshot.wholesale_owing_total || 0)}</td></tr>
            <tr><td>Retail owing</td><td>${pack.trade_snapshot.retail_owing_count || 0}</td><td>${money(pack.trade_snapshot.retail_owing_total || 0)}</td></tr>
            <tr><td>Swaps today</td><td>${pack.trade_snapshot.swap_today_count || 0}</td><td>${money(pack.trade_snapshot.swap_collected_today || 0)}</td></tr>
            <tr><td>Swaps (14d)</td><td>${pack.trade_snapshot.swap_14d_count || 0}</td><td>${money(pack.trade_snapshot.swap_collected_14d || 0)}</td></tr>
            <tr><td>Retail sales (14d)</td><td>${pack.trade_snapshot.retail_invoices_14d || 0}</td><td>${money(pack.trade_snapshot.retail_sales_14d || 0)}</td></tr>
            <tr><td>Wholesale sales (14d)</td><td>${pack.trade_snapshot.wholesale_invoices_14d || 0}</td><td>${money(pack.trade_snapshot.wholesale_sales_14d || 0)}</td></tr>` : '<tr><td colspan="3">No trade data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Aging snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.aging_snapshot ? `<tr><td>Open receivables</td><td>${pack.aging_snapshot.receivable_line_count || 0}</td><td>${money(pack.aging_snapshot.receivable_total || 0)}</td></tr>
            <tr><td>Receivables 0–30 days</td><td>1</td><td>${money(pack.aging_snapshot.receivable_0_30 || 0)}</td></tr>
            <tr><td>Receivables 90+ days</td><td>1</td><td>${money(pack.aging_snapshot.receivable_90_plus || 0)}</td></tr>
            <tr><td>Open payables</td><td>${pack.aging_snapshot.payable_line_count || 0}</td><td>${money(pack.aging_snapshot.payable_total || 0)}</td></tr>
            <tr><td>Payables 0–30 days</td><td>1</td><td>${money(pack.aging_snapshot.payable_0_30 || 0)}</td></tr>
            <tr><td>Payables 90+ days</td><td>1</td><td>${money(pack.aging_snapshot.payable_90_plus || 0)}</td></tr>
            <tr><td>Payment methods (14d)</td><td>${pack.aging_snapshot.payment_method_count || 0}</td><td>${money(pack.aging_snapshot.payment_collected_14d || 0)}</td></tr>` : '<tr><td colspan="3">No aging data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Executive snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.executive_snapshot ? `<tr><td>Sales today</td><td>${pack.executive_snapshot.sales_today_count || 0}</td><td>${money(pack.executive_snapshot.sales_today_total || 0)}</td></tr>
            <tr><td>Sales (14d)</td><td>1</td><td>${money(pack.executive_snapshot.sales_14d || 0)}</td></tr>
            <tr><td>Net cash today</td><td>1</td><td>${money(pack.executive_snapshot.cash_net_today || 0)}</td></tr>
            <tr><td>Net cash (14d)</td><td>1</td><td>${money(pack.executive_snapshot.cash_net_14d || 0)}</td></tr>
            <tr><td>Customer receivables</td><td>${pack.executive_snapshot.receivable_party_count || 0}</td><td>${money(pack.executive_snapshot.receivable_total || 0)}</td></tr>
            <tr><td>Supplier payables</td><td>${pack.executive_snapshot.payable_party_count || 0}</td><td>${money(pack.executive_snapshot.payable_total || 0)}</td></tr>
            <tr><td>Overdue invoices</td><td>${pack.executive_snapshot.overdue_count || 0}</td><td>${money(pack.executive_snapshot.overdue_total || 0)}</td></tr>
            <tr><td>Collections today</td><td>1</td><td>${money(pack.executive_snapshot.collections_today || 0)}</td></tr>
            <tr><td>Open repairs</td><td>${pack.executive_snapshot.open_repair_count || 0}</td><td>—</td></tr>
            <tr><td>Pending approvals</td><td>${pack.executive_snapshot.pending_approval_count || 0}</td><td>—</td></tr>
            <tr><td>In transit</td><td>${pack.executive_snapshot.in_transit_count || 0}</td><td>—</td></tr>
            <tr><td>Available stock</td><td>${pack.executive_snapshot.available_qty || 0}</td><td>${money(pack.executive_snapshot.available_value || 0)}</td></tr>
            <tr><td>Low stock alerts</td><td>${pack.executive_snapshot.low_stock_count || 0}</td><td>—</td></tr>
            <tr><td>Unread alerts</td><td>${pack.executive_snapshot.notify_unread || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No executive data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Branch snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.branch_snapshot ? `<tr><td>Active branches</td><td>${pack.branch_snapshot.branch_count || 0}</td><td>—</td></tr>
            <tr><td>Branches with sales (14d)</td><td>${pack.branch_snapshot.active_branch_count || 0}</td><td>—</td></tr>
            <tr><td>Invoices (14d)</td><td>${pack.branch_snapshot.invoice_count || 0}</td><td>${money(pack.branch_snapshot.revenue_14d || 0)}</td></tr>
            <tr><td>Collected (14d)</td><td>1</td><td>${money(pack.branch_snapshot.collected_14d || 0)}</td></tr>
            <tr><td>Profit (14d)</td><td>1</td><td>${money(pack.branch_snapshot.profit_14d || 0)}</td></tr>
            <tr><td>Outstanding due</td><td>1</td><td>${money(pack.branch_snapshot.due_total || 0)}</td></tr>
            <tr><td>Network stock</td><td>${pack.branch_snapshot.stock_qty || 0}</td><td>${money(pack.branch_snapshot.stock_value || 0)}</td></tr>
            <tr><td>Top branch revenue (14d)</td><td>1</td><td>${money(pack.branch_snapshot.top_branch_revenue || 0)}</td></tr>
            <tr><td>Top branch profit (14d)</td><td>1</td><td>${money(pack.branch_snapshot.top_branch_profit || 0)}</td></tr>` : '<tr><td colspan="3">No branch data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Mix snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.mix_snapshot ? `<tr><td>Payment methods (14d)</td><td>${pack.mix_snapshot.payment_method_count || 0}</td><td>${money(pack.mix_snapshot.payment_collected_14d || 0)}</td></tr>
            <tr><td>Top payment method</td><td>1</td><td>${money(pack.mix_snapshot.top_payment_collected || 0)}</td></tr>
            <tr><td>Retail invoices (14d)</td><td>${pack.mix_snapshot.retail_invoices || 0}</td><td>${money(pack.mix_snapshot.retail_revenue || 0)}</td></tr>
            <tr><td>Wholesale invoices (14d)</td><td>${pack.mix_snapshot.wholesale_invoices || 0}</td><td>${money(pack.mix_snapshot.wholesale_revenue || 0)}</td></tr>
            <tr><td>Total invoices (14d)</td><td>${pack.mix_snapshot.invoice_count || 0}</td><td>${money(pack.mix_snapshot.sales_14d || 0)}</td></tr>
            <tr><td>Sale channels (14d)</td><td>${pack.mix_snapshot.sale_type_count || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No mix data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Product snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.product_snapshot ? `<tr><td>Top sellers (14d)</td><td>${pack.product_snapshot.top_seller_count || 0}</td><td>${money(pack.product_snapshot.top_seller_revenue || 0)}</td></tr>
            <tr><td>Top seller units (14d)</td><td>${pack.product_snapshot.top_seller_units || 0}</td><td>${money(pack.product_snapshot.top_seller_profit || 0)}</td></tr>
            <tr><td>Top product profit (14d)</td><td>1</td><td>${money(pack.product_snapshot.top_product_profit || 0)}</td></tr>
            <tr><td>Slow movers</td><td>${pack.product_snapshot.slow_mover_count || 0}</td><td>—</td></tr>
            <tr><td>Slow mover units</td><td>${pack.product_snapshot.slow_mover_qty || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No product data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Trend snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.trend_snapshot ? `<tr><td>Active days (14d)</td><td>${pack.trend_snapshot.active_day_count || 0}</td><td>—</td></tr>
            <tr><td>Invoices (14d)</td><td>${pack.trend_snapshot.invoice_count || 0}</td><td>${money(pack.trend_snapshot.sales_14d || 0)}</td></tr>
            <tr><td>Collected (14d)</td><td>1</td><td>${money(pack.trend_snapshot.collected_14d || 0)}</td></tr>
            <tr><td>Sales today</td><td>${pack.trend_snapshot.invoices_today || 0}</td><td>${money(pack.trend_snapshot.sales_today || 0)}</td></tr>
            <tr><td>Best day</td><td>1</td><td>${money(pack.trend_snapshot.best_day_net || 0)}</td></tr>
            <tr><td>Average daily sales</td><td>1</td><td>${money(pack.trend_snapshot.avg_daily_net || 0)}</td></tr>` : '<tr><td colspan="3">No trend data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Cashflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.cashflow_snapshot ? `<tr><td>Cash in (14d)</td><td>1</td><td>${money(pack.cashflow_snapshot.inflows_14d || 0)}</td></tr>
            <tr><td>At sale (14d)</td><td>1</td><td>${money(pack.cashflow_snapshot.at_sale_14d || 0)}</td></tr>
            <tr><td>Collections (14d)</td><td>1</td><td>${money(pack.cashflow_snapshot.collections_14d || 0)}</td></tr>
            <tr><td>Expenses (14d)</td><td>1</td><td>${money(pack.cashflow_snapshot.expenses_14d || 0)}</td></tr>
            <tr><td>Supplier payments (14d)</td><td>1</td><td>${money(pack.cashflow_snapshot.supplier_payments_14d || 0)}</td></tr>
            <tr><td>Refunds (14d)</td><td>1</td><td>${money(pack.cashflow_snapshot.refunds_14d || 0)}</td></tr>
            <tr><td>Net cash (14d)</td><td>1</td><td>${money(pack.cashflow_snapshot.net_14d || 0)}</td></tr>
            <tr><td>Cash in today</td><td>1</td><td>${money(pack.cashflow_snapshot.inflows_today || 0)}</td></tr>
            <tr><td>Outflows today</td><td>1</td><td>${money(pack.cashflow_snapshot.outflows_today || 0)}</td></tr>
            <tr><td>Net cash today</td><td>1</td><td>${money(pack.cashflow_snapshot.net_today || 0)}</td></tr>` : '<tr><td colspan="3">No cashflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Staff device snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.staff_device_snapshot ? `<tr><td>Devices sold (14d)</td><td>${pack.staff_device_snapshot.device_line_count || 0}</td><td>${money(pack.staff_device_snapshot.revenue_total || 0)}</td></tr>
            <tr><td>Staff selling (14d)</td><td>${pack.staff_device_snapshot.staff_count || 0}</td><td>—</td></tr>
            <tr><td>Invoices (14d)</td><td>${pack.staff_device_snapshot.invoice_count || 0}</td><td>—</td></tr>
            <tr><td>Top staff units (14d)</td><td>${pack.staff_device_snapshot.top_staff_units || 0}</td><td>—</td></tr>
            <tr><td>Devices sold today</td><td>${pack.staff_device_snapshot.devices_today || 0}</td><td>${money(pack.staff_device_snapshot.revenue_today || 0)}</td></tr>` : '<tr><td colspan="3">No staff device data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Stock snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.stock_snapshot ? `<tr><td>Low stock alerts</td><td>${pack.stock_snapshot.low_stock_count || 0}</td><td>—</td></tr>
            <tr><td>Low stock units</td><td>${pack.stock_snapshot.low_stock_qty || 0}</td><td>—</td></tr>
            <tr><td>Lowest available</td><td>${pack.stock_snapshot.lowest_available || 0}</td><td>—</td></tr>
            <tr><td>Available stock</td><td>${pack.stock_snapshot.available_qty || 0}</td><td>${money(pack.stock_snapshot.available_value || 0)}</td></tr>
            <tr><td>Faulty units</td><td>${pack.stock_snapshot.faulty_qty || 0}</td><td>—</td></tr>
            <tr><td>Accessory units</td><td>${pack.stock_snapshot.quantity_qty || 0}</td><td>${money(pack.stock_snapshot.quantity_value || 0)}</td></tr>
            <tr><td>Accessory SKUs</td><td>${pack.stock_snapshot.quantity_sku_count || 0}</td><td>—</td></tr>
            <tr><td>Inbound reserved</td><td>${pack.stock_snapshot.inbound_reserved_count || 0}</td><td>—</td></tr>
            <tr><td>IMEI on hand</td><td>${pack.stock_snapshot.imei_total || 0}</td><td>—</td></tr>
            <tr><td>IMEI statuses</td><td>${pack.stock_snapshot.status_count || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No stock data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>IMEI snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.imei_snapshot ? `<tr><td>IMEI on hand</td><td>${pack.imei_snapshot.imei_total || 0}</td><td>—</td></tr>
            <tr><td>Available</td><td>${pack.imei_snapshot.available_qty || 0}</td><td>—</td></tr>
            <tr><td>Sold</td><td>${pack.imei_snapshot.sold_qty || 0}</td><td>—</td></tr>
            <tr><td>Faulty</td><td>${pack.imei_snapshot.faulty_qty || 0}</td><td>—</td></tr>
            <tr><td>Reserved</td><td>${pack.imei_snapshot.reserved_qty || 0}</td><td>—</td></tr>
            <tr><td>Under repair</td><td>${pack.imei_snapshot.under_repair_qty || 0}</td><td>—</td></tr>
            <tr><td>In transit</td><td>${pack.imei_snapshot.transferred_qty || 0}</td><td>—</td></tr>
            <tr><td>Registered today</td><td>${pack.imei_snapshot.registered_today || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No IMEI data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Transfer snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.transfer_snapshot ? `<tr><td>In transit now</td><td>${pack.transfer_snapshot.in_transit_count || 0}</td><td>—</td></tr>
            <tr><td>Devices in transit</td><td>${pack.transfer_snapshot.in_transit_devices || 0}</td><td>—</td></tr>
            <tr><td>Stuck transfers</td><td>${pack.transfer_snapshot.stuck_transfer_count || 0}</td><td>—</td></tr>
            <tr><td>Stuck devices</td><td>${pack.transfer_snapshot.stuck_device_count || 0}</td><td>—</td></tr>
            <tr><td>Transfers today</td><td>${pack.transfer_snapshot.transfer_count_today || 0}</td><td>—</td></tr>
            <tr><td>Dispatched today</td><td>${pack.transfer_snapshot.dispatched_today || 0}</td><td>—</td></tr>
            <tr><td>Received today</td><td>${pack.transfer_snapshot.received_today || 0}</td><td>—</td></tr>
            <tr><td>Outbound in transit</td><td>${pack.transfer_snapshot.outbound_in_transit || 0}</td><td>—</td></tr>
            <tr><td>Inbound in transit</td><td>${pack.transfer_snapshot.inbound_in_transit || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No transfer data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Purchase snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.purchase_snapshot ? `<tr><td>Open purchase orders</td><td>${pack.purchase_snapshot.open_po_count || 0}</td><td>${money(pack.purchase_snapshot.open_po_total || 0)}</td></tr>
            <tr><td>Pending units</td><td>${pack.purchase_snapshot.pending_units || 0}</td><td>—</td></tr>
            <tr><td>Ordered POs</td><td>${pack.purchase_snapshot.ordered_count || 0}</td><td>—</td></tr>
            <tr><td>Inspecting POs</td><td>${pack.purchase_snapshot.inspecting_count || 0}</td><td>—</td></tr>
            <tr><td>Purchases today</td><td>${pack.purchase_snapshot.purchase_count_today || 0}</td><td>${money(pack.purchase_snapshot.purchase_total_today || 0)}</td></tr>
            <tr><td>Units received today</td><td>${pack.purchase_snapshot.purchase_units_today || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No purchase data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Returns snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.returns_snapshot ? `<tr><td>Returns today</td><td>${pack.returns_snapshot.return_count_today || 0}</td><td>${money(pack.returns_snapshot.return_total_today || 0)}</td></tr>
            <tr><td>Returns (14d)</td><td>${pack.returns_snapshot.return_count_14d || 0}</td><td>${money(pack.returns_snapshot.return_total_14d || 0)}</td></tr>
            <tr><td>Swaps today</td><td>${pack.returns_snapshot.swap_count_today || 0}</td><td>${money(pack.returns_snapshot.swap_collected_today || 0)}</td></tr>
            <tr><td>Swaps (14d)</td><td>${pack.returns_snapshot.swap_count_14d || 0}</td><td>${money(pack.returns_snapshot.swap_collected_14d || 0)}</td></tr>
            <tr><td>Payment reversals today</td><td>${pack.returns_snapshot.reversal_count_today || 0}</td><td>${money(pack.returns_snapshot.reversal_total_today || 0)}</td></tr>
            <tr><td>Voided sales today</td><td>${pack.returns_snapshot.voided_count_today || 0}</td><td>${money(pack.returns_snapshot.voided_total_today || 0)}</td></tr>` : '<tr><td colspan="3">No returns data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Faulty snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.faulty_snapshot ? `<tr><td>Faulty devices</td><td>${pack.faulty_snapshot.faulty_device_count || 0}</td><td>—</td></tr>
            <tr><td>Stuck faulty devices</td><td>${pack.faulty_snapshot.stuck_faulty_count || 0}</td><td>—</td></tr>
            <tr><td>Under repair (IMEI)</td><td>${pack.faulty_snapshot.under_repair_qty || 0}</td><td>—</td></tr>
            <tr><td>Returned (IMEI)</td><td>${pack.faulty_snapshot.returned_qty || 0}</td><td>—</td></tr>
            <tr><td>Open repairs</td><td>${pack.faulty_snapshot.open_repair_count || 0}</td><td>—</td></tr>
            <tr><td>Stuck repairs</td><td>${pack.faulty_snapshot.stuck_repair_count || 0}</td><td>—</td></tr>
            <tr><td>Repairs completed today</td><td>${pack.faulty_snapshot.repair_completed_today || 0}</td><td>—</td></tr>
            <tr><td>Repairs completed (14d)</td><td>${pack.faulty_snapshot.repair_completed_14d || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No repair data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Customer snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.customer_snapshot ? `<tr><td>New customers today</td><td>${pack.customer_snapshot.new_customers_today || 0}</td><td>—</td></tr>
            <tr><td>New customers (14d)</td><td>${pack.customer_snapshot.new_customers_14d || 0}</td><td>—</td></tr>
            <tr><td>Customers owing</td><td>${pack.customer_snapshot.owing_customer_count || 0}</td><td>${money(pack.customer_snapshot.receivable_total || 0)}</td></tr>
            <tr><td>Overdue invoices</td><td>${pack.customer_snapshot.overdue_count || 0}</td><td>${money(pack.customer_snapshot.overdue_total || 0)}</td></tr>
            <tr><td>Retail owing</td><td>${pack.customer_snapshot.retail_owing_count || 0}</td><td>—</td></tr>
            <tr><td>Wholesale owing</td><td>${pack.customer_snapshot.wholesale_owing_count || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No customer data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Supplier snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.supplier_snapshot ? `<tr><td>Suppliers owing</td><td>${pack.supplier_snapshot.owing_supplier_count || 0}</td><td>${money(pack.supplier_snapshot.payable_total || 0)}</td></tr>
            <tr><td>Open payables</td><td>${pack.supplier_snapshot.open_payable_count || 0}</td><td>${money(pack.supplier_snapshot.open_payable_total || 0)}</td></tr>
            <tr><td>Aged payables</td><td>${pack.supplier_snapshot.aged_payable_count || 0}</td><td>${money(pack.supplier_snapshot.aged_payable_total || 0)}</td></tr>
            <tr><td>Open purchase orders</td><td>${pack.supplier_snapshot.open_po_count || 0}</td><td>${money(pack.supplier_snapshot.open_po_total || 0)}</td></tr>
            <tr><td>Supplier payments today</td><td>${pack.supplier_snapshot.supplier_payment_count_today || 0}</td><td>${money(pack.supplier_snapshot.supplier_payment_total_today || 0)}</td></tr>
            <tr><td>Supplier returns today</td><td>${pack.supplier_snapshot.supplier_return_count_today || 0}</td><td>${money(pack.supplier_snapshot.supplier_return_total_today || 0)}</td></tr>` : '<tr><td colspan="3">No supplier data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Count snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Units</th></tr></thead><tbody>
            ${pack.count_snapshot ? `<tr><td>Open stock counts</td><td>${pack.count_snapshot.open_count_count || 0}</td><td>—</td></tr>
            <tr><td>Pending approval</td><td>${pack.count_snapshot.pending_approval_count || 0}</td><td>—</td></tr>
            <tr><td>Open missing units</td><td>${pack.count_snapshot.open_missing_units || 0}</td><td>—</td></tr>
            <tr><td>Open extra units</td><td>${pack.count_snapshot.open_extra_units || 0}</td><td>—</td></tr>
            <tr><td>Posted today</td><td>${pack.count_snapshot.posted_today_count || 0}</td><td>${pack.count_snapshot.missing_units_today || 0}</td></tr>
            <tr><td>Posted (14 days)</td><td>${pack.count_snapshot.posted_14d_count || 0}</td><td>${pack.count_snapshot.missing_units_14d || 0}</td></tr>` : '<tr><td colspan="3">No stock count data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Approval snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.approval_snapshot ? `<tr><td>Pending approvals</td><td>${pack.approval_snapshot.pending_count || 0}</td><td>—</td></tr>
            <tr><td>Sell below minimum</td><td>${pack.approval_snapshot.price_override_count || 0}</td><td>—</td></tr>
            <tr><td>Expense over threshold</td><td>${pack.approval_snapshot.expense_count || 0}</td><td>—</td></tr>
            <tr><td>Stock count variance</td><td>${pack.approval_snapshot.stock_variance_count || 0}</td><td>—</td></tr>
            <tr><td>Reviewed today</td><td>${pack.approval_snapshot.reviewed_today_count || 0}</td><td>—</td></tr>
            <tr><td>Approved today</td><td>${pack.approval_snapshot.approved_today_count || 0}</td><td>—</td></tr>
            <tr><td>Rejected today</td><td>${pack.approval_snapshot.rejected_today_count || 0}</td><td>—</td></tr>
            <tr><td>Reviewed (14 days)</td><td>${pack.approval_snapshot.reviewed_14d_count || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No approval data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Expense snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.expense_snapshot ? `<tr><td>Pending approval</td><td>${pack.expense_snapshot.pending_count || 0}</td><td>${money(pack.expense_snapshot.pending_total || 0)}</td></tr>
            <tr><td>Posted today</td><td>${pack.expense_snapshot.posted_today_count || 0}</td><td>${money(pack.expense_snapshot.posted_today_total || 0)}</td></tr>
            <tr><td>Posted (14 days)</td><td>${pack.expense_snapshot.posted_14d_count || 0}</td><td>${money(pack.expense_snapshot.posted_14d_total || 0)}</td></tr>
            <tr><td>Categories (14 days)</td><td>${pack.expense_snapshot.category_count_14d || 0}</td><td>${money(pack.expense_snapshot.top_category_total_14d || 0)}</td></tr>
            <tr><td>Largest pending</td><td>1</td><td>${money(pack.expense_snapshot.largest_pending_amount || 0)}</td></tr>` : '<tr><td colspan="3">No expense data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Audit snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.audit_snapshot ? `<tr><td>Events today</td><td>${pack.audit_snapshot.event_count_today || 0}</td><td>—</td></tr>
            <tr><td>Events (14 days)</td><td>${pack.audit_snapshot.event_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Active users (14d)</td><td>${pack.audit_snapshot.user_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Entity types (14d)</td><td>${pack.audit_snapshot.entity_type_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Sales events (14d)</td><td>${pack.audit_snapshot.sale_event_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Approval events (14d)</td><td>${pack.audit_snapshot.approval_event_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Inventory events (14d)</td><td>${pack.audit_snapshot.inventory_event_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Top action (14d)</td><td>1</td><td>${escapeHtml(pack.audit_snapshot.top_action_14d || '—')}</td></tr>` : '<tr><td colspan="3">No audit data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Collection snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.collection_snapshot ? `<tr><td>Customers owing</td><td>${pack.collection_snapshot.owing_customer_count || 0}</td><td>${money(pack.collection_snapshot.receivable_total || 0)}</td></tr>
            <tr><td>Overdue invoices</td><td>${pack.collection_snapshot.overdue_count || 0}</td><td>${money(pack.collection_snapshot.overdue_total || 0)}</td></tr>
            <tr><td>Open invoices</td><td>${pack.collection_snapshot.open_invoice_count || 0}</td><td>${money(pack.collection_snapshot.open_invoice_total || 0)}</td></tr>
            <tr><td>Retail owing</td><td>${pack.collection_snapshot.retail_owing_count || 0}</td><td>—</td></tr>
            <tr><td>Wholesale owing</td><td>${pack.collection_snapshot.wholesale_owing_count || 0}</td><td>—</td></tr>
            <tr><td>Collections today</td><td>${pack.collection_snapshot.collection_count_today || 0}</td><td>${money(pack.collection_snapshot.collection_total_today || 0)}</td></tr>
            <tr><td>Collections (14 days)</td><td>${pack.collection_snapshot.collection_count_14d || 0}</td><td>${money(pack.collection_snapshot.collection_total_14d || 0)}</td></tr>` : '<tr><td colspan="3">No collection data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Alert snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.alert_snapshot ? `<tr><td>Unread alerts</td><td>${pack.alert_snapshot.unread_count || 0}</td><td>—</td></tr>
            <tr><td>Alerts today</td><td>${pack.alert_snapshot.alert_count_today || 0}</td><td>—</td></tr>
            <tr><td>Alerts (14 days)</td><td>${pack.alert_snapshot.alert_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Low stock alerts (14d)</td><td>${pack.alert_snapshot.low_stock_alert_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Debt alerts (14d)</td><td>${pack.alert_snapshot.debt_alert_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Approval alerts (14d)</td><td>${pack.alert_snapshot.approval_alert_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Operations alerts (14d)</td><td>${pack.alert_snapshot.ops_alert_count_14d || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No alert data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Sales snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.sales_snapshot ? `<tr><td>Sales today</td><td>${pack.sales_snapshot.sale_count_today || 0}</td><td>${money(pack.sales_snapshot.sale_total_today || 0)}</td></tr>
            <tr><td>Collected today</td><td>${pack.sales_snapshot.sale_count_today || 0}</td><td>${money(pack.sales_snapshot.collected_today || 0)}</td></tr>
            <tr><td>Due today</td><td>${pack.sales_snapshot.credit_sale_count_today || 0}</td><td>${money(pack.sales_snapshot.due_total_today || 0)}</td></tr>
            <tr><td>Sales (14 days)</td><td>${pack.sales_snapshot.sale_count_14d || 0}</td><td>${money(pack.sales_snapshot.sale_total_14d || 0)}</td></tr>
            <tr><td>Collected (14 days)</td><td>${pack.sales_snapshot.sale_count_14d || 0}</td><td>${money(pack.sales_snapshot.collected_14d || 0)}</td></tr>
            <tr><td>Retail sales (14d)</td><td>${pack.sales_snapshot.retail_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Wholesale sales (14d)</td><td>${pack.sales_snapshot.wholesale_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Voided today</td><td>${pack.sales_snapshot.voided_count_today || 0}</td><td>${money(pack.sales_snapshot.voided_total_today || 0)}</td></tr>` : '<tr><td colspan="3">No sales data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Payment snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.payment_snapshot ? `<tr><td>Customer payments today</td><td>${pack.payment_snapshot.customer_payment_count_today || 0}</td><td>${money(pack.payment_snapshot.customer_payment_total_today || 0)}</td></tr>
            <tr><td>Customer payments (14d)</td><td>${pack.payment_snapshot.customer_payment_count_14d || 0}</td><td>${money(pack.payment_snapshot.customer_payment_total_14d || 0)}</td></tr>
            <tr><td>Supplier payments today</td><td>${pack.payment_snapshot.supplier_payment_count_today || 0}</td><td>${money(pack.payment_snapshot.supplier_payment_total_today || 0)}</td></tr>
            <tr><td>Supplier payments (14d)</td><td>${pack.payment_snapshot.supplier_payment_count_14d || 0}</td><td>${money(pack.payment_snapshot.supplier_payment_total_14d || 0)}</td></tr>
            <tr><td>Reversals today</td><td>${pack.payment_snapshot.reversal_count_today || 0}</td><td>${money(pack.payment_snapshot.reversal_total_today || 0)}</td></tr>
            <tr><td>Reversals (14 days)</td><td>${pack.payment_snapshot.reversal_count_14d || 0}</td><td>${money(pack.payment_snapshot.reversal_total_14d || 0)}</td></tr>` : '<tr><td colspan="3">No payment data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Swap snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.swap_snapshot ? `<tr><td>Swaps today</td><td>${pack.swap_snapshot.swap_count_today || 0}</td><td>${money(pack.swap_snapshot.collected_today || 0)}</td></tr>
            <tr><td>Difference today</td><td>${pack.swap_snapshot.swap_count_today || 0}</td><td>${money(pack.swap_snapshot.difference_total_today || 0)}</td></tr>
            <tr><td>Swaps (14 days)</td><td>${pack.swap_snapshot.swap_count_14d || 0}</td><td>${money(pack.swap_snapshot.collected_14d || 0)}</td></tr>
            <tr><td>Difference (14 days)</td><td>${pack.swap_snapshot.swap_count_14d || 0}</td><td>${money(pack.swap_snapshot.difference_total_14d || 0)}</td></tr>
            <tr><td>Upgrades (14d)</td><td>${pack.swap_snapshot.upgrade_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Downgrades (14d)</td><td>${pack.swap_snapshot.downgrade_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Even swaps (14d)</td><td>${pack.swap_snapshot.even_swap_count_14d || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No swap data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Return snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.return_snapshot ? `<tr><td>Returns today</td><td>${pack.return_snapshot.return_count_today || 0}</td><td>${money(pack.return_snapshot.return_total_today || 0)}</td></tr>
            <tr><td>Returns (14 days)</td><td>${pack.return_snapshot.return_count_14d || 0}</td><td>${money(pack.return_snapshot.return_total_14d || 0)}</td></tr>
            <tr><td>Refund resolutions (14d)</td><td>${pack.return_snapshot.refund_resolution_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Replacement resolutions (14d)</td><td>${pack.return_snapshot.replacement_resolution_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Faulty returns (14d)</td><td>${pack.return_snapshot.faulty_return_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Warranty returns (14d)</td><td>${pack.return_snapshot.warranty_return_count_14d || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No return data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Adjustment snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.adjustment_snapshot ? `<tr><td>Reversals today</td><td>${pack.adjustment_snapshot.reversal_count_today || 0}</td><td>${money(pack.adjustment_snapshot.reversal_total_today || 0)}</td></tr>
            <tr><td>Reversals (14 days)</td><td>${pack.adjustment_snapshot.reversal_count_14d || 0}</td><td>${money(pack.adjustment_snapshot.reversal_total_14d || 0)}</td></tr>
            <tr><td>Voided sales today</td><td>${pack.adjustment_snapshot.voided_count_today || 0}</td><td>${money(pack.adjustment_snapshot.voided_total_today || 0)}</td></tr>
            <tr><td>Voided sales (14 days)</td><td>${pack.adjustment_snapshot.voided_count_14d || 0}</td><td>${money(pack.adjustment_snapshot.voided_total_14d || 0)}</td></tr>
            <tr><td>Adjustments today</td><td>${pack.adjustment_snapshot.adjustment_count_today || 0}</td><td>${money(pack.adjustment_snapshot.adjustment_total_today || 0)}</td></tr>` : '<tr><td colspan="3">No adjustment data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Procurement snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.procurement_snapshot ? `<tr><td>Open purchase orders</td><td>${pack.procurement_snapshot.open_po_count || 0}</td><td>${money(pack.procurement_snapshot.open_po_total || 0)}</td></tr>
            <tr><td>Pending units</td><td>${pack.procurement_snapshot.pending_units || 0}</td><td>—</td></tr>
            <tr><td>Ordered POs</td><td>${pack.procurement_snapshot.ordered_count || 0}</td><td>—</td></tr>
            <tr><td>Inspecting POs</td><td>${pack.procurement_snapshot.inspecting_count || 0}</td><td>—</td></tr>
            <tr><td>Purchases today</td><td>${pack.procurement_snapshot.purchase_count_today || 0}</td><td>${money(pack.procurement_snapshot.purchase_total_today || 0)}</td></tr>
            <tr><td>Units received today</td><td>${pack.procurement_snapshot.purchase_units_today || 0}</td><td>—</td></tr>
            <tr><td>Purchases (14 days)</td><td>${pack.procurement_snapshot.purchase_count_14d || 0}</td><td>${money(pack.procurement_snapshot.purchase_total_14d || 0)}</td></tr>
            <tr><td>Units received (14 days)</td><td>${pack.procurement_snapshot.purchase_units_14d || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No procurement data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Receiving snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.receiving_snapshot ? `<tr><td>Purchases today</td><td>${pack.receiving_snapshot.purchase_count_today || 0}</td><td>${money(pack.receiving_snapshot.purchase_total_today || 0)}</td></tr>
            <tr><td>Purchases (14 days)</td><td>${pack.receiving_snapshot.purchase_count_14d || 0}</td><td>${money(pack.receiving_snapshot.purchase_total_14d || 0)}</td></tr>
            <tr><td>IMEIs registered today</td><td>${pack.receiving_snapshot.imei_count_today || 0}</td><td>—</td></tr>
            <tr><td>IMEIs registered (14 days)</td><td>${pack.receiving_snapshot.imei_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Supplier payments today</td><td>${pack.receiving_snapshot.supplier_payment_count_today || 0}</td><td>${money(pack.receiving_snapshot.supplier_payment_total_today || 0)}</td></tr>
            <tr><td>Supplier payments (14 days)</td><td>${pack.receiving_snapshot.supplier_payment_count_14d || 0}</td><td>${money(pack.receiving_snapshot.supplier_payment_total_14d || 0)}</td></tr>
            <tr><td>Swaps today</td><td>${pack.receiving_snapshot.swap_count_today || 0}</td><td>${money(pack.receiving_snapshot.swap_collected_today || 0)}</td></tr>
            <tr><td>Supplier returns today</td><td>${pack.receiving_snapshot.supplier_return_count_today || 0}</td><td>${money(pack.receiving_snapshot.supplier_return_total_today || 0)}</td></tr>
            <tr><td>Receiving events today</td><td>${pack.receiving_snapshot.receiving_count_today || 0}</td><td>—</td></tr>
            <tr><td>Receiving events (14 days)</td><td>${pack.receiving_snapshot.receiving_count_14d || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No receiving data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Payable snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.payable_snapshot ? `<tr><td>Suppliers owing</td><td>${pack.payable_snapshot.owing_supplier_count || 0}</td><td>${money(pack.payable_snapshot.payable_total || 0)}</td></tr>
            <tr><td>Open payables</td><td>${pack.payable_snapshot.open_payable_count || 0}</td><td>${money(pack.payable_snapshot.open_payable_total || 0)}</td></tr>
            <tr><td>Aged payables</td><td>${pack.payable_snapshot.aged_payable_count || 0}</td><td>${money(pack.payable_snapshot.aged_payable_total || 0)}</td></tr>
            <tr><td>Open purchase orders</td><td>${pack.payable_snapshot.open_po_count || 0}</td><td>${money(pack.payable_snapshot.open_po_total || 0)}</td></tr>
            <tr><td>Supplier payments today</td><td>${pack.payable_snapshot.supplier_payment_count_today || 0}</td><td>${money(pack.payable_snapshot.supplier_payment_total_today || 0)}</td></tr>
            <tr><td>Supplier payments (14 days)</td><td>${pack.payable_snapshot.supplier_payment_count_14d || 0}</td><td>${money(pack.payable_snapshot.supplier_payment_total_14d || 0)}</td></tr>
            <tr><td>Supplier returns today</td><td>${pack.payable_snapshot.supplier_return_count_today || 0}</td><td>${money(pack.payable_snapshot.supplier_return_total_today || 0)}</td></tr>
            <tr><td>Supplier returns (14 days)</td><td>${pack.payable_snapshot.supplier_return_count_14d || 0}</td><td>${money(pack.payable_snapshot.supplier_return_total_14d || 0)}</td></tr>` : '<tr><td colspan="3">No payable data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Receivable snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.receivable_snapshot ? `<tr><td>Customers owing</td><td>${pack.receivable_snapshot.owing_customer_count || 0}</td><td>${money(pack.receivable_snapshot.receivable_total || 0)}</td></tr>
            <tr><td>Overdue invoices</td><td>${pack.receivable_snapshot.overdue_count || 0}</td><td>${money(pack.receivable_snapshot.overdue_total || 0)}</td></tr>
            <tr><td>Open invoices</td><td>${pack.receivable_snapshot.open_invoice_count || 0}</td><td>${money(pack.receivable_snapshot.open_invoice_total || 0)}</td></tr>
            <tr><td>Retail owing</td><td>${pack.receivable_snapshot.retail_owing_count || 0}</td><td>—</td></tr>
            <tr><td>Wholesale owing</td><td>${pack.receivable_snapshot.wholesale_owing_count || 0}</td><td>—</td></tr>
            <tr><td>New customers today</td><td>${pack.receivable_snapshot.new_customers_today || 0}</td><td>—</td></tr>
            <tr><td>New customers (14 days)</td><td>${pack.receivable_snapshot.new_customers_14d || 0}</td><td>—</td></tr>
            <tr><td>Collections today</td><td>${pack.receivable_snapshot.collection_count_today || 0}</td><td>${money(pack.receivable_snapshot.collection_total_today || 0)}</td></tr>
            <tr><td>Collections (14 days)</td><td>${pack.receivable_snapshot.collection_count_14d || 0}</td><td>${money(pack.receivable_snapshot.collection_total_14d || 0)}</td></tr>` : '<tr><td colspan="3">No receivable data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Workflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.workflow_snapshot ? `<tr><td>Open repairs</td><td>${pack.workflow_snapshot.open_repair_count || 0}</td><td>—</td></tr>
            <tr><td>Pending approvals</td><td>${pack.workflow_snapshot.pending_approval_count || 0}</td><td>—</td></tr>
            <tr><td>In transit</td><td>${pack.workflow_snapshot.in_transit_count || 0}</td><td>—</td></tr>
            <tr><td>Open stock counts</td><td>${pack.workflow_snapshot.open_stock_count_count || 0}</td><td>—</td></tr>
            <tr><td>Faulty devices</td><td>${pack.workflow_snapshot.faulty_device_count || 0}</td><td>—</td></tr>
            <tr><td>Stuck repairs</td><td>${pack.workflow_snapshot.stuck_repair_count || 0}</td><td>—</td></tr>
            <tr><td>Repairs completed today</td><td>${pack.workflow_snapshot.repair_completed_today || 0}</td><td>—</td></tr>
            <tr><td>Repairs completed (14 days)</td><td>${pack.workflow_snapshot.repair_completed_14d || 0}</td><td>—</td></tr>
            <tr><td>Transfers today</td><td>${pack.workflow_snapshot.transfer_count_today || 0}</td><td>—</td></tr>
            <tr><td>Workflow events today</td><td>${pack.workflow_snapshot.workflow_events_today || 0}</td><td>—</td></tr>
            <tr><td>Workflow events (14 days)</td><td>${pack.workflow_snapshot.workflow_events_14d || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No workflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Transit snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.transit_snapshot ? `<tr><td>In transit now</td><td>${pack.transit_snapshot.in_transit_count || 0}</td><td>—</td></tr>
            <tr><td>Devices in transit</td><td>${pack.transit_snapshot.in_transit_devices || 0}</td><td>—</td></tr>
            <tr><td>Stuck transfers</td><td>${pack.transit_snapshot.stuck_transfer_count || 0}</td><td>—</td></tr>
            <tr><td>Outbound in transit</td><td>${pack.transit_snapshot.outbound_in_transit || 0}</td><td>—</td></tr>
            <tr><td>Inbound in transit</td><td>${pack.transit_snapshot.inbound_in_transit || 0}</td><td>—</td></tr>
            <tr><td>Transfers today</td><td>${pack.transit_snapshot.transfer_count_today || 0}</td><td>—</td></tr>
            <tr><td>Dispatched today</td><td>${pack.transit_snapshot.dispatched_today || 0}</td><td>—</td></tr>
            <tr><td>Received today</td><td>${pack.transit_snapshot.received_today || 0}</td><td>—</td></tr>
            <tr><td>Transfers (14 days)</td><td>${pack.transit_snapshot.transfer_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Devices moved (14 days)</td><td>${pack.transit_snapshot.devices_moved_14d || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No transit data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Stockflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.stockflow_snapshot ? `<tr><td>Low stock alerts</td><td>${pack.stockflow_snapshot.low_stock_count || 0}</td><td>—</td></tr>
            <tr><td>Low stock units</td><td>${pack.stockflow_snapshot.low_stock_qty || 0}</td><td>—</td></tr>
            <tr><td>Available stock</td><td>${pack.stockflow_snapshot.available_qty || 0}</td><td>${money(pack.stockflow_snapshot.available_value || 0)}</td></tr>
            <tr><td>On-hand value</td><td>—</td><td>${money(pack.stockflow_snapshot.on_hand_value || 0)}</td></tr>
            <tr><td>Faulty units</td><td>${pack.stockflow_snapshot.faulty_qty || 0}</td><td>${money(pack.stockflow_snapshot.faulty_value || 0)}</td></tr>
            <tr><td>IMEI on hand</td><td>${pack.stockflow_snapshot.imei_total || 0}</td><td>—</td></tr>
            <tr><td>IMEI registered today</td><td>${pack.stockflow_snapshot.imei_registered_today || 0}</td><td>—</td></tr>
            <tr><td>IMEI registered (14 days)</td><td>${pack.stockflow_snapshot.imei_registered_14d || 0}</td><td>—</td></tr>
            <tr><td>Slow movers</td><td>${pack.stockflow_snapshot.slow_mover_count || 0}</td><td>${pack.stockflow_snapshot.slow_mover_qty || 0} units</td></tr>` : '<tr><td colspan="3">No stockflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Service snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.service_snapshot ? `<tr><td>Open repairs</td><td>${pack.service_snapshot.open_repair_count || 0}</td><td>—</td></tr>
            <tr><td>Stuck repairs</td><td>${pack.service_snapshot.stuck_repair_count || 0}</td><td>—</td></tr>
            <tr><td>Repairs opened today</td><td>${pack.service_snapshot.repair_opened_today || 0}</td><td>—</td></tr>
            <tr><td>Repair intake (14 days)</td><td>${pack.service_snapshot.repair_intake_14d || 0}</td><td>—</td></tr>
            <tr><td>Faulty devices</td><td>${pack.service_snapshot.faulty_device_count || 0}</td><td>—</td></tr>
            <tr><td>Stuck faulty devices</td><td>${pack.service_snapshot.stuck_faulty_count || 0}</td><td>—</td></tr>
            <tr><td>Under repair (IMEI)</td><td>${pack.service_snapshot.under_repair_qty || 0}</td><td>—</td></tr>
            <tr><td>Service queue total</td><td>${pack.service_snapshot.service_queue_total || 0}</td><td>—</td></tr>
            <tr><td>Repairs completed today</td><td>${pack.service_snapshot.repair_completed_today || 0}</td><td>—</td></tr>
            <tr><td>Repairs completed (14 days)</td><td>${pack.service_snapshot.repair_completed_14d || 0}</td><td>—</td></tr>
            <tr><td>Returns today</td><td>${pack.service_snapshot.return_count_today || 0}</td><td>—</td></tr>
            <tr><td>Returns (14 days)</td><td>${pack.service_snapshot.return_count_14d || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No service data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Countflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Units</th></tr></thead><tbody>
            ${pack.countflow_snapshot ? `<tr><td>Open stock counts</td><td>${pack.countflow_snapshot.open_count_count || 0}</td><td>—</td></tr>
            <tr><td>Pending approval</td><td>${pack.countflow_snapshot.pending_approval_count || 0}</td><td>—</td></tr>
            <tr><td>Count queue total</td><td>${pack.countflow_snapshot.count_queue_total || 0}</td><td>—</td></tr>
            <tr><td>Open missing units</td><td>${pack.countflow_snapshot.open_missing_units || 0}</td><td>—</td></tr>
            <tr><td>Open extra units</td><td>${pack.countflow_snapshot.open_extra_units || 0}</td><td>—</td></tr>
            <tr><td>Variance approvals pending</td><td>${pack.countflow_snapshot.stock_variance_pending || 0}</td><td>—</td></tr>
            <tr><td>Posted today</td><td>${pack.countflow_snapshot.posted_today_count || 0}</td><td>${pack.countflow_snapshot.missing_units_today || 0}</td></tr>
            <tr><td>Extra units today</td><td>${pack.countflow_snapshot.extra_units_today || 0}</td><td>—</td></tr>
            <tr><td>Posted (14 days)</td><td>${pack.countflow_snapshot.posted_14d_count || 0}</td><td>${pack.countflow_snapshot.missing_units_14d || 0}</td></tr>
            <tr><td>Extra units (14 days)</td><td>${pack.countflow_snapshot.extra_units_14d || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No countflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Approvalflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.approvalflow_snapshot ? `<tr><td>Pending approvals</td><td>${pack.approvalflow_snapshot.pending_count || 0}</td><td>—</td></tr>
            <tr><td>Pending types</td><td>${pack.approvalflow_snapshot.pending_type_count || 0}</td><td>—</td></tr>
            <tr><td>Sell below minimum</td><td>${pack.approvalflow_snapshot.price_override_count || 0}</td><td>—</td></tr>
            <tr><td>Expense over threshold</td><td>${pack.approvalflow_snapshot.expense_count || 0}</td><td>—</td></tr>
            <tr><td>Stock count variance</td><td>${pack.approvalflow_snapshot.stock_variance_count || 0}</td><td>—</td></tr>
            <tr><td>Reviewed today</td><td>${pack.approvalflow_snapshot.reviewed_today_count || 0}</td><td>—</td></tr>
            <tr><td>Approved today</td><td>${pack.approvalflow_snapshot.approved_today_count || 0}</td><td>—</td></tr>
            <tr><td>Rejected today</td><td>${pack.approvalflow_snapshot.rejected_today_count || 0}</td><td>—</td></tr>
            <tr><td>Reviewed (14 days)</td><td>${pack.approvalflow_snapshot.reviewed_14d_count || 0}</td><td>—</td></tr>
            <tr><td>Approved (14 days)</td><td>${pack.approvalflow_snapshot.approved_14d_count || 0}</td><td>—</td></tr>
            <tr><td>Rejected (14 days)</td><td>${pack.approvalflow_snapshot.rejected_14d_count || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No approvalflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Auditflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.auditflow_snapshot ? `<tr><td>Events today</td><td>${pack.auditflow_snapshot.event_count_today || 0}</td><td>—</td></tr>
            <tr><td>Active users today</td><td>${pack.auditflow_snapshot.users_today || 0}</td><td>—</td></tr>
            <tr><td>Events (14 days)</td><td>${pack.auditflow_snapshot.event_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Active users (14 days)</td><td>${pack.auditflow_snapshot.user_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Sales events (14 days)</td><td>${pack.auditflow_snapshot.sale_event_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Payment events (14 days)</td><td>${pack.auditflow_snapshot.payment_event_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Approval events (14 days)</td><td>${pack.auditflow_snapshot.approval_event_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Inventory events (14 days)</td><td>${pack.auditflow_snapshot.inventory_event_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Transfer events (14 days)</td><td>${pack.auditflow_snapshot.transfer_event_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Top action (14 days)</td><td>—</td><td>${escapeHtml(pack.auditflow_snapshot.top_action_14d || '—')}</td></tr>` : '<tr><td colspan="3">No auditflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Collectionflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.collectionflow_snapshot ? `<tr><td>Customers owing</td><td>${pack.collectionflow_snapshot.owing_customer_count || 0}</td><td>${money(pack.collectionflow_snapshot.receivable_total || 0)}</td></tr>
            <tr><td>Overdue invoices</td><td>${pack.collectionflow_snapshot.overdue_count || 0}</td><td>${money(pack.collectionflow_snapshot.overdue_total || 0)}</td></tr>
            <tr><td>Overdue share</td><td>${pack.collectionflow_snapshot.overdue_share_pct || 0}%</td><td>—</td></tr>
            <tr><td>Open invoices</td><td>${pack.collectionflow_snapshot.open_invoice_count || 0}</td><td>${money(pack.collectionflow_snapshot.open_invoice_total || 0)}</td></tr>
            <tr><td>Retail owing</td><td>${pack.collectionflow_snapshot.retail_owing_count || 0}</td><td>—</td></tr>
            <tr><td>Wholesale owing</td><td>${pack.collectionflow_snapshot.wholesale_owing_count || 0}</td><td>—</td></tr>
            <tr><td>Collections today</td><td>${pack.collectionflow_snapshot.collection_count_today || 0}</td><td>${money(pack.collectionflow_snapshot.collection_total_today || 0)}</td></tr>
            <tr><td>Average collection today</td><td>—</td><td>${money(pack.collectionflow_snapshot.avg_collection_today || 0)}</td></tr>
            <tr><td>Collections (14 days)</td><td>${pack.collectionflow_snapshot.collection_count_14d || 0}</td><td>${money(pack.collectionflow_snapshot.collection_total_14d || 0)}</td></tr>
            <tr><td>Average collection (14 days)</td><td>—</td><td>${money(pack.collectionflow_snapshot.avg_collection_14d || 0)}</td></tr>` : '<tr><td colspan="3">No collectionflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Alertflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.alertflow_snapshot ? `<tr><td>Unread alerts</td><td>${pack.alertflow_snapshot.unread_count || 0}</td><td>—</td></tr>
            <tr><td>Alerts today</td><td>${pack.alertflow_snapshot.alert_count_today || 0}</td><td>—</td></tr>
            <tr><td>Unread today</td><td>${pack.alertflow_snapshot.unread_today || 0}</td><td>—</td></tr>
            <tr><td>Read today</td><td>${pack.alertflow_snapshot.read_today || 0}</td><td>—</td></tr>
            <tr><td>Alerts (14 days)</td><td>${pack.alertflow_snapshot.alert_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Active alert types (14d)</td><td>${pack.alertflow_snapshot.alert_types_active || 0}</td><td>—</td></tr>
            <tr><td>Low stock alerts (14d)</td><td>${pack.alertflow_snapshot.low_stock_alert_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Debt alerts (14d)</td><td>${pack.alertflow_snapshot.debt_alert_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Approval alerts (14d)</td><td>${pack.alertflow_snapshot.approval_alert_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Operations alerts (14d)</td><td>${pack.alertflow_snapshot.ops_alert_count_14d || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No alertflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Expenseflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.expenseflow_snapshot ? `<tr><td>Pending approval</td><td>${pack.expenseflow_snapshot.pending_count || 0}</td><td>${money(pack.expenseflow_snapshot.pending_total || 0)}</td></tr>
            <tr><td>Approval queue (expense)</td><td>${pack.expenseflow_snapshot.approval_pending_count || 0}</td><td>—</td></tr>
            <tr><td>Largest pending</td><td>—</td><td>${money(pack.expenseflow_snapshot.largest_pending_amount || 0)}</td></tr>
            <tr><td>Posted today</td><td>${pack.expenseflow_snapshot.posted_today_count || 0}</td><td>${money(pack.expenseflow_snapshot.posted_today_total || 0)}</td></tr>
            <tr><td>Average posted today</td><td>—</td><td>${money(pack.expenseflow_snapshot.avg_posted_today || 0)}</td></tr>
            <tr><td>Posted (14 days)</td><td>${pack.expenseflow_snapshot.posted_14d_count || 0}</td><td>${money(pack.expenseflow_snapshot.posted_14d_total || 0)}</td></tr>
            <tr><td>Average posted (14 days)</td><td>—</td><td>${money(pack.expenseflow_snapshot.avg_posted_14d || 0)}</td></tr>
            <tr><td>Categories (14 days)</td><td>${pack.expenseflow_snapshot.category_count_14d || 0}</td><td>${money(pack.expenseflow_snapshot.top_category_total_14d || 0)}</td></tr>
            <tr><td>Top category (14 days)</td><td>—</td><td>${escapeHtml(pack.expenseflow_snapshot.top_category_14d || '—')}</td></tr>` : '<tr><td colspan="3">No expenseflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Performanceflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.performanceflow_snapshot ? `<tr><td>Low stock alerts</td><td>${pack.performanceflow_snapshot.low_stock_count || 0}</td><td>—</td></tr>
            <tr><td>Low stock units</td><td>${pack.performanceflow_snapshot.low_stock_qty || 0}</td><td>—</td></tr>
            <tr><td>Slow movers</td><td>${pack.performanceflow_snapshot.slow_mover_count || 0}</td><td>—</td></tr>
            <tr><td>Slow mover units</td><td>${pack.performanceflow_snapshot.slow_mover_qty || 0}</td><td>—</td></tr>
            <tr><td>Top sellers (14d)</td><td>${pack.performanceflow_snapshot.top_seller_count || 0}</td><td>${money(pack.performanceflow_snapshot.top_seller_revenue || 0)}</td></tr>
            <tr><td>Top seller units (14d)</td><td>${pack.performanceflow_snapshot.top_seller_units || 0}</td><td>—</td></tr>
            <tr><td>Top product (14d)</td><td>${pack.performanceflow_snapshot.top_product_units || 0}</td><td>${escapeHtml(pack.performanceflow_snapshot.top_product_name || '—')}</td></tr>
            <tr><td>Top product revenue (14d)</td><td>—</td><td>${money(pack.performanceflow_snapshot.top_product_revenue || 0)}</td></tr>
            <tr><td>Top product profit (14d)</td><td>—</td><td>${money(pack.performanceflow_snapshot.top_product_profit || 0)}</td></tr>
            <tr><td>Unread alerts</td><td>${pack.performanceflow_snapshot.notify_unread || 0}</td><td>—</td></tr>
            <tr><td>Alerts today</td><td>${pack.performanceflow_snapshot.alert_today_count || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No performanceflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Customerflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.customerflow_snapshot ? `<tr><td>New customers today</td><td>${pack.customerflow_snapshot.new_customers_today || 0}</td><td>—</td></tr>
            <tr><td>New customers (14d)</td><td>${pack.customerflow_snapshot.new_customers_14d || 0}</td><td>—</td></tr>
            <tr><td>Customers owing</td><td>${pack.customerflow_snapshot.owing_customer_count || 0}</td><td>${money(pack.customerflow_snapshot.receivable_total || 0)}</td></tr>
            <tr><td>Average balance owing</td><td>—</td><td>${money(pack.customerflow_snapshot.avg_balance_owing || 0)}</td></tr>
            <tr><td>Overdue invoices</td><td>${pack.customerflow_snapshot.overdue_count || 0}</td><td>${money(pack.customerflow_snapshot.overdue_total || 0)}</td></tr>
            <tr><td>Overdue share</td><td>${pack.customerflow_snapshot.overdue_share_pct || 0}</td><td>%</td></tr>
            <tr><td>Open invoices</td><td>${pack.customerflow_snapshot.open_invoice_count || 0}</td><td>${money(pack.customerflow_snapshot.open_invoice_total || 0)}</td></tr>
            <tr><td>Retail owing</td><td>${pack.customerflow_snapshot.retail_owing_count || 0}</td><td>—</td></tr>
            <tr><td>Wholesale owing</td><td>${pack.customerflow_snapshot.wholesale_owing_count || 0}</td><td>—</td></tr>
            <tr><td>Collections today</td><td>${pack.customerflow_snapshot.collection_count_today || 0}</td><td>${money(pack.customerflow_snapshot.collection_total_today || 0)}</td></tr>
            <tr><td>Collections (14 days)</td><td>${pack.customerflow_snapshot.collection_count_14d || 0}</td><td>${money(pack.customerflow_snapshot.collection_total_14d || 0)}</td></tr>` : '<tr><td colspan="3">No customerflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Intakeflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.intakeflow_snapshot ? `<tr><td>Purchases today</td><td>${pack.intakeflow_snapshot.purchase_count || 0}</td><td>${money(pack.intakeflow_snapshot.purchase_total || 0)}</td></tr>
            <tr><td>Average purchase today</td><td>—</td><td>${money(pack.intakeflow_snapshot.avg_purchase_today || 0)}</td></tr>
            <tr><td>Purchases (14 days)</td><td>${pack.intakeflow_snapshot.purchase_count_14d || 0}</td><td>${money(pack.intakeflow_snapshot.purchase_total_14d || 0)}</td></tr>
            <tr><td>Average purchase (14 days)</td><td>—</td><td>${money(pack.intakeflow_snapshot.avg_purchase_14d || 0)}</td></tr>
            <tr><td>IMEIs registered today</td><td>${pack.intakeflow_snapshot.imei_count || 0}</td><td>—</td></tr>
            <tr><td>IMEIs registered (14 days)</td><td>${pack.intakeflow_snapshot.imei_count_14d || 0}</td><td>—</td></tr>
            <tr><td>Swaps today</td><td>${pack.intakeflow_snapshot.swap_count || 0}</td><td>${money(pack.intakeflow_snapshot.swap_collected || 0)}</td></tr>
            <tr><td>Swaps (14 days)</td><td>${pack.intakeflow_snapshot.swap_count_14d || 0}</td><td>${money(pack.intakeflow_snapshot.swap_collected_14d || 0)}</td></tr>
            <tr><td>Supplier payments today</td><td>${pack.intakeflow_snapshot.supplier_payment_count || 0}</td><td>${money(pack.intakeflow_snapshot.supplier_payment_total || 0)}</td></tr>
            <tr><td>Supplier payments (14 days)</td><td>${pack.intakeflow_snapshot.supplier_payment_count_14d || 0}</td><td>${money(pack.intakeflow_snapshot.supplier_payment_total_14d || 0)}</td></tr>
            <tr><td>Supplier returns today</td><td>${pack.intakeflow_snapshot.supplier_return_count || 0}</td><td>${money(pack.intakeflow_snapshot.supplier_return_total || 0)}</td></tr>
            <tr><td>Supplier returns (14 days)</td><td>${pack.intakeflow_snapshot.supplier_return_count_14d || 0}</td><td>${money(pack.intakeflow_snapshot.supplier_return_total_14d || 0)}</td></tr>
            <tr><td>Intake events today</td><td>${pack.intakeflow_snapshot.intake_count_today || 0}</td><td>—</td></tr>
            <tr><td>Intake events (14 days)</td><td>${pack.intakeflow_snapshot.intake_count_14d || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No intakeflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Supplierflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.supplierflow_snapshot ? `<tr><td>Suppliers owing</td><td>${pack.supplierflow_snapshot.owing_supplier_count || 0}</td><td>${money(pack.supplierflow_snapshot.payable_total || 0)}</td></tr>
            <tr><td>Average balance owing</td><td>—</td><td>${money(pack.supplierflow_snapshot.avg_balance_owing || 0)}</td></tr>
            <tr><td>Open payables</td><td>${pack.supplierflow_snapshot.open_payable_count || 0}</td><td>${money(pack.supplierflow_snapshot.open_payable_total || 0)}</td></tr>
            <tr><td>Aged payables</td><td>${pack.supplierflow_snapshot.aged_payable_count || 0}</td><td>${money(pack.supplierflow_snapshot.aged_payable_total || 0)}</td></tr>
            <tr><td>Aged share</td><td>${pack.supplierflow_snapshot.aged_share_pct || 0}</td><td>%</td></tr>
            <tr><td>Open purchase orders</td><td>${pack.supplierflow_snapshot.open_po_count || 0}</td><td>${money(pack.supplierflow_snapshot.open_po_total || 0)}</td></tr>
            <tr><td>Supplier payments today</td><td>${pack.supplierflow_snapshot.supplier_payment_count_today || 0}</td><td>${money(pack.supplierflow_snapshot.supplier_payment_total_today || 0)}</td></tr>
            <tr><td>Supplier payments (14 days)</td><td>${pack.supplierflow_snapshot.supplier_payment_count_14d || 0}</td><td>${money(pack.supplierflow_snapshot.supplier_payment_total_14d || 0)}</td></tr>
            <tr><td>Supplier returns today</td><td>${pack.supplierflow_snapshot.supplier_return_count_today || 0}</td><td>${money(pack.supplierflow_snapshot.supplier_return_total_today || 0)}</td></tr>
            <tr><td>Supplier returns (14 days)</td><td>${pack.supplierflow_snapshot.supplier_return_count_14d || 0}</td><td>${money(pack.supplierflow_snapshot.supplier_return_total_14d || 0)}</td></tr>` : '<tr><td colspan="3">No supplierflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Inventoryflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.inventoryflow_snapshot ? `<tr><td>Available stock</td><td>${pack.inventoryflow_snapshot.available_qty || 0}</td><td>${money(pack.inventoryflow_snapshot.available_value || 0)}</td></tr>
            <tr><td>Average unit value</td><td>—</td><td>${money(pack.inventoryflow_snapshot.avg_unit_value || 0)}</td></tr>
            <tr><td>On-hand value</td><td>—</td><td>${money(pack.inventoryflow_snapshot.on_hand_value || 0)}</td></tr>
            <tr><td>Faulty units</td><td>${pack.inventoryflow_snapshot.faulty_qty || 0}</td><td>${money(pack.inventoryflow_snapshot.faulty_value || 0)}</td></tr>
            <tr><td>Faulty share</td><td>${pack.inventoryflow_snapshot.faulty_share_pct || 0}</td><td>%</td></tr>
            <tr><td>Low stock alerts</td><td>${pack.inventoryflow_snapshot.low_stock_count || 0}</td><td>—</td></tr>
            <tr><td>Low stock units</td><td>${pack.inventoryflow_snapshot.low_stock_qty || 0}</td><td>—</td></tr>
            <tr><td>Lowest available</td><td>${pack.inventoryflow_snapshot.lowest_available || 0}</td><td>—</td></tr>
            <tr><td>IMEI on hand</td><td>${pack.inventoryflow_snapshot.imei_total || 0}</td><td>—</td></tr>
            <tr><td>IMEI statuses</td><td>${pack.inventoryflow_snapshot.status_count || 0}</td><td>—</td></tr>
            <tr><td>IMEI available</td><td>${pack.inventoryflow_snapshot.imei_available || 0}</td><td>—</td></tr>
            <tr><td>IMEI sold</td><td>${pack.inventoryflow_snapshot.imei_sold || 0}</td><td>—</td></tr>
            <tr><td>IMEIs registered today</td><td>${pack.inventoryflow_snapshot.imei_registered_today || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No inventoryflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Staffflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.staffflow_snapshot ? `<tr><td>Staff with sales (14d)</td><td>${pack.staffflow_snapshot.staff_count || 0}</td><td>—</td></tr>
            <tr><td>Staff invoices (14d)</td><td>${pack.staffflow_snapshot.staff_invoices || 0}</td><td>${money(pack.staffflow_snapshot.staff_revenue || 0)}</td></tr>
            <tr><td>Average revenue per staff</td><td>—</td><td>${money(pack.staffflow_snapshot.avg_revenue_per_staff || 0)}</td></tr>
            <tr><td>Staff profit (14d)</td><td>${pack.staffflow_snapshot.staff_invoices || 0}</td><td>${money(pack.staffflow_snapshot.staff_profit || 0)}</td></tr>
            <tr><td>Collection rate (14d)</td><td>${pack.staffflow_snapshot.collection_rate_14d || 0}</td><td>%</td></tr>
            <tr><td>Top staff (14d)</td><td>${pack.staffflow_snapshot.top_staff_invoices || 0}</td><td>${escapeHtml(pack.staffflow_snapshot.top_staff_name || '—')}</td></tr>
            <tr><td>Top staff revenue (14d)</td><td>—</td><td>${money(pack.staffflow_snapshot.top_staff_revenue || 0)}</td></tr>
            <tr><td>Top staff collection rate</td><td>${pack.staffflow_snapshot.top_staff_collection_rate || 0}</td><td>%</td></tr>
            <tr><td>Active branches (14d)</td><td>${pack.staffflow_snapshot.branch_count || 0}</td><td>${money(pack.staffflow_snapshot.branch_revenue || 0)}</td></tr>
            <tr><td>Top branch revenue (14d)</td><td>—</td><td>${money(pack.staffflow_snapshot.top_branch_revenue || 0)}</td></tr>
            <tr><td>Device lines (14d)</td><td>${pack.staffflow_snapshot.device_line_count || 0}</td><td>—</td></tr>
            <tr><td>Devices sold today</td><td>${pack.staffflow_snapshot.devices_today || 0}</td><td>${money(pack.staffflow_snapshot.device_revenue_today || 0)}</td></tr>
            <tr><td>Sales today</td><td>${pack.staffflow_snapshot.sales_today_count || 0}</td><td>${money(pack.staffflow_snapshot.sales_today_total || 0)}</td></tr>` : '<tr><td colspan="3">No staffflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Branchflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.branchflow_snapshot ? `<tr><td>Branches in network</td><td>${pack.branchflow_snapshot.branch_count || 0}</td><td>—</td></tr>
            <tr><td>Active branches (14d)</td><td>${pack.branchflow_snapshot.active_branch_count || 0}</td><td>—</td></tr>
            <tr><td>Invoices (14d)</td><td>${pack.branchflow_snapshot.invoice_count || 0}</td><td>${money(pack.branchflow_snapshot.revenue_14d || 0)}</td></tr>
            <tr><td>Average revenue per branch</td><td>—</td><td>${money(pack.branchflow_snapshot.avg_revenue_per_branch || 0)}</td></tr>
            <tr><td>Collected (14d)</td><td>—</td><td>${money(pack.branchflow_snapshot.collected_14d || 0)}</td></tr>
            <tr><td>Collection rate (14d)</td><td>${pack.branchflow_snapshot.collection_rate_14d || 0}</td><td>%</td></tr>
            <tr><td>Profit (14d)</td><td>—</td><td>${money(pack.branchflow_snapshot.profit_14d || 0)}</td></tr>
            <tr><td>Average profit per branch</td><td>—</td><td>${money(pack.branchflow_snapshot.avg_profit_per_branch || 0)}</td></tr>
            <tr><td>Outstanding due</td><td>—</td><td>${money(pack.branchflow_snapshot.due_total || 0)}</td></tr>
            <tr><td>Due share</td><td>${pack.branchflow_snapshot.due_share_pct || 0}</td><td>%</td></tr>
            <tr><td>Network stock</td><td>${pack.branchflow_snapshot.stock_qty || 0}</td><td>${money(pack.branchflow_snapshot.stock_value || 0)}</td></tr>
            <tr><td>Top branch (14d)</td><td>${pack.branchflow_snapshot.top_branch_invoices || 0}</td><td>${escapeHtml(pack.branchflow_snapshot.top_branch_name || '—')}</td></tr>
            <tr><td>Top branch revenue (14d)</td><td>—</td><td>${money(pack.branchflow_snapshot.top_branch_revenue || 0)}</td></tr>
            <tr><td>Top branch profit (14d)</td><td>—</td><td>${money(pack.branchflow_snapshot.top_branch_profit || 0)}</td></tr>
            <tr><td>Top branch collection rate</td><td>${pack.branchflow_snapshot.top_branch_collection_rate || 0}</td><td>%</td></tr>` : '<tr><td colspan="3">No branchflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Cashflowflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.cashflowflow_snapshot ? `<tr><td>Cash in (14d)</td><td>—</td><td>${money(pack.cashflowflow_snapshot.inflows_14d || 0)}</td></tr>
            <tr><td>Outflows (14d)</td><td>—</td><td>${money(pack.cashflowflow_snapshot.outflows_14d || 0)}</td></tr>
            <tr><td>Net cash (14d)</td><td>—</td><td>${money(pack.cashflowflow_snapshot.net_14d || 0)}</td></tr>
            <tr><td>Average daily inflow (14d)</td><td>—</td><td>${money(pack.cashflowflow_snapshot.avg_daily_inflow_14d || 0)}</td></tr>
            <tr><td>Average daily net (14d)</td><td>—</td><td>${money(pack.cashflowflow_snapshot.avg_daily_net_14d || 0)}</td></tr>
            <tr><td>At sale (14d)</td><td>—</td><td>${money(pack.cashflowflow_snapshot.at_sale_14d || 0)}</td></tr>
            <tr><td>Collections (14d)</td><td>—</td><td>${money(pack.cashflowflow_snapshot.collections_14d || 0)}</td></tr>
            <tr><td>Collection share (14d)</td><td>${pack.cashflowflow_snapshot.collection_share_pct || 0}</td><td>%</td></tr>
            <tr><td>Expenses (14d)</td><td>—</td><td>${money(pack.cashflowflow_snapshot.expenses_14d || 0)}</td></tr>
            <tr><td>Supplier payments (14d)</td><td>—</td><td>${money(pack.cashflowflow_snapshot.supplier_payments_14d || 0)}</td></tr>
            <tr><td>Refunds (14d)</td><td>—</td><td>${money(pack.cashflowflow_snapshot.refunds_14d || 0)}</td></tr>
            <tr><td>Outflow share (14d)</td><td>${pack.cashflowflow_snapshot.outflow_share_pct || 0}</td><td>%</td></tr>
            <tr><td>Top payment method (14d)</td><td>${pack.cashflowflow_snapshot.payment_method_count || 0}</td><td>${escapeHtml(pack.cashflowflow_snapshot.top_payment_method || '—')}</td></tr>
            <tr><td>Top method collected (14d)</td><td>—</td><td>${money(pack.cashflowflow_snapshot.top_payment_collected || 0)}</td></tr>
            <tr><td>Cash in today</td><td>—</td><td>${money(pack.cashflowflow_snapshot.inflows_today || 0)}</td></tr>
            <tr><td>At sale today</td><td>—</td><td>${money(pack.cashflowflow_snapshot.at_sale_today || 0)}</td></tr>
            <tr><td>Collections today</td><td>—</td><td>${money(pack.cashflowflow_snapshot.collections_today || 0)}</td></tr>
            <tr><td>Outflows today</td><td>—</td><td>${money(pack.cashflowflow_snapshot.outflows_today || 0)}</td></tr>
            <tr><td>Expenses today</td><td>—</td><td>${money(pack.cashflowflow_snapshot.expenses_today || 0)}</td></tr>
            <tr><td>Supplier payments today</td><td>—</td><td>${money(pack.cashflowflow_snapshot.supplier_payments_today || 0)}</td></tr>
            <tr><td>Refunds today</td><td>—</td><td>${money(pack.cashflowflow_snapshot.refunds_today || 0)}</td></tr>
            <tr><td>Net cash today</td><td>—</td><td>${money(pack.cashflowflow_snapshot.net_today || 0)}</td></tr>` : '<tr><td colspan="3">No cashflowflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Mixflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.mixflow_snapshot ? `<tr><td>Payment methods (14d)</td><td>${pack.mixflow_snapshot.payment_method_count || 0}</td><td>${money(pack.mixflow_snapshot.payment_collected_14d || 0)}</td></tr>
            <tr><td>Top payment method (14d)</td><td>—</td><td>${money(pack.mixflow_snapshot.top_payment_collected || 0)}</td></tr>
            <tr><td>Top payment share (14d)</td><td>${pack.mixflow_snapshot.top_payment_share_pct || 0}</td><td>%</td></tr>
            <tr><td>Retail invoices (14d)</td><td>${pack.mixflow_snapshot.retail_invoices || 0}</td><td>${money(pack.mixflow_snapshot.retail_revenue || 0)}</td></tr>
            <tr><td>Wholesale invoices (14d)</td><td>${pack.mixflow_snapshot.wholesale_invoices || 0}</td><td>${money(pack.mixflow_snapshot.wholesale_revenue || 0)}</td></tr>
            <tr><td>Retail share (14d)</td><td>${pack.mixflow_snapshot.retail_share_pct || 0}</td><td>%</td></tr>
            <tr><td>Wholesale share (14d)</td><td>${pack.mixflow_snapshot.wholesale_share_pct || 0}</td><td>%</td></tr>
            <tr><td>Total invoices (14d)</td><td>${pack.mixflow_snapshot.invoice_count || 0}</td><td>${money(pack.mixflow_snapshot.sales_14d || 0)}</td></tr>
            <tr><td>Average invoice value (14d)</td><td>—</td><td>${money(pack.mixflow_snapshot.avg_invoice_value_14d || 0)}</td></tr>
            <tr><td>Sale channels (14d)</td><td>${pack.mixflow_snapshot.sale_type_count || 0}</td><td>—</td></tr>
            <tr><td>Invoices today</td><td>${pack.mixflow_snapshot.invoices_today || 0}</td><td>${money(pack.mixflow_snapshot.sales_today || 0)}</td></tr>
            <tr><td>Retail today</td><td>${pack.mixflow_snapshot.retail_invoices_today || 0}</td><td>${money(pack.mixflow_snapshot.retail_revenue_today || 0)}</td></tr>
            <tr><td>Wholesale today</td><td>${pack.mixflow_snapshot.wholesale_invoices_today || 0}</td><td>${money(pack.mixflow_snapshot.wholesale_revenue_today || 0)}</td></tr>
            <tr><td>Payment methods today</td><td>${pack.mixflow_snapshot.payment_method_count_today || 0}</td><td>${money(pack.mixflow_snapshot.payment_collected_today || 0)}</td></tr>` : '<tr><td colspan="3">No mixflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Trendflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.trendflow_snapshot ? `<tr><td>Active days (14d)</td><td>${pack.trendflow_snapshot.active_day_count || 0}</td><td>—</td></tr>
            <tr><td>Inactive days (14d)</td><td>${pack.trendflow_snapshot.inactive_day_count || 0}</td><td>—</td></tr>
            <tr><td>Invoices (14d)</td><td>${pack.trendflow_snapshot.invoice_count || 0}</td><td>${money(pack.trendflow_snapshot.sales_14d || 0)}</td></tr>
            <tr><td>Average invoices per active day</td><td>${pack.trendflow_snapshot.avg_invoices_per_active_day || 0}</td><td>—</td></tr>
            <tr><td>Collected (14d)</td><td>—</td><td>${money(pack.trendflow_snapshot.collected_14d || 0)}</td></tr>
            <tr><td>Collection rate (14d)</td><td>${pack.trendflow_snapshot.collection_rate_14d || 0}</td><td>%</td></tr>
            <tr><td>Average daily sales</td><td>—</td><td>${money(pack.trendflow_snapshot.avg_daily_net || 0)}</td></tr>
            <tr><td>Average daily collected</td><td>—</td><td>${money(pack.trendflow_snapshot.avg_daily_collected_14d || 0)}</td></tr>
            <tr><td>Best day</td><td>—</td><td>${money(pack.trendflow_snapshot.best_day_net || 0)}</td></tr>
            <tr><td>Best day share (14d)</td><td>${pack.trendflow_snapshot.best_day_share_pct || 0}</td><td>%</td></tr>
            <tr><td>Sales today</td><td>${pack.trendflow_snapshot.invoices_today || 0}</td><td>${money(pack.trendflow_snapshot.sales_today || 0)}</td></tr>
            <tr><td>Collected today</td><td>—</td><td>${money(pack.trendflow_snapshot.collected_today || 0)}</td></tr>
            <tr><td>Today vs average (14d)</td><td>${pack.trendflow_snapshot.today_vs_avg_pct || 0}</td><td>%</td></tr>
            <tr><td>Sales yesterday</td><td>${pack.trendflow_snapshot.invoices_yesterday || 0}</td><td>${money(pack.trendflow_snapshot.sales_yesterday || 0)}</td></tr>
            <tr><td>Velocity last 7 days</td><td>—</td><td>${money(pack.trendflow_snapshot.velocity_7d_net || 0)}</td></tr>
            <tr><td>Velocity prior 7 days</td><td>—</td><td>${money(pack.trendflow_snapshot.velocity_prior_7d_net || 0)}</td></tr>
            <tr><td>Velocity change</td><td>${pack.trendflow_snapshot.velocity_change_pct || 0}</td><td>%</td></tr>` : '<tr><td colspan="3">No trendflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Productflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.productflow_snapshot ? `<tr><td>Top sellers (14d)</td><td>${pack.productflow_snapshot.top_seller_count || 0}</td><td>${money(pack.productflow_snapshot.top_seller_revenue || 0)}</td></tr>
            <tr><td>Top seller units (14d)</td><td>${pack.productflow_snapshot.top_seller_units || 0}</td><td>${money(pack.productflow_snapshot.top_seller_profit || 0)}</td></tr>
            <tr><td>Average revenue per unit</td><td>—</td><td>${money(pack.productflow_snapshot.avg_revenue_per_unit || 0)}</td></tr>
            <tr><td>Average profit per unit</td><td>—</td><td>${money(pack.productflow_snapshot.avg_profit_per_unit || 0)}</td></tr>
            <tr><td>Profit margin (14d)</td><td>${pack.productflow_snapshot.profit_margin_pct || 0}</td><td>%</td></tr>
            <tr><td>Top product (14d)</td><td>${pack.productflow_snapshot.top_product_units || 0}</td><td>${escapeHtml(pack.productflow_snapshot.top_product_name || '—')}</td></tr>
            <tr><td>Top product revenue (14d)</td><td>—</td><td>${money(pack.productflow_snapshot.top_product_revenue || 0)}</td></tr>
            <tr><td>Top product profit (14d)</td><td>—</td><td>${money(pack.productflow_snapshot.top_product_profit || 0)}</td></tr>
            <tr><td>Top product share (14d)</td><td>${pack.productflow_snapshot.top_product_share_pct || 0}</td><td>%</td></tr>
            <tr><td>Slow movers</td><td>${pack.productflow_snapshot.slow_mover_count || 0}</td><td>—</td></tr>
            <tr><td>Slow mover units</td><td>${pack.productflow_snapshot.slow_mover_qty || 0}</td><td>—</td></tr>
            <tr><td>Slow mover share</td><td>${pack.productflow_snapshot.slow_mover_share_pct || 0}</td><td>%</td></tr>
            <tr><td>Low stock alerts</td><td>${pack.productflow_snapshot.low_stock_count || 0}</td><td>—</td></tr>
            <tr><td>Low stock units</td><td>${pack.productflow_snapshot.low_stock_qty || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No productflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Ledgerflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.ledgerflow_snapshot ? `<tr><td>Customer receivables</td><td>${pack.ledgerflow_snapshot.receivable_party_count || 0}</td><td>${money(pack.ledgerflow_snapshot.receivable_total || 0)}</td></tr>
            <tr><td>Average receivable per customer</td><td>—</td><td>${money(pack.ledgerflow_snapshot.avg_receivable_per_customer || 0)}</td></tr>
            <tr><td>Supplier payables</td><td>${pack.ledgerflow_snapshot.payable_party_count || 0}</td><td>${money(pack.ledgerflow_snapshot.payable_total || 0)}</td></tr>
            <tr><td>Average payable per supplier</td><td>—</td><td>${money(pack.ledgerflow_snapshot.avg_payable_per_supplier || 0)}</td></tr>
            <tr><td>Net position</td><td>—</td><td>${money(pack.ledgerflow_snapshot.net_position || 0)}</td></tr>
            <tr><td>Overdue invoices</td><td>${pack.ledgerflow_snapshot.overdue_count || 0}</td><td>${money(pack.ledgerflow_snapshot.overdue_total || 0)}</td></tr>
            <tr><td>Overdue share</td><td>${pack.ledgerflow_snapshot.overdue_share_pct || 0}</td><td>%</td></tr>
            <tr><td>Open payables</td><td>${pack.ledgerflow_snapshot.payable_party_count || 0}</td><td>${money(pack.ledgerflow_snapshot.open_payable_total || 0)}</td></tr>
            <tr><td>Cash in (14d)</td><td>—</td><td>${money(pack.ledgerflow_snapshot.cash_in_14d || 0)}</td></tr>
            <tr><td>Cash out (14d)</td><td>—</td><td>${money(pack.ledgerflow_snapshot.cash_out_14d || 0)}</td></tr>
            <tr><td>Net cash (14d)</td><td>—</td><td>${money(pack.ledgerflow_snapshot.cash_net_14d || 0)}</td></tr>
            <tr><td>Expenses (14d)</td><td>—</td><td>${money(pack.ledgerflow_snapshot.expenses_14d || 0)}</td></tr>
            <tr><td>Sales (14d)</td><td>—</td><td>${money(pack.ledgerflow_snapshot.sales_14d || 0)}</td></tr>
            <tr><td>Collected (14d)</td><td>—</td><td>${money(pack.ledgerflow_snapshot.collected_14d || 0)}</td></tr>
            <tr><td>Collection rate (14d)</td><td>${pack.ledgerflow_snapshot.collection_rate_14d || 0}</td><td>%</td></tr>
            <tr><td>Cash in today</td><td>—</td><td>${money(pack.ledgerflow_snapshot.cash_in_today || 0)}</td></tr>
            <tr><td>Cash out today</td><td>—</td><td>${money(pack.ledgerflow_snapshot.cash_out_today || 0)}</td></tr>
            <tr><td>Net cash today</td><td>—</td><td>${money(pack.ledgerflow_snapshot.cash_net_today || 0)}</td></tr>
            <tr><td>Expenses today</td><td>—</td><td>${money(pack.ledgerflow_snapshot.expenses_today || 0)}</td></tr>
            <tr><td>Collections today</td><td>—</td><td>${money(pack.ledgerflow_snapshot.collections_today || 0)}</td></tr>` : '<tr><td colspan="3">No ledgerflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Executiveflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.executiveflow_snapshot ? `<tr><td>Sales today</td><td>${pack.executiveflow_snapshot.sales_today_count || 0}</td><td>${money(pack.executiveflow_snapshot.sales_today_total || 0)}</td></tr>
            <tr><td>Average sale today</td><td>—</td><td>${money(pack.executiveflow_snapshot.avg_sale_today || 0)}</td></tr>
            <tr><td>Today vs average (14d)</td><td>${pack.executiveflow_snapshot.today_vs_avg_14d_pct || 0}</td><td>%</td></tr>
            <tr><td>Sales (14d)</td><td>—</td><td>${money(pack.executiveflow_snapshot.sales_14d || 0)}</td></tr>
            <tr><td>Collected (14d)</td><td>—</td><td>${money(pack.executiveflow_snapshot.collected_14d || 0)}</td></tr>
            <tr><td>Collection rate (14d)</td><td>${pack.executiveflow_snapshot.collection_rate_14d || 0}</td><td>%</td></tr>
            <tr><td>Net cash today</td><td>—</td><td>${money(pack.executiveflow_snapshot.cash_net_today || 0)}</td></tr>
            <tr><td>Net cash (14d)</td><td>—</td><td>${money(pack.executiveflow_snapshot.cash_net_14d || 0)}</td></tr>
            <tr><td>Customer receivables</td><td>${pack.executiveflow_snapshot.receivable_party_count || 0}</td><td>${money(pack.executiveflow_snapshot.receivable_total || 0)}</td></tr>
            <tr><td>Supplier payables</td><td>${pack.executiveflow_snapshot.payable_party_count || 0}</td><td>${money(pack.executiveflow_snapshot.payable_total || 0)}</td></tr>
            <tr><td>Net position</td><td>—</td><td>${money(pack.executiveflow_snapshot.net_position || 0)}</td></tr>
            <tr><td>Overdue invoices</td><td>${pack.executiveflow_snapshot.overdue_count || 0}</td><td>${money(pack.executiveflow_snapshot.overdue_total || 0)}</td></tr>
            <tr><td>Overdue share</td><td>${pack.executiveflow_snapshot.overdue_share_pct || 0}</td><td>%</td></tr>
            <tr><td>Collections today</td><td>—</td><td>${money(pack.executiveflow_snapshot.collections_today || 0)}</td></tr>
            <tr><td>Operations load</td><td>${pack.executiveflow_snapshot.operations_load || 0}</td><td>—</td></tr>
            <tr><td>Open repairs</td><td>${pack.executiveflow_snapshot.open_repair_count || 0}</td><td>—</td></tr>
            <tr><td>Pending approvals</td><td>${pack.executiveflow_snapshot.pending_approval_count || 0}</td><td>—</td></tr>
            <tr><td>In transit</td><td>${pack.executiveflow_snapshot.in_transit_count || 0}</td><td>—</td></tr>
            <tr><td>Available stock</td><td>${pack.executiveflow_snapshot.available_qty || 0}</td><td>${money(pack.executiveflow_snapshot.available_value || 0)}</td></tr>
            <tr><td>Alert load</td><td>${pack.executiveflow_snapshot.alert_load || 0}</td><td>—</td></tr>
            <tr><td>Low stock alerts</td><td>${pack.executiveflow_snapshot.low_stock_count || 0}</td><td>—</td></tr>
            <tr><td>Unread alerts</td><td>${pack.executiveflow_snapshot.notify_unread || 0}</td><td>—</td></tr>` : '<tr><td colspan="3">No executiveflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Agingflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.agingflow_snapshot ? `<tr><td>Open receivables</td><td>${pack.agingflow_snapshot.receivable_line_count || 0}</td><td>${money(pack.agingflow_snapshot.receivable_total || 0)}</td></tr>
            <tr><td>Receivables 0–30 days</td><td>1</td><td>${money(pack.agingflow_snapshot.receivable_0_30 || 0)}</td></tr>
            <tr><td>Receivables 31–60 days</td><td>1</td><td>${money(pack.agingflow_snapshot.receivable_31_60 || 0)}</td></tr>
            <tr><td>Receivables 61–90 days</td><td>1</td><td>${money(pack.agingflow_snapshot.receivable_61_90 || 0)}</td></tr>
            <tr><td>Receivables 90+ days</td><td>1</td><td>${money(pack.agingflow_snapshot.receivable_90_plus || 0)}</td></tr>
            <tr><td>Receivable stale total</td><td>—</td><td>${money(pack.agingflow_snapshot.receivable_stale_total || 0)}</td></tr>
            <tr><td>Receivable current share</td><td>${pack.agingflow_snapshot.receivable_current_share_pct || 0}</td><td>%</td></tr>
            <tr><td>Receivable aged share (90+)</td><td>${pack.agingflow_snapshot.receivable_aged_share_pct || 0}</td><td>%</td></tr>
            <tr><td>Open payables</td><td>${pack.agingflow_snapshot.payable_line_count || 0}</td><td>${money(pack.agingflow_snapshot.payable_total || 0)}</td></tr>
            <tr><td>Payables 0–30 days</td><td>1</td><td>${money(pack.agingflow_snapshot.payable_0_30 || 0)}</td></tr>
            <tr><td>Payables 31–60 days</td><td>1</td><td>${money(pack.agingflow_snapshot.payable_31_60 || 0)}</td></tr>
            <tr><td>Payables 61–90 days</td><td>1</td><td>${money(pack.agingflow_snapshot.payable_61_90 || 0)}</td></tr>
            <tr><td>Payables 90+ days</td><td>1</td><td>${money(pack.agingflow_snapshot.payable_90_plus || 0)}</td></tr>
            <tr><td>Payable stale total</td><td>—</td><td>${money(pack.agingflow_snapshot.payable_stale_total || 0)}</td></tr>
            <tr><td>Payable current share</td><td>${pack.agingflow_snapshot.payable_current_share_pct || 0}</td><td>%</td></tr>
            <tr><td>Payable aged share (90+)</td><td>${pack.agingflow_snapshot.payable_aged_share_pct || 0}</td><td>%</td></tr>
            <tr><td>Net aging position</td><td>—</td><td>${money(pack.agingflow_snapshot.net_aging_position || 0)}</td></tr>
            <tr><td>Stale share (combined)</td><td>${pack.agingflow_snapshot.stale_share_pct || 0}</td><td>%</td></tr>
            <tr><td>Payment methods (14d)</td><td>${pack.agingflow_snapshot.payment_method_count || 0}</td><td>${money(pack.agingflow_snapshot.payment_collected_14d || 0)}</td></tr>` : '<tr><td colspan="3">No agingflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Tradeflow snapshot</h3>
          <table class="atoms-table"><thead><tr><th>Bucket</th><th>Count</th><th>Amount</th></tr></thead><tbody>
            ${pack.tradeflow_snapshot ? `<tr><td>Wholesale owing</td><td>${pack.tradeflow_snapshot.wholesale_owing_count || 0}</td><td>${money(pack.tradeflow_snapshot.wholesale_owing_total || 0)}</td></tr>
            <tr><td>Retail owing</td><td>${pack.tradeflow_snapshot.retail_owing_count || 0}</td><td>${money(pack.tradeflow_snapshot.retail_owing_total || 0)}</td></tr>
            <tr><td>Total owing</td><td>${pack.tradeflow_snapshot.total_owing_count || 0}</td><td>${money(pack.tradeflow_snapshot.total_owing_total || 0)}</td></tr>
            <tr><td>Wholesale owing share</td><td>${pack.tradeflow_snapshot.wholesale_owing_share_pct || 0}</td><td>%</td></tr>
            <tr><td>Swaps today</td><td>${pack.tradeflow_snapshot.swap_today_count || 0}</td><td>${money(pack.tradeflow_snapshot.swap_collected_today || 0)}</td></tr>
            <tr><td>Swaps (14d)</td><td>${pack.tradeflow_snapshot.swap_14d_count || 0}</td><td>${money(pack.tradeflow_snapshot.swap_collected_14d || 0)}</td></tr>
            <tr><td>Average swap value (14d)</td><td>—</td><td>${money(pack.tradeflow_snapshot.avg_swap_value_14d || 0)}</td></tr>
            <tr><td>Swap collection share (14d)</td><td>${pack.tradeflow_snapshot.swap_collection_share_pct || 0}</td><td>%</td></tr>
            <tr><td>Retail sales (14d)</td><td>${pack.tradeflow_snapshot.retail_invoices_14d || 0}</td><td>${money(pack.tradeflow_snapshot.retail_sales_14d || 0)}</td></tr>
            <tr><td>Wholesale sales (14d)</td><td>${pack.tradeflow_snapshot.wholesale_invoices_14d || 0}</td><td>${money(pack.tradeflow_snapshot.wholesale_sales_14d || 0)}</td></tr>
            <tr><td>Retail share (14d)</td><td>${pack.tradeflow_snapshot.retail_share_pct || 0}</td><td>%</td></tr>
            <tr><td>Wholesale share (14d)</td><td>${pack.tradeflow_snapshot.wholesale_share_pct || 0}</td><td>%</td></tr>` : '<tr><td colspan="3">No tradeflow data.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Today sales</h3>
          <table class="atoms-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Devices</th><th>Total</th><th>Paid</th></tr></thead><tbody>
            ${(pack.today_sales || []).map((l) => `<tr>
              <td>${escapeHtml(l.invoice_number || '')}</td>
              <td>${escapeHtml(l.customer_name || 'Walk-in')}</td>
              <td>${escapeHtml(l.device_summary || '—')}</td>
              <td>${money(l.total)}</td>
              <td>${money(l.paid_amount)}</td>
            </tr>`).join('') || '<tr><td colspan="5">No sales posted today.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Top stock by value</h3>
          <table class="atoms-table"><thead><tr><th>Product</th><th>Variant</th><th>Qty</th><th>Valuation</th></tr></thead><tbody>
            ${(pack.inventory_lines || []).map((p) => `<tr>
              <td>${escapeHtml(p.name || '')}</td>
              <td>${escapeHtml(p.variant_label || '—')}</td>
              <td>${p.total}</td>
              <td>${money(p.valuation)}</td>
            </tr>`).join('') || '<tr><td colspan="4">No available stock.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>IMEI status</h3>
          <table class="atoms-table"><thead><tr><th>Status</th><th>Qty</th></tr></thead><tbody>
            ${(pack.imei_status_lines || []).map((l) => `<tr><td>${badge(l.status)}</td><td>${l.qty}</td></tr>`).join('') || '<tr><td colspan="2">No devices.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Staff device sales (14 days)</h3>
          <table class="atoms-table"><thead><tr><th>Sold by</th><th>Invoice</th><th>IMEI</th><th>Product</th><th>Price</th></tr></thead><tbody>
            ${(pack.staff_devices || []).map((l) => `<tr>
              <td>${escapeHtml(l.salesperson_name || '—')}</td>
              <td>${escapeHtml(l.invoice_number || '')}</td>
              <td>${escapeHtml(l.imei || '')}</td>
              <td>${escapeHtml(l.product_name || '')}${l.variant_label ? `<br><span class="atoms-muted">${escapeHtml(l.variant_label)}</span>` : ''}</td>
              <td>${money(l.selling_price)}</td>
            </tr>`).join('') || '<tr><td colspan="5">No device sales in this window.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Low stock at this branch</h3>
          <table class="atoms-table"><thead><tr><th>Product</th><th>Type</th><th>Available</th><th>Threshold</th></tr></thead><tbody>
            ${(pack.low_stock || []).map((l) => `<tr>
              <td>${escapeHtml(l.name || '')}${l.variant_label ? `<br><span class="atoms-muted">${escapeHtml(l.variant_label)}</span>` : ''}</td>
              <td><span class="atoms-badge">${l.track_mode === 'quantity' ? 'Accessory' : 'Device'}</span></td>
              <td>${l.qty}</td>
              <td>${l.low_stock_threshold}</td>
            </tr>`).join('') || '<tr><td colspan="3">Nothing below threshold.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Top products</h3>
          <table class="atoms-table"><thead><tr><th>Product</th><th>Variant</th><th>Units</th><th>Profit</th></tr></thead><tbody>
            ${(pack.top_products || []).map((p) => `<tr>
              <td>${escapeHtml(p.name || '')}</td>
              <td>${escapeHtml(p.variant_label || '—')}</td>
              <td>${p.units}</td>
              <td>${money(p.profit)}</td>
            </tr>`).join('') || '<tr><td colspan="4">None in this range.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Retail vs wholesale</h3>
          <table class="atoms-table"><thead><tr><th>Type</th><th>Invoices</th><th>Net</th></tr></thead><tbody>
            ${(pack.sale_types || []).map((t) => `<tr>
              <td>${escapeHtml(t.label || t.type || '')}</td>
              <td>${t.invoices}</td>
              <td>${money(t.net)}</td>
            </tr>`).join('') || '<tr><td colspan="3">No sales in this range.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Payment mix</h3>
          <table class="atoms-table"><thead><tr><th>Method</th><th>Invoices</th><th>Collected</th></tr></thead><tbody>
            ${(pack.payment_mix || []).map((m) => `<tr>
              <td>${escapeHtml(m.method || '')}</td>
              <td>${m.invoices}</td>
              <td>${money(m.collected)}</td>
            </tr>`).join('') || '<tr><td colspan="3">No collections in this range.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Sales trend</h3>
          <table class="atoms-table"><thead><tr><th>Date</th><th>Invoices</th><th>Net</th><th>Collected</th></tr></thead><tbody>
            ${(pack.sales_trend || []).filter((t) => t.invoices || t.net || t.collected).map((t) => `<tr>
              <td>${escapeHtml(t.date || '')}</td>
              <td>${t.invoices}</td>
              <td>${money(t.net)}</td>
              <td>${money(t.collected)}</td>
            </tr>`).join('') || '<tr><td colspan="4">No sales in this range.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Receivable aging</h3>
          <div class="atoms-grid" style="margin-bottom:12px">
            <div class="atoms-card"><h3>0–30 days</h3><div class="atoms-metric">${money((pack.receivable_aging?.buckets || {})['0-30'] || 0)}</div></div>
            <div class="atoms-card"><h3>31–60 days</h3><div class="atoms-metric">${money((pack.receivable_aging?.buckets || {})['31-60'] || 0)}</div></div>
            <div class="atoms-card"><h3>61–90 days</h3><div class="atoms-metric">${money((pack.receivable_aging?.buckets || {})['61-90'] || 0)}</div></div>
            <div class="atoms-card"><h3>90+ days</h3><div class="atoms-metric">${money((pack.receivable_aging?.buckets || {})['90+'] || 0)}</div></div>
          </div>
          <table class="atoms-table"><thead><tr><th>Customer</th><th>Invoice</th><th>Devices</th><th>Due</th><th>Days</th></tr></thead><tbody>
            ${(pack.receivable_aging?.lines || []).map((l) => `<tr>
              <td>${escapeHtml(l.name || '')}</td>
              <td>${escapeHtml(l.invoice_number || '')}</td>
              <td>${escapeHtml(l.device_summary || '—')}</td>
              <td>${money(l.amount)}</td>
              <td>${l.days}</td>
            </tr>`).join('') || '<tr><td colspan="5">No open receivables.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Payable aging</h3>
          <div class="atoms-grid" style="margin-bottom:12px">
            <div class="atoms-card"><h3>0–30 days</h3><div class="atoms-metric">${money((pack.payable_aging?.buckets || {})['0-30'] || 0)}</div></div>
            <div class="atoms-card"><h3>31–60 days</h3><div class="atoms-metric">${money((pack.payable_aging?.buckets || {})['31-60'] || 0)}</div></div>
            <div class="atoms-card"><h3>61–90 days</h3><div class="atoms-metric">${money((pack.payable_aging?.buckets || {})['61-90'] || 0)}</div></div>
            <div class="atoms-card"><h3>90+ days</h3><div class="atoms-metric">${money((pack.payable_aging?.buckets || {})['90+'] || 0)}</div></div>
          </div>
          <table class="atoms-table"><thead><tr><th>Supplier</th><th>PO invoice</th><th>Variants</th><th>Amount</th><th>Days</th></tr></thead><tbody>
            ${(pack.payable_aging?.lines || []).map((l) => `<tr>
              <td>${escapeHtml(l.name || '')}</td>
              <td>${escapeHtml(l.invoice_number || '')}</td>
              <td>${escapeHtml(l.variant_summary || '—')}</td>
              <td>${money(l.amount)}</td>
              <td>${l.days}</td>
            </tr>`).join('') || '<tr><td colspan="5">No open payables.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Recent swaps (14 days)</h3>
          <table class="atoms-table"><thead><tr><th>Swap</th><th>Customer</th><th>Devices</th><th>Difference</th><th>Collected</th></tr></thead><tbody>
            ${(pack.recent_swaps || []).map((l) => `<tr>
              <td>${escapeHtml(l.invoice_number || ('#' + l.id))}</td>
              <td>${escapeHtml(l.customer_name || 'Walk-in')}</td>
              <td>${escapeHtml(l.device_summary || '—')}</td>
              <td>${money(l.difference)}</td>
              <td>${money(l.paid_amount)}</td>
            </tr>`).join('') || '<tr><td colspan="5">No swaps in this window.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Slow movers (21d+ on shelf)</h3>
          <table class="atoms-table"><thead><tr><th>Product</th><th>Variant</th><th>Qty</th><th>Oldest</th></tr></thead><tbody>
            ${(pack.slow_movers || []).map((s) => `<tr>
              <td>${escapeHtml(s.name || '')}</td>
              <td>${escapeHtml(s.variant_label || '—')}</td>
              <td>${s.qty}</td>
              <td>${escapeHtml(s.oldest || '')}</td>
            </tr>`).join('') || '<tr><td colspan="4">None sitting idle.</td></tr>'}
          </tbody></table>
        </div>
      </div>
      <div class="atoms-row" style="margin-top:16px">
        <div class="atoms-card">
          <h3>Branches</h3>
          <table class="atoms-table"><thead><tr><th>Branch</th><th>Invoices</th><th>Revenue</th><th>Collected</th><th>Due</th><th>Profit</th><th>Stock</th><th>Collection</th></tr></thead><tbody>
            ${(pack.branches || []).map((b) => `<tr>
              <td>${escapeHtml(b.name)}</td>
              <td>${b.invoices}</td>
              <td>${money(b.revenue)}</td>
              <td>${money(b.collected)}</td>
              <td>${money(b.due)}</td>
              <td>${money(b.profit)}</td>
              <td>${b.stock_qty} · ${money(b.stock_value)}</td>
              <td>${Number(b.collection_rate || 0)}%</td>
            </tr>`).join('') || '<tr><td colspan="8">No branches.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Staff</h3>
          <table class="atoms-table"><thead><tr><th>Sold by</th><th>Invoices</th><th>Revenue</th><th>Collected</th><th>Profit</th><th>Collection</th></tr></thead><tbody>
            ${(pack.staff || []).map((s) => `<tr>
              <td>${escapeHtml(s.name)}</td>
              <td>${s.invoices}</td>
              <td>${money(s.revenue)}</td>
              <td>${money(s.collected)}</td>
              <td>${money(s.profit)}</td>
              <td>${Number(s.collection_rate || 0)}%</td>
            </tr>`).join('') || '<tr><td colspan="6">No sales in this period.</td></tr>'}
          </tbody></table>
        </div>
      </div>`;
  }

  async function screenAnalytics() {
    const data = await api(`analytics?days=14&branch_id=${state.branchId || ''}`);
    const aging = data.aging?.buckets || {};
    const ex = data.executive_snapshot || {};
    const ops = data.operations_snapshot || {};
    const intake = data.intake_snapshot || {};
    const cashToday = data.today_cash_snapshot || {};
    const activeTab = state.analyticsTab || 'overview';
    const trend = data.trend_lines || data.trend || [];
    const mix = data.payment_mix_lines || data.mix || [];
    const saleTypes = data.sale_type_lines || data.sale_types || [];
    const tabBtn = (id, label, icon) => `<button type="button" class="atoms-seg-tab js-analytics-tab${activeTab === id ? ' is-active' : ''}" data-analytics-tab="${id}" role="tab" aria-selected="${activeTab === id ? 'true' : 'false'}"><span class="material-symbols-outlined" aria-hidden="true">${icon}</span>${label}</button>`;
    const opsLoad = (ops.open_repair_count || 0) + (ops.pending_approval_count || 0) + (ops.in_transit_count || 0);

    return `
      ${pageShell({
        group: 'Money & reports',
        trail: 'Trends & charts',
        title: 'Analytics desk',
        subtitle: 'Charts first, then drill into money, stock, operations, and performance — last 14 days.',
        actions: '<a class="atoms-back-btn" href="#/dashboard"><span class="material-symbols-outlined">arrow_back</span><span>Back to overview</span></a><a class="atoms-btn ghost sm" href="#/reports"><span class="material-symbols-outlined">summarize</span> Reports</a>',
      })}
      <div class="atoms-analytics-desk">
        <div class="atoms-analytics-tabs atoms-seg-tabs" role="tablist" aria-label="Analytics views">
          ${tabBtn('overview', 'Overview', 'monitoring')}
          ${tabBtn('details', 'Full desk', 'table_chart')}
        </div>

        <div class="atoms-analytics-pane${activeTab === 'overview' ? '' : ' hidden'}" data-analytics-pane="overview">
          <div class="atoms-analytics-kpi-grid">
            ${kpiCard('Sales today', money(ex.sales_today_total || 0), kpiTrendFoot(`${ex.sales_today_count || 0} invoice(s)`), '', 'point_of_sale')}
            ${kpiCard('Net cash today', money(ex.cash_net_today || cashToday.net || 0), kpiTrendFoot('In minus out'), Number(ex.cash_net_today || cashToday.net || 0) < 0 ? 'danger' : 'ok', 'account_balance_wallet')}
            ${kpiCard('Receivables', money(ex.receivable_total || 0), kpiTrendFoot(`${ex.overdue_count || 0} overdue · ${money(ex.overdue_total || 0)}`), Number(ex.overdue_count || 0) > 0 ? 'warn' : '', 'trending_up')}
            ${kpiCard('Ops load', opsLoad, kpiTrendFoot(`${ops.open_repair_count || 0} repairs · ${ops.pending_approval_count || 0} approvals · ${ops.in_transit_count || 0} transit`), ((ops.open_repair_count || 0) + (ops.pending_approval_count || 0)) > 0 ? 'warn' : 'ok', 'hub')}
          </div>

          <div class="atoms-analytics-stage">
            <div class="atoms-chart-card">
              <div class="atoms-chart-card-head">
                <div>
                  <h3>Sales trend</h3>
                  <p class="atoms-chart-card-sub">Net sales · last 14 days</p>
                </div>
                <a class="atoms-btn ghost sm" href="#/reports">Open reports</a>
              </div>
              ${barChart(trend, 'net', 'date', 'Net sales', { home: true })}
            </div>
            <div class="atoms-analytics-stage-side">
              <div class="atoms-chart-card">
                <div class="atoms-chart-card-head">
                  <div>
                    <h3>Payment mix</h3>
                    <p class="atoms-chart-card-sub">Collected by method</p>
                  </div>
                </div>
                ${doughnutChart(mix, 'collected', 'method', 'Collected', { home: true })}
              </div>
              <div class="atoms-chart-card">
                <div class="atoms-chart-card-head">
                  <div>
                    <h3>Channel mix</h3>
                    <p class="atoms-chart-card-sub">Retail vs wholesale</p>
                  </div>
                </div>
                ${doughnutChart(saleTypes, 'net', 'label', 'Channels', { home: true })}
              </div>
            </div>
          </div>

          <div class="atoms-analytics-health">
            <section class="atoms-analytics-section">
              <header class="atoms-analytics-section-head">
                <h3>Cash today</h3>
                <span class="atoms-muted">Branch pulse</span>
              </header>
              <div class="atoms-analytics-tiles atoms-analytics-tiles--3">
                <div class="atoms-analytics-tile"><span class="atoms-analytics-tile-label">Cash in</span><span class="atoms-analytics-tile-value">${money(cashToday.inflows || 0)}</span></div>
                <div class="atoms-analytics-tile"><span class="atoms-analytics-tile-label">Outflows</span><span class="atoms-analytics-tile-value">${money(cashToday.outflows || 0)}</span></div>
                <div class="atoms-analytics-tile"><span class="atoms-analytics-tile-label">Net</span><span class="atoms-analytics-tile-value">${money(cashToday.net || 0)}</span></div>
              </div>
            </section>
            <section class="atoms-analytics-section">
              <header class="atoms-analytics-section-head">
                <h3>Intake & receiving</h3>
                <span class="atoms-muted">Today</span>
              </header>
              <div class="atoms-analytics-tiles">
                <div class="atoms-analytics-tile"><span class="atoms-analytics-tile-label">Purchases</span><span class="atoms-analytics-tile-value">${intake.purchase_count || 0}</span><span class="atoms-analytics-tile-muted">${money(intake.purchase_total || 0)}</span></div>
                <div class="atoms-analytics-tile"><span class="atoms-analytics-tile-label">IMEIs registered</span><span class="atoms-analytics-tile-value">${intake.imei_count || 0}</span></div>
                <div class="atoms-analytics-tile"><span class="atoms-analytics-tile-label">Inbound reserved</span><span class="atoms-analytics-tile-value">${intake.inbound_reserved_count || 0}</span><span class="atoms-analytics-tile-muted">awaiting receipt</span></div>
                <div class="atoms-analytics-tile"><span class="atoms-analytics-tile-label">Supplier payments</span><span class="atoms-analytics-tile-value">${intake.supplier_payment_count || 0}</span><span class="atoms-analytics-tile-muted">${money(intake.supplier_payment_total || 0)}</span></div>
                <div class="atoms-analytics-tile"><span class="atoms-analytics-tile-label">Swaps</span><span class="atoms-analytics-tile-value">${intake.swap_count || 0}</span><span class="atoms-analytics-tile-muted">${money(intake.swap_collected || 0)}</span></div>
              </div>
            </section>
            <section class="atoms-analytics-section">
              <header class="atoms-analytics-section-head">
                <h3>Operations queue</h3>
                <span class="atoms-muted">Needs attention</span>
              </header>
              <div class="atoms-analytics-tiles">
                <div class="atoms-analytics-tile${(ops.open_repair_count || 0) > 0 ? ' is-warn' : ''}"><span class="atoms-analytics-tile-label">Open repairs</span><span class="atoms-analytics-tile-value">${ops.open_repair_count || 0}</span></div>
                <div class="atoms-analytics-tile${(ops.pending_approval_count || 0) > 0 ? ' is-warn' : ''}"><span class="atoms-analytics-tile-label">Pending approvals</span><span class="atoms-analytics-tile-value">${ops.pending_approval_count || 0}</span></div>
                <div class="atoms-analytics-tile"><span class="atoms-analytics-tile-label">In transit</span><span class="atoms-analytics-tile-value">${ops.in_transit_count || 0}</span></div>
                <div class="atoms-analytics-tile"><span class="atoms-analytics-tile-label">Open stock counts</span><span class="atoms-analytics-tile-value">${ops.open_stock_count_count || 0}</span></div>
                <div class="atoms-analytics-tile${(ops.faulty_device_count || 0) > 0 ? ' is-danger' : ''}"><span class="atoms-analytics-tile-label">Faulty devices</span><span class="atoms-analytics-tile-value">${ops.faulty_device_count || 0}</span></div>
                <div class="atoms-analytics-tile"><span class="atoms-analytics-tile-label">Pending expenses</span><span class="atoms-analytics-tile-value">${ops.pending_expense_count || 0}</span><span class="atoms-analytics-tile-muted">${money(ops.pending_expense_total || 0)}</span></div>
              </div>
            </section>
          </div>

          <p class="atoms-analytics-jump">
            <button type="button" class="atoms-btn ghost sm js-analytics-tab" data-analytics-tab="details">
              <span class="material-symbols-outlined">unfold_more</span> Browse full desk
            </button>
          </p>
        </div>

        <div class="atoms-analytics-pane${activeTab === 'details' ? '' : ' hidden'}" data-analytics-pane="details">
          <p class="atoms-analytics-details-lead">All snapshots and line tables for this branch. Scroll or use section headings to find money, stock, ops, and team metrics.</p>
      ${(data.today_sales_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Sales today</h3>
        <table class="atoms-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Devices</th><th>Total</th><th>Paid</th></tr></thead><tbody>
          ${data.today_sales_lines.map((l) => `<tr>
            <td>${escapeHtml(l.invoice_number || '')}</td>
            <td>${escapeHtml(l.customer_name || 'Walk-in')}</td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
            <td>${money(l.total)}</td>
            <td>${money(l.paid_amount)}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.today_purchase_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Purchases today</h3>
        <table class="atoms-table"><thead><tr><th>Supplier</th><th>PO invoice</th><th>Items</th><th>Total</th></tr></thead><tbody>
          ${data.today_purchase_lines.map((l) => `<tr>
            <td>${escapeHtml(l.supplier_name || '')}</td>
            <td>${escapeHtml(l.invoice_number || '')}</td>
            <td>${escapeHtml(l.item_summary || '—')}</td>
            <td>${money(l.total)}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.today_transfer_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Transfers today</h3>
        <table class="atoms-table"><thead><tr><th>Transfer</th><th>Route</th><th>Status</th><th>Devices</th></tr></thead><tbody>
          ${data.today_transfer_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-dash-transit" data-id="${l.id}">${escapeHtml('#' + l.id)}</button></td>
            <td>${escapeHtml(l.from_branch_name || '')} → ${escapeHtml(l.to_branch_name || '')}</td>
            <td>${badge(l.status)}</td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.today_repair_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Repairs completed today</h3>
        <table class="atoms-table"><thead><tr><th>Ticket</th><th>Customer</th><th>Device</th><th>Engineer</th><th>Outcome</th></tr></thead><tbody>
          ${data.today_repair_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-dash-repair" data-id="${l.id}">${escapeHtml(l.ticket_number || '')}</button></td>
            <td>${escapeHtml(l.customer_name || 'Walk-in')}</td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
            <td>${escapeHtml(l.engineer_name || '—')}</td>
            <td>${badge(l.status)}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.today_audit_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Audit activity today</h3>
        <table class="atoms-table"><thead><tr><th>When</th><th>Action</th><th>User</th><th>Summary</th></tr></thead><tbody>
          ${data.today_audit_lines.map((a) => `<tr>
            <td>${escapeHtml(a.created_at || '')}</td>
            <td>${escapeHtml(a.action_label || a.action || '')}</td>
            <td>${escapeHtml(a.user_name || '')}</td>
            <td>${escapeHtml(a.summary || '')}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${data.receivables_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Collections & receivables desk</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Overdue invoices</h3><div class="atoms-metric">${data.receivables_snapshot.overdue_count || 0}<div class="atoms-muted">${money(data.receivables_snapshot.overdue_total || 0)}</div></div></div>
          <div class="atoms-card"><h3>Retail owing</h3><div class="atoms-metric">${data.receivables_snapshot.retail_count || 0}<div class="atoms-muted">${money(data.receivables_snapshot.retail_total || 0)}</div></div></div>
          <div class="atoms-card"><h3>Wholesale owing</h3><div class="atoms-metric">${data.receivables_snapshot.wholesale_count || 0}<div class="atoms-muted">${money(data.receivables_snapshot.wholesale_total || 0)}</div></div></div>
          <div class="atoms-card"><h3>Open invoices</h3><div class="atoms-metric">${data.receivables_snapshot.open_invoice_count || 0}<div class="atoms-muted">${money(data.receivables_snapshot.open_invoice_total || 0)}</div></div></div>
          <div class="atoms-card"><h3>Collections today</h3><div class="atoms-metric">${data.receivables_snapshot.collection_count || 0}<div class="atoms-muted">${money(data.receivables_snapshot.collection_total || 0)}</div></div></div>
          <div class="atoms-card"><h3>Unread alerts</h3><div class="atoms-metric">${data.receivables_snapshot.notify_unread || 0}</div></div>
        </div>
      </div>` : ''}
      ${(data.today_approval_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Approvals reviewed today</h3>
        <table class="atoms-table"><thead><tr><th>Request</th><th>Type</th><th>Summary</th><th>Decision</th><th>Reviewer</th></tr></thead><tbody>
          ${data.today_approval_lines.map((a) => `<tr>
            <td><button type="button" class="atoms-link js-dash-approval" data-id="${a.id}">${a.id}</button></td>
            <td>${escapeHtml(a.type_label || a.type || '')}</td>
            <td>${escapeHtml(a.summary || '—')}</td>
            <td>${badge(a.status)}</td>
            <td>${escapeHtml(a.reviewer_name || '—')}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.today_customer_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>New customers today</h3>
        <table class="atoms-table"><thead><tr><th>Customer</th><th>Phone</th><th>Balance</th></tr></thead><tbody>
          ${data.today_customer_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-dash-overdue" data-id="${l.id}">${escapeHtml(l.name || '')}</button></td>
            <td>${escapeHtml(l.phone || '')}</td>
            <td>${money(l.balance)}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${data.payables_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Supplier balances</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Open payables</h3><div class="atoms-metric">${data.payables_snapshot.open_payable_count || 0}<div class="atoms-muted">${money(data.payables_snapshot.open_payable_total || 0)}</div></div></div>
          <div class="atoms-card"><h3>Aged payables</h3><div class="atoms-metric">${data.payables_snapshot.aged_payable_count || 0}<div class="atoms-muted">${money(data.payables_snapshot.aged_payable_total || 0)}</div></div></div>
          <div class="atoms-card"><h3>Open POs</h3><div class="atoms-metric">${data.payables_snapshot.open_purchase_count || 0}<div class="atoms-muted">${money(data.payables_snapshot.open_purchase_total || 0)}</div></div></div>
          <div class="atoms-card"><h3>Supplier payments today</h3><div class="atoms-metric">${data.payables_snapshot.supplier_payment_count || 0}<div class="atoms-muted">${money(data.payables_snapshot.supplier_payment_total || 0)}</div></div></div>
          <div class="atoms-card"><h3>Supplier returns today</h3><div class="atoms-metric">${data.payables_snapshot.supplier_return_count || 0}<div class="atoms-muted">${money(data.payables_snapshot.supplier_return_total || 0)}</div></div></div>
        </div>
      </div>` : ''}
      ${(data.today_supplier_return_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Supplier returns today</h3>
        <table class="atoms-table"><thead><tr><th>Supplier</th><th>IMEI</th><th>Device</th><th>Credit</th></tr></thead><tbody>
          ${data.today_supplier_return_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-dash-payable" data-id="${l.supplier_id}">${escapeHtml(l.supplier_name || '')}</button></td>
            <td>${escapeHtml(l.imei || '')}</td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
            <td>${money(l.amount)}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.today_stock_count_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Stock counts posted today</h3>
        <table class="atoms-table"><thead><tr><th>Count</th><th>Branch</th><th>Expected</th><th>Missing</th><th>Extra</th></tr></thead><tbody>
          ${data.today_stock_count_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-dash-count" data-id="${l.id}">${escapeHtml('#' + l.id)}</button></td>
            <td>${escapeHtml(l.branch_name || '')}</td>
            <td>${l.expected_qty || 0}</td>
            <td>${l.missing_qty || 0}</td>
            <td>${l.extra_qty || 0}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.today_expense_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Expenses posted today</h3>
        <table class="atoms-table"><thead><tr><th>Expense</th><th>Category</th><th>Vendor</th><th>Amount</th></tr></thead><tbody>
          ${data.today_expense_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-exp-open" data-id="${l.id}">${escapeHtml('#' + l.id)}</button></td>
            <td>${badge(l.category)}</td>
            <td>${escapeHtml(l.vendor || '—')}</td>
            <td>${money(l.amount)}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${data.adjustments_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Returns & adjustments</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Returns today</h3><div class="atoms-metric">${data.adjustments_snapshot.return_count || 0}<div class="atoms-muted">${money(data.adjustments_snapshot.return_total || 0)}</div></div></div>
          <div class="atoms-card"><h3>Payment reversals today</h3><div class="atoms-metric">${data.adjustments_snapshot.reversal_count || 0}<div class="atoms-muted">${money(data.adjustments_snapshot.reversal_total || 0)}</div></div></div>
          <div class="atoms-card"><h3>Voided sales today</h3><div class="atoms-metric">${data.adjustments_snapshot.voided_count || 0}<div class="atoms-muted">${money(data.adjustments_snapshot.voided_total || 0)}</div></div></div>
        </div>
      </div>` : ''}
      ${(data.today_reversal_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Payment reversals today</h3>
        <table class="atoms-table"><thead><tr><th>Customer</th><th>Invoice</th><th>Amount</th><th>Reason</th></tr></thead><tbody>
          ${data.today_reversal_lines.map((l) => `<tr>
            <td>${escapeHtml(l.customer_name || '')}</td>
            <td>${escapeHtml(l.invoice_number || '')}</td>
            <td>${money(l.amount)}</td>
            <td>${escapeHtml(l.notes || '—')}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.today_voided_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Voided sales today</h3>
        <table class="atoms-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Devices</th><th>Total</th><th>Reason</th></tr></thead><tbody>
          ${data.today_voided_lines.map((l) => `<tr>
            <td>${escapeHtml(l.invoice_number || '')}</td>
            <td>${escapeHtml(l.customer_name || 'Walk-in')}</td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
            <td>${money(l.total)}</td>
            <td>${escapeHtml(l.void_reason || '—')}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${data.performance_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Alerts & inventory performance</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Low stock</h3><div class="atoms-metric">${data.performance_snapshot.low_stock_count || 0}</div></div>
          <div class="atoms-card"><h3>Slow movers</h3><div class="atoms-metric">${data.performance_snapshot.slow_mover_count || 0}</div></div>
          <div class="atoms-card"><h3>Top sellers (14d)</h3><div class="atoms-metric">${data.performance_snapshot.top_seller_count || 0}<div class="atoms-muted">${data.performance_snapshot.top_seller_units || 0} units · ${money(data.performance_snapshot.top_seller_revenue || 0)}</div></div></div>
          <div class="atoms-card"><h3>Unread alerts</h3><div class="atoms-metric">${data.performance_snapshot.notify_unread || 0}</div></div>
          <div class="atoms-card"><h3>Alerts today</h3><div class="atoms-metric">${data.performance_snapshot.alert_today_count || 0}</div></div>
        </div>
      </div>` : ''}
      ${(data.today_notify_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Alerts today</h3>
        <table class="atoms-table"><thead><tr><th>Alert</th><th>Detail</th><th>When</th></tr></thead><tbody>
          ${data.today_notify_lines.map((n) => `<tr class="${Number(n.is_read) ? '' : 'is-unread'}">
            <td>${escapeHtml(n.title || '')}</td>
            <td>${escapeHtml(n.body || '')}</td>
            <td>${escapeHtml(n.created_at || '')}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${data.staff_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Staff & branch performance</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Staff selling (14d)</h3><div class="atoms-metric">${data.staff_snapshot.staff_count || 0}<div class="atoms-muted">${data.staff_snapshot.staff_invoices || 0} invoices</div></div></div>
          <div class="atoms-card"><h3>Staff revenue (14d)</h3><div class="atoms-metric">${money(data.staff_snapshot.staff_revenue || 0)}<div class="atoms-muted">${money(data.staff_snapshot.staff_profit || 0)} profit</div></div></div>
          <div class="atoms-card"><h3>Top staff (14d)</h3><div class="atoms-metric">${money(data.staff_snapshot.top_staff_revenue || 0)}</div></div>
          <div class="atoms-card"><h3>Active branches (14d)</h3><div class="atoms-metric">${data.staff_snapshot.branch_count || 0}<div class="atoms-muted">${money(data.staff_snapshot.branch_revenue || 0)}</div></div></div>
          <div class="atoms-card"><h3>Top branch (14d)</h3><div class="atoms-metric">${money(data.staff_snapshot.top_branch_revenue || 0)}</div></div>
          <div class="atoms-card"><h3>Sales today</h3><div class="atoms-metric">${data.staff_snapshot.sales_today_count || 0}<div class="atoms-muted">${money(data.staff_snapshot.sales_today_total || 0)}</div></div></div>
        </div>
      </div>` : ''}
      ${data.movement_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Stock movement</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Transfers today</h3><div class="atoms-metric">${data.movement_snapshot.transfer_count || 0}</div></div>
          <div class="atoms-card"><h3>IMEIs registered today</h3><div class="atoms-metric">${data.movement_snapshot.imei_count || 0}</div></div>
          <div class="atoms-card"><h3>Stock counts today</h3><div class="atoms-metric">${data.movement_snapshot.stock_count_count || 0}</div></div>
          <div class="atoms-card"><h3>In transit</h3><div class="atoms-metric">${data.movement_snapshot.in_transit_count || 0}<div class="atoms-muted">${data.movement_snapshot.stuck_transfer_count || 0} stuck</div></div></div>
          <div class="atoms-card"><h3>IMEI events (14d)</h3><div class="atoms-metric">${data.movement_snapshot.movement_14d_count || 0}<div class="atoms-muted">${data.movement_snapshot.sale_event_count || 0} sold · ${data.movement_snapshot.transfer_event_count || 0} transferred</div></div></div>
          <div class="atoms-card"><h3>Intake events (14d)</h3><div class="atoms-metric">${data.movement_snapshot.intake_event_count || 0}</div></div>
        </div>
      </div>` : ''}
      ${data.ledger_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Cash & consolidated ledger</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Receivables</h3><div class="atoms-metric">${money(data.ledger_snapshot.receivable_total || 0)}<div class="atoms-muted">${data.ledger_snapshot.receivable_party_count || 0} customers</div></div></div>
          <div class="atoms-card"><h3>Payables</h3><div class="atoms-metric">${money(data.ledger_snapshot.payable_total || 0)}<div class="atoms-muted">${data.ledger_snapshot.payable_party_count || 0} suppliers</div></div></div>
          <div class="atoms-card"><h3>Overdue</h3><div class="atoms-metric">${data.ledger_snapshot.overdue_count || 0}<div class="atoms-muted">${money(data.ledger_snapshot.overdue_total || 0)}</div></div></div>
          <div class="atoms-card"><h3>Net cash (14d)</h3><div class="atoms-metric">${money(data.ledger_snapshot.cash_net_14d || 0)}<div class="atoms-muted">${money(data.ledger_snapshot.cash_in_14d || 0)} in</div></div></div>
          <div class="atoms-card"><h3>Net cash today</h3><div class="atoms-metric">${money(data.ledger_snapshot.cash_net_today || 0)}</div></div>
          <div class="atoms-card"><h3>Sales (14d)</h3><div class="atoms-metric">${money(data.ledger_snapshot.sales_14d || 0)}<div class="atoms-muted">${money(data.ledger_snapshot.collected_14d || 0)} collected</div></div></div>
        </div>
      </div>` : ''}
      ${data.repair_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Repairs & service</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Open repairs</h3><div class="atoms-metric">${data.repair_snapshot.open_repair_count || 0}<div class="atoms-muted">${data.repair_snapshot.stuck_repair_count || 0} stuck</div></div></div>
          <div class="atoms-card"><h3>Completed today</h3><div class="atoms-metric">${data.repair_snapshot.completed_today_count || 0}</div></div>
          <div class="atoms-card"><h3>Completed (14d)</h3><div class="atoms-metric">${data.repair_snapshot.completed_14d_count || 0}</div></div>
          <div class="atoms-card"><h3>Faulty devices</h3><div class="atoms-metric">${data.repair_snapshot.faulty_device_count || 0}<div class="atoms-muted">${data.repair_snapshot.stuck_faulty_count || 0} stuck</div></div></div>
        </div>
      </div>` : ''}
      ${data.compliance_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Audit & compliance</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Pending approvals</h3><div class="atoms-metric">${data.compliance_snapshot.pending_approval_count || 0}</div></div>
          <div class="atoms-card"><h3>Approvals reviewed today</h3><div class="atoms-metric">${data.compliance_snapshot.approval_reviewed_today_count || 0}</div></div>
          <div class="atoms-card"><h3>Audit events today</h3><div class="atoms-metric">${data.compliance_snapshot.audit_today_count || 0}</div></div>
          <div class="atoms-card"><h3>Audit events (14d)</h3><div class="atoms-metric">${data.compliance_snapshot.audit_14d_count || 0}</div></div>
          <div class="atoms-card"><h3>New customers today</h3><div class="atoms-metric">${data.compliance_snapshot.new_customer_today_count || 0}</div></div>
          <div class="atoms-card"><h3>New customers (14d)</h3><div class="atoms-metric">${data.compliance_snapshot.new_customer_14d_count || 0}</div></div>
        </div>
      </div>` : ''}
      ${data.trade_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Wholesale & trade</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Wholesale owing</h3><div class="atoms-metric">${money(data.trade_snapshot.wholesale_owing_total || 0)}<div class="atoms-muted">${data.trade_snapshot.wholesale_owing_count || 0} invoice(s)</div></div></div>
          <div class="atoms-card"><h3>Retail owing</h3><div class="atoms-metric">${money(data.trade_snapshot.retail_owing_total || 0)}<div class="atoms-muted">${data.trade_snapshot.retail_owing_count || 0} invoice(s)</div></div></div>
          <div class="atoms-card"><h3>Swaps today</h3><div class="atoms-metric">${data.trade_snapshot.swap_today_count || 0}<div class="atoms-muted">${money(data.trade_snapshot.swap_collected_today || 0)}</div></div></div>
          <div class="atoms-card"><h3>Swaps (14d)</h3><div class="atoms-metric">${data.trade_snapshot.swap_14d_count || 0}<div class="atoms-muted">${money(data.trade_snapshot.swap_collected_14d || 0)}</div></div></div>
          <div class="atoms-card"><h3>Retail sales (14d)</h3><div class="atoms-metric">${money(data.trade_snapshot.retail_sales_14d || 0)}<div class="atoms-muted">${data.trade_snapshot.retail_invoices_14d || 0} invoice(s)</div></div></div>
          <div class="atoms-card"><h3>Wholesale sales (14d)</h3><div class="atoms-metric">${money(data.trade_snapshot.wholesale_sales_14d || 0)}<div class="atoms-muted">${data.trade_snapshot.wholesale_invoices_14d || 0} invoice(s)</div></div></div>
        </div>
      </div>` : ''}
      ${data.aging_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Aging & payment mix</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Receivables aged</h3><div class="atoms-metric">${money(data.aging_snapshot.receivable_total || 0)}<div class="atoms-muted">${data.aging_snapshot.receivable_line_count || 0} open</div></div></div>
          <div class="atoms-card"><h3>Receivables 90+</h3><div class="atoms-metric">${money(data.aging_snapshot.receivable_90_plus || 0)}</div></div>
          <div class="atoms-card"><h3>Payables aged</h3><div class="atoms-metric">${money(data.aging_snapshot.payable_total || 0)}<div class="atoms-muted">${data.aging_snapshot.payable_line_count || 0} open</div></div></div>
          <div class="atoms-card"><h3>Payables 90+</h3><div class="atoms-metric">${money(data.aging_snapshot.payable_90_plus || 0)}</div></div>
          <div class="atoms-card"><h3>Collected (14d)</h3><div class="atoms-metric">${money(data.aging_snapshot.payment_collected_14d || 0)}<div class="atoms-muted">${data.aging_snapshot.payment_method_count || 0} methods</div></div></div>
          <div class="atoms-card"><h3>Current receivables</h3><div class="atoms-metric">${money(data.aging_snapshot.receivable_0_30 || 0)}<div class="atoms-muted">${money(data.aging_snapshot.payable_0_30 || 0)} payables</div></div></div>
        </div>
      </div>` : ''}
      ${data.executive_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Executive overview</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Sales today</h3><div class="atoms-metric">${money(data.executive_snapshot.sales_today_total || 0)}<div class="atoms-muted">${data.executive_snapshot.sales_today_count || 0} sale(s)</div></div></div>
          <div class="atoms-card"><h3>Sales (14d)</h3><div class="atoms-metric">${money(data.executive_snapshot.sales_14d || 0)}</div></div>
          <div class="atoms-card"><h3>Net cash today</h3><div class="atoms-metric">${money(data.executive_snapshot.cash_net_today || 0)}</div></div>
          <div class="atoms-card"><h3>Net cash (14d)</h3><div class="atoms-metric">${money(data.executive_snapshot.cash_net_14d || 0)}</div></div>
          <div class="atoms-card"><h3>Receivables</h3><div class="atoms-metric">${money(data.executive_snapshot.receivable_total || 0)}<div class="atoms-muted">${data.executive_snapshot.receivable_party_count || 0} customers</div></div></div>
          <div class="atoms-card"><h3>Payables</h3><div class="atoms-metric">${money(data.executive_snapshot.payable_total || 0)}<div class="atoms-muted">${data.executive_snapshot.payable_party_count || 0} suppliers</div></div></div>
          <div class="atoms-card"><h3>Overdue</h3><div class="atoms-metric">${data.executive_snapshot.overdue_count || 0}<div class="atoms-muted">${money(data.executive_snapshot.overdue_total || 0)}</div></div></div>
          <div class="atoms-card"><h3>Collections today</h3><div class="atoms-metric">${money(data.executive_snapshot.collections_today || 0)}</div></div>
          <div class="atoms-card"><h3>Open repairs</h3><div class="atoms-metric">${data.executive_snapshot.open_repair_count || 0}</div></div>
          <div class="atoms-card"><h3>Pending approvals</h3><div class="atoms-metric">${data.executive_snapshot.pending_approval_count || 0}</div></div>
          <div class="atoms-card"><h3>In transit</h3><div class="atoms-metric">${data.executive_snapshot.in_transit_count || 0}</div></div>
          <div class="atoms-card"><h3>Available stock</h3><div class="atoms-metric">${data.executive_snapshot.available_qty || 0}<div class="atoms-muted">${money(data.executive_snapshot.available_value || 0)}</div></div></div>
          <div class="atoms-card"><h3>Low stock</h3><div class="atoms-metric">${data.executive_snapshot.low_stock_count || 0}</div></div>
          <div class="atoms-card"><h3>Unread alerts</h3><div class="atoms-metric">${data.executive_snapshot.notify_unread || 0}</div></div>
        </div>
      </div>` : ''}
      ${data.branch_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Branch network</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Active branches</h3><div class="atoms-metric">${data.branch_snapshot.branch_count || 0}<div class="atoms-muted">${data.branch_snapshot.active_branch_count || 0} with sales</div></div></div>
          <div class="atoms-card"><h3>Revenue (14d)</h3><div class="atoms-metric">${money(data.branch_snapshot.revenue_14d || 0)}<div class="atoms-muted">${data.branch_snapshot.invoice_count || 0} invoices</div></div></div>
          <div class="atoms-card"><h3>Collected (14d)</h3><div class="atoms-metric">${money(data.branch_snapshot.collected_14d || 0)}</div></div>
          <div class="atoms-card"><h3>Profit (14d)</h3><div class="atoms-metric">${money(data.branch_snapshot.profit_14d || 0)}</div></div>
          <div class="atoms-card"><h3>Outstanding due</h3><div class="atoms-metric">${money(data.branch_snapshot.due_total || 0)}</div></div>
          <div class="atoms-card"><h3>Network stock</h3><div class="atoms-metric">${data.branch_snapshot.stock_qty || 0}<div class="atoms-muted">${money(data.branch_snapshot.stock_value || 0)}</div></div></div>
          <div class="atoms-card"><h3>Top branch revenue</h3><div class="atoms-metric">${money(data.branch_snapshot.top_branch_revenue || 0)}</div></div>
          <div class="atoms-card"><h3>Top branch profit</h3><div class="atoms-metric">${money(data.branch_snapshot.top_branch_profit || 0)}</div></div>
        </div>
      </div>` : ''}
      ${data.mix_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Sales mix & channels</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Collected (14d)</h3><div class="atoms-metric">${money(data.mix_snapshot.payment_collected_14d || 0)}<div class="atoms-muted">${data.mix_snapshot.payment_method_count || 0} methods</div></div></div>
          <div class="atoms-card"><h3>Top payment</h3><div class="atoms-metric">${money(data.mix_snapshot.top_payment_collected || 0)}<div class="atoms-muted">${escapeHtml(data.mix_snapshot.top_payment_method || '—')}</div></div></div>
          <div class="atoms-card"><h3>Retail (14d)</h3><div class="atoms-metric">${money(data.mix_snapshot.retail_revenue || 0)}<div class="atoms-muted">${data.mix_snapshot.retail_invoices || 0} invoices</div></div></div>
          <div class="atoms-card"><h3>Wholesale (14d)</h3><div class="atoms-metric">${money(data.mix_snapshot.wholesale_revenue || 0)}<div class="atoms-muted">${data.mix_snapshot.wholesale_invoices || 0} invoices</div></div></div>
          <div class="atoms-card"><h3>Total sales (14d)</h3><div class="atoms-metric">${money(data.mix_snapshot.sales_14d || 0)}<div class="atoms-muted">${data.mix_snapshot.invoice_count || 0} invoices</div></div></div>
          <div class="atoms-card"><h3>Sale channels</h3><div class="atoms-metric">${data.mix_snapshot.sale_type_count || 0}</div></div>
        </div>
      </div>` : ''}
      ${data.product_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Product performance</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Top sellers (14d)</h3><div class="atoms-metric">${data.product_snapshot.top_seller_count || 0}<div class="atoms-muted">${data.product_snapshot.top_seller_units || 0} units · ${money(data.product_snapshot.top_seller_revenue || 0)}</div></div></div>
          <div class="atoms-card"><h3>Top seller profit</h3><div class="atoms-metric">${money(data.product_snapshot.top_seller_profit || 0)}</div></div>
          <div class="atoms-card"><h3>Best product</h3><div class="atoms-metric">${money(data.product_snapshot.top_product_profit || 0)}<div class="atoms-muted">${escapeHtml(data.product_snapshot.top_product_name || '—')}</div></div></div>
          <div class="atoms-card"><h3>Slow movers</h3><div class="atoms-metric">${data.product_snapshot.slow_mover_count || 0}<div class="atoms-muted">${data.product_snapshot.slow_mover_qty || 0} units</div></div></div>
        </div>
      </div>` : ''}
      ${data.trend_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Sales trend & velocity</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Sales (14d)</h3><div class="atoms-metric">${money(data.trend_snapshot.sales_14d || 0)}<div class="atoms-muted">${data.trend_snapshot.invoice_count || 0} invoices · ${data.trend_snapshot.active_day_count || 0} active days</div></div></div>
          <div class="atoms-card"><h3>Collected (14d)</h3><div class="atoms-metric">${money(data.trend_snapshot.collected_14d || 0)}</div></div>
          <div class="atoms-card"><h3>Sales today</h3><div class="atoms-metric">${money(data.trend_snapshot.sales_today || 0)}<div class="atoms-muted">${data.trend_snapshot.invoices_today || 0} invoices</div></div></div>
          <div class="atoms-card"><h3>Best day</h3><div class="atoms-metric">${money(data.trend_snapshot.best_day_net || 0)}<div class="atoms-muted">${escapeHtml(data.trend_snapshot.best_day_date || '—')}</div></div></div>
          <div class="atoms-card"><h3>Avg daily sales</h3><div class="atoms-metric">${money(data.trend_snapshot.avg_daily_net || 0)}</div></div>
        </div>
      </div>` : ''}
      ${data.cashflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Cash flow</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Cash in (14d)</h3><div class="atoms-metric">${money(data.cashflow_snapshot.inflows_14d || 0)}<div class="atoms-muted">${money(data.cashflow_snapshot.at_sale_14d || 0)} at sale · ${money(data.cashflow_snapshot.collections_14d || 0)} collected</div></div></div>
          <div class="atoms-card"><h3>Outflows (14d)</h3><div class="atoms-metric">${money(data.cashflow_snapshot.outflows_14d || 0)}<div class="atoms-muted">${money(data.cashflow_snapshot.expenses_14d || 0)} expenses</div></div></div>
          <div class="atoms-card"><h3>Net cash (14d)</h3><div class="atoms-metric">${money(data.cashflow_snapshot.net_14d || 0)}</div></div>
          <div class="atoms-card"><h3>Supplier payments (14d)</h3><div class="atoms-metric">${money(data.cashflow_snapshot.supplier_payments_14d || 0)}</div></div>
          <div class="atoms-card"><h3>Refunds (14d)</h3><div class="atoms-metric">${money(data.cashflow_snapshot.refunds_14d || 0)}</div></div>
          <div class="atoms-card"><h3>Net cash today</h3><div class="atoms-metric">${money(data.cashflow_snapshot.net_today || 0)}<div class="atoms-muted">${money(data.cashflow_snapshot.inflows_today || 0)} in · ${money(data.cashflow_snapshot.outflows_today || 0)} out</div></div></div>
        </div>
      </div>` : ''}
      ${data.staff_device_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Staff device sales</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Devices sold (14d)</h3><div class="atoms-metric">${data.staff_device_snapshot.device_line_count || 0}<div class="atoms-muted">${money(data.staff_device_snapshot.revenue_total || 0)}</div></div></div>
          <div class="atoms-card"><h3>Staff selling (14d)</h3><div class="atoms-metric">${data.staff_device_snapshot.staff_count || 0}<div class="atoms-muted">${data.staff_device_snapshot.invoice_count || 0} invoices</div></div></div>
          <div class="atoms-card"><h3>Top staff (14d)</h3><div class="atoms-metric">${data.staff_device_snapshot.top_staff_units || 0}<div class="atoms-muted">${escapeHtml(data.staff_device_snapshot.top_staff_name || '—')}</div></div></div>
          <div class="atoms-card"><h3>Devices today</h3><div class="atoms-metric">${data.staff_device_snapshot.devices_today || 0}<div class="atoms-muted">${money(data.staff_device_snapshot.revenue_today || 0)}</div></div></div>
        </div>
      </div>` : ''}
      ${data.stock_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Low stock & replenishment</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Low stock alerts</h3><div class="atoms-metric">${data.stock_snapshot.low_stock_count || 0}<div class="atoms-muted">${data.stock_snapshot.low_stock_qty || 0} units · lowest ${data.stock_snapshot.lowest_available || 0}</div></div></div>
          <div class="atoms-card"><h3>Available stock</h3><div class="atoms-metric">${data.stock_snapshot.available_qty || 0}<div class="atoms-muted">${money(data.stock_snapshot.available_value || 0)}</div></div></div>
          <div class="atoms-card"><h3>Accessory units</h3><div class="atoms-metric">${data.stock_snapshot.quantity_qty || 0}<div class="atoms-muted">${data.stock_snapshot.quantity_sku_count || 0} SKUs · ${money(data.stock_snapshot.quantity_value || 0)}</div></div></div>
          <div class="atoms-card"><h3>Inbound reserved</h3><div class="atoms-metric">${data.stock_snapshot.inbound_reserved_count || 0}</div></div>
          <div class="atoms-card"><h3>Faulty units</h3><div class="atoms-metric">${data.stock_snapshot.faulty_qty || 0}</div></div>
          <div class="atoms-card"><h3>IMEI on hand</h3><div class="atoms-metric">${data.stock_snapshot.imei_total || 0}<div class="atoms-muted">${data.stock_snapshot.status_count || 0} statuses</div></div></div>
        </div>
      </div>` : ''}
      ${data.imei_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>IMEI status</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>IMEI on hand</h3><div class="atoms-metric">${data.imei_snapshot.imei_total || 0}<div class="atoms-muted">${data.imei_snapshot.status_count || 0} statuses</div></div></div>
          <div class="atoms-card"><h3>Available</h3><div class="atoms-metric">${data.imei_snapshot.available_qty || 0}</div></div>
          <div class="atoms-card"><h3>Sold</h3><div class="atoms-metric">${data.imei_snapshot.sold_qty || 0}</div></div>
          <div class="atoms-card"><h3>Faulty</h3><div class="atoms-metric">${data.imei_snapshot.faulty_qty || 0}<div class="atoms-muted">${data.imei_snapshot.under_repair_qty || 0} under repair</div></div></div>
          <div class="atoms-card"><h3>Reserved</h3><div class="atoms-metric">${data.imei_snapshot.reserved_qty || 0}</div></div>
          <div class="atoms-card"><h3>In transit</h3><div class="atoms-metric">${data.imei_snapshot.transferred_qty || 0}</div></div>
          <div class="atoms-card"><h3>Registered today</h3><div class="atoms-metric">${data.imei_snapshot.registered_today || 0}</div></div>
        </div>
      </div>` : ''}
      ${data.transfer_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Transfers & transit</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>In transit</h3><div class="atoms-metric">${data.transfer_snapshot.in_transit_count || 0}<div class="atoms-muted">${data.transfer_snapshot.in_transit_devices || 0} devices · ${data.transfer_snapshot.stuck_transfer_count || 0} stuck</div></div></div>
          <div class="atoms-card"><h3>Outbound</h3><div class="atoms-metric">${data.transfer_snapshot.outbound_in_transit || 0}<div class="atoms-muted">leaving this branch</div></div></div>
          <div class="atoms-card"><h3>Inbound</h3><div class="atoms-metric">${data.transfer_snapshot.inbound_in_transit || 0}<div class="atoms-muted">arriving here</div></div></div>
          <div class="atoms-card"><h3>Transfers today</h3><div class="atoms-metric">${data.transfer_snapshot.transfer_count_today || 0}<div class="atoms-muted">${data.transfer_snapshot.dispatched_today || 0} dispatched · ${data.transfer_snapshot.received_today || 0} received</div></div></div>
        </div>
      </div>` : ''}
      ${data.purchase_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Purchases & open POs</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Open POs</h3><div class="atoms-metric">${data.purchase_snapshot.open_po_count || 0}<div class="atoms-muted">${money(data.purchase_snapshot.open_po_total || 0)} · ${data.purchase_snapshot.pending_units || 0} units pending</div></div></div>
          <div class="atoms-card"><h3>Ordered</h3><div class="atoms-metric">${data.purchase_snapshot.ordered_count || 0}</div></div>
          <div class="atoms-card"><h3>Inspecting</h3><div class="atoms-metric">${data.purchase_snapshot.inspecting_count || 0}</div></div>
          <div class="atoms-card"><h3>Purchases today</h3><div class="atoms-metric">${data.purchase_snapshot.purchase_count_today || 0}<div class="atoms-muted">${money(data.purchase_snapshot.purchase_total_today || 0)} · ${data.purchase_snapshot.purchase_units_today || 0} units</div></div></div>
        </div>
      </div>` : ''}
      ${data.returns_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Returns & swaps</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Returns today</h3><div class="atoms-metric">${data.returns_snapshot.return_count_today || 0}<div class="atoms-muted">${money(data.returns_snapshot.return_total_today || 0)}</div></div></div>
          <div class="atoms-card"><h3>Returns (14d)</h3><div class="atoms-metric">${data.returns_snapshot.return_count_14d || 0}<div class="atoms-muted">${money(data.returns_snapshot.return_total_14d || 0)}</div></div></div>
          <div class="atoms-card"><h3>Swaps today</h3><div class="atoms-metric">${data.returns_snapshot.swap_count_today || 0}<div class="atoms-muted">${money(data.returns_snapshot.swap_collected_today || 0)} collected</div></div></div>
          <div class="atoms-card"><h3>Adjustments today</h3><div class="atoms-metric">${(data.returns_snapshot.reversal_count_today || 0) + (data.returns_snapshot.voided_count_today || 0)}<div class="atoms-muted">${money((data.returns_snapshot.reversal_total_today || 0) + (data.returns_snapshot.voided_total_today || 0))} reversals & voids</div></div></div>
        </div>
      </div>` : ''}
      ${data.faulty_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Repair & faulty queue</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Faulty devices</h3><div class="atoms-metric">${data.faulty_snapshot.faulty_device_count || 0}<div class="atoms-muted">${data.faulty_snapshot.stuck_faulty_count || 0} stuck · ${data.faulty_snapshot.under_repair_qty || 0} under repair</div></div></div>
          <div class="atoms-card"><h3>Open repairs</h3><div class="atoms-metric">${data.faulty_snapshot.open_repair_count || 0}<div class="atoms-muted">${data.faulty_snapshot.stuck_repair_count || 0} stuck</div></div></div>
          <div class="atoms-card"><h3>Completed today</h3><div class="atoms-metric">${data.faulty_snapshot.repair_completed_today || 0}</div></div>
          <div class="atoms-card"><h3>Completed (14d)</h3><div class="atoms-metric">${data.faulty_snapshot.repair_completed_14d || 0}<div class="atoms-muted">${data.faulty_snapshot.returned_qty || 0} returned IMEIs</div></div></div>
        </div>
      </div>` : ''}
      ${data.customer_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Customers & receivables</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>New today</h3><div class="atoms-metric">${data.customer_snapshot.new_customers_today || 0}<div class="atoms-muted">${data.customer_snapshot.new_customers_14d || 0} in 14 days</div></div></div>
          <div class="atoms-card"><h3>Customers owing</h3><div class="atoms-metric">${data.customer_snapshot.owing_customer_count || 0}<div class="atoms-muted">${money(data.customer_snapshot.receivable_total || 0)}</div></div></div>
          <div class="atoms-card"><h3>Overdue</h3><div class="atoms-metric">${data.customer_snapshot.overdue_count || 0}<div class="atoms-muted">${money(data.customer_snapshot.overdue_total || 0)}</div></div></div>
          <div class="atoms-card"><h3>Retail / wholesale</h3><div class="atoms-metric">${data.customer_snapshot.retail_owing_count || 0}<div class="atoms-muted">${data.customer_snapshot.wholesale_owing_count || 0} wholesale owing</div></div></div>
        </div>
      </div>` : ''}
      ${data.supplier_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Suppliers & payables</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Suppliers owing</h3><div class="atoms-metric">${data.supplier_snapshot.owing_supplier_count || 0}<div class="atoms-muted">${money(data.supplier_snapshot.payable_total || 0)}</div></div></div>
          <div class="atoms-card"><h3>Open payables</h3><div class="atoms-metric">${data.supplier_snapshot.open_payable_count || 0}<div class="atoms-muted">${money(data.supplier_snapshot.open_payable_total || 0)}</div></div></div>
          <div class="atoms-card"><h3>Aged payables</h3><div class="atoms-metric">${data.supplier_snapshot.aged_payable_count || 0}<div class="atoms-muted">${money(data.supplier_snapshot.aged_payable_total || 0)}</div></div></div>
          <div class="atoms-card"><h3>Open POs</h3><div class="atoms-metric">${data.supplier_snapshot.open_po_count || 0}<div class="atoms-muted">${money(data.supplier_snapshot.open_po_total || 0)} · ${money(data.supplier_snapshot.supplier_payment_total_today || 0)} paid today</div></div></div>
        </div>
      </div>` : ''}
      ${data.count_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Stock counts</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Open counts</h3><div class="atoms-metric">${data.count_snapshot.open_count_count || 0}<div class="atoms-muted">${data.count_snapshot.pending_approval_count || 0} pending approval</div></div></div>
          <div class="atoms-card"><h3>Open variance</h3><div class="atoms-metric">${data.count_snapshot.open_missing_units || 0}<div class="atoms-muted">${data.count_snapshot.open_extra_units || 0} extra units</div></div></div>
          <div class="atoms-card"><h3>Posted today</h3><div class="atoms-metric">${data.count_snapshot.posted_today_count || 0}<div class="atoms-muted">${data.count_snapshot.missing_units_today || 0} missing units</div></div></div>
          <div class="atoms-card"><h3>Posted (14d)</h3><div class="atoms-metric">${data.count_snapshot.posted_14d_count || 0}<div class="atoms-muted">${data.count_snapshot.missing_units_14d || 0} missing units</div></div></div>
        </div>
      </div>` : ''}
      ${data.approval_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Approvals</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Pending queue</h3><div class="atoms-metric">${data.approval_snapshot.pending_count || 0}<div class="atoms-muted">${data.approval_snapshot.reviewed_today_count || 0} reviewed today</div></div></div>
          <div class="atoms-card"><h3>Sell below minimum</h3><div class="atoms-metric">${data.approval_snapshot.price_override_count || 0}</div></div>
          <div class="atoms-card"><h3>Expense / stock</h3><div class="atoms-metric">${data.approval_snapshot.expense_count || 0}<div class="atoms-muted">${data.approval_snapshot.stock_variance_count || 0} stock variances</div></div></div>
          <div class="atoms-card"><h3>Decisions today</h3><div class="atoms-metric">${data.approval_snapshot.approved_today_count || 0}<div class="atoms-muted">${data.approval_snapshot.rejected_today_count || 0} rejected</div></div></div>
        </div>
      </div>` : ''}
      ${data.expense_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Expenses</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Pending approval</h3><div class="atoms-metric">${data.expense_snapshot.pending_count || 0}<div class="atoms-muted">${money(data.expense_snapshot.pending_total || 0)} · max ${money(data.expense_snapshot.largest_pending_amount || 0)}</div></div></div>
          <div class="atoms-card"><h3>Posted today</h3><div class="atoms-metric">${data.expense_snapshot.posted_today_count || 0}<div class="atoms-muted">${money(data.expense_snapshot.posted_today_total || 0)}</div></div></div>
          <div class="atoms-card"><h3>Posted (14d)</h3><div class="atoms-metric">${money(data.expense_snapshot.posted_14d_total || 0)}<div class="atoms-muted">${data.expense_snapshot.posted_14d_count || 0} expenses</div></div></div>
          <div class="atoms-card"><h3>Top category (14d)</h3><div class="atoms-metric">${data.expense_snapshot.top_category_14d ? badge(data.expense_snapshot.top_category_14d) : '—'}<div class="atoms-muted">${money(data.expense_snapshot.top_category_total_14d || 0)} · ${data.expense_snapshot.category_count_14d || 0} categories</div></div></div>
        </div>
      </div>` : ''}
      ${data.audit_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Audit trail</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Events today</h3><div class="atoms-metric">${data.audit_snapshot.event_count_today || 0}<div class="atoms-muted">${data.audit_snapshot.event_count_14d || 0} in 14 days</div></div></div>
          <div class="atoms-card"><h3>Active users</h3><div class="atoms-metric">${data.audit_snapshot.user_count_14d || 0}<div class="atoms-muted">${data.audit_snapshot.entity_type_count_14d || 0} entity types</div></div></div>
          <div class="atoms-card"><h3>Sales / approvals</h3><div class="atoms-metric">${data.audit_snapshot.sale_event_count_14d || 0}<div class="atoms-muted">${data.audit_snapshot.approval_event_count_14d || 0} approval events</div></div></div>
          <div class="atoms-card"><h3>Inventory events</h3><div class="atoms-metric">${data.audit_snapshot.inventory_event_count_14d || 0}<div class="atoms-muted">${escapeHtml((data.audit_snapshot.top_action_14d || '—').replace(/\./g, ' '))}</div></div></div>
        </div>
      </div>` : ''}
      ${data.collection_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Collections</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Collected today</h3><div class="atoms-metric">${money(data.collection_snapshot.collection_total_today || 0)}<div class="atoms-muted">${data.collection_snapshot.collection_count_today || 0} payments</div></div></div>
          <div class="atoms-card"><h3>Collected (14d)</h3><div class="atoms-metric">${money(data.collection_snapshot.collection_total_14d || 0)}<div class="atoms-muted">${data.collection_snapshot.collection_count_14d || 0} payments</div></div></div>
          <div class="atoms-card"><h3>Overdue</h3><div class="atoms-metric">${data.collection_snapshot.overdue_count || 0}<div class="atoms-muted">${money(data.collection_snapshot.overdue_total || 0)}</div></div></div>
          <div class="atoms-card"><h3>Open receivables</h3><div class="atoms-metric">${money(data.collection_snapshot.receivable_total || 0)}<div class="atoms-muted">${data.collection_snapshot.owing_customer_count || 0} customers · ${data.collection_snapshot.open_invoice_count || 0} invoices</div></div></div>
        </div>
      </div>` : ''}
      ${data.alert_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Alerts</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Unread</h3><div class="atoms-metric">${data.alert_snapshot.unread_count || 0}<div class="atoms-muted">${data.alert_snapshot.alert_count_today || 0} today</div></div></div>
          <div class="atoms-card"><h3>Alerts (14d)</h3><div class="atoms-metric">${data.alert_snapshot.alert_count_14d || 0}</div></div>
          <div class="atoms-card"><h3>Stock & debt</h3><div class="atoms-metric">${(data.alert_snapshot.low_stock_alert_count_14d || 0) + (data.alert_snapshot.debt_alert_count_14d || 0)}<div class="atoms-muted">${data.alert_snapshot.low_stock_alert_count_14d || 0} stock · ${data.alert_snapshot.debt_alert_count_14d || 0} debt</div></div></div>
          <div class="atoms-card"><h3>Workflow</h3><div class="atoms-metric">${(data.alert_snapshot.approval_alert_count_14d || 0) + (data.alert_snapshot.ops_alert_count_14d || 0)}<div class="atoms-muted">${data.alert_snapshot.approval_alert_count_14d || 0} approvals · ${data.alert_snapshot.ops_alert_count_14d || 0} ops</div></div></div>
        </div>
      </div>` : ''}
      ${data.sales_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Sales</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Sales today</h3><div class="atoms-metric">${money(data.sales_snapshot.sale_total_today || 0)}<div class="atoms-muted">${data.sales_snapshot.sale_count_today || 0} invoices</div></div></div>
          <div class="atoms-card"><h3>Collected today</h3><div class="atoms-metric">${money(data.sales_snapshot.collected_today || 0)}<div class="atoms-muted">${money(data.sales_snapshot.due_total_today || 0)} due</div></div></div>
          <div class="atoms-card"><h3>Sales (14d)</h3><div class="atoms-metric">${money(data.sales_snapshot.sale_total_14d || 0)}<div class="atoms-muted">${data.sales_snapshot.sale_count_14d || 0} invoices · ${money(data.sales_snapshot.collected_14d || 0)} collected</div></div></div>
          <div class="atoms-card"><h3>Mix & voids</h3><div class="atoms-metric">${data.sales_snapshot.retail_count_14d || 0} retail<div class="atoms-muted">${data.sales_snapshot.wholesale_count_14d || 0} wholesale · ${data.sales_snapshot.voided_count_today || 0} voided today</div></div></div>
        </div>
      </div>` : ''}
      ${data.payment_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Payments</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Customer today</h3><div class="atoms-metric">${money(data.payment_snapshot.customer_payment_total_today || 0)}<div class="atoms-muted">${data.payment_snapshot.customer_payment_count_today || 0} payments</div></div></div>
          <div class="atoms-card"><h3>Customer (14d)</h3><div class="atoms-metric">${money(data.payment_snapshot.customer_payment_total_14d || 0)}<div class="atoms-muted">${data.payment_snapshot.customer_payment_count_14d || 0} payments</div></div></div>
          <div class="atoms-card"><h3>Supplier today</h3><div class="atoms-metric">${money(data.payment_snapshot.supplier_payment_total_today || 0)}<div class="atoms-muted">${data.payment_snapshot.supplier_payment_count_today || 0} payments</div></div></div>
          <div class="atoms-card"><h3>Reversals</h3><div class="atoms-metric">${data.payment_snapshot.reversal_count_today || 0}<div class="atoms-muted">${money(data.payment_snapshot.reversal_total_today || 0)} today · ${data.payment_snapshot.reversal_count_14d || 0} in 14d</div></div></div>
        </div>
      </div>` : ''}
      ${data.swap_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Swaps</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Swaps today</h3><div class="atoms-metric">${data.swap_snapshot.swap_count_today || 0}<div class="atoms-muted">${money(data.swap_snapshot.collected_today || 0)} collected</div></div></div>
          <div class="atoms-card"><h3>Difference today</h3><div class="atoms-metric">${money(data.swap_snapshot.difference_total_today || 0)}</div></div>
          <div class="atoms-card"><h3>Swaps (14d)</h3><div class="atoms-metric">${data.swap_snapshot.swap_count_14d || 0}<div class="atoms-muted">${money(data.swap_snapshot.collected_14d || 0)} collected · ${money(data.swap_snapshot.difference_total_14d || 0)} diff</div></div></div>
          <div class="atoms-card"><h3>Upgrade / downgrade</h3><div class="atoms-metric">${data.swap_snapshot.upgrade_count_14d || 0} up<div class="atoms-muted">${data.swap_snapshot.downgrade_count_14d || 0} down · ${data.swap_snapshot.even_swap_count_14d || 0} even</div></div></div>
        </div>
      </div>` : ''}
      ${data.return_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Returns</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Returns today</h3><div class="atoms-metric">${data.return_snapshot.return_count_today || 0}<div class="atoms-muted">${money(data.return_snapshot.return_total_today || 0)} refunded</div></div></div>
          <div class="atoms-card"><h3>Returns (14d)</h3><div class="atoms-metric">${data.return_snapshot.return_count_14d || 0}<div class="atoms-muted">${money(data.return_snapshot.return_total_14d || 0)} refunded</div></div></div>
          <div class="atoms-card"><h3>Resolutions</h3><div class="atoms-metric">${data.return_snapshot.refund_resolution_count_14d || 0} refunds<div class="atoms-muted">${data.return_snapshot.replacement_resolution_count_14d || 0} replacements</div></div></div>
          <div class="atoms-card"><h3>Faulty & warranty</h3><div class="atoms-metric">${data.return_snapshot.faulty_return_count_14d || 0} faulty<div class="atoms-muted">${data.return_snapshot.warranty_return_count_14d || 0} warranty</div></div></div>
        </div>
      </div>` : ''}
      ${data.adjustment_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Adjustments</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Reversals today</h3><div class="atoms-metric">${data.adjustment_snapshot.reversal_count_today || 0}<div class="atoms-muted">${money(data.adjustment_snapshot.reversal_total_today || 0)}</div></div></div>
          <div class="atoms-card"><h3>Voided today</h3><div class="atoms-metric">${data.adjustment_snapshot.voided_count_today || 0}<div class="atoms-muted">${money(data.adjustment_snapshot.voided_total_today || 0)}</div></div></div>
          <div class="atoms-card"><h3>Adjustments (14d)</h3><div class="atoms-metric">${(data.adjustment_snapshot.reversal_count_14d || 0) + (data.adjustment_snapshot.voided_count_14d || 0)}<div class="atoms-muted">${money((data.adjustment_snapshot.reversal_total_14d || 0) + (data.adjustment_snapshot.voided_total_14d || 0))}</div></div></div>
          <div class="atoms-card"><h3>Total today</h3><div class="atoms-metric">${data.adjustment_snapshot.adjustment_count_today || 0}<div class="atoms-muted">${money(data.adjustment_snapshot.adjustment_total_today || 0)}</div></div></div>
        </div>
      </div>` : ''}
      ${data.procurement_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Procurement</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Open POs</h3><div class="atoms-metric">${data.procurement_snapshot.open_po_count || 0}<div class="atoms-muted">${money(data.procurement_snapshot.open_po_total || 0)} · ${data.procurement_snapshot.pending_units || 0} units pending</div></div></div>
          <div class="atoms-card"><h3>Ordered / inspecting</h3><div class="atoms-metric">${data.procurement_snapshot.ordered_count || 0}<div class="atoms-muted">${data.procurement_snapshot.inspecting_count || 0} inspecting</div></div></div>
          <div class="atoms-card"><h3>Purchases today</h3><div class="atoms-metric">${data.procurement_snapshot.purchase_count_today || 0}<div class="atoms-muted">${money(data.procurement_snapshot.purchase_total_today || 0)} · ${data.procurement_snapshot.purchase_units_today || 0} units</div></div></div>
          <div class="atoms-card"><h3>Purchases (14d)</h3><div class="atoms-metric">${data.procurement_snapshot.purchase_count_14d || 0}<div class="atoms-muted">${money(data.procurement_snapshot.purchase_total_14d || 0)} · ${data.procurement_snapshot.purchase_units_14d || 0} units</div></div></div>
        </div>
      </div>` : ''}
      ${data.receiving_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Receiving</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Purchases today</h3><div class="atoms-metric">${data.receiving_snapshot.purchase_count_today || 0}<div class="atoms-muted">${money(data.receiving_snapshot.purchase_total_today || 0)} · ${data.receiving_snapshot.purchase_count_14d || 0} in 14d</div></div></div>
          <div class="atoms-card"><h3>IMEIs today</h3><div class="atoms-metric">${data.receiving_snapshot.imei_count_today || 0}<div class="atoms-muted">${data.receiving_snapshot.imei_count_14d || 0} in 14 days</div></div></div>
          <div class="atoms-card"><h3>Supplier payments</h3><div class="atoms-metric">${data.receiving_snapshot.supplier_payment_count_today || 0}<div class="atoms-muted">${money(data.receiving_snapshot.supplier_payment_total_today || 0)} today · ${money(data.receiving_snapshot.supplier_payment_total_14d || 0)} in 14d</div></div></div>
          <div class="atoms-card"><h3>Swaps & returns</h3><div class="atoms-metric">${(data.receiving_snapshot.swap_count_today || 0) + (data.receiving_snapshot.supplier_return_count_today || 0)}<div class="atoms-muted">${data.receiving_snapshot.receiving_count_today || 0} events today · ${data.receiving_snapshot.receiving_count_14d || 0} in 14d</div></div></div>
        </div>
      </div>` : ''}
      ${data.payable_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Payables</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Suppliers owing</h3><div class="atoms-metric">${data.payable_snapshot.owing_supplier_count || 0}<div class="atoms-muted">${money(data.payable_snapshot.payable_total || 0)} outstanding</div></div></div>
          <div class="atoms-card"><h3>Open payables</h3><div class="atoms-metric">${data.payable_snapshot.open_payable_count || 0}<div class="atoms-muted">${money(data.payable_snapshot.open_payable_total || 0)} · ${data.payable_snapshot.aged_payable_count || 0} aged</div></div></div>
          <div class="atoms-card"><h3>Open POs</h3><div class="atoms-metric">${data.payable_snapshot.open_po_count || 0}<div class="atoms-muted">${money(data.payable_snapshot.open_po_total || 0)}</div></div></div>
          <div class="atoms-card"><h3>Payments & returns</h3><div class="atoms-metric">${money(data.payable_snapshot.supplier_payment_total_today || 0)}<div class="atoms-muted">${money(data.payable_snapshot.supplier_payment_total_14d || 0)} paid in 14d · ${money(data.payable_snapshot.supplier_return_total_today || 0)} returned today</div></div></div>
        </div>
      </div>` : ''}
      ${data.receivable_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Receivables</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Customers owing</h3><div class="atoms-metric">${data.receivable_snapshot.owing_customer_count || 0}<div class="atoms-muted">${money(data.receivable_snapshot.receivable_total || 0)} outstanding</div></div></div>
          <div class="atoms-card"><h3>Overdue</h3><div class="atoms-metric">${data.receivable_snapshot.overdue_count || 0}<div class="atoms-muted">${money(data.receivable_snapshot.overdue_total || 0)} · ${data.receivable_snapshot.open_invoice_count || 0} open invoices</div></div></div>
          <div class="atoms-card"><h3>Retail / wholesale</h3><div class="atoms-metric">${data.receivable_snapshot.retail_owing_count || 0}<div class="atoms-muted">${data.receivable_snapshot.wholesale_owing_count || 0} wholesale · ${data.receivable_snapshot.new_customers_today || 0} new today</div></div></div>
          <div class="atoms-card"><h3>Collections</h3><div class="atoms-metric">${money(data.receivable_snapshot.collection_total_today || 0)}<div class="atoms-muted">${money(data.receivable_snapshot.collection_total_14d || 0)} in 14d · ${data.receivable_snapshot.new_customers_14d || 0} new customers</div></div></div>
        </div>
      </div>` : ''}
      ${data.workflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Workflow</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Open repairs</h3><div class="atoms-metric">${data.workflow_snapshot.open_repair_count || 0}<div class="atoms-muted">${data.workflow_snapshot.stuck_repair_count || 0} stuck · ${data.workflow_snapshot.repair_completed_today || 0} done today</div></div></div>
          <div class="atoms-card"><h3>Approvals & transit</h3><div class="atoms-metric">${data.workflow_snapshot.pending_approval_count || 0}<div class="atoms-muted">${data.workflow_snapshot.in_transit_count || 0} in transit · ${data.workflow_snapshot.stuck_transfer_count || 0} stuck</div></div></div>
          <div class="atoms-card"><h3>Counts & faulty</h3><div class="atoms-metric">${data.workflow_snapshot.open_stock_count_count || 0}<div class="atoms-muted">${data.workflow_snapshot.faulty_device_count || 0} faulty · ${data.workflow_snapshot.stuck_faulty_count || 0} stuck</div></div></div>
          <div class="atoms-card"><h3>Activity</h3><div class="atoms-metric">${data.workflow_snapshot.workflow_events_today || 0}<div class="atoms-muted">${data.workflow_snapshot.workflow_events_14d || 0} events in 14d · ${money(data.workflow_snapshot.expense_posted_total_today || 0)} expenses today</div></div></div>
        </div>
      </div>` : ''}
      ${data.transit_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Transit</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>In transit</h3><div class="atoms-metric">${data.transit_snapshot.in_transit_count || 0}<div class="atoms-muted">${data.transit_snapshot.in_transit_devices || 0} devices · ${data.transit_snapshot.stuck_transfer_count || 0} stuck</div></div></div>
          <div class="atoms-card"><h3>Outbound / inbound</h3><div class="atoms-metric">${data.transit_snapshot.outbound_in_transit || 0}<div class="atoms-muted">${data.transit_snapshot.inbound_in_transit || 0} inbound · ${data.transit_snapshot.stuck_device_count || 0} stuck devices</div></div></div>
          <div class="atoms-card"><h3>Transfers today</h3><div class="atoms-metric">${data.transit_snapshot.transfer_count_today || 0}<div class="atoms-muted">${data.transit_snapshot.dispatched_today || 0} dispatched · ${data.transit_snapshot.received_today || 0} received</div></div></div>
          <div class="atoms-card"><h3>Transfers (14d)</h3><div class="atoms-metric">${data.transit_snapshot.transfer_count_14d || 0}<div class="atoms-muted">${data.transit_snapshot.dispatched_14d || 0} dispatched · ${data.transit_snapshot.devices_moved_14d || 0} devices moved</div></div></div>
        </div>
      </div>` : ''}
      ${data.stockflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Stock overview</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Available stock</h3><div class="atoms-metric">${data.stockflow_snapshot.available_qty || 0}<div class="atoms-muted">${money(data.stockflow_snapshot.available_value || 0)} · ${money(data.stockflow_snapshot.on_hand_value || 0)} on hand</div></div></div>
          <div class="atoms-card"><h3>Low stock</h3><div class="atoms-metric">${data.stockflow_snapshot.low_stock_count || 0}<div class="atoms-muted">${data.stockflow_snapshot.low_stock_qty || 0} units · lowest ${data.stockflow_snapshot.lowest_available || 0}</div></div></div>
          <div class="atoms-card"><h3>Faulty & IMEI</h3><div class="atoms-metric">${data.stockflow_snapshot.faulty_qty || 0}<div class="atoms-muted">${data.stockflow_snapshot.imei_total || 0} IMEI · ${data.stockflow_snapshot.imei_available || 0} available</div></div></div>
          <div class="atoms-card"><h3>Flow (14d)</h3><div class="atoms-metric">${data.stockflow_snapshot.imei_registered_14d || 0}<div class="atoms-muted">${data.stockflow_snapshot.imei_registered_today || 0} today · ${data.stockflow_snapshot.slow_mover_count || 0} slow movers</div></div></div>
        </div>
      </div>` : ''}
      ${data.service_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Service</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Open repairs</h3><div class="atoms-metric">${data.service_snapshot.open_repair_count || 0}<div class="atoms-muted">${data.service_snapshot.stuck_repair_count || 0} stuck · ${data.service_snapshot.repair_opened_today || 0} opened today</div></div></div>
          <div class="atoms-card"><h3>Faulty queue</h3><div class="atoms-metric">${data.service_snapshot.faulty_device_count || 0}<div class="atoms-muted">${data.service_snapshot.stuck_faulty_count || 0} stuck · ${data.service_snapshot.under_repair_qty || 0} under repair</div></div></div>
          <div class="atoms-card"><h3>Completed</h3><div class="atoms-metric">${data.service_snapshot.repair_completed_today || 0}<div class="atoms-muted">${data.service_snapshot.repair_completed_14d || 0} in 14d · ${data.service_snapshot.repair_intake_14d || 0} intake</div></div></div>
          <div class="atoms-card"><h3>Returns</h3><div class="atoms-metric">${data.service_snapshot.return_count_today || 0}<div class="atoms-muted">${data.service_snapshot.return_count_14d || 0} in 14d · ${data.service_snapshot.service_queue_total || 0} in queue</div></div></div>
        </div>
      </div>` : ''}
      ${data.countflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Stock counts</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Open counts</h3><div class="atoms-metric">${data.countflow_snapshot.open_count_count || 0}<div class="atoms-muted">${data.countflow_snapshot.pending_approval_count || 0} pending · ${data.countflow_snapshot.count_queue_total || 0} in queue</div></div></div>
          <div class="atoms-card"><h3>Variance open</h3><div class="atoms-metric">${data.countflow_snapshot.open_missing_units || 0}<div class="atoms-muted">${data.countflow_snapshot.open_extra_units || 0} extra · ${data.countflow_snapshot.stock_variance_pending || 0} approvals</div></div></div>
          <div class="atoms-card"><h3>Posted today</h3><div class="atoms-metric">${data.countflow_snapshot.posted_today_count || 0}<div class="atoms-muted">${data.countflow_snapshot.missing_units_today || 0} missing · ${data.countflow_snapshot.extra_units_today || 0} extra</div></div></div>
          <div class="atoms-card"><h3>Posted (14d)</h3><div class="atoms-metric">${data.countflow_snapshot.posted_14d_count || 0}<div class="atoms-muted">${data.countflow_snapshot.missing_units_14d || 0} missing · ${data.countflow_snapshot.extra_units_14d || 0} extra</div></div></div>
        </div>
      </div>` : ''}
      ${data.approvalflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Pending approvals</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Pending</h3><div class="atoms-metric">${data.approvalflow_snapshot.pending_count || 0}<div class="atoms-muted">${data.approvalflow_snapshot.pending_type_count || 0} types · ${data.approvalflow_snapshot.price_override_count || 0} price overrides</div></div></div>
          <div class="atoms-card"><h3>Expense / variance</h3><div class="atoms-metric">${data.approvalflow_snapshot.expense_count || 0}<div class="atoms-muted">${data.approvalflow_snapshot.stock_variance_count || 0} stock variances pending</div></div></div>
          <div class="atoms-card"><h3>Reviewed today</h3><div class="atoms-metric">${data.approvalflow_snapshot.reviewed_today_count || 0}<div class="atoms-muted">${data.approvalflow_snapshot.approved_today_count || 0} approved · ${data.approvalflow_snapshot.rejected_today_count || 0} rejected</div></div></div>
          <div class="atoms-card"><h3>Reviewed (14d)</h3><div class="atoms-metric">${data.approvalflow_snapshot.reviewed_14d_count || 0}<div class="atoms-muted">${data.approvalflow_snapshot.approved_14d_count || 0} approved · ${data.approvalflow_snapshot.rejected_14d_count || 0} rejected</div></div></div>
        </div>
      </div>` : ''}
      ${data.auditflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Activity log</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Events today</h3><div class="atoms-metric">${data.auditflow_snapshot.event_count_today || 0}<div class="atoms-muted">${data.auditflow_snapshot.users_today || 0} users active</div></div></div>
          <div class="atoms-card"><h3>Events (14d)</h3><div class="atoms-metric">${data.auditflow_snapshot.event_count_14d || 0}<div class="atoms-muted">${data.auditflow_snapshot.user_count_14d || 0} users · ${data.auditflow_snapshot.entity_type_count_14d || 0} entity types</div></div></div>
          <div class="atoms-card"><h3>Sales & payments</h3><div class="atoms-metric">${data.auditflow_snapshot.sale_event_count_14d || 0}<div class="atoms-muted">${data.auditflow_snapshot.payment_event_count_14d || 0} payment events in 14d</div></div></div>
          <div class="atoms-card"><h3>Inventory & transfer</h3><div class="atoms-metric">${data.auditflow_snapshot.inventory_event_count_14d || 0}<div class="atoms-muted">${data.auditflow_snapshot.transfer_event_count_14d || 0} transfers · top ${escapeHtml(data.auditflow_snapshot.top_action_14d || '—')}</div></div></div>
        </div>
      </div>` : ''}
      ${data.collectionflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Payment collections</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Receivables</h3><div class="atoms-metric">${money(data.collectionflow_snapshot.receivable_total || 0)}<div class="atoms-muted">${data.collectionflow_snapshot.owing_customer_count || 0} customers · ${data.collectionflow_snapshot.overdue_share_pct || 0}% overdue</div></div></div>
          <div class="atoms-card"><h3>Overdue</h3><div class="atoms-metric">${data.collectionflow_snapshot.overdue_count || 0}<div class="atoms-muted">${money(data.collectionflow_snapshot.overdue_total || 0)} · ${data.collectionflow_snapshot.open_invoice_count || 0} open invoices</div></div></div>
          <div class="atoms-card"><h3>Collections today</h3><div class="atoms-metric">${money(data.collectionflow_snapshot.collection_total_today || 0)}<div class="atoms-muted">${data.collectionflow_snapshot.collection_count_today || 0} payments · avg ${money(data.collectionflow_snapshot.avg_collection_today || 0)}</div></div></div>
          <div class="atoms-card"><h3>Collections (14d)</h3><div class="atoms-metric">${money(data.collectionflow_snapshot.collection_total_14d || 0)}<div class="atoms-muted">${data.collectionflow_snapshot.collection_count_14d || 0} payments · ${data.collectionflow_snapshot.retail_owing_count || 0} retail · ${data.collectionflow_snapshot.wholesale_owing_count || 0} wholesale</div></div></div>
        </div>
      </div>` : ''}
      ${data.alertflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Alerts summary</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Unread</h3><div class="atoms-metric">${data.alertflow_snapshot.unread_count || 0}<div class="atoms-muted">${data.alertflow_snapshot.unread_today || 0} today · ${data.alertflow_snapshot.read_today || 0} read today</div></div></div>
          <div class="atoms-card"><h3>Alerts today</h3><div class="atoms-metric">${data.alertflow_snapshot.alert_count_today || 0}<div class="atoms-muted">${data.alertflow_snapshot.alert_types_active || 0} active types in 14d</div></div></div>
          <div class="atoms-card"><h3>Stock & debt</h3><div class="atoms-metric">${data.alertflow_snapshot.low_stock_alert_count_14d || 0}<div class="atoms-muted">${data.alertflow_snapshot.debt_alert_count_14d || 0} debt alerts in 14d</div></div></div>
          <div class="atoms-card"><h3>Approval & ops</h3><div class="atoms-metric">${data.alertflow_snapshot.approval_alert_count_14d || 0}<div class="atoms-muted">${data.alertflow_snapshot.ops_alert_count_14d || 0} ops · ${data.alertflow_snapshot.alert_count_14d || 0} total in 14d</div></div></div>
        </div>
      </div>` : ''}
      ${data.expenseflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Expenses summary</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Pending</h3><div class="atoms-metric">${money(data.expenseflow_snapshot.pending_total || 0)}<div class="atoms-muted">${data.expenseflow_snapshot.pending_count || 0} items · max ${money(data.expenseflow_snapshot.largest_pending_amount || 0)}</div></div></div>
          <div class="atoms-card"><h3>Approval queue</h3><div class="atoms-metric">${data.expenseflow_snapshot.approval_pending_count || 0}<div class="atoms-muted">${data.expenseflow_snapshot.category_count_14d || 0} categories in 14d</div></div></div>
          <div class="atoms-card"><h3>Posted today</h3><div class="atoms-metric">${money(data.expenseflow_snapshot.posted_today_total || 0)}<div class="atoms-muted">${data.expenseflow_snapshot.posted_today_count || 0} posted · avg ${money(data.expenseflow_snapshot.avg_posted_today || 0)}</div></div></div>
          <div class="atoms-card"><h3>Posted (14d)</h3><div class="atoms-metric">${money(data.expenseflow_snapshot.posted_14d_total || 0)}<div class="atoms-muted">${data.expenseflow_snapshot.posted_14d_count || 0} posted · top ${escapeHtml(data.expenseflow_snapshot.top_category_14d || '—')}</div></div></div>
        </div>
      </div>` : ''}
      ${data.performanceflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Inventory performance</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Low stock</h3><div class="atoms-metric">${data.performanceflow_snapshot.low_stock_count || 0}<div class="atoms-muted">${data.performanceflow_snapshot.low_stock_qty || 0} units on hand</div></div></div>
          <div class="atoms-card"><h3>Slow movers</h3><div class="atoms-metric">${data.performanceflow_snapshot.slow_mover_count || 0}<div class="atoms-muted">${data.performanceflow_snapshot.slow_mover_qty || 0} units idle</div></div></div>
          <div class="atoms-card"><h3>Top sellers (14d)</h3><div class="atoms-metric">${money(data.performanceflow_snapshot.top_seller_revenue || 0)}<div class="atoms-muted">${data.performanceflow_snapshot.top_seller_units || 0} units · ${data.performanceflow_snapshot.top_seller_count || 0} products</div></div></div>
          <div class="atoms-card"><h3>Top product</h3><div class="atoms-metric">${escapeHtml(data.performanceflow_snapshot.top_product_name || '—')}<div class="atoms-muted">${data.performanceflow_snapshot.top_product_units || 0} units · ${money(data.performanceflow_snapshot.top_product_revenue || 0)} · profit ${money(data.performanceflow_snapshot.top_product_profit || 0)}</div></div></div>
        </div>
      </div>` : ''}
      ${data.customerflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Customerflow</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>New customers</h3><div class="atoms-metric">${data.customerflow_snapshot.new_customers_today || 0}<div class="atoms-muted">${data.customerflow_snapshot.new_customers_14d || 0} in 14 days</div></div></div>
          <div class="atoms-card"><h3>Customers owing</h3><div class="atoms-metric">${data.customerflow_snapshot.owing_customer_count || 0}<div class="atoms-muted">${money(data.customerflow_snapshot.receivable_total || 0)} · avg ${money(data.customerflow_snapshot.avg_balance_owing || 0)}</div></div></div>
          <div class="atoms-card"><h3>Overdue</h3><div class="atoms-metric">${data.customerflow_snapshot.overdue_count || 0}<div class="atoms-muted">${money(data.customerflow_snapshot.overdue_total || 0)} · ${data.customerflow_snapshot.overdue_share_pct || 0}% of receivables</div></div></div>
          <div class="atoms-card"><h3>Open & collections</h3><div class="atoms-metric">${data.customerflow_snapshot.open_invoice_count || 0}<div class="atoms-muted">${money(data.customerflow_snapshot.open_invoice_total || 0)} open · ${data.customerflow_snapshot.collection_count_today || 0} collected today (${money(data.customerflow_snapshot.collection_total_today || 0)})</div></div></div>
        </div>
      </div>` : ''}
      ${data.intakeflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Intakeflow</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Purchases</h3><div class="atoms-metric">${money(data.intakeflow_snapshot.purchase_total || 0)}<div class="atoms-muted">${data.intakeflow_snapshot.purchase_count || 0} today · avg ${money(data.intakeflow_snapshot.avg_purchase_today || 0)} · ${data.intakeflow_snapshot.purchase_count_14d || 0} in 14d</div></div></div>
          <div class="atoms-card"><h3>IMEIs registered</h3><div class="atoms-metric">${data.intakeflow_snapshot.imei_count || 0}<div class="atoms-muted">${data.intakeflow_snapshot.imei_count_14d || 0} in 14 days</div></div></div>
          <div class="atoms-card"><h3>Swaps</h3><div class="atoms-metric">${data.intakeflow_snapshot.swap_count || 0}<div class="atoms-muted">${money(data.intakeflow_snapshot.swap_collected || 0)} collected · ${data.intakeflow_snapshot.swap_count_14d || 0} in 14d</div></div></div>
          <div class="atoms-card"><h3>Supplier flow</h3><div class="atoms-metric">${data.intakeflow_snapshot.intake_count_today || 0}<div class="atoms-muted">${data.intakeflow_snapshot.supplier_payment_count || 0} payments (${money(data.intakeflow_snapshot.supplier_payment_total || 0)}) · ${data.intakeflow_snapshot.supplier_return_count || 0} returns</div></div></div>
        </div>
      </div>` : ''}
      ${data.supplierflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Supplierflow</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Suppliers owing</h3><div class="atoms-metric">${data.supplierflow_snapshot.owing_supplier_count || 0}<div class="atoms-muted">${money(data.supplierflow_snapshot.payable_total || 0)} · avg ${money(data.supplierflow_snapshot.avg_balance_owing || 0)}</div></div></div>
          <div class="atoms-card"><h3>Aged payables</h3><div class="atoms-metric">${data.supplierflow_snapshot.aged_payable_count || 0}<div class="atoms-muted">${money(data.supplierflow_snapshot.aged_payable_total || 0)} · ${data.supplierflow_snapshot.aged_share_pct || 0}% of payables</div></div></div>
          <div class="atoms-card"><h3>Open POs</h3><div class="atoms-metric">${data.supplierflow_snapshot.open_po_count || 0}<div class="atoms-muted">${money(data.supplierflow_snapshot.open_po_total || 0)} · ${data.supplierflow_snapshot.open_payable_count || 0} open payables</div></div></div>
          <div class="atoms-card"><h3>Payments & returns</h3><div class="atoms-metric">${data.supplierflow_snapshot.supplier_payment_count_today || 0}<div class="atoms-muted">${money(data.supplierflow_snapshot.supplier_payment_total_today || 0)} today · ${data.supplierflow_snapshot.supplier_payment_count_14d || 0} in 14d · ${data.supplierflow_snapshot.supplier_return_count_today || 0} returns</div></div></div>
        </div>
      </div>` : ''}
      ${data.inventoryflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Inventoryflow</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Available stock</h3><div class="atoms-metric">${data.inventoryflow_snapshot.available_qty || 0}<div class="atoms-muted">${money(data.inventoryflow_snapshot.available_value || 0)} · avg ${money(data.inventoryflow_snapshot.avg_unit_value || 0)}/unit</div></div></div>
          <div class="atoms-card"><h3>On-hand value</h3><div class="atoms-metric">${money(data.inventoryflow_snapshot.on_hand_value || 0)}<div class="atoms-muted">${data.inventoryflow_snapshot.faulty_qty || 0} faulty · ${data.inventoryflow_snapshot.faulty_share_pct || 0}% of value</div></div></div>
          <div class="atoms-card"><h3>Low stock</h3><div class="atoms-metric">${data.inventoryflow_snapshot.low_stock_count || 0}<div class="atoms-muted">${data.inventoryflow_snapshot.low_stock_qty || 0} units · lowest ${data.inventoryflow_snapshot.lowest_available || 0}</div></div></div>
          <div class="atoms-card"><h3>IMEI status</h3><div class="atoms-metric">${data.inventoryflow_snapshot.imei_total || 0}<div class="atoms-muted">${data.inventoryflow_snapshot.imei_available || 0} available · ${data.inventoryflow_snapshot.imei_sold || 0} sold · ${data.inventoryflow_snapshot.imei_registered_today || 0} today</div></div></div>
        </div>
      </div>` : ''}
      ${data.staffflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Staffflow</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Staff (14d)</h3><div class="atoms-metric">${data.staffflow_snapshot.staff_count || 0}<div class="atoms-muted">${data.staffflow_snapshot.staff_invoices || 0} invoices · ${money(data.staffflow_snapshot.staff_revenue || 0)} · avg ${money(data.staffflow_snapshot.avg_revenue_per_staff || 0)}</div></div></div>
          <div class="atoms-card"><h3>Top staff</h3><div class="atoms-metric">${escapeHtml(data.staffflow_snapshot.top_staff_name || '—')}<div class="atoms-muted">${money(data.staffflow_snapshot.top_staff_revenue || 0)} · ${data.staffflow_snapshot.top_staff_collection_rate || 0}% collected</div></div></div>
          <div class="atoms-card"><h3>Branches (14d)</h3><div class="atoms-metric">${data.staffflow_snapshot.branch_count || 0}<div class="atoms-muted">${money(data.staffflow_snapshot.branch_revenue || 0)} · top ${money(data.staffflow_snapshot.top_branch_revenue || 0)}</div></div></div>
          <div class="atoms-card"><h3>Today</h3><div class="atoms-metric">${data.staffflow_snapshot.sales_today_count || 0}<div class="atoms-muted">${money(data.staffflow_snapshot.sales_today_total || 0)} sales · ${data.staffflow_snapshot.devices_today || 0} devices · ${data.staffflow_snapshot.collection_rate_14d || 0}% collected (14d)</div></div></div>
        </div>
      </div>` : ''}
      ${data.branchflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Branchflow</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Network (14d)</h3><div class="atoms-metric">${data.branchflow_snapshot.active_branch_count || 0}<div class="atoms-muted">${data.branchflow_snapshot.branch_count || 0} branches · ${data.branchflow_snapshot.invoice_count || 0} invoices · ${money(data.branchflow_snapshot.revenue_14d || 0)}</div></div></div>
          <div class="atoms-card"><h3>Top branch</h3><div class="atoms-metric">${escapeHtml(data.branchflow_snapshot.top_branch_name || '—')}<div class="atoms-muted">${money(data.branchflow_snapshot.top_branch_revenue || 0)} · profit ${money(data.branchflow_snapshot.top_branch_profit || 0)} · ${data.branchflow_snapshot.top_branch_collection_rate || 0}% collected</div></div></div>
          <div class="atoms-card"><h3>Collection</h3><div class="atoms-metric">${data.branchflow_snapshot.collection_rate_14d || 0}%<div class="atoms-muted">${money(data.branchflow_snapshot.collected_14d || 0)} collected · avg ${money(data.branchflow_snapshot.avg_revenue_per_branch || 0)}/branch</div></div></div>
          <div class="atoms-card"><h3>Stock & due</h3><div class="atoms-metric">${data.branchflow_snapshot.stock_qty || 0}<div class="atoms-muted">${money(data.branchflow_snapshot.stock_value || 0)} stock · ${money(data.branchflow_snapshot.due_total || 0)} due (${data.branchflow_snapshot.due_share_pct || 0}%)</div></div></div>
        </div>
      </div>` : ''}
      ${data.cashflowflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Cashflowflow</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Cash in (14d)</h3><div class="atoms-metric">${money(data.cashflowflow_snapshot.inflows_14d || 0)}<div class="atoms-muted">net ${money(data.cashflowflow_snapshot.net_14d || 0)} · avg ${money(data.cashflowflow_snapshot.avg_daily_inflow_14d || 0)}/day</div></div></div>
          <div class="atoms-card"><h3>Top method</h3><div class="atoms-metric">${escapeHtml(data.cashflowflow_snapshot.top_payment_method || '—')}<div class="atoms-muted">${money(data.cashflowflow_snapshot.top_payment_collected || 0)} · ${data.cashflowflow_snapshot.payment_method_count || 0} methods</div></div></div>
          <div class="atoms-card"><h3>Collections</h3><div class="atoms-metric">${data.cashflowflow_snapshot.collection_share_pct || 0}%<div class="atoms-muted">${money(data.cashflowflow_snapshot.collections_14d || 0)} collected · ${data.cashflowflow_snapshot.outflow_share_pct || 0}% outflow share</div></div></div>
          <div class="atoms-card"><h3>Today</h3><div class="atoms-metric">${money(data.cashflowflow_snapshot.net_today || 0)}<div class="atoms-muted">${money(data.cashflowflow_snapshot.inflows_today || 0)} in · ${money(data.cashflowflow_snapshot.outflows_today || 0)} out · ${money(data.cashflowflow_snapshot.expenses_today || 0)} expenses</div></div></div>
        </div>
      </div>` : ''}
      ${data.mixflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Mixflow</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Collected (14d)</h3><div class="atoms-metric">${money(data.mixflow_snapshot.payment_collected_14d || 0)}<div class="atoms-muted">${data.mixflow_snapshot.payment_method_count || 0} methods · ${data.mixflow_snapshot.top_payment_share_pct || 0}% top method</div></div></div>
          <div class="atoms-card"><h3>Retail (14d)</h3><div class="atoms-metric">${money(data.mixflow_snapshot.retail_revenue || 0)}<div class="atoms-muted">${data.mixflow_snapshot.retail_invoices || 0} invoices · ${data.mixflow_snapshot.retail_share_pct || 0}% share</div></div></div>
          <div class="atoms-card"><h3>Wholesale (14d)</h3><div class="atoms-metric">${money(data.mixflow_snapshot.wholesale_revenue || 0)}<div class="atoms-muted">${data.mixflow_snapshot.wholesale_invoices || 0} invoices · ${data.mixflow_snapshot.wholesale_share_pct || 0}% share</div></div></div>
          <div class="atoms-card"><h3>Today</h3><div class="atoms-metric">${money(data.mixflow_snapshot.sales_today || 0)}<div class="atoms-muted">${data.mixflow_snapshot.invoices_today || 0} invoices · avg ${money(data.mixflow_snapshot.avg_invoice_value_14d || 0)} (14d)</div></div></div>
        </div>
      </div>` : ''}
      ${data.trendflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Trendflow</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Sales (14d)</h3><div class="atoms-metric">${money(data.trendflow_snapshot.sales_14d || 0)}<div class="atoms-muted">${data.trendflow_snapshot.active_day_count || 0} active days · avg ${money(data.trendflow_snapshot.avg_daily_net || 0)}/day</div></div></div>
          <div class="atoms-card"><h3>Collection</h3><div class="atoms-metric">${data.trendflow_snapshot.collection_rate_14d || 0}%<div class="atoms-muted">${money(data.trendflow_snapshot.collected_14d || 0)} collected · avg ${money(data.trendflow_snapshot.avg_daily_collected_14d || 0)}/day</div></div></div>
          <div class="atoms-card"><h3>Best day</h3><div class="atoms-metric">${money(data.trendflow_snapshot.best_day_net || 0)}<div class="atoms-muted">${escapeHtml(data.trendflow_snapshot.best_day_date || '—')} · ${data.trendflow_snapshot.best_day_share_pct || 0}% of 14d</div></div></div>
          <div class="atoms-card"><h3>Today</h3><div class="atoms-metric">${money(data.trendflow_snapshot.sales_today || 0)}<div class="atoms-muted">${data.trendflow_snapshot.today_vs_avg_pct || 0}% of avg · ${data.trendflow_snapshot.velocity_change_pct || 0}% 7d velocity</div></div></div>
        </div>
      </div>` : ''}
      ${data.productflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Productflow</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Top sellers (14d)</h3><div class="atoms-metric">${data.productflow_snapshot.top_seller_count || 0}<div class="atoms-muted">${data.productflow_snapshot.top_seller_units || 0} units · ${money(data.productflow_snapshot.top_seller_revenue || 0)} · ${data.productflow_snapshot.profit_margin_pct || 0}% margin</div></div></div>
          <div class="atoms-card"><h3>Best product</h3><div class="atoms-metric">${escapeHtml(data.productflow_snapshot.top_product_name || '—')}<div class="atoms-muted">${money(data.productflow_snapshot.top_product_profit || 0)} profit · ${data.productflow_snapshot.top_product_share_pct || 0}% share</div></div></div>
          <div class="atoms-card"><h3>Unit economics</h3><div class="atoms-metric">${money(data.productflow_snapshot.avg_profit_per_unit || 0)}<div class="atoms-muted">${money(data.productflow_snapshot.avg_revenue_per_unit || 0)}/unit revenue · ${money(data.productflow_snapshot.top_seller_profit || 0)} total profit</div></div></div>
          <div class="atoms-card"><h3>Slow & low stock</h3><div class="atoms-metric">${data.productflow_snapshot.slow_mover_count || 0}<div class="atoms-muted">${data.productflow_snapshot.slow_mover_qty || 0} slow units (${data.productflow_snapshot.slow_mover_share_pct || 0}%) · ${data.productflow_snapshot.low_stock_count || 0} low-stock alerts</div></div></div>
        </div>
      </div>` : ''}
      ${data.ledgerflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Ledgerflow</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Receivables</h3><div class="atoms-metric">${money(data.ledgerflow_snapshot.receivable_total || 0)}<div class="atoms-muted">${data.ledgerflow_snapshot.receivable_party_count || 0} customers · avg ${money(data.ledgerflow_snapshot.avg_receivable_per_customer || 0)}</div></div></div>
          <div class="atoms-card"><h3>Payables</h3><div class="atoms-metric">${money(data.ledgerflow_snapshot.payable_total || 0)}<div class="atoms-muted">${data.ledgerflow_snapshot.payable_party_count || 0} suppliers · avg ${money(data.ledgerflow_snapshot.avg_payable_per_supplier || 0)}</div></div></div>
          <div class="atoms-card"><h3>Net position</h3><div class="atoms-metric">${money(data.ledgerflow_snapshot.net_position || 0)}<div class="atoms-muted">${data.ledgerflow_snapshot.overdue_count || 0} overdue (${data.ledgerflow_snapshot.overdue_share_pct || 0}%) · ${data.ledgerflow_snapshot.collection_rate_14d || 0}% collected (14d)</div></div></div>
          <div class="atoms-card"><h3>Cash today</h3><div class="atoms-metric">${money(data.ledgerflow_snapshot.cash_net_today || 0)}<div class="atoms-muted">${money(data.ledgerflow_snapshot.cash_in_today || 0)} in · ${money(data.ledgerflow_snapshot.cash_out_today || 0)} out · ${money(data.ledgerflow_snapshot.collections_today || 0)} collections</div></div></div>
        </div>
      </div>` : ''}
      ${data.executiveflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Executiveflow</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Sales today</h3><div class="atoms-metric">${money(data.executiveflow_snapshot.sales_today_total || 0)}<div class="atoms-muted">${data.executiveflow_snapshot.sales_today_count || 0} sales · ${data.executiveflow_snapshot.today_vs_avg_14d_pct || 0}% of 14d avg</div></div></div>
          <div class="atoms-card"><h3>Net position</h3><div class="atoms-metric">${money(data.executiveflow_snapshot.net_position || 0)}<div class="atoms-muted">${money(data.executiveflow_snapshot.receivable_total || 0)} recv · ${money(data.executiveflow_snapshot.payable_total || 0)} pay</div></div></div>
          <div class="atoms-card"><h3>Cash</h3><div class="atoms-metric">${money(data.executiveflow_snapshot.cash_net_today || 0)}<div class="atoms-muted">${money(data.executiveflow_snapshot.cash_net_14d || 0)} net (14d) · ${data.executiveflow_snapshot.collection_rate_14d || 0}% collected</div></div></div>
          <div class="atoms-card"><h3>Operations</h3><div class="atoms-metric">${data.executiveflow_snapshot.operations_load || 0}<div class="atoms-muted">${data.executiveflow_snapshot.open_repair_count || 0} repairs · ${data.executiveflow_snapshot.pending_approval_count || 0} approvals · ${data.executiveflow_snapshot.in_transit_count || 0} transit · ${data.executiveflow_snapshot.alert_load || 0} alerts</div></div></div>
        </div>
      </div>` : ''}
      ${data.agingflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Agingflow</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Receivables aged</h3><div class="atoms-metric">${money(data.agingflow_snapshot.receivable_total || 0)}<div class="atoms-muted">${data.agingflow_snapshot.receivable_line_count || 0} open · ${data.agingflow_snapshot.receivable_aged_share_pct || 0}% 90+</div></div></div>
          <div class="atoms-card"><h3>Receivable stale</h3><div class="atoms-metric">${money(data.agingflow_snapshot.receivable_stale_total || 0)}<div class="atoms-muted">${data.agingflow_snapshot.receivable_current_share_pct || 0}% current · ${money(data.agingflow_snapshot.receivable_90_plus || 0)} 90+</div></div></div>
          <div class="atoms-card"><h3>Payables aged</h3><div class="atoms-metric">${money(data.agingflow_snapshot.payable_total || 0)}<div class="atoms-muted">${data.agingflow_snapshot.payable_line_count || 0} open · ${data.agingflow_snapshot.payable_aged_share_pct || 0}% 90+</div></div></div>
          <div class="atoms-card"><h3>Net aging</h3><div class="atoms-metric">${money(data.agingflow_snapshot.net_aging_position || 0)}<div class="atoms-muted">${data.agingflow_snapshot.stale_share_pct || 0}% stale combined · ${money(data.agingflow_snapshot.payment_collected_14d || 0)} collected (14d)</div></div></div>
        </div>
      </div>` : ''}
      ${data.tradeflow_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Tradeflow</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Total owing</h3><div class="atoms-metric">${money(data.tradeflow_snapshot.total_owing_total || 0)}<div class="atoms-muted">${data.tradeflow_snapshot.total_owing_count || 0} invoices · ${data.tradeflow_snapshot.wholesale_owing_share_pct || 0}% wholesale</div></div></div>
          <div class="atoms-card"><h3>Wholesale owing</h3><div class="atoms-metric">${money(data.tradeflow_snapshot.wholesale_owing_total || 0)}<div class="atoms-muted">${data.tradeflow_snapshot.wholesale_owing_count || 0} invoices · ${money(data.tradeflow_snapshot.wholesale_sales_14d || 0)} sales (14d)</div></div></div>
          <div class="atoms-card"><h3>Retail owing</h3><div class="atoms-metric">${money(data.tradeflow_snapshot.retail_owing_total || 0)}<div class="atoms-muted">${data.tradeflow_snapshot.retail_owing_count || 0} invoices · ${money(data.tradeflow_snapshot.retail_sales_14d || 0)} sales (14d)</div></div></div>
          <div class="atoms-card"><h3>Swaps & mix</h3><div class="atoms-metric">${data.tradeflow_snapshot.swap_14d_count || 0}<div class="atoms-muted">${money(data.tradeflow_snapshot.swap_collected_14d || 0)} collected · ${data.tradeflow_snapshot.retail_share_pct || 0}% retail · ${data.tradeflow_snapshot.wholesale_share_pct || 0}% wholesale</div></div></div>
        </div>
      </div>` : ''}
      ${data.cash_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Cash flow (14 days)</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Cash in</h3><div class="atoms-metric">${money(data.cash_snapshot.inflows || 0)}</div></div>
          <div class="atoms-card"><h3>Expenses</h3><div class="atoms-metric">${money(data.cash_snapshot.expenses || 0)}</div></div>
          <div class="atoms-card"><h3>Supplier payments</h3><div class="atoms-metric">${money(data.cash_snapshot.supplier_payments || 0)}</div></div>
          <div class="atoms-card"><h3>Net cash</h3><div class="atoms-metric">${money(data.cash_snapshot.net || 0)}</div></div>
        </div>
      </div>` : ''}
      ${(data.receivable_party_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Top customer balances</h3>
        <table class="atoms-table"><thead><tr><th>Customer</th><th>Balance</th></tr></thead><tbody>
          ${data.receivable_party_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-aging-cust" data-id="${l.id}">${escapeHtml(l.name || '')}</button></td>
            <td>${money(l.balance)}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.payable_party_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Top supplier balances</h3>
        <table class="atoms-table"><thead><tr><th>Supplier</th><th>Balance</th></tr></thead><tbody>
          ${data.payable_party_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-payable-sup" data-id="${l.id}">${escapeHtml(l.name || '')}</button></td>
            <td>${money(l.balance)}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${data.inventory_snapshot ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Inventory at this branch</h3>
        <div class="atoms-grid">
          <div class="atoms-card"><h3>Available units</h3><div class="atoms-metric">${data.inventory_snapshot.available_qty || 0}</div></div>
          <div class="atoms-card"><h3>Available value</h3><div class="atoms-metric">${money(data.inventory_snapshot.available_value || 0)}</div></div>
          <div class="atoms-card"><h3>Faulty units</h3><div class="atoms-metric">${data.inventory_snapshot.faulty_qty || 0}</div></div>
          <div class="atoms-card"><h3>On-hand value</h3><div class="atoms-metric">${money(data.inventory_snapshot.on_hand_value || 0)}</div></div>
          <div class="atoms-card"><h3>Accessory units</h3><div class="atoms-metric">${data.inventory_snapshot.quantity_qty || 0}<div class="atoms-muted">${money(data.inventory_snapshot.quantity_value || 0)}</div></div></div>
        </div>
      </div>` : ''}
      ${(data.imei_status_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>IMEI status at this branch</h3>
        <table class="atoms-table"><thead><tr><th>Status</th><th>Qty</th></tr></thead><tbody>
          ${data.imei_status_lines.map((l) => `<tr><td>${badge(l.status)}</td><td>${l.qty}</td></tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.inventory_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Top stock by value</h3>
        <table class="atoms-table"><thead><tr><th>Product</th><th>Qty</th><th>Valuation</th></tr></thead><tbody>
          ${data.inventory_lines.map((p) => `<tr>
            <td>${escapeHtml(p.name || '')}${p.variant_label ? `<br><span class="atoms-muted">${escapeHtml(p.variant_label)}</span>` : ''}</td>
            <td>${p.total}</td>
            <td>${money(p.valuation)}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.today_imei_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>IMEIs registered today</h3>
        <table class="atoms-table"><thead><tr><th>IMEI</th><th>Device</th><th>Status</th><th>Source</th></tr></thead><tbody>
          ${data.today_imei_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-open-imei" data-imei="${escapeHtml(l.imei || '')}">${escapeHtml(l.imei || '')}</button></td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
            <td>${badge(l.status)}</td>
            <td>${escapeHtml(l.source_type || '')}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      <div class="atoms-grid" style="margin:16px 0">
        <div class="atoms-card"><h3>0–30 days</h3><div class="atoms-metric">${money(aging['0-30'])}</div></div>
        <div class="atoms-card"><h3>31–60 days</h3><div class="atoms-metric">${money(aging['31-60'])}</div></div>
        <div class="atoms-card"><h3>61–90 days</h3><div class="atoms-metric">${money(aging['61-90'])}</div></div>
        <div class="atoms-card"><h3>90+ days</h3><div class="atoms-metric">${money(aging['90+'])}</div></div>
      </div>
      <div class="atoms-card" style="margin-bottom:16px">
        <h3>Open receivables</h3>
        <table class="atoms-table"><thead><tr><th>Customer</th><th>Invoice</th><th>Devices</th><th>Due</th><th>Age</th></tr></thead><tbody>
          ${(data.aging?.lines || []).map((l) => `<tr>
            <td><button type="button" class="atoms-link js-aging-cust" data-id="${l.id}">${escapeHtml(l.name || '')}</button></td>
            <td>${escapeHtml(l.invoice_number || '')}</td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
            <td>${money(l.amount)}</td>
            <td>${l.days}d</td>
          </tr>`).join('') || '<tr><td colspan="5">No outstanding invoices.</td></tr>'}
        </tbody></table>
      </div>
      ${(data.overdue_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Overdue invoices (${data.debt_days || 7}+ days)</h3>
        <table class="atoms-table"><thead><tr><th>Customer</th><th>Invoice</th><th>Devices</th><th>Due</th><th>Age</th></tr></thead><tbody>
          ${data.overdue_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-aging-cust" data-id="${l.id}">${escapeHtml(l.name || '')}</button></td>
            <td>${escapeHtml(l.invoice_number || '')}</td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
            <td>${money(l.amount)}</td>
            <td>${l.days}d</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      <div class="atoms-card" style="margin-bottom:16px">
        <h3>Open payables</h3>
        <table class="atoms-table"><thead><tr><th>Supplier</th><th>PO invoice</th><th>Variants</th><th>Amount</th><th>Age</th></tr></thead><tbody>
          ${(data.payable_lines || []).map((l) => `<tr>
            <td><button type="button" class="atoms-link js-payable-sup" data-id="${l.id}">${escapeHtml(l.name || '')}</button></td>
            <td>${escapeHtml(l.invoice_number || '')}</td>
            <td>${escapeHtml(l.variant_summary || '—')}</td>
            <td>${money(l.amount)}</td>
            <td>${l.days}d</td>
          </tr>`).join('') || '<tr><td colspan="5">No outstanding purchase orders.</td></tr>'}
        </tbody></table>
      </div>
      ${(data.payable_aging_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Payable aging</h3>
        <div class="atoms-grid" style="margin-bottom:12px">
          <div class="atoms-card"><h3>0–30 days</h3><div class="atoms-metric">${money((data.payable_aging_buckets || {})['0-30'] || 0)}</div></div>
          <div class="atoms-card"><h3>31–60 days</h3><div class="atoms-metric">${money((data.payable_aging_buckets || {})['31-60'] || 0)}</div></div>
          <div class="atoms-card"><h3>61–90 days</h3><div class="atoms-metric">${money((data.payable_aging_buckets || {})['61-90'] || 0)}</div></div>
          <div class="atoms-card"><h3>90+ days</h3><div class="atoms-metric">${money((data.payable_aging_buckets || {})['90+'] || 0)}</div></div>
        </div>
        <table class="atoms-table"><thead><tr><th>Supplier</th><th>PO invoice</th><th>Variants</th><th>Amount</th><th>Age</th></tr></thead><tbody>
          ${data.payable_aging_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-payable-sup" data-id="${l.id}">${escapeHtml(l.name || '')}</button></td>
            <td>${escapeHtml(l.invoice_number || '')}</td>
            <td>${escapeHtml(l.variant_summary || '—')}</td>
            <td>${money(l.amount)}</td>
            <td>${l.days}d</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.movement_events || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Stock movement (14 days)</h3>
        <table class="atoms-table"><thead><tr><th>Event</th><th>Qty</th></tr></thead><tbody>
          ${data.movement_events.map((e) => `<tr><td>${escapeHtml(labelEvent(e.event_type))}</td><td>${e.qty}</td></tr>`).join('')}
        </tbody></table>
        ${(data.movement_lines || []).length ? `<h3 style="margin-top:16px">By product</h3>
        <table class="atoms-table"><thead><tr><th>Event</th><th>Product</th><th>Variant</th><th>Qty</th></tr></thead><tbody>
          ${data.movement_lines.map((e) => `<tr>
            <td>${escapeHtml(labelEvent(e.event_type))}</td>
            <td>${escapeHtml(e.product_name || '')}</td>
            <td>${escapeHtml(e.variant_label || '—')}</td>
            <td>${e.qty}</td>
          </tr>`).join('')}
        </tbody></table>` : ''}
      </div>` : ''}
      ${(data.transit_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Stock in transit</h3>
        <table class="atoms-table"><thead><tr><th>Transfer</th><th>Route</th><th>Devices</th><th>Units</th><th>Age</th></tr></thead><tbody>
          ${data.transit_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-dash-transit" data-id="${l.id}">${escapeHtml('#' + l.id)}</button></td>
            <td>${escapeHtml(l.from_branch_name || '')} → ${escapeHtml(l.to_branch_name || '')}</td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
            <td>${l.device_count || 0}</td>
            <td>${l.days}d</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      <div class="atoms-card" style="margin-bottom:16px">
        <h3>Open repairs</h3>
        <table class="atoms-table"><thead><tr><th>Ticket</th><th>Customer</th><th>Device</th><th>Status</th><th>Engineer</th><th>Age</th></tr></thead><tbody>
          ${(data.repair_lines || []).map((l) => `<tr>
            <td><button type="button" class="atoms-link js-dash-repair" data-id="${l.id}">${escapeHtml(l.ticket_number || '')}</button></td>
            <td>${escapeHtml(l.customer_name || 'Walk-in')}</td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
            <td>${badge(l.status)}</td>
            <td>${escapeHtml(l.engineer_name || '—')}</td>
            <td>${l.days}d</td>
          </tr>`).join('') || '<tr><td colspan="6">No open repairs.</td></tr>'}
        </tbody></table>
      </div>
      ${(data.stock_count_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Open stock counts</h3>
        <table class="atoms-table"><thead><tr><th>Count</th><th>Branch</th><th>Status</th><th>Missing</th><th>Extra</th><th>Devices</th><th>Age</th></tr></thead><tbody>
          ${data.stock_count_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-dash-count" data-id="${l.id}">${escapeHtml('#' + l.id)}</button></td>
            <td>${escapeHtml(l.branch_name || '')}</td>
            <td>${badge(l.status)}</td>
            <td>${l.missing_qty || 0}</td>
            <td>${l.extra_qty || 0}</td>
            <td>${escapeHtml(l.missing_summary || '—')}</td>
            <td>${l.days}d</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.stuck_transfer_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Stuck transfers</h3>
        <table class="atoms-table"><thead><tr><th>Transfer</th><th>Status</th><th>Route</th><th>Devices</th><th>Hours</th></tr></thead><tbody>
          ${data.stuck_transfer_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-dash-transit" data-id="${l.id}">${escapeHtml('#' + l.id)}</button></td>
            <td>${badge(l.status)}</td>
            <td>${escapeHtml(l.from_branch_name || '')} → ${escapeHtml(l.to_branch_name || '')}</td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
            <td>${l.hours}h</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(can('atoms_approve') || can('atoms_approve_adjustments')) && (data.approval_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Pending approvals</h3>
        <table class="atoms-table"><thead><tr><th>#</th><th>Request</th><th>Summary</th><th>Who</th><th>Branch</th></tr></thead><tbody>
          ${data.approval_lines.map((a) => `<tr>
            <td><button type="button" class="atoms-link js-dash-approval" data-id="${a.id}">${a.id}</button></td>
            <td>${escapeHtml(a.type_label || a.type)}</td>
            <td>${escapeHtml(a.summary || '')}</td>
            <td>${escapeHtml(a.requester_name || '—')}</td>
            <td>${escapeHtml(a.branch_name || '—')}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.wholesale_receivable_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Open wholesale invoices</h3>
        <table class="atoms-table"><thead><tr><th>Customer</th><th>Invoice</th><th>Devices</th><th>Due</th><th>Age</th></tr></thead><tbody>
          ${data.wholesale_receivable_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-aging-cust" data-id="${l.id}">${escapeHtml(l.name || '')}</button></td>
            <td>${escapeHtml(l.invoice_number || '')}</td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
            <td>${money(l.amount)}</td>
            <td>${l.days}d</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.retail_receivable_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Open retail invoices</h3>
        <table class="atoms-table"><thead><tr><th>Customer</th><th>Invoice</th><th>Devices</th><th>Due</th><th>Age</th></tr></thead><tbody>
          ${data.retail_receivable_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-aging-cust" data-id="${l.id}">${escapeHtml(l.name || '')}</button></td>
            <td>${escapeHtml(l.invoice_number || '')}</td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
            <td>${money(l.amount)}</td>
            <td>${l.days}d</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.return_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Recent returns (14 days)</h3>
        <table class="atoms-table"><thead><tr><th>Return</th><th>Invoice</th><th>Customer</th><th>Device</th><th>Type</th><th>Refund</th></tr></thead><tbody>
          ${data.return_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-return-open" data-id="${l.id}">${escapeHtml('#' + l.id)}</button></td>
            <td>${escapeHtml(l.invoice_number || '')}</td>
            <td>${escapeHtml(l.customer_name || 'Walk-in')}</td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
            <td>${badge(l.return_type)} · ${badge(l.resolution)}</td>
            <td>${money(l.refund_amount)}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.expense_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Pending expenses</h3>
        <table class="atoms-table"><thead><tr><th>Expense</th><th>Branch</th><th>Category</th><th>Vendor</th><th>Amount</th><th>Age</th></tr></thead><tbody>
          ${data.expense_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-exp-open" data-id="${l.id}">${escapeHtml('#' + l.id)}</button></td>
            <td>${escapeHtml(l.branch_name || '')}</td>
            <td>${badge(l.category)}</td>
            <td>${escapeHtml(l.vendor || '—')}</td>
            <td>${money(l.amount)}</td>
            <td>${l.days}d</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.swap_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Recent swaps (14 days)</h3>
        <table class="atoms-table"><thead><tr><th>Swap</th><th>Customer</th><th>Devices</th><th>Difference</th><th>Age</th></tr></thead><tbody>
          ${data.swap_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-swap-open" data-id="${l.id}">${escapeHtml(l.invoice_number || ('#' + l.id))}</button></td>
            <td>${escapeHtml(l.customer_name || 'Walk-in')}</td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
            <td>${money(l.difference)}</td>
            <td>${l.days}d</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.sale_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Recent sales (14 days)</h3>
        <table class="atoms-table"><thead><tr><th>Invoice</th><th>Type</th><th>Customer</th><th>Devices</th><th>Total</th><th>Due</th></tr></thead><tbody>
          ${data.sale_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-invoice" data-inv="${escapeHtml(l.invoice_number || '')}">${escapeHtml(l.invoice_number || '')}</button></td>
            <td>${escapeHtml(l.sale_type_label || l.sale_type || 'Retail')}</td>
            <td>${l.customer_id ? `<button type="button" class="atoms-link js-aging-cust" data-id="${l.customer_id}">${escapeHtml(l.customer_name || '')}</button>` : escapeHtml(l.customer_name || 'Walk-in')}</td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
            <td>${money(l.total)}</td>
            <td>${money(l.due_amount)}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.payment_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Recent collections (14 days)</h3>
        <table class="atoms-table"><thead><tr><th>Customer</th><th>Invoice</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead><tbody>
          ${data.payment_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-aging-cust" data-id="${l.customer_id}">${escapeHtml(l.customer_name || '')}</button></td>
            <td>${l.invoice_number ? `<button type="button" class="atoms-link js-invoice" data-inv="${escapeHtml(l.invoice_number)}">${escapeHtml(l.invoice_number)}</button>` : '—'}</td>
            <td>${money(l.amount)}</td>
            <td>${escapeHtml(l.method || '')}</td>
            <td>${badge(l.status)}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.supplier_payment_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Recent supplier payments (14 days)</h3>
        <table class="atoms-table"><thead><tr><th>Supplier</th><th>PO invoice</th><th>Amount</th><th>Method</th></tr></thead><tbody>
          ${data.supplier_payment_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-payable-sup" data-id="${l.supplier_id}">${escapeHtml(l.supplier_name || '')}</button></td>
            <td>${escapeHtml(l.purchase_invoice || '—')}</td>
            <td>${money(l.amount)}</td>
            <td>${escapeHtml(l.method || '')}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.open_purchase_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Open purchases</h3>
        <table class="atoms-table"><thead><tr><th>PO</th><th>Supplier</th><th>Items</th><th>Total</th><th>Progress</th><th>Status</th></tr></thead><tbody>
          ${data.open_purchase_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-dash-purchase" data-id="${l.id}">${escapeHtml(l.invoice_number || ('#' + l.id))}</button></td>
            <td><button type="button" class="atoms-link js-payable-sup" data-id="${l.supplier_id}">${escapeHtml(l.supplier_name || '')}</button></td>
            <td>${escapeHtml(l.item_summary || '—')}</td>
            <td>${money(l.total)}</td>
            <td>${l.received}/${l.units}</td>
            <td>${badge(l.status)}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.purchase_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Recent purchases (14 days)</h3>
        <table class="atoms-table"><thead><tr><th>PO</th><th>Supplier</th><th>Items</th><th>Total</th><th>Units</th></tr></thead><tbody>
          ${data.purchase_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-dash-purchase" data-id="${l.id}">${escapeHtml(l.invoice_number || ('#' + l.id))}</button></td>
            <td><button type="button" class="atoms-link js-payable-sup" data-id="${l.supplier_id}">${escapeHtml(l.supplier_name || '')}</button></td>
            <td>${escapeHtml(l.item_summary || '—')}</td>
            <td>${money(l.total)}</td>
            <td>${l.units}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.supplier_return_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Recent supplier returns (14 days)</h3>
        <table class="atoms-table"><thead><tr><th>Supplier</th><th>Device</th><th>Credit</th><th>Age</th></tr></thead><tbody>
          ${data.supplier_return_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-payable-sup" data-id="${l.supplier_id}">${escapeHtml(l.supplier_name || '')}</button></td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
            <td>${money(l.amount)}</td>
            <td>${l.days}d</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.reversal_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Recent payment reversals (14 days)</h3>
        <table class="atoms-table"><thead><tr><th>Customer</th><th>Invoice</th><th>Amount</th><th>Reason</th></tr></thead><tbody>
          ${data.reversal_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-aging-cust" data-id="${l.customer_id}">${escapeHtml(l.customer_name || '')}</button></td>
            <td>${l.invoice_number ? `<button type="button" class="atoms-link js-invoice" data-inv="${escapeHtml(l.invoice_number)}">${escapeHtml(l.invoice_number)}</button>` : '—'}</td>
            <td>${money(l.amount)}</td>
            <td>${escapeHtml(l.notes || '—')}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.voided_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Recent voided sales (14 days)</h3>
        <table class="atoms-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Devices</th><th>Total</th><th>Reason</th></tr></thead><tbody>
          ${data.voided_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-invoice" data-inv="${escapeHtml(l.invoice_number || '')}">${escapeHtml(l.invoice_number || '')}</button></td>
            <td>${l.customer_id ? `<button type="button" class="atoms-link js-aging-cust" data-id="${l.customer_id}">${escapeHtml(l.customer_name || '')}</button>` : escapeHtml(l.customer_name || 'Walk-in')}</td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
            <td>${money(l.total)}</td>
            <td>${escapeHtml(l.void_reason || '—')}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.posted_expense_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Recent posted expenses (14 days)</h3>
        <table class="atoms-table"><thead><tr><th>Expense</th><th>Category</th><th>Vendor</th><th>Amount</th></tr></thead><tbody>
          ${data.posted_expense_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-exp-open" data-id="${l.id}">${escapeHtml('#' + l.id)}</button></td>
            <td>${badge(l.category)}</td>
            <td>${escapeHtml(l.vendor || '—')}</td>
            <td>${money(l.amount)}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.audit_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Recent audit activity (14 days)</h3>
        <table class="atoms-table"><thead><tr><th>When</th><th>Action</th><th>User</th><th>Summary</th></tr></thead><tbody>
          ${data.audit_lines.map((a) => `<tr>
            <td>${escapeHtml(a.created_at || '')}</td>
            <td>${escapeHtml(a.action_label || a.action || '')}</td>
            <td>${escapeHtml(a.user_name || '')}</td>
            <td>${escapeHtml(a.summary || '')}${a.link ? ` <button type="button" class="atoms-link js-audit-open" data-link="${escapeHtml(JSON.stringify(a.link))}">Open</button>` : ''}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.recent_transfer_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Recent transfers (14 days)</h3>
        <table class="atoms-table"><thead><tr><th>Transfer</th><th>Route</th><th>Status</th><th>Devices</th></tr></thead><tbody>
          ${data.recent_transfer_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-dash-transit" data-id="${l.id}">${escapeHtml('#' + l.id)}</button></td>
            <td>${escapeHtml(l.from_branch_name || '')} → ${escapeHtml(l.to_branch_name || '')}</td>
            <td>${badge(l.status)}</td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.posted_stock_count_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Recent stock counts (14 days)</h3>
        <table class="atoms-table"><thead><tr><th>Count</th><th>Branch</th><th>Expected</th><th>Missing</th><th>Extra</th></tr></thead><tbody>
          ${data.posted_stock_count_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-dash-count" data-id="${l.id}">${escapeHtml('#' + l.id)}</button></td>
            <td>${escapeHtml(l.branch_name || '')}</td>
            <td>${l.expected_qty || 0}</td>
            <td>${l.missing_qty || 0}</td>
            <td>${l.extra_qty || 0}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.completed_repair_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Recent completed repairs (14 days)</h3>
        <table class="atoms-table"><thead><tr><th>Ticket</th><th>Customer</th><th>Device</th><th>Engineer</th><th>Outcome</th></tr></thead><tbody>
          ${data.completed_repair_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-dash-repair" data-id="${l.id}">${escapeHtml(l.ticket_number || '')}</button></td>
            <td>${escapeHtml(l.customer_name || 'Walk-in')}</td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
            <td>${escapeHtml(l.engineer_name || '—')}</td>
            <td>${badge(l.status)}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.recent_approval_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Recent approval decisions (14 days)</h3>
        <table class="atoms-table"><thead><tr><th>#</th><th>Request</th><th>Summary</th><th>Decision</th><th>Reviewer</th></tr></thead><tbody>
          ${data.recent_approval_lines.map((a) => `<tr>
            <td><button type="button" class="atoms-link js-dash-approval" data-id="${a.id}">${a.id}</button></td>
            <td>${escapeHtml(a.type_label || a.type || '')}</td>
            <td>${escapeHtml(a.summary || '')}</td>
            <td>${badge(a.status)}</td>
            <td>${escapeHtml(a.reviewer_name || '—')}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.recent_customer_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>New customers (14 days)</h3>
        <table class="atoms-table"><thead><tr><th>Customer</th><th>Phone</th><th>Balance</th><th>Age</th></tr></thead><tbody>
          ${data.recent_customer_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-aging-cust" data-id="${l.id}">${escapeHtml(l.name || '')}</button></td>
            <td>${escapeHtml(l.phone || '')}</td>
            <td>${money(l.balance)}</td>
            <td>${l.days}d</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.recent_imei_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Recent IMEI intake (14 days)</h3>
        <table class="atoms-table"><thead><tr><th>IMEI</th><th>Device</th><th>Status</th><th>Source</th></tr></thead><tbody>
          ${data.recent_imei_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-open-imei" data-imei="${escapeHtml(l.imei || '')}">${escapeHtml(l.imei || '')}</button></td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
            <td>${badge(l.status)}</td>
            <td>${escapeHtml(l.source_type || '')}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.low_stock_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px">
          <h3 style="margin:0">Low stock at this branch</h3>
          <a class="atoms-btn ghost sm" href="#/inventory?filter=low">Open Stock Central</a>
        </div>
        <table class="atoms-table"><thead><tr><th>Product</th><th>Type</th><th>Available</th><th>Threshold</th></tr></thead><tbody>
          ${data.low_stock_lines.map((l) => `<tr>
            <td><a class="atoms-link" href="#/inventory?filter=low&product=${Number(l.product_id || 0)}">${escapeHtml(l.name || '')}</a>${l.variant_label ? `<br><span class="atoms-muted">${escapeHtml(l.variant_label)}</span>` : ''}</td>
            <td><span class="atoms-badge">${l.track_mode === 'quantity' ? 'Accessory' : 'Device'}</span></td>
            <td>${l.qty}</td>
            <td>${l.low_stock_threshold}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.notify_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Recent alerts</h3>
        <table class="atoms-table"><thead><tr><th>Alert</th><th>Detail</th><th>When</th><th></th></tr></thead><tbody>
          ${data.notify_lines.map((n) => `<tr class="${Number(n.is_read) ? '' : 'is-unread'}">
            <td>${escapeHtml(n.title || '')}</td>
            <td>${escapeHtml(n.body || '')}</td>
            <td>${escapeHtml(n.created_at || '')}</td>
            <td>${n.link ? `<button type="button" class="atoms-link js-notify-open" data-link="${escapeHtml(JSON.stringify(n.link))}">Open</button>` : ''}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.stuck_repair_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Stuck repairs (${data.repair_days || 3}d+)</h3>
        <table class="atoms-table"><thead><tr><th>Ticket</th><th>Customer</th><th>Device</th><th>Status</th><th>Age</th></tr></thead><tbody>
          ${data.stuck_repair_lines.map((l) => `<tr>
            <td><button type="button" class="atoms-link js-dash-repair" data-id="${l.id}">${escapeHtml(l.ticket_number || '')}</button></td>
            <td>${escapeHtml(l.customer_name || 'Walk-in')}</td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
            <td>${badge(l.status)}</td>
            <td>${l.days}d</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      ${(data.stuck_faulty_lines || []).length ? `<div class="atoms-card" style="margin-bottom:16px">
        <h3>Stuck faulty devices (${data.return_days || 2}d+)</h3>
        <table class="atoms-table"><thead><tr><th>IMEI</th><th>Device</th><th>Age</th></tr></thead><tbody>
          ${data.stuck_faulty_lines.map((l) => `<tr>
            <td>${escapeHtml(l.imei || '')}</td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
            <td>${l.days}d</td>
          </tr>`).join('')}
        </tbody></table>
      </div>` : ''}
      <div class="atoms-card" style="margin-bottom:16px">
        <h3>Faulty devices (no repair ticket)</h3>
        <table class="atoms-table"><thead><tr><th>IMEI</th><th>Device</th><th>Age</th></tr></thead><tbody>
          ${(data.faulty_lines || []).map((l) => `<tr>
            <td>${escapeHtml(l.imei || '')}</td>
            <td>${escapeHtml(l.device_summary || '—')}</td>
            <td>${l.days}d</td>
          </tr>`).join('') || '<tr><td colspan="3">No faulty devices waiting.</td></tr>'}
        </tbody></table>
      </div>
      <div class="atoms-row">
        <div class="atoms-card">
          <h3>Branches</h3>
          <table class="atoms-table"><thead><tr><th>Branch</th><th>Invoices</th><th>Revenue</th><th>Profit</th><th>Stock</th><th>Collection</th></tr></thead><tbody>
            ${(data.branches || data.branch_lines || []).map((b) => `<tr>
              <td>${escapeHtml(b.name)}</td>
              <td>${b.invoices}</td>
              <td>${money(b.revenue)}</td>
              <td>${money(b.profit)}</td>
              <td>${b.stock_qty} · ${money(b.stock_value)}</td>
              <td>${Number(b.collection_rate || 0)}%</td>
            </tr>`).join('') || '<tr><td colspan="6">No sales.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Top products</h3>
          <table class="atoms-table"><thead><tr><th>Product</th><th>Units</th><th>Profit</th></tr></thead><tbody>
            ${(data.top_product_lines || data.products || []).map((p) => `<tr><td>${escapeHtml(p.name)}${p.variant_label ? `<br><span class="atoms-muted">${escapeHtml(p.variant_label)}</span>` : ''}</td><td>${p.units}</td><td>${money(p.profit)}</td></tr>`).join('') || '<tr><td colspan="3">None yet.</td></tr>'}
          </tbody></table>
        </div>
      </div>
      <div class="atoms-row" style="margin-top:16px">
        <div class="atoms-card">
          <h3>Retail vs wholesale</h3>
          <table class="atoms-table"><thead><tr><th>Type</th><th>Invoices</th><th>Net</th></tr></thead><tbody>
            ${(data.sale_type_lines || data.sale_types || []).map((t) => `<tr><td>${escapeHtml(t.label || t.type)}</td><td>${t.invoices}</td><td>${money(t.net)}</td></tr>`).join('') || '<tr><td colspan="3">No sales in this window.</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Payment mix</h3>
          <table class="atoms-table"><thead><tr><th>Method</th><th>Invoices</th><th>Collected</th></tr></thead><tbody>
            ${(data.payment_mix_lines || data.mix || []).map((m) => `<tr><td>${escapeHtml(m.method)}</td><td>${m.invoices}</td><td>${money(m.collected)}</td></tr>`).join('') || '<tr><td colspan="3">None</td></tr>'}
          </tbody></table>
        </div>
        <div class="atoms-card">
          <h3>Slow movers (21+ days in stock)</h3>
          <table class="atoms-table"><thead><tr><th>Product</th><th>Qty</th><th>Oldest</th></tr></thead><tbody>
            ${(data.slow || []).map((s) => `<tr><td>${escapeHtml(s.name)}${s.variant_label ? `<br><span class="atoms-muted">${escapeHtml(s.variant_label)}</span>` : ''}</td><td>${s.qty}</td><td>${escapeHtml(s.oldest || '')}</td></tr>`).join('') || '<tr><td colspan="3">None sitting idle.</td></tr>'}
          </tbody></table>
        </div>
      </div>
      <div class="atoms-row" style="margin-top:16px">
        <div class="atoms-card">
          <h3>Staff</h3>
          <table class="atoms-table"><thead><tr><th>Sold by</th><th>Invoices</th><th>Revenue</th><th>Profit</th><th>Collection</th></tr></thead><tbody>
            ${(data.staff_sales_lines || data.staff || []).map((s) => `<tr>
              <td>${escapeHtml(s.name)}</td>
              <td>${s.invoices}</td>
              <td>${money(s.revenue)}</td>
              <td>${money(s.profit)}</td>
              <td>${Number(s.collection_rate || 0)}%</td>
            </tr>`).join('') || '<tr><td colspan="5">No sales in this window.</td></tr>'}
          </tbody></table>
          <h3 style="margin-top:20px">Staff devices sold</h3>
          <table class="atoms-table"><thead><tr><th>Sold by</th><th>Invoice</th><th>IMEI</th><th>Product</th><th>Variant</th><th>Price</th></tr></thead><tbody>
            ${(data.staff_device_lines || data.staff_devices || []).map((l) => `<tr>
              <td>${escapeHtml(l.salesperson_name || '—')}</td>
              <td>${escapeHtml(l.invoice_number || '')}</td>
              <td>${escapeHtml(l.imei || '')}</td>
              <td>${escapeHtml(l.product_name || '')}</td>
              <td>${escapeHtml(l.variant_label || '—')}</td>
              <td>${money(l.selling_price)}</td>
            </tr>`).join('') || '<tr><td colspan="6">No device sales in this window.</td></tr>'}
          </tbody></table>
        </div>
      </div>
        </div>
      </div>`;
  }

  let chartCounter = 0;
  const CHART_COLORS = ['#2F3590', '#0F9F6E', '#F59E0B', '#E11D48', '#0284C7', '#64748B', '#4B52B0'];

  function mountChart(chartId, config) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!window.Chart) return;
        const el = document.getElementById(chartId);
        if (!el) return;
        const existing = window.Chart.getChart(el);
        if (existing) existing.destroy();
        new window.Chart(el.getContext('2d'), config);
      });
    });
  }

  function moneyTick(v) {
    return '₦' + (v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v));
  }

  function chartGradient(ctx, colorTop, colorBottom) {
    const { chart } = ctx;
    const { ctx: c, chartArea } = chart;
    if (!chartArea) return colorTop;
    const g = c.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
    g.addColorStop(0, colorBottom);
    g.addColorStop(1, colorTop);
    return g;
  }

  function barChart(rows, key, labelKey, title = 'Net Sales (₦)', opts = {}) {
    if (!rows || !rows.length) return '<p class="atoms-muted">Nothing to chart yet.</p>';
    const chartId = `atoms-chart-${++chartCounter}`;
    const labels = rows.map((r) => {
      const raw = String(r[labelKey] || r.date || r.name || r.method || r.label || '');
      return raw.length >= 10 ? raw.slice(5) : raw;
    });
    const dataVals = rows.map((r) => Number(r[key] || 0) / 100);
    mountChart(chartId, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: title,
          data: dataVals,
          backgroundColor: (ctx) => chartGradient(ctx, 'rgba(47, 53, 144, 0.95)', 'rgba(75, 82, 176, 0.55)'),
          borderWidth: 0,
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: opts.home ? 28 : 36,
          hoverBackgroundColor: '#252B78',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0F172A',
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => ' ₦' + Number(ctx.raw || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#647089', font: { size: 11, family: "'Plus Jakarta Sans', sans-serif" } },
            border: { display: false },
          },
          y: {
            ticks: { callback: moneyTick, color: '#647089', font: { size: 11 } },
            grid: { color: 'rgba(226, 232, 240, 0.7)', drawBorder: false },
            border: { display: false },
          },
        },
      },
    });
    return `<div class="atoms-chart-canvas"><canvas id="${chartId}"></canvas></div>`;
  }

  function lineChart(rows, key, labelKey, title = 'Net sales') {
    if (!rows || !rows.length) return '<p class="atoms-muted">Nothing to chart yet.</p>';
    const chartId = `atoms-chart-${++chartCounter}`;
    const labels = rows.map((r) => {
      const raw = String(r[labelKey] || r.date || '');
      return raw.length >= 10 ? raw.slice(5) : raw;
    });
    const dataVals = rows.map((r) => Number(r[key] || 0) / 100);
    mountChart(chartId, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: title,
          data: dataVals,
          borderColor: '#2F3590',
          backgroundColor: (ctx) => chartGradient(ctx, 'rgba(47, 53, 144, 0.22)', 'rgba(47, 53, 144, 0.02)'),
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: '#2F3590',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          borderWidth: 2.5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0F172A',
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => ' ₦' + Number(ctx.raw || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#647089', font: { size: 11 } },
            border: { display: false },
          },
          y: {
            ticks: { callback: moneyTick, color: '#647089', font: { size: 11 } },
            grid: { color: 'rgba(226, 232, 240, 0.7)', drawBorder: false },
            border: { display: false },
          },
        },
      },
    });
    return `<div class="atoms-chart-canvas"><canvas id="${chartId}"></canvas></div>`;
  }

  function doughnutChart(rows, key, labelKey, title = 'Mix', opts = {}) {
    if (!rows || !rows.length) return '<p class="atoms-muted">Nothing to chart yet.</p>';
    const chartId = `atoms-chart-${++chartCounter}`;
    const labels = rows.map((r) => r[labelKey] || r.method || r.name || r.label || r.type || '');
    const dataVals = rows.map((r) => Number(r[key] || 0) / 100);
    mountChart(chartId, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          label: title,
          data: dataVals,
          backgroundColor: labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
          borderWidth: 3,
          borderColor: '#ffffff',
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: opts.home ? '62%' : '55%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              borderRadius: 4,
              useBorderRadius: true,
              padding: 14,
              font: { size: 11, family: "'Plus Jakarta Sans', sans-serif" },
              color: '#3D4A63',
            },
          },
          tooltip: {
            backgroundColor: '#0F172A',
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ₦` + Number(ctx.raw || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            },
          },
        },
      },
    });
    return `<div class="atoms-chart-canvas atoms-chart-canvas-donut"><canvas id="${chartId}"></canvas></div>`;
  }

  function copyTableForSpreadsheet(btn, tableSelector) {
    const table = document.querySelector(tableSelector);
    if (!table) return;
    const rows = Array.from(table.querySelectorAll('tr'));
    const tsv = rows.map((r) => {
      const cells = Array.from(r.querySelectorAll('th, td'));
      return cells.map((c) => c.innerText.replace(/\s+/g, ' ').trim()).join('\t');
    }).join('\n');

    navigator.clipboard.writeText(tsv).then(() => {
      const orig = btn.innerHTML;
      btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">done</span> Copied for Google Sheets!';
      setTimeout(() => { btn.innerHTML = orig; }, 2000);
    });
  }

  function notifyMeta(type) {
    const map = {
      low_stock: { icon: 'inventory_2', label: 'Low stock', tone: 'warn', cat: 'stock' },
      transfer_request: { icon: 'local_shipping', label: 'Transfer', tone: 'info', cat: 'stock' },
      transfer_stuck: { icon: 'schedule', label: 'Transfer stuck', tone: 'warn', cat: 'stock' },
      approval_request: { icon: 'gavel', label: 'Approval', tone: 'warn', cat: 'approvals' },
      approval_reminder: { icon: 'pending_actions', label: 'Approval', tone: 'warn', cat: 'approvals' },
      sale_voided: { icon: 'cancel', label: 'Sale voided', tone: 'bad', cat: 'operations' },
      outstanding_debt: { icon: 'account_balance_wallet', label: 'Debt', tone: 'bad', cat: 'operations' },
      repair_stuck: { icon: 'build', label: 'Repair', tone: 'warn', cat: 'operations' },
      repair_complete: { icon: 'check_circle', label: 'Repair', tone: 'ok', cat: 'operations' },
      return_escalation: { icon: 'assignment_return', label: 'Return', tone: 'warn', cat: 'operations' },
      daily_digest: { icon: 'summarize', label: 'Daily digest', tone: 'neutral', cat: 'digest' },
    };
    const key = String(type || '').toLowerCase();
    return map[key] || {
      icon: 'notifications',
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      tone: 'info',
      cat: 'operations',
    };
  }

  function notifyRelativeTime(iso) {
    if (!iso) return '';
    const d = new Date(String(iso).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return String(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleString('en-NG', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function notifyAlertRow(n) {
    const read = Number(n.is_read) === 1;
    const meta = notifyMeta(n.type);
    const filters = ['all', meta.cat];
    if (!read) filters.push('unread');
    return `<article class="atoms-notify-item${read ? ' is-read' : ' is-unread'}" data-filter="${filters.join(' ')}">
      <div class="atoms-notify-icon tone-${meta.tone}">
        <span class="material-symbols-outlined" aria-hidden="true">${meta.icon}</span>
      </div>
      <div class="atoms-notify-main">
        <div class="atoms-notify-head">
          <h3 class="atoms-notify-title">${escapeHtml(n.title)}</h3>
          <time class="atoms-notify-time" datetime="${escapeHtml(n.created_at || '')}" title="${escapeHtml(n.created_at || '')}">${escapeHtml(notifyRelativeTime(n.created_at))}</time>
        </div>
        <p class="atoms-notify-body">${escapeHtml(n.body)}</p>
        <div class="atoms-notify-meta">
          <span class="atoms-badge ${meta.tone}">${escapeHtml(meta.label)}</span>
          ${read ? '<span class="atoms-notify-read-tag">Read</span>' : '<span class="atoms-notify-unread-dot" aria-label="Unread"></span>'}
        </div>
      </div>
      <div class="atoms-notify-actions">
        ${read ? '' : `<button type="button" class="atoms-btn ghost xs js-n-read" data-id="${n.id}">Mark read</button>`}
        ${n.link ? `<button type="button" class="atoms-btn accent xs js-notify-open" data-link="${escapeHtml(JSON.stringify(n.link))}">Open</button>` : ''}
      </div>
    </article>`;
  }

  async function screenNotifications() {
    const data = await api('notifications');
    const items = data.items || [];
    const unread = Number(data.unread || 0);
    const stockCount = items.filter((n) => notifyMeta(n.type).cat === 'stock').length;
    const approvalCount = items.filter((n) => notifyMeta(n.type).cat === 'approvals').length;
    const todayKey = new Date().toDateString();
    const todayCount = items.filter((n) => {
      const d = new Date(String(n.created_at || '').replace(' ', 'T'));
      return !Number.isNaN(d.getTime()) && d.toDateString() === todayKey;
    }).length;
    let outbox = [];
    if (can('atoms_manage_settings')) {
      try { outbox = await api('outbox'); } catch (_) { outbox = []; }
    }
    const notifyPage = paginateList(items, 'notifications');
    const feed = notifyPage.items.length
      ? notifyPage.items.map((n) => notifyAlertRow(n)).join('')
      : (items.length
        ? ''
        : `<div class="atoms-notify-empty">
          <span class="material-symbols-outlined" aria-hidden="true">notifications_off</span>
          <p>You're all caught up</p>
          <span class="atoms-muted">New alerts appear here for low stock, overdue payments, approvals, transfers, and repairs.</span>
        </div>`);
    return `
      ${pageShell({
        group: 'Administration',
        trail: 'Alerts',
        title: 'Alerts & notifications',
        subtitle: 'Low stock, overdue payments, approvals, transfers, repairs, and your daily summary.',
        actions: '<a class="atoms-back-btn" href="#/dashboard"><span class="material-symbols-outlined">arrow_back</span><span>Back to overview</span></a>',
      })}
      <div class="atoms-notify-desk">
        <div class="atoms-kpi-grid atoms-notify-kpis">
          ${kpiCard('Unread', String(unread), unread ? 'Needs attention' : 'All clear', unread ? 'warn' : 'ok', 'notifications')}
          ${kpiCard('Today', String(todayCount), 'Alerts received today', '', 'today')}
          ${kpiCard('Stock & transit', String(stockCount), 'Inventory movement', '', 'inventory')}
          ${kpiCard('Approvals', String(approvalCount), 'Pending or reminded', '', 'approval')}
        </div>
        <div class="atoms-panel atoms-notify-panel">
          <div class="atoms-panel-head">
            <div class="atoms-panel-title-wrap">
              <span class="material-symbols-outlined atoms-panel-icon" aria-hidden="true">inbox</span>
              <div>
                <h2 class="atoms-panel-title">Inbox</h2>
                <p class="atoms-panel-sub">${items.length ? `${items.length} alert${items.length === 1 ? '' : 's'} · ${unread} unread` : 'No alerts in your inbox'}</p>
              </div>
            </div>
            ${items.length ? `<div class="atoms-seg-tabs atoms-notify-filters" role="tablist" aria-label="Filter alerts">
              <button type="button" class="atoms-seg-tab js-notify-filter is-active" data-filter="all" role="tab" aria-selected="true">All</button>
              <button type="button" class="atoms-seg-tab js-notify-filter" data-filter="unread" role="tab" aria-selected="false">Unread${unread ? ` (${unread})` : ''}</button>
              <button type="button" class="atoms-seg-tab js-notify-filter" data-filter="stock" role="tab" aria-selected="false">Stock</button>
              <button type="button" class="atoms-seg-tab js-notify-filter" data-filter="approvals" role="tab" aria-selected="false">Approvals</button>
              <button type="button" class="atoms-seg-tab js-notify-filter" data-filter="operations" role="tab" aria-selected="false">Operations</button>
            </div>` : ''}
          </div>
          <div class="atoms-panel-body atoms-notify-feed" id="notify-feed">
            ${feed}
            ${pagerBar(notifyPage)}
            <div class="atoms-notify-filter-empty hidden" id="notify-filter-empty">
              <span class="material-symbols-outlined" aria-hidden="true">filter_alt_off</span>
              <p>No alerts in this view</p>
              <span class="atoms-muted">Try another filter or check back later.</span>
            </div>
          </div>
        </div>
        ${outbox.length ? `<div class="atoms-panel atoms-notify-outbox">
          <div class="atoms-panel-head">
            <div class="atoms-panel-title-wrap">
              <span class="material-symbols-outlined atoms-panel-icon" aria-hidden="true">chat</span>
              <div>
                <h2 class="atoms-panel-title">WhatsApp outbox</h2>
                <p class="atoms-panel-sub">Queued customer messages waiting to be sent or opened.</p>
              </div>
            </div>
          </div>
          <div class="atoms-panel-body atoms-table-wrap">
            <table class="atoms-table atoms-catalog-table">
              <thead><tr><th>Recipient</th><th>Subject</th><th>Status</th><th></th></tr></thead>
              <tbody>
                ${outbox.map((o) => {
                  let url = '';
                  try { url = JSON.parse(o.payload || '{}').url || ''; } catch (_) {}
                  return `<tr>
                    <td>${escapeHtml(o.destination || '')}</td>
                    <td><span class="atoms-catalog-name">${escapeHtml(o.title)}</span></td>
                    <td>${badge(o.status)}</td>
                    <td class="atoms-td-actions">
                      ${url ? `<a class="atoms-btn ghost xs" href="${escapeHtml(url)}" target="_blank" rel="noopener">Open chat</a>` : ''}
                      ${o.status !== 'sent' ? `<button type="button" class="atoms-btn accent xs js-outbox-sent" data-id="${o.id}">Mark sent</button>` : ''}
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}
      </div>`;
  }

  async function screenApprovals() {
    if (state.approvalId) {
      return screenApprovalDesk(state.approvalId);
    }
    const list = await api('approvals');
    const rows = Array.isArray(list) ? list : [];
    const approvalPage = paginateList(rows, 'approvals');
    return `${pageShell({
      group: 'Administration',
      trail: 'Approvals',
      title: 'Pending approvals',
      subtitle: 'Review below-minimum sales, large expenses, and stock-count differences. Original records are never edited.',
      actions: '<a class="atoms-back-btn" href="#/dashboard"><span class="material-symbols-outlined">arrow_back</span><span>Back to overview</span></a>',
    })}
      <div class="atoms-card">
        <div class="atoms-table-wrap">
        <table class="atoms-table"><thead><tr><th>#</th><th>Request</th><th>Summary</th><th>Devices</th><th>Who</th><th>Branch</th><th>When</th><th></th></tr></thead><tbody>
          ${approvalPage.items.map((a) => {
            const details = approvalDeviceLines(a);
            return `<tr>
            <td><button type="button" class="atoms-link js-appr-open" data-id="${a.id}">${a.id}</button></td>
            <td>${escapeHtml(a.type_label || a.type)}</td>
            <td>${escapeHtml(a.summary || '')}</td>
            <td>${details.length ? details.map((d) => escapeHtml(d)).join('<br>') : '—'}</td>
            <td>${escapeHtml(a.requester_name || '—')}</td>
            <td>${escapeHtml(a.branch_name || '—')}</td>
            <td>${escapeHtml(a.created_at || '')}</td>
            <td>
              <button type="button" class="atoms-btn ghost js-appr-open" data-id="${a.id}">Open</button>
            </td>
          </tr>`;
          }).join('') || '<tr><td colspan="8">Nothing waiting.</td></tr>'}
        </tbody></table>
        </div>
        ${pagerBar(approvalPage)}
      </div>`;
  }

  function approvalDeviceLines(a) {
    const details = [];
    if (a.type === 'price_override') {
      (a.payload?.items || []).forEach((it) => {
        const bit = [it.product_name, it.variant_label, it.imei].filter(Boolean).join(' · ');
        if (bit) details.push(bit);
      });
    }
    if (a.type === 'stock_adjustment') {
      (a.payload?.missing_lines || []).forEach((it) => {
        const bit = [it.product_name, it.variant_label, it.imei].filter(Boolean).join(' · ');
        if (bit) details.push(bit);
      });
    }
    return details;
  }

  async function screenApprovalDesk(id) {
    const a = await api(`approvals/${id}`);
    const devices = approvalDeviceLines(a);
    let detailBlock = '';
    if (a.type === 'price_override') {
      detailBlock = `<table class="atoms-table"><thead><tr><th>IMEI</th><th>Product</th><th>Variant</th><th>Price</th></tr></thead><tbody>
        ${(a.payload?.items || []).map((it) => `<tr>
          <td><button type="button" class="atoms-link js-open-imei" data-imei="${escapeHtml(it.imei || '')}">${escapeHtml(it.imei || '—')}</button></td>
          <td>${escapeHtml(it.product_name || '')}</td>
          <td>${escapeHtml(it.variant_label || '—')}</td>
          <td>${money(Math.round(Number(it.selling_price || 0) * 100))}</td>
        </tr>`).join('') || '<tr><td colspan="4">No devices.</td></tr>'}
      </tbody></table>`;
    } else if (a.type === 'stock_adjustment') {
      detailBlock = `<p><strong>Reason:</strong> ${escapeHtml(a.payload?.reason || '—')}</p>
        <table class="atoms-table"><thead><tr><th>IMEI</th><th>Product</th><th>Variant</th><th>Issue</th></tr></thead><tbody>
        ${(a.payload?.missing_lines || []).map((it) => `<tr>
          <td><button type="button" class="atoms-link js-open-imei" data-imei="${escapeHtml(it.imei || '')}">${escapeHtml(it.imei || '—')}</button></td>
          <td>${escapeHtml(it.product_name || '')}</td>
          <td>${escapeHtml(it.variant_label || '—')}</td>
          <td>${escapeHtml(it.issue || 'missing')}</td>
        </tr>`).join('') || '<tr><td colspan="4">No missing lines.</td></tr>'}
      </tbody></table>`;
    } else if (a.type === 'expense') {
      detailBlock = `<p>${escapeHtml(a.payload?.category || 'expense')} · ${money(Math.round(Number(a.payload?.amount || 0) * 100))}${a.payload?.vendor ? ` · ${escapeHtml(a.payload.vendor)}` : ''}</p>
        <p class="atoms-muted">${escapeHtml(a.payload?.description || '')}</p>`;
    }
    return `${pageShell({
      group: 'Administration',
      trail: 'Approval #' + a.id,
      title: (a.type_label || a.type) + ' #' + a.id,
      subtitle: `${escapeHtml(a.summary || '')} · ${escapeHtml(a.requester_name || '—')} · ${escapeHtml(a.branch_name || '—')} · ${escapeHtml(a.created_at || '')}`,
      actions: '<a class="atoms-back-btn" href="#/approvals"><span class="material-symbols-outlined">arrow_back</span><span>Back to approvals</span></a>',
    })}
      <div class="atoms-row">
        <div class="atoms-card">
          <h3>Request details</h3>
          ${detailBlock || `<p class="atoms-muted">${devices.length ? devices.map((d) => escapeHtml(d)).join('<br>') : 'No extra detail.'}</p>`}
        </div>
        <div class="atoms-card">
          <h3>Decision</h3>
          ${field('Review notes', `<input class="atoms-notes js-appr-notes" data-id="${a.id}" placeholder="Optional notes">`)}
          <div class="atoms-actions">
            <button class="atoms-btn accent js-appr" data-id="${a.id}" data-d="approve">Approve</button>
            <button class="atoms-btn danger js-appr" data-id="${a.id}" data-d="reject">Reject</button>
          </div>
        </div>
      </div>`;
  }

  async function screenSettings() {
    const users = await api('users');
    const staffPage = paginateList(users, 'settings-staff');
    const branches = state.bootstrap.branches || [];
    const roles = state.bootstrap.staff_roles?.length ? state.bootstrap.staff_roles : await api('users/roles');
    const roleOpts = roles.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.label)}</option>`).join('');
    const ops = await api('settings');
    const types = can('atoms_manage_settings') ? await api('import') : [];
    const pwaUrl = ops.pwa_url || CFG.app || '';
    const last = ops.last_run;
    const lastLine = last?.ran_at
      ? `Last run ${escapeHtml(last.ran_at)} · ${Number(last.alerts || 0)} alert(s).`
      : 'Automation has not run yet. WordPress runs it hourly, or click Run now.';
    return `${pageShell({
      group: 'Administration',
      trail: 'Settings',
      title: 'Store settings',
      subtitle: 'Company profile, WhatsApp alerts, automation rules, CSV imports, and staff branch access.',
      actions: '<a class="atoms-back-btn" href="#/dashboard"><span class="material-symbols-outlined">arrow_back</span><span>Back to overview</span></a>',
    })}
      <div class="atoms-card" style="margin-bottom:16px">
        <div class="atoms-pos-section-title">
          <span class="material-symbols-outlined" style="color:var(--atoms-primary);">store</span>
          <span>Operations & WhatsApp</span>
        </div>
        <form class="atoms-form" id="ops-form">
          ${field('Company', `<input id="ops-company" value="${escapeHtml(ops.company || '')}">`)}
          ${field('Wordmark', `<input id="ops-wordmark" value="${escapeHtml(ops.wordmark || '')}" placeholder="Short name on the sidebar">`)}
          ${field('Wordmark accent', `<input id="ops-accent" value="${escapeHtml(ops.wordmark_accent || '')}" placeholder="Second line, optional">`)}
          ${field('Tagline', `<input id="ops-tagline" value="${escapeHtml(ops.tagline || '')}" placeholder="INVESTMENT">`)}
          ${field('WhatsApp number', `<input id="ops-wa-phone" value="${escapeHtml(ops.whatsapp_phone || '')}" placeholder="0803…">`)}
          ${field('WhatsApp API token (optional)', `<input id="ops-wa-token" type="password" autocomplete="new-password" placeholder="${ops.whatsapp_token_set ? 'Saved — leave blank to keep' : 'Leave blank to use wa.me links'}">`)}
          ${ops.whatsapp_token_set ? field('Remove saved token', '<label><input type="checkbox" id="ops-wa-token-clear"> Forget the stored API token</label>') : ''}
          ${field('Enable WhatsApp outbox', `<label><input type="checkbox" id="ops-wa-on" ${ops.whatsapp_enabled ? 'checked' : ''}> Queue messages when alerts fire</label>`)}
          ${field('Expense approval threshold (₦)', `<input id="ops-ex" type="number" value="${escapeHtml(ops.expense_threshold || 50000)}">`)}
          ${field('Price reduction approval (%)', `<input id="ops-price-red" type="number" min="0" max="100" step="0.1" value="${escapeHtml(ops.price_reduction_approval_pct ?? 10)}">`)}
          ${field('Low-stock alerts', `<label><input type="checkbox" id="ops-low" ${ops.low_stock_notify ? 'checked' : ''}> Notify when devices or accessories hit the product threshold</label>`)}
          <h3>Automation</h3>
          <p class="atoms-muted">${lastLine}</p>
          ${field('Run hourly jobs', `<label><input type="checkbox" id="ops-auto" ${ops.automation_enabled ? 'checked' : ''}> Scan debts, stuck stock, repairs, and approvals</label>`)}
          ${field('Daily digest', `<label><input type="checkbox" id="ops-digest" ${ops.digest_enabled ? 'checked' : ''}> Post today’s numbers to Alerts / WhatsApp once a day</label>`)}
          ${field('Overdue debt after (days)', `<input id="ops-debt-days" type="number" min="0" value="${escapeHtml(ops.debt_days ?? 7)}">`)}
          ${field('Stuck repair after (days)', `<input id="ops-repair-days" type="number" min="0" value="${escapeHtml(ops.repair_days ?? 3)}">`)}
          ${field('Stuck transfer after (hours)', `<input id="ops-transfer-hours" type="number" min="0" value="${escapeHtml(ops.transfer_hours ?? 24)}">`)}
          ${field('Faulty IMEI escalation (days)', `<input id="ops-return-days" type="number" min="0" value="${escapeHtml(ops.return_days ?? 2)}">`)}
          ${field('Default warranty (days)', `<input id="ops-warranty-days" type="number" min="0" value="${escapeHtml(ops.warranty_days ?? 365)}">`)}
          <p class="atoms-muted">Phone app: ${pwaUrl ? `<a href="${escapeHtml(pwaUrl)}">${escapeHtml(pwaUrl)}</a>` : 'Activate the plugin, then open /atoms-app/'}</p>
          <div class="atoms-actions">
            <button class="atoms-btn primary" type="submit">Save settings</button>
            <button class="atoms-btn accent" type="button" id="ops-run-now">Run now</button>
          </div>
        </form>
      </div>
      ${can('atoms_manage_settings') ? homeKpiSettingsBlock(ops) : ''}
      ${can('atoms_manage_settings') && types.length ? `<div class="atoms-card" style="margin-bottom:16px">
        <div class="atoms-pos-section-title">
          <span class="material-symbols-outlined" style="color:var(--atoms-primary);">upload_file</span>
          <span>Import & populate data</span>
        </div>
        <p class="atoms-sub">Load products, supplier inbound manifests, IMEI pre-registration lists, serials, quantity stock, customers, and sales history from CSV — like ATUM Stock Central imports.</p>
        <form class="atoms-form" id="import-form">
          ${field('What to import', `<select id="imp-type">${types.map((t) => `<option value="${escapeHtml(t.id)}" data-notes="${escapeHtml(t.notes)}">${escapeHtml(t.label)}</option>`).join('')}</select>`)}
          ${field('CSV file', '<input id="imp-file" type="file" accept=".csv,text/csv,text/plain">')}
          <p class="atoms-muted" id="imp-notes">${escapeHtml(types[0]?.notes || '')}</p>
          <div class="atoms-actions">
            <button class="atoms-btn ghost" type="button" id="imp-template">Download template</button>
            <button class="atoms-btn primary" type="submit">Import CSV</button>
          </div>
        </form>
        <div id="imp-result" style="margin-top:12px"></div>
      </div>` : ''}
      <div class="atoms-card" style="margin-bottom:16px">
        <div class="atoms-pos-section-title">
          <span class="material-symbols-outlined" style="color:var(--atoms-primary);">group_add</span>
          <span>Staff & branch access</span>
        </div>
        <p class="atoms-sub">Create branch staff accounts, assign staff roles, and control which locations each person can access.</p>
        <form class="atoms-form" id="staff-create-form" style="margin-bottom:20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
          ${field('Full name', '<input id="st-name" required placeholder="e.g. Amina Bello">')}
          ${field('Username', '<input id="st-user" required placeholder="login name">')}
          ${field('Email', '<input id="st-email" type="email" required placeholder="staff@store.com">')}
          ${field('Temporary password', '<input id="st-pass" type="password" required minlength="8" autocomplete="new-password">')}
          ${field('Role', `<select id="st-role" required>${roleOpts}</select>`)}
          ${field('Branches', `<div id="st-branches">${branches.map((b) => `<label style="display:inline-flex;align-items:center;gap:6px;margin:0 10px 6px 0"><input type="checkbox" value="${b.id}"> ${escapeHtml(b.code)}</label>`).join('') || '<span class="atoms-muted">Add a branch first.</span>'}</div>`)}
          <div class="atoms-actions" style="grid-column:1/-1">
            <button class="atoms-btn primary" type="submit"><span class="material-symbols-outlined">person_add</span> Create staff account</button>
          </div>
        </form>
        <div class="atoms-table-wrap">
        <table class="atoms-table"><thead><tr><th>User</th><th>Role</th><th>Branches</th><th>Access</th></tr></thead><tbody>
          ${staffPage.items.map((u) => `<tr>
            <td><strong>${escapeHtml(u.name)}</strong><br><span class="atoms-muted">${escapeHtml(u.username || u.email || '')}</span></td>
            <td>${escapeHtml(u.role_label || (u.roles || []).join(', '))}</td>
            <td>${(u.branches || []).map((b) => escapeHtml(b.name)).join(', ') || '<span class="atoms-muted">None</span>'}</td>
            <td>
              <form class="js-assign" data-id="${u.id}">
                ${branches.map((b) => `<label style="margin-right:8px"><input type="checkbox" value="${b.id}" ${(u.branches || []).some((x) => Number(x.id) === Number(b.id)) ? 'checked' : ''}> ${escapeHtml(b.code)}</label>`).join('')}
                <button class="atoms-btn ghost sm" type="submit">Save</button>
              </form>
            </td>
          </tr>`).join('')}
        </tbody></table>
        </div>
        ${pagerBar(staffPage)}
      </div>`;
  }

  async function screenAudit() {
    const f = state.audit || { q: '', action: '', entity_type: '', from: '', to: '', page: 1 };
    const params = new URLSearchParams({
      q: f.q || '',
      action: f.action || '',
      entity_type: f.entity_type || '',
      from: f.from || '',
      to: f.to || '',
      page: String(f.page || 1),
      per_page: '25',
    });
    const data = await api(`audit?${params}`);
    const total = Number(data.total || 0);
    const page = Number(data.page || 1);
    const per = Number(data.per_page || 25);
    const pages = Math.max(1, Math.ceil(total / per));
    const actions = [
      ['', 'All actions'],
      ['sale.created', 'Sale posted'],
      ['sale.voided', 'Sale voided'],
      ['payment.posted', 'Payment added'],
      ['payment.reversed', 'Payment reversed'],
      ['return.created', 'Return posted'],
      ['approval.approved', 'Approval granted'],
      ['approval.requested', 'Approval requested'],
      ['imei.transition', 'IMEI status changed'],
      ['stock_count.posted', 'Stock adjustment posted'],
      ['expense.posted', 'Expense posted'],
      ['import.ran', 'CSV import'],
    ];
    const entities = [
      ['', 'All records'],
      ['sale', 'Sales'],
      ['payment', 'Payments'],
      ['return', 'Returns'],
      ['imei', 'IMEI'],
      ['repair', 'Repairs'],
      ['purchase', 'Purchases'],
      ['transfer', 'Transfers'],
      ['expense', 'Expenses'],
      ['approval', 'Approvals'],
      ['stock_count', 'Stock counts'],
      ['customer', 'Customers'],
      ['product', 'Products'],
      ['supplier', 'Suppliers'],
    ];
    const actionOpts = actions.map(([v, l]) => `<option value="${v}"${f.action === v ? ' selected' : ''}>${l}</option>`).join('');
    const entityOpts = entities.map(([v, l]) => `<option value="${v}"${f.entity_type === v ? ' selected' : ''}>${l}</option>`).join('');
    return `
      ${pageShell({
        group: 'Administration',
        trail: 'Activity log',
        title: 'Activity log',
        subtitle: 'Every posted action — who did it, when, and what changed. Records are never edited after posting.',
        actions: '<a class="atoms-back-btn" href="#/dashboard"><span class="material-symbols-outlined">arrow_back</span><span>Back to overview</span></a>',
      })}
      <form class="atoms-form" id="audit-form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;max-width:1100px">
        ${field('Search', `<input id="aud-q" value="${escapeHtml(f.q || '')}" placeholder="Invoice, IMEI, action…">`)}
        ${field('Action', `<select id="aud-action">${actionOpts}</select>`)}
        ${field('Record', `<select id="aud-entity">${entityOpts}</select>`)}
        ${field('From', `<input id="aud-from" type="date" value="${escapeHtml(f.from || '')}">`)}
        ${field('To', `<input id="aud-to" type="date" value="${escapeHtml(f.to || '')}">`)}
        <div class="atoms-actions"><button class="atoms-btn primary" type="submit">Filter</button></div>
      </form>
      <div class="atoms-actions" style="margin:12px 0">
        <button type="button" class="atoms-btn ghost" id="js-audit-export">CSV · Audit</button>
        <span class="atoms-muted">${total} event${total === 1 ? '' : 's'}</span>
      </div>
      <div class="atoms-card">
        <table class="atoms-table"><thead><tr><th>When</th><th>What</th><th>Who</th><th>Branch</th><th>Summary</th><th>IP</th></tr></thead><tbody>
          ${(data.items || []).map((a) => `<tr>
            <td>${escapeHtml(a.created_at || '')}</td>
            <td>
              ${escapeHtml(a.action_label || a.action)}
              <div class="atoms-muted">${escapeHtml(a.entity_type || '')} ${a.entity_id ? '#' + a.entity_id : ''}</div>
              ${(a.old || a.new) ? `<details><summary>Old / new</summary><pre class="atoms-muted">${escapeHtml(JSON.stringify({ old: a.old, new: a.new }, null, 2))}</pre></details>` : ''}
            </td>
            <td>${escapeHtml(a.user_name || '—')}</td>
            <td>${escapeHtml(a.branch_name || '—')}</td>
            <td>${escapeHtml(a.summary || '')}${a.link ? `<br><button type="button" class="atoms-btn ghost js-audit-open" data-link="${escapeHtml(JSON.stringify(a.link))}">Open</button>` : ''}</td>
            <td>${escapeHtml(a.ip_address || '—')}</td>
          </tr>`).join('') || '<tr><td colspan="6">No matching audit events.</td></tr>'}
        </tbody></table>
        ${pagerBar({ key: 'audit', page, pages, per, total, start: total ? ((page - 1) * per) + 1 : 0, end: Math.min(total, page * per) })}
      </div>`;
  }

  function branchSelect(id) {
    return decorateSelectHtml(`<select id="${id}">${(state.bootstrap.branches || []).map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('')}</select>`);
  }

  function bind() {
    document.querySelectorAll('.js-pager').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.pager || '';
        const page = Number(btn.dataset.page || 1);
        if (!key || btn.disabled) return;
        if (key === 'audit') {
          state.audit = { ...(state.audit || {}), page };
        } else {
          setPagerPage(key, page);
        }
        render({ force: true });
      });
    });

    document.querySelectorAll('.js-section-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const panel = btn.closest('.atoms-section-panel');
        if (!panel) return;
        panel.classList.toggle('is-collapsed');
        btn.setAttribute('aria-expanded', panel.classList.contains('is-collapsed') ? 'false' : 'true');
      });
    });

    const pos = document.getElementById('pos-form');
    if (pos) bindPos();
    bindSwap();
    bindReturn();
    bindCustomerPicker('sw-customer-q', 'sw-customer-results', 'sw-customer-id');
    bindCustomerPicker('rp-customer-q', 'rp-customer-results', 'rp-customer-id');

    document.querySelectorAll('.js-copy-sheet').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.target;
        if (target) copyTableForSpreadsheet(btn, target);
      });
    });

    document.querySelectorAll('.js-queue-drop').forEach((btn) => {
      btn.addEventListener('click', () => {
        dropQueueItem(btn.dataset.at);
        render();
      });
    });
    document.querySelectorAll('.js-queue-flush').forEach((btn) => {
      btn.addEventListener('click', () => flushQueue());
    });

    const pProd = document.getElementById('p-product');
    const pCost = document.getElementById('p-cost');
    const pVariant = document.getElementById('p-variant');
    if (pProd && pCost) {
      const refreshVariant = () => {
        const sel = document.getElementById('p-variant');
        if (!sel) return;
        const pid = Number(pProd.value);
        const product = (state._purchaseProducts || []).find((p) => Number(p.id) === pid);
        const variants = product?.variants || [];
        if (!variants.length) {
          sel.innerHTML = '<option value="">Same as product</option>';
          sel.disabled = true;
          return;
        }
        sel.disabled = false;
        sel.innerHTML = variants.map((v) => `<option value="${v.id}" data-cost="${(v.cost_price || 0) / 100}">${escapeHtml(v.label || v.variant_name || `${v.color || ''} ${v.storage || ''}`.trim())}</option>`).join('');
        const opt = sel.options[sel.selectedIndex];
        if (opt?.dataset.cost) pCost.value = opt.dataset.cost;
      };
      pVariant?.addEventListener('change', () => {
        const opt = pVariant.options[pVariant.selectedIndex];
        if (opt?.dataset.cost) pCost.value = opt.dataset.cost;
      });
      pProd.addEventListener('change', () => {
        const opt = pProd.options[pProd.selectedIndex];
        pCost.value = opt?.dataset.cost || '';
        refreshVariant();
      });
      if (pVariant && !pVariant.options.length) refreshVariant();
    }

    document.querySelectorAll('.js-scan').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (window.AtomsScanner) {
          AtomsScanner.startScan(btn.dataset.target, applyScan);
        } else {
          const typed = window.prompt('Enter IMEI or barcode:', '');
          if (typed) applyScan(typed, btn.dataset.target);
        }
      });
    });
    if (window.AtomsScanner) AtomsScanner.bindWedge(document);

    document.querySelectorAll('.js-n-read').forEach((btn) => btn.addEventListener('click', async () => {
      await api(`notifications/${btn.dataset.id}/read`, { method: 'POST', body: {} });
      render();
    }));
    document.querySelectorAll('.js-home-queue-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const queue = btn.dataset.queue || 'sales';
        setHomeQueueTabPref(queue);
        document.querySelectorAll('.js-home-queue-tab').forEach((tab) => {
          const active = tab === btn;
          tab.classList.toggle('is-active', active);
          tab.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        document.querySelectorAll('.atoms-home-queue-pane').forEach((pane) => {
          pane.classList.toggle('hidden', pane.dataset.queuePane !== queue);
        });
      });
    });

    document.querySelectorAll('.js-analytics-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.analyticsTab || 'overview';
        state.analyticsTab = tab;
        document.querySelectorAll('.js-analytics-tab').forEach((el) => {
          const active = el.dataset.analyticsTab === tab;
          el.classList.toggle('is-active', active);
          if (el.getAttribute('role') === 'tab') el.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        document.querySelectorAll('.atoms-analytics-pane').forEach((pane) => {
          pane.classList.toggle('hidden', pane.dataset.analyticsPane !== tab);
        });
        if (tab === 'overview') {
          // Remount charts after pane becomes visible
          requestAnimationFrame(() => {
            document.querySelectorAll('.atoms-analytics-pane[data-analytics-pane="overview"] canvas').forEach((canvas) => {
              const chart = window.Chart?.getChart?.(canvas);
              if (chart) chart.resize();
            });
          });
        }
      });
    });

    initHomeKpiSortable(document);

    const customizeToggle = document.querySelector('.js-home-customize-toggle');
    if (customizeToggle) {
      customizeToggle.addEventListener('click', () => {
        const panel = document.getElementById('atoms-home-customize-panel');
        if (!panel) return;
        const hidden = panel.classList.toggle('hidden');
        customizeToggle.setAttribute('aria-expanded', hidden ? 'false' : 'true');
        if (!hidden) initHomeKpiSortable(panel);
      });
    }
    document.querySelectorAll('.js-home-user-save').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const home = await api('home-layout', {
          method: 'POST',
          body: {
            kpis: readUserHomeKpiFromDom(),
            show_trends: !!document.getElementById('home-user-show-trends')?.checked,
          },
        });
        state.bootstrap.user = { ...(state.bootstrap.user || {}), home };
        setFlash('Your overview layout was saved.');
        render();
      });
    });
    document.querySelectorAll('.js-home-user-reset').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const home = await api('home-layout/reset', { method: 'POST', body: {} });
        state.bootstrap.user = { ...(state.bootstrap.user || {}), home };
        setFlash('Overview layout reset to store default.');
        render();
      });
    });
    document.querySelectorAll('.js-notify-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        const filter = btn.dataset.filter || 'all';
        document.querySelectorAll('.js-notify-filter').forEach((tab) => {
          const active = tab === btn;
          tab.classList.toggle('is-active', active);
          tab.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        let visible = 0;
        document.querySelectorAll('.atoms-notify-item').forEach((row) => {
          const filters = (row.dataset.filter || '').split(' ');
          const show = filter === 'all' || filters.includes(filter);
          row.hidden = !show;
          if (show) visible += 1;
        });
        const empty = document.getElementById('notify-filter-empty');
        if (empty) empty.classList.toggle('hidden', visible > 0);
      });
    });
    document.querySelectorAll('.js-outbox-sent').forEach((btn) => btn.addEventListener('click', async () => {
      await api(`outbox/${btn.dataset.id}/sent`, { method: 'POST', body: {} });
      setFlash('WhatsApp row marked sent. Nothing was deleted.');
      render();
    }));

    onSubmit('home-layout-form', async () => {
      const saved = await api('settings', {
        method: 'POST',
        body: {
          home_kpis: readHomeKpiSettingsFromDom(),
          home_show_trends: document.getElementById('home-show-trends').checked,
        },
      });
      state.bootstrap.settings = { ...(state.bootstrap.settings || {}), ...saved };
      setFlash('Home overview layout saved.');
      render();
    });

    onSubmit('ops-form', async () => {
      const saved = await api('settings', {
        method: 'POST',
        body: {
          company: document.getElementById('ops-company').value,
          wordmark: document.getElementById('ops-wordmark').value,
          wordmark_accent: document.getElementById('ops-accent').value,
          tagline: document.getElementById('ops-tagline').value,
          whatsapp_phone: document.getElementById('ops-wa-phone').value,
          whatsapp_token: document.getElementById('ops-wa-token')?.value || '',
          whatsapp_token_clear: !!document.getElementById('ops-wa-token-clear')?.checked,
          whatsapp_enabled: document.getElementById('ops-wa-on').checked,
          expense_threshold: Number(document.getElementById('ops-ex').value || 0),
          price_reduction_approval_pct: Number(document.getElementById('ops-price-red')?.value || 10),
          low_stock_notify: document.getElementById('ops-low').checked,
          automation_enabled: document.getElementById('ops-auto').checked,
          digest_enabled: document.getElementById('ops-digest').checked,
          debt_days: Number(document.getElementById('ops-debt-days').value || 0),
          repair_days: Number(document.getElementById('ops-repair-days').value || 0),
          transfer_hours: Number(document.getElementById('ops-transfer-hours').value || 0),
          return_days: Number(document.getElementById('ops-return-days').value || 0),
          warranty_days: Number(document.getElementById('ops-warranty-days').value || 0),
        },
      });
      state.bootstrap.settings = { ...(state.bootstrap.settings || {}), ...saved };
      setFlash('Settings saved.');
      render();
    });

    const runNow = document.getElementById('ops-run-now');
    if (runNow) {
      runNow.addEventListener('click', async () => {
        try {
          const data = await api('automation/run', { method: 'POST', body: {} });
          setFlash(`Automation posted ${data.alerts || 0} alert(s). Check Alerts.`);
          render();
        } catch (err) {
          setFlash(err.message, 'error');
          document.getElementById('atoms-page').insertAdjacentHTML('afterbegin', flashHtml());
          state.flash = null;
        }
      });
    }

    const impType = document.getElementById('imp-type');
    const impNotes = document.getElementById('imp-notes');
    impType?.addEventListener('change', () => {
      const opt = impType.selectedOptions[0];
      if (impNotes) impNotes.textContent = opt?.dataset.notes || '';
    });
    document.getElementById('imp-template')?.addEventListener('click', async () => {
      if (!impType) return;
      try {
        const data = await api(`import/template?type=${encodeURIComponent(impType.value)}`);
        downloadCsv(data.filename, data.csv);
      } catch (err) {
        setFlash(err.message, 'error');
        document.getElementById('atoms-page').insertAdjacentHTML('afterbegin', flashHtml());
        state.flash = null;
      }
    });
    onSubmit('import-form', async () => {
      const file = document.getElementById('imp-file')?.files?.[0];
      if (!file) throw new Error('Choose a CSV file.');
      const csv = await file.text();
      const data = await api('import', { method: 'POST', body: { type: impType.value, csv } });
      const errs = (data.errors || []).slice(0, 15).map((e) => `Row ${e.row}: ${escapeHtml(e.message)}`).join('<br>');
      document.getElementById('imp-result').innerHTML = `<p>Created ${data.created} · Updated ${data.updated} · Skipped ${data.skipped} · Errors ${(data.errors || []).length}.</p>${errs ? `<p class="atoms-muted">${errs}</p>` : ''}`;
    });

    const prCat = document.getElementById('pr-category');
    const prTrack = document.getElementById('pr-track');
    if (prCat && prTrack) {
      prCat.addEventListener('change', () => {
        const v = prCat.value;
        if (v === 'Phone') prTrack.value = 'imei';
        else if (v === 'Accessory' || v === 'Charger') prTrack.value = 'quantity';
        else prTrack.value = 'serial';
      });
    }

    onSubmit('product-form', async () => {
      const color = document.getElementById('pr-color')?.value.trim() || '';
      const storage = document.getElementById('pr-storage')?.value.trim() || '';
      const varMin = Number(document.getElementById('pr-var-min')?.value || 0);
      const body = {
        sku: document.getElementById('pr-sku').value,
        name: document.getElementById('pr-name').value,
        brand: document.getElementById('pr-brand').value,
        category: document.getElementById('pr-category')?.value || 'Phone',
        track_mode: document.getElementById('pr-track')?.value || 'imei',
        min_selling_price: Number(document.getElementById('pr-min').value || 0),
        current_selling_price: Number(document.getElementById('pr-current')?.value || document.getElementById('pr-min').value || 0),
        market_price: Number(document.getElementById('pr-market')?.value || 0),
        low_stock_threshold: Number(document.getElementById('pr-threshold')?.value || 0),
        default_cost_price: Number(document.getElementById('pr-cost').value || 0),
        warranty_days: Number(document.getElementById('pr-warranty').value || 0),
      };
      if (color || storage) {
        body.variants = [{
          color,
          storage,
          min_selling_price: varMin || undefined,
        }];
      }
      const editId = document.getElementById('pr-id')?.value;
      await api(editId ? `products/${editId}` : 'products', { method: 'POST', body });
      setFlash(editId ? 'Product updated.' : 'Product saved.');
      render();
    });

    const readBulkPriceBody = (dryRun = false) => {
      const scope = document.getElementById('bp-scope')?.value || 'selected';
      const body = {
        scope,
        mode: document.getElementById('bp-mode')?.value || 'percent',
        value: Number(document.getElementById('bp-value')?.value || 0),
        apply_to: document.getElementById('bp-apply')?.value || 'both',
        brand: document.getElementById('bp-brand')?.value || '',
        category: document.getElementById('bp-category')?.value || '',
        track_mode: document.getElementById('bp-track')?.value || 'imei',
        product_ids: [...document.querySelectorAll('.js-price-pick:checked')].map((el) => Number(el.value)),
        dry_run: dryRun,
      };
      return body;
    };

    const renderBulkPreview = (result) => {
      const box = document.getElementById('bp-preview-box');
      if (!box) return;
      const changes = result.changes || [];
      if (!changes.length) {
        box.classList.remove('hidden');
        box.innerHTML = '<p class="atoms-muted">No price changes for this selection.</p>';
        return;
      }
      const rows = changes.slice(0, 12).map((c) => `
        <tr>
          <td>${escapeHtml(c.name || '')}</td>
          <td class="atoms-table-mono">${money(c.from || 0)}</td>
          <td class="atoms-table-mono"><strong>${money(c.to || 0)}</strong></td>
        </tr>`).join('');
      box.classList.remove('hidden');
      box.innerHTML = `
        <p><strong>${result.updated || 0}</strong> product floor(s)${result.variants_updated ? ` · <strong>${result.variants_updated}</strong> variant floor(s)` : ''}${result.dry_run ? ' (preview)' : ''}.</p>
        <div class="atoms-table-wrap"><table class="atoms-table"><thead><tr><th>Product</th><th>From</th><th>To</th></tr></thead><tbody>${rows}</tbody></table></div>
        ${changes.length > 12 ? `<p class="atoms-muted">Showing 12 of ${changes.length}.</p>` : ''}`;
    };

    document.getElementById('bp-select-all')?.addEventListener('change', (e) => {
      document.querySelectorAll('.js-price-pick').forEach((el) => { el.checked = e.target.checked; });
    });
    document.getElementById('bp-preview')?.addEventListener('click', async () => {
      const result = await api('products/prices/bulk', { method: 'POST', body: readBulkPriceBody(true) });
      renderBulkPreview(result);
    });
    onSubmit('bulk-price-form', async () => {
      const result = await api('products/prices/bulk', { method: 'POST', body: readBulkPriceBody(false) });
      setFlash(`Updated ${result.updated || 0} product floor(s)${result.variants_updated ? ` and ${result.variants_updated} variant floor(s)` : ''}.`);
      render();
    });

    const readPricingBulkBody = (dryRun = false) => ({
      scope: document.getElementById('px-scope')?.value || 'selected',
      field: document.getElementById('px-field')?.value || 'current',
      mode: document.getElementById('px-mode')?.value || 'amount',
      value: Number(document.getElementById('px-value')?.value || 0),
      apply_to: document.getElementById('px-apply')?.value || 'both',
      brand: document.getElementById('px-brand')?.value || '',
      category: document.getElementById('px-category')?.value || '',
      track_mode: document.getElementById('px-track')?.value || 'imei',
      inbound_days: Number(document.getElementById('px-inbound-days')?.value || 7),
      branch_id: document.getElementById('px-branch')?.value || '',
      effective_at: document.getElementById('px-effective')?.value || '',
      reason: document.getElementById('px-reason')?.value || '',
      product_ids: (() => {
        const live = [...document.querySelectorAll('.js-price-pick:checked')].map((el) => Number(el.value));
        if (live.length) {
          try { sessionStorage.setItem('atoms_price_picks', JSON.stringify(live)); } catch (e) {}
          return live;
        }
        try {
          const saved = JSON.parse(sessionStorage.getItem('atoms_price_picks') || '[]');
          return Array.isArray(saved) ? saved.map(Number).filter(Boolean) : [];
        } catch (e) {
          return [];
        }
      })(),
      dry_run: dryRun,
    });

    const showPricingResult = (boxId, result) => {
      const box = document.getElementById(boxId);
      if (!box) return;
      box.classList.remove('hidden');
      if (result.pending_approval) {
        box.innerHTML = `<div class="atoms-flash warn">Queued for approval (#${result.approval_id}). ${escapeHtml(result.message || '')}</div>${pricingChangeRows(result.changes || [])}`;
        return;
      }
      if (result.scheduled) {
        box.innerHTML = `<div class="atoms-flash ok">Scheduled for ${escapeHtml(String(result.effective_at || ''))}.</div>${pricingChangeRows(result.changes || [])}`;
        return;
      }
      box.innerHTML = `<p><strong>${result.updated || 0}</strong> product(s)${result.variants_updated ? ` · <strong>${result.variants_updated}</strong> variant(s)` : ''}${result.dry_run ? ' (preview)' : ' updated'} · field <strong>${escapeHtml(result.field || '')}</strong>${result.requires_approval ? ' · will need approval' : ''}.</p>${pricingChangeRows(result.changes || [])}`;
    };

    document.getElementById('px-preview')?.addEventListener('click', async () => {
      const result = await api('pricing/bulk', { method: 'POST', body: readPricingBulkBody(true) });
      showPricingResult('px-preview-box', result);
    });
    onSubmit('pricing-bulk-form', async () => {
      const result = await api('pricing/bulk', { method: 'POST', body: readPricingBulkBody(false) });
      if (result.pending_approval) {
        setFlash('Large reduction sent for approval.');
      } else if (result.scheduled) {
        setFlash('Price update scheduled.');
      } else {
        setFlash(`Updated ${result.updated || 0} product price(s).`);
      }
      showPricingResult('px-preview-box', result);
      if (!result.dry_run && !result.pending_approval && !result.scheduled) {
        setTimeout(() => render(), 400);
      }
    });

    document.getElementById('pi-preview')?.addEventListener('click', async () => {
      const result = await api('pricing/import', {
        method: 'POST',
        body: {
          csv: document.getElementById('pi-csv')?.value || '',
          field: document.getElementById('pi-field')?.value || 'market',
          reason: document.getElementById('pi-reason')?.value || '',
          dry_run: true,
        },
      });
      const box = document.getElementById('pi-preview-box');
      if (box) {
        box.classList.remove('hidden');
        box.innerHTML = `<p><strong>${result.updated || 0}</strong> row(s)${result.dry_run ? ' (preview)' : ''}.${(result.errors || []).length ? ` ${result.errors.length} error(s).` : ''}</p>${pricingChangeRows(result.changes || [])}${(result.errors || []).length ? `<p class="atoms-muted">${escapeHtml((result.errors || []).slice(0, 5).join(' · '))}</p>` : ''}`;
      }
    });
    onSubmit('pricing-import-form', async () => {
      const result = await api('pricing/import', {
        method: 'POST',
        body: {
          csv: document.getElementById('pi-csv')?.value || '',
          field: document.getElementById('pi-field')?.value || 'market',
          reason: document.getElementById('pi-reason')?.value || '',
          dry_run: false,
        },
      });
      setFlash(`Imported ${result.updated || 0} price row(s).`);
      render();
    });

    document.querySelectorAll('.js-price-pick').forEach((el) => {
      el.addEventListener('change', () => {
        const ids = [...document.querySelectorAll('.js-price-pick:checked')].map((n) => Number(n.value));
        try { sessionStorage.setItem('atoms_price_picks', JSON.stringify(ids)); } catch (e) {}
      });
    });

    document.querySelectorAll('.js-prod-edit').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const p = await api(`products/${btn.dataset.id}`);
        document.getElementById('pr-id').value = p.id;
        document.getElementById('pr-sku').value = p.sku || '';
        document.getElementById('pr-sku').readOnly = true;
        document.getElementById('pr-name').value = p.name || '';
        document.getElementById('pr-brand').value = p.brand || '';
        if (document.getElementById('pr-category')) document.getElementById('pr-category').value = p.category || 'Phone';
        if (document.getElementById('pr-track')) document.getElementById('pr-track').value = p.track_mode || 'imei';
        document.getElementById('pr-min').value = (p.min_selling_price || 0) / 100;
        if (document.getElementById('pr-current')) document.getElementById('pr-current').value = (p.current_selling_price || p.min_selling_price || 0) / 100;
        if (document.getElementById('pr-market')) document.getElementById('pr-market').value = (p.market_price || 0) / 100;
        document.getElementById('pr-threshold').value = p.low_stock_threshold ?? 2;
        document.getElementById('pr-cost').value = (p.default_cost_price || 0) / 100;
        document.getElementById('pr-warranty').value = p.warranty_days ?? 365;
        document.getElementById('product-form-title').textContent = 'Edit product';
        const prSubmit = document.getElementById('pr-submit');
        if (prSubmit) prSubmit.innerHTML = '<span class="material-symbols-outlined">save</span> Update product';
        document.getElementById('pr-cancel').style.display = '';
        document.getElementById('pr-color').value = '';
        document.getElementById('pr-storage').value = '';
        document.getElementById('pr-var-min').value = '';
        document.getElementById('product-form-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    document.getElementById('pr-cancel')?.addEventListener('click', () => {
      document.getElementById('pr-id').value = '';
      document.getElementById('pr-sku').readOnly = false;
      document.getElementById('product-form-title').textContent = 'Add product';
      const prSubmit = document.getElementById('pr-submit');
      if (prSubmit) prSubmit.innerHTML = '<span class="material-symbols-outlined">save</span> Save product';
      document.getElementById('pr-cancel').style.display = 'none';
      document.getElementById('product-form').reset();
      document.getElementById('pr-threshold').value = 2;
      document.getElementById('pr-warranty').value = Number(state.bootstrap?.settings?.warranty_days || 365);
    });

    onSubmit('variant-form', async () => {
      const productId = Number(document.getElementById('pv-product').value);
      const variantId = document.getElementById('pv-id')?.value;
      const body = {
        color: document.getElementById('pv-color').value.trim(),
        storage: document.getElementById('pv-storage').value.trim(),
        min_selling_price: Number(document.getElementById('pv-min').value || 0) || undefined,
      };
      if (variantId) {
        body.id = Number(variantId);
      }
      await api(`products/${productId}/variants`, { method: 'POST', body });
      setFlash(variantId ? 'Variant updated.' : 'Variant added.');
      render();
    });

    document.querySelectorAll('.js-var-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.getElementById('pv-id').value = btn.dataset.id;
        document.getElementById('pv-product').value = btn.dataset.product;
        document.getElementById('pv-color').value = btn.dataset.color || '';
        document.getElementById('pv-storage').value = btn.dataset.storage || '';
        document.getElementById('pv-min').value = btn.dataset.min || '';
        document.getElementById('variant-form-title').textContent = 'Edit variant';
        const pvSubmit = document.getElementById('pv-submit');
        if (pvSubmit) pvSubmit.innerHTML = '<span class="material-symbols-outlined">save</span> Update variant';
        document.getElementById('pv-cancel').style.display = '';
        document.getElementById('variant-form-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
    document.getElementById('pv-cancel')?.addEventListener('click', () => {
      document.getElementById('pv-id').value = '';
      document.getElementById('variant-form-title').textContent = 'Add variant';
      const pvSubmit = document.getElementById('pv-submit');
      if (pvSubmit) pvSubmit.innerHTML = '<span class="material-symbols-outlined">add</span> Add variant';
      document.getElementById('pv-cancel').style.display = 'none';
      document.getElementById('variant-form').reset();
    });

    document.querySelectorAll('.js-prod-archive').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name || 'this product';
        if (!window.confirm(`Archive ${name}? History stays — it only leaves the active catalog.`)) return;
        try {
          await api(`products/${btn.dataset.id}/archive`, { method: 'POST', body: {} });
          setFlash('Product archived.');
          render();
        } catch (err) {
          setFlash(err.message, 'error');
        }
      });
    });
    document.querySelectorAll('.js-prod-restore').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api(`products/${btn.dataset.id}/restore`, { method: 'POST', body: {} });
          setFlash('Product restored to the catalog.');
          render();
        } catch (err) {
          setFlash(err.message, 'error');
        }
      });
    });
    document.querySelectorAll('.js-cust-restore').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api(`customers/${btn.dataset.id}/restore`, { method: 'POST', body: {} });
          setFlash('Customer restored.');
          render();
        } catch (err) {
          setFlash(err.message, 'error');
        }
      });
    });
    document.querySelectorAll('.js-sup-restore').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api(`suppliers/${btn.dataset.id}/restore`, { method: 'POST', body: {} });
          setFlash('Supplier restored.');
          render();
        } catch (err) {
          setFlash(err.message, 'error');
        }
      });
    });
    document.querySelectorAll('.js-cust-archive').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!window.confirm('Archive this customer? Their invoices and ledger stay — they leave pick lists.')) return;
        try {
          await api(`customers/${btn.dataset.id}/archive`, { method: 'POST', body: {} });
          setFlash('Customer archived.');
          state.customerId = null;
          render();
        } catch (err) {
          setFlash(err.message, 'error');
        }
      });
    });
    document.querySelectorAll('.js-sup-archive').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!window.confirm('Archive this supplier? Purchase history stays — they leave supplier pick lists.')) return;
        try {
          await api(`suppliers/${btn.dataset.id}/archive`, { method: 'POST', body: {} });
          setFlash('Supplier archived.');
          state.supplierId = null;
          render();
        } catch (err) {
          setFlash(err.message, 'error');
        }
      });
    });

    const file = document.getElementById('reg-file');
    if (file) {
      file.addEventListener('change', () => {
        const f = file.files?.[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          const text = String(reader.result || '');
          const imeis = text.split(/[\s,;]+/).map((s) => s.replace(/\D/g, '')).filter((s) => s.length >= 14);
          const box = document.getElementById('reg-imeis');
          box.value = [box.value, imeis.join('\n')].filter(Boolean).join('\n');
        };
        reader.readAsText(f);
      });
    }

    document.querySelectorAll('.js-assign').forEach((form) => form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ids = [...form.querySelectorAll('input:checked')].map((i) => Number(i.value));
      await api(`users/${form.dataset.id}/branches`, { method: 'POST', body: { branch_ids: ids } });
      setFlash('Branch access updated.');
      render();
    }));

    onSubmit('staff-create-form', async () => {
      const branchIds = [...document.querySelectorAll('#st-branches input:checked')].map((i) => Number(i.value));
      if (!branchIds.length) throw new Error('Select at least one branch for this staff member.');
      await api('users', {
        method: 'POST',
        body: {
          name: document.getElementById('st-name').value.trim(),
          username: document.getElementById('st-user').value.trim(),
          email: document.getElementById('st-email').value.trim(),
          password: document.getElementById('st-pass').value,
          role: document.getElementById('st-role').value,
          branch_ids: branchIds,
          default_branch_id: branchIds[0],
        },
      });
      setFlash('Staff account created. They can sign in with the username and password you set.');
      render();
    });

    onSubmit('imei-form', async () => {
      const q = document.getElementById('imei-q').value.trim();
      const box = document.getElementById('imei-result');
      if (!q) {
        box.innerHTML = '<div class="atoms-empty">Type an IMEI, invoice, or customer name.</div>';
        return;
      }
      if (/^\d{14,16}$/.test(q)) {
        const hist = await api(`imei/${q}`);
        box.innerHTML = renderImeiHistory(hist);
        bindInvoiceButtons(box);
        return;
      }
      const rows = await api(`imei?q=${encodeURIComponent(q)}`);
      if (!rows.length) {
        box.innerHTML = '<div class="atoms-empty">Nothing matched. Check the IMEI or invoice number.</div>';
        return;
      }
      box.innerHTML = `<div class="atoms-table-wrap"><table class="atoms-table"><thead><tr><th>IMEI</th><th>Device</th><th>Status</th></tr></thead><tbody>${rows.map((r) => `<tr class="js-open-imei" data-imei="${escapeHtml(r.imei)}" style="cursor:pointer">
        <td>${escapeHtml(r.imei)}</td>
        <td>${escapeHtml(r.product?.name || '')}</td>
        <td>${badge(r.status)}</td>
      </tr>`).join('')}</tbody></table></div>`;
      box.querySelectorAll('.js-open-imei').forEach((row) => row.addEventListener('click', async () => {
        const hist = await api(`imei/${row.dataset.imei}`);
        box.innerHTML = renderImeiHistory(hist);
        bindInvoiceButtons(box);
      }));
    });
    if (document.getElementById('imei-form') && state.searchQ) {
      const q = state.searchQ;
      state.searchQ = '';
      document.getElementById('imei-q').value = q;
      document.getElementById('imei-form').requestSubmit();
    }

    onSubmit('purchase-form', async () => {
      await api('purchases', {
        method: 'POST',
        body: {
          supplier_id: Number(document.getElementById('p-supplier').value),
          branch_id: Number(state.branchId),
          invoice_number: document.getElementById('p-invoice').value,
          purchase_date: document.getElementById('p-date').value || undefined,
          expected_arrival: document.getElementById('p-arrive').value || undefined,
          items: [{
            product_id: Number(document.getElementById('p-product').value),
            variant_id: Number(document.getElementById('p-variant')?.value || 0) || undefined,
            cost_price: Number(document.getElementById('p-cost').value),
            quantity: Number(document.getElementById('p-qty').value),
          }],
        },
      });
      setFlash('Purchase order created.');
      render();
    });

    onSubmit('imei-reg-form', async () => {
      const id = document.getElementById('reg-purchase-id').value;
      const productId = Number(document.getElementById('reg-product-id').value);
      const imeis = document.getElementById('reg-imeis').value.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => {
        const parts = line.split(/[,;\t]+/).map((p) => p.trim()).filter(Boolean);
        return {
          imei: parts[0],
          serial_number: parts[1] || '',
          product_id: productId,
          variant_id: Number(document.getElementById('reg-product-id')?.selectedOptions[0]?.dataset.variant || 0) || undefined,
          condition_grade: document.getElementById('reg-condition')?.value || 'new',
        };
      });
      await api(`purchases/${id}/imeis`, { method: 'POST', body: { imeis } });
      setFlash('IMEIs registered and now available in stock.');
      render();
    });

    document.querySelectorAll('.js-receive').forEach((btn) => btn.addEventListener('click', async () => {
      await api(`purchases/${btn.dataset.id}/receive`, { method: 'POST', body: {} });
      const p = await api(`purchases/${btn.dataset.id}`);
      document.getElementById('imei-reg-form').style.display = 'grid';
      document.getElementById('reg-purchase-id').value = btn.dataset.id;
      fillPurchaseProducts(p.items || []);
      setFlash('Goods received. Inbound reserved units are now available in stock.');
    }));

    document.querySelectorAll('.js-pre-imeis').forEach((btn) => btn.addEventListener('click', () => {
      document.getElementById('pre-imei-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));

    onSubmit('pre-imei-form', async () => {
      const id = Number(document.getElementById('pre-purchase-id')?.value);
      const sel = document.getElementById('pre-product-id');
      const productId = Number(sel?.value);
      const variantId = sel?.options[sel.selectedIndex]?.dataset.variant || '';
      const lines = (document.getElementById('pre-imeis')?.value || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const imeis = lines.map((line) => {
        const [imei, serial] = line.split(/[,;\t]/).map((x) => x.trim());
        return {
          imei,
          serial_number: serial || '',
          product_id: productId,
          variant_id: variantId ? Number(variantId) : undefined,
        };
      });
      await api(`purchases/${id}/inbound-imeis`, { method: 'POST', body: { imeis } });
      setFlash('Inbound IMEIs pre-registered as reserved until goods are received.');
      render();
    });

    document.querySelectorAll('.js-inbound-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.inboundTab = btn.dataset.tab || 'queue';
        render();
      });
    });
    document.querySelectorAll('.js-inbound-po').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.purchaseId = Number(btn.dataset.id);
        goHash('#/purchases');
      });
    });

    onSubmit('inbound-shipment-form', async () => {
      const productSel = document.getElementById('ib-product');
      const costRaw = document.getElementById('ib-cost')?.value;
      const defaultCost = Number(productSel?.selectedOptions[0]?.dataset.cost || 0);
      await api('inbound/shipment', {
        method: 'POST',
        body: {
          supplier_id: Number(document.getElementById('ib-supplier')?.value),
          branch_id: Number(state.branchId),
          invoice_number: document.getElementById('ib-invoice')?.value?.trim(),
          expected_arrival: document.getElementById('ib-arrival')?.value || null,
          items: [{
            product_id: Number(productSel?.value),
            quantity: Number(document.getElementById('ib-qty')?.value || 1),
            cost_price: costRaw !== '' ? Number(costRaw) : defaultCost,
          }],
        },
      });
      setFlash('Expected shipment saved. Pre-register devices or paste IMEI manifests next.');
      state.inboundTab = 'queue';
      render();
    });

    onSubmit('inbound-paste-po-form', async () => {
      const desk = await api(`inbound/desk?branch_id=${state.branchId || ''}`);
      const skuMap = Object.fromEntries((desk.products || []).map((p) => [String(p.sku || '').toLowerCase(), p]));
      const rawLines = (document.getElementById('ibp-table')?.value || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const items = [];
      rawLines.forEach((line) => {
        if (/^sku/i.test(line)) return;
        const parts = line.includes('\t') ? line.split('\t') : line.split(',');
        const sku = String(parts[0] || '').trim();
        const product = skuMap[sku.toLowerCase()];
        if (!product) throw new Error(`Unknown SKU: ${sku}`);
        items.push({
          product_id: Number(product.id),
          quantity: Number(parts[1] || 1),
          cost_price: Number(parts[2] || (product.cost || 0) / 100),
        });
      });
      if (!items.length) throw new Error('Paste at least one product line.');
      await api('inbound/shipment', {
        method: 'POST',
        body: {
          supplier_id: Number(document.getElementById('ibp-supplier')?.value),
          branch_id: Number(state.branchId),
          invoice_number: document.getElementById('ibp-invoice')?.value?.trim(),
          expected_arrival: document.getElementById('ibp-arrival')?.value || null,
          items,
        },
      });
      setFlash(`Expected shipment created with ${items.length} line(s).`);
      state.inboundTab = 'queue';
      render();
    });

    onSubmit('inbound-unit-form', async () => {
      await api('inbound/units', {
        method: 'POST',
        body: {
          purchase_id: Number(document.getElementById('ibu-po')?.value),
          product_id: Number(document.getElementById('ibu-product')?.value),
          imei: document.getElementById('ibu-imei')?.value?.trim(),
          serial_number: document.getElementById('ibu-serial')?.value?.trim() || '',
        },
      });
      setFlash('Device pre-registered as reserved until goods arrive.');
      state.inboundTab = 'queue';
      render();
    });

    onSubmit('inbound-paste-imei-form', async () => {
      const desk = await api(`inbound/desk?branch_id=${state.branchId || ''}`);
      const supplierName = document.getElementById('ibpi-supplier')?.value?.trim() || '';
      const branchCode = desk.branch_code || '';
      const raw = (document.getElementById('ibpi-table')?.value || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const rows = raw.filter((line) => !/^po_/i.test(line) && !/^sku/i.test(line));
      const csv = ['supplier_name,branch_code,po_invoice,sku,imei,serial_number'].concat(rows.map((line) => {
        const parts = line.includes('\t') ? line.split('\t') : line.split(',');
        const po = String(parts[0] || '').trim();
        const sku = String(parts[1] || '').trim();
        const imei = String(parts[2] || '').trim();
        const serial = String(parts[3] || '').trim();
        return [supplierName, branchCode, po, sku, imei, serial].join(',');
      })).join('\n');
      const result = await api('inbound/import', { method: 'POST', body: { type: 'inbound_imeis', csv } });
      setFlash(`IMEI manifest imported: ${result.created || 0} created, ${result.skipped || 0} skipped.`);
      state.inboundTab = 'queue';
      render();
    });

    const ibcType = document.getElementById('ibc-type');
    ibcType?.addEventListener('change', () => {
      const notes = ibcType.selectedOptions[0]?.dataset.notes || '';
      const el = document.getElementById('ibc-notes');
      if (el) el.textContent = notes;
    });
    document.getElementById('ibc-template')?.addEventListener('click', async () => {
      const type = ibcType?.value || 'inbound';
      const data = await api(`inbound/template?type=${encodeURIComponent(type)}`);
      const blob = new Blob([data.csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = data.filename || `${type}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    onSubmit('inbound-csv-form', async () => {
      const file = document.getElementById('ibc-file')?.files?.[0];
      if (!file) throw new Error('Choose a CSV file.');
      const csv = await file.text();
      const type = ibcType?.value || 'inbound';
      const result = await api('inbound/import', { method: 'POST', body: { type, csv } });
      setFlash(`Import finished: ${result.created || 0} created, ${result.updated || 0} updated, ${result.skipped || 0} skipped.`);
      state.inboundTab = 'queue';
      render();
    });

    document.querySelectorAll('.js-receive-qty').forEach((btn) => btn.addEventListener('click', async () => {
      const p = await api(`purchases/${btn.dataset.id}`);
      const lines = (p.items || [])
        .filter((it) => it.track_mode === 'quantity' && Number(it.received_qty) < Number(it.quantity))
        .map((it) => ({
          item_id: it.id,
          quantity: Number(it.quantity) - Number(it.received_qty),
        }));
      if (!lines.length) {
        setFlash('No quantity lines left to receive.', 'warn');
        return;
      }
      await api(`purchases/${btn.dataset.id}/receive-quantity`, { method: 'POST', body: { lines } });
      setFlash('Accessory stock received and added to branch inventory.');
      render();
    }));

    document.querySelectorAll('.js-inv-tab').forEach((btn) => btn.addEventListener('click', () => {
      document.querySelectorAll('.js-inv-tab').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      const tab = btn.dataset.tab;
      document.getElementById('inv-panel-devices')?.toggleAttribute('hidden', tab !== 'devices');
      document.getElementById('inv-panel-accessories')?.toggleAttribute('hidden', tab !== 'accessories');
    }));

    document.querySelectorAll('.js-imeis').forEach((btn) => btn.addEventListener('click', async () => {
      const p = await api(`purchases/${btn.dataset.id}`);
      document.getElementById('imei-reg-form').style.display = 'grid';
      document.getElementById('reg-purchase-id').value = btn.dataset.id;
      fillPurchaseProducts(p.items || []);
    }));

    document.querySelectorAll('.js-swap-open').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.swapId = Number(btn.dataset.id);
        goHash('#/swaps');
      });
    });

    document.querySelectorAll('.js-repair-open').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.repairId = Number(btn.dataset.id);
        render();
      });
    });
    document.querySelectorAll('.js-return-open').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.returnId = Number(btn.dataset.id);
        goHash('#/returns');
      });
    });
    document.querySelectorAll('.js-purchase-open').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.purchaseId = Number(btn.dataset.id);
        render();
      });
    });
    document.querySelectorAll('.js-count-open').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.countId = Number(btn.dataset.id);
        render();
      });
    });
    document.querySelectorAll('.js-count-resume').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.countId = null;
        goHash('#/stocktake');
      });
    });
    document.querySelectorAll('.js-aging-cust').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.customerId = Number(btn.dataset.id);
        state.customerInvoice = null;
        goHash('#/customers');
      });
    });

    document.querySelectorAll('.js-dash-overdue').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.customerId = Number(btn.dataset.id);
        state.customerInvoice = null;
        goHash('#/customers');
      });
    });

    document.querySelectorAll('.js-dash-payable, .js-payable-sup').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.supplierId = Number(btn.dataset.id);
        goHash('#/suppliers');
      });
    });

    document.querySelectorAll('.js-dash-purchase, .js-sup-purchase').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.purchaseId = Number(btn.dataset.id);
        goHash('#/purchases');
      });
    });

    document.querySelectorAll('.js-dash-transit').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.transferId = Number(btn.dataset.id);
        goHash('#/transfers');
      });
    });

    document.querySelectorAll('.js-dash-repair').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.repairId = Number(btn.dataset.id);
        goHash('#/repairs');
      });
    });

    document.querySelectorAll('.js-dash-approval').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.approvalId = Number(btn.dataset.id);
        goHash('#/approvals');
      });
    });

    document.querySelectorAll('.js-dash-count').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.countId = Number(btn.dataset.id);
        goHash('#/stocktake');
      });
    });

    document.querySelectorAll('.js-exp-open').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.expenseId = Number(btn.dataset.id);
        goHash('#/expenses');
      });
    });
    document.querySelectorAll('.js-exp-approval').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.approvalId = Number(btn.dataset.id);
        goHash('#/approvals');
      });
    });

    document.querySelectorAll('.js-appr-open').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.approvalId = Number(btn.dataset.id);
        render();
      });
    });

    document.querySelectorAll('.js-audit-open').forEach((btn) => {
      btn.addEventListener('click', () => {
        try {
          openAppLink(JSON.parse(btn.dataset.link || '{}'));
        } catch (_) { /* ignore */ }
      });
    });

    document.querySelectorAll('.js-notify-open').forEach((btn) => {
      btn.addEventListener('click', () => {
        try {
          openAppLink(JSON.parse(btn.dataset.link || '{}'));
        } catch (_) { /* ignore */ }
      });
    });

    document.querySelectorAll('.js-transfer-open').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.transferId = Number(btn.dataset.id);
        render();
      });
    });
    onSubmit('transfer-form', async () => {
      await api('transfers', {
        method: 'POST',
        body: {
          from_branch_id: Number(document.getElementById('t-from').value),
          to_branch_id: Number(document.getElementById('t-to').value),
          imeis: document.getElementById('t-imeis').value.split(/\s+/).filter(Boolean),
        },
      });
      setFlash('Transfer requested.');
      render();
    });

    ['approve', 'dispatch', 'receive'].forEach((action) => {
      document.querySelectorAll(`.js-t-${action}`).forEach((btn) => btn.addEventListener('click', async () => {
        await api(`transfers/${btn.dataset.id}/${action}`, { method: 'POST', body: {} });
        setFlash(`Transfer ${action}d.`);
        render();
      }));
    });

    onSubmit('return-form', async () => {
      const saleId = Number(document.getElementById('r-sale-id')?.value || 0);
      const invoice = document.getElementById('r-invoice').value.trim();
      const imei = document.getElementById('r-imei').value;
      let id = saleId;
      const body = {
        sale_id: id || undefined,
        return_type: document.getElementById('r-type').value,
        resolution: document.getElementById('r-res').value,
        reason: document.getElementById('r-reason').value,
        replacement_imei: document.getElementById('r-repl').value,
        items: [{ imei }],
      };
      try {
        if (!id && invoice) {
          const sale = await api(`sales/invoice/${encodeURIComponent(invoice)}`);
          id = sale.id;
          body.sale_id = id;
        }
        await api('returns', { method: 'POST', body });
      } catch (err) {
        if ((err.offline || !navigator.onLine) && canQueuePost('returns')) {
          enqueueOffline({ path: 'returns', body });
          setFlash('Offline — return saved on this device and will post when you reconnect.', 'warn');
          location.hash = '#/dashboard';
          render();
          return;
        }
        throw err;
      }
      setFlash('Return posted. Original invoice was not edited.');
      render();
    });

    onSubmit('swap-form', async () => {
      const q = (document.getElementById('sw-customer-q')?.value || '').trim();
      const data = await api('swaps', {
        method: 'POST',
        body: {
          customer_id: Number(document.getElementById('sw-customer-id').value || 0) || undefined,
          customer_phone: q.replace(/\D/g, '').length >= 10 ? q.replace(/\D/g, '') : undefined,
          customer_name: document.getElementById('sw-customer-name').value.trim() || undefined,
          branch_id: Number(state.branchId),
          incoming_imei: document.getElementById('sw-in-imei').value,
          incoming_product_id: Number(document.getElementById('sw-in-product').value),
          incoming_variant_id: Number(document.getElementById('sw-in-variant')?.value || 0) || undefined,
          incoming_value: Number(document.getElementById('sw-in-value').value),
          outgoing_imei: document.getElementById('sw-out-imei').value,
          outgoing_price: Number(document.getElementById('sw-out-price').value),
          paid_amount: Number(document.getElementById('sw-paid').value),
          payment_method: document.getElementById('sw-method')?.value || 'cash',
        },
      });
      setFlash(`Swap ${data.invoice_number} posted. ${data.summary || ''}`);
      render();
    });

    onSubmit('repair-form', async () => {
      const q = (document.getElementById('rp-customer-q')?.value || '').trim();
      await api('repairs', {
        method: 'POST',
        body: {
          imei: document.getElementById('rp-imei').value,
          product_id: Number(document.getElementById('rp-product').value),
          customer_id: Number(document.getElementById('rp-customer-id')?.value || 0) || undefined,
          customer_phone: q.replace(/\D/g, '').length >= 10 ? q.replace(/\D/g, '') : undefined,
          customer_name: document.getElementById('rp-customer-name')?.value.trim() || undefined,
          fault_description: document.getElementById('rp-fault').value,
          engineer_id: Number(document.getElementById('rp-engineer')?.value || state.bootstrap.user.id),
          charge_amount: Number(document.getElementById('rp-charge').value || 0),
          branch_id: Number(state.branchId),
        },
      });
      setFlash('Device received for repair. IMEI is under repair, not sellable.');
      render();
    });

    document.querySelectorAll('.js-rp-adv').forEach((btn) => btn.addEventListener('click', async () => {
      await api(`repairs/${btn.dataset.id}/advance`, { method: 'POST', body: { status: btn.dataset.s } });
      setFlash('Repair status updated.');
      render();
    }));

    document.querySelectorAll('.js-rp-res').forEach((btn) => btn.addEventListener('click', async () => {
      await api(`repairs/${btn.dataset.id}/resolve`, { method: 'POST', body: { outcome: btn.dataset.o } });
      setFlash('Repair closed.');
      render();
    }));

    onSubmit('expense-form', async () => {
      const data = await api('expenses', {
        method: 'POST',
        body: {
          category: document.getElementById('ex-cat').value,
          amount: Number(document.getElementById('ex-amt').value),
          vendor: document.getElementById('ex-vendor').value,
          description: document.getElementById('ex-desc').value,
          branch_id: Number(state.branchId),
        },
      });
      if (data.status === 'pending_approval') {
        setFlash('Expense is waiting for manager approval. Nothing was posted to the ledger yet.', 'warn');
      } else {
        setFlash('Expense posted.');
      }
      render();
    });

    onSubmit('count-open-form', async () => {
      await api('stock-counts', { method: 'POST', body: { branch_id: Number(state.branchId) } });
      setFlash('Count opened. Scan every device on the floor.');
      render();
    });

    onSubmit('count-scan-form', async () => {
      const id = document.getElementById('sc-id').value;
      await api(`stock-counts/${id}/scan`, { method: 'POST', body: { imei: document.getElementById('sc-imei').value } });
      setFlash('IMEI recorded against this count.');
      render();
    });

    onSubmit('count-qty-form', async () => {
      const id = document.getElementById('sc-id').value;
      const inputs = document.querySelectorAll('.js-qty-count');
      for (const input of inputs) {
        const productId = Number(input.dataset.productId);
        const variantId = input.dataset.variantId ? Number(input.dataset.variantId) : null;
        const countedQty = Number(input.value);
        if (Number.isNaN(countedQty)) continue;
        await api(`stock-counts/${id}/quantity`, {
          method: 'POST',
          body: { product_id: productId, variant_id: variantId, counted_qty: countedQty },
        });
      }
      setFlash('Accessory counts saved.');
      render();
    });

    onSubmit('count-submit-form', async () => {
      const id = document.getElementById('sc-id').value;
      const data = await api(`stock-counts/${id}/submit`, { method: 'POST', body: { reason: document.getElementById('sc-reason').value } });
      if (data.status === 'pending_approval') {
        setFlash('Variance submitted. Stock is unchanged until a manager approves.', 'warn');
      } else {
        setFlash('Count posted. No variances.');
      }
      render();
    });

    const cancelCount = document.getElementById('sc-cancel');
    if (cancelCount) {
      cancelCount.addEventListener('click', async () => {
        const id = document.getElementById('sc-id').value;
        await api(`stock-counts/${id}/cancel`, { method: 'POST', body: {} });
        setFlash('Count cancelled. Stock was not changed.');
        render();
      });
    }

    onSubmit('cust-edit-form', async () => {
      const id = document.getElementById('ce-id').value;
      await api(`customers/${id}`, {
        method: 'POST',
        body: {
          name: document.getElementById('ce-name').value,
          phone: document.getElementById('ce-phone').value,
          address: document.getElementById('ce-address')?.value || '',
          branch_id: state.branchId,
        },
      });
      setFlash('Customer updated.');
      render();
    });

    onSubmit('sup-edit-form', async () => {
      const id = document.getElementById('se-id').value;
      await api(`suppliers/${id}`, {
        method: 'POST',
        body: {
          name: document.getElementById('se-name').value,
          contact_person: document.getElementById('se-contact')?.value || '',
          phone: document.getElementById('se-phone').value,
          address: document.getElementById('se-address')?.value || '',
        },
      });
      setFlash('Supplier updated.');
      render();
    });

    onSubmit('sup-form', async () => {
      await api('suppliers', {
        method: 'POST',
        body: {
          name: document.getElementById('s-name').value,
          contact_person: document.getElementById('s-contact')?.value || '',
          phone: document.getElementById('s-phone').value,
          address: document.getElementById('s-address')?.value || '',
        },
      });
      setFlash('Supplier saved.');
      render();
    });

    onSubmit('sup-pay-form', async () => {
      const id = document.getElementById('sp-id').value;
      await api(`suppliers/${id}/payments`, {
        method: 'POST',
        body: { amount: Number(document.getElementById('sp-amt').value), method: document.getElementById('sp-method').value, branch_id: Number(state.branchId) },
      });
      setFlash('Supplier payment posted. Purchase invoices were not edited.');
      render();
    });

    onSubmit('sup-return-form', async () => {
      const id = document.getElementById('sr-id').value;
      await api(`suppliers/${id}/returns`, {
        method: 'POST',
        body: { imei: document.getElementById('sr-imei').value, branch_id: Number(state.branchId) },
      });
      setFlash('Device returned to supplier. Payable reduced by cost. Purchase invoice was not edited.');
      render();
    });

    onSubmit('cust-form', async () => {
      const body = {
        name: document.getElementById('c-name').value,
        phone: document.getElementById('c-phone').value,
        address: document.getElementById('c-address')?.value || '',
        branch_id: state.branchId,
      };
      try {
        await api('customers', { method: 'POST', body });
      } catch (err) {
        if ((err.offline || !navigator.onLine) && canQueuePost('customers')) {
          enqueueOffline({ path: 'customers', body });
          setFlash('Offline — customer saved on this device and will sync when you reconnect.', 'warn');
          render();
          return;
        }
        throw err;
      }
      setFlash('Customer saved.');
      render();
    });

    onSubmit('pay-form', async () => {
      const id = document.getElementById('pay-id').value;
      const path = `customers/${id}/payments`;
      const body = { amount: Number(document.getElementById('pay-amt').value), method: document.getElementById('pay-method').value, branch_id: Number(state.branchId) };
      try {
        await api(path, { method: 'POST', body });
      } catch (err) {
        if ((err.offline || !navigator.onLine) && canQueuePost(path)) {
          enqueueOffline({ path, body });
          setFlash('Offline — payment saved on this device and will sync when you reconnect.', 'warn');
          render();
          return;
        }
        throw err;
      }
      setFlash('Payment posted to the ledger. The original invoice was not edited.');
      render();
    });

    document.querySelectorAll('.js-cust-open').forEach((btn) => btn.addEventListener('click', () => {
      state.customerId = Number(btn.dataset.id);
      render();
    }));
    document.querySelectorAll('.js-cust-invoice').forEach((btn) => btn.addEventListener('click', () => {
      state.customerInvoice = btn.dataset.inv;
      render();
    }));
    document.getElementById('js-cust-inv-close')?.addEventListener('click', () => {
      state.customerInvoice = null;
      render();
    });
    document.querySelectorAll('.js-sup-open').forEach((btn) => btn.addEventListener('click', () => {
      state.supplierId = Number(btn.dataset.id);
      render();
    }));
    document.getElementById('js-stmt-csv')?.addEventListener('click', async () => {
      const data = await api(`customers/${state.customerId}/statement`);
      downloadCsv(data.filename, data.csv);
      setFlash(`Exported ${data.filename}.`);
      document.getElementById('atoms-page').insertAdjacentHTML('afterbegin', flashHtml());
      state.flash = null;
    });
    document.querySelectorAll('.js-void').forEach((btn) => btn.addEventListener('click', async () => {
      try {
        const reason = window.prompt('Why void this invoice? The posted sale is not edited — stock and the ledger reverse as new events.');
        if (reason == null) return;
        if (!String(reason).trim()) throw new Error('A void reason is required.');
        await api(`sales/${btn.dataset.id}/void`, { method: 'POST', body: { reason: String(reason).trim() } });
        setFlash('Sale voided. Invoice was not edited.');
        render();
      } catch (err) {
        setFlash(err.message, 'error');
        document.getElementById('atoms-page').insertAdjacentHTML('afterbegin', flashHtml());
        state.flash = null;
      }
    }));

    onSubmit('report-form', async () => {
      state.report = {
        preset: 'custom',
        from: document.getElementById('rep-from').value,
        to: document.getElementById('rep-to').value,
      };
      render();
    });

    document.querySelectorAll('.js-rep-preset').forEach((btn) => btn.addEventListener('click', () => {
      state.report = { preset: btn.dataset.preset, from: '', to: '' };
      render();
    }));

    document.querySelectorAll('.js-export').forEach((btn) => btn.addEventListener('click', async () => {
      await downloadReport(btn.dataset.type || 'sales', 'csv');
    }));

    onSubmit('report-export-form', async () => {
      const type = document.getElementById('rep-export-type')?.value || 'sales';
      const format = document.getElementById('rep-export-format')?.value || 'csv';
      await downloadReport(type, format);
    });

    bindInvoiceButtons(document);

    document.querySelectorAll('.js-appr').forEach((btn) => btn.addEventListener('click', async () => {
      try {
        const notes = document.querySelector(`.js-appr-notes[data-id="${btn.dataset.id}"]`)?.value || '';
        await api(`approvals/${btn.dataset.id}/decide`, { method: 'POST', body: { decision: btn.dataset.d, notes } });
        setFlash(btn.dataset.d === 'approve' ? 'Approved.' : 'Rejected.');
        state.approvalId = null;
        render();
      } catch (err) {
        setFlash(err.message, 'error');
        document.getElementById('atoms-page').insertAdjacentHTML('afterbegin', flashHtml());
        state.flash = null;
      }
    }));

    onSubmit('audit-form', async () => {
      state.audit = {
        q: document.getElementById('aud-q').value.trim(),
        action: document.getElementById('aud-action').value,
        entity_type: document.getElementById('aud-entity').value,
        from: document.getElementById('aud-from').value,
        to: document.getElementById('aud-to').value,
        page: 1,
      };
      render();
    });

    document.querySelectorAll('.js-audit-page').forEach((btn) => btn.addEventListener('click', () => {
      const next = Number(btn.dataset.page || 1);
      if (next < 1 || btn.disabled) return;
      state.audit = { ...(state.audit || {}), page: next };
      render();
    }));

    const auditExport = document.getElementById('js-audit-export');
    if (auditExport) {
      auditExport.addEventListener('click', async () => {
        const f = state.audit || {};
        const params = new URLSearchParams({
          q: f.q || '',
          action: f.action || '',
          entity_type: f.entity_type || '',
          from: f.from || '',
          to: f.to || '',
        });
        const data = await api(`audit/export?${params}`);
        downloadCsv(data.filename, data.csv);
        setFlash(`Exported ${data.filename}.`);
        document.getElementById('atoms-page').insertAdjacentHTML('afterbegin', flashHtml());
        state.flash = null;
      });
    }
  }

  function fillPurchaseProducts(items) {
    const sel = document.getElementById('reg-product-id');
    if (!sel) return;
    sel.innerHTML = (items || []).map((it) => {
      const label = it.variant_label ? ` · ${it.variant_label}` : '';
      return `<option value="${it.product_id}" data-variant="${it.variant_id || ''}">${escapeHtml(it.product_name || ('Product #' + it.product_id))}${escapeHtml(label)}</option>`;
    }).join('');
  }

  function bindCustomerPicker(qId, resultsId, hiddenId) {
    const q = document.getElementById(qId);
    const results = document.getElementById(resultsId);
    const hidden = document.getElementById(hiddenId);
    if (!q || !results || !hidden) return;
    q.addEventListener('input', debounce(async (e) => {
      const v = e.target.value.trim();
      hidden.value = '';
      if (v.length < 2) {
        results.innerHTML = '';
        return;
      }
      const rows = await api(`customers?q=${encodeURIComponent(v)}`);
      results.innerHTML = rows.map((c) => `<button type="button" class="atoms-btn ghost js-pick-cust" data-id="${c.id}" data-name="${escapeHtml(c.name)}">${escapeHtml(c.name)} · ${escapeHtml(c.phone)}</button>`).join(' ')
        || '<span class="atoms-muted">No match — add a name if this is a new customer.</span>';
      results.querySelectorAll('.js-pick-cust').forEach((b) => b.addEventListener('click', () => {
        hidden.value = b.dataset.id;
        q.value = b.textContent;
        const nameEl = document.getElementById(qId.replace('-q', '-name'));
        if (nameEl && b.dataset.name) nameEl.value = b.dataset.name;
        results.innerHTML = '';
      }));
    }, 250));
  }

  function bindSwap() {
    const form = document.getElementById('swap-form');
    if (!form) return;
    const updateDiff = () => {
      const incoming = Number(document.getElementById('sw-in-value').value || 0);
      const outgoing = Number(document.getElementById('sw-out-price').value || 0);
      const el = document.getElementById('sw-diff');
      if (!el) return;
      const diff = outgoing - incoming;
      if (!incoming && !outgoing) {
        el.textContent = 'Enter trade-in value and the new phone price.';
        return;
      }
      if (diff > 0) el.textContent = `Customer pays ₦${diff.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      else if (diff < 0) el.textContent = `Store credit ₦${Math.abs(diff).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      else el.textContent = 'Even swap — nothing to collect.';
      const paid = document.getElementById('sw-paid');
      if (paid && document.activeElement !== paid) paid.value = Math.max(0, diff).toFixed(2);
    };
    document.getElementById('sw-in-value')?.addEventListener('input', updateDiff);
    document.getElementById('sw-out-price')?.addEventListener('input', updateDiff);

    const outImei = document.getElementById('sw-out-imei');
    async function lookupOut(forcePrice) {
      const imei = outImei?.value.trim();
      if (!imei) return;
      try {
        const hist = await api(`imei/${imei}`);
        const row = hist.imei;
        const info = document.getElementById('sw-out-info');
        if (row.status !== 'available') {
          if (info) info.textContent = `Cannot swap out — status is ${row.status_label}.`;
          return;
        }
        const min = (row.selling_min || row.product?.min_selling_price || 0) / 100;
        const price = document.getElementById('sw-out-price');
        if (price && (forcePrice || !price.value)) price.value = min;
        const variant = row.variant_label ? ` · ${row.variant_label}` : '';
        if (info) info.textContent = `${row.product?.name || ''}${variant} · Min ₦${min.toLocaleString()} · ${row.branch?.name || ''}`;
        updateDiff();
      } catch (err) {
        const info = document.getElementById('sw-out-info');
        if (info) info.textContent = err.message;
      }
    }
    outImei?.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      await lookupOut(true);
    });
    outImei?.addEventListener('blur', () => lookupOut(false));
    outImei?.addEventListener('atoms-filled', () => lookupOut(true));

    const swProd = document.getElementById('sw-in-product');
    const swVariant = document.getElementById('sw-in-variant');
    if (swProd && swVariant) {
      const refreshSwapVariant = () => {
        const pid = Number(swProd.value);
        const product = (state._swapProducts || []).find((p) => Number(p.id) === pid);
        const variants = product?.variants || [];
        if (!variants.length) {
          swVariant.innerHTML = '<option value="">Same as product</option>';
          swVariant.disabled = true;
          return;
        }
        swVariant.disabled = false;
        swVariant.innerHTML = variants.map((v) => `<option value="${v.id}">${escapeHtml(v.label || v.variant_name || `${v.color || ''} ${v.storage || ''}`.trim())}</option>`).join('');
      };
      swProd.addEventListener('change', refreshSwapVariant);
      refreshSwapVariant();
    }
  }

  function bindReturn() {
    const form = document.getElementById('return-form');
    if (!form) return;
    const imeiInput = document.getElementById('r-imei');
    async function lookupReturn() {
      const imei = imeiInput?.value.trim();
      const info = document.getElementById('r-info');
      if (!imei) return;
      try {
        const loc = await api(`returns/locate?imei=${encodeURIComponent(imei)}`);
        document.getElementById('r-invoice').value = loc.invoice_number || loc.sale?.invoice_number || '';
        document.getElementById('r-sale-id').value = loc.sale?.id || '';
        const cover = loc.in_warranty
          ? `In warranty until ${loc.warranty_expires || '—'}`
          : (loc.warranty_expires ? `Warranty expired ${loc.warranty_expires}` : 'No warranty cover');
        if (info) {
          const variant = loc.item?.variant_label || loc.imei?.variant_label || '';
          const product = loc.item?.product_name || loc.imei?.product?.name || '';
          const variantText = variant ? ` · ${variant}` : '';
          info.textContent = `${loc.sale?.customer?.name || 'Walk-in'} · ${product}${variantText} · ${loc.invoice_number} · ${cover}`;
        }
      } catch (err) {
        document.getElementById('r-invoice').value = '';
        document.getElementById('r-sale-id').value = '';
        if (info) info.textContent = err.message;
      }
    }
    imeiInput?.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      await lookupReturn();
    });
    imeiInput?.addEventListener('blur', lookupReturn);
    imeiInput?.addEventListener('atoms-filled', lookupReturn);
  }

  function bindPos() {
    const basket = [];
    const basketTotal = () => basket.reduce((sum, b) => sum + (Number(b.price) || 0) * (Number(b.qty) || 1), 0);
    const syncPaidFromBasket = () => {
      const paid = document.getElementById('pos-paid');
      if (paid && basket.length) paid.value = basketTotal().toFixed(2);
    };
    const draw = () => {
      const el = document.getElementById('pos-basket');
      if (!el) return;
      el.style.display = basket.length ? 'block' : 'flex';
      el.style.alignItems = basket.length ? 'stretch' : 'center';
      el.style.justifyContent = basket.length ? 'flex-start' : 'center';
      el.innerHTML = basket.length
        ? `<table class="atoms-table"><thead><tr><th>Line</th><th>Item</th><th>Total</th><th></th></tr></thead><tbody>
          ${basket.map((b, i) => `<tr>
            <td>${escapeHtml(b.label || (b.imei ? 'Device' : 'Accessory'))}</td>
            <td>${escapeHtml(b.name || b.imei || '')}${b.qty > 1 ? `<br><span class="atoms-muted">${b.qty} × ${money((b.price || 0) * 100)}</span>` : ''}</td>
            <td>${money((b.price || 0) * (b.qty || 1) * 100)}</td>
            <td><button type="button" class="atoms-btn ghost sm js-pos-rm" data-i="${i}">Remove</button></td>
          </tr>`).join('')}
          </tbody></table>
          <p class="atoms-muted" style="margin-top:8px;text-align:right"><strong>Order total: ${money(basketTotal() * 100)}</strong></p>`
        : `<div><span class="material-symbols-outlined" style="font-size:36px; color:#cbd5e1; display:block; margin-bottom:6px;">shopping_bag</span><span>Add devices and accessories to build a mixed invoice.</span></div>`;
      el.querySelectorAll('.js-pos-rm').forEach((btn) => {
        btn.addEventListener('click', () => {
          basket.splice(Number(btn.dataset.i), 1);
          syncPaidFromBasket();
          draw();
        });
      });
    };

    async function addDeviceFromInput() {
      const imei = document.getElementById('pos-imei')?.value.trim();
      if (!imei) throw new Error('Scan or type a device IMEI first.');
      if (basket.some((b) => b.imei === imei)) {
        document.getElementById('pos-imei-info').textContent = 'That IMEI is already on this invoice.';
        return;
      }
      const hist = await api(`imei/${imei}`);
      const row = hist.imei;
      if (row.status !== 'available') {
        document.getElementById('pos-imei-info').textContent = `Cannot sell — status is ${row.status_label}.`;
        return;
      }
      const min = (row.selling_min || row.product?.min_selling_price || 0) / 100;
      const price = Number(document.getElementById('pos-price')?.value || min) || min;
      const variant = row.variant_label ? ` · ${row.variant_label}` : '';
      document.getElementById('pos-price').value = price;
      document.getElementById('pos-imei-info').textContent = `${row.product?.name || ''}${variant} · Min ₦${min.toLocaleString()} · added to order`;
      basket.push({
        imei,
        name: `${row.product?.name || ''}${variant ? ' ' + row.variant_label : ''}`,
        price,
        qty: 1,
        label: imei,
      });
      document.getElementById('pos-imei').value = '';
      syncPaidFromBasket();
      draw();
    }

    async function lookupImei(imei) {
      if (!imei) return;
      try {
        const hist = await api(`imei/${imei}`);
        const row = hist.imei;
        if (row.status !== 'available') {
          document.getElementById('pos-imei-info').textContent = `Cannot sell — status is ${row.status_label}.`;
          return;
        }
        const min = (row.selling_min || row.product?.min_selling_price || 0) / 100;
        document.getElementById('pos-price').value = min;
        const variant = row.variant_label ? ` · ${row.variant_label}` : '';
        document.getElementById('pos-imei-info').textContent = `${row.product?.name || ''}${variant} · Min ₦${min.toLocaleString()} · press Enter or Add device`;
      } catch (err) {
        document.getElementById('pos-imei-info').textContent = err.message;
      }
    }

    const imeiInput = document.getElementById('pos-imei');
    imeiInput?.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      try {
        await addDeviceFromInput();
      } catch (err) {
        document.getElementById('pos-imei-info').textContent = err.message;
      }
    });
    imeiInput?.addEventListener('atoms-filled', () => lookupImei(imeiInput.value.trim()));
    imeiInput?.addEventListener('blur', () => lookupImei(imeiInput.value.trim()));
    document.getElementById('pos-add-device')?.addEventListener('click', () => addDeviceFromInput().catch((err) => {
      document.getElementById('pos-imei-info').textContent = err.message;
    }));

    document.getElementById('pos-customer-q').addEventListener('input', debounce(async (e) => {
      const q = e.target.value.trim();
      if (q.length < 2) return;
      const rows = await api(`customers?q=${encodeURIComponent(q)}`);
      document.getElementById('pos-customer-results').innerHTML = rows.map((c) => `<button type="button" class="atoms-btn ghost js-cust" data-id="${c.id}">${escapeHtml(c.name)} · ${escapeHtml(c.phone)}</button>`).join(' ');
      document.querySelectorAll('.js-cust').forEach((b) => b.addEventListener('click', () => {
        document.getElementById('pos-customer-id').value = b.dataset.id;
        document.getElementById('pos-customer-q').value = b.textContent;
      }));
    }, 250));

    const posType = document.getElementById('pos-type');
    const posHint = document.getElementById('pos-type-hint');
    const refreshWholesaleHint = () => {
      if (!posHint) return;
      posHint.textContent = posType?.value === 'wholesale'
        ? 'Wholesale needs a named customer. Same minimum price rules apply.'
        : '';
    };
    posType?.addEventListener('change', refreshWholesaleHint);
    refreshWholesaleHint();

    document.getElementById('pos-add-accessory')?.addEventListener('click', () => {
      try {
        const sel = document.getElementById('pos-accessory-product');
        const opt = sel?.options[sel.selectedIndex];
        if (!opt?.value) throw new Error('Pick an accessory first.');
        const qty = Math.max(1, Number(document.getElementById('pos-accessory-qty')?.value || 1));
        const min = Number(opt.dataset.min || 0);
        const priceInput = Number(document.getElementById('pos-accessory-price')?.value || 0);
        const price = priceInput > 0 ? priceInput : min;
        basket.push({
          product_id: Number(opt.value),
          name: opt.textContent.trim(),
          price,
          qty,
          label: 'Accessory',
        });
        document.getElementById('pos-accessory-price').value = '';
        syncPaidFromBasket();
        draw();
      } catch (err) {
        setFlash(err.message, 'error');
      }
    });

    onSubmit('pos-form', async () => {
      if (!basket.length) throw new Error('Add at least one device or accessory to the order.');
      const items = basket.map((b) => (
        b.imei
          ? { imei: b.imei, selling_price: b.price }
          : { product_id: b.product_id, quantity: b.qty || 1, selling_price: b.price }
      ));
      const body = {
        branch_id: Number(state.branchId),
        customer_id: document.getElementById('pos-customer-id').value || undefined,
        sale_type: document.getElementById('pos-type').value,
        payment_method: document.getElementById('pos-method').value,
        salesperson_id: Number(document.getElementById('pos-seller')?.value || state.bootstrap.user.id),
        paid_amount: Number(document.getElementById('pos-paid').value || basketTotal()),
        discount: Number(document.getElementById('pos-discount').value || 0),
        items,
      };
      const custLabel = (document.getElementById('pos-customer-q')?.value || '').trim();
      if (!body.customer_id && custLabel) {
        const phoneMatch = custLabel.match(/(\+?\d[\d\s\-]{7,}\d)/);
        if (phoneMatch) {
          body.customer_phone = phoneMatch[1].replace(/[^\d+]/g, '');
          body.customer_name = custLabel.replace(phoneMatch[0], '').replace(/[·|,]+/g, ' ').trim() || undefined;
        }
      }
      if (body.sale_type === 'wholesale' && !body.customer_id && !body.customer_phone) {
        throw new Error('Pick a customer for wholesale sales.');
      }
      localStorage.setItem('atoms_pay_method', body.payment_method);
      let data;
      try {
        data = await api('sales', { method: 'POST', body });
      } catch (err) {
        if ((err.offline || !navigator.onLine) && canQueuePost('sales')) {
          enqueueOffline({ path: 'sales', body });
          setFlash('Offline — sale saved on this device and will sync once (idempotent) when you reconnect.', 'warn');
          location.hash = '#/dashboard';
          render();
          return;
        }
        throw err;
      }
      if (data.status === 'pending_approval') {
        setFlash(data.message || 'Sale is below the minimum price. The device is reserved until a manager approves it.', 'warn');
        location.hash = '#/approvals';
        render();
        return;
      }
      setFlash(`Sale ${data.invoice_number} posted. Stock updated.`);
      printInvoice(data);
      location.hash = '#/dashboard';
      render();
    });
  }

  function paintBrand() {
    if (document.querySelector('.atoms-brand-logo')) {
      return;
    }
    const s = state.bootstrap?.settings || {};
    const mark = (s.wordmark || s.company || 'Abu Twins Softskills Investment').trim();
    const accent = (s.wordmark_accent || '').trim();
    const el = document.querySelector('.atoms-wordmark');
    if (el) {
      el.innerHTML = escapeHtml(mark) + (accent ? ` <span>${escapeHtml(accent)}</span>` : '');
    }
    const sub = document.querySelector('.atoms-subline');
    const tag = (s.tagline || '').trim();
    if (sub) {
      sub.textContent = tag;
    } else if (tag) {
      const markEl = document.querySelector('.atoms-wordmark');
      if (markEl) {
        const d = document.createElement('div');
        d.className = 'atoms-subline';
        d.textContent = tag;
        markEl.after(d);
      }
    }
  }

  function warrantyLine(row) {
    const days = Number(row?.warranty_days || 0);
    if (!days) return 'No warranty cover';
    if (row?.warranty_expires) {
      return row.in_warranty
        ? `In warranty until ${row.warranty_expires}`
        : `Warranty expired ${row.warranty_expires}`;
    }
    return `${days}-day warranty from sale`;
  }

  function renderImeiHistory(hist) {
    const i = hist.imei;
    const serial = i.serial_number ? ` · SN ${escapeHtml(i.serial_number)}` : '';
    const grade = i.condition_grade ? ` · ${escapeHtml(i.condition_grade)}` : '';
    const variant = i.variant_label ? ` · ${escapeHtml(i.variant_label)}` : '';
    const inv = i.last_invoice
      ? `<p><button type="button" class="atoms-link js-invoice" data-inv="${escapeHtml(i.last_invoice)}">${escapeHtml(i.last_invoice)}</button></p>`
      : '';
    return `<div class="atoms-card">
      <h3>${i.imei} · ${badge(i.status)}</h3>
      <p>${escapeHtml(i.product?.name || '')}${variant} · ${escapeHtml(i.branch?.name || '')}${serial}${grade} · Cost ${money(i.cost_price)}</p>
      <p class="atoms-muted">${escapeHtml(warrantyLine(i))}</p>
      ${inv}
      <ul class="atoms-timeline">
        ${(hist.events || []).map((e) => `<li><strong>${escapeHtml(labelEvent(e.event_type))}</strong> ${escapeHtml(e.from_status ? labelStatus(e.from_status) : '—')} → ${escapeHtml(labelStatus(e.to_status))}<br><span class="atoms-muted">${escapeHtml(e.created_at)} · ${escapeHtml(e.notes || '')}</span></li>`).join('')}
      </ul>
    </div>`;
  }

  function bindInvoiceButtons(root) {
    (root || document).querySelectorAll('.js-invoice').forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', async () => {
        const sale = await api(`sales/invoice/${encodeURIComponent(btn.dataset.inv)}`);
        printInvoice(sale);
      });
    });
  }

  function printInvoice(sale) {
    const s = state.bootstrap?.settings || {};
    const identity = {
      company: (s.company || 'Abu Twins Softskills Investment').trim(),
      wordmark: (s.wordmark || s.company || 'Abu Twins Softskills Investment').trim(),
      accent: (s.wordmark_accent || '').trim(),
      tagline: (s.tagline || '').trim(),
    };
    const branch = sale.branch || {};
    const branchLine = [branch.address, branch.phone].filter(Boolean).join(' · ');
    const rows = (sale.items || []).map((it) => {
      const cover = it.in_warranty
        ? `Until ${it.warranty_expires || ''}`
        : (it.warranty_expires ? `Expired ${it.warranty_expires}` : 'None');
      return `<tr>
        <td>${escapeHtml(it.product_name || '')}${it.variant_label ? `<br><span class="muted">${escapeHtml(it.variant_label)}</span>` : ''}<br><span class="muted">${escapeHtml(it.imei)}${it.serial_number ? ' · SN ' + escapeHtml(it.serial_number) : ''}</span></td>
        <td>${escapeHtml(cover)}</td>
        <td class="right">${money(it.selling_price)}</td>
      </tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><title>Invoice ${escapeHtml(sale.invoice_number)}</title>
      <meta charset="utf-8">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Roboto+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        body { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; background: #f8fafc; margin: 0; padding: 24px; font-size: 13px; line-height: 1.4; }
        .sheet { max-width: 680px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08); }
        .header { background: linear-gradient(135deg, #090d16 0%, #1e1b4b 100%); color: #ffffff; padding: 28px 32px; display: flex; justify-content: space-between; align-items: flex-start; }
        .brand-title { font-size: 24px; font-weight: 800; letter-spacing: -0.03em; margin: 0; color: #ffffff; }
        .brand-accent { color: #9AA1D4; }
        .brand-tag { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #a5b4fc; margin-top: 4px; font-weight: 700; }
        .inv-badge { text-align: right; }
        .inv-number { font-family: 'Roboto Mono', monospace; font-size: 16px; font-weight: 700; color: #ffffff; }
        .inv-date { font-size: 12px; color: #94a3b8; margin-top: 2px; }
        .body { padding: 28px 32px; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding-bottom: 20px; border-bottom: 1px solid #e2e8f0; margin-bottom: 20px; }
        .meta-col h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin: 0 0 6px; font-weight: 700; }
        .meta-col p { margin: 0; font-size: 13.5px; font-weight: 600; color: #0f172a; }
        .meta-col small { font-size: 12px; color: #64748b; font-weight: 400; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background: #f8fafc; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 700; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: left; }
        td { padding: 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
        .right { text-align: right; }
        .mono { font-family: 'Roboto Mono', monospace; font-weight: 600; }
        .imei-tag { font-family: 'Roboto Mono', monospace; font-size: 11.5px; background: #f1f5f9; border: 1px solid #e2e8f0; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-top: 4px; }
        .totals-card { background: #f8fafc; border-radius: 10px; padding: 16px; margin: 20px 0; border: 1px solid #e2e8f0; }
        .total-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; color: #475569; }
        .total-final { font-size: 18px; font-weight: 800; color: #0f172a; border-top: 1px solid #cbd5e1; padding-top: 8px; margin-top: 6px; }
        .due-pill { color: #b91c1c; font-weight: 700; }
        .paid-pill { color: #047857; font-weight: 700; }
        .terms { font-size: 11px; color: #64748b; line-height: 1.5; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 20px; }
        .terms strong { color: #0f172a; }
        @media print {
          body { background: #ffffff; padding: 0; }
          .sheet { border: none; box-shadow: none; border-radius: 0; max-width: 100%; }
        }
      </style></head><body>
        <div class="sheet">
          <div class="header">
            <div>
              <h1 class="brand-title">${escapeHtml(identity.wordmark)}${identity.accent ? ` <span class="brand-accent">${escapeHtml(identity.accent)}</span>` : ''}</h1>
              ${identity.tagline ? `<div class="brand-tag">${escapeHtml(identity.tagline)}</div>` : ''}
              <p style="margin:6px 0 0; font-size:12px; color:#cbd5e1;">${escapeHtml(identity.company)}</p>
            </div>
            <div class="inv-badge">
              <div class="inv-number">${escapeHtml(sale.invoice_number)}</div>
              <div class="inv-date">${escapeHtml(sale.posted_at || '')}</div>
              <div style="font-size:11px; text-transform:uppercase; color:#a5b4fc; font-weight:700; margin-top:4px;">${escapeHtml(saleTypeLabel(sale.sale_type))} Sale</div>
            </div>
          </div>
          <div class="body">
            <div class="meta-grid">
              <div class="meta-col">
                <h4>Store Branch & Issued By</h4>
                <p>${escapeHtml(branch.name || 'Main Branch')}</p>
                <small>${escapeHtml(branchLine || 'Official Store Outlet')}</small>
                ${sale.salesperson?.name ? `<br><small>Staff: <strong>${escapeHtml(sale.salesperson.name)}</strong></small>` : ''}
              </div>
              <div class="meta-col">
                <h4>Billed To (Customer)</h4>
                <p>${escapeHtml(sale.customer?.name || 'Walk-in Customer')}</p>
                ${sale.customer?.phone ? `<small>Phone: ${escapeHtml(sale.customer.phone)}</small>` : ''}
                ${sale.customer?.address ? `<br><small>${escapeHtml(sale.customer.address)}</small>` : ''}
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Device / Item Details</th>
                  <th>Warranty Window</th>
                  <th class="right">Unit Price</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
            <div class="totals-card">
              ${Number(sale.discount || 0) > 0 ? `
                <div class="total-row"><span>Gross Subtotal:</span><span class="mono">${money(sale.subtotal || sale.total)}</span></div>
                <div class="total-row"><span>Discount Applied:</span><span class="mono">-${money(sale.discount)}</span></div>
              ` : ''}
              <div class="total-row total-final"><span>Net Amount Due:</span><span class="mono">${money(sale.total)}</span></div>
              <div class="total-row"><span>Amount Paid Now:</span><span class="mono paid-pill">${money(sale.paid_amount)}</span></div>
              ${Number(sale.due_amount || 0) > 0 ? `
                <div class="total-row"><span>Remaining Balance Due:</span><span class="mono due-pill">${money(sale.due_amount)}</span></div>
              ` : '<div class="total-row"><span>Payment Status:</span><span class="paid-pill">● FULLY PAID</span></div>'}
            </div>
            <div class="terms">
              <strong>Warranty & Return Terms:</strong>
              1. Warranty covers genuine manufacturer hardware defects within the specified window.
              2. Physical damage, screen cracking, water contact, or unauthorized third-party repairs void all warranty claims.
              3. Please retain this original tax receipt for all warranty validations and trade-in valuations.
              <br><small style="margin-top:4px; display:block; color:#94a3b8;">System generated official receipt · Abu Twins Invent</small>
            </div>
          </div>
        </div>
      </body></html>`;
    const w = window.open('', 'atoms-invoice');
    if (!w) {
      setFlash('Allow pop-ups in your browser to print receipts.', 'warn');
      document.getElementById('atoms-page')?.insertAdjacentHTML('afterbegin', flashHtml());
      state.flash = null;
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  function downloadCsv(filename, csv) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'atoms-report.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadBase64(filename, base64, mime) {
    const bin = atob(base64 || '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: mime }));
    a.download = filename || 'atoms-report.bin';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function downloadReport(type, format) {
    const params = new URLSearchParams({
      type: type || 'sales',
      format: format || 'csv',
      preset: state.report.preset || 'today',
      from: state.report.from || '',
      to: state.report.to || '',
      branch_id: state.branchId || '',
    });
    const data = await api(`reports/export?${params}`);
    if (data.format === 'docx' && data.base64) {
      downloadBase64(
        data.filename || 'atoms-report.docx',
        data.base64,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
    } else if (data.format === 'pdf' && data.html) {
      const w = window.open('', 'atoms-report-pdf');
      if (!w) {
        setFlash('Allow pop-ups to open the PDF print view.', 'warn');
        document.getElementById('atoms-page')?.insertAdjacentHTML('afterbegin', flashHtml());
        state.flash = null;
        return;
      }
      w.document.write(data.html);
      w.document.close();
      w.focus();
    } else {
      downloadCsv(data.filename || 'atoms-report.csv', data.csv || '');
    }
    setFlash(`Exported ${data.filename || 'report'}.`);
    document.getElementById('atoms-page')?.insertAdjacentHTML('afterbegin', flashHtml());
    state.flash = null;
  }

  function onSubmit(id, handler) {
    const form = document.getElementById(id);
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await handler(e);
      } catch (err) {
        setFlash(err.message, 'error');
        document.getElementById('atoms-page').insertAdjacentHTML('afterbegin', flashHtml());
        state.flash = null;
      }
    });
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  async function flushQueue() {
    if (!navigator.onLine) return;
    const q = readQueue();
    if (!q.length) return;
    const maxRetries = Number(offlineManifest().max_retries || 8);
    const left = [];
    const counts = { sales: 0, returns: 0, customers: 0, payments: 0 };
    let posted = 0;
    let markedFailed = false;
    for (const item of q) {
      if (item.failed) {
        left.push(item);
        continue;
      }
      try {
        const key = item.client_id || item.body?.client_id;
        await api(item.path, { method: 'POST', body: item.body, idempotencyKey: key });
        posted += 1;
        const p = String(item.path || '').replace(/^\//, '').split('?')[0];
        if (p === 'returns') counts.returns += 1;
        else if (p === 'customers') counts.customers += 1;
        else if (/^customers\/\d+\/payments$/.test(p)) counts.payments += 1;
        else counts.sales += 1;
      } catch (err) {
        if (err.offline || !navigator.onLine) {
          left.push(item);
        } else if (isRetryableSyncError(err) && Number(item.retries || 0) < maxRetries) {
          left.push({ ...item, retries: Number(item.retries || 0) + 1, error: err.message || 'Retrying' });
        } else {
          markedFailed = true;
          left.push({ ...item, failed: true, error: err.message || 'Could not post' });
        }
      }
    }
    writeQueue(left);
    if (posted) {
      const bits = [];
      if (counts.sales) bits.push(`${counts.sales} sale(s)`);
      if (counts.returns) bits.push(`${counts.returns} return(s)`);
      if (counts.customers) bits.push(`${counts.customers} customer(s)`);
      if (counts.payments) bits.push(`${counts.payments} payment(s)`);
      setFlash(`Synced ${bits.join(' · ')} from this device.`);
      render();
    } else if (markedFailed) {
      render();
    } else if (left.some((i) => !i.failed && Number(i.retries || 0) > 0)) {
      window.setTimeout(() => flushQueue(), 2500);
    }
  }

  function syncOnline() {
    const el = document.getElementById('atoms-online');
    if (!el) return;
    const q = readQueue();
    const n = q.filter((i) => !i.failed).length;
    const failed = q.filter((i) => i.failed).length;
    let suffix = '';
    if (n) suffix = ` · ${n} queued`;
    else if (failed) suffix = ` · ${failed} failed`;
    const online = navigator.onLine;
    el.innerHTML = `<span class="atoms-pulse-dot"></span> ${online ? 'Online' : 'Offline'}${suffix}`;
    el.className = 'atoms-badge ' + (online ? 'ok' : 'warn');
    el.title = online
      ? (n ? `${n} offline operation(s) waiting to sync` : 'Connected — floor sync idle')
      : 'No network — sales, returns, customers & payments save on this device';
  }

  function applyScan(value, targetId) {
    const id = targetId;
    const input = document.getElementById(id);
    if (!input) return;
    const normalized = window.AtomsScanner?.normalizeScanValue
      ? AtomsScanner.normalizeScanValue(value)
      : String(value || '').replace(/\D/g, '') || String(value || '').trim();
    if (input.tagName === 'TEXTAREA') {
      input.value = [input.value.trim(), normalized].filter(Boolean).join('\n');
    } else {
      input.value = normalized;
      input.dispatchEvent(new CustomEvent('atoms-filled', { bubbles: true }));
    }
    if (id === 'imei-q') {
      document.getElementById('imei-form')?.requestSubmit();
    }
    if (id === 'sc-imei') {
      document.getElementById('count-scan-form')?.requestSubmit();
    }
    input.focus();
  }

  async function refreshBell() {
    const bell = document.getElementById('atoms-bell');
    if (!bell) return;
    try {
      const n = await api('notifications');
      const unread = Number(n.unread || 0);
      bell.textContent = 'Alerts';
      bell.dataset.unread = unread > 9 ? '9+' : String(unread);
    } catch (_) { /* ignore */ }
  }

  function hideSearchPop() {
    document.getElementById('atoms-search-results')?.classList.add('hidden');
  }

  function renderSearchPop(data) {
    const pop = document.getElementById('atoms-search-results');
    if (!pop) return;
    const blocks = [];
    const add = (title, rows, html) => {
      if (!rows?.length) return;
      blocks.push(`<h4>${title}</h4>${rows.map(html).join('')}`);
    };
    add('Devices', data.imeis, (r) => `<button type="button" data-kind="imei" data-id="${escapeHtml(r.imei)}">${escapeHtml(r.imei)} · ${escapeHtml(r.product?.name || '')}${r.variant_label ? ' · ' + escapeHtml(r.variant_label) : ''} · ${escapeHtml(labelStatus(r.status))}</button>`);
    add('Invoices', data.sales, (r) => `<button type="button" data-kind="sale" data-id="${escapeHtml(r.invoice_number)}">${escapeHtml(r.invoice_number)} · ${escapeHtml(r.sale_type_label || saleTypeLabel(r.sale_type))} · ${money(r.total)}</button>`);
    add('Customers', data.customers, (r) => `<button type="button" data-kind="customer" data-id="${r.id}">${escapeHtml(r.name)} · ${escapeHtml(r.phone || '')}</button>`);
    add('Products', data.products, (r) => `<button type="button" data-kind="product" data-id="${r.id}">${escapeHtml(r.name)} · ${escapeHtml(r.sku || '')}${r.variant_summary ? ' · ' + escapeHtml(r.variant_summary) : ''}</button>`);
    add('Suppliers', data.suppliers, (r) => `<button type="button" data-kind="supplier" data-id="${r.id}">${escapeHtml(r.name)}</button>`);
    pop.innerHTML = blocks.join('') || '<p class="atoms-muted" style="padding:12px">No matches.</p>';
    pop.classList.remove('hidden');
    pop.querySelectorAll('button[data-kind]').forEach((btn) => btn.addEventListener('click', () => openSearchHit(btn.dataset.kind, btn.dataset.id)));
  }

  async function openSearchHit(kind, id) {
    hideSearchPop();
    document.getElementById('atoms-search').value = '';
    if (kind === 'imei') {
      state.searchQ = id;
      goHash('#/imei');
      return;
    }
    if (kind === 'sale') {
      try {
        const sale = await api(`sales/invoice/${encodeURIComponent(id)}`);
        printInvoice(sale);
      } catch (err) {
        setFlash(err.message, 'error');
        render();
      }
      return;
    }
    if (kind === 'customer') {
      state.customerId = Number(id);
      goHash('#/customers');
      return;
    }
    if (kind === 'product') {
      state.productFocusId = Number(id);
      goHash('#/inventory');
      return;
    }
    if (kind === 'supplier') {
      state.supplierId = Number(id);
      goHash('#/suppliers');
    }
  }

  function goHash(hash) {
    updateNavActive(String(hash || '').replace('#/', '').split('?')[0]);
    if (location.hash === hash) {
      render({ force: true });
    } else {
      location.hash = hash;
    }
  }

  async function boot() {
    try {
      state.bootstrap = await api('bootstrap');
    } catch (err) {
      const pageEl = document.getElementById('atoms-page');
      if (pageEl) {
        pageEl.innerHTML = `<div class="atoms-flash error">${escapeHtml(err.message)} Open the app once while online so this device can cache the floor.</div>`;
      }
      syncOnline();
      return;
    }
    const savedBranch = Number(localStorage.getItem('atoms_branch') || 0);
    const allowed = (state.bootstrap.branches || []).map((b) => Number(b.id));
    state.branchId = (savedBranch && allowed.includes(savedBranch))
      ? savedBranch
      : (state.bootstrap.branch_id || allowed[0]);
    document.getElementById('atoms-branch').addEventListener('change', (e) => {
      state.branchId = Number(e.target.value);
      localStorage.setItem('atoms_branch', String(state.branchId));
      routeMemoryCache.clear();
      lastRenderedKey = null;
      renderNav();
      render({ force: true });
    });
    const searchForm = document.getElementById('atoms-search-form');
    const searchInput = document.getElementById('atoms-search');
    searchForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = searchInput.value.trim();
      if (q.length < 2) return;
      try {
        renderSearchPop(await api(`search?q=${encodeURIComponent(q)}`));
      } catch (err) {
        setFlash(err.message, 'error');
        render();
      }
    });
    searchInput.addEventListener('input', debounce(async (e) => {
      const q = e.target.value.trim();
      if (q.length < 2) {
        hideSearchPop();
        return;
      }
      try {
        renderSearchPop(await api(`search?q=${encodeURIComponent(q)}`));
      } catch (_) {
        hideSearchPop();
      }
    }, 250));
    document.addEventListener('click', (e) => {
      if (!searchForm.contains(e.target)) hideSearchPop();
    });
    const bell = document.getElementById('atoms-bell');
    if (bell) {
      bell.addEventListener('click', () => {
        location.hash = '#/notifications';
      });
    }
    const toggle = document.getElementById('atoms-menu-toggle');
    const root = document.getElementById('atoms-root');
    const scrim = document.getElementById('atoms-nav-scrim');
    initSidebarCollapse();
    toggle?.addEventListener('click', () => toggleSidebarCollapsed());
    scrim?.addEventListener('click', () => root.classList.remove('nav-open'));
    document.getElementById('atoms-nav')?.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (!a) return;
      root.classList.remove('nav-open');
      if ((a.getAttribute('href') || '') === '#/customers') {
        state.customerId = null;
        state.customerInvoice = null;
      }
      if ((a.getAttribute('href') || '') === '#/suppliers') {
        state.supplierId = null;
      }
      if ((a.getAttribute('href') || '') === '#/transfers') {
        state.transferId = null;
      }
      if ((a.getAttribute('href') || '') === '#/purchases') {
        state.purchaseId = null;
      }
      if ((a.getAttribute('href') || '') === '#/swaps') {
        state.swapId = null;
      }
      if ((a.getAttribute('href') || '') === '#/repairs') {
        state.repairId = null;
      }
      if ((a.getAttribute('href') || '') === '#/returns') {
        state.returnId = null;
      }
      if ((a.getAttribute('href') || '') === '#/inventory') {
        state.productFocusId = null;
      }
      if ((a.getAttribute('href') || '') === '#/stocktake') {
        state.countId = null;
      }
      if ((a.getAttribute('href') || '') === '#/approvals') {
        state.approvalId = null;
      }
      if ((a.getAttribute('href') || '') === '#/expenses') {
        state.expenseId = null;
      }
    });
    syncOnline();
    window.addEventListener('online', () => { syncOnline(); flushQueue(); });
    window.addEventListener('offline', syncOnline);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data?.type === 'atoms-flush') flushQueue();
      });
    }
    if (CFG.pwa && CFG.sw && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register(CFG.sw, { scope: '/atoms-app/' }).then(() => requestBackgroundSync()).catch(() => {});
    }
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const input = document.getElementById('atoms-search');
        if (input) {
          input.focus();
          input.select();
        }
      }
    });
    setInterval(() => {
      const el = document.getElementById('atoms-clock');
      if (el) el.textContent = new Date().toLocaleString('en-NG');
    }, 1000);
    window.addEventListener('hashchange', () => {
      updateNavActive(page());
      render();
    });
    renderNav();
    wireNavPrefetch();
    await render();
    await refreshBell();
    await flushQueue();
    warmOfflineCache();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
