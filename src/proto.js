const Proto = (() => {
  const SERVICE = '0000fd02-0000-1000-8000-00805f9b34fb';
  const RX = '0000fd02-0001-1000-8000-00805f9b34fb';
  const TX = '0000fd02-0002-1000-8000-00805f9b34fb';
  const MAX_BLOCK = 84, OFFSET = 2, NO_DELIM = 0xff, XOR = 3, END = 0x02, HIGH = 0x01;

  function cobsEncode(data) {
    const out = [];
    let codeIndex = 0, block = 0;
    const begin = () => { codeIndex = out.length; out.push(NO_DELIM); block = 1; };
    begin();
    for (const byte of data) {
      if (byte > END) { out.push(byte); block++; }
      if (byte <= END || block > MAX_BLOCK) {
        if (byte <= END) out[codeIndex] = byte * MAX_BLOCK + block + OFFSET;
        begin();
      }
    }
    out[codeIndex] = block + OFFSET;
    return Uint8Array.from(out);
  }

  function cobsDecode(data) {
    const out = [];
    if (!data.length) return new Uint8Array(0);
    const unescape = (code) => {
      if (code === NO_DELIM) return [null, MAX_BLOCK + 1];
      let value = Math.floor((code - OFFSET) / MAX_BLOCK), block = (code - OFFSET) % MAX_BLOCK;
      if (block === 0) { block = MAX_BLOCK; value -= 1; }
      return [value, block];
    };
    let [value, block] = unescape(data[0]);
    for (let i = 1; i < data.length; i++) {
      block -= 1;
      if (block > 0) { out.push(data[i]); continue; }
      if (value !== null) out.push(value);
      [value, block] = unescape(data[i]);
    }
    return Uint8Array.from(out);
  }

  function pack(data) {
    const enc = cobsEncode(data);
    const frame = new Uint8Array(enc.length + 1);
    for (let i = 0; i < enc.length; i++) frame[i] = enc[i] ^ XOR;
    frame[enc.length] = END;
    return frame;
  }

  function unpack(frame) {
    let start = 0, end = frame.length;
    if (frame[0] === HIGH) start = 1;
    if (frame[end - 1] === END) end -= 1;
    const body = new Uint8Array(end - start);
    for (let i = start; i < end; i++) body[i - start] = frame[i] ^ XOR;
    return cobsDecode(body);
  }

  const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  // CRC32 zoals de hub het verwacht: data aangevuld met nullen tot een veelvoud van 4 bytes.
  function crc(data, seed = 0) {
    let c = (seed ^ 0xffffffff) >>> 0;
    for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    const pad = (4 - (data.length % 4)) % 4;
    for (let i = 0; i < pad; i++) c = TABLE[c & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  const infoRequest = () => Uint8Array.of(0x00);
  const clearSlot = (slot) => Uint8Array.of(0x46, slot);
  const programFlow = (stop, slot) => Uint8Array.of(0x1e, stop ? 1 : 0, slot);

  function startFileUpload(name, slot, fileCrc) {
    const n = new TextEncoder().encode(name);
    if (n.length > 31) throw new Error('Bestandsnaam te lang');
    const m = new Uint8Array(1 + n.length + 1 + 1 + 4);
    m[0] = 0x0c; m.set(n, 1); m[1 + n.length] = 0; m[2 + n.length] = slot;
    new DataView(m.buffer).setUint32(3 + n.length, fileCrc, true);
    return m;
  }

  function transferChunk(runningCrc, chunk) {
    const m = new Uint8Array(7 + chunk.length);
    const v = new DataView(m.buffer);
    m[0] = 0x10; v.setUint32(1, runningCrc, true); v.setUint16(5, chunk.length, true); m.set(chunk, 7);
    return m;
  }

  function deviceNotificationRequest(intervalMs) {
    const m = new Uint8Array(3);
    m[0] = 0x28; new DataView(m.buffer).setUint16(1, intervalMs, true);
    return m;
  }

  function tunnel(payload) {
    const m = new Uint8Array(3 + payload.length);
    m[0] = 0x32; new DataView(m.buffer).setUint16(1, payload.length, true); m.set(payload, 3);
    return m;
  }

  function parseInfo(msg) {
    if (msg[0] !== 0x01 || msg.length < 17) throw new Error('Onverwacht antwoord van de hub');
    const v = new DataView(msg.buffer, msg.byteOffset, msg.byteLength);
    return {
      rpc: msg[1] + '.' + msg[2] + '.' + v.getUint16(3, true),
      firmware: msg[5] + '.' + msg[6] + '.' + v.getUint16(7, true),
      maxPacketSize: v.getUint16(9, true),
      maxMessageSize: v.getUint16(11, true),
      maxChunkSize: v.getUint16(13, true),
      product: v.getUint16(15, true),
    };
  }

  function parseTunnel(msg) {
    if (msg.length < 3) return new Uint8Array(0);
    const size = new DataView(msg.buffer, msg.byteOffset, msg.byteLength).getUint16(1, true);
    return msg.subarray(3, 3 + size);
  }

  const parseConsole = (msg) => {
    let end = msg.indexOf(0, 1);
    if (end < 0) end = msg.length;
    return new TextDecoder().decode(msg.subarray(1, end));
  };

  // Lengtes (incl. id-byte) van de apparaatberichten in een DeviceNotification.
  const DEVICE_SIZES = { 0x00: 2, 0x01: 21, 0x02: 26, 0x0a: 12, 0x0b: 4, 0x0c: 9, 0x0d: 4, 0x0e: 11 };
  const PORT_NAMES = 'ABCDEF';

  function parseDeviceNotification(msg) {
    const res = { battery: null, motors: [], sensors: [] };
    if (msg.length < 3) return res;
    const size = new DataView(msg.buffer, msg.byteOffset, msg.byteLength).getUint16(1, true);
    const data = msg.subarray(3, 3 + size);
    const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let i = 0;
    while (i < data.length) {
      const id = data[i], len = DEVICE_SIZES[id];
      if (!len || i + len > data.length) break;
      const port = data[i + 1] < 6 ? PORT_NAMES[data[i + 1]] : null;
      if (id === 0x00) res.battery = data[i + 1];
      else if (port && id === 0x0a) res.motors.push(port);
      else if (port && id === 0x0b) res.sensors.push({ type: 'force', port, value: data[i + 2], pressed: data[i + 3] === 1 });
      else if (port && id === 0x0c) res.sensors.push({ type: 'color', port, color: v.getInt8(i + 2), r: v.getUint16(i + 3, true), g: v.getUint16(i + 5, true), b: v.getUint16(i + 7, true) });
      else if (port && id === 0x0d) res.sensors.push({ type: 'distance', port, mm: v.getInt16(i + 2, true) });
      i += len;
    }
    return res;
  }

  // Zet losse BLE-pakketjes weer om in complete berichten (lage en hoge prioriteit).
  class Deframer {
    constructor() { this.low = []; this.high = null; }
    push(bytes) {
      const out = [];
      const emit = (buf) => {
        if (!buf.length) return;
        try { out.push(cobsDecode(Uint8Array.from(buf, (b) => b ^ XOR))); } catch (e) { /* kapot frame overslaan */ }
      };
      for (const b of bytes) {
        if (b === HIGH) {
          if (this.high !== null) this.low = [];
          this.high = [];
        } else if (b === END) {
          if (this.high !== null) { emit(this.high); this.high = null; }
          else { emit(this.low); this.low = []; }
        } else (this.high !== null ? this.high : this.low).push(b);
      }
      return out;
    }
  }

  return { SERVICE, RX, TX, cobsEncode, cobsDecode, pack, unpack, crc, infoRequest, clearSlot, programFlow,
    startFileUpload, transferChunk, deviceNotificationRequest, tunnel, parseInfo, parseTunnel, parseConsole,
    parseDeviceNotification, Deframer };
})();
if (typeof module !== 'undefined') module.exports = Proto;
