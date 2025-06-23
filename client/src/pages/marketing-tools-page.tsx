import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Clock
} from 'lucide-react';

export default function MarketingToolsPage() {
  const marketingTools = [
    {
      id: 1,
      title: "ROI Calculator",
      description: "Calculate return on investment for marketing campaigns and initiatives",
      icon: Calculator,
      category: "Analytics",
      status: "Available",
      action: "Launch Tool"
    },
    {
      id: 2,
      title: "Campaign Performance Analyzer",
      description: "Analyze and compare performance metrics across different marketing campaigns",
      icon: BarChart3,
      category: "Analytics",
      status: "Available",
      action: "View Analysis"
    },
    {
      id: 3,
      title: "Lead Scoring Engine",
      description: "Automatically score and rank leads based on engagement and criteria",
      icon: Target,
      category: "Lead Management",
      status: "Available",
      action: "Configure Scoring"
    },
    {
      id: 4,
      title: "Email Campaign Builder",
      description: "Create and design professional email marketing campaigns",
      icon: Mail,
      category: "Communication",
      status: "Coming Soon",
      action: "Preview"
    },
    {
      id: 5,
      title: "Market Trend Analyzer",
      description: "Track and analyze market trends and industry insights",
      icon: TrendingUp,
      category: "Research",
      status: "Available",
      action: "View Trends"
    },
    {
      id: 6,
      title: "Customer Segmentation",
      description: "Segment customers based on behavior, demographics, and preferences",
      icon: Users,
      category: "Customer Analysis",
      status: "Available",
      action: "Create Segments"
    },
    {
      id: 7,
      title: "Conversion Funnel Optimizer",
      description: "Analyze and optimize customer conversion funnels",
      icon: Zap,
      category: "Optimization",
      status: "Beta",
      action: "Try Beta"
    },
    {
      id: 8,
      title: "Content Performance Tracker",
      description: "Track performance of marketing content across different channels",
      icon: FileText,
      category: "Content Marketing",
      status: "Available",
      action: "View Reports"
    },
    {
      id: 9,
      title: "Social Media Analytics",
      description: "Monitor and analyze social media engagement and reach",
      icon: Globe,
      category: "Social Media",
      status: "Coming Soon",
      action: "Preview"
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Available":
        return "bg-green-100 text-green-800 hover:bg-green-200";
      case "Beta":
        return "bg-yellow-100 text-yellow-800 hover:bg-yellow-200";
      case "Coming Soon":
        return "bg-gray-100 text-gray-800 hover:bg-gray-200";
      default:
        return "bg-gray-100 text-gray-800 hover:bg-gray-200";
    }
  };

  const getCategoryColor = (category: string) => {
    const colors = {
      "Analytics": "bg-blue-50 text-blue-700 border-blue-200",
      "Lead Management": "bg-purple-50 text-purple-700 border-purple-200",
      "Communication": "bg-green-50 text-green-700 border-green-200",
      "Research": "bg-orange-50 text-orange-700 border-orange-200",
      "Customer Analysis": "bg-pink-50 text-pink-700 border-pink-200",
      "Optimization": "bg-red-50 text-red-700 border-red-200",
      "Content Marketing": "bg-indigo-50 text-indigo-700 border-indigo-200",
      "Social Media": "bg-cyan-50 text-cyan-700 border-cyan-200"
    };
    return colors[category as keyof typeof colors] || "bg-gray-50 text-gray-700 border-gray-200";
  };

  const handleToolAction = (tool: any) => {
    if (tool.status === "Coming Soon") {
      alert(`${tool.title} is coming soon! Stay tuned for updates.`);
    } else if (tool.status === "Beta") {
      alert(`${tool.title} is in beta. Some features may be limited.`);
    } else {
      alert(`Launching ${tool.title}...`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Marketing Tools</h1>
          <p className="text-muted-foreground mt-2">
            Comprehensive marketing tools to enhance your campaigns and analyze performance
          </p>
        </div>
      </div>

      {/* Tools Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {marketingTools.map((tool) => {
          const IconComponent = tool.icon;
          return (
            <Card key={tool.id} className="hover:shadow-lg transition-shadow duration-200">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <IconComponent className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{tool.title}</CardTitle>
                    </div>
                  </div>
                  <Badge className={getStatusColor(tool.status)} variant="secondary">
                    {tool.status}
                  </Badge>
                </div>
                <CardDescription className="text-sm leading-relaxed">
                  {tool.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between">
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${getCategoryColor(tool.category)}`}
                  >
                    {tool.category}
                  </Badge>
                  <Button 
                    variant={tool.status === "Available" ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleToolAction(tool)}
                    disabled={tool.status === "Coming Soon"}
                  >
                    {tool.action}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <PieChart className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">9</p>
                <p className="text-sm text-muted-foreground">Total Tools</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Target className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">6</p>
                <p className="text-sm text-muted-foreground">Available</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Zap className="h-8 w-8 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold">1</p>
                <p className="text-sm text-muted-foreground">Beta</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Clock className="h-8 w-8 text-gray-600" />
              <div>
                <p className="text-2xl font-bold">2</p>
                <p className="text-sm text-muted-foreground">Coming Soon</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}