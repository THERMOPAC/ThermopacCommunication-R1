import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { 
  Play, 
  Plus, 
  Settings, 
  TrendingUp, 
  Clock, 
  Star,
  Brain,
  Zap,
  BarChart3,
  Eye,
  Edit,
  Trash2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface LLMPrompt {
  id: number;
  name: string;
  description: string;
  template: string;
  category: string;
  model: string;
  frequency: string;
  active: boolean;
  priority: number;
  avg_rating?: number;
  total_executions?: number;
  last_executed?: string;
  created_at: string;
  created_by_name?: string;
}

interface BusinessInsight {
  id: number;
  title: string;
  insight_text: string;
  category: string;
  priority: number;
  generated_at: string;
  prompt_name: string;
  model_used: string;
}

interface DashboardStats {
  prompts: Array<{ category: string; active: boolean; count: string }>;
  executions: Array<{ status: string; count: string; avg_duration: string; total_cost: string }>;
  insights: Array<{ category: string; count: string }>;
  models: Array<{ model_used: string; executions: string; avg_duration: string; total_cost: string }>;
}

export default function LLMPromptEnginePage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<LLMPrompt | null>(null);
  const [executingPrompts, setExecutingPrompts] = useState<Set<number>>(new Set());
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch prompts
  const { data: promptsData, isLoading: promptsLoading } = useQuery({
    queryKey: ['/api/llm/prompts', { category: selectedCategory === 'all' ? undefined : selectedCategory }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory !== 'all') {
        params.append('category', selectedCategory);
      }
      params.append('active', 'true');
      
      const response = await fetch(`/api/llm/prompts?${params}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch prompts');
      return response.json();
    }
  });

  // Fetch insights
  const { data: insights, isLoading: insightsLoading } = useQuery({
    queryKey: ['/api/llm/insights', { category: selectedCategory === 'all' ? undefined : selectedCategory, limit: 10 }],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '10' });
      if (selectedCategory !== 'all') {
        params.append('category', selectedCategory);
      }
      
      const response = await fetch(`/api/llm/insights?${params}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch insights');
      return response.json();
    }
  });

  // Fetch dashboard stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/llm/dashboard/stats'],
    queryFn: async () => {
      const response = await fetch('/api/llm/dashboard/stats', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch dashboard stats');
      return response.json();
    }
  });

  // Execute prompt mutation
  const executePromptMutation = useMutation({
    mutationFn: async (promptId: number) => {
      const response = await fetch(`/api/llm/prompts/${promptId}/execute`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to execute prompt');
      return response.json();
    },
    onSuccess: (_, promptId) => {
      toast({
        title: "Prompt Executed",
        description: "The prompt has been executed successfully.",
      });
      setExecutingPrompts(prev => {
        const newSet = new Set(prev);
        newSet.delete(promptId);
        return newSet;
      });
      queryClient.invalidateQueries({ queryKey: ['/api/llm/insights'] });
      queryClient.invalidateQueries({ queryKey: ['/api/llm/prompts'] });
    },
    onError: (error, promptId) => {
      toast({
        title: "Execution Failed",
        description: error.message,
        variant: "destructive",
      });
      setExecutingPrompts(prev => {
        const newSet = new Set(prev);
        newSet.delete(promptId);
        return newSet;
      });
    }
  });

  // Trigger scheduled execution
  const triggerScheduledMutation = useMutation({
    mutationFn: async (frequency: string) => {
      const response = await fetch(`/api/llm/scheduler/trigger/${frequency}`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to trigger scheduler');
      return response.json();
    },
    onSuccess: (_, frequency) => {
      toast({
        title: "Scheduler Triggered",
        description: `${frequency} prompts have been triggered successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/llm/insights'] });
      queryClient.invalidateQueries({ queryKey: ['/api/llm/prompts'] });
    },
    onError: (error) => {
      toast({
        title: "Scheduler Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleExecutePrompt = (promptId: number) => {
    setExecutingPrompts(prev => new Set(prev.add(promptId)));
    executePromptMutation.mutate(promptId);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getPriorityColor = (priority: number) => {
    if (priority >= 8) return 'text-red-600 bg-red-50';
    if (priority >= 6) return 'text-orange-600 bg-orange-50';
    if (priority >= 4) return 'text-blue-600 bg-blue-50';
    return 'text-gray-600 bg-gray-50';
  };

  const formatCurrency = (amount: string | number) => {
    return `$${parseFloat(amount.toString()).toFixed(4)}`;
  };

  const categories = [
    { value: 'all', label: 'All Categories' },
    { value: 'projects', label: 'Projects' },
    { value: 'quality', label: 'Quality' },
    { value: 'finance', label: 'Finance' },
    { value: 'hr', label: 'HR' },
    { value: 'procurement', label: 'Procurement' },
    { value: 'system', label: 'System' }
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Brain className="w-8 h-8 text-blue-600" />
            LLM Prompt Engine
          </h1>
          <p className="text-gray-600 mt-1">
            Automated business intelligence generation using AI prompts
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map(cat => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button 
            onClick={() => triggerScheduledMutation.mutate('daily')}
            disabled={triggerScheduledMutation.isPending}
            variant="outline"
          >
            {triggerScheduledMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Run Daily
          </Button>
          
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Prompt
          </Button>
        </div>
      </div>

      {/* Dashboard Stats */}
      {!statsLoading && stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Prompts</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.prompts.filter((p: any) => p.active).reduce((sum: number, p: any) => sum + parseInt(p.count), 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                Across {stats.prompts.length} categories
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Executions Today</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.executions.reduce((sum: number, e: any) => sum + parseInt(e.count), 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.executions.filter((e: any) => e.status === 'success').length > 0 && 
                  `${Math.round((parseInt(stats.executions.find((e: any) => e.status === 'success')?.count || '0') / stats.executions.reduce((sum: number, e: any) => sum + parseInt(e.count), 1)) * 100)}% success rate`
                }
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(stats.executions.reduce((sum: number, e: any) => sum + parseFloat(e.total_cost || '0'), 0))}
              </div>
              <p className="text-xs text-muted-foreground">
                This month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Insights Generated</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.insights.reduce((sum: number, i: any) => sum + parseInt(i.count), 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                Last 30 days
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="prompts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
          <TabsTrigger value="insights">Generated Insights</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Prompts Tab */}
        <TabsContent value="prompts" className="space-y-4">
          {promptsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {promptsData?.prompts?.map((prompt: LLMPrompt) => (
                <Card key={prompt.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-base">{prompt.name}</CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {prompt.category}
                          </Badge>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${getPriorityColor(prompt.priority)}`}
                          >
                            Priority {prompt.priority}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {prompt.avg_rating && (
                          <div className="flex items-center text-sm text-yellow-600">
                            <Star className="w-3 h-3 fill-current" />
                            <span className="ml-1">{prompt.avg_rating.toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-3">
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {prompt.description}
                    </p>
                    
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Model: {prompt.model}</span>
                      <span>Frequency: {prompt.frequency}</span>
                    </div>
                    
                    {prompt.total_executions && (
                      <div className="text-xs text-gray-500">
                        {prompt.total_executions} executions
                        {prompt.last_executed && (
                          <span className="ml-2">
                            Last: {new Date(prompt.last_executed).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        size="sm"
                        onClick={() => handleExecutePrompt(prompt.id)}
                        disabled={executingPrompts.has(prompt.id)}
                      >
                        {executingPrompts.has(prompt.id) ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                          <Play className="w-3 h-3 mr-1" />
                        )}
                        Execute
                      </Button>
                      
                      <Button size="sm" variant="outline">
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      
                      <Button size="sm" variant="outline">
                        <Eye className="w-3 h-3 mr-1" />
                        View
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Insights Tab */}
        <TabsContent value="insights" className="space-y-4">
          {insightsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {insights?.map((insight: BusinessInsight) => (
                <Card key={insight.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg">{insight.title}</CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{insight.category}</Badge>
                          <Badge variant="outline">
                            Priority {insight.priority}
                          </Badge>
                          <span className="text-sm text-gray-500">
                            {insight.prompt_name} • {insight.model_used}
                          </span>
                        </div>
                      </div>
                      <span className="text-sm text-gray-500">
                        {new Date(insight.generated_at).toLocaleString()}
                      </span>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <div className="prose prose-sm max-w-none">
                      <pre className="whitespace-pre-wrap text-sm">
                        {insight.insight_text}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Model Performance */}
            {stats?.models && (
              <Card>
                <CardHeader>
                  <CardTitle>Model Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {stats.models.map((model: any) => (
                      <div key={model.model_used} className="flex items-center justify-between p-3 border rounded">
                        <div>
                          <div className="font-medium">{model.model_used}</div>
                          <div className="text-sm text-gray-500">
                            {model.executions} executions
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">
                            {Math.round(parseFloat(model.avg_duration))}ms avg
                          </div>
                          <div className="text-sm text-gray-500">
                            {formatCurrency(model.total_cost)} total
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Category Distribution */}
            {stats?.insights && (
              <Card>
                <CardHeader>
                  <CardTitle>Insights by Category</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {stats.insights.map((category: any) => (
                      <div key={category.category} className="flex items-center justify-between p-3 border rounded">
                        <div className="font-medium capitalize">
                          {category.category}
                        </div>
                        <div className="text-lg font-bold">
                          {category.count}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}