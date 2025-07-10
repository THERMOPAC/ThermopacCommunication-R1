import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { 
  Plus, 
  Calendar, 
  MapPin, 
  Clock, 
  DollarSign, 
  FileText, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Plane,
  Hotel,
  Car,
  Receipt,
  Users,
  TrendingUp
} from 'lucide-react';

// Form schemas
const tripFormSchema = z.object({
  tripTitle: z.string().min(1, 'Trip title is required'),
  purpose: z.string().min(1, 'Purpose is required'),
  destination: z.string().min(1, 'Destination is required'),
  fromDate: z.string().min(1, 'From date is required'),
  toDate: z.string().min(1, 'To date is required'),
  estimatedTravelCost: z.string().default('0'),
  estimatedAccommodationCost: z.string().default('0'),
  estimatedMiscCost: z.string().default('0'),
  advanceRequested: z.string().default('0'),
  supportingDocumentUrl: z.string().optional(),
});

const approvalFormSchema = z.object({
  action: z.enum(['approve', 'reject']),
  comments: z.string().optional(),
  approvalType: z.enum(['manager', 'admin', 'finance']),
});

type TripFormData = z.infer<typeof tripFormSchema>;
type ApprovalFormData = z.infer<typeof approvalFormSchema>;

// Status badge component
const StatusBadge = ({ status }: { status: string }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'submitted':
        return 'bg-yellow-100 text-yellow-800';
      case 'manager_approved':
        return 'bg-blue-100 text-blue-800';
      case 'final_approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'draft':
        return 'Draft';
      case 'submitted':
        return 'Submitted';
      case 'manager_approved':
        return 'Manager Approved';
      case 'final_approved':
        return 'Final Approved';
      case 'rejected':
        return 'Rejected';
      default:
        return status;
    }
  };

  return (
    <Badge className={getStatusColor(status)}>
      {getStatusText(status)}
    </Badge>
  );
};

