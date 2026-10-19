import { describe, it, expect } from 'vitest';
import { parseCommand } from '../../src/renderer/lib/aiParser';

// ---------------------------------------------------------------------------
// Unit tests: rule-based AI command parser (offline path)
//
// This is the OFFLINE intent parser that runs before Gemini. Two things matter:
//  1. the commands it DOES support must map to the documented action shape
//     (PromptBar.applyCmd consumes `a` + params);
//  2. the commands it does NOT support must return `null` so the caller can fall
//     through to Gemini / the offline queue (spec G-33). Silent mis-parses would
//     be worse than a miss, so negative cases are asserted explicitly.
//
// NOTE: the parser lower-cases the whole input first, so returned text payloads
// are lower-cased. That is existing behaviour, captured here deliberately.
// ---------------------------------------------------------------------------

describe('aiParser — timeline & structure', () => {
  it('parses "trim dari A sampai B"', () => {
    expect(parseCommand('trim dari 2 sampai 5')).toEqual({ a: 'trim', start: 2, end: 5 });
  });

  it('parses "trim 1 to 3" (English range form)', () => {
    expect(parseCommand('trim 1 to 3')).toEqual({ a: 'trim', start: 1, end: 3 });
  });

  it('parses "potong N detik pertama"', () => {
    expect(parseCommand('potong 5 detik pertama')).toEqual({ a: 'trim', start: 5, end: null });
  });

  it('parses "potong N detik terakhir"', () => {
    expect(parseCommand('potong 3 detik terakhir')).toEqual({ a: 'trimlast', sec: 3 });
  });

  it('parses explicit speed values and is case-insensitive', () => {
    expect(parseCommand('speed 2x')).toEqual({ a: 'speed', v: 2 });
    expect(parseCommand('SPEED 1.5')).toEqual({ a: 'speed', v: 1.5 });
  });

  it('maps the "slow"/"fast" keywords to half/double speed', () => {
    expect(parseCommand('slow motion 0.5x')).toEqual({ a: 'speed', v: 0.5 });
    expect(parseCommand('fast forward')).toEqual({ a: 'speed', v: 2 });
  });

  it('parses reverse', () => {
    expect(parseCommand('reverse the video')).toEqual({ a: 'reverse' });
  });
});

describe('aiParser — transform', () => {
  it('parses rotate degrees', () => {
    expect(parseCommand('rotate 90')).toEqual({ a: 'rotate', deg: 90 });
  });

  it('parses flip H/V', () => {
    expect(parseCommand('flip horizontal')).toEqual({ a: 'flipH' });
    expect(parseCommand('flip v')).toEqual({ a: 'flipV' });
  });

  it('parses crop and scale with numeric params', () => {
    expect(parseCommand('crop 0 0 100 200')).toEqual({ a: 'crop', x: 0, y: 0, w: 100, h: 200 });
    expect(parseCommand('scale 2 2')).toEqual({ a: 'scale', w: 2, h: 2 });
  });
});

describe('aiParser — color & filter', () => {
  it('parses numeric adjustments', () => {
    expect(parseCommand('brightness 1.5')).toEqual({ a: 'brightness', v: 1.5 });
    expect(parseCommand('contrast 1.2')).toEqual({ a: 'contrast', v: 1.2 });
    expect(parseCommand('saturation 0.5')).toEqual({ a: 'saturation', v: 0.5 });
    expect(parseCommand('blur 3')).toEqual({ a: 'blur', v: 3 });
  });

  it('parses boolean looks (grayscale / sepia / vivid)', () => {
    expect(parseCommand('hitam putih')).toEqual({ a: 'grayscale' });
    expect(parseCommand('grayscale')).toEqual({ a: 'grayscale' });
    expect(parseCommand('sepia')).toEqual({ a: 'sepia' });
    expect(parseCommand('vivid')).toEqual({ a: 'vivid' });
  });

  it('parses the reset family in the documented precedence order', () => {
    expect(parseCommand('reset filter')).toEqual({ a: 'resetFilter' });
    expect(parseCommand('reset trim')).toEqual({ a: 'resetTrim' });
    expect(parseCommand('reset all')).toEqual({ a: 'resetAll' });
    expect(parseCommand('reset')).toEqual({ a: 'resetAll' });
  });
});

describe('aiParser — text & audio', () => {
  it('parses quoted text and lower-cases it', () => {
    expect(parseCommand(`text 'Halo Dunia'`)).toEqual({ a: 'text', text: 'halo dunia', at: 0, size: 24, color: '#ffffff' });
    expect(parseCommand('text "SUB"')).toEqual({ a: 'text', text: 'sub', at: 0, size: 24, color: '#ffffff' });
  });

  it('does not treat the bare word "text" as a text op without quotes', () => {
    // No quotes -> not a text op; and no other rule matches -> null (fall to Gemini).
    expect(parseCommand('tambahkan text di atas')).toBeNull();
  });

  it('parses mute and audio removal', () => {
    expect(parseCommand('mute the clip')).toEqual({ a: 'mute' });
    expect(parseCommand('hapus audio')).toEqual({ a: 'removeAudio' });
    expect(parseCommand('remove audio')).toEqual({ a: 'removeAudio' });
  });

  it('parses fade in / fade out combinations', () => {
    expect(parseCommand('fade in 1 fade out 2')).toEqual({ a: 'fade', in: 1, out: 2 });
    expect(parseCommand('fade in 0.5')).toEqual({ a: 'fade', in: 0.5, out: 0 });
  });

  it('parses volume', () => {
    expect(parseCommand('volume 50')).toEqual({ a: 'volume', v: 50 });
  });

  it('parses chroma key / green screen', () => {
    expect(parseCommand('chroma key')).toEqual({ a: 'chroma' });
    expect(parseCommand('green screen')).toEqual({ a: 'chroma' });
  });
});

describe('aiParser — export', () => {
  it('parses export keywords', () => {
    expect(parseCommand('export')).toEqual({ a: 'export' });
    expect(parseCommand('simpan video')).toEqual({ a: 'export' });
    expect(parseCommand('render')).toEqual({ a: 'export' });
  });
});

describe('aiParser — documented gaps (must fall through to Gemini)', () => {
  // These are REAL coverage gaps of the offline parser. They must return null,
  // never a guessed action, so the caller escalates to the AI (G-01) or queue (G-33).
  it('does not handle one-prompt full edit (#1)', () => {
    expect(parseCommand('bikin video 45 detik bergaya cinematic dari folder ini')).toBeNull();
  });

  it('does not handle effects (#80 "glow")', () => {
    expect(parseCommand('tambahkan glow di 0-3 detik')).toBeNull();
  });

  it('does not handle ANY tracking command (#226..#249)', () => {
    expect(parseCommand('lacak wajah dan tempelkan text di atasnya')).toBeNull();
    expect(parseCommand('stabilkan video ini')).toBeNull();
    expect(parseCommand('tempelkan sticker ke tangan yang bergerak')).toBeNull();
    expect(parseCommand('buat background blur tapi subjek tetap fokus')).toBeNull();
  });

  it('returns null for empty / garbage input', () => {
    expect(parseCommand('')).toBeNull();
    expect(parseCommand('   ')).toBeNull();
    expect(parseCommand('trim dari x sampai y')).toBeNull();
  });

  it('is single-intent: a compound sentence yields only the first match', () => {
    // Documents a known limitation: multi-op requires one op per line (the
    // PromptBar splits on newlines) or the Gemini path.
    expect(parseCommand('brightness 1.2 and export')).toEqual({ a: 'brightness', v: 1.2 });
  });
});
