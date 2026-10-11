// orb icons (6x6) + portrait (32x32). Characters use the invoker palette.

export const orbs = {
  q: ['.4444.', '4a1124', '411224', '412234', '422334', '.4444.'],
  w: ['.8888.', '8p5568', '855668', '856678', '866778', '.8888.'],
  e: ['.$$$$.', '$A990$', '$9900$', '$900#$', '$00##$', '.$$$$.'],
};

// portrait: 2x nearest upscale of the 16x16 head/collar crop of idle_s_0 (x5..20, y0..15).
export function portrait(frame, oy = 0) {
  const out = [];
  for (let y = 0; y < 16; y++) {
    const r = frame[y + oy].slice(5, 21).split('').map(c => c + c).join('');
    out.push(r, r);
  }
  return out;
}