// Trip request form component
const TripRequestForm = ({ onSuccess }: { onSuccess?: () => void }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Get current user information
  const { data: currentUser } = useQuery({
    queryKey: ['/api/auth/user'],
    queryFn: () => apiRequest('GET', '/api/auth/user')
  });
  
  const form = useForm<TripFormData>({
    resolver: zodResolver(tripFormSchema),
    defaultValues: {
      tripTitle: '',
      purpose: '',
      destination: '',
      fromDate: '',
      toDate: '',
      estimatedTravelCost: '0',
      estimatedAccommodationCost: '0',
      estimatedMiscCost: '0',
      advanceRequested: '0',
      supportingDocumentUrl: '',
    },
  });

  const createTripMutation = useMutation({
    mutationFn: (data: TripFormData) => apiRequest('POST', '/api/trips', data),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Trip request created successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/trips'] });
      form.reset();
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create trip request',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: TripFormData) => {
    createTripMutation.mutate(data);
  };

  const totalEstimatedCost = 
    parseFloat(form.watch('estimatedTravelCost') || '0') +
    parseFloat(form.watch('estimatedAccommodationCost') || '0') +
    parseFloat(form.watch('estimatedMiscCost') || '0');

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Requester Information */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center space-x-3">
            <Users className="h-5 w-5 text-blue-600" />
            <div>
              <h3 className="font-semibold text-blue-900">Trip Requester</h3>
              <p className="text-blue-700">
                {currentUser ? (
                  <>
                    <span className="font-medium">
                      {currentUser.firstName && currentUser.lastName 
                        ? `${currentUser.firstName} ${currentUser.lastName}` 
                        : currentUser.username}
                    </span>
                    {currentUser.role && (
                      <span className="text-blue-600 ml-2">({currentUser.role})</span>
                    )}
                    {currentUser.department && (
                      <span className="text-blue-600 ml-2">• {currentUser.department}</span>
                    )}
                  </>
                ) : (
                  'Loading user information...'
                )}
              </p>
              {currentUser?.email && (
                <p className="text-sm text-blue-600">{currentUser.email}</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="tripTitle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Trip Title</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Client Meeting in Mumbai" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="destination"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Destination</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Mumbai, India" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="purpose"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Purpose of Travel</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Describe the purpose of your business trip..." 
                  rows={3}
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="fromDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>From Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="toDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>To Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Estimated Costs</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="estimatedTravelCost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Travel Cost (₹)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="estimatedAccommodationCost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Accommodation Cost (₹)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="estimatedMiscCost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Miscellaneous Cost (₹)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="font-medium">Total Estimated Cost:</span>
              <span className="text-lg font-bold text-blue-600">₹{totalEstimatedCost.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <FormField
          control={form.control}
          name="advanceRequested"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Advance Requested (₹)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" placeholder="0" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="supportingDocumentUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Supporting Document URL</FormLabel>
              <FormControl>
                <Input placeholder="https://..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-4">
          <Button type="button" variant="outline" onClick={() => form.reset()}>
            Reset
          </Button>
          <Button type="submit" disabled={createTripMutation.isPending}>
            {createTripMutation.isPending ? 'Creating...' : 'Create Trip Request'}
          </Button>
        </div>
      </form>
    </Form>
  );
};

// Trip dashboard component
const TripDashboard = () => {
  const { data: dashboard } = useQuery({
    queryKey: ['/api/trips/dashboard'],
    queryFn: () => apiRequest('GET', '/api/trips/dashboard'),
  });

  if (!dashboard) return <div>Loading dashboard...</div>;

  const statusCounts = dashboard.statusCounts || [];
  const upcomingTrips = dashboard.upcomingTrips || [];
  const pendingApprovals = dashboard.pendingApprovals || [];

  return (
    <div className="space-y-6">
      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {statusCounts.map((status: any) => (
          <Card key={status.status}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 capitalize">{status.status.replace('_', ' ')}</p>
                  <p className="text-2xl font-bold">{status.count}</p>
                </div>
                <div className="text-blue-600">
                  {status.status === 'final_approved' && <CheckCircle className="h-8 w-8" />}
                  {status.status === 'rejected' && <XCircle className="h-8 w-8" />}
                  {status.status === 'submitted' && <Clock className="h-8 w-8" />}
                  {status.status === 'draft' && <FileText className="h-8 w-8" />}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Upcoming Trips */}
      {upcomingTrips.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Upcoming Trips
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {upcomingTrips.map((trip: any) => (
                <div key={trip.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">{trip.tripTitle}</p>
                    <p className="text-sm text-gray-600">{trip.destination}</p>
                    <p className="text-sm text-gray-600">{trip.employeeName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{new Date(trip.fromDate).toLocaleDateString()}</p>
                    <StatusBadge status={trip.status} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Approvals */}
      {pendingApprovals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Pending Approvals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingApprovals.map((trip: any) => (
                <div key={trip.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                  <div>
                    <p className="font-medium">{trip.tripTitle}</p>
                    <p className="text-sm text-gray-600">{trip.destination}</p>
                    <p className="text-sm text-gray-600">{trip.employeeName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{new Date(trip.fromDate).toLocaleDateString()}</p>
                    <StatusBadge status={trip.status} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// Trip list component
const TripList = () => {
  const { data: trips, isLoading } = useQuery({
    queryKey: ['/api/trips/user'],
    queryFn: () => apiRequest('GET', '/api/trips/user'),
  });

  if (isLoading) return <div>Loading trips...</div>;

  return (
    <div className="space-y-4">
      {trips?.map((trip: any) => (
        <Card key={trip.id}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-semibold mb-2">{trip.tripTitle}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span>{trip.destination}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>{new Date(trip.fromDate).toLocaleDateString()} - {new Date(trip.toDate).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    <span>₹{(parseFloat(trip.estimatedTravelCost) + parseFloat(trip.estimatedAccommodationCost) + parseFloat(trip.estimatedMiscCost)).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>{new Date(trip.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <p className="mt-2 text-sm text-gray-700">{trip.purpose}</p>
              </div>
              <div className="ml-4">
                <StatusBadge status={trip.status} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

// Main component
export default function BusinessTripManagement() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Business Trip Management</h1>
            <p className="text-gray-600 mt-2">Request, track, and manage business travel</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Request Trip
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Trip Request</DialogTitle>
              </DialogHeader>
              <TripRequestForm onSuccess={() => setIsCreateDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="request">Request Trip</TabsTrigger>
            <TabsTrigger value="approvals">Approvals</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <TripDashboard />
          </TabsContent>

          <TabsContent value="request">
            <Card>
              <CardHeader>
                <CardTitle>My Trip Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <TripList />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="approvals">
            <Card>
              <CardHeader>
                <CardTitle>Pending Approvals</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">Approval workflow functionality coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports">
            <Card>
              <CardHeader>
                <CardTitle>Trip Reports</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">Reporting functionality coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}