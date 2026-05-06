/**
 * Vertial Widget v1.0
 * Widget embebible para mostrar el stock de vehículos de un concesionario en tiempo real.
 *
 * USO:
 *   <div id="vertial-stock"></div>
 *   <script
 *     src="https://vertialapp.com/sdk/vertial-widget.js"
 *     data-api-key="vertial_sk_xxxxxxxxxxxxxxxx"
 *     data-container="#vertial-stock"
 *     data-lang="es"
 *     data-theme="light"
 *     data-per-page="12"
 *     data-show-filters="true"
 *   ></script>
 *
 * OPCIONES:
 *   data-api-key      (requerido) Tu API key de Vertial
 *   data-api-url      URL base de la API (por defecto: origen del script)
 *   data-container    Selector CSS del contenedor (por defecto: #vertial-stock)
 *   data-lang         Idioma: "es" | "en" (por defecto: "es")
 *   data-theme        Tema: "light" | "dark" | "auto" (por defecto: "light")
 *   data-per-page     Vehículos por página: 6 | 12 | 24 (por defecto: 12)
 *   data-show-filters Mostrar filtros de búsqueda: "true" | "false" (por defecto: "true")
 *   data-status       Filtrar por estado: "available" | "reserved" | "all" (por defecto: "available")
 *   data-on-click     Nombre de función global para manejar clics en vehículos
 */
