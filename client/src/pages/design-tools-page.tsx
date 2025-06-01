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
  return (
    <div className="space-y-4">
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm font-medium text-blue-900">
          Comprehensive Shell & Tube Sizing Tool
        </p>
        <p className="text-sm text-blue-700 mt-1">
          This advanced tool will include complete TEMA standard calculations for shell and tube heat exchanger sizing, pressure drop calculations, and optimization. Development in progress.
        </p>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Piping CAD</CardTitle>
                    <CardDescription>
                      Specialized piping design software
                    </CardDescription>
                  </div>
                  <Pipette className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Workflow className="h-4 w-4 mr-2" />
                      AutoCAD Plant 3D
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Pipette className="h-4 w-4 mr-2" />
                      PDMS/E3D
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Factory className="h-4 w-4 mr-2" />
                      Caesar II
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">P&ID Tools</CardTitle>
                    <CardDescription>
                      Piping and instrumentation diagrams
                    </CardDescription>
                  </div>
                  <Grid className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <FileText className="h-4 w-4 mr-2" />
                      AutoCAD P&ID
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Workflow className="h-4 w-4 mr-2" />
                      SmartPlant P&ID
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Grid className="h-4 w-4 mr-2" />
                      Visio P&ID
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Pipe Specifications</CardTitle>
                    <CardDescription>
                      Standards and specifications
                    </CardDescription>
                  </div>
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Database className="h-4 w-4 mr-2" />
                      ASME Standards
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <Shield className="h-4 w-4 mr-2" />
                      API Specifications
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-left" disabled>
                      <BookOpen className="h-4 w-4 mr-2" />
                      Material Database
                    </Button>
                  </div>
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