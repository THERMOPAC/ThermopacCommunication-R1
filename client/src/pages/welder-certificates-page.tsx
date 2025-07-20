import { useParams, useLocation } from "wouter";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  Clock,
  Download,
  Edit,
  Eye,
  Loader2,
  Plus,
  Trash2,
  Triangle,
  X,
} from "lucide-react";
import Layout from "@/components/layout";
import dayjs from "dayjs";
import { WelderPhotoUpload } from "@/components/welder-photo-upload";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";

interface Welder {
  id: number;
  welderId: string;
  name: string;
  trade: string;
  status: string;
}

interface WelderCertificate {
  id: number;
  // Either camelCase (frontend) or snake_case (backend) properties will be present
  welderId?: number;
  certificateNo?: string;
  certificateType?: string;
  description?: string;
  issueDate?: string;
  expiryDate?: string;
  filePath?: string;
  fileUrl?: string;
  status?: string;
  createdAt?: string;
  wpqrId?: number;
  wpqrDocumentId?: string;
  
  // Backend properties (snake_case)
  welder_id?: number;
  certificate_no?: string;
  certificate_type?: string;
  issue_date?: string;
  expiry_date?: string;
  file_path?: string;
  file_url?: string;
  created_at?: string;
  wpqr_id?: number;
  wpqr_document_id?: string;
  
  // Any other properties
  [key: string]: any;
}

interface WPQR {
  id: number;
  documentId: string;
  title: string;
}

