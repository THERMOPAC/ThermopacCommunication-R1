import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, AlertCircle, Clock, XCircle, CheckCircle, Info } from "lucide-react";
import { useLocation } from "wouter";

interface TaskDetail {
  id: number;
  title: string;
  assignee: string;
  dueDate: string;
  daysPastDue: number;
  priority: string;
}

interface Alert {
  type: 'critical' | 'warning' | 'info';
  category: string;
  title: string;
  message: string;
  action: string;
  priority: string;
  context?: {
    totalOverdue?: number;
    oldestOverdueDate?: string;
    taskDetails?: TaskDetail[];
    [key: string]: any;
  };
}

interface BusinessInsights {
  alerts: Alert[];
}

export default function ActiveAlertsPage() {
  const [, setLocation] = useLocation();

  const { data: businessInsights, isLoading } = useQuery<BusinessInsights>({
    queryKey: ['/api/business-intelligence/insights'],
  });

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'critical':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'info':
        return <Info className="h-5 w-5 text-blue-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getAlertBadge = (type: string, priority: string) => {
    const priorityColor = priority === 'High' ? 'bg-red-100 text-red-800 border-red-200' :
                         priority === 'Medium' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                         'bg-blue-100 text-blue-800 border-blue-200';
    
    return (
      <Badge variant="outline" className={`${priorityColor} text-xs`}>
        {priority} Priority
      </Badge>
    );
  };

  const getPriorityOrder = (priority: string) => {
    switch (priority) {
      case 'High': return 1;
      case 'Medium': return 2;
      case 'Low': return 3;
      default: return 4;
    }
  };

  const sortedAlerts = businessInsights?.alerts ? 
    [...businessInsights.alerts].sort((a, b) => 
      getPriorityOrder(a.priority) - getPriorityOrder(b.priority)
    ) : [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLocation('/business-intelligence')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Business Intelligence
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Active Alerts</h1>
          <p className="text-muted-foreground">
            Detailed view of all system alerts requiring attention
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <div>
                <p className="text-sm font-medium">Critical</p>
                <p className="text-2xl font-bold text-red-600">
                  {sortedAlerts.filter(alert => alert.type === 'critical').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <div>
                <p className="text-sm font-medium">Warning</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {sortedAlerts.filter(alert => alert.type === 'warning').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Info</p>
                <p className="text-2xl font-bold text-blue-600">
                  {sortedAlerts.filter(alert => alert.type === 'info').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm font-medium">Total</p>
                <p className="text-2xl font-bold text-gray-600">
                  {sortedAlerts.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            All Active Alerts
          </CardTitle>
          <CardDescription>
            Sorted by priority (High → Medium → Low)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : sortedAlerts.length > 0 ? (
            <div className="space-y-6">
              {sortedAlerts.map((alert, index) => (
                <div 
                  key={index} 
                  className="p-6 border rounded-lg hover:shadow-md transition-shadow bg-card"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {getAlertIcon(alert.type)}
                      <h3 className="font-semibold text-lg">{alert.title}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      {getAlertBadge(alert.type, alert.priority)}
                      <Badge variant="secondary" className="text-xs">
                        {alert.category}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">
                        Issue Description:
                      </p>
                      <p className="text-sm">{alert.message}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">
                        Recommended Action:
                      </p>
                      <p className="text-sm font-medium text-blue-600 bg-blue-50 p-2 rounded">
                        {alert.action}
                      </p>
                    </div>
                    
                    {alert.context && Object.keys(alert.context).length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-2">
                          Additional Context:
                        </p>
                        
                        {/* Special handling for task details */}
                        {alert.category === 'tasks' && alert.context.taskDetails && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                              <div className="bg-gray-50 p-2 rounded">
                                <span className="font-medium">Total Overdue:</span> {alert.context.totalOverdue}
                              </div>
                              <div className="bg-gray-50 p-2 rounded">
                                <span className="font-medium">Oldest Due:</span> {
                                  alert.context.oldestOverdueDate 
                                    ? new Date(alert.context.oldestOverdueDate).toLocaleDateString()
                                    : 'N/A'
                                }
                              </div>
                            </div>
                            
                            <div>
                              <p className="text-sm font-medium mb-2">Overdue Task Details:</p>
                              <div className="space-y-2 max-h-64 overflow-y-auto">
                                {alert.context.taskDetails.map((task: TaskDetail, idx: number) => (
                                  <div key={idx} className="bg-yellow-50 border border-yellow-200 p-3 rounded text-xs">
                                    <div className="flex justify-between items-start mb-1">
                                      <span className="font-medium text-gray-900">{task.title}</span>
                                      <span className="text-red-600 font-bold">
                                        {task.daysPastDue} days overdue
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-gray-600">
                                      <div>
                                        <span className="font-medium">Assignee:</span> {task.assignee}
                                      </div>
                                      <div>
                                        <span className="font-medium">Due Date:</span> {
                                          task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'N/A'
                                        }
                                      </div>
                                      <div>
                                        <span className="font-medium">Priority:</span> {task.priority || 'Normal'}
                                      </div>
                                      <div>
                                        <span className="font-medium">Task ID:</span> #{task.id}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Default context display for non-task alerts */}
                        {alert.category !== 'tasks' && (
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {Object.entries(alert.context).map(([key, value]) => (
                              <div key={key} className="bg-gray-50 p-2 rounded">
                                <span className="font-medium">{key}:</span> {String(value)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-500" />
              <h3 className="text-lg font-semibold mb-2">No Active Alerts</h3>
              <p className="text-muted-foreground">
                Great! Your system is running smoothly with no alerts requiring attention.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}