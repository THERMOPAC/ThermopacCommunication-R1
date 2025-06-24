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
  Wrench
} from 'lucide-react';

// ROI Calculator Data Interface
interface ROIData {
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
  airCompressor: string;
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
  const [showPlantCostsDialog, setShowPlantCostsDialog] = useState(false);
  const [editingCost, setEditingCost] = useState<any>(null);
  const [newCost, setNewCost] = useState({ capacity: '', priceUSD: '' });
  const [plantCosts, setPlantCosts] = useState<Array<{ id: number; capacity: number; priceUSD: number }>>([]);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCapacity, setEditingCapacity] = useState<{ id: number; capacity: number; priceUSD: number } | null>(null);
  const [tankPrices, setTankPrices] = useState<Array<{ id: number; capacity: number; priceUSD: number }>>([]);
  const [isTankPriceDialogOpen, setIsTankPriceDialogOpen] = useState(false);
  const [roiData, setROIData] = useState<ROIData>({
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
    airCompressor: '',
    coolingTower: '',
    dieselGenerator: '',
    qualityControlEquipment: '',
    thermicFluid: '',
    expansionStructure: '',
    craneHireCharges: '',
    laborErectionCommissioning: '',
    feedstockCost: '',
    powerCost: '',
    fuelCost: '',
    chemicalCost: '',
    laborCost: '',
    maintenanceCost: '',
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
      'airCompressor', 'coolingTower', 'dieselGenerator', 'qualityControlEquipment',
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
            fireSuppression: 5.0,       // 5%
            insulation: 2.0,            // 2%
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
            vehicleMaintenance: Math.round(500 * (plantCapacity / 1000)).toString(),
            miscellaneous: Math.round(500 * (plantCapacity / 1000)).toString(),
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

  // Calculate working capital whenever feedstock cost or capacity changes
  const workingCapital = React.useMemo(() => {
    const feedstockCost = parseFloat(roiData.feedstockCost) || 0;
    const capacity = parseFloat(roiData.capacity) || 0;
    return feedstockCost * capacity * 24 * 15;
  }, [roiData.feedstockCost, roiData.capacity]);

  // Calculate working capital interest
  const workingCapitalInterest = React.useMemo(() => {
    const interestRate = parseFloat(roiData.rateOfInterest) || 0;
    return (workingCapital * interestRate) / 100;
  }, [workingCapital, roiData.rateOfInterest]);

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
                            onClick={() => setManageCostsOpen(true)}
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
                            <Label htmlFor="mechanicalElectrical">Mechanical & Electrical Cost</Label>
                            <Input
                              id="mechanicalElectrical"
                              type="number"
                              value={roiData.mechanicalElectrical}
                              onChange={(e) => updateData('mechanicalElectrical', e.target.value)}
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
                        <Label htmlFor="airCompressor">Air Compressor</Label>
                        <Input
                          id="airCompressor"
                          type="number"
                          value={roiData.airCompressor}
                          onChange={(e) => updateData('airCompressor', e.target.value)}
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
                            <th className="border border-gray-300 px-2 py-2 text-center font-medium">Cost per Tank ($)</th>
                            <th className="border border-gray-300 px-2 py-2 text-center font-medium">Total Cost ($)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(roiData.tanks || []).map((tank, index) => (
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
                                ${getTankPrice(tank.suggestedTankSize).toLocaleString()}
                              </td>
                              <td className="border border-gray-300 px-2 py-2 text-center text-sm font-bold text-blue-600">
                                ${(getTankPrice(tank.suggestedTankSize) * tank.suggestedQuantity).toLocaleString()}
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
                            ${roiData.tanks.reduce((total, tank) => total + (getTankPrice(tank.suggestedTankSize) * tank.suggestedQuantity), 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-xs text-blue-700 mt-1">
                          Sum of {roiData.tanks.filter(tank => tank.suggestedQuantity > 0).length} tank configurations
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
                      <h2 className="text-2xl font-bold mb-2">Operating Costs</h2>
                      <p className="text-muted-foreground">Enter monthly operating costs in {roiData.currency}</p>
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
                        <Label>Feedstock Cost per Liter (Monthly) ({getCurrencySymbol(roiData.currency)})</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={roiData.feedstockCost}
                          onChange={(e) => updateData('feedstockCost', e.target.value)}
                          placeholder="e.g., 0.45"
                        />
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
                        <Label>Chemical Cost (Monthly) ({getCurrencySymbol(roiData.currency)})</Label>
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
                        <p className="text-xs text-gray-500">Formula: Feedstock Cost × Plant Capacity × 24 hours × 15 days</p>
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
                              {getCurrencySymbol(roiData.currency)}{workingCapitalInterest.toLocaleString()}
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
                                workingCapitalInterest, // Include working capital interest cost
                                parseFloat(roiData.transportationCost) || 0,
                                parseFloat(roiData.vehicleMaintenanceCost) || 0,
                                parseFloat(roiData.miscellaneousCost) || 0
                              ];
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
                        
                        {/* Total Utilities Cost */}
                        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-green-900">Total Utilities Cost:</span>
                            <span className="text-lg font-bold text-green-900">
                              ${(roiData.utilities || []).reduce((total, utility) => total + utility.totalCost, 0).toLocaleString()}
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
                      <h2 className="text-2xl font-bold mb-2">Revenue & Investment Analysis</h2>
                      <p className="text-muted-foreground">Financial projections and investment analysis in {roiData.currency}</p>
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
                          parseFloat(roiData.miscellaneousCost) || 0
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
                                  parseFloat(roiData.mechanicalElectrical) || 0,
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
                                const tankCosts = (roiData.tanks || []).reduce((total, tank) => total + tank.totalCost, 0);
                                const utilityCosts = (roiData.utilities || []).reduce((total, utility) => total + utility.totalCost, 0);
                                
                                const totalInvestment = baseCost + additionalCosts + equipmentCosts + tankCosts + utilityCosts;
                                return totalInvestment.toLocaleString();
                              })()}
                              readOnly
                              className="bg-gray-50 font-semibold text-center"
                            />
                            <p className="text-xs text-gray-500">Auto-calculated from all project components</p>
                          </div>

                          <div className="space-y-2">
                            <Label>Working Capital Requirement ({getCurrencySymbol(roiData.currency)})</Label>
                            <Input
                              type="number"
                              value={roiData.workingCapitalRequirement}
                              onChange={(e) => updateData('workingCapitalRequirement', e.target.value)}
                              placeholder="e.g., 500000"
                            />
                            <p className="text-xs text-gray-500">Additional funds needed for day-to-day operations</p>
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
                                  max="100"
                                  value={roiData.equityPercentage}
                                  onChange={(e) => updateData('equityPercentage', e.target.value)}
                                  placeholder="e.g., 30"
                                  className="bg-blue-50"
                                />
                              </div>
                              <div>
                                <Label className="text-sm">Debt (%) *</Label>
                                <Input
                                  type="number"
                                  max="100"
                                  value={roiData.debtPercentage}
                                  onChange={(e) => updateData('debtPercentage', e.target.value)}
                                  placeholder="e.g., 70"
                                  className="bg-red-50"
                                />
                              </div>
                            </div>
                            <p className="text-xs text-gray-500">Must total 100%</p>
                          </div>

                          <div className="space-y-2">
                            <Label>Interest Rate on Debt (% annual)</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={roiData.interestRate}
                              onChange={(e) => updateData('interestRate', e.target.value)}
                              placeholder="e.g., 12.5"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Validation Messages */}
                    {(() => {
                      const equity = parseFloat(roiData.equityPercentage) || 0;
                      const debt = parseFloat(roiData.debtPercentage) || 0;
                      const total = equity + debt;
                      
                      if (Math.abs(total - 100) > 0.1) {
                        return (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
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

                {/* Step 7: ROI Results */}
                {currentStep === 7 && (
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
    </Layout>
  );
}