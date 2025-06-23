import Layout from '@/components/layout';
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
  Clock,
  MoreHorizontal,
  Info,
  Eye
} from 'lucide-react';

export default function MarketingToolsPage() {
  const categories = [
    {
      name: "Analytics",
      tools: [
        {
          title: "ROI Calculator",
          description: "Calculate return on investment for marketing campaigns and initiatives",
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
    <Layout>
      <div className="p-6 space-y-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Marketing Tools</h1>
          <p className="text-muted-foreground">
            Comprehensive marketing tools to enhance your campaigns and analyze performance
          </p>
        </div>

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
      </div>
    </Layout>
  );
}