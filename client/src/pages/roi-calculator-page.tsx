import React, { useState } from 'react';
import Layout from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  Calculator, 
  ArrowRight, 
  ArrowLeft, 
  Download, 
  Factory, 
  Fuel,
  DollarSign,
  TrendingUp,
  FileText,
  Settings,
  BarChart3,
  Percent
} from 'lucide-react';

interface ROIData {
  // Step 1: Plant Configuration
  capacity: string;
  currency: string;
  customerName: string;
  projectName: string;
  
  // Step 2: Tank Farm & Utility Setup
  rawMaterialTankSize: string;
  rawMaterialTankCount: string;
  finishedProductTankSize: string;
  finishedProductTankCount: string;
  boilerCapacity: string;
  heaterCapacity: string;
  powerRequirement: string;
  
  // Step 3: Operating Costs
  feedstockCost: string;
  powerCost: string;
  fuelCost: string;
  chemicalCost: string;
  laborCost: string;
  maintenanceCost: string;
  
  // Step 4: Product Yield
  finishOilYield: string;
  semiFinishYield: string;
  blackOilYield: string;
  sulphurPpm: string;
  
  // Step 5: Revenue & Investment
  finishOilPrice: string;
  semiFinishPrice: string;
  blackOilPrice: string;
  capexEstimation: string;
  
  // Step 6: Calculated Results
  paybackPeriod: number;
  annualROI: number;
  npv: number;
  irr: number;
}

