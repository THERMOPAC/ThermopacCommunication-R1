import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Loader2, FileSpreadsheet, AlertTriangle, CheckCircle2, Edit3 } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type MechanicalColumn = {
  internalDesignPressureMawp: string | null;
  externalDesignPressureMawp: string | null;
  workingPressure: string | null;
  hydroTestPressure: string | null;
  mdmt: string | null;
  hydroTestTempMinMax: string | null;
  operatingTempMinMax: string | null;
  designTempMinMax: string | null;
  physicalState: string | null;
  grossVolumeLiters: string | null;
  serviceFluid: string | null;
  hazardLevel: string | null;
  specificGravity: string | null;
  internalCorrosionAllowanceMm: string | null;
  externalCorrosionAllowanceMm: string | null;
  radiography: string | null;
  jointEfficiency: string | null;
  testingGroup: string | null;
  fabricationToleranceClass: string | null;
  postWeldHeatTreatment: string | null;
  typeOfHeads: string | null;
  insulation: string | null;
  insulationTypeThkDensity: string | null;
};

type MechanicalData = {
  shell: MechanicalColumn;
  tube: MechanicalColumn | null;
  jacket: MechanicalColumn | null;
};

type GeneralData = {
  hydroTestPosition: string | null;
  vesselOrientation: string | null;
  designServiceLife: string | null;
  windData: string | null;
  windDesignVelocity: string | null;
  seismicDesignCode: string | null;
  hazardFactorZ: string | null;
  seismicCoefficientHorizontal: string | null;
  seismicCoefficientVertical: string | null;
  weightEmptyOperatingHydro: string | null;
  location: string | null;
  qty: string | null;
};

