import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Settings, Lock, Unlock, AlertCircle, CheckCircle } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface SapCredentials {
  username: string;
  password: string;
  companyDb: string;
}

interface SapConnectionStatus {
  isConnected: boolean;
  lastTestTime?: string;
  error?: string;
}

export function SapCredentialsDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [credentials, setCredentials] = useState<SapCredentials>({
    username: '',
    password: '',
    companyDb: 'TPEL_LIVE'
  });
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query SAP connection status
  const { data: connectionStatus, isLoading: statusLoading } = useQuery<SapConnectionStatus>({
    queryKey: ['/api/sap/connection/status'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Test SAP connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async (creds: SapCredentials) => {
      return apiRequest('/api/sap/connection/test', {
        method: 'POST',
        body: JSON.stringify(creds),
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: () => {
      toast({
        title: "SAP Connection Successful",
        description: "Successfully connected to SAP B1 Service Layer",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/sap/connection/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sap/purchase/purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sap/purchase/dashboard-stats'] });
    },
    onError: (error: any) => {
      toast({
        title: "SAP Connection Failed",
        description: error.message || "Failed to connect to SAP B1",
        variant: "destructive",
      });
    }
  });

  // Save SAP credentials mutation
  const saveCredentialsMutation = useMutation({
    mutationFn: async (creds: SapCredentials) => {
      return apiRequest('/api/sap/credentials', {
        method: 'POST',
        body: JSON.stringify(creds),
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: () => {
      toast({
        title: "Credentials Saved",
        description: "SAP credentials have been updated successfully",
      });
      // Test connection immediately after saving
      testConnectionMutation.mutate(credentials);
      setIsOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Save Failed", 
        description: error.message || "Failed to save SAP credentials",
        variant: "destructive",
      });
    }
  });

  const handleSave = () => {
    if (!credentials.username || !credentials.password || !credentials.companyDb) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    saveCredentialsMutation.mutate(credentials);
  };

  const handleTestOnly = () => {
    if (!credentials.username || !credentials.password || !credentials.companyDb) {
      toast({
        title: "Missing Information", 
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    testConnectionMutation.mutate(credentials);
  };

  const isConnected = connectionStatus?.isConnected;
  const hasError = connectionStatus?.error;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant={isConnected ? "outline" : "destructive"} 
          size="sm"
          className="gap-2"
        >
          {statusLoading ? (
            <>
              <Settings className="h-4 w-4 animate-spin" />
              Checking...
            </>
          ) : isConnected ? (
            <>
              <CheckCircle className="h-4 w-4 text-green-600" />
              SAP Connected
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4" />
              SAP Credentials
            </>
          )}
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            SAP B1 Credentials
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Connection Status Alert */}
          {connectionStatus && (
            <Alert className={isConnected ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
              <AlertCircle className={`h-4 w-4 ${isConnected ? "text-green-600" : "text-red-600"}`} />
              <AlertDescription>
                {isConnected ? (
                  <>
                    <strong>Connected</strong> - SAP Service Layer is accessible
                    {connectionStatus.lastTestTime && (
                      <div className="text-xs text-gray-500 mt-1">
                        Last tested: {new Date(connectionStatus.lastTestTime).toLocaleString()}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <strong>Disconnected</strong> - {hasError || "Unable to connect to SAP B1"}
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Username Field */}
          <div className="space-y-2">
            <Label htmlFor="sapUsername">SAP Username</Label>
            <Input
              id="sapUsername"
              type="text"
              placeholder="Enter SAP username"
              value={credentials.username}
              onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
            />
          </div>

          {/* Password Field */}
          <div className="space-y-2">
            <Label htmlFor="sapPassword">SAP Password</Label>
            <div className="relative">
              <Input
                id="sapPassword"
                type={showPassword ? "text" : "password"}
                placeholder="Enter SAP password"
                value={credentials.password}
                onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Company Database Field */}
          <div className="space-y-2">
            <Label htmlFor="sapCompanyDb">Company Database</Label>
            <Input
              id="sapCompanyDb"
              type="text"
              placeholder="e.g., TPEL_LIVE"
              value={credentials.companyDb}
              onChange={(e) => setCredentials(prev => ({ ...prev, companyDb: e.target.value }))}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleTestOnly}
              variant="outline"
              disabled={testConnectionMutation.isPending}
              className="flex-1"
            >
              {testConnectionMutation.isPending ? (
                <>
                  <Settings className="h-4 w-4 animate-spin mr-2" />
                  Testing...
                </>
              ) : (
                "Test Connection"
              )}
            </Button>
            
            <Button
              onClick={handleSave}
              disabled={saveCredentialsMutation.isPending || testConnectionMutation.isPending}
              className="flex-1"
            >
              {saveCredentialsMutation.isPending ? (
                <>
                  <Settings className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save & Connect"
              )}
            </Button>
          </div>

          {/* Help Text */}
          <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded">
            <strong>Note:</strong> These credentials are used to connect to your SAP B1 Service Layer API. 
            Make sure the username has appropriate permissions to access purchase order data.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}