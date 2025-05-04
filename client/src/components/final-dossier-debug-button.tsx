import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Bug } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface FinalDossierDebugButtonProps {
  inspectionOrderNumber: string;
  className?: string;
}

export function FinalDossierDebugButton({ inspectionOrderNumber, className }: FinalDossierDebugButtonProps) {
  const [isDebugging, setIsDebugging] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  const debugFinalDossier = async () => {
    if (!inspectionOrderNumber) {
      toast({
        title: "Error",
        description: "No inspection order number provided",
        variant: "destructive"
      });
      return;
    }

    setIsDebugging(true);
    
    try {
      const response = await fetch(`/api/quality/final-dossier/list-directory/${inspectionOrderNumber}`, {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to debug final dossier: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      setDebugInfo(data);
      
      console.log('Final Dossier Debug Info:', data);
      
      toast({
        title: "Debug Information Retrieved",
        description: "Check the console for complete details",
      });
    } catch (error) {
      console.error('Error debugging final dossier:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to debug final dossier",
        variant: "destructive"
      });
    } finally {
      setIsDebugging(false);
    }
  };

  return (
    <div className={className}>
      <Button 
        type="button"
        variant="outline" 
        size="sm"
        onClick={debugFinalDossier}
        disabled={isDebugging}
      >
        {isDebugging ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Debugging...
          </>
        ) : (
          <>
            <Bug className="h-4 w-4 mr-2" />
            Debug Dossier Path
          </>
        )}
      </Button>
      
      {debugInfo && (
        <div className="mt-2 text-xs text-muted-foreground">
          <p>Expected path: {debugInfo.expectedDossierPath}</p>
          <p>Files in inspection dir: {debugInfo.inspectionFiles?.length || 0}</p>
          <p>Files in dossier dir: {debugInfo.dossierFiles?.length || 0}</p>
        </div>
      )}
    </div>
  );
}