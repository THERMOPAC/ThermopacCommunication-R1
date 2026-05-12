// SAP B1 ItemName shortening algorithm
// Guarantees output ≤ 100 chars without blind truncation.
//
// Phase 1a – Pre-process: regex-based multi-token merges and seat-label fixes.
// Phase 1b – Abbreviation map: known long forms → short, unambiguous forms.
// Phase 2  – Token dropping: drop lowest-priority tokens (comma-separated)
//            iteratively until ≤ 100 chars.  Token[0] (type name) never dropped.
// Phase 3  – Safety net: drop from tail if Phase 2 exhausted all patterns.

export const SAP_ITEM_NAME_LIMIT = 100;

type ReplaceFn = (match: string, ...groups: string[]) => string;

// ── Phase 1a: Pre-processors ──────────────────────────────────────────────────
// Applied in order via s.replace(regex, repl).
const PRE_PROCESS: [RegExp, string | ReplaceFn][] = [
  // NRV: "Metal Seat (SS316) Seat" → "SS316 Seat"  (double-suffix bug in options)
  [/\bMetal Seat \(([^)]+)\) Seat\b/g, "$1 Seat"],
  [/\bSoft Seat \(([^)]+)\) Seat\b/g,  "$1 Seat"],
  // Control/isolation butterfly CV: "Metal (SS316) Seat" → "SS316 Seat"
  [/\bMetal \(([^)]+)\) Seat\b/g, "$1 Seat"],

  // Pump Skid: "Complete with A, B, C" → "w/ A+B" (prevent comma splitting)
  [
    /Complete with ((?:[^,]+)(?:,\s*[^,]+)*)/g,
    (_m: string, rest: string) =>
      `w/ ${rest.split(/,\s*/).slice(0, 2).join("+")}`,
  ],

  // Dosing Pump: "Dosing Pump, Diaphragm Pump, X Diaphragm" → "X Diaphragm Dosing Pump"
  [
    /^Dosing Pump, Diaphragm Pump, (.+?) Diaphragm(?=,|$)/,
    (_m: string, mat: string) => `${mat} Diaphragm Dosing Pump`,
  ],

  // Multistage Pump type mergers (saves 19-21 chars)
  [/^Multistage Pump, Horizontal Multistage(?=,|$)/, "H-Multistage Pump"],
  [/^Multistage Pump, Vertical Multistage(?=,|$)/,   "V-Multistage Pump"],
  [/^Multistage Pump, Ring Section(?=,|$)/,           "Ring Section Pump"],
  [/^Multistage Pump, Barrel Type(?=,|$)/,            "Barrel Type Pump"],

  // Centrifugal Pump type mergers (saves 7-13 chars each)
  [/^Centrifugal Pump, Vertical Turbine(?=,|$)/,  "Vert. Turbine Pump"],
  [/^Centrifugal Pump, Vertical Inline(?=,|$)/,   "Vert. Inline Pump"],
  [/^Centrifugal Pump, End Suction(?=,|$)/,       "Centrifugal End Suction"],
  [/^Centrifugal Pump, Split Case(?=,|$)/,        "Centrifugal Split Case"],
  [/^Centrifugal Pump, Multistage(?=,|$)/,        "Centrifugal Multistage"],
];

