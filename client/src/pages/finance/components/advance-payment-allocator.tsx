import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { 
  Alert,
  AlertDescription,
  AlertTitle
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowUpRight,
  CreditCard, 
  Loader2, 
  Wallet,
  DollarSign,
  Check 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface AdvancePaymentAllocatorProps {
  invoiceId: number;
  customerId: number;
  invoiceType: string;
  outstandingAmount: number;
  currency?: string;
  onAllocationComplete?: () => void;
}

export default function AdvancePaymentAllocator({ 
  invoiceId, 
  customerId, 
  invoiceType,
  outstandingAmount,
  currency = 'USD',
  onAllocationComplete
}: AdvancePaymentAllocatorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Fetch unallocated advance payments for this customer and type
  const {
    data: advancePayments,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: [`/api/finance/payments/unallocated-advances`, invoiceType],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/finance/payments/unallocated-advances`);
      const data = await response.json();
      
      // Filter by customer and matching payment type
      return data.advances.filter((advance: any) => 
        advance.customerId === customerId && 
        advance.paymentType === invoiceType
      );
    },
    enabled: !!customerId && !!invoiceType
  });

  // Mutation to apply advance payment
  const applyAdvancesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/finance/invoices/${invoiceId}/apply-advances`);
    },
    onSuccess: async (response) => {
      const result = await response.json();
      
      toast({
        title: "Success!",
        description: `Applied ${result.allocations?.length || 0} advance payments totaling ${currency} ${result.totalApplied?.toFixed(2) || 0}`,
        variant: "default",
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: [`/api/finance/invoices/${invoiceId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/finance/invoices/${invoiceId}/allocations`] });
      queryClient.invalidateQueries({ queryKey: [`/api/finance/payments/unallocated-advances`] });
      
      // Close the dialog
      setIsDialogOpen(false);
      
      // Callback if provided
      if (onAllocationComplete) {
        onAllocationComplete();
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error applying advance payments",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Handle apply button click
  const handleApplyAdvances = () => {
    applyAdvancesMutation.mutate();
  };
  
  // Calculate total available advance payment amount
  const totalAvailableAmount = advancePayments && Array.isArray(advancePayments) 
    ? advancePayments.reduce((sum: number, payment: any) => sum + parseFloat(payment.unallocatedAmount || 0), 0)
    : 0;
    
  // Don't render anything if no advance payments are available or invoice is fully paid
  if ((advancePayments && advancePayments.length === 0) || outstandingAmount <= 0) {
    return null;
  }
  
  return (
    <Card className="mb-4 border-dashed border-yellow-400">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center text-yellow-700">
              <Wallet className="mr-2 h-5 w-5" />
              Available Advance Payments
            </CardTitle>
            <CardDescription>
              Unallocated advance payments that can be applied to this invoice
            </CardDescription>
          </div>
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
            {advancePayments?.length || 0} Available
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2">Checking for advance payments...</span>
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Failed to load advance payments. Please try again later.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="text-sm">
            <p className="mb-2">
              <span className="font-medium">Total Available:</span>{" "}
              <span className="text-green-600 font-semibold">
                {currency} {totalAvailableAmount.toFixed(2)}
              </span>
            </p>
            <p className="text-muted-foreground">
              Applying advance payments will automatically reduce the outstanding amount on this invoice.
            </p>
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-0">
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              className="w-full border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100"
              disabled={isLoading || applyAdvancesMutation.isPending}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Apply Advance Payments
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Apply Advance Payments</DialogTitle>
              <DialogDescription>
                This will automatically apply all available advance payments from this customer to reduce the invoice's outstanding amount.
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-4">
              <h4 className="text-sm font-semibold mb-3">Available Advance Payments</h4>
              {advancePayments && advancePayments.length > 0 ? (
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {advancePayments.map((payment: any) => (
                    <div key={payment.id} className="flex justify-between items-center p-3 bg-muted/30 rounded-md">
                      <div>
                        <div className="font-medium">{payment.referenceNumber}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(payment.paymentDate).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-green-600">
                          {currency} {parseFloat(payment.unallocatedAmount).toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground">Unallocated</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-4 text-muted-foreground">
                  No advance payments available
                </div>
              )}
              
              <div className="mt-4 bg-muted/50 p-3 rounded-md">
                <div className="flex justify-between items-center">
                  <div className="font-medium">Total Amount Available</div>
                  <div className="font-semibold text-green-600">
                    {currency} {totalAvailableAmount.toFixed(2)}
                  </div>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <div className="font-medium">Invoice Outstanding</div>
                  <div className="font-semibold text-red-600">
                    {currency} {outstandingAmount.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
                disabled={applyAdvancesMutation.isPending}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleApplyAdvances}
                disabled={applyAdvancesMutation.isPending || totalAvailableAmount <= 0}
                className="bg-green-600 hover:bg-green-700"
              >
                {applyAdvancesMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <DollarSign className="mr-2 h-4 w-4" />
                    Apply Payments
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}