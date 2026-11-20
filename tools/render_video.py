"""Покадровая запись ролика из игры (плавно на любом компьютере).

Игра считается кадр за кадром с ровным шагом 1/FPS, звук ударов собирается
отдельно в OfflineAudioContext по тем же моментам. Потом ffmpeg склеивает
картинку и звук и добавляет водяной знак.

Пример:  python3 tools/render_video.py vortex 30 out.mp4 --palette rainbow --rings 22
Нужно: запущенный сервер с игрой (python3 -m http.server 8765), Playwright + Chrome, ffmpeg.
"""
import argparse, base64, json, subprocess, sys, tempfile, os
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('game'); ap.add_argument('secs', type=float); ap.add_argument('out')
ap.add_argument('--fps', type=int, default=30)
ap.add_argument('--palette', default=None)
ap.add_argument('--rings', type=int, default=None)
ap.add_argument('--pack', default='glass')
ap.add_argument('--taps', default='0.3,1.2,2.1', help='секунды, когда «касаться» экрана (добавить шарик)')
ap.add_argument('--seed', type=int, default=7)
ap.add_argument('--url', default='http://localhost:8765/index.html')
ap.add_argument('--no-watermark', action='store_true')
a = ap.parse_args()

W, H = 540, 960  # CSS-пиксели; при плотности 2 получается 1080×1920
SETUP = r"""async ({game, palette, rings, pack, seed, fps}) => {
  // Предсказуемая случайность, чтобы ролик можно было повторить
  let s = seed >>> 0; Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const { Runner } = await import('./src/core/runner.js');
  const { GAMES } = await import('./src/games/registry.js');
  const { audio } = await import('./src/audio/engine.js');
  const { PACKS } = await import('./src/audio/packs.js');
  const { noteFreq } = await import('./src/audio/scales.js');
  const meta = GAMES.find((g) => g.id === game);
  const c = document.createElement('canvas');
  c.style.cssText = `position:fixed;inset:0;width:${innerWidth}px;height:${innerHeight}px;z-index:99999;background:#05040C`;
  document.body.append(c);
  const runner = new Runner(c);
  const g = new meta.Game({});
  if (rings && g.setRingCount) g.setRingCount(rings);
  if (palette && g.setPalette) g.setPalette(palette);
  runner.setGame(g); runner.resize();

  // Запоминаем удары вместо того, чтобы играть их вживую (те же ограничения, что в движке)
  window.__t = 0; window.__hits = []; const last = new Map(); let win = [];
  audio.hit = (index, vel = 0.7, o = {}) => {
    const now = window.__t * 1000;
    win = win.filter((t) => now - t < 40); if (win.length >= 8) return;
    const p = o.pack || pack; const key = p + ':' + index;
    if (now - (last.get(key) ?? -1e9) < 35) return; last.set(key, now); win.push(now);
    const P = PACKS[p] || PACKS.glass;
    const i = ((Math.round(index) % 12) + 12) % 12;
    window.__hits.push({ t: window.__t, f: noteFreq(i, audio.scale, (P.octave || 0) + (o.octave || 0)), v: Math.max(0.02, Math.min(1, vel)), p });
  };
  audio.setTrackMix = () => {};
  window.__step = (n, taps) => {
    const out = [];
    for (let k = 0; k < n; k++) {
      for (const tt of taps) if (tt >= window.__t && tt < window.__t + 1 / fps) g.tap((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40);
      runner.frame(1 / fps); window.__t += 1 / fps;
      out.push(c.toDataURL('image/jpeg', 0.93).slice(23));
    }
    return out;
  };
  window.__audio = async (secs) => {
    const sr = 48000, ctx = new OfflineAudioContext(2, Math.ceil(sr * (secs + 1)), sr);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(ctx.destination);
    const master = ctx.createGain(); master.gain.value = 0.7; master.connect(comp);
    for (const h of window.__hits) PACKS[h.p].play(ctx, master, h.f, h.v, h.t + 0.001);
    const buf = await ctx.startRendering();
    // WAV 16 бит
    const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
    const dv = new DataView(new ArrayBuffer(44 + n * 4));
    const w = (o, s) => [...s].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)));
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
    dv.setUint16(22, 2, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true);
    w(36, 'data'); dv.setUint32(40, n * 4, true);
    for (let i = 0, o = 44; i < n; i++, o += 4) {
      dv.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true); dv.setInt16(o + 2, Math.max(-1, Math.min(1, R[i])) * 32767, true);
    }
    const u = new Uint8Array(dv.buffer); let s2 = '';
    for (let i = 0; i < u.length; i += 0x8000) s2 += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s2);
  };
  return c.width + 'x' + c.height;
}"""

tmp = tempfile.mkdtemp()
frames = int(round(a.secs * a.fps)); taps = [float(x) for x in a.taps.split(',') if x]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=2)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('https://telegram.org/**', lambda r: r.abort()); pg.route('https://sad.adsgram.ai/**', lambda r: r.abort())
    pg.add_init_script("try{localStorage.setItem('vihr:lang','en')}catch(e){}")
    pg.goto(a.url); pg.wait_for_timeout(800)
    size = pg.evaluate(SETUP, dict(game=a.game, palette=a.palette, rings=a.rings, pack=a.pack, seed=a.seed, fps=a.fps))
    print('canvas', size, file=sys.stderr)
    vid = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(a.fps), '-c:v', 'mjpeg', '-i', '-',
                            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', f'{tmp}/v.mp4'], stdin=subprocess.PIPE)
    done = 0
    while done < frames:
        n = min(30, frames - done)
        for f in pg.evaluate('([n, t]) => window.__step(n, t)', [n, taps]):
            vid.stdin.write(base64.b64decode(f))
        done += n
        print(f'\r{done}/{frames}', end='', file=sys.stderr)
    vid.stdin.close(); vid.wait()
    open(f'{tmp}/a.wav', 'wb').write(base64.b64decode(pg.evaluate('(s) => window.__audio(s)', a.secs)))
    print('\nhits', pg.evaluate('window.__hits.length'), 'errors', errs, file=sys.stderr)
    b.close()

font = '/usr/share/fonts/opentype/inter/Inter-SemiBold.otf'
vf = 'null' if a.no_watermark else (
    f"drawtext=fontfile={font}:text='Spinly':fontcolor=white@0.85:fontsize=54:x=(w-text_w)/2:y=h-210,"
    f"drawtext=fontfile={font}:text='t.me/spinly_game_bot':fontcolor=0x22E4F5@0.85:fontsize=36:x=(w-text_w)/2:y=h-140")
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f'{tmp}/v.mp4', '-i', f'{tmp}/a.wav', '-vf', vf,
                '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
                '-t', str(a.secs), '-movflags', '+faststart', a.out], check=True)
print('saved', a.out, file=sys.stderr)
