/**
 * zip.js - Dependency-free ZIP reader (no CDN, works offline inside the APK).
 * Reads the central directory and extracts every entry to raw bytes.
 * Deflate uses the browser's native DecompressionStream, with a built-in
 * pure-JS inflate fallback for older WebViews.
 */
(function (root) {
  'use strict';

  const IGNORED_SEGMENTS = ['__MACOSX', '.git'];
  const IGNORED_NAMES = ['.DS_Store', 'Thumbs.db', 'desktop.ini'];

  function u16(d, o) { return d[o] | (d[o + 1] << 8); }
  function u32(d, o) { return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0; }

  // ---------- ZIP detection by magic bytes (file name / MIME type are NOT trusted) ----------
  function isZipBytes(head) {
    return !!head && head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b &&
      ((head[2] === 3 && head[3] === 4) || (head[2] === 5 && head[3] === 6));
  }

  // ---------- CRC32 ----------
  let CRC_TABLE = null;
  function crc32(data) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        CRC_TABLE[n] = c >>> 0;
      }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // ---------- Pure JS inflate (RFC 1951), port of zlib's "puff" ----------
  const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  function buildHuffman(lengths, n) {
    const count = new Uint16Array(16);
    const symbol = new Uint16Array(n);
    for (let i = 0; i < n; i++) count[lengths[i]]++;
    const offs = new Uint16Array(16);
    for (let len = 1; len < 15; len++) offs[len + 1] = offs[len] + count[len];
    for (let i = 0; i < n; i++) if (lengths[i]) symbol[offs[lengths[i]]++] = i;
    return { count, symbol };
  }

  let FIXED = null;
  function fixedTables() {
    if (FIXED) return FIXED;
    const l = new Uint8Array(288);
    for (let i = 0; i < 144; i++) l[i] = 8;
    for (let i = 144; i < 256; i++) l[i] = 9;
    for (let i = 256; i < 280; i++) l[i] = 7;
    for (let i = 280; i < 288; i++) l[i] = 8;
    const d = new Uint8Array(30).fill(5);
    FIXED = { lit: buildHuffman(l, 288), dist: buildHuffman(d, 30) };
    return FIXED;
  }

  function inflateJS(input, outSize) {
    const out = new Uint8Array(outSize);
    let pos = 0, bitbuf = 0, bitcnt = 0, outPos = 0;

    function bits(need) {
      let val = bitbuf;
      while (bitcnt < need) {
        if (pos >= input.length) throw new Error('Unexpected end of compressed data');
        val |= input[pos++] << bitcnt;
        bitcnt += 8;
      }
      bitbuf = val >>> need;
      bitcnt -= need;
      return val & ((1 << need) - 1);
    }

    function decode(h) {
      let code = 0, first = 0, index = 0;
      for (let len = 1; len <= 15; len++) {
        code |= bits(1);
        const count = h.count[len];
        if (code - count < first) return h.symbol[index + (code - first)];
        index += count;
        first += count;
        first <<= 1;
        code <<= 1;
      }
      throw new Error('Invalid Huffman code');
    }

    function codes(lit, dist) {
      for (;;) {
        let sym = decode(lit);
        if (sym < 256) {
          if (outPos >= outSize) throw new Error('Output overflow');
          out[outPos++] = sym;
        } else if (sym === 256) {
          return;
        } else {
          sym -= 257;
          if (sym >= 29) throw new Error('Invalid length symbol');
          const len = LBASE[sym] + bits(LEXT[sym]);
          const ds = decode(dist);
          if (ds >= 30) throw new Error('Invalid distance symbol');
          const d = DBASE[ds] + bits(DEXT[ds]);
          if (d > outPos) throw new Error('Distance too far back');
          if (outPos + len > outSize) throw new Error('Output overflow');
          for (let i = 0; i < len; i++) { out[outPos] = out[outPos - d]; outPos++; }
        }
      }
    }

    let last;
    do {
      last = bits(1);
      const type = bits(2);
      if (type === 0) {
        bitbuf = 0; bitcnt = 0;
        if (pos + 4 > input.length) throw new Error('Bad stored block');
        const len = input[pos] | (input[pos + 1] << 8);
        pos += 4;
        if (pos + len > input.length || outPos + len > outSize) throw new Error('Bad stored block length');
        out.set(input.subarray(pos, pos + len), outPos);
        pos += len; outPos += len;
      } else if (type === 1) {
        const f = fixedTables();
        codes(f.lit, f.dist);
      } else if (type === 2) {
        const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
        if (nlen > 286 || ndist > 30) throw new Error('Bad dynamic block');
        const lengths = new Uint8Array(19);
        for (let i = 0; i < ncode; i++) lengths[CL_ORDER[i]] = bits(3);
        const clh = buildHuffman(lengths, 19);
        const all = new Uint8Array(nlen + ndist);
        let idx = 0;
        while (idx < nlen + ndist) {
          const sym = decode(clh);
          if (sym < 16) {
            all[idx++] = sym;
          } else {
            let prev = 0, rep;
            if (sym === 16) {
              if (idx === 0) throw new Error('Bad repeat');
              prev = all[idx - 1];
              rep = 3 + bits(2);
            } else if (sym === 17) {
              rep = 3 + bits(3);
            } else {
              rep = 11 + bits(7);
            }
            if (idx + rep > nlen + ndist) throw new Error('Bad repeat length');
            while (rep--) all[idx++] = prev;
          }
        }
        codes(buildHuffman(all.subarray(0, nlen), nlen), buildHuffman(all.subarray(nlen), ndist));
      } else {
        throw new Error('Invalid deflate block type');
      }
    } while (!last);

    if (outPos !== outSize) throw new Error('Size mismatch after inflate');
    return out;
  }

  async function inflateNative(comp) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([comp]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // ---------- Names ----------
  function decodeName(bytes) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (_) { /* fall through */ }
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }

  function normalizePath(name) {
    const parts = name.replace(/\\/g, '/').split('/').filter(p => p !== '' && p !== '.');
    if (parts.some(p => p === '..')) return null;
    return parts.join('/');
  }

  function isIgnoredPath(path) {
    const parts = path.split('/');
    if (parts.some(p => IGNORED_SEGMENTS.includes(p))) return true;
    return IGNORED_NAMES.includes(parts[parts.length - 1]);
  }

  // ---------- Central directory ----------
  function listEntries(data) {
    let eocd = -1;
    const minPos = Math.max(0, data.length - 22 - 65535);
    for (let i = data.length - 22; i >= minPos; i--) {
      if (data[i] === 0x50 && data[i + 1] === 0x4b && data[i + 2] === 5 && data[i + 3] === 6) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Yeh valid ZIP file nahi hai (end-of-archive record nahi mila).');

    const total = u16(data, eocd + 10);
    const cdOffset = u32(data, eocd + 16);
    if (total === 0xFFFF || cdOffset === 0xFFFFFFFF) throw new Error('ZIP64 archives supported nahi hain (4GB se bada zip).');

    const entries = [];
    let p = cdOffset;
    for (let n = 0; n < total; n++) {
      if (u32(data, p) !== 0x02014b50) throw new Error('ZIP central directory corrupt hai.');
      const flags = u16(data, p + 8);
      const method = u16(data, p + 10);
      const crc = u32(data, p + 16);
      const csize = u32(data, p + 20);
      const usize = u32(data, p + 24);
      const nameLen = u16(data, p + 28);
      const extraLen = u16(data, p + 30);
      const commentLen = u16(data, p + 32);
      const localOffset = u32(data, p + 42);
      const rawName = decodeName(data.subarray(p + 46, p + 46 + nameLen));
      entries.push({ rawName, flags, method, crc, csize, usize, localOffset, isDir: rawName.endsWith('/') });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  async function extractEntry(data, e) {
    if (e.flags & 1) throw new Error('"' + e.rawName + '" password-protected hai, support nahi.');
    const lo = e.localOffset;
    if (u32(data, lo) !== 0x04034b50) throw new Error('"' + e.rawName + '" ka local header corrupt hai.');
    const start = lo + 30 + u16(data, lo + 26) + u16(data, lo + 28);
    const comp = data.subarray(start, start + e.csize);

    let out;
    if (e.method === 0) {
      out = comp.slice();
    } else if (e.method === 8) {
      if (e.usize === 0) {
        out = new Uint8Array(0);
      } else {
        let done = false;
        if (typeof DecompressionStream !== 'undefined' && !root.__ZIP_FORCE_JS_INFLATE) {
          try { out = await inflateNative(comp); done = out.length === e.usize; } catch (_) { done = false; }
        }
        if (!done) out = inflateJS(comp, e.usize);
      }
    } else {
      throw new Error('"' + e.rawName + '": compression method ' + e.method + ' supported nahi.');
    }
    if (out.length !== e.usize) throw new Error('"' + e.rawName + '": size mismatch.');
    if (crc32(out) !== e.crc) throw new Error('"' + e.rawName + '": CRC check fail (file corrupt).');
    return out;
  }

  /**
   * Extract a whole ZIP into [{ path, data:Uint8Array, size }].
   * Folders, __MACOSX, .git/, .DS_Store, Thumbs.db are skipped.
   */
  async function extractAll(data, onProgress) {
    const entries = listEntries(data).filter(e => !e.isDir);
    const wanted = [];
    for (const e of entries) {
      const path = normalizePath(e.rawName);
      if (!path || isIgnoredPath(path)) continue;
      wanted.push({ e, path });
    }
    if (wanted.length === 0) throw new Error('ZIP khali hai ya sirf system files hain.');

    const files = [];
    for (let i = 0; i < wanted.length; i++) {
      const bytes = await extractEntry(data, wanted[i].e);
      files.push({ path: wanted[i].path, data: bytes, size: bytes.length });
      if (onProgress) onProgress(i + 1, wanted.length, wanted[i].path);
    }
    return files;
  }

  const api = { isZipBytes, extractAll, listEntries, extractEntry, normalizePath, isIgnoredPath, crc32, inflateJS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ZipReader = api;
})(typeof window !== 'undefined' ? window : globalThis);
