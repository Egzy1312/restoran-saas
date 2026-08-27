/**
 * Restoran SaaS - Embeddable Web Widget (specifikacija, modul D.2).
 *
 * Ugradnja na postojeću WordPress/Custom stranicu restorana:
 *
 *   <div data-restoran-widget data-slug="konoba-adriatic" data-type="reservation"></div>
 *   <script src="https://app.domain.com/widget.js" async></script>
 *
 * `data-type` je "reservation" (rezervacija stola), "menu" (pregled menija,
 * bez naruivanja) ili "takeaway" (naruivanje za preuzimanje, modul D.3).
 * Skripta ubacuje iframe direktno u element - gost ostaje
 * na sajtu restorana, bez preusmjeravanja na vanjski domen.
 *
 * Base URL PWA aplikacije se automatski uzima iz `src` ove skripte (isti
 * domen kao widget.js), ili se moze eksplicitno postaviti preko
 * `data-restoran-base` atributa na <script> tagu ako se widget.js servira
 * sa CDN-a razlicitog od same PWA aplikacije.
 */
(function () {
  'use strict';

  function resolveBaseUrl() {
    var currentScript = document.currentScript;
    if (currentScript) {
      var explicit = currentScript.getAttribute('data-restoran-base');
      if (explicit) return explicit.replace(/\/$/, '');
      try {
        return new URL(currentScript.src).origin;
      } catch (e) {
        /* fallback ispod */
      }
    }
    return '';
  }

  function mountWidget(el, baseUrl) {
    var slug = el.getAttribute('data-slug');
    var type = el.getAttribute('data-type') || 'reservation';
    if (!slug) {
      console.error('[restoran-widget] Nedostaje data-slug atribut.');
      return;
    }

    var paths = {
      menu: '/menu-preview/' + encodeURIComponent(slug),
      takeaway: '/takeaway/' + encodeURIComponent(slug),
      reservation: '/book/' + encodeURIComponent(slug),
    };
    var titles = {
      menu: 'Meni restorana',
      takeaway: 'Naruči za preuzimanje',
      reservation: 'Rezervacija stola',
    };

    var iframe = document.createElement('iframe');
    iframe.src = baseUrl + (paths[type] || paths.reservation);
    iframe.title = titles[type] || titles.reservation;
    iframe.style.width = '100%';
    iframe.style.maxWidth = '480px';
    iframe.style.height = el.getAttribute('data-height') || '640px';
    iframe.style.border = '0';
    iframe.style.borderRadius = '12px';
    iframe.style.boxShadow = '0 1px 4px rgba(0,0,0,0.12)';
    iframe.loading = 'lazy';

    el.appendChild(iframe);
  }

  function init() {
    var baseUrl = resolveBaseUrl();
    var nodes = document.querySelectorAll('[data-restoran-widget]');
    for (var i = 0; i < nodes.length; i++) {
      mountWidget(nodes[i], baseUrl);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
