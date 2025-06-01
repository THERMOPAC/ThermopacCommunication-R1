import Layout from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  FileText, 
  Download, 
  Printer, 
  RefreshCw, 
  Calendar,
  Clock,
  Users,
  Package,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Factory,
  Target,
  Activity
} from "lucide-react";
import { format } from "date-fns";

interface ProductionData {
  workOrderId: string;
  projectCode: string;
  itemCode: string;
  description: string;
  plannedQuantity: number;
  completedQuantity: number;
  rejectedQuantity: number;
  status: 'in_progress' | 'completed' | 'delayed' | 'on_hold';
  team: string;
  shift: 'day' | 'night';
  startTime: string;
  endTime?: string;
  efficiency: number;
}

interface DailyProductionMetrics {
  totalWorkOrders: number;
  completedWorkOrders: number;
  delayedWorkOrders: number;
  totalProduction: number;
  totalRejection: number;
  overallEfficiency: number;
  topPerformingTeam: string;
}

export default function DailyProductionReportPage() {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedShift, setSelectedShift] = useState<'all' | 'day' | 'night'>('all');
  const [selectedTeam, setSelectedTeam] = useState('all');
  const queryClient = useQueryClient();

  // Mock data for demonstration - in real implementation, this would come from API
  const productionData: ProductionData[] = [
    {
      workOrderId: 'WO-2024-001',
      projectCode: 'P001',
      itemCode: 'SHELL-001',
      description: 'Pressure Vessel Shell',
      plannedQuantity: 5,
      completedQuantity: 4,
      rejectedQuantity: 1,
      status: 'in_progress',
      team: 'Production Team-1',
      shift: 'day',
      startTime: '08:00',
      efficiency: 85
    },
    {
      workOrderId: 'WO-2024-002',
      projectCode: 'P002',
      itemCode: 'HEAD-001',
      description: 'Ellipsoidal Head',
      plannedQuantity: 8,
      completedQuantity: 8,
      rejectedQuantity: 0,
      status: 'completed',
      team: 'Production Team-2',
      shift: 'day',
      startTime: '08:00',
      endTime: '16:00',
      efficiency: 98
    },
    {
      workOrderId: 'WO-2024-003',
      projectCode: 'P001',
      itemCode: 'NOZZLE-001',
      description: 'Inlet Nozzle Assembly',
      plannedQuantity: 12,
      completedQuantity: 8,
      rejectedQuantity: 2,
      status: 'delayed',
      team: 'Production Team-3',
      shift: 'night',
      startTime: '20:00',
      efficiency: 70
    },
    {
      workOrderId: 'WO-2024-004',
      projectCode: 'P003',
      itemCode: 'TUBE-001',
      description: 'Heat Exchanger Tubes',
      plannedQuantity: 24,
      completedQuantity: 24,
      rejectedQuantity: 1,
      status: 'completed',
      team: 'Production Team-1',
      shift: 'night',
      startTime: '20:00',
      endTime: '04:00',
      efficiency: 95
    }
  ];

  const filteredData = productionData.filter(item => {
    if (selectedShift !== 'all' && item.shift !== selectedShift) return false;
    if (selectedTeam !== 'all' && item.team !== selectedTeam) return false;
    return true;
  });

  const metrics: DailyProductionMetrics = {
    totalWorkOrders: filteredData.length,
    completedWorkOrders: filteredData.filter(item => item.status === 'completed').length,
    delayedWorkOrders: filteredData.filter(item => item.status === 'delayed').length,
    totalProduction: filteredData.reduce((sum, item) => sum + item.completedQuantity, 0),
    totalRejection: filteredData.reduce((sum, item) => sum + item.rejectedQuantity, 0),
    overallEfficiency: Math.round(filteredData.reduce((sum, item) => sum + item.efficiency, 0) / filteredData.length),
    topPerformingTeam: 'Production Team-2'
  };

  const generateReport = () => {
    console.log('Generating report for:', selectedDate, selectedShift, selectedTeam);
    // In real implementation, this would trigger API call to generate fresh data
  };

  const exportToExcel = () => {
    // Create CSV content
    const headers = ['Work Order', 'Project', 'Item Code', 'Description', 'Planned Qty', 'Completed Qty', 'Rejected Qty', 'Status', 'Team', 'Shift', 'Efficiency %'];
    const csvContent = [
      headers.join(','),
      ...filteredData.map(item => [
        item.workOrderId,
        item.projectCode,
        item.itemCode,
        `"${item.description}"`,
        item.plannedQuantity,
        item.completedQuantity,
        item.rejectedQuantity,
        item.status,
        `"${item.team}"`,
        item.shift,
        item.efficiency
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DPR_${selectedDate}_${selectedShift}_${selectedTeam}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const printReport = () => {
    window.print();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-800">In Progress</Badge>;
      case 'delayed':
        return <Badge className="bg-red-100 text-red-800">Delayed</Badge>;
      case 'on_hold':
        return <Badge className="bg-yellow-100 text-yellow-800">On Hold</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const teams = ['all', 'Production Team-1', 'Production Team-2', 'Production Team-3', 'Production Team-4'];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Daily Production Report (DPR)</h1>
            <p className="text-muted-foreground">
              Comprehensive production tracking and performance analysis
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={generateReport} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Data
            </Button>
            <Button onClick={exportToExcel} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
            <Button onClick={printReport}>
              <Printer className="h-4 w-4 mr-2" />
              Print Report
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Report Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="date">Report Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="shift">Shift</Label>
                <Select value={selectedShift} onValueChange={(value: 'all' | 'day' | 'night') => setSelectedShift(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Shifts</SelectItem>
                    <SelectItem value="day">Day Shift</SelectItem>
                    <SelectItem value="night">Night Shift</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="team">Production Team</Label>
                <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map(team => (
                      <SelectItem key={team} value={team}>
                        {team === 'all' ? 'All Teams' : team}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={generateReport} className="w-full">
                  <FileText className="h-4 w-4 mr-2" />
                  Generate Report
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Orders</p>
                  <p className="text-2xl font-bold">{metrics.totalWorkOrders}</p>
                </div>
                <Package className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold text-green-600">{metrics.completedWorkOrders}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Delayed</p>
                  <p className="text-2xl font-bold text-red-600">{metrics.delayedWorkOrders}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Production</p>
                  <p className="text-2xl font-bold">{metrics.totalProduction}</p>
                </div>
                <Factory className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Rejection</p>
                  <p className="text-2xl font-bold text-orange-600">{metrics.totalRejection}</p>
                </div>
                <Target className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Efficiency</p>
                  <p className="text-2xl font-bold text-blue-600">{metrics.overallEfficiency}%</p>
                </div>
                <TrendingUp className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Production Data Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Production Details - {format(new Date(selectedDate), 'PPP')}
            </CardTitle>
            <CardDescription>
              Detailed breakdown of production activities for {selectedShift === 'all' ? 'all shifts' : `${selectedShift} shift`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Work Order</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-center">Planned</TableHead>
                    <TableHead className="text-center">Completed</TableHead>
                    <TableHead className="text-center">Rejected</TableHead>
                    <TableHead className="text-center">Efficiency</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Shift</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{item.workOrderId}</TableCell>
                      <TableCell>{item.projectCode}</TableCell>
                      <TableCell>{item.itemCode}</TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell className="text-center">{item.plannedQuantity}</TableCell>
                      <TableCell className="text-center font-semibold text-green-600">
                        {item.completedQuantity}
                      </TableCell>
                      <TableCell className="text-center font-semibold text-red-600">
                        {item.rejectedQuantity}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={item.efficiency >= 90 ? "default" : item.efficiency >= 75 ? "secondary" : "destructive"}>
                          {item.efficiency}%
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell>{item.team}</TableCell>
                      <TableCell className="capitalize">{item.shift}</TableCell>
                      <TableCell>
                        {item.startTime}{item.endTime ? ` - ${item.endTime}` : ' (ongoing)'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            
            {filteredData.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No production data found for the selected filters.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Card */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-2">Performance Highlights</h4>
                <ul className="space-y-1 text-sm">
                  <li>• Overall efficiency: {metrics.overallEfficiency}%</li>
                  <li>• Top performing team: {metrics.topPerformingTeam}</li>
                  <li>• Completion rate: {Math.round((metrics.completedWorkOrders / metrics.totalWorkOrders) * 100)}%</li>
                  <li>• Rejection rate: {Math.round((metrics.totalRejection / metrics.totalProduction) * 100)}%</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Action Items</h4>
                <ul className="space-y-1 text-sm">
                  {metrics.delayedWorkOrders > 0 && (
                    <li className="text-red-600">• {metrics.delayedWorkOrders} delayed work orders need attention</li>
                  )}
                  {metrics.totalRejection > 0 && (
                    <li className="text-orange-600">• Review quality processes for {metrics.totalRejection} rejected items</li>
                  )}
                  {metrics.overallEfficiency < 85 && (
                    <li className="text-yellow-600">• Overall efficiency below target (85%)</li>
                  )}
                  {metrics.overallEfficiency >= 95 && (
                    <li className="text-green-600">• Excellent performance - efficiency above 95%</li>
                  )}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}