<?php
declare(strict_types=1);
if (!defined('ABSPATH')) {
    exit;
}
?>
<a class="atoms-skip-link" href="#atoms-page">Skip to main content</a>
<script>try{if(localStorage.getItem('atoms_sidebar_collapsed')==='1'&&window.matchMedia('(min-width:961px)').matches){document.documentElement.classList.add('atoms-prefers-sidebar-collapsed');}}catch(e){}</script>
<div class="atoms-root" id="atoms-root">
  <aside class="atoms-sidebar" id="atoms-sidebar" aria-label="Main navigation">
    <div class="atoms-brand">
      <div class="atoms-brand-mark">
        <?php include ATOMS_PATH . 'templates/brand-mark.php'; ?>
      </div>
      <button type="button" class="atoms-sidebar-toggle" id="atoms-sidebar-toggle" aria-label="Collapse sidebar" aria-expanded="true" title="Collapse sidebar">
        <span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>
      </button>
    </div>
    <nav class="atoms-nav" id="atoms-nav" aria-label="App sections"></nav>
    <div class="atoms-user" id="atoms-user"></div>
  </aside>
  <main class="atoms-main" id="atoms-main">
    <header class="atoms-top" role="banner">
      <button type="button" class="atoms-menu-toggle" id="atoms-menu-toggle" aria-label="Open navigation menu">
        <span class="material-symbols-outlined" aria-hidden="true">menu</span>
      </button>
      <div class="atoms-top-heading" id="atoms-top-heading" hidden>
        <p class="atoms-top-heading-title" id="atoms-top-heading-title"></p>
        <p class="atoms-top-heading-sub" id="atoms-top-heading-sub"></p>
      </div>
      <form class="atoms-search" id="atoms-search-form" role="search">
        <span class="material-symbols-outlined atoms-search-icon" aria-hidden="true">search</span>
        <input type="search" id="atoms-search" placeholder="Search invoice, customer, IMEI, product…" autocomplete="off" aria-label="Global search">
        <div class="atoms-kbd-hint" aria-hidden="true"><kbd>⌘K</kbd></div>
        <div class="atoms-search-pop hidden" id="atoms-search-results"></div>
      </form>
      <div class="atoms-top-meta">
        <a href="#/pos" class="atoms-btn primary sm atoms-quick-sale-btn" title="Start a new sale">
          <span class="material-symbols-outlined" aria-hidden="true">point_of_sale</span>
          <span>New sale</span>
        </a>
        <button type="button" class="atoms-btn ghost atoms-bell" id="atoms-bell" title="View alerts" aria-label="Alerts">
          <span class="material-symbols-outlined" aria-hidden="true">notifications</span>
          <span class="atoms-bell-label">Alerts</span>
        </button>
        <div class="atoms-branch-wrap">
          <span class="material-symbols-outlined atoms-branch-icon" aria-hidden="true">storefront</span>
          <select id="atoms-branch" aria-label="Active branch"></select>
        </div>
        <span id="atoms-clock" class="atoms-clock-pill" aria-live="polite"></span>
        <span id="atoms-online" class="atoms-badge ok"><span class="atoms-pulse-dot"></span> Online</span>
      </div>
    </header>
    <div class="atoms-route-progress-track" id="atoms-route-progress" hidden aria-hidden="true"><div class="atoms-route-progress-bar"></div></div>
    <div class="atoms-page" id="atoms-page" role="main" tabindex="-1">
      <div class="atoms-loading">
        <div class="atoms-spinner"></div>
        <span>Loading your store dashboard…</span>
      </div>
    </div>
  </main>
  <nav class="atoms-dock" id="atoms-dock" aria-label="Quick navigation"></nav>
</div>
<div class="atoms-nav-scrim" id="atoms-nav-scrim" hidden></div>
<div id="atoms-modal-root" class="atoms-modal-root hidden" aria-live="polite"></div>
<div id="atoms-toasts" class="atoms-toasts" aria-live="polite"></div>
