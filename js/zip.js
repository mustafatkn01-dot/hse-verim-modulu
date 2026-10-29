// ZIP yazma ve okuma (kütüphanesiz). Yazma: depolamalı veya deflate-raw (CompressionStream); okuma: merkezi dizin + DecompressionStream.
// 4 GB altı, tek diskli, ZIP64 olmayan paketler için yeterlidir (parçalar yaklaşık 150 MB).
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const pipe = async (u8, ts) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(ts)).arrayBuffer());
export const canZip = () => typeof CompressionStream === "function" && typeof DecompressionStream === "function";
export const deflate = u8 => pipe(u8, new CompressionStream("deflate-raw"));
export const inflate = u8 => pipe(u8, new DecompressionStream("deflate-raw"));
export const toBytes = s => new TextEncoder().encode(s);
export const fromBytes = u => new TextDecoder().decode(u);

// files: [{ name, data: Uint8Array, z?: true }]  z → mümkünse sıkıştırılır (metin dosyaları)
export async function zipBuild(files) {
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0, cs = 0;
  for (const f of files) {
    const nm = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    let body = f.data, method = 0;
    if (f.z && canZip() && size > 64) { try { const c = await deflate(f.data); if (c.length < size) { body = c; method = 8; } } catch { } }
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true); lh.setUint16(12, 0x21, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, body.length, true); lh.setUint32(22, size, true); lh.setUint16(26, nm.length, true);
    parts.push(lh.buffer, nm, body);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true); ch.setUint16(14, 0x21, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, body.length, true); ch.setUint32(24, size, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
    cen.push(ch.buffer, nm); cs += 46 + nm.length; off += 30 + nm.length + body.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cs, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...cen, end.buffer], { type: "application/zip" });
}

// Blob/File açar: { names, has(n), read(n) → Uint8Array (CRC doğrulanır) }. Bozuk dosyada hata fırlatır.
export async function zipOpen(blob) {
  const tailLen = Math.min(blob.size, 66000), tail = new DataView(await blob.slice(blob.size - tailLen).arrayBuffer());
  let e = -1; for (let i = tailLen - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error("ZIP dosyası okunamadı (bitiş kaydı yok).");
  const count = tail.getUint16(e + 10, true), cdSize = tail.getUint32(e + 12, true), cdOff = tail.getUint32(e + 16, true);
  if (cdOff === 0xFFFFFFFF || count === 0xFFFF) throw new Error("Bu ZIP biçimi desteklenmiyor.");
  const cd = new DataView(await blob.slice(cdOff, cdOff + cdSize).arrayBuffer()), dec = new TextDecoder(), map = new Map(); let p = 0;
  for (let i = 0; i < count; i++) {
    if (cd.getUint32(p, true) !== 0x02014b50) throw new Error("ZIP dizini bozuk.");
    const method = cd.getUint16(p + 10, true), crc = cd.getUint32(p + 16, true), csz = cd.getUint32(p + 20, true), sz = cd.getUint32(p + 24, true), nl = cd.getUint16(p + 28, true), el = cd.getUint16(p + 30, true), cl = cd.getUint16(p + 32, true), lo = cd.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nl)); map.set(name, { method, crc, csz, sz, lo }); p += 46 + nl + el + cl;
  }
  return {
    names: [...map.keys()], has: n => map.has(n),
    async read(n) {
      const m = map.get(n); if (!m) throw new Error("Pakette dosya yok: " + n);
      const lh = new DataView(await blob.slice(m.lo, m.lo + 30).arrayBuffer()); if (lh.getUint32(0, true) !== 0x04034b50) throw new Error("ZIP kaydı bozuk: " + n);
      const st = m.lo + 30 + lh.getUint16(26, true) + lh.getUint16(28, true); let u = new Uint8Array(await blob.slice(st, st + m.csz).arrayBuffer());
      if (m.method === 8) u = await inflate(u); else if (m.method !== 0) throw new Error("Desteklenmeyen sıkıştırma: " + n);
      if (u.length !== m.sz || crc32(u) !== m.crc) throw new Error("Doğrulama hatası (bozuk dosya): " + n);
      return u;
    }
  };
}