type DesignDataSheet = {
  id: number;
  dwg_control_id: number;
  design_code: string;
  material_code: string | null;
  equipment_description: string | null;
  tag_no: string | null;
  equipment_type: string | null;
  manufacture_serial_no: string | null;
  inspection_by: string;
  equipment_config: string;
  mechanical_data: MechanicalData;
  general_data: GeneralData;
  status: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const DESIGN_CODES = [
  'EN 13445-3:2021 + TEMA EDITION-10',
  'EN 13445-3:2021',
  'ASME SEC VIII DIV-1',
  'ASME SEC VIII DIV-2',
  'ASME B31.3',
  'PED 2014/68/EU',
  'API 650',
  'IS 2825',
  'AS 1210',
];

const DISCIPLINE_TO_DESIGN_CODE: Record<string, string> = {
  'ASME SEC VIII Div-1': 'ASME SEC VIII DIV-1',
  'ASME 31.3':           'ASME B31.3',
  'EN 13445':            'EN 13445-3:2021',
  'PED 2014/68/EU':      'PED 2014/68/EU',
  'API 650':             'API 650',
};

const EQUIPMENT_CONFIGS = [
  'Vessel',
  'Jacketed Vessel',
  'Heat Exchanger',
  'Jacketed Vessel and Heat Exchanger',
];

const INSPECTION_OPTIONS = ['SGS India', 'TUV India', 'Thermopac'];

const MECH_PARAM_LABELS: { key: keyof MechanicalColumn; label: string; group: string }[] = [
  { key: 'internalDesignPressureMawp', label: 'INTERNAL DESIGN PRESSURE / MAWP', group: 'PRESSURE (Barg)' },
  { key: 'externalDesignPressureMawp', label: 'EXTERNAL DESIGN PRESSURE / MAWP', group: 'PRESSURE (Barg)' },
  { key: 'workingPressure', label: 'WORKING PRESSURE', group: 'PRESSURE (Barg)' },
  { key: 'hydroTestPressure', label: 'HYDRO TEST PRESSURE', group: 'PRESSURE (Barg)' },
  { key: 'mdmt', label: 'MDMT', group: 'TEMPERATURE (DEG. C)' },
  { key: 'hydroTestTempMinMax', label: 'HYDRO TEST (MIN / MAX)', group: 'TEMPERATURE (DEG. C)' },
  { key: 'operatingTempMinMax', label: 'OPERATING (MIN / MAX)', group: 'TEMPERATURE (DEG. C)' },
  { key: 'designTempMinMax', label: 'DESIGN (MIN / MAX)', group: 'TEMPERATURE (DEG. C)' },
  { key: 'physicalState', label: 'PHYSICAL STATE', group: '' },
  { key: 'grossVolumeLiters', label: 'GROSS VOLUME (LITERS)', group: '' },
  { key: 'serviceFluid', label: 'SERVICE FLUID', group: '' },
  { key: 'hazardLevel', label: 'HAZARD LEVEL AS 4343', group: '' },
  { key: 'specificGravity', label: 'SPECIFIC GRAVITY (LIQUID / GAS)', group: '' },
  { key: 'internalCorrosionAllowanceMm', label: 'INTERNAL CORROSION ALLOWANCE (SHELL / DISH / NOZZLE) MM', group: '' },
  { key: 'externalCorrosionAllowanceMm', label: 'EXTERNAL CORROSION ALLOWANCE (SHELL / DISH) MM', group: '' },
  { key: 'radiography', label: 'RADIOGRAPHY (FULL / SPOT)', group: '' },
  { key: 'jointEfficiency', label: 'JOINT EFFICIENCY (HEAD / SHELL L SEAM / HEAD TO SHELL)', group: '' },
  { key: 'testingGroup', label: 'TESTING GROUP', group: '' },
  { key: 'fabricationToleranceClass', label: 'FABRICATION TOLERANCE QUALITY CLASS', group: '' },
  { key: 'postWeldHeatTreatment', label: 'POST WELD HEAT TREATMENT', group: '' },
  { key: 'typeOfHeads', label: 'TYPE OF HEADS', group: '' },
  { key: 'insulation', label: 'INSULATION', group: '' },
  { key: 'insulationTypeThkDensity', label: 'INSULATION (TYPE / THK / DENSITY (KG/M3))', group: '' },
];

const GENERAL_PARAM_LABELS: { key: keyof GeneralData; label: string }[] = [
  { key: 'hydroTestPosition', label: 'HYDRO TEST POSITION' },
  { key: 'vesselOrientation', label: 'VESSEL ORIENTATION (HOR / VER)' },
  { key: 'designServiceLife', label: 'DESIGN SERVICE LIFE' },
  { key: 'windData', label: 'WIND DATA' },
  { key: 'windDesignVelocity', label: 'WIND DESIGN VELOCITY' },
  { key: 'seismicDesignCode', label: 'SEISMIC DESIGN CODE' },
  { key: 'hazardFactorZ', label: 'HAZARD FACTOR Z' },
  { key: 'seismicCoefficientHorizontal', label: 'SEISMICE COEFFICIENT HORIZONTAL WSD' },
  { key: 'seismicCoefficientVertical', label: 'SEISMICE COEFFICIENT VERTICAL WSD' },
  { key: 'weightEmptyOperatingHydro', label: 'WEIGHT (EMPTY / OPERATING / HYDRO TEST) KGS' },
  { key: 'location', label: 'LOCATION' },
  { key: 'qty', label: 'Qty' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyMechanicalColumn(): MechanicalColumn {
  return {
    internalDesignPressureMawp: null, externalDesignPressureMawp: null,
    workingPressure: null, hydroTestPressure: null, mdmt: null,
    hydroTestTempMinMax: null, operatingTempMinMax: null, designTempMinMax: null,
    physicalState: null, grossVolumeLiters: null, serviceFluid: null,
    hazardLevel: null, specificGravity: null, internalCorrosionAllowanceMm: null,
    externalCorrosionAllowanceMm: null, radiography: null, jointEfficiency: null,
    testingGroup: null, fabricationToleranceClass: null, postWeldHeatTreatment: null,
    typeOfHeads: null, insulation: null, insulationTypeThkDensity: null,
  };
}

function emptyGeneralData(): GeneralData {
  return {
    hydroTestPosition: null, vesselOrientation: null, designServiceLife: null,
    windData: null, windDesignVelocity: null, seismicDesignCode: null,
    hazardFactorZ: null, seismicCoefficientHorizontal: null,
    seismicCoefficientVertical: null, weightEmptyOperatingHydro: null,
    location: null, qty: null,
  };
}

function getColumns(config: string): { shell: boolean; tube: boolean; jacket: boolean } {
  return {
    shell: true,
    tube: config === 'Heat Exchanger' || config === 'Jacketed Vessel and Heat Exchanger',
    jacket: config === 'Jacketed Vessel' || config === 'Jacketed Vessel and Heat Exchanger',
  };
}

function getColumnHeaders(config: string): string[] {
  const c = getColumns(config);
  const h: string[] = [];
  if (c.shell) h.push('SHELL');
  if (c.tube) h.push('TUBE');
  if (c.jacket) h.push('JACKET 1&2');
  return h;
}

// ─── Renderer (read-only tabular view) ───────────────────────────────────────

function DesignDataRenderer({ sheet }: { sheet: DesignDataSheet }) {
  const config = sheet.equipment_config;
  const cols = getColumns(config);
  const colHeaders = getColumnHeaders(config);
  const mechData = sheet.mechanical_data;
  const genData = sheet.general_data;

  const colData: (MechanicalColumn | null)[] = [
    cols.shell ? mechData.shell : null,
    cols.tube ? mechData.tube : null,
    cols.jacket ? mechData.jacket : null,
  ].filter(Boolean) as MechanicalColumn[];

  const isMultiCol = colHeaders.length > 1;

  // Group consecutive rows with same group label
  let lastGroup = '';

  return (
    <div className="font-mono text-[10px] border border-gray-400">
      {/* Title */}
      <div className="text-center font-bold text-sm py-2 border-b border-gray-400 bg-gray-50 tracking-wide">
        4.1 DESIGN DATA
      </div>

      {/* Header rows */}
      <table className="w-full border-collapse text-[10px]">
        <tbody>
          {[
            { label: 'DESIGN CODE', value: sheet.design_code },
            { label: 'MATERIAL CODE', value: sheet.material_code || '—' },
            { label: 'EQUIPMENT', value: sheet.equipment_description || '—' },
            { label: 'TAG NO', value: sheet.tag_no || <span className="text-amber-600 italic">Pending (see warnings)</span> },
            { label: 'TYPE', value: sheet.equipment_type || '—' },
            { label: 'MANUFACTURE SERIAL NO', value: sheet.manufacture_serial_no || <span className="text-amber-600 italic">Pending (see warnings)</span> },
            { label: 'INSPECTION BY', value: sheet.inspection_by },
          ].map((row) => (
            <tr key={row.label} className="border-b border-gray-300">
              <td className="border-r border-gray-300 bg-gray-50 font-semibold px-2 py-1 w-48 uppercase text-[9px] tracking-wide">
                {row.label}
              </td>
              <td className="px-2 py-1 text-[10px]">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mechanical Data */}
      <table className="w-full border-collapse text-[10px] border-t-2 border-gray-400">
        <thead>
          <tr className="border-b border-gray-400 bg-gray-100">
            <th className="border-r border-gray-300 px-2 py-1 text-left w-32 text-[9px]">GROUP</th>
            <th className="border-r border-gray-300 px-2 py-1 text-left text-[9px]">PARAMETER</th>
            {colHeaders.map((h) => (
              <th key={h} className="border-r border-gray-300 px-2 py-1 text-center text-[9px] font-bold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MECH_PARAM_LABELS.map((p, idx) => {
            const showGroup = p.group && p.group !== lastGroup;
            if (showGroup) lastGroup = p.group;
            const isGroupRow = MECH_PARAM_LABELS.findIndex(x => x.group === p.group) === idx;

            return (
              <tr key={p.key} className="border-b border-gray-200 hover:bg-gray-50">
                <td className="border-r border-gray-300 px-2 py-0.5 text-[8px] font-semibold bg-gray-50 uppercase align-top">
                  {isGroupRow && p.group ? p.group : ''}
                </td>
                <td className="border-r border-gray-300 px-2 py-0.5 text-[9px] uppercase">
                  {p.label}
                </td>
                {colData.map((col, ci) => (
                  <td key={ci} className="border-r border-gray-300 px-2 py-0.5 text-[10px] text-center">
                    {col ? (col[p.key] ?? 'N.A.') : 'N.A.'}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* General Data */}
      <table className="w-full border-collapse text-[10px] border-t-2 border-gray-400">
        <tbody>
          {GENERAL_PARAM_LABELS.map((p) => (
            <tr key={p.key} className="border-b border-gray-200 hover:bg-gray-50">
              <td className="border-r border-gray-300 bg-gray-50 font-semibold px-2 py-0.5 uppercase text-[9px] tracking-wide w-72">
                {p.label}
              </td>
              <td className="px-2 py-0.5 text-[10px]">
                {genData[p.key] ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

function MechanicalColumnForm({
  label, data, onChange,
}: {
  label: string;
  data: MechanicalColumn;
  onChange: (col: MechanicalColumn) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-bold text-center uppercase bg-gray-100 py-0.5 rounded">{label}</div>
      {MECH_PARAM_LABELS.map((p) => (
        <div key={p.key} className="flex items-center gap-2">
          <Label className="text-[9px] w-48 shrink-0 text-right text-muted-foreground">{p.label.substring(0, 35)}</Label>
          <Input
            className="h-6 text-[10px] px-1.5"
            value={data[p.key] ?? ''}
            onChange={(e) => onChange({ ...data, [p.key]: e.target.value || null })}
            placeholder="N.A."
          />
        </div>
      ))}
    </div>
  );
}

function GeneralDataForm({
  data, onChange,
}: {
  data: GeneralData;
  onChange: (g: GeneralData) => void;
}) {
  return (
    <div className="space-y-1">
      {GENERAL_PARAM_LABELS.map((p) => (
        <div key={p.key} className="flex items-center gap-2">
          <Label className="text-[9px] w-56 shrink-0 text-right text-muted-foreground">{p.label.substring(0, 40)}</Label>
          <Input
            className="h-6 text-[10px] px-1.5"
            value={data[p.key] ?? ''}
            onChange={(e) => onChange({ ...data, [p.key]: e.target.value || null })}
            placeholder="—"
          />
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  drawingControlId: number;
  drawingStatus: string;
  userRole: string;
  disciplineCode?: string | null;
}

export default function DesignDataGenerator({ drawingControlId, drawingStatus, userRole, disciplineCode }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  // ── Form state ────────────────────────────────────────────────────────────
  const [designCode, setDesignCode] = useState('');
  const [equipmentConfig, setEquipmentConfig] = useState('');
  const [inspectionBy, setInspectionBy] = useState('');
  const [mechShell, setMechShell] = useState<MechanicalColumn>(emptyMechanicalColumn());
  const [mechTube, setMechTube] = useState<MechanicalColumn>(emptyMechanicalColumn());
  const [mechJacket, setMechJacket] = useState<MechanicalColumn>(emptyMechanicalColumn());
  const [generalData, setGeneralData] = useState<GeneralData>(emptyGeneralData());

  const canEdit = ['draft', 'under_review'].includes(drawingStatus) &&
    ['Superuser', 'General Manager', 'Senior Manager', 'Manager', 'Senior Executive'].includes(userRole);

  // ── Query ─────────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery<{ sheet: DesignDataSheet | null; warnings?: any }>({
    queryKey: ['/api/drawing-design-data', drawingControlId],
    queryFn: () => fetch(`/api/drawing-design-data/${drawingControlId}`, { credentials: 'include' }).then(r => r.json()),
  });

  const sheet = data?.sheet || null;
  const warnings = data?.warnings || {};

  function loadSheetIntoForm(s: DesignDataSheet) {
    setDesignCode(s.design_code);
    setEquipmentConfig(s.equipment_config);
    setInspectionBy(s.inspection_by);
    setMechShell(s.mechanical_data.shell || emptyMechanicalColumn());
    setMechTube(s.mechanical_data.tube || emptyMechanicalColumn());
    setMechJacket(s.mechanical_data.jacket || emptyMechanicalColumn());
    setGeneralData(s.general_data || emptyGeneralData());
  }

  function handleStartEdit() {
    if (sheet) {
      loadSheetIntoForm(sheet);
    } else {
      const autoCode = (disciplineCode && DISCIPLINE_TO_DESIGN_CODE[disciplineCode]) || '';
      setDesignCode(autoCode);
      setEquipmentConfig(''); setInspectionBy('');
      setMechShell(emptyMechanicalColumn()); setMechTube(emptyMechanicalColumn());
      setMechJacket(emptyMechanicalColumn()); setGeneralData(emptyGeneralData());
    }
    setDialogOpen(true);
  }

  // ── Mutation ──────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const cols = getColumns(equipmentConfig);
      const mechanicalData: MechanicalData = {
        shell: mechShell,
        tube: cols.tube ? mechTube : null,
        jacket: cols.jacket ? mechJacket : null,
      };
      const method = sheet ? 'PUT' : 'POST';
      return apiRequest(method, `/api/drawing-design-data/${drawingControlId}`, {
        designCode, equipmentConfig, inspectionBy, mechanicalData, generalData,
      });
    },
    onSuccess: (json: any) => {
      if (json?.warnings?.tagNo) toast({ title: 'Warning', description: json.warnings.tagNo, variant: 'destructive' });
      if (json?.warnings?.manufactureSerialNo) toast({ title: 'Warning', description: json.warnings.manufactureSerialNo, variant: 'destructive' });
      toast({ title: 'Saved', description: 'Design data sheet saved.' });
      qc.invalidateQueries({ queryKey: ['/api/drawing-design-data', drawingControlId] });
      setDialogOpen(false);
    },
    onError: async (err: any) => {
      const msg = err?.message || 'Save failed';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    },
  });

  const cols = getColumns(equipmentConfig);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Card (view only) ─────────────────────────────────────────────── */}
      <Card className="w-full">
        <CardHeader className="py-2 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5 text-blue-600" />
              Design Data Sheet
            </CardTitle>
            <div className="flex items-center gap-1.5">
              {sheet && (
                <Badge
                  variant="outline"
                  className={`text-[9px] px-1.5 py-0 ${sheet.status === 'draft' ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-emerald-50 text-emerald-700 border-emerald-300'}`}
                >
                  {sheet.status}
                </Badge>
              )}
              {canEdit && (
                <Button size="sm" variant="outline" className="h-6 text-[9px] px-2" onClick={handleStartEdit}>
                  <Edit3 className="h-3 w-3 mr-1" />
                  {sheet ? 'Edit' : 'Create'}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-3 pb-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground py-4 justify-center">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : sheet ? (
            <div className="space-y-2">
              {(warnings.tagNo || warnings.manufactureSerialNo) && (
                <div className="flex items-start gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                  <div>
                    {warnings.tagNo && <div>{warnings.tagNo}</div>}
                    {warnings.manufactureSerialNo && <div>{warnings.manufactureSerialNo}</div>}
                  </div>
                </div>
              )}
              <DesignDataRenderer sheet={sheet} />
            </div>
          ) : (
            <div className="text-center py-6 text-[11px] text-muted-foreground">
              <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No design data sheet yet.
              {canEdit && (
                <div className="mt-2">
                  <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={handleStartEdit}>
                    + Create Design Data Sheet
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog (form) ────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) setDialogOpen(false); }}>
        <DialogContent className="max-w-4xl w-full p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <FileSpreadsheet className="h-4 w-4 text-blue-600" />
              Design Data Sheet
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[75vh]">
            <div className="px-6 py-4 space-y-5">
              {/* Header fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    Design Code <span className="text-red-500">*</span>
                    {disciplineCode && DISCIPLINE_TO_DESIGN_CODE[disciplineCode] && (
                      <span className="text-[10px] text-blue-600 font-normal bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                        Auto from: {disciplineCode}
                      </span>
                    )}
                  </Label>
                  <Select value={designCode} onValueChange={setDesignCode}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select design code…" />
                    </SelectTrigger>
                    <SelectContent>
                      {DESIGN_CODES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Material Code <span className="text-muted-foreground text-[10px]">(auto)</span></Label>
                  <Input
                    className="h-8 text-xs bg-slate-50"
                    value={designCode ? (
                      {
                        'EN 13445-3:2021 + TEMA EDITION-10': 'ASME SEC II PART D 2023',
                        'EN 13445-3:2021': 'ASME SEC II PART D 2023',
                        'ASME SEC VIII DIV-1': 'ASME SEC II PART D 2023',
                        'ASME SEC VIII DIV-2': 'ASME SEC II PART D 2023',
                        'ASME B31.3': 'ASME SEC II PART D 2023',
                        'PED 2014/68/EU': 'EN 10028 / EN 10216',
                        'API 650': 'ASME SEC II PART D 2023',
                        'IS 2825': 'IS 2002 / IS 1570',
                        'AS 1210': 'AS 1548',
                      }[designCode] || '—'
                    ) : '—'}
                    readOnly disabled
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Equipment Configuration <span className="text-red-500">*</span></Label>
                  <Select value={equipmentConfig} onValueChange={setEquipmentConfig}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select configuration…" />
                    </SelectTrigger>
                    <SelectContent>
                      {EQUIPMENT_CONFIGS.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Inspection By <span className="text-red-500">*</span></Label>
                  <Select value={inspectionBy} onValueChange={setInspectionBy}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select inspector…" />
                    </SelectTrigger>
                    <SelectContent>
                      {INSPECTION_OPTIONS.map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2 space-y-1">
                  <div className="text-[10px] text-muted-foreground bg-slate-50 rounded px-3 py-1.5 border">
                    <span className="font-semibold">Auto-generated on save:</span> Equipment Description, Equipment Type
                  </div>
                  <div className="text-[10px] text-blue-700 bg-blue-50 rounded px-3 py-1.5 border border-blue-200">
                    <span className="font-semibold">Tag No</span> = Product Tag No + Project Code <span className="text-blue-500">(e.g. RF/FE/E1_2627-013)</span>
                    <br />Requires the product linked to this project item to have a <span className="font-semibold">Tag No</span> set in the Products catalog.
                  </div>
                </div>
              </div>

              <Separator />

              {/* Mechanical columns */}
              {equipmentConfig && (
                <div>
                  <div className="text-xs font-semibold mb-3 uppercase tracking-wide text-slate-600">Mechanical Design Data</div>
                  <div className={`grid gap-5 ${cols.tube && cols.jacket ? 'grid-cols-3' : cols.tube || cols.jacket ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <MechanicalColumnForm label="Shell" data={mechShell} onChange={setMechShell} />
                    {cols.tube && <MechanicalColumnForm label="Tube" data={mechTube} onChange={setMechTube} />}
                    {cols.jacket && <MechanicalColumnForm label="Jacket 1&2" data={mechJacket} onChange={setMechJacket} />}
                  </div>
                </div>
              )}

              <Separator />

              {/* General data */}
              <div>
                <div className="text-xs font-semibold mb-3 uppercase tracking-wide text-slate-600">General Data</div>
                <GeneralDataForm data={generalData} onChange={setGeneralData} />
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="px-6 py-3 border-t bg-slate-50">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saveMutation.isPending}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!designCode || !equipmentConfig || !inspectionBy || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
              Save Design Data Sheet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
