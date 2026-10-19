const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'assets', 'packs', 'starter', 'luts');
fs.mkdirSync(dir, { recursive: true });

const N = 5;
function header(title) {
  return `TITLE "${title}"\nLUT_3D_SIZE ${N}\nDOMAIN_MIN 0.0 0.0 0.0\nDOMAIN_MAX 1.0 1.0 1.0\n`;
}
function cube(title, fn) {
  let out = header(title);
  for (let b = 0; b < N; b++)
    for (let g = 0; g < N; g++)
      for (let r = 0; r < N; r++) {
        const [rr, gg, bb] = fn(r / (N - 1), g / (N - 1), b / (N - 1));
        out += rr.toFixed(6) + ' ' + gg.toFixed(6) + ' ' + bb.toFixed(6) + '\n';
      }
  return out;
}
const clamp = (v) => Math.min(1, Math.max(0, v));

fs.writeFileSync(dir + '/warm.cube', cube('Warm', (r, g, b) => [
  clamp(r * 1.12 + 0.02), clamp(g * 1.05 + 0.01), clamp(b * 0.92),
]));
fs.writeFileSync(dir + '/cool.cube', cube('Cool', (r, g, b) => [
  clamp(r * 0.9), clamp(g * 1.02), clamp(b * 1.15 + 0.02),
]));
fs.writeFileSync(dir + '/cinematic.cube', cube('Cinematic', (r, g, b) => {
  const l = (r + g + b) / 3;
  const c = (v) => clamp((v - 0.5) * 1.15 + 0.5);
  let rr = c(r), gg = c(g), bb = c(b);
  if (l < 0.35) { rr *= 0.85; gg *= 0.95; bb *= 1.15; }
  if (l > 0.65) { rr *= 1.1; gg *= 1.05; bb *= 0.9; }
  return [clamp(rr), clamp(gg), clamp(bb)];
}));

console.log('generated 3 LUTs in', dir);