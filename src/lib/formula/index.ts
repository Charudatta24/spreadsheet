import type { GridData, CellId } from "@/types";

// ─── Address helpers ──────────────────────────────────────────────────────────

/** "A1" → { col: 0, row: 0 } */
export function cellIdToAddress(id: CellId): { col: number; row: number } {
  const match = id.match(/^([A-Z]+)(\d+)$/);
  if (!match) throw new Error(`Invalid cell id: ${id}`);
  const col = match[1]
    .split("")
    .reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const row = parseInt(match[2], 10) - 1;
  return { col, row };
}

/** { col: 0, row: 0 } → "A1" */
export function addressToCellId(col: number, row: number): CellId {
  let colStr = "";
  let c = col + 1;
  while (c > 0) {
    const mod = (c - 1) % 26;
    colStr = String.fromCharCode(65 + mod) + colStr;
    c = Math.floor((c - 1) / 26);
  }
  return `${colStr}${row + 1}`;
}

/** Expand A1:B3 → [A1, A2, A3, B1, B2, B3] */
export function expandRange(range: string): CellId[] {
  const parts = range.split(":");
  if (parts.length !== 2) return [range as CellId];
  const start = cellIdToAddress(parts[0]);
  const end = cellIdToAddress(parts[1]);
  const cells: CellId[] = [];
  for (let c = start.col; c <= end.col; c++) {
    for (let r = start.row; r <= end.row; r++) {
      cells.push(addressToCellId(c, r));
    }
  }
  return cells;
}

// ─── Value extraction ─────────────────────────────────────────────────────────

function getNumeric(cellId: CellId, grid: GridData): number {
  const cell = grid[cellId];
  if (!cell) return 0;
  const n = parseFloat(cell.computed);
  return isNaN(n) ? 0 : n;
}

function getString(cellId: CellId, grid: GridData): string {
  const cell = grid[cellId];
  if (!cell) return "";
  return cell.computed ?? "";
}

function resolveArg(arg: string, grid: GridData): number | number[] {
  arg = arg.trim();
  if (/^[A-Z]+\d+:[A-Z]+\d+$/.test(arg)) {
    return expandRange(arg).map((id) => getNumeric(id, grid));
  }
  if (/^[A-Z]+\d+$/.test(arg)) {
    return getNumeric(arg as CellId, grid);
  }
  const n = parseFloat(arg);
  if (!isNaN(n)) return n;
  return 0;
}

function resolveStringArg(arg: string, grid: GridData): string {
  arg = arg.trim();
  if (
    (arg.startsWith('"') && arg.endsWith('"')) ||
    (arg.startsWith("'") && arg.endsWith("'"))
  ) {
    return arg.slice(1, -1);
  }
  if (/^[A-Z]+\d+$/.test(arg)) return getString(arg as CellId, grid);
  return arg;
}

function flatten(val: number | number[]): number[] {
  return Array.isArray(val) ? val : [val];
}

// ─── Built-in functions ───────────────────────────────────────────────────────
//
// Functions supported:
//   Aggregates:  SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, MEDIAN, MODE,
//                SUMIF, COUNTIF, SUMPRODUCT, PRODUCT, LARGE, SMALL
//   Math:        ABS, SQRT, SQRTPI, ROUND, ROUNDUP, ROUNDDOWN, FLOOR, CEILING,
//                INT, TRUNC, MOD, POWER, LOG, LOG10, LN, EXP, PI, RAND,
//                RANDBETWEEN, SIGN, GCD, LCM, EVEN, ODD, FACT, COMBIN, PERMUT,
//                PERCENTAGE
//   Statistics:  STDEV, STDEVP, VAR, VARP
//   Trig:        SIN, COS, TAN, ASIN, ACOS, ATAN, ATAN2, SINH, COSH, TANH,
//                DEGREES, RADIANS
//   Logic:       IF, IFS, SWITCH, AND, OR, NOT, IFERROR
//   Text:        CONCATENATE, CONCAT, LEN, UPPER, LOWER, TRIM, PROPER,
//                LEFT, RIGHT, MID, FIND, SUBSTITUTE, REPT, EXACT, TEXT, VALUE
//   Date:        TODAY, NOW, YEAR, MONTH, DAY, DATE, WEEKDAY, DATEDIF
//   Info:        ISBLANK, ISNUMBER, ISTEXT, ISERROR