// ── Phase 1b: Abbreviation map ────────────────────────────────────────────────
// Literal string → literal string substitutions; applied via split/join.
// Ordered so longer (more specific) forms come before shorter overlapping ones.
const ABBR: [string, string][] = [
  // End connections
  ["Double Ferrule (Swagelok / Ham-Let Type)", "Dbl Ferrule"],
  ["Single Ferrule (Parker Type)",             "Sgl Ferrule"],
  ["NPT (F) - Female Threaded",               "FNPT"],
  ["NPT (M) - Male Threaded",                 "MNPT"],
  ["SW (Socket Weld)",                         "Socket Weld"],
  ["BW (Butt Weld)",                           "Butt Weld"],
  ["Flanged (ASME B16.5)",                     "Flanged"],

  // Fail actions
  ["Fail Close (FC)", "FC"],
  ["Fail Open (FO)",  "FO"],
  ["Fail Last (FL)",  "FL"],

  // Actuator types
  ["Pneumatic Diaphragm", "Pneu. Diaphragm"],
  ["Pneumatic Actuator",  "Pneu. Act."],
  ["Pneumatic Piston",    "Pneu. Piston"],
  ["Hydraulic Actuator",  "Hyd. Act."],
  ["Electric Actuator",   "Elec. Act."],
  ["Manual Handwheel",    "Handwheel"],
  ["Manual Gear",         "Gear Op."],

  // Seal types
  ["Single Mechanical Seal",        "Sngl Mech Seal"],
  ["Double Mechanical Seal",        "Dbl Mech Seal"],
  ["Cartridge Seal (Back-to-Back)", "Cart. B2B Seal"],
  ["Liquid Ring (Integral)",        "LR (Integral)"],
  ["Dry Running Seal",              "Dry Seal"],

  // Body materials — suffixed " Body" form first
  ["LCB (Low Temp CS) Body",  "LCB Body"],
  ["CI (Cast Iron) Body",     "CI Body"],
  ["WCB (CS) Body",           "WCB Body"],
  ["CS (WCB) Body",           "WCB Body"],
  ["Duplex SS Body",          "DSS Body"],
  ["Hastelloy C-276 Body",    "HC-276 Body"],
  ["Hastelloy C Body",        "HC Body"],

  // Standalone material names (material_class field)
  ["CI (Cast Iron)",    "CI"],
  ["LCB (Low Temp CS)", "LCB"],
  ["WCB (CS)",          "WCB"],

  // Pressure ratings
  ["Class 2500", "Cl.2500"],
  ["Class 1500", "Cl.1500"],
  ["Class 900",  "Cl.900"],
  ["Class 600",  "Cl.600"],
  ["Class 300",  "Cl.300"],
  ["Class 150",  "Cl.150"],

  // Valve type-specific tokens
  ["OS&Y (Rising Stem)",              "OS&Y"],
  ["Non-Lubricated (Sleeved)",        "Non-Lub"],
  ["Characterized Plug",              "Char. Plug"],
  ["Segmented Ball",                  "Seg. Ball"],
  ["Triple Offset (High Performance)","Triple Offset"],
  ["Back Pull-Out (BPO)",             "BPO"],
  ["Double Suction Impeller",         "DS Impeller"],
  ["Single Suction Impeller",         "SS Impeller"],

  // Flow characteristics
  ["Equal Percentage",  "Eq. %"],
  ["Inherent Equal %",  "Eq. %"],
  ["Quick Opening",     "QO"],

  // Design standards
  ["ASME Section VIII", "ASME Sec.VIII"],

  // Vacuum / booster gas types and services
  ["Hydrocarbon Vapors Service",       "HC Vapors Service"],
  ["Steam\u2013Air Mixture Service",   "Steam-Air Svc"],
  ["Steam-Air Mixture Service",        "Steam-Air Svc"],
  ["Hydrocarbon Gas Service",          "HC Gas Service"],
  ["Hydrocarbon Service",              "HC Service"],
  ["1000 mbar (Atmospheric)",          "1000 mbar"],

  // Dosing pump diaphragm designs
  ["Single PTFE Diaphragm", "PTFE Diaphragm"],
  ["Double PTFE Diaphragm", "Dbl PTFE Diaphragm"],

  // Pump skid drivers
  ["Diesel Engine",   "Diesel Eng."],

  // Screw pump type
  ["Progressive Cavity", "Prog. Cavity"],
];

