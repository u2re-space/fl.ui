/**
 * FIND:hex-editor
 * INVARIANT: disk gets bytes; letter case is display-only.
 * INVARIANT: HEX and Latin1 use the same row and cell width so scroll stays 1:1.
 * COMPAT: Android WebView often lacks Uint8Array.fromHex — use the loop fallback.
 * PERF: encode HEX/Latin1 in slices — the host yields between chunks.
 */

const HEX_CHARS = /[^0-9a-fA-F]/g;

export const compactHexDigits = (raw: string): string => String(raw ?? "").replace(HEX_CHARS, "");

export const sanitizeHexDraft = (raw: string): string => String(raw ?? "").replace(/[^0-9a-fA-F\s]/g, "");

export const padOddNibble = (compact: string): string =>
    compact.length % 2 === 1 ? `${compact}0` : compact;

export const formatHexPairs = (compact: string): string => {
    const digits = compactHexDigits(compact).toUpperCase();
    const parts: string[] = [];
    for (let i = 0; i < digits.length; i += 2) {
        parts.push(digits.length === i + 1 ? digits[i] : digits.slice(i, i + 2));
    }
    return parts.join(" ");
};

/** WHY: one HEX row = one Latin1 row — same line count, same scroll. */
export const HEX_ROW_BYTES = 16;
/** WHY: `AA ` and one Latin1 glyph + pad share 3ch so scrollLeft is a mirror. */
export const HEX_CELL_CHARS = 3;

const padHexPair = (pair: string): string => (pair.length >= HEX_CELL_CHARS ? pair : pair.padEnd(HEX_CELL_CHARS, " "));

export const formatHexRows = (compact: string, width = HEX_ROW_BYTES): string => {
    const pairs = formatHexPairs(compact);
    if (!pairs || width <= 0) return pairs;
    const parts = pairs.split(" ");
    const lines: string[] = [];
    for (let i = 0; i < parts.length; i += width) {
        lines.push(parts.slice(i, i + width).map(padHexPair).join(""));
    }
    return lines.join("\n");
};

/** Map a byte index onto the Latin1/HEX row string (cells + row newlines). */
export const byteToRowDisplayIndex = (byte: number): number => {
    const n = Math.max(0, byte);
    return n * HEX_CELL_CHARS + Math.floor(n / HEX_ROW_BYTES);
};

export const countHexDigitsBefore = (text: string, index: number): number =>
    compactHexDigits(text.slice(0, Math.max(0, index))).length;

/** Map a hex-pairs caret/selection to Latin1 byte offsets (one char per byte). */
export const hexSelectionToByteRange = (
    formatted: string,
    start: number,
    end: number
): { from: number; to: number } => {
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    const a = countHexDigitsBefore(formatted, lo);
    const b = countHexDigitsBefore(formatted, hi);
    return { from: Math.floor(a / 2), to: Math.ceil(b / 2) };
};

export const caretFromDigitIndex = (formatted: string, digitIndex: number): number => {
    if (digitIndex <= 0) return 0;
    let seen = 0;
    for (let i = 0; i < formatted.length; i++) {
        if (/[0-9A-Fa-f]/.test(formatted[i])) {
            seen += 1;
            if (seen >= digitIndex) return i + 1;
        }
    }
    return formatted.length;
};

/** PERF: first screen paints this many bytes before yielding. */
export const HEX_PAINT_FIRST_BYTES = 4 * 1024;
/** PERF: later HEX/raw slices — keep under one frame on Capacitor. */
export const HEX_PAINT_CHUNK_BYTES = 16 * 1024;
/** PERF: at or below this, paint HEX/raw in one turn (no idle split). */
export const HEX_PAINT_SYNC_MAX_BYTES = 16 * 1024;

const HEX = "0123456789ABCDEF";

export const bytesToHexPairsSlice = (bytes: Uint8Array, start: number, end: number): string => {
    const lo = Math.max(0, start | 0);
    const hi = Math.min(bytes.length, end | 0);
    const n = hi - lo;
    if (n <= 0) return "";
    const parts = new Array<string>(n);
    for (let i = 0; i < n; i++) {
        const b = bytes[lo + i];
        parts[i] = HEX[(b >> 4) & 15] + HEX[b & 15];
    }
    return parts.join(" ");
};

