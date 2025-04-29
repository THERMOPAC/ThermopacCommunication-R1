import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "../lib/queryClient";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Plus, FileCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";

// Define interfaces
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
  const [certificateForm, setCertificateForm] = useState({
    certificateType: "WELDER_QUALIFICATION",
    certificateNo: "",
    issueDate: "",
    expiryDate: "",
    description: "",
    wpqrId: "",
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
        description: "Certificate uploaded successfully",
      });
      setIsAddCertificateOpen(false);
      resetForm();
      refetchCertificates();
    },
    onError: (error: Error) => {
      toast({
        title: "Error uploading certificate",
        description: error.message || "Failed to upload certificate",
        variant: "destructive",
      });
    },
  });

  // Certificate delete mutation
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
      refetchCertificates();
    },
    onError: (error: Error) => {
      toast({
        title: "Error deleting certificate",
        description: error.message || "Failed to delete certificate",
        variant: "destructive",
      });
    },
  });

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
      !certificateForm.certificateNo ||
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
    formData.append("certificateType", certificateForm.certificateType);
    formData.append("certificateNo", certificateForm.certificateNo);
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

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd/MM/yyyy");
    } catch (error) {
      return "Invalid date";
    }
  };

  if (!welderId) {
    return (
      <Layout>
        <div className="container mx-auto p-4">
          <h1 className="text-2xl font-bold mb-4">No Welder Selected</h1>
          <p>Please select a welder to view their certificates.</p>
          <Button
            className="mt-4"
            onClick={() => navigate("/welder-management")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Return to Welder Management
          </Button>
        </div>
      </Layout>
    );
  }

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

        {/* Welder Info Card */}
        {welder && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Welder Information</CardTitle>
              <CardDescription>Basic details about the welder</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-sm font-medium">Welder ID</Label>
                  <p>{welder.welderId}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Name</Label>
                  <p>{welder.name}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Trade</Label>
                  <p>{welder.trade}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <Badge
                    variant={welder.status === "Active" ? "default" : "destructive"}
                  >
                    {welder.status}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Certificates Table */}
        <Card>
          <CardHeader>
            <CardTitle>Certificates</CardTitle>
            <CardDescription>
              All certificates associated with this welder
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isCertificatesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : certificates.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  No certificates found for this welder.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => setIsAddCertificateOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add Certificate
                </Button>
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Certificate No.</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>WPQR</TableHead>
                      <TableHead>Issue Date</TableHead>
                      <TableHead>Expiry Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {certificates.map((cert) => {
                      // Normalize property names to handle both camelCase and snake_case
                      const certNumber = cert.certificateNo || cert.certificate_no || "N/A";
                      const certType = cert.certificateType || cert.certificate_type || "N/A";
                      const wpqrId = cert.wpqrDocumentId || cert.wpqr_document_id || "N/A";
                      const issueDate = cert.issueDate || cert.issue_date || "";
                      const expiryDate = cert.expiryDate || cert.expiry_date || "";
                      const status = cert.status || "Unknown";
                      
                      return (
                        <TableRow key={cert.id}>
                          <TableCell>{certNumber}</TableCell>
                          <TableCell>{certType}</TableCell>
                          <TableCell>{wpqrId}</TableCell>
                          <TableCell>{formatDate(issueDate)}</TableCell>
                          <TableCell>{formatDate(expiryDate)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                status === "Active" ? "default" : "destructive"
                              }
                            >
                              {status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const fileUrl = cert.fileUrl || cert.file_url;
                                  if (fileUrl) {
                                    window.open(fileUrl, "_blank");
                                  } else {
                                    toast({
                                      title: "Error",
                                      description: "Certificate file URL not available",
                                      variant: "destructive"
                                    });
                                  }
                                }}
                              >
                                <FileCheck className="h-4 w-4 mr-1" /> View
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  // Future implementation: Add edit functionality
                                  toast({
                                    title: "Coming Soon",
                                    description: "Edit functionality will be available soon",
                                  });
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (
                                    confirm(
                                      "Are you sure you want to delete this certificate?"
                                    )
                                  ) {
                                    deleteCertificateMutation.mutate(cert.id);
                                  }
                                }}
                              >
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Certificate Dialog */}
        <Dialog
          open={isAddCertificateOpen}
          onOpenChange={setIsAddCertificateOpen}
        >
          <DialogContent className="sm:max-w-[600px]">
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
                  <Select
                    value={certificateForm.certificateType}
                    onValueChange={handleCertificateTypeChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select certificate type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WELDER_QUALIFICATION">
                        Welder Qualification
                      </SelectItem>
                      <SelectItem value="SAFETY_TRAINING">
                        Safety Training
                      </SelectItem>
                      <SelectItem value="SPECIALIZED_SKILL">
                        Specialized Skill
                      </SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
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
                    onChange={handleInputChange}
                    placeholder="Enter certificate number"
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
                    <SelectValue placeholder="Select WPQR (optional)" />
                  </SelectTrigger>
                  <SelectContent>
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
                    type="date"
                    name="issueDate"
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
                    type="date"
                    name="expiryDate"
                    value={certificateForm.expiryDate}
                    onChange={handleInputChange}
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
      </div>
    </Layout>
  );
}