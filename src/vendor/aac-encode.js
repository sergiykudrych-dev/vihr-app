// Кодирует звук в AAC-LC (Fraunhofer FDK, WebAssembly) — одинаково на любом телефоне,
// не зависит от того, умеет ли браузер кодировать звук сам. Файл fdk-aac.js подгружается только когда нужен звук.
// Лицензия FDK: LICENSE.fdk-aac. Сборка WASM: @audio/encode-aac 1.2.1.

let fdkLoad;

/**
 * @param {Float32Array[]} channels планарные каналы (1 или 2)
 * @returns {Promise<{ frames: Uint8Array[], config: Uint8Array, frameLength: number }>} сырые AAC-кадры + AudioSpecificConfig
 */
export async function encodeAac(channels, sampleRate, kbps = 160) {
  fdkLoad ??= import('./fdk-aac.js').then((m) => m.default());
  const m = await fdkLoad;
  const nch = channels.length;
  const h = m._ae_create(sampleRate, nch, kbps * 1000, 2, 0);
  if (!h) throw new Error('aac: encoder rejected settings');
  const chunks = [];
  const drain = () => {
    const len = m._ae_output_len(h);
    if (!len) return;
    const p = m._ae_output_ptr(h);
    chunks.push(m.HEAPU8.slice(p, p + len));
    m._ae_output_reset(h);
  };
  try {
    const total = channels[0].length, step = 8192;
    for (let s = 0; s < total; s += step) {
      const n = Math.min(step, total - s);
      let k = m._ae_input(h, n) >> 1;
      const heap = m.HEAP16; // память могла вырасти — берём после вызова
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < nch; c++) {
          const v = channels[c][s + i];
          heap[k++] = v <= -1 ? -32767 : v >= 1 ? 32767 : Math.floor(v * 32767 + 0.5);
        }
      }
      const r = m._ae_encode(h, n);
      if (r < 0) throw new Error('aac: encode failed');
      drain();
      if ((s / step) % 16 === 0) await new Promise((res) => setTimeout(res, 0));
    }
    if (m._ae_flush(h) < 0) throw new Error('aac: flush failed');
    drain();
  } finally {
    m._ae_destroy(h);
  }

  // Разбираем ADTS: у каждого кадра 7-байтовый заголовок, который в mp4 не нужен
  let size = 0;
  for (const c of chunks) size += c.length;
  const all = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  const frames = [];
  let config = null;
  for (let i = 0; i + 7 <= all.length;) {
    if (all[i] !== 0xff || (all[i + 1] & 0xf0) !== 0xf0) { i++; continue; }
    const hdr = (all[i + 1] & 1) ? 7 : 9;
    const len = ((all[i + 3] & 3) << 11) | (all[i + 4] << 3) | (all[i + 5] >> 5);
    if (len <= hdr || i + len > all.length) break;
    if (!config) {
      const obj = ((all[i + 2] >> 6) & 3) + 1, freq = (all[i + 2] >> 2) & 15, ch = ((all[i + 2] & 1) << 2) | (all[i + 3] >> 6);
      const v = (obj << 11) | (freq << 7) | (ch << 3);
      config = new Uint8Array([v >> 8, v & 255]);
    }
    frames.push(all.subarray(i + hdr, i + len));
    i += len;
  }
  if (!frames.length || !config) throw new Error('aac: empty output');
  return { frames, config, frameLength: 1024 };
}
