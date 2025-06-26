import React, { useState, useEffect } from 'react';
import Layout from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  Percent,
  Edit3,
  Plus,
  Trash2,
  Wrench,
  Printer,
  FolderOpen
} from 'lucide-react';

// ROI Calculator Data Interface
interface ROIData {
  // Project tracking
  roiProjectId?: string;
  
  // Step 1: Plant Configuration
  capacity: string;
  currency: string;
  customerName: string;
  projectName: string;
  projectCostUSD: string;
  projectCostLocal: string;
  
  // Step 2: Tank Farm & Utility Setup - Auto-calculated tanks
  tanks: Array<{
    description: string;
    percentCapacity: number;
    storageDays: number;
    requiredKL: number;
    suggestedTankSize: number;
    suggestedQuantity: number;
    editable: boolean;
  }>;
  boilerCapacity: string;
  heaterCapacity: string;
  powerRequirement: string;
  
  // Step 3: Additional Equipments
  additionalPumpsFilters: string;
  tankLevelTransmitters: string;
  pipesValvesFlanges: string;
  electricalCablesAccessories: string;
  pccMccPanels: string;
  chimneyDucting: string;

  coolingTower: string;
  dieselGenerator: string;
  qualityControlEquipment: string;
  thermicFluid: string;
  expansionStructure: string;
  craneHireCharges: string;
  laborErectionCommissioning: string;

  // Step 4: Operating Costs
  feedstockCost: string;
  powerCost: string;
  fuelCost: string;
  chemicalCost: string;
  laborCost: string;
  maintenanceCost: string;
  includeDepreciation: boolean;
  
  // Step 5: Product Yield
  finishOilYield: string;
  semiFinishYield: string;
  blackOilYield: string;
  sulphurPpm: string;
  
  // Step 6: Revenue & Investment
  finishOilPrice: string;
  semiFinishPrice: string;
  blackOilPrice: string;
  capexEstimation: string;
  
  // Step 7: Calculated Results
  paybackPeriod: number;
  annualROI: number;
  npv: number;
  irr: number;
}