export default function WelderCertificatesPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const params = useParams();
  const welderId = params.welderId ? parseInt(params.welderId) : undefined;

  // Form state
  const [isAddCertificateOpen, setIsAddCertificateOpen] = useState(false);
  const [isEditCertificateOpen, setIsEditCertificateOpen] = useState(false);
  const [selectedCertificate, setSelectedCertificate] = useState<WelderCertificate | null>(null);
  const [isEditFileMode, setIsEditFileMode] = useState(false);
  const [certificateForm, setCertificateForm] = useState({
    certificateType: "WELDER_QUALIFICATION",
    certificateNo: "",
    issueDate: "",
    expiryDate: "",
    description: "",
    wpqrId: "",
    status: "Active"
  });
  const [certificateFile, setCertificateFile] = useState<File | null>(null);

  // Fetch welder details
  const { data: welder, isLoading: isWelderLoading } = useQuery<Welder>({
    queryKey: ["/api/quality/welders", welderId],
    queryFn: async () => {
      if (!welderId) throw new Error("No welder ID provided");
      const response = await fetch(`/api/quality/welders/${welderId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch welder details");
      }
      return response.json();
    },
    enabled: !!welderId,
  });

  // Fetch certificates for this welder
  const {
    data: certificates = [],
    isLoading: isCertificatesLoading,
    refetch: refetchCertificates,
  } = useQuery<WelderCertificate[]>({
    queryKey: ["/api/quality/welder-certificates", welderId],
    queryFn: async () => {
      if (!welderId) return [];
      const response = await fetch(
        `/api/quality/welder-certificates/welder/${welderId}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch certificates");
      }
      return response.json();
    },
    enabled: !!welderId,
  });

  // Fetch WPQR data for dropdown
  const { data: wpqrData = [] } = useQuery<WPQR[]>({
    queryKey: ["/api/quality/wpqr"],
    staleTime: 60000, // 1 minute
  });

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCertificateForm({
      ...certificateForm,
      [name]: value,
    });
  };

  // Handle certificate type selection
  const handleCertificateTypeChange = (value: string) => {
    setCertificateForm({
      ...certificateForm,
      certificateType: value,
    });
  };

  // Handle WPQR selection
  const handleWPQRChange = (value: string) => {
    setCertificateForm({
      ...certificateForm,
      wpqrId: value,
    });
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setCertificateFile(e.target.files[0]);
    }
  };

  // Reset form
  const resetForm = () => {
    setCertificateForm({
      certificateType: "WELDER_QUALIFICATION",
      certificateNo: "",
      issueDate: "",
      expiryDate: "",
      description: "",
      wpqrId: "",
      status: "Active"
    });
    setCertificateFile(null);
  };

  // Certificate upload mutation
  const uploadCertificateMutation = useMutation({
    mutationFn: async ({
      welderId,
      formData,
    }: {
      welderId: number;
      formData: FormData;
    }) => {
      const response = await fetch(
        `/api/quality/welder-certificates/${welderId}`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to upload certificate");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Certificate added successfully",
      });
      setIsAddCertificateOpen(false);
      resetForm();
      refetchCertificates();
    },
    onError: (error: Error) => {
      toast({
        title: "Error uploading certificate",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Certificate update mutation (metadata only)
  const updateCertificateMutation = useMutation({
    mutationFn: async ({
      certificateId,
      data,
    }: {
      certificateId: number;
      data: any;
    }) => {
      const response = await fetch(
        `/api/quality/welder-certificates/${certificateId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to update certificate");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Certificate updated successfully",
      });
      setIsEditCertificateOpen(false);
      resetForm();
      refetchCertificates();
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating certificate",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Certificate file update mutation
  const updateCertificateFileMutation = useMutation({
    mutationFn: async ({
      certificateId,
      formData
    }: {
      certificateId: number;
      formData: FormData 
    }) => {
      const response = await fetch(
        `/api/quality/welder-certificates/${certificateId}/file`,
        {
          method: "PUT",
          body: formData,
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to update certificate file");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Certificate file updated successfully",
      });
      setIsEditCertificateOpen(false);
      resetForm();
      refetchCertificates();
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating certificate file",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Certificate deletion state and mutation
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [certificateToDelete, setCertificateToDelete] = useState<number | null>(null);

  const deleteCertificateMutation = useMutation({
    mutationFn: async (certificateId: number) => {
      const response = await fetch(
        `/api/quality/welder-certificates/${certificateId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to delete certificate");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Certificate deleted successfully",
      });
      setIsDeleteDialogOpen(false);
      setCertificateToDelete(null);
      refetchCertificates();
    },
    onError: (error: Error) => {
      toast({
        title: "Error deleting certificate",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle certificate download
  const handleDownloadCertificate = async (certificateId: number, certificateNo: string) => {
    try {
      // Get a fresh signed URL
      const response = await fetch(`/api/quality/welder-certificates/${certificateId}/url`);
      
      if (!response.ok) {
        throw new Error("Failed to get download URL");
      }
      
      const data = await response.json();
      
      if (!data.fileUrl) {
        throw new Error("No file URL received");
      }
      
      // Open the signed URL in a new tab (this will download the file)
      window.open(data.fileUrl, '_blank');
      
      toast({
        title: "Download started",
        description: `Certificate ${certificateNo} is downloading`,
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  // Handle certificate edit
  const handleEditCertificate = (certificate: WelderCertificate) => {
    setSelectedCertificate(certificate);
    setCertificateForm({
      certificateType: certificate.certificate_type || certificate.certificateType || "WELDER_QUALIFICATION",
      certificateNo: certificate.certificate_no || certificate.certificateNo || "",
      issueDate: certificate.issue_date || certificate.issueDate || "",
      expiryDate: certificate.expiry_date || certificate.expiryDate || "",
      description: certificate.description || "",
      wpqrId: certificate.wpqr_id ? String(certificate.wpqr_id) : certificate.wpqrId ? String(certificate.wpqrId) : "",
      status: certificate.status || "Active"
    });
    setIsEditFileMode(false);
    setIsEditCertificateOpen(true);
  };

  // Handle certificate update
  const handleUpdateCertificate = () => {
    if (!selectedCertificate) {
      toast({
        title: "Error",
        description: "No certificate selected",
        variant: "destructive",
      });
      return;
    }

    if (isEditFileMode && !certificateFile) {
      toast({
        title: "Error",
        description: "Please select a file",
        variant: "destructive",
      });
      return;
    }

    if (isEditFileMode) {
      // Update with new file
      const formData = new FormData();
      formData.append("file", certificateFile!);
      
      updateCertificateFileMutation.mutate({
        certificateId: selectedCertificate.id,
        formData
      });
    } else {
      // Update metadata only
      updateCertificateMutation.mutate({
        certificateId: selectedCertificate.id,
        data: {
          certificateType: certificateForm.certificateType,
          certificateNo: certificateForm.certificateNo,
          description: certificateForm.description,
          issueDate: certificateForm.issueDate,
          expiryDate: certificateForm.expiryDate,
          status: certificateForm.status,
          wpqrId: certificateForm.wpqrId || null
        }
      });
    }
  };

  // Handle certificate upload
  const handleCertificateUpload = () => {
    if (!welderId) {
      toast({
        title: "Error",
        description: "No welder selected",
        variant: "destructive",
      });
      return;
    }

    if (!certificateFile) {
      toast({
        title: "Error",
        description: "Please select a certificate file",
        variant: "destructive",
      });
      return;
    }

    if (
      !certificateForm.issueDate ||
      !certificateForm.expiryDate
    ) {
      toast({
        title: "Error",
        description: "Please fill all required fields",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("file", certificateFile);
    formData.append("certificateType", "WELDER_QUALIFICATION");
    formData.append("issueDate", certificateForm.issueDate);
    formData.append("expiryDate", certificateForm.expiryDate);
    formData.append("description", certificateForm.description || "");
    
    // Add WPQR ID if selected
    if (certificateForm.wpqrId) {
      formData.append("wpqrId", certificateForm.wpqrId);
    }

    uploadCertificateMutation.mutate({
      welderId,
      formData,
    });
  };

  return (
    <Layout>
      <div className="container mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <div>
            <Button
              variant="outline"
              onClick={() => navigate("/welder-management")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Welder Management
            </Button>
            <h1 className="text-2xl font-bold mt-4">
              {isWelderLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  Certificates for {welder?.name}
                  <span className="text-sm font-normal ml-2 text-muted-foreground">
                    (ID: {welder?.welderId})
                  </span>
                </>
              )}
            </h1>
          </div>
          <Button onClick={() => setIsAddCertificateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add New Certificate
          </Button>
        </div>

        {isCertificatesLoading ? (
          <div className="flex justify-center my-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : certificates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="rounded-full bg-muted p-3 mb-4">
                <Calendar className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No Certificates</h3>
              <p className="text-muted-foreground text-center max-w-md mb-4">
                This welder doesn't have any certificates yet. Add certificates
                to track qualifications and certifications.
              </p>
              <Button onClick={() => setIsAddCertificateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add Certificate
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Welder Certificates</CardTitle>
                <CardDescription>
                  View and manage certificates for {welder?.name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Certificate No.</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Issue Date</TableHead>
                      <TableHead>Expiry Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {certificates.map((cert) => {
                      const certificateId = cert.id;
                      const certificateNo = cert.certificate_no || cert.certificateNo;
                      const certificateType = cert.certificate_type || cert.certificateType;
                      const issueDate = cert.issue_date || cert.issueDate;
                      const expiryDate = cert.expiry_date || cert.expiryDate;
                      const status = cert.status || "Active";
                      
                      // Calculate if certificate is expired
                      const isExpired = expiryDate ? new Date(expiryDate) < new Date() : false;
                      
                      // Calculate days until expiry
                      const today = new Date();
                      const expiry = expiryDate ? new Date(expiryDate) : null;
                      const daysUntilExpiry = expiry ? Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : 0;
                      const isExpiringSoon = !isExpired && daysUntilExpiry <= 30;
                      
                      return (
                        <TableRow key={certificateId}>
                          <TableCell className="font-medium">{certificateNo}</TableCell>
                          <TableCell>{certificateType}</TableCell>
                          <TableCell>
                            {issueDate ? dayjs(issueDate).format('DD MMM YYYY') : '-'}
                          </TableCell>
                          <TableCell>
                            {expiryDate ? dayjs(expiryDate).format('DD MMM YYYY') : '-'}
                          </TableCell>
                          <TableCell>
                            {isExpired ? (
                              <Badge variant="destructive" className="flex items-center gap-1">
                                <X className="h-3 w-3" /> Expired
                              </Badge>
                            ) : isExpiringSoon ? (
                              <Badge variant="warning" className="flex items-center gap-1">
                                <Clock className="h-3 w-3" /> Expires in {daysUntilExpiry} days
                              </Badge>
                            ) : (
                              <Badge variant="success" className="flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" /> Valid
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleDownloadCertificate(certificateId, certificateNo || "")}
                                title="Download Certificate"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleEditCertificate(cert)}
                                title="Edit Certificate"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="text-destructive"
                                onClick={() => {
                                  setCertificateToDelete(certificateId);
                                  setIsDeleteDialogOpen(true);
                                }}
                                title="Delete Certificate"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Add Certificate Dialog */}
        <Dialog
          open={isAddCertificateOpen}
          onOpenChange={setIsAddCertificateOpen}
        >
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Certificate</DialogTitle>
              <DialogDescription>
                Upload a new certificate for {welder?.name}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label
                    htmlFor="certificateType"
                    className="text-sm font-medium mb-1 block"
                  >
                    Certificate Type*
                  </Label>
                  <Input
                    id="certificateType"
                    name="certificateType"
                    value="Welder Qualification"
                    readOnly
                    disabled
                  />
                </div>
                <div>
                  <Label
                    htmlFor="certificateNo"
                    className="text-sm font-medium mb-1 block"
                  >
                    Certificate Number*
                  </Label>
                  <Input
                    id="certificateNo"
                    name="certificateNo"
                    readOnly
                    disabled
                    placeholder="Auto-generated"
                    value={certificateForm.certificateNo}
                  />
                </div>
              </div>

              <div>
                <Label
                  htmlFor="wpqrId"
                  className="text-sm font-medium mb-1 block"
                >
                  Associated WPQR
                </Label>
                <Select
                  value={certificateForm.wpqrId}
                  onValueChange={handleWPQRChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select related WPQR document" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {wpqrData.map((wpqr) => (
                      <SelectItem key={wpqr.id} value={wpqr.id.toString()}>
                        {wpqr.documentId} - {wpqr.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label
                    htmlFor="issueDate"
                    className="text-sm font-medium mb-1 block"
                  >
                    Issue Date*
                  </Label>
                  <Input
                    id="issueDate"
                    name="issueDate"
                    type="date"
                    value={certificateForm.issueDate}
                    onChange={handleInputChange}
                    max={new Date().toISOString().split("T")[0]}
                  />
                </div>
                <div>
                  <Label
                    htmlFor="expiryDate"
                    className="text-sm font-medium mb-1 block"
                  >
                    Expiry Date*
                  </Label>
                  <Input
                    id="expiryDate"
                    name="expiryDate"
                    type="date"
                    value={certificateForm.expiryDate}
                    onChange={handleInputChange}
                    min={new Date().toISOString().split("T")[0]}
                  />
                </div>
              </div>

              <div>
                <Label
                  htmlFor="description"
                  className="text-sm font-medium mb-1 block"
                >
                  Description
                </Label>
                <Input
                  id="description"
                  name="description"
                  value={certificateForm.description}
                  onChange={handleInputChange}
                  placeholder="Brief description of certificate"
                />
              </div>

              <div>
                <Label
                  htmlFor="certificateFile"
                  className="text-sm font-medium mb-1 block"
                >
                  Certificate File*
                </Label>
                <Input
                  id="certificateFile"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="cursor-pointer"
                  onChange={handleFileChange}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Accept PDF, JPG, JPEG or PNG. Max size 5MB.
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => setIsAddCertificateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCertificateUpload}
                disabled={uploadCertificateMutation.isPending}
              >
                {uploadCertificateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...
                  </>
                ) : (
                  "Upload Certificate"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Certificate Dialog */}
        <Dialog
          open={isEditCertificateOpen}
          onOpenChange={setIsEditCertificateOpen}
        >
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Certificate</DialogTitle>
              <DialogDescription>
                Update certificate information for {welder?.name}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex items-center justify-end mb-4">
                <div className="flex items-center space-x-2">
                  <Label htmlFor="upload-mode">Replace certificate file</Label>
                  <Switch
                    id="upload-mode"
                    checked={isEditFileMode}
                    onCheckedChange={setIsEditFileMode}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label
                    htmlFor="certificateType"
                    className="text-sm font-medium mb-1 block"
                  >
                    Certificate Type*
                  </Label>
                  <Input
                    id="certificateType"
                    name="certificateType"
                    value="Welder Qualification"
                    readOnly
                    disabled
                  />
                </div>
                <div>
                  <Label
                    htmlFor="certificateNo"
                    className="text-sm font-medium mb-1 block"
                  >
                    Certificate Number*
                  </Label>
                  <Input
                    id="certificateNo"
                    name="certificateNo"
                    value={certificateForm.certificateNo}
                    readOnly
                    disabled
                  />
                </div>
              </div>

              {!isEditFileMode && (
                <>
                  <div>
                    <Label
                      htmlFor="wpqrId"
                      className="text-sm font-medium mb-1 block"
                    >
                      Associated WPQR
                    </Label>
                    <Select
                      value={certificateForm.wpqrId}
                      onValueChange={handleWPQRChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select related WPQR document" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {wpqrData.map((wpqr) => (
                          <SelectItem key={wpqr.id} value={wpqr.id.toString()}>
                            {wpqr.documentId} - {wpqr.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label
                        htmlFor="issueDate"
                        className="text-sm font-medium mb-1 block"
                      >
                        Issue Date*
                      </Label>
                      <Input
                        id="issueDate"
                        name="issueDate"
                        type="date"
                        value={certificateForm.issueDate}
                        onChange={handleInputChange}
                      />
                    </div>
                    <div>
                      <Label
                        htmlFor="expiryDate"
                        className="text-sm font-medium mb-1 block"
                      >
                        Expiry Date*
                      </Label>
                      <Input
                        id="expiryDate"
                        name="expiryDate"
                        type="date"
                        value={certificateForm.expiryDate}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>

                  <div>
                    <Label
                      htmlFor="status"
                      className="text-sm font-medium mb-1 block"
                    >
                      Status
                    </Label>
                    <Select
                      value={certificateForm.status}
                      onValueChange={(value) =>
                        setCertificateForm({ ...certificateForm, status: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Suspended">Suspended</SelectItem>
                        <SelectItem value="Revoked">Revoked</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div>
                <Label
                  htmlFor="description"
                  className="text-sm font-medium mb-1 block"
                >
                  Description
                </Label>
                <Input
                  id="description"
                  name="description"
                  value={certificateForm.description}
                  onChange={handleInputChange}
                  placeholder="Brief description of certificate"
                />
              </div>

              {isEditFileMode && (
                <div>
                  <Label
                    htmlFor="certificateFile"
                    className="text-sm font-medium mb-1 block"
                  >
                    Certificate File* (Replace Existing)
                  </Label>
                  <Input
                    id="certificateFile"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="cursor-pointer"
                    onChange={handleFileChange}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Accept PDF, JPG, JPEG or PNG. Max size 5MB.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => setIsEditCertificateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdateCertificate}
                disabled={
                  updateCertificateMutation.isPending ||
                  updateCertificateFileMutation.isPending
                }
              >
                {updateCertificateMutation.isPending ||
                updateCertificateFileMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...
                  </>
                ) : (
                  "Update Certificate"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the certificate and cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (certificateToDelete) {
                    deleteCertificateMutation.mutate(certificateToDelete);
                  }
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteCertificateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...
                  </>
                ) : (
                  "Delete Certificate"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}