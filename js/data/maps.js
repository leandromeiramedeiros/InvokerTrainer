// Map registry (stub, owner A — see docs/MAPS-v3.md). IT.Maps.get(id) -> built map (cached).
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const list = [{ id: 'grounds', name: { en: 'Training Grounds', pt: 'Campo de Treino' }, blurb: { en: '', pt: '' }, tags: ['open'] }];
  const cache = {};
  function get(id) {
    if (!list.some(m => m.id === id)) id = 'grounds';
    if (cache[id]) return cache[id];
    const m = IT.Map.build(IT.MAPDEF);
    m.id = id; m.tags = list[0].tags; m.towers = [];
    m.elev = new Uint8Array(m.w * m.h).fill(1);
    m.elevAt = () => 1;
    return (cache[id] = m);
  }
  IT.Maps = { list, ids: () => list.map(m => m.id), get, thumb: null };
})(typeof window !== 'undefined' ? window : globalThis);
