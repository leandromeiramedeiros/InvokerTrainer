// Pixel-art rank medals. Owner: S6.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  // STUB (S6 replaces): IT.Medals.canvas(tier 0..7, stars 0..5, px) -> HTMLCanvasElement
  function canvas(tier, stars, px) {
    const c = document.createElement('canvas'); c.width = c.height = px || 64; return c;
  }
  IT.Medals = { canvas };
})(typeof window !== 'undefined' ? window : globalThis);
