const STORAGE_KEY = "thermopac_approved_makes_custom";

const BASE_MAKES: string[] = [
  "ABB","Abacus Valves","Agilent","Allweiler","Anderson Greenwood (Baker Hughes)",
  "Aquatrol","Armstrong","Ashcroft","Atlas Copco","Audco (L&T)","AUMA","AVK",
  "Barksdale","Baumer","Belimo","Bharat Bijlee","Bornemann","Bosch Rexroth",
  "BOURDAN","Bourdon","Bray","Busch",
  "Caprari","Cashco","CIRCOR","CNP","Colfax",
  "Consolidated (Emerson)","Crane","Crane ChemPharma","Crosby (Emerson)","Croll-Reynolds",
  "Crompton","Cutes Corporation",
  "Danfoss","Desmi","DFT Inc.","Dwyer",
  "Ebara","Edwards","Elmo Rietschle","Emec","Emerson (Fisher)","Emerson (Rosemount)","Endress+Hauser",
  "Fiebig","Fisher (Emerson)","Flowserve","Flowserve (BW Valves)",
  "Gardner Denver (Elmo Rietschle)","GEMU","GF Piping Systems","Gorman-Rupp","Graham Corporation",
  "Grundfos","Grundfos Alldos",
  "H.Guru","Ham-Let","Havells","Hoke","Honeywell","Hugo Vogel",
  "IDEX","IMI","IMI CCI","IMO Pump","ITT","ITT (Goulds Pumps)","Iwaki",
  "Kinetic Pumps","Kirloskar","KITZ","KMC","KOSO","KOWEL PRECISION CO LTD","KSB","KSB INDIA",
  "L&T Valves","Leistritz","Leroy Somer","Leser","LEWA","Leybold","Lowara",
  "Maag","MAS","Mazda Vacuum","MD-Kinney","Metso","Metso Neles","Milton Roy","Mono Pumps",
  "Nash (Atlas Copco)","NETZSCH","Neway","Neway (Adler)","Nuova Fima",
  "Oliver Valves","OPW","ORBINOX","ORION",
  "Parker","PCM","Peerless","Pentair (Varec)","Pfeiffer","Pfeiffer Vacuum","PRAKASH PUMP",
  "ProMinent","PROTEGO","Pulsafeeder",
  "RADIX","Roper Pump","Rotork","Roto","Ruhrpumpen",
  "Samson","Seepex","SEKO","Sera","Siemens",
  "SPX","SPX Flow","SPX JOHNSON PUMP INDIA","Spirax Sarco","Sterling SIHI (SPX Flow)","Sulzer","Swagelok",
  "TECO","Torishima","TUSHACO","TUTHIL USA","Tuthill","Tyco / Bharat Valves",
  "United Electric",
  "Varisco","VEGA","Velan","Verder","VIKING","Viking Pump",
  "Watson-Marlow","WEG","WIKA","Wika","WILO","Winters",
  "Xylem","Yokogawa",
];

function loadCustomMakes(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function saveCustomMakes(makes: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(makes));
  } catch { /* ignore */ }
}

export function getApprovedMakesList(): string[] {
  const custom = loadCustomMakes();
  const seen = new Map<string, string>();
  for (const m of [...BASE_MAKES, ...custom]) {
    if (!seen.has(m.toLowerCase())) seen.set(m.toLowerCase(), m);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

export function addApprovedMake(make: string): boolean {
  const trimmed = make.trim();
  if (!trimmed) return false;
  const all = [...BASE_MAKES, ...loadCustomMakes()];
  if (all.some(m => m.toLowerCase() === trimmed.toLowerCase())) return false;
  const custom = loadCustomMakes();
  custom.push(trimmed);
  saveCustomMakes(custom);
  return true;
}