type FnImpl = (args: string[], grid: GridData) => string | number;

const FUNCTIONS: Record<string, FnImpl> = {
  // ── Aggregates ────────────────────────────────────────────────────────────
  SUM: (args, grid) =>
    args.flatMap((a) => flatten(resolveArg(a, grid))).reduce((s, v) => s + v, 0),

  AVERAGE: (args, grid) => {
    const vals = args.flatMap((a) => flatten(resolveArg(a, grid)));
    return vals.length === 0 ? 0 : vals.reduce((s, v) => s + v, 0) / vals.length;
  },

  MIN: (args, grid) => {
    const vals = args.flatMap((a) => flatten(resolveArg(a, grid)));
    return vals.length === 0 ? 0 : Math.min(...vals);
  },

  MAX: (args, grid) => {
    const vals = args.flatMap((a) => flatten(resolveArg(a, grid)));
    return vals.length === 0 ? 0 : Math.max(...vals);
  },

  COUNT: (args, grid) =>
    args.flatMap((a) => flatten(resolveArg(a, grid))).filter((v) => !isNaN(v)).length,

  COUNTA: (args, grid) => {
    let count = 0;
    for (const arg of args) {
      const trimmed = arg.trim();
      if (/^[A-Z]+\d+:[A-Z]+\d+$/.test(trimmed)) {
        count += expandRange(trimmed).filter((id) => getString(id, grid) !== "").length;
      } else if (/^[A-Z]+\d+$/.test(trimmed)) {
        if (getString(trimmed as CellId, grid) !== "") count++;
      }
    }
    return count;
  },

  MEDIAN: (args, grid) => {
    const vals = args
      .flatMap((a) => flatten(resolveArg(a, grid)))
      .filter((v) => !isNaN(v))
      .sort((a, b) => a - b);
    if (vals.length === 0) return 0;
    const mid = Math.floor(vals.length / 2);
    return vals.length % 2 !== 0 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  },

  MODE: (args, grid) => {
    const vals = args.flatMap((a) => flatten(resolveArg(a, grid))).filter((v) => !isNaN(v));
    if (vals.length === 0) return "#VALUE!";
    const freq: Record<number, number> = {};
    vals.forEach((v) => { freq[v] = (freq[v] ?? 0) + 1; });
    const maxFreq = Math.max(...Object.values(freq));
    const mode = Object.keys(freq).find((k) => freq[Number(k)] === maxFreq);
    return mode !== undefined ? Number(mode) : "#VALUE!";
  },

  PRODUCT: (args, grid) =>
    args.flatMap((a) => flatten(resolveArg(a, grid))).reduce((p, v) => p * v, 1),

  SUMPRODUCT: (args, grid) => {
    if (args.length < 2) return "#VALUE!";
    const arrays = args.map((a) => flatten(resolveArg(a, grid)));
    const len = Math.min(...arrays.map((a) => a.length));
    let sum = 0;
    for (let i = 0; i < len; i++) {
      sum += arrays.reduce((product, arr) => product * (arr[i] ?? 0), 1);
    }
    return sum;
  },

  LARGE: (args, grid) => {
    const vals = flatten(resolveArg(args[0] ?? "", grid)).sort((a, b) => b - a);
    const k = (resolveArg(args[1] ?? "1", grid) as number) - 1;
    return vals[k] ?? "#NUM!";
  },

  SMALL: (args, grid) => {
    const vals = flatten(resolveArg(args[0] ?? "", grid)).sort((a, b) => a - b);
    const k = (resolveArg(args[1] ?? "1", grid) as number) - 1;
    return vals[k] ?? "#NUM!";
  },

  SUMIF: (args, grid) => {
    if (args.length < 2) return 0;
    const rangeCells = /^[A-Z]+\d+:[A-Z]+\d+$/.test(args[0].trim())
      ? expandRange(args[0].trim())
      : [args[0].trim() as CellId];
    const criteria = resolveStringArg(args[1], grid);
    const sumCells = args[2]
      ? /^[A-Z]+\d+:[A-Z]+\d+$/.test(args[2].trim())
        ? expandRange(args[2].trim())
        : [args[2].trim() as CellId]
      : rangeCells;
    let total = 0;
    rangeCells.forEach((id, i) => {
      const val = getString(id, grid);
      const num = getNumeric(id, grid);
      const matches =
        criteria.startsWith(">=") ? num >= parseFloat(criteria.slice(2)) :
        criteria.startsWith("<=") ? num <= parseFloat(criteria.slice(2)) :
        criteria.startsWith("<>") ? String(num) !== criteria.slice(2) :
        criteria.startsWith(">")  ? num > parseFloat(criteria.slice(1)) :
        criteria.startsWith("<")  ? num < parseFloat(criteria.slice(1)) :
        val === criteria || num === parseFloat(criteria);
      if (matches) total += getNumeric(sumCells[i] ?? id, grid);
    });
    return total;
  },

  COUNTIF: (args, grid) => {
    if (args.length < 2) return 0;
    const rangeCells = /^[A-Z]+\d+:[A-Z]+\d+$/.test(args[0].trim())
      ? expandRange(args[0].trim())
      : [args[0].trim() as CellId];
    const criteria = resolveStringArg(args[1], grid);
    return rangeCells.filter((id) => {
      const val = getString(id, grid);
      const num = getNumeric(id, grid);
      return criteria.startsWith(">=") ? num >= parseFloat(criteria.slice(2)) :
             criteria.startsWith("<=") ? num <= parseFloat(criteria.slice(2)) :
             criteria.startsWith("<>") ? String(num) !== criteria.slice(2) :
             criteria.startsWith(">")  ? num > parseFloat(criteria.slice(1)) :
             criteria.startsWith("<")  ? num < parseFloat(criteria.slice(1)) :
             val === criteria || num === parseFloat(criteria);
    }).length;
  },

  // ── Math ──────────────────────────────────────────────────────────────────
  ABS: (args, grid) => Math.abs(resolveArg(args[0] ?? "0", grid) as number),

  SQRT: (args, grid) => {
    const n = resolveArg(args[0] ?? "0", grid) as number;
    if (n < 0) return "#NUM!";
    return Math.sqrt(n);
  },

  SQRTPI: (args, grid) => {
    const n = resolveArg(args[0] ?? "0", grid) as number;
    if (n < 0) return "#NUM!";
    return Math.sqrt(n * Math.PI);
  },

  ROUND: (args, grid) => {
    const val    = resolveArg(args[0] ?? "0", grid) as number;
    const places = args[1] ? (resolveArg(args[1], grid) as number) : 0;
    return Math.round(val * Math.pow(10, places)) / Math.pow(10, places);
  },

  ROUNDUP: (args, grid) => {
    const val    = resolveArg(args[0] ?? "0", grid) as number;
    const places = args[1] ? (resolveArg(args[1], grid) as number) : 0;
    const factor = Math.pow(10, places);
    return Math.ceil(val * factor) / factor;
  },

  ROUNDDOWN: (args, grid) => {
    const val    = resolveArg(args[0] ?? "0", grid) as number;
    const places = args[1] ? (resolveArg(args[1], grid) as number) : 0;
    const factor = Math.pow(10, places);
    return Math.floor(val * factor) / factor;
  },

  FLOOR: (args, grid) => {
    const val  = resolveArg(args[0] ?? "0", grid) as number;
    const step = args[1] ? (resolveArg(args[1], grid) as number) : 1;
    return step === 0 ? "#DIV/0!" : Math.floor(val / step) * step;
  },

  CEILING: (args, grid) => {
    const val  = resolveArg(args[0] ?? "0", grid) as number;
    const step = args[1] ? (resolveArg(args[1], grid) as number) : 1;
    return step === 0 ? "#DIV/0!" : Math.ceil(val / step) * step;
  },

  INT:   (args, grid) => Math.floor(resolveArg(args[0] ?? "0", grid) as number),

  TRUNC: (args, grid) => {
    const val    = resolveArg(args[0] ?? "0", grid) as number;
    const places = args[1] ? (resolveArg(args[1], grid) as number) : 0;
    const factor = Math.pow(10, places);
    return Math.trunc(val * factor) / factor;
  },

  MOD: (args, grid) => {
    const a = resolveArg(args[0] ?? "0", grid) as number;
    const b = resolveArg(args[1] ?? "1", grid) as number;
    if (b === 0) return "#DIV/0!";
    return ((a % b) + b) % b; // always positive, matching Excel
  },

  POWER: (args, grid) => {
    const base = resolveArg(args[0] ?? "0", grid) as number;
    const exp  = resolveArg(args[1] ?? "1", grid) as number;
    return Math.pow(base, exp);
  },

  LOG: (args, grid) => {
    const val  = resolveArg(args[0] ?? "1", grid) as number;
    const base = args[1] ? (resolveArg(args[1], grid) as number) : 10;
    if (val <= 0) return "#NUM!";
    return Math.log(val) / Math.log(base);
  },

  LOG10: (args, grid) => {
    const val = resolveArg(args[0] ?? "1", grid) as number;
    if (val <= 0) return "#NUM!";
    return Math.log10(val);
  },

  LN: (args, grid) => {
    const val = resolveArg(args[0] ?? "1", grid) as number;
    if (val <= 0) return "#NUM!";
    return Math.log(val);
  },

  EXP:  (args, grid) => Math.exp(resolveArg(args[0] ?? "0", grid) as number),
  PI:   () => Math.PI,
  RAND: () => Math.random(),

  RANDBETWEEN: (args, grid) => {
    const low  = resolveArg(args[0] ?? "0", grid) as number;
    const high = resolveArg(args[1] ?? "1", grid) as number;
    return Math.floor(Math.random() * (high - low + 1)) + low;
  },

  SIGN: (args, grid) => Math.sign(resolveArg(args[0] ?? "0", grid) as number),

  GCD: (args, grid) => {
    function gcd(a: number, b: number): number { return b === 0 ? Math.abs(a) : gcd(b, a % b); }
    const nums = args.flatMap((a) => flatten(resolveArg(a, grid))).map(Math.round);
    if (nums.length === 0) return "#VALUE!";
    return nums.reduce(gcd);
  },

  LCM: (args, grid) => {
    function gcd(a: number, b: number): number { return b === 0 ? Math.abs(a) : gcd(b, a % b); }
    function lcm(a: number, b: number): number { return Math.abs(a * b) / gcd(a, b); }
    const nums = args.flatMap((a) => flatten(resolveArg(a, grid))).map(Math.round);
    if (nums.length === 0) return "#VALUE!";
    return nums.reduce(lcm);
  },

  EVEN: (args, grid) => {
    const n = resolveArg(args[0] ?? "0", grid) as number;
    return n >= 0 ? Math.ceil(n / 2) * 2 : Math.floor(n / 2) * 2;
  },

  ODD: (args, grid) => {
    const n = resolveArg(args[0] ?? "0", grid) as number;
    const rounded = Math.ceil(Math.abs(n));
    const odd = rounded % 2 === 0 ? rounded + 1 : rounded;
    return n >= 0 ? odd : -odd;
  },

  FACT: (args, grid) => {
    const n = Math.round(resolveArg(args[0] ?? "0", grid) as number);
    if (n < 0 || n > 170) return "#NUM!";
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
  },

  COMBIN: (args, grid) => {
    const n = Math.round(resolveArg(args[0] ?? "0", grid) as number);
    const k = Math.round(resolveArg(args[1] ?? "0", grid) as number);
    if (k > n || n < 0 || k < 0) return "#NUM!";
    let result = 1;
    for (let i = 0; i < k; i++) result = result * (n - i) / (i + 1);
    return Math.round(result);
  },

  PERMUT: (args, grid) => {
    const n = Math.round(resolveArg(args[0] ?? "0", grid) as number);
    const k = Math.round(resolveArg(args[1] ?? "0", grid) as number);
    if (k > n || n < 0 || k < 0) return "#NUM!";
    let result = 1;
    for (let i = 0; i < k; i++) result *= (n - i);
    return result;
  },

  PERCENTAGE: (args, grid) => {
    // PERCENTAGE(value, total) → value/total * 100
    const value = resolveArg(args[0] ?? "0", grid) as number;
    const total = resolveArg(args[1] ?? "0", grid) as number;
    if (total === 0) return "#DIV/0!";
    return (value / total) * 100;
  },

  // ── Statistics ────────────────────────────────────────────────────────────
  STDEV: (args, grid) => {
    const vals = args.flatMap((a) => flatten(resolveArg(a, grid))).filter((v) => !isNaN(v));
    if (vals.length < 2) return "#VALUE!";
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length - 1);
    return Math.sqrt(variance);
  },

  STDEVP: (args, grid) => {
    const vals = args.flatMap((a) => flatten(resolveArg(a, grid))).filter((v) => !isNaN(v));
    if (vals.length === 0) return "#VALUE!";
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    return Math.sqrt(variance);
  },

  VAR: (args, grid) => {
    const vals = args.flatMap((a) => flatten(resolveArg(a, grid))).filter((v) => !isNaN(v));
    if (vals.length < 2) return "#VALUE!";
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    return vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length - 1);
  },

  VARP: (args, grid) => {
    const vals = args.flatMap((a) => flatten(resolveArg(a, grid))).filter((v) => !isNaN(v));
    if (vals.length === 0) return "#VALUE!";
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    return vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
  },

  // ── Trig ──────────────────────────────────────────────────────────────────
  SIN:     (args, grid) => Math.sin(resolveArg(args[0]  ?? "0", grid) as number),
  COS:     (args, grid) => Math.cos(resolveArg(args[0]  ?? "0", grid) as number),
  TAN:     (args, grid) => Math.tan(resolveArg(args[0]  ?? "0", grid) as number),
  ASIN:    (args, grid) => Math.asin(resolveArg(args[0] ?? "0", grid) as number),
  ACOS:    (args, grid) => Math.acos(resolveArg(args[0] ?? "0", grid) as number),
  ATAN:    (args, grid) => Math.atan(resolveArg(args[0] ?? "0", grid) as number),
  ATAN2:   (args, grid) => Math.atan2(resolveArg(args[0] ?? "0", grid) as number, resolveArg(args[1] ?? "0", grid) as number),
  SINH:    (args, grid) => Math.sinh(resolveArg(args[0] ?? "0", grid) as number),
  COSH:    (args, grid) => Math.cosh(resolveArg(args[0] ?? "0", grid) as number),
  TANH:    (args, grid) => Math.tanh(resolveArg(args[0] ?? "0", grid) as number),
  DEGREES: (args, grid) => ((resolveArg(args[0] ?? "0", grid) as number) * 180) / Math.PI,
  RADIANS: (args, grid) => ((resolveArg(args[0] ?? "0", grid) as number) * Math.PI) / 180,

  // ── Logic ─────────────────────────────────────────────────────────────────
  IF: (args, grid) => {
    if (args.length < 2) return 0;
    const condRaw = evaluateFormula("=" + args[0], grid);
    const cond = condRaw !== "0" && condRaw !== "" && condRaw !== "FALSE";
    const branch = cond ? args[1] : (args[2] ?? "");
    if (!branch) return "";
    if (/^[A-Z]+\d+$/.test(branch.trim())) return getString(branch.trim() as CellId, grid);
    const n = parseFloat(branch.trim());
    if (!isNaN(n)) return n;
    return resolveStringArg(branch, grid);
  },

  IFS: (args, grid) => {
    for (let i = 0; i < args.length - 1; i += 2) {
      const condRaw = evaluateFormula("=" + args[i], grid);
      const cond = condRaw !== "0" && condRaw !== "" && condRaw !== "FALSE";
      if (cond) {
        const branch = args[i + 1] ?? "";
        if (/^[A-Z]+\d+$/.test(branch.trim())) return getString(branch.trim() as CellId, grid);
        const n = parseFloat(branch.trim());
        if (!isNaN(n)) return n;
        return resolveStringArg(branch, grid);
      }
    }
    return "#N/A";
  },

  SWITCH: (args, grid) => {
    // SWITCH(expr, val1, result1, val2, result2, ..., [default])
    if (args.length < 3) return "#VALUE!";
    const expr = resolveStringArg(args[0], grid);
    for (let i = 1; i < args.length - 1; i += 2) {
      if (resolveStringArg(args[i], grid) === expr) {
        return resolveStringArg(args[i + 1], grid);
      }
    }
    if (args.length % 2 === 0) return resolveStringArg(args[args.length - 1], grid);
    return "#N/A";
  },

  AND: (args, grid) => {
    const results = args.map((a) => {
      const v = evaluateFormula("=" + a, grid);
      return v !== "0" && v !== "" && v !== "FALSE";
    });
    return results.every(Boolean) ? 1 : 0;
  },

  OR: (args, grid) => {
    const results = args.map((a) => {
      const v = evaluateFormula("=" + a, grid);
      return v !== "0" && v !== "" && v !== "FALSE";
    });
    return results.some(Boolean) ? 1 : 0;
  },

  NOT: (args, grid) => {
    const v = evaluateFormula("=" + (args[0] ?? "0"), grid);
    return v === "0" || v === "" || v === "FALSE" ? 1 : 0;
  },

  IFERROR: (args, grid) => {
    try {
      const result = evaluateFormula("=" + (args[0] ?? ""), grid);
      if (result.startsWith("#")) return resolveStringArg(args[1] ?? "", grid);
      return result;
    } catch {
      return resolveStringArg(args[1] ?? "", grid);
    }
  },

  // ── Text ──────────────────────────────────────────────────────────────────
  CONCATENATE: (args, grid) => args.map((a) => resolveStringArg(a, grid)).join(""),
  CONCAT:      (args, grid) => args.map((a) => resolveStringArg(a, grid)).join(""),

  LEN:   (args, grid) => resolveStringArg(args[0] ?? "", grid).length,
  UPPER: (args, grid) => resolveStringArg(args[0] ?? "", grid).toUpperCase(),
  LOWER: (args, grid) => resolveStringArg(args[0] ?? "", grid).toLowerCase(),
  TRIM:  (args, grid) => resolveStringArg(args[0] ?? "", grid).trim(),

  PROPER: (args, grid) => {
    const str = resolveStringArg(args[0] ?? "", grid);
    return str.toLowerCase().replace(/(?:^|\s)\S/g, (ch) => ch.toUpperCase());
  },

  LEFT: (args, grid) => {
    const str = resolveStringArg(args[0] ?? "", grid);
    const n = args[1] ? (resolveArg(args[1], grid) as number) : 1;
    return str.slice(0, n);
  },

  RIGHT: (args, grid) => {
    const str = resolveStringArg(args[0] ?? "", grid);
    const n = args[1] ? (resolveArg(args[1], grid) as number) : 1;
    return str.slice(-n);
  },

  MID: (args, grid) => {
    const str   = resolveStringArg(args[0] ?? "", grid);
    const start = args[1] ? (resolveArg(args[1], grid) as number) - 1 : 0;
    const len   = args[2] ? (resolveArg(args[2], grid) as number) : str.length;
    return str.slice(start, start + len);
  },

  FIND: (args, grid) => {
    const needle   = resolveStringArg(args[0] ?? "", grid);
    const haystack = resolveStringArg(args[1] ?? "", grid);
    const start    = args[2] ? (resolveArg(args[2], grid) as number) - 1 : 0;
    const idx = haystack.indexOf(needle, start);
    return idx === -1 ? "#VALUE!" : idx + 1;
  },

  SUBSTITUTE: (args, grid) => {
    const str     = resolveStringArg(args[0] ?? "", grid);
    const find    = resolveStringArg(args[1] ?? "", grid);
    const replace = resolveStringArg(args[2] ?? "", grid);
    return str.split(find).join(replace);
  },

  REPT: (args, grid) => {
    const str   = resolveStringArg(args[0] ?? "", grid);
    const times = Math.max(0, Math.round(resolveArg(args[1] ?? "0", grid) as number));
    return str.repeat(times);
  },

  EXACT: (args, grid) => {
    const a = resolveStringArg(args[0] ?? "", grid);
    const b = resolveStringArg(args[1] ?? "", grid);
    return a === b ? "TRUE" : "FALSE";
  },

  TEXT: (args, grid) => {
    const val = resolveArg(args[0] ?? "0", grid) as number;
    const fmt = resolveStringArg(args[1] ?? "", grid);
    if (fmt.includes("%")) return (val * 100).toFixed(0) + "%";
    const decimals = (fmt.match(/\.0+/) ?? [""])[0].length - 1;
    return decimals > 0 ? val.toFixed(decimals) : val.toString();
  },

  VALUE: (args, grid) => {
    const str = resolveStringArg(args[0] ?? "", grid).replace(/,/g, "");
    const n = parseFloat(str);
    return isNaN(n) ? "#VALUE!" : n;
  },

  // ── Date ──────────────────────────────────────────────────────────────────
  TODAY: () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },

  NOW: () => new Date().toLocaleString(),

  YEAR: (args, grid) => {
    const val = resolveArg(args[0] ?? "0", grid) as number;
    if (val > 1000) return new Date(val).getFullYear();
    return new Date().getFullYear();
  },

  MONTH: (args, grid) => {
    const val = resolveArg(args[0] ?? "0", grid) as number;
    if (val > 1000) return new Date(val).getMonth() + 1;
    return new Date().getMonth() + 1;
  },

  DAY: (args, grid) => {
    const val = resolveArg(args[0] ?? "0", grid) as number;
    if (val > 1000) return new Date(val).getDate();
    return new Date().getDate();
  },

  DATE: (args, grid) => {
    const year  = resolveArg(args[0] ?? "0", grid) as number;
    const month = resolveArg(args[1] ?? "1", grid) as number;
    const day   = resolveArg(args[2] ?? "1", grid) as number;
    const d = new Date(year, month - 1, day);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },

  WEEKDAY: (args, grid) => {
    const val = resolveArg(args[0] ?? "0", grid) as number;
    const d = val > 1000 ? new Date(val) : new Date();
    return d.getDay() + 1; // 1=Sun … 7=Sat (Excel default)
  },

  DATEDIF: (args, grid) => {
    // DATEDIF(start, end, "D"/"M"/"Y")
    const startStr = resolveStringArg(args[0] ?? "", grid);
    const endStr   = resolveStringArg(args[1] ?? "", grid);
    const unit     = resolveStringArg(args[2] ?? "D", grid).toUpperCase();
    const start = new Date(startStr);
    const end   = new Date(endStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return "#VALUE!";
    if (unit === "D") return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
    if (unit === "M") return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (unit === "Y") return end.getFullYear() - start.getFullYear();
    return "#VALUE!";
  },

  // ── Info ──────────────────────────────────────────────────────────────────
  ISBLANK: (args, grid) => {
    const val = resolveStringArg(args[0] ?? "", grid);
    return val === "" ? 1 : 0;
  },

  ISNUMBER: (args, grid) => {
    const val = resolveArg(args[0] ?? "", grid);
    return typeof val === "number" && !isNaN(val as number) ? 1 : 0;
  },

  ISTEXT: (args, grid) => {
    const str = resolveStringArg(args[0] ?? "", grid);
    return isNaN(parseFloat(str)) && str !== "" ? 1 : 0;
  },

  ISERROR: (args, grid) => {
    const result = evaluateFormula("=" + (args[0] ?? ""), grid);
    return result.startsWith("#") ? 1 : 0;
  },
};