// ── Phase 2: Drop-priority list ───────────────────────────────────────────────
// Tokens matching these regexes are candidates for removal (in order).
// The loop drops one matching token per pattern, then checks the length.
// index 0 (type name) is never dropped.
const DROP_PRIORITY: RegExp[] = [
  // T1 – Design standards (least useful in an item name)
  /^(API |ASME B16|ASME Sec|BS |EN |IS \d|ISO )/,
  // T2 – Common implied end connections
  /^Flanged$/,
  /^Wafer$/,
  // T3 – NRV spring details
  /^(Spring Assisted|No Spring)$/,
  // T4 – Pump skid component list (already abbreviated to "w/ A+B")
  /^w\/ /,
  // T5 – Valve style duplicates
  /^(Cage Guided|Plug Disc|Globe Disc|Single Port|Double Port)$/,
  // T6 – Impeller type for centrifugal (spec-level detail)
  /Impeller$/,
  // T7 – Vertical Turbine pump bowl/column/discharge detail
  /^(\d+-Bowl|.*\bColumn\b|Enclosed Discharge|Open Discharge)$/,
  // T8 – Other end connections
  /^(Lug Type|Lug$|Butt Weld|Socket Weld|Dbl Ferrule|Sgl Ferrule|FNPT|MNPT)$/,
  // T9 – Constructive details: bonnet, lining, disc mounting
  /Bonnet$/,
  /Lined$/,
  /^(Concentric|Double Offset|Triple Offset)$/,
  // T10 – Seat material (secondary vs disc/ball)
  /Seat$/,
  // T11 – Flow characteristic
  /^(Eq\. %|Linear|Quick Opening|QO)$/,
  // T12 – Cooling type for vacuum boosters/pumps
  /^(Air Cooled|Water Cooled)$/,
  // T13 – Pump orientation when already implicit in subtype name
  /^Horizontal$/,
  // T14 – Pressure rating (last resort — size is more important)
  /^(Cl\.\d+|PN\d+|PN \d+)$/,
];

// ── Internal helpers ──────────────────────────────────────────────────────────
function applyPreProcess(s: string): string {
  for (const [re, repl] of PRE_PROCESS) {
    s = s.replace(re, repl as string);
  }
  return s;
}

function applyAbbreviations(s: string): string {
  for (const [from, to] of ABBR) {
    if (s.includes(from)) s = s.split(from).join(to);
  }
  return s;
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Shorten a raw builder description to ≤ SAP_ITEM_NAME_LIMIT (100) characters
 * using deterministic abbreviation rules and token-priority dropping.
 * Never blindly truncates mid-word.
 */
export function shortenToSapItemName(raw: string): string {
  if (raw.length <= SAP_ITEM_NAME_LIMIT) return raw;

  // Phase 1a – pre-process (multi-token merges, seat-label fixes)
  let s = applyPreProcess(raw);
  // Phase 1b – abbreviation map
  s = applyAbbreviations(s);
  if (s.length <= SAP_ITEM_NAME_LIMIT) return s;

  // Phase 2 – iterative token dropping
  const tokens = s.split(", ");
  for (const pattern of DROP_PRIORITY) {
    if (tokens.join(", ").length <= SAP_ITEM_NAME_LIMIT) break;
    const idx = tokens.findIndex((t, i) => i > 0 && pattern.test(t));
    if (idx !== -1) tokens.splice(idx, 1);
  }

  s = tokens.join(", ");
  if (s.length <= SAP_ITEM_NAME_LIMIT) return s;

  // Phase 3 – safety-net: drop from tail until ≤ 100 or only 3 tokens remain
  while (tokens.length > 3 && tokens.join(", ").length > SAP_ITEM_NAME_LIMIT) {
    tokens.pop();
  }
  s = tokens.join(", ");
  if (s.length <= SAP_ITEM_NAME_LIMIT) return s;

  // Absolute last resort – trim at last ", " boundary before limit
  const cut = s.lastIndexOf(", ", SAP_ITEM_NAME_LIMIT - 1);
  return cut > 0 ? s.slice(0, cut) : s.slice(0, SAP_ITEM_NAME_LIMIT);
}
