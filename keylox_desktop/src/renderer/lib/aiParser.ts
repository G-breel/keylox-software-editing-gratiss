// Rule-based AI command parser (offline / no-cloud path).
//
// Extracted verbatim from PromptBar.tsx (Stage 7 QE: needs a pure, importable
// module so it can be unit-tested without mounting React).
// Behaviour is intentionally identical to the previous inline implementation —
// regexes and evaluation order are unchanged.
//
// Coverage note: this is the OFFLINE rule set. Everything it cannot parse falls
// through to the Gemini path (or the offline queue, G-33). Tests assert both the
// matched commands AND the explicit `null` fall-through.

export interface ParsedCommand {
  a: string;
  [key: string]: any;
}

export function parseCommand(cmd: string): ParsedCommand | null {
  const c = cmd.toLowerCase().trim();
  let m: RegExpMatchArray | null;
  m = c.match(/trim\s+(?:dari\s+)?(\d+(?:\.\d+)?)\s*(?:sampai|to|-)\s*(\d+(?:\.\d+)?)/);
  if (m) return { a: 'trim', start: +m[1], end: +m[2] };
  m = c.match(/potong\s+(\d+(?:\.\d+)?)\s*detik\s*pertama/);
  if (m) return { a: 'trim', start: +m[1], end: null };
  m = c.match(/potong\s+(\d+(?:\.\d+)?)\s*detik\s*terakhir/);
  if (m) return { a: 'trimlast', sec: +m[1] };
  m = c.match(/speed\s*(\d+(?:\.\d+)?)\s*x?/);
  if (m) return { a: 'speed', v: +m[1] };
  if (c.includes('slow')) return { a: 'speed', v: 0.5 };
  if (c.includes('fast')) return { a: 'speed', v: 2 };
  m = c.match(/rotate\s*(\d+)/);
  if (m) return { a: 'rotate', deg: +m[1] };
  if (c.includes('flip horizontal') || c.includes('flip h')) return { a: 'flipH' };
  if (c.includes('flip vertical') || c.includes('flip v')) return { a: 'flipV' };
  m = c.match(/brightness\s*(\d+(?:\.\d+)?)/);
  if (m) return { a: 'brightness', v: +m[1] };
  m = c.match(/contrast\s*(\d+(?:\.\d+)?)/);
  if (m) return { a: 'contrast', v: +m[1] };
  m = c.match(/saturation\s*(\d+(?:\.\d+)?)/);
  if (m) return { a: 'saturation', v: +m[1] };
  m = c.match(/blur\s*(\d+(?:\.\d+)?)/);
  if (m) return { a: 'blur', v: +m[1] };
  if (c.includes('grayscale') || c.includes('hitam putih')) return { a: 'grayscale' };
  if (c.includes('sepia')) return { a: 'sepia' };
  if (c.includes('vivid')) return { a: 'vivid' };
  m = c.match(/crop\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
  if (m) return { a: 'crop', x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
  m = c.match(/scale\s+(\d+)\s+(\d+)/);
  if (m) return { a: 'scale', w: +m[1], h: +m[2] };
  if (c.includes('reverse')) return { a: 'reverse' };
  m = c.match(/text\s*['"](.+?)['"]/);
  if (m) return { a: 'text', text: m[1], at: 0, size: 24, color: '#ffffff' };
  if (c.includes('mute')) return { a: 'mute' };
  if (c.includes('remove audio') || c.includes('hapus audio')) return { a: 'removeAudio' };
  const fi = c.match(/fade\s*in\s*(\d+(?:\.\d+)?)/);
  const fo = c.match(/fade\s*out\s*(\d+(?:\.\d+)?)/);
  if (fi || fo) return { a: 'fade', in: fi ? +fi[1] : 0, out: fo ? +fo[1] : 0 };
  if (c.includes('chroma') || c.includes('green screen')) return { a: 'chroma' };
  if (c.includes('reset filter')) return { a: 'resetFilter' };
  if (c.includes('reset trim')) return { a: 'resetTrim' };
  if (c.includes('reset all') || c === 'reset') return { a: 'resetAll' };
  if (c.includes('export') || c.includes('simpan') || c.includes('render')) return { a: 'export' };
  m = c.match(/volume\s*(\d+(?:\.\d+)?)/);
  if (m) return { a: 'volume', v: +m[1] };
  return null;
}
