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
  Info,
  Weight,
  Scale,
  Flame,
  Filter,
  Beaker,
  ArrowLeftRight,
  ArrowUpDown,
  Container,
  Bolt
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

// Helical Coil Pressure Loss Calculator Component
function HelicalCoilPressureLossCalculator() {
  const [innerDiameter, setInnerDiameter] = useState("");
  const [coilDiameter, setCoilDiameter] = useState("");
  const [coilPitch, setCoilPitch] = useState("");
  const [numberOfTurns, setNumberOfTurns] = useState("");
  const [flowRate, setFlowRate] = useState("");
  const [temperature, setTemperature] = useState("");
  const [fluidPreset, setFluidPreset] = useState("custom");
  const [density, setDensity] = useState("");
  const [viscosity, setViscosity] = useState("");
  const [result, setResult] = useState<{
    tubeLength: number;
    velocity: number;
    reynolds: number;
    flowRegime: string;
    deanNumber: number;
    pressureDrop: number;
  } | null>(null);

  // Fluid presets for common thermal oils
  const fluidPresets = {
    "dowtherm-a": { density: 866, viscosity: 0.00175, name: "Dowtherm A (300°C)" },
    "therminol-66": { density: 765, viscosity: 0.00085, name: "Therminol 66 (350°C)" },
    "marlotherm-sh": { density: 820, viscosity: 0.0012, name: "Marlotherm SH (300°C)" },
    "custom": { density: 0, viscosity: 0, name: "Custom" }
  };

  const handleFluidPresetChange = (preset: string) => {
    setFluidPreset(preset);
    if (preset !== "custom") {
      setDensity(fluidPresets[preset as keyof typeof fluidPresets].density.toString());
      setViscosity(fluidPresets[preset as keyof typeof fluidPresets].viscosity.toString());
    }
  };

  const calculatePressureLoss = () => {
    const Di = parseFloat(innerDiameter) / 1000; // Convert mm to m
    const Dc = parseFloat(coilDiameter) / 1000; // Convert mm to m
    const p = parseFloat(coilPitch) / 1000; // Convert mm to m
    const N = parseFloat(numberOfTurns);
    const Q = parseFloat(flowRate) / 3600; // Convert m³/hr to m³/s
    const rho = parseFloat(density);
    const mu = parseFloat(viscosity);

    if (!Di || !Dc || !p || !N || !Q || !rho || !mu) return;

    // Calculate tube length
    const tubeLength = N * Math.sqrt(Math.pow(Math.PI * Dc, 2) + Math.pow(p, 2));

    // Calculate flow velocity: v = Q / A where A = π * d² / 4
    const A = Math.PI * Math.pow(Di, 2) / 4; // Cross-sectional area
    const velocity = Q / A;

    // Calculate Reynolds number
    const reynolds = (rho * velocity * Di) / mu;

    // Determine flow regime and friction factor
    let frictionFactor: number;
    let flowRegime: string;
    
    if (reynolds < 2300) {
      frictionFactor = 64 / reynolds;
      flowRegime = "Laminar";
    } else {
      frictionFactor = 0.079 * Math.pow(reynolds, -0.25);
      flowRegime = "Turbulent";
    }

    // Calculate Dean number for helical correction
    const deanNumber = reynolds * Math.sqrt(Di / Dc);

    // Apply helical coil correction factor
    let helicalFactor = 1;
    if (deanNumber > 11.6) {
      if (reynolds < 2300) {
        // Laminar flow helical correction
        helicalFactor = 1 + 0.033 * Math.pow(deanNumber, 0.5);
      } else {
        // Turbulent flow helical correction
        helicalFactor = 1 + 0.09 * Math.pow(deanNumber, 0.2);
      }
    }

    // Calculate pressure drop using Darcy-Weisbach equation
    const pressureDropPa = helicalFactor * frictionFactor * (tubeLength / Di) * (rho * Math.pow(velocity, 2)) / 2;
    const pressureDropBar = pressureDropPa / 100000; // Convert Pa to bar

    setResult({
      tubeLength: tubeLength,
      velocity: velocity,
      reynolds: reynolds,
      flowRegime: flowRegime,
      deanNumber: deanNumber,
      pressureDrop: pressureDropBar
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="innerDiameter">Inner Tube Diameter (mm)</Label>
          <Input
            id="innerDiameter"
            type="number"
            step="0.1"
            value={innerDiameter}
            onChange={(e) => setInnerDiameter(e.target.value)}
            placeholder="e.g., 25.4"
          />
        </div>
        <div>
          <Label htmlFor="coilDiameter">Coil Diameter - Centerline (mm)</Label>
          <Input
            id="coilDiameter"
            type="number"
            value={coilDiameter}
            onChange={(e) => setCoilDiameter(e.target.value)}
            placeholder="e.g., 500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="coilPitch">Coil Pitch (mm)</Label>
          <Input
            id="coilPitch"
            type="number"
            step="0.1"
            value={coilPitch}
            onChange={(e) => setCoilPitch(e.target.value)}
            placeholder="e.g., 50"
          />
        </div>
        <div>
          <Label htmlFor="numberOfTurns">Number of Turns</Label>
          <Input
            id="numberOfTurns"
            type="number"
            step="0.5"
            value={numberOfTurns}
            onChange={(e) => setNumberOfTurns(e.target.value)}
            placeholder="e.g., 10"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="flowRate">Flow Rate (m³/hr)</Label>
          <Input
            id="flowRate"
            type="number"
            step="0.1"
            value={flowRate}
            onChange={(e) => setFlowRate(e.target.value)}
            placeholder="e.g., 5.0"
          />
        </div>
        <div>
          <Label htmlFor="temperature">Fluid Temperature (°C)</Label>
          <Input
            id="temperature"
            type="number"
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            placeholder="e.g., 300"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="fluidPreset">Fluid Properties</Label>
        <Select value={fluidPreset} onValueChange={handleFluidPresetChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(fluidPresets).map(([key, preset]) => (
              <SelectItem key={key} value={key}>{preset.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="density">Density (kg/m³)</Label>
          <Input
            id="density"
            type="number"
            step="0.1"
            value={density}
            onChange={(e) => setDensity(e.target.value)}
            placeholder="e.g., 866"
            disabled={fluidPreset !== "custom"}
          />
        </div>
        <div>
          <Label htmlFor="viscosity">Dynamic Viscosity (Pa·s)</Label>
          <Input
            id="viscosity"
            type="number"
            step="0.00001"
            value={viscosity}
            onChange={(e) => setViscosity(e.target.value)}
            placeholder="e.g., 0.00175"
            disabled={fluidPreset !== "custom"}
          />
        </div>
      </div>

      <Button onClick={calculatePressureLoss} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Pressure Loss
      </Button>

      {result !== null && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-semibold text-blue-900">Calculation Results</h4>
          <div className="grid grid-cols-2 gap-4 mt-3 text-blue-800">
            <div>
              <p className="text-sm text-blue-600">Tube Length</p>
              <p className="font-bold">{result.tubeLength.toFixed(2)} m</p>
            </div>
            <div>
              <p className="text-sm text-blue-600">Flow Velocity</p>
              <p className="font-bold">{result.velocity.toFixed(2)} m/s</p>
            </div>
            <div>
              <p className="text-sm text-blue-600">Reynolds Number</p>
              <p className="font-bold">{result.reynolds.toFixed(0)}</p>
            </div>
            <div>
              <p className="text-sm text-blue-600">Flow Regime</p>
              <p className="font-bold">{result.flowRegime}</p>
            </div>
            <div>
              <p className="text-sm text-blue-600">Dean Number</p>
              <p className="font-bold">{result.deanNumber.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-sm text-blue-600">Pressure Drop</p>
              <p className="font-bold text-lg">{result.pressureDrop.toFixed(4)} bar</p>
            </div>
          </div>
          <p className="text-xs text-blue-600 mt-3">
            Calculation includes Dean number correction for helical coil curvature effects
          </p>
        </div>
      )}
    </div>
  );
}

// Combustion Chamber Pressure Loss Calculator Component
function CombustionChamberPressureLossCalculator() {
  const [inletPressure, setInletPressure] = useState("");
  const [pressureUnit, setPressureUnit] = useState("bar");
  const [inletTemperature, setInletTemperature] = useState("");
  const [massFlowRate, setMassFlowRate] = useState("");
  const [chamberLength, setChamberLength] = useState("");
  const [chamberDiameter, setChamberDiameter] = useState("");
  const [surfaceRoughness, setSurfaceRoughness] = useState("");
  const [density, setDensity] = useState("");
  const [viscosity, setViscosity] = useState("");
  const [heatCapacityRatio, setHeatCapacityRatio] = useState("1.4");
  const [kFactor, setKFactor] = useState("0.5");
  const [result, setResult] = useState<{
    velocity: number;
    reynolds: number;
    flowRegime: string;
    frictionFactor: number;
    frictionLoss: number;
    localLoss: number;
    totalLoss: number;
  } | null>(null);

  const calculatePressureLoss = () => {
    const P_inlet = parseFloat(inletPressure) * (pressureUnit === "bar" ? 100000 : 100); // Convert to Pa
    const T_inlet = parseFloat(inletTemperature);
    const m_dot = parseFloat(massFlowRate);
    const L = parseFloat(chamberLength);
    const D = parseFloat(chamberDiameter);
    const roughness = parseFloat(surfaceRoughness) / 1000 || 0; // Convert mm to m, default 0
    const rho = parseFloat(density);
    const mu = parseFloat(viscosity);
    const gamma = parseFloat(heatCapacityRatio);
    const K = parseFloat(kFactor);

    if (!P_inlet || !T_inlet || !m_dot || !L || !D || !rho || !mu) return;

    // Calculate cross-sectional area: A = π * D² / 4
    const A = Math.PI * Math.pow(D, 2) / 4;

    // Calculate flow velocity: v = m_dot / (ρ * A)
    const velocity = m_dot / (rho * A);

    // Calculate Reynolds number: Re = ρ * v * D / μ
    const reynolds = (rho * velocity * D) / mu;

    // Determine flow regime and friction factor
    let frictionFactor: number;
    let flowRegime: string;

    if (reynolds < 2300) {
      frictionFactor = 64 / reynolds;
      flowRegime = "Laminar";
    } else {
      // Turbulent flow - Swamee-Jain equation (simplified)
      if (roughness > 0) {
        const relativeRoughness = roughness / D;
        frictionFactor = 0.25 / Math.pow(Math.log10(relativeRoughness / 3.7 + 5.74 / Math.pow(reynolds, 0.9)), 2);
      } else {
        // Smooth pipe - Blasius equation for turbulent flow
        frictionFactor = 0.316 / Math.pow(reynolds, 0.25);
      }
      flowRegime = "Turbulent";
    }

    // Calculate pressure drop due to friction: ΔP_f = f * (L/D) * (ρ * v²) / 2
    const frictionLossPa = frictionFactor * (L / D) * (rho * Math.pow(velocity, 2)) / 2;

    // Calculate pressure drop from local losses: ΔP_l = K * (ρ * v²) / 2
    const localLossPa = K * (rho * Math.pow(velocity, 2)) / 2;

    // Convert to mbar: 1 Pa = 0.01 mbar
    const frictionLoss = frictionLossPa / 100;
    const localLoss = localLossPa / 100;
    const totalLoss = frictionLoss + localLoss;

    setResult({
      velocity: velocity,
      reynolds: reynolds,
      flowRegime: flowRegime,
      frictionFactor: frictionFactor,
      frictionLoss: frictionLoss,
      localLoss: localLoss,
      totalLoss: totalLoss
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="inletPressure">Inlet Pressure</Label>
          <div className="flex gap-2">
            <Input
              id="inletPressure"
              type="number"
              step="0.01"
              value={inletPressure}
              onChange={(e) => setInletPressure(e.target.value)}
              placeholder="e.g., 2.5"
              className="flex-1"
            />
            <Select value={pressureUnit} onValueChange={setPressureUnit}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bar">bar</SelectItem>
                <SelectItem value="mbar">mbar</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="inletTemperature">Inlet Temperature (°C)</Label>
          <Input
            id="inletTemperature"
            type="number"
            value={inletTemperature}
            onChange={(e) => setInletTemperature(e.target.value)}
            placeholder="e.g., 800"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="massFlowRate">Mass Flow Rate (kg/s)</Label>
          <Input
            id="massFlowRate"
            type="number"
            step="0.001"
            value={massFlowRate}
            onChange={(e) => setMassFlowRate(e.target.value)}
            placeholder="e.g., 0.5"
          />
        </div>
        <div>
          <Label htmlFor="chamberLength">Chamber Length (m)</Label>
          <Input
            id="chamberLength"
            type="number"
            step="0.1"
            value={chamberLength}
            onChange={(e) => setChamberLength(e.target.value)}
            placeholder="e.g., 2.0"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="chamberDiameter">Chamber Diameter (m)</Label>
          <Input
            id="chamberDiameter"
            type="number"
            step="0.01"
            value={chamberDiameter}
            onChange={(e) => setChamberDiameter(e.target.value)}
            placeholder="e.g., 0.5"
          />
        </div>
        <div>
          <Label htmlFor="surfaceRoughness">Surface Roughness (mm) - Optional</Label>
          <Input
            id="surfaceRoughness"
            type="number"
            step="0.001"
            value={surfaceRoughness}
            onChange={(e) => setSurfaceRoughness(e.target.value)}
            placeholder="e.g., 0.05"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="density">Gas Density (kg/m³)</Label>
          <Input
            id="density"
            type="number"
            step="0.01"
            value={density}
            onChange={(e) => setDensity(e.target.value)}
            placeholder="e.g., 0.8"
          />
        </div>
        <div>
          <Label htmlFor="viscosity">Dynamic Viscosity (Pa·s)</Label>
          <Input
            id="viscosity"
            type="number"
            step="0.000001"
            value={viscosity}
            onChange={(e) => setViscosity(e.target.value)}
            placeholder="e.g., 0.000025"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="heatCapacityRatio">Heat Capacity Ratio (γ)</Label>
          <Input
            id="heatCapacityRatio"
            type="number"
            step="0.01"
            value={heatCapacityRatio}
            onChange={(e) => setHeatCapacityRatio(e.target.value)}
            placeholder="e.g., 1.4"
          />
        </div>
        <div>
          <Label htmlFor="kFactor">K-factor for Local Losses</Label>
          <Input
            id="kFactor"
            type="number"
            step="0.1"
            value={kFactor}
            onChange={(e) => setKFactor(e.target.value)}
            placeholder="e.g., 0.5"
          />
        </div>
      </div>

      <Button onClick={calculatePressureLoss} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Pressure Loss
      </Button>

      {result !== null && (
        <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <h4 className="font-semibold text-orange-900">Calculation Results</h4>
          <div className="grid grid-cols-2 gap-4 mt-3 text-orange-800">
            <div>
              <p className="text-sm text-orange-600">Flow Velocity</p>
              <p className="font-bold">{result.velocity.toFixed(2)} m/s</p>
            </div>
            <div>
              <p className="text-sm text-orange-600">Reynolds Number</p>
              <p className="font-bold">{result.reynolds.toFixed(0)}</p>
            </div>
            <div>
              <p className="text-sm text-orange-600">Flow Regime</p>
              <p className="font-bold">{result.flowRegime}</p>
            </div>
            <div>
              <p className="text-sm text-orange-600">Friction Factor</p>
              <p className="font-bold">{result.frictionFactor.toFixed(6)}</p>
            </div>
            <div>
              <p className="text-sm text-orange-600">Friction Loss</p>
              <p className="font-bold">{result.frictionLoss.toFixed(2)} mbar</p>
            </div>
            <div>
              <p className="text-sm text-orange-600">Local Losses</p>
              <p className="font-bold">{result.localLoss.toFixed(2)} mbar</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-orange-300">
            <div className="text-center">
              <p className="text-sm text-orange-600">Total Pressure Loss</p>
              <p className="font-bold text-xl text-orange-900">{result.totalLoss.toFixed(2)} mbar</p>
            </div>
          </div>
          <p className="text-xs text-orange-600 mt-3">
            Calculation based on Darcy-Weisbach equation with Swamee-Jain friction factor for turbulent flow
          </p>
        </div>
      )}
    </div>
  );
}

// Expansion Tank Capacity Calculator Component
function ExpansionTankCapacityCalculator() {
  const [totalVolume, setTotalVolume] = useState("");
  const [volumeUnit, setVolumeUnit] = useState("liters");
  const [minTemperature, setMinTemperature] = useState("");
  const [maxTemperature, setMaxTemperature] = useState("");
  const [fluidPreset, setFluidPreset] = useState("custom");
  const [expansionCoefficient, setExpansionCoefficient] = useState("");
  const [safetyMargin, setSafetyMargin] = useState("10");
  const [preChargePresssure, setPreChargePresssure] = useState("");
  const [operatingPressure, setOperatingPressure] = useState("");
  const [result, setResult] = useState<{
    expansionVolume: number;
    tankSize: number;
    pressurizedTankSize: number;
    temperatureRise: number;
    tankType: string;
  } | null>(null);

  // Fluid presets with thermal expansion coefficients
  const fluidPresets = {
    "therminol-55": { coefficient: 0.00073, name: "Therminol 55" },
    "therminol-66": { coefficient: 0.00085, name: "Therminol 66" },
    "vp1": { coefficient: 0.00095, name: "VP1 Thermal Oil" },
    "dowtherm-a": { coefficient: 0.00088, name: "Dowtherm A" },
    "marlotherm-sh": { coefficient: 0.00078, name: "Marlotherm SH" },
    "hot-water": { coefficient: 0.00021, name: "Hot Water" },
    "ethylene-glycol": { coefficient: 0.00065, name: "Ethylene Glycol 50%" },
    "custom": { coefficient: 0, name: "Custom Fluid" }
  };

  const handleFluidPresetChange = (preset: string) => {
    setFluidPreset(preset);
    if (preset !== "custom") {
      setExpansionCoefficient(fluidPresets[preset as keyof typeof fluidPresets].coefficient.toString());
    }
  };

  const calculateTankCapacity = () => {
    const V_total = parseFloat(totalVolume) * (volumeUnit === "liters" ? 1 : 1000); // Convert to liters
    const T_min = parseFloat(minTemperature);
    const T_max = parseFloat(maxTemperature);
    const alpha = parseFloat(expansionCoefficient);
    const margin = parseFloat(safetyMargin) / 100;
    const P0 = parseFloat(preChargePresssure) || 0;
    const Ps = parseFloat(operatingPressure) || 0;

    if (!V_total || !T_min || !T_max || !alpha || T_max <= T_min) return;

    // Calculate temperature rise
    const temperatureRise = T_max - T_min;

    // Calculate volume expansion: ΔV = V_total × α × (T_max - T_min)
    const expansionVolume = V_total * alpha * temperatureRise;

    // Apply safety margin: V_required = ΔV × (1 + Safety Margin)
    const requiredVolume = expansionVolume * (1 + margin);

    // Standard tank size (atmospheric)
    const tankSize = requiredVolume;

    // Pressurized tank calculation (if pressures are provided)
    let pressurizedTankSize = tankSize;
    let tankType = "Open/Atmospheric Tank";

    if (P0 > 0 && Ps > 0 && Ps > P0) {
      // V_tank = V_required / (1 - P0/Ps)
      pressurizedTankSize = requiredVolume / (1 - P0 / Ps);
      tankType = "Pressurized Tank";
    }

    setResult({
      expansionVolume: expansionVolume,
      tankSize: tankSize,
      pressurizedTankSize: pressurizedTankSize,
      temperatureRise: temperatureRise,
      tankType: tankType
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="totalVolume">Total Fluid Volume in System</Label>
          <div className="flex gap-2">
            <Input
              id="totalVolume"
              type="number"
              step="0.1"
              value={totalVolume}
              onChange={(e) => setTotalVolume(e.target.value)}
              placeholder="e.g., 500"
              className="flex-1"
            />
            <Select value={volumeUnit} onValueChange={setVolumeUnit}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="liters">L</SelectItem>
                <SelectItem value="m3">m³</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="fluidPreset">Fluid Type</Label>
          <Select value={fluidPreset} onValueChange={handleFluidPresetChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(fluidPresets).map(([key, preset]) => (
                <SelectItem key={key} value={key}>{preset.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="minTemperature">Minimum Operating Temperature (°C)</Label>
          <Input
            id="minTemperature"
            type="number"
            value={minTemperature}
            onChange={(e) => setMinTemperature(e.target.value)}
            placeholder="e.g., 20"
          />
        </div>
        <div>
          <Label htmlFor="maxTemperature">Maximum Operating Temperature (°C)</Label>
          <Input
            id="maxTemperature"
            type="number"
            value={maxTemperature}
            onChange={(e) => setMaxTemperature(e.target.value)}
            placeholder="e.g., 300"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="expansionCoefficient">Thermal Expansion Coefficient (1/°C)</Label>
          <Input
            id="expansionCoefficient"
            type="number"
            step="0.00001"
            value={expansionCoefficient}
            onChange={(e) => setExpansionCoefficient(e.target.value)}
            placeholder="e.g., 0.00085"
            disabled={fluidPreset !== "custom"}
          />
        </div>
        <div>
          <Label htmlFor="safetyMargin">Safety Expansion Margin (%)</Label>
          <Input
            id="safetyMargin"
            type="number"
            step="1"
            value={safetyMargin}
            onChange={(e) => setSafetyMargin(e.target.value)}
            placeholder="e.g., 10"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="preChargePresssure">Tank Pre-charge Pressure (bar) - Optional</Label>
          <Input
            id="preChargePresssure"
            type="number"
            step="0.1"
            value={preChargePresssure}
            onChange={(e) => setPreChargePresssure(e.target.value)}
            placeholder="e.g., 1.5"
          />
        </div>
        <div>
          <Label htmlFor="operatingPressure">System Operating Pressure (bar) - Optional</Label>
          <Input
            id="operatingPressure"
            type="number"
            step="0.1"
            value={operatingPressure}
            onChange={(e) => setOperatingPressure(e.target.value)}
            placeholder="e.g., 5.0"
          />
        </div>
      </div>

      <Button onClick={calculateTankCapacity} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Tank Capacity
      </Button>

      {result !== null && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <h4 className="font-semibold text-green-900">Calculation Results</h4>
          <div className="grid grid-cols-2 gap-4 mt-3 text-green-800">
            <div>
              <p className="text-sm text-green-600">Temperature Rise (ΔT)</p>
              <p className="font-bold">{result.temperatureRise.toFixed(1)} °C</p>
            </div>
            <div>
              <p className="text-sm text-green-600">Fluid Expansion Volume</p>
              <p className="font-bold">{result.expansionVolume.toFixed(2)} liters</p>
            </div>
            <div>
              <p className="text-sm text-green-600">Standard Tank Size</p>
              <p className="font-bold">{result.tankSize.toFixed(2)} liters</p>
            </div>
            <div>
              <p className="text-sm text-green-600">Recommended Tank Type</p>
              <p className="font-bold">{result.tankType}</p>
            </div>
          </div>
          
          {result.pressurizedTankSize !== result.tankSize && (
            <div className="mt-4 pt-4 border-t border-green-300">
              <div className="text-center">
                <p className="text-sm text-green-600">Pressurized Tank Size</p>
                <p className="font-bold text-xl text-green-900">{result.pressurizedTankSize.toFixed(2)} liters</p>
              </div>
            </div>
          )}
          
          <div className="mt-4 pt-4 border-t border-green-300">
            <div className="text-center">
              <p className="text-sm text-green-600">Final Recommended Tank Capacity</p>
              <p className="font-bold text-xl text-green-900">
                {Math.max(result.tankSize, result.pressurizedTankSize).toFixed(2)} liters
              </p>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-green-100 rounded">
            <h5 className="font-semibold text-green-900 mb-2">Design Notes:</h5>
            <ul className="text-xs text-green-700 space-y-1">
              <li>• Tank should accommodate thermal expansion with safety margin</li>
              <li>• {result.tankType === "Open/Atmospheric Tank" 
                  ? "Open tank suitable for low-pressure systems" 
                  : "Pressurized tank recommended for higher system pressures"}</li>
              <li>• Consider installation of overflow and make-up connections</li>
              <li>• Insulation may be required to minimize heat loss</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// Chimney Diameter & Height Calculator Component
function ChimneyDiameterHeightCalculator() {
  const [fuelType, setFuelType] = useState("furnace-oil");
  const [consumptionRate, setConsumptionRate] = useState("");
  const [consumptionUnit, setConsumptionUnit] = useState("kg/hr");
  const [flueGasTemp, setFlueGasTemp] = useState("");
  const [ambientTemp, setAmbientTemp] = useState("");
  const [draftLoss, setDraftLoss] = useState("50");
  const [heightConstraint, setHeightConstraint] = useState("");
  const [stackMaterial, setStackMaterial] = useState("steel");
  const [draftType, setDraftType] = useState("natural");
  const [so2EmissionRate, setSo2EmissionRate] = useState("");
  const [heatEmissionRate, setHeatEmissionRate] = useState("");
  const [sulfurContent, setSulfurContent] = useState("");
  const [result, setResult] = useState<{
    flueGasFlow: number;
    minDiameter: number;
    recommendedHeight: number;
    flueGasVelocity: number;
    availableDraft: number;
  } | null>(null);

  // Fuel type properties
  const fuelProperties = {
    "furnace-oil": { 
      name: "Furnace Oil", 
      specificFlueGas: 12.5, // m³/kg
      recommendedVelocity: 13,
      unit: "kg/hr",
      calorificValue: 10200, // kcal/kg
      defaultSulfur: 2.5 // % by weight
    },
    "diesel": { 
      name: "Diesel", 
      specificFlueGas: 13.2, // m³/kg
      recommendedVelocity: 13,
      unit: "kg/hr",
      calorificValue: 10500, // kcal/kg
      defaultSulfur: 0.05 // % by weight
    },
    "natural-gas": { 
      name: "Natural Gas", 
      specificFlueGas: 11.5, // m³/Nm³
      recommendedVelocity: 14,
      unit: "Nm³/hr",
      calorificValue: 8900, // kcal/Nm³
      defaultSulfur: 0.001 // % by volume
    },
    "biomass": { 
      name: "Biomass", 
      specificFlueGas: 8.5, // m³/kg
      recommendedVelocity: 7,
      unit: "kg/hr",
      calorificValue: 3500, // kcal/kg
      defaultSulfur: 0.1 // % by weight
    },
    "coal": { 
      name: "Coal", 
      specificFlueGas: 10.8, // m³/kg
      recommendedVelocity: 8,
      unit: "kg/hr",
      calorificValue: 6000, // kcal/kg
      defaultSulfur: 1.5 // % by weight
    },
    "lpg": { 
      name: "LPG", 
      specificFlueGas: 12.8, // m³/kg
      recommendedVelocity: 14,
      unit: "kg/hr",
      calorificValue: 11900, // kcal/kg
      defaultSulfur: 0.002 // % by weight
    }
  };

  const handleFuelTypeChange = (fuel: string) => {
    setFuelType(fuel);
    const fuelProp = fuelProperties[fuel as keyof typeof fuelProperties];
    setConsumptionUnit(fuelProp.unit);
    setSulfurContent(fuelProp.defaultSulfur.toString());
    
    // Auto-calculate emissions if consumption rate is available
    if (consumptionRate) {
      calculateEmissions(fuel, parseFloat(consumptionRate), fuelProp.defaultSulfur);
    }
  };

  const calculateEmissions = (fuel: string, consumption: number, sulfur: number) => {
    const fuelProp = fuelProperties[fuel as keyof typeof fuelProperties];
    
    // 1. Calculate Heat Emission (MW)
    // Heat Rate = Fuel Consumption × Calorific Value
    const heatRateKcalHr = consumption * fuelProp.calorificValue; // kcal/hr
    const heatRateMW = (heatRateKcalHr * 4.184) / 3600000; // Convert kcal/hr to MW
    setHeatEmissionRate(heatRateMW.toFixed(2));
    
    // 2. Calculate SO₂ Emission Rate (kg/hr)
    // SO₂ = Fuel Consumption × Sulfur % × 2 (molecular weight conversion S to SO₂)
    // Factor of 2 because: MW of SO₂ (64) / MW of S (32) = 2
    const so2Rate = consumption * (sulfur / 100) * 2; // kg/hr
    setSo2EmissionRate(so2Rate.toFixed(3));
  };

  const handleConsumptionChange = (value: string) => {
    setConsumptionRate(value);
    
    // Auto-calculate emissions when consumption changes
    if (value && sulfurContent) {
      calculateEmissions(fuelType, parseFloat(value), parseFloat(sulfurContent));
    }
  };

  const handleSulfurChange = (value: string) => {
    setSulfurContent(value);
    
    // Auto-calculate emissions when sulfur content changes
    if (consumptionRate && value) {
      calculateEmissions(fuelType, parseFloat(consumptionRate), parseFloat(value));
    }
  };

  const calculateChimney = () => {
    const consumption = parseFloat(consumptionRate);
    const T_flue = parseFloat(flueGasTemp) + 273.15; // Convert to Kelvin
    const T_ambient = parseFloat(ambientTemp) + 273.15; // Convert to Kelvin
    const deltaP_loss = parseFloat(draftLoss);
    const heightLimit = parseFloat(heightConstraint) || 30; // Default max height

    if (!consumption || !T_flue || !T_ambient) return;

    const fuelProp = fuelProperties[fuelType as keyof typeof fuelProperties];
    
    // 1. Calculate flue gas flow rate at actual temperature
    // Standard calculation: Q_std = (Fuel consumption × specific flue gas volume) / 3600
    const flueGasFlowStd = (consumption * fuelProp.specificFlueGas) / 3600; // m³/s at 0°C
    
    // Temperature correction: Q_actual = Q_std × (T_actual / T_standard)
    // T_standard = 273.15 K (0°C), T_actual = inlet temperature in K
    const T_standard = 273.15; // 0°C in Kelvin
    const temperatureCorrectionFactor = T_flue / T_standard;
    const flueGasFlow = flueGasFlowStd * temperatureCorrectionFactor; // m³/s at actual temperature

    // 2. Calculate minimum chimney diameter based on recommended velocity
    const velocity = fuelProp.recommendedVelocity;
    const area = flueGasFlow / velocity; // m²
    const diameter = Math.sqrt((4 * area) / Math.PI) * 1000; // Convert to mm

    // 3. Calculate required chimney height based on draft type
    let recommendedHeight: number;
    let availableDraft: number;
    
    if (draftType === "natural") {
      // Natural draft calculation
      // ΔP = ρ × g × H × (1/T_a - 1/T_g)
      // Rearranging: H = ΔP / [ρ × g × (1/T_a - 1/T_g)]
      const rho = 1.225; // Air density at 15°C (kg/m³)
      const g = 9.81; // Gravity (m/s²)
      const tempDiff = (1 / T_ambient) - (1 / T_flue);
      
      // Required draft pressure (Pa) - includes friction losses
      const requiredDraft = deltaP_loss + 20; // Base draft + losses
      
      recommendedHeight = requiredDraft / (rho * g * tempDiff);
      
      // Apply minimum height constraints (environmental standards)
      const minHeight = Math.max(11, 2.5 * 6); // Assume 6m building height minimum
      recommendedHeight = Math.max(recommendedHeight, minHeight);
      
      // Calculate available draft at recommended height
      availableDraft = rho * g * recommendedHeight * tempDiff;
      
    } else {
      // Forced draft calculation - focus on dispersion and regulatory requirements
      let heightByDispersion = 11; // Minimum regulatory height
      
      // Method 1: CPCB formula for SO2 emissions (if provided)
      if (so2EmissionRate) {
        const so2Rate = parseFloat(so2EmissionRate);
        heightByDispersion = 14 * Math.pow(so2Rate, 0.3); // H = 14 × Q^0.3
      }
      
      // Method 2: Heat load approach (if provided)
      if (heatEmissionRate) {
        const heatRate = parseFloat(heatEmissionRate);
        const k = 0.7; // Empirical constant for industrial applications
        const heightByHeat = k * Math.sqrt(heatRate); // H = k × √Q
        heightByDispersion = Math.max(heightByDispersion, heightByHeat);
      }
      
      // Method 3: Exit velocity approach for adequate dispersion
      // Ensure exit velocity > 15 m/s to minimize downwash
      const targetExitVelocity = 15; // m/s
      const areaForVelocity = flueGasFlow / targetExitVelocity;
      const diameterForVelocity = Math.sqrt((4 * areaForVelocity) / Math.PI) * 1000;
      
      // Minimum height based on building clearance (3m above nearby structures)
      const buildingClearanceHeight = 15; // Assume 12m building + 3m clearance
      
      recommendedHeight = Math.max(heightByDispersion, buildingClearanceHeight, 11);
      
      // For forced draft, available draft is not relevant (fan provides pressure)
      availableDraft = 0; // Not applicable for forced draft
    }
    
    // Limit to height constraint if provided
    if (heightConstraint) {
      recommendedHeight = Math.min(recommendedHeight, heightLimit);
    }

    setResult({
      flueGasFlow: flueGasFlow * 3600, // Convert back to m³/hr for display
      minDiameter: diameter,
      recommendedHeight: recommendedHeight,
      flueGasVelocity: velocity,
      availableDraft: availableDraft
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="fuelType">Fuel Type</Label>
          <Select value={fuelType} onValueChange={handleFuelTypeChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(fuelProperties).map(([key, fuel]) => (
                <SelectItem key={key} value={key}>{fuel.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="consumptionRate">Fuel Consumption Rate</Label>
          <div className="flex gap-2">
            <Input
              id="consumptionRate"
              type="number"
              step="0.1"
              value={consumptionRate}
              onChange={(e) => handleConsumptionChange(e.target.value)}
              placeholder="e.g., 100"
              className="flex-1"
            />
            <div className="w-20 text-sm text-muted-foreground flex items-center justify-center bg-muted rounded-md px-2">
              {consumptionUnit}
            </div>
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="sulfurContent">Sulfur Content (% by weight)</Label>
        <Input
          id="sulfurContent"
          type="number"
          step="0.001"
          value={sulfurContent}
          onChange={(e) => handleSulfurChange(e.target.value)}
          placeholder="e.g., 2.5"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Auto-populates based on fuel type. Modify as needed for accurate emissions calculation.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="flueGasTemp">Flue Gas Temperature at Inlet (°C)</Label>
          <Input
            id="flueGasTemp"
            type="number"
            value={flueGasTemp}
            onChange={(e) => setFlueGasTemp(e.target.value)}
            placeholder="e.g., 180"
          />
        </div>
        <div>
          <Label htmlFor="ambientTemp">Ambient Temperature (°C)</Label>
          <Input
            id="ambientTemp"
            type="number"
            value={ambientTemp}
            onChange={(e) => setAmbientTemp(e.target.value)}
            placeholder="e.g., 25"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="draftLoss">Chimney Draft Loss (Pa) - Optional</Label>
          <Input
            id="draftLoss"
            type="number"
            step="1"
            value={draftLoss}
            onChange={(e) => setDraftLoss(e.target.value)}
            placeholder="e.g., 50"
          />
        </div>
        <div>
          <Label htmlFor="heightConstraint">Height Constraint (m) - Optional</Label>
          <Input
            id="heightConstraint"
            type="number"
            step="0.5"
            value={heightConstraint}
            onChange={(e) => setHeightConstraint(e.target.value)}
            placeholder="e.g., 25"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="draftType">Draft System Type</Label>
          <Select value={draftType} onValueChange={setDraftType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="natural">Natural Draft</SelectItem>
              <SelectItem value="forced">Forced Draft (FD)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="stackMaterial">Stack Material</Label>
          <Select value={stackMaterial} onValueChange={setStackMaterial}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="steel">Carbon Steel</SelectItem>
              <SelectItem value="stainless">Stainless Steel</SelectItem>
              <SelectItem value="refractory">Refractory Lined</SelectItem>
              <SelectItem value="concrete">Concrete</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {draftType === "forced" && (
        <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="col-span-2">
            <Label className="text-blue-900 font-semibold">Forced Draft - Emission Data (Optional)</Label>
            <p className="text-sm text-blue-700 mt-1">Provide emission data for regulatory height calculations</p>
          </div>
          <div>
            <Label htmlFor="so2EmissionRate">SO₂ Emission Rate (kg/hr)</Label>
            <div className="flex gap-2">
              <Input
                id="so2EmissionRate"
                type="number"
                step="0.001"
                value={so2EmissionRate}
                onChange={(e) => setSo2EmissionRate(e.target.value)}
                placeholder="e.g., 2.5"
                className="flex-1"
              />
              <div className="w-16 text-xs text-green-600 flex items-center justify-center bg-green-50 rounded-md px-2 border">
                Auto
              </div>
            </div>
            <p className="text-xs text-blue-600 mt-1">Auto-calculated from fuel consumption × sulfur % × 2</p>
          </div>
          <div>
            <Label htmlFor="heatEmissionRate">Heat Emission (MW)</Label>
            <div className="flex gap-2">
              <Input
                id="heatEmissionRate"
                type="number"
                step="0.01"
                value={heatEmissionRate}
                onChange={(e) => setHeatEmissionRate(e.target.value)}
                placeholder="e.g., 5.0"
                className="flex-1"
              />
              <div className="w-16 text-xs text-green-600 flex items-center justify-center bg-green-50 rounded-md px-2 border">
                Auto
              </div>
            </div>
            <p className="text-xs text-blue-600 mt-1">Auto-calculated from fuel consumption × calorific value</p>
          </div>
        </div>
      )}

      <Button onClick={calculateChimney} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Chimney Dimensions
      </Button>

      {result !== null && (
        <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <h4 className="font-semibold text-purple-900">Calculation Results</h4>
          <div className="grid grid-cols-2 gap-4 mt-3 text-purple-800">
            <div>
              <p className="text-sm text-purple-600">Flue Gas Flow Rate</p>
              <p className="font-bold">{result.flueGasFlow.toFixed(1)} m³/hr</p>
            </div>
            <div>
              <p className="text-sm text-purple-600">Flue Gas Velocity</p>
              <p className="font-bold">{result.flueGasVelocity.toFixed(1)} m/s</p>
            </div>
            {draftType === "natural" ? (
              <>
                <div>
                  <p className="text-sm text-purple-600">Available Draft</p>
                  <p className="font-bold">{result.availableDraft.toFixed(1)} Pa</p>
                </div>
                <div>
                  <p className="text-sm text-purple-600">Draft Status</p>
                  <p className="font-bold">
                    {result.availableDraft > parseFloat(draftLoss) ? "✓ Adequate" : "⚠ Insufficient"}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-sm text-purple-600">Exit Velocity</p>
                  <p className="font-bold">{(result.flueGasFlow / 3600 / (Math.PI * Math.pow(result.minDiameter / 2000, 2))).toFixed(1)} m/s</p>
                </div>
                <div>
                  <p className="text-sm text-purple-600">Design Basis</p>
                  <p className="font-bold">Dispersion & Regulatory</p>
                </div>
              </>
            )}
          </div>
          
          <div className="mt-4 pt-4 border-t border-purple-300">
            <div className="grid grid-cols-2 gap-8">
              <div className="text-center">
                <p className="text-sm text-purple-600">Minimum Chimney Diameter</p>
                <p className="font-bold text-xl text-purple-900">{result.minDiameter.toFixed(0)} mm</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-purple-600">Recommended Height</p>
                <p className="font-bold text-xl text-purple-900">{result.recommendedHeight.toFixed(1)} m</p>
              </div>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-purple-100 rounded">
            <h5 className="font-semibold text-purple-900 mb-2">Design Notes:</h5>
            <ul className="text-xs text-purple-700 space-y-1">
              <li>• Diameter calculation based on optimal flue gas velocity for {fuelProperties[fuelType as keyof typeof fuelProperties].name}</li>
              <li>• Flue gas flow rate calculated at actual inlet temperature ({flueGasTemp}°C)</li>
              {draftType === "natural" ? (
                <>
                  <li>• Height ensures adequate natural draft for combustion air supply</li>
                  <li>• Natural draft calculation: H = ΔP / [ρ × g × (1/T_ambient - 1/T_flue)]</li>
                  <li>• Temperature difference creates buoyancy for draft effect</li>
                </>
              ) : (
                <>
                  <li>• Height based on pollutant dispersion and regulatory requirements</li>
                  <li>• {so2EmissionRate ? `CPCB formula applied: H = 14 × (${so2EmissionRate})^0.3` : "Minimum dispersion height applied"}</li>
                  <li>• Exit velocity greater than 15 m/s recommended to minimize downwash</li>
                  <li>• Fan provides required draft pressure (natural draft not applicable)</li>
                </>
              )}
              <li>• Consider local building codes and environmental regulations</li>
              <li>• Add safety margin for temperature variations and fouling</li>
              <li>• {stackMaterial === "steel" ? "Steel construction suitable for moderate temperatures" : 
                     stackMaterial === "refractory" ? "Refractory lining recommended for high temperatures" :
                     "Material selection appropriate for application"}</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// Thermal Oil Heater Sizing Calculator Component
function ThermalOilHeaterSizingCalculator() {
  const [heatDuty, setHeatDuty] = useState("");
  const [inletTemp, setInletTemp] = useState("");
  const [outletTemp, setOutletTemp] = useState("");
  const [specificHeat, setSpecificHeat] = useState("2.1");
  const [oilDensity, setOilDensity] = useState("850");
  const [result, setResult] = useState<{
    heaterCapacity: number;
    oilFlowRate: number;
    temperatureRise: number;
  } | null>(null);

  const calculateHeaterSizing = () => {
    const Q = parseFloat(heatDuty); // kcal/hr
    const T_in = parseFloat(inletTemp);
    const T_out = parseFloat(outletTemp);
    const Cp = parseFloat(specificHeat); // kcal/kg°C
    const rho = parseFloat(oilDensity); // kg/m³

    if (!Q || !T_in || !T_out || !Cp || !rho || T_out <= T_in) return;

    const deltaT = T_out - T_in;
    
    // Mass flow rate: m = Q / (Cp × ΔT)
    const massFlowRate = Q / (Cp * deltaT); // kg/hr
    
    // Volume flow rate: V = m / ρ
    const volumeFlowRate = massFlowRate / rho; // m³/hr
    
    // Heater capacity (add 10% safety margin)
    const heaterCapacity = Q * 1.1; // kcal/hr

    setResult({
      heaterCapacity: heaterCapacity,
      oilFlowRate: volumeFlowRate,
      temperatureRise: deltaT
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="heatDuty">Heat Duty (kcal/hr)</Label>
          <Input
            id="heatDuty"
            type="number"
            value={heatDuty}
            onChange={(e) => setHeatDuty(e.target.value)}
            placeholder="e.g., 50000"
          />
        </div>
        <div>
          <Label htmlFor="specificHeat">Specific Heat (kcal/kg°C)</Label>
          <Input
            id="specificHeat"
            type="number"
            step="0.1"
            value={specificHeat}
            onChange={(e) => setSpecificHeat(e.target.value)}
            placeholder="e.g., 2.1"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="inletTemp">Inlet Oil Temperature (°C)</Label>
          <Input
            id="inletTemp"
            type="number"
            value={inletTemp}
            onChange={(e) => setInletTemp(e.target.value)}
            placeholder="e.g., 180"
          />
        </div>
        <div>
          <Label htmlFor="outletTemp">Outlet Oil Temperature (°C)</Label>
          <Input
            id="outletTemp"
            type="number"
            value={outletTemp}
            onChange={(e) => setOutletTemp(e.target.value)}
            placeholder="e.g., 220"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="oilDensity">Oil Density (kg/m³)</Label>
        <Input
          id="oilDensity"
          type="number"
          value={oilDensity}
          onChange={(e) => setOilDensity(e.target.value)}
          placeholder="e.g., 850"
        />
      </div>

      <Button onClick={calculateHeaterSizing} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Heater Sizing
      </Button>

      {result !== null && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <h4 className="font-semibold text-red-900">Sizing Results</h4>
          <div className="grid grid-cols-2 gap-4 mt-3 text-red-800">
            <div>
              <p className="text-sm text-red-600">Temperature Rise</p>
              <p className="font-bold">{result.temperatureRise.toFixed(1)} °C</p>
            </div>
            <div>
              <p className="text-sm text-red-600">Oil Flow Rate</p>
              <p className="font-bold">{result.oilFlowRate.toFixed(2)} m³/hr</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-red-300 text-center">
            <p className="text-sm text-red-600">Required Heater Capacity</p>
            <p className="font-bold text-xl text-red-900">{result.heaterCapacity.toFixed(0)} kcal/hr</p>
            <p className="text-sm text-red-600 mt-1">({(result.heaterCapacity * 1.163 / 1000).toFixed(1)} kW)</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Thermal Oil Flow Rate & Pump Sizing Tool Component
function ThermalOilPumpSizingCalculator() {
  const [heatLoad, setHeatLoad] = useState("");
  const [tempRise, setTempRise] = useState("");
  const [oilSpecificHeat, setOilSpecificHeat] = useState("2.1");
  const [oilDensity, setOilDensity] = useState("850");
  const [pipeLength, setPipeLength] = useState("");
  const [pipeDiameter, setPipeDiameter] = useState("");
  const [result, setResult] = useState<{
    flowRate: number;
    pumpHead: number;
    pumpPower: number;
    velocity: number;
    reynoldsNumber: number;
    frictionFactor: number;
    frictionHead: number;
    staticHead: number;
    minorLosses: number;
  } | null>(null);

  const calculatePumpSizing = () => {
    const Q_kW = parseFloat(heatLoad); // kW
    const deltaT = parseFloat(tempRise); // °C
    const Cp = parseFloat(oilSpecificHeat); // kcal/kg°C
    const rho = parseFloat(oilDensity); // kg/m³
    const L = parseFloat(pipeLength); // m
    const D = parseFloat(pipeDiameter); // m

    // Validate all required inputs
    if (!Q_kW || !deltaT || !Cp || !rho || !L || !D) {
      console.log("Missing required values for pump sizing");
      return;
    }

    // Convert kW to kcal/hr: 1 kW = 860 kcal/hr
    const Q_kcal = Q_kW * 860;
    
    // Mass flow rate: m = Q / (Cp × ΔT)
    const massFlowRate = Q_kcal / (Cp * deltaT); // kg/hr
    
    // Volume flow rate: V = m / ρ
    const volumeFlowRate = massFlowRate / rho; // m³/hr
    
    // Flow velocity in pipe
    const area = Math.PI * Math.pow(D, 2) / 4;
    const velocity = (volumeFlowRate / 3600) / area; // m/s
    
    // Reynolds Number for thermal oil flow
    const viscosity = 5e-3; // Pa·s (typical for thermal oil at operating temperature)
    const Re = (rho * velocity * D) / viscosity;
    
    // Friction factor calculation (Moody diagram approximation)
    let f;
    if (Re < 2300) {
      f = 64 / Re; // Laminar flow
    } else {
      // Turbulent flow (smooth pipe approximation)
      f = 0.316 / Math.pow(Re, 0.25);
    }
    
    // Friction head loss (Darcy-Weisbach equation)
    const frictionHead = (f * L * Math.pow(velocity, 2)) / (2 * 9.81 * D); // m
    
    // Minor losses (fittings, valves, etc.) - typically 20-30% of friction loss
    const minorLosses = frictionHead * 0.25;
    
    // Static head (elevation changes) - assume 5m minimum
    const staticHead = 5;
    
    // Safety margin for pump sizing
    const safetyFactor = 1.15;
    
    // Total head calculation
    const totalHead = (frictionHead + minorLosses + staticHead) * safetyFactor; // m
    
    // Pump power: P = ρ × g × Q × H / η
    const efficiency = 0.75; // 75% pump efficiency
    const pumpPower = (rho * 9.81 * (volumeFlowRate / 3600) * totalHead) / (efficiency * 1000); // kW

    setResult({
      flowRate: volumeFlowRate,
      pumpHead: totalHead,
      pumpPower: pumpPower,
      velocity: velocity,
      reynoldsNumber: Re,
      frictionFactor: f,
      frictionHead: frictionHead,
      staticHead: staticHead,
      minorLosses: minorLosses
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="heatLoad">Heat Load (kW)</Label>
          <Input
            id="heatLoad"
            type="number"
            value={heatLoad}
            onChange={(e) => setHeatLoad(e.target.value)}
            placeholder="e.g., 100"
          />
        </div>
        <div>
          <Label htmlFor="tempRise">Temperature Rise (°C)</Label>
          <Input
            id="tempRise"
            type="number"
            value={tempRise}
            onChange={(e) => setTempRise(e.target.value)}
            placeholder="e.g., 40"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="oilSpecificHeat">Oil Specific Heat (kcal/kg°C)</Label>
          <Input
            id="oilSpecificHeat"
            type="number"
            step="0.1"
            value={oilSpecificHeat}
            onChange={(e) => setOilSpecificHeat(e.target.value)}
            placeholder="e.g., 2.1"
          />
        </div>
        <div>
          <Label htmlFor="oilDensity">Oil Density (kg/m³)</Label>
          <Input
            id="oilDensity"
            type="number"
            value={oilDensity}
            onChange={(e) => setOilDensity(e.target.value)}
            placeholder="e.g., 850"
          />
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-semibold text-cyan-900">Piping System Parameters (Required)</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="pipeLength">Total Pipe Length (m) *</Label>
            <Input
              id="pipeLength"
              type="number"
              value={pipeLength}
              onChange={(e) => setPipeLength(e.target.value)}
              placeholder="e.g., 50"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Include supply and return piping length
            </p>
          </div>
          <div>
            <Label htmlFor="pipeDiameter">Pipe Internal Diameter (m) *</Label>
            <Input
              id="pipeDiameter"
              type="number"
              step="0.001"
              value={pipeDiameter}
              onChange={(e) => setPipeDiameter(e.target.value)}
              placeholder="e.g., 0.1"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Internal diameter (ID) of the pipe
            </p>
          </div>
        </div>
      </div>

      <Button onClick={calculatePumpSizing} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Pump Sizing
      </Button>

      {result !== null && (
        <div className="mt-4 space-y-4">
          {/* Main Results */}
          <div className="p-4 bg-cyan-50 border border-cyan-200 rounded-lg">
            <h4 className="font-semibold text-cyan-900 mb-3">Pump Sizing Results</h4>
            <div className="grid grid-cols-2 gap-4 text-cyan-800">
              <div>
                <p className="text-sm text-cyan-600">Required Flow Rate</p>
                <p className="font-bold">{result.flowRate.toFixed(2)} m³/hr</p>
              </div>
              <div>
                <p className="text-sm text-cyan-600">Flow Velocity</p>
                <p className="font-bold">{result.velocity.toFixed(2)} m/s</p>
                <p className="text-xs text-cyan-500">
                  {result.velocity < 1.5 ? "✓ Optimal" : result.velocity < 3 ? "⚠ Acceptable" : "⚠ High velocity"}
                </p>
              </div>
              <div>
                <p className="text-sm text-cyan-600">Total Pump Head</p>
                <p className="font-bold">{result.pumpHead.toFixed(1)} m</p>
              </div>
              <div>
                <p className="text-sm text-cyan-600">Pump Power Required</p>
                <p className="font-bold">{result.pumpPower.toFixed(2)} kW</p>
                <p className="text-xs text-cyan-500">({(result.pumpPower * 1.34).toFixed(2)} HP)</p>
              </div>
            </div>
          </div>

          {/* Engineering Details */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-semibold text-blue-900 mb-3">Engineering Analysis</h4>
            <div className="grid grid-cols-2 gap-4 text-blue-800">
              <div>
                <p className="text-sm text-blue-600">Reynolds Number</p>
                <p className="font-bold">{result.reynoldsNumber.toFixed(0)}</p>
                <p className="text-xs text-blue-500">
                  {result.reynoldsNumber < 2300 ? "Laminar Flow" : "Turbulent Flow"}
                </p>
              </div>
              <div>
                <p className="text-sm text-blue-600">Friction Factor</p>
                <p className="font-bold">{result.frictionFactor.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-sm text-blue-600">Friction Head Loss</p>
                <p className="font-bold">{result.frictionHead.toFixed(2)} m</p>
              </div>
              <div>
                <p className="text-sm text-blue-600">Minor Losses</p>
                <p className="font-bold">{result.minorLosses.toFixed(2)} m</p>
              </div>
            </div>
          </div>

          {/* Head Loss Breakdown */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h4 className="font-semibold text-gray-900 mb-3">Head Loss Breakdown</h4>
            <div className="space-y-2 text-gray-800">
              <div className="flex justify-between">
                <span>Friction Head Loss:</span>
                <span className="font-medium">{result.frictionHead.toFixed(2)} m</span>
              </div>
              <div className="flex justify-between">
                <span>Minor Losses (Fittings):</span>
                <span className="font-medium">{result.minorLosses.toFixed(2)} m</span>
              </div>
              <div className="flex justify-between">
                <span>Static Head:</span>
                <span className="font-medium">{result.staticHead.toFixed(1)} m</span>
              </div>
              <div className="flex justify-between">
                <span>Safety Factor (15%):</span>
                <span className="font-medium">{((result.pumpHead / 1.15) * 0.15).toFixed(2)} m</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-bold">
                <span>Total Head Required:</span>
                <span>{result.pumpHead.toFixed(1)} m</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Combustion Air Requirement Calculator Component
function CombustionAirCalculator() {
  const [fuelType, setFuelType] = useState("furnace-oil");
  const [consumptionRate, setConsumptionRate] = useState("");
  const [excessAir, setExcessAir] = useState("20");
  const [result, setResult] = useState<{
    theoreticalAir: number;
    totalAir: number;
    blowerCapacity: number;
    airVelocity: number;
  } | null>(null);

  const fuelAirData = {
    "furnace-oil": { name: "Furnace Oil", airReq: 11.5, unit: "kg/hr" }, // Nm³/kg
    "diesel": { name: "Diesel", airReq: 11.8, unit: "kg/hr" },
    "natural-gas": { name: "Natural Gas", airReq: 9.5, unit: "Nm³/hr" }, // Nm³/Nm³
    "lpg": { name: "LPG", airReq: 23.8, unit: "kg/hr" },
    "coal": { name: "Coal", airReq: 8.5, unit: "kg/hr" }
  };

  const calculateCombustionAir = () => {
    const consumption = parseFloat(consumptionRate);
    const excess = parseFloat(excessAir);
    
    if (!consumption || !excess) return;

    const fuelData = fuelAirData[fuelType as keyof typeof fuelAirData];
    
    // Theoretical air requirement
    const theoreticalAir = consumption * fuelData.airReq; // Nm³/hr
    
    // Total air with excess air
    const totalAir = theoreticalAir * (1 + excess / 100); // Nm³/hr
    
    // Blower capacity (add 15% safety margin)
    const blowerCapacity = totalAir * 1.15; // Nm³/hr
    
    // Estimated air velocity in duct (assuming 0.2m diameter)
    const ductArea = Math.PI * Math.pow(0.2, 2) / 4; // m²
    const airVelocity = (totalAir / 3600) / ductArea; // m/s

    setResult({
      theoreticalAir: theoreticalAir,
      totalAir: totalAir,
      blowerCapacity: blowerCapacity,
      airVelocity: airVelocity
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="fuelType">Fuel Type</Label>
          <Select value={fuelType} onValueChange={setFuelType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(fuelAirData).map(([key, fuel]) => (
                <SelectItem key={key} value={key}>{fuel.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="consumptionRate">Consumption Rate ({fuelAirData[fuelType as keyof typeof fuelAirData].unit})</Label>
          <Input
            id="consumptionRate"
            type="number"
            value={consumptionRate}
            onChange={(e) => setConsumptionRate(e.target.value)}
            placeholder="e.g., 100"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="excessAir">Excess Air (%)</Label>
        <Input
          id="excessAir"
          type="number"
          value={excessAir}
          onChange={(e) => setExcessAir(e.target.value)}
          placeholder="e.g., 20"
        />
      </div>

      <Button onClick={calculateCombustionAir} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Air Requirement
      </Button>

      {result !== null && (
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h4 className="font-semibold text-yellow-900">Air Requirement Results</h4>
          <div className="grid grid-cols-2 gap-4 mt-3 text-yellow-800">
            <div>
              <p className="text-sm text-yellow-600">Theoretical Air</p>
              <p className="font-bold">{result.theoreticalAir.toFixed(1)} Nm³/hr</p>
            </div>
            <div>
              <p className="text-sm text-yellow-600">Total Air Required</p>
              <p className="font-bold">{result.totalAir.toFixed(1)} Nm³/hr</p>
            </div>
            <div>
              <p className="text-sm text-yellow-600">Blower Capacity</p>
              <p className="font-bold">{result.blowerCapacity.toFixed(1)} Nm³/hr</p>
            </div>
            <div>
              <p className="text-sm text-yellow-600">Air Velocity</p>
              <p className="font-bold">{result.airVelocity.toFixed(1)} m/s</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Burner Capacity & Efficiency Estimator Component
function BurnerCapacityCalculator() {
  const [fuelFlowRate, setFuelFlowRate] = useState("");
  const [gcv, setGcv] = useState("");
  const [efficiency, setEfficiency] = useState("85");
  const [fuelType, setFuelType] = useState("furnace-oil");
  const [result, setResult] = useState<{
    burnerOutput: number;
    fuelUtilization: number;
    heatInput: number;
    heatLoss: number;
  } | null>(null);

  const fuelGCVData = {
    "furnace-oil": { name: "Furnace Oil", gcv: 10000, unit: "kg/hr" }, // kcal/kg
    "diesel": { name: "Diesel", gcv: 10200, unit: "kg/hr" },
    "natural-gas": { name: "Natural Gas", gcv: 8500, unit: "Nm³/hr" }, // kcal/Nm³
    "lpg": { name: "LPG", gcv: 11000, unit: "kg/hr" }
  };

  const handleFuelTypeChange = (fuel: string) => {
    setFuelType(fuel);
    setGcv(fuelGCVData[fuel as keyof typeof fuelGCVData].gcv.toString());
  };

  const calculateBurnerCapacity = () => {
    const flowRate = parseFloat(fuelFlowRate);
    const grossCV = parseFloat(gcv);
    const eff = parseFloat(efficiency);
    
    if (!flowRate || !grossCV || !eff) return;

    // Heat input = Flow rate × GCV
    const heatInput = flowRate * grossCV; // kcal/hr
    
    // Burner output = Heat input × Efficiency
    const burnerOutput = heatInput * (eff / 100); // kcal/hr
    
    // Heat loss = Heat input - Burner output
    const heatLoss = heatInput - burnerOutput; // kcal/hr
    
    // Fuel utilization rate (same as efficiency)
    const fuelUtilization = eff; // %

    setResult({
      burnerOutput: burnerOutput,
      fuelUtilization: fuelUtilization,
      heatInput: heatInput,
      heatLoss: heatLoss
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="fuelType">Fuel Type</Label>
          <Select value={fuelType} onValueChange={handleFuelTypeChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(fuelGCVData).map(([key, fuel]) => (
                <SelectItem key={key} value={key}>{fuel.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="fuelFlowRate">Fuel Flow Rate ({fuelGCVData[fuelType as keyof typeof fuelGCVData].unit})</Label>
          <Input
            id="fuelFlowRate"
            type="number"
            value={fuelFlowRate}
            onChange={(e) => setFuelFlowRate(e.target.value)}
            placeholder="e.g., 10"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="gcv">Gross Calorific Value (kcal/kg or kcal/Nm³)</Label>
          <Input
            id="gcv"
            type="number"
            value={gcv}
            onChange={(e) => setGcv(e.target.value)}
            placeholder="e.g., 10000"
          />
        </div>
        <div>
          <Label htmlFor="efficiency">Burner Efficiency (%)</Label>
          <Input
            id="efficiency"
            type="number"
            value={efficiency}
            onChange={(e) => setEfficiency(e.target.value)}
            placeholder="e.g., 85"
          />
        </div>
      </div>

      <Button onClick={calculateBurnerCapacity} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Burner Performance
      </Button>

      {result !== null && (
        <div className="mt-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
          <h4 className="font-semibold text-indigo-900">Burner Performance Results</h4>
          <div className="grid grid-cols-2 gap-4 mt-3 text-indigo-800">
            <div>
              <p className="text-sm text-indigo-600">Heat Input</p>
              <p className="font-bold">{result.heatInput.toFixed(0)} kcal/hr</p>
            </div>
            <div>
              <p className="text-sm text-indigo-600">Heat Loss</p>
              <p className="font-bold">{result.heatLoss.toFixed(0)} kcal/hr</p>
            </div>
            <div>
              <p className="text-sm text-indigo-600">Fuel Utilization</p>
              <p className="font-bold">{result.fuelUtilization.toFixed(1)} %</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-indigo-300 text-center">
            <p className="text-sm text-indigo-600">Burner Output</p>
            <p className="font-bold text-xl text-indigo-900">{result.burnerOutput.toFixed(0)} kcal/hr</p>
            <p className="text-sm text-indigo-600 mt-1">({(result.burnerOutput * 1.163 / 1000).toFixed(1)} kW)</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Flue Gas Temperature & Heat Loss Estimator Component
function FlueGasHeatLossEstimator() {
  const [flueGasTemp, setFlueGasTemp] = useState("");
  const [airFuelRatio, setAirFuelRatio] = useState("");
  const [fuelType, setFuelType] = useState("furnace-oil");
  const [ambientTemp, setAmbientTemp] = useState("25");
  const [excessAir, setExcessAir] = useState("20");
  const [result, setResult] = useState<{
    stackLoss: number;
    heatRecoveryPotential: number;
    sensibleHeatLoss: number;
    theoreticalTemp: number;
  } | null>(null);

  const fuelData = {
    "furnace-oil": { name: "Furnace Oil", theoreticalTemp: 2100, specificHeat: 0.24 },
    "diesel": { name: "Diesel", theoreticalTemp: 2080, specificHeat: 0.24 },
    "natural-gas": { name: "Natural Gas", theoreticalTemp: 1950, specificHeat: 0.26 },
    "lpg": { name: "LPG", theoreticalTemp: 1980, specificHeat: 0.25 },
    "coal": { name: "Coal", theoreticalTemp: 2000, specificHeat: 0.23 }
  };

  const calculateHeatLoss = () => {
    const T_flue = parseFloat(flueGasTemp);
    const airFuel = parseFloat(airFuelRatio);
    const T_ambient = parseFloat(ambientTemp);
    const excess = parseFloat(excessAir);

    if (!T_flue || !airFuel || !T_ambient) return;

    const fuel = fuelData[fuelType as keyof typeof fuelData];
    
    // Stack loss calculation (simplified)
    // Stack loss % = (T_flue - T_ambient) × Cp × (1 + excess_air/100) / fuel_heating_value × 100
    const stackLoss = ((T_flue - T_ambient) * fuel.specificHeat * (1 + excess / 100)) / 100 * 10;
    
    // Sensible heat loss in flue gases
    const sensibleHeatLoss = stackLoss * 0.85; // Typical 85% of stack loss is sensible heat
    
    // Heat recovery potential (assuming cooling to 150°C)
    const recoveryTemp = 150;
    const heatRecoveryPotential = Math.max(0, ((T_flue - recoveryTemp) / (T_flue - T_ambient)) * stackLoss);
    
    // Theoretical combustion temperature
    const theoreticalTemp = fuel.theoreticalTemp - (stackLoss * 15); // Approximate correction

    setResult({
      stackLoss: Math.min(stackLoss, 35), // Cap at realistic maximum
      heatRecoveryPotential: heatRecoveryPotential,
      sensibleHeatLoss: sensibleHeatLoss,
      theoreticalTemp: theoreticalTemp
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="fuelType">Fuel Type</Label>
          <Select value={fuelType} onValueChange={setFuelType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(fuelData).map(([key, fuel]) => (
                <SelectItem key={key} value={key}>{fuel.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="flueGasTemp">Flue Gas Temperature (°C)</Label>
          <Input
            id="flueGasTemp"
            type="number"
            value={flueGasTemp}
            onChange={(e) => setFlueGasTemp(e.target.value)}
            placeholder="e.g., 280"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="airFuelRatio">Air/Fuel Ratio</Label>
          <Input
            id="airFuelRatio"
            type="number"
            step="0.1"
            value={airFuelRatio}
            onChange={(e) => setAirFuelRatio(e.target.value)}
            placeholder="e.g., 12.5"
          />
        </div>
        <div>
          <Label htmlFor="excessAir">Excess Air (%)</Label>
          <Input
            id="excessAir"
            type="number"
            value={excessAir}
            onChange={(e) => setExcessAir(e.target.value)}
            placeholder="e.g., 20"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="ambientTemp">Ambient Temperature (°C)</Label>
        <Input
          id="ambientTemp"
          type="number"
          value={ambientTemp}
          onChange={(e) => setAmbientTemp(e.target.value)}
          placeholder="e.g., 25"
        />
      </div>

      <Button onClick={calculateHeatLoss} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Heat Loss
      </Button>

      {result !== null && (
        <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <h4 className="font-semibold text-orange-900">Heat Loss Analysis</h4>
          <div className="grid grid-cols-2 gap-4 mt-3 text-orange-800">
            <div>
              <p className="text-sm text-orange-600">Stack Loss</p>
              <p className="font-bold">{result.stackLoss.toFixed(1)} %</p>
            </div>
            <div>
              <p className="text-sm text-orange-600">Sensible Heat Loss</p>
              <p className="font-bold">{result.sensibleHeatLoss.toFixed(1)} %</p>
            </div>
            <div>
              <p className="text-sm text-orange-600">Heat Recovery Potential</p>
              <p className="font-bold">{result.heatRecoveryPotential.toFixed(1)} %</p>
            </div>
            <div>
              <p className="text-sm text-orange-600">Theoretical Temp</p>
              <p className="font-bold">{result.theoreticalTemp.toFixed(0)} °C</p>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-orange-100 rounded">
            <h5 className="font-semibold text-orange-900 mb-2">Efficiency Notes:</h5>
            <ul className="text-xs text-orange-700 space-y-1">
              <li>• Stack loss represents heat lost through flue gases</li>
              <li>• Heat recovery potential assumes cooling to 150°C minimum</li>
              <li>• Consider heat exchanger installation for recovery</li>
              <li>• Optimize air/fuel ratio to minimize excess air</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// Coil Surface Area Calculator Component
function CoilSurfaceAreaCalculator() {
  const [heatTransfer, setHeatTransfer] = useState("50000");
  const [hotFluidTempIn, setHotFluidTempIn] = useState("250");
  const [hotFluidTempOut, setHotFluidTempOut] = useState("200");
  const [coldFluidTempIn, setColdFluidTempIn] = useState("80");
  const [coldFluidTempOut, setColdFluidTempOut] = useState("180");
  const [hotFilmCoeff, setHotFilmCoeff] = useState("500");
  const [coldFilmCoeff, setColdFilmCoeff] = useState("1000");
  const [foulingFactor, setFoulingFactor] = useState("0.0002");
  const [coilMaterial, setCoilMaterial] = useState("steel");
  const [flowConfiguration, setFlowConfiguration] = useState("counter");
  const [result, setResult] = useState<{
    overallCoeff: number;
    logMeanTempDiff: number;
    surfaceArea: number;
    coilLength: number;
    heatDutyCheck: number;
  } | null>(null);

  const materialData = {
    "steel": { name: "Carbon Steel", conductivity: 50, thickness: 0.005 },
    "stainless": { name: "Stainless Steel", conductivity: 16, thickness: 0.003 },
    "copper": { name: "Copper", conductivity: 400, thickness: 0.002 }
  };

  const calculateSurfaceArea = () => {
    const Q_kcal = parseFloat(heatTransfer); // kcal/hr
    const T_hot_in = parseFloat(hotFluidTempIn);
    const T_hot_out = parseFloat(hotFluidTempOut);
    const T_cold_in = parseFloat(coldFluidTempIn);
    const T_cold_out = parseFloat(coldFluidTempOut);
    const h_hot = parseFloat(hotFilmCoeff);
    const h_cold = parseFloat(coldFilmCoeff);
    const Rf = parseFloat(foulingFactor);

    // Debug logging
    console.log("Input values:", {
      Q_kcal, T_hot_in, T_hot_out, T_cold_in, T_cold_out, h_hot, h_cold, Rf
    });

    // Check for missing values
    if (isNaN(Q_kcal) || Q_kcal <= 0) {
      console.log("Invalid heat transfer value");
      return;
    }
    if (isNaN(T_hot_in) || isNaN(T_hot_out) || isNaN(T_cold_in) || isNaN(T_cold_out)) {
      console.log("Missing temperature values");
      return;
    }
    if (isNaN(h_hot) || h_hot <= 0 || isNaN(h_cold) || h_cold <= 0) {
      console.log("Invalid film coefficient values");
      return;
    }
    
    // Validate temperature profiles
    if (T_hot_in <= T_hot_out) {
      console.log("Hot fluid inlet must be greater than outlet");
      return;
    }
    if (T_cold_out <= T_cold_in) {
      console.log("Cold fluid outlet must be greater than inlet");
      return;
    }

    // Convert kcal/hr to watts: 1 kcal/hr = 1.163 W
    const Q_watts = Q_kcal * 1.163;

    const material = materialData[coilMaterial as keyof typeof materialData];
    
    // Proper Log Mean Temperature Difference (LMTD) calculation
    let deltaT1, deltaT2;
    
    if (flowConfiguration === "counter") {
      // Counter-current flow: Hot inlet vs Cold outlet, Hot outlet vs Cold inlet
      deltaT1 = T_hot_in - T_cold_out;
      deltaT2 = T_hot_out - T_cold_in;
    } else {
      // Co-current flow: Hot inlet vs Cold inlet, Hot outlet vs Cold outlet
      deltaT1 = T_hot_in - T_cold_in;
      deltaT2 = T_hot_out - T_cold_out;
    }
    
    // Ensure valid temperature differences
    if (deltaT1 <= 0 || deltaT2 <= 0) return;
    
    // Calculate LMTD
    let LMTD;
    if (Math.abs(deltaT1 - deltaT2) < 0.1) {
      LMTD = (deltaT1 + deltaT2) / 2; // Arithmetic mean for small differences
    } else {
      LMTD = (deltaT1 - deltaT2) / Math.log(deltaT1 / deltaT2);
    }
    
    // Overall heat transfer coefficient: 1/U = 1/h_hot + Rf + t/k + 1/h_cold
    const thermalResistance = (1 / h_hot) + Rf + (material.thickness / material.conductivity) + (1 / h_cold);
    const overallCoeff = 1 / thermalResistance;
    
    // Surface area: A = Q / (U × LMTD)
    const surfaceArea = Q_watts / (overallCoeff * LMTD);
    
    // Approximate coil length (assuming 50mm tube diameter)
    const tubeDiameter = 0.05; // 50mm
    const coilLength = surfaceArea / (Math.PI * tubeDiameter);
    
    // Heat duty verification check (Q = U × A × LMTD)
    const heatDutyCheck = (overallCoeff * surfaceArea * LMTD) / 1.163; // Convert back to kcal/hr

    setResult({
      overallCoeff: overallCoeff,
      logMeanTempDiff: LMTD,
      surfaceArea: surfaceArea,
      coilLength: coilLength,
      heatDutyCheck: heatDutyCheck
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="heatTransfer">Heat Transfer Required (kcal/hr)</Label>
          <Input
            id="heatTransfer"
            type="number"
            value={heatTransfer}
            onChange={(e) => setHeatTransfer(e.target.value)}
            placeholder="e.g., 50000"
          />
        </div>
        <div>
          <Label htmlFor="coilMaterial">Coil Material</Label>
          <Select value={coilMaterial} onValueChange={setCoilMaterial}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(materialData).map(([key, material]) => (
                <SelectItem key={key} value={key}>{material.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="flowConfiguration">Flow Configuration</Label>
        <Select value={flowConfiguration} onValueChange={setFlowConfiguration}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="counter">Counter-Current Flow</SelectItem>
            <SelectItem value="cocurrent">Co-Current Flow</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          Counter-current provides better heat transfer efficiency
        </p>
      </div>

      <div className="space-y-4">
        <h4 className="font-semibold text-blue-900">Temperature Profile (°C)</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="hotFluidTempIn">Hot Fluid Inlet Temperature</Label>
            <Input
              id="hotFluidTempIn"
              type="number"
              step="0.1"
              value={hotFluidTempIn}
              onChange={(e) => setHotFluidTempIn(e.target.value)}
              placeholder="e.g., 250"
            />
          </div>
          <div>
            <Label htmlFor="hotFluidTempOut">Hot Fluid Outlet Temperature</Label>
            <Input
              id="hotFluidTempOut"
              type="number"
              step="0.1"
              value={hotFluidTempOut}
              onChange={(e) => setHotFluidTempOut(e.target.value)}
              placeholder="e.g., 200"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="coldFluidTempIn">Cold Fluid Inlet Temperature</Label>
            <Input
              id="coldFluidTempIn"
              type="number"
              step="0.1"
              value={coldFluidTempIn}
              onChange={(e) => setColdFluidTempIn(e.target.value)}
              placeholder="e.g., 80"
            />
          </div>
          <div>
            <Label htmlFor="coldFluidTempOut">Cold Fluid Outlet Temperature</Label>
            <Input
              id="coldFluidTempOut"
              type="number"
              step="0.1"
              value={coldFluidTempOut}
              onChange={(e) => setColdFluidTempOut(e.target.value)}
              placeholder="e.g., 180"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="hotFilmCoeff">Hot Side Film Coefficient (W/m²K)</Label>
          <Input
            id="hotFilmCoeff"
            type="number"
            value={hotFilmCoeff}
            onChange={(e) => setHotFilmCoeff(e.target.value)}
            placeholder="e.g., 500"
          />
        </div>
        <div>
          <Label htmlFor="coldFilmCoeff">Cold Side Film Coefficient (W/m²K)</Label>
          <Input
            id="coldFilmCoeff"
            type="number"
            value={coldFilmCoeff}
            onChange={(e) => setColdFilmCoeff(e.target.value)}
            placeholder="e.g., 1000"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="foulingFactor">Fouling Factor (m²K/W)</Label>
        <Input
          id="foulingFactor"
          type="number"
          step="0.0001"
          value={foulingFactor}
          onChange={(e) => setFoulingFactor(e.target.value)}
          placeholder="e.g., 0.0002"
        />
      </div>

      <Button onClick={calculateSurfaceArea} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Surface Area
      </Button>

      {result !== null && (
        <div className="mt-4 p-4 bg-teal-50 border border-teal-200 rounded-lg">
          <h4 className="font-semibold text-teal-900">Coil Design Results</h4>
          <div className="grid grid-cols-3 gap-4 mt-3 text-teal-800">
            <div>
              <p className="text-sm text-teal-600">Overall U-Value</p>
              <p className="font-bold">{result.overallCoeff.toFixed(1)} W/m²K</p>
            </div>
            <div>
              <p className="text-sm text-teal-600">LMTD ({flowConfiguration === 'counter' ? 'Counter' : 'Co'}-current)</p>
              <p className="font-bold">{result.logMeanTempDiff.toFixed(1)} °C</p>
            </div>
            <div>
              <p className="text-sm text-teal-600">Heat Duty Check</p>
              <p className="font-bold">{result.heatDutyCheck.toFixed(0)} kcal/hr</p>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-teal-300">
            <div className="grid grid-cols-2 gap-8">
              <div className="text-center">
                <p className="text-sm text-teal-600">Required Surface Area</p>
                <p className="font-bold text-xl text-teal-900">{result.surfaceArea.toFixed(1)} m²</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-teal-600">Coil Length (50mm dia)</p>
                <p className="font-bold text-xl text-teal-900">{result.coilLength.toFixed(1)} m</p>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-teal-100 rounded">
            <h5 className="font-semibold text-teal-900 mb-2">Design Verification:</h5>
            <div className="text-sm text-teal-700 space-y-1">
              <p><strong>LMTD Formula:</strong> LMTD = (ΔT₁ - ΔT₂) / ln(ΔT₁/ΔT₂)</p>
              <p><strong>Heat Transfer:</strong> Q = U × A × LMTD</p>
              <p><strong>Material:</strong> {materialData[coilMaterial as keyof typeof materialData].name}</p>
              <p><strong>Flow Configuration:</strong> {flowConfiguration === 'counter' ? 'Counter-current (optimal)' : 'Co-current'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Chimney Draft & Induced Draft Fan Sizing Tool Component
function ChimneyDraftFanSizingCalculator() {
  const [flueGasFlow, setFlueGasFlow] = useState("");
  const [chimneyHeight, setChimneyHeight] = useState("");
  const [chimneyDiameter, setChimneyDiameter] = useState("");
  const [flueGasTemp, setFlueGasTemp] = useState("");
  const [ambientTemp, setAmbientTemp] = useState("25");
  const [draftType, setDraftType] = useState("induced");
  const [result, setResult] = useState<{
    naturalDraft: number;
    requiredFanCapacity: number;
    fanPressure: number;
    fanPower: number;
  } | null>(null);

  const calculateFanSizing = () => {
    const Q = parseFloat(flueGasFlow); // m³/hr
    const H = parseFloat(chimneyHeight); // m
    const D = parseFloat(chimneyDiameter) / 1000; // Convert mm to m
    const T_flue = parseFloat(flueGasTemp) + 273.15; // Convert to Kelvin
    const T_ambient = parseFloat(ambientTemp) + 273.15; // Convert to Kelvin

    if (!Q || !H || !D || !T_flue || !T_ambient) return;

    // Natural draft calculation
    const rho = 1.225; // Air density at 15°C (kg/m³)
    const g = 9.81; // Gravity (m/s²)
    const naturalDraft = rho * g * H * ((1 / T_ambient) - (1 / T_flue)); // Pa
    
    // Friction losses in chimney
    const velocity = (Q / 3600) / (Math.PI * Math.pow(D, 2) / 4); // m/s
    const frictionFactor = 0.02; // Typical for steel chimney
    const frictionLoss = (frictionFactor * H * rho * Math.pow(velocity, 2)) / (2 * D); // Pa
    
    // Required fan pressure
    let fanPressure = frictionLoss + 50; // Base losses
    if (draftType === "induced") {
      fanPressure = Math.max(0, frictionLoss - naturalDraft + 100); // Overcome natural draft
    } else {
      fanPressure = frictionLoss + naturalDraft + 100; // Add to natural draft
    }
    
    // Fan capacity (add 20% safety margin)
    const fanCapacity = Q * 1.2; // m³/hr
    
    // Fan power estimation: P = Q × ΔP / (3600 × η)
    const fanEfficiency = 0.70; // 70% typical fan efficiency
    const fanPower = (fanCapacity / 3600) * fanPressure / (fanEfficiency * 1000); // kW

    setResult({
      naturalDraft: naturalDraft,
      requiredFanCapacity: fanCapacity,
      fanPressure: fanPressure,
      fanPower: fanPower
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="flueGasFlow">Flue Gas Flow Rate (m³/hr)</Label>
          <Input
            id="flueGasFlow"
            type="number"
            value={flueGasFlow}
            onChange={(e) => setFlueGasFlow(e.target.value)}
            placeholder="e.g., 1000"
          />
        </div>
        <div>
          <Label htmlFor="draftType">Draft Type</Label>
          <Select value={draftType} onValueChange={setDraftType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="induced">Induced Draft</SelectItem>
              <SelectItem value="forced">Forced Draft</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="chimneyHeight">Chimney Height (m)</Label>
          <Input
            id="chimneyHeight"
            type="number"
            value={chimneyHeight}
            onChange={(e) => setChimneyHeight(e.target.value)}
            placeholder="e.g., 20"
          />
        </div>
        <div>
          <Label htmlFor="chimneyDiameter">Chimney Diameter (mm)</Label>
          <Input
            id="chimneyDiameter"
            type="number"
            value={chimneyDiameter}
            onChange={(e) => setChimneyDiameter(e.target.value)}
            placeholder="e.g., 800"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="flueGasTemp">Flue Gas Temperature (°C)</Label>
          <Input
            id="flueGasTemp"
            type="number"
            value={flueGasTemp}
            onChange={(e) => setFlueGasTemp(e.target.value)}
            placeholder="e.g., 180"
          />
        </div>
        <div>
          <Label htmlFor="ambientTemp">Ambient Temperature (°C)</Label>
          <Input
            id="ambientTemp"
            type="number"
            value={ambientTemp}
            onChange={(e) => setAmbientTemp(e.target.value)}
            placeholder="e.g., 25"
          />
        </div>
      </div>

      <Button onClick={calculateFanSizing} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Fan Sizing
      </Button>

      {result !== null && (
        <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <h4 className="font-semibold text-slate-900">Fan Sizing Results</h4>
          <div className="grid grid-cols-2 gap-4 mt-3 text-slate-800">
            <div>
              <p className="text-sm text-slate-600">Natural Draft Available</p>
              <p className="font-bold">{result.naturalDraft.toFixed(1)} Pa</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">Fan Pressure Required</p>
              <p className="font-bold">{result.fanPressure.toFixed(1)} Pa</p>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-slate-300">
            <div className="grid grid-cols-2 gap-8">
              <div className="text-center">
                <p className="text-sm text-slate-600">Required Fan Capacity</p>
                <p className="font-bold text-xl text-slate-900">{result.requiredFanCapacity.toFixed(0)} m³/hr</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-slate-600">Fan Motor Power</p>
                <p className="font-bold text-xl text-slate-900">{result.fanPower.toFixed(2)} kW</p>
              </div>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-slate-100 rounded">
            <h5 className="font-semibold text-slate-900 mb-2">Design Notes:</h5>
            <ul className="text-xs text-slate-700 space-y-1">
              <li>• Fan capacity includes 20% safety margin</li>
              <li>• {draftType === "induced" ? "Induced draft fan pulls gases through system" : "Forced draft fan pushes air into system"}</li>
              <li>• Consider variable frequency drive for efficiency</li>
              <li>• Ensure adequate motor sizing for startup conditions</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// Firebox Heat Flux Calculator Component
function FireboxHeatFluxCalculator() {
  const [fuelRate, setFuelRate] = useState("");
  const [flameLength, setFlameLength] = useState("");
  const [flameDiameter, setFlameDiameter] = useState("");
  const [emissivity, setEmissivity] = useState("0.8");
  const [fireboxHeight, setFireboxHeight] = useState("");
  const [fireboxDiameter, setFireboxDiameter] = useState("");
  const [result, setResult] = useState<{
    maxHeatFlux: number;
    avgHeatFlux: number;
    flameVolume: number;
    heatReleaseRate: number;
    fluxDistribution: Array<{position: string, flux: number}>;
  } | null>(null);

  const calculateHeatFlux = () => {
    const Q = parseFloat(fuelRate); // kg/hr
    const L_flame = parseFloat(flameLength); // m
    const D_flame = parseFloat(flameDiameter); // m
    const epsilon = parseFloat(emissivity);
    const H_box = parseFloat(fireboxHeight); // m
    const D_box = parseFloat(fireboxDiameter); // m

    if (!Q || !L_flame || !D_flame || !epsilon || !H_box || !D_box) return;

    // Calculate flame volume (simplified as cylinder)
    const flameVolume = Math.PI * Math.pow(D_flame / 2, 2) * L_flame; // m³
    
    // Heat release rate (assuming 10,000 kcal/kg fuel)
    const heatReleaseRate = Q * 10000 / 3600; // kcal/s
    
    // Convert to watts: 1 kcal/s = 4186 W
    const powerOutput = heatReleaseRate * 4186; // W
    
    // Firebox wall surface area
    const wallArea = Math.PI * D_box * H_box; // m²
    
    // Stefan-Boltzmann constant
    const sigma = 5.67e-8; // W/m²K⁴
    
    // Estimated flame temperature (°C to K)
    const T_flame = 1200 + 273.15; // K
    const T_wall = 300 + 273.15; // K (assumed wall temperature)
    
    // Radiative heat flux: q = ε × σ × (T_flame⁴ - T_wall⁴)
    const radiativeFlux = epsilon * sigma * (Math.pow(T_flame, 4) - Math.pow(T_wall, 4)); // W/m²
    
    // Average heat flux distribution on walls
    const avgHeatFlux = powerOutput / wallArea; // W/m²
    
    // Maximum heat flux (typically 1.5-2x average near flame zone)
    const maxHeatFlux = avgHeatFlux * 1.8;
    
    // Heat flux distribution along firebox height
    const fluxDistribution = [
      { position: "Bottom (0-25%)", flux: maxHeatFlux },
      { position: "Lower Mid (25-50%)", flux: maxHeatFlux * 0.8 },
      { position: "Upper Mid (50-75%)", flux: avgHeatFlux * 0.6 },
      { position: "Top (75-100%)", flux: avgHeatFlux * 0.4 }
    ];

    setResult({
      maxHeatFlux: maxHeatFlux / 1000, // Convert to kW/m²
      avgHeatFlux: avgHeatFlux / 1000, // Convert to kW/m²
      flameVolume: flameVolume,
      heatReleaseRate: heatReleaseRate,
      fluxDistribution: fluxDistribution.map(item => ({
        ...item,
        flux: item.flux / 1000 // Convert to kW/m²
      }))
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="fuelRate">Fuel Rate (kg/hr)</Label>
          <Input
            id="fuelRate"
            type="number"
            value={fuelRate}
            onChange={(e) => setFuelRate(e.target.value)}
            placeholder="e.g., 50"
          />
        </div>
        <div>
          <Label htmlFor="emissivity">Flame Emissivity</Label>
          <Input
            id="emissivity"
            type="number"
            step="0.1"
            value={emissivity}
            onChange={(e) => setEmissivity(e.target.value)}
            placeholder="e.g., 0.8"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="flameLength">Flame Length (m)</Label>
          <Input
            id="flameLength"
            type="number"
            step="0.1"
            value={flameLength}
            onChange={(e) => setFlameLength(e.target.value)}
            placeholder="e.g., 2.5"
          />
        </div>
        <div>
          <Label htmlFor="flameDiameter">Flame Diameter (m)</Label>
          <Input
            id="flameDiameter"
            type="number"
            step="0.1"
            value={flameDiameter}
            onChange={(e) => setFlameDiameter(e.target.value)}
            placeholder="e.g., 0.8"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="fireboxHeight">Firebox Height (m)</Label>
          <Input
            id="fireboxHeight"
            type="number"
            step="0.1"
            value={fireboxHeight}
            onChange={(e) => setFireboxHeight(e.target.value)}
            placeholder="e.g., 4.0"
          />
        </div>
        <div>
          <Label htmlFor="fireboxDiameter">Firebox Diameter (m)</Label>
          <Input
            id="fireboxDiameter"
            type="number"
            step="0.1"
            value={fireboxDiameter}
            onChange={(e) => setFireboxDiameter(e.target.value)}
            placeholder="e.g., 2.0"
          />
        </div>
      </div>

      <Button onClick={calculateHeatFlux} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Heat Flux Distribution
      </Button>

      {result !== null && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <h4 className="font-semibold text-red-900">Heat Flux Analysis</h4>
          <div className="grid grid-cols-2 gap-4 mt-3 text-red-800">
            <div>
              <p className="text-sm text-red-600">Flame Volume</p>
              <p className="font-bold">{result.flameVolume.toFixed(2)} m³</p>
            </div>
            <div>
              <p className="text-sm text-red-600">Heat Release Rate</p>
              <p className="font-bold">{result.heatReleaseRate.toFixed(1)} kcal/s</p>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-red-300">
            <div className="grid grid-cols-2 gap-8">
              <div className="text-center">
                <p className="text-sm text-red-600">Maximum Heat Flux</p>
                <p className="font-bold text-xl text-red-900">{result.maxHeatFlux.toFixed(1)} kW/m²</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-red-600">Average Heat Flux</p>
                <p className="font-bold text-xl text-red-900">{result.avgHeatFlux.toFixed(1)} kW/m²</p>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-red-100 rounded">
            <h5 className="font-semibold text-red-900 mb-2">Heat Flux Distribution:</h5>
            <div className="space-y-2">
              {result.fluxDistribution.map((item, index) => (
                <div key={index} className="flex justify-between text-sm text-red-700">
                  <span>{item.position}</span>
                  <span className="font-bold">{item.flux.toFixed(1)} kW/m²</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Shell & Tube Heat Exchanger Selector Component
function ShellTubeHeatExchangerSelector() {
  const [heatDuty, setHeatDuty] = useState("");
  const [hotFluidTempIn, setHotFluidTempIn] = useState("");
  const [hotFluidTempOut, setHotFluidTempOut] = useState("");
  const [coldFluidTempIn, setColdFluidTempIn] = useState("");
  const [coldFluidTempOut, setColdFluidTempOut] = useState("");
  const [hotFluidFlow, setHotFluidFlow] = useState("");
  const [coldFluidFlow, setColdFluidFlow] = useState("");
  const [hotFluidType, setHotFluidType] = useState("thermal-oil");
  const [coldFluidType, setColdFluidType] = useState("water");
  const [result, setResult] = useState<{
    tubeSize: string;
    tubeCount: number;
    surfaceArea: number;
    hotVelocity: number;
    coldVelocity: number;
    shellDiameter: number;
    tubeLength: number;
    lmtd: number;
    overallCoeff: number;
  } | null>(null);

  const fluidProperties = {
    "thermal-oil": { name: "Thermal Oil", density: 850, viscosity: 5.0, specificHeat: 2.1 },
    "water": { name: "Water", density: 1000, viscosity: 1.0, specificHeat: 4.18 },
    "steam": { name: "Steam", density: 0.6, viscosity: 0.02, specificHeat: 2.1 },
    "air": { name: "Air", density: 1.2, viscosity: 0.018, specificHeat: 1.0 },
    "glycol": { name: "Ethylene Glycol", density: 1100, viscosity: 2.5, specificHeat: 2.4 }
  };

  const tubeStandards = [
    { size: "19.05 x 2.11", od: 0.01905, thickness: 0.00211, area: 0.0598 },
    { size: "25.4 x 2.77", od: 0.0254, thickness: 0.00277, area: 0.0799 },
    { size: "31.75 x 3.38", od: 0.03175, thickness: 0.00338, area: 0.0998 },
    { size: "38.1 x 3.68", od: 0.0381, thickness: 0.00368, area: 0.1197 }
  ];

  const calculateHeatExchanger = () => {
    const Q_kcal = parseFloat(heatDuty); // kcal/hr
    const T_hot_in = parseFloat(hotFluidTempIn);
    const T_hot_out = parseFloat(hotFluidTempOut);
    const T_cold_in = parseFloat(coldFluidTempIn);
    const T_cold_out = parseFloat(coldFluidTempOut);
    const V_hot = parseFloat(hotFluidFlow); // m³/hr
    const V_cold = parseFloat(coldFluidFlow); // m³/hr

    if (!Q_kcal || !T_hot_in || !T_hot_out || !T_cold_in || !T_cold_out || !V_hot || !V_cold) return;
    if (T_hot_in <= T_hot_out || T_cold_out <= T_cold_in) return;

    const hotFluid = fluidProperties[hotFluidType as keyof typeof fluidProperties];
    const coldFluid = fluidProperties[coldFluidType as keyof typeof fluidProperties];

    // Convert flow rates to mass flow rates
    const m_hot = (V_hot * hotFluid.density) / 3600; // kg/s
    const m_cold = (V_cold * coldFluid.density) / 3600; // kg/s

    // Convert heat duty to watts: 1 kcal/hr = 1.163 W
    const Q_watts = Q_kcal * 1.163;

    // Log Mean Temperature Difference (LMTD)
    const deltaT1 = T_hot_in - T_cold_out; // Hot inlet - Cold outlet
    const deltaT2 = T_hot_out - T_cold_in; // Hot outlet - Cold inlet
    
    let LMTD;
    if (Math.abs(deltaT1 - deltaT2) < 0.1) {
      LMTD = (deltaT1 + deltaT2) / 2; // Arithmetic mean for small differences
    } else {
      LMTD = (deltaT1 - deltaT2) / Math.log(deltaT1 / deltaT2);
    }

    // Overall heat transfer coefficient selection based on fluid types
    let U; // W/m²K
    if (hotFluidType === "thermal-oil" && coldFluidType === "water") {
      U = 600;
    } else if (hotFluidType === "steam" && coldFluidType === "water") {
      U = 1500;
    } else if (hotFluidType === "water" && coldFluidType === "water") {
      U = 1200;
    } else {
      U = 400; // Conservative default
    }

    // Required surface area: A = Q / (U × LMTD)
    const surfaceArea = Q_watts / (U * LMTD);

    // Select tube size based on flow rates
    let selectedTube = tubeStandards[1]; // Default to 25.4mm
    const totalFlow = V_hot + V_cold;
    if (totalFlow < 10) selectedTube = tubeStandards[0];
    else if (totalFlow > 50) selectedTube = tubeStandards[2];
    else if (totalFlow > 100) selectedTube = tubeStandards[3];

    // Tube length (standard: 3-6m, optimize based on size)
    let tubeLength = 4.0; // m
    if (surfaceArea > 100) tubeLength = 6.0;
    else if (surfaceArea < 20) tubeLength = 3.0;

    // Calculate tube count: N = A / (π × D × L)
    const tubeCount = Math.ceil(surfaceArea / (Math.PI * selectedTube.od * tubeLength));

    // Shell diameter estimation (triangular pitch, 1.25 × tube OD)
    const pitch = selectedTube.od * 1.25;
    const shellDiameter = Math.sqrt(tubeCount) * pitch * 1.15; // m

    // Flow velocities
    const tubeInternalArea = Math.PI * Math.pow((selectedTube.od - 2 * selectedTube.thickness) / 2, 2);
    const hotVelocity = (V_hot / 3600) / (tubeCount * tubeInternalArea); // m/s
    
    // Shell side velocity (simplified)
    const shellCrossArea = shellDiameter * selectedTube.od * 0.25; // Approximate baffle spacing
    const coldVelocity = (V_cold / 3600) / shellCrossArea; // m/s

    setResult({
      tubeSize: selectedTube.size,
      tubeCount: tubeCount,
      surfaceArea: surfaceArea,
      hotVelocity: hotVelocity,
      coldVelocity: coldVelocity,
      shellDiameter: shellDiameter * 1000, // Convert to mm
      tubeLength: tubeLength,
      lmtd: LMTD,
      overallCoeff: U
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="heatDuty">Heat Duty (kcal/hr)</Label>
          <Input
            id="heatDuty"
            type="number"
            value={heatDuty}
            onChange={(e) => setHeatDuty(e.target.value)}
            placeholder="e.g., 50000"
          />
        </div>
        <div>
          <Label htmlFor="hotFluidType">Hot Fluid Type</Label>
          <Select value={hotFluidType} onValueChange={setHotFluidType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(fluidProperties).map(([key, fluid]) => (
                <SelectItem key={key} value={key}>{fluid.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="hotFluidTempIn">Hot Fluid Inlet Temperature (°C)</Label>
          <Input
            id="hotFluidTempIn"
            type="number"
            value={hotFluidTempIn}
            onChange={(e) => setHotFluidTempIn(e.target.value)}
            placeholder="e.g., 180"
          />
        </div>
        <div>
          <Label htmlFor="hotFluidTempOut">Hot Fluid Outlet Temperature (°C)</Label>
          <Input
            id="hotFluidTempOut"
            type="number"
            value={hotFluidTempOut}
            onChange={(e) => setHotFluidTempOut(e.target.value)}
            placeholder="e.g., 160"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="coldFluidTempIn">Cold Fluid Inlet Temperature (°C)</Label>
          <Input
            id="coldFluidTempIn"
            type="number"
            value={coldFluidTempIn}
            onChange={(e) => setColdFluidTempIn(e.target.value)}
            placeholder="e.g., 40"
          />
        </div>
        <div>
          <Label htmlFor="coldFluidTempOut">Cold Fluid Outlet Temperature (°C)</Label>
          <Input
            id="coldFluidTempOut"
            type="number"
            value={coldFluidTempOut}
            onChange={(e) => setColdFluidTempOut(e.target.value)}
            placeholder="e.g., 80"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="coldFluidType">Cold Fluid Type</Label>
          <Select value={coldFluidType} onValueChange={setColdFluidType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(fluidProperties).map(([key, fluid]) => (
                <SelectItem key={key} value={key}>{fluid.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="hotFluidFlow">Hot Fluid Flow Rate (m³/hr)</Label>
          <Input
            id="hotFluidFlow"
            type="number"
            step="0.1"
            value={hotFluidFlow}
            onChange={(e) => setHotFluidFlow(e.target.value)}
            placeholder="e.g., 10"
          />
        </div>
        <div>
          <Label htmlFor="coldFluidFlow">Cold Fluid Flow Rate (m³/hr)</Label>
          <Input
            id="coldFluidFlow"
            type="number"
            step="0.1"
            value={coldFluidFlow}
            onChange={(e) => setColdFluidFlow(e.target.value)}
            placeholder="e.g., 15"
          />
        </div>
      </div>

      <Button onClick={calculateHeatExchanger} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Select Heat Exchanger
      </Button>

      {result !== null && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-semibold text-blue-900">Heat Exchanger Selection</h4>
          <div className="grid grid-cols-2 gap-4 mt-3 text-blue-800">
            <div>
              <p className="text-sm text-blue-600">LMTD</p>
              <p className="font-bold">{result.lmtd.toFixed(1)} °C</p>
            </div>
            <div>
              <p className="text-sm text-blue-600">Overall Heat Transfer Coefficient</p>
              <p className="font-bold">{result.overallCoeff} W/m²K</p>
            </div>
            <div>
              <p className="text-sm text-blue-600">Tube Size (OD x Thickness)</p>
              <p className="font-bold">{result.tubeSize} mm</p>
            </div>
            <div>
              <p className="text-sm text-blue-600">Tube Length</p>
              <p className="font-bold">{result.tubeLength.toFixed(1)} m</p>
            </div>
            <div>
              <p className="text-sm text-blue-600">Shell Diameter</p>
              <p className="font-bold">{result.shellDiameter.toFixed(0)} mm</p>
            </div>
            <div>
              <p className="text-sm text-blue-600">Hot Fluid Velocity (Tube Side)</p>
              <p className="font-bold">{result.hotVelocity.toFixed(2)} m/s</p>
            </div>
            <div>
              <p className="text-sm text-blue-600">Cold Fluid Velocity (Shell Side)</p>
              <p className="font-bold">{result.coldVelocity.toFixed(2)} m/s</p>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-blue-300">
            <div className="grid grid-cols-2 gap-8">
              <div className="text-center">
                <p className="text-sm text-blue-600">Number of Tubes</p>
                <p className="font-bold text-xl text-blue-900">{result.tubeCount}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-blue-600">Required Surface Area</p>
                <p className="font-bold text-xl text-blue-900">{result.surfaceArea.toFixed(1)} m²</p>
              </div>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-blue-100 rounded">
            <h5 className="font-semibold text-blue-900 mb-2">Design Notes:</h5>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>• Tube arrangement: Triangular pitch (1.25 × OD)</li>
              <li>• Recommended velocities: Tube side 1-3 m/s, Shell side 0.3-1 m/s</li>
              <li>• Heat duty: {parseFloat(heatDuty || "0").toLocaleString()} kcal/hr ({(parseFloat(heatDuty || "0") * 1.163 / 1000).toFixed(1)} kW)</li>
              <li>• Consider fouling factors and pressure drop in final design</li>
              <li>• Verify baffle spacing and tube sheet design requirements</li>
            </ul>
          </div>
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

// Electrical Design Calculator Components
function CableSizeCalculator() {
  const [current, setCurrent] = useState("");
  const [distance, setDistance] = useState("");
  const [voltage, setVoltage] = useState("415");
  const [material, setMaterial] = useState("copper");
  const [installationMethod, setInstallationMethod] = useState("conduit");
  const [result, setResult] = useState<any>(null);

  const calculateCableSize = () => {
    const I = parseFloat(current);
    const L = parseFloat(distance);
    const V = parseFloat(voltage);
    
    if (!I || !L || !V) return;

    // Current carrying capacity factors
    const materialFactor = material === "copper" ? 1.0 : 0.8;
    const installationFactor = installationMethod === "conduit" ? 0.8 : 
                              installationMethod === "tray" ? 0.9 : 1.0;
    
    // Derating current
    const deratedCurrent = I / (materialFactor * installationFactor);
    
    // Standard cable sizes (mm²) with current ratings
    const cableSizes = [
      { size: 1.5, rating: 18 },
      { size: 2.5, rating: 24 },
      { size: 4, rating: 32 },
      { size: 6, rating: 41 },
      { size: 10, rating: 57 },
      { size: 16, rating: 76 },
      { size: 25, rating: 101 },
      { size: 35, rating: 125 },
      { size: 50, rating: 151 },
      { size: 70, rating: 192 },
      { size: 95, rating: 232 },
      { size: 120, rating: 269 },
      { size: 150, rating: 309 },
      { size: 185, rating: 353 },
      { size: 240, rating: 415 },
      { size: 300, rating: 477 }
    ];

    // Find suitable cable size
    const suitableCable = cableSizes.find(cable => cable.rating >= deratedCurrent);
    
    // Voltage drop calculation (simplified)
    const resistivity = material === "copper" ? 0.0175 : 0.0283; // ohm.mm²/m
    const resistance = (resistivity * L * 2) / (suitableCable?.size || 1);
    const voltageDrop = I * resistance;
    const voltageDropPercent = (voltageDrop / V) * 100;

    setResult({
      requiredCurrent: deratedCurrent.toFixed(1),
      recommendedSize: suitableCable?.size || "Contact engineer",
      cableRating: suitableCable?.rating || 0,
      voltageDrop: voltageDrop.toFixed(2),
      voltageDropPercent: voltageDropPercent.toFixed(2),
      resistance: resistance.toFixed(4),
      material: material,
      installation: installationMethod
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Load Current (A)</Label>
          <Input
            type="number"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Enter current in amperes"
          />
        </div>
        <div>
          <Label>Cable Length (m)</Label>
          <Input
            type="number"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            placeholder="Enter distance in meters"
          />
        </div>
        <div>
          <Label>System Voltage (V)</Label>
          <Select value={voltage} onValueChange={setVoltage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="230">230V (Single Phase)</SelectItem>
              <SelectItem value="415">415V (Three Phase)</SelectItem>
              <SelectItem value="1000">1000V (HV)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Cable Material</Label>
          <Select value={material} onValueChange={setMaterial}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="copper">Copper</SelectItem>
              <SelectItem value="aluminum">Aluminum</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Installation Method</Label>
          <Select value={installationMethod} onValueChange={setInstallationMethod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="conduit">In Conduit</SelectItem>
              <SelectItem value="tray">Cable Tray</SelectItem>
              <SelectItem value="air">Free Air</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={calculateCableSize} className="w-full">
        Calculate Cable Size
      </Button>

      {result && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold mb-2">Cable Sizing Results:</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Required Current Capacity: {result.requiredCurrent} A</div>
            <div>Recommended Cable Size: {result.recommendedSize} mm²</div>
            <div>Cable Rating: {result.cableRating} A</div>
            <div>Voltage Drop: {result.voltageDrop} V ({result.voltageDropPercent}%)</div>
            <div>Cable Resistance: {result.resistance} Ω</div>
            <div>Material: {result.material}</div>
          </div>
          <div className="mt-2 text-xs text-gray-600">
            Note: Results based on IEC 60364 standards. Verify with local codes.
          </div>
        </div>
      )}
    </div>
  );
}

function VoltageDropCalculator() {
  const [current, setCurrent] = useState("");
  const [length, setLength] = useState("");
  const [cableSize, setCableSize] = useState("");
  const [voltage, setVoltage] = useState("415");
  const [material, setMaterial] = useState("copper");
  const [powerFactor, setPowerFactor] = useState("0.8");
  const [result, setResult] = useState<any>(null);

  const calculateVoltageDrop = () => {
    const I = parseFloat(current);
    const L = parseFloat(length);
    const A = parseFloat(cableSize);
    const V = parseFloat(voltage);
    const pf = parseFloat(powerFactor);
    
    if (!I || !L || !A || !V || !pf) return;

    // Material properties
    const resistivity = material === "copper" ? 0.0175 : 0.0283; // ohm.mm²/m at 20°C
    const reactance = 0.08; // ohm/km (typical for LV cables)
    
    // Calculate resistance and reactance
    const R = (resistivity * L) / A; // Single core resistance
    const X = (reactance * L) / 1000; // Reactance per length
    
    // Voltage drop calculations
    const voltageDropR = I * R * pf; // Resistive drop
    const voltageDropX = I * X * Math.sqrt(1 - pf * pf); // Reactive drop
    const totalVoltageDrop = Math.sqrt(Math.pow(voltageDropR, 2) + Math.pow(voltageDropX, 2));
    
    // Three-phase adjustment
    const phaseVoltageDrop = voltage === "415" ? totalVoltageDrop * Math.sqrt(3) : totalVoltageDrop;
    const voltageDropPercent = (phaseVoltageDrop / V) * 100;
    
    // Allowable limits check
    const allowableLimit = V <= 230 ? 3 : 5; // 3% for lighting, 5% for power
    const compliance = voltageDropPercent <= allowableLimit;

    setResult({
      resistance: R.toFixed(4),
      reactance: X.toFixed(4),
      resistiveDrop: voltageDropR.toFixed(2),
      reactiveDropZ: voltageDropX.toFixed(2),
      totalDrop: phaseVoltageDrop.toFixed(2),
      dropPercent: voltageDropPercent.toFixed(2),
      allowableLimit: allowableLimit,
      compliance: compliance,
      endVoltage: (V - phaseVoltageDrop).toFixed(1)
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Load Current (A)</Label>
          <Input
            type="number"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Enter current"
          />
        </div>
        <div>
          <Label>Cable Length (m)</Label>
          <Input
            type="number"
            value={length}
            onChange={(e) => setLength(e.target.value)}
            placeholder="Enter length"
          />
        </div>
        <div>
          <Label>Cable Size (mm²)</Label>
          <Input
            type="number"
            value={cableSize}
            onChange={(e) => setCableSize(e.target.value)}
            placeholder="Enter cable cross-section"
          />
        </div>
        <div>
          <Label>System Voltage (V)</Label>
          <Select value={voltage} onValueChange={setVoltage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="230">230V</SelectItem>
              <SelectItem value="415">415V</SelectItem>
              <SelectItem value="1000">1000V</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Cable Material</Label>
          <Select value={material} onValueChange={setMaterial}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="copper">Copper</SelectItem>
              <SelectItem value="aluminum">Aluminum</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Power Factor</Label>
          <Input
            type="number"
            step="0.1"
            min="0.1"
            max="1.0"
            value={powerFactor}
            onChange={(e) => setPowerFactor(e.target.value)}
            placeholder="0.8"
          />
        </div>
      </div>

      <Button onClick={calculateVoltageDrop} className="w-full">
        Calculate Voltage Drop
      </Button>

      {result && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold mb-2">Voltage Drop Analysis:</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Cable Resistance: {result.resistance} Ω</div>
            <div>Cable Reactance: {result.reactance} Ω</div>
            <div>Resistive Drop: {result.resistiveDrop} V</div>
            <div>Reactive Drop: {result.reactiveDropZ} V</div>
            <div>Total Voltage Drop: {result.totalDrop} V</div>
            <div>Voltage Drop %: {result.dropPercent}%</div>
            <div>End Voltage: {result.endVoltage} V</div>
            <div className={result.compliance ? "text-green-600" : "text-red-600"}>
              Compliance: {result.compliance ? "PASS" : "FAIL"} 
              (Limit: {result.allowableLimit}%)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ShortCircuitCalculator() {
  const [systemVoltage, setSystemVoltage] = useState("415");
  const [transformerRating, setTransformerRating] = useState("");
  const [transformerImpedance, setTransformerImpedance] = useState("6");
  const [cableSize, setCableSize] = useState("");
  const [cableLength, setCableLength] = useState("");
  const [result, setResult] = useState<any>(null);

  const calculateShortCircuit = () => {
    const V = parseFloat(systemVoltage);
    const S = parseFloat(transformerRating) * 1000; // Convert to VA
    const Z = parseFloat(transformerImpedance) / 100; // Convert to decimal
    const A = parseFloat(cableSize);
    const L = parseFloat(cableLength);
    
    if (!V || !S || !Z || !A || !L) return;

    // Transformer impedance in ohms
    const Zt = (V * V * Z) / S;
    
    // Cable impedance (simplified)
    const resistivity = 0.0175; // Copper at 20°C
    const Zc = (resistivity * L) / A;
    
    // Total impedance
    const Ztotal = Math.sqrt(Math.pow(Zt + Zc, 2));
    
    // Short circuit current
    const Isc3phase = V / (Math.sqrt(3) * Ztotal); // 3-phase fault
    const Isc1phase = V / (2 * Ztotal); // Single phase to earth fault
    
    // Peak short circuit current (asymmetrical)
    const IscPeak = Isc3phase * Math.sqrt(2) * 1.8; // Factor for DC component
    
    // Breaking current calculation
    const IscBreaking = Isc3phase * 1.1; // 10% margin for decay

    setResult({
      transformerImpedance: Zt.toFixed(4),
      cableImpedance: Zc.toFixed(4),
      totalImpedance: Ztotal.toFixed(4),
      shortCircuit3Phase: Isc3phase.toFixed(0),
      shortCircuit1Phase: Isc1phase.toFixed(0),
      peakCurrent: IscPeak.toFixed(0),
      breakingCurrent: IscBreaking.toFixed(0)
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>System Voltage (V)</Label>
          <Select value={systemVoltage} onValueChange={setSystemVoltage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="230">230V</SelectItem>
              <SelectItem value="415">415V</SelectItem>
              <SelectItem value="1000">1000V</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Transformer Rating (kVA)</Label>
          <Input
            type="number"
            value={transformerRating}
            onChange={(e) => setTransformerRating(e.target.value)}
            placeholder="Enter transformer rating"
          />
        </div>
        <div>
          <Label>Transformer Impedance (%)</Label>
          <Input
            type="number"
            value={transformerImpedance}
            onChange={(e) => setTransformerImpedance(e.target.value)}
            placeholder="Typical: 4-8%"
          />
        </div>
        <div>
          <Label>Cable Size (mm²)</Label>
          <Input
            type="number"
            value={cableSize}
            onChange={(e) => setCableSize(e.target.value)}
            placeholder="Enter cable size"
          />
        </div>
        <div>
          <Label>Cable Length (m)</Label>
          <Input
            type="number"
            value={cableLength}
            onChange={(e) => setCableLength(e.target.value)}
            placeholder="Enter cable length"
          />
        </div>
      </div>

      <Button onClick={calculateShortCircuit} className="w-full">
        Calculate Short Circuit Current
      </Button>

      {result && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold mb-2">Short Circuit Analysis:</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Transformer Impedance: {result.transformerImpedance} Ω</div>
            <div>Cable Impedance: {result.cableImpedance} Ω</div>
            <div>Total Impedance: {result.totalImpedance} Ω</div>
            <div>3-Phase Fault Current: {result.shortCircuit3Phase} A</div>
            <div>Single Phase Fault: {result.shortCircuit1Phase} A</div>
            <div>Peak Current: {result.peakCurrent} A</div>
            <div>Breaking Current: {result.breakingCurrent} A</div>
          </div>
          <div className="mt-2 text-xs text-gray-600">
            Note: Simplified calculation. Consult electrical engineer for protection coordination.
          </div>
        </div>
      )}
    </div>
  );
}

function CircuitBreakerSizing() {
  const [loadCurrent, setLoadCurrent] = useState("");
  const [faultCurrent, setFaultCurrent] = useState("");
  const [voltage, setVoltage] = useState("415");
  const [loadType, setLoadType] = useState("motor");
  const [result, setResult] = useState<any>(null);

  const calculateBreakerSize = () => {
    const Iload = parseFloat(loadCurrent);
    const Ifault = parseFloat(faultCurrent);
    const V = parseFloat(voltage);
    
    if (!Iload || !Ifault || !V) return;

    // Sizing factors based on load type
    const sizingFactors = {
      motor: 1.25, // 125% for motor loads
      lighting: 1.25, // 125% for continuous loads
      general: 1.0, // 100% for general loads
      heating: 1.25 // 125% for heating loads
    };

    const factor = sizingFactors[loadType as keyof typeof sizingFactors];
    const minimumRating = Iload * factor;

    // Standard MCB/MCCB ratings
    const standardRatings = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600];
    
    const selectedRating = standardRatings.find(rating => rating >= minimumRating) || "Consult Engineer";
    
    // Breaking capacity check
    const requiredBreakingCapacity = Math.ceil(Ifault / 1000); // kA
    
    // Standard breaking capacities
    const breakingCapacities = [3, 6, 10, 15, 25, 36, 50, 70, 100];
    const selectedBreakingCapacity = breakingCapacities.find(capacity => capacity >= requiredBreakingCapacity) || "Special";

    // Breaker type recommendation
    let breakerType = "";
    if (selectedRating <= 125) {
      breakerType = "MCB (Miniature Circuit Breaker)";
    } else if (selectedRating <= 1600) {
      breakerType = "MCCB (Molded Case Circuit Breaker)";
    } else {
      breakerType = "ACB (Air Circuit Breaker)";
    }

    setResult({
      minimumRating: minimumRating.toFixed(1),
      selectedRating: selectedRating,
      breakingCapacity: selectedBreakingCapacity,
      breakerType: breakerType,
      sizingFactor: factor,
      loadType: loadType
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Load Current (A)</Label>
          <Input
            type="number"
            value={loadCurrent}
            onChange={(e) => setLoadCurrent(e.target.value)}
            placeholder="Enter full load current"
          />
        </div>
        <div>
          <Label>Fault Current (A)</Label>
          <Input
            type="number"
            value={faultCurrent}
            onChange={(e) => setFaultCurrent(e.target.value)}
            placeholder="Enter prospective fault current"
          />
        </div>
        <div>
          <Label>System Voltage (V)</Label>
          <Select value={voltage} onValueChange={setVoltage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="230">230V</SelectItem>
              <SelectItem value="415">415V</SelectItem>
              <SelectItem value="1000">1000V</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Load Type</Label>
          <Select value={loadType} onValueChange={setLoadType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="motor">Motor Load</SelectItem>
              <SelectItem value="lighting">Lighting Load</SelectItem>
              <SelectItem value="heating">Heating Load</SelectItem>
              <SelectItem value="general">General Load</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={calculateBreakerSize} className="w-full">
        Calculate Breaker Size
      </Button>

      {result && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold mb-2">Circuit Breaker Selection:</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Minimum Rating Required: {result.minimumRating} A</div>
            <div>Selected Rating: {result.selectedRating} A</div>
            <div>Breaking Capacity: {result.breakingCapacity} kA</div>
            <div>Breaker Type: {result.breakerType}</div>
            <div>Sizing Factor: {result.sizingFactor}</div>
            <div>Load Type: {result.loadType}</div>
          </div>
          <div className="mt-2 text-xs text-gray-600">
            Note: Selection based on IEC 60898/60947 standards. Verify coordination with upstream protection.
          </div>
        </div>
      )}
    </div>
  );
}

function MotorStarterSizing() {
  const [motorPower, setMotorPower] = useState("");
  const [voltage, setVoltage] = useState("415");
  const [efficiency, setEfficiency] = useState("0.85");
  const [powerFactor, setPowerFactor] = useState("0.8");
  const [startingMethod, setStartingMethod] = useState("dol");
  const [result, setResult] = useState<any>(null);

  const calculateMotorStarter = () => {
    const P = parseFloat(motorPower) * 1000; // Convert to watts
    const V = parseFloat(voltage);
    const eff = parseFloat(efficiency);
    const pf = parseFloat(powerFactor);
    
    if (!P || !V || !eff || !pf) return;

    // Full load current calculation
    const Ifl = voltage === "415" ? 
      P / (Math.sqrt(3) * V * eff * pf) : // 3-phase
      P / (V * eff * pf); // Single phase

    // Starting current factors
    const startingFactors = {
      dol: 6.0, // Direct Online
      star_delta: 2.0, // Star-Delta
      soft_start: 3.0, // Soft Starter
      vfd: 1.5 // Variable Frequency Drive
    };

    const startingCurrent = Ifl * startingFactors[startingMethod as keyof typeof startingFactors];

    // Contactor sizing (125% of FLC)
    const contactorRating = Ifl * 1.25;
    const standardContactorRatings = [9, 12, 18, 25, 32, 40, 50, 65, 80, 95, 110, 150, 185, 225, 265, 330, 400, 500, 630, 800];
    const selectedContactor = standardContactorRatings.find(rating => rating >= contactorRating) || "Special";

    // Overload relay setting (FLC)
    const overloadSetting = Ifl;

    // Fuse sizing (depends on starting method)
    const fuseFactors = {
      dol: 2.5,
      star_delta: 1.6,
      soft_start: 1.8,
      vfd: 1.5
    };
    const fuseRating = Ifl * fuseFactors[startingMethod as keyof typeof fuseFactors];
    const standardFuseRatings = [2, 4, 6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500];
    const selectedFuse = standardFuseRatings.find(rating => rating >= fuseRating) || "Special";

    // Cable sizing (125% of FLC minimum)
    const cableRating = Ifl * 1.25;
    const standardCableSizes = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300];
    const cableCurrentRatings = [18, 24, 32, 41, 57, 76, 101, 125, 151, 192, 232, 269, 309, 353, 415, 477];
    
    const cableIndex = cableCurrentRatings.findIndex(rating => rating >= cableRating);
    const selectedCableSize = cableIndex !== -1 ? standardCableSizes[cableIndex] : "Special";

    setResult({
      fullLoadCurrent: Ifl.toFixed(1),
      startingCurrent: startingCurrent.toFixed(0),
      contactorRating: selectedContactor,
      overloadSetting: overloadSetting.toFixed(1),
      fuseRating: selectedFuse,
      cableSize: selectedCableSize,
      startingMethod: startingMethod
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Motor Power (kW)</Label>
          <Input
            type="number"
            value={motorPower}
            onChange={(e) => setMotorPower(e.target.value)}
            placeholder="Enter motor power"
          />
        </div>
        <div>
          <Label>Voltage (V)</Label>
          <Select value={voltage} onValueChange={setVoltage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="230">230V</SelectItem>
              <SelectItem value="415">415V</SelectItem>
              <SelectItem value="1000">1000V</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Efficiency</Label>
          <Input
            type="number"
            step="0.01"
            min="0.5"
            max="1.0"
            value={efficiency}
            onChange={(e) => setEfficiency(e.target.value)}
            placeholder="0.85"
          />
        </div>
        <div>
          <Label>Power Factor</Label>
          <Input
            type="number"
            step="0.01"
            min="0.5"
            max="1.0"
            value={powerFactor}
            onChange={(e) => setPowerFactor(e.target.value)}
            placeholder="0.8"
          />
        </div>
        <div>
          <Label>Starting Method</Label>
          <Select value={startingMethod} onValueChange={setStartingMethod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dol">Direct Online (DOL)</SelectItem>
              <SelectItem value="star_delta">Star-Delta</SelectItem>
              <SelectItem value="soft_start">Soft Starter</SelectItem>
              <SelectItem value="vfd">VFD</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={calculateMotorStarter} className="w-full">
        Calculate Motor Starter Components
      </Button>

      {result && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold mb-2">Motor Starter Selection:</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Full Load Current: {result.fullLoadCurrent} A</div>
            <div>Starting Current: {result.startingCurrent} A</div>
            <div>Contactor Rating: {result.contactorRating} A</div>
            <div>Overload Setting: {result.overloadSetting} A</div>
            <div>Fuse Rating: {result.fuseRating} A</div>
            <div>Cable Size: {result.cableSize} mm²</div>
            <div>Starting Method: {result.startingMethod}</div>
          </div>
          <div className="mt-2 text-xs text-gray-600">
            Note: Selection based on IEC standards. Verify with manufacturer data sheets.
          </div>
        </div>
      )}
    </div>
  );
}

function TransformerSizing() {
  const [totalLoad, setTotalLoad] = useState("");
  const [diversityFactor, setDiversityFactor] = useState("0.8");
  const [powerFactor, setPowerFactor] = useState("0.8");
  const [growthFactor, setGrowthFactor] = useState("1.2");
  const [loadType, setLoadType] = useState("mixed");
  const [result, setResult] = useState<any>(null);

  const calculateTransformerSize = () => {
    const P = parseFloat(totalLoad);
    const df = parseFloat(diversityFactor);
    const pf = parseFloat(powerFactor);
    const gf = parseFloat(growthFactor);
    
    if (!P || !df || !pf || !gf) return;

    // Calculate apparent power requirement
    const diversifiedLoad = P * df;
    const apparentPower = diversifiedLoad / pf; // Convert to kVA
    const futureLoad = apparentPower * gf; // Account for growth

    // Standard transformer ratings
    const standardRatings = [5, 10, 15, 25, 30, 50, 63, 75, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500];
    
    const selectedRating = standardRatings.find(rating => rating >= futureLoad) || "Custom Size Required";

    // Loading calculation
    const loading = (apparentPower / (selectedRating as number)) * 100;

    // Efficiency and losses estimation
    const efficiency = selectedRating <= 100 ? 0.95 : selectedRating <= 500 ? 0.97 : 0.98;
    const noLoadLoss = (selectedRating as number) * 0.003; // Approx 0.3%
    const loadLoss = (selectedRating as number) * 0.015; // Approx 1.5% at full load

    // Voltage regulation estimation
    const voltageRegulation = loadType === "motor" ? 3.5 : loadType === "lighting" ? 2.0 : 3.0;

    setResult({
      diversifiedLoad: diversifiedLoad.toFixed(1),
      apparentPower: apparentPower.toFixed(1),
      futureLoad: futureLoad.toFixed(1),
      selectedRating: selectedRating,
      loading: loading.toFixed(1),
      efficiency: (efficiency * 100).toFixed(1),
      noLoadLoss: noLoadLoss.toFixed(2),
      loadLoss: loadLoss.toFixed(2),
      voltageRegulation: voltageRegulation.toFixed(1)
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Total Connected Load (kW)</Label>
          <Input
            type="number"
            value={totalLoad}
            onChange={(e) => setTotalLoad(e.target.value)}
            placeholder="Enter total connected load"
          />
        </div>
        <div>
          <Label>Diversity Factor</Label>
          <Input
            type="number"
            step="0.1"
            min="0.1"
            max="1.0"
            value={diversityFactor}
            onChange={(e) => setDiversityFactor(e.target.value)}
            placeholder="0.8"
          />
        </div>
        <div>
          <Label>Power Factor</Label>
          <Input
            type="number"
            step="0.1"
            min="0.1"
            max="1.0"
            value={powerFactor}
            onChange={(e) => setPowerFactor(e.target.value)}
            placeholder="0.8"
          />
        </div>
        <div>
          <Label>Growth Factor</Label>
          <Input
            type="number"
            step="0.1"
            min="1.0"
            max="2.0"
            value={growthFactor}
            onChange={(e) => setGrowthFactor(e.target.value)}
            placeholder="1.2"
          />
        </div>
        <div>
          <Label>Load Type</Label>
          <Select value={loadType} onValueChange={setLoadType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lighting">Lighting</SelectItem>
              <SelectItem value="motor">Motor</SelectItem>
              <SelectItem value="mixed">Mixed Load</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={calculateTransformerSize} className="w-full">
        Calculate Transformer Size
      </Button>

      {result && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold mb-2">Transformer Sizing Results:</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Diversified Load: {result.diversifiedLoad} kW</div>
            <div>Apparent Power: {result.apparentPower} kVA</div>
            <div>Future Load: {result.futureLoad} kVA</div>
            <div>Selected Rating: {result.selectedRating} kVA</div>
            <div>Current Loading: {result.loading}%</div>
            <div>Efficiency: {result.efficiency}%</div>
            <div>No-Load Loss: {result.noLoadLoss} kW</div>
            <div>Load Loss: {result.loadLoss} kW</div>
            <div>Voltage Regulation: {result.voltageRegulation}%</div>
          </div>
          <div className="mt-2 text-xs text-gray-600">
            Note: Consider local load growth, redundancy requirements, and utility regulations.
          </div>
        </div>
      )}
    </div>
  );
}

function EarthingConductorSizing() {
  const [faultCurrent, setFaultCurrent] = useState("");
  const [faultDuration, setFaultDuration] = useState("1.0");
  const [conductorMaterial, setConductorMaterial] = useState("copper");
  const [installationType, setInstallationType] = useState("buried");
  const [result, setResult] = useState<any>(null);

  const calculateEarthingSize = () => {
    const I = parseFloat(faultCurrent);
    const t = parseFloat(faultDuration);
    
    if (!I || !t) return;

    // Material constants (k factor)
    const kFactors = {
      copper: installationType === "buried" ? 143 : 159,
      aluminum: installationType === "buried" ? 95 : 105,
      steel: installationType === "buried" ? 52 : 58
    };

    const k = kFactors[conductorMaterial as keyof typeof kFactors];

    // Calculate minimum cross-sectional area using adiabatic equation
    // A = (I × √t) / k
    const minArea = (I * Math.sqrt(t)) / k;

    // Standard conductor sizes
    const standardSizes = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630];
    const selectedSize = standardSizes.find(size => size >= minArea) || "Special Size Required";

    // Temperature rise calculation
    const initialTemp = 20; // °C
    const finalTemp = conductorMaterial === "copper" ? 250 : 
                     conductorMaterial === "aluminum" ? 200 : 400;
    const tempRise = finalTemp - initialTemp;

    // Resistance calculation
    const resistivity = conductorMaterial === "copper" ? 0.0175 :
                       conductorMaterial === "aluminum" ? 0.0283 : 0.138;
    const resistance = resistivity / (selectedSize as number); // per meter

    // Impedance check for earth fault loop
    const earthLoopImpedance = resistance * 100; // Assuming 100m earth path

    setResult({
      minArea: minArea.toFixed(2),
      selectedSize: selectedSize,
      kFactor: k,
      tempRise: tempRise,
      resistance: resistance.toFixed(4),
      earthLoopImpedance: earthLoopImpedance.toFixed(4),
      material: conductorMaterial,
      installation: installationType
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Fault Current (A)</Label>
          <Input
            type="number"
            value={faultCurrent}
            onChange={(e) => setFaultCurrent(e.target.value)}
            placeholder="Enter prospective fault current"
          />
        </div>
        <div>
          <Label>Fault Duration (s)</Label>
          <Input
            type="number"
            step="0.1"
            value={faultDuration}
            onChange={(e) => setFaultDuration(e.target.value)}
            placeholder="1.0"
          />
        </div>
        <div>
          <Label>Conductor Material</Label>
          <Select value={conductorMaterial} onValueChange={setConductorMaterial}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="copper">Copper</SelectItem>
              <SelectItem value="aluminum">Aluminum</SelectItem>
              <SelectItem value="steel">Steel</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Installation Type</Label>
          <Select value={installationType} onValueChange={setInstallationType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="buried">Buried in Ground</SelectItem>
              <SelectItem value="air">In Air</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={calculateEarthingSize} className="w-full">
        Calculate Earthing Conductor Size
      </Button>

      {result && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold mb-2">Earthing Conductor Sizing:</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Minimum Area Required: {result.minArea} mm²</div>
            <div>Selected Size: {result.selectedSize} mm²</div>
            <div>K Factor: {result.kFactor}</div>
            <div>Temperature Rise: {result.tempRise} °C</div>
            <div>Resistance: {result.resistance} Ω/m</div>
            <div>Earth Loop Impedance: {result.earthLoopImpedance} Ω</div>
            <div>Material: {result.material}</div>
            <div>Installation: {result.installation}</div>
          </div>
          <div className="mt-2 text-xs text-gray-600">
            Note: Based on IEC 60364 adiabatic equation. Consider soil resistivity and corrosion protection.
          </div>
        </div>
      )}
    </div>
  );
}

function PowerFactorCorrection() {
  const [activePower, setActivePower] = useState("");
  const [currentPF, setCurrentPF] = useState("");
  const [targetPF, setTargetPF] = useState("0.95");
  const [voltage, setVoltage] = useState("415");
  const [result, setResult] = useState<any>(null);

  const calculatePowerFactor = () => {
    const P = parseFloat(activePower);
    const pf1 = parseFloat(currentPF);
    const pf2 = parseFloat(targetPF);
    const V = parseFloat(voltage);
    
    if (!P || !pf1 || !pf2 || !V) return;

    // Calculate reactive power components
    const Q1 = P * Math.tan(Math.acos(pf1)); // Existing reactive power
    const Q2 = P * Math.tan(Math.acos(pf2)); // Target reactive power
    const QcRequired = Q1 - Q2; // Required capacitive reactive power

    // Calculate apparent power
    const S1 = P / pf1; // Existing apparent power
    const S2 = P / pf2; // Target apparent power
    const savingsKVA = S1 - S2; // kVA savings

    // Calculate capacitor rating
    const capacitorRating = Math.abs(QcRequired);

    // Calculate current reduction
    const I1 = S1 * 1000 / (Math.sqrt(3) * V); // Existing current
    const I2 = S2 * 1000 / (Math.sqrt(3) * V); // Target current
    const currentReduction = ((I1 - I2) / I1) * 100;

    // Energy savings calculation (approximate)
    const energySavings = currentReduction; // % reduction in line losses

    // Standard capacitor ratings
    const standardCapacitorRatings = [5, 7.5, 10, 12.5, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300, 400, 500];
    const selectedCapacitorRating = standardCapacitorRatings.find(rating => rating >= capacitorRating) || "Custom Rating Required";

    setResult({
      currentReactivePower: Q1.toFixed(1),
      targetReactivePower: Q2.toFixed(1),
      requiredKVAR: capacitorRating.toFixed(1),
      selectedCapacitorRating: selectedCapacitorRating,
      currentApparentPower: S1.toFixed(1),
      targetApparentPower: S2.toFixed(1),
      kVASavings: savingsKVA.toFixed(1),
      currentBefore: I1.toFixed(1),
      currentAfter: I2.toFixed(1),
      currentReduction: currentReduction.toFixed(1),
      energySavings: energySavings.toFixed(1)
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Active Power (kW)</Label>
          <Input
            type="number"
            value={activePower}
            onChange={(e) => setActivePower(e.target.value)}
            placeholder="Enter total active power"
          />
        </div>
        <div>
          <Label>Current Power Factor</Label>
          <Input
            type="number"
            step="0.01"
            min="0.1"
            max="1.0"
            value={currentPF}
            onChange={(e) => setCurrentPF(e.target.value)}
            placeholder="0.75"
          />
        </div>
        <div>
          <Label>Target Power Factor</Label>
          <Input
            type="number"
            step="0.01"
            min="0.8"
            max="1.0"
            value={targetPF}
            onChange={(e) => setTargetPF(e.target.value)}
            placeholder="0.95"
          />
        </div>
        <div>
          <Label>System Voltage (V)</Label>
          <Select value={voltage} onValueChange={setVoltage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="230">230V</SelectItem>
              <SelectItem value="415">415V</SelectItem>
              <SelectItem value="1000">1000V</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={calculatePowerFactor} className="w-full">
        Calculate Power Factor Correction
      </Button>

      {result && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold mb-2">Power Factor Correction Results:</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Current Reactive Power: {result.currentReactivePower} kVAR</div>
            <div>Target Reactive Power: {result.targetReactivePower} kVAR</div>
            <div>Required Capacitor: {result.requiredKVAR} kVAR</div>
            <div>Selected Rating: {result.selectedCapacitorRating} kVAR</div>
            <div>Current Apparent Power: {result.currentApparentPower} kVA</div>
            <div>Target Apparent Power: {result.targetApparentPower} kVA</div>
            <div>kVA Savings: {result.kVASavings} kVA</div>
            <div>Current Before: {result.currentBefore} A</div>
            <div>Current After: {result.currentAfter} A</div>
            <div>Current Reduction: {result.currentReduction}%</div>
            <div>Energy Savings: {result.energySavings}%</div>
          </div>
          <div className="mt-2 text-xs text-gray-600">
            Note: Consider harmonic content and automatic power factor correction systems for variable loads.
          </div>
        </div>
      )}
    </div>
  );
}

function EnergyConsumptionCalculator() {
  const [power, setPower] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState("");
  const [daysPerMonth, setDaysPerMonth] = useState("30");
  const [energyRate, setEnergyRate] = useState("");
  const [demandRate, setDemandRate] = useState("");
  const [powerFactor, setPowerFactor] = useState("0.85");
  const [result, setResult] = useState<any>(null);

  const calculateEnergyCost = () => {
    const P = parseFloat(power);
    const hrs = parseFloat(hoursPerDay);
    const days = parseFloat(daysPerMonth);
    const rateEnergy = parseFloat(energyRate);
    const rateDemand = parseFloat(demandRate) || 0;
    const pf = parseFloat(powerFactor);
    
    if (!P || !hrs || !days || !rateEnergy || !pf) return;

    // Energy calculations
    const dailyEnergy = P * hrs; // kWh per day
    const monthlyEnergy = dailyEnergy * days; // kWh per month
    const annualEnergy = monthlyEnergy * 12; // kWh per year

    // Demand calculations
    const maxDemand = P; // Assuming maximum demand equals power
    const apparentDemand = P / pf; // kVA demand

    // Cost calculations
    const monthlyEnergyCost = monthlyEnergy * rateEnergy;
    const monthlyDemandCost = maxDemand * rateDemand;
    const totalMonthlyCost = monthlyEnergyCost + monthlyDemandCost;
    const annualCost = totalMonthlyCost * 12;

    // Carbon footprint (approximate)
    const carbonFactor = 0.82; // kg CO2 per kWh (varies by region)
    const monthlyCarbonFootprint = monthlyEnergy * carbonFactor;
    const annualCarbonFootprint = annualEnergy * carbonFactor;

    // Load factor calculation
    const loadFactor = (dailyEnergy / (P * 24)) * 100;

    setResult({
      dailyEnergy: dailyEnergy.toFixed(1),
      monthlyEnergy: monthlyEnergy.toFixed(0),
      annualEnergy: annualEnergy.toFixed(0),
      maxDemand: maxDemand.toFixed(1),
      apparentDemand: apparentDemand.toFixed(1),
      monthlyEnergyCost: monthlyEnergyCost.toFixed(2),
      monthlyDemandCost: monthlyDemandCost.toFixed(2),
      totalMonthlyCost: totalMonthlyCost.toFixed(2),
      annualCost: annualCost.toFixed(2),
      loadFactor: loadFactor.toFixed(1),
      monthlyCarbonFootprint: monthlyCarbonFootprint.toFixed(0),
      annualCarbonFootprint: annualCarbonFootprint.toFixed(0)
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Power Consumption (kW)</Label>
          <Input
            type="number"
            value={power}
            onChange={(e) => setPower(e.target.value)}
            placeholder="Enter power consumption"
          />
        </div>
        <div>
          <Label>Operating Hours/Day</Label>
          <Input
            type="number"
            value={hoursPerDay}
            onChange={(e) => setHoursPerDay(e.target.value)}
            placeholder="Enter daily operating hours"
          />
        </div>
        <div>
          <Label>Days Per Month</Label>
          <Input
            type="number"
            value={daysPerMonth}
            onChange={(e) => setDaysPerMonth(e.target.value)}
            placeholder="30"
          />
        </div>
        <div>
          <Label>Energy Rate (per kWh)</Label>
          <Input
            type="number"
            step="0.01"
            value={energyRate}
            onChange={(e) => setEnergyRate(e.target.value)}
            placeholder="Enter cost per kWh"
          />
        </div>
        <div>
          <Label>Demand Rate (per kW)</Label>
          <Input
            type="number"
            step="0.01"
            value={demandRate}
            onChange={(e) => setDemandRate(e.target.value)}
            placeholder="Enter demand charge (optional)"
          />
        </div>
        <div>
          <Label>Power Factor</Label>
          <Input
            type="number"
            step="0.01"
            min="0.1"
            max="1.0"
            value={powerFactor}
            onChange={(e) => setPowerFactor(e.target.value)}
            placeholder="0.85"
          />
        </div>
      </div>

      <Button onClick={calculateEnergyCost} className="w-full">
        Calculate Energy Consumption & Cost
      </Button>

      {result && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold mb-2">Energy Analysis Results:</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Daily Energy: {result.dailyEnergy} kWh</div>
            <div>Monthly Energy: {result.monthlyEnergy} kWh</div>
            <div>Annual Energy: {result.annualEnergy} kWh</div>
            <div>Max Demand: {result.maxDemand} kW</div>
            <div>Apparent Demand: {result.apparentDemand} kVA</div>
            <div>Monthly Energy Cost: ₹{result.monthlyEnergyCost}</div>
            <div>Monthly Demand Cost: ₹{result.monthlyDemandCost}</div>
            <div>Total Monthly Cost: ₹{result.totalMonthlyCost}</div>
            <div>Annual Cost: ₹{result.annualCost}</div>
            <div>Load Factor: {result.loadFactor}%</div>
            <div>Monthly CO₂: {result.monthlyCarbonFootprint} kg</div>
            <div>Annual CO₂: {result.annualCarbonFootprint} kg</div>
          </div>
          <div className="mt-2 text-xs text-gray-600">
            Note: Costs may vary based on utility tariff structure and time-of-use rates.
          </div>
        </div>
      )}
    </div>
  );
}

function WireColorCodeReference() {
  const [standard, setStandard] = useState("iec");
  
  const colorCodes = {
    iec: {
      title: "IEC Color Codes",
      codes: [
        { conductor: "Line 1 (L1)", color: "Brown", voltage: "Phase" },
        { conductor: "Line 2 (L2)", color: "Black", voltage: "Phase" },
        { conductor: "Line 3 (L3)", color: "Grey", voltage: "Phase" },
        { conductor: "Neutral (N)", color: "Blue", voltage: "Neutral" },
        { conductor: "Protective Earth (PE)", color: "Green/Yellow", voltage: "Earth" },
        { conductor: "PEN", color: "Blue with Green/Yellow", voltage: "Combined" },
        { conductor: "DC Positive", color: "Brown/Red", voltage: "DC+" },
        { conductor: "DC Negative", color: "Black/Blue", voltage: "DC-" }
      ]
    },
    nec: {
      title: "NEC (US) Color Codes",
      codes: [
        { conductor: "Line 1 (L1)", color: "Black", voltage: "Phase" },
        { conductor: "Line 2 (L2)", color: "Red", voltage: "Phase" },
        { conductor: "Line 3 (L3)", color: "Blue", voltage: "Phase" },
        { conductor: "Neutral (N)", color: "White/Grey", voltage: "Neutral" },
        { conductor: "Ground", color: "Green/Bare", voltage: "Earth" },
        { conductor: "DC Positive", color: "Red", voltage: "DC+" },
        { conductor: "DC Negative", color: "Black", voltage: "DC-" }
      ]
    },
    indian: {
      title: "Indian Standards (IS 732)",
      codes: [
        { conductor: "R Phase", color: "Red", voltage: "Phase" },
        { conductor: "Y Phase", color: "Yellow", voltage: "Phase" },
        { conductor: "B Phase", color: "Blue", voltage: "Phase" },
        { conductor: "Neutral (N)", color: "Black", voltage: "Neutral" },
        { conductor: "Earth", color: "Green", voltage: "Earth" },
        { conductor: "Control Circuit", color: "Orange", voltage: "Control" }
      ]
    }
  };

  const currentCodes = colorCodes[standard as keyof typeof colorCodes];

  return (
    <div className="space-y-4">
      <div>
        <Label>Select Standard</Label>
        <Select value={standard} onValueChange={setStandard}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="iec">IEC International</SelectItem>
            <SelectItem value="nec">NEC (USA)</SelectItem>
            <SelectItem value="indian">Indian Standards</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4">
        <h4 className="font-semibold mb-2">{currentCodes.title}</h4>
        <div className="space-y-2">
          {currentCodes.codes.map((code, index) => (
            <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
              <span className="font-medium">{code.conductor}</span>
              <span className="text-sm">{code.color}</span>
              <Badge variant="outline">{code.voltage}</Badge>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
        <h5 className="font-medium text-yellow-800 mb-1">Safety Notes:</h5>
        <ul className="text-xs text-yellow-700 space-y-1">
          <li>• Always verify local electrical codes and standards</li>
          <li>• Use proper color coding for safety and maintenance</li>
          <li>• Label conductors clearly in control panels</li>
          <li>• Consider phase rotation requirements</li>
        </ul>
      </div>
    </div>
  );
}

function CableTrayFillCalculator() {
  const [trayWidth, setTrayWidth] = useState("");
  const [trayHeight, setTrayHeight] = useState("");
  const [cableData, setCableData] = useState("");
  const [fillType, setFillType] = useState("power");
  const [result, setResult] = useState<any>(null);

  const calculateTrayFill = () => {
    const width = parseFloat(trayWidth);
    const height = parseFloat(trayHeight);
    
    if (!width || !height || !cableData) return;

    // Parse cable data (format: "diameter1,quantity1;diameter2,quantity2")
    const cables = cableData.split(';').map(entry => {
      const [diameter, quantity] = entry.split(',').map(val => parseFloat(val.trim()));
      return { diameter, quantity };
    }).filter(cable => !isNaN(cable.diameter) && !isNaN(cable.quantity));

    // Calculate total cable cross-sectional area
    let totalCableArea = 0;
    cables.forEach(cable => {
      const cableArea = Math.PI * Math.pow(cable.diameter / 2, 2) * cable.quantity;
      totalCableArea += cableArea;
    });

    // Calculate tray area
    const trayArea = width * height;

    // Fill percentage based on cable type
    const maxFillPercentages = {
      power: 40, // 40% for power cables
      control: 50, // 50% for control cables
      mixed: 40 // 40% for mixed installation
    };

    const maxFillPercent = maxFillPercentages[fillType as keyof typeof maxFillPercentages];
    const maxAllowableArea = (trayArea * maxFillPercent) / 100;
    const currentFillPercent = (totalCableArea / trayArea) * 100;
    const availableArea = maxAllowableArea - totalCableArea;
    const compliance = currentFillPercent <= maxFillPercent;

    // Cable weight estimation (approximate)
    let totalWeight = 0;
    cables.forEach(cable => {
      const weightPerMeter = Math.pow(cable.diameter, 2) * 0.1; // Approximate formula
      totalWeight += weightPerMeter * cable.quantity;
    });

    setResult({
      trayArea: trayArea.toFixed(0),
      totalCableArea: totalCableArea.toFixed(0),
      currentFillPercent: currentFillPercent.toFixed(1),
      maxFillPercent: maxFillPercent,
      availableArea: availableArea.toFixed(0),
      compliance: compliance,
      totalWeight: totalWeight.toFixed(1),
      cableCount: cables.reduce((sum, cable) => sum + cable.quantity, 0)
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Tray Width (mm)</Label>
          <Input
            type="number"
            value={trayWidth}
            onChange={(e) => setTrayWidth(e.target.value)}
            placeholder="Enter tray width"
          />
        </div>
        <div>
          <Label>Tray Height (mm)</Label>
          <Input
            type="number"
            value={trayHeight}
            onChange={(e) => setTrayHeight(e.target.value)}
            placeholder="Enter tray height"
          />
        </div>
        <div>
          <Label>Cable Type</Label>
          <Select value={fillType} onValueChange={setFillType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="power">Power Cables</SelectItem>
              <SelectItem value="control">Control Cables</SelectItem>
              <SelectItem value="mixed">Mixed Installation</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Cable Data</Label>
        <Input
          value={cableData}
          onChange={(e) => setCableData(e.target.value)}
          placeholder="Format: diameter1,quantity1;diameter2,quantity2 (e.g., 25,3;32,2)"
        />
        <div className="text-xs text-gray-600 mt-1">
          Enter cable outer diameter (mm) and quantity. Separate different cables with semicolon.
        </div>
      </div>

      <Button onClick={calculateTrayFill} className="w-full">
        Calculate Tray Fill
      </Button>

      {result && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold mb-2">Cable Tray Fill Analysis:</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Tray Area: {result.trayArea} mm²</div>
            <div>Cable Area: {result.totalCableArea} mm²</div>
            <div>Current Fill: {result.currentFillPercent}%</div>
            <div>Max Allowed: {result.maxFillPercent}%</div>
            <div>Available Area: {result.availableArea} mm²</div>
            <div>Total Cables: {result.cableCount}</div>
            <div>Est. Weight: {result.totalWeight} kg/m</div>
            <div className={result.compliance ? "text-green-600" : "text-red-600"}>
              Compliance: {result.compliance ? "PASS" : "FAIL"}
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-600">
            Note: Based on standard cable tray fill requirements. Consider heat generation and maintenance access.
          </div>
        </div>
      )}
    </div>
  );
}

function LoadBalanceChecker() {
  const [phaseALoad, setPhaseALoad] = useState("");
  const [phaseBLoad, setPhaseBLoad] = useState("");
  const [phaseCLoad, setPhaseCLoad] = useState("");
  const [voltage, setVoltage] = useState("415");
  const [result, setResult] = useState<any>(null);

  const calculateLoadBalance = () => {
    const PA = parseFloat(phaseALoad) || 0;
    const PB = parseFloat(phaseBLoad) || 0;
    const PC = parseFloat(phaseCLoad) || 0;
    const V = parseFloat(voltage);
    
    if (!V) return;

    // Calculate phase currents
    const IA = (PA * 1000) / V; // Convert kW to W, then to A
    const IB = (PB * 1000) / V;
    const IC = (PC * 1000) / V;

    // Calculate average current
    const IAverage = (IA + IB + IC) / 3;

    // Calculate imbalance percentages
    const imbalanceA = Math.abs(IA - IAverage) / IAverage * 100;
    const imbalanceB = Math.abs(IB - IAverage) / IAverage * 100;
    const imbalanceC = Math.abs(IC - IAverage) / IAverage * 100;
    const maxImbalance = Math.max(imbalanceA, imbalanceB, imbalanceC);

    // Calculate neutral current (vector sum)
    // Simplified calculation assuming purely resistive loads
    const neutralCurrent = Math.abs(IA + IB * Math.cos(2 * Math.PI / 3) + IC * Math.cos(4 * Math.PI / 3));

    // Power calculations
    const totalPower = PA + PB + PC;
    const averagePowerPerPhase = totalPower / 3;

    // Load balance assessment
    const isBalanced = maxImbalance <= 5; // 5% threshold
    const balanceQuality = maxImbalance <= 2 ? "Excellent" :
                          maxImbalance <= 5 ? "Good" :
                          maxImbalance <= 10 ? "Fair" : "Poor";

    // Recommendations for load redistribution
    const recommendations = [];
    if (imbalanceA > 5) recommendations.push(`Reduce Phase A load by ${(IA - IAverage).toFixed(1)} A`);
    if (imbalanceB > 5) recommendations.push(`Reduce Phase B load by ${(IB - IAverage).toFixed(1)} A`);
    if (imbalanceC > 5) recommendations.push(`Reduce Phase C load by ${(IC - IAverage).toFixed(1)} A`);

    setResult({
      currentA: IA.toFixed(1),
      currentB: IB.toFixed(1),
      currentC: IC.toFixed(1),
      averageCurrent: IAverage.toFixed(1),
      imbalanceA: imbalanceA.toFixed(1),
      imbalanceB: imbalanceB.toFixed(1),
      imbalanceC: imbalanceC.toFixed(1),
      maxImbalance: maxImbalance.toFixed(1),
      neutralCurrent: neutralCurrent.toFixed(1),
      totalPower: totalPower.toFixed(1),
      isBalanced: isBalanced,
      balanceQuality: balanceQuality,
      recommendations: recommendations
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Phase A Load (kW)</Label>
          <Input
            type="number"
            value={phaseALoad}
            onChange={(e) => setPhaseALoad(e.target.value)}
            placeholder="Enter phase A load"
          />
        </div>
        <div>
          <Label>Phase B Load (kW)</Label>
          <Input
            type="number"
            value={phaseBLoad}
            onChange={(e) => setPhaseBLoad(e.target.value)}
            placeholder="Enter phase B load"
          />
        </div>
        <div>
          <Label>Phase C Load (kW)</Label>
          <Input
            type="number"
            value={phaseCLoad}
            onChange={(e) => setPhaseCLoad(e.target.value)}
            placeholder="Enter phase C load"
          />
        </div>
        <div>
          <Label>Line Voltage (V)</Label>
          <Select value={voltage} onValueChange={setVoltage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="230">230V</SelectItem>
              <SelectItem value="415">415V</SelectItem>
              <SelectItem value="1000">1000V</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={calculateLoadBalance} className="w-full">
        Check Load Balance
      </Button>

      {result && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold mb-2">Load Balance Analysis:</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Phase A Current: {result.currentA} A</div>
            <div>Phase B Current: {result.currentB} A</div>
            <div>Phase C Current: {result.currentC} A</div>
            <div>Average Current: {result.averageCurrent} A</div>
            <div>Phase A Imbalance: {result.imbalanceA}%</div>
            <div>Phase B Imbalance: {result.imbalanceB}%</div>
            <div>Phase C Imbalance: {result.imbalanceC}%</div>
            <div>Max Imbalance: {result.maxImbalance}%</div>
            <div>Neutral Current: {result.neutralCurrent} A</div>
            <div>Total Power: {result.totalPower} kW</div>
            <div className={result.isBalanced ? "text-green-600" : "text-red-600"}>
              Balance Status: {result.isBalanced ? "BALANCED" : "UNBALANCED"}
            </div>
            <div>Balance Quality: {result.balanceQuality}</div>
          </div>
          {result.recommendations.length > 0 && (
            <div className="mt-2">
              <h5 className="font-medium text-sm">Recommendations:</h5>
              <ul className="text-xs text-gray-600">
                {result.recommendations.map((rec: string, index: number) => (
                  <li key={index}>• {rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LuxLevelEstimator() {
  const [roomLength, setRoomLength] = useState("");
  const [roomWidth, setRoomWidth] = useState("");
  const [mountingHeight, setMountingHeight] = useState("");
  const [workingPlane, setWorkingPlane] = useState("0.85");
  const [roomType, setRoomType] = useState("office");
  const [luminaireType, setLuminaireType] = useState("led_panel");
  const [result, setResult] = useState<any>(null);

  const calculateLighting = () => {
    const length = parseFloat(roomLength);
    const width = parseFloat(roomWidth);
    const hm = parseFloat(mountingHeight);
    const hw = parseFloat(workingPlane);
    
    if (!length || !width || !hm || !hw) return;

    // Room area
    const area = length * width;
    const effectiveHeight = hm - hw;

    // Room index calculation
    const roomIndex = (length * width) / ((length + width) * effectiveHeight);

    // Target illuminance levels (lux) for different room types
    const illuminanceLevels = {
      office: 500,
      classroom: 300,
      workshop: 500,
      warehouse: 200,
      meeting_room: 500,
      corridor: 100,
      parking: 75,
      retail: 750
    };

    const targetLux = illuminanceLevels[roomType as keyof typeof illuminanceLevels];

    // Luminaire data (lumens output and efficacy)
    const luminaireData = {
      led_panel: { lumens: 4000, efficacy: 120, name: "LED Panel 40W" },
      fluorescent: { lumens: 3200, efficacy: 80, name: "T8 Fluorescent 36W" },
      led_highbay: { lumens: 15000, efficacy: 150, name: "LED High Bay 100W" },
      incandescent: { lumens: 800, efficacy: 15, name: "Incandescent 60W" }
    };

    const selectedLuminaire = luminaireData[luminaireType as keyof typeof luminaireData];

    // Utilization factor (simplified, based on room index)
    const utilizationFactor = roomIndex < 1 ? 0.4 : 
                             roomIndex < 2 ? 0.5 : 
                             roomIndex < 3 ? 0.6 : 0.7;

    // Maintenance factor
    const maintenanceFactor = 0.8;

    // Calculate required lumens
    const requiredLumens = (targetLux * area) / (utilizationFactor * maintenanceFactor);

    // Number of luminaires required
    const numberOfLuminaires = Math.ceil(requiredLumens / selectedLuminaire.lumens);

    // Actual lux level achieved
    const actualLux = (numberOfLuminaires * selectedLuminaire.lumens * utilizationFactor * maintenanceFactor) / area;

    // Power consumption
    const powerPerLuminaire = selectedLuminaire.lumens / selectedLuminaire.efficacy;
    const totalPower = numberOfLuminaires * powerPerLuminaire;

    // Luminaire spacing
    const spacingRatio = 1.2; // Typical for office lighting
    const maxSpacing = effectiveHeight * spacingRatio;
    const suggestedSpacing = Math.min(maxSpacing, Math.sqrt(area / numberOfLuminaires));

    setResult({
      area: area.toFixed(1),
      roomIndex: roomIndex.toFixed(2),
      targetLux: targetLux,
      requiredLumens: requiredLumens.toFixed(0),
      numberOfLuminaires: numberOfLuminaires,
      actualLux: actualLux.toFixed(0),
      totalPower: totalPower.toFixed(0),
      powerDensity: (totalPower / area).toFixed(1),
      suggestedSpacing: suggestedSpacing.toFixed(1),
      luminaireType: selectedLuminaire.name,
      utilizationFactor: utilizationFactor.toFixed(2),
      maintenanceFactor: maintenanceFactor.toFixed(2)
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Room Length (m)</Label>
          <Input
            type="number"
            value={roomLength}
            onChange={(e) => setRoomLength(e.target.value)}
            placeholder="Enter room length"
          />
        </div>
        <div>
          <Label>Room Width (m)</Label>
          <Input
            type="number"
            value={roomWidth}
            onChange={(e) => setRoomWidth(e.target.value)}
            placeholder="Enter room width"
          />
        </div>
        <div>
          <Label>Mounting Height (m)</Label>
          <Input
            type="number"
            value={mountingHeight}
            onChange={(e) => setMountingHeight(e.target.value)}
            placeholder="Height from floor to luminaire"
          />
        </div>
        <div>
          <Label>Working Plane Height (m)</Label>
          <Input
            type="number"
            value={workingPlane}
            onChange={(e) => setWorkingPlane(e.target.value)}
            placeholder="0.85 (typical desk height)"
          />
        </div>
        <div>
          <Label>Room Type</Label>
          <Select value={roomType} onValueChange={setRoomType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="office">Office</SelectItem>
              <SelectItem value="classroom">Classroom</SelectItem>
              <SelectItem value="workshop">Workshop</SelectItem>
              <SelectItem value="warehouse">Warehouse</SelectItem>
              <SelectItem value="meeting_room">Meeting Room</SelectItem>
              <SelectItem value="corridor">Corridor</SelectItem>
              <SelectItem value="parking">Parking</SelectItem>
              <SelectItem value="retail">Retail</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Luminaire Type</Label>
          <Select value={luminaireType} onValueChange={setLuminaireType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="led_panel">LED Panel</SelectItem>
              <SelectItem value="fluorescent">T8 Fluorescent</SelectItem>
              <SelectItem value="led_highbay">LED High Bay</SelectItem>
              <SelectItem value="incandescent">Incandescent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={calculateLighting} className="w-full">
        Calculate Lighting Requirements
      </Button>

      {result && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold mb-2">Lighting Design Results:</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Room Area: {result.area} m²</div>
            <div>Room Index: {result.roomIndex}</div>
            <div>Target Illuminance: {result.targetLux} lux</div>
            <div>Required Lumens: {result.requiredLumens}</div>
            <div>Number of Luminaires: {result.numberOfLuminaires}</div>
            <div>Actual Illuminance: {result.actualLux} lux</div>
            <div>Total Power: {result.totalPower} W</div>
            <div>Power Density: {result.powerDensity} W/m²</div>
            <div>Suggested Spacing: {result.suggestedSpacing} m</div>
            <div>Luminaire Type: {result.luminaireType}</div>
            <div>Utilization Factor: {result.utilizationFactor}</div>
            <div>Maintenance Factor: {result.maintenanceFactor}</div>
          </div>
          <div className="mt-2 text-xs text-gray-600">
            Note: Basic calculation for initial estimation. Detailed photometric analysis recommended for final design.
          </div>
        </div>
      )}
    </div>
  );
}

// Unit Converter Components
function LengthConverter() {
  const [value, setValue] = useState("");
  const [fromUnit, setFromUnit] = useState("m");
  const [toUnit, setToUnit] = useState("ft");
  const [result, setResult] = useState("");

  const lengthUnits = {
    mm: { name: "Millimeters", factor: 0.001 },
    cm: { name: "Centimeters", factor: 0.01 },
    m: { name: "Meters", factor: 1 },
    in: { name: "Inches", factor: 0.0254 },
    ft: { name: "Feet", factor: 0.3048 },
    yd: { name: "Yards", factor: 0.9144 },
    km: { name: "Kilometers", factor: 1000 },
    mi: { name: "Miles", factor: 1609.344 }
  };

  const convert = () => {
    const inputValue = parseFloat(value);
    if (isNaN(inputValue)) {
      setResult("");
      return;
    }

    const fromFactor = lengthUnits[fromUnit as keyof typeof lengthUnits].factor;
    const toFactor = lengthUnits[toUnit as keyof typeof lengthUnits].factor;
    const converted = (inputValue * fromFactor) / toFactor;
    setResult(converted.toExponential(6));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="fromUnit">From Unit</Label>
          <Select value={fromUnit} onValueChange={setFromUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(lengthUnits).map(([key, unit]) => (
                <SelectItem key={key} value={key}>{unit.name} ({key})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="toUnit">To Unit</Label>
          <Select value={toUnit} onValueChange={setToUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(lengthUnits).map(([key, unit]) => (
                <SelectItem key={key} value={key}>{unit.name} ({key})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="value">Value</Label>
        <Input
          id="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyUp={convert}
          placeholder="Enter value to convert"
        />
      </div>

      <Button onClick={convert} className="w-full">
        <ArrowLeftRight className="h-4 w-4 mr-2" />
        Convert
      </Button>

      {result && (
        <div className="p-4 bg-blue-50 rounded-lg border">
          <div className="text-center">
            <div className="text-lg font-mono">{result}</div>
            <div className="text-sm text-muted-foreground mt-1">
              {lengthUnits[toUnit as keyof typeof lengthUnits].name}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MassConverter() {
  const [value, setValue] = useState("");
  const [fromUnit, setFromUnit] = useState("kg");
  const [toUnit, setToUnit] = useState("lb");
  const [result, setResult] = useState("");

  const massUnits = {
    g: { name: "Grams", factor: 0.001 },
    kg: { name: "Kilograms", factor: 1 },
    tonne: { name: "Tonnes", factor: 1000 },
    lb: { name: "Pounds", factor: 0.453592 },
    oz: { name: "Ounces", factor: 0.0283495 }
  };

  const convert = () => {
    const inputValue = parseFloat(value);
    if (isNaN(inputValue)) {
      setResult("");
      return;
    }

    const fromFactor = massUnits[fromUnit as keyof typeof massUnits].factor;
    const toFactor = massUnits[toUnit as keyof typeof massUnits].factor;
    const converted = (inputValue * fromFactor) / toFactor;
    setResult(converted.toExponential(6));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="fromUnit">From Unit</Label>
          <Select value={fromUnit} onValueChange={setFromUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(massUnits).map(([key, unit]) => (
                <SelectItem key={key} value={key}>{unit.name} ({key})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="toUnit">To Unit</Label>
          <Select value={toUnit} onValueChange={setToUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(massUnits).map(([key, unit]) => (
                <SelectItem key={key} value={key}>{unit.name} ({key})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="value">Value</Label>
        <Input
          id="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyUp={convert}
          placeholder="Enter value to convert"
        />
      </div>

      <Button onClick={convert} className="w-full">
        <ArrowLeftRight className="h-4 w-4 mr-2" />
        Convert
      </Button>

      {result && (
        <div className="p-4 bg-blue-50 rounded-lg border">
          <div className="text-center">
            <div className="text-lg font-mono">{result}</div>
            <div className="text-sm text-muted-foreground mt-1">
              {massUnits[toUnit as keyof typeof massUnits].name}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PressureConverter() {
  const [value, setValue] = useState("");
  const [fromUnit, setFromUnit] = useState("bar");
  const [toUnit, setToUnit] = useState("psi");
  const [result, setResult] = useState("");

  const pressureUnits = {
    Pa: { name: "Pascals", factor: 1 },
    kPa: { name: "Kilopascals", factor: 1000 },
    MPa: { name: "Megapascals", factor: 1000000 },
    bar: { name: "Bar", factor: 100000 },
    atm: { name: "Atmospheres", factor: 101325 },
    psi: { name: "PSI", factor: 6894.76 },
    mmHg: { name: "mmHg", factor: 133.322 },
    Torr: { name: "Torr", factor: 133.322 }
  };

  const convert = () => {
    const inputValue = parseFloat(value);
    if (isNaN(inputValue)) {
      setResult("");
      return;
    }

    const fromFactor = pressureUnits[fromUnit as keyof typeof pressureUnits].factor;
    const toFactor = pressureUnits[toUnit as keyof typeof pressureUnits].factor;
    const converted = (inputValue * fromFactor) / toFactor;
    setResult(converted.toExponential(6));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="fromUnit">From Unit</Label>
          <Select value={fromUnit} onValueChange={setFromUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(pressureUnits).map(([key, unit]) => (
                <SelectItem key={key} value={key}>{unit.name} ({key})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="toUnit">To Unit</Label>
          <Select value={toUnit} onValueChange={setToUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(pressureUnits).map(([key, unit]) => (
                <SelectItem key={key} value={key}>{unit.name} ({key})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="value">Value</Label>
        <Input
          id="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyUp={convert}
          placeholder="Enter value to convert"
        />
      </div>

      <Button onClick={convert} className="w-full">
        <ArrowLeftRight className="h-4 w-4 mr-2" />
        Convert
      </Button>

      {result && (
        <div className="p-4 bg-blue-50 rounded-lg border">
          <div className="text-center">
            <div className="text-lg font-mono">{result}</div>
            <div className="text-sm text-muted-foreground mt-1">
              {pressureUnits[toUnit as keyof typeof pressureUnits].name}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TemperatureConverter() {
  const [value, setValue] = useState("");
  const [fromUnit, setFromUnit] = useState("C");
  const [toUnit, setToUnit] = useState("F");
  const [result, setResult] = useState("");

  const temperatureUnits = {
    C: { name: "Celsius (°C)" },
    F: { name: "Fahrenheit (°F)" },
    K: { name: "Kelvin (K)" },
    R: { name: "Rankine (°R)" }
  };

  const convert = () => {
    const inputValue = parseFloat(value);
    if (isNaN(inputValue)) {
      setResult("");
      return;
    }

    // Convert to Celsius first
    let celsius = inputValue;
    if (fromUnit === "F") celsius = (inputValue - 32) * 5/9;
    else if (fromUnit === "K") celsius = inputValue - 273.15;
    else if (fromUnit === "R") celsius = (inputValue - 491.67) * 5/9;

    // Convert from Celsius to target unit
    let converted = celsius;
    if (toUnit === "F") converted = celsius * 9/5 + 32;
    else if (toUnit === "K") converted = celsius + 273.15;
    else if (toUnit === "R") converted = celsius * 9/5 + 491.67;

    setResult(converted.toFixed(3));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="fromUnit">From Unit</Label>
          <Select value={fromUnit} onValueChange={setFromUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(temperatureUnits).map(([key, unit]) => (
                <SelectItem key={key} value={key}>{unit.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="toUnit">To Unit</Label>
          <Select value={toUnit} onValueChange={setToUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(temperatureUnits).map(([key, unit]) => (
                <SelectItem key={key} value={key}>{unit.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="value">Temperature Value</Label>
        <Input
          id="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyUp={convert}
          placeholder="Enter temperature to convert"
        />
      </div>

      <Button onClick={convert} className="w-full">
        <ArrowLeftRight className="h-4 w-4 mr-2" />
        Convert
      </Button>

      {result && (
        <div className="p-4 bg-blue-50 rounded-lg border">
          <div className="text-center">
            <div className="text-lg font-mono">{result}</div>
            <div className="text-sm text-muted-foreground mt-1">
              {temperatureUnits[toUnit as keyof typeof temperatureUnits].name}
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            <p><strong>Formula-based conversion:</strong></p>
            <p>C to F: (°C × 9/5) + 32</p>
            <p>F to C: (°F - 32) × 5/9</p>
            <p>C to K: °C + 273.15</p>
          </div>
        </div>
      )}
    </div>
  );
}

function FlowRateConverter() {
  const [value, setValue] = useState("");
  const [fromUnit, setFromUnit] = useState("m3/h");
  const [toUnit, setToUnit] = useState("GPM");
  const [result, setResult] = useState("");

  const flowUnits = {
    "L/s": { name: "Liters per Second", factor: 1 },
    "m3/h": { name: "Cubic Meters per Hour", factor: 277.778 },
    "GPM": { name: "Gallons per Minute", factor: 63.0901 },
    "CFM": { name: "Cubic Feet per Minute", factor: 471.947 }
  };

  const convert = () => {
    const inputValue = parseFloat(value);
    if (isNaN(inputValue)) {
      setResult("");
      return;
    }

    const fromFactor = flowUnits[fromUnit as keyof typeof flowUnits].factor;
    const toFactor = flowUnits[toUnit as keyof typeof flowUnits].factor;
    const converted = (inputValue * fromFactor) / toFactor;
    setResult(converted.toExponential(6));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="fromUnit">From Unit</Label>
          <Select value={fromUnit} onValueChange={setFromUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(flowUnits).map(([key, unit]) => (
                <SelectItem key={key} value={key}>{unit.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="toUnit">To Unit</Label>
          <Select value={toUnit} onValueChange={setToUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(flowUnits).map(([key, unit]) => (
                <SelectItem key={key} value={key}>{unit.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="value">Flow Rate</Label>
        <Input
          id="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyUp={convert}
          placeholder="Enter flow rate to convert"
        />
      </div>

      <Button onClick={convert} className="w-full">
        <ArrowLeftRight className="h-4 w-4 mr-2" />
        Convert
      </Button>

      {result && (
        <div className="p-4 bg-blue-50 rounded-lg border">
          <div className="text-center">
            <div className="text-lg font-mono">{result}</div>
            <div className="text-sm text-muted-foreground mt-1">
              {flowUnits[toUnit as keyof typeof flowUnits].name}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EnergyConverter() {
  const [value, setValue] = useState("");
  const [fromUnit, setFromUnit] = useState("kJ");
  const [toUnit, setToUnit] = useState("BTU");
  const [result, setResult] = useState("");

  const energyUnits = {
    J: { name: "Joules", factor: 1 },
    kJ: { name: "Kilojoules", factor: 1000 },
    cal: { name: "Calories", factor: 4.184 },
    kcal: { name: "Kilocalories", factor: 4184 },
    BTU: { name: "British Thermal Units", factor: 1055.06 },
    kWh: { name: "Kilowatt Hours", factor: 3600000 },
    therm: { name: "Therms", factor: 105505600 }
  };

  const convert = () => {
    const inputValue = parseFloat(value);
    if (isNaN(inputValue)) {
      setResult("");
      return;
    }

    const fromFactor = energyUnits[fromUnit as keyof typeof energyUnits].factor;
    const toFactor = energyUnits[toUnit as keyof typeof energyUnits].factor;
    const converted = (inputValue * fromFactor) / toFactor;
    setResult(converted.toExponential(6));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="fromUnit">From Unit</Label>
          <Select value={fromUnit} onValueChange={setFromUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(energyUnits).map(([key, unit]) => (
                <SelectItem key={key} value={key}>{unit.name} ({key})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="toUnit">To Unit</Label>
          <Select value={toUnit} onValueChange={setToUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(energyUnits).map(([key, unit]) => (
                <SelectItem key={key} value={key}>{unit.name} ({key})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="value">Energy Value</Label>
        <Input
          id="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyUp={convert}
          placeholder="Enter energy value to convert"
        />
      </div>

      <Button onClick={convert} className="w-full">
        <ArrowLeftRight className="h-4 w-4 mr-2" />
        Convert
      </Button>

      {result && (
        <div className="p-4 bg-blue-50 rounded-lg border">
          <div className="text-center">
            <div className="text-lg font-mono">{result}</div>
            <div className="text-sm text-muted-foreground mt-1">
              {energyUnits[toUnit as keyof typeof energyUnits].name}
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            <p><strong>Formula-based conversion:</strong></p>
            <p>1 kWh = 3.6 MJ = 3412 BTU</p>
            <p>1 cal = 4.184 J (thermochemical calorie)</p>
          </div>
        </div>
      )}
    </div>
  );
}

function PowerConverter() {
  const [value, setValue] = useState("");
  const [fromUnit, setFromUnit] = useState("kW");
  const [toUnit, setToUnit] = useState("HP");
  const [result, setResult] = useState("");

  const powerUnits = {
    W: { name: "Watts", factor: 1 },
    kW: { name: "Kilowatts", factor: 1000 },
    MW: { name: "Megawatts", factor: 1000000 },
    HP: { name: "Horsepower", factor: 745.7 },
    "BTU/h": { name: "BTU per Hour", factor: 0.293071 }
  };

  const convert = () => {
    const inputValue = parseFloat(value);
    if (isNaN(inputValue)) {
      setResult("");
      return;
    }

    const fromFactor = powerUnits[fromUnit as keyof typeof powerUnits].factor;
    const toFactor = powerUnits[toUnit as keyof typeof powerUnits].factor;
    const converted = (inputValue * fromFactor) / toFactor;
    setResult(converted.toExponential(6));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="fromUnit">From Unit</Label>
          <Select value={fromUnit} onValueChange={setFromUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(powerUnits).map(([key, unit]) => (
                <SelectItem key={key} value={key}>{unit.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="toUnit">To Unit</Label>
          <Select value={toUnit} onValueChange={setToUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(powerUnits).map(([key, unit]) => (
                <SelectItem key={key} value={key}>{unit.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="value">Power Value</Label>
        <Input
          id="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyUp={convert}
          placeholder="Enter power value to convert"
        />
      </div>

      <Button onClick={convert} className="w-full">
        <ArrowLeftRight className="h-4 w-4 mr-2" />
        Convert
      </Button>

      {result && (
        <div className="p-4 bg-blue-50 rounded-lg border">
          <div className="text-center">
            <div className="text-lg font-mono">{result}</div>
            <div className="text-sm text-muted-foreground mt-1">
              {powerUnits[toUnit as keyof typeof powerUnits].name}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ElectricalConverter() {
  const [value, setValue] = useState("");
  const [fromUnit, setFromUnit] = useState("V");
  const [toUnit, setToUnit] = useState("kV");
  const [result, setResult] = useState("");
  const [unitType, setUnitType] = useState("voltage");

  const electricalUnits = {
    voltage: {
      V: { name: "Volts", factor: 1 },
      kV: { name: "Kilovolts", factor: 1000 },
      mV: { name: "Millivolts", factor: 0.001 }
    },
    current: {
      A: { name: "Amperes", factor: 1 },
      mA: { name: "Milliamperes", factor: 0.001 }
    },
    resistance: {
      "Ω": { name: "Ohms", factor: 1 },
      "kΩ": { name: "Kiloohms", factor: 1000 }
    }
  };

  const currentUnits = electricalUnits[unitType as keyof typeof electricalUnits];

  const convert = () => {
    const inputValue = parseFloat(value);
    if (isNaN(inputValue)) {
      setResult("");
      return;
    }

    const fromFactor = currentUnits[fromUnit as keyof typeof currentUnits]?.factor || 1;
    const toFactor = currentUnits[toUnit as keyof typeof currentUnits]?.factor || 1;
    const converted = (inputValue * fromFactor) / toFactor;
    setResult(converted.toExponential(6));
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="unitType">Unit Type</Label>
        <Select value={unitType} onValueChange={(value) => {
          setUnitType(value);
          const units = electricalUnits[value as keyof typeof electricalUnits];
          const unitKeys = Object.keys(units);
          setFromUnit(unitKeys[0]);
          setToUnit(unitKeys[1] || unitKeys[0]);
        }}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="voltage">Voltage</SelectItem>
            <SelectItem value="current">Current</SelectItem>
            <SelectItem value="resistance">Resistance</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="fromUnit">From Unit</Label>
          <Select value={fromUnit} onValueChange={setFromUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(currentUnits).map(([key, unit]) => (
                <SelectItem key={key} value={key}>{unit.name} ({key})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="toUnit">To Unit</Label>
          <Select value={toUnit} onValueChange={setToUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(currentUnits).map(([key, unit]) => (
                <SelectItem key={key} value={key}>{unit.name} ({key})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="value">Electrical Value</Label>
        <Input
          id="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyUp={convert}
          placeholder="Enter value to convert"
        />
      </div>

      <Button onClick={convert} className="w-full">
        <ArrowLeftRight className="h-4 w-4 mr-2" />
        Convert
      </Button>

      {result && (
        <div className="p-4 bg-blue-50 rounded-lg border">
          <div className="text-center">
            <div className="text-lg font-mono">{result}</div>
            <div className="text-sm text-muted-foreground mt-1">
              {currentUnits[toUnit as keyof typeof currentUnits]?.name}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VolumeConverter() {
  const [value, setValue] = useState("");
  const [fromUnit, setFromUnit] = useState("L");
  const [toUnit, setToUnit] = useState("gal");
  const [result, setResult] = useState("");
  const [unitType, setUnitType] = useState("volume");

  const conversionUnits = {
    volume: {
      L: { name: "Liters", factor: 1 },
      "m³": { name: "Cubic Meters", factor: 1000 },
      "ft³": { name: "Cubic Feet", factor: 28.3168 },
      gal: { name: "Gallons (US)", factor: 3.78541 }
    },
    density: {
      "kg/m³": { name: "kg/m³", factor: 1 },
      "lb/ft³": { name: "lb/ft³", factor: 16.0185 }
    }
  };

  const currentUnits = conversionUnits[unitType as keyof typeof conversionUnits];

  const convert = () => {
    const inputValue = parseFloat(value);
    if (isNaN(inputValue)) {
      setResult("");
      return;
    }

    const fromFactor = currentUnits[fromUnit as keyof typeof currentUnits]?.factor || 1;
    const toFactor = currentUnits[toUnit as keyof typeof currentUnits]?.factor || 1;
    const converted = (inputValue * fromFactor) / toFactor;
    setResult(converted.toExponential(6));
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="unitType">Unit Type</Label>
        <Select value={unitType} onValueChange={(value) => {
          setUnitType(value);
          const units = conversionUnits[value as keyof typeof conversionUnits];
          const unitKeys = Object.keys(units);
          setFromUnit(unitKeys[0]);
          setToUnit(unitKeys[1] || unitKeys[0]);
        }}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="volume">Volume</SelectItem>
            <SelectItem value="density">Density</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="fromUnit">From Unit</Label>
          <Select value={fromUnit} onValueChange={setFromUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(currentUnits).map(([key, unit]) => (
                <SelectItem key={key} value={key}>{unit.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="toUnit">To Unit</Label>
          <Select value={toUnit} onValueChange={setToUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(currentUnits).map(([key, unit]) => (
                <SelectItem key={key} value={key}>{unit.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="value">Value</Label>
        <Input
          id="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyUp={convert}
          placeholder="Enter value to convert"
        />
      </div>

      <Button onClick={convert} className="w-full">
        <ArrowLeftRight className="h-4 w-4 mr-2" />
        Convert
      </Button>

      {result && (
        <div className="p-4 bg-blue-50 rounded-lg border">
          <div className="text-center">
            <div className="text-lg font-mono">{result}</div>
            <div className="text-sm text-muted-foreground mt-1">
              {currentUnits[toUnit as keyof typeof currentUnits]?.name}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConcentrationConverter() {
  const [value, setValue] = useState("");
  const [fromUnit, setFromUnit] = useState("%");
  const [toUnit, setToUnit] = useState("ppm");
  const [result, setResult] = useState("");

  const concentrationUnits = {
    "%": { name: "Percentage", factor: 1 },
    ppm: { name: "Parts per Million", factor: 0.0001 },
    "mol/L": { name: "Molarity (mol/L)", factor: 1 }
  };

  const convert = () => {
    const inputValue = parseFloat(value);
    if (isNaN(inputValue)) {
      setResult("");
      return;
    }

    let converted = inputValue;
    
    // Special conversions for concentration units
    if (fromUnit === "%" && toUnit === "ppm") {
      converted = inputValue * 10000;
    } else if (fromUnit === "ppm" && toUnit === "%") {
      converted = inputValue / 10000;
    } else if (fromUnit !== toUnit && (fromUnit === "mol/L" || toUnit === "mol/L")) {
      // For mol/L conversions, we need molecular weight which is not provided
      // So we'll use a simple factor conversion
      const fromFactor = concentrationUnits[fromUnit as keyof typeof concentrationUnits].factor;
      const toFactor = concentrationUnits[toUnit as keyof typeof concentrationUnits].factor;
      converted = (inputValue * fromFactor) / toFactor;
    }

    setResult(converted.toExponential(6));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="fromUnit">From Unit</Label>
          <Select value={fromUnit} onValueChange={setFromUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(concentrationUnits).map(([key, unit]) => (
                <SelectItem key={key} value={key}>{unit.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="toUnit">To Unit</Label>
          <Select value={toUnit} onValueChange={setToUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(concentrationUnits).map(([key, unit]) => (
                <SelectItem key={key} value={key}>{unit.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="value">Concentration Value</Label>
        <Input
          id="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyUp={convert}
          placeholder="Enter concentration to convert"
        />
      </div>

      <Button onClick={convert} className="w-full">
        <ArrowLeftRight className="h-4 w-4 mr-2" />
        Convert
      </Button>

      {result && (
        <div className="p-4 bg-blue-50 rounded-lg border">
          <div className="text-center">
            <div className="text-lg font-mono">{result}</div>
            <div className="text-sm text-muted-foreground mt-1">
              {concentrationUnits[toUnit as keyof typeof concentrationUnits].name}
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            <p><strong>Common conversions:</strong></p>
            <p>1% = 10,000 ppm</p>
            <p>mol/L conversions require molecular weight</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Mechanical Design Calculator Components
function ShaftDesignCalculator() {
  const [torque, setTorque] = useState("");
  const [bendingMoment, setBendingMoment] = useState("");
  const [allowableStress, setAllowableStress] = useState("80"); // MPa for steel
  const [safetyFactor, setSafetyFactor] = useState("2");
  const [result, setResult] = useState<{ diameter: number; designStress: number } | null>(null);

  const calculate = () => {
    const T = parseFloat(torque) * 1000; // Convert kN·m to N·m
    const M = parseFloat(bendingMoment) * 1000; // Convert kN·m to N·m
    const σ_allow = parseFloat(allowableStress) * 1e6; // Convert MPa to Pa
    const SF = parseFloat(safetyFactor);

    if (isNaN(T) || isNaN(M) || isNaN(σ_allow) || isNaN(SF)) {
      setResult(null);
      return;
    }

    // Design stress with safety factor
    const σ_design = σ_allow / SF;

    // Equivalent moment using ASME code
    const M_eq = Math.sqrt(M * M + 0.75 * T * T);

    // Minimum diameter from bending equation: σ = 32M/(πd³)
    const d = Math.pow((32 * M_eq) / (Math.PI * σ_design), 1/3);

    setResult({
      diameter: d * 1000, // Convert to mm
      designStress: σ_design / 1e6 // Convert back to MPa
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="torque">Applied Torque (kN·m)</Label>
          <Input
            id="torque"
            value={torque}
            onChange={(e) => setTorque(e.target.value)}
            placeholder="10"
          />
        </div>
        <div>
          <Label htmlFor="bendingMoment">Bending Moment (kN·m)</Label>
          <Input
            id="bendingMoment"
            value={bendingMoment}
            onChange={(e) => setBendingMoment(e.target.value)}
            placeholder="5"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="allowableStress">Allowable Stress (MPa)</Label>
          <Input
            id="allowableStress"
            value={allowableStress}
            onChange={(e) => setAllowableStress(e.target.value)}
            placeholder="80"
          />
        </div>
        <div>
          <Label htmlFor="safetyFactor">Safety Factor</Label>
          <Input
            id="safetyFactor"
            value={safetyFactor}
            onChange={(e) => setSafetyFactor(e.target.value)}
            placeholder="2"
          />
        </div>
      </div>

      <Button onClick={calculate} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Shaft Diameter
      </Button>

      {result && (
        <div className="p-4 bg-blue-50 rounded-lg border">
          <h4 className="font-semibold mb-2">Design Results</h4>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Minimum Diameter:</span>
              <span className="font-mono">{result.diameter.toFixed(1)} mm</span>
            </div>
            <div className="flex justify-between">
              <span>Design Stress:</span>
              <span className="font-mono">{result.designStress.toFixed(1)} MPa</span>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            <p><strong>Formula:</strong> d = ∛(32M_eq/(πσ_design))</p>
            <p><strong>Equivalent Moment:</strong> M_eq = √(M² + 0.75T²)</p>
          </div>
        </div>
      )}
    </div>
  );
}

function KeywayCalculator() {
  const [shaftDiameter, setShaftDiameter] = useState("");
  const [torque, setTorque] = useState("");
  const [keyMaterial, setKeyMaterial] = useState("steel");
  const [result, setResult] = useState<{ width: number; height: number; length: number; shearStress: number; bearingStress: number } | null>(null);

  const materials = {
    steel: { shearStrength: 200, bearingStrength: 400 }, // MPa
    aluminum: { shearStrength: 120, bearingStrength: 240 },
    brass: { shearStrength: 150, bearingStrength: 300 }
  };

  const calculate = () => {
    const d = parseFloat(shaftDiameter); // mm
    const T = parseFloat(torque) * 1000; // Convert kN·m to N·m
    
    if (isNaN(d) || isNaN(T)) {
      setResult(null);
      return;
    }

    // Standard key proportions (DIN 6885)
    let w, h;
    if (d <= 22) { w = 6; h = 6; }
    else if (d <= 30) { w = 8; h = 7; }
    else if (d <= 38) { w = 10; h = 8; }
    else if (d <= 44) { w = 12; h = 8; }
    else if (d <= 50) { w = 14; h = 9; }
    else if (d <= 58) { w = 16; h = 10; }
    else if (d <= 65) { w = 18; h = 11; }
    else if (d <= 75) { w = 20; h = 12; }
    else { w = 22; h = 14; }

    // Force on key
    const F = (2 * T) / (d / 1000); // N

    // Required length for shear
    const material = materials[keyMaterial as keyof typeof materials];
    const τ_allow = material.shearStrength * 1e6; // Pa
    const σ_bearing_allow = material.bearingStrength * 1e6; // Pa

    const L_shear = F / (w * 1e-3 * τ_allow) * 1000; // mm
    const L_bearing = F / ((h/2) * 1e-3 * σ_bearing_allow) * 1000; // mm
    
    const L = Math.max(L_shear, L_bearing, 1.5 * w); // Minimum 1.5 × width

    // Actual stresses
    const τ_actual = F / (w * L * 1e-6) / 1e6; // MPa
    const σ_bearing_actual = F / ((h/2) * L * 1e-6) / 1e6; // MPa

    setResult({
      width: w,
      height: h,
      length: L,
      shearStress: τ_actual,
      bearingStress: σ_bearing_actual
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="shaftDiameter">Shaft Diameter (mm)</Label>
          <Input
            id="shaftDiameter"
            value={shaftDiameter}
            onChange={(e) => setShaftDiameter(e.target.value)}
            placeholder="50"
          />
        </div>
        <div>
          <Label htmlFor="torque">Torque (kN·m)</Label>
          <Input
            id="torque"
            value={torque}
            onChange={(e) => setTorque(e.target.value)}
            placeholder="2"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="keyMaterial">Key Material</Label>
        <Select value={keyMaterial} onValueChange={setKeyMaterial}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="steel">Steel (τ=200 MPa, σ=400 MPa)</SelectItem>
            <SelectItem value="aluminum">Aluminum (τ=120 MPa, σ=240 MPa)</SelectItem>
            <SelectItem value="brass">Brass (τ=150 MPa, σ=300 MPa)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button onClick={calculate} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Key Dimensions
      </Button>

      {result && (
        <div className="p-4 bg-blue-50 rounded-lg border">
          <h4 className="font-semibold mb-2">Key Dimensions (DIN 6885)</h4>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Width (w):</span>
              <span className="font-mono">{result.width} mm</span>
            </div>
            <div className="flex justify-between">
              <span>Height (h):</span>
              <span className="font-mono">{result.height} mm</span>
            </div>
            <div className="flex justify-between">
              <span>Required Length:</span>
              <span className="font-mono">{result.length.toFixed(1)} mm</span>
            </div>
            <div className="flex justify-between">
              <span>Shear Stress:</span>
              <span className="font-mono">{result.shearStress.toFixed(1)} MPa</span>
            </div>
            <div className="flex justify-between">
              <span>Bearing Stress:</span>
              <span className="font-mono">{result.bearingStress.toFixed(1)} MPa</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GearDesignCalculator() {
  const [inputTorque, setInputTorque] = useState("");
  const [gearRatio, setGearRatio] = useState("");
  const [module, setModule] = useState("2");
  const [pressureAngle, setPressureAngle] = useState("20");
  const [result, setResult] = useState<{ 
    pinionTeeth: number; 
    gearTeeth: number; 
    centerDistance: number; 
    outputTorque: number;
    pinionDiameter: number;
    gearDiameter: number;
  } | null>(null);

  const calculate = () => {
    const T_in = parseFloat(inputTorque); // N·m
    const ratio = parseFloat(gearRatio);
    const m = parseFloat(module); // mm
    const α = parseFloat(pressureAngle); // degrees

    if (isNaN(T_in) || isNaN(ratio) || isNaN(m) || isNaN(α)) {
      setResult(null);
      return;
    }

    // Determine number of teeth (minimum 17 for pinion to avoid undercutting)
    const z1 = Math.max(17, Math.round(17 * Math.sqrt(ratio) / ratio));
    const z2 = Math.round(z1 * ratio);
    
    // Recalculate actual ratio
    const actualRatio = z2 / z1;
    
    // Calculate diameters
    const d1 = z1 * m; // Pinion pitch diameter
    const d2 = z2 * m; // Gear pitch diameter
    
    // Center distance
    const C = (d1 + d2) / 2;
    
    // Output torque
    const T_out = T_in * actualRatio;

    setResult({
      pinionTeeth: z1,
      gearTeeth: z2,
      centerDistance: C,
      outputTorque: T_out,
      pinionDiameter: d1,
      gearDiameter: d2
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="inputTorque">Input Torque (N·m)</Label>
          <Input
            id="inputTorque"
            value={inputTorque}
            onChange={(e) => setInputTorque(e.target.value)}
            placeholder="100"
          />
        </div>
        <div>
          <Label htmlFor="gearRatio">Gear Ratio</Label>
          <Input
            id="gearRatio"
            value={gearRatio}
            onChange={(e) => setGearRatio(e.target.value)}
            placeholder="3"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="module">Module (mm)</Label>
          <Input
            id="module"
            value={module}
            onChange={(e) => setModule(e.target.value)}
            placeholder="2"
          />
        </div>
        <div>
          <Label htmlFor="pressureAngle">Pressure Angle (°)</Label>
          <Input
            id="pressureAngle"
            value={pressureAngle}
            onChange={(e) => setPressureAngle(e.target.value)}
            placeholder="20"
          />
        </div>
      </div>

      <Button onClick={calculate} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Gear Parameters
      </Button>

      {result && (
        <div className="p-4 bg-blue-50 rounded-lg border">
          <h4 className="font-semibold mb-2">Gear Design Results</h4>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Pinion Teeth:</span>
              <span className="font-mono">{result.pinionTeeth}</span>
            </div>
            <div className="flex justify-between">
              <span>Gear Teeth:</span>
              <span className="font-mono">{result.gearTeeth}</span>
            </div>
            <div className="flex justify-between">
              <span>Pinion Diameter:</span>
              <span className="font-mono">{result.pinionDiameter.toFixed(1)} mm</span>
            </div>
            <div className="flex justify-between">
              <span>Gear Diameter:</span>
              <span className="font-mono">{result.gearDiameter.toFixed(1)} mm</span>
            </div>
            <div className="flex justify-between">
              <span>Center Distance:</span>
              <span className="font-mono">{result.centerDistance.toFixed(1)} mm</span>
            </div>
            <div className="flex justify-between">
              <span>Output Torque:</span>
              <span className="font-mono">{result.outputTorque.toFixed(1)} N·m</span>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            <p><strong>Formulas:</strong> d = m × z, C = (d₁ + d₂)/2</p>
            <p><strong>Actual Ratio:</strong> {(result.gearTeeth / result.pinionTeeth).toFixed(2)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function BoltTorqueCalculator() {
  const [threadSize, setThreadSize] = useState("M10");
  const [threadPitch, setThreadPitch] = useState("1.5");
  const [frictionCoeff, setFrictionCoeff] = useState("0.15");
  const [preload, setPreload] = useState("");
  const [result, setResult] = useState<{ torque: number; clampForce: number; tensileStress: number } | null>(null);

  const standardThreads = {
    "M6": { pitch: 1.0, diameter: 6, tensileArea: 20.1 },
    "M8": { pitch: 1.25, diameter: 8, tensileArea: 36.6 },
    "M10": { pitch: 1.5, diameter: 10, tensileArea: 58.0 },
    "M12": { pitch: 1.75, diameter: 12, tensileArea: 84.3 },
    "M16": { pitch: 2.0, diameter: 16, tensileArea: 157 },
    "M20": { pitch: 2.5, diameter: 20, tensileArea: 245 }
  };

  const calculate = () => {
    const thread = standardThreads[threadSize as keyof typeof standardThreads];
    const μ = parseFloat(frictionCoeff);
    const F_preload = parseFloat(preload) * 1000; // Convert kN to N
    const p = parseFloat(threadPitch);

    if (isNaN(μ) || isNaN(F_preload) || isNaN(p)) {
      setResult(null);
      return;
    }

    const d = thread.diameter; // mm
    const A_tensile = thread.tensileArea; // mm²

    // Torque calculation: T = F × (μd/2 + p/(2π))
    const T = F_preload * (μ * d / 2000 + p / (2 * Math.PI * 1000)); // N·m

    // Tensile stress in bolt
    const σ_tensile = F_preload / A_tensile; // MPa

    setResult({
      torque: T,
      clampForce: F_preload / 1000, // kN
      tensileStress: σ_tensile
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="threadSize">Thread Size</Label>
          <Select value={threadSize} onValueChange={setThreadSize}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="M6">M6 × 1.0</SelectItem>
              <SelectItem value="M8">M8 × 1.25</SelectItem>
              <SelectItem value="M10">M10 × 1.5</SelectItem>
              <SelectItem value="M12">M12 × 1.75</SelectItem>
              <SelectItem value="M16">M16 × 2.0</SelectItem>
              <SelectItem value="M20">M20 × 2.5</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="frictionCoeff">Friction Coefficient</Label>
          <Input
            id="frictionCoeff"
            value={frictionCoeff}
            onChange={(e) => setFrictionCoeff(e.target.value)}
            placeholder="0.15"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="preload">Desired Preload (kN)</Label>
        <Input
          id="preload"
          value={preload}
          onChange={(e) => setPreload(e.target.value)}
          placeholder="10"
        />
      </div>

      <Button onClick={calculate} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Required Torque
      </Button>

      {result && (
        <div className="p-4 bg-blue-50 rounded-lg border">
          <h4 className="font-semibold mb-2">Torque & Preload Results</h4>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Required Torque:</span>
              <span className="font-mono">{result.torque.toFixed(1)} N·m</span>
            </div>
            <div className="flex justify-between">
              <span>Clamp Force:</span>
              <span className="font-mono">{result.clampForce.toFixed(1)} kN</span>
            </div>
            <div className="flex justify-between">
              <span>Tensile Stress:</span>
              <span className="font-mono">{result.tensileStress.toFixed(1)} MPa</span>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            <p><strong>Formula:</strong> T = F(μd/2 + p/2π)</p>
            <p><strong>Note:</strong> For dry threads; use 0.10-0.20 friction coefficient</p>
          </div>
        </div>
      )}
    </div>
  );
}

function BearingLifeCalculator() {
  const [dynamicLoad, setDynamicLoad] = useState("");
  const [radialLoad, setRadialLoad] = useState("");
  const [axialLoad, setAxialLoad] = useState("0");
  const [speed, setSpeed] = useState("");
  const [bearingType, setBearingType] = useState("ball");
  const [result, setResult] = useState<{ L10: number; L10h: number; equivalentLoad: number } | null>(null);

  const calculate = () => {
    const C = parseFloat(dynamicLoad) * 1000; // Convert kN to N
    const Fr = parseFloat(radialLoad) * 1000; // Convert kN to N
    const Fa = parseFloat(axialLoad) * 1000; // Convert kN to N
    const n = parseFloat(speed); // rpm

    if (isNaN(C) || isNaN(Fr) || isNaN(n)) {
      setResult(null);
      return;
    }

    // Life exponent
    const p = bearingType === "ball" ? 3 : 10/3; // 3 for ball bearings, 10/3 for roller

    // Equivalent dynamic load (simplified)
    const X = 1; // Radial factor (simplified)
    const Y = bearingType === "ball" ? 0.7 : 1.5; // Axial factor
    const P = Math.max(Fr, X * Fr + Y * Fa);

    // L10 life in millions of revolutions
    const L10_rev = Math.pow(C / P, p);

    // L10 life in hours
    const L10_hours = (L10_rev * 1e6) / (n * 60);

    setResult({
      L10: L10_rev,
      L10h: L10_hours,
      equivalentLoad: P / 1000 // Convert back to kN
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="dynamicLoad">Dynamic Load Rating C (kN)</Label>
          <Input
            id="dynamicLoad"
            value={dynamicLoad}
            onChange={(e) => setDynamicLoad(e.target.value)}
            placeholder="25"
          />
        </div>
        <div>
          <Label htmlFor="speed">Speed (rpm)</Label>
          <Input
            id="speed"
            value={speed}
            onChange={(e) => setSpeed(e.target.value)}
            placeholder="1000"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="radialLoad">Radial Load (kN)</Label>
          <Input
            id="radialLoad"
            value={radialLoad}
            onChange={(e) => setRadialLoad(e.target.value)}
            placeholder="10"
          />
        </div>
        <div>
          <Label htmlFor="axialLoad">Axial Load (kN)</Label>
          <Input
            id="axialLoad"
            value={axialLoad}
            onChange={(e) => setAxialLoad(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="bearingType">Bearing Type</Label>
        <Select value={bearingType} onValueChange={setBearingType}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ball">Ball Bearing (p=3)</SelectItem>
            <SelectItem value="roller">Roller Bearing (p=10/3)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button onClick={calculate} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Bearing Life
      </Button>

      {result && (
        <div className="p-4 bg-blue-50 rounded-lg border">
          <h4 className="font-semibold mb-2">Bearing Life Analysis</h4>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Equivalent Load:</span>
              <span className="font-mono">{result.equivalentLoad.toFixed(1)} kN</span>
            </div>
            <div className="flex justify-between">
              <span>L10 Life (million rev):</span>
              <span className="font-mono">{result.L10.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span>L10 Life (hours):</span>
              <span className="font-mono">{result.L10h.toFixed(0)} h</span>
            </div>
            <div className="flex justify-between">
              <span>L10 Life (years @ 8760h):</span>
              <span className="font-mono">{(result.L10h / 8760).toFixed(1)} years</span>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            <p><strong>Formula:</strong> L10 = (C/P)^p</p>
            <p><strong>Note:</strong> 90% of bearings will exceed this life</p>
          </div>
        </div>
      )}
    </div>
  );
}

function SpringDesignCalculator() {
  const [wireDiameter, setWireDiameter] = useState("");
  const [springDiameter, setSpringDiameter] = useState("");
  const [totalCoils, setTotalCoils] = useState("");
  const [load, setLoad] = useState("");
  const [springModulus, setSpringModulus] = useState("80000"); // MPa for steel
  const [result, setResult] = useState<{ 
    springRate: number; 
    deflection: number; 
    shearStress: number; 
    activeCoils: number;
    springIndex: number;
  } | null>(null);

  const calculate = () => {
    const d = parseFloat(wireeDiameter); // mm
    const D = parseFloat(springDiameter); // mm
    const Nt = parseFloat(totalCoils);
    const F = parseFloat(load); // N
    const G = parseFloat(springModulus) * 1e6; // Pa

    if (isNaN(d) || isNaN(D) || isNaN(Nt) || isNaN(F) || isNaN(G)) {
      setResult(null);
      return;
    }

    // Spring calculations
    const Na = Nt - 2; // Active coils (assuming closed ends)
    const C = D / d; // Spring index
    const K = (G * Math.pow(d, 4)) / (8 * Math.pow(D, 3) * Na); // Spring rate N/mm
    
    // Deflection
    const δ = F / K; // mm
    
    // Wahl correction factor
    const Kw = (4 * C - 1) / (4 * C - 4) + 0.615 / C;
    
    // Shear stress
    const τ = Kw * (8 * F * D) / (Math.PI * Math.pow(d, 3)) / 1e6; // MPa

    setResult({
      springRate: K,
      deflection: δ,
      shearStress: τ,
      activeCoils: Na,
      springIndex: C
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="wireDiameter">Wire Diameter (mm)</Label>
          <Input
            id="wireDiameter"
            value={wireDiameter}
            onChange={(e) => setWireDiameter(e.target.value)}
            placeholder="2"
          />
        </div>
        <div>
          <Label htmlFor="springDiameter">Mean Spring Diameter (mm)</Label>
          <Input
            id="springDiameter"
            value={springDiameter}
            onChange={(e) => setSpringDiameter(e.target.value)}
            placeholder="20"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="totalCoils">Total Coils</Label>
          <Input
            id="totalCoils"
            value={totalCoils}
            onChange={(e) => setTotalCoils(e.target.value)}
            placeholder="10"
          />
        </div>
        <div>
          <Label htmlFor="load">Applied Load (N)</Label>
          <Input
            id="load"
            value={load}
            onChange={(e) => setLoad(e.target.value)}
            placeholder="100"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="springModulus">Shear Modulus (MPa)</Label>
        <Input
          id="springModulus"
          value={springModulus}
          onChange={(e) => setSpringModulus(e.target.value)}
          placeholder="80000"
        />
      </div>

      <Button onClick={calculate} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Spring Properties
      </Button>

      {result && (
        <div className="p-4 bg-blue-50 rounded-lg border">
          <h4 className="font-semibold mb-2">Spring Design Results</h4>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Spring Rate:</span>
              <span className="font-mono">{result.springRate.toFixed(2)} N/mm</span>
            </div>
            <div className="flex justify-between">
              <span>Deflection:</span>
              <span className="font-mono">{result.deflection.toFixed(2)} mm</span>
            </div>
            <div className="flex justify-between">
              <span>Shear Stress:</span>
              <span className="font-mono">{result.shearStress.toFixed(1)} MPa</span>
            </div>
            <div className="flex justify-between">
              <span>Active Coils:</span>
              <span className="font-mono">{result.activeCoils}</span>
            </div>
            <div className="flex justify-between">
              <span>Spring Index:</span>
              <span className="font-mono">{result.springIndex.toFixed(1)}</span>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            <p><strong>Formula:</strong> K = Gd⁴/(8D³Na)</p>
            <p><strong>Recommended:</strong> Spring index C = 4-12 for good design</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ToleranceFitCalculator() {
  const [nominalDiameter, setNominalDiameter] = useState("");
  const [holeClass, setHoleClass] = useState("H7");
  const [shaftClass, setShaftClass] = useState("g6");
  const [result, setResult] = useState<{ 
    fitType: string;
    maxClearance: number;
    minClearance: number;
    holeTolerances: { upper: number; lower: number };
    shaftTolerances: { upper: number; lower: number };
  } | null>(null);

  const toleranceData = {
    H7: { IT: 25, deviation: 0 }, // Microns for 30-50mm range
    g6: { IT: 16, deviation: -9 },
    h6: { IT: 16, deviation: 0 },
    f7: { IT: 25, deviation: -25 },
    H8: { IT: 39, deviation: 0 },
    s6: { IT: 16, deviation: 35 }
  };

  const calculate = () => {
    const D = parseFloat(nominalDiameter);
    
    if (isNaN(D)) {
      setResult(null);
      return;
    }

    const hole = toleranceData[holeClass as keyof typeof toleranceData];
    const shaft = toleranceData[shaftClass as keyof typeof toleranceData];

    if (!hole || !shaft) {
      setResult(null);
      return;
    }

    // Calculate tolerances
    const holeUpper = hole.deviation + hole.IT;
    const holeLower = hole.deviation;
    const shaftUpper = shaft.deviation;
    const shaftLower = shaft.deviation - shaft.IT;

    // Calculate clearances/interferences
    const maxClearance = holeUpper - shaftLower;
    const minClearance = holeLower - shaftUpper;

    let fitType = "Clearance Fit";
    if (minClearance < 0 && maxClearance > 0) fitType = "Transition Fit";
    else if (maxClearance < 0) fitType = "Interference Fit";

    setResult({
      fitType,
      maxClearance,
      minClearance,
      holeTolerances: { upper: holeUpper, lower: holeLower },
      shaftTolerances: { upper: shaftUpper, lower: shaftLower }
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="nominalDiameter">Nominal Diameter (mm)</Label>
        <Input
          id="nominalDiameter"
          value={nominalDiameter}
          onChange={(e) => setNominalDiameter(e.target.value)}
          placeholder="40"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="holeClass">Hole Tolerance Class</Label>
          <Select value={holeClass} onValueChange={setHoleClass}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="H7">H7 (Standard hole)</SelectItem>
              <SelectItem value="H8">H8 (Loose hole)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="shaftClass">Shaft Tolerance Class</Label>
          <Select value={shaftClass} onValueChange={setShaftClass}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="g6">g6 (Close running fit)</SelectItem>
              <SelectItem value="h6">h6 (Sliding fit)</SelectItem>
              <SelectItem value="f7">f7 (Easy running fit)</SelectItem>
              <SelectItem value="s6">s6 (Push fit)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={calculate} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Fit Properties
      </Button>

      {result && (
        <div className="p-4 bg-blue-50 rounded-lg border">
          <h4 className="font-semibold mb-2">ISO Tolerance & Fit Results</h4>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Fit Type:</span>
              <span className="font-mono font-semibold">{result.fitType}</span>
            </div>
            <div className="flex justify-between">
              <span>Max Clearance:</span>
              <span className="font-mono">{result.maxClearance > 0 ? '+' : ''}{result.maxClearance} μm</span>
            </div>
            <div className="flex justify-between">
              <span>Min Clearance:</span>
              <span className="font-mono">{result.minClearance > 0 ? '+' : ''}{result.minClearance} μm</span>
            </div>
            <div className="flex justify-between">
              <span>Hole Tolerance:</span>
              <span className="font-mono">{result.holeTolerances.upper > 0 ? '+' : ''}{result.holeTolerances.upper}/{result.holeTolerances.lower} μm</span>
            </div>
            <div className="flex justify-between">
              <span>Shaft Tolerance:</span>
              <span className="font-mono">{result.shaftTolerances.upper > 0 ? '+' : ''}{result.shaftTolerances.upper}/{result.shaftTolerances.lower} μm</span>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            <p><strong>Standard:</strong> ISO 286-1 tolerance system</p>
            <p><strong>Note:</strong> Values approximate for 30-50mm diameter range</p>
          </div>
        </div>
      )}
    </div>
  );
}

function MomentInertiaCalculator() {
  const [sectionType, setSectionType] = useState("rectangular");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [diameter, setDiameter] = useState("");
  const [webThickness, setWebThickness] = useState("");
  const [flangeThickness, setFlangeThickness] = useState("");
  const [result, setResult] = useState<{ 
    area: number; 
    Ixx: number; 
    Iyy: number; 
    Sxx: number; 
    Syy: number; 
  } | null>(null);

  const calculate = () => {
    let A, Ixx, Iyy, Sxx, Syy;

    if (sectionType === "rectangular") {
      const b = parseFloat(width); // mm
      const h = parseFloat(height); // mm
      
      if (isNaN(b) || isNaN(h)) {
        setResult(null);
        return;
      }
      
      A = b * h;
      Ixx = (b * Math.pow(h, 3)) / 12;
      Iyy = (h * Math.pow(b, 3)) / 12;
      Sxx = Ixx / (h / 2);
      Syy = Iyy / (b / 2);
      
    } else if (sectionType === "circular") {
      const d = parseFloat(diameter); // mm
      
      if (isNaN(d)) {
        setResult(null);
        return;
      }
      
      A = (Math.PI * Math.pow(d, 2)) / 4;
      Ixx = (Math.PI * Math.pow(d, 4)) / 64;
      Iyy = Ixx; // Symmetric
      Sxx = Ixx / (d / 2);
      Syy = Sxx;
      
    } else if (sectionType === "ibeam") {
      const b = parseFloat(width); // mm (flange width)
      const h = parseFloat(height); // mm (total height)
      const tw = parseFloat(webThickness); // mm
      const tf = parseFloat(flangeThickness); // mm
      
      if (isNaN(b) || isNaN(h) || isNaN(tw) || isNaN(tf)) {
        setResult(null);
        return;
      }
      
      // Simplified I-beam calculation
      A = 2 * b * tf + (h - 2 * tf) * tw;
      
      // Moment of inertia about x-axis (strong axis)
      const I_flange = 2 * ((b * Math.pow(tf, 3)) / 12 + b * tf * Math.pow((h - tf) / 2, 2));
      const I_web = (tw * Math.pow(h - 2 * tf, 3)) / 12;
      Ixx = I_flange + I_web;
      
      // Moment of inertia about y-axis (weak axis)
      Iyy = 2 * (tf * Math.pow(b, 3)) / 12 + ((h - 2 * tf) * Math.pow(tw, 3)) / 12;
      
      Sxx = Ixx / (h / 2);
      Syy = Iyy / (b / 2);
    } else {
      setResult(null);
      return;
    }

    setResult({
      area: A,
      Ixx: Ixx,
      Iyy: Iyy,
      Sxx: Sxx,
      Syy: Syy
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="sectionType">Cross-Section Type</Label>
        <Select value={sectionType} onValueChange={setSectionType}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rectangular">Rectangular</SelectItem>
            <SelectItem value="circular">Circular</SelectItem>
            <SelectItem value="ibeam">I-Beam</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {sectionType === "rectangular" && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="width">Width (mm)</Label>
            <Input
              id="width"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              placeholder="50"
            />
          </div>
          <div>
            <Label htmlFor="height">Height (mm)</Label>
            <Input
              id="height"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="100"
            />
          </div>
        </div>
      )}

      {sectionType === "circular" && (
        <div>
          <Label htmlFor="diameter">Diameter (mm)</Label>
          <Input
            id="diameter"
            value={diameter}
            onChange={(e) => setDiameter(e.target.value)}
            placeholder="50"
          />
        </div>
      )}

      {sectionType === "ibeam" && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="width">Flange Width (mm)</Label>
            <Input
              id="width"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              placeholder="100"
            />
          </div>
          <div>
            <Label htmlFor="height">Total Height (mm)</Label>
            <Input
              id="height"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="200"
            />
          </div>
          <div>
            <Label htmlFor="webThickness">Web Thickness (mm)</Label>
            <Input
              id="webThickness"
              value={webThickness}
              onChange={(e) => setWebThickness(e.target.value)}
              placeholder="8"
            />
          </div>
          <div>
            <Label htmlFor="flangeThickness">Flange Thickness (mm)</Label>
            <Input
              id="flangeThickness"
              value={flangeThickness}
              onChange={(e) => setFlangeThickness(e.target.value)}
              placeholder="12"
            />
          </div>
        </div>
      )}

      <Button onClick={calculate} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Section Properties
      </Button>

      {result && (
        <div className="p-4 bg-blue-50 rounded-lg border">
          <h4 className="font-semibold mb-2">Section Properties</h4>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Area:</span>
              <span className="font-mono">{result.area.toFixed(1)} mm²</span>
            </div>
            <div className="flex justify-between">
              <span>Ixx (Strong):</span>
              <span className="font-mono">{(result.Ixx / 1e6).toFixed(2)} cm⁴</span>
            </div>
            <div className="flex justify-between">
              <span>Iyy (Weak):</span>
              <span className="font-mono">{(result.Iyy / 1e6).toFixed(2)} cm⁴</span>
            </div>
            <div className="flex justify-between">
              <span>Sxx:</span>
              <span className="font-mono">{(result.Sxx / 1000).toFixed(2)} cm³</span>
            </div>
            <div className="flex justify-between">
              <span>Syy:</span>
              <span className="font-mono">{(result.Syy / 1000).toFixed(2)} cm³</span>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            <p><strong>Formulas:</strong> Rectangle: I = bh³/12, Circle: I = πd⁴/64</p>
            <p><strong>Section Modulus:</strong> S = I/c (where c = distance to extreme fiber)</p>
          </div>
        </div>
      )}
    </div>
  );
}

function FactorSafetyCalculator() {
  const [appliedStress, setAppliedStress] = useState("");
  const [allowableStress, setAllowableStress] = useState("");
  const [yieldStrength, setYieldStrength] = useState("");
  const [ultimateStrength, setUltimateStrength] = useState("");
  const [result, setResult] = useState<{ 
    safetyFactorAllowable: number;
    safetyFactorYield: number;
    safetyFactorUltimate: number;
    designMargin: number;
    status: string;
  } | null>(null);

  const calculate = () => {
    const σ_applied = parseFloat(appliedStress); // MPa
    const σ_allowable = parseFloat(allowableStress); // MPa
    const σ_yield = parseFloat(yieldStrength); // MPa
    const σ_ultimate = parseFloat(ultimateStrength); // MPa

    if (isNaN(σ_applied)) {
      setResult(null);
      return;
    }

    const SF_allowable = !isNaN(σ_allowable) ? σ_allowable / σ_applied : null;
    const SF_yield = !isNaN(σ_yield) ? σ_yield / σ_applied : null;
    const SF_ultimate = !isNaN(σ_ultimate) ? σ_ultimate / σ_applied : null;

    const designMargin = SF_allowable ? ((SF_allowable - 1) * 100) : 0;

    let status = "Unknown";
    if (SF_allowable) {
      if (SF_allowable > 2) status = "Very Safe";
      else if (SF_allowable > 1.5) status = "Safe";
      else if (SF_allowable > 1.0) status = "Marginal";
      else status = "Unsafe";
    }

    setResult({
      safetyFactorAllowable: SF_allowable || 0,
      safetyFactorYield: SF_yield || 0,
      safetyFactorUltimate: SF_ultimate || 0,
      designMargin,
      status
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="appliedStress">Applied Stress (MPa)</Label>
          <Input
            id="appliedStress"
            value={appliedStress}
            onChange={(e) => setAppliedStress(e.target.value)}
            placeholder="50"
          />
        </div>
        <div>
          <Label htmlFor="allowableStress">Allowable Stress (MPa)</Label>
          <Input
            id="allowableStress"
            value={allowableStress}
            onChange={(e) => setAllowableStress(e.target.value)}
            placeholder="100"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="yieldStrength">Yield Strength (MPa)</Label>
          <Input
            id="yieldStrength"
            value={yieldStrength}
            onChange={(e) => setYieldStrength(e.target.value)}
            placeholder="250"
          />
        </div>
        <div>
          <Label htmlFor="ultimateStrength">Ultimate Strength (MPa)</Label>
          <Input
            id="ultimateStrength"
            value={ultimateStrength}
            onChange={(e) => setUltimateStrength(e.target.value)}
            placeholder="400"
          />
        </div>
      </div>

      <Button onClick={calculate} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        Calculate Safety Factors
      </Button>

      {result && (
        <div className="p-4 bg-blue-50 rounded-lg border">
          <h4 className="font-semibold mb-2">Safety Factor Analysis</h4>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Design Status:</span>
              <span className={`font-mono font-semibold ${
                result.status === 'Very Safe' ? 'text-green-600' :
                result.status === 'Safe' ? 'text-blue-600' :
                result.status === 'Marginal' ? 'text-yellow-600' :
                'text-red-600'
              }`}>{result.status}</span>
            </div>
            {result.safetyFactorAllowable > 0 && (
              <div className="flex justify-between">
                <span>SF (Allowable):</span>
                <span className="font-mono">{result.safetyFactorAllowable.toFixed(2)}</span>
              </div>
            )}
            {result.safetyFactorYield > 0 && (
              <div className="flex justify-between">
                <span>SF (Yield):</span>
                <span className="font-mono">{result.safetyFactorYield.toFixed(2)}</span>
              </div>
            )}
            {result.safetyFactorUltimate > 0 && (
              <div className="flex justify-between">
                <span>SF (Ultimate):</span>
                <span className="font-mono">{result.safetyFactorUltimate.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Design Margin:</span>
              <span className="font-mono">{result.designMargin.toFixed(1)}%</span>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            <p><strong>Formula:</strong> SF = σ_allowable / σ_applied</p>
            <p><strong>Recommended:</strong> SF ≥ 1.5 for static loads, SF ≥ 2.0 for dynamic</p>
          </div>
        </div>
      )}
    </div>
  );
}

function SurfaceFinishChart() {
  const surfaceFinishes = [
    { process: "Rough Turning", ra: "12.5 - 25", application: "Non-critical surfaces, clearance fits" },
    { process: "Fine Turning", ra: "3.2 - 6.3", application: "General machinery, sliding fits" },
    { process: "Grinding", ra: "0.8 - 1.6", application: "Bearing surfaces, close fits" },
    { process: "Fine Grinding", ra: "0.2 - 0.4", application: "Precision bearing races, gages" },
    { process: "Polishing", ra: "0.1 - 0.2", application: "Mirror finish, optical surfaces" },
    { process: "Lapping", ra: "0.05 - 0.1", application: "Precision gages, valve seats" },
    { process: "Milling", ra: "1.6 - 6.3", application: "General machining, structural parts" },
    { process: "Drilling", ra: "1.6 - 3.2", application: "Holes for bolts, pins" },
    { process: "Reaming", ra: "0.8 - 1.6", application: "Precision holes, bearing fits" },
    { process: "Broaching", ra: "0.8 - 3.2", application: "Keyways, splines, internal shapes" },
    { process: "Sand Casting", ra: "12.5 - 25", application: "Rough castings, non-critical" },
    { process: "Die Casting", ra: "1.6 - 3.2", application: "Precision castings, automotive" },
    { process: "Forging", ra: "3.2 - 12.5", application: "Structural components, rough shapes" }
  ];

  const [selectedRa, setSelectedRa] = useState("");
  const [filteredProcesses, setFilteredProcesses] = useState(surfaceFinishes);

  const filterByRa = () => {
    const targetRa = parseFloat(selectedRa);
    if (isNaN(targetRa)) {
      setFilteredProcesses(surfaceFinishes);
      return;
    }

    const filtered = surfaceFinishes.filter(finish => {
      const [min, max] = finish.ra.split(' - ').map(v => parseFloat(v));
      return targetRa >= min && targetRa <= max;
    });

    setFilteredProcesses(filtered);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-end">
        <div className="flex-1">
          <Label htmlFor="raValue">Filter by Ra Value (μm)</Label>
          <Input
            id="raValue"
            value={selectedRa}
            onChange={(e) => setSelectedRa(e.target.value)}
            placeholder="Enter Ra value (e.g., 1.6)"
          />
        </div>
        <Button onClick={filterByRa}>
          <Filter className="h-4 w-4 mr-2" />
          Filter
        </Button>
        <Button variant="outline" onClick={() => {
          setSelectedRa("");
          setFilteredProcesses(surfaceFinishes);
        }}>
          Reset
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="bg-muted px-4 py-2">
          <h4 className="font-semibold">Surface Finish Chart (Ra Values in μm)</h4>
        </div>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left">Manufacturing Process</th>
                <th className="px-4 py-2 text-left">Ra Range (μm)</th>
                <th className="px-4 py-2 text-left">Typical Applications</th>
              </tr>
            </thead>
            <tbody>
              {filteredProcesses.map((finish, index) => (
                <tr key={index} className="border-t hover:bg-muted/25">
                  <td className="px-4 py-2 font-medium">{finish.process}</td>
                  <td className="px-4 py-2 font-mono">{finish.ra}</td>
                  <td className="px-4 py-2 text-sm">{finish.application}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p><strong>Ra (Roughness Average):</strong> Arithmetic mean of surface profile deviations</p>
        <p><strong>Standards:</strong> ISO 1302, ASME B46.1</p>
        <p><strong>Note:</strong> Values are typical ranges; actual results depend on tooling, speeds, and feeds</p>
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
          <TabsList className="grid w-full grid-cols-8">
            <TabsTrigger value="mechanical">Mechanical Design</TabsTrigger>
            <TabsTrigger value="pressure-vessel">Pressure Vessel Design</TabsTrigger>
            <TabsTrigger value="heat-exchanger">Heat Exchanger Design</TabsTrigger>
            <TabsTrigger value="thermal-heaters">Thermal Heaters</TabsTrigger>
            <TabsTrigger value="piping">Piping Design</TabsTrigger>
            <TabsTrigger value="electrical">Electrical Design</TabsTrigger>
            <TabsTrigger value="analysis">Analysis Tools</TabsTrigger>
            <TabsTrigger value="unit-converter">Unit Converter</TabsTrigger>
          </TabsList>

          {/* Mechanical Design Tab */}
          <TabsContent value="mechanical" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Shaft Design Calculator</CardTitle>
                    <CardDescription>
                      Calculate minimum shaft diameter based on loads and stress
                    </CardDescription>
                  </div>
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Torque, bending moment, and allowable stress analysis
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
                        <DialogTitle>Shaft Design Calculator</DialogTitle>
                      </DialogHeader>
                      <ShaftDesignCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Key and Keyway Sizing Tool</CardTitle>
                    <CardDescription>
                      Determine key dimensions and check strength
                    </CardDescription>
                  </div>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Shear and bearing strength calculations
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
                        <DialogTitle>Key and Keyway Sizing Tool</DialogTitle>
                      </DialogHeader>
                      <KeywayCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Gear Design Calculator</CardTitle>
                    <CardDescription>
                      Calculate gear parameters and output torque
                    </CardDescription>
                  </div>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Module, teeth count, center distance calculations
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
                        <DialogTitle>Gear Design Calculator</DialogTitle>
                      </DialogHeader>
                      <GearDesignCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Bolt Torque & Preload Calculator</CardTitle>
                    <CardDescription>
                      Calculate required torque for desired preload
                    </CardDescription>
                  </div>
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Thread size and friction coefficient analysis
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
                        <DialogTitle>Bolt Torque & Preload Calculator</DialogTitle>
                      </DialogHeader>
                      <BoltTorqueCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Bearing Life Estimator</CardTitle>
                    <CardDescription>
                      Calculate L10 bearing life and load capacity
                    </CardDescription>
                  </div>
                  <CircuitBoard className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Dynamic load and equivalent radial load analysis
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
                        <DialogTitle>Bearing Life Estimator</DialogTitle>
                      </DialogHeader>
                      <BearingLifeCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Spring Design Calculator</CardTitle>
                    <CardDescription>
                      Design compression springs with stress analysis
                    </CardDescription>
                  </div>
                  <Waves className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Spring rate, shear stress, and coil calculations
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
                        <DialogTitle>Spring Design Calculator</DialogTitle>
                      </DialogHeader>
                      <SpringDesignCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Tolerance & Fit Calculator</CardTitle>
                    <CardDescription>
                      ISO fit recommendations and clearance calculations
                    </CardDescription>
                  </div>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    H7/g6 fits and interference/clearance analysis
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
                        <DialogTitle>Tolerance & Fit Calculator</DialogTitle>
                      </DialogHeader>
                      <ToleranceFitCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Moment of Inertia & Section Modulus</CardTitle>
                    <CardDescription>
                      Calculate properties for standard cross-sections
                    </CardDescription>
                  </div>
                  <Square className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Rectangular, circular, and I-beam sections
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
                        <DialogTitle>Moment of Inertia & Section Modulus Calculator</DialogTitle>
                      </DialogHeader>
                      <MomentInertiaCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Factor of Safety Calculator</CardTitle>
                    <CardDescription>
                      Compare applied stress to allowable stress
                    </CardDescription>
                  </div>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Safety margin and stress ratio calculations
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
                        <DialogTitle>Factor of Safety Calculator</DialogTitle>
                      </DialogHeader>
                      <FactorSafetyCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Surface Finish Chart</CardTitle>
                    <CardDescription>
                      Ra values with manufacturing processes
                    </CardDescription>
                  </div>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Manufacturing processes and applications
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Calculator className="h-4 w-4 mr-2" />
                        Open Chart
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Surface Finish Chart</DialogTitle>
                      </DialogHeader>
                      <SurfaceFinishChart />
                    </DialogContent>
                  </Dialog>
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

          {/* Thermal Heaters Tab */}
          <TabsContent value="thermal-heaters" className="space-y-6">
            <div className="text-center mb-6">
              <h3 className="text-lg font-semibold mb-2">Thermal Heater Design Tools</h3>
              <p className="text-muted-foreground">Professional thermal system design and analysis tools</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Helical Coil Pressure Loss Calculator</CardTitle>
                    <CardDescription>
                      Calculate pressure drop for thermal oils in helical coils
                    </CardDescription>
                  </div>
                  <Waves className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Includes Dean number correction for helical curvature effects
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
                        <DialogTitle>Helical Coil Pressure Loss Calculator</DialogTitle>
                      </DialogHeader>
                      <HelicalCoilPressureLossCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Combustion Chamber Pressure Loss Calculator</CardTitle>
                    <CardDescription>
                      Calculate total pressure loss for gases in cylindrical combustion chambers
                    </CardDescription>
                  </div>
                  <Flame className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Includes friction and local losses with Swamee-Jain correlation
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
                        <DialogTitle>Combustion Chamber Pressure Loss Calculator</DialogTitle>
                      </DialogHeader>
                      <CombustionChamberPressureLossCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Expansion Tank Capacity Calculator</CardTitle>
                    <CardDescription>
                      Calculate required expansion tank volume for thermal systems
                    </CardDescription>
                  </div>
                  <Container className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Handles thermal fluid expansion with safety margins and pressure considerations
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
                        <DialogTitle>Expansion Tank Capacity Calculator</DialogTitle>
                      </DialogHeader>
                      <ExpansionTankCapacityCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Chimney Diameter & Height Calculator</CardTitle>
                    <CardDescription>
                      Calculate minimum chimney diameter and height for natural draft
                    </CardDescription>
                  </div>
                  <Factory className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Based on combustion parameters and environmental standards
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
                        <DialogTitle>Chimney Diameter & Height Calculator</DialogTitle>
                      </DialogHeader>
                      <ChimneyDiameterHeightCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Thermal Oil Heater Sizing Calculator</CardTitle>
                    <CardDescription>
                      Calculate heater capacity and thermal oil flow rate
                    </CardDescription>
                  </div>
                  <Thermometer className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Based on heat duty, temperature rise, and oil properties
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
                        <DialogTitle>Thermal Oil Heater Sizing Calculator</DialogTitle>
                      </DialogHeader>
                      <ThermalOilHeaterSizingCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Thermal Oil Pump Sizing Tool</CardTitle>
                    <CardDescription>
                      Calculate flow rate, pump head and power requirements
                    </CardDescription>
                  </div>
                  <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Includes friction head and pump efficiency calculations
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
                        <DialogTitle>Thermal Oil Flow Rate & Pump Sizing Tool</DialogTitle>
                      </DialogHeader>
                      <ThermalOilPumpSizingCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Combustion Air Requirement Calculator</CardTitle>
                    <CardDescription>
                      Calculate required combustion air and blower sizing
                    </CardDescription>
                  </div>
                  <Filter className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Based on fuel type, consumption rate, and excess air percentage
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
                        <DialogTitle>Combustion Air Requirement Calculator</DialogTitle>
                      </DialogHeader>
                      <CombustionAirCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Burner Capacity & Efficiency Estimator</CardTitle>
                    <CardDescription>
                      Calculate burner output and fuel utilization efficiency
                    </CardDescription>
                  </div>
                  <Bolt className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Based on fuel flow rate, GCV, and combustion efficiency
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
                        <DialogTitle>Burner Capacity & Efficiency Estimator</DialogTitle>
                      </DialogHeader>
                      <BurnerCapacityCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Flue Gas Heat Loss Estimator</CardTitle>
                    <CardDescription>
                      Calculate stack losses and heat recovery potential
                    </CardDescription>
                  </div>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Based on flue gas temperature, air/fuel ratio, and fuel type
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
                        <DialogTitle>Flue Gas Temperature & Heat Loss Estimator</DialogTitle>
                      </DialogHeader>
                      <FlueGasHeatLossEstimator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Coil Surface Area Calculator</CardTitle>
                    <CardDescription>
                      Calculate required heating coil surface area
                    </CardDescription>
                  </div>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Based on heat transfer requirements and film coefficients
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
                        <DialogTitle>Coil Surface Area Calculator (for Heaters)</DialogTitle>
                      </DialogHeader>
                      <CoilSurfaceAreaCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Chimney Draft Fan Sizing Tool</CardTitle>
                    <CardDescription>
                      Calculate induced/forced draft fan requirements
                    </CardDescription>
                  </div>
                  <Waves className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Determines fan capacity, pressure, and power requirements
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
                        <DialogTitle>Chimney Draft & Induced Draft Fan Sizing Tool</DialogTitle>
                      </DialogHeader>
                      <ChimneyDraftFanSizingCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Firebox Heat Flux Calculator</CardTitle>
                    <CardDescription>
                      Calculate heat flux distribution on coil walls
                    </CardDescription>
                  </div>
                  <Flame className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Based on fuel rate, flame geometry, and emissivity
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
                        <DialogTitle>Firebox Heat Flux Calculator</DialogTitle>
                      </DialogHeader>
                      <FireboxHeatFluxCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Shell & Tube Heat Exchanger Selector</CardTitle>
                    <CardDescription>
                      Select tube size, count, and calculate surface area
                    </CardDescription>
                  </div>
                  <Container className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Based on oil and utility specifications with velocity analysis
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
                        <DialogTitle>Shell & Tube Heat Exchanger Selector</DialogTitle>
                      </DialogHeader>
                      <ShellTubeHeatExchangerSelector />
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
              
              {/* Cable Size Calculator */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Cable Size Calculator</CardTitle>
                    <CardDescription>
                      Determine suitable cable cross-section
                    </CardDescription>
                  </div>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Cable Size Calculator</DialogTitle>
                      </DialogHeader>
                      <CableSizeCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Voltage Drop Calculator */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Voltage Drop Calculator</CardTitle>
                    <CardDescription>
                      Calculate voltage drop over cable runs
                    </CardDescription>
                  </div>
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Voltage Drop Calculator</DialogTitle>
                      </DialogHeader>
                      <VoltageDropCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Short Circuit Calculator */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Short Circuit Calculator</CardTitle>
                    <CardDescription>
                      Estimate fault current levels
                    </CardDescription>
                  </div>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Short Circuit Current Calculator</DialogTitle>
                      </DialogHeader>
                      <ShortCircuitCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Circuit Breaker Sizing */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Circuit Breaker Sizing</CardTitle>
                    <CardDescription>
                      Select appropriate MCB/MCCB
                    </CardDescription>
                  </div>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Circuit Breaker Sizing Tool</DialogTitle>
                      </DialogHeader>
                      <CircuitBreakerSizing />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Motor Starter Sizing */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Motor Starter Sizing</CardTitle>
                    <CardDescription>
                      Select contactor, overload & cable
                    </CardDescription>
                  </div>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Motor Starter Sizing Tool</DialogTitle>
                      </DialogHeader>
                      <MotorStarterSizing />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Transformer Sizing */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Transformer Sizing</CardTitle>
                    <CardDescription>
                      Calculate transformer rating
                    </CardDescription>
                  </div>
                  <Square className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Transformer Sizing Calculator</DialogTitle>
                      </DialogHeader>
                      <TransformerSizing />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Earthing Conductor Sizing */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Earthing Conductor Sizing</CardTitle>
                    <CardDescription>
                      Calculate grounding conductor size
                    </CardDescription>
                  </div>
                  <CornerDownRight className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Earthing/Grounding Conductor Sizing Tool</DialogTitle>
                      </DialogHeader>
                      <EarthingConductorSizing />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Power Factor Correction */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Power Factor Correction</CardTitle>
                    <CardDescription>
                      Calculate required kVAR capacity
                    </CardDescription>
                  </div>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Power Factor Correction Calculator</DialogTitle>
                      </DialogHeader>
                      <PowerFactorCorrection />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Energy Consumption Calculator */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Energy Consumption & Cost</CardTitle>
                    <CardDescription>
                      Estimate energy usage and costs
                    </CardDescription>
                  </div>
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Energy Consumption & Cost Estimator</DialogTitle>
                      </DialogHeader>
                      <EnergyConsumptionCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Wire Color Code Reference */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Wire Color Code Reference</CardTitle>
                    <CardDescription>
                      Standard wire color coding
                    </CardDescription>
                  </div>
                  <Palette className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Reference</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Wire Color Code Reference</DialogTitle>
                      </DialogHeader>
                      <WireColorCodeReference />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Cable Tray Fill Calculator */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Cable Tray Fill Calculator</CardTitle>
                    <CardDescription>
                      Check cable tray capacity
                    </CardDescription>
                  </div>
                  <Grid className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Cable Tray Fill Calculator</DialogTitle>
                      </DialogHeader>
                      <CableTrayFillCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Load Balance Checker */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Load Balance Checker</CardTitle>
                    <CardDescription>
                      Analyze 3-phase load balance
                    </CardDescription>
                  </div>
                  <Waves className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Load Balance Checker (3-Phase Systems)</DialogTitle>
                      </DialogHeader>
                      <LoadBalanceChecker />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Lux Level Estimator */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Lux Level Estimator</CardTitle>
                    <CardDescription>
                      Basic lighting design calculations
                    </CardDescription>
                  </div>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Lux Level Estimator (Basic Lighting Design)</DialogTitle>
                      </DialogHeader>
                      <LuxLevelEstimator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

            </div>
          </TabsContent>

          {/* Analysis Tools Tab */}
          <TabsContent value="analysis" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              {/* Mass & Energy Balance Tool */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Mass & Energy Balance</CardTitle>
                    <CardDescription>
                      Component material balance calculations
                    </CardDescription>
                  </div>
                  <Scale className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Mass & Energy Balance Tool</DialogTitle>
                      </DialogHeader>
                      <MassEnergyBalanceCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Pressure Drop Analyzer */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Pressure Drop Analyzer</CardTitle>
                    <CardDescription>
                      Piping system pressure drop analysis
                    </CardDescription>
                  </div>
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Pressure Drop Analyzer</DialogTitle>
                      </DialogHeader>
                      <PressureDropAnalyzer />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Pump Sizing & NPSH Calculator */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Pump Sizing & NPSH</CardTitle>
                    <CardDescription>
                      Centrifugal pump selection & analysis
                    </CardDescription>
                  </div>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Pump Sizing & NPSH Calculator</DialogTitle>
                      </DialogHeader>
                      <PumpSizingCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Control Valve Sizing */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Control Valve Sizing (Cv)</CardTitle>
                    <CardDescription>
                      Flow coefficient calculation
                    </CardDescription>
                  </div>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Control Valve Sizing Tool</DialogTitle>
                      </DialogHeader>
                      <ControlValveSizing />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Flare Load Estimator */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Flare Load Estimator</CardTitle>
                    <CardDescription>
                      Emergency relief system sizing
                    </CardDescription>
                  </div>
                  <Flame className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Flare Load Estimator</DialogTitle>
                      </DialogHeader>
                      <FlareLoadEstimator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Line Sizing Tool */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Line Sizing Tool</CardTitle>
                    <CardDescription>
                      Optimal pipe diameter selection
                    </CardDescription>
                  </div>
                  <Ruler className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Line Sizing Tool</DialogTitle>
                      </DialogHeader>
                      <LineSizingTool />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Two-Phase Flow Analyzer */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Two-Phase Flow Analyzer</CardTitle>
                    <CardDescription>
                      Gas-liquid flow calculations
                    </CardDescription>
                  </div>
                  <Waves className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Two-Phase Flow Analyzer</DialogTitle>
                      </DialogHeader>
                      <TwoPhaseFlowAnalyzer />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Separator Design Checker */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Separator Design Checker</CardTitle>
                    <CardDescription>
                      Gas-liquid separator sizing
                    </CardDescription>
                  </div>
                  <Filter className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Separator Design Checker</DialogTitle>
                      </DialogHeader>
                      <SeparatorDesignChecker />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Fluid Properties Lookup */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Fluid Properties Lookup</CardTitle>
                    <CardDescription>
                      Physical property database
                    </CardDescription>
                  </div>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Fluid Properties Lookup</DialogTitle>
                      </DialogHeader>
                      <FluidPropertiesLookup />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Reynolds Number Calculator */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Reynolds Number Calculator</CardTitle>
                    <CardDescription>
                      Flow regime determination
                    </CardDescription>
                  </div>
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Reynolds Number Calculator</DialogTitle>
                      </DialogHeader>
                      <ReynoldsNumberCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Flash Calculation Tool */}
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Flash Calculation Tool</CardTitle>
                    <CardDescription>
                      Vapor-liquid equilibrium
                    </CardDescription>
                  </div>
                  <Beaker className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">Open Calculator</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Flash Calculation Tool</DialogTitle>
                      </DialogHeader>
                      <FlashCalculationTool />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

            </div>
          </TabsContent>

          {/* Unit Converter Tab */}
          <TabsContent value="unit-converter" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Length & Distance Converter</CardTitle>
                    <CardDescription>
                      Convert between metric and imperial length units
                    </CardDescription>
                  </div>
                  <Ruler className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    mm, cm, m, in, ft, yd, km, mi conversions
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <ArrowLeftRight className="h-4 w-4 mr-2" />
                        Open Converter
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Length & Distance Unit Converter</DialogTitle>
                      </DialogHeader>
                      <LengthConverter />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Mass & Weight Converter</CardTitle>
                    <CardDescription>
                      Convert between metric and imperial mass units
                    </CardDescription>
                  </div>
                  <Scale className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    g, kg, tonne, lb, oz conversions
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <ArrowLeftRight className="h-4 w-4 mr-2" />
                        Open Converter
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Mass & Weight Unit Converter</DialogTitle>
                      </DialogHeader>
                      <MassConverter />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Pressure Converter</CardTitle>
                    <CardDescription>
                      Convert between different pressure units
                    </CardDescription>
                  </div>
                  <Gauge className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Pa, kPa, MPa, bar, atm, psi, mmHg, Torr
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <ArrowLeftRight className="h-4 w-4 mr-2" />
                        Open Converter
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Pressure Unit Converter</DialogTitle>
                      </DialogHeader>
                      <PressureConverter />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Temperature Converter</CardTitle>
                    <CardDescription>
                      Convert between temperature scales with formulas
                    </CardDescription>
                  </div>
                  <Thermometer className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    °C, °F, K, °R with formula-based conversion
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <ArrowLeftRight className="h-4 w-4 mr-2" />
                        Open Converter
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Temperature Unit Converter</DialogTitle>
                      </DialogHeader>
                      <TemperatureConverter />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Flow Rate Converter</CardTitle>
                    <CardDescription>
                      Convert between liquid and gas flow rates
                    </CardDescription>
                  </div>
                  <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    L/s, m³/h, GPM, CFM conversions
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <ArrowLeftRight className="h-4 w-4 mr-2" />
                        Open Converter
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Flow Rate Unit Converter</DialogTitle>
                      </DialogHeader>
                      <FlowRateConverter />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Energy & Heat Converter</CardTitle>
                    <CardDescription>
                      Convert between energy units with formulas
                    </CardDescription>
                  </div>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    J, kJ, cal, kcal, BTU, kWh, therm
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <ArrowLeftRight className="h-4 w-4 mr-2" />
                        Open Converter
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Energy & Heat Unit Converter</DialogTitle>
                      </DialogHeader>
                      <EnergyConverter />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Power Converter</CardTitle>
                    <CardDescription>
                      Convert between mechanical and electrical power
                    </CardDescription>
                  </div>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    W, kW, MW, HP, BTU/h conversions
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <ArrowLeftRight className="h-4 w-4 mr-2" />
                        Open Converter
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Power Unit Converter</DialogTitle>
                      </DialogHeader>
                      <PowerConverter />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Electrical Converter</CardTitle>
                    <CardDescription>
                      Convert between electrical units
                    </CardDescription>
                  </div>
                  <Bolt className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    V, kV, mV, A, mA, Ω, kΩ conversions
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <ArrowLeftRight className="h-4 w-4 mr-2" />
                        Open Converter
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Electrical Unit Converter</DialogTitle>
                      </DialogHeader>
                      <ElectricalConverter />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Volume & Density Converter</CardTitle>
                    <CardDescription>
                      Convert between volume and density units
                    </CardDescription>
                  </div>
                  <Container className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    L, m³, ft³, gal, kg/m³, lb/ft³
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <ArrowLeftRight className="h-4 w-4 mr-2" />
                        Open Converter
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Volume & Density Unit Converter</DialogTitle>
                      </DialogHeader>
                      <VolumeConverter />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Concentration Converter</CardTitle>
                    <CardDescription>
                      Convert between concentration units
                    </CardDescription>
                  </div>
                  <Beaker className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    %, ppm, mol/L conversions
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <ArrowLeftRight className="h-4 w-4 mr-2" />
                        Open Converter
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Concentration Unit Converter</DialogTitle>
                      </DialogHeader>
                      <ConcentrationConverter />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

            </div>
          </TabsContent>


        </Tabs>
      </div>
    </Layout>
  );
}

// Mass & Energy Balance Calculator
function MassEnergyBalanceCalculator() {
  const [inputFlow, setInputFlow] = useState("");
  const [inputComposition, setInputComposition] = useState("");
  const [outputFlow1, setOutputFlow1] = useState("");
  const [outputFlow2, setOutputFlow2] = useState("");
  const [result, setResult] = useState<{ balanced: boolean; deficit: number; excess: number } | null>(null);

  const calculateBalance = () => {
    const input = parseFloat(inputFlow);
    const output1 = parseFloat(outputFlow1);
    const output2 = parseFloat(outputFlow2);

    if (isNaN(input) || isNaN(output1) || isNaN(output2)) {
      setResult(null);
      return;
    }

    const totalOutput = output1 + output2;
    const difference = input - totalOutput;
    const balanced = Math.abs(difference) < 0.01;

    setResult({
      balanced,
      deficit: difference < 0 ? Math.abs(difference) : 0,
      excess: difference > 0 ? difference : 0
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="inputFlow">Input Flow (kg/h)</Label>
          <Input
            id="inputFlow"
            value={inputFlow}
            onChange={(e) => setInputFlow(e.target.value)}
            placeholder="1000"
          />
        </div>
        <div>
          <Label htmlFor="inputComposition">Input Composition (%)</Label>
          <Input
            id="inputComposition"
            value={inputComposition}
            onChange={(e) => setInputComposition(e.target.value)}
            placeholder="95"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="output1">Output Stream 1 (kg/h)</Label>
          <Input
            id="output1"
            value={outputFlow1}
            onChange={(e) => setOutputFlow1(e.target.value)}
            placeholder="600"
          />
        </div>
        <div>
          <Label htmlFor="output2">Output Stream 2 (kg/h)</Label>
          <Input
            id="output2"
            value={outputFlow2}
            onChange={(e) => setOutputFlow2(e.target.value)}
            placeholder="400"
          />
        </div>
      </div>

      <Button onClick={calculateBalance} className="w-full">
        Calculate Mass Balance
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Mass Balance Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Balance Status:</span>
              <span className={`font-mono ${result.balanced ? 'text-green-600' : 'text-red-600'}`}>
                {result.balanced ? '✓ Balanced' : '✗ Unbalanced'}
              </span>
            </div>
            {result.deficit > 0 && (
              <div className="flex justify-between">
                <span>Deficit:</span>
                <span className="font-mono text-red-600">{result.deficit.toFixed(2)} kg/h</span>
              </div>
            )}
            {result.excess > 0 && (
              <div className="flex justify-between">
                <span>Excess:</span>
                <span className="font-mono text-blue-600">{result.excess.toFixed(2)} kg/h</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Note:</strong> Simplified mass balance for demonstration</p>
        <p>For complex systems, use process simulation software</p>
      </div>
    </div>
  );
}

// Pressure Drop Analyzer
function PressureDropAnalyzer() {
  const [flowRate, setFlowRate] = useState("");
  const [pipeDiameter, setPipeDiameter] = useState("");
  const [pipeLength, setPipeLength] = useState("");
  const [fluidViscosity, setFluidViscosity] = useState("");
  const [fluidDensity, setFluidDensity] = useState("");
  const [result, setResult] = useState<{ pressureDrop: number; velocityHead: number; reynolds: number } | null>(null);

  const calculatePressureDrop = () => {
    const Q = parseFloat(flowRate);
    const D = parseFloat(pipeDiameter) / 1000; // Convert mm to m
    const L = parseFloat(pipeLength);
    const mu = parseFloat(fluidViscosity);
    const rho = parseFloat(fluidDensity);

    if (isNaN(Q) || isNaN(D) || isNaN(L) || isNaN(mu) || isNaN(rho)) {
      setResult(null);
      return;
    }

    const A = Math.PI * Math.pow(D/2, 2);
    const v = Q / A / 3600; // m/s
    const Re = (rho * v * D) / mu;
    
    // Simplified friction factor (Blasius equation for smooth pipes)
    const f = Re > 2300 ? 0.316 * Math.pow(Re, -0.25) : 64 / Re;
    
    const pressureDrop = (f * L * rho * Math.pow(v, 2)) / (2 * D) / 1000; // kPa
    const velocityHead = (rho * Math.pow(v, 2)) / 2000; // kPa

    setResult({
      pressureDrop,
      velocityHead,
      reynolds: Re
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="flowRate">Flow Rate (m³/h)</Label>
          <Input
            id="flowRate"
            value={flowRate}
            onChange={(e) => setFlowRate(e.target.value)}
            placeholder="50"
          />
        </div>
        <div>
          <Label htmlFor="pipeDiameter">Pipe Diameter (mm)</Label>
          <Input
            id="pipeDiameter"
            value={pipeDiameter}
            onChange={(e) => setPipeDiameter(e.target.value)}
            placeholder="150"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="pipeLength">Pipe Length (m)</Label>
          <Input
            id="pipeLength"
            value={pipeLength}
            onChange={(e) => setPipeLength(e.target.value)}
            placeholder="100"
          />
        </div>
        <div>
          <Label htmlFor="fluidViscosity">Viscosity (Pa·s)</Label>
          <Input
            id="fluidViscosity"
            value={fluidViscosity}
            onChange={(e) => setFluidViscosity(e.target.value)}
            placeholder="0.001"
          />
        </div>
        <div>
          <Label htmlFor="fluidDensity">Density (kg/m³)</Label>
          <Input
            id="fluidDensity"
            value={fluidDensity}
            onChange={(e) => setFluidDensity(e.target.value)}
            placeholder="1000"
          />
        </div>
      </div>

      <Button onClick={calculatePressureDrop} className="w-full">
        Calculate Pressure Drop
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Pressure Drop Analysis</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Pressure Drop:</span>
              <span className="font-mono">{result.pressureDrop.toFixed(2)} kPa</span>
            </div>
            <div className="flex justify-between">
              <span>Velocity Head:</span>
              <span className="font-mono">{result.velocityHead.toFixed(2)} kPa</span>
            </div>
            <div className="flex justify-between">
              <span>Reynolds Number:</span>
              <span className="font-mono">{result.reynolds.toFixed(0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Flow Regime:</span>
              <span className={`font-mono ${result.reynolds > 2300 ? 'text-blue-600' : 'text-green-600'}`}>
                {result.reynolds > 2300 ? 'Turbulent' : 'Laminar'}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Method:</strong> Darcy-Weisbach equation with Blasius friction factor</p>
        <p><strong>Note:</strong> For accurate results, consider pipe roughness and fittings</p>
      </div>
    </div>
  );
}

// Pump Sizing Calculator
function PumpSizingCalculator() {
  const [flowRate, setFlowRate] = useState("");
  const [totalHead, setTotalHead] = useState("");
  const [efficiency, setEfficiency] = useState("75");
  const [npshAvailable, setNpshAvailable] = useState("");
  const [result, setResult] = useState<{ power: number; npshRequired: number; specificSpeed: number } | null>(null);

  const calculatePumpSize = () => {
    const Q = parseFloat(flowRate);
    const H = parseFloat(totalHead);
    const eff = parseFloat(efficiency) / 100;
    const npshA = parseFloat(npshAvailable);

    if (isNaN(Q) || isNaN(H) || isNaN(eff) || isNaN(npshA)) {
      setResult(null);
      return;
    }

    const power = (Q * H * 9.81) / (3600 * eff); // kW
    const npshRequired = 0.05 * Math.pow(Q / 3.6, 0.67); // Estimated NPSH required
    const specificSpeed = (Q * Math.sqrt(H)) / Math.pow(H, 0.75);

    setResult({
      power,
      npshRequired,
      specificSpeed
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="flowRate">Flow Rate (m³/h)</Label>
          <Input
            id="flowRate"
            value={flowRate}
            onChange={(e) => setFlowRate(e.target.value)}
            placeholder="100"
          />
        </div>
        <div>
          <Label htmlFor="totalHead">Total Head (m)</Label>
          <Input
            id="totalHead"
            value={totalHead}
            onChange={(e) => setTotalHead(e.target.value)}
            placeholder="30"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="efficiency">Pump Efficiency (%)</Label>
          <Input
            id="efficiency"
            value={efficiency}
            onChange={(e) => setEfficiency(e.target.value)}
            placeholder="75"
          />
        </div>
        <div>
          <Label htmlFor="npshAvailable">NPSH Available (m)</Label>
          <Input
            id="npshAvailable"
            value={npshAvailable}
            onChange={(e) => setNpshAvailable(e.target.value)}
            placeholder="5"
          />
        </div>
      </div>

      <Button onClick={calculatePumpSize} className="w-full">
        Calculate Pump Requirements
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Pump Sizing Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Required Power:</span>
              <span className="font-mono">{result.power.toFixed(2)} kW</span>
            </div>
            <div className="flex justify-between">
              <span>NPSH Required:</span>
              <span className="font-mono">{result.npshRequired.toFixed(2)} m</span>
            </div>
            <div className="flex justify-between">
              <span>Specific Speed:</span>
              <span className="font-mono">{result.specificSpeed.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span>NPSH Margin:</span>
              <span className={`font-mono ${parseFloat(npshAvailable) > result.npshRequired ? 'text-green-600' : 'text-red-600'}`}>
                {(parseFloat(npshAvailable) - result.npshRequired).toFixed(2)} m
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Standard:</strong> Centrifugal pump calculations per API 610</p>
        <p><strong>Note:</strong> Add 10-20% safety margin to calculated power</p>
      </div>
    </div>
  );
}

// Control Valve Sizing
function ControlValveSizing() {
  const [flowRate, setFlowRate] = useState("");
  const [pressureDrop, setPressureDrop] = useState("");
  const [fluidDensity, setFluidDensity] = useState("");
  const [fluidType, setFluidType] = useState("liquid");
  const [result, setResult] = useState<{ cv: number; kvs: number; valveSize: string } | null>(null);

  const calculateCv = () => {
    const Q = parseFloat(flowRate);
    const deltaP = parseFloat(pressureDrop);
    const rho = parseFloat(fluidDensity);

    if (isNaN(Q) || isNaN(deltaP) || isNaN(rho)) {
      setResult(null);
      return;
    }

    let cv;
    if (fluidType === "liquid") {
      cv = Q * Math.sqrt(rho / (1000 * deltaP));
    } else {
      // Gas flow (simplified)
      cv = Q * Math.sqrt(rho / (1.3 * deltaP));
    }

    const kvs = cv * 0.865; // Convert Cv to Kvs
    
    // Estimate valve size based on Cv
    let valveSize = "DN15";
    if (cv > 100) valveSize = "DN150";
    else if (cv > 50) valveSize = "DN100";
    else if (cv > 25) valveSize = "DN80";
    else if (cv > 12) valveSize = "DN50";
    else if (cv > 6) valveSize = "DN40";
    else if (cv > 3) valveSize = "DN32";
    else if (cv > 1.5) valveSize = "DN25";
    else if (cv > 0.8) valveSize = "DN20";

    setResult({
      cv,
      kvs,
      valveSize
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="flowRate">Flow Rate (m³/h)</Label>
          <Input
            id="flowRate"
            value={flowRate}
            onChange={(e) => setFlowRate(e.target.value)}
            placeholder="50"
          />
        </div>
        <div>
          <Label htmlFor="pressureDrop">Pressure Drop (bar)</Label>
          <Input
            id="pressureDrop"
            value={pressureDrop}
            onChange={(e) => setPressureDrop(e.target.value)}
            placeholder="2"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="fluidDensity">Fluid Density (kg/m³)</Label>
          <Input
            id="fluidDensity"
            value={fluidDensity}
            onChange={(e) => setFluidDensity(e.target.value)}
            placeholder="1000"
          />
        </div>
        <div>
          <Label htmlFor="fluidType">Fluid Type</Label>
          <Select value={fluidType} onValueChange={setFluidType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="liquid">Liquid</SelectItem>
              <SelectItem value="gas">Gas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={calculateCv} className="w-full">
        Calculate Cv Value
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Control Valve Sizing</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Cv Value:</span>
              <span className="font-mono">{result.cv.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Kvs Value:</span>
              <span className="font-mono">{result.kvs.toFixed(2)} m³/h</span>
            </div>
            <div className="flex justify-between">
              <span>Suggested Size:</span>
              <span className="font-mono font-semibold">{result.valveSize}</span>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Standard:</strong> IEC 60534 flow coefficient calculations</p>
        <p><strong>Note:</strong> Consider valve authority and turndown ratio for final selection</p>
      </div>
    </div>
  );
}

// Flare Load Estimator
function FlareLoadEstimator() {
  const [scenario, setScenario] = useState("equipment_failure");
  const [equipmentCapacity, setEquipmentCapacity] = useState("");
  const [operatingPressure, setOperatingPressure] = useState("");
  const [temperature, setTemperature] = useState("");
  const [result, setResult] = useState<{ flareLoad: number; flareSize: string; stackHeight: number } | null>(null);

  const calculateFlareLoad = () => {
    const capacity = parseFloat(equipmentCapacity);
    const pressure = parseFloat(operatingPressure);
    const temp = parseFloat(temperature);

    if (isNaN(capacity) || isNaN(pressure) || isNaN(temp)) {
      setResult(null);
      return;
    }

    let flareLoad = capacity;
    
    // Apply scenario factors
    switch (scenario) {
      case "equipment_failure":
        flareLoad = capacity * 1.1;
        break;
      case "power_failure":
        flareLoad = capacity * 0.8;
        break;
      case "cooling_failure":
        flareLoad = capacity * 1.5;
        break;
      case "blocked_outlet":
        flareLoad = capacity * 1.2;
        break;
    }

    // Estimate flare tip size (simplified)
    const flareSize = flareLoad < 1000 ? "DN200" : 
                     flareLoad < 5000 ? "DN400" : 
                     flareLoad < 15000 ? "DN600" : "DN800";

    // Estimate stack height (simplified API 521 approach)
    const stackHeight = Math.max(15, Math.sqrt(flareLoad / 100) * 10);

    setResult({
      flareLoad,
      flareSize,
      stackHeight
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="scenario">Relief Scenario</Label>
        <Select value={scenario} onValueChange={setScenario}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="equipment_failure">Equipment Failure</SelectItem>
            <SelectItem value="power_failure">Power Failure</SelectItem>
            <SelectItem value="cooling_failure">Cooling Water Failure</SelectItem>
            <SelectItem value="blocked_outlet">Blocked Outlet</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="equipmentCapacity">Equipment Capacity (kg/h)</Label>
          <Input
            id="equipmentCapacity"
            value={equipmentCapacity}
            onChange={(e) => setEquipmentCapacity(e.target.value)}
            placeholder="5000"
          />
        </div>
        <div>
          <Label htmlFor="operatingPressure">Operating Pressure (bar)</Label>
          <Input
            id="operatingPressure"
            value={operatingPressure}
            onChange={(e) => setOperatingPressure(e.target.value)}
            placeholder="10"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="temperature">Operating Temperature (°C)</Label>
        <Input
          id="temperature"
          value={temperature}
          onChange={(e) => setTemperature(e.target.value)}
          placeholder="150"
        />
      </div>

      <Button onClick={calculateFlareLoad} className="w-full">
        Estimate Flare Load
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Flare System Sizing</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Relief Load:</span>
              <span className="font-mono">{result.flareLoad.toFixed(0)} kg/h</span>
            </div>
            <div className="flex justify-between">
              <span>Flare Tip Size:</span>
              <span className="font-mono">{result.flareSize}</span>
            </div>
            <div className="flex justify-between">
              <span>Stack Height:</span>
              <span className="font-mono">{result.stackHeight.toFixed(1)} m</span>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Standard:</strong> API 521 relief system design</p>
        <p><strong>Note:</strong> Detailed dispersion modeling required for final design</p>
      </div>
    </div>
  );
}

// Line Sizing Tool
function LineSizingTool() {
  const [flowRate, setFlowRate] = useState("");
  const [velocity, setVelocity] = useState("");
  const [fluidType, setFluidType] = useState("liquid");
  const [serviceType, setServiceType] = useState("normal");
  const [result, setResult] = useState<{ diameter: number; nominalSize: string; actualVelocity: number } | null>(null);

  const calculateLineSize = () => {
    const Q = parseFloat(flowRate);
    const V = parseFloat(velocity);

    if (isNaN(Q) || isNaN(V)) {
      setResult(null);
      return;
    }

    // Calculate required diameter
    const area = Q / (3600 * V); // m²
    const diameter = Math.sqrt(4 * area / Math.PI) * 1000; // mm

    // Find nearest standard pipe size
    const standardSizes = [15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000];
    const nominalDiameter = standardSizes.find(size => size >= diameter) || standardSizes[standardSizes.length - 1];
    
    const nominalSize = `DN${nominalDiameter}`;
    const actualArea = Math.PI * Math.pow(nominalDiameter / 1000 / 2, 2);
    const actualVelocity = Q / (3600 * actualArea);

    setResult({
      diameter,
      nominalSize,
      actualVelocity
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="flowRate">Flow Rate (m³/h)</Label>
          <Input
            id="flowRate"
            value={flowRate}
            onChange={(e) => setFlowRate(e.target.value)}
            placeholder="100"
          />
        </div>
        <div>
          <Label htmlFor="velocity">Design Velocity (m/s)</Label>
          <Input
            id="velocity"
            value={velocity}
            onChange={(e) => setVelocity(e.target.value)}
            placeholder="2.5"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="fluidType">Fluid Type</Label>
          <Select value={fluidType} onValueChange={setFluidType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="liquid">Liquid</SelectItem>
              <SelectItem value="gas">Gas</SelectItem>
              <SelectItem value="steam">Steam</SelectItem>
              <SelectItem value="two_phase">Two-Phase</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="serviceType">Service Type</Label>
          <Select value={serviceType} onValueChange={setServiceType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal Service</SelectItem>
              <SelectItem value="erosive">Erosive Service</SelectItem>
              <SelectItem value="critical">Critical Service</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={calculateLineSize} className="w-full">
        Calculate Line Size
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Line Sizing Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Calculated Diameter:</span>
              <span className="font-mono">{result.diameter.toFixed(1)} mm</span>
            </div>
            <div className="flex justify-between">
              <span>Nominal Size:</span>
              <span className="font-mono font-semibold">{result.nominalSize}</span>
            </div>
            <div className="flex justify-between">
              <span>Actual Velocity:</span>
              <span className="font-mono">{result.actualVelocity.toFixed(2)} m/s</span>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Guidelines:</strong> Liquids: 1-3 m/s, Gases: 15-30 m/s, Steam: 25-40 m/s</p>
        <p><strong>Note:</strong> Consider pressure drop and economic velocity for final selection</p>
      </div>
    </div>
  );
}

// Two-Phase Flow Analyzer
function TwoPhaseFlowAnalyzer() {
  const [gasFlowRate, setGasFlowRate] = useState("");
  const [liquidFlowRate, setLiquidFlowRate] = useState("");
  const [pipeDiameter, setPipeDiameter] = useState("");
  const [pressure, setPressure] = useState("");
  const [result, setResult] = useState<{ flowPattern: string; holdupLiquid: number; pressureDrop: number } | null>(null);

  const analyzeTwoPhaseFlow = () => {
    const Qg = parseFloat(gasFlowRate);
    const Ql = parseFloat(liquidFlowRate);
    const D = parseFloat(pipeDiameter) / 1000;
    const P = parseFloat(pressure);

    if (isNaN(Qg) || isNaN(Ql) || isNaN(D) || isNaN(P)) {
      setResult(null);
      return;
    }

    const A = Math.PI * Math.pow(D/2, 2);
    const Vsg = Qg / (3600 * A); // Superficial gas velocity
    const Vsl = Ql / (3600 * A); // Superficial liquid velocity

    // Flow pattern determination (simplified Baker chart)
    let flowPattern = "Stratified";
    if (Vsg > 3 && Vsl < 0.1) flowPattern = "Annular";
    else if (Vsg > 1 && Vsl > 0.1) flowPattern = "Slug";
    else if (Vsg < 0.5 && Vsl > 0.5) flowPattern = "Bubble";
    else if (Vsg > 0.5 && Vsl < 0.3) flowPattern = "Stratified Wavy";

    // Liquid holdup estimation (simplified)
    const holdupLiquid = Vsl / (Vsg + Vsl) * 100;

    // Pressure drop estimation (simplified)
    const pressureDrop = (0.02 * Math.pow(Vsg + Vsl, 1.8)) / D * 100; // Pa/m

    setResult({
      flowPattern,
      holdupLiquid,
      pressureDrop
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="gasFlowRate">Gas Flow Rate (m³/h)</Label>
          <Input
            id="gasFlowRate"
            value={gasFlowRate}
            onChange={(e) => setGasFlowRate(e.target.value)}
            placeholder="1000"
          />
        </div>
        <div>
          <Label htmlFor="liquidFlowRate">Liquid Flow Rate (m³/h)</Label>
          <Input
            id="liquidFlowRate"
            value={liquidFlowRate}
            onChange={(e) => setLiquidFlowRate(e.target.value)}
            placeholder="50"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="pipeDiameter">Pipe Diameter (mm)</Label>
          <Input
            id="pipeDiameter"
            value={pipeDiameter}
            onChange={(e) => setPipeDiameter(e.target.value)}
            placeholder="200"
          />
        </div>
        <div>
          <Label htmlFor="pressure">Operating Pressure (bar)</Label>
          <Input
            id="pressure"
            value={pressure}
            onChange={(e) => setPressure(e.target.value)}
            placeholder="10"
          />
        </div>
      </div>

      <Button onClick={analyzeTwoPhaseFlow} className="w-full">
        Analyze Two-Phase Flow
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Two-Phase Flow Analysis</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Flow Pattern:</span>
              <span className="font-mono font-semibold">{result.flowPattern}</span>
            </div>
            <div className="flex justify-between">
              <span>Liquid Holdup:</span>
              <span className="font-mono">{result.holdupLiquid.toFixed(1)} %</span>
            </div>
            <div className="flex justify-between">
              <span>Pressure Drop:</span>
              <span className="font-mono">{result.pressureDrop.toFixed(2)} Pa/m</span>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Method:</strong> Simplified Baker chart flow pattern prediction</p>
        <p><strong>Note:</strong> Use commercial software for detailed two-phase flow analysis</p>
      </div>
    </div>
  );
}

// Separator Design Checker
function SeparatorDesignChecker() {
  const [gasFlowRate, setGasFlowRate] = useState("");
  const [liquidFlowRate, setLiquidFlowRate] = useState("");
  const [operatingPressure, setOperatingPressure] = useState("");
  const [separatorType, setSeparatorType] = useState("horizontal");
  const [result, setResult] = useState<{ diameter: number; length: number; gasVelocity: number } | null>(null);

  const designSeparator = () => {
    const Qg = parseFloat(gasFlowRate);
    const Ql = parseFloat(liquidFlowRate);
    const P = parseFloat(operatingPressure);

    if (isNaN(Qg) || isNaN(Ql) || isNaN(P)) {
      setResult(null);
      return;
    }

    // Gas velocity criteria (typical 0.15 m/s for droplet settling)
    const Vg_max = 0.15; // m/s
    const A_gas = Qg / (3600 * Vg_max); // m²
    
    let diameter, length;
    
    if (separatorType === "horizontal") {
      // Horizontal separator: L/D = 3-4
      diameter = Math.sqrt(4 * A_gas / (Math.PI * 0.5)); // 50% gas space
      length = diameter * 3.5;
    } else {
      // Vertical separator
      diameter = Math.sqrt(4 * A_gas / Math.PI);
      length = diameter * 4; // Height
    }

    const actualGasVelocity = Qg / (3600 * Math.PI * Math.pow(diameter/2, 2));

    setResult({
      diameter: diameter * 1000, // Convert to mm
      length: length * 1000, // Convert to mm
      gasVelocity: actualGasVelocity
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="separatorType">Separator Type</Label>
        <Select value={separatorType} onValueChange={setSeparatorType}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="horizontal">Horizontal</SelectItem>
            <SelectItem value="vertical">Vertical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="gasFlowRate">Gas Flow Rate (m³/h)</Label>
          <Input
            id="gasFlowRate"
            value={gasFlowRate}
            onChange={(e) => setGasFlowRate(e.target.value)}
            placeholder="2000"
          />
        </div>
        <div>
          <Label htmlFor="liquidFlowRate">Liquid Flow Rate (m³/h)</Label>
          <Input
            id="liquidFlowRate"
            value={liquidFlowRate}
            onChange={(e) => setLiquidFlowRate(e.target.value)}
            placeholder="100"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="operatingPressure">Operating Pressure (bar)</Label>
        <Input
          id="operatingPressure"
          value={operatingPressure}
          onChange={(e) => setOperatingPressure(e.target.value)}
          placeholder="5"
        />
      </div>

      <Button onClick={designSeparator} className="w-full">
        Check Separator Design
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Separator Sizing</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Diameter:</span>
              <span className="font-mono">{result.diameter.toFixed(0)} mm</span>
            </div>
            <div className="flex justify-between">
              <span>{separatorType === "horizontal" ? "Length:" : "Height:"}</span>
              <span className="font-mono">{result.length.toFixed(0)} mm</span>
            </div>
            <div className="flex justify-between">
              <span>Gas Velocity:</span>
              <span className="font-mono">{result.gasVelocity.toFixed(3)} m/s</span>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Design:</strong> Based on Stokes law droplet settling velocity</p>
        <p><strong>Note:</strong> Add liquid retention time and demister pad sizing</p>
      </div>
    </div>
  );
}

// Fluid Properties Lookup
function FluidPropertiesLookup() {
  const [fluidName, setFluidName] = useState("water");
  const [temperature, setTemperature] = useState("25");
  const [pressure, setPressure] = useState("1");
  const [properties, setProperties] = useState<{ density: number; viscosity: number; vaporPressure: number; heatCapacity: number } | null>(null);

  const lookupProperties = () => {
    const T = parseFloat(temperature);
    const P = parseFloat(pressure);

    if (isNaN(T) || isNaN(P)) {
      setProperties(null);
      return;
    }

    // Simplified property database
    const fluidData: { [key: string]: any } = {
      water: {
        density: 1000 * (1 - (T - 4) * (T - 4) / 160000),
        viscosity: 0.001 * Math.exp(-0.05 * T),
        vaporPressure: 0.01 * Math.exp(0.07 * T),
        heatCapacity: 4186
      },
      air: {
        density: 1.225 * (273 / (273 + T)) * (P / 1.013),
        viscosity: 0.0000181 * Math.pow((273 + T) / 273, 0.7),
        vaporPressure: P,
        heatCapacity: 1005
      },
      methane: {
        density: 0.717 * (273 / (273 + T)) * (P / 1.013),
        viscosity: 0.000011 * Math.pow((273 + T) / 273, 0.8),
        vaporPressure: P,
        heatCapacity: 2220
      }
    };

    const data = fluidData[fluidName];
    if (data) {
      setProperties({
        density: data.density,
        viscosity: data.viscosity,
        vaporPressure: data.vaporPressure,
        heatCapacity: data.heatCapacity
      });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="fluidName">Fluid</Label>
        <Select value={fluidName} onValueChange={setFluidName}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="water">Water</SelectItem>
            <SelectItem value="air">Air</SelectItem>
            <SelectItem value="methane">Methane</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="temperature">Temperature (°C)</Label>
          <Input
            id="temperature"
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            placeholder="25"
          />
        </div>
        <div>
          <Label htmlFor="pressure">Pressure (bar)</Label>
          <Input
            id="pressure"
            value={pressure}
            onChange={(e) => setPressure(e.target.value)}
            placeholder="1"
          />
        </div>
      </div>

      <Button onClick={lookupProperties} className="w-full">
        Lookup Properties
      </Button>

      {properties && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Fluid Properties</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Density:</span>
              <span className="font-mono">{properties.density.toFixed(2)} kg/m³</span>
            </div>
            <div className="flex justify-between">
              <span>Viscosity:</span>
              <span className="font-mono">{properties.viscosity.toExponential(2)} Pa·s</span>
            </div>
            <div className="flex justify-between">
              <span>Vapor Pressure:</span>
              <span className="font-mono">{properties.vaporPressure.toFixed(3)} bar</span>
            </div>
            <div className="flex justify-between">
              <span>Heat Capacity:</span>
              <span className="font-mono">{properties.heatCapacity.toFixed(0)} J/kg·K</span>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Source:</strong> Simplified correlations for demonstration</p>
        <p><strong>Note:</strong> Use NIST database or process simulators for accurate data</p>
      </div>
    </div>
  );
}

// Reynolds Number Calculator
function ReynoldsNumberCalculator() {
  const [velocity, setVelocity] = useState("");
  const [diameter, setDiameter] = useState("");
  const [density, setDensity] = useState("");
  const [viscosity, setViscosity] = useState("");
  const [result, setResult] = useState<{ reynolds: number; flowRegime: string; frictionFactor: number } | null>(null);

  const calculateReynolds = () => {
    const V = parseFloat(velocity);
    const D = parseFloat(diameter) / 1000; // Convert mm to m
    const rho = parseFloat(density);
    const mu = parseFloat(viscosity);

    if (isNaN(V) || isNaN(D) || isNaN(rho) || isNaN(mu)) {
      setResult(null);
      return;
    }

    const Re = (rho * V * D) / mu;
    
    let flowRegime = "Laminar";
    if (Re > 4000) flowRegime = "Turbulent";
    else if (Re > 2300) flowRegime = "Transitional";

    // Friction factor calculation
    let frictionFactor;
    if (Re < 2300) {
      frictionFactor = 64 / Re;
    } else {
      frictionFactor = 0.316 * Math.pow(Re, -0.25); // Blasius equation
    }

    setResult({
      reynolds: Re,
      flowRegime,
      frictionFactor
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="velocity">Velocity (m/s)</Label>
          <Input
            id="velocity"
            value={velocity}
            onChange={(e) => setVelocity(e.target.value)}
            placeholder="2.5"
          />
        </div>
        <div>
          <Label htmlFor="diameter">Diameter (mm)</Label>
          <Input
            id="diameter"
            value={diameter}
            onChange={(e) => setDiameter(e.target.value)}
            placeholder="100"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="density">Density (kg/m³)</Label>
          <Input
            id="density"
            value={density}
            onChange={(e) => setDensity(e.target.value)}
            placeholder="1000"
          />
        </div>
        <div>
          <Label htmlFor="viscosity">Viscosity (Pa·s)</Label>
          <Input
            id="viscosity"
            value={viscosity}
            onChange={(e) => setViscosity(e.target.value)}
            placeholder="0.001"
          />
        </div>
      </div>

      <Button onClick={calculateReynolds} className="w-full">
        Calculate Reynolds Number
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Flow Analysis</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Reynolds Number:</span>
              <span className="font-mono">{result.reynolds.toFixed(0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Flow Regime:</span>
              <span className={`font-mono font-semibold ${
                result.flowRegime === 'Laminar' ? 'text-green-600' :
                result.flowRegime === 'Turbulent' ? 'text-blue-600' : 'text-orange-600'
              }`}>
                {result.flowRegime}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Friction Factor:</span>
              <span className="font-mono">{result.frictionFactor.toFixed(4)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Criteria:</strong> Laminar: Re &lt; 2300, Transitional: 2300-4000, Turbulent: Re &gt; 4000</p>
        <p><strong>Note:</strong> For non-circular pipes, use hydraulic diameter</p>
      </div>
    </div>
  );
}

// Flash Calculation Tool
function FlashCalculationTool() {
  const [feedComposition, setFeedComposition] = useState("50");
  const [temperature, setTemperature] = useState("80");
  const [pressure, setPressure] = useState("1");
  const [component, setComponent] = useState("ethanol_water");
  const [result, setResult] = useState<{ vaporFraction: number; liquidComposition: number; vaporComposition: number } | null>(null);

  const calculateFlash = () => {
    const z = parseFloat(feedComposition) / 100;
    const T = parseFloat(temperature);
    const P = parseFloat(pressure);

    if (isNaN(z) || isNaN(T) || isNaN(P)) {
      setResult(null);
      return;
    }

    // Simplified flash calculation for binary systems
    let K; // Equilibrium constant
    
    if (component === "ethanol_water") {
      // Simplified K-value for ethanol-water at given T,P
      K = Math.exp(5 - 2000/T) * (1/P);
    } else if (component === "benzene_toluene") {
      K = Math.exp(3 - 1500/T) * (1/P);
    } else {
      K = Math.exp(4 - 1800/T) * (1/P);
    }

    // Rachford-Rice equation solution (simplified)
    let V = 0.5; // Initial guess for vapor fraction
    for (let i = 0; i < 10; i++) {
      const f = z * (K - 1) / (1 + V * (K - 1));
      const df = -z * Math.pow(K - 1, 2) / Math.pow(1 + V * (K - 1), 2);
      V = V - f / df;
      V = Math.max(0, Math.min(1, V));
    }

    const x = z / (1 + V * (K - 1)); // Liquid composition
    const y = K * x; // Vapor composition

    setResult({
      vaporFraction: V * 100,
      liquidComposition: x * 100,
      vaporComposition: y * 100
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="component">Component System</Label>
        <Select value={component} onValueChange={setComponent}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ethanol_water">Ethanol-Water</SelectItem>
            <SelectItem value="benzene_toluene">Benzene-Toluene</SelectItem>
            <SelectItem value="methanol_water">Methanol-Water</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="feedComposition">Feed Composition (mol%)</Label>
          <Input
            id="feedComposition"
            value={feedComposition}
            onChange={(e) => setFeedComposition(e.target.value)}
            placeholder="50"
          />
        </div>
        <div>
          <Label htmlFor="temperature">Temperature (°C)</Label>
          <Input
            id="temperature"
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            placeholder="80"
          />
        </div>
        <div>
          <Label htmlFor="pressure">Pressure (bar)</Label>
          <Input
            id="pressure"
            value={pressure}
            onChange={(e) => setPressure(e.target.value)}
            placeholder="1"
          />
        </div>
      </div>

      <Button onClick={calculateFlash} className="w-full">
        Calculate Flash
      </Button>

      {result && (
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h4 className="font-semibold">Flash Calculation Results</h4>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex justify-between">
              <span>Vapor Fraction:</span>
              <span className="font-mono">{result.vaporFraction.toFixed(1)} mol%</span>
            </div>
            <div className="flex justify-between">
              <span>Liquid Composition:</span>
              <span className="font-mono">{result.liquidComposition.toFixed(1)} mol%</span>
            </div>
            <div className="flex justify-between">
              <span>Vapor Composition:</span>
              <span className="font-mono">{result.vaporComposition.toFixed(1)} mol%</span>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p><strong>Method:</strong> Rachford-Rice equation with simplified K-values</p>
        <p><strong>Note:</strong> Use rigorous thermodynamic models for actual design</p>
      </div>
    </div>
  );
}