'use strict';
const test = require('node:test');
const assert = require('node:assert');
const IT = require('./_load')(['js/art/ornaments.js']);

test('ornaments: every asset builds with opaque pixels and expected 9-slice sizes', () => {
  const O = IT.Ornaments;
  assert.ok(O.names.length >= 15);
  for (const n of O.names) {
    const im = O.build(n);
    assert.equal(im.px.length, im.w * im.h * 4, n);
    let opaque = 0; for (let i = 3; i < im.px.length; i += 4) if (im.px[i]) opaque++;
    assert.ok(opaque > 0, n + ' empty');
  }
  assert.equal(O.build('frame').w, 41); assert.equal(O.build('thin').w, 33); assert.equal(O.build('mini').w, 27);
  assert.equal(O.build('rib-plum').h, 16);
});

test('ornaments: frame corners are transparent inside, centre of the frame is empty (9-slice middle)', () => {
  const im = IT.Ornaments.build('thin'), mid = (im.h >> 1) * im.w + (im.w >> 1);
  assert.equal(im.px[mid * 4 + 3], 0);
});
