import React, { useState } from 'react';
import Layout from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  Calculator, 
  BarChart3, 
  TrendingUp, 
  Target, 
  Mail, 
  PieChart,
  Users,
  Zap,
  FileText,
  Globe,
  Clock,
  MoreHorizontal,
  Info,
  Eye,
  ArrowRight,
  ArrowLeft,
  Download,
  Factory,
  Fuel,
  DollarSign,
  Settings,
  Percent
} from 'lucide-react';

// ROI Calculator Data Interface
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

export default function MarketingToolsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
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
  const categories = [
    {
      name: "Analytics",
      tools: [
        {
          title: "ROI Calculator",
          description: "Calculate return on investment for re-refining plant projects",
          icon: Calculator,
          status: "Available",
          action: "Launch Tool"
        },
        {
          title: "Campaign Performance Analyzer", 
          description: "Analyze and compare performance metrics across different marketing campaigns",
          icon: BarChart3,
          status: "Available",
          action: "View Analysis"
        },
        {
          title: "Market Trend Analyzer",
          description: "Track and analyze market trends and industry insights", 
          icon: TrendingUp,
          status: "Available",
          action: "View Trends"
        }
      ]
    },
    {
      name: "Lead Management",
      tools: [
        {
          title: "Lead Scoring Engine",
          description: "Automatically score and rank leads based on engagement and criteria",
          icon: Target,
          status: "Available", 
          action: "Configure Scoring"
        },
        {
          title: "Customer Segmentation",
          description: "Segment customers based on behavior, demographics, and preferences",
          icon: Users,
          status: "Available",
          action: "Create Segments"
        },
        {
          title: "Conversion Funnel Optimizer",
          description: "Analyze and optimize customer conversion funnels",
          icon: Zap,
          status: "Beta",
          action: "Try Beta"
        }
      ]
    },
    {
      name: "Content & Communication",
      tools: [
        {
          title: "Email Campaign Builder",
          description: "Create and design professional email marketing campaigns",
          icon: Mail,
          status: "Coming Soon",
          action: "Preview"
        },
        {
          title: "Content Performance Tracker",
          description: "Track performance of marketing content across different channels",
          icon: FileText,
          status: "Available",
          action: "View Reports"
        },
        {
          title: "Social Media Analytics",
          description: "Monitor and analyze social media engagement and reach",
          icon: Globe,
          status: "Coming Soon",
          action: "Preview"
        }
      ]
    }
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Available":
        return <Badge className="bg-green-100 text-green-800 text-xs px-2 py-1">Available</Badge>;
      case "Beta":
        return <Badge className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1">Beta</Badge>;
      case "Coming Soon":
        return <Badge className="bg-gray-100 text-gray-800 text-xs px-2 py-1">Coming Soon</Badge>;
      default:
        return null;
    }
  };

  // ROI Calculator Functions
  const updateData = (field: keyof ROIData, value: string | number) => {
    setROIData(prev => ({ ...prev, [field]: value }));
  };

  const calculateROI = () => {
    const capacity = parseFloat(roiData.capacity) || 0;
    const annualCapacity = capacity * 8760;
    
    const totalOperatingCosts = 
      (parseFloat(roiData.feedstockCost) || 0) * annualCapacity +
      (parseFloat(roiData.powerCost) || 0) * annualCapacity +
      (parseFloat(roiData.fuelCost) || 0) * annualCapacity +
      (parseFloat(roiData.chemicalCost) || 0) * annualCapacity +
      (parseFloat(roiData.laborCost) || 0) * 12 +
      (parseFloat(roiData.maintenanceCost) || 0) * 12;
    
    const finishOilRevenue = (annualCapacity * (parseFloat(roiData.finishOilYield) || 0) / 100) * (parseFloat(roiData.finishOilPrice) || 0);
    const semiFinishRevenue = (annualCapacity * (parseFloat(roiData.semiFinishYield) || 0) / 100) * (parseFloat(roiData.semiFinishPrice) || 0);
    const blackOilRevenue = (annualCapacity * (parseFloat(roiData.blackOilYield) || 0) / 100) * (parseFloat(roiData.blackOilPrice) || 0);
    
    const totalRevenue = finishOilRevenue + semiFinishRevenue + blackOilRevenue;
    const annualProfit = totalRevenue - totalOperatingCosts;
    const capex = parseFloat(roiData.capexEstimation) || 0;
    
    const paybackPeriod = capex / annualProfit;
    const annualROI = (annualProfit / capex) * 100;
    const npv = annualProfit * 5 - capex;
    const irr = ((annualProfit / capex) * 100);
    
    setROIData(prev => ({
      ...prev,
      paybackPeriod: Math.round(paybackPeriod * 100) / 100,
      annualROI: Math.round(annualROI * 100) / 100,
      npv: Math.round(npv),
      irr: Math.round(irr * 100) / 100
    }));
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

  const downloadReport = (format: 'pdf' | 'excel') => {
    toast({
      title: `${format.toUpperCase()} Report Downloaded`,
      description: `ROI report for ${roiData.customerName} has been downloaded.`,
    });
  };

  const handleToolAction = (tool: any) => {
    if (tool.title === "ROI Calculator") {
      setActiveTab("roi-calculator");
    } else if (tool.status === "Coming Soon") {
      alert(`${tool.title} is coming soon! Stay tuned for updates.`);
    } else if (tool.status === "Beta") {
      alert(`${tool.title} is in beta. Some features may be limited.`);
    } else {
      alert(`Launching ${tool.title}...`);
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
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Marketing Tools</h1>
          <p className="text-muted-foreground">
            Comprehensive marketing tools to enhance your campaigns and analyze performance
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview">Tools Overview</TabsTrigger>
            <TabsTrigger value="roi-calculator">ROI Calculator</TabsTrigger>
          </TabsList>
          
          {/* Tools Overview Tab */}
          <TabsContent value="overview" className="space-y-6">

        {/* Category Tabs */}
        <div className="flex gap-6 border-b border-gray-200 mb-8">
          {categories.map((category) => (
            <button
              key={category.name}
              className="px-4 py-2 font-medium text-gray-600 border-b-2 border-transparent hover:text-gray-800 hover:border-gray-300 transition-colors"
            >
              {category.name}
            </button>
          ))}
        </div>

        {/* Tools Sections */}
        {categories.map((category, categoryIndex) => (
          <div key={category.name} className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-800">{category.name}</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {category.tools.map((tool, toolIndex) => {
                const IconComponent = tool.icon;
                return (
                  <Card key={`${categoryIndex}-${toolIndex}`} className="relative group hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-gray-100 rounded-lg">
                            <IconComponent className="h-5 w-5 text-gray-600" />
                          </div>
                          <div>
                            <CardTitle className="text-base font-medium">{tool.title}</CardTitle>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(tool.status)}
                          <button className="p-1 rounded hover:bg-gray-100">
                            <MoreHorizontal className="h-4 w-4 text-gray-400" />
                          </button>
                        </div>
                      </div>
                      <CardDescription className="text-sm text-gray-600 mt-2">
                        {tool.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button className="text-xs text-blue-600 hover:text-blue-700">
                            {category.name}
                          </button>
                        </div>
                        <Button 
                          variant={tool.status === "Available" ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleToolAction(tool)}
                          disabled={tool.status === "Coming Soon"}
                          className="text-xs px-3 py-1 h-7"
                        >
                          {tool.action}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}

        {/* Summary Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12 pt-8 border-t">
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <PieChart className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <p className="text-2xl font-bold">9</p>
            <p className="text-sm text-muted-foreground">Total Tools</p>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <Target className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <p className="text-2xl font-bold">6</p>
            <p className="text-sm text-muted-foreground">Available</p>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                <Zap className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
            <p className="text-2xl font-bold">1</p>
            <p className="text-sm text-muted-foreground">Beta</p>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                <Clock className="h-6 w-6 text-gray-600" />
              </div>
            </div>
            <p className="text-2xl font-bold">2</p>
            <p className="text-sm text-muted-foreground">Coming Soon</p>
          </div>
            </div>
          </TabsContent>

          {/* ROI Calculator Tab */}
          <TabsContent value="roi-calculator" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-3">
                  <Calculator className="h-6 w-6 text-blue-600" />
                  Project ROI Calculator
                </h2>
                <p className="text-muted-foreground mt-1">
                  Generate comprehensive ROI reports for re-refining plant projects
                </p>
              </div>
              <Badge variant="outline" className="text-sm">
                Step {currentStep} of 6
              </Badge>
            </div>

            {/* Progress Steps */}
            <div className="flex items-center justify-between mb-6">
              {steps.map((step, index) => {
                const Icon = step.icon;
                const isActive = currentStep === step.number;
                const isCompleted = currentStep > step.number;
                
                return (
                  <div key={step.number} className="flex items-center">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 
                      ${isActive ? 'border-blue-600 bg-blue-50' : 
                        isCompleted ? 'border-green-600 bg-green-50' : 
                        'border-gray-300 bg-gray-50'}`}>
                      <Icon className={`h-5 w-5 ${isActive ? 'text-blue-600' : 
                        isCompleted ? 'text-green-600' : 'text-gray-400'}`} />
                    </div>
                    <div className="ml-2 hidden lg:block">
                      <p className={`text-xs font-medium ${isActive ? 'text-blue-600' : 
                        isCompleted ? 'text-green-600' : 'text-gray-500'}`}>
                        {step.title}
                      </p>
                    </div>
                    {index < steps.length - 1 && (
                      <ArrowRight className="h-3 w-3 text-gray-400 mx-2" />
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
              <CardContent className="space-y-6">
                {/* Step 1: Plant Configuration */}
                {currentStep === 1 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                {/* Steps 2-5 content would go here - abbreviated for space */}
                {currentStep === 2 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Raw Material Tank Size (Liters)</Label>
                      <Input
                        type="number"
                        value={roiData.rawMaterialTankSize}
                        onChange={(e) => updateData('rawMaterialTankSize', e.target.value)}
                        placeholder="e.g., 50000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Number of Raw Material Tanks</Label>
                      <Input
                        type="number"
                        value={roiData.rawMaterialTankCount}
                        onChange={(e) => updateData('rawMaterialTankCount', e.target.value)}
                        placeholder="e.g., 3"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Total Power Requirement (kW)</Label>
                      <Input
                        type="number"
                        value={roiData.powerRequirement}
                        onChange={(e) => updateData('powerRequirement', e.target.value)}
                        placeholder="e.g., 500"
                      />
                    </div>
                  </div>
                )}

                {currentStep === 3 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Feedstock Cost per Liter ({getCurrencySymbol(roiData.currency)})</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={roiData.feedstockCost}
                        onChange={(e) => updateData('feedstockCost', e.target.value)}
                        placeholder="e.g., 0.45"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Monthly Labor Cost ({getCurrencySymbol(roiData.currency)})</Label>
                      <Input
                        type="number"
                        value={roiData.laborCost}
                        onChange={(e) => updateData('laborCost', e.target.value)}
                        placeholder="e.g., 15000"
                      />
                    </div>
                  </div>
                )}

                {currentStep === 4 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Finish Oil Yield (%)</Label>
                      <Input
                        type="number"
                        value={roiData.finishOilYield}
                        onChange={(e) => updateData('finishOilYield', e.target.value)}
                        placeholder="e.g., 65"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Semi-Finish Oil Yield (%)</Label>
                      <Input
                        type="number"
                        value={roiData.semiFinishYield}
                        onChange={(e) => updateData('semiFinishYield', e.target.value)}
                        placeholder="e.g., 25"
                      />
                    </div>
                  </div>
                )}

                {currentStep === 5 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Finish Oil Market Price ({getCurrencySymbol(roiData.currency)})</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={roiData.finishOilPrice}
                        onChange={(e) => updateData('finishOilPrice', e.target.value)}
                        placeholder="e.g., 0.85"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>CAPEX Estimation ({getCurrencySymbol(roiData.currency)})</Label>
                      <Input
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
                            <TrendingUp className="h-6 w-6 text-green-600" />
                            <div>
                              <p className="text-xl font-bold">{roiData.paybackPeriod} years</p>
                              <p className="text-sm text-muted-foreground">Payback Period</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center space-x-2">
                            <Percent className="h-6 w-6 text-blue-600" />
                            <div>
                              <p className="text-xl font-bold">{roiData.annualROI}%</p>
                              <p className="text-sm text-muted-foreground">Annual ROI</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center space-x-2">
                            <DollarSign className="h-6 w-6 text-purple-600" />
                            <div>
                              <p className="text-xl font-bold">{getCurrencySymbol(roiData.currency)}{roiData.npv.toLocaleString()}</p>
                              <p className="text-sm text-muted-foreground">NPV (5 years)</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center space-x-2">
                            <BarChart3 className="h-6 w-6 text-orange-600" />
                            <div>
                              <p className="text-xl font-bold">{roiData.irr}%</p>
                              <p className="text-sm text-muted-foreground">IRR</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
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
                  onClick={calculateROI}
                  className="flex items-center gap-2"
                >
                  <Calculator className="h-4 w-4" />
                  Regenerate Report
                </Button>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}