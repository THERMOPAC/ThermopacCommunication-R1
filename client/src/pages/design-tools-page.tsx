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
  Shield
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
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="mechanical">Mechanical Design</TabsTrigger>
            <TabsTrigger value="pressure-vessel">Pressure Vessel Design</TabsTrigger>
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