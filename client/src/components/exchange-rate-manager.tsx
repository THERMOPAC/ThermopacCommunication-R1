import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, DollarSign, Save, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ExchangeRateData {
  exchangeRate: number;
  source: 'api' | 'manual' | 'fallback';
  lastUpdated: string | null;
  fromCurrency: string;
  toCurrency: string;
}

export default function ExchangeRateManager() {
  const [manualRate, setManualRate] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch current exchange rate
  const { data: exchangeRateData, isLoading } = useQuery<ExchangeRateData>({
    queryKey: ["/api/exchange-rate"],
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  // Update exchange rate manually
  const updateMutation = useMutation({
    mutationFn: async (rate: number) => {
      const response = await apiRequest('/api/exchange-rate', {
        method: 'POST',
        body: JSON.stringify({ exchangeRate: rate }),
        headers: { 'Content-Type': 'application/json' },
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exchange-rate"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-marketing/dashboard/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-marketing/dashboard/orders-in-hand"] });
      setManualRate("");
      toast({
        title: "Success",
        description: "Exchange rate updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update exchange rate",
        variant: "destructive",
      });
    },
  });

  // Refresh from API
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/exchange-rate/refresh', {
        method: 'POST',
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exchange-rate"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-marketing/dashboard/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-marketing/dashboard/orders-in-hand"] });
      toast({
        title: "Success",
        description: "Exchange rate refreshed from API",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to refresh exchange rate",
        variant: "destructive",
      });
    },
  });

  const handleManualUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    const rate = parseFloat(manualRate);
    if (!rate || rate <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid exchange rate",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate(rate);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'api': return 'bg-green-100 text-green-800';
      case 'manual': return 'bg-blue-100 text-blue-800';
      case 'fallback': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'api': return <RefreshCw className="h-3 w-3" />;
      case 'manual': return <Save className="h-3 w-3" />;
      case 'fallback': return <AlertCircle className="h-3 w-3" />;
      default: return <DollarSign className="h-3 w-3" />;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <DollarSign className="h-5 w-5" />
          Exchange Rate Manager
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Rate Display */}
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <div>
            <div className="text-sm text-muted-foreground">Current Rate (USD → INR)</div>
            {isLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <div className="font-semibold text-lg">
                ₹{exchangeRateData?.exchangeRate?.toFixed(4) || '83.5000'}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 mb-1">
              {isLoading ? (
                <Skeleton className="h-5 w-16" />
              ) : (
                <Badge className={`${getSourceColor(exchangeRateData?.source || 'fallback')} flex items-center gap-1`}>
                  {getSourceIcon(exchangeRateData?.source || 'fallback')}
                  {exchangeRateData?.source || 'fallback'}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Updated: {isLoading ? (
                <Skeleton className="h-3 w-24 inline-block" />
              ) : (
                formatDate(exchangeRateData?.lastUpdated || null)
              )}
            </div>
          </div>
        </div>

        {/* Manual Update Section */}
        <div className="space-y-2">
          <Label htmlFor="manual-rate">Manual Rate Update</Label>
          <form onSubmit={handleManualUpdate} className="flex gap-2">
            <Input
              id="manual-rate"
              type="number"
              step="0.0001"
              min="0.0001"
              placeholder="Enter new rate (e.g., 85.5000)"
              value={manualRate}
              onChange={(e) => setManualRate(e.target.value)}
              className="flex-1"
            />
            <Button 
              type="submit" 
              disabled={updateMutation.isPending || !manualRate}
              size="sm"
            >
              {updateMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                  Updating
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  Update
                </>
              )}
            </Button>
          </form>
        </div>

        {/* API Refresh Section */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-sm text-muted-foreground">
            Refresh from live API (open.er-api.com)
          </div>
          <Button 
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            variant="outline"
            size="sm"
          >
            {refreshMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                Refreshing
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh API
              </>
            )}
          </Button>
        </div>

        {/* Usage Note */}
        <div className="text-xs text-muted-foreground bg-blue-50 p-2 rounded border-l-2 border-blue-200">
          <strong>Note:</strong> This rate is used for calculating Expected Revenue and Orders in Hand values in the Marketing Dashboard.
        </div>
      </CardContent>
    </Card>
  );
}