export default function ROICalculatorPage() {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [roiData, setROIData] = useState<ROIData>({
    capacity: '',
    currency: 'USD',
    customerName: '',
    projectName: '',
    rawMaterialTankSize: '',
    rawMaterialTankCount: '',
    finishedProductTankSize: '',
    finishedProductTankCount: '',
    boilerCapacity: '',
    heaterCapacity: '',
    powerRequirement: '',
    feedstockCost: '',
    powerCost: '',
    fuelCost: '',
    chemicalCost: '',
    laborCost: '',
    maintenanceCost: '',
    finishOilYield: '',
    semiFinishYield: '',
    blackOilYield: '',
    sulphurPpm: '',
    finishOilPrice: '',
    semiFinishPrice: '',
    blackOilPrice: '',
    capexEstimation: '',
    paybackPeriod: 0,
    annualROI: 0,
    npv: 0,
    irr: 0
  });

  const updateData = (field: keyof ROIData, value: string | number) => {
    setROIData(prev => ({ ...prev, [field]: value }));
  };

  const calculateROI = () => {
    // ROI Calculation Logic
    const capacity = parseFloat(roiData.capacity) || 0;
    const annualCapacity = capacity * 8760; // hours per year
    
    // Operating Costs (annual)
    const totalOperatingCosts = 
      (parseFloat(roiData.feedstockCost) || 0) * annualCapacity +
      (parseFloat(roiData.powerCost) || 0) * annualCapacity +
      (parseFloat(roiData.fuelCost) || 0) * annualCapacity +
      (parseFloat(roiData.chemicalCost) || 0) * annualCapacity +
      (parseFloat(roiData.laborCost) || 0) * 12 + // monthly labor cost
      (parseFloat(roiData.maintenanceCost) || 0) * 12; // monthly maintenance
    
    // Revenue Calculation
    const finishOilRevenue = (annualCapacity * (parseFloat(roiData.finishOilYield) || 0) / 100) * (parseFloat(roiData.finishOilPrice) || 0);
    const semiFinishRevenue = (annualCapacity * (parseFloat(roiData.semiFinishYield) || 0) / 100) * (parseFloat(roiData.semiFinishPrice) || 0);
    const blackOilRevenue = (annualCapacity * (parseFloat(roiData.blackOilYield) || 0) / 100) * (parseFloat(roiData.blackOilPrice) || 0);
    
    const totalRevenue = finishOilRevenue + semiFinishRevenue + blackOilRevenue;
    const annualProfit = totalRevenue - totalOperatingCosts;
    const capex = parseFloat(roiData.capexEstimation) || 0;
    
    // Calculate metrics
    const paybackPeriod = capex / annualProfit;
    const annualROI = (annualProfit / capex) * 100;
    const npv = annualProfit * 5 - capex; // Simple 5-year NPV
    const irr = ((annualProfit / capex) * 100); // Simplified IRR
    
    setROIData(prev => ({
      ...prev,
      paybackPeriod: Math.round(paybackPeriod * 100) / 100,
      annualROI: Math.round(annualROI * 100) / 100,
      npv: Math.round(npv),
      irr: Math.round(irr * 100) / 100
    }));
  };

  const generateReport = () => {
    calculateROI();
    toast({
      title: "ROI Report Generated",
      description: "Your ROI calculation has been completed successfully.",
    });
  };

  const downloadReport = (format: 'pdf' | 'excel') => {
    // In a real implementation, this would generate and download the actual file
    toast({
      title: `${format.toUpperCase()} Report Downloaded`,
      description: `ROI report for ${roiData.customerName} has been downloaded.`,
    });
  };

  const nextStep = () => {
    if (currentStep < 6) {
      setCurrentStep(currentStep + 1);
    }
    if (currentStep === 5) {
      calculateROI();
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const getCurrencySymbol = (currency: string) => {
    switch (currency) {
      case 'USD': return '$';
      case 'EUR': return '€';
      case 'GBP': return '£';
      default: return '$';
    }
  };

  const steps = [
    { number: 1, title: "Plant Configuration", icon: Factory },
    { number: 2, title: "Tank Farm & Utilities", icon: Settings },
    { number: 3, title: "Operating Costs", icon: DollarSign },
    { number: 4, title: "Product Yield", icon: Fuel },
    { number: 5, title: "Revenue & Investment", icon: TrendingUp },
    { number: 6, title: "ROI Results", icon: BarChart3 }
  ];

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Calculator className="h-8 w-8 text-blue-600" />
              Project ROI Calculator
            </h1>
            <p className="text-muted-foreground mt-2">
              Generate comprehensive ROI reports for re-refining plant projects
            </p>
          </div>
          <Badge variant="outline" className="text-sm">
            Step {currentStep} of 6
          </Badge>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-8">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = currentStep === step.number;
            const isCompleted = currentStep > step.number;
            
            return (
              <div key={step.number} className="flex items-center">
                <div className={`flex items-center justify-center w-12 h-12 rounded-full border-2 
                  ${isActive ? 'border-blue-600 bg-blue-50' : 
                    isCompleted ? 'border-green-600 bg-green-50' : 
                    'border-gray-300 bg-gray-50'}`}>
                  <Icon className={`h-6 w-6 ${isActive ? 'text-blue-600' : 
                    isCompleted ? 'text-green-600' : 'text-gray-400'}`} />
                </div>
                <div className="ml-3 hidden sm:block">
                  <p className={`text-sm font-medium ${isActive ? 'text-blue-600' : 
                    isCompleted ? 'text-green-600' : 'text-gray-500'}`}>
                    {step.title}
                  </p>
                </div>
                {index < steps.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-gray-400 mx-4" />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {React.createElement(steps[currentStep - 1].icon, { className: "h-5 w-5" })}
              {steps[currentStep - 1].title}
            </CardTitle>
            <CardDescription>
              {currentStep === 1 && "Configure basic plant parameters and project details"}
              {currentStep === 2 && "Define tank farm specifications and utility requirements"}
              {currentStep === 3 && "Enter annual operating costs and expenses"}
              {currentStep === 4 && "Specify product yield percentages and quality parameters"}
              {currentStep === 5 && "Set market prices and capital investment details"}
              {currentStep === 6 && "Review calculated ROI metrics and generate reports"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Step 1: Plant Configuration */}
            {currentStep === 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="customerName">Customer Name *</Label>
                  <Input
                    id="customerName"
                    value={roiData.customerName}
                    onChange={(e) => updateData('customerName', e.target.value)}
                    placeholder="Enter customer name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="projectName">Project Name *</Label>
                  <Input
                    id="projectName"
                    value={roiData.projectName}
                    onChange={(e) => updateData('projectName', e.target.value)}
                    placeholder="Enter project name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="capacity">Plant Capacity (Liters/Hour) *</Label>
                  <Input
                    id="capacity"
                    type="number"
                    value={roiData.capacity}
                    onChange={(e) => updateData('capacity', e.target.value)}
                    placeholder="e.g., 1000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency *</Label>
                  <Select value={roiData.currency} onValueChange={(value) => updateData('currency', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                      <SelectItem value="GBP">GBP (£)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Step 2: Tank Farm & Utilities */}
            {currentStep === 2 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="rawMaterialTankSize">Raw Material Tank Size (Liters)</Label>
                  <Input
                    id="rawMaterialTankSize"
                    type="number"
                    value={roiData.rawMaterialTankSize}
                    onChange={(e) => updateData('rawMaterialTankSize', e.target.value)}
                    placeholder="e.g., 50000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rawMaterialTankCount">Number of Raw Material Tanks</Label>
                  <Input
                    id="rawMaterialTankCount"
                    type="number"
                    value={roiData.rawMaterialTankCount}
                    onChange={(e) => updateData('rawMaterialTankCount', e.target.value)}
                    placeholder="e.g., 3"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="finishedProductTankSize">Finished Product Tank Size (Liters)</Label>
                  <Input
                    id="finishedProductTankSize"
                    type="number"
                    value={roiData.finishedProductTankSize}
                    onChange={(e) => updateData('finishedProductTankSize', e.target.value)}
                    placeholder="e.g., 25000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="finishedProductTankCount">Number of Finished Product Tanks</Label>
                  <Input
                    id="finishedProductTankCount"
                    type="number"
                    value={roiData.finishedProductTankCount}
                    onChange={(e) => updateData('finishedProductTankCount', e.target.value)}
                    placeholder="e.g., 5"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="boilerCapacity">Boiler Capacity (MW)</Label>
                  <Input
                    id="boilerCapacity"
                    type="number"
                    value={roiData.boilerCapacity}
                    onChange={(e) => updateData('boilerCapacity', e.target.value)}
                    placeholder="e.g., 2.5"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="heaterCapacity">Heater Capacity (MW)</Label>
                  <Input
                    id="heaterCapacity"
                    type="number"
                    value={roiData.heaterCapacity}
                    onChange={(e) => updateData('heaterCapacity', e.target.value)}
                    placeholder="e.g., 1.5"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="powerRequirement">Total Power Requirement (kW)</Label>
                  <Input
                    id="powerRequirement"
                    type="number"
                    value={roiData.powerRequirement}
                    onChange={(e) => updateData('powerRequirement', e.target.value)}
                    placeholder="e.g., 500"
                  />
                </div>
              </div>
            )}

            {/* Step 3: Operating Costs */}
            {currentStep === 3 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="feedstockCost">Feedstock Cost per Liter ({getCurrencySymbol(roiData.currency)})</Label>
                  <Input
                    id="feedstockCost"
                    type="number"
                    step="0.01"
                    value={roiData.feedstockCost}
                    onChange={(e) => updateData('feedstockCost', e.target.value)}
                    placeholder="e.g., 0.45"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="powerCost">Power Cost per kWh ({getCurrencySymbol(roiData.currency)})</Label>
                  <Input
                    id="powerCost"
                    type="number"
                    step="0.01"
                    value={roiData.powerCost}
                    onChange={(e) => updateData('powerCost', e.target.value)}
                    placeholder="e.g., 0.12"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fuelCost">Fuel Cost per Liter ({getCurrencySymbol(roiData.currency)})</Label>
                  <Input
                    id="fuelCost"
                    type="number"
                    step="0.01"
                    value={roiData.fuelCost}
                    onChange={(e) => updateData('fuelCost', e.target.value)}
                    placeholder="e.g., 0.08"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chemicalCost">Consumables Cost per Liter ({getCurrencySymbol(roiData.currency)})</Label>
                  <Input
                    id="chemicalCost"
                    type="number"
                    step="0.01"
                    value={roiData.chemicalCost}
                    onChange={(e) => updateData('chemicalCost', e.target.value)}
                    placeholder="e.g., 0.02"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="laborCost">Monthly Labor Cost ({getCurrencySymbol(roiData.currency)})</Label>
                  <Input
                    id="laborCost"
                    type="number"
                    value={roiData.laborCost}
                    onChange={(e) => updateData('laborCost', e.target.value)}
                    placeholder="e.g., 15000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maintenanceCost">Monthly Maintenance Cost ({getCurrencySymbol(roiData.currency)})</Label>
                  <Input
                    id="maintenanceCost"
                    type="number"
                    value={roiData.maintenanceCost}
                    onChange={(e) => updateData('maintenanceCost', e.target.value)}
                    placeholder="e.g., 8000"
                  />
                </div>
              </div>
            )}

            {/* Step 4: Product Yield */}
            {currentStep === 4 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="finishOilYield">Finish Oil Yield (%)</Label>
                  <Input
                    id="finishOilYield"
                    type="number"
                    value={roiData.finishOilYield}
                    onChange={(e) => updateData('finishOilYield', e.target.value)}
                    placeholder="e.g., 65"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="semiFinishYield">Semi-Finish Oil Yield (%)</Label>
                  <Input
                    id="semiFinishYield"
                    type="number"
                    value={roiData.semiFinishYield}
                    onChange={(e) => updateData('semiFinishYield', e.target.value)}
                    placeholder="e.g., 25"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="blackOilYield">Black Oil Yield (%)</Label>
                  <Input
                    id="blackOilYield"
                    type="number"
                    value={roiData.blackOilYield}
                    onChange={(e) => updateData('blackOilYield', e.target.value)}
                    placeholder="e.g., 8"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sulphurPpm">Sulphur Content (ppm)</Label>
                  <Input
                    id="sulphurPpm"
                    type="number"
                    value={roiData.sulphurPpm}
                    onChange={(e) => updateData('sulphurPpm', e.target.value)}
                    placeholder="e.g., 50"
                  />
                </div>
                <div className="md:col-span-2 p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Note:</strong> Total yield percentage should ideally add up to approximately 98-100%, 
                    accounting for processing losses of 2-5%.
                  </p>
                </div>
              </div>
            )}

            {/* Step 5: Revenue & Investment */}
            {currentStep === 5 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="finishOilPrice">Finish Oil Market Price per Liter ({getCurrencySymbol(roiData.currency)})</Label>
                  <Input
                    id="finishOilPrice"
                    type="number"
                    step="0.01"
                    value={roiData.finishOilPrice}
                    onChange={(e) => updateData('finishOilPrice', e.target.value)}
                    placeholder="e.g., 0.85"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="semiFinishPrice">Semi-Finish Oil Price per Liter ({getCurrencySymbol(roiData.currency)})</Label>
                  <Input
                    id="semiFinishPrice"
                    type="number"
                    step="0.01"
                    value={roiData.semiFinishPrice}
                    onChange={(e) => updateData('semiFinishPrice', e.target.value)}
                    placeholder="e.g., 0.70"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="blackOilPrice">Black Oil Price per Liter ({getCurrencySymbol(roiData.currency)})</Label>
                  <Input
                    id="blackOilPrice"
                    type="number"
                    step="0.01"
                    value={roiData.blackOilPrice}
                    onChange={(e) => updateData('blackOilPrice', e.target.value)}
                    placeholder="e.g., 0.40"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="capexEstimation">CAPEX Estimation ({getCurrencySymbol(roiData.currency)})</Label>
                  <Input
                    id="capexEstimation"
                    type="number"
                    value={roiData.capexEstimation}
                    onChange={(e) => updateData('capexEstimation', e.target.value)}
                    placeholder="e.g., 2500000"
                  />
                </div>
              </div>
            )}

            {/* Step 6: ROI Results */}
            {currentStep === 6 && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-2">
                        <TrendingUp className="h-8 w-8 text-green-600" />
                        <div>
                          <p className="text-2xl font-bold">{roiData.paybackPeriod} years</p>
                          <p className="text-sm text-muted-foreground">Payback Period</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-2">
                        <Percent className="h-8 w-8 text-blue-600" />
                        <div>
                          <p className="text-2xl font-bold">{roiData.annualROI}%</p>
                          <p className="text-sm text-muted-foreground">Annual ROI</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-2">
                        <DollarSign className="h-8 w-8 text-purple-600" />
                        <div>
                          <p className="text-2xl font-bold">{getCurrencySymbol(roiData.currency)}{roiData.npv.toLocaleString()}</p>
                          <p className="text-sm text-muted-foreground">NPV (5 years)</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-2">
                        <BarChart3 className="h-8 w-8 text-orange-600" />
                        <div>
                          <p className="text-2xl font-bold">{roiData.irr}%</p>
                          <p className="text-sm text-muted-foreground">IRR</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Project Summary</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p><strong>Customer:</strong> {roiData.customerName}</p>
                      <p><strong>Project:</strong> {roiData.projectName}</p>
                      <p><strong>Capacity:</strong> {roiData.capacity} L/hr</p>
                      <p><strong>Currency:</strong> {roiData.currency}</p>
                    </div>
                    <div>
                      <p><strong>CAPEX:</strong> {getCurrencySymbol(roiData.currency)}{parseFloat(roiData.capexEstimation || '0').toLocaleString()}</p>
                      <p><strong>Annual Capacity:</strong> {(parseFloat(roiData.capacity || '0') * 8760).toLocaleString()} L</p>
                      <p><strong>Total Yield:</strong> {(parseFloat(roiData.finishOilYield || '0') + parseFloat(roiData.semiFinishYield || '0') + parseFloat(roiData.blackOilYield || '0')).toFixed(1)}%</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <Button onClick={() => downloadReport('pdf')} className="flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Download PDF Report
                  </Button>
                  <Button variant="outline" onClick={() => downloadReport('excel')} className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Download Excel Report
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className="flex justify-between">
          <Button 
            variant="outline" 
            onClick={prevStep} 
            disabled={currentStep === 1}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </Button>
          
          {currentStep < 6 ? (
            <Button 
              onClick={nextStep}
              className="flex items-center gap-2"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button 
              onClick={generateReport}
              className="flex items-center gap-2"
            >
              <Calculator className="h-4 w-4" />
              Regenerate Report
            </Button>
          )}
        </div>
      </div>
    </Layout>
  );
}