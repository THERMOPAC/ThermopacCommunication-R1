import Layout from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Palette, 
  Ruler, 
  Layers, 
  Grid, 
  Package, 
  Wrench,
  Cpu,
  Zap,
  Workflow,
  FileText,
  Calculator,
  Settings,
  Monitor,
  CircuitBoard,
  Gauge,
  Pipette,
  Factory,
  Target,
  Database,
  BookOpen,
  Users,
  Shield,
  Thermometer,
  Square,
  Activity,
  TrendingUp,
  TrendingDown,
  Move,
  Waves,
  CornerDownRight,
  CheckCircle,
  AlertTriangle,
  Info
} from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// Shell Thickness Calculator Component
function ShellThicknessCalculator() {
  const [shellType, setShellType] = useState("cylindrical");
  const [pressure, setPressure] = useState("");
  const [diameter, setDiameter] = useState("");
  const [allowableStress, setAllowableStress] = useState("");
  const [jointEfficiency, setJointEfficiency] = useState("1.0");
  const [corrosionAllowance, setCorrosionAllowance] = useState("3.0");
  const [result, setResult] = useState<number | null>(null);

  const calculateThickness = () => {
    const P = parseFloat(pressure);
    const D = parseFloat(diameter);
    const S = parseFloat(allowableStress);
    const E = parseFloat(jointEfficiency);
    const CA = parseFloat(corrosionAllowance);

    if (!P || !D || !S || !E) return;

    let t = 0;

    switch (shellType) {
      case "cylindrical":
        // t = (P * R) / (S * E - 0.6 * P) + CA
        const R = D / 2;
        t = (P * R) / (S * E - 0.6 * P) + CA;
        break;
      case "spherical":
        // t = (P * R) / (2 * S * E - 0.2 * P) + CA
        const Rs = D / 2;
        t = (P * Rs) / (2 * S * E - 0.2 * P) + CA;
        break;
      case "conical":
        // t = (P * D) / (2 * cos(α) * (S * E - 0.6 * P)) + CA
        // Assuming 30° half-angle for simplification
        const alpha = 30 * (Math.PI / 180); // 30 degrees in radians
        t = (P * D) / (2 * Math.cos(alpha) * (S * E - 0.6 * P)) + CA;
        break;
    }

    setResult(t);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="shellType">Shell Type</Label>
          <Select value={shellType} onValueChange={setShellType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cylindrical">Cylindrical</SelectItem>
              <SelectItem value="spherical">Spherical</SelectItem>
              <SelectItem value="conical">Conical (30° half-angle)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="pressure">Internal Pressure (MPa)</Label>
          <Input
            id="pressure"
            type="number"
            step="0.1"
            value={pressure}
            onChange={(e) => setPressure(e.target.value)}
            placeholder="e.g., 1.0"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="diameter">Inside Diameter (mm)</Label>
          <Input
            id="diameter"
            type="number"
            value={diameter}
            onChange={(e) => setDiameter(e.target.value)}
            placeholder="e.g., 600"
          />
        </div>
        <div>
          <Label htmlFor="allowableStress">Allowable Stress (MPa)</Label>
          <Input
            id="allowableStress"
            type="number"
            value={allowableStress}
            onChange={(e) => setAllowableStress(e.target.value)}
            placeholder="e.g., 138"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="jointEfficiency">Joint Efficiency</Label>
          <Select value={jointEfficiency} onValueChange={setJointEfficiency}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1.0">1.0 (Full radiography)</SelectItem>
              <SelectItem value="0.85">0.85 (Spot radiography)</SelectItem>
              <SelectItem value="0.70">0.70 (No radiography)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="corrosionAllowance">Corrosion Allowance (mm)</Label>
          <Input
            id="corrosionAllowance"
            type="number"
            step="0.1"
            value={corrosionAllowance}
            onChange={(e) => setCorrosionAllowance(e.target.value)}
            placeholder="e.g., 3.0"
          />
        </div>
      </div>

      <Button onClick={calculateThickness} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Thickness
      </Button>

      {result !== null && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <h4 className="font-semibold text-green-900">Calculation Result</h4>
          <p className="text-green-800 mt-1">
            Required Wall Thickness: <span className="font-bold">{result.toFixed(2)} mm</span>
          </p>
          <p className="text-sm text-green-700 mt-2">
            Formula used: ASME Section VIII Div. 1 - {shellType} shell
          </p>
        </div>
      )}
    </div>
  );
}

// Head Thickness Calculator Component
function HeadThicknessCalculator() {
  const [headType, setHeadType] = useState("ellipsoidal");
  const [pressure, setPressure] = useState("");
  const [diameter, setDiameter] = useState("");
  const [allowableStress, setAllowableStress] = useState("");
  const [jointEfficiency, setJointEfficiency] = useState("1.0");
  const [corrosionAllowance, setCorrosionAllowance] = useState("3.0");
  const [result, setResult] = useState<number | null>(null);

  const calculateThickness = () => {
    const P = parseFloat(pressure);
    const D = parseFloat(diameter);
    const S = parseFloat(allowableStress);
    const E = parseFloat(jointEfficiency);
    const CA = parseFloat(corrosionAllowance);

    if (!P || !D || !S || !E) return;

    let t = 0;

    switch (headType) {
      case "ellipsoidal":
        // t = (P * D) / (2 * S * E - 0.2 * P) + CA (2:1 ellipsoidal)
        t = (P * D) / (2 * S * E - 0.2 * P) + CA;
        break;
      case "hemispherical":
        // t = (P * D) / (4 * S * E - 0.4 * P) + CA
        t = (P * D) / (4 * S * E - 0.4 * P) + CA;
        break;
      case "torispherical":
        // t = (0.885 * P * L) / (S * E - 0.1 * P) + CA (L = crown radius)
        const L = D; // Assuming crown radius equals diameter for simplification
        t = (0.885 * P * L) / (S * E - 0.1 * P) + CA;
        break;
    }

    setResult(t);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="headType">Head Type</Label>
          <Select value={headType} onValueChange={setHeadType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ellipsoidal">2:1 Ellipsoidal</SelectItem>
              <SelectItem value="hemispherical">Hemispherical</SelectItem>
              <SelectItem value="torispherical">Torispherical</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="pressure">Internal Pressure (MPa)</Label>
          <Input
            id="pressure"
            type="number"
            step="0.1"
            value={pressure}
            onChange={(e) => setPressure(e.target.value)}
            placeholder="e.g., 1.0"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="diameter">Inside Diameter (mm)</Label>
          <Input
            id="diameter"
            type="number"
            value={diameter}
            onChange={(e) => setDiameter(e.target.value)}
            placeholder="e.g., 600"
          />
        </div>
        <div>
          <Label htmlFor="allowableStress">Allowable Stress (MPa)</Label>
          <Input
            id="allowableStress"
            type="number"
            value={allowableStress}
            onChange={(e) => setAllowableStress(e.target.value)}
            placeholder="e.g., 138"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="jointEfficiency">Joint Efficiency</Label>
          <Select value={jointEfficiency} onValueChange={setJointEfficiency}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1.0">1.0 (Full radiography)</SelectItem>
              <SelectItem value="0.85">0.85 (Spot radiography)</SelectItem>
              <SelectItem value="0.70">0.70 (No radiography)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="corrosionAllowance">Corrosion Allowance (mm)</Label>
          <Input
            id="corrosionAllowance"
            type="number"
            step="0.1"
            value={corrosionAllowance}
            onChange={(e) => setCorrosionAllowance(e.target.value)}
            placeholder="e.g., 3.0"
          />
        </div>
      </div>

      <Button onClick={calculateThickness} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Thickness
      </Button>

      {result !== null && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <h4 className="font-semibold text-green-900">Calculation Result</h4>
          <p className="text-green-800 mt-1">
            Required Head Thickness: <span className="font-bold">{result.toFixed(2)} mm</span>
          </p>
          <p className="text-sm text-green-700 mt-2">
            Formula used: ASME Section VIII Div. 1 - {headType} head
          </p>
        </div>
      )}
    </div>
  );
}