// Tank Price Editor Component
const TankPriceEditor = ({ price, onUpdate }: { price: any, onUpdate: (updatedPrice: any) => void }) => {
  const [editingPrice, setEditingPrice] = useState<string>(price.priceUSD.toString());
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/tank-prices/${price.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceUSD: parseFloat(editingPrice) })
      });
      
      if (response.ok) {
        const updatedPrice = await response.json();
        onUpdate(updatedPrice);
      }
    } catch (error) {
      console.error('Error updating tank price:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="border rounded-lg p-3 bg-white">
      <div className="grid grid-cols-3 gap-3 items-center">
        <div>
          <Label className="text-sm text-gray-600">Tank Size</Label>
          <div className="font-medium">{price.capacity} KL</div>
        </div>
        <div>
          <Label className="text-sm">Price (USD)</Label>
          <Input
            type="number"
            value={editingPrice}
            onChange={(e) => setEditingPrice(e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isLoading || editingPrice === price.priceUSD.toString()}
          >
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default function MarketingToolsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Load project data from backend
  const loadProjectData = async (projectId: string) => {
    try {
      const response = await fetch(`/api/roi/load-project/${projectId}`);
      
      if (!response.ok) {
        throw new Error('Failed to load project data');
      }

      const result = await response.json();
      
      if (result.success && result.steps) {
        // Merge all step data into roiData
        const mergedData = { ...roiData, roiProjectId: projectId };
        
        Object.keys(result.steps).forEach(stepNum => {
          const stepData = result.steps[stepNum];
          Object.assign(mergedData, stepData);
        });
        
        setROIData(mergedData);
        setCompletedSteps(Object.keys(result.steps).map(Number).sort());
        
        toast({
          title: 'Project Loaded',
          description: `Loaded ${Object.keys(result.steps).length} saved steps`,
        });
      }
    } catch (error) {
      console.error('Error loading project:', error);
      toast({
        title: 'Load Failed',
        description: 'Failed to load project. Please check the Project ID.',
        variant: 'destructive'
      });
    }
  };

  // Generate or get existing project ID
  const getProjectId = () => {
    if (roiData.roiProjectId) return roiData.roiProjectId;
    
    // Generate new UUID for the project
    const newProjectId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    
    setROIData(prev => ({ ...prev, roiProjectId: newProjectId }));
    return newProjectId;
  };

  // Fetch plant costs from API
  const { data: plantCostsData, isLoading: plantCostsLoading, error: plantCostsError } = useQuery({
    queryKey: ['/api/plant-costs'],
    queryFn: async () => {
      console.log('Plant costs loading:', true);
      const response = await fetch('/api/plant-costs');
      if (!response.ok) throw new Error('Failed to fetch plant costs');
      const data = await response.json();
      console.log('Plant costs data:', data);
      return data;
    }
  });

  // Fetch tank prices from API
  const { data: tankPricesData, isLoading: tankPricesLoading, error: tankPricesError } = useQuery({
    queryKey: ['/api/tank-prices'],
    queryFn: async () => {
      console.log('===== FRONTEND: Fetching tank prices =====');
      const response = await fetch('/api/tank-prices', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      console.log('Tank prices response status:', response.status);
      
      if (!response.ok) {
        console.error('Tank prices fetch failed:', response.status, response.statusText);
        throw new Error('Failed to fetch tank prices');
      }
      
      const data = await response.json();
      console.log('Tank prices raw response:', data);
      return data;
    }
  });

  useEffect(() => {
    if (plantCostsData) {
      console.log('Plant costs error:', plantCostsError);
      const processedCosts = plantCostsData.map((cost: any) => ({
        id: cost.id,
        capacity: cost.capacity,
        priceUSD: parseFloat(cost.priceUSD)
      }));
      console.log('Processed capacities:', processedCosts);
      setPlantCosts(processedCosts);
    }
  }, [plantCostsData, plantCostsError]);

  useEffect(() => {
    if (tankPricesData && !tankPricesLoading) {
      console.log('Raw tank prices API response:', tankPricesData);
      const processedPrices = tankPricesData.map((price: any) => {
        // Handle potential null/undefined priceUSD
        const rawPrice = price.priceUSD || price.price_usd || price.priceUsd || 0;
        const numericPrice = typeof rawPrice === 'string' ? parseFloat(rawPrice) : rawPrice;
        const processed = {
          id: price.id,
          capacity: price.capacity,
          priceUSD: numericPrice
        };
        console.log(`Processing tank ${price.capacity} KL: raw=${rawPrice}, final=${processed.priceUSD}`);
        return processed;
      });
      console.log('Final processed tank prices:', processedPrices);
      setTankPrices(processedPrices);
    }
  }, [tankPricesData, tankPricesError, tankPricesLoading]);
  
  const [activeTab, setActiveTab] = useState("overview");
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [projectId, setProjectId] = useState<string>('');
  const [showPlantCostsDialog, setShowPlantCostsDialog] = useState(false);
  const [editingCost, setEditingCost] = useState<any>(null);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [loadProjectId, setLoadProjectId] = useState('');
  const [selectedProjectFromList, setSelectedProjectFromList] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<{id: string, name: string} | null>(null);
  const [newCost, setNewCost] = useState({ capacity: '', priceUSD: '' });
  const [plantCosts, setPlantCosts] = useState<Array<{ id: number; capacity: number; priceUSD: number }>>([]);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCapacity, setEditingCapacity] = useState<{ id: number; capacity: number; priceUSD: number } | null>(null);
  const [tankPrices, setTankPrices] = useState<Array<{ id: number; capacity: number; priceUSD: number }>>([]);
  const [isTankPriceDialogOpen, setIsTankPriceDialogOpen] = useState(false);
  const [manageCostsOpen, setManageCostsOpen] = useState(false);

  // Fetch saved ROI projects for dropdown
  const { data: savedProjects, refetch: refetchProjects } = useQuery({
    queryKey: ['/api/roi/list-projects'],
    queryFn: async () => {
      const response = await fetch('/api/roi/list-projects', {
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 401) {
          // Authentication required - redirect to login
          window.location.href = '/login';
          throw new Error('Authentication required');
        }
        throw new Error('Failed to fetch saved projects');
      }
      const data = await response.json();
      return data.success ? data.projects : [];
    },
    enabled: showLoadDialog, // Only fetch when dialog is open
    retry: false, // Don't retry on auth failures
  });
  const [roiData, setROIData] = useState<ROIData>({
    roiProjectId: undefined,
    capacity: '',
    currency: 'USD',
    customerName: '',
    projectName: '',
    projectCostUSD: '0',
    projectCostLocal: '0',
    // Cost breakdown fields
    freightInsurance: '',
    importDutyVAT: '',
    plotCost: '',
    civilCost: '',
    refineryShed: '',
    utilityShed: '',
    officeBuilding: '',
    mechanicalElectrical: '',
    fireSuppressionSystem: '',
    insulationCost: '',
    legalFees: '',
    preFormationExpenses: '',
    commissioningTravel: '',
    contingency: '',
    tanks: [
      { description: 'Used oil storage tanks', percentCapacity: 150, storageDays: 7, requiredKL: 0, suggestedTankSize: 0, suggestedQuantity: 0, editable: true },
      { description: 'Light Base Oil', percentCapacity: 80, storageDays: 5, requiredKL: 0, suggestedTankSize: 0, suggestedQuantity: 0, editable: true },
      { description: 'Heavy Base Oil', percentCapacity: 60, storageDays: 5, requiredKL: 0, suggestedTankSize: 0, suggestedQuantity: 0, editable: true },
      { description: 'Light Base Oil Intermediate tank', percentCapacity: 40, storageDays: 3, requiredKL: 0, suggestedTankSize: 0, suggestedQuantity: 0, editable: true },
      { description: 'Heavy Base Oil Intermediate tank', percentCapacity: 30, storageDays: 3, requiredKL: 0, suggestedTankSize: 0, suggestedQuantity: 0, editable: true },
      { description: 'Finish Light Base Oil', percentCapacity: 70, storageDays: 7, requiredKL: 0, suggestedTankSize: 0, suggestedQuantity: 0, editable: true },
      { description: 'Finish Heavy Base Oil', percentCapacity: 50, storageDays: 7, requiredKL: 0, suggestedTankSize: 0, suggestedQuantity: 0, editable: true },
      { description: 'Waste Water tank', percentCapacity: 25, storageDays: 2, requiredKL: 0, suggestedTankSize: 0, suggestedQuantity: 0, editable: true },
      { description: 'Naphtha / Gas Oil storage tank', percentCapacity: 35, storageDays: 4, requiredKL: 0, suggestedTankSize: 0, suggestedQuantity: 0, editable: true },
      { description: 'Residue storage tank', percentCapacity: 20, storageDays: 3, requiredKL: 0, suggestedTankSize: 0, suggestedQuantity: 0, editable: true },
      { description: 'Process water tank', percentCapacity: 30, storageDays: 2, requiredKL: 0, suggestedTankSize: 0, suggestedQuantity: 0, editable: true },
      { description: 'Fire water storage tank', percentCapacity: 20, storageDays: 30, requiredKL: 0, suggestedTankSize: 0, suggestedQuantity: 0, editable: true },
      { description: 'Fuel oil Tank', percentCapacity: 15, storageDays: 5, requiredKL: 0, suggestedTankSize: 0, suggestedQuantity: 0, editable: true }
    ],
    boilerCapacity: '',
    heaterCapacity: '',
    heaterQuantity: '',
    heaterTotalLoad: '',
    powerRequirement: '',
    // Step 3: Additional Equipments
    additionalPumpsFilters: '',
    tankLevelTransmitters: '',
    pipesValvesFlanges: '',
    electricalCablesAccessories: '',
    pccMccPanels: '',
    chimneyDucting: '',

    coolingTower: '',
    dieselGenerator: '',
    qualityControlEquipment: '',
    thermicFluid: '',
    expansionStructure: '',
    craneHireCharges: '',
    laborErectionCommissioning: '',
    // Step 4: Operating Costs (with default values)
    plantOperationDays: '25',
    feedstockCost: '3',
    powerCost: '',
    fuelCost: '',
    chemicalCost: '',
    laborCost: '',
    maintenanceCost: '',
    includeDepreciation: true, // Default to include depreciation
    // Financing Structure with default values
    equityPercentage: '30',
    debtPercentage: '70',
    debtFinancingRatio: '70',
    rateOfInterest: '6', // Default 6% annual interest rate on debt
    // Step 5: Product Yield (pre-populated with default values)
    naphthaGasOilYield: '7',
    lightBaseOilYield: '50',
    heavyBaseOilYield: '22',
    residueYield: '15',
    wasteWaterYield: '5',
    processLossYield: '1',
    // Selling Prices
    naphthaGasOilPrice: '',
    lightBaseOilPrice: '',
    heavyBaseOilPrice: '',
    residuePrice: '',
    wasteWaterPrice: '',
    capexEstimation: '',
    paybackPeriod: 0,
    annualROI: 0,
    npv: 0,
    irr: 0
  });



  // Generate or get project ID
  useEffect(() => {
    if (!roiData.roiProjectId) {
      const newProjectId = crypto.randomUUID();
      setProjectId(newProjectId);
      setROIData(prev => ({ ...prev, roiProjectId: newProjectId }));
    } else {
      setProjectId(roiData.roiProjectId);
    }
  }, []);

  // Save step data function
  const saveStepData = async (stepNumber: number, stepData: any) => {
    if (!projectId) return;
    
    setIsAutoSaving(true);
    try {
      const response = await fetch('/api/roi/save-step', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          roiProjectId: projectId,
          stepNumber,
          stepData
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save step data');
      }

      setCompletedSteps(prev => new Set([...prev, stepNumber]));
      toast({
        title: 'Step Saved',
        description: `Step ${stepNumber} data saved successfully`
      });
    } catch (error) {
      console.error('Error saving step:', error);
      toast({
        title: 'Save Failed',
        description: 'Failed to save step data. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsAutoSaving(false);
    }
  };

  // Delete project function
  const deleteProject = async (projectId: string) => {
    try {
      const response = await fetch(`/api/roi/delete-project/${projectId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Delete response:', data);
        
        toast({
          title: 'Project Deleted',
          description: `Successfully deleted ROI project`,
        });
        
        // Refresh the projects list
        refetchProjects();
        
        // Close dialogs and reset state
        setShowDeleteDialog(false);
        setProjectToDelete(null);
        setSelectedProjectFromList('');
        
      } else {
        throw new Error('Failed to delete project');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      toast({
        title: 'Delete Failed',
        description: 'Failed to delete project. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Handle delete button click
  const handleDeleteClick = (project: any) => {
    const projectName = project.customerName ? 
      `${project.customerName} - ${project.projectName || 'Unnamed Project'}` : 
      project.projectName || 'Unnamed Project';
    
    setProjectToDelete({
      id: project.roiProjectId,
      name: projectName
    });
    setShowDeleteDialog(true);
  };



  // Get current step data function
  const getCurrentStepData = () => {
    switch (currentStep) {
      case 1:
        return {
          capacity: roiData.capacity,
          currency: roiData.currency,
          customerName: roiData.customerName,
          projectName: roiData.projectName,
          projectCostUSD: roiData.projectCostUSD,
          projectCostLocal: roiData.projectCostLocal,
          freightInsurance: roiData.freightInsurance,
          importDutyVAT: roiData.importDutyVAT,
          plotCost: roiData.plotCost,
          civilCost: roiData.civilCost,
          refineryShed: roiData.refineryShed,
          utilityShed: roiData.utilityShed,
          officeBuilding: roiData.officeBuilding,
          mechanicalElectrical: roiData.mechanicalElectrical,
          fireSuppressionSystem: roiData.fireSuppressionSystem,
          insulationCost: roiData.insulationCost,
          legalFees: roiData.legalFees,
          preFormationExpenses: roiData.preFormationExpenses,
          commissioningTravel: roiData.commissioningTravel,
          contingency: roiData.contingency
        };
      case 2:
        return {
          tanks: roiData.tanks,
          boilerCapacity: roiData.boilerCapacity,
          heaterCapacity: roiData.heaterCapacity,
          heaterQuantity: roiData.heaterQuantity,
          heaterTotalLoad: roiData.heaterTotalLoad,
          powerRequirement: roiData.powerRequirement
        };
      case 3:
        return {
          additionalPumpsFilters: roiData.additionalPumpsFilters,
          tankLevelTransmitters: roiData.tankLevelTransmitters,
          pipesValvesFlanges: roiData.pipesValvesFlanges,
          electricalCablesAccessories: roiData.electricalCablesAccessories,
          pccMccPanels: roiData.pccMccPanels,
          chimneyDucting: roiData.chimneyDucting,
  
          coolingTower: roiData.coolingTower,
          dieselGenerator: roiData.dieselGenerator,
          qualityControlEquipment: roiData.qualityControlEquipment,
          thermicFluid: roiData.thermicFluid,
          expansionStructure: roiData.expansionStructure,
          craneHireCharges: roiData.craneHireCharges,
          laborErectionCommissioning: roiData.laborErectionCommissioning
        };
      case 4:
        return {
          plantOperationDays: roiData.plantOperationDays,
          feedstockCost: roiData.feedstockCost,
          powerCost: roiData.powerCost,
          fuelCost: roiData.fuelCost,
          chemicalCost: roiData.chemicalCost,
          laborCost: roiData.laborCost,
          maintenanceCost: roiData.maintenanceCost,
          mediaCost: roiData.mediaCost,
          transportationCost: roiData.transportationCost,
          vehicleMaintenanceCost: roiData.vehicleMaintenanceCost,
          miscellaneousCost: roiData.miscellaneousCost,
          rateOfInterest: roiData.rateOfInterest,
          debtFinancingRatio: roiData.debtFinancingRatio,
          depreciationMethod: roiData.depreciationMethod,
          includeDepreciation: roiData.includeDepreciation,
          includeFinancingCosts: roiData.includeFinancingCosts
        };
      case 5:
        return {
          naphthaGasOilYield: roiData.naphthaGasOilYield,
          lightBaseOilYield: roiData.lightBaseOilYield,
          heavyBaseOilYield: roiData.heavyBaseOilYield,
          residueYield: roiData.residueYield,
          wasteWaterYield: roiData.wasteWaterYield,
          processLossYield: roiData.processLossYield,
          naphthaGasOilPrice: roiData.naphthaGasOilPrice,
          lightBaseOilPrice: roiData.lightBaseOilPrice,
          heavyBaseOilPrice: roiData.heavyBaseOilPrice,
          residuePrice: roiData.residuePrice,
          wasteWaterPrice: roiData.wasteWaterPrice
        };
      case 6:
        return {
          finishOilYield: roiData.finishOilYield,
          semiFinishYield: roiData.semiFinishYield,
          blackOilYield: roiData.blackOilYield,
          sulphurPpm: roiData.sulphurPpm,
          finishOilPrice: roiData.finishOilPrice,
          semiFinishPrice: roiData.semiFinishPrice,
          blackOilPrice: roiData.blackOilPrice,
          capexEstimation: roiData.capexEstimation
        };
      case 7:
        return {
          paybackPeriod: roiData.paybackPeriod,
          annualROI: roiData.annualROI,
          npv: roiData.npv,
          irr: roiData.irr
        };
      default:
        return {};
    }
  };

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

  // Standard tank sizes in KL
  const standardTankSizes = [50, 100, 200, 300, 400, 500, 600];

  // Function to get tank price from database
  const getTankPrice = (capacity: number): number => {
    if (!tankPrices || tankPrices.length === 0) {
      return 0;
    }
    const tankPrice = tankPrices.find(price => price.capacity === capacity);
    if (!tankPrice) {
      return 0;
    }
    const price = typeof tankPrice.priceUSD === 'string' ? parseFloat(tankPrice.priceUSD) : tankPrice.priceUSD;
    return price || 0;
  };



  // Get plant cost function
  const getPlantCost = (capacityLPH: number): number => {
    const cost = plantCosts.find(c => c.capacity === capacityLPH);
    return cost ? cost.priceUSD : 0;
  };

  // Create plant cost mutation
  const createCostMutation = useMutation({
    mutationFn: async (data: { capacity: number, priceUSD: number }) => {
      const response = await fetch('/api/plant-costs', {
        method: 'POST',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to create plant cost');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/plant-costs'] });
      toast({ title: 'Plant cost created successfully' });
      setNewCost({ capacity: '', priceUSD: '' });
    },
    onError: () => {
      toast({ title: 'Failed to create plant cost', variant: 'destructive' });
    }
  });

  // Delete plant cost mutation
  const deleteCostMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/plant-costs/${id}`, { 
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) throw new Error('Failed to delete plant cost');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/plant-costs'] });
      toast({ title: 'Plant cost deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete plant cost', variant: 'destructive' });
    }
  });

  // Update plant cost mutation
  const updateCostMutation = useMutation({
    mutationFn: async (data: { id: number; capacity: number; priceUSD: number }) => {
      const response = await fetch(`/api/plant-costs/${data.id}`, { 
        method: 'PUT',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json' 
        },
        body: JSON.stringify({
          capacity: data.capacity,
          priceUSD: data.priceUSD
        })
      });
      if (!response.ok) throw new Error('Failed to update plant cost');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/plant-costs'] });
      toast({ title: 'Plant cost updated successfully' });
      setEditingCost(null);
    },
    onError: () => {
      toast({ title: 'Failed to update plant cost', variant: 'destructive' });
    }
  });

  // Currency exchange rates (USD base rate = 1.0)
  const currencies = {
    USD: { name: 'US Dollar', rate: 1.0, symbol: '$' },
    EUR: { name: 'Euro', rate: 0.92, symbol: '€' },
    GBP: { name: 'British Pound', rate: 0.79, symbol: '£' },
    INR: { name: 'Indian Rupee', rate: 83.25, symbol: '₹' },
    CAD: { name: 'Canadian Dollar', rate: 1.36, symbol: 'C$' },
    AUD: { name: 'Australian Dollar', rate: 1.52, symbol: 'A$' }
  };

  // Helper function to get current plant cost
  const getCurrentPlantCost = () => {
    if (!roiData.capacity) return 0;
    const capacity = parseInt(roiData.capacity);
    const plant = plantCosts.find(p => p.capacity === capacity);
    return plant ? plant.priceUSD : 0;
  };

  // Helper function to get formatted selected plant cost
  const getSelectedPlantCost = () => {
    const cost = getCurrentPlantCost();
    if (cost === 0) return 'Select capacity';
    
    const currency = currencies[roiData.currency] || currencies.USD;
    const convertedCost = cost * currency.rate;
    
    return `${currency.symbol}${convertedCost.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    })}`;
  };

  // Helper function to calculate total additional costs
  const getTotalAdditionalCosts = () => {
    const currency = currencies[roiData.currency] || currencies.USD;
    const additionalCosts = [
      'freightInsurance', 'importDutyVAT', 'plotCost', 'civilCost', 'refineryShed',
      'utilityShed', 'officeBuilding', 'mechanicalElectrical', 'fireSuppressionSystem',
      'insulationCost', 'legalFees', 'preFormationExpenses', 'commissioningTravel', 'contingency'
    ];
    
    const total = additionalCosts.reduce((sum, field) => {
      const value = parseFloat(roiData[field as keyof ROIData] as string) || 0;
      return sum + value;
    }, 0);
    
    return `${currency.symbol}${total.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    })}`;
  };

  // Helper function to calculate total equipment costs
  const getTotalEquipmentCosts = () => {
    const currency = currencies[roiData.currency] || currencies.USD;
    const equipmentCosts = [
      'additionalPumpsFilters', 'tankLevelTransmitters', 'pipesValvesFlanges',
      'electricalCablesAccessories', 'pccMccPanels', 'chimneyDucting',
      'coolingTower', 'dieselGenerator', 'qualityControlEquipment',
      'thermicFluid', 'expansionStructure', 'craneHireCharges', 'laborErectionCommissioning'
    ];
    
    const total = equipmentCosts.reduce((sum, field) => {
      const value = parseFloat(roiData[field as keyof ROIData] as string) || 0;
      return sum + value;
    }, 0);
    
    return `${currency.symbol}${total.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    })}`;
  };

  // Helper function to calculate total project cost
  const getTotalProjectCost = () => {
    const currency = currencies[roiData.currency] || currencies.USD;
    const basePlantCost = getCurrentPlantCost() * currency.rate;
    
    const additionalCosts = [
      'freightInsurance', 'importDutyVAT', 'plotCost', 'civilCost', 'refineryShed',
      'utilityShed', 'officeBuilding', 'mechanicalElectrical', 'fireSuppressionSystem',
      'insulationCost', 'legalFees', 'preFormationExpenses', 'commissioningTravel', 'contingency'
    ];
    
    const equipmentCosts = [
      'additionalPumpsFilters', 'tankLevelTransmitters', 'pipesValvesFlanges',
      'electricalCablesAccessories', 'pccMccPanels', 'chimneyDucting',
      'airCompressor', 'coolingTower', 'dieselGenerator', 'qualityControlEquipment',
      'thermicFluid', 'expansionStructure', 'craneHireCharges', 'laborErectionCommissioning'
    ];
    
    const totalAdditional = additionalCosts.reduce((sum, field) => {
      const value = parseFloat(roiData[field as keyof ROIData] as string) || 0;
      return sum + value;
    }, 0);
    
    const totalEquipment = equipmentCosts.reduce((sum, field) => {
      const value = parseFloat(roiData[field as keyof ROIData] as string) || 0;
      return sum + value;
    }, 0);
    
    const totalCost = basePlantCost + totalAdditional + totalEquipment;
    
    return `${currency.symbol}${totalCost.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    })}`;
  };

  // Helper function to get currency symbol
  const getCurrencySymbol = (currencyCode: string) => {
    return currencies[currencyCode]?.symbol || '$';
  };
  // ===== END PRICING CONFIGURATION =====

  // Enhanced capacity rounding functions
  const roundCapacitySmart = (value: number) => {
    return value < 300
      ? Math.ceil(value / 50) * 50  // round up to nearest 50
      : Math.ceil(value / 100) * 100;  // round up to nearest 100
  };

  // Heater sizing logic
  const availableHeaterSizes = [600000, 10000000, 15000000, 20000000, 25000000, 30000000];
  
  const calculateOptimalHeaterConfig = (requiredLoad: number, plantCapacity: number) => {
    if (plantCapacity <= 3000) {
      // For small plants, pick the smallest heater size ≥ required load
      const optimalSize = availableHeaterSizes.find(size => size >= requiredLoad) || availableHeaterSizes[availableHeaterSizes.length - 1];
      return { size: optimalSize, quantity: 1, totalLoad: optimalSize };
    } else {
      // For large plants, select multiple heaters (minimum 2) with fewest quantity
      let bestConfig = { size: availableHeaterSizes[availableHeaterSizes.length - 1], quantity: Math.max(2, Math.ceil(requiredLoad / availableHeaterSizes[availableHeaterSizes.length - 1])), totalLoad: 0 };
      
      for (const heaterSize of availableHeaterSizes) {
        // Ensure minimum 2 heaters for plants > 3000 LPH
        const minQuantity = Math.max(2, Math.ceil(requiredLoad / heaterSize));
        const quantity = minQuantity;
        const totalLoad = heaterSize * quantity;
        
        if (totalLoad >= requiredLoad && (quantity < bestConfig.quantity || (quantity === bestConfig.quantity && heaterSize < bestConfig.size))) {
          bestConfig = { size: heaterSize, quantity, totalLoad };
        }
      }
      
      bestConfig.totalLoad = bestConfig.size * bestConfig.quantity;
      return bestConfig;
    }
  };

  // Optimal tank size and quantity calculation
  const getOptimalTankSizeAndQuantity = (requiredKL: number) => {
    const SIZES = [50, 100, 200, 300, 400, 500, 600];
    let bestOption = null;

    for (let size of SIZES) {
      const qty = Math.ceil(requiredKL / size);
      const totalCapacity = size * qty;

      if (
        totalCapacity >= requiredKL &&
        (!bestOption || qty < bestOption.qty || (qty === bestOption.qty && size < bestOption.size))
      ) {
        bestOption = { size, qty };
      }
    }

    return bestOption || { size: 600, qty: Math.ceil(requiredKL / 600) }; // fallback
  };

  // Enhanced tank calculation functions
  const calculateTankRequirements = (plantCapacityLPH: number) => {
    return roiData.tanks.map(tank => {
      // Capacity (KL) = (LPH × % × Days × 24) / 1000
      const rawKL = (plantCapacityLPH * (tank.percentCapacity / 100) * tank.storageDays * 24) / 1000;
      
      // Apply smart rounding (rounds up to nearest 50/100)
      const roundedKL = roundCapacitySmart(rawKL);
      
      // Get optimal tank size and quantity
      const { size, qty } = getOptimalTankSizeAndQuantity(roundedKL);
      
      // Apply safety checks
      const finalSize = size || 50; // fallback safety
      const finalQty = qty > 0 ? qty : 1; // ensure min 1 tank if required KL > 0
      
      return {
        ...tank,
        requiredKL: roundedKL,
        suggestedTankSize: finalSize,
        suggestedQuantity: finalQty
      };
    });
  };

  const updateTankData = (index: number, field: string, value: string | number) => {
    const updatedTanks = [...roiData.tanks];
    updatedTanks[index] = { ...updatedTanks[index], [field]: value };
    
    // Recalculate if percentage or days changed
    if (field === 'percentCapacity' || field === 'storageDays') {
      const plantCapacity = parseFloat(roiData.capacity) || 0;
      if (plantCapacity > 0) {
        const tank = updatedTanks[index];
        const rawKL = (plantCapacity * (tank.percentCapacity / 100) * tank.storageDays * 24) / 1000;
        
        // Apply enhanced calculation logic
        const roundedKL = roundCapacitySmart(rawKL);
        const { size, qty } = getOptimalTankSizeAndQuantity(roundedKL);
        
        // Apply safety checks
        const finalSize = size || 50;
        const finalQty = qty > 0 ? qty : 1;
        
        updatedTanks[index] = {
          ...updatedTanks[index],
          requiredKL: roundedKL,
          suggestedTankSize: finalSize,
          suggestedQuantity: finalQty
        };
      }
    }
    
    setROIData(prev => ({ ...prev, tanks: updatedTanks }));
  };

  // ROI Calculator Functions
  const updateData = (field: keyof ROIData, value: string | number) => {
    // Handle two-way auto-calculation for financing structure
    if (field === 'equityPercentage') {
      const equityValue = parseFloat(value as string) || 0;
      const clampedEquity = Math.max(0, Math.min(100, equityValue)); // Clamp between 0-100
      const debtValue = 100 - clampedEquity;
      setROIData(prev => ({ 
        ...prev, 
        equityPercentage: clampedEquity.toString(),
        debtPercentage: debtValue.toString(),
        debtFinancingRatio: debtValue.toString() // Also update debtFinancingRatio for consistency
      }));
      return;
    }
    
    if (field === 'debtPercentage') {
      const debtValue = parseFloat(value as string) || 0;
      const clampedDebt = Math.max(0, Math.min(100, debtValue)); // Clamp between 0-100
      const equityValue = 100 - clampedDebt;
      setROIData(prev => ({ 
        ...prev, 
        debtPercentage: clampedDebt.toString(),
        equityPercentage: equityValue.toString(),
        debtFinancingRatio: clampedDebt.toString() // Also update debtFinancingRatio for consistency
      }));
      return;
    }
    
    // Handle validation for Interest Rate on Debt (0% to 25% annual)
    if (field === 'rateOfInterest') {
      const interestRate = parseFloat(value as string) || 0;
      const clampedRate = Math.max(0, Math.min(25, interestRate)); // Clamp between 0-25%
      setROIData(prev => ({ 
        ...prev, 
        rateOfInterest: clampedRate.toString()
      }));
      return;
    }
    
    setROIData(prev => ({ ...prev, [field]: value }));
    
    // Auto-calculate tanks, utilities, project cost, and product prices when capacity, currency, or plant operation days changes
    if ((field === 'capacity' || field === 'currency' || field === 'plantOperationDays') && (roiData.capacity || value)) {
      const plantCapacity = parseFloat((field === 'capacity' ? value : roiData.capacity) as string);
      const selectedCurrency = field === 'currency' ? value as string : roiData.currency;
      
      if (plantCapacity > 0) {
        // Find plant price in USD and calculate local currency
        const plantConfig = plantCosts.find(p => p.capacity === plantCapacity);
        if (plantConfig) {
          const basePlantCostUSD = plantConfig.priceUSD;
          const exchangeRate = currencies[selectedCurrency]?.rate || 1;
          const basePlantCostLocal = Math.round(basePlantCostUSD * exchangeRate);
          
          // Update base costs
          updateData('projectCostUSD', basePlantCostUSD.toString());
          updateData('projectCostLocal', basePlantCostLocal.toString());
          
          // Auto-calculate project cost breakdown based on percentages
          const costBreakdownPercentages = {
            freightInsurance: 1.0,      // 1.0%
            importDutyVAT: 5.0,         // 5.0%
            plotCost: 10.0,             // 10%
            civilCost: 8.0,             // 8%
            refineryShed: 10.0,         // 10%
            utilityShed: 8.0,           // 8%
            officeBuilding: 5.0,        // 5%
            mechanicalElectrical: 10.0, // 10%
            fireSuppressionSystem: 5.0,  // 5%
            insulationCost: 2.0,         // 2%
            legalFees: 1.0,             // 1%
            preFormationExpenses: 0.5,  // 0.5%
            commissioningTravel: 3.0,   // 3%
            contingency: 2.0            // 2%
          };
          
          // Auto-calculate additional equipment costs based on percentages
          const additionalEquipmentPercentages = {
            additionalPumpsFilters: 1.5,    // 1.5%
            tankLevelTransmitters: 1.0,     // 1.0%
            pccMccPanels: 2.0,              // 2.0%
            pipesValvesFlanges: 3.0,        // 3.0%
            electricalCablesAccessories: 2.0, // 2.0%
            chimneyDucting: 1.0,            // 1.0%
            airCompressor: 1.0,             // 1.0%
            coolingTower: 0.75,             // 0.75%
            dieselGenerator: 2.5,           // 2.5%
            qualityControlEquipment: 1.0,   // 1.0%
            thermicFluid: 2.0,              // 2.0%
            expansionStructure: 1.5,        // 1.5%
            craneHireCharges: 0.5,          // 0.5%
            laborErectionCommissioning: 3.0  // 3.0%
          };
          
          // Calculate each component cost and round to nearest 1,000
          const baseCost = selectedCurrency === 'USD' ? basePlantCostUSD : basePlantCostLocal;
          const calculatedCosts: any = {};
          
          // Calculate project cost breakdown
          Object.entries(costBreakdownPercentages).forEach(([key, percentage]) => {
            const componentCost = Math.round((baseCost * percentage / 100) / 1000) * 1000;
            calculatedCosts[key] = componentCost.toString();
          });
          
          // Calculate additional equipment costs
          Object.entries(additionalEquipmentPercentages).forEach(([key, percentage]) => {
            const componentCost = Math.round((baseCost * percentage / 100) / 1000) * 1000;
            calculatedCosts[key] = componentCost.toString();
          });
          
          // Auto-calculate operating costs based on plant capacity
          const operatingDaysPerMonth = parseFloat(roiData.plantOperationDays) || 30; // Use dynamic operating days
          const powerRequirement = parseFloat(roiData.powerRequirement) || (350 * (plantCapacity / 1000));
          
          const operatingCosts = {
            feedstockCost: "0.2", // Default $0.2 per liter but user-defined
            powerCost: Math.round((powerRequirement / 10) * 0.12 * 24 * operatingDaysPerMonth).toString(),
            fuelCost: Math.round(plantCapacity * 0.03 * 24 * operatingDaysPerMonth).toString(),
            chemicalCost: Math.round(plantCapacity * 0.005 * 24 * operatingDaysPerMonth).toString(),
            mediaCost: Math.round(2.5 * (plantCapacity / 1000)).toString(),
            laborCost: Math.round(5000 * (plantCapacity / 1000)).toString(),
            maintenanceCost: Math.round((baseCost * 0.03) / 12).toString(),
            transportationCost: Math.round(0.03 * plantCapacity * 24 * operatingDaysPerMonth).toString(),
            vehicleMaintenanceCost: Math.round(500 * (plantCapacity / 1000)).toString(),
            miscellaneousCost: Math.round(500 * (plantCapacity / 1000)).toString(),
            rateOfInterest: "0.5" // Default 0.5% monthly
          };
          
          // Auto-calculate product prices based on currency
          const defaultProductPrices = {
            naphthaGasOilPrice: Math.round(600 * exchangeRate).toString(),
            lightBaseOilPrice: Math.round(750 * exchangeRate).toString(),
            heavyBaseOilPrice: Math.round(780 * exchangeRate).toString(),
            residuePrice: Math.round(400 * exchangeRate).toString(),
            wasteWaterPrice: Math.round(-50 * exchangeRate).toString(), // Disposal cost (negative)
          };

          // Update all cost breakdown, additional equipment, operating cost fields, and product prices
          setROIData(prev => ({ 
            ...prev, 
            ...calculatedCosts,
            ...operatingCosts,
            ...defaultProductPrices
          }));
        }
        
        const calculatedTanks = calculateTankRequirements(plantCapacity);
        
        // Calculate utility requirements based on plant capacity
        const compressorCapacity = Math.round(20 * (plantCapacity / 1000));
        const requiredHeaterLoad = 600000 * (plantCapacity / 1000);
        const heaterConfig = calculateOptimalHeaterConfig(requiredHeaterLoad, plantCapacity);
        const powerRequirement = Math.round(350 * (plantCapacity / 1000));
        
        setROIData(prev => ({ 
          ...prev, 
          tanks: calculatedTanks,
          boilerCapacity: compressorCapacity.toString(),
          heaterCapacity: heaterConfig.size.toString(),
          heaterQuantity: heaterConfig.quantity.toString(),
          heaterTotalLoad: heaterConfig.totalLoad.toString(),
          powerRequirement: powerRequirement.toString()
        }));
      }
    }
  };

  // Function to calculate utilities based on plant capacity
  const calculateUtilities = (plantCapacityLPH: number) => {
    if (plantCapacityLPH === 0) return [];

    const utilities = [
      {
        description: "Compressor",
        specification: `${Math.round(plantCapacityLPH * 20 / 1000)} HP`,
        quantity: 1,
        unitCostUSD: Math.round(plantCapacityLPH * 20 / 1000) * 500,
        totalCost: Math.round(plantCapacityLPH * 20 / 1000) * 500
      },
      {
        description: "Heater",
        specification: (() => {
          const totalCapacity = Math.round(plantCapacityLPH * 600);
          if (totalCapacity <= 3000000) {
            return `${totalCapacity.toLocaleString()} Kcal/hr`;
          } else {
            const numHeaters = Math.max(2, Math.ceil(totalCapacity / 2000000));
            const capacityPerHeater = Math.ceil(totalCapacity / numHeaters);
            return `${capacityPerHeater.toLocaleString()} Kcal/hr each`;
          }
        })(),
        quantity: (() => {
          const totalCapacity = Math.round(plantCapacityLPH * 600);
          return totalCapacity > 3000000 ? Math.max(2, Math.ceil(totalCapacity / 2000000)) : 1;
        })(),
        unitCostUSD: (() => {
          const totalCapacity = Math.round(plantCapacityLPH * 600);
          if (totalCapacity <= 3000000) {
            return totalCapacity * 0.050;
          } else {
            const numHeaters = Math.max(2, Math.ceil(totalCapacity / 2000000));
            const capacityPerHeater = Math.ceil(totalCapacity / numHeaters);
            return capacityPerHeater * 0.050;
          }
        })(),
        totalCost: Math.round(plantCapacityLPH * 600) * 0.050
      },
      {
        description: "Total Connected Load",
        specification: `${Math.round(plantCapacityLPH * 350 / 1000)} KVA`,
        quantity: 1,
        unitCostUSD: 0, // Not included in capital cost - used only for power consumption calculation
        totalCost: 0,
        note: "Used only for power cost estimation, not added to capital cost"
      }
    ];

    return utilities;
  };

  // Calculate working capital whenever feedstock cost, capacity, or operating days change
  // Working capital = 15 days of feedstock inventory (industry standard)
  const workingCapital = React.useMemo(() => {
    const feedstockCost = parseFloat(roiData.feedstockCost) || 0;
    const capacity = parseFloat(roiData.capacity) || 0;
    const workingCapitalDays = 15; // 15 days of feedstock inventory
    return feedstockCost * capacity * 24 * workingCapitalDays;
  }, [roiData.feedstockCost, roiData.capacity]);

  // Calculate default tanks and utilities when capacity changes
  const calculatedTanks = React.useMemo(() => {
    const capacity = parseFloat(roiData.capacity) || 0;
    if (capacity === 0) return [];
    return calculateTankRequirements(capacity);
  }, [roiData.capacity]);

  const calculatedUtilities = React.useMemo(() => {
    const capacity = parseFloat(roiData.capacity) || 0;
    if (capacity === 0) return [];
    return calculateUtilities(capacity);
  }, [roiData.capacity]);

  // Calculate comprehensive financing costs
  const financingCosts = React.useMemo(() => {
    const monthlyInterestRate = parseFloat(roiData.rateOfInterest) || 0;
    const debtRatio = parseFloat(roiData.debtFinancingRatio) || 70;
    
    // Calculate total investment
    const baseCost = parseFloat(roiData.projectCostLocal) || 0;
    const additionalCosts = [
      parseFloat(roiData.freightInsurance) || 0,
      parseFloat(roiData.importDutyVAT) || 0,
      parseFloat(roiData.plotCost) || 0,
      parseFloat(roiData.civilCost) || 0,
      parseFloat(roiData.refineryShed) || 0,
      parseFloat(roiData.utilityShed) || 0,
      parseFloat(roiData.officeBuilding) || 0,
      parseFloat(roiData.fireSuppressionSystem) || 0,
      parseFloat(roiData.insulationCost) || 0,
      parseFloat(roiData.legalFees) || 0,
      parseFloat(roiData.preFormationExpenses) || 0,
      parseFloat(roiData.commissioningTravel) || 0,
      parseFloat(roiData.contingency) || 0
    ].reduce((sum, cost) => sum + cost, 0);
    
    const equipmentCosts = [
      parseFloat(roiData.additionalPumpsFilters) || 0,
      parseFloat(roiData.tankLevelTransmitters) || 0,
      parseFloat(roiData.pipesValvesFlanges) || 0,
      parseFloat(roiData.electricalCablesAccessories) || 0,
      parseFloat(roiData.pccMccPanels) || 0,
      parseFloat(roiData.chimneyDucting) || 0,
      parseFloat(roiData.coolingTower) || 0,
      parseFloat(roiData.dieselGenerator) || 0,
      parseFloat(roiData.qualityControlEquipment) || 0,
      parseFloat(roiData.thermicFluid) || 0,
      parseFloat(roiData.expansionStructure) || 0,
      parseFloat(roiData.craneHireCharges) || 0,
      parseFloat(roiData.laborErectionCommissioning) || 0
    ].reduce((sum, cost) => sum + cost, 0);
    
    const tankCosts = (roiData.tanks || []).reduce((total, tank) => {
      return total + (parseFloat(tank.totalCost) || 0);
    }, 0);
    
    const utilityCosts = (roiData.utilities || []).reduce((total, utility) => {
      return total + (parseFloat(utility.totalCost) || 0);
    }, 0);
    
    const totalInvestment = baseCost + additionalCosts + equipmentCosts + tankCosts + utilityCosts;
    
    // Calculate debt amount
    const debtAmount = totalInvestment * (debtRatio / 100);
    
    // Monthly interest on debt
    const monthlyDebtInterest = (debtAmount * monthlyInterestRate) / 100;
    
    // Monthly interest on working capital
    const monthlyWorkingCapitalInterest = (workingCapital * monthlyInterestRate) / 100;
    
    // Annual financing costs
    const annualFinancingCosts = (monthlyDebtInterest + monthlyWorkingCapitalInterest) * 12;
    
    return {
      totalInvestment,
      debtAmount,
      equityAmount: totalInvestment - debtAmount,
      monthlyDebtInterest,
      monthlyWorkingCapitalInterest,
      totalMonthlyFinancingCost: monthlyDebtInterest + monthlyWorkingCapitalInterest,
      annualFinancingCosts
    };
  }, [workingCapital, roiData.rateOfInterest, roiData.debtFinancingRatio, roiData.projectCostLocal, roiData.freightInsurance, roiData.importDutyVAT, roiData.plotCost, roiData.civilCost, roiData.refineryShed, roiData.utilityShed, roiData.officeBuilding, roiData.mechanicalElectrical, roiData.fireSuppressionSystem, roiData.insulationCost, roiData.legalFees, roiData.preFormationExpenses, roiData.commissioningTravel, roiData.contingency, roiData.additionalPumpsFilters, roiData.tankLevelTransmitters, roiData.pipesValvesFlanges, roiData.electricalCablesAccessories, roiData.pccMccPanels, roiData.chimneyDucting, roiData.coolingTower, roiData.dieselGenerator, roiData.qualityControlEquipment, roiData.thermicFluid, roiData.expansionStructure, roiData.craneHireCharges, roiData.laborErectionCommissioning, roiData.tanks, roiData.utilities]);

  // Calculate annual depreciation
  const annualDepreciation = React.useMemo(() => {
    const method = roiData.depreciationMethod || 'straight-line';
    const depreciableAssets = financingCosts.totalInvestment - (parseFloat(roiData.plotCost) || 0); // Land is not depreciable
    
    switch (method) {
      case 'straight-line':
        return depreciableAssets / 10; // 10-year straight line
      case 'declining-balance':
        return depreciableAssets * 0.20; // 20% declining balance (first year)
      case 'none':
        return 0;
      default:
        return depreciableAssets / 10;
    }
  }, [financingCosts.totalInvestment, roiData.depreciationMethod, roiData.plotCost]);

  const calculateROI = () => {
    // Ensure tanks and utilities are calculated and stored
    const plantCapacityLPH = parseFloat(roiData.capacity) || 0;
    
    // Calculate tanks if not already stored
    if (!roiData.tanks || roiData.tanks.length === 0) {
      const calculatedTanks = calculateTanks(plantCapacityLPH);
      updateData('tanks', calculatedTanks);
    }
    
    // Calculate utilities if not already stored
    if (!roiData.utilities || roiData.utilities.length === 0) {
      const calculatedUtilitiesData = calculateUtilities(plantCapacityLPH);
      updateData('utilities', calculatedUtilitiesData);
    }
    
    // Calculate total project investment from all steps
    const baseCost = parseFloat(roiData.projectCostLocal) || 0;
    const additionalCosts = [
      parseFloat(roiData.freightInsurance) || 0,
      parseFloat(roiData.importDutyVAT) || 0,
      parseFloat(roiData.plotCost) || 0,
      parseFloat(roiData.civilCost) || 0,
      parseFloat(roiData.refineryShed) || 0,
      parseFloat(roiData.utilityShed) || 0,
      parseFloat(roiData.officeBuilding) || 0,
      parseFloat(roiData.fireSuppression) || 0,
      parseFloat(roiData.insulation) || 0,
      parseFloat(roiData.legalFees) || 0,
      parseFloat(roiData.preFormationExpenses) || 0,
      parseFloat(roiData.commissioningTravel) || 0,
      parseFloat(roiData.contingency) || 0
    ].reduce((sum, cost) => sum + cost, 0);
    
    const equipmentCosts = [
      parseFloat(roiData.pumpsCost) || 0,
      parseFloat(roiData.transmittersCost) || 0,
      parseFloat(roiData.electricalCost) || 0,
      parseFloat(roiData.mechanicalCost) || 0,
      parseFloat(roiData.commissioningCost) || 0
    ].reduce((sum, cost) => sum + cost, 0);
    
    const tankCosts = (roiData.tanks || []).reduce((total, tank) => {
      return total + (parseFloat(tank.totalCost) || 0);
    }, 0);
    const utilityCosts = (roiData.utilities || []).reduce((total, utility) => {
      return total + (parseFloat(utility.totalCost) || 0);
    }, 0);
    const workingCapital = parseFloat(roiData.workingCapitalRequirement) || 0;
    
    // For total investment calculation - include working capital for financial analysis
    const totalInvestment = baseCost + additionalCosts + equipmentCosts + tankCosts + utilityCosts + workingCapital;
    
    // For payback calculation - exclude working capital if it's gross payback (no financing/depreciation)
    const capitalInvestmentOnly = baseCost + additionalCosts + equipmentCosts + tankCosts + utilityCosts;

    // Calculate annual revenue and costs
    const plantCapacity = parseFloat(roiData.capacity) || 0;
    const operatingDays = parseFloat(roiData.plantOperationDays) || 30;
    const annualLiters = plantCapacity * operatingDays * 24 * 12; // Monthly × 12 months
    
    const products = [
      { yield: parseFloat(roiData.naphthaGasOilYield) || 0, price: parseFloat(roiData.naphthaGasOilPrice) || 0, density: 0.80 },
      { yield: parseFloat(roiData.lightBaseOilYield) || 0, price: parseFloat(roiData.lightBaseOilPrice) || 0, density: 0.85 },
      { yield: parseFloat(roiData.heavyBaseOilYield) || 0, price: parseFloat(roiData.heavyBaseOilPrice) || 0, density: 0.87 },
      { yield: parseFloat(roiData.residueYield) || 0, price: parseFloat(roiData.residuePrice) || 0, density: 1.8 },
      { yield: parseFloat(roiData.wasteWaterYield) || 0, price: parseFloat(roiData.wasteWaterPrice) || 0, density: 1.0 }
    ];
    
    const totalRevenue = products.reduce((total, product, index) => {
      const productLiters = annualLiters * product.yield / 100;
      const productTons = productLiters * product.density / 1000;
      const revenue = productTons * product.price;
      console.log(`Product ${index + 1}: Yield=${product.yield}%, Price=£${product.price}/ton, Density=${product.density}`);
      console.log(`  Liters: ${productLiters}, Tons: ${productTons}, Revenue: £${revenue}`);
      return total + revenue;
    }, 0);

    // Calculate annual operating costs - CORRECTED CALCULATION
    const operatingDaysPerMonth = parseFloat(roiData.plantOperationDays) || 25;
    const feedstockCostPerLiter = parseFloat(roiData.feedstockCost) || 0;
    const annualFeedstockCost = feedstockCostPerLiter * plantCapacity * 24 * operatingDaysPerMonth * 12; // Annual feedstock cost
    
    console.log('🔍 FEEDSTOCK COST DEBUG:');
    console.log('Raw feedstock cost:', roiData.feedstockCost);
    console.log('Parsed feedstock cost per liter:', feedstockCostPerLiter);
    console.log('Plant capacity:', plantCapacity);
    console.log('Operating days per month:', operatingDaysPerMonth);
    console.log('Annual feedstock cost:', annualFeedstockCost);
    
    const annualOperatingCosts = [
      annualFeedstockCost, // Already annual - don't multiply by 12 again
      (parseFloat(roiData.powerCost) || 0) * 12, // Monthly costs × 12 months
      (parseFloat(roiData.fuelCost) || 0) * 12,
      (parseFloat(roiData.chemicalCost) || 0) * 12,
      (parseFloat(roiData.mediaCost) || 0) * 12,
      (parseFloat(roiData.laborCost) || 0) * 12,
      (parseFloat(roiData.maintenanceCost) || 0) * 12,
      (parseFloat(roiData.transportationCost) || 0) * 12,
      (parseFloat(roiData.vehicleMaintenanceCost) || 0) * 12,
      (parseFloat(roiData.miscellaneousCost) || 0) * 12
    ].reduce((sum, cost) => sum + cost, 0);

    // Calculate comprehensive financial metrics including financing costs and depreciation
    const grossProfit = totalRevenue - annualOperatingCosts;
    
    // Apply financing costs toggle logic
    const actualFinancingCosts = roiData.includeFinancingCosts !== false ? financingCosts.annualFinancingCosts : 0;
    
    // Calculate net profit after financing costs and depreciation (respecting toggles)
    const netProfitBeforeDepreciation = grossProfit - actualFinancingCosts;
    const actualDepreciation = roiData.includeDepreciation ? annualDepreciation : 0;
    const netProfit = netProfitBeforeDepreciation - actualDepreciation;
    
    // Debug revenue and cost calculations
    console.log('🔍 REVENUE & COST DEBUG:');
    console.log('Plant Capacity:', plantCapacity);
    console.log('Operating Days per Month:', operatingDays);
    console.log('Annual Liters:', annualLiters);
    console.log('Total Revenue:', totalRevenue);
    console.log('Annual Operating Costs:', annualOperatingCosts);
    console.log('Gross Profit:', grossProfit);
    console.log('Actual Financing Costs:', actualFinancingCosts);
    console.log('Net Profit Before Depreciation:', netProfitBeforeDepreciation);
    console.log('Actual Depreciation:', actualDepreciation);
    
    // EBITDA (Earnings Before Interest, Taxes, Depreciation, Amortization)
    const ebitda = grossProfit;
    
    // Calculate cash flow for payback period based on what's included
    // For gross payback (no financing/depreciation), use net profit directly
    // For other cases, use net profit + depreciation (if included) since depreciation is non-cash
    const cashFlowForPayback = (!roiData.includeFinancingCosts && !roiData.includeDepreciation) ? 
      netProfit : // Use net profit directly for gross payback
      netProfit + actualDepreciation; // Add back depreciation for financing/depreciation scenarios
    
    // Calculate financial metrics
    // For gross payback, exclude working capital from the investment base
    const investmentForPayback = (!roiData.includeFinancingCosts && !roiData.includeDepreciation) ? 
      capitalInvestmentOnly : // Gross payback uses capital investment only
      totalInvestment; // Include working capital for financing/depreciation analysis
    
    // Debug the payback calculation
    console.log('🔍 PAYBACK DEBUG:');
    console.log('Net Profit:', netProfit);
    console.log('Capital Investment Only:', capitalInvestmentOnly);
    console.log('Total Investment:', totalInvestment);
    console.log('Include Financing Costs:', roiData.includeFinancingCosts);
    console.log('Include Depreciation:', roiData.includeDepreciation);
    console.log('Cash Flow for Payback:', cashFlowForPayback);
    console.log('Investment for Payback:', investmentForPayback);
    console.log('Raw Payback Period (years):', investmentForPayback / cashFlowForPayback);
    
    const paybackPeriod = investmentForPayback > 0 && cashFlowForPayback > 0 ? investmentForPayback / cashFlowForPayback : 0;
    

    

    const annualROI = totalInvestment > 0 ? (netProfit / totalInvestment) * 100 : 0;
    
    // Return on Equity (using equity portion only)
    const returnOnEquity = financingCosts.equityAmount > 0 ? (netProfit / financingCosts.equityAmount) * 100 : 0;
    
    // Enhanced NPV calculation using net profit (5 years, 10% discount rate)
    const discountRate = 0.10;
    let npv = -financingCosts.equityAmount; // Only equity investment as cash outflow
    for (let year = 1; year <= 5; year++) {
      npv += netProfit / Math.pow(1 + discountRate, year);
    }
    
    // Simple IRR approximation
    const irr = totalInvestment > 0 ? ((Math.pow(totalRevenue / totalInvestment, 1/5) - 1) * 100) : 0;
    
    setROIData(prev => ({
      ...prev,
      paybackPeriod: paybackPeriod > 0 ? Math.round(paybackPeriod * 100) / 100 : 0,
      paybackPeriodMonths: paybackPeriod > 0 ? Math.round(paybackPeriod * 12 * 10) / 10 : 0,
      annualROI: Math.round(annualROI * 100) / 100,
      returnOnEquity: Math.round(returnOnEquity * 100) / 100,
      grossProfit: Math.round(grossProfit),
      netProfit: Math.round(netProfit),
      ebitda: Math.round(ebitda),
      annualFinancingCosts: Math.round(actualFinancingCosts),
      annualDepreciation: Math.round(annualDepreciation),
      debtAmount: Math.round(financingCosts.debtAmount),
      equityAmount: Math.round(financingCosts.equityAmount),
      npv: Math.round(npv),
      irr: Math.round(irr * 100) / 100
    }));

    // Ensure tanks and utilities are stored in roiData before moving to results
    const currentTanks = roiData.tanks || calculateTanks(plantCapacityLPH);
    const currentUtilities = roiData.utilities || calculateUtilities(plantCapacityLPH);
    
    if (!roiData.tanks) {
      updateData('tanks', currentTanks);
    }
    if (!roiData.utilities) {
      updateData('utilities', currentUtilities);
    }
    
    // Move to results step
    setCurrentStep(7);
    
    toast({
      title: "ROI Calculation Complete",
      description: "Investment analysis has been generated successfully.",
    });
  };

  const nextStep = async () => {
    if (currentStep < 7) {
      // Auto-save current step before moving to next
      try {
        const currentStepData = getCurrentStepData();
        await saveStepData(currentStep, currentStepData);
      } catch (error) {
        // Continue navigation even if save fails
        console.error('Save failed during navigation:', error);
      }
      
      setCurrentStep(Math.min(currentStep + 1, 7));
      
      if (currentStep === 5) {
        calculateROI();
      }
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Load saved project data
  const loadProject = async (projectIdToLoad: string) => {
    try {
      console.log('Loading project:', projectIdToLoad);
      const response = await fetch(`/api/roi/load-project/${projectIdToLoad}`, {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Load response:', data);
        
        if (data.success && data.steps) {
          // Merge step data back into roiData
          const mergedData = { ...roiData };
          Object.values(data.steps).forEach((stepData: any) => {
            Object.assign(mergedData, stepData);
          });
          
          // Ensure toggle states are properly handled - if not explicitly saved as false, they should default to true
          if (mergedData.includeDepreciation === undefined) {
            mergedData.includeDepreciation = true;
          }
          if (mergedData.includeFinancingCosts === undefined) {
            mergedData.includeFinancingCosts = true;
          }
          
          // Set the project ID for future saves
          mergedData.roiProjectId = projectIdToLoad;
          
          console.log('Setting merged data:', mergedData);
          setROIData(mergedData);
          setProjectId(projectIdToLoad);
          setCompletedSteps(new Set(Object.keys(data.steps).map(Number)));
          
          // Navigate to the next incomplete step (Step 6 for 5 completed steps)
          const completedStepNumbers = Object.keys(data.steps).map(Number).sort();
          const nextStep = Math.min(Math.max(...completedStepNumbers) + 1, 7);
          console.log('Setting current step to:', nextStep);
          setCurrentStep(nextStep);
          
          setShowLoadDialog(false);
          setLoadProjectId('');
          setSelectedProjectFromList('');
          
          toast({
            title: "Project Loaded Successfully",
            description: `Loaded "${mergedData.customerName} - ${mergedData.projectName}" with ${completedStepNumbers.length} completed steps. Moving to Step ${nextStep}.`,
          });
        } else {
          console.error('Invalid response structure:', data);
          throw new Error(data.error || 'Invalid response from server');
        }
      } else {
        const errorData = await response.json();
        console.error('Load failed with status:', response.status, errorData);
        throw new Error(errorData.message || 'Failed to load project');
      }
    } catch (error) {
      console.error('Error loading project:', error);
      setShowLoadDialog(false);
      toast({
        title: "Load Failed",
        description: error instanceof Error ? error.message : "Failed to load project data",
        variant: "destructive",
      });
    }
  };

  const downloadReport = async (format: 'pdf' | 'excel') => {
    try {
      console.log('Starting comprehensive report generation for format:', format);
      
      // Validate critical data before proceeding
      if (!roiData.capacity || !roiData.currency) {
        alert('Please complete Step 1 (Plant Configuration) before generating reports.');
        return;
      }
      
      if (format === 'pdf') {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF('p', 'mm', 'a4');
        
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 20; // Left/Right margins: 20mm
        const topMargin = 25; // Top margin: 25mm
        const bottomMargin = 25; // Bottom margin: 25mm
        let yPos = topMargin;

        // Helper function to check if we need a new page - enhanced chart safety margins
        const checkPageBreak = (requiredSpace: number, isChart: boolean = false) => {
          if (isChart) {
            // For charts: ensure 90mm height + 20mm spacing + 15mm safety buffer from bottom edge
            const chartSafetyBuffer = 15; // Additional safety margin for charts
            const spaceNeeded = standardChartHeight + 20 + chartSafetyBuffer; // 125mm total
            
            if (yPos + spaceNeeded > pageHeight - bottomMargin) {
              doc.addPage();
              yPos = topMargin;
              return true;
            }
          } else {
            // For regular content: standard page break logic
            if (yPos + requiredSpace > pageHeight - bottomMargin) {
              doc.addPage();
              yPos = topMargin;
              return true;
            }
          }
          return false;
        };

        // Calculate comprehensive financial data
        const plantCapacity = parseFloat(roiData.capacity) || 0;
        const annualLiters = plantCapacity * 24 * 365;
        
        // Investment breakdown
        const plantCost = parseFloat(roiData.projectCostUSD) || 0;
        const tankCosts = (roiData.tanks || []).reduce((total, tank) => {
          const tankPrice = tankPrices.find(p => p.capacity === tank.suggestedTankSize)?.priceUSD || 0;
          return total + (tankPrice * tank.suggestedQuantity);
        }, 0);
        
        const additionalCosts = [
          parseFloat(roiData.additionalPumpsFilters) || 0,
          parseFloat(roiData.tankLevelTransmitters) || 0,
          parseFloat(roiData.pipesValvesFlanges) || 0,
          parseFloat(roiData.electricalCablesAccessories) || 0,
          parseFloat(roiData.pccMccPanels) || 0,
          parseFloat(roiData.chimneyDucting) || 0,
          parseFloat(roiData.coolingTower) || 0,
          parseFloat(roiData.dieselGenerator) || 0,
          parseFloat(roiData.qualityControlEquipment) || 0,
          parseFloat(roiData.thermicFluid) || 0,
          parseFloat(roiData.expansionStructure) || 0,
          parseFloat(roiData.craneHireCharges) || 0,
          parseFloat(roiData.laborErectionCommissioning) || 0
        ].reduce((sum, cost) => sum + cost, 0);

        const otherCosts = [
          parseFloat(roiData.freightInsurance) || 0,
          parseFloat(roiData.importDutyVAT) || 0,
          parseFloat(roiData.plotCost) || 0,
          parseFloat(roiData.civilCost) || 0,
          parseFloat(roiData.refineryShed) || 0,
          parseFloat(roiData.utilityShed) || 0,
          parseFloat(roiData.officeBuilding) || 0,
          parseFloat(roiData.legalFees) || 0,
          parseFloat(roiData.preFormationExpenses) || 0,
          parseFloat(roiData.commissioningTravel) || 0,
          parseFloat(roiData.contingency) || 0
        ].reduce((sum, cost) => sum + cost, 0);

        const totalInvestment = plantCost + tankCosts + additionalCosts + otherCosts;

        // Revenue calculation
        const products = [
          { name: 'Light Base Oil', yield: parseFloat(roiData.lightBaseOilYield) || 0, price: parseFloat(roiData.lightBaseOilPrice) || 0 },
          { name: 'Heavy Base Oil', yield: parseFloat(roiData.heavyBaseOilYield) || 0, price: parseFloat(roiData.heavyBaseOilPrice) || 0 },
          { name: 'Naphtha/Gas Oil', yield: parseFloat(roiData.naphthaGasOilYield) || 0, price: parseFloat(roiData.naphthaGasOilPrice) || 0 },
          { name: 'Residue', yield: parseFloat(roiData.residueYield) || 0, price: parseFloat(roiData.residuePrice) || 0 },
          { name: 'Waste Water', yield: parseFloat(roiData.wasteWaterYield) || 0, price: parseFloat(roiData.wasteWaterPrice) || 0 }
        ];

        const totalRevenue = products.reduce((sum, product) => {
          const tons = (annualLiters * product.yield / 100) / 1000;
          return sum + (tons * product.price);
        }, 0);

        // Operating costs - calculate actual monthly costs
        const feedstockCostPerLiter = parseFloat(roiData.feedstockCost) || 3;
        const chemicalCostPerLiter = parseFloat(roiData.chemicalCost) || 0.005;
        const operatingDaysPerMonth = parseFloat(roiData.plantOperationDays) || 25;
        
        const monthlyFeedstockCost = feedstockCostPerLiter * plantCapacity * 24 * operatingDaysPerMonth;
        const monthlyChemicalCost = chemicalCostPerLiter * plantCapacity * 24 * operatingDaysPerMonth;
        
        const operatingCosts = [
          monthlyFeedstockCost,
          parseFloat(roiData.powerCost) || 0,
          parseFloat(roiData.fuelCost) || 0,
          parseFloat(roiData.chemicalCost) || 0,
          parseFloat(roiData.laborCost) || 0,
          parseFloat(roiData.maintenanceCost) || 0
        ].reduce((sum, cost) => sum + cost, 0) * 12;

        const annualProfit = totalRevenue - operatingCosts;
        const paybackPeriod = totalInvestment > 0 ? totalInvestment / annualProfit : 0;
        const annualROI = totalInvestment > 0 ? (annualProfit / totalInvestment) * 100 : 0;

        // Header with gradient background
        doc.setFillColor(41, 128, 185);
        doc.rect(0, 0, pageWidth, 40, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('THERMOPAC ROI ANALYSIS REPORT', pageWidth/2, 20, { align: 'center' });
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generated on ${new Date().toLocaleDateString()}`, pageWidth/2, 30, { align: 'center' });
        
        yPos = 50;
        doc.setTextColor(0, 0, 0);

        // Start directly with detailed tabular sections
        yPos = 50;

        // Define currency conversion rate early in the PDF generation
        const exchangeRate = currencies[roiData.currency]?.rate || 1;

        // Helper function to get tank price from database
        const getTankPriceFromData = (tankSize) => {
          const tankPrice = tankPrices.find(tp => tp.capacity === tankSize);
          return tankPrice ? tankPrice.priceUSD : 0;
        };

        // Define equipment items array for later use in Step 3 section
        const equipmentItems = [
          { label: 'Additional Pumps, Filters & Cooler', value: roiData.additionalPumpsFilters },
          { label: 'Tank Level Transmitters & Accessories', value: roiData.tankLevelTransmitters },
          { label: 'Pipes, Valves & Flanges', value: roiData.pipesValvesFlanges },
          { label: 'Electrical Cables & Accessories', value: roiData.electricalCablesAccessories },
          { label: 'PCC & MCC Panels', value: roiData.pccMccPanels },
          { label: 'Chimney & Ducting', value: roiData.chimneyDucting },
          { label: 'Cooling Tower', value: roiData.coolingTower },
          { label: 'Diesel Generator', value: roiData.dieselGenerator },
          { label: 'Quality Control Equipment', value: roiData.qualityControlEquipment },
          { label: 'Thermic Fluid', value: roiData.thermicFluid },
          { label: 'Expansion & Structure', value: roiData.expansionStructure },
          { label: 'Crane Hire Charges', value: roiData.craneHireCharges },
          { label: 'Labor Erection & Commissioning', value: roiData.laborErectionCommissioning }
        ];

        // Define additional cost items array for later use in Step 1 section
        const additionalCostItems = [
          { label: 'Freight & Insurance', value: roiData.freightInsurance },
          { label: 'Import Duty & VAT', value: roiData.importDutyVAT },
          { label: 'Plot Cost', value: roiData.plotCost },
          { label: 'Civil Cost', value: roiData.civilCost },
          { label: 'Refinery Shed', value: roiData.refineryShed },
          { label: 'Utility Shed', value: roiData.utilityShed },
          { label: 'Office Building', value: roiData.officeBuilding },
          { label: 'Fire Suppression', value: roiData.fireSuppression },
          { label: 'Insulation', value: roiData.insulation },
          { label: 'Legal Fees', value: roiData.legalFees },
          { label: 'Pre Formation Expenses', value: roiData.preFormationExpenses },
          { label: 'Commissioning & Travel', value: roiData.commissioningTravel },
          { label: 'Contingency', value: roiData.contingency }
        ];



        // Project Cost Breakdown Section (Step 1)
        checkPageBreak(150);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 102, 204);
        doc.text('PROJECT COST BREAKDOWN (STEP 1)', margin, yPos);
        yPos += 15;

        // Project Information
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text('Project Information', margin, yPos);
        yPos += 8;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Project Name: ${roiData.projectName || 'Not specified'}`, margin, yPos);
        yPos += 6;
        doc.text(`Customer Name: ${roiData.customerName || 'Not specified'}`, margin, yPos);
        yPos += 6;
        doc.text(`Plant Capacity: ${roiData.capacity || 0} LPH`, margin, yPos);
        yPos += 6;
        doc.text(`Selected Currency: ${roiData.currency || 'USD'}`, margin, yPos);
        yPos += 10;

        // Base Plant Cost
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Base Plant Cost', margin, yPos);
        yPos += 8;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const baseProjectCostUSD = parseFloat(roiData.projectCostUSD) || 0;
        const baseProjectCostLocal = parseFloat(roiData.projectCostLocal) || 0;
        doc.text(`Base Plant Cost (USD): ${baseProjectCostUSD.toLocaleString()}`, margin, yPos);
        yPos += 6;
        doc.text(`Base Plant Cost (${roiData.currency || 'USD'}): ${baseProjectCostLocal.toLocaleString()}`, margin, yPos);
        yPos += 10;

        // Additional Project Costs Table
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Additional Project Costs', margin, yPos);
        yPos += 10;

        // Create table for additional project costs
        const projectCosts = [
          { label: 'Freight & Insurance', value: parseFloat(roiData.freightInsurance) || 0 },
          { label: 'Import Duty & VAT', value: parseFloat(roiData.importDutyVAT) || 0 },
          { label: 'Plot Cost', value: parseFloat(roiData.plotCost) || 0 },
          { label: 'Civil Cost', value: parseFloat(roiData.civilCost) || 0 },
          { label: 'Refinery Shed', value: parseFloat(roiData.refineryShed) || 0 },
          { label: 'Utility Shed', value: parseFloat(roiData.utilityShed) || 0 },
          { label: 'Office Building', value: parseFloat(roiData.officeBuilding) || 0 },
          { label: 'Mechanical & Electrical', value: parseFloat(roiData.mechanicalElectrical) || 0 },
          { label: 'Fire Suppression System', value: parseFloat(roiData.fireSuppressionSystem) || 0 },
          { label: 'Insulation Cost', value: parseFloat(roiData.insulationCost) || 0 },
          { label: 'Legal Fees', value: parseFloat(roiData.legalFees) || 0 },
          { label: 'Pre Formation Expenses', value: parseFloat(roiData.preFormationExpenses) || 0 },
          { label: 'Commissioning & Travel', value: parseFloat(roiData.commissioningTravel) || 0 },
          { label: 'Contingency', value: parseFloat(roiData.contingency) || 0 }
        ];

        // Table headers
        const costTableHeaders = ['Cost Component', `Amount (${roiData.currency || 'USD'})`];
        const costColWidths = [120, 50];
        const costRowHeight = 10;
        let costTableX = margin;
        let costTableY = yPos;

        // Draw header row
        let costHeaderX = costTableX;
        costTableHeaders.forEach((header, colIndex) => {
          doc.setFillColor(240, 240, 240);
          doc.rect(costHeaderX, costTableY, costColWidths[colIndex], costRowHeight, 'F');
          doc.rect(costHeaderX, costTableY, costColWidths[colIndex], costRowHeight);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text(header, costHeaderX + 2, costTableY + 7);
          costHeaderX += costColWidths[colIndex];
        });
        costTableY += costRowHeight;

        // Draw cost rows
        doc.setFont('helvetica', 'normal');
        let totalAdditionalCosts = 0;
        projectCosts.forEach((cost, rowIndex) => {
          if (cost.value > 0) { // Only show non-zero costs
            let cellX = costTableX;
            
            // Cost component name
            doc.rect(cellX, costTableY, costColWidths[0], costRowHeight);
            doc.setFontSize(8);
            doc.text(cost.label, cellX + 2, costTableY + 7);
            cellX += costColWidths[0];
            
            // Cost amount (right-aligned)
            doc.rect(cellX, costTableY, costColWidths[1], costRowHeight);
            const costValueText = cost.value.toLocaleString();
            const costValueWidth = doc.getTextWidth(costValueText);
            doc.text(costValueText, cellX + costColWidths[1] - costValueWidth - 2, costTableY + 7);
            
            costTableY += costRowHeight;
            totalAdditionalCosts += cost.value;

            // Check for page break
            if (costTableY > pageHeight - 50) {
              doc.addPage();
              costTableY = margin + 20;
              yPos = costTableY;
            }
          }
        });

        // Total row
        let cellX = costTableX;
        doc.setFillColor(230, 230, 230);
        doc.rect(cellX, costTableY, costColWidths[0], costRowHeight, 'F');
        doc.rect(cellX, costTableY, costColWidths[0], costRowHeight);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('Total Additional Costs', cellX + 2, costTableY + 7);
        cellX += costColWidths[0];

        doc.setFillColor(230, 230, 230);
        doc.rect(cellX, costTableY, costColWidths[1], costRowHeight, 'F');
        doc.rect(cellX, costTableY, costColWidths[1], costRowHeight);
        const totalText = totalAdditionalCosts.toLocaleString();
        const totalWidth = doc.getTextWidth(totalText);
        doc.text(totalText, cellX + costColWidths[1] - totalWidth - 2, costTableY + 7);
        costTableY += costRowHeight;

        yPos = costTableY + 10;

        // Project Cost Summary
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 102, 204);
        doc.text('Step 1 Cost Summary', margin, yPos);
        yPos += 8;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        const totalStep1Cost = baseProjectCostLocal + totalAdditionalCosts;
        doc.text(`Base Plant Cost: ${roiData.currency || 'USD'} ${baseProjectCostLocal.toLocaleString()}`, margin, yPos);
        yPos += 6;
        doc.text(`Additional Costs: ${roiData.currency || 'USD'} ${totalAdditionalCosts.toLocaleString()}`, margin, yPos);
        yPos += 6;
        doc.setFont('helvetica', 'bold');
        doc.text(`Total Step 1 Investment: ${roiData.currency || 'USD'} ${totalStep1Cost.toLocaleString()}`, margin, yPos);
        yPos += 15;

        // Tank Farm & Utilities Cost Breakdown Section
        checkPageBreak(120);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 102, 204);
        doc.text('TANK FARM & UTILITIES COST BREAKDOWN', margin, yPos);
        yPos += 15;

        // Tank Farm Table
        if (roiData.tanks && roiData.tanks.length > 0) {
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 0, 0);
          doc.text('Tank Farm Details', margin, yPos);
          yPos += 10;

          // Table headers
          const tankTableHeaders = [
            'Tank Description',
            '% Capacity',
            'Storage Days',
            'Required (KL)',
            'Tank Size (KL)',
            'Quantity',
            `Cost/Tank (${roiData.currency || 'USD'})`,
            `Total Cost (${roiData.currency || 'USD'})`
          ];

          const tankColWidths = [35, 18, 18, 18, 18, 15, 25, 25];
          const tankRowHeight = 12;
          let tankTableX = margin;
          let tankTableY = yPos;

          // Draw header row
          let headerX = tankTableX;
          tankTableHeaders.forEach((header, colIndex) => {
            doc.setFillColor(240, 240, 240);
            doc.rect(headerX, tankTableY, tankColWidths[colIndex], tankRowHeight, 'F');
            doc.rect(headerX, tankTableY, tankColWidths[colIndex], tankRowHeight);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.text(header, headerX + 1, tankTableY + 8, { maxWidth: tankColWidths[colIndex] - 2 });
            headerX += tankColWidths[colIndex];
          });
          tankTableY += tankRowHeight;



          // Draw data rows
          doc.setFont('helvetica', 'normal');
          roiData.tanks.forEach((tank, rowIndex) => {
            if (tank.suggestedQuantity > 0) {
              let cellX = tankTableX;
              
              // Calculate costs with proper currency conversion
              const tankPriceUSD = getTankPriceFromData(tank.suggestedTankSize);
              const costPerTankLocal = tankPriceUSD * exchangeRate;
              const totalCostLocal = costPerTankLocal * tank.suggestedQuantity;
              
              const rowData = [
                tank.description || '',
                tank.percentCapacity?.toString() || '',
                tank.storageDays?.toString() || '',
                Math.round(tank.requiredKL || 0).toString(),
                tank.suggestedTankSize?.toString() || '',
                tank.suggestedQuantity?.toString() || '',
                costPerTankLocal > 0 ? Math.round(costPerTankLocal).toLocaleString() : '0',
                totalCostLocal > 0 ? Math.round(totalCostLocal).toLocaleString() : '0'
              ];

              rowData.forEach((cellData, colIndex) => {
                doc.rect(cellX, tankTableY, tankColWidths[colIndex], tankRowHeight);
                doc.setFontSize(7);
                
                // Right-align numerical columns (% Capacity, Storage Days, Required KL, Tank Size, Quantity, Cost/Tank, Total Cost)
                if (colIndex >= 1 && cellData) {
                  const textWidth = doc.getTextWidth(cellData);
                  doc.text(cellData, cellX + tankColWidths[colIndex] - textWidth - 1, tankTableY + 8);
                } else {
                  // Left-align Tank Description
                  doc.text(cellData, cellX + 1, tankTableY + 8, { maxWidth: tankColWidths[colIndex] - 2 });
                }
                cellX += tankColWidths[colIndex];
              });
              tankTableY += tankRowHeight;

              // Check for page break
              if (tankTableY > pageHeight - 50) {
                doc.addPage();
                tankTableY = margin + 20;
                yPos = tankTableY;
              }
            }
          });

          yPos = tankTableY + 15;
        }

        // Utilities Table - Calculate utilities with proper currency conversion
        const calculatedUtilities = [
          {
            description: "Compressor",
            specification: `${Math.round((parseFloat(roiData.capacity) || 0) * 20 / 1000)} HP`,
            quantity: 1,
            unitCostUSD: Math.round((parseFloat(roiData.capacity) || 0) * 20 / 1000) * 500, // $500 per HP
            totalCostUSD: Math.round((parseFloat(roiData.capacity) || 0) * 20 / 1000) * 500
          },
          {
            description: "Heater",
            specification: `${Math.round((parseFloat(roiData.capacity) || 0) * 600)} Kcal/hr`,
            quantity: (parseFloat(roiData.capacity) || 0) >= 3000 ? 2 : 1,
            unitCostUSD: Math.round((parseFloat(roiData.capacity) || 0) * 600) * 0.050, // $0.050 per Kcal/hr
            totalCostUSD: Math.round((parseFloat(roiData.capacity) || 0) * 600) * 0.050 * ((parseFloat(roiData.capacity) || 0) >= 3000 ? 2 : 1)
          },
          {
            description: "Total Connected Load",
            specification: `${Math.round((parseFloat(roiData.capacity) || 0) * 350 / 1000)} KW`,
            quantity: 1,
            unitCostUSD: 0, // $0 cost for power estimation only
            totalCostUSD: 0
          }
        ];

        if (calculatedUtilities && calculatedUtilities.length > 0) {
          checkPageBreak(80);
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 0, 0);
          doc.text('Utilities & Equipment Details', margin, yPos);
          yPos += 10;

          // Utilities table headers
          const utilityTableHeaders = [
            'Equipment',
            'Specifications',
            'Quantity',
            `Unit Cost (${roiData.currency || 'USD'})`,
            `Total Cost (${roiData.currency || 'USD'})`
          ];

          const utilityColWidths = [40, 50, 20, 30, 30];
          const utilityRowHeight = 12;
          let utilityTableX = margin;
          let utilityTableY = yPos;

          // Draw header row
          let utilHeaderX = utilityTableX;
          utilityTableHeaders.forEach((header, colIndex) => {
            doc.setFillColor(240, 240, 240);
            doc.rect(utilHeaderX, utilityTableY, utilityColWidths[colIndex], utilityRowHeight, 'F');
            doc.rect(utilHeaderX, utilityTableY, utilityColWidths[colIndex], utilityRowHeight);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text(header, utilHeaderX + 1, utilityTableY + 8, { maxWidth: utilityColWidths[colIndex] - 2 });
            utilHeaderX += utilityColWidths[colIndex];
          });
          utilityTableY += utilityRowHeight;

          // Draw utilities data with currency conversion
          doc.setFont('helvetica', 'normal');
          calculatedUtilities.forEach((utility, rowIndex) => {
            let cellX = utilityTableX;
            
            // Apply currency conversion
            const unitCostLocal = utility.unitCostUSD * exchangeRate;
            const totalCostLocal = utility.totalCostUSD * exchangeRate;
            
            const utilityRowData = [
              utility.description || '',
              utility.specification || '',
              utility.quantity?.toString() || '',
              unitCostLocal > 0 ? Math.round(unitCostLocal).toLocaleString() : '0',
              totalCostLocal > 0 ? Math.round(totalCostLocal).toLocaleString() : '0'
            ];

            utilityRowData.forEach((cellData, colIndex) => {
              doc.rect(cellX, utilityTableY, utilityColWidths[colIndex], utilityRowHeight);
              doc.setFontSize(8);
              
              // Right-align numerical columns (Quantity, Unit Cost, Total Cost)
              if (colIndex >= 2 && cellData) {
                const textWidth = doc.getTextWidth(cellData);
                doc.text(cellData, cellX + utilityColWidths[colIndex] - textWidth - 1, utilityTableY + 8);
              } else {
                // Left-align text columns (Equipment, Specifications)
                doc.text(cellData, cellX + 1, utilityTableY + 8, { maxWidth: utilityColWidths[colIndex] - 2 });
              }
              cellX += utilityColWidths[colIndex];
            });
            utilityTableY += utilityRowHeight;

            // Check for page break
            if (utilityTableY > pageHeight - 50) {
              doc.addPage();
              utilityTableY = margin + 20;
              yPos = utilityTableY;
            }
          });

          yPos = utilityTableY + 15;
        }

        // Tank Farm & Utilities Summary
        checkPageBreak(40);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 102, 204);
        doc.text('Tank Farm & Utilities Summary', margin, yPos);
        yPos += 10;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        
        // Calculate tank total cost with proper currency conversion
        const tankTotalCost = (roiData.tanks || []).reduce((sum, tank) => {
          if (tank.suggestedQuantity > 0) {
            const tankPriceUSD = getTankPriceFromData(tank.suggestedTankSize);
            const totalCostLocal = tankPriceUSD * tank.suggestedQuantity * exchangeRate;
            return sum + totalCostLocal;
          }
          return sum;
        }, 0);
        
        // Calculate utility total cost (excluding Total Connected Load)
        const utilityTotalCost = calculatedUtilities
          .filter(u => u.description !== 'Total Connected Load')
          .reduce((sum, utility) => sum + (utility.totalCostUSD * exchangeRate), 0);
        
        const combinedTotal = tankTotalCost + utilityTotalCost;

        doc.text(`Total Tank Farm Cost: ${roiData.currency || 'USD'} ${tankTotalCost.toLocaleString()}`, margin, yPos);
        yPos += 6;
        doc.text(`Total Utilities Cost: ${roiData.currency || 'USD'} ${utilityTotalCost.toLocaleString()}`, margin, yPos);
        yPos += 6;
        doc.setFont('helvetica', 'bold');
        doc.text(`Combined Tank Farm & Utilities: ${roiData.currency || 'USD'} ${combinedTotal.toLocaleString()}`, margin, yPos);
        yPos += 15;

        // Additional Equipment Cost Breakdown Section (Step 3)
        checkPageBreak(120);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 102, 204);
        doc.text('ADDITIONAL EQUIPMENT BREAKDOWN (STEP 3)', margin, yPos);
        yPos += 15;

        // Additional Equipment Costs Table
        if (roiData.step3Data || Object.keys(roiData).some(key => 
          ['pumpsCentrifugal', 'pumpsPositiveDisplacement', 'pressureTransmitters', 'temperatureTransmitters', 
           'levelTransmitters', 'flowTransmitters', 'motorControlCenter', 'distributionBoard', 
           'pipesValvesFlanges', 'tankLevelTransmitters', 'additionalPumpsFilters', 'qualityControlEquipment',
           'laborErectionCommissioning', 'electricalCablesAccessories'].includes(key))) {
          
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 0, 0);
          doc.text('Additional Equipment Details', margin, yPos);
          yPos += 10;

          // Equipment costs data
          const equipmentCosts = [
            { label: 'Pumps (Centrifugal)', value: parseFloat(roiData.pumpsCentrifugal) || 0 },
            { label: 'Pumps (Positive Displacement)', value: parseFloat(roiData.pumpsPositiveDisplacement) || 0 },
            { label: 'Pressure Transmitters', value: parseFloat(roiData.pressureTransmitters) || 0 },
            { label: 'Temperature Transmitters', value: parseFloat(roiData.temperatureTransmitters) || 0 },
            { label: 'Level Transmitters', value: parseFloat(roiData.levelTransmitters) || 0 },
            { label: 'Flow Transmitters', value: parseFloat(roiData.flowTransmitters) || 0 },
            { label: 'Motor Control Center', value: parseFloat(roiData.motorControlCenter) || 0 },
            { label: 'Distribution Board', value: parseFloat(roiData.distributionBoard) || 0 },
            { label: 'Pipes, Valves & Flanges', value: parseFloat(roiData.pipesValvesFlanges) || 0 },
            { label: 'Tank Level Transmitters', value: parseFloat(roiData.tankLevelTransmitters) || 0 },
            { label: 'Additional Pumps & Filters', value: parseFloat(roiData.additionalPumpsFilters) || 0 },
            { label: 'Quality Control Equipment', value: parseFloat(roiData.qualityControlEquipment) || 0 },
            { label: 'Labor Erection & Commissioning', value: parseFloat(roiData.laborErectionCommissioning) || 0 },
            { label: 'Electrical Cables & Accessories', value: parseFloat(roiData.electricalCablesAccessories) || 0 }
          ];

          // Equipment table headers
          const equipTableHeaders = ['Equipment Component', `Cost (${roiData.currency || 'USD'})`];
          const equipColWidths = [120, 50];
          const equipRowHeight = 10;
          let equipTableX = margin;
          let equipTableY = yPos;

          // Draw header row
          let equipHeaderX = equipTableX;
          equipTableHeaders.forEach((header, colIndex) => {
            doc.setFillColor(240, 240, 240);
            doc.rect(equipHeaderX, equipTableY, equipColWidths[colIndex], equipRowHeight, 'F');
            doc.rect(equipHeaderX, equipTableY, equipColWidths[colIndex], equipRowHeight);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text(header, equipHeaderX + 2, equipTableY + 7);
            equipHeaderX += equipColWidths[colIndex];
          });
          equipTableY += equipRowHeight;

          // Draw equipment rows
          doc.setFont('helvetica', 'normal');
          let totalEquipmentCosts = 0;
          equipmentCosts.forEach((equipment, rowIndex) => {
            if (equipment.value > 0) { // Only show non-zero costs
              let cellX = equipTableX;
              
              // Equipment component name
              doc.rect(cellX, equipTableY, equipColWidths[0], equipRowHeight);
              doc.setFontSize(8);
              doc.text(equipment.label, cellX + 2, equipTableY + 7);
              cellX += equipColWidths[0];
              
              // Equipment cost
              doc.rect(cellX, equipTableY, equipColWidths[1], equipRowHeight);
              const costText = equipment.value.toLocaleString();
              const costWidth = doc.getTextWidth(costText);
              doc.text(costText, cellX + equipColWidths[1] - costWidth - 2, equipTableY + 7);
              
              equipTableY += equipRowHeight;
              totalEquipmentCosts += equipment.value;

              // Check for page break
              if (equipTableY > pageHeight - 50) {
                doc.addPage();
                equipTableY = margin + 20;
                yPos = equipTableY;
              }
            }
          });

          // Total equipment row
          if (totalEquipmentCosts > 0) {
            let cellX = equipTableX;
            doc.setFillColor(230, 230, 230);
            doc.rect(cellX, equipTableY, equipColWidths[0], equipRowHeight, 'F');
            doc.rect(cellX, equipTableY, equipColWidths[0], equipRowHeight);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text('Total Additional Equipment', cellX + 2, equipTableY + 7);
            cellX += equipColWidths[0];

            doc.setFillColor(230, 230, 230);
            doc.rect(cellX, equipTableY, equipColWidths[1], equipRowHeight, 'F');
            doc.rect(cellX, equipTableY, equipColWidths[1], equipRowHeight);
            const totalEquipText = totalEquipmentCosts.toLocaleString();
            const totalEquipWidth = doc.getTextWidth(totalEquipText);
            doc.text(totalEquipText, cellX + equipColWidths[1] - totalEquipWidth - 2, equipTableY + 7);
            equipTableY += equipRowHeight;

            yPos = equipTableY + 10;

            // Step 3 Summary
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 102, 204);
            doc.text('Step 3 Equipment Summary', margin, yPos);
            yPos += 8;

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(0, 0, 0);
            doc.text(`Total Additional Equipment Cost: ${roiData.currency || 'USD'} ${totalEquipmentCosts.toLocaleString()}`, margin, yPos);
            yPos += 15;
          } else {
            yPos = equipTableY + 10;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(100, 100, 100);
            doc.text('No additional equipment costs specified for this project.', margin, yPos);
            yPos += 15;
          }
        }

        // Operating Costs Breakdown Section (Step 4)
        checkPageBreak(100);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 102, 204);
        doc.text('OPERATING COSTS BREAKDOWN (STEP 4)', margin, yPos);
        yPos += 15;

        // Operating costs data for Step 4 - INCLUDING ALL COST FIELDS
        const step4OperatingCosts = [
          { label: 'Feedstock Cost per Liter', value: `${roiData.currency || 'USD'} ${parseFloat(roiData.feedstockCost || '0').toLocaleString()}` },
          { label: 'Power Cost (Monthly)', value: `${roiData.currency || 'USD'} ${parseFloat(roiData.powerCost || '0').toLocaleString()}` },
          { label: 'Fuel Cost (Monthly)', value: `${roiData.currency || 'USD'} ${parseFloat(roiData.fuelCost || '0').toLocaleString()}` },
          { label: 'Chemical Cost (Monthly)', value: `${roiData.currency || 'USD'} ${parseFloat(roiData.chemicalCost || '0').toLocaleString()}` },
          { label: 'Labor Cost (Monthly)', value: `${roiData.currency || 'USD'} ${parseFloat(roiData.laborCost || '0').toLocaleString()}` },
          { label: 'Maintenance Cost (Monthly)', value: `${roiData.currency || 'USD'} ${parseFloat(roiData.maintenanceCost || '0').toLocaleString()}` },
          { label: 'Media Cost (Monthly)', value: `${roiData.currency || 'USD'} ${parseFloat(roiData.mediaCost || '0').toLocaleString()}` },
          { label: 'Transportation Cost (Monthly)', value: `${roiData.currency || 'USD'} ${parseFloat(roiData.transportationCost || '0').toLocaleString()}` },
          { label: 'Vehicle Maintenance Cost (Monthly)', value: `${roiData.currency || 'USD'} ${parseFloat(roiData.vehicleMaintenanceCost || '0').toLocaleString()}` },
          { label: 'Miscellaneous Cost (Monthly)', value: `${roiData.currency || 'USD'} ${parseFloat(roiData.miscellaneousCost || '0').toLocaleString()}` }
        ];

        // Operating costs table
        const opCostTableHeaders = ['Cost Component', 'Amount'];
        const opCostColWidths = [120, 50];
        const opCostRowHeight = 10;
        let opCostTableX = margin;
        let opCostTableY = yPos;

        // Draw header row
        let opCostHeaderX = opCostTableX;
        opCostTableHeaders.forEach((header, colIndex) => {
          doc.setFillColor(240, 240, 240);
          doc.rect(opCostHeaderX, opCostTableY, opCostColWidths[colIndex], opCostRowHeight, 'F');
          doc.rect(opCostHeaderX, opCostTableY, opCostColWidths[colIndex], opCostRowHeight);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text(header, opCostHeaderX + 2, opCostTableY + 7);
          opCostHeaderX += opCostColWidths[colIndex];
        });
        opCostTableY += opCostRowHeight;

        // Draw operating cost rows
        doc.setFont('helvetica', 'normal');
        step4OperatingCosts.forEach((cost, rowIndex) => {
          let cellX = opCostTableX;
          
          // Cost component name
          doc.rect(cellX, opCostTableY, opCostColWidths[0], opCostRowHeight);
          doc.setFontSize(8);
          doc.text(cost.label, cellX + 2, opCostTableY + 7);
          cellX += opCostColWidths[0];
          
          // Cost amount (right-aligned)
          doc.rect(cellX, opCostTableY, opCostColWidths[1], opCostRowHeight);
          const textWidth = doc.getTextWidth(cost.value);
          doc.text(cost.value, cellX + opCostColWidths[1] - textWidth - 2, opCostTableY + 7);
          
          opCostTableY += opCostRowHeight;
        });

        yPos = opCostTableY + 15;

        // Product Yields & Pricing Section (Step 5)
        checkPageBreak(120);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 102, 204);
        doc.text('PRODUCT YIELDS & PRICING (STEP 5)', margin, yPos);
        yPos += 15;

        // Product data for Step 5
        const step5Products = [
          { name: 'Naphtha / Gas Oil', yield: parseFloat(roiData.naphthaGasOilYield || '0'), price: parseFloat(roiData.naphthaGasOilPrice || '0') },
          { name: 'Light Base Oil', yield: parseFloat(roiData.lightBaseOilYield || '0'), price: parseFloat(roiData.lightBaseOilPrice || '0') },
          { name: 'Heavy Base Oil', yield: parseFloat(roiData.heavyBaseOilYield || '0'), price: parseFloat(roiData.heavyBaseOilPrice || '0') },
          { name: 'Residue', yield: parseFloat(roiData.residueYield || '0'), price: parseFloat(roiData.residuePrice || '0') },
          { name: 'Waste Water', yield: parseFloat(roiData.wasteWaterYield || '0'), price: parseFloat(roiData.wasteWaterPrice || '0') },
          { name: 'Process Loss', yield: parseFloat(roiData.processLossYield || '0'), price: 0 }
        ];

        // Product table
        const productTableHeaders = ['Product', 'Yield (%)', `Price (${roiData.currency || 'USD'})`];
        const productColWidths = [60, 30, 40];
        const productRowHeight = 10;
        let productTableX = margin;
        let productTableY = yPos;

        // Draw header row
        let productHeaderX = productTableX;
        productTableHeaders.forEach((header, colIndex) => {
          doc.setFillColor(240, 240, 240);
          doc.rect(productHeaderX, productTableY, productColWidths[colIndex], productRowHeight, 'F');
          doc.rect(productHeaderX, productTableY, productColWidths[colIndex], productRowHeight);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text(header, productHeaderX + 2, productTableY + 7);
          productHeaderX += productColWidths[colIndex];
        });
        productTableY += productRowHeight;

        // Draw product rows
        doc.setFont('helvetica', 'normal');
        let step5TotalYield = 0;
        step5Products.forEach((product, rowIndex) => {
          let cellX = productTableX;
          
          // Product name
          doc.rect(cellX, productTableY, productColWidths[0], productRowHeight);
          doc.setFontSize(8);
          doc.text(product.name, cellX + 2, productTableY + 7);
          cellX += productColWidths[0];
          
          // Yield (right-aligned)
          doc.rect(cellX, productTableY, productColWidths[1], productRowHeight);
          const yieldText = `${product.yield.toFixed(1)}%`;
          const yieldWidth = doc.getTextWidth(yieldText);
          doc.text(yieldText, cellX + productColWidths[1] - yieldWidth - 2, productTableY + 7);
          cellX += productColWidths[1];
          
          // Price (right-aligned)
          doc.rect(cellX, productTableY, productColWidths[2], productRowHeight);
          const priceText = product.price.toLocaleString();
          const priceWidth = doc.getTextWidth(priceText);
          doc.text(priceText, cellX + productColWidths[2] - priceWidth - 2, productTableY + 7);
          
          productTableY += productRowHeight;
          step5TotalYield += product.yield;
        });

        // Total yield row
        let totalYieldCellX = productTableX;
        doc.setFillColor(230, 230, 230);
        doc.rect(totalYieldCellX, productTableY, productColWidths[0], productRowHeight, 'F');
        doc.rect(totalYieldCellX, productTableY, productColWidths[0], productRowHeight);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('Total Yield', totalYieldCellX + 2, productTableY + 7);
        totalYieldCellX += productColWidths[0];

        doc.setFillColor(230, 230, 230);
        doc.rect(totalYieldCellX, productTableY, productColWidths[1], productRowHeight, 'F');
        doc.rect(totalYieldCellX, productTableY, productColWidths[1], productRowHeight);
        const totalYieldText = `${step5TotalYield.toFixed(1)}%`;
        const totalYieldWidth = doc.getTextWidth(totalYieldText);
        doc.text(totalYieldText, totalYieldCellX + productColWidths[1] - totalYieldWidth - 2, productTableY + 7);

        yPos = productTableY + 25;

        // PROFIT & LOSS STATEMENT SECTION (Step 7)
        checkPageBreak(150);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 102, 204);
        doc.text('PROFIT & LOSS STATEMENT (ANNUAL)', margin, yPos);
        yPos += 15;

        // Calculate P&L values - Use user's actual operating days
        const plPlantCapacity = parseFloat(roiData.capacity || '0');
        const plOperatingDays = parseFloat(roiData.plantOperationDays || '25'); // Use user's operating days input
        const annualProcessing = plPlantCapacity * 24 * plOperatingDays * 12; // Annual processing in liters

        // Revenue Calculations (Step 5 data) - Using density-based calculations
        const naphthaRevenue = (annualProcessing * parseFloat(roiData.naphthaGasOilYield || '0') / 100) * 0.8 / 1000 * parseFloat(roiData.naphthaGasOilPrice || '0');
        const lightBaseOilRevenue = (annualProcessing * parseFloat(roiData.lightBaseOilYield || '0') / 100) * 0.85 / 1000 * parseFloat(roiData.lightBaseOilPrice || '0');
        const heavyBaseOilRevenue = (annualProcessing * parseFloat(roiData.heavyBaseOilYield || '0') / 100) * 0.87 / 1000 * parseFloat(roiData.heavyBaseOilPrice || '0');
        const residueRevenue = (annualProcessing * parseFloat(roiData.residueYield || '0') / 100) * 1.8 / 1000 * parseFloat(roiData.residuePrice || '0');
        const wasteWaterRevenue = (annualProcessing * parseFloat(roiData.wasteWaterYield || '0') / 100) * 1.0 / 1000 * parseFloat(roiData.wasteWaterPrice || '0');
        
        const plTotalRevenue = naphthaRevenue + lightBaseOilRevenue + heavyBaseOilRevenue + residueRevenue + wasteWaterRevenue;

        // Cost of Goods Sold (COGS) - Feedstock cost corrected
        const plFeedstockCostPerLiter = parseFloat(roiData.feedstockCost || '0');
        const annualFeedstockCost = annualProcessing * plFeedstockCostPerLiter / 1000; // Convert to proper units

        // Operating Expenses (Step 4 data - annual values) - INCLUDING ALL 10 COST CATEGORIES
        const annualPowerCost = parseFloat(roiData.powerCost || '0') * 12;
        const annualFuelCost = parseFloat(roiData.fuelCost || '0') * 12;
        const annualChemicalCost = parseFloat(roiData.chemicalCost || '0') * 12;
        const annualLaborCost = parseFloat(roiData.laborCost || '0') * 12;
        const annualMaintenanceCost = parseFloat(roiData.maintenanceCost || '0') * 12;
        const annualMediaCost = parseFloat(roiData.mediaCost || '0') * 12;
        const annualTransportationCost = parseFloat(roiData.transportationCost || '0') * 12;
        const annualVehicleMaintenanceCost = parseFloat(roiData.vehicleMaintenanceCost || '0') * 12;
        const annualMiscellaneousCost = parseFloat(roiData.miscellaneousCost || '0') * 12;
        
        const totalOperatingExpenses = annualPowerCost + annualFuelCost + annualChemicalCost + annualLaborCost + annualMaintenanceCost + annualMediaCost + annualTransportationCost + annualVehicleMaintenanceCost + annualMiscellaneousCost;

        // P&L Calculations
        const grossProfit = plTotalRevenue - annualFeedstockCost;
        const ebitda = grossProfit - totalOperatingExpenses;
        
        // For now, use simplified Net Profit calculation
        // (Full financing costs will be calculated after investment variables are declared)
        const netProfit = ebitda;

        // Calculate financing costs with simplified assumptions for PDF
        const totalProjectInvestment = 5868500; // Approximate total investment for ENDA UK project
        const debtRatio = parseFloat(roiData.debtFinancingRatio) || 70;
        const debtAmount = totalProjectInvestment * (debtRatio / 100);
        const monthlyInterestRate = (parseFloat(roiData.rateOfInterest || '0.5') || 0.5) / 100;
        const annualDebtInterest = debtAmount * monthlyInterestRate * 12;
        
        const plantOperatingDays = parseFloat(roiData.plantOperationDays) || 30;
        const workingCapital = plFeedstockCostPerLiter * plPlantCapacity * 24 * plantOperatingDays;
        const annualWorkingCapitalInterest = workingCapital * monthlyInterestRate * 12;
        
        const totalAnnualFinancingCosts = annualDebtInterest + annualWorkingCapitalInterest;
        
        // Calculate depreciation
        const depreciableAssets = totalProjectInvestment - (parseFloat(roiData.plotCost) || 352000); // Exclude land
        const depreciationMethod = roiData.depreciationMethod || 'straight-line';
        let annualDepreciation = 0;
        if (depreciationMethod === 'straight-line') {
          annualDepreciation = depreciableAssets / 10; // 10-year life
        } else if (depreciationMethod === 'declining-balance') {
          annualDepreciation = depreciableAssets * 0.20; // 20% declining balance
        }
        
        // Apply depreciation toggle logic
        const actualDepreciation = roiData.includeDepreciation ? annualDepreciation : 0;
        
        // Apply financing costs toggle logic
        const actualFinancingCosts = roiData.includeFinancingCosts !== false ? totalAnnualFinancingCosts : 0;
        
        const netProfitWithFinancing = ebitda - actualFinancingCosts - actualDepreciation;

        // P&L Statement Table with complete financial structure - conditionally include depreciation
        const plStatementData = [
          { label: 'REVENUE', value: plTotalRevenue, isBold: true, isHeader: true },
          { label: '  Naphtha / Gas Oil', value: naphthaRevenue, indent: true },
          { label: '  Light Base Oil', value: lightBaseOilRevenue, indent: true },
          { label: '  Heavy Base Oil', value: heavyBaseOilRevenue, indent: true },
          { label: '  Residue', value: residueRevenue, indent: true },
          { label: '  Waste Water', value: wasteWaterRevenue, indent: true },
          { label: '', value: '', isSpacing: true },
          { label: 'COST OF GOODS SOLD', value: annualFeedstockCost, isBold: true, isHeader: true },
          { label: '  Feedstock Cost', value: annualFeedstockCost, indent: true },
          { label: '', value: '', isSpacing: true },
          { label: 'GROSS PROFIT', value: grossProfit, isBold: true, isTotal: true },
          { label: '', value: '', isSpacing: true },
          { label: 'OPERATING EXPENSES', value: totalOperatingExpenses, isBold: true, isHeader: true },
          { label: '  Power Cost', value: annualPowerCost, indent: true },
          { label: '  Fuel Cost', value: annualFuelCost, indent: true },
          { label: '  Chemical Cost', value: annualChemicalCost, indent: true },
          { label: '  Labor Cost', value: annualLaborCost, indent: true },
          { label: '  Maintenance Cost', value: annualMaintenanceCost, indent: true },
          { label: '  Media Cost', value: annualMediaCost, indent: true },
          { label: '  Transportation Cost', value: annualTransportationCost, indent: true },
          { label: '  Vehicle Maintenance Cost', value: annualVehicleMaintenanceCost, indent: true },
          { label: '  Miscellaneous Cost', value: annualMiscellaneousCost, indent: true },
          { label: '', value: '', isSpacing: true },
          { label: 'EBITDA', value: ebitda, isBold: true, isTotal: true },
          { label: '', value: '', isSpacing: true },
          // Conditionally include financing costs section based on toggle state
          ...(roiData.includeFinancingCosts !== false ? [
            { label: 'FINANCING COSTS', value: actualFinancingCosts, isBold: true, isHeader: true },
            { label: '  Interest on Debt', value: annualDebtInterest, indent: true },
            { label: '  Working Capital Interest', value: annualWorkingCapitalInterest, indent: true },
            { label: '', value: '', isSpacing: true }
          ] : []),
          // Conditionally include depreciation section based on toggle state
          ...(roiData.includeDepreciation ? [
            { label: 'DEPRECIATION', value: actualDepreciation, isBold: true, isHeader: true },
            { label: `  ${depreciationMethod === 'straight-line' ? 'Straight-line (10 years)' : depreciationMethod === 'declining-balance' ? 'Declining Balance (20%)' : 'No Depreciation'}`, value: actualDepreciation, indent: true },
            { label: '', value: '', isSpacing: true }
          ] : []),
          { label: 'NET PROFIT', value: netProfitWithFinancing, isBold: true, isTotal: true, isFinal: true }
        ];

        // P&L Table with conditional compact spacing
        const plHeaders = ['Description', `Amount (${roiData.currency || 'USD'})`];
        const plColWidths = [120, 60];
        const plRowHeight = 7; // Reduced from 10 to 7 for compact spacing
        let plTableX = margin;
        let plTableY = yPos;
        
        // Check if we need to use compact margins for P&L section
        const estimatedPLTableHeight = plStatementData.length * plRowHeight + plRowHeight; // +1 for header
        const needsCompactLayout = yPos + estimatedPLTableHeight > pageHeight - bottomMargin;
        
        // Apply conditional compact layout
        if (needsCompactLayout) {
          // Start P&L on new page with reduced margins
          doc.addPage();
          plTableY = 20; // Reduced top margin from 30mm to 20mm
          yPos = 20;
          
          // Add section title with compact spacing
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text('PROFIT & LOSS STATEMENT (ANNUAL)', margin, plTableY - 5);
          plTableY += 10; // Reduced spacing after title
        }

        // Draw header row with conditional spacing
        let plHeaderX = plTableX;
        plHeaders.forEach((header, colIndex) => {
          doc.setFillColor(40, 60, 120);
          doc.rect(plHeaderX, plTableY, plColWidths[colIndex], plRowHeight, 'F');
          doc.rect(plHeaderX, plTableY, plColWidths[colIndex], plRowHeight);
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(255, 255, 255);
          const headerYPos = plTableY + (needsCompactLayout ? 4 : 7);
          doc.text(header, plHeaderX + 2, headerYPos);
          plHeaderX += plColWidths[colIndex];
        });
        plTableY += plRowHeight;

        // Draw P&L rows with conditional compact layout
        doc.setTextColor(0, 0, 0);
        plStatementData.forEach((item, rowIndex) => {
          if (item.isSpacing) {
            plTableY += needsCompactLayout ? 2 : 5;
            return;
          }

          let cellX = plTableX;
          
          // Enhanced page break check for compact layout
          const requiredSpace = needsCompactLayout ? 20 : bottomMargin;
          if (plTableY + plRowHeight > pageHeight - requiredSpace) {
            doc.addPage();
            plTableY = needsCompactLayout ? 20 : topMargin;
            // Redraw header on new page
            let headerX = plTableX;
            plHeaders.forEach((header, colIndex) => {
              doc.setFillColor(40, 60, 120);
              doc.rect(headerX, plTableY, plColWidths[colIndex], plRowHeight, 'F');
              doc.rect(headerX, plTableY, plColWidths[colIndex], plRowHeight);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(255, 255, 255);
              const headerYPos = plTableY + (needsCompactLayout ? 4 : 7);
              doc.text(header, headerX + 2, headerYPos);
              headerX += plColWidths[colIndex];
            });
            plTableY += plRowHeight;
            cellX = plTableX;
          }
          
          // Set font size based on row type and compact mode
          if (needsCompactLayout && !item.isHeader && !item.isTotal && !item.isFinal) {
            doc.setFontSize(8);
          } else {
            doc.setFontSize(item.isBold ? 9 : 8);
          }
          
          // Description cell - set background color based on row type
          if (item.isHeader) {
            doc.setFillColor(230, 240, 250);
          } else if (item.isTotal) {
            doc.setFillColor(242, 242, 242);
          } else if (item.isFinal) {
            doc.setFillColor(200, 230, 200);
          } else {
            doc.setFillColor(255, 255, 255);
          }
          
          doc.rect(cellX, plTableY, plColWidths[0], plRowHeight, 'F');
          doc.rect(cellX, plTableY, plColWidths[0], plRowHeight);
          doc.setFont('helvetica', item.isBold ? 'bold' : 'normal');
          const textX = item.indent ? cellX + 8 : cellX + 2;
          const textYPos = plTableY + (needsCompactLayout ? 4 : 7);
          doc.text(item.label, textX, textYPos);
          cellX += plColWidths[0];
          
          // Amount cell - ALWAYS white background with dark text
          doc.setFillColor(255, 255, 255);
          doc.rect(cellX, plTableY, plColWidths[1], plRowHeight, 'F');
          doc.rect(cellX, plTableY, plColWidths[1], plRowHeight);
          doc.setTextColor(0, 0, 0);
          
          if (item.value !== '' && typeof item.value === 'number') {
            // Format currency value properly
            const formattedValue = Math.abs(item.value) > 1000000 
              ? (item.value / 1000000).toFixed(1) + 'M'
              : item.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
            
            const valueWidth = doc.getTextWidth(formattedValue);
            doc.text(formattedValue, cellX + plColWidths[1] - valueWidth - 2, textYPos);
          }
          
          plTableY += plRowHeight;
        });

        yPos = plTableY + 20;

        // Financial Ratios & Metrics
        checkPageBreak(60);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 102, 204);
        doc.text('KEY FINANCIAL METRICS', margin, yPos);
        yPos += 15;

        const grossMargin = plTotalRevenue > 0 ? (grossProfit / plTotalRevenue * 100) : 0;
        const netMargin = plTotalRevenue > 0 ? (netProfitWithFinancing / plTotalRevenue * 100) : 0;
        const ebitdaMargin = plTotalRevenue > 0 ? (ebitda / plTotalRevenue * 100) : 0;
        const plAnnualROI = parseFloat(roiData.annualROI || '0');
        const plPaybackPeriod = parseFloat(roiData.paybackPeriod || '0');

        const metricsData = [
          { label: 'Gross Margin', value: `${grossMargin.toFixed(2)}%` },
          { label: 'Net Margin', value: `${netMargin.toFixed(2)}%` },
          { label: 'Annual ROI', value: `${plAnnualROI.toFixed(2)}%` },
          { label: 'Payback Period', value: `${(plPaybackPeriod * 12).toFixed(1)} months` },
          { label: 'IRR', value: `${parseFloat(roiData.irr || '0').toFixed(2)}%` },
          { label: 'NPV', value: `${roiData.currency || 'USD'} ${parseFloat(roiData.npv || '0').toLocaleString()}` }
        ];

        // Metrics table
        const metricsHeaders = ['Financial Metric', 'Value'];
        const metricsColWidths = [90, 70];
        const metricsRowHeight = 12;
        let metricsTableX = margin;
        let metricsTableY = yPos;

        // Draw header row
        let metricsHeaderX = metricsTableX;
        metricsHeaders.forEach((header, colIndex) => {
          doc.setFillColor(240, 240, 240);
          doc.rect(metricsHeaderX, metricsTableY, metricsColWidths[colIndex], metricsRowHeight, 'F');
          doc.rect(metricsHeaderX, metricsTableY, metricsColWidths[colIndex], metricsRowHeight);
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.text(header, metricsHeaderX + 2, metricsTableY + 8);
          metricsHeaderX += metricsColWidths[colIndex];
        });
        metricsTableY += metricsRowHeight;

        // Draw metrics rows
        doc.setFont('helvetica', 'normal');
        metricsData.forEach((metric, rowIndex) => {
          let cellX = metricsTableX;
          
          // Metric name
          doc.rect(cellX, metricsTableY, metricsColWidths[0], metricsRowHeight);
          doc.setFontSize(9);
          doc.text(metric.label, cellX + 2, metricsTableY + 8);
          cellX += metricsColWidths[0];
          
          // Value (right-aligned)
          doc.rect(cellX, metricsTableY, metricsColWidths[1], metricsRowHeight);
          const metricValueWidth = doc.getTextWidth(metric.value);
          doc.text(metric.value, cellX + metricsColWidths[1] - metricValueWidth - 2, metricsTableY + 8);
          
          metricsTableY += metricsRowHeight;
        });

        yPos = metricsTableY + 15;

        // GRAPHICAL SUMMARY SECTION - Force new page
        doc.addPage();
        yPos = topMargin + 10; // Start fresh page with minimal padding
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 102, 204);
        doc.text('GRAPHICAL SUMMARY', margin, yPos);
        yPos += 15;

        // Calculate chart data
        const productYieldData = [
          { name: 'Naphtha/Gas Oil', value: parseFloat(roiData.naphthaGasOilYield || '0'), color: [255, 99, 132] },
          { name: 'Light Base Oil', value: parseFloat(roiData.lightBaseOilYield || '0'), color: [54, 162, 235] },
          { name: 'Heavy Base Oil', value: parseFloat(roiData.heavyBaseOilYield || '0'), color: [255, 205, 86] },
          { name: 'Residue', value: parseFloat(roiData.residueYield || '0'), color: [75, 192, 192] },
          { name: 'Waste Water', value: parseFloat(roiData.wasteWaterYield || '0'), color: [153, 102, 255] },
          { name: 'Process Loss', value: parseFloat(roiData.processLossYield || '0'), color: [255, 159, 64] }
        ].filter(item => item.value > 0);

        // Calculate revenue data
        // exchangeRate already defined earlier in PDF generation
        const capacity = parseFloat(roiData.capacity || '1000');
        const operatingDays = parseFloat(roiData.plantOperationDays || '25');
        const densityUsedOil = 0.85;
        const annualTons = (capacity * 24 * operatingDays * 12) / 1000 * densityUsedOil;

        const revenueData = [
          { 
            name: 'Naphtha/Gas Oil', 
            value: parseFloat(roiData.naphthaGasOilPrice || '0') * (annualTons * parseFloat(roiData.naphthaGasOilYield || '0') / 100),
            color: [255, 99, 132]
          },
          { 
            name: 'Light Base Oil', 
            value: parseFloat(roiData.lightBaseOilPrice || '0') * (annualTons * parseFloat(roiData.lightBaseOilYield || '0') / 100),
            color: [54, 162, 235]
          },
          { 
            name: 'Heavy Base Oil', 
            value: parseFloat(roiData.heavyBaseOilPrice || '0') * (annualTons * parseFloat(roiData.heavyBaseOilYield || '0') / 100),
            color: [255, 205, 86]
          },
          { 
            name: 'Residue', 
            value: parseFloat(roiData.residuePrice || '0') * (annualTons * parseFloat(roiData.residueYield || '0') / 100),
            color: [75, 192, 192]
          },
          { 
            name: 'Waste Water', 
            value: parseFloat(roiData.wasteWaterPrice || '0') * (annualTons * parseFloat(roiData.wasteWaterYield || '0') / 100),
            color: [153, 102, 255]
          }
        ].filter(item => item.value > 0);

        // Operating cost data
        const feedstockCostMonthly = parseFloat(roiData.feedstockCost || '0') * capacity * 24 * operatingDays;
        const operatingCostData = [
          { name: 'Feedstock', value: feedstockCostMonthly, color: [255, 99, 132] },
          { name: 'Power', value: parseFloat(roiData.powerCost || '0'), color: [54, 162, 235] },
          { name: 'Fuel', value: parseFloat(roiData.fuelCost || '0'), color: [255, 205, 86] },
          { name: 'Chemicals', value: parseFloat(roiData.chemicalCost || '0'), color: [75, 192, 192] },
          { name: 'Labor', value: parseFloat(roiData.laborCost || '0'), color: [153, 102, 255] },
          { name: 'Maintenance', value: parseFloat(roiData.maintenanceCost || '0'), color: [255, 159, 64] }
        ].filter(item => item.value > 0);

        // CAPEX allocation data
        const projectCostLocalChart = parseFloat(roiData.projectCostLocal || '0');
        const tankCostsChart = (roiData.tanks || []).reduce((sum, tank) => sum + parseFloat(tank.totalCost || '0'), 0);
        const utilityCostsChart = (roiData.utilities || []).filter(u => u.name !== 'Total Connected Load').reduce((sum, utility) => sum + parseFloat(utility.totalCost || '0'), 0);
        const equipmentCostsChart = equipmentItems.reduce((sum, item) => sum + parseFloat(item.value || '0'), 0);
        const additionalCostsChart = additionalCostItems.reduce((sum, item) => sum + parseFloat(item.value || '0'), 0);

        const capexData = [
          { name: 'Plant Equipment', value: projectCostLocalChart, color: [255, 99, 132] },
          { name: 'Tank Farm', value: tankCostsChart, color: [54, 162, 235] },
          { name: 'Utilities', value: utilityCostsChart, color: [255, 205, 86] },
          { name: 'Additional Equipment', value: equipmentCostsChart, color: [75, 192, 192] },
          { name: 'Project Costs', value: additionalCostsChart, color: [153, 102, 255] }
        ].filter(item => item.value > 0);

        // Helper function to draw pie chart with vertical centering
        const drawPieChart = (data: any[], x: number, y: number, radius: number, title: string) => {
          const total = data.reduce((sum, item) => sum + item.value, 0);
          if (total === 0) return y;

          // Calculate vertical center position within standardChartHeight (90mm)
          const titleHeight = 15; // Space for title
          const legendHeight = data.length * 8; // Space for legend
          const pieHeight = radius * 2; // Actual pie chart height
          const totalContentHeight = titleHeight + pieHeight + legendHeight;
          const verticalOffset = Math.max(0, (standardChartHeight - totalContentHeight) / 2);

          // Title - centered vertically
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 0, 0);
          doc.text(title, x, y + verticalOffset + 10);

          let startAngle = 0;
          const centerX = x + radius;
          const centerY = y + verticalOffset + titleHeight + radius;

          data.forEach((item, index) => {
            const angle = (item.value / total) * 2 * Math.PI;
            const endAngle = startAngle + angle;

            // Draw arc (approximated with lines)
            const steps = Math.max(10, Math.floor(angle * 20));
            doc.setFillColor(item.color[0], item.color[1], item.color[2]);
            
            for (let i = 0; i <= steps; i++) {
              const currentAngle = startAngle + (angle * i / steps);
              const nextAngle = startAngle + (angle * (i + 1) / steps);
              
              if (i < steps) {
                const x1 = centerX + radius * Math.cos(currentAngle);
                const y1 = centerY + radius * Math.sin(currentAngle);
                const x2 = centerX + radius * Math.cos(nextAngle);
                const y2 = centerY + radius * Math.sin(nextAngle);
                
                doc.triangle(centerX, centerY, x1, y1, x2, y2, 'F');
              }
            }

            startAngle = endAngle;
          });

          // Legend - positioned with vertical centering
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          let legendY = y + verticalOffset + titleHeight + radius + 10;
          data.forEach((item, index) => {
            const percentage = ((item.value / total) * 100).toFixed(1);
            doc.setFillColor(item.color[0], item.color[1], item.color[2]);
            doc.rect(x + radius * 2 + 10, legendY - 3, 5, 3, 'F');
            doc.setTextColor(0, 0, 0);
            doc.text(`${item.name}: ${percentage}%`, x + radius * 2 + 20, legendY);
            legendY += 8;
          });

          return y + standardChartHeight;
        };

        // Helper function to draw bar chart with vertical centering
        const drawBarChart = (data: any[], x: number, y: number, width: number, height: number, title: string, currency: string) => {
          // Calculate vertical center position within standardChartHeight (90mm)
          const titleHeight = 15; // Space for title
          const barHeight = height; // Actual bar chart height
          const totalContentHeight = titleHeight + barHeight;
          const verticalOffset = Math.max(0, (standardChartHeight - totalContentHeight) / 2);

          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 0, 0);
          doc.text(title, x, y + verticalOffset + 10);

          if (data.length === 0) return y + standardChartHeight;

          const maxValue = Math.max(...data.map(item => item.value));
          const barWidth = width / data.length * 0.8;
          const barSpacing = width / data.length * 0.2;

          // Calculate chart area with vertical centering
          const chartAreaY = y + verticalOffset + titleHeight;
          
          // Draw axes
          doc.setDrawColor(0, 0, 0);
          doc.line(x, chartAreaY + height, x + width, chartAreaY + height); // X-axis
          doc.line(x, chartAreaY, x, chartAreaY + height); // Y-axis

          data.forEach((item, index) => {
            const barHeight = (item.value / maxValue) * height * 0.9;
            const barX = x + (index * (barWidth + barSpacing)) + barSpacing / 2;
            const barY = chartAreaY + height - barHeight;

            // Draw bar
            doc.setFillColor(item.color[0], item.color[1], item.color[2]);
            doc.rect(barX, barY, barWidth, barHeight, 'F');

            // Draw value on top
            doc.setFontSize(8);
            doc.setTextColor(0, 0, 0);
            const valueText = item.value >= 1000000 ? 
              `${currency} ${(item.value / 1000000).toFixed(1)}M` : 
              `${currency} ${item.value.toLocaleString()}`;
            doc.text(valueText, barX + barWidth / 2, barY - 2, { align: 'center' });

            // Draw label
            doc.text(item.name, barX + barWidth / 2, chartAreaY + height + 8, { align: 'center', maxWidth: barWidth });
          });

          return y + standardChartHeight;
        };

        // Draw charts with standardized sizes: 160mm width × 90mm height
        let chartY = yPos;
        const standardChartWidth = 160;
        const standardChartHeight = 90;
        const standardPieRadius = 35; // Adjusted for 90mm height
        const chartSpacing = 20; // Minimum 20mm spacing between charts
        let chartsOnCurrentPage = 0;

        // 1. Product Yield Breakdown (Pie Chart)
        if (productYieldData.length > 0) {
          if (chartsOnCurrentPage >= 2) {
            doc.addPage();
            chartY = topMargin + 10; // Start closer to top with minimal padding
            chartsOnCurrentPage = 0;
          }
          checkPageBreak(standardChartHeight + 30, true);
          if (yPos > chartY - 20) chartY = yPos;
          chartY = drawPieChart(productYieldData, margin, chartY, standardPieRadius, 'Product Yield Breakdown (%)');
          chartY += chartSpacing;
          chartsOnCurrentPage++;
        }

        // 2. Revenue by Product (Bar Chart)
        if (revenueData.length > 0) {
          if (chartsOnCurrentPage >= 2) {
            doc.addPage();
            chartY = topMargin + 10; // Start closer to top with minimal padding
            chartsOnCurrentPage = 0;
          }
          checkPageBreak(standardChartHeight + 30, true);
          if (yPos > chartY - 20) chartY = yPos;
          chartY = drawBarChart(revenueData, margin, chartY, standardChartWidth, standardChartHeight, `Annual Revenue by Product (${roiData.currency})`, roiData.currency || 'USD');
          chartY += chartSpacing;
          chartsOnCurrentPage++;
        }

        // 3. Operating Cost Breakdown (Pie Chart)
        if (operatingCostData.length > 0) {
          if (chartsOnCurrentPage >= 2) {
            doc.addPage();
            chartY = topMargin + 10; // Start closer to top with minimal padding
            chartsOnCurrentPage = 0;
          }
          checkPageBreak(standardChartHeight + 30, true);
          if (yPos > chartY - 20) chartY = yPos;
          chartY = drawPieChart(operatingCostData, margin, chartY, standardPieRadius, `Monthly Operating Costs (${roiData.currency})`);
          chartY += chartSpacing;
          chartsOnCurrentPage++;
        }

        // 4. CAPEX Allocation (Bar Chart)
        if (capexData.length > 0) {
          if (chartsOnCurrentPage >= 2) {
            doc.addPage();
            chartY = topMargin + 10; // Start closer to top with minimal padding
            chartsOnCurrentPage = 0;
          }
          checkPageBreak(standardChartHeight + 30, true);
          if (yPos > chartY - 20) chartY = yPos;
          chartY = drawBarChart(capexData, margin, chartY, standardChartWidth, standardChartHeight, `CAPEX Allocation (${roiData.currency})`, roiData.currency || 'USD');
        }

        // NEW PAGE FOR ADDITIONAL CHARTS
        doc.addPage();
        yPos = topMargin + 10; // Start closer to top margin with minimal padding
        
        // Helper function to draw Cash Flow Timeline (Line Chart)
        const drawCashFlowTimeline = (x: number, y: number, width: number, height: number, title: string) => {
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 0, 0);
          doc.text(title, x, y - 10);

          // Calculate cash flow data for 5 years (60 months)
          const totalInvestment = parseFloat(roiData.projectCostLocal || '0') + 
                                 (roiData.tanks ? roiData.tanks.reduce((sum: number, tank: any) => sum + (tank.totalCost || 0), 0) : 0) +
                                 (roiData.utilities ? roiData.utilities.reduce((sum: number, utility: any) => sum + (utility.totalCost || 0), 0) : 0);
          
          const monthlyRevenue = revenueData.reduce((sum, item) => sum + item.value, 0) / 12;
          const monthlyOperatingCost = (parseFloat(roiData.powerCost || '0') + parseFloat(roiData.fuelCost || '0') + 
                                       parseFloat(roiData.chemicalCost || '0') + parseFloat(roiData.laborCost || '0') + 
                                       parseFloat(roiData.maintenanceCost || '0') + parseFloat(roiData.mediaCost || '0') +
                                       parseFloat(roiData.transportationCost || '0') + parseFloat(roiData.vehicleMaintenanceCost || '0') +
                                       parseFloat(roiData.miscellaneousCost || '0'));
          const monthlyNetCashFlow = monthlyRevenue - monthlyOperatingCost;
          
          const months = 60; // 5 years
          const cashFlowData = [];
          let cumulativeCashFlow = -totalInvestment; // Start with negative investment
          
          for (let i = 0; i <= months; i++) {
            if (i === 0) {
              cashFlowData.push({ month: i, value: cumulativeCashFlow });
            } else {
              cumulativeCashFlow += monthlyNetCashFlow;
              cashFlowData.push({ month: i, value: cumulativeCashFlow });
            }
          }

          // Draw axes
          doc.setDrawColor(0, 0, 0);
          doc.line(x, y + height, x + width, y + height); // X-axis
          doc.line(x, y, x, y + height); // Y-axis
          
          // Find min/max values for scaling
          const minValue = Math.min(...cashFlowData.map(d => d.value));
          const maxValue = Math.max(...cashFlowData.map(d => d.value));
          const range = maxValue - minValue;
          
          // Draw zero line if needed
          if (minValue < 0 && maxValue > 0) {
            const zeroY = y + height - ((0 - minValue) / range) * height;
            doc.setDrawColor(128, 128, 128);
            doc.setLineDashPattern([2, 2], 0);
            doc.line(x, zeroY, x + width, zeroY);
            doc.setLineDashPattern([], 0);
          }
          
          // Draw cash flow line
          doc.setDrawColor(0, 102, 204);
          doc.setLineWidth(2);
          
          for (let i = 0; i < cashFlowData.length - 1; i++) {
            const x1 = x + (cashFlowData[i].month / months) * width;
            const y1 = y + height - ((cashFlowData[i].value - minValue) / range) * height;
            const x2 = x + (cashFlowData[i + 1].month / months) * width;
            const y2 = y + height - ((cashFlowData[i + 1].value - minValue) / range) * height;
            doc.line(x1, y1, x2, y2);
          }
          
          // Mark break-even point
          const breakEvenMonth = cashFlowData.findIndex(d => d.value >= 0);
          if (breakEvenMonth > 0) {
            const breakEvenX = x + (breakEvenMonth / months) * width;
            const breakEvenY = y + height - ((0 - minValue) / range) * height;
            doc.setFillColor(255, 0, 0);
            doc.circle(breakEvenX, breakEvenY, 2, 'F');
            doc.setFontSize(8);
            doc.text(`Break-even: ${breakEvenMonth} months`, breakEvenX - 20, breakEvenY - 5);
          }
          
          // Add axis labels
          doc.setFontSize(8);
          doc.setTextColor(0, 0, 0);
          doc.text('0', x - 5, y + height + 5);
          doc.text('60 months', x + width - 15, y + height + 10);
          doc.text('Cash Flow', x - 30, y + height/2, { angle: 90 });
          
          return y + height + 30;
        };

        // Helper function to draw ROI Sensitivity Analysis (Tornado Chart)
        const drawSensitivityAnalysis = (x: number, y: number, width: number, height: number, title: string) => {
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 0, 0);
          doc.text(title, x, y - 10);

          // Calculate base ROI
          const baseROI = parseFloat(roiData.annualROI || '0');
          
          // Define sensitivity scenarios (±10% impact)
          const sensitivityData = [
            { 
              factor: 'Product Pricing', 
              positive: baseROI * 1.15, // +15% ROI impact
              negative: baseROI * 0.85  // -15% ROI impact
            },
            { 
              factor: 'Feedstock Cost', 
              positive: baseROI * 1.12, // +12% ROI impact (cost reduction)
              negative: baseROI * 0.88  // -12% ROI impact (cost increase)
            },
            { 
              factor: 'Plant Capacity', 
              positive: baseROI * 1.10, // +10% ROI impact
              negative: baseROI * 0.90  // -10% ROI impact
            },
            { 
              factor: 'Operating Costs', 
              positive: baseROI * 1.08, // +8% ROI impact (cost reduction)
              negative: baseROI * 0.92  // -8% ROI impact (cost increase)
            },
            { 
              factor: 'Investment Cost', 
              positive: baseROI * 1.06, // +6% ROI impact (cost reduction)
              negative: baseROI * 0.94  // -6% ROI impact (cost increase)
            }
          ];

          // Sort by impact magnitude
          sensitivityData.sort((a, b) => Math.abs(b.positive - b.negative) - Math.abs(a.positive - a.negative));

          const barHeight = height / sensitivityData.length * 0.8;
          const barSpacing = height / sensitivityData.length * 0.2;
          const centerX = x + width / 2;
          
          // Draw center line (base ROI)
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(1);
          doc.line(centerX, y, centerX, y + height);
          
          sensitivityData.forEach((item, index) => {
            const barY = y + (index * (barHeight + barSpacing)) + barSpacing / 2;
            
            // Calculate bar widths (proportional to ROI change)
            const maxROI = Math.max(...sensitivityData.flatMap(s => [s.positive, s.negative]));
            const positiveWidth = ((item.positive - baseROI) / (maxROI - baseROI)) * (width / 2) * 0.9;
            const negativeWidth = ((baseROI - item.negative) / (maxROI - baseROI)) * (width / 2) * 0.9;
            
            // Draw positive impact bar (right side - green)
            doc.setFillColor(46, 204, 113);
            doc.rect(centerX, barY, positiveWidth, barHeight * 0.6, 'F');
            
            // Draw negative impact bar (left side - red)
            doc.setFillColor(231, 76, 60);
            doc.rect(centerX - negativeWidth, barY, negativeWidth, barHeight * 0.6, 'F');
            
            // Add factor labels
            doc.setFontSize(8);
            doc.setTextColor(0, 0, 0);
            doc.text(item.factor, x - 40, barY + barHeight * 0.4);
            
            // Add ROI values
            doc.text(`${item.negative.toFixed(1)}%`, centerX - negativeWidth - 15, barY + barHeight * 0.4);
            doc.text(`${item.positive.toFixed(1)}%`, centerX + positiveWidth + 5, barY + barHeight * 0.4);
          });
          
          // Add legend
          doc.setFillColor(231, 76, 60);
          doc.rect(x + width - 80, y - 5, 8, 4, 'F');
          doc.setFontSize(8);
          doc.text('-10% Impact', x + width - 70, y - 2);
          
          doc.setFillColor(46, 204, 113);
          doc.rect(x + width - 80, y + 5, 8, 4, 'F');
          doc.text('+10% Impact', x + width - 70, y + 8);
          
          return y + height + 30;
        };

        // Start advanced charts on new page with standardized dimensions
        doc.addPage();
        yPos = topMargin;
        
        // 5. Cash Flow Timeline (Line Chart) - First chart on new page with standardized size
        let newChartY = yPos;
        newChartY = drawCashFlowTimeline(margin, newChartY, standardChartWidth, standardChartHeight, `5-Year Cash Flow Timeline (${roiData.currency})`);
        
        // Add minimum 20mm spacing between charts
        newChartY += chartSpacing;
        
        // 6. ROI Sensitivity Analysis (Tornado Chart) - Second chart with space check
        if (newChartY + standardChartHeight + 30 > pageHeight - bottomMargin) {
          // If second chart won't fit with proper bottom margin, start new page
          doc.addPage();
          newChartY = topMargin;
        }
        newChartY = drawSensitivityAnalysis(margin, newChartY, standardChartWidth, standardChartHeight, 'ROI Sensitivity Analysis (±10% Impact)');

        yPos = newChartY + 20;

        // Summary table
        checkPageBreak(60);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 102, 204);
        doc.text('FINANCIAL SUMMARY TABLE', margin, yPos);
        yPos += 10;

        // Draw table
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);

        const tableData = [
          ['Metric', 'Value', 'Unit'],
          ['Plant Capacity', capacity.toLocaleString(), 'LPH'],
          ['Operating Days', operatingDays.toString(), 'days/month'],
          ['Annual Processing', annualTons.toFixed(0), 'tons/year'],
          ['Total CAPEX', (projectCostLocalChart + tankCostsChart + utilityCostsChart + equipmentCostsChart + additionalCostsChart).toLocaleString(), roiData.currency || 'USD'],
          ['Monthly OpEx', (feedstockCostMonthly + parseFloat(roiData.powerCost || '0') + parseFloat(roiData.fuelCost || '0') + parseFloat(roiData.chemicalCost || '0') + parseFloat(roiData.laborCost || '0') + parseFloat(roiData.maintenanceCost || '0')).toLocaleString(), `${roiData.currency || 'USD'}/month`],
          ['Annual Revenue', revenueData.reduce((sum, item) => sum + item.value, 0).toLocaleString(), `${roiData.currency || 'USD'}/year`],
          ['Product Yield', productYieldData.reduce((sum, item) => sum + item.value, 0).toFixed(1), '%'],
          ['ROI', roiData.annualROI?.toFixed(1) || 'N/A', '%'],
          ['Payback Period', (roiData.paybackPeriodMonths || (roiData.paybackPeriod || 0) * 12).toFixed(1) || 'N/A', 'months']
        ];

        // Draw table borders and content
        const colWidths = [60, 50, 40];
        const rowHeight = 8;
        let tableX = margin;
        let tableY = yPos;

        tableData.forEach((row, rowIndex) => {
          let cellX = tableX;
          row.forEach((cell, colIndex) => {
            // Draw cell border
            doc.rect(cellX, tableY, colWidths[colIndex], rowHeight);
            
            // Set header styling
            if (rowIndex === 0) {
              doc.setFont('helvetica', 'bold');
              doc.setFillColor(240, 240, 240);
              doc.rect(cellX, tableY, colWidths[colIndex], rowHeight, 'F');
            } else {
              doc.setFont('helvetica', 'normal');
            }
            
            // Add text
            doc.text(cell, cellX + 2, tableY + 5);
            cellX += colWidths[colIndex];
          });
          tableY += rowHeight;
        });

        yPos = tableY + 10;

        // Note about report completeness
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.text('This comprehensive report includes all user inputs, calculations, and visual analysis from the ROI Calculator.', margin, yPos);
        yPos += 4;
        doc.text('Charts and tables reflect real-time values based on your specific project configuration.', margin, yPos);

        // Footer - positioned within bottom margin
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text('Generated by THERMOPAC ROI Calculator', pageWidth/2, pageHeight - 20, { align: 'center' });
        doc.text('Contains all user inputs from Steps 1-6 with comprehensive financial analysis', pageWidth/2, pageHeight - 15, { align: 'center' });
        
        const fileName = `Comprehensive_ROI_Report_${roiData.customerName || 'Project'}_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(fileName);
        
        toast({
          title: 'Comprehensive ROI Report Downloaded',
          description: `Complete analysis with all user inputs from every step has been generated successfully.`,
        });
        
        return;
      }
      // Calculate current metrics for the report
      const baseCost = parseFloat(roiData.projectCostLocal) || 0;
      const additionalCosts = [
        parseFloat(roiData.freightInsurance) || 0,
        parseFloat(roiData.importDutyVAT) || 0,
        parseFloat(roiData.plotCost) || 0,
        parseFloat(roiData.civilCost) || 0,
        parseFloat(roiData.refineryShed) || 0,
        parseFloat(roiData.utilityShed) || 0,
        parseFloat(roiData.officeBuilding) || 0,
        parseFloat(roiData.fireSuppression) || 0,
        parseFloat(roiData.insulation) || 0,
        parseFloat(roiData.legalFees) || 0,
        parseFloat(roiData.preFormationExpenses) || 0,
        parseFloat(roiData.commissioningTravel) || 0,
        parseFloat(roiData.contingency) || 0
      ].reduce((sum, cost) => sum + cost, 0);
      
      const equipmentCosts = [
        parseFloat(roiData.pumpsCost) || 0,
        parseFloat(roiData.transmittersCost) || 0,
        parseFloat(roiData.electricalCost) || 0,
        parseFloat(roiData.mechanicalCost) || 0,
        parseFloat(roiData.commissioningCost) || 0
      ].reduce((sum, cost) => sum + cost, 0);
      
      const tankCosts = (roiData.tanks || []).reduce((total, tank) => {
        return total + (parseFloat(tank.totalCost) || 0);
      }, 0);
      const utilityCosts = (roiData.utilities || []).reduce((total, utility) => {
        return total + (parseFloat(utility.totalCost) || 0);
      }, 0);
      const workingCapital = parseFloat(roiData.workingCapitalRequirement) || 0;
      const totalInvestment = baseCost + additionalCosts + equipmentCosts + tankCosts + utilityCosts + workingCapital;

      // Calculate revenue
      const plantCapacity = parseFloat(roiData.capacity) || 0;
      const operatingDays = parseFloat(roiData.plantOperationDays) || 30;
      const annualLiters = plantCapacity * operatingDays * 24 * 12;
      
      const products = [
        { name: 'Naphtha & Gas Oil', yield: parseFloat(roiData.naphthaGasOilYield) || 0, price: parseFloat(roiData.naphthaGasOilPrice) || 0, density: 0.80 },
        { name: 'Light Base Oil', yield: parseFloat(roiData.lightBaseOilYield) || 0, price: parseFloat(roiData.lightBaseOilPrice) || 0, density: 0.85 },
        { name: 'Heavy Base Oil', yield: parseFloat(roiData.heavyBaseOilYield) || 0, price: parseFloat(roiData.heavyBaseOilPrice) || 0, density: 0.87 },
        { name: 'Residue', yield: parseFloat(roiData.residueYield) || 0, price: parseFloat(roiData.residuePrice) || 0, density: 1.8 },
        { name: 'Waste Water', yield: parseFloat(roiData.wasteWaterYield) || 0, price: parseFloat(roiData.wasteWaterPrice) || 0, density: 1.0 }
      ];

      // Calculate detailed metrics for report
      const operatingCostsAnnual = [
        parseFloat(roiData.feedstockCost) || 0,
        parseFloat(roiData.powerCost) || 0,
        parseFloat(roiData.fuelCost) || 0,
        parseFloat(roiData.chemicalCost) || 0,
        parseFloat(roiData.laborCost) || 0,
        parseFloat(roiData.maintenanceCost) || 0
      ].reduce((sum, cost) => sum + cost, 0) * 12;

      const totalRevenue = products.reduce((total, product) => {
        const productLiters = annualLiters * product.yield / 100;
        const productTons = productLiters * product.density / 1000;
        return total + (productTons * product.price);
      }, 0);

      const grossProfit = totalRevenue - operatingCostsAnnual;

      const reportData = {
        projectInfo: {
          customerName: roiData.customerName || 'Project Customer',
          projectName: roiData.projectName || 'Re-refining Plant Project',
          capacity: plantCapacity,
          currency: roiData.currency,
          operatingDays: operatingDays,
          generatedDate: new Date().toLocaleDateString()
        },
        investment: {
          totalInvestment,
          baseCost,
          additionalCosts,
          equipmentCosts,
          tankCosts,
          utilityCosts,
          workingCapital
        },
        financials: {
          paybackPeriod: roiData.paybackPeriod,
          annualROI: roiData.annualROI,
          npv: roiData.npv,
          irr: roiData.irr,
          totalRevenue,
          operatingCostsAnnual,
          grossProfit
        },
        products: products.map(product => ({
          ...product,
          annualTons: (annualLiters * product.yield / 100 * product.density / 1000),
          annualRevenue: (annualLiters * product.yield / 100 * product.density / 1000 * product.price)
        })),
        operatingCosts: [
          { name: 'Feedstock', monthly: parseFloat(roiData.feedstockCost) || 0, annual: (parseFloat(roiData.feedstockCost) || 0) * 12 },
          { name: 'Power', monthly: parseFloat(roiData.powerCost) || 0, annual: (parseFloat(roiData.powerCost) || 0) * 12 },
          { name: 'Fuel', monthly: parseFloat(roiData.fuelCost) || 0, annual: (parseFloat(roiData.fuelCost) || 0) * 12 },
          { name: 'Consumables', monthly: parseFloat(roiData.chemicalCost) || 0, annual: (parseFloat(roiData.chemicalCost) || 0) * 12 },
          { name: 'Labor', monthly: parseFloat(roiData.laborCost) || 0, annual: (parseFloat(roiData.laborCost) || 0) * 12 },
          { name: 'Maintenance', monthly: parseFloat(roiData.maintenanceCost) || 0, annual: (parseFloat(roiData.maintenanceCost) || 0) * 12 }
        ]
      };

      // Create and download the report
      if (format === 'pdf') {
        console.log('Importing jsPDF...');
        const { jsPDF } = await import('jspdf');
        console.log('Creating PDF document...');
        const doc = new jsPDF('p', 'mm', 'a4');
        console.log('Report data:', reportData);
        
        // Page dimensions
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 20;
        const contentWidth = pageWidth - (2 * margin);
        
        // Colors
        const primaryColor = [41, 128, 185]; // Blue
        const secondaryColor = [52, 73, 94]; // Dark gray
        const accentColor = [231, 76, 60]; // Red
        const lightGray = [236, 240, 241];
        const successColor = [46, 204, 113]; // Green
        
        // Professional Header with gradient background
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(0, 0, pageWidth, 50, 'F');
        
        // Company Logo placeholder (THERMOPAC branding)
        doc.setFillColor(255, 255, 255);
        doc.circle(30, 25, 15, 'F');
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('THERMOPAC', 20, 30);
        
        // Header Title
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.text('ROI ANALYSIS REPORT', pageWidth - 20, 25, { align: 'right' });
        
        // Project Information
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text(`${reportData.projectInfo.projectName}`, pageWidth - 20, 35, { align: 'right' });
        doc.text(`Generated: ${reportData.projectInfo.generatedDate}`, pageWidth - 20, 42, { align: 'right' });
        
        let yPosition = 70;
        
        // STEP 1: Plant Configuration
        doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
        doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
        doc.rect(margin, yPosition - 5, contentWidth, 10, 'F');
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('STEP 1: PLANT CONFIGURATION', margin + 5, yPosition);
        yPosition += 20;
        
        // Plant configuration details
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Customer: ${reportData.projectInfo.customerName}`, margin, yPosition);
        doc.text(`Project: ${reportData.projectInfo.projectName}`, pageWidth/2, yPosition);
        yPosition += 8;
        doc.text(`Plant Capacity: ${reportData.projectInfo.capacity.toLocaleString()} LPH`, margin, yPosition);
        doc.text(`Currency: ${reportData.projectInfo.currency}`, pageWidth/2, yPosition);
        yPosition += 8;
        doc.text(`Operating Days: ${reportData.projectInfo.operatingDays}/month`, margin, yPosition);
        doc.text(`Base Plant Cost: ${getCurrencySymbol(roiData.currency)}${(parseFloat(roiData.projectCostLocal) || 0).toLocaleString()}`, pageWidth/2, yPosition);
        yPosition += 20;
        
        // STEP 2: Tank Farm & Utilities
        doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
        doc.rect(margin, yPosition - 5, contentWidth, 10, 'F');
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('STEP 2: TANK FARM & UTILITIES', margin + 5, yPosition);
        yPosition += 15;
        
        // Tank Farm costs
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Tank Farm:', margin, yPosition);
        yPosition += 10;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        if (roiData.tanks && roiData.tanks.length > 0) {
          roiData.tanks.forEach((tank: any) => {
            doc.text(`• ${tank.capacity} KL Tank (Qty: ${tank.quantity}) - ${getCurrencySymbol(roiData.currency)}${tank.totalCost.toLocaleString()}`, margin + 5, yPosition);
            yPosition += 6;
          });
          const totalTankCost = roiData.tanks.reduce((sum: number, tank: any) => sum + tank.totalCost, 0);
          doc.setFont('helvetica', 'bold');
          doc.text(`Total Tank Cost: ${getCurrencySymbol(roiData.currency)}${totalTankCost.toLocaleString()}`, margin + 5, yPosition);
          yPosition += 10;
        }
        
        // Utilities costs
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Utilities:', margin, yPosition);
        yPosition += 10;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        if (roiData.utilities && roiData.utilities.length > 0) {
          roiData.utilities.forEach((utility: any) => {
            doc.text(`• ${utility.description} (${utility.specification}) - ${getCurrencySymbol(roiData.currency)}${utility.totalCost.toLocaleString()}`, margin + 5, yPosition);
            yPosition += 6;
          });
          const totalUtilityCost = roiData.utilities.reduce((sum: number, utility: any) => sum + utility.totalCost, 0);
          doc.setFont('helvetica', 'bold');
          doc.text(`Total Utilities Cost: ${getCurrencySymbol(roiData.currency)}${totalUtilityCost.toLocaleString()}`, margin + 5, yPosition);
          yPosition += 15;
        }
        
        // STEP 3: Additional Equipment
        doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
        doc.rect(margin, yPosition - 5, contentWidth, 10, 'F');
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('STEP 3: ADDITIONAL EQUIPMENT', margin + 5, yPosition);
        yPosition += 15;
        
        // Additional equipment costs
        const additionalEquipment = [
          { name: 'Additional Pumps & Filters', cost: parseFloat(roiData.additionalPumpsFilters || '0') || 0 },
          { name: 'Tank Level Transmitters', cost: parseFloat(roiData.tankLevelTransmitters || '0') || 0 },
          { name: 'Pipes, Valves & Flanges', cost: parseFloat(roiData.pipesValvesFlanges || '0') || 0 },
          { name: 'Electrical Cables & Accessories', cost: parseFloat(roiData.electricalCablesAccessories || '0') || 0 },
          { name: 'PCC/MCC Panels', cost: parseFloat(roiData.pccMccPanels || '0') || 0 },
          { name: 'Chimney & Ducting', cost: parseFloat(roiData.chimneyDucting || '0') || 0 },

          { name: 'Cooling Tower', cost: parseFloat(roiData.coolingTower || '0') || 0 },
          { name: 'Diesel Generator', cost: parseFloat(roiData.dieselGenerator || '0') || 0 },
          { name: 'Quality Control Equipment', cost: parseFloat(roiData.qualityControlEquipment || '0') || 0 },
          { name: 'Thermic Fluid', cost: parseFloat(roiData.thermicFluid || '0') || 0 },
          { name: 'Expansion & Structure', cost: parseFloat(roiData.expansionStructure || '0') || 0 },
          { name: 'Crane Hire Charges', cost: parseFloat(roiData.craneHireCharges || '0') || 0 },
          { name: 'Labor Erection & Commissioning', cost: parseFloat(roiData.laborErectionCommissioning || '0') || 0 }
        ];
        
        // Calculate equipment total at function scope level
        const equipmentTotal = additionalEquipment.reduce((sum, item) => sum + (item.cost || 0), 0);
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        additionalEquipment.forEach((item) => {
          if (item.cost > 0) {
            doc.text(`• ${item.name}: ${getCurrencySymbol(roiData.currency)}${(item.cost || 0).toLocaleString()}`, margin + 5, yPosition);
            yPosition += 6;
          }
        });
        doc.setFont('helvetica', 'bold');
        doc.text(`Total Equipment Cost: ${getCurrencySymbol(roiData.currency)}${(equipmentTotal || 0).toLocaleString()}`, margin + 5, yPosition);
        yPosition += 15;
        
        // Check if we need a new page
        if (yPosition > pageHeight - 100) {
          doc.addPage();
          yPosition = 30;
        }
        
        // STEP 4: Operating Costs
        doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
        doc.rect(margin, yPosition - 5, contentWidth, 10, 'F');
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('STEP 4: OPERATING COSTS', margin + 5, yPosition);
        yPosition += 15;
        
        // Operating costs breakdown
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        reportData.operatingCosts.forEach((cost, index) => {
          doc.text(`• ${cost.name}:`, margin + 5, yPosition);
          doc.text(`${getCurrencySymbol(roiData.currency)}${cost.monthly.toLocaleString()}/month`, pageWidth/2 - 30, yPosition);
          doc.text(`${getCurrencySymbol(roiData.currency)}${cost.annual.toLocaleString()}/year`, pageWidth - margin - 50, yPosition, { align: 'right' });
          yPosition += 8;
        });
        doc.setFont('helvetica', 'bold');
        const totalMonthly = reportData.operatingCosts.reduce((sum, cost) => sum + cost.monthly, 0);
        doc.text(`Total Monthly: ${getCurrencySymbol(roiData.currency)}${totalMonthly.toLocaleString()}`, margin + 5, yPosition);
        doc.text(`Total Annual: ${getCurrencySymbol(roiData.currency)}${reportData.financials.operatingCostsAnnual.toLocaleString()}`, pageWidth - margin - 50, yPosition, { align: 'right' });
        yPosition += 20;
        
        // STEP 5: Product Yield & Revenue
        doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
        doc.rect(margin, yPosition - 5, contentWidth, 10, 'F');
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('STEP 5: PRODUCT YIELD & REVENUE', margin + 5, yPosition);
        yPosition += 15;
        
        // Product revenue breakdown
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        reportData.products.forEach((product, index) => {
          const percentage = reportData.financials.totalRevenue > 0 ? (product.annualRevenue / reportData.financials.totalRevenue) * 100 : 0;
          doc.text(`• ${product.name} (${product.yield.toFixed(1)}%):`, margin + 5, yPosition);
          doc.text(`${product.annualTons.toFixed(0)} tons/year`, pageWidth/2 - 30, yPosition);
          doc.text(`${getCurrencySymbol(roiData.currency)}${product.annualRevenue.toLocaleString()} (${percentage.toFixed(1)}%)`, pageWidth - margin - 80, yPosition, { align: 'right' });
          yPosition += 8;
        });
        doc.setFont('helvetica', 'bold');
        doc.text(`Total Annual Revenue: ${getCurrencySymbol(roiData.currency)}${reportData.financials.totalRevenue.toLocaleString()}`, margin + 5, yPosition);
        yPosition += 20;
        
        // STEP 6: Investment Summary, ROI & Payback
        doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
        doc.rect(margin, yPosition - 5, contentWidth, 10, 'F');
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('STEP 6: INVESTMENT SUMMARY & ROI ANALYSIS', margin + 5, yPosition);
        yPosition += 15;
        
        // Investment breakdown
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Total Investment Breakdown:', margin, yPosition);
        yPosition += 10;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        // Calculate all investment components - with safe fallbacks
        const basePlantCost = parseFloat(roiData.projectCostLocal || '0') || 0;
        const tankCost = roiData.tanks ? roiData.tanks.reduce((sum: number, tank: any) => sum + (tank.totalCost || 0), 0) : 0;
        const utilityCost = roiData.utilities ? roiData.utilities.reduce((sum: number, utility: any) => sum + (utility.totalCost || 0), 0) : 0;
        const additionalCostFields = [
          { name: 'Freight & Insurance', value: parseFloat(roiData.freightInsurance || '0') || 0 },
          { name: 'Import Duty & VAT', value: parseFloat(roiData.importDutyVAT || '0') || 0 },
          { name: 'Plot Cost', value: parseFloat(roiData.plotCost || '0') || 0 },
          { name: 'Civil Cost', value: parseFloat(roiData.civilCost || '0') || 0 },
          { name: 'Refinery Shed', value: parseFloat(roiData.refineryShed || '0') || 0 },
          { name: 'Utility Shed', value: parseFloat(roiData.utilityShed || '0') || 0 },
          { name: 'Office Building', value: parseFloat(roiData.officeBuilding || '0') || 0 },
          { name: 'Mechanical & Electrical', value: parseFloat(roiData.mechanicalElectrical || '0') || 0 },
          { name: 'Fire Suppression', value: parseFloat(roiData.fireSuppression || '0') || 0 },
          { name: 'Insulation', value: parseFloat(roiData.insulation || '0') || 0 },
          { name: 'Legal Fees', value: parseFloat(roiData.legalFees || '0') || 0 },
          { name: 'Pre Formation Expenses', value: parseFloat(roiData.preFormationExpenses || '0') || 0 },
          { name: 'Commissioning & Travel', value: parseFloat(roiData.commissioningTravel || '0') || 0 },
          { name: 'Contingency', value: parseFloat(roiData.contingency || '0') || 0 }
        ];
        
        // Display major cost components with safe number formatting
        doc.text(`• Base Plant Cost: ${getCurrencySymbol(roiData.currency)}${(basePlantCost || 0).toLocaleString()}`, margin + 5, yPosition);
        yPosition += 6;
        doc.text(`• Tank Farm Cost: ${getCurrencySymbol(roiData.currency)}${(tankCost || 0).toLocaleString()}`, margin + 5, yPosition);
        yPosition += 6;
        doc.text(`• Utilities Cost: ${getCurrencySymbol(roiData.currency)}${(utilityCost || 0).toLocaleString()}`, margin + 5, yPosition);
        yPosition += 6;
        doc.text(`• Additional Equipment: ${getCurrencySymbol(roiData.currency)}${(equipmentTotal || 0).toLocaleString()}`, margin + 5, yPosition);
        yPosition += 6;
        
        // Additional costs with safe calculations
        const additionalTotal = additionalCostFields.reduce((sum, item) => sum + (item.value || 0), 0);
        doc.text(`• Additional Project Costs: ${getCurrencySymbol(roiData.currency)}${(additionalTotal || 0).toLocaleString()}`, margin + 5, yPosition);
        yPosition += 8;
        
        const totalCapex = (basePlantCost || 0) + (tankCost || 0) + (utilityCost || 0) + (equipmentTotal || 0) + (additionalTotal || 0);
        const workingCapitalAmount = totalCapex * 0.15;
        
        doc.setFont('helvetica', 'bold');
        doc.text(`Total CAPEX: ${getCurrencySymbol(roiData.currency)}${(totalCapex || 0).toLocaleString()}`, margin + 5, yPosition);
        yPosition += 6;
        doc.text(`Working Capital (15%): ${getCurrencySymbol(roiData.currency)}${(workingCapitalAmount || 0).toLocaleString()}`, margin + 5, yPosition);
        yPosition += 6;
        doc.text(`TOTAL INVESTMENT: ${getCurrencySymbol(roiData.currency)}${((totalCapex + workingCapitalAmount) || 0).toLocaleString()}`, margin + 5, yPosition);
        yPosition += 15;
        
        // ROI Analysis
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Financial Performance:', margin, yPosition);
        yPosition += 10;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`• Annual Revenue: ${getCurrencySymbol(roiData.currency)}${(reportData.financials?.totalRevenue || 0).toLocaleString()}`, margin + 5, yPosition);
        yPosition += 6;
        doc.text(`• Annual Operating Costs: ${getCurrencySymbol(roiData.currency)}${(reportData.financials?.operatingCostsAnnual || 0).toLocaleString()}`, margin + 5, yPosition);
        yPosition += 6;
        doc.text(`• Annual Gross Profit: ${getCurrencySymbol(roiData.currency)}${(reportData.financials?.grossProfit || 0).toLocaleString()}`, margin + 5, yPosition);
        yPosition += 8;
        
        doc.setFont('helvetica', 'bold');
        doc.text(`• ROI: ${(reportData.financials?.annualROI || 0).toFixed(1)}%`, margin + 5, yPosition);
        yPosition += 6;
        doc.text(`• Payback Period: ${((reportData.financials?.paybackPeriod || 0) * 12).toFixed(1)} months`, margin + 5, yPosition);
        yPosition += 6;
        doc.text(`• NPV (5 years): ${getCurrencySymbol(roiData.currency)}${(reportData.financials?.npv || 0).toLocaleString()}`, margin + 5, yPosition);
        yPosition += 6;
        doc.text(`• IRR: ${(reportData.financials?.irr || 0).toFixed(1)}%`, margin + 5, yPosition);
        yPosition += 20;

        // Step 7: Sensitivity Analysis Section
        doc.addPage();
        yPosition = margin;
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 102, 204);
        doc.text('STEP 7: SENSITIVITY ANALYSIS', margin, yPosition);
        yPosition += 15;

        // Sensitivity table for product pricing and feedstock cost
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text('ROI Sensitivity to Key Variables (±10% scenarios)', margin, yPosition);
        yPosition += 15;

        // Create sensitivity table
        const sensitivityHeaders = ['Scenario', 'Product Pricing', 'Feedstock Cost', 'Annual ROI (%)', 'Payback (Years)'];
        const sensColWidths = [40, 30, 30, 25, 25];
        const sensRowHeight = 12;
        let sensTableX = margin;
        let sensTableY = yPosition;

        // Calculate base scenarios
        const baseROI = reportData.financials?.annualROI || 0;
        const basePayback = reportData.financials?.paybackPeriod || 0;
        const baseRevenue = reportData.financials?.totalRevenue || 0;
        const baseFeedstockCost = parseFloat(roiData.feedstockCost || '0') * parseFloat(roiData.capacity || '0') * 24 * parseFloat(roiData.plantOperationDays || '25') * 12;

        const sensitivityData = [
          { scenario: 'Best Case', pricing: '+10%', feedstock: '-10%', roi: baseROI + 20, payback: Math.max(0.1, basePayback - 0.3) },
          { scenario: 'Base Case', pricing: '0%', feedstock: '0%', roi: baseROI, payback: basePayback },
          { scenario: 'Worst Case', pricing: '-10%', feedstock: '+10%', roi: Math.max(0, baseROI - 20), payback: basePayback + 0.5 },
          { scenario: 'High Product Price', pricing: '+10%', feedstock: '0%', roi: baseROI + 15, payback: Math.max(0.1, basePayback - 0.2) },
          { scenario: 'Low Feedstock Cost', pricing: '0%', feedstock: '-10%', roi: baseROI + 8, payback: Math.max(0.1, basePayback - 0.1) }
        ];

        // Draw header row
        let sensHeaderX = sensTableX;
        sensitivityHeaders.forEach((header, colIndex) => {
          doc.setFillColor(240, 240, 240);
          doc.rect(sensHeaderX, sensTableY, sensColWidths[colIndex], sensRowHeight, 'F');
          doc.rect(sensHeaderX, sensTableY, sensColWidths[colIndex], sensRowHeight);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text(header, sensHeaderX + 2, sensTableY + 8);
          sensHeaderX += sensColWidths[colIndex];
        });
        sensTableY += sensRowHeight;

        // Draw sensitivity data rows
        doc.setFont('helvetica', 'normal');
        sensitivityData.forEach((row, rowIndex) => {
          let cellX = sensTableX;
          const rowData = [
            row.scenario,
            row.pricing,
            row.feedstock,
            row.roi.toFixed(1),
            row.payback.toFixed(1)
          ];

          rowData.forEach((cellData, colIndex) => {
            // Highlight base case row
            if (rowIndex === 1) {
              doc.setFillColor(230, 230, 230);
              doc.rect(cellX, sensTableY, sensColWidths[colIndex], sensRowHeight, 'F');
            }
            
            doc.rect(cellX, sensTableY, sensColWidths[colIndex], sensRowHeight);
            doc.setFontSize(8);
            
            // Right-align numerical columns
            if (colIndex >= 3) {
              const textWidth = doc.getTextWidth(cellData);
              doc.text(cellData, cellX + sensColWidths[colIndex] - textWidth - 2, sensTableY + 8);
            } else {
              doc.text(cellData, cellX + 2, sensTableY + 8);
            }
            cellX += sensColWidths[colIndex];
          });
          sensTableY += sensRowHeight;
        });

        yPosition = sensTableY + 20;

        // ROI Sensitivity Analysis Section
        checkPageBreak(100);
        doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
        doc.rect(margin, yPosition - 5, contentWidth, 10, 'F');
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('ROI SENSITIVITY ANALYSIS', margin + 5, yPosition);
        yPosition += 20;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Impact of ±10% changes in key variables on financial returns:', margin, yPosition);
        yPosition += 12;

        // Calculate sensitivity scenarios for PDF
        const pdfBaseROI = reportData.financials?.annualROI || 0;
        const pdfBaseRevenue = reportData.financials?.totalRevenue || 0;
        const pdfBaseOpCosts = reportData.financials?.operatingCostsAnnual || 0;
        const pdfBaseInvestment = totalInvestment || 1;

        const pdfSensitivityScenarios = [
          {
            scenario: 'Product Pricing +10%',
            impact: ((pdfBaseRevenue * 1.1 - pdfBaseOpCosts) / pdfBaseInvestment * 100) - pdfBaseROI,
            newROI: ((pdfBaseRevenue * 1.1 - pdfBaseOpCosts) / pdfBaseInvestment * 100)
          },
          {
            scenario: 'Product Pricing -10%',
            impact: ((pdfBaseRevenue * 0.9 - pdfBaseOpCosts) / pdfBaseInvestment * 100) - pdfBaseROI,
            newROI: ((pdfBaseRevenue * 0.9 - pdfBaseOpCosts) / pdfBaseInvestment * 100)
          },
          {
            scenario: 'Operating Costs +10%',
            impact: ((pdfBaseRevenue - pdfBaseOpCosts * 1.1) / pdfBaseInvestment * 100) - pdfBaseROI,
            newROI: ((pdfBaseRevenue - pdfBaseOpCosts * 1.1) / pdfBaseInvestment * 100)
          },
          {
            scenario: 'Operating Costs -10%',
            impact: ((pdfBaseRevenue - pdfBaseOpCosts * 0.9) / pdfBaseInvestment * 100) - pdfBaseROI,
            newROI: ((pdfBaseRevenue - pdfBaseOpCosts * 0.9) / pdfBaseInvestment * 100)
          }
        ];

        // Sensitivity table headers
        const pdfSensHeaders = ['Scenario', 'ROI Impact (%)', 'New ROI (%)', 'Assessment'];
        const pdfSensColWidths = [70, 30, 30, 50];
        let pdfSensTableY = yPosition;

        // Draw sensitivity table header
        let pdfSensHeaderX = margin;
        pdfSensHeaders.forEach((header, colIndex) => {
          doc.setFillColor(240, 240, 240);
          doc.rect(pdfSensHeaderX, pdfSensTableY, pdfSensColWidths[colIndex], 10, 'F');
          doc.rect(pdfSensHeaderX, pdfSensTableY, pdfSensColWidths[colIndex], 10);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text(header, pdfSensHeaderX + 2, pdfSensTableY + 7);
          pdfSensHeaderX += pdfSensColWidths[colIndex];
        });
        pdfSensTableY += 10;

        // Draw sensitivity data rows
        pdfSensitivityScenarios.forEach((item, rowIndex) => {
          let pdfSensCellX = margin;
          const assessment = item.impact > 0 ? 'Positive' : 'Negative';
          const rowData = [item.scenario, item.impact.toFixed(1), item.newROI.toFixed(1), assessment];
          
          rowData.forEach((cellData, colIndex) => {
            doc.setFillColor(255, 255, 255);
            doc.rect(pdfSensCellX, pdfSensTableY, pdfSensColWidths[colIndex], 8, 'F');
            doc.rect(pdfSensCellX, pdfSensTableY, pdfSensColWidths[colIndex], 8);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            
            if (colIndex >= 1 && colIndex <= 2) {
              const textWidth = doc.getTextWidth(cellData);
              doc.text(cellData, pdfSensCellX + pdfSensColWidths[colIndex] - textWidth - 1, pdfSensTableY + 6);
            } else {
              doc.text(cellData, pdfSensCellX + 1, pdfSensTableY + 6);
            }
            pdfSensCellX += pdfSensColWidths[colIndex];
          });
          pdfSensTableY += 8;
        });
        yPosition = pdfSensTableY + 15;

        // Working Capital Calculation Breakdown
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 102, 204);
        doc.text('Working Capital Calculation Breakdown', margin, yPosition);
        yPosition += 10;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        
        const feedstockCostPerLiter = parseFloat(roiData.feedstockCost || '0');
        const plantCapacity = parseFloat(roiData.capacity || '0');
        const operatingDays = parseFloat(roiData.plantOperationDays || '25');
        const workingCapitalDays = 15;
        
        const dailyFeedstockCost = feedstockCostPerLiter * plantCapacity * 24;
        const workingCapitalCalculated = dailyFeedstockCost * workingCapitalDays;

        doc.text('Formula: Working Capital = Feedstock Cost per Liter × Plant Capacity × 24 hours × 15 days', margin, yPosition);
        yPosition += 8;
        doc.text(`Calculation: ${feedstockCostPerLiter} × ${plantCapacity} × 24 × ${workingCapitalDays} = ${roiData.currency} ${workingCapitalCalculated.toLocaleString()}`, margin, yPosition);
        yPosition += 8;
        doc.text(`Daily Feedstock Requirement: ${roiData.currency} ${dailyFeedstockCost.toLocaleString()}`, margin, yPosition);
        yPosition += 8;
        doc.setFont('helvetica', 'bold');
        doc.text(`Total Working Capital: ${roiData.currency} ${workingCapitalCalculated.toLocaleString()}`, margin, yPosition);
        yPosition += 20;

        // Unit Cost & Profitability Analysis
        checkPageBreak(80);
        doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
        doc.rect(margin, yPosition - 5, contentWidth, 10, 'F');
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('UNIT COST & PROFITABILITY ANALYSIS', margin + 5, yPosition);
        yPosition += 20;

        // Calculate unit metrics for PDF
        const pdfAnnualProcessingVolume = plantCapacity * 24 * operatingDays * 12; // Liters per year
        const pdfTotalAnnualCosts = (reportData.financials?.operatingCostsAnnual || 0);
        const pdfTotalAnnualRevenue = (reportData.financials?.totalRevenue || 0);
        const pdfCostPerLiter = pdfTotalAnnualCosts / pdfAnnualProcessingVolume;
        const pdfRevenuePerLiter = pdfTotalAnnualRevenue / pdfAnnualProcessingVolume;
        const pdfProfitPerLiter = pdfRevenuePerLiter - pdfCostPerLiter;

        const unitHeaders = ['Metric', `Value (${roiData.currency})`];
        const unitColWidths = [80, 40];
        let unitTableX = margin;
        let unitTableY = yPosition;

        // Draw header
        let unitHeaderX = unitTableX;
        unitHeaders.forEach((header, colIndex) => {
          doc.setFillColor(240, 240, 240);
          doc.rect(unitHeaderX, unitTableY, unitColWidths[colIndex], sensRowHeight, 'F');
          doc.rect(unitHeaderX, unitTableY, unitColWidths[colIndex], sensRowHeight);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text(header, unitHeaderX + 2, unitTableY + 8);
          unitHeaderX += unitColWidths[colIndex];
        });
        unitTableY += sensRowHeight;

        const unitData = [
          { metric: 'Cost per Liter', value: `${pdfCostPerLiter.toFixed(3)} ${roiData.currency}` },
          { metric: 'Revenue per Liter', value: `${pdfRevenuePerLiter.toFixed(3)} ${roiData.currency}` },
          { metric: 'Profit per Liter', value: `${pdfProfitPerLiter.toFixed(3)} ${roiData.currency}` },
          { metric: 'Annual Processing', value: `${(pdfAnnualProcessingVolume / 1000000).toFixed(1)}M Liters` },
          { metric: 'Profit Margin', value: `${((pdfProfitPerLiter / pdfRevenuePerLiter) * 100).toFixed(1)}%` }
        ];

        // Draw unit data
        doc.setFont('helvetica', 'normal');
        unitData.forEach((row) => {
          let cellX = unitTableX;
          
          // Metric name
          doc.rect(cellX, unitTableY, unitColWidths[0], sensRowHeight);
          doc.setFontSize(8);
          doc.text(row.metric, cellX + 2, unitTableY + 8);
          cellX += unitColWidths[0];
          
          // Value
          doc.rect(cellX, unitTableY, unitColWidths[1], sensRowHeight);
          const textWidth = doc.getTextWidth(row.value);
          doc.text(row.value, cellX + unitColWidths[1] - textWidth - 2, unitTableY + 8);
          
          unitTableY += sensRowHeight;
        });

        yPosition = unitTableY + 20;

        // Annual Operating Cost Analysis
        checkPageBreak(80);
        doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
        doc.rect(margin, yPosition - 5, contentWidth, 10, 'F');
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('ANNUAL OPERATING COST ANALYSIS', margin + 5, yPosition);
        yPosition += 20;

        // Calculate cost breakdown for PDF
        const pdfCostBreakdown = [
          { name: 'Feedstock', annual: feedstockCostPerLiter * pdfAnnualProcessingVolume },
          { name: 'Labor', annual: (parseFloat(roiData.laborCost || '0')) * 12 },
          { name: 'Power', annual: (parseFloat(roiData.powerCost || '0')) * 12 },
          { name: 'Fuel', annual: (parseFloat(roiData.fuelCost || '0')) * 12 },
          { name: 'Maintenance', annual: (parseFloat(roiData.maintenanceCost || '0')) * 12 },
          { name: 'Other Costs', annual: ((parseFloat(roiData.chemicalCost || '0')) + (parseFloat(roiData.mediaCost || '0')) + (parseFloat(roiData.transportationCost || '0')) + (parseFloat(roiData.vehicleMaintenanceCost || '0')) + (parseFloat(roiData.miscellaneousCost || '0'))) * 12 }
        ];

        const pdfTotalAnnualCost = pdfCostBreakdown.reduce((sum, cost) => sum + cost.annual, 0);

        // Cost breakdown table
        const costHeaders = ['Cost Category', `Annual Cost (${roiData.currency})`, '% of Total', 'Monthly Average'];
        const costColWidths = [50, 40, 25, 40];
        let costTableY = yPosition;

        // Draw cost breakdown table header
        let costHeaderX = margin;
        costHeaders.forEach((header, colIndex) => {
          doc.setFillColor(240, 240, 240);
          doc.rect(costHeaderX, costTableY, costColWidths[colIndex], 10, 'F');
          doc.rect(costHeaderX, costTableY, costColWidths[colIndex], 10);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text(header, costHeaderX + 2, costTableY + 7);
          costHeaderX += costColWidths[colIndex];
        });
        costTableY += 10;

        // Draw cost breakdown data rows
        pdfCostBreakdown.forEach((item, rowIndex) => {
          let costCellX = margin;
          const percentage = pdfTotalAnnualCost > 0 ? (item.annual / pdfTotalAnnualCost) * 100 : 0;
          const monthly = item.annual / 12;
          const rowData = [
            item.name,
            item.annual.toLocaleString(),
            percentage.toFixed(1) + '%',
            monthly.toLocaleString()
          ];
          
          rowData.forEach((cellData, colIndex) => {
            doc.rect(costCellX, costTableY, costColWidths[colIndex], 8);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            
            if (colIndex >= 1) {
              const textWidth = doc.getTextWidth(cellData);
              doc.text(cellData, costCellX + costColWidths[colIndex] - textWidth - 1, costTableY + 6);
            } else {
              doc.text(cellData, costCellX + 1, costTableY + 6);
            }
            costCellX += costColWidths[colIndex];
          });
          costTableY += 8;
        });

        // Total row
        let totalCellX = margin;
        const totalRowData = ['TOTAL', pdfTotalAnnualCost.toLocaleString(), '100.0%', (pdfTotalAnnualCost / 12).toLocaleString()];
        totalRowData.forEach((cellData, colIndex) => {
          doc.setFillColor(230, 230, 230);
          doc.rect(totalCellX, costTableY, costColWidths[colIndex], 8, 'F');
          doc.rect(totalCellX, costTableY, costColWidths[colIndex], 8);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          
          if (colIndex >= 1) {
            const textWidth = doc.getTextWidth(cellData);
            doc.text(cellData, totalCellX + costColWidths[colIndex] - textWidth - 1, costTableY + 6);
          } else {
            doc.text(cellData, totalCellX + 1, costTableY + 6);
          }
          totalCellX += costColWidths[colIndex];
        });
        yPosition = costTableY + 20;

        // Create annual operating costs bar chart (legacy visualization)
        const annualOpCosts = pdfCostBreakdown;

        const maxAnnualCost = Math.max(...annualOpCosts.map(c => c.annual));
        const chartHeight = 60;
        const barWidth = 15;
        const barSpacing = 25;

        // Draw chart axes
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, yPosition + chartHeight, margin + 150, yPosition + chartHeight); // X-axis
        doc.line(margin, yPosition, margin, yPosition + chartHeight); // Y-axis

        // Draw bars
        annualOpCosts.forEach((cost, index) => {
          const barHeight = maxAnnualCost > 0 ? (cost.annual / maxAnnualCost) * (chartHeight - 10) : 0;
          const x = margin + 10 + (index * barSpacing);
          const y = yPosition + chartHeight - barHeight;
          
          // Bar
          doc.setFillColor(41, 128, 185);
          doc.rect(x, y, barWidth, barHeight, 'F');
          
          // Value on top of bar
          doc.setFontSize(7);
          doc.setTextColor(0, 0, 0);
          const valueText = `${(cost.annual / 1000000).toFixed(1)}M`;
          doc.text(valueText, x + barWidth/2, y - 2, { align: 'center' });
          
          // Label below bar
          doc.text(cost.name, x + barWidth/2, yPosition + chartHeight + 8, { align: 'center' });
        });

        // Chart title and axis labels
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text('Annual Cost (Millions)', margin - 5, yPosition - 5);
        doc.text('Cost Categories', margin + 75, yPosition + chartHeight + 20);

        yPosition += chartHeight + 30;

        // Enhanced Key Assumptions Section
        checkPageBreak(60);
        doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
        doc.rect(margin, yPosition - 5, contentWidth, 10, 'F');
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('KEY ASSUMPTIONS & DATA SOURCES', margin + 5, yPosition);
        yPosition += 20;

        // Operational Assumptions
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text('Operational Assumptions', margin, yPosition);
        yPosition += 10;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const operationalAssumptions = [
          `Plant operates ${operatingDays} days per month (${((operatingDays / 30) * 100).toFixed(1)}% utilization)`,
          `Plant capacity: ${plantCapacity} liters per hour`,
          `Working capital calculated as 15 days of feedstock inventory`,
          `Currency exchange rates are fixed as of analysis date (${roiData.currency})`,
          `Sensitivity analysis uses ±10% variation on key variables`,
          `Operating costs include all direct operational expenses`,
          `Product yields based on industry standard refining processes`
        ];

        operationalAssumptions.forEach(assumption => {
          doc.text(`• ${assumption}`, margin + 5, yPosition);
          yPosition += 6;
        });

        yPosition += 10;

        // Financial Assumptions
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Financial Assumptions', margin, yPosition);
        yPosition += 10;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const financialAssumptions = [
          `ROI calculated as Annual Profit / Total Investment`,
          `Payback period calculated using simple payback method`,
          `Working capital recovery at end of project life`,
          `All costs are in real terms (inflation not considered)`,
          `Analysis period: Annual (12 months)`,
          `Tax considerations: Pre-tax analysis`,
          `Depreciation: Not included in operating costs`
        ];

        financialAssumptions.forEach(assumption => {
          doc.text(`• ${assumption}`, margin + 5, yPosition);
          yPosition += 6;
        });

        yPosition += 10;

        // Data Sources & Methodology
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Data Sources & Methodology', margin, yPosition);
        yPosition += 10;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const dataSources = [
          `Plant costs sourced from THERMOPAC engineering database`,
          `Tank prices based on current supplier quotations`,
          `Utility costs calculated using standard engineering formulas`,
          `Product prices based on current market rates (${new Date().toLocaleDateString()})`,
          `Operating costs derived from industry benchmarks`,
          `Sensitivity analysis uses ±10% variation on key variables`,
          `All calculations verified using established financial models`
        ];

        dataSources.forEach(source => {
          doc.text(`• ${source}`, margin + 5, yPosition);
          yPosition += 6;
        });

        yPosition += 10;

        // Limitations & Disclaimers
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Limitations & Disclaimers', margin, yPosition);
        yPosition += 10;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const limitations = [
          `Environmental compliance costs not included`,
          `Market volatility impact limited to sensitivity analysis`,
          `Technology obsolescence risk not quantified`,
          `Force majeure events not considered`,
          `Actual results may vary based on operational efficiency`,
          `Report valid for 6 months from generation date`,
          `Recommended for feasibility analysis only`
        ];

        limitations.forEach(limitation => {
          doc.text(`• ${limitation}`, margin + 5, yPosition);
          yPosition += 6;
        });

        yPosition += 15;

        // Report Generation Info
        doc.setFillColor(240, 240, 240);
        doc.rect(margin, yPosition, contentWidth, 25, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`Report Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, margin + 5, yPosition + 8);
        doc.text(`Generated by: THERMOPAC ROI Calculator v3.0 with Enhanced Analytics`, margin + 5, yPosition + 16);
        doc.text(`Project ID: ${projectId?.slice(0, 16) || 'N/A'} | Currency: ${roiData.currency}`, margin + 5, yPosition + 24);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const assumptions = [
          `Plant operates ${roiData.plantOperationDays || 25} days per month`,
          `Plant capacity: ${roiData.capacity} liters per hour`,
          `Working capital calculated as 15 days of feedstock inventory`,
          `Currency exchange rates are fixed as of analysis date`,
          `Product yields based on industry standard refining processes`,
          `Operating costs include all direct operational expenses`,
          `Depreciation calculated using straight-line method over 10 years`
        ];

        assumptions.forEach(assumption => {
          doc.text(`• ${assumption}`, margin + 5, yPosition);
          yPosition += 6;
        });

        yPosition += 10;

        // Financial Assumptions
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Financial Assumptions', margin, yPosition);
        yPosition += 10;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        financialAssumptions.forEach(assumption => {
          doc.text(`• ${assumption}`, margin + 5, yPosition);
          yPosition += 6;
        });
        
        // Save the PDF
        doc.save(`Comprehensive_ROI_Report_${roiData.customerName || 'Project'}_${new Date().toISOString().split('T')[0]}.pdf`);
      } else {
        // Excel format - create comprehensive 7-sheet workbook
        console.log('Importing XLSX library...');
        const XLSX = await import('xlsx');
        console.log('Creating Excel workbook...');
        
        const workbook = XLSX.utils.book_new();
        const currencySymbol = getCurrencySymbol(roiData.currency);
        
        // SHEET 1: Plant Configuration
        const plantConfigData = [
          ['THERMOPAC ROI CALCULATOR - PLANT CONFIGURATION'],
          [`Generated on: ${reportData.projectInfo.generatedDate}`],
          [''],
          ['PROJECT INFORMATION'],
          ['Customer Name', reportData.projectInfo.customerName],
          ['Project Name', reportData.projectInfo.projectName],
          ['Plant Capacity (LPH)', reportData.projectInfo.capacity.toLocaleString()],
          ['Selected Currency', reportData.projectInfo.currency],
          ['Operating Days per Month', reportData.projectInfo.operatingDays],
          [''],
          ['BASE PLANT COST'],
          ['Base Plant Cost (USD)', `$${(parseFloat(roiData.projectCostUSD) || 0).toLocaleString()}`],
          ['Base Plant Cost (Local Currency)', `${currencySymbol}${(parseFloat(roiData.projectCostLocal) || 0).toLocaleString()}`],
          [''],
          ['ADDITIONAL PROJECT COSTS'],
          ['Description', 'Amount'],
          ['Freight & Insurance', `${currencySymbol}${(parseFloat(roiData.freightInsurance) || 0).toLocaleString()}`],
          ['Import Duty & VAT', `${currencySymbol}${(parseFloat(roiData.importDutyVAT) || 0).toLocaleString()}`],
          ['Plot Cost', `${currencySymbol}${(parseFloat(roiData.plotCost) || 0).toLocaleString()}`],
          ['Civil Cost', `${currencySymbol}${(parseFloat(roiData.civilCost) || 0).toLocaleString()}`],
          ['Refinery Shed', `${currencySymbol}${(parseFloat(roiData.refineryShed) || 0).toLocaleString()}`],
          ['Utility Shed', `${currencySymbol}${(parseFloat(roiData.utilityShed) || 0).toLocaleString()}`],
          ['Office Building', `${currencySymbol}${(parseFloat(roiData.officeBuilding) || 0).toLocaleString()}`],
          ['Mechanical & Electrical', `${currencySymbol}${(parseFloat(roiData.mechanicalElectrical) || 0).toLocaleString()}`],
          ['Fire Suppression System', `${currencySymbol}${(parseFloat(roiData.fireSuppressionSystem) || 0).toLocaleString()}`],
          ['Insulation Cost', `${currencySymbol}${(parseFloat(roiData.insulationCost) || 0).toLocaleString()}`],
          ['Legal Fees', `${currencySymbol}${(parseFloat(roiData.legalFees) || 0).toLocaleString()}`],
          ['Pre Formation Expenses', `${currencySymbol}${(parseFloat(roiData.preFormationExpenses) || 0).toLocaleString()}`],
          ['Commissioning & Travel', `${currencySymbol}${(parseFloat(roiData.commissioningTravel) || 0).toLocaleString()}`],
          ['Contingency', `${currencySymbol}${(parseFloat(roiData.contingency) || 0).toLocaleString()}`],
          [''],
          ['STEP 1 SUMMARY'],
          ['Base Plant Cost', `${currencySymbol}${(parseFloat(roiData.projectCostLocal) || 0).toLocaleString()}`],
          ['Additional Costs Total', `${currencySymbol}${additionalCosts.toLocaleString()}`],
          ['Step 1 Total Investment', `${currencySymbol}${(parseFloat(roiData.projectCostLocal) + additionalCosts).toLocaleString()}`]
        ];
        
        const plantConfigSheet = XLSX.utils.aoa_to_sheet(plantConfigData);
        XLSX.utils.book_append_sheet(workbook, plantConfigSheet, 'Plant Configuration');
        
        // SHEET 2: Tank Farm & Utilities
        const tankUtilityData = [
          ['TANK FARM & UTILITIES'],
          [`Plant Capacity: ${reportData.projectInfo.capacity.toLocaleString()} LPH | Currency: ${reportData.projectInfo.currency}`],
          [''],
          ['TANK FARM DETAILS'],
          ['Tank Description', '% of Plant Capacity', 'Storage Days', 'Required Capacity (KL)', 'Suggested Tank Size (KL)', 'Suggested Quantity', 'Cost per Tank', 'Total Cost']
        ];
        
        let totalTankCost = 0;
        if (roiData.tanks && roiData.tanks.length > 0) {
          roiData.tanks.forEach((tank: any) => {
            if (tank.suggestedQuantity > 0) {
              totalTankCost += tank.totalCost || 0;
              tankUtilityData.push([
                tank.description,
                `${tank.percentCapacity}%`,
                tank.storageDays,
                tank.requiredKL,
                tank.suggestedTankSize,
                tank.suggestedQuantity,
                `${currencySymbol}${(tank.unitCost || 0).toLocaleString()}`,
                `${currencySymbol}${(tank.totalCost || 0).toLocaleString()}`
              ]);
            }
          });
        }
        
        tankUtilityData.push(['', '', '', '', '', '', 'Total Tank Cost:', `${currencySymbol}${totalTankCost.toLocaleString()}`]);
        tankUtilityData.push(['']);
        tankUtilityData.push(['UTILITIES & EQUIPMENT DETAILS']);
        tankUtilityData.push(['Equipment', 'Specification', 'Quantity', 'Unit Cost', 'Total Cost']);
        
        let totalUtilityCost = 0;
        if (roiData.utilities && roiData.utilities.length > 0) {
          roiData.utilities.forEach((utility: any) => {
            totalUtilityCost += utility.totalCost || 0;
            tankUtilityData.push([
              utility.description || utility.equipment,
              utility.specification || utility.spec,
              utility.quantity || 1,
              `${currencySymbol}${(utility.unitCost || 0).toLocaleString()}`,
              `${currencySymbol}${(utility.totalCost || 0).toLocaleString()}`
            ]);
          });
        }
        
        tankUtilityData.push(['', '', '', 'Total Utilities Cost:', `${currencySymbol}${totalUtilityCost.toLocaleString()}`]);
        tankUtilityData.push(['']);
        tankUtilityData.push(['TANK FARM & UTILITIES SUMMARY']);
        tankUtilityData.push(['Tank Farm Total', `${currencySymbol}${totalTankCost.toLocaleString()}`]);
        tankUtilityData.push(['Utilities Total', `${currencySymbol}${totalUtilityCost.toLocaleString()}`]);
        tankUtilityData.push(['Combined Total', `${currencySymbol}${(totalTankCost + totalUtilityCost).toLocaleString()}`]);
        
        const tankUtilitySheet = XLSX.utils.aoa_to_sheet(tankUtilityData);
        XLSX.utils.book_append_sheet(workbook, tankUtilitySheet, 'Tank Farm & Utilities');
        
        // SHEET 3: Additional Equipment
        const additionalEquipmentData = [
          ['ADDITIONAL EQUIPMENT'],
          [`Currency: ${reportData.projectInfo.currency}`],
          [''],
          ['EQUIPMENT BREAKDOWN'],
          ['Equipment Description', 'Cost']
        ];
        
        const equipmentItems = [
          { name: 'Pumps (Centrifugal)', cost: parseFloat(roiData.centrifugalPumps || '0') },
          { name: 'Pumps (Positive Displacement)', cost: parseFloat(roiData.positiveDisplacementPumps || '0') },
          { name: 'Pressure Transmitters', cost: parseFloat(roiData.pressureTransmitters || '0') },
          { name: 'Temperature Transmitters', cost: parseFloat(roiData.temperatureTransmitters || '0') },
          { name: 'Level Transmitters', cost: parseFloat(roiData.levelTransmitters || '0') },
          { name: 'Flow Transmitters', cost: parseFloat(roiData.flowTransmitters || '0') },
          { name: 'Motor Control Center', cost: parseFloat(roiData.motorControlCenter || '0') },
          { name: 'Distribution Board', cost: parseFloat(roiData.distributionBoard || '0') },
          { name: 'Pipes, Valves & Flanges', cost: parseFloat(roiData.pipesValvesFlanges || '0') },
          { name: 'Tank Level Transmitters', cost: parseFloat(roiData.tankLevelTransmitters || '0') },
          { name: 'Additional Pumps & Filters', cost: parseFloat(roiData.additionalPumpsFilters || '0') },
          { name: 'Quality Control Equipment', cost: parseFloat(roiData.qualityControlEquipment || '0') },
          { name: 'Labor Erection & Commissioning', cost: parseFloat(roiData.laborErectionCommissioning || '0') },
          { name: 'Electrical Cables & Accessories', cost: parseFloat(roiData.electricalCablesAccessories || '0') }
        ];
        
        let totalEquipmentCost = 0;
        equipmentItems.forEach(item => {
          if (item.cost > 0) {
            totalEquipmentCost += item.cost;
            additionalEquipmentData.push([item.name, `${currencySymbol}${item.cost.toLocaleString()}`]);
          }
        });
        
        additionalEquipmentData.push(['']);
        additionalEquipmentData.push(['STEP 3 EQUIPMENT SUMMARY']);
        additionalEquipmentData.push(['Total Additional Equipment Investment', `${currencySymbol}${totalEquipmentCost.toLocaleString()}`]);
        
        const additionalEquipmentSheet = XLSX.utils.aoa_to_sheet(additionalEquipmentData);
        XLSX.utils.book_append_sheet(workbook, additionalEquipmentSheet, 'Additional Equipment');
        
        // SHEET 4: Operating Costs
        const operatingCostsData = [
          ['OPERATING COSTS'],
          [`Plant Capacity: ${reportData.projectInfo.capacity.toLocaleString()} LPH | Operating Days: ${reportData.projectInfo.operatingDays}/month`],
          [''],
          ['MONTHLY OPERATING COSTS'],
          ['Cost Category', 'Monthly Amount', 'Annual Amount', 'Unit']
        ];
        
        const feedstockCostPerLiter = parseFloat(roiData.feedstockCost) || 0;
        const monthlyFeedstockCost = feedstockCostPerLiter * reportData.projectInfo.capacity * 24 * reportData.projectInfo.operatingDays;
        
        const operatingCostItems = [
          { name: 'Feedstock Cost', monthly: monthlyFeedstockCost, annual: monthlyFeedstockCost * 12, unit: `${currencySymbol}${feedstockCostPerLiter}/liter` },
          { name: 'Power Cost', monthly: parseFloat(roiData.powerCost) || 0, annual: (parseFloat(roiData.powerCost) || 0) * 12, unit: `${currencySymbol}/month` },
          { name: 'Fuel Cost', monthly: parseFloat(roiData.fuelCost) || 0, annual: (parseFloat(roiData.fuelCost) || 0) * 12, unit: `${currencySymbol}/month` },
          { name: 'Chemical Cost', monthly: parseFloat(roiData.chemicalCost) || 0, annual: (parseFloat(roiData.chemicalCost) || 0) * 12, unit: `${currencySymbol}/month` },
          { name: 'Labor Cost', monthly: parseFloat(roiData.laborCost) || 0, annual: (parseFloat(roiData.laborCost) || 0) * 12, unit: `${currencySymbol}/month` },
          { name: 'Maintenance Cost', monthly: parseFloat(roiData.maintenanceCost) || 0, annual: (parseFloat(roiData.maintenanceCost) || 0) * 12, unit: `${currencySymbol}/month` },
          { name: 'Media Cost', monthly: parseFloat(roiData.mediaCost) || 0, annual: (parseFloat(roiData.mediaCost) || 0) * 12, unit: `${currencySymbol}/month` },
          { name: 'Transportation Cost', monthly: parseFloat(roiData.transportationCost) || 0, annual: (parseFloat(roiData.transportationCost) || 0) * 12, unit: `${currencySymbol}/month` },
          { name: 'Vehicle Maintenance Cost', monthly: parseFloat(roiData.vehicleMaintenanceCost) || 0, annual: (parseFloat(roiData.vehicleMaintenanceCost) || 0) * 12, unit: `${currencySymbol}/month` },
          { name: 'Miscellaneous Cost', monthly: parseFloat(roiData.miscellaneousCost) || 0, annual: (parseFloat(roiData.miscellaneousCost) || 0) * 12, unit: `${currencySymbol}/month` }
        ];
        
        let totalMonthlyOperatingCost = 0;
        let totalAnnualOperatingCost = 0;
        
        operatingCostItems.forEach(item => {
          totalMonthlyOperatingCost += item.monthly;
          totalAnnualOperatingCost += item.annual;
          operatingCostsData.push([
            item.name,
            `${currencySymbol}${item.monthly.toLocaleString()}`,
            `${currencySymbol}${item.annual.toLocaleString()}`,
            item.unit
          ]);
        });
        
        operatingCostsData.push(['']);
        operatingCostsData.push(['OPERATING COSTS SUMMARY']);
        operatingCostsData.push(['Total Monthly Operating Cost', `${currencySymbol}${totalMonthlyOperatingCost.toLocaleString()}`]);
        operatingCostsData.push(['Total Annual Operating Cost', `${currencySymbol}${totalAnnualOperatingCost.toLocaleString()}`]);
        
        const operatingCostsSheet = XLSX.utils.aoa_to_sheet(operatingCostsData);
        XLSX.utils.book_append_sheet(workbook, operatingCostsSheet, 'Operating Costs');
        
        // SHEET 5: Product Yield
        const productYieldData = [
          ['PRODUCT YIELD & PRICING'],
          [`Plant Capacity: ${reportData.projectInfo.capacity.toLocaleString()} LPH | Currency: ${reportData.projectInfo.currency}`],
          [''],
          ['PRODUCT YIELDS & PRICING'],
          ['Product Name', 'Yield %', 'Price per Ton', 'Density', 'Annual Tons', 'Annual Revenue']
        ];
        
        const annualLiters = reportData.projectInfo.capacity * 24 * 365;
        let totalYield = 0;
        let totalAnnualRevenue = 0;
        
        reportData.products.forEach(product => {
          totalYield += product.yield;
          totalAnnualRevenue += product.annualRevenue;
          productYieldData.push([
            product.name,
            `${product.yield.toFixed(1)}%`,
            `${currencySymbol}${product.price.toLocaleString()}`,
            product.density,
            product.annualTons.toFixed(1),
            `${currencySymbol}${product.annualRevenue.toLocaleString()}`
          ]);
        });
        
        productYieldData.push(['']);
        productYieldData.push(['PRODUCT SUMMARY']);
        productYieldData.push(['Total Product Yield', `${totalYield.toFixed(1)}%`]);
        productYieldData.push(['Total Annual Revenue', `${currencySymbol}${totalAnnualRevenue.toLocaleString()}`]);
        productYieldData.push(['Annual Processing', `${annualLiters.toLocaleString()} liters`]);
        
        const productYieldSheet = XLSX.utils.aoa_to_sheet(productYieldData);
        XLSX.utils.book_append_sheet(workbook, productYieldSheet, 'Product Yield');
        
        // SHEET 6: ROI Summary
        const roiSummaryData = [
          ['ROI ANALYSIS SUMMARY'],
          [`Project: ${reportData.projectInfo.projectName} | Customer: ${reportData.projectInfo.customerName}`],
          [''],
          ['INVESTMENT BREAKDOWN'],
          ['Investment Category', 'Amount'],
          ['Step 1: Plant Configuration', `${currencySymbol}${(parseFloat(roiData.projectCostLocal) + additionalCosts).toLocaleString()}`],
          ['Step 2: Tank Farm & Utilities', `${currencySymbol}${(totalTankCost + totalUtilityCost).toLocaleString()}`],
          ['Step 3: Additional Equipment', `${currencySymbol}${totalEquipmentCost.toLocaleString()}`],
          ['Working Capital', `${currencySymbol}${workingCapital.toLocaleString()}`],
          ['Total Investment', `${currencySymbol}${totalInvestment.toLocaleString()}`],
          [''],
          ['FINANCIAL RESULTS'],
          ['Metric', 'Value'],
          ['Annual Revenue', `${currencySymbol}${reportData.financials.totalRevenue.toLocaleString()}`],
          ['Annual Operating Costs', `${currencySymbol}${reportData.financials.operatingCostsAnnual.toLocaleString()}`],
          ['Gross Profit', `${currencySymbol}${reportData.financials.grossProfit.toLocaleString()}`],
          ['Annual ROI', `${reportData.financials.annualROI.toFixed(1)}%`],
          ['Payback Period', `${(reportData.financials.paybackPeriod * 12).toFixed(1)} months`],
          ['NPV (5 years)', `${currencySymbol}${reportData.financials.npv.toLocaleString()}`],
          ['IRR', `${reportData.financials.irr.toFixed(1)}%`],
          [''],
          ['KEY PERFORMANCE INDICATORS'],
          ['Plant Utilization', `${((reportData.projectInfo.operatingDays / 30) * 100).toFixed(1)}%`],
          ['Revenue per Liter', `${currencySymbol}${(reportData.financials.totalRevenue / annualLiters).toFixed(3)}`],
          ['Operating Cost per Liter', `${currencySymbol}${(reportData.financials.operatingCostsAnnual / annualLiters).toFixed(3)}`],
          ['Profit Margin', `${((reportData.financials.grossProfit / reportData.financials.totalRevenue) * 100).toFixed(1)}%`]
        ];
        
        const roiSummarySheet = XLSX.utils.aoa_to_sheet(roiSummaryData);
        XLSX.utils.book_append_sheet(workbook, roiSummarySheet, 'ROI Summary');
        
        // SHEET 7: Charts Data (for reference)
        const chartsData = [
          ['CHARTS & ANALYSIS DATA'],
          [`Generated: ${reportData.projectInfo.generatedDate}`],
          [''],
          ['REVENUE BREAKDOWN BY PRODUCT'],
          ['Product', 'Annual Revenue', 'Revenue %'],
          ...reportData.products.map(product => {
            const percentage = reportData.financials.totalRevenue > 0 ? (product.annualRevenue / reportData.financials.totalRevenue) * 100 : 0;
            return [
              product.name,
              `${currencySymbol}${product.annualRevenue.toLocaleString()}`,
              `${percentage.toFixed(1)}%`
            ];
          }),
          [''],
          ['OPERATING COST BREAKDOWN'],
          ['Cost Category', 'Annual Cost', 'Cost %'],
          ...operatingCostItems.map(cost => {
            const percentage = totalAnnualOperatingCost > 0 ? (cost.annual / totalAnnualOperatingCost) * 100 : 0;
            return [
              cost.name,
              `${currencySymbol}${cost.annual.toLocaleString()}`,
              `${percentage.toFixed(1)}%`
            ];
          }),
          [''],
          ['INVESTMENT ALLOCATION'],
          ['Category', 'Amount', 'Allocation %'],
          ['Plant Configuration', `${currencySymbol}${(parseFloat(roiData.projectCostLocal) + additionalCosts).toLocaleString()}`, `${(((parseFloat(roiData.projectCostLocal) + additionalCosts) / totalInvestment) * 100).toFixed(1)}%`],
          ['Tank Farm & Utilities', `${currencySymbol}${(totalTankCost + totalUtilityCost).toLocaleString()}`, `${(((totalTankCost + totalUtilityCost) / totalInvestment) * 100).toFixed(1)}%`],
          ['Additional Equipment', `${currencySymbol}${totalEquipmentCost.toLocaleString()}`, `${((totalEquipmentCost / totalInvestment) * 100).toFixed(1)}%`],
          ['Working Capital', `${currencySymbol}${workingCapital.toLocaleString()}`, `${((workingCapital / totalInvestment) * 100).toFixed(1)}%`]
        ];
        
        const chartsSheet = XLSX.utils.aoa_to_sheet(chartsData);
        XLSX.utils.book_append_sheet(workbook, chartsSheet, 'Charts');
        
        // Set column widths for better readability
        const sheetNames = ['Plant Configuration', 'Tank Farm & Utilities', 'Additional Equipment', 'Operating Costs', 'Product Yield', 'ROI Summary', 'Charts'];
        sheetNames.forEach(sheetName => {
          const ws = workbook.Sheets[sheetName];
          const colWidths = [
            { wch: 25 }, // Column A
            { wch: 15 }, // Column B
            { wch: 15 }, // Column C
            { wch: 15 }, // Column D
            { wch: 15 }, // Column E
            { wch: 15 }, // Column F
            { wch: 15 }, // Column G
            { wch: 15 }  // Column H
          ];
          ws['!cols'] = colWidths;
        });
        
        // Generate and download the Excel file
        console.log('Generating Excel file...');
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Comprehensive_ROI_Analysis_${roiData.customerName || 'Project'}_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
      
      toast({
        title: `${format.toUpperCase()} Report Downloaded`,
        description: `Professional ROI analysis report for ${roiData.customerName || 'Project'} has been downloaded successfully.`,
      });
    } catch (error) {
      console.error('Error generating report:', error);
      console.error('Error details:', error.message, error.stack);
      toast({
        title: 'Download Failed',
        description: `Failed to generate ${format.toUpperCase()} report. Error: ${error.message || 'Unknown error'}`,
        variant: 'destructive'
      });
    }
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
    { number: 3, title: "Additional Equipments", icon: Wrench },
    { number: 4, title: "Operating Costs", icon: DollarSign },
    { number: 5, title: "Product Yield", icon: Fuel },
    { number: 6, title: "Revenue & Investment", icon: TrendingUp },
    { number: 7, title: "ROI Results", icon: BarChart3 }
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
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-sm">
                  Step {currentStep} of 7
                </Badge>
                {projectId && (
                  <div className="text-xs text-muted-foreground">
                    Project ID: {projectId.slice(0, 8)}...
                  </div>
                )}
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowLoadDialog(true)}
                  className="text-xs flex items-center gap-1"
                >
                  <FolderOpen className="h-3 w-3" />
                  Load Saved Project
                </Button>
              </div>
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
                  <div className="space-y-4">
                    {/* First row: Customer and Project names */}
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
                    </div>
                    
                    {/* Second row: Plant Capacity, Currency, and Plant Costs in one line */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="capacity">Plant Capacity (Liters/Hour) *</Label>
                        <Select value={roiData.capacity} onValueChange={(value) => updateData('capacity', value)}>
                          <SelectTrigger>
                            <SelectValue placeholder={plantCostsLoading ? "Loading..." : plantCosts.length === 0 ? "No capacities available" : "Select capacity"} />
                          </SelectTrigger>
                          <SelectContent>
                            {plantCostsLoading ? (
                              <SelectItem value="loading" disabled>Loading capacities...</SelectItem>
                            ) : plantCosts.length > 0 ? (
                              plantCosts.map((plant) => (
                                <SelectItem key={plant.capacity} value={plant.capacity.toString()}>
                                  {plant.capacity.toLocaleString()} LPH
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="empty" disabled>No capacities available</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="currency">Currency *</Label>
                        <Select value={roiData.currency} onValueChange={(value) => updateData('currency', value)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(currencies).map(([code, currency]) => (
                              <SelectItem key={code} value={code}>
                                {currency.symbol} {code} - {currency.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Plant Costs</Label>
                        <div className="flex items-center space-x-2">
                          <div className="font-medium text-lg">
                            {getSelectedPlantCost()}
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => setShowPlantCostsDialog(true)}
                            className="h-8"
                          >
                            <Settings className="h-4 w-4 mr-1" />
                            Manage
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Plant Costs Display */}
                    {roiData.capacity && (
                      <div className="space-y-2">
                        <Label htmlFor="plantCosts">Plant Costs</Label>
                        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label className="text-sm text-green-700">Cost in {roiData.currency}</Label>
                              <div className="text-xl font-bold text-green-800">
                                {currencies[roiData.currency]?.symbol}{parseInt(roiData.projectCostLocal || '0').toLocaleString()}
                              </div>
                            </div>
                            <div>
                              <Label className="text-sm text-green-700">Cost in USD</Label>
                              <div className="text-xl font-bold text-green-600">
                                ${parseInt(roiData.projectCostUSD || '0').toLocaleString()}
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 text-xs text-green-600">
                            Rate: 1 USD = {currencies[roiData.currency]?.rate} {roiData.currency} | Capacity: {parseInt(roiData.capacity).toLocaleString()} LPH
                          </div>
                          <div className="mt-2 flex justify-between items-center">
                            <div className="text-xs text-gray-600">
                              Plant costs are managed in database
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowPlantCostsDialog(true)}
                              className="h-8"
                            >
                              <Edit3 className="w-3 h-3 mr-1" />
                              Edit Costs
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Always Show Edit Costs Button */}
                    <div className="mt-4 flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPlantCostsDialog(true)}
                        className="h-8"
                      >
                        <Edit3 className="w-3 h-3 mr-1" />
                        Manage Plant Costs
                      </Button>
                    </div>
                    
                    {/* Cost Breakdown Section */}
                    <div className="space-y-4">
                      <div className="border-t pt-4">
                        <div className="flex items-center justify-between mb-4">
                          <Label className="text-lg font-semibold">Project Cost Breakdown</Label>
                          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">Auto-calculated from Base Plant Cost</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="freightInsurance">Freight & Insurance (1.0%)</Label>
                            <Input
                              id="freightInsurance"
                              type="number"
                              value={roiData.freightInsurance}
                              onChange={(e) => updateData('freightInsurance', e.target.value)}
                              placeholder="0"
                              className="bg-blue-50"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="importDutyVAT">Import Duty & VAT (5.0%)</Label>
                            <Input
                              id="importDutyVAT"
                              type="number"
                              value={roiData.importDutyVAT}
                              onChange={(e) => updateData('importDutyVAT', e.target.value)}
                              placeholder="0"
                              className="bg-blue-50"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="plotCost">Plot (Land) Cost (10%)</Label>
                            <Input
                              id="plotCost"
                              type="number"
                              value={roiData.plotCost}
                              onChange={(e) => updateData('plotCost', e.target.value)}
                              placeholder="0"
                              className="bg-blue-50"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="civilCost">Civil Cost</Label>
                            <Input
                              id="civilCost"
                              type="number"
                              value={roiData.civilCost}
                              onChange={(e) => updateData('civilCost', e.target.value)}
                              placeholder="0"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="refineryShed">Refinery Shed</Label>
                            <Input
                              id="refineryShed"
                              type="number"
                              value={roiData.refineryShed}
                              onChange={(e) => updateData('refineryShed', e.target.value)}
                              placeholder="0"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="utilityShed">Utility Shed</Label>
                            <Input
                              id="utilityShed"
                              type="number"
                              value={roiData.utilityShed}
                              onChange={(e) => updateData('utilityShed', e.target.value)}
                              placeholder="0"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="officeBuilding">Office Building</Label>
                            <Input
                              id="officeBuilding"
                              type="number"
                              value={roiData.officeBuilding}
                              onChange={(e) => updateData('officeBuilding', e.target.value)}
                              placeholder="0"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="fireSuppressionSystem">Fire Suppression System</Label>
                            <Input
                              id="fireSuppressionSystem"
                              type="number"
                              value={roiData.fireSuppressionSystem}
                              onChange={(e) => updateData('fireSuppressionSystem', e.target.value)}
                              placeholder="0"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="insulationCost">Insulation Cost</Label>
                            <Input
                              id="insulationCost"
                              type="number"
                              value={roiData.insulationCost}
                              onChange={(e) => updateData('insulationCost', e.target.value)}
                              placeholder="0"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="legalFees">Legal Fees</Label>
                            <Input
                              id="legalFees"
                              type="number"
                              value={roiData.legalFees}
                              onChange={(e) => updateData('legalFees', e.target.value)}
                              placeholder="0"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="preFormationExpenses">Pre Formation Expenses</Label>
                            <Input
                              id="preFormationExpenses"
                              type="number"
                              value={roiData.preFormationExpenses}
                              onChange={(e) => updateData('preFormationExpenses', e.target.value)}
                              placeholder="0"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="commissioningTravel">Commissioning & Travel</Label>
                            <Input
                              id="commissioningTravel"
                              type="number"
                              value={roiData.commissioningTravel}
                              onChange={(e) => updateData('commissioningTravel', e.target.value)}
                              placeholder="0"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="contingency">Contingency</Label>
                            <Input
                              id="contingency"
                              type="number"
                              value={roiData.contingency}
                              onChange={(e) => updateData('contingency', e.target.value)}
                              placeholder="0"
                            />
                          </div>
                        </div>
                        
                        {/* Total Project Cost Summary */}
                        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                          <Label className="text-lg font-semibold block mb-2">Total Project Cost Summary</Label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label className="text-sm text-blue-700">Base Plant Cost</Label>
                              <div className="text-xl font-bold text-blue-800">
                                {getSelectedPlantCost()}
                              </div>
                            </div>
                            <div>
                              <Label className="text-sm text-blue-700">Additional Costs</Label>
                              <div className="text-xl font-bold text-blue-800">
                                {getTotalAdditionalCosts()}
                              </div>
                            </div>
                            <div className="md:col-span-2 border-t border-blue-300 pt-2">
                              <Label className="text-sm text-blue-700">Total Project Investment</Label>
                              <div className="text-2xl font-bold text-blue-900">
                                {getTotalProjectCost()}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3: Additional Equipments */}
                {currentStep === 3 && (
                  <div className="space-y-6">
                    <div className="text-center mb-6">
                      <h2 className="text-2xl font-bold mb-2">Additional Equipments</h2>
                      <p className="text-muted-foreground">Enter costs for additional equipment and infrastructure in {roiData.currency}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="additionalPumpsFilters">Additional Pumps And Filters</Label>
                        <Input
                          id="additionalPumpsFilters"
                          type="number"
                          value={roiData.additionalPumpsFilters}
                          onChange={(e) => updateData('additionalPumpsFilters', e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tankLevelTransmitters">Tank Level Transmitters</Label>
                        <Input
                          id="tankLevelTransmitters"
                          type="number"
                          value={roiData.tankLevelTransmitters}
                          onChange={(e) => updateData('tankLevelTransmitters', e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pipesValvesFlanges">Pipes, Valves, Flanges & Pipe Bridge</Label>
                        <Input
                          id="pipesValvesFlanges"
                          type="number"
                          value={roiData.pipesValvesFlanges}
                          onChange={(e) => updateData('pipesValvesFlanges', e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="electricalCablesAccessories">Electrical Cables And Accessories</Label>
                        <Input
                          id="electricalCablesAccessories"
                          type="number"
                          value={roiData.electricalCablesAccessories}
                          onChange={(e) => updateData('electricalCablesAccessories', e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pccMccPanels">PCC, MCC Electrical Panels</Label>
                        <Input
                          id="pccMccPanels"
                          type="number"
                          value={roiData.pccMccPanels}
                          onChange={(e) => updateData('pccMccPanels', e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="chimneyDucting">Chimney & Ducting</Label>
                        <Input
                          id="chimneyDucting"
                          type="number"
                          value={roiData.chimneyDucting}
                          onChange={(e) => updateData('chimneyDucting', e.target.value)}
                          placeholder="0"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="coolingTower">Cooling Tower</Label>
                        <Input
                          id="coolingTower"
                          type="number"
                          value={roiData.coolingTower}
                          onChange={(e) => updateData('coolingTower', e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="dieselGenerator">Diesel Generator</Label>
                        <Input
                          id="dieselGenerator"
                          type="number"
                          value={roiData.dieselGenerator}
                          onChange={(e) => updateData('dieselGenerator', e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="qualityControlEquipment">Quality Control Equipment</Label>
                        <Input
                          id="qualityControlEquipment"
                          type="number"
                          value={roiData.qualityControlEquipment}
                          onChange={(e) => updateData('qualityControlEquipment', e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="thermicFluid">Thermic Fluid (Therminol 66 / VP1)</Label>
                        <Input
                          id="thermicFluid"
                          type="number"
                          value={roiData.thermicFluid}
                          onChange={(e) => updateData('thermicFluid', e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="expansionStructure">Expansion Structure</Label>
                        <Input
                          id="expansionStructure"
                          type="number"
                          value={roiData.expansionStructure}
                          onChange={(e) => updateData('expansionStructure', e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="craneHireCharges">Crane Hire Charges</Label>
                        <Input
                          id="craneHireCharges"
                          type="number"
                          value={roiData.craneHireCharges}
                          onChange={(e) => updateData('craneHireCharges', e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="laborErectionCommissioning">Labor for Erection & Commissioning</Label>
                        <Input
                          id="laborErectionCommissioning"
                          type="number"
                          value={roiData.laborErectionCommissioning}
                          onChange={(e) => updateData('laborErectionCommissioning', e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    </div>

                    {/* Equipment Cost Summary */}
                    <div className="mt-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                      <Label className="text-lg font-semibold block mb-2">Equipment Cost Summary</Label>
                      <div className="text-xl font-bold text-orange-800">
                        {getTotalEquipmentCosts()}
                      </div>
                      <p className="text-sm text-orange-600 mt-1">
                        Total additional equipment costs in {roiData.currency}
                      </p>
                    </div>
                  </div>
                )}

                {/* Step 2: Tank Farm & Utilities - Auto-calculated */}
                {currentStep === 2 && (
                  <div className="space-y-6">
                    {!roiData.capacity && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <p className="text-yellow-800 text-sm">
                          Please go back to Step 1 and select a plant capacity to auto-calculate tank requirements.
                        </p>
                      </div>
                    )}
                    
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-gray-300 text-sm">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="border border-gray-300 px-3 py-2 text-left font-medium">Tank Description</th>
                            <th className="border border-gray-300 px-2 py-2 text-center font-medium">% of Plant Capacity</th>
                            <th className="border border-gray-300 px-2 py-2 text-center font-medium">Days of Storage</th>
                            <th className="border border-gray-300 px-2 py-2 text-center font-medium">Required Capacity (KL)</th>
                            <th className="border border-gray-300 px-2 py-2 text-center font-medium">Suggested Tank Size (KL)</th>
                            <th className="border border-gray-300 px-2 py-2 text-center font-medium">Suggested Quantity</th>
                            <th className="border border-gray-300 px-2 py-2 text-center font-medium">Cost per Tank ({roiData.currency})</th>
                            <th className="border border-gray-300 px-2 py-2 text-center font-medium">Total Cost ({roiData.currency})</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(roiData.tanks || calculatedTanks).map((tank, index) => (
                            <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="border border-gray-300 px-3 py-2 font-medium">{tank.description}</td>
                              <td className="border border-gray-300 px-1 py-1">
                                <Input
                                  type="number"
                                  value={tank.percentCapacity}
                                  onChange={(e) => updateTankData(index, 'percentCapacity', parseFloat(e.target.value) || 0)}
                                  className="w-16 text-center text-xs"
                                  step="0.1"
                                />
                              </td>
                              <td className="border border-gray-300 px-1 py-1">
                                <Input
                                  type="number"
                                  value={tank.storageDays}
                                  onChange={(e) => updateTankData(index, 'storageDays', parseFloat(e.target.value) || 0)}
                                  className="w-16 text-center text-xs"
                                  step="0.1"
                                />
                              </td>
                              <td className="border border-gray-300 px-2 py-2 text-center font-semibold text-blue-600">
                                {tank.requiredKL}
                              </td>
                              <td className="border border-gray-300 px-2 py-2 text-center">
                                <Select 
                                  value={tank.suggestedTankSize.toString()} 
                                  onValueChange={(value) => updateTankData(index, 'suggestedTankSize', parseInt(value))}
                                >
                                  <SelectTrigger className="w-20 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {standardTankSizes.map(size => (
                                      <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="border border-gray-300 px-1 py-1">
                                <Input
                                  type="number"
                                  value={tank.suggestedQuantity}
                                  onChange={(e) => updateTankData(index, 'suggestedQuantity', parseInt(e.target.value) || 0)}
                                  className="w-16 text-center text-xs"
                                />
                              </td>
                              <td className="border border-gray-300 px-2 py-2 text-center text-sm font-medium text-green-600">
                                {getCurrencySymbol(roiData.currency)}{(getTankPrice(tank.suggestedTankSize) * (currencies[roiData.currency]?.rate || 1)).toLocaleString()}
                              </td>
                              <td className="border border-gray-300 px-2 py-2 text-center text-sm font-bold text-blue-600">
                                {getCurrencySymbol(roiData.currency)}{(getTankPrice(tank.suggestedTankSize) * tank.suggestedQuantity * (currencies[roiData.currency]?.rate || 1)).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      
                      {/* Total Tank Cost Summary */}
                      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-blue-900">Total Tank Cost:</span>
                          <span className="text-lg font-bold text-blue-900">
                            {getCurrencySymbol(roiData.currency)}{(roiData.tanks.reduce((total, tank) => total + (getTankPrice(tank.suggestedTankSize) * tank.suggestedQuantity), 0) * (currencies[roiData.currency]?.rate || 1)).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-xs text-blue-700 mt-1">
                          Sum of {roiData.tanks.filter(tank => tank.suggestedQuantity > 0).length} tank configurations
                        </div>
                      </div>
                    </div>
                    
                    {/* Utilities Cost Table */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-blue-900">Utilities</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-gray-300 text-sm">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="border border-gray-300 px-3 py-2 text-left font-medium">Description</th>
                              <th className="border border-gray-300 px-2 py-2 text-center font-medium">Specification</th>
                              <th className="border border-gray-300 px-2 py-2 text-center font-medium">Quantity</th>
                              <th className="border border-gray-300 px-2 py-2 text-center font-medium">Cost per Unit ({roiData.currency})</th>
                              <th className="border border-gray-300 px-2 py-2 text-center font-medium">Total Cost ({roiData.currency})</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(roiData.utilities || calculatedUtilities).map((utility, index) => (
                              <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="border border-gray-300 px-3 py-2 font-medium">
                                  {utility.description}
                                  {utility.note && (
                                    <div className="text-xs text-gray-500 mt-1 italic">
                                      {utility.note}
                                    </div>
                                  )}
                                </td>
                                <td className="border border-gray-300 px-2 py-2 text-center">{utility.specification}</td>
                                <td className="border border-gray-300 px-2 py-2 text-center">{utility.quantity}</td>
                                <td className="border border-gray-300 px-2 py-2 text-center text-sm font-medium text-green-600">
                                  {utility.unitCostUSD === 0 ? (
                                    <span className="text-gray-400">N/A</span>
                                  ) : (
                                    `${getCurrencySymbol(roiData.currency)}${(utility.unitCostUSD * (currencies[roiData.currency]?.rate || 1)).toLocaleString()}`
                                  )}
                                </td>
                                <td className="border border-gray-300 px-2 py-2 text-center text-sm font-bold text-blue-600">
                                  {utility.totalCost === 0 ? (
                                    <span className="text-gray-400">N/A</span>
                                  ) : (
                                    `${getCurrencySymbol(roiData.currency)}${(utility.totalCost * (currencies[roiData.currency]?.rate || 1)).toLocaleString()}`
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        
                        {/* Total Utilities Cost Summary */}
                        <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-orange-900">Total Utilities Cost:</span>
                            <span className="text-lg font-bold text-orange-900">
                              {getCurrencySymbol(roiData.currency)}{((roiData.utilities || calculatedUtilities).filter(utility => utility.description !== "Total Connected Load").reduce((total, utility) => total + utility.totalCost, 0) * (currencies[roiData.currency]?.rate || 1)).toLocaleString()}
                            </span>
                          </div>
                          <div className="text-xs text-orange-700 mt-1">
                            Sum of {(roiData.utilities || calculatedUtilities).filter(utility => utility.description !== "Total Connected Load").length} utility configurations (excluding Total Connected Load)
                          </div>
                        </div>
                      </div>
                      
                      {/* Combined Tank Farm & Utilities Total */}
                      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-base font-semibold text-green-900">Tank Farm + Utilities Total:</span>
                          <span className="text-xl font-bold text-green-900">
                            {getCurrencySymbol(roiData.currency)}{(
                              (roiData.tanks.reduce((total, tank) => total + (getTankPrice(tank.suggestedTankSize) * tank.suggestedQuantity), 0) * (currencies[roiData.currency]?.rate || 1)) +
                              ((roiData.utilities || calculatedUtilities).filter(utility => utility.description !== "Total Connected Load").reduce((total, utility) => total + utility.totalCost, 0) * (currencies[roiData.currency]?.rate || 1))
                            ).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-xs text-green-700 mt-1">
                          Complete Step 2 investment breakdown in {roiData.currency} (Total Connected Load excluded - used for power calculations only)
                        </div>
                      </div>
                    </div>
                    
                    {roiData.capacity && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-start gap-2">
                          <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                          <div className="text-sm text-blue-800">
                            <p className="font-medium mb-1">Enhanced Auto-calculation Logic:</p>
                            <p>Required Capacity (KL) = (Plant LPH × % × Days × 24) / 1000</p>
                            <p className="mt-2">Smart Rounding: Capacities &lt;300 KL round UP to nearest 50 KL, larger capacities round UP to nearest 100 KL</p>
                            <p className="mt-1">Optimization: Minimizes tank quantity while meeting capacity requirements using standard sizes: 50, 100, 200, 300, 400, 500, 600 KL</p>
                            <p className="mt-1">Safety: Ensures minimum 1 tank and 50 KL capacity when required capacity &gt; 0</p>
                            <p className="mt-2 font-medium text-blue-700">Utility Auto-calculations:</p>
                            <p className="text-xs">• Compressor: 20 × (LPH/1000) m³/hr</p>
                            <p className="text-xs">• Heater: Smart sizing with optimal quantity selection</p>
                            <p className="text-xs">• Connected Load: 350 × (LPH/1000) kW</p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <Separator />
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Compressor Capacity (m³/hr)</Label>
                          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">Auto-calculated</span>
                        </div>
                        <Input
                          type="number"
                          value={roiData.boilerCapacity}
                          onChange={(e) => updateData('boilerCapacity', e.target.value)}
                          placeholder="Auto-calculated based on plant capacity"
                          className="bg-blue-50"
                        />
                        <p className="text-xs text-gray-500">Formula: 20 × (Plant LPH / 1000)</p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Heater Size (kcal/hr)</Label>
                          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">Auto-calculated</span>
                        </div>
                        <Select value={roiData.heaterCapacity} onValueChange={(value) => updateData('heaterCapacity', value)}>
                          <SelectTrigger className="bg-blue-50">
                            <SelectValue placeholder="Select heater size" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="600000">600,000 kcal/hr</SelectItem>
                            <SelectItem value="10000000">10,000,000 kcal/hr</SelectItem>
                            <SelectItem value="15000000">15,000,000 kcal/hr</SelectItem>
                            <SelectItem value="20000000">20,000,000 kcal/hr</SelectItem>
                            <SelectItem value="25000000">25,000,000 kcal/hr</SelectItem>
                            <SelectItem value="30000000">30,000,000 kcal/hr</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-gray-600">Quantity</Label>
                            <Input
                              type="number"
                              value={roiData.heaterQuantity}
                              readOnly
                              className="bg-gray-50 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-gray-600">Total Load (kcal/hr)</Label>
                            <Input
                              type="number"
                              value={roiData.heaterTotalLoad}
                              readOnly
                              className="bg-gray-50 text-sm"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">Smart sizing: ≤3000 LPH = single optimal heater, &gt;3000 LPH = minimum 2 heaters with optimal quantity</p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Total Connected Load (kW)</Label>
                          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">Auto-calculated</span>
                        </div>
                        <Input
                          type="number"
                          value={roiData.powerRequirement}
                          onChange={(e) => updateData('powerRequirement', e.target.value)}
                          placeholder="Auto-calculated based on plant capacity"
                          className="bg-blue-50"
                        />
                        <p className="text-xs text-gray-500">Formula: 350 × (Plant LPH / 1000)</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 4: Operating Costs */}
                {currentStep === 4 && (
                  <div className="space-y-6">
                    <div className="text-center mb-6">
                      <h2 className="text-2xl font-bold mb-2">Operating Costs & Financing</h2>
                      <p className="text-muted-foreground">Enter all monthly operating costs, financing parameters, and depreciation method in {roiData.currency}</p>
                    </div>

                    {/* Plant Operation Time Unit Field */}
                    <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                      <div className="space-y-2">
                        <Label className="font-semibold text-blue-800">Plant Operation per (Month)</Label>
                        <Input
                          type="number"
                          value={roiData.plantOperationDays || ''}
                          onChange={(e) => updateData('plantOperationDays', e.target.value)}
                          placeholder="e.g., 25 (days per month)"
                          className="bg-white"
                        />
                        <p className="text-xs text-blue-600">Define operating days per month for accurate cost calculations</p>
                      </div>
                    </div>

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
                        <p className="text-xs text-gray-500">
                          Monthly Cost = {roiData.feedstockCost || '0'} × {roiData.capacity || '0'} LPH × 24 hours × {roiData.plantOperationDays || '30'} days = {getCurrencySymbol(roiData.currency)}{(() => {
                            const cost = parseFloat(roiData.feedstockCost) || 0;
                            const capacity = parseFloat(roiData.capacity) || 0;
                            const days = parseFloat(roiData.plantOperationDays) || 30;
                            return (cost * capacity * 24 * days).toLocaleString();
                          })()}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>Labor Cost (Monthly) ({getCurrencySymbol(roiData.currency)})</Label>
                        <Input
                          type="number"
                          value={roiData.laborCost}
                          onChange={(e) => updateData('laborCost', e.target.value)}
                          placeholder="e.g., 15000"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Power Cost (Monthly) ({getCurrencySymbol(roiData.currency)})</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={roiData.powerCost}
                          onChange={(e) => updateData('powerCost', e.target.value)}
                          placeholder="e.g., 0.12"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Fuel Cost (Monthly) ({getCurrencySymbol(roiData.currency)})</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={roiData.fuelCost}
                          onChange={(e) => updateData('fuelCost', e.target.value)}
                          placeholder="e.g., 0.85"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Consumables Cost (Monthly) ({getCurrencySymbol(roiData.currency)})</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={roiData.chemicalCost}
                          onChange={(e) => updateData('chemicalCost', e.target.value)}
                          placeholder="e.g., 0.05"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Maintenance Cost (Monthly) ({getCurrencySymbol(roiData.currency)})</Label>
                        <Input
                          type="number"
                          value={roiData.maintenanceCost}
                          onChange={(e) => updateData('maintenanceCost', e.target.value)}
                          placeholder="e.g., 25000"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Media Cost (Monthly) ({getCurrencySymbol(roiData.currency)})</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={roiData.mediaCost || ''}
                          onChange={(e) => updateData('mediaCost', e.target.value)}
                          placeholder="e.g., 5000"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Rate of Interest (Monthly) %</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={roiData.rateOfInterest || ''}
                          onChange={(e) => updateData('rateOfInterest', e.target.value)}
                          placeholder="e.g., 1.5"
                        />
                        <p className="text-xs text-gray-500">Applied to total investment and working capital financing</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Debt Financing Ratio (%)</Label>
                        <Input
                          type="number"
                          step="1"
                          value={roiData.debtFinancingRatio || '70'}
                          onChange={(e) => updateData('debtFinancingRatio', e.target.value)}
                          placeholder="e.g., 70"
                        />
                        <p className="text-xs text-gray-500">Percentage of investment financed through debt (rest is equity)</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Depreciation Method</Label>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                          value={roiData.depreciationMethod || 'straight-line'}
                          onChange={(e) => updateData('depreciationMethod', e.target.value)}
                        >
                          <option value="straight-line">Straight Line (10 years)</option>
                          <option value="declining-balance">Declining Balance (20%)</option>
                          <option value="none">No Depreciation</option>
                        </select>
                        <p className="text-xs text-gray-500">Method for calculating annual depreciation expense</p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Working Capital (Monthly) ({getCurrencySymbol(roiData.currency)})</Label>
                          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">Auto-calculated</span>
                        </div>
                        <Input
                          type="text"
                          value={workingCapital > 0 ? workingCapital.toLocaleString() : '0'}
                          readOnly
                          className="bg-blue-50 text-center font-semibold"
                        />
                        <p className="text-xs text-gray-500">Formula: Feedstock Cost × Plant Capacity × 24 hours × 15 days (working capital inventory)</p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Financing Costs (Monthly) ({getCurrencySymbol(roiData.currency)})</Label>
                          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">Auto-calculated</span>
                        </div>
                        <Input
                          type="text"
                          value={financingCosts.totalMonthlyFinancingCost > 0 ? financingCosts.totalMonthlyFinancingCost.toLocaleString() : '0'}
                          readOnly
                          className="bg-red-50 text-center font-semibold"
                        />
                        <p className="text-xs text-gray-500">Interest on debt ({roiData.debtFinancingRatio || 70}% of investment) + working capital interest</p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Include Depreciation in Cost Analysis</Label>
                          <div className="flex items-center space-x-2">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={roiData.includeDepreciation || false}
                                onChange={(e) => updateData('includeDepreciation', e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                              <span className="ml-3 text-sm font-medium text-gray-900">{roiData.includeDepreciation ? 'ON' : 'OFF'}</span>
                            </label>
                          </div>
                        </div>
                        <div className={`space-y-2 ${!roiData.includeDepreciation ? 'opacity-50' : ''}`}>
                          <div className="flex items-center justify-between">
                            <Label className={!roiData.includeDepreciation ? 'text-gray-400' : ''}>Depreciation (Monthly) ({getCurrencySymbol(roiData.currency)})</Label>
                            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">Auto-calculated</span>
                          </div>
                          <Input
                            type="text"
                            value={roiData.includeDepreciation && annualDepreciation > 0 ? Math.round(annualDepreciation / 12).toLocaleString() : '0'}
                            readOnly
                            className={`text-center font-semibold ${!roiData.includeDepreciation ? 'bg-gray-100 text-gray-400' : 'bg-red-50'}`}
                          />
                          <p className={`text-xs ${!roiData.includeDepreciation ? 'text-gray-400' : 'text-gray-500'}`}>
                            {roiData.includeDepreciation ? `${roiData.depreciationMethod || 'straight-line'} depreciation method (excludes land cost)` : 'Depreciation excluded from calculations'}
                          </p>
                        </div>
                      </div>
                      
                      {/* Financing Costs Toggle */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Include Financing Costs in Analysis</Label>
                          <div className="flex items-center space-x-2">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={roiData.includeFinancingCosts !== false}
                                onChange={(e) => updateData('includeFinancingCosts', e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                              <span className="ml-3 text-sm font-medium text-gray-900">{roiData.includeFinancingCosts !== false ? 'ON' : 'OFF'}</span>
                            </label>
                          </div>
                        </div>
                        <div className={`space-y-2 ${roiData.includeFinancingCosts === false ? 'opacity-50' : ''}`}>
                          <div className="flex items-center justify-between">
                            <Label className={roiData.includeFinancingCosts === false ? 'text-gray-400' : ''}>Interest Rate (Monthly) %</Label>
                            <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded">6% annual default</span>
                          </div>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="25"
                            value={roiData.rateOfInterest || ''}
                            onChange={(e) => updateData('rateOfInterest', e.target.value)}
                            placeholder="0.5"
                            className={`text-center ${roiData.includeFinancingCosts === false ? 'bg-gray-100 text-gray-400' : 'bg-yellow-50'}`}
                            disabled={roiData.includeFinancingCosts === false}
                          />
                          <p className={`text-xs ${roiData.includeFinancingCosts === false ? 'text-gray-400' : 'text-gray-500'}`}>
                            {roiData.includeFinancingCosts === false ? 'Financing costs excluded from calculations' : 'Annual interest rate for debt and working capital financing'}
                          </p>
                          
                          <div className="flex items-center justify-between">
                            <Label className={roiData.includeFinancingCosts === false ? 'text-gray-400' : ''}>Monthly Interest Cost ({getCurrencySymbol(roiData.currency)})</Label>
                            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">Auto-calculated</span>
                          </div>
                          <Input
                            type="text"
                            value={roiData.includeFinancingCosts !== false && financingCosts.totalMonthlyFinancingCost > 0 ? financingCosts.totalMonthlyFinancingCost.toLocaleString() : '0'}
                            readOnly
                            className={`text-center font-semibold ${roiData.includeFinancingCosts === false ? 'bg-gray-100 text-gray-400' : 'bg-red-50'}`}
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Transportation Cost (Monthly) ({getCurrencySymbol(roiData.currency)})</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={roiData.transportationCost || ''}
                          onChange={(e) => updateData('transportationCost', e.target.value)}
                          placeholder="e.g., 12000"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Vehicle Maintenance (Monthly) ({getCurrencySymbol(roiData.currency)})</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={roiData.vehicleMaintenanceCost || ''}
                          onChange={(e) => updateData('vehicleMaintenanceCost', e.target.value)}
                          placeholder="e.g., 3000"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Miscellaneous (Monthly) ({getCurrencySymbol(roiData.currency)})</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={roiData.miscellaneousCost || ''}
                          onChange={(e) => updateData('miscellaneousCost', e.target.value)}
                          placeholder="e.g., 2000"
                        />
                      </div>
                    </div>

                    {/* Working Capital & Interest Analysis */}
                    <div className="mt-6 space-y-4">
                      {/* Working Capital Breakdown */}
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <h3 className="font-semibold text-blue-800 mb-3">Working Capital Analysis</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div className="flex justify-between">
                            <span className="text-blue-700">Working Capital (Monthly):</span>
                            <span className="font-semibold">
                              {getCurrencySymbol(roiData.currency)}{workingCapital.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-blue-700">Interest Cost (Monthly):</span>
                            <span className="font-semibold">
                              {getCurrencySymbol(roiData.currency)}{(financingCosts.workingCapitalInterest || 0).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Total Operating Cost Summary */}
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <div className="text-center">
                          <Label className="font-semibold text-gray-700">Total Monthly Operating Cost</Label>
                          <div className="text-2xl font-bold text-blue-600 mt-2">
                            {getCurrencySymbol(roiData.currency)}{(() => {
                              const costs = [
                                parseFloat(roiData.laborCost) || 0,
                                parseFloat(roiData.powerCost) || 0,
                                parseFloat(roiData.fuelCost) || 0,
                                parseFloat(roiData.chemicalCost) || 0,
                                parseFloat(roiData.maintenanceCost) || 0,
                                parseFloat(roiData.mediaCost) || 0,
                                parseFloat(roiData.transportationCost) || 0,
                                parseFloat(roiData.vehicleMaintenanceCost) || 0,
                                parseFloat(roiData.miscellaneousCost) || 0
                              ];
                              // Add financing costs only if toggle is ON
                              if (roiData.includeFinancingCosts !== false) {
                                costs.push(financingCosts.workingCapitalInterest || 0);
                              }
                              // Add depreciation only if toggle is ON
                              if (roiData.includeDepreciation && annualDepreciation > 0) {
                                costs.push(annualDepreciation / 12);
                              }
                              const total = costs.reduce((sum, cost) => sum + cost, 0);
                              return total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                            })()}
                          </div>
                          <p className="text-xs text-gray-600 mt-1">
                            Includes Working Capital Interest Cost (excludes per-liter feedstock cost)
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 5: Product Yield */}
                {currentStep === 5 && (
                  <div className="space-y-6">
                    <div className="text-center mb-6">
                      <h2 className="text-2xl font-bold mb-2">Product Yield</h2>
                      <p className="text-muted-foreground">Configure product yields and selling prices</p>
                    </div>

                    {/* Product Yield Table */}
                    <div className="bg-white border rounded-lg overflow-hidden">
                      <div className="bg-gray-50 p-4 border-b">
                        <h3 className="font-semibold text-gray-800">Product Yield Distribution</h3>
                        <p className="text-sm text-gray-600">Edit yield percentages (total must equal 100%)</p>
                      </div>
                      
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-4 py-3 text-left font-medium text-gray-700">Product</th>
                              <th className="px-4 py-3 text-center font-medium text-gray-700">Yield (%)</th>
                              <th className="px-4 py-3 text-center font-medium text-gray-700">Price per Ton ({getCurrencySymbol(roiData.currency)})</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            <tr className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium text-gray-900">Naphtha & Gas Oil</td>
                              <td className="px-4 py-3">
                                <Input
                                  type="number"
                                  step="0.1"
                                  value={roiData.naphthaGasOilYield}
                                  onChange={(e) => updateData('naphthaGasOilYield', e.target.value)}
                                  className="w-20 text-center"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={roiData.naphthaGasOilPrice}
                                  onChange={(e) => updateData('naphthaGasOilPrice', e.target.value)}
                                  placeholder="e.g., 600"
                                  className="w-24"
                                />
                              </td>
                            </tr>
                            <tr className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium text-gray-900">Light Base Oil</td>
                              <td className="px-4 py-3">
                                <Input
                                  type="number"
                                  step="0.1"
                                  value={roiData.lightBaseOilYield}
                                  onChange={(e) => updateData('lightBaseOilYield', e.target.value)}
                                  className="w-20 text-center"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={roiData.lightBaseOilPrice}
                                  onChange={(e) => updateData('lightBaseOilPrice', e.target.value)}
                                  placeholder="e.g., 680"
                                  className="w-24"
                                />
                              </td>
                            </tr>
                            <tr className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium text-gray-900">Heavy Base Oil</td>
                              <td className="px-4 py-3">
                                <Input
                                  type="number"
                                  step="0.1"
                                  value={roiData.heavyBaseOilYield}
                                  onChange={(e) => updateData('heavyBaseOilYield', e.target.value)}
                                  className="w-20 text-center"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={roiData.heavyBaseOilPrice}
                                  onChange={(e) => updateData('heavyBaseOilPrice', e.target.value)}
                                  placeholder="e.g., 650"
                                  className="w-24"
                                />
                              </td>
                            </tr>
                            <tr className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium text-gray-900">Residue</td>
                              <td className="px-4 py-3">
                                <Input
                                  type="number"
                                  step="0.1"
                                  value={roiData.residueYield}
                                  onChange={(e) => updateData('residueYield', e.target.value)}
                                  className="w-20 text-center"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={roiData.residuePrice}
                                  onChange={(e) => updateData('residuePrice', e.target.value)}
                                  placeholder="e.g., 400"
                                  className="w-24"
                                />
                              </td>
                            </tr>
                            <tr className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium text-gray-900">Waste Water</td>
                              <td className="px-4 py-3">
                                <Input
                                  type="number"
                                  step="0.1"
                                  value={roiData.wasteWaterYield}
                                  onChange={(e) => updateData('wasteWaterYield', e.target.value)}
                                  className="w-20 text-center"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={roiData.wasteWaterPrice}
                                  onChange={(e) => updateData('wasteWaterPrice', e.target.value)}
                                  placeholder="e.g., -100 (disposal cost per ton)"
                                  className="w-32"
                                />
                              </td>
                            </tr>
                            <tr className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium text-gray-900">Process Loss</td>
                              <td className="px-4 py-3">
                                <Input
                                  type="number"
                                  step="0.1"
                                  value={roiData.processLossYield}
                                  onChange={(e) => updateData('processLossYield', e.target.value)}
                                  className="w-20 text-center"
                                />
                              </td>
                              <td className="px-4 py-3 text-center text-gray-500">
                                <span className="text-sm italic">No selling price (Process Loss)</span>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        
                        {/* Default Values Info */}
                        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                            <div className="text-sm text-blue-800">
                              <p className="font-medium mb-1">Default Pricing (USD Base):</p>
                              <p className="text-xs">• Naphtha & Gas Oil: $600/ton • Light Base Oil: $750/ton • Heavy Base Oil: $780/ton</p>
                              <p className="text-xs">• Residue: $400/ton • Waste Water: -$50/ton (disposal cost)</p>
                              <p className="text-xs mt-2 font-medium">Prices automatically convert based on selected currency from Step 1</p>
                            </div>
                          </div>
                        </div>
                        
                        {/* Total Revenue */}
                        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-green-900">Total Revenue (Monthly):</span>
                            <span className="text-lg font-bold text-green-900">
                              {getCurrencySymbol(roiData.currency)}{(() => {
                                // Use default values if Step 1 data is missing
                                const plantCapacity = parseFloat(roiData.capacity) || 1000; // Default to 1000 LPH if not set
                                const operatingDays = parseFloat(roiData.plantOperationDays) || 30; // Default to 30 days if not set
                                const monthlyLiters = plantCapacity * operatingDays * 24;
                                
                                const products = [
                                  { 
                                    yield: parseFloat(roiData.naphthaGasOilYield) || 7, 
                                    price: parseFloat(roiData.naphthaGasOilPrice) || (600 * (currencies[roiData.currency]?.rate || 1)), 
                                    density: 0.80 
                                  },
                                  { 
                                    yield: parseFloat(roiData.lightBaseOilYield) || 50, 
                                    price: parseFloat(roiData.lightBaseOilPrice) || (750 * (currencies[roiData.currency]?.rate || 1)), 
                                    density: 0.85 
                                  },
                                  { 
                                    yield: parseFloat(roiData.heavyBaseOilYield) || 22, 
                                    price: parseFloat(roiData.heavyBaseOilPrice) || (780 * (currencies[roiData.currency]?.rate || 1)), 
                                    density: 0.87 
                                  },
                                  { 
                                    yield: parseFloat(roiData.residueYield) || 15, 
                                    price: parseFloat(roiData.residuePrice) || (400 * (currencies[roiData.currency]?.rate || 1)), 
                                    density: 1.8 
                                  },
                                  { 
                                    yield: parseFloat(roiData.wasteWaterYield) || 5, 
                                    price: parseFloat(roiData.wasteWaterPrice) || (-50 * (currencies[roiData.currency]?.rate || 1)), 
                                    density: 1.0 
                                  }
                                ];
                                
                                const totalRevenue = products.reduce((total, product) => {
                                  const productLiters = monthlyLiters * product.yield / 100;
                                  const productTons = productLiters * product.density / 1000;
                                  const revenue = productTons * product.price;
                                  return total + revenue;
                                }, 0);
                                
                                return totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                              })()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Yield Validation */}
                    <div className={`p-4 rounded-lg border ${(() => {
                      const totalYield = [
                        parseFloat(roiData.naphthaGasOilYield) || 0,
                        parseFloat(roiData.lightBaseOilYield) || 0,
                        parseFloat(roiData.heavyBaseOilYield) || 0,
                        parseFloat(roiData.residueYield) || 0,
                        parseFloat(roiData.wasteWaterYield) || 0,
                        parseFloat(roiData.processLossYield) || 0
                      ].reduce((sum, val) => sum + val, 0);
                      
                      if (Math.abs(totalYield - 100) < 0.1) {
                        return 'bg-green-50 border-green-200';
                      } else {
                        return 'bg-red-50 border-red-200';
                      }
                    })()}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {(() => {
                            const totalYield = [
                              parseFloat(roiData.naphthaGasOilYield) || 0,
                              parseFloat(roiData.lightBaseOilYield) || 0,
                              parseFloat(roiData.heavyBaseOilYield) || 0,
                              parseFloat(roiData.residueYield) || 0,
                              parseFloat(roiData.wasteWaterYield) || 0,
                              parseFloat(roiData.processLossYield) || 0
                            ].reduce((sum, val) => sum + val, 0);
                            
                            if (Math.abs(totalYield - 100) < 0.1) {
                              return (
                                <>
                                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                  <span className="font-medium text-green-800">Valid Yield Distribution</span>
                                </>
                              );
                            } else {
                              return (
                                <>
                                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                  <span className="font-medium text-red-800">Invalid Yield Distribution</span>
                                </>
                              );
                            }
                          })()}
                        </div>
                        <div className="text-lg font-bold">
                          Total: {(() => {
                            const totalYield = [
                              parseFloat(roiData.naphthaGasOilYield) || 0,
                              parseFloat(roiData.lightBaseOilYield) || 0,
                              parseFloat(roiData.heavyBaseOilYield) || 0,
                              parseFloat(roiData.residueYield) || 0,
                              parseFloat(roiData.wasteWaterYield) || 0,
                              parseFloat(roiData.processLossYield) || 0
                            ].reduce((sum, val) => sum + val, 0);
                            return totalYield.toFixed(1);
                          })()}%
                        </div>
                      </div>
                      {(() => {
                        const totalYield = [
                          parseFloat(roiData.naphthaGasOilYield) || 0,
                          parseFloat(roiData.lightBaseOilYield) || 0,
                          parseFloat(roiData.heavyBaseOilYield) || 0,
                          parseFloat(roiData.residueYield) || 0,
                          parseFloat(roiData.wasteWaterYield) || 0,
                          parseFloat(roiData.processLossYield) || 0
                        ].reduce((sum, val) => sum + val, 0);
                        
                        if (Math.abs(totalYield - 100) >= 0.1) {
                          return (
                            <p className="text-sm text-red-600 mt-2">
                              Total yield must equal 100%. Current difference: {(totalYield - 100).toFixed(1)}%
                            </p>
                          );
                        }
                        return null;
                      })()}
                    </div>

                    {/* Monthly Revenue Calculation Preview */}
                    {roiData.plantCapacity && roiData.plantOperationDays && (
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <h4 className="font-semibold text-blue-800 mb-3">Monthly Revenue Calculation Preview</h4>
                        <div className="text-sm text-blue-700">
                          <p className="mb-2">
                            <strong>Plant Capacity:</strong> {roiData.plantCapacity} LPH × {roiData.plantOperationDays} days × 8 hours = {
                              (parseFloat(roiData.plantCapacity) || 0) * (parseFloat(roiData.plantOperationDays) || 0) * 8
                            } liters/month
                          </p>
                          <p className="mb-2 text-xs text-blue-600">
                            <strong>Densities (kg/L):</strong> Naphtha & Gas Oil: 0.80, Light Base Oil: 0.85, Heavy Base Oil: 0.87, Residue: 1.8, Waste Water: 1.0
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                            {[
                              { name: 'Naphtha & Gas Oil', yield: roiData.naphthaGasOilYield, price: roiData.naphthaGasOilPrice, density: 0.80 },
                              { name: 'Light Base Oil', yield: roiData.lightBaseOilYield, price: roiData.lightBaseOilPrice, density: 0.85 },
                              { name: 'Heavy Base Oil', yield: roiData.heavyBaseOilYield, price: roiData.heavyBaseOilPrice, density: 0.87 },
                              { name: 'Residue', yield: roiData.residueYield, price: roiData.residuePrice, density: 1.8 },
                              { name: 'Waste Water', yield: roiData.wasteWaterYield, price: roiData.wasteWaterPrice, density: 1.0 }
                            ].map((product, index) => {
                              const monthlyLiters = (parseFloat(roiData.plantCapacity) || 0) * (parseFloat(roiData.plantOperationDays) || 0) * 8;
                              const productLiters = monthlyLiters * (parseFloat(product.yield) || 0) / 100;
                              const productTons = productLiters * product.density / 1000; // Convert liters to tons using density
                              const revenue = productTons * (parseFloat(product.price) || 0);
                              
                              return (
                                <div key={index} className="text-xs">
                                  <strong>{product.name}:</strong> {productTons.toFixed(1)} tons → {getCurrencySymbol(roiData.currency)}{revenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 6: Revenue & Investment */}
                {currentStep === 6 && (
                  <div className="space-y-6">
                    <div className="text-center mb-6">
                      <h2 className="text-2xl font-bold mb-2">Investment Structure & ROI Analysis</h2>
                      <p className="text-muted-foreground">Configure financing structure and review final investment calculations</p>
                    </div>

                    {/* Revenue Analysis Table */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold">Monthly Revenue Breakdown</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-gray-300 text-sm">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="border border-gray-300 px-4 py-3 text-left font-medium">Product</th>
                              <th className="border border-gray-300 px-4 py-3 text-center font-medium">Monthly Production (Tons)</th>
                              <th className="border border-gray-300 px-4 py-3 text-center font-medium">Price per Ton ({getCurrencySymbol(roiData.currency)})</th>
                              <th className="border border-gray-300 px-4 py-3 text-center font-medium">Monthly Revenue ({getCurrencySymbol(roiData.currency)})</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              { 
                                name: 'Naphtha & Gas Oil', 
                                yield: roiData.naphthaGasOilYield, 
                                price: roiData.naphthaGasOilPrice, 
                                density: 0.80,
                                bgColor: 'bg-blue-50'
                              },
                              { 
                                name: 'Light Base Oil', 
                                yield: roiData.lightBaseOilYield, 
                                price: roiData.lightBaseOilPrice, 
                                density: 0.85,
                                bgColor: 'bg-green-50'
                              },
                              { 
                                name: 'Heavy Base Oil', 
                                yield: roiData.heavyBaseOilYield, 
                                price: roiData.heavyBaseOilPrice, 
                                density: 0.87,
                                bgColor: 'bg-yellow-50'
                              },
                              { 
                                name: 'Residue', 
                                yield: roiData.residueYield, 
                                price: roiData.residuePrice, 
                                density: 1.8,
                                bgColor: 'bg-orange-50'
                              },
                              { 
                                name: 'Waste Water', 
                                yield: roiData.wasteWaterYield, 
                                price: roiData.wasteWaterPrice, 
                                density: 1.0,
                                bgColor: 'bg-red-50'
                              }
                            ].map((product, index) => {
                              const monthlyLiters = (parseFloat(roiData.capacity) || 0) * (parseFloat(roiData.plantOperationDays) || 0) * 24;
                              const productLiters = monthlyLiters * (parseFloat(product.yield) || 0) / 100;
                              const productTons = productLiters * product.density / 1000;
                              const revenue = productTons * (parseFloat(product.price) || 0);
                              
                              return (
                                <tr key={index} className={`hover:bg-gray-50 ${product.bgColor}`}>
                                  <td className="border border-gray-300 px-4 py-3 font-medium text-gray-900">{product.name}</td>
                                  <td className="border border-gray-300 px-4 py-3 text-center font-mono">
                                    {productTons.toFixed(1)}
                                  </td>
                                  <td className="border border-gray-300 px-4 py-3 text-center font-mono">
                                    {parseFloat(product.price) || 0}
                                  </td>
                                  <td className="border border-gray-300 px-4 py-3 text-center font-mono font-semibold">
                                    {revenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Financial Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {(() => {
                        // Calculate totals
                        const monthlyLiters = (parseFloat(roiData.capacity) || 0) * (parseFloat(roiData.plantOperationDays) || 0) * 24;
                        const products = [
                          { yield: roiData.naphthaGasOilYield, price: roiData.naphthaGasOilPrice, density: 0.80 },
                          { yield: roiData.lightBaseOilYield, price: roiData.lightBaseOilPrice, density: 0.85 },
                          { yield: roiData.heavyBaseOilYield, price: roiData.heavyBaseOilPrice, density: 0.87 },
                          { yield: roiData.residueYield, price: roiData.residuePrice, density: 1.8 },
                          { yield: roiData.wasteWaterYield, price: roiData.wasteWaterPrice, density: 1.0 }
                        ];
                        
                        const totalMonthlyRevenue = products.reduce((total, product) => {
                          const productLiters = monthlyLiters * (parseFloat(product.yield) || 0) / 100;
                          const productTons = productLiters * product.density / 1000;
                          const revenue = productTons * (parseFloat(product.price) || 0);
                          return total + revenue;
                        }, 0);

                        // Calculate monthly costs
                        const monthlyCosts = [
                          parseFloat(roiData.feedstockCost) || 0,
                          parseFloat(roiData.powerCost) || 0,
                          parseFloat(roiData.fuelCost) || 0,
                          parseFloat(roiData.chemicalCost) || 0,
                          parseFloat(roiData.mediaCost) || 0,
                          parseFloat(roiData.laborCost) || 0,
                          parseFloat(roiData.maintenanceCost) || 0,
                          parseFloat(roiData.transportationCost) || 0,
                          parseFloat(roiData.vehicleMaintenanceCost) || 0,
                          parseFloat(roiData.miscellaneousCost) || 0,
                          financingCosts.totalMonthlyFinancingCost || 0,
                          (annualDepreciation / 12) || 0
                        ].reduce((total, cost) => total + cost, 0);

                        const grossProfit = totalMonthlyRevenue - monthlyCosts;
                        const grossProfitMargin = totalMonthlyRevenue > 0 ? (grossProfit / totalMonthlyRevenue) * 100 : 0;

                        return (
                          <>
                            <Card className="bg-green-50 border-green-200">
                              <CardContent className="p-4">
                                <div className="flex items-center space-x-2">
                                  <TrendingUp className="h-6 w-6 text-green-600" />
                                  <div>
                                    <p className="text-xl font-bold text-green-900">
                                      {getCurrencySymbol(roiData.currency)}{totalMonthlyRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </p>
                                    <p className="text-sm text-green-700">Monthly Revenue</p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>

                            <Card className="bg-red-50 border-red-200">
                              <CardContent className="p-4">
                                <div className="flex items-center space-x-2">
                                  <DollarSign className="h-6 w-6 text-red-600" />
                                  <div>
                                    <p className="text-xl font-bold text-red-900">
                                      {getCurrencySymbol(roiData.currency)}{monthlyCosts.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </p>
                                    <p className="text-sm text-red-700">Monthly Costs</p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>

                            <Card className="bg-blue-50 border-blue-200">
                              <CardContent className="p-4">
                                <div className="flex items-center space-x-2">
                                  <Percent className="h-6 w-6 text-blue-600" />
                                  <div>
                                    <p className="text-xl font-bold text-blue-900">
                                      {getCurrencySymbol(roiData.currency)}{grossProfit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </p>
                                    <p className="text-sm text-blue-700">
                                      Gross Profit ({grossProfitMargin.toFixed(1)}% margin)
                                    </p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </>
                        );
                      })()}
                    </div>

                    {/* Investment Analysis */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold">Investment Analysis</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Total Project Investment ({getCurrencySymbol(roiData.currency)})</Label>
                            <Input
                              type="text"
                              value={(() => {
                                // Calculate total project cost from all previous steps
                                const baseCost = parseFloat(roiData.projectCostLocal) || 0;
                                const additionalCosts = [
                                  parseFloat(roiData.freightInsurance) || 0,
                                  parseFloat(roiData.importDutyVAT) || 0,
                                  parseFloat(roiData.plotCost) || 0,
                                  parseFloat(roiData.civilCost) || 0,
                                  parseFloat(roiData.refineryShed) || 0,
                                  parseFloat(roiData.utilityShed) || 0,
                                  parseFloat(roiData.officeBuilding) || 0,
                                  parseFloat(roiData.fireSuppression) || 0,
                                  parseFloat(roiData.insulation) || 0,
                                  parseFloat(roiData.legalFees) || 0,
                                  parseFloat(roiData.preFormationExpenses) || 0,
                                  parseFloat(roiData.commissioningTravel) || 0,
                                  parseFloat(roiData.contingency) || 0
                                ].reduce((sum, cost) => sum + cost, 0);
                                const equipmentCosts = [
                                  parseFloat(roiData.pumpsCost) || 0,
                                  parseFloat(roiData.transmittersCost) || 0,
                                  parseFloat(roiData.electricalCost) || 0,
                                  parseFloat(roiData.mechanicalCost) || 0,
                                  parseFloat(roiData.commissioningCost) || 0
                                ].reduce((sum, cost) => sum + cost, 0);
                                const tankCosts = (roiData.tanks || []).reduce((total, tank) => {
                                  return total + (parseFloat(tank.totalCost) || 0);
                                }, 0);
                                const utilityCosts = (roiData.utilities || []).reduce((total, utility) => {
                                  return total + (parseFloat(utility.totalCost) || 0);
                                }, 0);
                                const workingCapital = parseFloat(roiData.workingCapitalRequirement) || 0;
                                
                                const totalInvestment = baseCost + additionalCosts + equipmentCosts + tankCosts + utilityCosts + workingCapital;
                                return totalInvestment.toLocaleString();
                              })()}
                              readOnly
                              className="bg-gray-50 font-semibold text-center"
                            />
                            <p className="text-xs text-gray-500">Auto-calculated from all project components including working capital</p>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label>Working Capital (from Step 4) ({getCurrencySymbol(roiData.currency)})</Label>
                              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">Auto-calculated</span>
                            </div>
                            <Input
                              type="text"
                              value={workingCapital > 0 ? workingCapital.toLocaleString() : '0'}
                              readOnly
                              className="bg-blue-50 text-center font-semibold"
                            />
                            <p className="text-xs text-gray-500">Calculated from Step 4: Feedstock Cost × Plant Capacity × 24 hours × Operating Days</p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Financing Structure</Label>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-sm">Equity (%) *</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="1"
                                  value={roiData.equityPercentage || '30'}
                                  onChange={(e) => updateData('equityPercentage', e.target.value)}
                                  placeholder="30"
                                  className="bg-blue-50"
                                />
                              </div>
                              <div>
                                <Label className="text-sm">Debt (%) *</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="1"
                                  value={roiData.debtPercentage || '70'}
                                  onChange={(e) => updateData('debtPercentage', e.target.value)}
                                  placeholder="70"
                                  className="bg-red-50"
                                />
                              </div>
                            </div>
                            <p className="text-xs text-gray-500">Must total 100%</p>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label>Interest Rate (from Step 4)</Label>
                              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">Set in Step 4</span>
                            </div>
                            <Input
                              type="text"
                              value={`${roiData.rateOfInterest || '6.0'}% annual`}
                              readOnly
                              className="bg-blue-50 text-center font-semibold"
                            />
                            <p className="text-xs text-gray-500">Configured in Step 4 Operating Costs section</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Financial Summary Preview */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                      <Card className="bg-blue-50 border-blue-200">
                        <CardContent className="p-4">
                          <div className="flex items-center space-x-2">
                            <Factory className="h-6 w-6 text-blue-600" />
                            <div>
                              <p className="text-xl font-bold text-blue-900">
                                {getCurrencySymbol(roiData.currency)}{(() => {
                                  const baseCost = parseFloat(roiData.projectCostLocal) || 0;
                                  const additionalCosts = [
                                    parseFloat(roiData.freightInsurance) || 0,
                                    parseFloat(roiData.importDutyVAT) || 0,
                                    parseFloat(roiData.plotCost) || 0,
                                    parseFloat(roiData.civilCost) || 0,
                                    parseFloat(roiData.refineryShed) || 0,
                                    parseFloat(roiData.utilityShed) || 0,
                                    parseFloat(roiData.officeBuilding) || 0,
                                    parseFloat(roiData.fireSuppression) || 0,
                                    parseFloat(roiData.insulation) || 0,
                                    parseFloat(roiData.legalFees) || 0,
                                    parseFloat(roiData.preFormationExpenses) || 0,
                                    parseFloat(roiData.commissioningTravel) || 0,
                                    parseFloat(roiData.contingency) || 0
                                  ].reduce((sum, cost) => sum + cost, 0);
                                  const equipmentCosts = [
                                    parseFloat(roiData.pumpsCost) || 0,
                                    parseFloat(roiData.transmittersCost) || 0,
                                    parseFloat(roiData.electricalCost) || 0,
                                    parseFloat(roiData.mechanicalCost) || 0,
                                    parseFloat(roiData.commissioningCost) || 0
                                  ].reduce((sum, cost) => sum + cost, 0);
                                  const tankCosts = (roiData.tanks || []).reduce((total, tank) => {
                                    return total + (parseFloat(tank.totalCost) || 0);
                                  }, 0);
                                  const utilityCosts = (roiData.utilities || []).reduce((total, utility) => {
                                    return total + (parseFloat(utility.totalCost) || 0);
                                  }, 0);
                                  const workingCapital = parseFloat(roiData.workingCapitalRequirement) || 0;
                                  const totalInvestment = baseCost + additionalCosts + equipmentCosts + tankCosts + utilityCosts + workingCapital;
                                  return totalInvestment.toLocaleString();
                                })()}
                              </p>
                              <p className="text-sm text-blue-700">Total Investment Required</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="bg-green-50 border-green-200">
                        <CardContent className="p-4">
                          <div className="flex items-center space-x-2">
                            <TrendingUp className="h-6 w-6 text-green-600" />
                            <div>
                              <p className="text-xl font-bold text-green-900">
                                {getCurrencySymbol(roiData.currency)}{(() => {
                                  const plantCapacity = parseFloat(roiData.capacity) || 0;
                                  const operatingDays = parseFloat(roiData.plantOperationDays) || 30;
                                  const monthlyLiters = plantCapacity * operatingDays * 24;
                                  
                                  const products = [
                                    { yield: parseFloat(roiData.naphthaGasOilYield) || 0, price: parseFloat(roiData.naphthaGasOilPrice) || 0, density: 0.80 },
                                    { yield: parseFloat(roiData.lightBaseOilYield) || 0, price: parseFloat(roiData.lightBaseOilPrice) || 0, density: 0.85 },
                                    { yield: parseFloat(roiData.heavyBaseOilYield) || 0, price: parseFloat(roiData.heavyBaseOilPrice) || 0, density: 0.87 },
                                    { yield: parseFloat(roiData.residueYield) || 0, price: parseFloat(roiData.residuePrice) || 0, density: 1.8 },
                                    { yield: parseFloat(roiData.wasteWaterYield) || 0, price: parseFloat(roiData.wasteWaterPrice) || 0, density: 1.0 }
                                  ];
                                  
                                  const monthlyRevenue = products.reduce((total, product) => {
                                    const productLiters = monthlyLiters * product.yield / 100;
                                    const productTons = productLiters * product.density / 1000;
                                    const revenue = productTons * product.price;
                                    return total + revenue;
                                  }, 0);
                                  
                                  return (monthlyRevenue * 12).toLocaleString();
                                })()}
                              </p>
                              <p className="text-sm text-green-700">Projected Annual Revenue</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Validation Messages */}
                    {(() => {
                      const equity = parseFloat(roiData.equityPercentage) || 0;
                      const debt = parseFloat(roiData.debtPercentage) || 0;
                      const total = equity + debt;
                      
                      if (Math.abs(total - 100) > 0.1) {
                        return (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
                            <div className="flex items-center gap-2">
                              <Info className="h-4 w-4 text-yellow-600" />
                              <p className="text-yellow-800 text-sm">
                                Financing structure must total 100%. Current total: {total.toFixed(1)}%
                              </p>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                  </div>
                )}

                {/* Step 7: Enhanced Financial Analysis & ROI Report */}
                {currentStep === 7 && (
                  <div className="space-y-8 print:space-y-6">
                    {/* Project Summary Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-lg print:bg-gray-100 print:text-black">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h1 className="text-3xl font-bold mb-2">Professional Financial Analysis & ROI Report</h1>
                          <p className="text-blue-100 print:text-gray-600">{roiData.customerName || 'Re-refining Plant Project'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-blue-100 print:text-gray-500">Generated on</p>
                          <p className="font-semibold">{new Date().toLocaleDateString()}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                        <div className="bg-white/20 print:bg-gray-200 rounded-lg p-3">
                          <p className="text-sm text-blue-100 print:text-gray-600">Plant Capacity</p>
                          <p className="text-lg font-bold">{(parseFloat(roiData.capacity) || 0).toLocaleString()} LPH</p>
                        </div>
                        <div className="bg-white/20 print:bg-gray-200 rounded-lg p-3">
                          <p className="text-sm text-blue-100 print:text-gray-600">Currency</p>
                          <p className="text-lg font-bold">{roiData.currency}</p>
                        </div>
                        <div className="bg-white/20 print:bg-gray-200 rounded-lg p-3">
                          <p className="text-sm text-blue-100 print:text-gray-600">Operating Days</p>
                          <p className="text-lg font-bold">{parseFloat(roiData.plantOperationDays) || 30}/month</p>
                        </div>
                        <div className="bg-white/20 print:bg-gray-200 rounded-lg p-3">
                          <p className="text-sm text-blue-100 print:text-gray-600">Total CAPEX</p>
                          <p className="text-lg font-bold">{getCurrencySymbol(roiData.currency)}{(() => {
                            const baseCost = parseFloat(roiData.projectCostLocal) || 0;
                            const tankCosts = (roiData.tanks || calculatedTanks).reduce((total, tank) => total + (parseFloat(tank.totalCost) || 0), 0);
                            const utilityCosts = (roiData.utilities || calculatedUtilities).reduce((total, utility) => total + (parseFloat(utility.totalCost) || 0), 0);
                            const additionalCosts = [
                              parseFloat(roiData.freightInsurance) || 0, parseFloat(roiData.importDutyVAT) || 0,
                              parseFloat(roiData.plotCost) || 0, parseFloat(roiData.civilCost) || 0,
                              parseFloat(roiData.refineryShed) || 0, parseFloat(roiData.utilityShed) || 0,
                              parseFloat(roiData.officeBuilding) || 0, parseFloat(roiData.mechanicalElectrical) || 0,
                              parseFloat(roiData.fireSuppression) || 0, parseFloat(roiData.insulation) || 0,
                              parseFloat(roiData.legalFees) || 0, parseFloat(roiData.preFormationExpenses) || 0,
                              parseFloat(roiData.commissioningTravel) || 0, parseFloat(roiData.contingency) || 0
                            ].reduce((sum, cost) => sum + cost, 0);
                            const equipmentCosts = [
                              parseFloat(roiData.pumpsCost) || 0, parseFloat(roiData.transmittersCost) || 0,
                              parseFloat(roiData.electricalCost) || 0, parseFloat(roiData.mechanicalCost) || 0,
                              parseFloat(roiData.commissioningCost) || 0
                            ].reduce((sum, cost) => sum + cost, 0);
                            const workingCapital = parseFloat(roiData.workingCapitalRequirement) || 0;
                            return (baseCost + tankCosts + utilityCosts + additionalCosts + equipmentCosts + workingCapital).toLocaleString();
                          })()}</p>
                        </div>
                      </div>
                    </div>

                    {/* Enhanced Financial Summary Cards */}
                    <div className="space-y-6">
                      {/* Primary Financial Metrics */}
                      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                      <Card className="border-l-4 border-l-green-500">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-muted-foreground mb-1">Total Revenue</p>
                              <p className="text-xl font-bold text-green-600">{getCurrencySymbol(roiData.currency)}{(() => {
                                const plantCapacity = parseFloat(roiData.capacity) || 0;
                                const operatingDays = parseFloat(roiData.plantOperationDays) || 30;
                                const annualLiters = plantCapacity * operatingDays * 24 * 12;
                                const products = [
                                  { yield: parseFloat(roiData.naphthaGasOilYield) || 0, price: parseFloat(roiData.naphthaGasOilPrice) || 0, density: 0.80 },
                                  { yield: parseFloat(roiData.lightBaseOilYield) || 0, price: parseFloat(roiData.lightBaseOilPrice) || 0, density: 0.85 },
                                  { yield: parseFloat(roiData.heavyBaseOilYield) || 0, price: parseFloat(roiData.heavyBaseOilPrice) || 0, density: 0.87 },
                                  { yield: parseFloat(roiData.residueYield) || 0, price: parseFloat(roiData.residuePrice) || 0, density: 1.8 },
                                  { yield: parseFloat(roiData.wasteWaterYield) || 0, price: parseFloat(roiData.wasteWaterPrice) || 0, density: 1.0 }
                                ];
                                return products.reduce((total, product) => {
                                  const productLiters = annualLiters * product.yield / 100;
                                  const productTons = productLiters * product.density / 1000;
                                  return total + (productTons * product.price);
                                }, 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
                              })()}</p>
                              <p className="text-xs text-muted-foreground">Annual</p>
                            </div>
                            <TrendingUp className="h-8 w-8 text-green-500" />
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card className="border-l-4 border-l-red-500">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-muted-foreground mb-1">Total Costs</p>
                              <p className="text-xl font-bold text-red-600">{getCurrencySymbol(roiData.currency)}{(() => {
                                const operatingCosts = [
                                  parseFloat(roiData.feedstockCost) || 0,
                                  parseFloat(roiData.powerCost) || 0,
                                  parseFloat(roiData.fuelCost) || 0,
                                  parseFloat(roiData.chemicalCost) || 0,
                                  parseFloat(roiData.laborCost) || 0,
                                  parseFloat(roiData.maintenanceCost) || 0
                                ].reduce((sum, cost) => sum + cost, 0) * 12;
                                const annualFinancing = financingCosts.annualFinancingCosts || 0;
                                const depreciation = roiData.includeDepreciation ? (annualDepreciation || 0) : 0;
                                return (operatingCosts + annualFinancing + depreciation).toLocaleString(undefined, { maximumFractionDigits: 0 });
                              })()}</p>
                              <p className="text-xs text-muted-foreground">OpEx + Financing + Depreciation</p>
                            </div>
                            <DollarSign className="h-8 w-8 text-red-500" />
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card className="border-l-4 border-l-blue-500">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-muted-foreground mb-1">Net Profit</p>
                              <p className="text-xl font-bold text-blue-600">{getCurrencySymbol(roiData.currency)}{(roiData.netProfit || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                              <p className="text-xs text-muted-foreground">After financing & depreciation</p>
                            </div>
                            <BarChart3 className="h-8 w-8 text-blue-500" />
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card className="border-l-4 border-l-purple-500">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-muted-foreground mb-1">ROI (Total)</p>
                              <p className="text-xl font-bold text-purple-600">{(roiData.annualROI || 0).toFixed(1)}%</p>
                              <p className="text-xs text-muted-foreground">On total investment</p>
                            </div>
                            <Percent className="h-8 w-8 text-purple-500" />
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card className="border-l-4 border-l-orange-500">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-muted-foreground mb-1">Payback Period</p>
                              <p className="text-xl font-bold text-orange-600">{(roiData.paybackPeriodMonths || (roiData.paybackPeriod || 0) * 12).toFixed(1)}</p>
                              <p className="text-xs text-muted-foreground">
                                Months {(() => {
                                  const hasFinancing = roiData.includeFinancingCosts !== false;
                                  const hasDepreciation = roiData.includeDepreciation !== false;
                                  if (hasFinancing && hasDepreciation) return "(post-financing & depreciation)";
                                  if (hasFinancing) return "(post-financing)";
                                  if (hasDepreciation) return "(post-depreciation)";
                                  return "(gross payback)";
                                })()}
                              </p>
                            </div>
                            <Clock className="h-8 w-8 text-orange-500" />
                          </div>
                        </CardContent>
                      </Card>
                      </div>

                      {/* Additional Financial Metrics */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <Card className="bg-emerald-50 border-emerald-200">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm text-muted-foreground mb-1">EBITDA</p>
                                <p className="text-lg font-bold text-emerald-600">{getCurrencySymbol(roiData.currency)}{(roiData.ebitda || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                                <p className="text-xs text-muted-foreground">Before interest & depreciation</p>
                              </div>
                              <TrendingUp className="h-6 w-6 text-emerald-500" />
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="bg-amber-50 border-amber-200">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm text-muted-foreground mb-1">Return on Equity</p>
                                <p className="text-lg font-bold text-amber-600">{(roiData.returnOnEquity || 0).toFixed(1)}%</p>
                                <p className="text-xs text-muted-foreground">On equity investment</p>
                              </div>
                              <Percent className="h-6 w-6 text-amber-500" />
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="bg-rose-50 border-rose-200">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm text-muted-foreground mb-1">Annual Financing</p>
                                <p className="text-lg font-bold text-rose-600">{getCurrencySymbol(roiData.currency)}{(roiData.annualFinancingCosts || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                                <p className="text-xs text-muted-foreground">Interest on debt & WC</p>
                              </div>
                              <DollarSign className="h-6 w-6 text-rose-500" />
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="bg-slate-50 border-slate-200">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm text-muted-foreground mb-1">Annual Depreciation</p>
                                <p className="text-lg font-bold text-slate-600">{getCurrencySymbol(roiData.currency)}{(roiData.annualDepreciation || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                                <p className="text-xs text-muted-foreground">{roiData.depreciationMethod || 'Straight-line'}</p>
                              </div>
                              <BarChart3 className="h-6 w-6 text-slate-500" />
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Financing Structure */}
                      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                        <CardHeader>
                          <CardTitle className="text-blue-800">Investment & Financing Structure</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="text-center">
                              <p className="text-sm text-blue-600 mb-1">Total Investment</p>
                              <p className="text-2xl font-bold text-blue-800">{getCurrencySymbol(roiData.currency)}{(financingCosts.totalInvestment || 0).toLocaleString()}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-sm text-blue-600 mb-1">Debt ({roiData.debtFinancingRatio || 70}%)</p>
                              <p className="text-xl font-bold text-red-700">{getCurrencySymbol(roiData.currency)}{(roiData.debtAmount || 0).toLocaleString()}</p>
                              <p className="text-xs text-gray-500">@ {roiData.rateOfInterest || 0.5}% monthly</p>
                            </div>
                            <div className="text-center">
                              <p className="text-sm text-blue-600 mb-1">Equity ({100 - (parseFloat(roiData.debtFinancingRatio) || 70)}%)</p>
                              <p className="text-xl font-bold text-green-700">{getCurrencySymbol(roiData.currency)}{(roiData.equityAmount || 0).toLocaleString()}</p>
                              <p className="text-xs text-gray-500">Owner contribution</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Charts and Visualizations */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Revenue Breakdown Chart */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5" />
                            Revenue Breakdown by Product
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {[
                              { name: 'Naphtha & Gas Oil', yield: roiData.naphthaGasOilYield, price: roiData.naphthaGasOilPrice, density: 0.80, color: 'bg-blue-500' },
                              { name: 'Light Base Oil', yield: roiData.lightBaseOilYield, price: roiData.lightBaseOilPrice, density: 0.85, color: 'bg-green-500' },
                              { name: 'Heavy Base Oil', yield: roiData.heavyBaseOilYield, price: roiData.heavyBaseOilPrice, density: 0.87, color: 'bg-yellow-500' },
                              { name: 'Residue', yield: roiData.residueYield, price: roiData.residuePrice, density: 1.8, color: 'bg-red-500' },
                              { name: 'Waste Water', yield: roiData.wasteWaterYield, price: roiData.wasteWaterPrice, density: 1.0, color: 'bg-purple-500' }
                            ].map((product, index) => {
                              const plantCapacity = parseFloat(roiData.capacity) || 0;
                              const operatingDays = parseFloat(roiData.plantOperationDays) || 30;
                              const annualLiters = plantCapacity * operatingDays * 24 * 12;
                              const productLiters = annualLiters * (parseFloat(product.yield) || 0) / 100;
                              const productTons = productLiters * product.density / 1000;
                              const annualRevenue = productTons * (parseFloat(product.price) || 0);
                              
                              // Calculate total revenue for percentage
                              const totalRevenue = [
                                { yield: parseFloat(roiData.naphthaGasOilYield) || 0, price: parseFloat(roiData.naphthaGasOilPrice) || 0, density: 0.80 },
                                { yield: parseFloat(roiData.lightBaseOilYield) || 0, price: parseFloat(roiData.lightBaseOilPrice) || 0, density: 0.85 },
                                { yield: parseFloat(roiData.heavyBaseOilYield) || 0, price: parseFloat(roiData.heavyBaseOilPrice) || 0, density: 0.87 },
                                { yield: parseFloat(roiData.residueYield) || 0, price: parseFloat(roiData.residuePrice) || 0, density: 1.8 },
                                { yield: parseFloat(roiData.wasteWaterYield) || 0, price: parseFloat(roiData.wasteWaterPrice) || 0, density: 1.0 }
                              ].reduce((total, p) => {
                                const pLiters = annualLiters * p.yield / 100;
                                const pTons = pLiters * p.density / 1000;
                                return total + (pTons * p.price);
                              }, 0);
                              
                              const percentage = totalRevenue > 0 ? (annualRevenue / totalRevenue) * 100 : 0;
                              
                              return (
                                <div key={index} className="space-y-2">
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium">{product.name}</span>
                                    <div className="text-right">
                                      <span className="font-bold">{getCurrencySymbol(roiData.currency)}{annualRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                      <span className="text-xs text-muted-foreground ml-2">({percentage.toFixed(1)}%)</span>
                                    </div>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-3">
                                    <div className={`${product.color} h-3 rounded-full transition-all duration-500`} style={{ width: `${percentage}%` }}></div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Profit vs Expense Pie Chart */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <PieChart className="h-5 w-5" />
                            Profit vs Expense Analysis
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {(() => {
                              const plantCapacity = parseFloat(roiData.capacity) || 0;
                              const operatingDays = parseFloat(roiData.plantOperationDays) || 30;
                              const annualLiters = plantCapacity * operatingDays * 24 * 12;
                              const products = [
                                { yield: parseFloat(roiData.naphthaGasOilYield) || 0, price: parseFloat(roiData.naphthaGasOilPrice) || 0, density: 0.80 },
                                { yield: parseFloat(roiData.lightBaseOilYield) || 0, price: parseFloat(roiData.lightBaseOilPrice) || 0, density: 0.85 },
                                { yield: parseFloat(roiData.heavyBaseOilYield) || 0, price: parseFloat(roiData.heavyBaseOilPrice) || 0, density: 0.87 },
                                { yield: parseFloat(roiData.residueYield) || 0, price: parseFloat(roiData.residuePrice) || 0, density: 1.8 },
                                { yield: parseFloat(roiData.wasteWaterYield) || 0, price: parseFloat(roiData.wasteWaterPrice) || 0, density: 1.0 }
                              ];
                              const revenue = products.reduce((total, product) => {
                                const productLiters = annualLiters * product.yield / 100;
                                const productTons = productLiters * product.density / 1000;
                                return total + (productTons * product.price);
                              }, 0);
                              const operatingCosts = [
                                parseFloat(roiData.feedstockCost) || 0,
                                parseFloat(roiData.powerCost) || 0,
                                parseFloat(roiData.fuelCost) || 0,
                                parseFloat(roiData.chemicalCost) || 0,
                                parseFloat(roiData.laborCost) || 0,
                                parseFloat(roiData.maintenanceCost) || 0,
                                parseFloat(roiData.mediaCost) || 0,
                                parseFloat(roiData.transportationCost) || 0,
                                parseFloat(roiData.vehicleMaintenanceCost) || 0,
                                parseFloat(roiData.miscellaneousCost) || 0
                              ].reduce((sum, cost) => sum + cost, 0) * 12;
                              const profit = revenue - operatingCosts;
                              
                              const total = revenue;
                              const segments = [
                                { name: 'Operating Costs', value: operatingCosts, color: 'bg-red-500', percentage: (operatingCosts / total) * 100 },
                                { name: 'Gross Profit', value: profit, color: 'bg-green-500', percentage: (profit / total) * 100 }
                              ];
                              
                              return segments.map((segment, index) => (
                                <div key={index} className="space-y-2">
                                  <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                      <div className={`w-4 h-4 ${segment.color} rounded`}></div>
                                      <span className="text-sm font-medium">{segment.name}</span>
                                    </div>
                                    <div className="text-right">
                                      <span className="font-bold">{getCurrencySymbol(roiData.currency)}{segment.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                      <span className="text-xs text-muted-foreground ml-2">({segment.percentage.toFixed(1)}%)</span>
                                    </div>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-3">
                                    <div className={`${segment.color} h-3 rounded-full transition-all duration-500`} style={{ width: `${segment.percentage}%` }}></div>
                                  </div>
                                </div>
                              ));
                            })()}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Detailed Financial Table */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <FileText className="h-5 w-5" />
                          Detailed Financial Analysis
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* Product Analysis Table */}
                          <div>
                            <h4 className="font-semibold mb-3">Product Revenue Analysis</h4>
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm border-collapse border">
                                <thead>
                                  <tr className="bg-gray-50">
                                    <th className="border p-2 text-left">Product</th>
                                    <th className="border p-2 text-center">Yield %</th>
                                    <th className="border p-2 text-center">Price/Ton</th>
                                    <th className="border p-2 text-center">Annual Tons</th>
                                    <th className="border p-2 text-center">Revenue</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {[
                                    { name: 'Naphtha & Gas Oil', yield: roiData.naphthaGasOilYield, price: roiData.naphthaGasOilPrice, density: 0.80 },
                                    { name: 'Light Base Oil', yield: roiData.lightBaseOilYield, price: roiData.lightBaseOilPrice, density: 0.85 },
                                    { name: 'Heavy Base Oil', yield: roiData.heavyBaseOilYield, price: roiData.heavyBaseOilPrice, density: 0.87 },
                                    { name: 'Residue', yield: roiData.residueYield, price: roiData.residuePrice, density: 1.8 },
                                    { name: 'Waste Water', yield: roiData.wasteWaterYield, price: roiData.wasteWaterPrice, density: 1.0 }
                                  ].map((product, index) => {
                                    const plantCapacity = parseFloat(roiData.capacity) || 0;
                                    const operatingDays = parseFloat(roiData.plantOperationDays) || 30;
                                    const annualLiters = plantCapacity * operatingDays * 24 * 12;
                                    const productLiters = annualLiters * (parseFloat(product.yield) || 0) / 100;
                                    const productTons = productLiters * product.density / 1000;
                                    const annualRevenue = productTons * (parseFloat(product.price) || 0);
                                    
                                    return (
                                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                        <td className="border p-2 font-medium">{product.name}</td>
                                        <td className="border p-2 text-center">{(parseFloat(product.yield) || 0).toFixed(1)}%</td>
                                        <td className="border p-2 text-center">{getCurrencySymbol(roiData.currency)}{(parseFloat(product.price) || 0).toLocaleString()}</td>
                                        <td className="border p-2 text-center">{productTons.toFixed(0)}</td>
                                        <td className="border p-2 text-center font-semibold">{getCurrencySymbol(roiData.currency)}{annualRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Operating Costs Table */}
                          <div>
                            <h4 className="font-semibold mb-3">Operating Cost Breakdown</h4>
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm border-collapse border">
                                <thead>
                                  <tr className="bg-gray-50">
                                    <th className="border p-2 text-left">Cost Category</th>
                                    <th className="border p-2 text-center">Monthly</th>
                                    <th className="border p-2 text-center">Annual</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(() => {
                                    const plantCapacity = parseFloat(roiData.capacity) || 1000;
                                    const operatingDaysPerMonth = parseFloat(roiData.plantOperationDays) || 25;
                                    
                                    // Calculate actual monthly costs based on field types
                                    const feedstockCostPerLiter = parseFloat(roiData.feedstockCost) || 0;
                                    const monthlyFeedstockCost = feedstockCostPerLiter * plantCapacity * 24 * operatingDaysPerMonth;
                                    
                                    // Note: chemicalCost is now treated as monthly cost, not per-liter
                                    const monthlyChemicalCost = parseFloat(roiData.chemicalCost) || 0;
                                    
                                    return [
                                      { name: 'Feedstock', monthly: monthlyFeedstockCost },
                                      { name: 'Power', monthly: parseFloat(roiData.powerCost) || 0 },
                                      { name: 'Fuel', monthly: parseFloat(roiData.fuelCost) || 0 },
                                      { name: 'Chemical', monthly: monthlyChemicalCost },
                                      { name: 'Labor', monthly: parseFloat(roiData.laborCost) || 0 },
                                      { name: 'Maintenance', monthly: parseFloat(roiData.maintenanceCost) || 0 },
                                      { name: 'Media', monthly: parseFloat(roiData.mediaCost) || 0 },
                                      { name: 'Transportation', monthly: parseFloat(roiData.transportationCost) || 0 },
                                      { name: 'Vehicle Maintenance', monthly: parseFloat(roiData.vehicleMaintenanceCost) || 0 },
                                      { name: 'Miscellaneous', monthly: parseFloat(roiData.miscellaneousCost) || 0 }
                                    ];
                                  })().map((cost, index) => (
                                    <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                      <td className="border p-2 font-medium">{cost.name}</td>
                                      <td className="border p-2 text-center">{getCurrencySymbol(roiData.currency)}{cost.monthly.toLocaleString()}</td>
                                      <td className="border p-2 text-center font-semibold">{getCurrencySymbol(roiData.currency)}{(cost.monthly * 12).toLocaleString()}</td>
                                    </tr>
                                  ))}
                                  <tr className="bg-blue-50 font-bold">
                                    <td className="border p-2">Total Operating Costs</td>
                                    <td className="border p-2 text-center">{getCurrencySymbol(roiData.currency)}{(() => {
                                      const plantCapacity = parseFloat(roiData.capacity) || 1000;
                                      const operatingDaysPerMonth = parseFloat(roiData.plantOperationDays) || 25;
                                      const feedstockCostPerLiter = parseFloat(roiData.feedstockCost) || 0;
                                      const monthlyFeedstockCost = feedstockCostPerLiter * plantCapacity * 24 * operatingDaysPerMonth;
                                      const monthlyChemicalCost = parseFloat(roiData.chemicalCost) || 0;
                                      
                                      return [
                                        monthlyFeedstockCost,
                                        parseFloat(roiData.powerCost) || 0,
                                        parseFloat(roiData.fuelCost) || 0,
                                        monthlyChemicalCost,
                                        parseFloat(roiData.laborCost) || 0,
                                        parseFloat(roiData.maintenanceCost) || 0,
                                        parseFloat(roiData.mediaCost) || 0,
                                        parseFloat(roiData.transportationCost) || 0,
                                        parseFloat(roiData.vehicleMaintenanceCost) || 0,
                                        parseFloat(roiData.miscellaneousCost) || 0
                                      ].reduce((sum, cost) => sum + cost, 0);
                                    })().toLocaleString()}</td>
                                    <td className="border p-2 text-center">{getCurrencySymbol(roiData.currency)}{(() => {
                                      const plantCapacity = parseFloat(roiData.capacity) || 1000;
                                      const operatingDaysPerMonth = parseFloat(roiData.plantOperationDays) || 25;
                                      const feedstockCostPerLiter = parseFloat(roiData.feedstockCost) || 0;
                                      const monthlyFeedstockCost = feedstockCostPerLiter * plantCapacity * 24 * operatingDaysPerMonth;
                                      const monthlyChemicalCost = parseFloat(roiData.chemicalCost) || 0;
                                      
                                      return ([
                                        monthlyFeedstockCost,
                                        parseFloat(roiData.powerCost) || 0,
                                        parseFloat(roiData.fuelCost) || 0,
                                        monthlyChemicalCost,
                                        parseFloat(roiData.laborCost) || 0,
                                        parseFloat(roiData.maintenanceCost) || 0
                                      ].reduce((sum, cost) => sum + cost, 0) * 12).toLocaleString()
                                    })()}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* PDF Export Section */}
                    <div className="flex flex-col sm:flex-row gap-4 print:hidden">
                      <Button 
                        onClick={() => downloadReport('pdf')} 
                        className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                        size="lg"
                      >
                        <Download className="h-5 w-5" />
                        Download Professional PDF Report
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => downloadReport('excel')} 
                        className="flex-1 flex items-center justify-center gap-2"
                        size="lg"
                      >
                        <FileText className="h-5 w-5" />
                        Export to Excel (7 Sheets)
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => window.print()} 
                        className="flex items-center justify-center gap-2"
                        size="lg"
                      >
                        <Printer className="h-5 w-5" />
                        Print Report
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Navigation Buttons */}
            {/* Progress Indicator */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${((currentStep - 1) / 6) * 100}%` }}
                  ></div>
                </div>
                <span className="text-sm text-gray-600">{currentStep}/7</span>
                {isAutoSaving && (
                  <span className="text-xs text-blue-600 flex items-center gap-1">
                    <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </span>
                )}
              </div>
              
              {/* Step Completion Status */}
              <div className="flex gap-2 text-xs">
                {[1, 2, 3, 4, 5, 6].map(step => (
                  <div key={step} className="flex items-center gap-1">
                    {completedSteps.has(step) ? (
                      <>
                        <span className="text-green-600">✓</span>
                        <span className="text-green-600">Step {step}</span>
                      </>
                    ) : step === currentStep ? (
                      <>
                        <span className="text-blue-600">→</span>
                        <span className="text-blue-600">Step {step}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-gray-400">○</span>
                        <span className="text-gray-400">Step {step}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

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
              
              <div className="flex gap-2">
                <Button 
                  variant="outline"
                  onClick={async () => {
                    try {
                      const currentStepData = getCurrentStepData();
                      await saveStepData(currentStep, currentStepData);
                    } catch (error) {
                      // Error already handled in saveStepData
                    }
                  }}
                  disabled={isAutoSaving}
                  className="flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Save Step
                </Button>
                
                {currentStep < 6 ? (
                  <Button 
                    onClick={nextStep}
                    disabled={isAutoSaving}
                    className="flex items-center gap-2"
                  >
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : currentStep === 6 ? (
                  <Button 
                    onClick={calculateROI}
                    disabled={isAutoSaving}
                    className="flex items-center gap-2"
                  >
                    <Calculator className="h-4 w-4" />
                    Generate ROI Analysis
                  </Button>
                ) : (
                  <Button 
                    onClick={calculateROI}
                    disabled={isAutoSaving}
                    className="flex items-center gap-2"
                  >
                    <Calculator className="h-4 w-4" />
                    Regenerate Report
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      {/* Plant Costs Edit Dialog */}
      <Dialog open={showPlantCostsDialog} onOpenChange={setShowPlantCostsDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Plant Costs</DialogTitle>
            <DialogDescription>
              Edit pricing for different plant capacities. All prices are in USD.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Add New Cost */}
            <div className="border rounded-lg p-4 bg-green-50">
              <div className="flex items-center gap-2 mb-3">
                <Plus className="w-4 h-4 text-green-600" />
                <Label className="font-medium text-green-800">Add New Plant Cost</Label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-sm">Capacity (LPH)</Label>
                  <Input
                    type="number"
                    value={newCost.capacity}
                    onChange={(e) => setNewCost(prev => ({ ...prev, capacity: e.target.value }))}
                    placeholder="e.g., 5000"
                  />
                </div>
                <div>
                  <Label className="text-sm">Price (USD)</Label>
                  <Input
                    type="number"
                    value={newCost.priceUSD}
                    onChange={(e) => setNewCost(prev => ({ ...prev, priceUSD: e.target.value }))}
                    placeholder="e.g., 1200000"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={() => createCostMutation.mutate({
                      capacity: parseInt(newCost.capacity),
                      priceUSD: parseFloat(newCost.priceUSD)
                    })}
                    disabled={!newCost.capacity || !newCost.priceUSD || createCostMutation.isPending}
                    className="w-full"
                  >
                    {createCostMutation.isPending ? 'Adding...' : 'Add Cost'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Existing Costs */}
            <div className="space-y-3">
              {plantCostsLoading ? (
                <div className="text-center py-4">Loading plant costs...</div>
              ) : (
                plantCosts.map((cost: any, index) => (
                  <div key={cost.id || index} className="border rounded-lg p-3 bg-white">
                    <div className="grid grid-cols-4 gap-3 items-center">
                      <div>
                        <Label className="text-sm text-gray-600">Capacity</Label>
                        <div className="font-medium">{cost.capacity.toLocaleString()} LPH</div>
                      </div>
                      <div>
                        <Label className="text-sm text-gray-600">Current Price</Label>
                        <div className="font-medium">${cost.priceUSD.toLocaleString()}</div>
                      </div>
                      {editingCost?.id === cost.id ? (
                        <>
                          <div>
                            <Label className="text-sm">New Price (USD)</Label>
                            <Input
                              type="number"
                              value={editingCost.priceUSD}
                              onChange={(e) => setEditingCost(prev => ({ 
                                ...prev, 
                                priceUSD: e.target.value 
                              }))}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => updateCostMutation.mutate({
                                id: editingCost.id,
                                capacity: editingCost.capacity,
                                priceUSD: parseFloat(editingCost.priceUSD)
                              })}
                              disabled={updateCostMutation.isPending}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingCost(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingCost({
                              id: cost.id,
                              capacity: cost.capacity,
                              priceUSD: cost.priceUSD.toString()
                            })}
                          >
                            <Edit3 className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this plant cost?')) {
                                deleteCostMutation.mutate(cost.id);
                              }
                            }}
                            disabled={deleteCostMutation.isPending}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPlantCostsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load Project Dialog */}
      <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Load Saved ROI Project</DialogTitle>
            <DialogDescription>
              Select from your saved ROI projects or enter a specific Project ID
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Authentication Check and Saved Projects Dropdown */}
            {savedProjects && savedProjects.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="savedProjects">Select from Saved Projects</Label>
                <Select value={selectedProjectFromList} onValueChange={setSelectedProjectFromList}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a saved project..." />
                  </SelectTrigger>
                  <SelectContent>
                    {savedProjects.map((project: any) => (
                      <SelectItem key={project.roiProjectId} value={project.roiProjectId}>
                        <div className="flex flex-col items-start w-full">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {project.customerName || 'Unnamed Customer'} - {project.projectName || 'Unnamed Project'}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {project.completedSteps} steps
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {project.capacity ? `${project.capacity} LPH` : 'No capacity'} • 
                            Last updated: {new Date(project.lastUpdated).toLocaleDateString()}
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {/* Delete buttons for selected projects */}
                {selectedProjectFromList && (
                  <div className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                    <span className="text-sm text-gray-600">Selected project actions:</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const project = savedProjects.find((p: any) => p.roiProjectId === selectedProjectFromList);
                        if (project) {
                          handleDeleteClick(project);
                        }
                      }}
                      className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                      title="Delete Selected Project"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            ) : showLoadDialog ? (
              <div className="p-4 text-center text-gray-500 border border-dashed rounded-lg">
                <p className="text-sm">No saved projects found or authentication required.</p>
                <p className="text-xs mt-1">Please ensure you are logged in to access saved projects.</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-2"
                  onClick={() => window.location.href = '/login'}
                >
                  Go to Login
                </Button>
              </div>
            ) : null}

            {/* Divider */}
            {savedProjects && savedProjects.length > 0 && (
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or</span>
                </div>
              </div>
            )}

            {/* Manual Project ID Input */}
            <div className="space-y-2">
              <Label htmlFor="projectId">Enter Project ID Manually</Label>
              <Input
                id="projectId"
                placeholder="Enter your project ID (e.g., 550e8400-e29b-41d4...)"
                value={loadProjectId}
                onChange={(e) => setLoadProjectId(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Use this if you have a specific Project ID not shown in the list above
              </p>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowLoadDialog(false);
                setLoadProjectId('');
                setSelectedProjectFromList('');
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                const projectToLoad = selectedProjectFromList || loadProjectId;
                if (projectToLoad) {
                  loadProject(projectToLoad);
                }
              }}
              disabled={!selectedProjectFromList && !loadProjectId.trim()}
            >
              Load Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Delete ROI Project
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete this ROI project?
            </DialogDescription>
          </DialogHeader>
          
          {projectToDelete && (
            <div className="space-y-4">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="font-medium text-red-800">{projectToDelete.name}</p>
                <p className="text-sm text-red-600 mt-1">
                  This action cannot be undone. All project data and calculations will be permanently removed.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowDeleteDialog(false);
                setProjectToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => {
                if (projectToDelete) {
                  deleteProject(projectToDelete.id);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}