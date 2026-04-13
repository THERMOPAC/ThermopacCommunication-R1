import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Upload, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

// G8: INS controlled label vocabulary
const INS_LABELS = [
  'inspection-report',
  'test-certificate',
  'witness-record',
  'third-party-report',
  'ndt-certificate',
  'hardness-test',
  'dimensional-report',
  'material-traceability',
];

interface InspectionDocumentUploadProps {
  inspectionOrderNumber: string;
  tabName: string;
  recordId: string;
  onSuccess?: (data: any) => void;
  className?: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const InspectionDocumentUpload: React.FC<InspectionDocumentUploadProps> = ({
  inspectionOrderNumber,
  tabName,
  recordId,
  onSuccess,
  className = '',
  variant = 'outline',
  size = 'sm'
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [insLabel, setInsLabel] = useState('');
  const [drawingNumber, setDrawingNumber] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const openDialog = () => {
    setInsLabel('');
    setDrawingNumber('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setDialogOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file && file.type !== 'application/pdf') {
      toast({ title: 'Invalid file type', description: 'Please select a PDF file', variant: 'destructive' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({ title: 'No file selected', description: 'Please choose a PDF file', variant: 'destructive' });
      return;
    }
    if (!insLabel) {
      toast({ title: 'Label required', description: 'Select a document label from the controlled vocabulary.', variant: 'destructive' });
      return;
    }
    if (!drawingNumber.trim()) {
      toast({ title: 'Drawing number required', description: 'Enter the drawing or document reference number.', variant: 'destructive' });
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('inspectionOrderNumber', inspectionOrderNumber);
    formData.append('tabName', tabName);
    formData.append('recordId', recordId);
    formData.append('label', insLabel);
    formData.append('drawingNumber', drawingNumber.trim());

    try {
      setIsUploading(true);
      const response = await fetch('/api/quality/inspection-documents/upload', {
        method: 'POST',
        body: formData,
      }).then(res => res.json());

      if (response.success) {
        toast({ title: 'Document uploaded successfully', variant: 'default' });
        queryClient.invalidateQueries({
          queryKey: ['/api/quality/inspection-documents', inspectionOrderNumber, tabName, recordId]
        });
        setDialogOpen(false);
        if (onSuccess) onSuccess(response);
      } else {
        throw new Error(response.error || 'Failed to upload document');
      }
    } catch (error) {
      console.error('Error uploading document:', error);
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'An error occurred while uploading',
        variant: 'destructive'
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="application/pdf"
        style={{ display: 'none' }}
      />

      <Button
        type="button"
        variant={variant === 'outline' ? 'default' : variant}
        size={size}
        className={`${className} shadow-sm hover:shadow-md transition-all border-2 hover:border-primary`}
        onClick={openDialog}
        disabled={isUploading}
      >
        <Upload className="mr-2 h-4 w-4" />
        Upload Document
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Upload Inspection Document</DialogTitle>
            <DialogDescription>
              {tabName} — {inspectionOrderNumber}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Document Label <span className="text-red-500">*</span></Label>
              <Select value={insLabel} onValueChange={setInsLabel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select from controlled vocabulary..." />
                </SelectTrigger>
                <SelectContent>
                  {INS_LABELS.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Select the approved label for this inspection document.</p>
            </div>

            <div className="grid gap-2">
              <Label>Drawing / Reference Number <span className="text-red-500">*</span></Label>
              <Input
                value={drawingNumber}
                onChange={(e) => setDrawingNumber(e.target.value)}
                placeholder="e.g. TPEL-DWG-001, IO-2025-003"
              />
              <p className="text-[11px] text-muted-foreground">Required for GCS path construction. Use the drawing or document reference number.</p>
            </div>

            <div className="grid gap-2">
              <Label>PDF File <span className="text-red-500">*</span></Label>
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-3 w-3 mr-1" /> Choose PDF
                </Button>
                {selectedFile && (
                  <span className="text-sm text-muted-foreground truncate max-w-[200px]">{selectedFile.name}</span>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isUploading}>Cancel</Button>
            <Button onClick={handleUpload} disabled={isUploading || !selectedFile || !insLabel || !drawingNumber.trim()}>
              {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default InspectionDocumentUpload;
