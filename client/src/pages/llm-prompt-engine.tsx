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
  Loader2,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  RefreshCw,
  Target,
  Lightbulb,
  TestTube
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
  execution_id?: number;
  user_feedback?: {
    rating: number;
    feedback_type: 'useful' | 'needs_action' | 'too_long' | 'irrelevant';
    feedback_text?: string;
    action_taken?: boolean;
  };
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
  const [testingPrompts, setTestingPrompts] = useState<Set<number>>(new Set());
  const [optimizingPrompts, setOptimizingPrompts] = useState<Set<number>>(new Set());
  const [testResults, setTestResults] = useState<any>(null);
  const [optimizationResults, setOptimizationResults] = useState<any>(null);
  
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

  // Feedback submission mutation
  const feedbackMutation = useMutation({
    mutationFn: async ({ executionId, rating, feedback_type, feedback_text }: {
      executionId: number;
      rating: number;
      feedback_type: string;
      feedback_text?: string;
    }) => {
      const response = await fetch(`/api/llm/executions/${executionId}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          rating,
          feedback_type,
          feedback_text,
          action_taken: false
        })
      });
      if (!response.ok) throw new Error('Failed to submit feedback');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Feedback Submitted",
        description: "Thank you for your feedback! This will help improve our AI insights.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/llm/insights'] });
    },
    onError: (error) => {
      toast({
        title: "Feedback Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleFeedback = (insight: BusinessInsight, feedbackType: string, rating: number) => {
    if (!insight.execution_id) {
      toast({
        title: "Cannot Submit Feedback",
        description: "This insight doesn't have an associated execution ID.",
        variant: "destructive",
      });
      return;
    }

    feedbackMutation.mutate({
      executionId: insight.execution_id,
      rating,
      feedback_type: feedbackType,
      feedback_text: `User feedback: ${feedbackType}`
    });
  };

  // A/B Test mutation
  const abTestMutation = useMutation({
    mutationFn: async (promptId: number) => {
      const response = await fetch(`/api/llm/prompts/${promptId}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          models: ['gpt-4o', 'claude-sonnet-4-20250514']
        })
      });
      if (!response.ok) throw new Error('Failed to run A/B test');
      return response.json();
    },
    onSuccess: (data) => {
      setTestResults(data);
      toast({
        title: "A/B Test Complete",
        description: `Compared ${data.test_results.length} models successfully.`,
      });
    },
    onError: (error) => {
      toast({
        title: "A/B Test Failed",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: (data, error, promptId) => {
      setTestingPrompts(prev => {
        const newSet = new Set(prev);
        newSet.delete(promptId);
        return newSet;
      });
    }
  });

  // Optimization mutation
  const optimizationMutation = useMutation({
    mutationFn: async (promptId: number) => {
      const response = await fetch(`/api/llm/prompts/${promptId}/optimize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to optimize prompt');
      return response.json();
    },
    onSuccess: (data) => {
      setOptimizationResults(data);
      toast({
        title: "Prompt Optimization Complete",
        description: "AI has analyzed and suggested improvements for your prompt.",
      });
    },
    onError: (error) => {
      toast({
        title: "Optimization Failed",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: (data, error, promptId) => {
      setOptimizingPrompts(prev => {
        const newSet = new Set(prev);
        newSet.delete(promptId);
        return newSet;
      });
    }
  });

  const handleABTest = (promptId: number) => {
    setTestingPrompts(prev => new Set(prev.add(promptId)));
    abTestMutation.mutate(promptId);
  };

  const handleOptimizePrompt = (promptId: number) => {
    setOptimizingPrompts(prev => new Set(prev.add(promptId)));
    optimizationMutation.mutate(promptId);
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

  const formatCurrency = (amount: string | number | null | undefined) => {
    if (!amount && amount !== 0) return '$0.0000';
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
                      
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleABTest(prompt.id)}
                        disabled={testingPrompts.has(prompt.id)}
                      >
                        {testingPrompts.has(prompt.id) ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                          <TestTube className="w-3 h-3 mr-1" />
                        )}
                        A/B Test
                      </Button>
                      
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleOptimizePrompt(prompt.id)}
                        disabled={optimizingPrompts.has(prompt.id)}
                      >
                        {optimizingPrompts.has(prompt.id) ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                          <Lightbulb className="w-3 h-3 mr-1 text-yellow-600" />
                        )}
                        Optimize
                      </Button>
                      
                      <Button size="sm" variant="outline">
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
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
                    
                    {/* User Feedback Section */}
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-600">Was this insight helpful?</div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-3"
                            onClick={() => handleFeedback(insight, 'useful', 5)}
                          >
                            <ThumbsUp className="w-3 h-3 mr-1" />
                            Useful
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-3"
                            onClick={() => handleFeedback(insight, 'needs_action', 3)}
                          >
                            <Target className="w-3 h-3 mr-1" />
                            Needs Action
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-3"
                            onClick={() => handleFeedback(insight, 'too_long', 2)}
                          >
                            <MessageSquare className="w-3 h-3 mr-1" />
                            Too Long
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-3"
                            onClick={() => handleFeedback(insight, 'irrelevant', 1)}
                          >
                            <ThumbsDown className="w-3 h-3 mr-1" />
                            Not Useful
                          </Button>
                        </div>
                      </div>
                      {insight.user_feedback && (
                        <div className="mt-2 text-sm text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Thank you for your feedback! ({insight.user_feedback.feedback_type})
                        </div>
                      )}
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
        
        {/* A/B Test Results Dialog */}
        <Dialog open={!!testResults} onOpenChange={() => setTestResults(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TestTube className="w-5 h-5 text-blue-600" />
                A/B Test Results
              </DialogTitle>
            </DialogHeader>
            
            {testResults && (
              <div className="space-y-4">
                <div className="text-sm text-gray-600">
                  Tested Prompt ID: {testResults.prompt_id} | 
                  Generated: {new Date(testResults.timestamp).toLocaleString()}
                </div>
                
                <div className="grid gap-4">
                  {testResults.test_results?.map((result: any, index: number) => (
                    <Card key={index} className={`border-l-4 ${
                      result.success ? 'border-l-green-500' : 'border-l-red-500'
                    }`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg flex items-center gap-2">
                            {result.model}
                            {result.success ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-600" />
                            )}
                          </CardTitle>
                          {result.success && (
                            <div className="flex gap-2 text-sm text-gray-600">
                              <Badge variant="outline">{result.execution_time}ms</Badge>
                              <Badge variant="outline">${result.cost?.toFixed(4)}</Badge>
                              <Badge variant="outline">
                                {result.tokens?.input}→{result.tokens?.output} tokens
                              </Badge>
                            </div>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        {result.success ? (
                          <div className="prose max-w-none">
                            <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded">
                              {result.result}
                            </pre>
                          </div>
                        ) : (
                          <div className="text-red-600 bg-red-50 p-3 rounded">
                            <strong>Error:</strong> {result.error}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Optimization Results Dialog */}
        <Dialog open={!!optimizationResults} onOpenChange={() => setOptimizationResults(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-yellow-600" />
                Prompt Optimization Results
              </DialogTitle>
            </DialogHeader>
            
            {optimizationResults && (
              <div className="space-y-6">
                <div className="text-sm text-gray-600">
                  Generated: {new Date(optimizationResults.timestamp).toLocaleString()}
                </div>

                {/* Current Prompt */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Current Prompt</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div>
                        <strong>Template:</strong>
                        <pre className="mt-1 text-sm bg-gray-50 p-3 rounded whitespace-pre-wrap">
                          {optimizationResults.original_prompt?.template}
                        </pre>
                      </div>
                      <div>
                        <strong>Description:</strong> {optimizationResults.original_prompt?.description}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* AI Suggestions */}
                <Card className="border-l-4 border-l-blue-500">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Brain className="w-5 h-5 text-blue-600" />
                      AI Optimization Suggestions
                      <Badge variant="secondary">
                        Confidence: {optimizationResults.optimization_suggestions?.confidence_score}/10
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <strong>Improved Template:</strong>
                      <pre className="mt-1 text-sm bg-blue-50 p-3 rounded whitespace-pre-wrap border-l-4 border-l-blue-500">
                        {optimizationResults.optimization_suggestions?.improved_template}
                      </pre>
                    </div>

                    <div>
                      <strong>Changes Made:</strong>
                      <ul className="mt-1 list-disc list-inside space-y-1">
                        {optimizationResults.optimization_suggestions?.changes_made?.map((change: string, index: number) => (
                          <li key={index} className="text-sm">{change}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <strong>Expected Benefits:</strong>
                      <ul className="mt-1 list-disc list-inside space-y-1">
                        {optimizationResults.optimization_suggestions?.expected_benefits?.map((benefit: string, index: number) => (
                          <li key={index} className="text-sm text-green-700">{benefit}</li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </Tabs>
    </div>
  );
}