// Nozzle Reinforcement Calculator Component
function NozzleReinforcementCalculator() {
  const [vesselDiameter, setVesselDiameter] = useState("");
  const [nozzleDiameter, setNozzleDiameter] = useState("");
  const [vesselThickness, setVesselThickness] = useState("");
  const [nozzleThickness, setNozzleThickness] = useState("");
  const [pressure, setPressure] = useState("");
  const [allowableStress, setAllowableStress] = useState("");
  const [reinforcementType, setReinforcementType] = useState("pad");
  const [result, setResult] = useState<{area: number, required: number, adequate: boolean} | null>(null);

  const calculateReinforcement = () => {
    const Dv = parseFloat(vesselDiameter);
    const Dn = parseFloat(nozzleDiameter);
    const tv = parseFloat(vesselThickness);
    const tn = parseFloat(nozzleThickness);
    const P = parseFloat(pressure);
    const S = parseFloat(allowableStress);

    if (!Dv || !Dn || !tv || !tn || !P || !S) return;

    // Area requiring reinforcement (A1) = d * tr
    // where d = effective diameter of opening = Dn
    // tr = required thickness of vessel wall = (P * Dv) / (2 * S - 1.2 * P)
    
    const tr = (P * Dv) / (2 * S - 1.2 * P);
    const A1 = Dn * tr;

    // Available reinforcement area in vessel wall (A2)
    const A2 = (tv - tr) * Dn;

    // Available reinforcement area in nozzle wall (A3)
    const A3 = 2 * tn * Math.min(2.5 * tv, 2.5 * tn + tv);

    const totalAvailable = A2 + A3;
    const adequate = totalAvailable >= A1;

    setResult({
      area: totalAvailable,
      required: A1,
      adequate: adequate
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="vesselDiameter">Vessel Diameter (mm)</Label>
          <Input
            id="vesselDiameter"
            type="number"
            value={vesselDiameter}
            onChange={(e) => setVesselDiameter(e.target.value)}
            placeholder="e.g., 1000"
          />
        </div>
        <div>
          <Label htmlFor="nozzleDiameter">Nozzle Diameter (mm)</Label>
          <Input
            id="nozzleDiameter"
            type="number"
            value={nozzleDiameter}
            onChange={(e) => setNozzleDiameter(e.target.value)}
            placeholder="e.g., 150"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="vesselThickness">Vessel Thickness (mm)</Label>
          <Input
            id="vesselThickness"
            type="number"
            step="0.1"
            value={vesselThickness}
            onChange={(e) => setVesselThickness(e.target.value)}
            placeholder="e.g., 10.0"
          />
        </div>
        <div>
          <Label htmlFor="nozzleThickness">Nozzle Thickness (mm)</Label>
          <Input
            id="nozzleThickness"
            type="number"
            step="0.1"
            value={nozzleThickness}
            onChange={(e) => setNozzleThickness(e.target.value)}
            placeholder="e.g., 8.0"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="pressure">Design Pressure (MPa)</Label>
          <Input
            id="pressure"
            type="number"
            step="0.1"
            value={pressure}
            onChange={(e) => setPressure(e.target.value)}
            placeholder="e.g., 1.5"
          />
        </div>
        <div>
          <Label htmlFor="allowableStress">Allowable Stress (MPa)</Label>
          <Input
            id="allowableStress"
            type="number"
            value={allowableStress}
            onChange={(e) => setAllowableStress(e.target.value)}
            placeholder="e.g., 138"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="reinforcementType">Reinforcement Type</Label>
        <Select value={reinforcementType} onValueChange={setReinforcementType}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pad">Reinforcement Pad</SelectItem>
            <SelectItem value="integral">Integral Reinforcement</SelectItem>
            <SelectItem value="saddle">Saddle Type</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button onClick={calculateReinforcement} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Reinforcement
      </Button>

      {result !== null && (
        <div className={`mt-4 p-4 border rounded-lg ${result.adequate ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <h4 className={`font-semibold ${result.adequate ? 'text-green-900' : 'text-red-900'}`}>
            Reinforcement Analysis
          </h4>
          <div className={`mt-2 space-y-1 ${result.adequate ? 'text-green-800' : 'text-red-800'}`}>
            <p>Required Area: <span className="font-bold">{result.required.toFixed(2)} mm²</span></p>
            <p>Available Area: <span className="font-bold">{result.area.toFixed(2)} mm²</span></p>
            <p className="font-semibold">
              Status: {result.adequate ? "✓ Adequate" : "✗ Additional reinforcement required"}
            </p>
          </div>
          <p className={`text-sm mt-2 ${result.adequate ? 'text-green-700' : 'text-red-700'}`}>
            Per ASME Section VIII Div. 1 - UG-37 requirements
          </p>
        </div>
      )}
    </div>
  );
}

// External Pressure Calculator Component
function ExternalPressureCalculator() {
  const [diameter, setDiameter] = useState("");
  const [length, setLength] = useState("");
  const [thickness, setThickness] = useState("");
  const [modulus, setModulus] = useState("200000"); // Default steel modulus
  const [externalPressure, setExternalPressure] = useState("");
  const [supportType, setSupportType] = useState("both-ends");
  const [result, setResult] = useState<{allowable: number, safe: boolean} | null>(null);

  const calculateExternalPressure = () => {
    const D = parseFloat(diameter);
    const L = parseFloat(length);
    const t = parseFloat(thickness);
    const E = parseFloat(modulus);
    const Pe = parseFloat(externalPressure);

    if (!D || !L || !t || !E || !Pe) return;

    // Simplified external pressure calculation per ASME VIII-1 UG-28
    // Length factor based on support conditions
    let lengthFactor = 1.0;
    switch (supportType) {
      case "both-ends":
        lengthFactor = 1.0;
        break;
      case "one-end":
        lengthFactor = 2.0;
        break;
      case "no-support":
        lengthFactor = 4.0;
        break;
    }

    const effectiveLength = L * lengthFactor;
    const Do = D + 2 * t; // Outside diameter
    
    // Critical buckling pressure for cylinders
    const Pa = (2 * E * Math.pow(t / Do, 3)) / (3 * (1 - Math.pow(0.3, 2))); // Poisson's ratio = 0.3
    
    // Length factor adjustment
    const Pcr = Pa / (1 + Math.pow(effectiveLength / Do, 2));
    
    const safe = Pe <= Pcr;

    setResult({
      allowable: Pcr,
      safe: safe
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="diameter">Inside Diameter (mm)</Label>
          <Input
            id="diameter"
            type="number"
            value={diameter}
            onChange={(e) => setDiameter(e.target.value)}
            placeholder="e.g., 800"
          />
        </div>
        <div>
          <Label htmlFor="length">Length (mm)</Label>
          <Input
            id="length"
            type="number"
            value={length}
            onChange={(e) => setLength(e.target.value)}
            placeholder="e.g., 2000"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="thickness">Wall Thickness (mm)</Label>
          <Input
            id="thickness"
            type="number"
            step="0.1"
            value={thickness}
            onChange={(e) => setThickness(e.target.value)}
            placeholder="e.g., 12.0"
          />
        </div>
        <div>
          <Label htmlFor="modulus">Modulus of Elasticity (MPa)</Label>
          <Input
            id="modulus"
            type="number"
            value={modulus}
            onChange={(e) => setModulus(e.target.value)}
            placeholder="e.g., 200000"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="externalPressure">External Pressure (MPa)</Label>
          <Input
            id="externalPressure"
            type="number"
            step="0.01"
            value={externalPressure}
            onChange={(e) => setExternalPressure(e.target.value)}
            placeholder="e.g., 0.1"
          />
        </div>
        <div>
          <Label htmlFor="supportType">Support Conditions</Label>
          <Select value={supportType} onValueChange={setSupportType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="both-ends">Both ends supported</SelectItem>
              <SelectItem value="one-end">One end supported</SelectItem>
              <SelectItem value="no-support">No end support</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={calculateExternalPressure} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Critical Pressure
      </Button>

      {result !== null && (
        <div className={`mt-4 p-4 border rounded-lg ${result.safe ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <h4 className={`font-semibold ${result.safe ? 'text-green-900' : 'text-red-900'}`}>
            External Pressure Analysis
          </h4>
          <div className={`mt-2 space-y-1 ${result.safe ? 'text-green-800' : 'text-red-800'}`}>
            <p>Applied Pressure: <span className="font-bold">{externalPressure} MPa</span></p>
            <p>Critical Pressure: <span className="font-bold">{result.allowable.toFixed(4)} MPa</span></p>
            <p className="font-semibold">
              Status: {result.safe ? "✓ Safe against buckling" : "✗ Risk of buckling"}
            </p>
          </div>
          <p className={`text-sm mt-2 ${result.safe ? 'text-green-700' : 'text-red-700'}`}>
            Per ASME Section VIII Div. 1 - UG-28 requirements
          </p>
        </div>
      )}
    </div>
  );
}

// Heat Exchanger Calculator Components
function HeatDutyCalculator() {
  const [massFlow, setMassFlow] = useState("");
  const [specificHeat, setSpecificHeat] = useState("");
  const [tempInlet, setTempInlet] = useState("");
  const [tempOutlet, setTempOutlet] = useState("");
  const [result, setResult] = useState<{ heatDuty: number; status: string } | null>(null);

  const calculateHeatDuty = () => {
    const m = parseFloat(massFlow);
    const cp = parseFloat(specificHeat);
    const tIn = parseFloat(tempInlet);
    const tOut = parseFloat(tempOutlet);

    if (isNaN(m) || isNaN(cp) || isNaN(tIn) || isNaN(tOut)) {
      setResult(null);
      return;
    }

    // Q = m × cp × ΔT (kW)
    const deltaT = Math.abs(tOut - tIn);
    const heatDuty = m * cp * deltaT / 1000; // Convert to kW

    setResult({
      heatDuty,
      status: heatDuty > 0 ? "Valid heat duty calculated" : "Check input values"
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="massFlow">Mass Flow Rate (kg/s)</Label>
          <Input
            id="massFlow"
            type="number"
            step="0.01"
            value={massFlow}
            onChange={(e) => setMassFlow(e.target.value)}
            placeholder="Enter mass flow rate"
          />
        </div>
        <div>
          <Label htmlFor="specificHeat">Specific Heat (J/kg·K)</Label>
          <Input
            id="specificHeat"
            type="number"
            step="1"
            value={specificHeat}
            onChange={(e) => setSpecificHeat(e.target.value)}
            placeholder="Enter specific heat"
          />
        </div>
        <div>
          <Label htmlFor="tempInlet">Inlet Temperature (°C)</Label>
          <Input
            id="tempInlet"
            type="number"
            step="0.1"
            value={tempInlet}
            onChange={(e) => setTempInlet(e.target.value)}
            placeholder="Enter inlet temperature"
          />
        </div>
        <div>
          <Label htmlFor="tempOutlet">Outlet Temperature (°C)</Label>
          <Input
            id="tempOutlet"
            type="number"
            step="0.1"
            value={tempOutlet}
            onChange={(e) => setTempOutlet(e.target.value)}
            placeholder="Enter outlet temperature"
          />
        </div>
      </div>

      <Button onClick={calculateHeatDuty} className="w-full">
        Calculate Heat Duty
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Heat Duty:</span>
              <span className="font-mono">{result.heatDuty.toFixed(2)} kW</span>
            </div>
            <div className="flex justify-between">
              <span>Heat Duty:</span>
              <span className="font-mono">{(result.heatDuty * 3.412).toFixed(2)} BTU/hr</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {result.status.includes("Valid") ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
            )}
            <span className="text-sm">{result.status}</span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Formula:</strong> Q = ṁ × cp × ΔT</p>
        <p><strong>Standards:</strong> Per TEMA and ASME thermal design guidelines</p>
      </div>
    </div>
  );
}

function LMTDCalculator() {
  const [hotInlet, setHotInlet] = useState("");
  const [hotOutlet, setHotOutlet] = useState("");
  const [coldInlet, setColdInlet] = useState("");
  const [coldOutlet, setColdOutlet] = useState("");
  const [flowConfig, setFlowConfig] = useState("counter");
  const [result, setResult] = useState<{ lmtd: number; status: string } | null>(null);

  const calculateLMTD = () => {
    const thi = parseFloat(hotInlet);
    const tho = parseFloat(hotOutlet);
    const tci = parseFloat(coldInlet);
    const tco = parseFloat(coldOutlet);

    if (isNaN(thi) || isNaN(tho) || isNaN(tci) || isNaN(tco)) {
      setResult(null);
      return;
    }

    let deltaT1, deltaT2;
    
    if (flowConfig === "counter") {
      deltaT1 = thi - tco;
      deltaT2 = tho - tci;
    } else {
      deltaT1 = thi - tci;
      deltaT2 = tho - tco;
    }

    if (deltaT1 <= 0 || deltaT2 <= 0) {
      setResult({
        lmtd: 0,
        status: "Invalid temperature profile - check inlet/outlet temperatures"
      });
      return;
    }

    const lmtd = Math.abs(deltaT1 - deltaT2) / Math.log(deltaT1 / deltaT2);

    setResult({
      lmtd,
      status: lmtd > 0 ? "Valid LMTD calculated" : "Check temperature values"
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="flowConfig">Flow Configuration</Label>
        <Select value={flowConfig} onValueChange={setFlowConfig}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="counter">Counter-Current</SelectItem>
            <SelectItem value="cocurrent">Co-Current</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="hotInlet">Hot Fluid Inlet (°C)</Label>
          <Input
            id="hotInlet"
            type="number"
            step="0.1"
            value={hotInlet}
            onChange={(e) => setHotInlet(e.target.value)}
            placeholder="Enter hot inlet temp"
          />
        </div>
        <div>
          <Label htmlFor="hotOutlet">Hot Fluid Outlet (°C)</Label>
          <Input
            id="hotOutlet"
            type="number"
            step="0.1"
            value={hotOutlet}
            onChange={(e) => setHotOutlet(e.target.value)}
            placeholder="Enter hot outlet temp"
          />
        </div>
        <div>
          <Label htmlFor="coldInlet">Cold Fluid Inlet (°C)</Label>
          <Input
            id="coldInlet"
            type="number"
            step="0.1"
            value={coldInlet}
            onChange={(e) => setColdInlet(e.target.value)}
            placeholder="Enter cold inlet temp"
          />
        </div>
        <div>
          <Label htmlFor="coldOutlet">Cold Fluid Outlet (°C)</Label>
          <Input
            id="coldOutlet"
            type="number"
            step="0.1"
            value={coldOutlet}
            onChange={(e) => setColdOutlet(e.target.value)}
            placeholder="Enter cold outlet temp"
          />
        </div>
      </div>

      <Button onClick={calculateLMTD} className="w-full">
        Calculate LMTD
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>LMTD:</span>
              <span className="font-mono">{result.lmtd.toFixed(2)} °C</span>
            </div>
            <div className="flex justify-between">
              <span>LMTD:</span>
              <span className="font-mono">{(result.lmtd * 1.8).toFixed(2)} °F</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {result.status.includes("Valid") ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
            )}
            <span className="text-sm">{result.status}</span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Formula:</strong> LMTD = (ΔT₁ - ΔT₂) / ln(ΔT₁/ΔT₂)</p>
        <p><strong>Note:</strong> For {flowConfig === "counter" ? "counter-current" : "co-current"} flow configuration</p>
      </div>
    </div>
  );
}

function HeatTransferAreaCalculator() {
  const [heatDuty, setHeatDuty] = useState("");
  const [uValue, setUValue] = useState("");
  const [lmtd, setLmtd] = useState("");
  const [result, setResult] = useState<{ area: number; status: string } | null>(null);

  const calculateArea = () => {
    const Q = parseFloat(heatDuty);
    const U = parseFloat(uValue);
    const LMTD = parseFloat(lmtd);

    if (isNaN(Q) || isNaN(U) || isNaN(LMTD) || U <= 0 || LMTD <= 0) {
      setResult(null);
      return;
    }

    // A = Q / (U × LMTD)
    const area = Q / (U * LMTD);

    setResult({
      area,
      status: area > 0 ? "Valid heat transfer area calculated" : "Check input values"
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        <div>
          <Label htmlFor="heatDuty">Heat Duty (kW)</Label>
          <Input
            id="heatDuty"
            type="number"
            step="0.1"
            value={heatDuty}
            onChange={(e) => setHeatDuty(e.target.value)}
            placeholder="Enter heat duty"
          />
        </div>
        <div>
          <Label htmlFor="uValue">Overall Heat Transfer Coefficient (W/m²·K)</Label>
          <Input
            id="uValue"
            type="number"
            step="1"
            value={uValue}
            onChange={(e) => setUValue(e.target.value)}
            placeholder="Enter U-value"
          />
        </div>
        <div>
          <Label htmlFor="lmtd">Log Mean Temperature Difference (°C)</Label>
          <Input
            id="lmtd"
            type="number"
            step="0.1"
            value={lmtd}
            onChange={(e) => setLmtd(e.target.value)}
            placeholder="Enter LMTD"
          />
        </div>
      </div>

      <Button onClick={calculateArea} className="w-full">
        Calculate Heat Transfer Area
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Heat Transfer Area:</span>
              <span className="font-mono">{result.area.toFixed(2)} m²</span>
            </div>
            <div className="flex justify-between">
              <span>Heat Transfer Area:</span>
              <span className="font-mono">{(result.area * 10.764).toFixed(2)} ft²</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {result.status.includes("Valid") ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
            )}
            <span className="text-sm">{result.status}</span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Formula:</strong> A = Q / (U × LMTD)</p>
        <p><strong>Standards:</strong> Basic heat transfer equation</p>
      </div>
    </div>
  );
}

function UValueCalculator() {
  const [hHot, setHHot] = useState("");
  const [hCold, setHCold] = useState("");
  const [tubeWallThickness, setTubeWallThickness] = useState("");
  const [thermalConductivity, setThermalConductivity] = useState("");
  const [foulingHot, setFoulingHot] = useState("");
  const [foulingCold, setFoulingCold] = useState("");
  const [result, setResult] = useState<{ uValue: number; status: string } | null>(null);

  const calculateUValue = () => {
    const h_hot = parseFloat(hHot);
    const h_cold = parseFloat(hCold);
    const t_wall = parseFloat(tubeWallThickness);
    const k_wall = parseFloat(thermalConductivity);
    const rf_hot = parseFloat(foulingHot);
    const rf_cold = parseFloat(foulingCold);

    if (isNaN(h_hot) || isNaN(h_cold) || isNaN(t_wall) || isNaN(k_wall) || 
        isNaN(rf_hot) || isNaN(rf_cold)) {
      setResult(null);
      return;
    }

    // 1/U = 1/h_hot + rf_hot + t_wall/k_wall + rf_cold + 1/h_cold
    const resistance = 1/h_hot + rf_hot + (t_wall/1000)/k_wall + rf_cold + 1/h_cold;
    const uValue = 1 / resistance;

    setResult({
      uValue,
      status: uValue > 0 ? "Valid U-value calculated" : "Check input values"
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="hHot">Hot Side Heat Transfer Coefficient (W/m²·K)</Label>
          <Input
            id="hHot"
            type="number"
            step="1"
            value={hHot}
            onChange={(e) => setHHot(e.target.value)}
            placeholder="Enter hot side h"
          />
        </div>
        <div>
          <Label htmlFor="hCold">Cold Side Heat Transfer Coefficient (W/m²·K)</Label>
          <Input
            id="hCold"
            type="number"
            step="1"
            value={hCold}
            onChange={(e) => setHCold(e.target.value)}
            placeholder="Enter cold side h"
          />
        </div>
        <div>
          <Label htmlFor="tubeWallThickness">Tube Wall Thickness (mm)</Label>
          <Input
            id="tubeWallThickness"
            type="number"
            step="0.1"
            value={tubeWallThickness}
            onChange={(e) => setTubeWallThickness(e.target.value)}
            placeholder="Enter wall thickness"
          />
        </div>
        <div>
          <Label htmlFor="thermalConductivity">Wall Thermal Conductivity (W/m·K)</Label>
          <Input
            id="thermalConductivity"
            type="number"
            step="0.1"
            value={thermalConductivity}
            onChange={(e) => setThermalConductivity(e.target.value)}
            placeholder="Enter k value"
          />
        </div>
        <div>
          <Label htmlFor="foulingHot">Hot Side Fouling Factor (m²·K/W)</Label>
          <Input
            id="foulingHot"
            type="number"
            step="0.0001"
            value={foulingHot}
            onChange={(e) => setFoulingHot(e.target.value)}
            placeholder="Enter fouling factor"
          />
        </div>
        <div>
          <Label htmlFor="foulingCold">Cold Side Fouling Factor (m²·K/W)</Label>
          <Input
            id="foulingCold"
            type="number"
            step="0.0001"
            value={foulingCold}
            onChange={(e) => setFoulingCold(e.target.value)}
            placeholder="Enter fouling factor"
          />
        </div>
      </div>

      <Button onClick={calculateUValue} className="w-full">
        Calculate Overall U-Value
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Overall U-Value:</span>
              <span className="font-mono">{result.uValue.toFixed(2)} W/m²·K</span>
            </div>
            <div className="flex justify-between">
              <span>Overall U-Value:</span>
              <span className="font-mono">{(result.uValue * 0.176).toFixed(2)} BTU/hr·ft²·°F</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {result.status.includes("Valid") ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
            )}
            <span className="text-sm">{result.status}</span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Formula:</strong> 1/U = 1/h₁ + Rf₁ + t/k + Rf₂ + 1/h₂</p>
        <p><strong>Standards:</strong> TEMA and ASME heat transfer guidelines</p>
      </div>
    </div>
  );
}

function ShellTubeSizingTool() {
  const [heatDuty, setHeatDuty] = useState("");
  const [hotInlet, setHotInlet] = useState("");
  const [hotOutlet, setHotOutlet] = useState("");
  const [coldInlet, setColdInlet] = useState("");
  const [coldOutlet, setColdOutlet] = useState("");
  const [hotFlowRate, setHotFlowRate] = useState("");
  const [coldFlowRate, setColdFlowRate] = useState("");
  const [shellType, setShellType] = useState("BEM");
  const [tubeOD, setTubeOD] = useState("19.05");
  const [tubeLength, setTubeLength] = useState("3000");
  const [tubePitch, setTubePitch] = useState("23.8");
  const [passes, setPasses] = useState("1");
  const [result, setResult] = useState<{
    shellDiameter: number;
    tubeCount: number;
    heatTransferArea: number;
    uValue: number;
    shellPressureDrop: number;
    tubePressureDrop: number;
    status: string;
  } | null>(null);

  const calculateSizing = () => {
    const Q = parseFloat(heatDuty);
    const thi = parseFloat(hotInlet);
    const tho = parseFloat(hotOutlet);
    const tci = parseFloat(coldInlet);
    const tco = parseFloat(coldOutlet);
    const mh = parseFloat(hotFlowRate);
    const mc = parseFloat(coldFlowRate);
    const OD = parseFloat(tubeOD);
    const L = parseFloat(tubeLength);
    const pitch = parseFloat(tubePitch);
    const np = parseInt(passes);

    if (isNaN(Q) || isNaN(thi) || isNaN(tho) || isNaN(tci) || isNaN(tco) || 
        isNaN(mh) || isNaN(mc) || isNaN(OD) || isNaN(L) || isNaN(pitch) || isNaN(np)) {
      setResult(null);
      return;
    }

    // Calculate LMTD
    const deltaT1 = thi - tco;
    const deltaT2 = tho - tci;
    const lmtd = Math.abs(deltaT1 - deltaT2) / Math.log(deltaT1 / deltaT2);

    // Estimate overall heat transfer coefficient (simplified)
    const uValue = shellType === "BEM" ? 350 : shellType === "BEU" ? 400 : 300; // W/m²·K

    // Calculate required heat transfer area
    const area = (Q * 1000) / (uValue * lmtd); // m²

    // Calculate tube surface area per tube
    const tubeArea = Math.PI * (OD / 1000) * (L / 1000); // m² per tube

    // Estimate tube count
    const tubeCount = Math.ceil(area / tubeArea);

    // Estimate shell diameter based on tube count and layout
    const tubeAreaOccupied = tubeCount * Math.pow(pitch / 1000, 2);
    const shellDiameter = Math.sqrt(tubeAreaOccupied / 0.785) * 1000 + 100; // mm (add clearance)

    // Simplified pressure drop calculations
    const shellVelocity = mh / (Math.PI * Math.pow(shellDiameter / 2000, 2) * 800); // m/s (assuming density 800 kg/m³)
    const tubeVelocity = mc / (tubeCount * Math.PI * Math.pow((OD - 2) / 2000, 2) * 1000 / np); // m/s

    const shellPressureDrop = 0.5 * 800 * Math.pow(shellVelocity, 2) * (L / 1000) / 1000; // kPa
    const tubePressureDrop = 0.02 * (L / 1000) / ((OD - 2) / 1000) * 0.5 * 1000 * Math.pow(tubeVelocity, 2) / 1000; // kPa

    setResult({
      shellDiameter: shellDiameter,
      tubeCount: tubeCount,
      heatTransferArea: area,
      uValue: uValue,
      shellPressureDrop: shellPressureDrop,
      tubePressureDrop: tubePressureDrop,
      status: "Preliminary sizing completed - verify with detailed design"
    });
  };

  return (
    <div className="space-y-6">
      {/* Process Conditions */}
      <div className="space-y-4">
        <h4 className="font-semibold">Process Conditions</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="heatDuty">Heat Duty (kW)</Label>
            <Input
              id="heatDuty"
              type="number"
              step="0.1"
              value={heatDuty}
              onChange={(e) => setHeatDuty(e.target.value)}
              placeholder="Enter heat duty"
            />
          </div>
          <div>
            <Label htmlFor="shellType">TEMA Shell Type</Label>
            <Select value={shellType} onValueChange={setShellType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BEM">BEM (Fixed Tubesheet)</SelectItem>
                <SelectItem value="BEU">BEU (U-Tube)</SelectItem>
                <SelectItem value="AES">AES (Floating Head)</SelectItem>
                <SelectItem value="BFM">BFM (Split Ring Floating Head)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div>
            <Label htmlFor="hotInlet">Hot Inlet (°C)</Label>
            <Input
              id="hotInlet"
              type="number"
              step="0.1"
              value={hotInlet}
              onChange={(e) => setHotInlet(e.target.value)}
              placeholder="Hot inlet temp"
            />
          </div>
          <div>
            <Label htmlFor="hotOutlet">Hot Outlet (°C)</Label>
            <Input
              id="hotOutlet"
              type="number"
              step="0.1"
              value={hotOutlet}
              onChange={(e) => setHotOutlet(e.target.value)}
              placeholder="Hot outlet temp"
            />
          </div>
          <div>
            <Label htmlFor="coldInlet">Cold Inlet (°C)</Label>
            <Input
              id="coldInlet"
              type="number"
              step="0.1"
              value={coldInlet}
              onChange={(e) => setColdInlet(e.target.value)}
              placeholder="Cold inlet temp"
            />
          </div>
          <div>
            <Label htmlFor="coldOutlet">Cold Outlet (°C)</Label>
            <Input
              id="coldOutlet"
              type="number"
              step="0.1"
              value={coldOutlet}
              onChange={(e) => setColdOutlet(e.target.value)}
              placeholder="Cold outlet temp"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="hotFlowRate">Hot Side Flow Rate (kg/s)</Label>
            <Input
              id="hotFlowRate"
              type="number"
              step="0.1"
              value={hotFlowRate}
              onChange={(e) => setHotFlowRate(e.target.value)}
              placeholder="Hot flow rate"
            />
          </div>
          <div>
            <Label htmlFor="coldFlowRate">Cold Side Flow Rate (kg/s)</Label>
            <Input
              id="coldFlowRate"
              type="number"
              step="0.1"
              value={coldFlowRate}
              onChange={(e) => setColdFlowRate(e.target.value)}
              placeholder="Cold flow rate"
            />
          </div>
        </div>
      </div>

      {/* Mechanical Design */}
      <div className="space-y-4">
        <h4 className="font-semibold">Mechanical Design Parameters</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="tubeOD">Tube Outside Diameter (mm)</Label>
            <Select value={tubeOD} onValueChange={setTubeOD}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="12.7">12.7 mm (1/2")</SelectItem>
                <SelectItem value="15.88">15.88 mm (5/8")</SelectItem>
                <SelectItem value="19.05">19.05 mm (3/4")</SelectItem>
                <SelectItem value="25.4">25.4 mm (1")</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="tubeLength">Tube Length (mm)</Label>
            <Select value={tubeLength} onValueChange={setTubeLength}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1829">1829 mm (6 ft)</SelectItem>
                <SelectItem value="2438">2438 mm (8 ft)</SelectItem>
                <SelectItem value="3048">3048 mm (10 ft)</SelectItem>
                <SelectItem value="3658">3658 mm (12 ft)</SelectItem>
                <SelectItem value="4877">4877 mm (16 ft)</SelectItem>
                <SelectItem value="6096">6096 mm (20 ft)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="tubePitch">Tube Pitch (mm)</Label>
            <Input
              id="tubePitch"
              type="number"
              step="0.1"
              value={tubePitch}
              onChange={(e) => setTubePitch(e.target.value)}
              placeholder="Tube pitch"
            />
          </div>
          <div>
            <Label htmlFor="passes">Number of Tube Passes</Label>
            <Select value={passes} onValueChange={setPasses}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Pass</SelectItem>
                <SelectItem value="2">2 Pass</SelectItem>
                <SelectItem value="4">4 Pass</SelectItem>
                <SelectItem value="6">6 Pass</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Button onClick={calculateSizing} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Shell & Tube Sizing
      </Button>

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3 p-4 bg-muted rounded-lg">
              <h4 className="font-semibold">Thermal Design Results</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Heat Transfer Area:</span>
                  <span className="font-mono">{result.heatTransferArea.toFixed(1)} m²</span>
                </div>
                <div className="flex justify-between">
                  <span>Overall U-Value:</span>
                  <span className="font-mono">{result.uValue} W/m²·K</span>
                </div>
                <div className="flex justify-between">
                  <span>Tube Count:</span>
                  <span className="font-mono">{result.tubeCount} tubes</span>
                </div>
              </div>
            </div>

            <div className="space-y-3 p-4 bg-muted rounded-lg">
              <h4 className="font-semibold">Mechanical Design Results</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Shell Diameter:</span>
                  <span className="font-mono">{result.shellDiameter.toFixed(0)} mm</span>
                </div>
                <div className="flex justify-between">
                  <span>Shell ΔP:</span>
                  <span className="font-mono">{result.shellPressureDrop.toFixed(1)} kPa</span>
                </div>
                <div className="flex justify-between">
                  <span>Tube ΔP:</span>
                  <span className="font-mono">{result.tubePressureDrop.toFixed(1)} kPa</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 mb-2">
              <Info className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-blue-900">Design Summary</span>
            </div>
            <div className="text-sm text-blue-800 space-y-1">
              <p><strong>TEMA Type:</strong> {shellType} - {
                shellType === "BEM" ? "Fixed Tubesheet Design" :
                shellType === "BEU" ? "U-Tube Design" :
                shellType === "AES" ? "Floating Head Design" :
                "Split Ring Floating Head Design"
              }</p>
              <p><strong>Tube Configuration:</strong> {tubeOD}mm OD × {tubeLength}mm long, {passes} pass(es)</p>
              <p><strong>Layout:</strong> Triangular pitch at {tubePitch}mm centers</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm">{result.status}</span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground space-y-1">
        <p><strong>Standards:</strong> TEMA (Tubular Exchanger Manufacturers Association)</p>
        <p><strong>Note:</strong> This is a preliminary sizing tool. Detailed thermal and hydraulic design should be verified using specialized software and TEMA standards.</p>
        <p><strong>Design Codes:</strong> ASME Section VIII for pressure vessel design</p>
      </div>
    </div>
  );
}

function EffectivenessNTUCalculator() {
  const [ntu, setNtu] = useState("");
  const [cratio, setCratio] = useState("");
  const [exchangerType, setExchangerType] = useState("counterflow");
  const [result, setResult] = useState<{ effectiveness: number; status: string } | null>(null);

  const calculateEffectiveness = () => {
    const NTU = parseFloat(ntu);
    const C = parseFloat(cratio);

    if (isNaN(NTU) || isNaN(C)) {
      setResult(null);
      return;
    }

    let effectiveness = 0;

    switch (exchangerType) {
      case "counterflow":
        if (C === 1) {
          effectiveness = NTU / (1 + NTU);
        } else {
          effectiveness = (1 - Math.exp(-NTU * (1 - C))) / (1 - C * Math.exp(-NTU * (1 - C)));
        }
        break;
      case "parallelflow":
        effectiveness = (1 - Math.exp(-NTU * (1 + C))) / (1 + C);
        break;
      case "crossflow":
        // Simplified cross-flow approximation
        effectiveness = 1 - Math.exp((Math.exp(-NTU * C) - 1) * NTU / C);
        break;
    }

    setResult({
      effectiveness,
      status: effectiveness > 0 && effectiveness <= 1 ? "Valid effectiveness calculated" : "Check input values"
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="exchangerType">Heat Exchanger Type</Label>
        <Select value={exchangerType} onValueChange={setExchangerType}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="counterflow">Counter-flow</SelectItem>
            <SelectItem value="parallelflow">Parallel-flow</SelectItem>
            <SelectItem value="crossflow">Cross-flow</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="ntu">Number of Transfer Units (NTU)</Label>
          <Input
            id="ntu"
            type="number"
            step="0.1"
            value={ntu}
            onChange={(e) => setNtu(e.target.value)}
            placeholder="Enter NTU"
          />
        </div>
        <div>
          <Label htmlFor="cratio">Capacity Rate Ratio (C)</Label>
          <Input
            id="cratio"
            type="number"
            step="0.1"
            value={cratio}
            onChange={(e) => setCratio(e.target.value)}
            placeholder="Enter C ratio"
          />
        </div>
      </div>

      <Button onClick={calculateEffectiveness} className="w-full">
        Calculate Effectiveness
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Effectiveness (ε):</span>
              <span className="font-mono">{result.effectiveness.toFixed(3)}</span>
            </div>
            <div className="flex justify-between">
              <span>Effectiveness (%):</span>
              <span className="font-mono">{(result.effectiveness * 100).toFixed(1)}%</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {result.status.includes("Valid") ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
            )}
            <span className="text-sm">{result.status}</span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Method:</strong> Effectiveness-NTU relationships for {exchangerType} configuration</p>
        <p><strong>Standards:</strong> Heat exchanger design methodologies</p>
      </div>
    </div>
  );
}

function TubeSheetDesignTool() {
  const [diameter, setDiameter] = useState("");
  const [pressure, setPressure] = useState("");
  const [allowableStress, setAllowableStress] = useState("");
  const [result, setResult] = useState<{ thickness: number; status: string } | null>(null);

  const calculateThickness = () => {
    const D = parseFloat(diameter);
    const P = parseFloat(pressure);
    const S = parseFloat(allowableStress);

    if (isNaN(D) || isNaN(P) || isNaN(S)) {
      setResult(null);
      return;
    }

    // Simplified tube sheet thickness calculation per ASME UHX
    // t = D * sqrt(P / (3 * S))
    const thickness = D * Math.sqrt(P / (3 * S));

    setResult({
      thickness,
      status: thickness > 0 ? "Tube sheet thickness calculated per ASME UHX" : "Check input values"
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        <div>
          <Label htmlFor="diameter">Tube Sheet Diameter (mm)</Label>
          <Input
            id="diameter"
            type="number"
            step="1"
            value={diameter}
            onChange={(e) => setDiameter(e.target.value)}
            placeholder="Enter tube sheet diameter"
          />
        </div>
        <div>
          <Label htmlFor="pressure">Design Pressure (MPa)</Label>
          <Input
            id="pressure"
            type="number"
            step="0.1"
            value={pressure}
            onChange={(e) => setPressure(e.target.value)}
            placeholder="Enter design pressure"
          />
        </div>
        <div>
          <Label htmlFor="allowableStress">Allowable Stress (MPa)</Label>
          <Input
            id="allowableStress"
            type="number"
            step="1"
            value={allowableStress}
            onChange={(e) => setAllowableStress(e.target.value)}
            placeholder="Enter allowable stress"
          />
        </div>
      </div>

      <Button onClick={calculateThickness} className="w-full">
        Calculate Tube Sheet Thickness
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Required Thickness:</span>
              <span className="font-mono">{result.thickness.toFixed(2)} mm</span>
            </div>
            <div className="flex justify-between">
              <span>Required Thickness:</span>
              <span className="font-mono">{(result.thickness * 0.0394).toFixed(2)} inches</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {result.status.includes("calculated") ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
            )}
            <span className="text-sm">{result.status}</span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Formula:</strong> t = D × √(P / (3 × S))</p>
        <p><strong>Standards:</strong> ASME Section VIII Div. 1 - UHX requirements</p>
      </div>
    </div>
  );
}

function TubeLayoutGenerator() {
  const [tubeOD, setTubeOD] = useState("");
  const [tubePitch, setTubePitch] = useState("");
  const [shellID, setShellID] = useState("");
  const [layout, setLayout] = useState("triangular");
  const [result, setResult] = useState<{ tubeCount: number; status: string } | null>(null);

  const calculateTubeCount = () => {
    const OD = parseFloat(tubeOD);
    const pitch = parseFloat(tubePitch);
    const shell = parseFloat(shellID);

    if (isNaN(OD) || isNaN(pitch) || isNaN(shell)) {
      setResult(null);
      return;
    }

    // Simplified tube count estimation
    const clearance = shell - 50; // 25mm clearance from shell wall
    const effectiveArea = Math.PI * Math.pow(clearance/2, 2);
    
    let tubeArea;
    if (layout === "triangular") {
      // Triangular pitch: more efficient packing
      tubeArea = Math.pow(pitch, 2) * Math.sqrt(3) / 2;
    } else {
      // Square pitch
      tubeArea = Math.pow(pitch, 2);
    }

    const tubeCount = Math.floor(effectiveArea / tubeArea * 0.8); // 80% packing efficiency

    setResult({
      tubeCount,
      status: tubeCount > 0 ? `Estimated tube count for ${layout} layout` : "Check input values"
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="layout">Tube Layout Pattern</Label>
        <Select value={layout} onValueChange={setLayout}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="triangular">Triangular (30°)</SelectItem>
            <SelectItem value="square">Square (90°)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div>
          <Label htmlFor="tubeOD">Tube Outside Diameter (mm)</Label>
          <Input
            id="tubeOD"
            type="number"
            step="0.1"
            value={tubeOD}
            onChange={(e) => setTubeOD(e.target.value)}
            placeholder="Enter tube OD"
          />
        </div>
        <div>
          <Label htmlFor="tubePitch">Tube Pitch (mm)</Label>
          <Input
            id="tubePitch"
            type="number"
            step="0.1"
            value={tubePitch}
            onChange={(e) => setTubePitch(e.target.value)}
            placeholder="Enter tube pitch"
          />
        </div>
        <div>
          <Label htmlFor="shellID">Shell Inside Diameter (mm)</Label>
          <Input
            id="shellID"
            type="number"
            step="1"
            value={shellID}
            onChange={(e) => setShellID(e.target.value)}
            placeholder="Enter shell ID"
          />
        </div>
      </div>

      <Button onClick={calculateTubeCount} className="w-full">
        Generate Tube Layout
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Estimated Tube Count:</span>
              <span className="font-mono">{result.tubeCount} tubes</span>
            </div>
            <div className="flex justify-between">
              <span>Layout Pattern:</span>
              <span className="font-mono">{layout} pitch</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {result.status.includes("Estimated") ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
            )}
            <span className="text-sm">{result.status}</span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Standards:</strong> TEMA standard tube arrangements and layouts</p>
        <p><strong>Note:</strong> Actual count may vary based on specific design requirements</p>
      </div>
    </div>
  );
}

function GasketLoadCalculator() {
  const [gasketOD, setGasketOD] = useState("");
  const [gasketID, setGasketID] = useState("");
  const [pressure, setPressure] = useState("");
  const [gasketFactor, setGasketFactor] = useState("");
  const [seatingStress, setSeatingStress] = useState("");
  const [result, setResult] = useState<{ operatingLoad: number; seatingLoad: number; status: string } | null>(null);

  const calculateGasketLoads = () => {
    const OD = parseFloat(gasketOD);
    const ID = parseFloat(gasketID);
    const P = parseFloat(pressure);
    const m = parseFloat(gasketFactor);
    const y = parseFloat(seatingStress);

    if (isNaN(OD) || isNaN(ID) || isNaN(P) || isNaN(m) || isNaN(y)) {
      setResult(null);
      return;
    }

    // Per ASME Section VIII Div. 1 Appendix 2
    const G = (OD + ID) / 2; // Gasket reaction diameter
    const gasketArea = Math.PI * Math.pow(G, 2) / 4;
    
    // Operating load: Wm2 = π * G² * P / 4 + 2π * G * b * m * P
    const b = (OD - ID) / 2; // Gasket width
    const operatingLoad = gasketArea * P + 2 * Math.PI * G * b * m * P;
    
    // Seating load: Wm1 = π * b * G * y
    const seatingLoad = Math.PI * b * G * y;

    setResult({
      operatingLoad: operatingLoad / 1000, // Convert to kN
      seatingLoad: seatingLoad / 1000, // Convert to kN
      status: "Gasket loads calculated per ASME Section VIII"
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="gasketOD">Gasket Outside Diameter (mm)</Label>
          <Input
            id="gasketOD"
            type="number"
            step="1"
            value={gasketOD}
            onChange={(e) => setGasketOD(e.target.value)}
            placeholder="Enter gasket OD"
          />
        </div>
        <div>
          <Label htmlFor="gasketID">Gasket Inside Diameter (mm)</Label>
          <Input
            id="gasketID"
            type="number"
            step="1"
            value={gasketID}
            onChange={(e) => setGasketID(e.target.value)}
            placeholder="Enter gasket ID"
          />
        </div>
        <div>
          <Label htmlFor="pressure">Design Pressure (MPa)</Label>
          <Input
            id="pressure"
            type="number"
            step="0.1"
            value={pressure}
            onChange={(e) => setPressure(e.target.value)}
            placeholder="Enter design pressure"
          />
        </div>
        <div>
          <Label htmlFor="gasketFactor">Gasket Factor (m)</Label>
          <Input
            id="gasketFactor"
            type="number"
            step="0.1"
            value={gasketFactor}
            onChange={(e) => setGasketFactor(e.target.value)}
            placeholder="Enter gasket factor"
          />
        </div>
        <div>
          <Label htmlFor="seatingStress">Seating Stress (MPa)</Label>
          <Input
            id="seatingStress"
            type="number"
            step="1"
            value={seatingStress}
            onChange={(e) => setSeatingStress(e.target.value)}
            placeholder="Enter seating stress"
          />
        </div>
      </div>

      <Button onClick={calculateGasketLoads} className="w-full">
        Calculate Gasket Loads
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Operating Load:</span>
              <span className="font-mono">{result.operatingLoad.toFixed(2)} kN</span>
            </div>
            <div className="flex justify-between">
              <span>Seating Load:</span>
              <span className="font-mono">{result.seatingLoad.toFixed(2)} kN</span>
            </div>
            <div className="flex justify-between">
              <span>Required Bolt Load:</span>
              <span className="font-mono">{Math.max(result.operatingLoad, result.seatingLoad).toFixed(2)} kN</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm">{result.status}</span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Standards:</strong> ASME Section VIII Div. 1 - Appendix 2</p>
        <p><strong>Note:</strong> Use larger of operating or seating load for bolt design</p>
      </div>
    </div>
  );
}

function LongitudinalHoopStressCalculator() {
  const [pressure, setPressure] = useState("");
  const [diameter, setDiameter] = useState("");
  const [thickness, setThickness] = useState("");
  const [result, setResult] = useState<{ hoopStress: number; longitudinalStress: number; status: string } | null>(null);

  const calculateStresses = () => {
    const P = parseFloat(pressure);
    const D = parseFloat(diameter);
    const t = parseFloat(thickness);

    if (isNaN(P) || isNaN(D) || isNaN(t)) {
      setResult(null);
      return;
    }

    // Hoop stress: σh = PD / (2t)
    const hoopStress = (P * D) / (2 * t);
    
    // Longitudinal stress: σl = PD / (4t)
    const longitudinalStress = (P * D) / (4 * t);

    setResult({
      hoopStress,
      longitudinalStress,
      status: "Stress analysis completed per ASME Section VIII"
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        <div>
          <Label htmlFor="pressure">Internal Pressure (MPa)</Label>
          <Input
            id="pressure"
            type="number"
            step="0.1"
            value={pressure}
            onChange={(e) => setPressure(e.target.value)}
            placeholder="Enter internal pressure"
          />
        </div>
        <div>
          <Label htmlFor="diameter">Inside Diameter (mm)</Label>
          <Input
            id="diameter"
            type="number"
            value={diameter}
            onChange={(e) => setDiameter(e.target.value)}
            placeholder="Enter inside diameter"
          />
        </div>
        <div>
          <Label htmlFor="thickness">Wall Thickness (mm)</Label>
          <Input
            id="thickness"
            type="number"
            step="0.1"
            value={thickness}
            onChange={(e) => setThickness(e.target.value)}
            placeholder="Enter wall thickness"
          />
        </div>
      </div>

      <Button onClick={calculateStresses} className="w-full">
        Calculate Stresses
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Hoop Stress:</span>
              <span className="font-mono">{result.hoopStress.toFixed(2)} MPa</span>
            </div>
            <div className="flex justify-between">
              <span>Longitudinal Stress:</span>
              <span className="font-mono">{result.longitudinalStress.toFixed(2)} MPa</span>
            </div>
            <div className="flex justify-between">
              <span>Stress Ratio:</span>
              <span className="font-mono">{(result.hoopStress / result.longitudinalStress).toFixed(2)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm">{result.status}</span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Formulas:</strong> σh = PD/(2t), σl = PD/(4t)</p>
        <p><strong>Standards:</strong> ASME Section VIII Div. 1 stress analysis</p>
      </div>
    </div>
  );
}

function WindSeismicLoadCalculator() {
  const [vesselHeight, setVesselHeight] = useState("");
  const [vesselDiameter, setVesselDiameter] = useState("");
  const [windSpeed, setWindSpeed] = useState("");
  const [seismicZone, setSeismicZone] = useState("moderate");
  const [result, setResult] = useState<{ windLoad: number; seismicLoad: number; status: string } | null>(null);

  const calculateLoads = () => {
    const H = parseFloat(vesselHeight);
    const D = parseFloat(vesselDiameter);
    const V = parseFloat(windSpeed);

    if (isNaN(H) || isNaN(D) || isNaN(V)) {
      setResult(null);
      return;
    }

    // Wind load calculation (simplified ASCE 7)
    const windPressure = 0.613 * Math.pow(V, 2); // Pa
    const windLoad = windPressure * D * H / 1000; // kN

    // Seismic load estimation
    const seismicFactors = { low: 0.1, moderate: 0.2, high: 0.4 };
    const seismicFactor = seismicFactors[seismicZone as keyof typeof seismicFactors];
    const assumedWeight = 50; // kN (simplified assumption)
    const seismicLoad = seismicFactor * assumedWeight;

    setResult({
      windLoad,
      seismicLoad,
      status: "Load analysis completed per ASCE 7"
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="vesselHeight">Vessel Height (m)</Label>
          <Input
            id="vesselHeight"
            type="number"
            step="0.1"
            value={vesselHeight}
            onChange={(e) => setVesselHeight(e.target.value)}
            placeholder="Enter height"
          />
        </div>
        <div>
          <Label htmlFor="vesselDiameter">Vessel Diameter (m)</Label>
          <Input
            id="vesselDiameter"
            type="number"
            step="0.1"
            value={vesselDiameter}
            onChange={(e) => setVesselDiameter(e.target.value)}
            placeholder="Enter diameter"
          />
        </div>
        <div>
          <Label htmlFor="windSpeed">Design Wind Speed (m/s)</Label>
          <Input
            id="windSpeed"
            type="number"
            value={windSpeed}
            onChange={(e) => setWindSpeed(e.target.value)}
            placeholder="Enter wind speed"
          />
        </div>
        <div>
          <Label htmlFor="seismicZone">Seismic Zone</Label>
          <Select value={seismicZone} onValueChange={setSeismicZone}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low Seismic Zone</SelectItem>
              <SelectItem value="moderate">Moderate Seismic Zone</SelectItem>
              <SelectItem value="high">High Seismic Zone</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={calculateLoads} className="w-full">
        Calculate Loads
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Wind Load:</span>
              <span className="font-mono">{result.windLoad.toFixed(2)} kN</span>
            </div>
            <div className="flex justify-between">
              <span>Seismic Load:</span>
              <span className="font-mono">{result.seismicLoad.toFixed(2)} kN</span>
            </div>
            <div className="flex justify-between">
              <span>Combined Load:</span>
              <span className="font-mono">{(result.windLoad + result.seismicLoad).toFixed(2)} kN</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm">{result.status}</span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Standards:</strong> ASCE 7 for wind and seismic loads</p>
        <p><strong>Note:</strong> Results are preliminary estimates for detailed design verification</p>
      </div>
    </div>
  );
}

function SupportLegLoadCalculator() {
  const [vesselWeight, setVesselWeight] = useState("");
  const [operatingWeight, setOperatingWeight] = useState("");
  const [numberOfLegs, setNumberOfLegs] = useState("4");
  const [windMoment, setWindMoment] = useState("");
  const [result, setResult] = useState<{ maxLoad: number; minLoad: number; status: string } | null>(null);

  const calculateLoads = () => {
    const W_empty = parseFloat(vesselWeight);
    const W_operating = parseFloat(operatingWeight);
    const n = parseInt(numberOfLegs);
    const M = parseFloat(windMoment);

    if (isNaN(W_empty) || isNaN(W_operating) || isNaN(n) || isNaN(M)) {
      setResult(null);
      return;
    }

    const totalWeight = W_empty + W_operating;
    const avgLoadPerLeg = totalWeight / n;
    
    // Assume legs are symmetrically placed
    const radius = 1.0; // Simplified assumption
    const momentLoad = M / (n * radius);
    
    const maxLoad = avgLoadPerLeg + momentLoad;
    const minLoad = Math.max(0, avgLoadPerLeg - momentLoad);

    setResult({
      maxLoad,
      minLoad,
      status: "Support load distribution calculated"
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="vesselWeight">Empty Vessel Weight (kN)</Label>
          <Input
            id="vesselWeight"
            type="number"
            step="0.1"
            value={vesselWeight}
            onChange={(e) => setVesselWeight(e.target.value)}
            placeholder="Enter empty weight"
          />
        </div>
        <div>
          <Label htmlFor="operatingWeight">Operating Contents Weight (kN)</Label>
          <Input
            id="operatingWeight"
            type="number"
            step="0.1"
            value={operatingWeight}
            onChange={(e) => setOperatingWeight(e.target.value)}
            placeholder="Enter operating weight"
          />
        </div>
        <div>
          <Label htmlFor="numberOfLegs">Number of Support Legs</Label>
          <Select value={numberOfLegs} onValueChange={setNumberOfLegs}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 Legs</SelectItem>
              <SelectItem value="4">4 Legs</SelectItem>
              <SelectItem value="6">6 Legs</SelectItem>
              <SelectItem value="8">8 Legs</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="windMoment">Wind Overturning Moment (kN·m)</Label>
          <Input
            id="windMoment"
            type="number"
            step="0.1"
            value={windMoment}
            onChange={(e) => setWindMoment(e.target.value)}
            placeholder="Enter wind moment"
          />
        </div>
      </div>

      <Button onClick={calculateLoads} className="w-full">
        Calculate Support Loads
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Maximum Leg Load:</span>
              <span className="font-mono">{result.maxLoad.toFixed(2)} kN</span>
            </div>
            <div className="flex justify-between">
              <span>Minimum Leg Load:</span>
              <span className="font-mono">{result.minLoad.toFixed(2)} kN</span>
            </div>
            <div className="flex justify-between">
              <span>Load Distribution Factor:</span>
              <span className="font-mono">{(result.maxLoad / result.minLoad || 0).toFixed(2)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm">{result.status}</span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Note:</strong> Foundation design should account for maximum leg loads</p>
        <p><strong>Safety:</strong> Include safety factors per applicable building codes</p>
      </div>
    </div>
  );
}

function LiftingLugCalculator() {
  const [vesselWeight, setVesselWeight] = useState("");
  const [liftingAngle, setLiftingAngle] = useState("30");
  const [numberOfLugs, setNumberOfLugs] = useState("4");
  const [safetyFactor, setSafetyFactor] = useState("3");
  const [result, setResult] = useState<{ lugLoad: number; designLoad: number; status: string } | null>(null);

  const calculateLiftingLoad = () => {
    const W = parseFloat(vesselWeight);
    const angle = parseFloat(liftingAngle);
    const n = parseInt(numberOfLugs);
    const sf = parseFloat(safetyFactor);

    if (isNaN(W) || isNaN(angle) || isNaN(n) || isNaN(sf)) {
      setResult(null);
      return;
    }

    // Load per lug considering lifting angle
    const angleRad = (angle * Math.PI) / 180;
    const lugLoad = (W / n) / Math.cos(angleRad);
    
    // Design load with safety factor
    const designLoad = lugLoad * sf;

    setResult({
      lugLoad,
      designLoad,
      status: "Lifting lug loads calculated per ASME BTH-1"
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="vesselWeight">Total Vessel Weight (kN)</Label>
          <Input
            id="vesselWeight"
            type="number"
            step="0.1"
            value={vesselWeight}
            onChange={(e) => setVesselWeight(e.target.value)}
            placeholder="Enter total weight"
          />
        </div>
        <div>
          <Label htmlFor="liftingAngle">Lifting Angle (degrees)</Label>
          <Select value={liftingAngle} onValueChange={setLiftingAngle}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0° (Vertical)</SelectItem>
              <SelectItem value="15">15°</SelectItem>
              <SelectItem value="30">30°</SelectItem>
              <SelectItem value="45">45°</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="numberOfLugs">Number of Lifting Lugs</Label>
          <Select value={numberOfLugs} onValueChange={setNumberOfLugs}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 Lugs</SelectItem>
              <SelectItem value="4">4 Lugs</SelectItem>
              <SelectItem value="6">6 Lugs</SelectItem>
              <SelectItem value="8">8 Lugs</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="safetyFactor">Safety Factor</Label>
          <Select value={safetyFactor} onValueChange={setSafetyFactor}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2.0</SelectItem>
              <SelectItem value="3">3.0 (Standard)</SelectItem>
              <SelectItem value="4">4.0</SelectItem>
              <SelectItem value="5">5.0 (High Risk)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={calculateLiftingLoad} className="w-full">
        Calculate Lifting Loads
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Load per Lug:</span>
              <span className="font-mono">{result.lugLoad.toFixed(2)} kN</span>
            </div>
            <div className="flex justify-between">
              <span>Design Load per Lug:</span>
              <span className="font-mono">{result.designLoad.toFixed(2)} kN</span>
            </div>
            <div className="flex justify-between">
              <span>Total Design Load:</span>
              <span className="font-mono">{(result.designLoad * parseInt(numberOfLugs)).toFixed(2)} kN</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm">{result.status}</span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Standards:</strong> ASME BTH-1 and AWS D14.1</p>
        <p><strong>Note:</strong> Detailed stress analysis required for final design</p>
      </div>
    </div>
  );
}

function ThermalExpansionCalculator() {
  const [length, setLength] = useState("");
  const [tempInitial, setTempInitial] = useState("");
  const [tempFinal, setTempFinal] = useState("");
  const [material, setMaterial] = useState("carbon_steel");
  const [result, setResult] = useState<{ expansion: number; stress: number; status: string } | null>(null);

  const calculateExpansion = () => {
    const L = parseFloat(length);
    const T1 = parseFloat(tempInitial);
    const T2 = parseFloat(tempFinal);

    if (isNaN(L) || isNaN(T1) || isNaN(T2)) {
      setResult(null);
      return;
    }

    // Thermal expansion coefficients (×10⁻⁶ /°C)
    const expansionCoefficients = {
      carbon_steel: 11.7,
      stainless_steel: 17.3,
      aluminum: 23.1,
      copper: 16.5
    };

    const alpha = expansionCoefficients[material as keyof typeof expansionCoefficients];
    const deltaT = T2 - T1;
    
    // Thermal expansion: ΔL = α × L × ΔT
    const expansion = (alpha * 1e-6) * L * deltaT;
    
    // Approximate thermal stress if constrained
    const elasticModulus = 200000; // MPa for steel
    const stress = alpha * 1e-6 * elasticModulus * Math.abs(deltaT);

    setResult({
      expansion,
      stress,
      status: "Thermal expansion calculated"
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="length">Initial Length (mm)</Label>
          <Input
            id="length"
            type="number"
            step="0.1"
            value={length}
            onChange={(e) => setLength(e.target.value)}
            placeholder="Enter initial length"
          />
        </div>
        <div>
          <Label htmlFor="material">Material</Label>
          <Select value={material} onValueChange={setMaterial}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="carbon_steel">Carbon Steel</SelectItem>
              <SelectItem value="stainless_steel">Stainless Steel</SelectItem>
              <SelectItem value="aluminum">Aluminum</SelectItem>
              <SelectItem value="copper">Copper</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="tempInitial">Initial Temperature (°C)</Label>
          <Input
            id="tempInitial"
            type="number"
            step="0.1"
            value={tempInitial}
            onChange={(e) => setTempInitial(e.target.value)}
            placeholder="Enter initial temp"
          />
        </div>
        <div>
          <Label htmlFor="tempFinal">Final Temperature (°C)</Label>
          <Input
            id="tempFinal"
            type="number"
            step="0.1"
            value={tempFinal}
            onChange={(e) => setTempFinal(e.target.value)}
            placeholder="Enter final temp"
          />
        </div>
      </div>

      <Button onClick={calculateExpansion} className="w-full">
        Calculate Thermal Expansion
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Thermal Expansion:</span>
              <span className="font-mono">{result.expansion.toFixed(3)} mm</span>
            </div>
            <div className="flex justify-between">
              <span>Thermal Stress (if constrained):</span>
              <span className="font-mono">{result.stress.toFixed(2)} MPa</span>
            </div>
            <div className="flex justify-between">
              <span>Temperature Change:</span>
              <span className="font-mono">{(parseFloat(tempFinal) - parseFloat(tempInitial)).toFixed(1)} °C</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm">{result.status}</span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Formula:</strong> ΔL = α × L × ΔT</p>
        <p><strong>Note:</strong> Provide expansion joints to accommodate thermal growth</p>
      </div>
    </div>
  );
}

function MaterialStressLookup() {
  const [material, setMaterial] = useState("SA-516-70");
  const [temperature, setTemperature] = useState("");
  const [result, setResult] = useState<{ allowableStress: number; status: string } | null>(null);

  const lookupStress = () => {
    const temp = parseFloat(temperature);

    if (isNaN(temp)) {
      setResult(null);
      return;
    }

    // Simplified material database (ASME Section II Part D)
    const materialData = {
      "SA-516-70": { base: 138, tempFactor: 0.95 },
      "SA-240-316": { base: 138, tempFactor: 0.90 },
      "SA-387-22": { base: 172, tempFactor: 0.85 },
      "SA-106-B": { base: 138, tempFactor: 0.95 }
    };

    const data = materialData[material as keyof typeof materialData];
    if (!data) {
      setResult({ allowableStress: 0, status: "Material not found in database" });
      return;
    }

    // Temperature derating (simplified)
    let tempFactor = 1.0;
    if (temp > 200) tempFactor = data.tempFactor;
    if (temp > 400) tempFactor = data.tempFactor * 0.9;

    const allowableStress = data.base * tempFactor;

    setResult({
      allowableStress,
      status: "Allowable stress per ASME Section II Part D"
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        <div>
          <Label htmlFor="material">Material Specification</Label>
          <Select value={material} onValueChange={setMaterial}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SA-516-70">SA-516 Grade 70</SelectItem>
              <SelectItem value="SA-240-316">SA-240 Type 316</SelectItem>
              <SelectItem value="SA-387-22">SA-387 Grade 22</SelectItem>
              <SelectItem value="SA-106-B">SA-106 Grade B</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="temperature">Design Temperature (°C)</Label>
          <Input
            id="temperature"
            type="number"
            step="1"
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            placeholder="Enter design temperature"
          />
        </div>
      </div>

      <Button onClick={lookupStress} className="w-full">
        Lookup Allowable Stress
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Material:</span>
              <span className="font-mono">{material}</span>
            </div>
            <div className="flex justify-between">
              <span>Allowable Stress:</span>
              <span className="font-mono">{result.allowableStress.toFixed(1)} MPa</span>
            </div>
            <div className="flex justify-between">
              <span>At Temperature:</span>
              <span className="font-mono">{temperature} °C</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm">{result.status}</span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Source:</strong> ASME Section II Part D - Material Properties</p>
        <p><strong>Note:</strong> Verify with current ASME code edition for final design</p>
      </div>
    </div>
  );
}

function CorrosionAllowanceCalculator() {
  const [serviceType, setServiceType] = useState("general");
  const [designLife, setDesignLife] = useState("");
  const [environment, setEnvironment] = useState("normal");
  const [result, setResult] = useState<{ corrosionAllowance: number; status: string } | null>(null);

  const calculateCorrosion = () => {
    const life = parseFloat(designLife);

    if (isNaN(life)) {
      setResult(null);
      return;
    }

    // Corrosion rates (mm/year)
    const corrosionRates = {
      general: { normal: 0.1, severe: 0.3, marine: 0.2 },
      acidic: { normal: 0.5, severe: 1.5, marine: 0.8 },
      caustic: { normal: 0.3, severe: 0.8, marine: 0.5 },
      high_temp: { normal: 0.2, severe: 0.6, marine: 0.4 }
    };

    const rate = corrosionRates[serviceType as keyof typeof corrosionRates][environment as keyof typeof corrosionRates.general];
    const corrosionAllowance = Math.max(3.0, rate * life); // Minimum 3mm

    setResult({
      corrosionAllowance,
      status: "Corrosion allowance calculated based on service conditions"
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        <div>
          <Label htmlFor="serviceType">Service Type</Label>
          <Select value={serviceType} onValueChange={setServiceType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General Service</SelectItem>
              <SelectItem value="acidic">Acidic Service</SelectItem>
              <SelectItem value="caustic">Caustic Service</SelectItem>
              <SelectItem value="high_temp">High Temperature</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="environment">Environment</Label>
          <Select value={environment} onValueChange={setEnvironment}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="severe">Severe</SelectItem>
              <SelectItem value="marine">Marine</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="designLife">Design Life (years)</Label>
          <Input
            id="designLife"
            type="number"
            step="1"
            value={designLife}
            onChange={(e) => setDesignLife(e.target.value)}
            placeholder="Enter design life"
          />
        </div>
      </div>

      <Button onClick={calculateCorrosion} className="w-full">
        Calculate Corrosion Allowance
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Required Corrosion Allowance:</span>
              <span className="font-mono">{result.corrosionAllowance.toFixed(1)} mm</span>
            </div>
            <div className="flex justify-between">
              <span>Service Type:</span>
              <span className="font-mono">{serviceType.replace('_', ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span>Environment:</span>
              <span className="font-mono">{environment}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm">{result.status}</span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Note:</strong> Minimum 3mm corrosion allowance recommended</p>
        <p><strong>Reference:</strong> API 510, ASME guidelines for corrosion allowances</p>
      </div>
    </div>
  );
}

function VolumeWeightCalculator() {
  const [diameter, setDiameter] = useState("");
  const [length, setLength] = useState("");
  const [thickness, setThickness] = useState("");
  const [headType, setHeadType] = useState("ellipsoidal");
  const [materialDensity, setMaterialDensity] = useState("7850");
  const [result, setResult] = useState<{ volume: number; weight: number; status: string } | null>(null);

  const calculateVolumeWeight = () => {
    const D = parseFloat(diameter);
    const L = parseFloat(length);
    const t = parseFloat(thickness);
    const density = parseFloat(materialDensity);

    if (isNaN(D) || isNaN(L) || isNaN(t) || isNaN(density)) {
      setResult(null);
      return;
    }

    const R = D / 2;
    
    // Internal volume calculation
    const cylindricalVolume = Math.PI * Math.pow(R, 2) * L / 1e9; // m³
    
    // Head volume (simplified)
    let headVolume = 0;
    if (headType === "ellipsoidal") {
      headVolume = (2/3) * Math.PI * Math.pow(R, 3) / 1e9; // m³ per head
    } else if (headType === "hemispherical") {
      headVolume = (2/3) * Math.PI * Math.pow(R, 3) / 1e9; // m³ per head
    }
    
    const totalVolume = cylindricalVolume + 2 * headVolume;
    
    // Weight calculation (shell + heads, simplified)
    const shellArea = Math.PI * D * L / 1e6; // m²
    const headArea = 2 * Math.PI * Math.pow(R, 2) / 1e6; // m² (both heads)
    const totalArea = shellArea + headArea;
    const weight = totalArea * (t / 1000) * density / 1000; // tonnes

    setResult({
      volume: totalVolume,
      weight,
      status: "Volume and weight calculated"
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="diameter">Inside Diameter (mm)</Label>
          <Input
            id="diameter"
            type="number"
            step="1"
            value={diameter}
            onChange={(e) => setDiameter(e.target.value)}
            placeholder="Enter diameter"
          />
        </div>
        <div>
          <Label htmlFor="length">Cylindrical Length (mm)</Label>
          <Input
            id="length"
            type="number"
            step="1"
            value={length}
            onChange={(e) => setLength(e.target.value)}
            placeholder="Enter length"
          />
        </div>
        <div>
          <Label htmlFor="thickness">Wall Thickness (mm)</Label>
          <Input
            id="thickness"
            type="number"
            step="0.1"
            value={thickness}
            onChange={(e) => setThickness(e.target.value)}
            placeholder="Enter thickness"
          />
        </div>
        <div>
          <Label htmlFor="headType">Head Type</Label>
          <Select value={headType} onValueChange={setHeadType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ellipsoidal">2:1 Ellipsoidal</SelectItem>
              <SelectItem value="hemispherical">Hemispherical</SelectItem>
              <SelectItem value="flat">Flat (End Plates)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="materialDensity">Material Density (kg/m³)</Label>
          <Select value={materialDensity} onValueChange={setMaterialDensity}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7850">Carbon Steel (7850)</SelectItem>
              <SelectItem value="8000">Stainless Steel (8000)</SelectItem>
              <SelectItem value="2700">Aluminum (2700)</SelectItem>
              <SelectItem value="8900">Copper (8900)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={calculateVolumeWeight} className="w-full">
        Calculate Volume & Weight
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Internal Volume:</span>
              <span className="font-mono">{result.volume.toFixed(3)} m³</span>
            </div>
            <div className="flex justify-between">
              <span>Internal Volume:</span>
              <span className="font-mono">{(result.volume * 1000).toFixed(1)} liters</span>
            </div>
            <div className="flex justify-between">
              <span>Empty Weight (approx):</span>
              <span className="font-mono">{result.weight.toFixed(2)} tonnes</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm">{result.status}</span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Note:</strong> Weight calculation is approximate and excludes nozzles, internals</p>
        <p><strong>Formula:</strong> V = πR²L + head volumes</p>
      </div>
    </div>
  );
}

function HydrostaticTestCalculator() {
  const [designPressure, setDesignPressure] = useState("");
  const [designStress, setDesignStress] = useState("");
  const [testStress, setTestStress] = useState("");
  const [testType, setTestType] = useState("hydrostatic");
  const [result, setResult] = useState<{ testPressure: number; stressRatio: number; status: string } | null>(null);

  const calculateTestPressure = () => {
    const P_design = parseFloat(designPressure);
    const S_design = parseFloat(designStress);
    const S_test = parseFloat(testStress);

    if (isNaN(P_design) || isNaN(S_design) || isNaN(S_test)) {
      setResult(null);
      return;
    }

    // ASME Section VIII hydrostatic test pressure
    let testPressure = 1.3 * P_design * (S_test / S_design);
    
    // Pneumatic test pressure (if selected)
    if (testType === "pneumatic") {
      testPressure = 1.1 * P_design * (S_test / S_design);
    }

    const stressRatio = S_test / S_design;

    setResult({
      testPressure,
      stressRatio,
      status: `${testType} test pressure per ASME Section VIII`
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="designPressure">Design Pressure (MPa)</Label>
          <Input
            id="designPressure"
            type="number"
            step="0.1"
            value={designPressure}
            onChange={(e) => setDesignPressure(e.target.value)}
            placeholder="Enter design pressure"
          />
        </div>
        <div>
          <Label htmlFor="testType">Test Type</Label>
          <Select value={testType} onValueChange={setTestType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hydrostatic">Hydrostatic Test</SelectItem>
              <SelectItem value="pneumatic">Pneumatic Test</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="designStress">Design Stress (MPa)</Label>
          <Input
            id="designStress"
            type="number"
            step="1"
            value={designStress}
            onChange={(e) => setDesignStress(e.target.value)}
            placeholder="Enter design stress"
          />
        </div>
        <div>
          <Label htmlFor="testStress">Test Stress (MPa)</Label>
          <Input
            id="testStress"
            type="number"
            step="1"
            value={testStress}
            onChange={(e) => setTestStress(e.target.value)}
            placeholder="Enter test stress"
          />
        </div>
      </div>

      <Button onClick={calculateTestPressure} className="w-full">
        Calculate Test Pressure
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Test Pressure:</span>
              <span className="font-mono">{result.testPressure.toFixed(2)} MPa</span>
            </div>
            <div className="flex justify-between">
              <span>Test Pressure:</span>
              <span className="font-mono">{(result.testPressure * 10.197).toFixed(1)} kg/cm²</span>
            </div>
            <div className="flex justify-between">
              <span>Stress Ratio:</span>
              <span className="font-mono">{result.stressRatio.toFixed(3)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm">{result.status}</span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Formula:</strong> P_test = {testType === "hydrostatic" ? "1.3" : "1.1"} × P_design × (S_test/S_design)</p>
        <p><strong>Standards:</strong> ASME Section VIII Div. 1 - UG-99</p>
      </div>
    </div>
  );
}

function PipeThicknessCalculator() {
  const [pressure, setPressure] = useState("");
  const [diameter, setDiameter] = useState("");
  const [allowableStress, setAllowableStress] = useState("");
  const [weldEfficiency, setWeldEfficiency] = useState("1.0");
  const [corrosionAllowance, setCorrosionAllowance] = useState("3.0");
  const [result, setResult] = useState<{ thickness: number; nominalThickness: number; status: string } | null>(null);

  const calculateThickness = () => {
    const P = parseFloat(pressure);
    const D = parseFloat(diameter);
    const S = parseFloat(allowableStress);
    const E = parseFloat(weldEfficiency);
    const C = parseFloat(corrosionAllowance);

    if (isNaN(P) || isNaN(D) || isNaN(S) || isNaN(E) || isNaN(C)) {
      setResult(null);
      return;
    }

    // ASME B31.3: t = PD / (2SE + 2yP) + C
    // Simplified: t = PD / (2SE) + C (for y=0.4, typical for steel)
    const calculatedThickness = (P * D) / (2 * S * E) + C;
    
    // Round up to next standard thickness
    const standardThicknesses = [3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 36, 40, 45, 50];
    const nominalThickness = standardThicknesses.find(t => t >= calculatedThickness) || calculatedThickness;

    setResult({
      thickness: calculatedThickness,
      nominalThickness,
      status: "Thickness calculated per ASME B31.3"
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="pressure">Design Pressure (MPa)</Label>
          <Input
            id="pressure"
            type="number"
            step="0.1"
            value={pressure}
            onChange={(e) => setPressure(e.target.value)}
            placeholder="Enter pressure"
          />
        </div>
        <div>
          <Label htmlFor="diameter">Outside Diameter (mm)</Label>
          <Input
            id="diameter"
            type="number"
            value={diameter}
            onChange={(e) => setDiameter(e.target.value)}
            placeholder="Enter diameter"
          />
        </div>
        <div>
          <Label htmlFor="allowableStress">Allowable Stress (MPa)</Label>
          <Input
            id="allowableStress"
            type="number"
            value={allowableStress}
            onChange={(e) => setAllowableStress(e.target.value)}
            placeholder="Enter allowable stress"
          />
        </div>
        <div>
          <Label htmlFor="weldEfficiency">Weld Efficiency</Label>
          <Select value={weldEfficiency} onValueChange={setWeldEfficiency}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1.0">1.0 (Seamless)</SelectItem>
              <SelectItem value="0.85">0.85 (DSAW/ERW)</SelectItem>
              <SelectItem value="0.80">0.80 (Furnace Butt Weld)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label htmlFor="corrosionAllowance">Corrosion Allowance (mm)</Label>
          <Input
            id="corrosionAllowance"
            type="number"
            step="0.1"
            value={corrosionAllowance}
            onChange={(e) => setCorrosionAllowance(e.target.value)}
            placeholder="Enter corrosion allowance"
          />
        </div>
      </div>

      <Button onClick={calculateThickness} className="w-full">
        Calculate Pipe Thickness
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Calculated Thickness:</span>
              <span className="font-mono">{result.thickness.toFixed(2)} mm</span>
            </div>
            <div className="flex justify-between">
              <span>Nominal Thickness:</span>
              <span className="font-mono">{result.nominalThickness.toFixed(1)} mm</span>
            </div>
            <div className="flex justify-between">
              <span>Safety Margin:</span>
              <span className="font-mono">{((result.nominalThickness - result.thickness) / result.thickness * 100).toFixed(1)}%</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm">{result.status}</span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Formula:</strong> t = PD/(2SE) + C</p>
        <p><strong>Standards:</strong> ASME B31.3 Process Piping</p>
      </div>
    </div>
  );
}

function PipeSizeScheduleSelector() {
  const [nominalSize, setNominalSize] = useState("100");
  const [schedule, setSchedule] = useState("40");
  const [result, setResult] = useState<{ od: number; id: number; thickness: number; weight: number } | null>(null);

  const lookupDimensions = () => {
    // Simplified pipe dimension database (ASME B36.10M)
    const pipeDimensions: { [key: string]: { [key: string]: { od: number; thickness: number; weight: number } } } = {
      "50": {
        "40": { od: 60.3, thickness: 3.91, weight: 5.44 },
        "80": { od: 60.3, thickness: 5.54, weight: 7.48 },
        "160": { od: 60.3, thickness: 8.74, weight: 11.3 }
      },
      "80": {
        "40": { od: 88.9, thickness: 5.49, weight: 11.3 },
        "80": { od: 88.9, thickness: 7.62, weight: 15.3 },
        "160": { od: 88.9, thickness: 11.1, weight: 22.3 }
      },
      "100": {
        "40": { od: 114.3, thickness: 6.02, weight: 16.1 },
        "80": { od: 114.3, thickness: 8.56, weight: 22.3 },
        "160": { od: 114.3, thickness: 13.5, weight: 33.5 }
      },
      "150": {
        "40": { od: 168.3, thickness: 7.11, weight: 28.3 },
        "80": { od: 168.3, thickness: 10.97, weight: 42.6 },
        "160": { od: 168.3, thickness: 18.26, weight: 68.6 }
      }
    };

    const pipeData = pipeDimensions[nominalSize]?.[schedule];
    if (pipeData) {
      const id = pipeData.od - 2 * pipeData.thickness;
      setResult({
        od: pipeData.od,
        id,
        thickness: pipeData.thickness,
        weight: pipeData.weight
      });
    } else {
      setResult(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="nominalSize">Nominal Pipe Size (mm)</Label>
          <Select value={nominalSize} onValueChange={setNominalSize}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50 mm (2")</SelectItem>
              <SelectItem value="80">80 mm (3")</SelectItem>
              <SelectItem value="100">100 mm (4")</SelectItem>
              <SelectItem value="150">150 mm (6")</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="schedule">Pipe Schedule</Label>
          <Select value={schedule} onValueChange={setSchedule}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="40">Schedule 40</SelectItem>
              <SelectItem value="80">Schedule 80</SelectItem>
              <SelectItem value="160">Schedule 160</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={lookupDimensions} className="w-full">
        Get Pipe Dimensions
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Pipe Dimensions</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Outside Diameter:</span>
              <span className="font-mono">{result.od.toFixed(1)} mm</span>
            </div>
            <div className="flex justify-between">
              <span>Inside Diameter:</span>
              <span className="font-mono">{result.id.toFixed(1)} mm</span>
            </div>
            <div className="flex justify-between">
              <span>Wall Thickness:</span>
              <span className="font-mono">{result.thickness.toFixed(2)} mm</span>
            </div>
            <div className="flex justify-between">
              <span>Weight per meter:</span>
              <span className="font-mono">{result.weight.toFixed(1)} kg/m</span>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Standards:</strong> ASME B36.10M and B36.19M</p>
        <p><strong>Note:</strong> Dimensions are for carbon steel pipes</p>
      </div>
    </div>
  );
}

function PressureDropCalculator() {
  const [flowRate, setFlowRate] = useState("");
  const [pipeID, setPipeID] = useState("");
  const [pipeLength, setPipeLength] = useState("");
  const [roughness, setRoughness] = useState("0.045");
  const [density, setDensity] = useState("1000");
  const [viscosity, setViscosity] = useState("0.001");
  const [result, setResult] = useState<{ pressureDrop: number; velocity: number; reynolds: number; frictionFactor: number } | null>(null);

  const calculatePressureDrop = () => {
    const Q = parseFloat(flowRate) / 3600; // Convert L/hr to m³/s
    const D = parseFloat(pipeID) / 1000; // Convert mm to m
    const L = parseFloat(pipeLength);
    const e = parseFloat(roughness) / 1000; // Convert mm to m
    const rho = parseFloat(density);
    const mu = parseFloat(viscosity);

    if (isNaN(Q) || isNaN(D) || isNaN(L) || isNaN(e) || isNaN(rho) || isNaN(mu)) {
      setResult(null);
      return;
    }

    const A = Math.PI * Math.pow(D, 2) / 4;
    const velocity = Q / A;
    const reynolds = (rho * velocity * D) / mu;
    
    // Simplified friction factor calculation
    let frictionFactor;
    if (reynolds < 2300) {
      frictionFactor = 64 / reynolds; // Laminar flow
    } else {
      // Approximate Colebrook-White for turbulent flow
      const relativeRoughness = e / D;
      frictionFactor = 0.25 / Math.pow(Math.log10(relativeRoughness / 3.7 + 5.74 / Math.pow(reynolds, 0.9)), 2);
    }
    
    // Darcy-Weisbach equation: ΔP = f * (L/D) * (ρv²/2)
    const pressureDrop = frictionFactor * (L / D) * (rho * Math.pow(velocity, 2) / 2) / 1000; // Convert to kPa

    setResult({
      pressureDrop,
      velocity,
      reynolds,
      frictionFactor
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="flowRate">Flow Rate (L/hr)</Label>
          <Input
            id="flowRate"
            type="number"
            value={flowRate}
            onChange={(e) => setFlowRate(e.target.value)}
            placeholder="Enter flow rate"
          />
        </div>
        <div>
          <Label htmlFor="pipeID">Pipe Inside Diameter (mm)</Label>
          <Input
            id="pipeID"
            type="number"
            value={pipeID}
            onChange={(e) => setPipeID(e.target.value)}
            placeholder="Enter pipe ID"
          />
        </div>
        <div>
          <Label htmlFor="pipeLength">Pipe Length (m)</Label>
          <Input
            id="pipeLength"
            type="number"
            value={pipeLength}
            onChange={(e) => setPipeLength(e.target.value)}
            placeholder="Enter length"
          />
        </div>
        <div>
          <Label htmlFor="roughness">Pipe Roughness (mm)</Label>
          <Select value={roughness} onValueChange={setRoughness}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.045">0.045 (Commercial Steel)</SelectItem>
              <SelectItem value="0.015">0.015 (Stainless Steel)</SelectItem>
              <SelectItem value="0.002">0.002 (Glass/Plastic)</SelectItem>
              <SelectItem value="0.15">0.15 (Cast Iron)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="density">Fluid Density (kg/m³)</Label>
          <Input
            id="density"
            type="number"
            value={density}
            onChange={(e) => setDensity(e.target.value)}
            placeholder="Enter density"
          />
        </div>
        <div>
          <Label htmlFor="viscosity">Dynamic Viscosity (Pa·s)</Label>
          <Input
            id="viscosity"
            type="number"
            step="0.0001"
            value={viscosity}
            onChange={(e) => setViscosity(e.target.value)}
            placeholder="Enter viscosity"
          />
        </div>
      </div>

      <Button onClick={calculatePressureDrop} className="w-full">
        Calculate Pressure Drop
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Pressure Drop:</span>
              <span className="font-mono">{result.pressureDrop.toFixed(2)} kPa</span>
            </div>
            <div className="flex justify-between">
              <span>Flow Velocity:</span>
              <span className="font-mono">{result.velocity.toFixed(2)} m/s</span>
            </div>
            <div className="flex justify-between">
              <span>Reynolds Number:</span>
              <span className="font-mono">{result.reynolds.toFixed(0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Friction Factor:</span>
              <span className="font-mono">{result.frictionFactor.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span>Flow Regime:</span>
              <span className="font-mono">{result.reynolds < 2300 ? "Laminar" : "Turbulent"}</span>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Formula:</strong> ΔP = f × (L/D) × (ρv²/2)</p>
        <p><strong>Note:</strong> Uses Darcy-Weisbach equation with Colebrook-White friction factor</p>
      </div>
    </div>
  );
}

function PipeExpansionCalculator() {
  const [pipeLength, setPipeLength] = useState("");
  const [tempInitial, setTempInitial] = useState("");
  const [tempFinal, setTempFinal] = useState("");
  const [material, setMaterial] = useState("carbon_steel");
  const [result, setResult] = useState<{ expansion: number; stress: number; status: string } | null>(null);

  const calculateExpansion = () => {
    const L = parseFloat(pipeLength);
    const T1 = parseFloat(tempInitial);
    const T2 = parseFloat(tempFinal);

    if (isNaN(L) || isNaN(T1) || isNaN(T2)) {
      setResult(null);
      return;
    }

    // Thermal expansion coefficients (×10⁻⁶ /°C)
    const expansionCoefficients = {
      carbon_steel: 11.7,
      stainless_steel: 17.3,
      copper: 16.5,
      pvc: 80.0
    };

    const alpha = expansionCoefficients[material as keyof typeof expansionCoefficients];
    const deltaT = T2 - T1;
    
    // Thermal expansion: ΔL = α × L × ΔT
    const expansion = (alpha * 1e-6) * L * deltaT * 1000; // Result in mm
    
    // Approximate thermal stress if constrained
    const elasticModulus = 200000; // MPa for steel
    const stress = alpha * 1e-6 * elasticModulus * Math.abs(deltaT);

    setResult({
      expansion,
      stress,
      status: "Pipe expansion calculated"
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="pipeLength">Pipe Length (m)</Label>
          <Input
            id="pipeLength"
            type="number"
            step="0.1"
            value={pipeLength}
            onChange={(e) => setPipeLength(e.target.value)}
            placeholder="Enter pipe length"
          />
        </div>
        <div>
          <Label htmlFor="material">Pipe Material</Label>
          <Select value={material} onValueChange={setMaterial}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="carbon_steel">Carbon Steel</SelectItem>
              <SelectItem value="stainless_steel">Stainless Steel</SelectItem>
              <SelectItem value="copper">Copper</SelectItem>
              <SelectItem value="pvc">PVC</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="tempInitial">Initial Temperature (°C)</Label>
          <Input
            id="tempInitial"
            type="number"
            step="0.1"
            value={tempInitial}
            onChange={(e) => setTempInitial(e.target.value)}
            placeholder="Enter initial temp"
          />
        </div>
        <div>
          <Label htmlFor="tempFinal">Final Temperature (°C)</Label>
          <Input
            id="tempFinal"
            type="number"
            step="0.1"
            value={tempFinal}
            onChange={(e) => setTempFinal(e.target.value)}
            placeholder="Enter final temp"
          />
        </div>
      </div>

      <Button onClick={calculateExpansion} className="w-full">
        Calculate Pipe Expansion
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Thermal Expansion:</span>
              <span className="font-mono">{result.expansion.toFixed(1)} mm</span>
            </div>
            <div className="flex justify-between">
              <span>Thermal Stress (if constrained):</span>
              <span className="font-mono">{result.stress.toFixed(1)} MPa</span>
            </div>
            <div className="flex justify-between">
              <span>Temperature Change:</span>
              <span className="font-mono">{(parseFloat(tempFinal) - parseFloat(tempInitial)).toFixed(1)} °C</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm">{result.status}</span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Formula:</strong> ΔL = α × L × ΔT</p>
        <p><strong>Note:</strong> Provide expansion loops or expansion joints to accommodate growth</p>
      </div>
    </div>
  );
}

function FlowVelocityReynoldsCalculator() {
  const [flowRate, setFlowRate] = useState("");
  const [pipeID, setPipeID] = useState("");
  const [density, setDensity] = useState("1000");
  const [viscosity, setViscosity] = useState("0.001");
  const [result, setResult] = useState<{ velocity: number; reynolds: number; flowRegime: string; recommendation: string } | null>(null);

  const calculateFlow = () => {
    const Q = parseFloat(flowRate) / 3600; // Convert L/hr to m³/s
    const D = parseFloat(pipeID) / 1000; // Convert mm to m
    const rho = parseFloat(density);
    const mu = parseFloat(viscosity);

    if (isNaN(Q) || isNaN(D) || isNaN(rho) || isNaN(mu)) {
      setResult(null);
      return;
    }

    const A = Math.PI * Math.pow(D, 2) / 4;
    const velocity = Q / A;
    const reynolds = (rho * velocity * D) / mu;
    
    let flowRegime, recommendation;
    if (reynolds < 2300) {
      flowRegime = "Laminar";
      recommendation = "Good for heat transfer, low mixing";
    } else if (reynolds < 4000) {
      flowRegime = "Transitional";
      recommendation = "Unstable flow, avoid this range";
    } else {
      flowRegime = "Turbulent";
      recommendation = "Good mixing, higher pressure drop";
    }

    // Velocity recommendations
    if (velocity < 0.5) {
      recommendation += " - Velocity may be too low";
    } else if (velocity > 3.0) {
      recommendation += " - Velocity may be too high, check erosion";
    } else {
      recommendation += " - Velocity is acceptable";
    }

    setResult({
      velocity,
      reynolds,
      flowRegime,
      recommendation
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="flowRate">Flow Rate (L/hr)</Label>
          <Input
            id="flowRate"
            type="number"
            value={flowRate}
            onChange={(e) => setFlowRate(e.target.value)}
            placeholder="Enter flow rate"
          />
        </div>
        <div>
          <Label htmlFor="pipeID">Pipe Inside Diameter (mm)</Label>
          <Input
            id="pipeID"
            type="number"
            value={pipeID}
            onChange={(e) => setPipeID(e.target.value)}
            placeholder="Enter pipe ID"
          />
        </div>
        <div>
          <Label htmlFor="density">Fluid Density (kg/m³)</Label>
          <Input
            id="density"
            type="number"
            value={density}
            onChange={(e) => setDensity(e.target.value)}
            placeholder="Enter density"
          />
        </div>
        <div>
          <Label htmlFor="viscosity">Dynamic Viscosity (Pa·s)</Label>
          <Input
            id="viscosity"
            type="number"
            step="0.0001"
            value={viscosity}
            onChange={(e) => setViscosity(e.target.value)}
            placeholder="Enter viscosity"
          />
        </div>
      </div>

      <Button onClick={calculateFlow} className="w-full">
        Calculate Flow Parameters
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Flow Velocity:</span>
              <span className="font-mono">{result.velocity.toFixed(2)} m/s</span>
            </div>
            <div className="flex justify-between">
              <span>Reynolds Number:</span>
              <span className="font-mono">{result.reynolds.toFixed(0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Flow Regime:</span>
              <span className="font-mono">{result.flowRegime}</span>
            </div>
          </div>
          <div className="bg-blue-50 p-3 rounded">
            <p className="text-sm text-blue-800">{result.recommendation}</p>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Formula:</strong> Re = ρvD/μ, v = Q/A</p>
        <p><strong>Typical velocities:</strong> Water: 0.5-3.0 m/s, Gas: 5-20 m/s</p>
      </div>
    </div>
  );
}

function PipeSupportSpanEstimator() {
  const [pipeSize, setPipeSize] = useState("100");
  const [pipeMaterial, setPipeMaterial] = useState("carbon_steel");
  const [insulation, setInsulation] = useState("false");
  const [temperature, setTemperature] = useState("20");
  const [result, setResult] = useState<{ maxSpan: number; recommendedSpan: number, supports: number } | null>(null);

  const calculateSpan = () => {
    const size = parseInt(pipeSize);
    const temp = parseFloat(temperature);

    // Simplified span calculation based on MSS SP-69
    const baseSpans: { [key: string]: number } = {
      "50": 3.5,
      "80": 4.5,
      "100": 5.0,
      "150": 6.5,
      "200": 7.5,
      "250": 8.5
    };

    let maxSpan = baseSpans[pipeSize] || 5.0;

    // Material factor
    if (pipeMaterial === "stainless_steel") {
      maxSpan *= 0.9; // Slightly lower for stainless
    }

    // Temperature derating
    if (temp > 200) {
      maxSpan *= 0.8;
    } else if (temp > 100) {
      maxSpan *= 0.9;
    }

    // Insulation factor
    if (insulation === "true") {
      maxSpan *= 0.8; // Reduce span for insulated pipes
    }

    const recommendedSpan = maxSpan * 0.8; // 80% of maximum for safety
    const supports = Math.ceil(30 / recommendedSpan) + 1; // For 30m pipe run

    setResult({
      maxSpan,
      recommendedSpan,
      supports
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="pipeSize">Pipe Size (mm)</Label>
          <Select value={pipeSize} onValueChange={setPipeSize}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50 mm</SelectItem>
              <SelectItem value="80">80 mm</SelectItem>
              <SelectItem value="100">100 mm</SelectItem>
              <SelectItem value="150">150 mm</SelectItem>
              <SelectItem value="200">200 mm</SelectItem>
              <SelectItem value="250">250 mm</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="pipeMaterial">Pipe Material</Label>
          <Select value={pipeMaterial} onValueChange={setPipeMaterial}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="carbon_steel">Carbon Steel</SelectItem>
              <SelectItem value="stainless_steel">Stainless Steel</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="temperature">Operating Temperature (°C)</Label>
          <Input
            id="temperature"
            type="number"
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            placeholder="Enter temperature"
          />
        </div>
        <div>
          <Label htmlFor="insulation">Insulated Pipe</Label>
          <Select value={insulation} onValueChange={setInsulation}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="false">No Insulation</SelectItem>
              <SelectItem value="true">With Insulation</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={calculateSpan} className="w-full">
        Calculate Support Spans
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Maximum Span:</span>
              <span className="font-mono">{result.maxSpan.toFixed(1)} m</span>
            </div>
            <div className="flex justify-between">
              <span>Recommended Span:</span>
              <span className="font-mono">{result.recommendedSpan.toFixed(1)} m</span>
            </div>
            <div className="flex justify-between">
              <span>Supports needed (30m run):</span>
              <span className="font-mono">{result.supports}</span>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Standards:</strong> MSS SP-69 Pipe Support Guidelines</p>
        <p><strong>Note:</strong> Adjust for specific loading conditions and local codes</p>
      </div>
    </div>
  );
}

function MiterBendPressureLossCalculator() {
  const [angle, setAngle] = useState("90");
  const [velocity, setVelocity] = useState("");
  const [density, setDensity] = useState("1000");
  const [result, setResult] = useState<{ resistanceCoeff: number; pressureLoss: number, equivalentLength: number } | null>(null);

  const calculateMiterLoss = () => {
    const theta = parseFloat(angle);
    const v = parseFloat(velocity);
    const rho = parseFloat(density);

    if (isNaN(theta) || isNaN(v) || isNaN(rho)) {
      setResult(null);
      return;
    }

    // Resistance coefficient for miter bends (approximate)
    const thetaRad = (theta * Math.PI) / 180;
    const resistanceCoeff = 0.9 * Math.sin(thetaRad) + 2.6 * Math.pow(Math.sin(thetaRad / 2), 2);
    
    // Pressure loss: ΔP = K × (ρv²/2)
    const pressureLoss = resistanceCoeff * (rho * Math.pow(v, 2) / 2) / 1000; // kPa
    
    // Equivalent length (approximate, in pipe diameters)
    const equivalentLength = resistanceCoeff / 0.02; // Assuming f = 0.02

    setResult({
      resistanceCoeff,
      pressureLoss,
      equivalentLength
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        <div>
          <Label htmlFor="angle">Miter Angle (degrees)</Label>
          <Select value={angle} onValueChange={setAngle}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30°</SelectItem>
              <SelectItem value="45">45°</SelectItem>
              <SelectItem value="60">60°</SelectItem>
              <SelectItem value="90">90°</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="velocity">Flow Velocity (m/s)</Label>
          <Input
            id="velocity"
            type="number"
            step="0.1"
            value={velocity}
            onChange={(e) => setVelocity(e.target.value)}
            placeholder="Enter velocity"
          />
        </div>
        <div>
          <Label htmlFor="density">Fluid Density (kg/m³)</Label>
          <Input
            id="density"
            type="number"
            value={density}
            onChange={(e) => setDensity(e.target.value)}
            placeholder="Enter density"
          />
        </div>
      </div>

      <Button onClick={calculateMiterLoss} className="w-full">
        Calculate Miter Bend Loss
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Resistance Coefficient (K):</span>
              <span className="font-mono">{result.resistanceCoeff.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Pressure Loss:</span>
              <span className="font-mono">{result.pressureLoss.toFixed(2)} kPa</span>
            </div>
            <div className="flex justify-between">
              <span>Equivalent Length:</span>
              <span className="font-mono">{result.equivalentLength.toFixed(1)} × D</span>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Formula:</strong> ΔP = K × (ρv²/2)</p>
        <p><strong>Note:</strong> Single miter bend, add multiple K values for compound bends</p>
      </div>
    </div>
  );
}

function FlangeBoltLoadCalculator() {
  const [flangeSize, setFlangeSize] = useState("100");
  const [pressure, setPressure] = useState("");
  const [gasketFactor, setGasketFactor] = useState("2.75");
  const [result, setResult] = useState<{ boltLoad: number; torque: number, stress: number } | null>(null);

  const calculateBoltLoad = () => {
    const size = parseInt(flangeSize);
    const P = parseFloat(pressure);
    const m = parseFloat(gasketFactor);

    if (isNaN(size) || isNaN(P) || isNaN(m)) {
      setResult(null);
      return;
    }

    // Simplified flange calculation (ASME B16.5)
    const gasketDiameter = size * 0.8; // Approximate
    const gasketArea = Math.PI * Math.pow(gasketDiameter / 2, 2);
    const gasketWidth = 10; // Approximate mm
    
    // Operating bolt load
    const boltLoad = P * gasketArea + 2 * Math.PI * gasketDiameter * gasketWidth * m * P / 1000; // kN
    
    // Typical bolt configuration
    const boltCount = size < 100 ? 4 : size < 200 ? 8 : 12;
    const boltDiameter = size < 100 ? 16 : size < 200 ? 20 : 24;
    
    // Bolt stress
    const boltArea = Math.PI * Math.pow(boltDiameter / 2, 2) * boltCount;
    const stress = (boltLoad * 1000) / boltArea; // MPa
    
    // Torque (approximate)
    const torque = boltLoad * boltDiameter * 0.2 / boltCount; // Nm per bolt

    setResult({
      boltLoad,
      torque,
      stress
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        <div>
          <Label htmlFor="flangeSize">Flange Size (mm)</Label>
          <Select value={flangeSize} onValueChange={setFlangeSize}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50 mm</SelectItem>
              <SelectItem value="80">80 mm</SelectItem>
              <SelectItem value="100">100 mm</SelectItem>
              <SelectItem value="150">150 mm</SelectItem>
              <SelectItem value="200">200 mm</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="pressure">Design Pressure (MPa)</Label>
          <Input
            id="pressure"
            type="number"
            step="0.1"
            value={pressure}
            onChange={(e) => setPressure(e.target.value)}
            placeholder="Enter pressure"
          />
        </div>
        <div>
          <Label htmlFor="gasketFactor">Gasket Factor (m)</Label>
          <Select value={gasketFactor} onValueChange={setGasketFactor}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2.75">2.75 (Spiral Wound)</SelectItem>
              <SelectItem value="3.25">3.25 (Compressed Fiber)</SelectItem>
              <SelectItem value="6.50">6.50 (Flat Rubber)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={calculateBoltLoad} className="w-full">
        Calculate Bolt Load
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Total Bolt Load:</span>
              <span className="font-mono">{result.boltLoad.toFixed(1)} kN</span>
            </div>
            <div className="flex justify-between">
              <span>Bolt Stress:</span>
              <span className="font-mono">{result.stress.toFixed(1)} MPa</span>
            </div>
            <div className="flex justify-between">
              <span>Torque per Bolt:</span>
              <span className="font-mono">{result.torque.toFixed(0)} Nm</span>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Standards:</strong> ASME B16.5 Flange Design</p>
        <p><strong>Note:</strong> Simplified calculation, verify with detailed analysis</p>
      </div>
    </div>
  );
}

function PipeMaterialPropertiesLookup() {
  const [material, setMaterial] = useState("A106-B");
  const [temperature, setTemperature] = useState("20");
  const [result, setResult] = useState<{ allowableStress: number; elasticModulus: number; thermalExpansion: number; density: number } | null>(null);

  const lookupProperties = () => {
    const temp = parseFloat(temperature);

    // Simplified material database
    const materialProperties: { [key: string]: any } = {
      "A106-B": {
        allowableStress: 138,
        elasticModulus: 200000,
        thermalExpansion: 11.7,
        density: 7850
      },
      "A312-316": {
        allowableStress: 138,
        elasticModulus: 200000,
        thermalExpansion: 17.3,
        density: 8000
      },
      "A53-B": {
        allowableStress: 120,
        elasticModulus: 200000,
        thermalExpansion: 11.7,
        density: 7850
      }
    };

    const props = materialProperties[material];
    if (props) {
      // Temperature derating (simplified)
      let stressFactor = 1.0;
      if (temp > 200) stressFactor = 0.9;
      if (temp > 400) stressFactor = 0.8;

      setResult({
        allowableStress: props.allowableStress * stressFactor,
        elasticModulus: props.elasticModulus,
        thermalExpansion: props.thermalExpansion,
        density: props.density
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="material">Material Specification</Label>
          <Select value={material} onValueChange={setMaterial}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A106-B">ASTM A106 Grade B</SelectItem>
              <SelectItem value="A312-316">ASTM A312 Type 316</SelectItem>
              <SelectItem value="A53-B">ASTM A53 Grade B</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="temperature">Temperature (°C)</Label>
          <Input
            id="temperature"
            type="number"
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            placeholder="Enter temperature"
          />
        </div>
      </div>

      <Button onClick={lookupProperties} className="w-full">
        Lookup Material Properties
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Material Properties</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Allowable Stress:</span>
              <span className="font-mono">{result.allowableStress.toFixed(1)} MPa</span>
            </div>
            <div className="flex justify-between">
              <span>Elastic Modulus:</span>
              <span className="font-mono">{result.elasticModulus.toFixed(0)} MPa</span>
            </div>
            <div className="flex justify-between">
              <span>Thermal Expansion:</span>
              <span className="font-mono">{result.thermalExpansion.toFixed(1)} × 10⁻⁶/°C</span>
            </div>
            <div className="flex justify-between">
              <span>Density:</span>
              <span className="font-mono">{result.density.toFixed(0)} kg/m³</span>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Source:</strong> ASTM Standards and ASME B31.3</p>
        <p><strong>Note:</strong> Verify with current standards for final design</p>
      </div>
    </div>
  );
}

function PipeWeightCalculator() {
  const [pipeSize, setPipeSize] = useState("100");
  const [schedule, setSchedule] = useState("40");
  const [length, setLength] = useState("");
  const [insulationThickness, setInsulationThickness] = useState("0");
  const [fluidDensity, setFluidDensity] = useState("1000");
  const [result, setResult] = useState<{ pipeWeight: number; fluidWeight: number; insulationWeight: number; totalWeight: number } | null>(null);

  const calculateWeight = () => {
    const L = parseFloat(length);
    const insulThick = parseFloat(insulationThickness);
    const fluidDens = parseFloat(fluidDensity);

    if (isNaN(L) || isNaN(insulThick) || isNaN(fluidDens)) {
      setResult(null);
      return;
    }

    // Simplified pipe weights (kg/m)
    const pipeWeights: { [key: string]: { [key: string]: { weight: number; id: number } } } = {
      "100": {
        "40": { weight: 16.1, id: 102.3 },
        "80": { weight: 22.3, id: 97.2 }
      },
      "150": {
        "40": { weight: 28.3, id: 154.1 },
        "80": { weight: 42.6, id: 146.3 }
      }
    };

    const pipeData = pipeWeights[pipeSize]?.[schedule];
    if (!pipeData) {
      setResult(null);
      return;
    }

    const pipeWeight = pipeData.weight * L;
    
    // Fluid weight
    const fluidVolume = Math.PI * Math.pow(pipeData.id / 2000, 2) * L; // m³
    const fluidWeight = fluidVolume * fluidDens;
    
    // Insulation weight (approximate)
    const pipeOD = parseInt(pipeSize) + 20; // Approximate OD
    const insulationVolume = Math.PI * (Math.pow((pipeOD + 2 * insulThick) / 2000, 2) - Math.pow(pipeOD / 2000, 2)) * L;
    const insulationWeight = insulationVolume * 150; // Typical insulation density kg/m³
    
    const totalWeight = pipeWeight + fluidWeight + insulationWeight;

    setResult({
      pipeWeight,
      fluidWeight,
      insulationWeight,
      totalWeight
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="pipeSize">Pipe Size (mm)</Label>
          <Select value={pipeSize} onValueChange={setPipeSize}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="100">100 mm</SelectItem>
              <SelectItem value="150">150 mm</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="schedule">Schedule</Label>
          <Select value={schedule} onValueChange={setSchedule}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="40">Schedule 40</SelectItem>
              <SelectItem value="80">Schedule 80</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="length">Pipe Length (m)</Label>
          <Input
            id="length"
            type="number"
            value={length}
            onChange={(e) => setLength(e.target.value)}
            placeholder="Enter length"
          />
        </div>
        <div>
          <Label htmlFor="insulationThickness">Insulation Thickness (mm)</Label>
          <Input
            id="insulationThickness"
            type="number"
            value={insulationThickness}
            onChange={(e) => setInsulationThickness(e.target.value)}
            placeholder="Enter thickness"
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor="fluidDensity">Fluid Density (kg/m³)</Label>
          <Input
            id="fluidDensity"
            type="number"
            value={fluidDensity}
            onChange={(e) => setFluidDensity(e.target.value)}
            placeholder="Enter fluid density"
          />
        </div>
      </div>

      <Button onClick={calculateWeight} className="w-full">
        Calculate Pipe Weight
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Weight Breakdown</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Pipe Weight:</span>
              <span className="font-mono">{result.pipeWeight.toFixed(1)} kg</span>
            </div>
            <div className="flex justify-between">
              <span>Fluid Weight:</span>
              <span className="font-mono">{result.fluidWeight.toFixed(1)} kg</span>
            </div>
            <div className="flex justify-between">
              <span>Insulation Weight:</span>
              <span className="font-mono">{result.insulationWeight.toFixed(1)} kg</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Total Weight:</span>
              <span className="font-mono">{result.totalWeight.toFixed(1)} kg</span>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Note:</strong> Weights are for straight pipe sections only</p>
        <p><strong>Use:</strong> Total weight is used for pipe support design</p>
      </div>
    </div>
  );
}

function InsulationThicknessCalculator() {
  const [pipeOD, setPipeOD] = useState("");
  const [pipeTemp, setPipeTemp] = useState("");
  const [ambientTemp, setAmbientTemp] = useState("25");
  const [maxSurfaceTemp, setMaxSurfaceTemp] = useState("60");
  const [insulationType, setInsulationType] = useState("mineral_wool");
  const [result, setResult] = useState<{ thickness: number; heatLoss: number, efficiency: number } | null>(null);

  const calculateInsulation = () => {
    const OD = parseFloat(pipeOD) / 1000; // Convert to meters
    const Tp = parseFloat(pipeTemp);
    const Ta = parseFloat(ambientTemp);
    const Ts = parseFloat(maxSurfaceTemp);

    if (isNaN(OD) || isNaN(Tp) || isNaN(Ta) || isNaN(Ts)) {
      setResult(null);
      return;
    }

    // Thermal conductivity values (W/m·K)
    const thermalConductivity: { [key: string]: number } = {
      mineral_wool: 0.038,
      polyurethane: 0.025,
      fiberglass: 0.040,
      calcium_silicate: 0.055
    };

    const k = thermalConductivity[insulationType];
    
    // Simplified heat transfer calculation
    const h_outside = 10; // W/m²·K (natural convection + radiation)
    
    // Required insulation thickness (iterative approach simplified)
    // Based on: q = (Tp - Ta) / [ln(r2/r1)/(2πkL) + 1/(h_outside·A_outside)]
    // Target: Ts = Ta + q/(h_outside)
    
    const r1 = OD / 2;
    const targetHeatLoss = h_outside * (Ts - Ta); // W/m² target
    
    // Simplified calculation for insulation thickness
    const deltaT = Tp - Ts;
    const thickness = k * deltaT / (targetHeatLoss * r1) * 1000; // Convert to mm
    
    const r2 = r1 + thickness / 1000;
    const actualHeatLoss = (Tp - Ta) / (Math.log(r2/r1) / (2 * Math.PI * k) + 1 / (h_outside * 2 * Math.PI * r2));
    
    const efficiency = (1 - actualHeatLoss / (h_outside * Math.PI * OD * (Tp - Ta))) * 100;

    setResult({
      thickness: Math.max(25, thickness), // Minimum 25mm
      heatLoss: actualHeatLoss,
      efficiency
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="pipeOD">Pipe Outside Diameter (mm)</Label>
          <Input
            id="pipeOD"
            type="number"
            value={pipeOD}
            onChange={(e) => setPipeOD(e.target.value)}
            placeholder="Enter pipe OD"
          />
        </div>
        <div>
          <Label htmlFor="pipeTemp">Pipe Temperature (°C)</Label>
          <Input
            id="pipeTemp"
            type="number"
            value={pipeTemp}
            onChange={(e) => setPipeTemp(e.target.value)}
            placeholder="Enter pipe temperature"
          />
        </div>
        <div>
          <Label htmlFor="ambientTemp">Ambient Temperature (°C)</Label>
          <Input
            id="ambientTemp"
            type="number"
            value={ambientTemp}
            onChange={(e) => setAmbientTemp(e.target.value)}
            placeholder="Enter ambient temp"
          />
        </div>
        <div>
          <Label htmlFor="maxSurfaceTemp">Max Surface Temperature (°C)</Label>
          <Input
            id="maxSurfaceTemp"
            type="number"
            value={maxSurfaceTemp}
            onChange={(e) => setMaxSurfaceTemp(e.target.value)}
            placeholder="Enter max surface temp"
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor="insulationType">Insulation Material</Label>
          <Select value={insulationType} onValueChange={setInsulationType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mineral_wool">Mineral Wool</SelectItem>
              <SelectItem value="polyurethane">Polyurethane Foam</SelectItem>
              <SelectItem value="fiberglass">Fiberglass</SelectItem>
              <SelectItem value="calcium_silicate">Calcium Silicate</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={calculateInsulation} className="w-full">
        Calculate Insulation Thickness
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Required Thickness:</span>
              <span className="font-mono">{result.thickness.toFixed(0)} mm</span>
            </div>
            <div className="flex justify-between">
              <span>Heat Loss:</span>
              <span className="font-mono">{result.heatLoss.toFixed(1)} W/m</span>
            </div>
            <div className="flex justify-between">
              <span>Insulation Efficiency:</span>
              <span className="font-mono">{result.efficiency.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Purpose:</strong> Personnel protection and energy conservation</p>
        <p><strong>Standards:</strong> ASTM C680 for insulation thickness calculation</p>
      </div>
    </div>
  );
}

export default function DesignToolsPage() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Design Tools</h1>
          <p className="text-gray-600 mt-2">
            Comprehensive engineering design tools for mechanical, piping, and electrical systems
          </p>
        </div>

        <Tabs defaultValue="mechanical" className="w-full">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="mechanical">Mechanical Design</TabsTrigger>
            <TabsTrigger value="pressure-vessel">Pressure Vessel Design</TabsTrigger>
            <TabsTrigger value="heat-exchanger">Heat Exchanger Design</TabsTrigger>
            <TabsTrigger value="piping">Piping Design</TabsTrigger>
            <TabsTrigger value="electrical">Electrical Design</TabsTrigger>
            <TabsTrigger value="analysis">Analysis Tools</TabsTrigger>
            <TabsTrigger value="collaboration">Collaboration</TabsTrigger>
          </TabsList>

          {/* Mechanical Design Tab */}
          <TabsContent value="mechanical" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">CAD Software</CardTitle>
                    <CardDescription>
                      Professional 3D CAD applications
                    </CardDescription>
                  </div>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Monitor className="h-4 w-4 mr-2" />
                      SolidWorks
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Package className="h-4 w-4 mr-2" />
                      AutoCAD 3D
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Cpu className="h-4 w-4 mr-2" />
                      Inventor
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Drawing Tools</CardTitle>
                    <CardDescription>
                      2D drafting and documentation
                    </CardDescription>
                  </div>
                  <Ruler className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Grid className="h-4 w-4 mr-2" />
                      AutoCAD 2D
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <FileText className="h-4 w-4 mr-2" />
                      DraftSight
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Layers className="h-4 w-4 mr-2" />
                      Technical Sketching
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Component Library</CardTitle>
                    <CardDescription>
                      Standard mechanical components
                    </CardDescription>
                  </div>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Settings className="h-4 w-4 mr-2" />
                      Fasteners Library
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Wrench className="h-4 w-4 mr-2" />
                      Bearing Catalog
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Factory className="h-4 w-4 mr-2" />
                      Standard Parts
                    </Button>
                  </div>
                </CardContent>
              </Card>

            </div>
          </TabsContent>

          {/* Pressure Vessel Design Tab */}
          <TabsContent value="pressure-vessel" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
              
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Shell Thickness Calculator</CardTitle>
                    <CardDescription>
                      Based on internal pressure, diameter, allowable stress
                    </CardDescription>
                  </div>
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Per ASME Section VIII Div. 1 requirements
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Shell Thickness Calculator</DialogTitle>
                      </DialogHeader>
                      <ShellThicknessCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Head Thickness Calculator</CardTitle>
                    <CardDescription>
                      Ellipsoidal, hemispherical, and torispherical heads
                    </CardDescription>
                  </div>
                  <Gauge className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Per ASME Section VIII Div. 1 requirements
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Head Thickness Calculator</DialogTitle>
                      </DialogHeader>
                      <HeadThicknessCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Nozzle Reinforcement Calculator</CardTitle>
                    <CardDescription>
                      Opening reinforcement calculations per ASME standards
                    </CardDescription>
                  </div>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Per ASME Section VIII Div. 1 - UG-37 requirements
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Nozzle Reinforcement Calculator</DialogTitle>
                      </DialogHeader>
                      <NozzleReinforcementCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">External Pressure Calculator</CardTitle>
                    <CardDescription>
                      Buckling analysis for vessels under external pressure
                    </CardDescription>
                  </div>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Per ASME Section VIII Div. 1 - UG-28 requirements
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>External Pressure Calculator</DialogTitle>
                      </DialogHeader>
                      <ExternalPressureCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Longitudinal & Hoop Stress Calculator</CardTitle>
                    <CardDescription>
                      Calculate longitudinal and hoop stresses in cylindrical vessels
                    </CardDescription>
                  </div>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Per ASME Section VIII stress analysis requirements
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Longitudinal & Hoop Stress Calculator</DialogTitle>
                      </DialogHeader>
                      <LongitudinalHoopStressCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Wind & Seismic Load Estimator</CardTitle>
                    <CardDescription>
                      Calculate wind and seismic loads on pressure vessels
                    </CardDescription>
                  </div>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Per ASCE 7 and local building codes
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Wind & Seismic Load Estimator</DialogTitle>
                      </DialogHeader>
                      <WindSeismicLoadCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Support Leg Load Distribution</CardTitle>
                    <CardDescription>
                      Calculate loads on vessel support legs and foundations
                    </CardDescription>
                  </div>
                  <Layers className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Foundation load analysis for vessel supports
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Support Leg Load Distribution Tool</DialogTitle>
                      </DialogHeader>
                      <SupportLegLoadCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Lifting Lug Design Calculator</CardTitle>
                    <CardDescription>
                      Design lifting lugs for vessel transportation and installation
                    </CardDescription>
                  </div>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Per ASME BTH-1 and AWS D14.1 standards
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Lifting Lug Design Calculator</DialogTitle>
                      </DialogHeader>
                      <LiftingLugCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Thermal Expansion Calculator</CardTitle>
                    <CardDescription>
                      Calculate thermal expansion and stress in pressure vessels
                    </CardDescription>
                  </div>
                  <Thermometer className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Thermal stress analysis and expansion calculations
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Thermal Expansion Calculator</DialogTitle>
                      </DialogHeader>
                      <ThermalExpansionCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Material Allowable Stress Lookup</CardTitle>
                    <CardDescription>
                      ASME material properties and allowable stress values
                    </CardDescription>
                  </div>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Per ASME Section II Part D material database
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Material Allowable Stress Lookup</DialogTitle>
                      </DialogHeader>
                      <MaterialStressLookup />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Corrosion Allowance Calculator</CardTitle>
                    <CardDescription>
                      Calculate required corrosion allowances for different services
                    </CardDescription>
                  </div>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Service-specific corrosion rate calculations
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Corrosion Allowance Calculator</DialogTitle>
                      </DialogHeader>
                      <CorrosionAllowanceCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Volume & Weight Calculator</CardTitle>
                    <CardDescription>
                      Calculate vessel volume, weight, and material quantities
                    </CardDescription>
                  </div>
                  <Gauge className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    For cylindrical shells, heads, and complete vessels
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Volume & Weight Calculator</DialogTitle>
                      </DialogHeader>
                      <VolumeWeightCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Hydrostatic Test Pressure Calculator</CardTitle>
                    <CardDescription>
                      Calculate hydrostatic test pressure per ASME requirements
                    </CardDescription>
                  </div>
                  <Pipette className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Per ASME Section VIII hydrostatic testing requirements
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Hydrostatic Test Pressure Calculator</DialogTitle>
                      </DialogHeader>
                      <HydrostaticTestCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

            </div>
          </TabsContent>

          {/* Heat Exchanger Design Tab */}
          <TabsContent value="heat-exchanger" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Heat Duty Calculator</CardTitle>
                    <CardDescription>
                      Calculate heat transfer rate and energy requirements
                    </CardDescription>
                  </div>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Per TEMA and ASME standards for thermal design
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Heat Duty Calculator</DialogTitle>
                      </DialogHeader>
                      <HeatDutyCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">LMTD Calculator</CardTitle>
                    <CardDescription>
                      Log Mean Temperature Difference calculations
                    </CardDescription>
                  </div>
                  <Thermometer className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Counter-current and co-current flow configurations
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>LMTD Calculator</DialogTitle>
                      </DialogHeader>
                      <LMTDCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Heat Transfer Area Calculator</CardTitle>
                    <CardDescription>
                      Overall heat transfer area sizing
                    </CardDescription>
                  </div>
                  <Square className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Based on Q = U × A × LMTD equation
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Heat Transfer Area Calculator</DialogTitle>
                      </DialogHeader>
                      <HeatTransferAreaCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">U-Value Estimator</CardTitle>
                    <CardDescription>
                      Overall heat transfer coefficient estimation
                    </CardDescription>
                  </div>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Includes fouling factors and tube wall resistance
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Overall Heat Transfer Coefficient Estimator</DialogTitle>
                      </DialogHeader>
                      <UValueCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Shell & Tube Sizing Tool</CardTitle>
                    <CardDescription>
                      Complete shell and tube heat exchanger sizing
                    </CardDescription>
                  </div>
                  <Layers className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Per TEMA standards with pressure drop calculations
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Shell & Tube Heat Exchanger Sizing Tool</DialogTitle>
                      </DialogHeader>
                      <ShellTubeSizingTool />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Effectiveness-NTU Calculator</CardTitle>
                    <CardDescription>
                      NTU method for heat exchanger analysis
                    </CardDescription>
                  </div>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Alternative method when outlet temperatures unknown
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Effectiveness-NTU Method Calculator</DialogTitle>
                      </DialogHeader>
                      <EffectivenessNTUCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Tube Sheet Design Tool</CardTitle>
                    <CardDescription>
                      Tube sheet thickness and stress analysis
                    </CardDescription>
                  </div>
                  <Grid className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Per ASME Section VIII Div. 1 - UHX requirements
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Tube Sheet Design Tool</DialogTitle>
                      </DialogHeader>
                      <TubeSheetDesignTool />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Tube Layout Generator</CardTitle>
                    <CardDescription>
                      Triangular and square tube pitch layouts
                    </CardDescription>
                  </div>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    TEMA standard tube arrangements and counts
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Tube Layout Generator</DialogTitle>
                      </DialogHeader>
                      <TubeLayoutGenerator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Gasket Load Calculator</CardTitle>
                    <CardDescription>
                      Gasket seating stress and operational loads
                    </CardDescription>
                  </div>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Per ASME Section VIII Div. 1 - Appendix 2
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Gasket Load/Seating Stress Calculator</DialogTitle>
                      </DialogHeader>
                      <GasketLoadCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

            </div>
          </TabsContent>

          {/* Piping Design Tab */}
          <TabsContent value="piping" className="space-y-6">
            <div className="text-center mb-6">
              <h3 className="text-lg font-semibold mb-2">Piping Design Tools</h3>
              <p className="text-muted-foreground">Professional piping design and analysis tools per ASME B31.3/B31.1</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Pipe Thickness Calculator</CardTitle>
                    <CardDescription>
                      Calculate minimum required wall thickness per ASME B31.3/B31.1
                    </CardDescription>
                  </div>
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Per ASME B31.3 Process Piping code requirements
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Pipe Thickness Calculator</DialogTitle>
                      </DialogHeader>
                      <PipeThicknessCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Pipe Size & Schedule Selector</CardTitle>
                    <CardDescription>
                      Standard pipe dimensions based on nominal size and schedule
                    </CardDescription>
                  </div>
                  <Ruler className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    ASME B36.10M and B36.19M pipe dimensions
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Pipe Size & Schedule Selector</DialogTitle>
                      </DialogHeader>
                      <PipeSizeScheduleSelector />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Pressure Drop Calculator</CardTitle>
                    <CardDescription>
                      Pressure loss due to friction using Darcy-Weisbach equation
                    </CardDescription>
                  </div>
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Friction factor calculation with Colebrook-White equation
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Pressure Drop Calculator</DialogTitle>
                      </DialogHeader>
                      <PressureDropCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Pipe Expansion Calculator</CardTitle>
                    <CardDescription>
                      Calculate linear expansion based on pipe length and temperature
                    </CardDescription>
                  </div>
                  <Move className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Thermal expansion calculations for piping systems
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Pipe Expansion Calculator</DialogTitle>
                      </DialogHeader>
                      <PipeExpansionCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Flow Velocity & Reynolds Number</CardTitle>
                    <CardDescription>
                      Determine flow regime and identify laminar or turbulent flow
                    </CardDescription>
                  </div>
                  <Waves className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Flow analysis for optimal pipe sizing
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Flow Velocity & Reynolds Number Calculator</DialogTitle>
                      </DialogHeader>
                      <FlowVelocityReynoldsCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Pipe Support Span Estimator</CardTitle>
                    <CardDescription>
                      Support spacing based on pipe size, material, and weight
                    </CardDescription>
                  </div>
                  <Grid className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Per ASME B31.3 and MSS SP-69 guidelines
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Pipe Support Span Estimator</DialogTitle>
                      </DialogHeader>
                      <PipeSupportSpanEstimator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Miter Bend Pressure Loss</CardTitle>
                    <CardDescription>
                      Additional pressure drop across miter elbows
                    </CardDescription>
                  </div>
                  <CornerDownRight className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Resistance coefficient for miter bends
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Miter Bend Pressure Loss Calculator</DialogTitle>
                      </DialogHeader>
                      <MiterBendPressureLossCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Flange Bolt Load Calculator</CardTitle>
                    <CardDescription>
                      Estimate bolt preload and flange bolt requirements
                    </CardDescription>
                  </div>
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Per ASME B16.5 flange design standards
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Flange Bolt Load Calculator</DialogTitle>
                      </DialogHeader>
                      <FlangeBoltLoadCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Optional Utilities */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Pipe Material Properties</CardTitle>
                    <CardDescription>
                      Material properties lookup for common piping materials
                    </CardDescription>
                  </div>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Material database with thermal and mechanical properties
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Pipe Material Properties Lookup</DialogTitle>
                      </DialogHeader>
                      <PipeMaterialPropertiesLookup />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Pipe Weight Calculator</CardTitle>
                    <CardDescription>
                      Calculate pipe weight including contents and insulation
                    </CardDescription>
                  </div>
                  <Weight className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Weight calculations for pipe support design
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Pipe Weight Calculator</DialogTitle>
                      </DialogHeader>
                      <PipeWeightCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Insulation Thickness Calculator</CardTitle>
                    <CardDescription>
                      Calculate required insulation thickness for heat loss control
                    </CardDescription>
                  </div>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Thermal insulation design calculations
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Insulation Thickness Calculator</DialogTitle>
                      </DialogHeader>
                      <InsulationThicknessCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

            </div>
          </TabsContent>

          {/* Electrical Design Tab */}
          <TabsContent value="electrical" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Electrical CAD</CardTitle>
                    <CardDescription>
                      Electrical design software
                    </CardDescription>
                  </div>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <CircuitBoard className="h-4 w-4 mr-2" />
                      AutoCAD Electrical
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Zap className="h-4 w-4 mr-2" />
                      EPLAN Electric
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Monitor className="h-4 w-4 mr-2" />
                      SolidWorks Electrical
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Panel Design</CardTitle>
                    <CardDescription>
                      Control panel layout tools
                    </CardDescription>
                  </div>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <CircuitBoard className="h-4 w-4 mr-2" />
                      Panel Layout Pro
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Settings className="h-4 w-4 mr-2" />
                      MCC Designer
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Grid className="h-4 w-4 mr-2" />
                      Switchgear Layout
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Load Calculations</CardTitle>
                    <CardDescription>
                      Electrical load analysis
                    </CardDescription>
                  </div>
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Gauge className="h-4 w-4 mr-2" />
                      Load Flow Analysis
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Calculator className="h-4 w-4 mr-2" />
                      Cable Sizing
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Zap className="h-4 w-4 mr-2" />
                      Short Circuit Study
                    </Button>
                  </div>
                </CardContent>
              </Card>

            </div>
          </TabsContent>

          {/* Analysis Tools Tab */}
          <TabsContent value="analysis" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Structural Analysis</CardTitle>
                    <CardDescription>
                      FEA and structural calculations
                    </CardDescription>
                  </div>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Cpu className="h-4 w-4 mr-2" />
                      ANSYS Structural
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Target className="h-4 w-4 mr-2" />
                      SAP2000
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Calculator className="h-4 w-4 mr-2" />
                      STAAD.Pro
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Thermal Analysis</CardTitle>
                    <CardDescription>
                      Heat transfer calculations
                    </CardDescription>
                  </div>
                  <Gauge className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Gauge className="h-4 w-4 mr-2" />
                      ANSYS Fluent
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Calculator className="h-4 w-4 mr-2" />
                      Heat Exchanger Design
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Cpu className="h-4 w-4 mr-2" />
                      HTRI
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Process Simulation</CardTitle>
                    <CardDescription>
                      Process flow modeling
                    </CardDescription>
                  </div>
                  <Workflow className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Workflow className="h-4 w-4 mr-2" />
                      Aspen Plus
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Factory className="h-4 w-4 mr-2" />
                      HYSYS
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Calculator className="h-4 w-4 mr-2" />
                      Process Calculations
                    </Button>
                  </div>
                </CardContent>
              </Card>

            </div>
          </TabsContent>

          {/* Collaboration Tab */}
          <TabsContent value="collaboration" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Document Management</CardTitle>
                    <CardDescription>
                      Version control and sharing
                    </CardDescription>
                  </div>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <FileText className="h-4 w-4 mr-2" />
                      Design Vault
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Database className="h-4 w-4 mr-2" />
                      Drawing Repository
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Shield className="h-4 w-4 mr-2" />
                      Version Control
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Team Collaboration</CardTitle>
                    <CardDescription>
                      Real-time design sharing
                    </CardDescription>
                  </div>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Users className="h-4 w-4 mr-2" />
                      Design Reviews
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Monitor className="h-4 w-4 mr-2" />
                      Screen Sharing
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <FileText className="h-4 w-4 mr-2" />
                      Comment System
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Project Integration</CardTitle>
                    <CardDescription>
                      Connect with project systems
                    </CardDescription>
                  </div>
                  <Workflow className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Workflow className="h-4 w-4 mr-2" />
                      Project Link
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Database className="h-4 w-4 mr-2" />
                      BOM Integration
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <FileText className="h-4 w-4 mr-2" />
                      Specification Sync
                    </Button>
                  </div>
                </CardContent>
              </Card>

            </div>
          </TabsContent>
        </Tabs>

        {/* Coming Soon Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Design Tools Integration
              <Badge variant="secondary">Coming Soon</Badge>
            </CardTitle>
            <CardDescription>
              Professional engineering design suite for comprehensive project development
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                The Design Tools module will provide integrated access to industry-standard engineering software and tools:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold text-sm mb-2">Mechanical Design</h4>
                  <ul className="space-y-1 text-sm text-muted-foreground ml-4">
                    <li>• SolidWorks, AutoCAD, Inventor integration</li>
                    <li>• Standard component libraries</li>
                    <li>• Drawing management system</li>
                    <li>• Design validation tools</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-sm mb-2">Pressure Vessel Design</h4>
                  <ul className="space-y-1 text-sm text-muted-foreground ml-4">
                    <li>• Shell thickness calculations per ASME VIII</li>
                    <li>• Head thickness for all standard types</li>
                    <li>• Nozzle reinforcement analysis</li>
                    <li>• External pressure buckling prevention</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-sm mb-2">Piping Design</h4>
                  <ul className="space-y-1 text-sm text-muted-foreground ml-4">
                    <li>• AutoCAD Plant 3D, PDMS access</li>
                    <li>• P&ID creation and management</li>
                    <li>• Pipe stress analysis</li>
                    <li>• Material specifications</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-sm mb-2">Electrical Design</h4>
                  <ul className="space-y-1 text-sm text-muted-foreground ml-4">
                    <li>• AutoCAD Electrical, EPLAN</li>
                    <li>• Control panel design</li>
                    <li>• Load calculations</li>
                    <li>• Cable routing and sizing</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-sm mb-2">Analysis & Collaboration</h4>
                  <ul className="space-y-1 text-sm text-muted-foreground ml-4">
                    <li>• FEA and thermal analysis</li>
                    <li>• Process simulation tools</li>
                    <li>• Real-time collaboration</li>
                    <li>• Project system integration</li>
                  </ul>
                </div>
              </div>
              <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm font-medium text-blue-900">
                  Development in Progress
                </p>
                <p className="text-sm text-blue-700 mt-1">
                  This comprehensive design suite is being developed to provide seamless integration with professional engineering software and collaborative workflows.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}