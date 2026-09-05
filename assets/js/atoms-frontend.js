/**
 * Abu Twins Invent — Frontend & Elementor Public Widgets Script
 */

(() => {
  'use strict';

  const config = window.ABUTWINS_FRONTEND || window.ATOMS_FRONTEND || {
    root: '/wp-json/atoms/v1/public/',
    nonce: '',
    settings: {},
  };

  async function api(path, options = {}) {
    const url = config.root.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
    const headers = {
      'Content-Type': 'application/json',
      'X-WP-Nonce': config.nonce,
      ...(options.headers || {}),
    };
    const res = await fetch(url, { ...options, headers });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.message || json.data?.message || 'Operation failed');
    }
    return json.data;
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (s) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[s]));
  }

  function money(kobo) {
    const n = Number(kobo || 0) / 100;
    return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // 1. Stock Checker
  function initStockLookups() {
    document.querySelectorAll('.atoms-stock-lookup').forEach((widget) => {
      const form = widget.querySelector('.js-stock-form');
      const qInput = widget.querySelector('.js-stock-query');
      const bSelect = widget.querySelector('.js-stock-branch');
      const resultsWrap = widget.querySelector('.js-stock-results');
      const grid = widget.querySelector('.js-stock-grid');
      const loading = widget.querySelector('.atoms-fe-loading-state');
      const showPrice = resultsWrap?.dataset?.showPrice !== 'no';
      const ctaText = resultsWrap?.dataset?.cta || 'Inquire on WhatsApp';

      async function doSearch() {
        if (!grid) return;
        if (loading) loading.style.display = 'block';
        grid.innerHTML = '';
        try {
          const q = encodeURIComponent(qInput?.value?.trim() || '');
          const branch = encodeURIComponent(bSelect?.value || '');
          const res = await api(`catalog?q=${q}&branch_id=${branch}`);
          if (loading) loading.style.display = 'none';

          if (!res.items || !res.items.length) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 24px; color: #64748b;">No products matched your search. Try iPhone, Samsung, accessories, or another model.</div>';
            return;
          }

          const waPhone = (config.settings?.whatsapp_phone || '').replace(/\D/g, '');

          grid.innerHTML = res.items.map((item) => {
            const hasStock = item.total_stock > 0;
            const isAccessory = item.track_mode === 'quantity';
            const stockBadge = hasStock
              ? `<span class="atoms-fe-stock-pill in-stock"><span class="material-symbols-outlined" style="font-size:14px;">check_circle</span> In Stock (${item.total_stock})</span>`
              : `<span class="atoms-fe-stock-pill out-of-stock"><span class="material-symbols-outlined" style="font-size:14px;">cancel</span> Contact Store</span>`;
            const lowStockBadge = item.is_low_stock
              ? '<span class="atoms-fe-stock-pill low-stock"><span class="material-symbols-outlined" style="font-size:14px;">warning</span> Limited stock</span>'
              : '';
            const typeBadge = isAccessory
              ? '<span class="atoms-fe-type-pill">Accessory</span>'
              : '<span class="atoms-fe-type-pill device">Device</span>';

            const variantsHtml = (item.variants || []).map((v) => `
              <div class="atoms-fe-variant-item${v.is_low_stock ? ' is-low' : ''}">
                <span>${escapeHtml(v.label || 'Standard')}${v.is_low_stock ? ' <span class="atoms-fe-low-dot" title="Limited stock">•</span>' : ''}</span>
                ${showPrice && v.price ? `<span class="atoms-fe-price">${escapeHtml(v.price_fmt || money(v.price))}</span>` : ''}
              </div>
            `).join('');

            const waMsg = encodeURIComponent(`Hello Abu Twins! I would like to inquire about ${item.brand} ${item.name} (${item.variants?.[0]?.label || ''}). Is it available in store?`);
            const waLink = waPhone ? `https://wa.me/${waPhone}?text=${waMsg}` : '#';

            return `
              <div class="atoms-fe-catalog-card">
                <div>
                  <div class="atoms-fe-card-top">
                    <div>
                      <div class="atoms-fe-card-meta">${typeBadge}<span class="atoms-fe-card-brand">${escapeHtml(item.brand || '')}</span></div>
                      <h4 class="atoms-fe-card-title">${escapeHtml(item.name)}</h4>
                    </div>
                    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
                      ${stockBadge}
                      ${lowStockBadge}
                    </div>
                  </div>
                  <div class="atoms-fe-variants-list">${variantsHtml}</div>
                </div>
                <div>
                  <a href="${waLink}" target="_blank" rel="noopener" class="atoms-fe-btn primary sm" style="width:100%;">
                    <span class="material-symbols-outlined">chat</span> ${escapeHtml(ctaText)}
                  </a>
                </div>
              </div>
            `;
          }).join('');
        } catch (err) {
          if (loading) loading.style.display = 'none';
          grid.innerHTML = `<div style="grid-column: 1/-1; color: #ef4444; padding: 16px;">${escapeHtml(err.message)}</div>`;
        }
      }

      form?.addEventListener('submit', (e) => {
        e.preventDefault();
        doSearch();
      });

      bSelect?.addEventListener('change', () => doSearch());

      // Auto run first search
      doSearch();
    });
  }

  // 2. Warranty Checker
  function initWarrantyCheckers() {
    document.querySelectorAll('.atoms-warranty-widget').forEach((widget) => {
      const form = widget.querySelector('.js-warranty-form');
      const imeiInput = widget.querySelector('.js-warranty-imei');
      const resultBox = widget.querySelector('.js-warranty-result');

      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const imei = imeiInput?.value?.trim() || '';
        if (!imei) return;

        resultBox.style.display = 'block';
        resultBox.className = 'atoms-fe-warranty-result';
        resultBox.innerHTML = '<div style="text-align:center; padding:16px;"><div class="atoms-fe-spinner"></div> Verifying IMEI against Abu Twins central registry…</div>';

        try {
          const res = await api(`warranty?imei=${encodeURIComponent(imei)}`);
          if (!res.success) {
            resultBox.className = 'atoms-fe-warranty-result status-expired';
            resultBox.innerHTML = `
              <div class="atoms-fe-warranty-header">
                <div class="atoms-fe-warranty-icon"><span class="material-symbols-outlined">error</span></div>
                <div>
                  <h4 style="margin:0; font-size:16px;">IMEI Not Verified</h4>
                  <p style="margin:2px 0 0; font-size:13px; color:#b91c1c;">${escapeHtml(res.message)}</p>
                </div>
              </div>
            `;
            return;
          }

          const isActive = res.status === 'active';
          resultBox.className = `atoms-fe-warranty-result status-${isActive ? 'active' : (res.status === 'in_inventory' ? 'active' : 'expired')}`;

          const waPhone = (config.settings?.whatsapp_phone || '').replace(/\D/g, '');
          const waMsg = encodeURIComponent(`Hello Abu Twins Support! I am checking my device warranty for ${res.device_name} (IMEI: ${imei}).`);
          const waLink = waPhone ? `https://wa.me/${waPhone}?text=${waMsg}` : '#';

          resultBox.innerHTML = `
            <div class="atoms-fe-warranty-header">
              <div class="atoms-fe-warranty-icon">
                <span class="material-symbols-outlined">${isActive ? 'verified' : (res.status === 'in_inventory' ? 'check_circle' : 'history_toggle_off')}</span>
              </div>
              <div>
                <h4 style="margin:0; font-size:18px;">${escapeHtml(res.device_name)}</h4>
                <p style="margin:2px 0 0; font-size:13px; color:${isActive ? '#047857' : '#64748b'}; font-weight:600;">
                  ${escapeHtml(res.message)}
                </p>
              </div>
            </div>
            <div class="atoms-fe-warranty-grid">
              <div class="atoms-fe-info-block">
                <div class="atoms-fe-info-label">Specifications</div>
                <div class="atoms-fe-info-val">${escapeHtml(res.specs || 'Standard')}</div>
              </div>
              ${res.purchase_date ? `
              <div class="atoms-fe-info-block">
                <div class="atoms-fe-info-label">Purchase Date</div>
                <div class="atoms-fe-info-val">${escapeHtml(res.purchase_date)}</div>
              </div>
              <div class="atoms-fe-info-block">
                <div class="atoms-fe-info-label">Warranty Expiry</div>
                <div class="atoms-fe-info-val">${escapeHtml(res.expires_date)}</div>
              </div>
              <div class="atoms-fe-info-block">
                <div class="atoms-fe-info-label">Days Remaining</div>
                <div class="atoms-fe-info-val" style="color:#047857;">${res.days_remaining} Days</div>
              </div>` : ''}
              <div class="atoms-fe-info-block">
                <div class="atoms-fe-info-label">Store Branch</div>
                <div class="atoms-fe-info-val">${escapeHtml(res.branch)}</div>
              </div>
            </div>
            <div style="margin-top:16px; display:flex; gap:10px; flex-wrap:wrap;">
              <a href="${waLink}" target="_blank" rel="noopener" class="atoms-fe-btn accent sm">
                <span class="material-symbols-outlined">support_agent</span> Contact Store Support
              </a>
            </div>
          `;
        } catch (err) {
          resultBox.className = 'atoms-fe-warranty-result status-expired';
          resultBox.innerHTML = `<p style="color:#ef4444; margin:0;">${escapeHtml(err.message)}</p>`;
        }
      });
    });
  }

  // 3. Trade-In / Swap Calculator
  function initSwapCalculators() {
    document.querySelectorAll('.atoms-swap-widget').forEach((widget) => {
      const form = widget.querySelector('.js-swap-form');
      const resultBox = widget.querySelector('.js-swap-result');

      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const brand = widget.querySelector('.js-swap-brand')?.value || '';
        const model = widget.querySelector('.js-swap-model')?.value || '';
        const storage = widget.querySelector('.js-swap-storage')?.value || '';
        const condition = widget.querySelector('.js-swap-condition')?.value || '';
        const hasBox = widget.querySelector('.js-swap-box')?.checked || false;
        const hasCharger = widget.querySelector('.js-swap-charger')?.checked || false;

        resultBox.style.display = 'block';
        resultBox.innerHTML = '<div style="padding:16px;"><div class="atoms-fe-spinner"></div> Calculating trade-in valuation…</div>';

        try {
          const res = await api('swap-estimate', {
            method: 'POST',
            body: JSON.stringify({ brand, model, storage, condition, has_box: hasBox, has_charger: hasCharger }),
          });

          const waPhone = (config.settings?.whatsapp_phone || '').replace(/\D/g, '');
          const waMsg = encodeURIComponent(`Hello Abu Twins! I would like to swap my ${res.device} (${res.condition} condition). My estimated quote is around ${res.estimated_fmt}. How can I bring it in?`);
          const waLink = waPhone ? `https://wa.me/${waPhone}?text=${waMsg}` : '#';

          resultBox.innerHTML = `
            <div style="font-size:13px; text-transform:uppercase; letter-spacing:0.05em; font-weight:700; color:#2F3590;">Estimated Trade-In Value</div>
            <div class="atoms-fe-swap-val">${escapeHtml(res.estimated_fmt)}</div>
            <p style="margin:4px 0 14px; font-size:14px; color:#475569;">
              Valuation Range: <strong>${escapeHtml(res.estimated_min)}</strong> – <strong>${escapeHtml(res.estimated_max)}</strong>
            </p>
            <p style="font-size:12px; color:#64748b; margin-bottom:16px;">
              ${escapeHtml(res.valuation_note)}
            </p>
            <a href="${waLink}" target="_blank" rel="noopener" class="atoms-fe-btn primary" style="display:inline-flex;">
              <span class="material-symbols-outlined">chat</span> Lock In Valuation on WhatsApp
            </a>
          `;
        } catch (err) {
          resultBox.innerHTML = `<p style="color:#ef4444; margin:0;">${escapeHtml(err.message)}</p>`;
        }
      });
    });
  }

  // Initialize all widgets when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initStockLookups();
      initWarrantyCheckers();
      initSwapCalculators();
    });
  } else {
    initStockLookups();
    initWarrantyCheckers();
    initSwapCalculators();
  }
})();
