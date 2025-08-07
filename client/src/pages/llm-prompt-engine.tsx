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
  SelectGroup,
  SelectLabel,
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
  TestTube,
  Shield,
  Lock,
  EyeOff,
  Database,
  Activity,
  CheckSquare,
  Download,
  ListChecks,
  Calendar,
  User,
  Users,
  ArrowRight
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { roles, roleHierarchy } from '@shared/roles';

interface LLMPrompt {
  id: number;
  name: string;
  description: string;
  template: string;
  category: string;
  model: string;
  frequency: string;
  dataQuery?: string;
  active: boolean;
  priority: number;
  temperature?: number;
  dataQuery?: string;
  avg_rating?: number;
  total_executions?: number;
  last_executed?: string;
  created_at: string;
  created_by_name?: string;
}

interface ModuleGroup {
  category: string;
  prompt_count: number;
  prompts: LLMPrompt[];
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

interface GeneratedTask {
  id?: string;
  title: string;
  description: string;
  priority: 'Low' | 'Medium' | 'High';
  category: string;
  assignedTo?: number;
  dueDate?: string;
  estimatedDays?: number;
}

interface User {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  role: string;
  department?: string;
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
  const [testMode, setTestMode] = useState(false);
  const [showSecurityLogs, setShowSecurityLogs] = useState(false);
  
  // Task generation states
  const [isTaskGenerationDialogOpen, setIsTaskGenerationDialogOpen] = useState(false);
  const [taskGenerationDays, setTaskGenerationDays] = useState<number>(7);
  const [taskGenerationAssignee, setTaskGenerationAssignee] = useState<number | null>(null);
  const [generatedTasks, setGeneratedTasks] = useState<GeneratedTask[]>([]);
  const [isGeneratingTasks, setIsGeneratingTasks] = useState(false);
  const [selectedInsight, setSelectedInsight] = useState<BusinessInsight | null>(null);
  const [isTaskPreviewOpen, setIsTaskPreviewOpen] = useState(false);
  const [isCreatingTasks, setIsCreatingTasks] = useState(false);
  const [globalAssignee, setGlobalAssignee] = useState<number | null>(null);
  const [taskGenerationValidationErrors, setTaskGenerationValidationErrors] = useState<{ assignee?: string; days?: string }>({});
  
  // Edit form state
  const [editFormData, setEditFormData] = useState({
    name: '',
    category: '',
    description: '',
    model: '',
    frequency: '',
    priority: 5,
    temperature: 0.7,
    template: '',
    data_query: ''
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch prompts grouped by modules
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
      const data = await response.json();
      
      return data;
    }
  });