export const bytesToHexPairs = (bytes: Uint8Array): string => bytesToHexPairsSlice(bytes, 0, bytes.length);

export const bytesToHexRowsSlice = (
    bytes: Uint8Array,
    start: number,
    end: number,
    width = HEX_ROW_BYTES
): string => {
    const lo = Math.max(0, start | 0);
    const hi = Math.min(bytes.length, end | 0);
    if (hi <= lo) return "";
    const lines: string[] = [];
    let parts: string[] = [];
    for (let i = lo; i < hi; i++) {
        const b = bytes[i];
        parts.push(HEX[(b >> 4) & 15] + HEX[b & 15] + " ");
        if (parts.length === width) {
            lines.push(parts.join(""));
            parts = [];
        }
    }
    if (parts.length) lines.push(parts.join(""));
    return lines.join("\n");
};

export const bytesToCompactHex = (bytes: Uint8Array): string => {
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
        out += bytes[i].toString(16).padStart(2, "0");
    }
    return out;
};

const bytesFromHexFallback = (compact: string): Uint8Array => {
    const hex = padOddNibble(compactHexDigits(compact));
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
};

export const bytesToLatin1Slice = (bytes: Uint8Array, start: number, end: number): string => {
    const lo = Math.max(0, start | 0);
    const hi = Math.min(bytes.length, end | 0);
    if (hi <= lo) return "";
    const slice = lo === 0 && hi === bytes.length ? bytes : bytes.subarray(lo, hi);
    if (typeof TextDecoder !== "undefined") {
        try {
            return new TextDecoder("latin1").decode(slice);
        } catch {
            /* COMPAT: some WebViews reject latin1 — fall through */
        }
    }
    const parts: string[] = [];
    const step = 4096;
    for (let i = 0; i < slice.length; i += step) {
        const last = Math.min(i + step, slice.length);
        let chunk = "";
        for (let j = i; j < last; j++) chunk += String.fromCharCode(slice[j]);
        parts.push(chunk);
    }
    return parts.join("");
};

export const bytesToLatin1 = (bytes: Uint8Array): string => bytesToLatin1Slice(bytes, 0, bytes.length);

/** WHY: CR/LF/TAB in the file would insert extra Latin1 lines and desync HEX rows. */
const latin1Cell = (b: number): string =>
    b >= 0x09 && b <= 0x0d ? "·" : String.fromCharCode(b);

export const bytesToLatin1RowsSlice = (
    bytes: Uint8Array,
    start: number,
    end: number,
    width = HEX_ROW_BYTES
): string => {
    const lo = Math.max(0, start | 0);
    const hi = Math.min(bytes.length, end | 0);
    if (hi <= lo) return "";
    const lines: string[] = [];
    let row = "";
    let cells = 0;
    for (let i = lo; i < hi; i++) {
        row += `${latin1Cell(bytes[i])}  `;
        cells += 1;
        if (cells === width) {
            lines.push(row);
            row = "";
            cells = 0;
        }
    }
    if (row.length) lines.push(row);
    return lines.join("\n");
};

/** WHY: HEX of UTF-8 кириллица must return to raw as UTF-8, not Latin1 mojibake. */
export const bytesAreUtf8Text = (bytes: Uint8Array): boolean => {
    if (!bytes.length) return true;
    for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 0) return false;
    }
    try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return true;
    } catch {
        return false;
    }
};

export const latin1ToBytes = (text: string): Uint8Array => {
    const raw = String(text ?? "");
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i) & 0xff;
    return out;
};

export const bytesFromHex = (raw: string): Uint8Array => {
    const hex = padOddNibble(compactHexDigits(raw));
    const fromHex = (Uint8Array as unknown as { fromHex?: (s: string) => Uint8Array }).fromHex;
    if (typeof fromHex === "function") {
        try {
            return fromHex.call(Uint8Array, hex);
        } catch {
            /* COMPAT: fromHex rejects some engines' empty/odd input */
        }
    }
    return bytesFromHexFallback(hex);
};