(function (global) {
  'use strict';

  const SCRIPT_EL = document.currentScript || (function () {
    const scripts = document.querySelectorAll('script[data-api-key]');
    return scripts[scripts.length - 1];
  })();

  function attr(name, def) {
    const v = SCRIPT_EL && SCRIPT_EL.getAttribute('data-' + name);
    return v !== null && v !== undefined && v !== '' ? v : def;
  }

  const CONFIG = {
    apiKey: attr('api-key', ''),
    apiUrl: (attr('api-url', '') || (SCRIPT_EL ? new URL(SCRIPT_EL.src).origin : '')).replace(/\/$/, ''),
    container: attr('container', '#vertial-stock'),
    lang: attr('lang', 'es'),
    theme: attr('theme', 'light'),
    perPage: Math.min(48, Math.max(1, parseInt(attr('per-page', '12'), 10))),
    showFilters: attr('show-filters', 'true') !== 'false',
    status: attr('status', 'available'),
    onClickFn: attr('on-click', ''),
  };

  const I18N = {
    es: {
      loading: 'Cargando vehículos…',
      noResults: 'No hay vehículos disponibles en este momento.',
      errorLoad: 'No se pudieron cargar los vehículos. Inténtalo más tarde.',
      search: 'Buscar por marca, modelo…',
      filterStatus: 'Estado',
      filterBrand: 'Marca',
      all: 'Todos',
      available: 'Disponible',
      reserved: 'Reservado',
      sold: 'Vendido',
      km: 'km',
      year: 'Año',
      prev: 'Anterior',
      next: 'Siguiente',
      page: 'Página',
      of: 'de',
      viewDetails: 'Ver detalles',
      poweredBy: 'Catálogo con',
    },
    en: {
      loading: 'Loading vehicles…',
      noResults: 'No vehicles available at this moment.',
      errorLoad: 'Could not load vehicles. Please try again later.',
      search: 'Search by make, model…',
      filterStatus: 'Status',
      filterBrand: 'Brand',
      all: 'All',
      available: 'Available',
      reserved: 'Reserved',
      sold: 'Sold',
      km: 'km',
      year: 'Year',
      prev: 'Previous',
      next: 'Next',
      page: 'Page',
      of: 'of',
      viewDetails: 'View details',
      poweredBy: 'Catalogue by',
    },
  };

  const t = (key) => (I18N[CONFIG.lang] || I18N.es)[key] || key;

  const THEMES = {
    light: {
      bg: '#ffffff',
      cardBg: '#f8fafc',
      cardBorder: '#e2e8f0',
      cardHover: '#f1f5f9',
      text: '#0f172a',
      textMuted: '#64748b',
      accent: '#2563eb',
      accentText: '#ffffff',
      badge_available: '#dcfce7',
      badge_available_text: '#166534',
      badge_reserved: '#fef9c3',
      badge_reserved_text: '#854d0e',
      badge_sold: '#fee2e2',
      badge_sold_text: '#991b1b',
      inputBg: '#f1f5f9',
      inputBorder: '#cbd5e1',
      btnBg: '#f1f5f9',
      btnText: '#334155',
      btnActiveBg: '#2563eb',
      btnActiveText: '#ffffff',
    },
    dark: {
      bg: '#0f172a',
      cardBg: '#1e293b',
      cardBorder: '#334155',
      cardHover: '#253147',
      text: '#f1f5f9',
      textMuted: '#94a3b8',
      accent: '#3b82f6',
      accentText: '#ffffff',
      badge_available: '#14532d',
      badge_available_text: '#86efac',
      badge_reserved: '#713f12',
      badge_reserved_text: '#fde047',
      badge_sold: '#7f1d1d',
      badge_sold_text: '#fca5a5',
      inputBg: '#1e293b',
      inputBorder: '#334155',
      btnBg: '#1e293b',
      btnText: '#cbd5e1',
      btnActiveBg: '#3b82f6',
      btnActiveText: '#ffffff',
    },
  };

  function resolveTheme() {
    if (CONFIG.theme === 'auto') {
      return global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return CONFIG.theme === 'dark' ? 'dark' : 'light';
  }

  function formatPrice(price) {
    if (!price && price !== 0) return '';
    return new Intl.NumberFormat(CONFIG.lang === 'es' ? 'es-ES' : 'en-GB', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(price);
  }

  function formatMileage(km) {
    if (!km && km !== 0) return '';
    return new Intl.NumberFormat(CONFIG.lang === 'es' ? 'es-ES' : 'en-GB').format(km) + ' ' + t('km');
  }

  function getStatusLabel(status) {
    return t(status) || status;
  }

  function injectStyles(theme) {
    const th = THEMES[theme] || THEMES.light;
    const id = 'vertial-widget-styles';
    if (document.getElementById(id)) document.getElementById(id).remove();
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      .vertial-widget {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: ${th.bg};
        color: ${th.text};
        padding: 24px;
        border-radius: 16px;
        box-sizing: border-box;
      }
      .vertial-widget *, .vertial-widget *::before, .vertial-widget *::after { box-sizing: border-box; }
      .vertial-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 20px;
        align-items: center;
      }
      .vertial-search {
        flex: 1 1 200px;
        padding: 9px 14px;
        border-radius: 8px;
        border: 1px solid ${th.inputBorder};
        background: ${th.inputBg};
        color: ${th.text};
        font-size: 14px;
        outline: none;
        transition: border-color .2s;
      }
      .vertial-search:focus { border-color: ${th.accent}; }
      .vertial-search::placeholder { color: ${th.textMuted}; }
      .vertial-select {
        padding: 9px 12px;
        border-radius: 8px;
        border: 1px solid ${th.inputBorder};
        background: ${th.inputBg};
        color: ${th.text};
        font-size: 14px;
        cursor: pointer;
        outline: none;
      }
      .vertial-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 16px;
      }
      .vertial-card {
        background: ${th.cardBg};
        border: 1px solid ${th.cardBorder};
        border-radius: 12px;
        overflow: hidden;
        transition: transform .2s, box-shadow .2s, background .2s;
        cursor: pointer;
      }
      .vertial-card:hover {
        transform: translateY(-3px);
        box-shadow: 0 8px 24px rgba(0,0,0,.12);
        background: ${th.cardHover};
      }
      .vertial-card-img {
        width: 100%;
        height: 180px;
        object-fit: cover;
        display: block;
        background: ${th.cardBorder};
      }
      .vertial-card-img-placeholder {
        width: 100%;
        height: 180px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: ${th.cardBorder};
        font-size: 48px;
      }
      .vertial-card-body {
        padding: 14px 16px 16px;
      }
      .vertial-card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 6px;
      }
      .vertial-card-title {
        font-size: 15px;
        font-weight: 600;
        color: ${th.text};
        line-height: 1.3;
        margin: 0;
      }
      .vertial-badge {
        font-size: 11px;
        font-weight: 600;
        padding: 3px 8px;
        border-radius: 20px;
        white-space: nowrap;
        flex-shrink: 0;
        margin-left: 8px;
      }
      .vertial-badge-available { background: ${th.badge_available}; color: ${th.badge_available_text}; }
      .vertial-badge-reserved  { background: ${th.badge_reserved};  color: ${th.badge_reserved_text}; }
      .vertial-badge-sold      { background: ${th.badge_sold};      color: ${th.badge_sold_text}; }
      .vertial-card-meta {
        font-size: 12px;
        color: ${th.textMuted};
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 10px;
      }
      .vertial-card-meta span { display: flex; align-items: center; gap: 3px; }
      .vertial-price {
        font-size: 18px;
        font-weight: 700;
        color: ${th.accent};
      }
      .vertial-btn-detail {
        display: block;
        width: 100%;
        margin-top: 12px;
        padding: 8px;
        text-align: center;
        background: ${th.accent};
        color: ${th.accentText};
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity .15s;
      }
      .vertial-btn-detail:hover { opacity: .88; }
      .vertial-pagination {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 8px;
        margin-top: 24px;
        flex-wrap: wrap;
      }
      .vertial-page-btn {
        padding: 7px 14px;
        border-radius: 8px;
        border: 1px solid ${th.inputBorder};
        background: ${th.btnBg};
        color: ${th.btnText};
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: background .15s;
      }
      .vertial-page-btn:hover:not(:disabled) { background: ${th.accent}; color: ${th.accentText}; border-color: ${th.accent}; }
      .vertial-page-btn:disabled { opacity: .4; cursor: default; }
      .vertial-page-btn.active { background: ${th.btnActiveBg}; color: ${th.btnActiveText}; border-color: ${th.btnActiveBg}; }
      .vertial-page-info { font-size: 13px; color: ${th.textMuted}; }
      .vertial-status-msg {
        text-align: center;
        padding: 48px 24px;
        color: ${th.textMuted};
        font-size: 14px;
      }
      .vertial-spinner {
        display: inline-block;
        width: 28px;
        height: 28px;
        border: 3px solid ${th.cardBorder};
        border-top-color: ${th.accent};
        border-radius: 50%;
        animation: vertial-spin .7s linear infinite;
        margin-bottom: 12px;
      }
      @keyframes vertial-spin { to { transform: rotate(360deg); } }
      .vertial-footer {
        text-align: center;
        margin-top: 20px;
        font-size: 11px;
        color: ${th.textMuted};
      }
      .vertial-footer a { color: ${th.accent}; text-decoration: none; }
      @media (max-width: 480px) {
        .vertial-widget { padding: 16px; }
        .vertial-grid { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  // ─── State ───────────────────────────────────────────────────────────────────
  let state = {
    vehicles: [],
    filtered: [],
    page: 1,
    search: '',
    statusFilter: CONFIG.status === 'all' ? '' : CONFIG.status,
    brandFilter: '',
    loading: true,
    error: null,
    theme: resolveTheme(),
  };

  function applyFilters() {
    const q = state.search.toLowerCase().trim();
    state.filtered = state.vehicles.filter((v) => {
      if (state.statusFilter && v.status !== state.statusFilter) return false;
      if (state.brandFilter && (v.brand || '').toLowerCase() !== state.brandFilter.toLowerCase()) return false;
      if (q) {
        const haystack = `${v.brand} ${v.model} ${v.year} ${v.color} ${v.plate}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    state.page = 1;
  }

  function paginate() {
    const start = (state.page - 1) * CONFIG.perPage;
    return state.filtered.slice(start, start + CONFIG.perPage);
  }

  function totalPages() {
    return Math.max(1, Math.ceil(state.filtered.length / CONFIG.perPage));
  }

  // ─── Fetch ────────────────────────────────────────────────────────────────────
  async function fetchVehicles() {
    if (!CONFIG.apiKey) {
      state.loading = false;
      state.error = 'Falta data-api-key';
      render();
      return;
    }
    state.loading = true;
    state.error = null;
    render();

    try {
      let all = [];
      let page = 1;
      const limit = 100;
      while (true) {
        const resp = await fetch(`${CONFIG.apiUrl}/api/v1/vehicles?page=${page}&limit=${limit}`, {
          headers: { Authorization: `Bearer ${CONFIG.apiKey}` },
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        all = all.concat(data.data || []);
        if (all.length >= (data.meta?.total || 0) || (data.data || []).length < limit) break;
        page++;
      }
      state.vehicles = all;
      applyFilters();
    } catch (err) {
      state.error = err.message;
    } finally {
      state.loading = false;
      render();
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  function renderCard(v) {
    const imageUrl = Array.isArray(v.images) && v.images.length > 0 ? v.images[0] : null;
    const statusClass = `vertial-badge-${v.status || 'available'}`;
    const title = [v.brand, v.model].filter(Boolean).join(' ') || 'Vehículo';

    return `<div class="vertial-card" data-id="${v._id}" role="article" tabindex="0" aria-label="${title}">
      ${imageUrl
        ? `<img class="vertial-card-img" src="${imageUrl}" alt="${title}" loading="lazy" />`
        : `<div class="vertial-card-img-placeholder" aria-hidden="true">🚗</div>`}
      <div class="vertial-card-body">
        <div class="vertial-card-header">
          <h3 class="vertial-card-title">${title}</h3>
          <span class="vertial-badge ${statusClass}">${getStatusLabel(v.status || 'available')}</span>
        </div>
        <div class="vertial-card-meta">
          ${v.year ? `<span>📅 ${v.year}</span>` : ''}
          ${v.mileage ? `<span>🛣️ ${formatMileage(v.mileage)}</span>` : ''}
          ${v.fuel ? `<span>⛽ ${v.fuel}</span>` : ''}
          ${v.transmission ? `<span>⚙️ ${v.transmission}</span>` : ''}
          ${v.color ? `<span>🎨 ${v.color}</span>` : ''}
        </div>
        ${v.price ? `<div class="vertial-price">${formatPrice(v.price)}</div>` : ''}
        <button class="vertial-btn-detail" data-id="${v._id}">${t('viewDetails')}</button>
      </div>
    </div>`;
  }

  function getBrands() {
    const brands = [...new Set(state.vehicles.map((v) => v.brand).filter(Boolean))].sort();
    return brands;
  }

  function render() {
    const container = document.querySelector(CONFIG.container);
    if (!container) return;

    injectStyles(state.theme);

    const th = THEMES[state.theme] || THEMES.light;
    let html = `<div class="vertial-widget">`;

    if (CONFIG.showFilters) {
      const brands = getBrands();
      html += `<div class="vertial-toolbar" role="search">
        <input
          class="vertial-search"
          type="search"
          placeholder="${t('search')}"
          value="${state.search.replace(/"/g, '&quot;')}"
          aria-label="${t('search')}"
          id="vertial-search-input"
        />
        ${CONFIG.status === 'all' ? `
        <select class="vertial-select" id="vertial-status-filter" aria-label="${t('filterStatus')}">
          <option value="">${t('all')}</option>
          <option value="available" ${state.statusFilter === 'available' ? 'selected' : ''}>${t('available')}</option>
          <option value="reserved" ${state.statusFilter === 'reserved' ? 'selected' : ''}>${t('reserved')}</option>
          <option value="sold" ${state.statusFilter === 'sold' ? 'selected' : ''}>${t('sold')}</option>
        </select>` : ''}
        ${brands.length > 1 ? `
        <select class="vertial-select" id="vertial-brand-filter" aria-label="${t('filterBrand')}">
          <option value="">${t('filterBrand')}: ${t('all')}</option>
          ${brands.map((b) => `<option value="${b}" ${state.brandFilter === b ? 'selected' : ''}>${b}</option>`).join('')}
        </select>` : ''}
      </div>`;
    }

    if (state.loading) {
      html += `<div class="vertial-status-msg"><div class="vertial-spinner"></div><br>${t('loading')}</div>`;
    } else if (state.error) {
      html += `<div class="vertial-status-msg">⚠️ ${t('errorLoad')}</div>`;
    } else if (state.filtered.length === 0) {
      html += `<div class="vertial-status-msg">🔍 ${t('noResults')}</div>`;
    } else {
      const page = paginate();
      html += `<div class="vertial-grid" role="list">`;
      page.forEach((v) => { html += renderCard(v); });
      html += `</div>`;

      const total = totalPages();
      if (total > 1) {
        html += `<nav class="vertial-pagination" aria-label="Paginación">
          <button class="vertial-page-btn" id="vertial-prev" ${state.page <= 1 ? 'disabled' : ''} aria-label="${t('prev')}">&lsaquo; ${t('prev')}</button>
          <span class="vertial-page-info">${t('page')} ${state.page} ${t('of')} ${total}</span>
          <button class="vertial-page-btn" id="vertial-next" ${state.page >= total ? 'disabled' : ''} aria-label="${t('next')}">${t('next')} &rsaquo;</button>
        </nav>`;
      }
    }

    html += `<div class="vertial-footer">${t('poweredBy')} <a href="https://vertialapp.com" target="_blank" rel="noopener">Vertial</a></div>`;
    html += `</div>`;

    container.innerHTML = html;
    attachEvents(container);
  }

  function attachEvents(container) {
    const searchInput = container.querySelector('#vertial-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.search = e.target.value;
        applyFilters();
        render();
      });
      // Restore focus
      searchInput.focus && searchInput === document.activeElement && searchInput.focus();
    }

    const statusFilter = container.querySelector('#vertial-status-filter');
    if (statusFilter) {
      statusFilter.addEventListener('change', (e) => {
        state.statusFilter = e.target.value;
        applyFilters();
        render();
      });
    }

    const brandFilter = container.querySelector('#vertial-brand-filter');
    if (brandFilter) {
      brandFilter.addEventListener('change', (e) => {
        state.brandFilter = e.target.value;
        applyFilters();
        render();
      });
    }

    const prevBtn = container.querySelector('#vertial-prev');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (state.page > 1) { state.page--; render(); }
      });
    }

    const nextBtn = container.querySelector('#vertial-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (state.page < totalPages()) { state.page++; render(); }
      });
    }

    container.querySelectorAll('.vertial-btn-detail, .vertial-card').forEach((el) => {
      el.addEventListener('click', (e) => {
        const id = el.dataset.id || el.closest('[data-id]')?.dataset?.id;
        if (!id) return;
        const vehicle = state.vehicles.find((v) => v._id === id);
        if (!vehicle) return;

        if (CONFIG.onClickFn && typeof global[CONFIG.onClickFn] === 'function') {
          e.stopPropagation();
          global[CONFIG.onClickFn](vehicle);
          return;
        }

        container.dispatchEvent(new CustomEvent('vertial:vehicle-click', {
          bubbles: true,
          detail: { vehicle },
        }));
      });
    });
  }

  // ─── Public API ───────────────────────────────────────────────────────────────
  const vertialWidgetApi = {
    version: '1.0.0',
    config: CONFIG,

    /** Fuerza una recarga desde la API */
    refresh() {
      fetchVehicles();
    },

    /** Cambia el tema en caliente */
    setTheme(theme) {
      state.theme = theme === 'dark' ? 'dark' : 'light';
      render();
    },

    /** Devuelve los vehículos cargados actualmente */
    getVehicles() {
      return [...state.vehicles];
    },
  };
  global.VertialWidget = vertialWidgetApi;

  // ─── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    const container = document.querySelector(CONFIG.container);
    if (!container) {
      console.warn('[VertialWidget] Contenedor no encontrado:', CONFIG.container);
      return;
    }

    if (CONFIG.theme === 'auto' && global.matchMedia) {
      global.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        state.theme = e.matches ? 'dark' : 'light';
        render();
      });
    }

    fetchVehicles();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