  // Fetch prompts organized by modules
  const { data: moduleGroupsData, isLoading: moduleGroupsLoading } = useQuery({
    queryKey: ['/api/llm/prompts/by-modules', { category: selectedCategory === 'all' ? undefined : selectedCategory }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory !== 'all') {
        params.append('category', selectedCategory);
      }
      
      const response = await fetch(`/api/llm/prompts/by-modules?${params}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch module groups');
      return response.json();
    }
  });

  // Fetch all users for task assignment
  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Group users by role for the task assignment dropdown
  const groupedUsers = roles
    .sort((a, b) => roleHierarchy[a] - roleHierarchy[b])
    .reduce((acc, role) => {
      const usersInRole = allUsers.filter(u => u.role === role);
      if (usersInRole.length > 0) {
        // Sort alphabetically within each group
        usersInRole.sort((a, b) => {
          const nameA = a.firstName && a.lastName ? `${a.firstName} ${a.lastName}` : a.username;
          const nameB = b.firstName && b.lastName ? `${b.firstName} ${b.lastName}` : b.username;
          return nameA.localeCompare(nameB);
        });
        acc[role] = usersInRole;
      }
      return acc;
    }, {} as Record<string, User[]>);

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

  // Fetch users for task assignment
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['/api/users'],
    queryFn: async () => {
      const response = await fetch('/api/users', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch users');
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

  // Update prompt mutation
  const updatePromptMutation = useMutation({
    mutationFn: async (data: { id: number; promptData: any }) => {
      const response = await fetch(`/api/llm/prompts/${data.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data.promptData)
      });
      if (!response.ok) throw new Error('Failed to update prompt');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Prompt Updated Successfully",
        description: "Your changes have been saved.",
      });
      setIsEditDialogOpen(false);
      // Invalidate queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['/api/llm/prompts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/llm/prompts/by-modules'] });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
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

  const handleEditPrompt = (prompt: LLMPrompt) => {
    console.log('=== EDIT PROMPT DEBUG ===');
    console.log('Prompt ID:', prompt.id);
    console.log('Prompt name:', prompt.name);
    console.log('Full prompt object:', prompt);
    console.log('All prompt keys:', Object.keys(prompt));
    console.log('prompt.dataQuery value:', prompt.dataQuery);
    console.log('prompt.dataQuery type:', typeof prompt.dataQuery);
    console.log('prompt.dataQuery length:', prompt.dataQuery?.length);
    console.log('prompt.dataQuery === null:', prompt.dataQuery === null);
    console.log('prompt.dataQuery === undefined:', prompt.dataQuery === undefined);
    console.log('prompt.dataQuery === "":', prompt.dataQuery === "");
    
    setEditingPrompt(prompt);
    
    const formData = {
      name: prompt.name,
      category: prompt.category,
      description: prompt.description || '',
      model: prompt.model,
      frequency: prompt.frequency,
      priority: prompt.priority,
      temperature: prompt.temperature || 0.7,
      template: prompt.template,
      data_query: prompt.dataQuery || ''
    };
    
    console.log('Form data being set:', formData);
    console.log('Form data_query value:', formData.data_query);
    console.log('Form data_query type:', typeof formData.data_query);
    console.log('Form data_query length:', formData.data_query.length);
    console.log('=== END DEBUG ===');
    
    setEditFormData(formData);
    setIsEditDialogOpen(true);
  };

  const handleSavePrompt = () => {
    if (!editingPrompt) return;
    
    updatePromptMutation.mutate({
      id: editingPrompt.id,
      promptData: {
        name: editFormData.name,
        description: editFormData.description,
        template: editFormData.template,
        category: editFormData.category,
        model: editFormData.model,
        frequency: editFormData.frequency,
        priority: editFormData.priority,
        temperature: editFormData.temperature,
        data_query: editFormData.data_query,
        active: true
      }
    });
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
    { value: 'task_management', label: 'Task Management' },
    { value: 'meetings', label: 'Meetings & Commitments' },
    { value: 'sap_integration', label: 'SAP B1 Integration' },
    { value: 'administration', label: 'Administration' },
    { value: 'finance', label: 'Finance' },
    { value: 'sales_marketing', label: 'Sales & Marketing' },
    { value: 'projects', label: 'Project Management' },
    { value: 'design_management', label: 'Design Management' },
    { value: 'procurement', label: 'Procurement' },
    { value: 'production', label: 'Production' },
    { value: 'quality', label: 'Quality Management' },
    { value: 'commissioning', label: 'Project Commissioning' },
    { value: 'dispatch_shipping', label: 'Dispatch & Shipping' },
    { value: 'after_sales', label: 'After-Sales' },
    { value: 'hr', label: 'HR Management' },
    { value: 'system', label: 'System Administration' }
  ];

  const getModuleDisplayName = (category: string) => {
    const categoryMap: Record<string, string> = {
      'meetings': 'Meetings & Commitments',
      'sap_integration': 'SAP B1 Integration',
      'administration': 'Administration',
      'finance': 'Finance',
      'sales_marketing': 'Sales & Marketing',
      'projects': 'Project Management',
      'task_management': 'Task Management',
      'design_management': 'Design Management',
      'procurement': 'Procurement Management',
      'production': 'Production Management',
      'quality': 'Quality Management',
      'commissioning': 'Project Commissioning',
      'dispatch_shipping': 'Dispatch & Shipping',
      'after_sales': 'After-Sales',
      'hr': 'HR Management',
      'system': 'System Administration'
    };
    return categoryMap[category] || category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getModuleIcon = (category: string) => {
    const iconMap: Record<string, any> = {
      'meetings': MessageSquare,
      'sap_integration': Settings,
      'administration': Settings,
      'finance': TrendingUp,
      'sales_marketing': Target,
      'projects': BarChart3,
      'task_management': CheckSquare,
      'design_management': Lightbulb,
      'procurement': Plus,
      'production': Settings,
      'quality': CheckCircle,
      'commissioning': Star,
      'dispatch_shipping': RefreshCw,
      'after_sales': ThumbsUp,
      'hr': Clock,
      'system': Settings
    };
    return iconMap[category] || Brain;
  };

  // Security Dashboard Component
  const SecurityDashboard = ({ testMode }: { testMode: boolean }) => {
    const { data: securityLogs, isLoading } = useQuery({
      queryKey: ['/api/llm/security-logs'],
      queryFn: async () => {
        const response = await fetch('/api/llm/security-logs', {
          credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to fetch security logs');
        return response.json();
      }
    });

    return (
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              <CardTitle>Security Dashboard</CardTitle>
              {testMode && (
                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
                  <TestTube className="w-3 h-3 mr-1" />
                  Test Mode Active
                </Badge>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSecurityLogs(false)}
            >
              <EyeOff className="w-4 h-4 mr-1" />
              Hide
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Lock className="w-4 h-4 text-green-600" />
                    Data Masking
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-bold text-green-600">
                    {securityLogs?.masking?.applied || 0}
                  </div>
                  <p className="text-xs text-gray-500">Rules applied today</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Database className="w-4 h-4 text-blue-600" />
                    Audit Logs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-bold text-blue-600">
                    {securityLogs?.audit?.total || 0}
                  </div>
                  <p className="text-xs text-gray-500">Total executions logged</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="w-4 h-4 text-purple-600" />
                    Model Routing
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-bold text-purple-600">
                    {securityLogs?.routing?.optimized || 0}
                  </div>
                  <p className="text-xs text-gray-500">Intelligent routes today</p>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // Test execution handler
  const handleTestExecution = async (promptId: number) => {
    try {
      setExecutingPrompts(prev => new Set(prev).add(promptId));
      
      const response = await fetch(`/api/llm/prompts/${promptId}/test-execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ testMode: true })
      });
      
      if (!response.ok) {
        throw new Error('Test execution failed');
      }

      toast({
        title: "Test Execution Completed",
        description: "Prompt executed in test mode with security monitoring.",
      });

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/llm/prompts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/llm/security-logs'] });
      
    } catch (error) {
      toast({
        title: "Test Execution Failed",
        description: error instanceof Error ? error.message : "An error occurred during test execution.",
        variant: "destructive",
      });
    } finally {
      setExecutingPrompts(prev => {
        const newSet = new Set(prev);
        newSet.delete(promptId);
        return newSet;
      });
    }
  };

  // Task generation functions
  const parseInsightToTasks = (insight: BusinessInsight): GeneratedTask[] => {
    const text = insight.insight_text;
    const tasks: GeneratedTask[] = [];
    
    // Enhanced pattern to match detailed invoice breakdown format with SAP numbers
    const invoiceDetailPattern = /(\d+)\.\s*\*\*Invoice\s+(INV-[^*]+)\*\*\s*(?:\([^)]*SAP:[^)]*\))?\s*[-–]\s*([^\n]+?)(?:\n|\r|\s*[-–]?\s*Total Amount:)/gi;
    
    let detailMatch;
    while ((detailMatch = invoiceDetailPattern.exec(text)) !== null) {
      const invoiceNumber = detailMatch[2].trim();
      const customerName = detailMatch[3].trim();
      
      // Look for details in the following lines after this match
      const afterInvoice = text.substring(detailMatch.index + detailMatch[0].length, detailMatch.index + 800);
      const totalAmountMatch = afterInvoice.match(/Total Amount:\s*USD\s*([\d,]+(?:\.\d{1,2})?)/i);
      const outstandingMatch = afterInvoice.match(/Outstanding:\s*USD\s*([\d,]+(?:\.\d{1,2})?)/i);
      const dueDateMatch = afterInvoice.match(/Due Date:\s*([^\n\r]+)/i);
      const daysOverdueMatch = afterInvoice.match(/Days Overdue:\s*(\d+)/i);
      const statusMatch = afterInvoice.match(/Status:\s*(\w+)/i);
      const paidAmountMatch = afterInvoice.match(/Paid Amount:\s*USD\s*([\d,]+(?:\.\d{1,2})?)/i);
      const sapMatch = detailMatch[0].match(/SAP:\s*([^)]+)/i);
      
      const totalAmount = totalAmountMatch ? totalAmountMatch[1] : 'N/A';
      const outstandingAmount = outstandingMatch ? outstandingMatch[1] : 'N/A';
      const dueDate = dueDateMatch ? dueDateMatch[1].trim() : 'N/A';
      const daysOverdue = daysOverdueMatch ? parseInt(daysOverdueMatch[1]) : 0;
      const status = statusMatch ? statusMatch[1] : 'UNKNOWN';
      const paidAmount = paidAmountMatch ? paidAmountMatch[1] : '0';
      const sapNumber = sapMatch ? sapMatch[1].trim() : 'N/A';
      
      let description = `Invoice collection task for ${customerName}.\n\n`;
      description += `Invoice: ${invoiceNumber}`;
      if (sapNumber !== 'N/A') description += ` (SAP: ${sapNumber})`;
      description += `\n`;
      description += `Amount Outstanding: USD ${outstandingAmount}\n`;
      description += `Due Date: ${dueDate}\n`;
      if (daysOverdue > 0) {
        description += `Days Overdue: ${daysOverdue} days\n`;
      }
      description += `Status: ${status}\n\n`;
      
      if (daysOverdue > 365) {
        description += `Follow up required - long overdue account. Consider escalation.`;
      } else if (daysOverdue > 90) {
        description += `Follow up required - review payment terms and contact customer.`;
      } else {
        description += `Follow standard collection procedures and maintain customer relationship.`;
      }
      
      const priority = daysOverdue > 365 ? 'High' : daysOverdue > 90 ? 'Medium' : 'Low';
      
      tasks.push({
        id: `invoice-${invoiceNumber.replace(/[^a-zA-Z0-9]/g, '-')}`,
        title: `Invoice ${invoiceNumber} – ${customerName}`,
        description,
        priority,
        category: 'Finance',
        estimatedDays: priority === 'High' ? 1 : priority === 'Medium' ? 3 : 5
      });
    }
    
    // Pattern for numbered list format (more forgiving) - fallback if detailed pattern fails
    if (tasks.length === 0) {
      const numberedListPattern = /(\d+)\.\s*\*\*Invoice\s+(INV-[^*]+)\*\*\s*(?:\([^)]*SAP:[^)]*\))?\s*[-–]\s*([^-\n]+)/gi;
      let numberedMatch;
      while ((numberedMatch = numberedListPattern.exec(text)) !== null) {
        const invoiceNumber = numberedMatch[2].trim();
        const customerName = numberedMatch[3].trim();
        
        // Look for details in the following lines
        const afterInvoice = text.substring(numberedMatch.index + numberedMatch[0].length, numberedMatch.index + 500);
        const totalAmountMatch = afterInvoice.match(/Total Amount:\s*USD\s*([\d,]+(?:\.\d{1,2})?)/i);
        const outstandingMatch = afterInvoice.match(/Outstanding:\s*USD\s*([\d,]+(?:\.\d{1,2})?)/i);
        const daysOverdueMatch = afterInvoice.match(/Days Overdue:\s*(\d+)/i);
        const statusMatch = afterInvoice.match(/Status:\s*(\w+)/i);
        const sapMatch = numberedMatch[0].match(/SAP:\s*([^)]+)/i);
        
        let description = `Invoice collection task for ${customerName}.\n\n`;
        description += `Invoice: ${invoiceNumber}`;
        if (sapMatch) description += ` (SAP: ${sapMatch[1].trim()})`;
        description += `\n`;
        if (totalAmountMatch) description += `Total Amount: USD ${totalAmountMatch[1]}\n`;
        if (outstandingMatch) description += `Outstanding Amount: USD ${outstandingMatch[1]}\n`;
        if (daysOverdueMatch) description += `Days Overdue: ${daysOverdueMatch[1]} days\n`;
        if (statusMatch) description += `Status: ${statusMatch[1]}\n\n`;
        
        const daysOverdue = daysOverdueMatch ? parseInt(daysOverdueMatch[1]) : 0;
        if (daysOverdue > 90) {
          description += `Follow up required - review payment terms and contact customer for escalation.`;
        } else {
          description += `Contact customer for payment collection and follow standard procedures.`;
        }
        const priority = daysOverdue > 365 ? 'High' : daysOverdue > 90 ? 'Medium' : 'Low';
        
        tasks.push({
          id: `invoice-${invoiceNumber.replace(/[^a-zA-Z0-9]/g, '-')}`,
          title: `Invoice ${invoiceNumber} – ${customerName}`,
          description,
          priority,
          category: 'Finance',
          estimatedDays: priority === 'High' ? 1 : priority === 'Medium' ? 3 : 5
        });
      }
    }
    
    // Fallback pattern for simpler invoice mentions  
    if (tasks.length === 0) {
      const simpleInvoicePattern = /\*\*Invoice\s+(INV-[^*]+)\*\*\s*[-–]\s*([^\n]+)/gi;
      let simpleMatch;
      while ((simpleMatch = simpleInvoicePattern.exec(text)) !== null) {
        const invoiceNumber = simpleMatch[1].trim();
        const customerName = simpleMatch[2].trim();
        
        tasks.push({
          id: `invoice-${invoiceNumber.replace(/[^a-zA-Z0-9]/g, '-')}`,
          title: `Invoice ${invoiceNumber} – ${customerName}`,
          description: `Follow up on outstanding invoice ${invoiceNumber} with customer ${customerName}.\n\nAction Required: Contact customer for payment status and collection.`,
          priority: 'Medium',
          category: 'Finance',
          estimatedDays: 3
        });
      }
    }
    
    // If no detailed invoice info found, parse line by line for other actionable items
    if (tasks.length === 0) {
      const lines = text.split('\n');
      let currentSection = '';
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Identify sections
        if (line.includes('HIGH-RISK') || line.includes('IMMEDIATE ATTENTION') || line.includes('REQUIRING IMMEDIATE')) {
          currentSection = 'high-priority';
        } else if (line.includes('RECOMMENDATIONS') || line.includes('SPECIFIC RECOMMENDATIONS')) {
          currentSection = 'recommendations';
        } else if (line.includes('COLLECTION TARGETS') || line.includes('PRIORITY')) {
          currentSection = 'priority';
        }
        
        // Extract numbered tasks
        const numberedMatch = line.match(/^\d+\.\s*(.+)/);
        if (numberedMatch) {
          let title = numberedMatch[1];
          let description = '';
          let priority: 'Low' | 'Medium' | 'High' = 'Medium';
          
          // Extract customer names from bold formatting
          const customerMatch = title.match(/\*\*([^*]+(?:Ltd|Limited|Inc|Corp|Company|GMBH|LLC|Energy|Oil|Industries|Group|Trading|Services|Solutions)[^*]*)\*\*/);
          if (customerMatch) {
            const customerName = customerMatch[1];
            title = `Follow up with ${customerName}`;
            
            // Look for financial details in surrounding context
            const contextLines = lines.slice(Math.max(0, i-2), i+3).join(' ');
            const amountMatch = contextLines.match(/USD\s*([\d,]+(?:\.\d{2})?)/);
            const daysMatch = contextLines.match(/(\d{1,4})\s*days?\s*overdue/i);
            const invoiceMatch = contextLines.match(/(INV-\d{4}-\d{3})/);
            
            description = `Customer payment collection required\n\n`;
            if (invoiceMatch) description += `Invoice: ${invoiceMatch[1]}\n`;
            description += `Customer: ${customerName}\n`;
            if (amountMatch) description += `Outstanding Amount: USD ${amountMatch[1]}\n`;
            if (daysMatch) description += `Days Overdue: ${daysMatch[1]}\n`;
            description += `Status: OVERDUE\n\n`;
            description += `Action: Contact customer for immediate payment resolution`;
            
            priority = (daysMatch && parseInt(daysMatch[1]) > 365) ? 'High' : 'Medium';
          } else {
            // Clean up generic tasks
            title = title.replace(/\*\*/g, '').trim();
            
            if (line.includes('Outstanding') || line.includes('overdue') || line.includes('collection')) {
              description = `Financial follow-up task: ${title}`;
              priority = 'High';
            } else if (currentSection === 'high-priority') {
              description = `High priority action: ${title}`;
              priority = 'High';
            } else if (currentSection === 'recommendations') {
              description = `Strategic recommendation: ${title}`;
              priority = 'Medium';
            } else {
              description = `Action item: ${title}`;
            }
          }
          
          if (title.length > 3) {
            tasks.push({
              id: `task-${tasks.length}`,
              title: title.substring(0, 100),
              description,
              priority,
              category: insight.category,
              estimatedDays: priority === 'High' ? 3 : priority === 'Medium' ? 7 : 14
            });
          }
        }
      }
    }
    
    // Prioritize tasks by importance and limit only if too many
    tasks.sort((a, b) => {
      // Sort by priority: High > Medium > Low
      const priorityOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
    
    // Only limit if we have an excessive number (over 50)
    return tasks.length > 50 ? tasks.slice(0, 50) : tasks;
  };

  const handleGenerateTasks = (insight: BusinessInsight) => {
    setSelectedInsight(insight);
    setTaskGenerationValidationErrors({}); // Reset validation errors
    setIsTaskGenerationDialogOpen(true);
  };

  const validateTaskGeneration = () => {
    const errors: { assignee?: string; days?: string } = {};
    
    if (!taskGenerationAssignee) {
      errors.assignee = "Please select an assignee for the tasks.";
    }
    
    if (!taskGenerationDays || taskGenerationDays < 7) {
      errors.days = "Task completion days must be at least 7 days.";
    }
    
    setTaskGenerationValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleConfirmTaskGeneration = async () => {
    if (!selectedInsight) return;
    
    // Validate form before proceeding
    if (!validateTaskGeneration()) {
      toast({
        title: "Validation Error",
        description: "Please fix the validation errors before generating tasks.",
        variant: "destructive",
      });
      return;
    }
    
    setIsGeneratingTasks(true);
    try {
      const parsedTasks = parseInsightToTasks(selectedInsight);
      
      // Calculate due dates based on task generation days
      const today = new Date();
      const tasksWithDates = parsedTasks.map(task => ({
        ...task,
        dueDate: new Date(today.getTime() + (taskGenerationDays * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
        estimatedDays: taskGenerationDays,
        assignedTo: taskGenerationAssignee || undefined,
        sourceType: 'llm_insight',
        sourceId: selectedInsight.id
      }));

      // Check for duplicates before showing preview
      console.log(`Checking for duplicates among ${tasksWithDates.length} generated tasks...`);
      const duplicateCheckResponse = await fetch('/api/tasks/check-duplicates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ tasks: tasksWithDates })
      });

      if (!duplicateCheckResponse.ok) {
        throw new Error('Failed to check for duplicate tasks');
      }

      const duplicateResult = await duplicateCheckResponse.json();
      
      if (!duplicateResult.success) {
        throw new Error(duplicateResult.message || 'Failed to check for duplicates');
      }

      // Filter out duplicates and only show unique tasks in preview
      const uniqueTasks = duplicateResult.nonDuplicates.map((task: any) => ({
        id: `temp-${Date.now()}-${task.index}`,
        title: task.title,
        description: task.description,
        priority: task.priority,
        category: task.category,
        dueDate: task.dueDate,
        estimatedDays: task.estimatedDays,
        assignedTo: task.assignedTo
      }));

      setGeneratedTasks(uniqueTasks);
      // Auto-populate global assignee from task generation dialog
      setGlobalAssignee(taskGenerationAssignee);
      setIsTaskGenerationDialogOpen(false);
      setIsTaskPreviewOpen(true);
      
      // Show informative message about duplicates
      let toastMessage = '';
      if (duplicateResult.duplicateCount > 0 && uniqueTasks.length > 0) {
        toastMessage = `Generated ${uniqueTasks.length} unique tasks. ${duplicateResult.duplicateCount} duplicate tasks were filtered out.`;
      } else if (duplicateResult.duplicateCount > 0 && uniqueTasks.length === 0) {
        toastMessage = `All ${duplicateResult.duplicateCount} tasks were duplicates. No new tasks to create.`;
      } else {
        toastMessage = `Generated ${uniqueTasks.length} tasks from the insight. Review and assign before creating.`;
      }

      toast({
        title: uniqueTasks.length > 0 ? "Tasks Generated" : "No New Tasks",
        description: toastMessage,
        variant: uniqueTasks.length > 0 ? "default" : "destructive"
      });

      if (uniqueTasks.length === 0) {
        // Close the preview dialog if no unique tasks
        setIsTaskPreviewOpen(false);
      }
      
    } catch (error) {
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate tasks.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingTasks(false);
    }
  };

  const updateGeneratedTask = (taskId: string, updates: Partial<GeneratedTask>) => {
    setGeneratedTasks(prev => 
      prev.map(task => 
        task.id === taskId ? { ...task, ...updates } : task
      )
    );
  };

  const removeGeneratedTask = (taskId: string) => {
    setGeneratedTasks(prev => prev.filter(task => task.id !== taskId));
  };

  const applyGlobalAssignment = (assigneeId: number | null) => {
    setGlobalAssignee(assigneeId);
    setGeneratedTasks(prev => 
      prev.map(task => ({ 
        ...task, 
        assignedTo: assigneeId || undefined 
      }))
    );
  };

  const handleCreateAllTasks = async () => {
    if (generatedTasks.length === 0) return;
    
    setIsCreatingTasks(true);
    try {
      const response = await fetch('/api/tasks/batch-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          tasks: generatedTasks.map(task => ({
            title: task.title,
            description: task.description,
            priority: task.priority,
            startDate: new Date().toISOString().split('T')[0],
            finishDate: task.dueDate,
            dueDate: task.dueDate,
            assignedTo: task.assignedTo,
            category: task.category,
            sourceType: 'llm_insight',
            sourceId: selectedInsight?.id
          }))
        })
      });

      const result = await response.json();

      if (result.success) {
        // Create dynamic toast message based on result
        let description = result.message;
        
        if (result.duplicates && result.duplicates.length > 0) {
          description += `. ${result.duplicates.length} duplicate tasks were automatically skipped.`;
        }
        
        if (result.errors && result.errors.length > 0) {
          description += ` ${result.errors.length} tasks had errors.`;
        }

        toast({
          title: "Task Generation Complete",
          description,
          variant: result.created > 0 ? "default" : "destructive"
        });
        
        // Reset states
        setIsTaskPreviewOpen(false);
        setGeneratedTasks([]);
        setSelectedInsight(null);
        setGlobalAssignee(null);
        setTaskGenerationAssignee(null);
        
        // Refresh task-related queries if needed
        queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      } else {
        throw new Error(result.message || 'Failed to create tasks');
      }
    } catch (error) {
      toast({
        title: "Task Creation Failed",
        description: error instanceof Error ? error.message : "Failed to create tasks.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingTasks(false);
    }
  };

  // PDF download handler for User Performance Reports
  const downloadPDF = async (insight: BusinessInsight) => {
    try {
      const response = await fetch('/api/llm/download-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include session cookies for authentication
        body: JSON.stringify({
          title: insight.title,
          content: insight.insight_text,
          generated_at: insight.generated_at,
          prompt_name: insight.prompt_name,
          model_used: insight.model_used
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `THERMOPAC_User_Performance_Report_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "PDF Downloaded",
        description: "User Performance Report has been downloaded successfully.",
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: error instanceof Error ? error.message : "Failed to generate PDF.",
        variant: "destructive",
      });
    }
  };

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
          
          {/* Test Mode Toggle */}
          <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg">
            <TestTube className="w-4 h-4 text-yellow-600" />
            <Label htmlFor="test-mode" className="text-sm text-yellow-700">Test Mode</Label>
            <Switch 
              id="test-mode"
              checked={testMode}
              onCheckedChange={setTestMode}
            />
          </div>
          
          {/* Security Dashboard Toggle */}
          <Button 
            variant="outline"
            size="sm"
            onClick={() => setShowSecurityLogs(!showSecurityLogs)}
            className="flex items-center gap-2"
          >
            <Shield className="w-4 h-4" />
            Security Dashboard
          </Button>
          
          {/* Security Dashboard Toggle */}
          <Button
            onClick={() => setShowSecurityLogs(!showSecurityLogs)}
            variant={showSecurityLogs ? "default" : "outline"}
            size="sm"
          >
            <Shield className="w-4 h-4 mr-2" />
            Security
          </Button>
          
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
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Prompt
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New LLM Prompt</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Prompt Name</Label>
                    <Input id="name" placeholder="e.g., Daily Project Health Check" />
                  </div>
                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="task_management">Task Management</SelectItem>
                        <SelectItem value="meetings">Meetings & Commitments</SelectItem>
                        <SelectItem value="sap_integration">SAP B1 Integration</SelectItem>
                        <SelectItem value="administration">Administration</SelectItem>
                        <SelectItem value="finance">Finance</SelectItem>
                        <SelectItem value="sales_marketing">Sales & Marketing</SelectItem>
                        <SelectItem value="projects">Project Management</SelectItem>
                        <SelectItem value="design_management">Design Management</SelectItem>
                        <SelectItem value="procurement">Procurement</SelectItem>
                        <SelectItem value="production">Production</SelectItem>
                        <SelectItem value="quality">Quality Management</SelectItem>
                        <SelectItem value="commissioning">Project Commissioning</SelectItem>
                        <SelectItem value="dispatch_shipping">Dispatch & Shipping</SelectItem>
                        <SelectItem value="after_sales">After-Sales</SelectItem>
                        <SelectItem value="hr">HR Management</SelectItem>
                        <SelectItem value="system">System Administration</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea 
                    id="description"
                    placeholder="Describe what this prompt analyzes and generates..."
                    className="min-h-[80px]"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="model">AI Model</Label>
                    <Select defaultValue="gpt-4o">
                      <SelectTrigger>
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                        <SelectItem value="claude-sonnet-4-20250514">Claude Sonnet 4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="frequency">Frequency</Label>
                    <Select defaultValue="daily">
                      <SelectTrigger>
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="manual">Manual Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="priority">Priority (1-10)</Label>
                    <Input 
                      id="priority"
                      type="number" 
                      min="1" 
                      max="10" 
                      defaultValue="5"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="template">Prompt Template</Label>
                  <Textarea 
                    id="template"
                    placeholder="Enter the prompt template with placeholders like {{data}} where needed..."
                    className="min-h-[200px]"
                  />
                </div>

                <div>
                  <Label htmlFor="data_query">Data Query (Optional)</Label>
                  <Textarea 
                    id="data_query"
                    placeholder="SQL query to fetch data for this prompt..."
                    className="min-h-[80px]"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => {
                    toast({
                      title: "Feature Coming Soon",
                      description: "Prompt creation functionality will be available in the next update.",
                    });
                    setIsCreateDialogOpen(false);
                  }}>
                    Create Prompt
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Edit Prompt Dialog */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby="edit-prompt-description">
              <DialogHeader>
                <DialogTitle>Edit LLM Prompt</DialogTitle>
                {editingPrompt && (
                  <div className="text-sm text-muted-foreground">
                    Prompt ID: {editingPrompt.id}
                  </div>
                )}
                <div id="edit-prompt-description" className="sr-only">
                  Edit the details of an existing LLM prompt including name, category, model, and template.
                </div>
              </DialogHeader>
              {editingPrompt && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="edit-name">Prompt Name</Label>
                      <Input 
                        id="edit-name" 
                        value={editFormData.name}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-category">Category</Label>
                      <Select value={editFormData.category} onValueChange={(value) => setEditFormData(prev => ({ ...prev, category: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="task_management">Task Management</SelectItem>
                          <SelectItem value="meetings">Meetings & Commitments</SelectItem>
                          <SelectItem value="sap_integration">SAP B1 Integration</SelectItem>
                          <SelectItem value="administration">Administration</SelectItem>
                          <SelectItem value="finance">Finance</SelectItem>
                          <SelectItem value="sales_marketing">Sales & Marketing</SelectItem>
                          <SelectItem value="projects">Project Management</SelectItem>
                          <SelectItem value="design_management">Design Management</SelectItem>
                          <SelectItem value="procurement">Procurement</SelectItem>
                          <SelectItem value="production">Production</SelectItem>
                          <SelectItem value="quality">Quality Management</SelectItem>
                          <SelectItem value="commissioning">Project Commissioning</SelectItem>
                          <SelectItem value="dispatch_shipping">Dispatch & Shipping</SelectItem>
                          <SelectItem value="after_sales">After-Sales</SelectItem>
                          <SelectItem value="hr">HR Management</SelectItem>
                          <SelectItem value="system">System Administration</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="edit-description">Description</Label>
                    <Textarea 
                      id="edit-description"
                      value={editFormData.description}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, description: e.target.value }))}
                      className="min-h-[80px]"
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <Label htmlFor="edit-model">AI Model</Label>
                      <Select value={editFormData.model} onValueChange={(value) => setEditFormData(prev => ({ ...prev, model: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                          <SelectItem value="claude-sonnet-4-20250514">Claude Sonnet 4</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label htmlFor="edit-frequency">Frequency</Label>
                      <Select value={editFormData.frequency} onValueChange={(value) => setEditFormData(prev => ({ ...prev, frequency: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="manual">Manual Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label htmlFor="edit-priority">Priority (1-10)</Label>
                      <Input 
                        id="edit-priority"
                        type="number" 
                        min="1" 
                        max="10" 
                        value={editFormData.priority}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 5 }))}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="edit-temperature">Temperature (0.0-2.0)</Label>
                      <Input 
                        id="edit-temperature"
                        type="number" 
                        step="0.1"
                        min="0.0" 
                        max="2.0" 
                        value={editFormData.temperature}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, temperature: parseFloat(e.target.value) || 0.7 }))}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="edit-template">Prompt Template</Label>
                    <Textarea 
                      id="edit-template"
                      value={editFormData.template}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, template: e.target.value }))}
                      className="min-h-[200px]"
                    />
                  </div>

                  <div>
                    <Label htmlFor="edit-data-query">Data Query (Optional)</Label>
                    <Textarea 
                      id="edit-data-query"
                      value={editFormData.data_query}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, data_query: e.target.value }))}
                      placeholder="SQL query to fetch data for this prompt..."
                      className="min-h-[120px]"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleSavePrompt}
                      disabled={updatePromptMutation.isPending}
                    >
                      {updatePromptMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
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

      {/* Security Dashboard */}
      {showSecurityLogs && (
        <SecurityDashboard testMode={testMode} />
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="modules" className="space-y-4">
        <TabsList>
          <TabsTrigger value="modules">Business Modules</TabsTrigger>
          <TabsTrigger value="prompts">All Prompts</TabsTrigger>
          <TabsTrigger value="insights">Generated Insights</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Business Modules Tab */}
        <TabsContent value="modules" className="space-y-4">
          {moduleGroupsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {moduleGroupsData?.moduleGroups?.map((moduleGroup: ModuleGroup) => {
                const ModuleIcon = getModuleIcon(moduleGroup.category);
                return (
                  <Card key={moduleGroup.category} className="overflow-hidden">
                    <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-100 rounded-lg">
                            <ModuleIcon className="w-6 h-6 text-blue-600" />
                          </div>
                          <div>
                            <CardTitle className="text-xl text-gray-800">
                              {getModuleDisplayName(moduleGroup.category)}
                            </CardTitle>
                            <p className="text-sm text-gray-600">
                              {moduleGroup.prompt_count} active prompt{moduleGroup.prompt_count !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className="bg-white">
                          {moduleGroup.prompts.length} prompt{moduleGroup.prompts.length !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                        {moduleGroup.prompts.map((prompt: LLMPrompt) => (
                          <Card key={prompt.id} className="hover:shadow-md transition-shadow border">
                            <CardHeader className="pb-3">
                              <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                  <CardTitle className="text-base">{prompt.name}</CardTitle>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="text-xs">
                                      {prompt.frequency}
                                    </Badge>
                                    <Badge variant="outline" className="text-xs">
                                      {prompt.model}
                                    </Badge>
                                    <Badge 
                                      variant="outline" 
                                      className={`text-xs ${getPriorityColor(prompt.priority)}`}
                                    >
                                      P{prompt.priority}
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
                            <CardContent className="pt-0">
                              <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                                {prompt.description}
                              </p>
                              
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleExecutePrompt(prompt.id)}
                                    disabled={executingPrompts.has(prompt.id)}
                                    className="flex-1"
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
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <TestTube className="w-3 h-3" />
                                    )}
                                  </Button>
                                  
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleOptimizePrompt(prompt.id)}
                                    disabled={optimizingPrompts.has(prompt.id)}
                                  >
                                    {optimizingPrompts.has(prompt.id) ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Lightbulb className="w-3 h-3" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                              
                              {prompt.total_executions && prompt.total_executions > 0 && (
                                <div className="mt-3 text-xs text-gray-500 flex items-center justify-between">
                                  <span>{prompt.total_executions} execution{prompt.total_executions !== 1 ? 's' : ''}</span>
                                  {prompt.last_executed && (
                                    <span>Last: {new Date(prompt.last_executed).toLocaleDateString()}</span>
                                  )}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* All Prompts Tab */}
        <TabsContent value="prompts" className="space-y-4">
          {promptsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  All Prompts ({promptsData?.prompts?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-0">
                  {promptsData?.prompts?.map((prompt: LLMPrompt, index: number) => (
                    <div 
                      key={prompt.id} 
                      className={`flex items-center justify-between p-4 hover:bg-gray-50 transition-colors ${
                        index !== promptsData.prompts.length - 1 ? 'border-b border-gray-100' : ''
                      }`}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        {/* Prompt ID */}
                        <div className="flex items-center justify-center w-10 h-10 bg-blue-100 text-blue-600 rounded-lg font-medium text-sm">
                          #{prompt.id}
                        </div>
                        
                        {/* Prompt Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-gray-900 truncate">{prompt.name}</h3>
                            <Badge variant="secondary" className="text-xs">
                              {prompt.category}
                            </Badge>
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${getPriorityColor(prompt.priority)}`}
                            >
                              P{prompt.priority}
                            </Badge>
                            {prompt.avg_rating && (
                              <div className="flex items-center text-sm text-yellow-600">
                                <Star className="w-3 h-3 fill-current" />
                                <span className="ml-1">{prompt.avg_rating.toFixed(1)}</span>
                              </div>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 line-clamp-1 mb-1">
                            {prompt.description}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span>Model: {prompt.model}</span>
                            <span>Frequency: {prompt.frequency}</span>
                            {prompt.total_executions && prompt.total_executions > 0 ? (
                              <span>{prompt.total_executions} executions</span>
                            ) : null}
                            {prompt.last_executed && (
                              <span>Last: {new Date(prompt.last_executed).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 ml-4">
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
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <TestTube className="w-3 h-3" />
                          )}
                        </Button>
                        
                        {testMode && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="bg-yellow-50 text-yellow-700 border-yellow-300 hover:bg-yellow-100"
                            onClick={() => handleTestExecution(prompt.id)}
                            disabled={executingPrompts.has(prompt.id)}
                          >
                            {executingPrompts.has(prompt.id) ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <TestTube className="w-3 h-3" />
                            )}
                          </Button>
                        )}
                        
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleOptimizePrompt(prompt.id)}
                          disabled={optimizingPrompts.has(prompt.id)}
                        >
                          {optimizingPrompts.has(prompt.id) ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Lightbulb className="w-3 h-3 text-yellow-600" />
                          )}
                        </Button>
                        
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleEditPrompt(prompt)}
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
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
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadPDF(insight)}
                          className="h-8 px-3 flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" />
                          PDF
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleGenerateTasks(insight)}
                          className="h-8 px-3 flex items-center gap-1 bg-green-50 text-green-700 border-green-300 hover:bg-green-100"
                        >
                          <ListChecks className="w-3 h-3" />
                          Generate Tasks
                        </Button>
                        <span className="text-sm text-gray-500">
                          {new Date(insight.generated_at).toLocaleString()}
                        </span>
                      </div>
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
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" aria-describedby="ab-test-results-description">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TestTube className="w-5 h-5 text-blue-600" />
                A/B Test Results
              </DialogTitle>
            </DialogHeader>
            <div id="ab-test-results-description" className="sr-only">
              View A/B test comparison results between different AI models
            </div>
            
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
                              <Badge variant="outline">${typeof result.cost === 'number' ? result.cost.toFixed(4) : '0.0000'}</Badge>
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
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" aria-describedby="optimization-results-description">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-yellow-600" />
                Prompt Optimization Results
              </DialogTitle>
            </DialogHeader>
            <div id="optimization-results-description" className="sr-only">
              View AI-powered optimization suggestions for prompt improvement
            </div>
            
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

        {/* Task Generation Confirmation Dialog */}
        <Dialog open={isTaskGenerationDialogOpen} onOpenChange={(open) => {
          setIsTaskGenerationDialogOpen(open);
          if (!open) {
            setTaskGenerationValidationErrors({}); // Reset validation errors when closing
          }
        }}>
          <DialogContent className="max-w-md" aria-describedby="task-generation-description">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ListChecks className="w-5 h-5 text-green-600" />
                Generate Tasks from Insight
              </DialogTitle>
            </DialogHeader>
            <div id="task-generation-description" className="sr-only">
              Configure task generation parameters for the selected insight
            </div>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="assignTo" className={taskGenerationValidationErrors.assignee ? "text-red-600" : ""}>
                  Assign To *
                </Label>
                <Select 
                  value={taskGenerationAssignee?.toString() || ''} 
                  onValueChange={(value) => {
                    setTaskGenerationAssignee(value ? parseInt(value) : null);
                    // Clear validation error when user selects
                    if (value && taskGenerationValidationErrors.assignee) {
                      setTaskGenerationValidationErrors(prev => ({ ...prev, assignee: undefined }));
                    }
                  }}
                >
                  <SelectTrigger id="assignTo" className={taskGenerationValidationErrors.assignee ? "border-red-500" : ""}>
                    <SelectValue placeholder="Select assignee for all tasks..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(groupedUsers).map(([role, users]) => (
                      <SelectGroup key={role}>
                        <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">
                          {role}s
                        </SelectLabel>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id.toString()}>
                            {user.username}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                {taskGenerationValidationErrors.assignee ? (
                  <p className="text-sm text-red-600 mt-1">{taskGenerationValidationErrors.assignee}</p>
                ) : (
                  <p className="text-sm text-gray-500 mt-1">
                    Choose who will be assigned to all generated tasks.
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="taskGenerationDays" className={taskGenerationValidationErrors.days ? "text-red-600" : ""}>
                  Task Completion Days * (Minimum 7 days)
                </Label>
                <Input
                  id="taskGenerationDays"
                  type="number"
                  min="7"
                  max="30"
                  value={taskGenerationDays}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 7;
                    setTaskGenerationDays(value);
                    // Clear validation error when user enters valid value
                    if (value >= 7 && taskGenerationValidationErrors.days) {
                      setTaskGenerationValidationErrors(prev => ({ ...prev, days: undefined }));
                    }
                  }}
                  placeholder="Enter days for task completion"
                  className={taskGenerationValidationErrors.days ? "border-red-500" : ""}
                />
                {taskGenerationValidationErrors.days ? (
                  <p className="text-sm text-red-600 mt-1">{taskGenerationValidationErrors.days}</p>
                ) : (
                  <p className="text-sm text-gray-500 mt-1">
                    Due date will be calculated as {taskGenerationDays} days from today ({new Date(Date.now() + taskGenerationDays * 24 * 60 * 60 * 1000).toLocaleDateString()})
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsTaskGenerationDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmTaskGeneration}
                  disabled={isGeneratingTasks || !taskGenerationAssignee || taskGenerationDays < 7}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isGeneratingTasks ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : (
                    <ArrowRight className="w-4 h-4 mr-1" />
                  )}
                  Generate Tasks
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Task Preview and Editing Dialog */}
        <Dialog open={isTaskPreviewOpen} onOpenChange={setIsTaskPreviewOpen}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto" aria-describedby="task-preview-description">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ListChecks className="w-5 h-5 text-blue-600" />
                Review Generated Tasks ({generatedTasks.length})
              </DialogTitle>
            </DialogHeader>
            <div id="task-preview-description" className="sr-only">
              Review, edit and assign generated tasks before creating them
            </div>
            
            <div className="space-y-4">
              {generatedTasks.length === 0 ? (
                <div className="text-center py-8">
                  <ListChecks className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No tasks were generated from this insight.</p>
                </div>
              ) : (
                <>
                  {/* Global Assignment Section */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          Global Assignment
                          {taskGenerationAssignee && (
                            <Badge variant="secondary" className="text-xs ml-2">
                              Auto-populated
                            </Badge>
                          )}
                        </h3>
                        <p className="text-sm text-gray-600 mb-3">
                          {taskGenerationAssignee 
                            ? "Assignment was pre-selected in the previous step and applied to all tasks."
                            : "Assign all tasks to the same person, or leave blank to assign individually."
                          }
                        </p>
                        <div className="flex items-center gap-3">
                          <Label htmlFor="global-assignee" className="text-sm font-medium min-w-fit">
                            Assign All Tasks To:
                          </Label>
                          {taskGenerationAssignee ? (
                            <div className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-700">
                              {users?.find(u => u.id === globalAssignee)?.username || 'Selected User'}
                              <span className="text-xs text-gray-500 ml-2">(Read-only)</span>
                            </div>
                          ) : (
                            <Select
                              value={globalAssignee?.toString() || ''}
                              onValueChange={(value) => applyGlobalAssignment(value ? parseInt(value) : null)}
                            >
                              <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Select assignee for all tasks..." />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(groupedUsers).map(([role, users]) => (
                                  <SelectGroup key={role}>
                                    <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">
                                      {role}s
                                    </SelectLabel>
                                    {users.map((user) => (
                                      <SelectItem key={user.id} value={user.id.toString()}>
                                        {user.username}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    {generatedTasks.map((task, index) => (
                      <Card key={task.id} className="border-l-4 border-l-blue-500">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Input
                                  value={task.title}
                                  onChange={(e) => updateGeneratedTask(task.id!, { title: e.target.value })}
                                  className="font-semibold text-base border-none px-0 shadow-none focus-visible:ring-0 flex-1 min-w-0 bg-transparent"
                                  placeholder="Task title..."
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    const input = document.querySelector(`input[value="${task.title}"]`) as HTMLInputElement;
                                    if (input) input.focus();
                                  }}
                                  className="text-blue-600 hover:text-blue-700 px-2"
                                  title="Edit title"
                                >
                                  <Edit className="w-3 h-3" />
                                </Button>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge 
                                  variant={
                                    task.priority === 'High' ? 'destructive' : 
                                    task.priority === 'Medium' ? 'default' : 
                                    'secondary'
                                  }
                                  className="text-xs"
                                >
                                  {task.priority} Priority
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {task.category}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  Due: {new Date(task.dueDate!).toLocaleDateString()}
                                </Badge>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => removeGeneratedTask(task.id!)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                              title="Delete task"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </CardHeader>
                        
                        <CardContent className="space-y-3">
                          <div>
                            <Label htmlFor={`desc-${task.id}`} className="text-sm font-medium">Description</Label>
                            <Textarea
                              id={`desc-${task.id}`}
                              value={task.description}
                              onChange={(e) => updateGeneratedTask(task.id!, { description: e.target.value })}
                              className="mt-1 min-h-[120px]"
                              placeholder="Task description..."
                            />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor={`priority-${task.id}`} className="text-sm font-medium">Priority</Label>
                              <select
                                id={`priority-${task.id}`}
                                value={task.priority}
                                onChange={(e) => updateGeneratedTask(task.id!, { priority: e.target.value as 'Low' | 'Medium' | 'High' })}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="Low">Low Priority</option>
                                <option value="Medium">Medium Priority</option>
                                <option value="High">High Priority</option>
                              </select>
                            </div>
                            
                            <div>
                              <Label htmlFor={`assignee-${task.id}`} className="text-sm font-medium">Assign To</Label>
                              <select
                                id={`assignee-${task.id}`}
                                value={task.assignedTo || ''}
                                onChange={(e) => updateGeneratedTask(task.id!, { assignedTo: e.target.value ? parseInt(e.target.value) : undefined })}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="">Select assignee...</option>
                                {users.map((user) => (
                                  <option key={user.id} value={user.id}>
                                    {user.firstName || user.username} {user.lastName || ''} ({user.role}){user.department && ` - ${user.department}`}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t">
                    <div className="text-sm text-gray-600">
                      {generatedTasks.length} task{generatedTasks.length !== 1 ? 's' : ''} ready to create
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setIsTaskPreviewOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleCreateAllTasks}
                        disabled={isCreatingTasks || generatedTasks.length === 0}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {isCreatingTasks ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        ) : (
                          <CheckCircle className="w-4 h-4 mr-1" />
                        )}
                        Create All Tasks
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </Tabs>
    </div>
  );
}