// ─── Expression evaluator ─────────────────────────────────────────────────────

function evalExpression(expr: string, grid: GridData): number {
  const resolved = expr.replace(/\b([A-Z]+\d+)\b/g, (match) =>
    getNumeric(match as CellId, grid).toString()
  );
  const withPow = resolved.replace(/\^/g, "**");
  if (!/^[\d\s\+\-\*\/\.\(\)%eE]+$/.test(withPow)) return NaN;
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${withPow})`)();
    return typeof result === "number" ? result : NaN;
  } catch {
    return NaN;
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function evaluateFormula(raw: string, grid: GridData): string {
  if (!raw.startsWith("=")) return raw;

  const expr = raw.slice(1).trim().toUpperCase();

  const fnMatch = expr.match(/^([A-Z][A-Z0-9]*)\s*\((.*)?\)$/s);
  if (fnMatch) {
    const fnName  = fnMatch[1];
    const argsRaw = fnMatch[2] ?? "";
    const args    = splitArgs(argsRaw);
    const fn = FUNCTIONS[fnName];
    if (fn) {
      try {
        const result = fn(args, grid);
        if (typeof result === "string") return result;
        return formatNumber(result);
      } catch {
        return "#ERROR!";
      }
    }
    return `#NAME? (${fnName})`;
  }

  // Comparison operators
  const compMatch = expr.match(/^(.+?)(>=|<=|<>|>|<|=)(.+)$/);
  if (compMatch) {
    const left  = evalExpression(compMatch[1].trim(), grid);
    const right = evalExpression(compMatch[3].trim(), grid);
    const op = compMatch[2];
    if (!isNaN(left) && !isNaN(right)) {
      const result =
        op === ">"  ? left > right  :
        op === "<"  ? left < right  :
        op === ">=" ? left >= right :
        op === "<=" ? left <= right :
        op === "<>" ? left !== right :
        left === right;
      return result ? "TRUE" : "FALSE";
    }
  }

  const result = evalExpression(expr, grid);
  if (isNaN(result)) return "#VALUE!";
  return formatNumber(result);
}

function splitArgs(raw: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of raw) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

function formatNumber(n: number): string {
  if (!isFinite(n)) return n > 0 ? "#DIV/0!" : "#NUM!";
  if (Number.isInteger(n)) return n.toString();
  return parseFloat(n.toFixed(10)).toString();
}

// ─── Re-evaluation of entire grid ────────────────────────────────────────────

export function recomputeGrid(grid: GridData): GridData {
  const next = { ...grid };

  for (const [id, cell] of Object.entries(next)) {
    if (!cell.raw.startsWith("=")) {
      next[id] = { ...cell, computed: cell.raw };
    }
  }

  for (let pass = 0; pass < 10; pass++) {
    let changed = false;
    for (const [id, cell] of Object.entries(next)) {
      if (!cell.raw.startsWith("=")) continue;
      const newComputed = evaluateFormula(cell.raw, next);
      if (newComputed !== next[id].computed) {
        next[id] = { ...cell, computed: newComputed };
        changed = true;
      }
    }
    if (!changed) break;
  }

  return next;
}