import { useState, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { format } from "date-fns";
import { 
  Loader2, 
  Save, 
  ArrowLeft, 
  FileText, 
  Send, 
  Check as CheckIcon, 
  AlertTriangle, 
  Download as FileDownIcon,
  Edit as PencilIcon, 
  Plus as PlusIcon, 
  ChevronUp as ChevronUpIcon, 
  ChevronDown as ChevronDownIcon,
  Trash2 as Trash2Icon 
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Layout from "@/components/layout";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";

// Form schema
const qapFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  clientName: z.string().optional(),
  equipmentType: z.string().optional(),
  standardsApplicable: z.string().optional(),
  revision: z.string().min(1, "Revision is required"),
  content: z.string().min(1, "Content is required"),
  status: z.string().optional(),
  remarks: z.string().optional(),
  projectId: z.string().optional(),
  poNumber: z.string().optional(),
});

// QAP Item interface
interface QapItem {
  id: number;
  slNo: number;
  componentOperation: string;
  subMaterial?: string; // Optional field for Raw Material sub-options
  reviewDocument?: string; // Optional field for Review of Documents sub-options
  processInspection?: string; // Optional field for In Process Inspection sub-options
  finalAssessment?: string; // Optional field for Final Assessment sub-options
  characteristicsChecked: string;
  class: string;
  typeOfCheck: string;
  quantumOfCheck: string;
  referenceDocument: string;
  acceptanceNorms: string;
  formatOfRecords: string;
  agency: { M: boolean; C: boolean; SGS: boolean };
  remark: string;
}

export default function ViewEditQAPPage() {
  const { id } = useParams<{ id: string }>();
  const qapId = parseInt(id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [qapItems, setQapItems] = useState<QapItem[]>([]);

  // Query QAP data
  const { data: qap, isLoading, error } = useQuery({
    queryKey: ['/api/quality/generated-qaps', qapId],
    queryFn: async () => {
      if (!qapId || isNaN(qapId)) {
        throw new Error("Invalid QAP ID");
      }
      
      try {
        console.log(`Fetching QAP with ID: ${qapId}`);
        // Get the API response
        const response = await apiRequest('GET', `/api/quality/generated-qaps/${qapId}`);
        
        // Convert response to JSON
        const jsonData = await response.json();
        
        console.log("Raw API response data:", jsonData);
        
        // Enhanced validation with detailed error messages
        if (!jsonData) {
          console.error("No data received from API");
          throw new Error("Failed to load QAP: No data received from server");
        }
        
        // Check for ID
        if (!jsonData.id) {
          console.error("QAP is missing ID:", jsonData);
          throw new Error("QAP data is incomplete (missing ID)");
        }
        
        // Check for project data and load fallback project if missing
        let projectData = { id: 0, code: "UNKNOWN", name: "Unknown Project" };
        
        if (jsonData.project && jsonData.project.id) {
          projectData = {
            id: jsonData.project.id,
            code: jsonData.project.code || "UNKNOWN",
            name: jsonData.project.name || "Unknown Project"
          };
          console.log("Found project data:", projectData);
        } else if (jsonData.projectInfo) {
          // Try to extract project info from the projectInfo field (added on the server)
          const parts = jsonData.projectInfo.split(' - ');
          if (parts.length > 1) {
            projectData = {
              id: jsonData.projectId || 0,
              code: parts[0] || "UNKNOWN",
              name: parts.slice(1).join(' - ') || "Unknown Project"
            };
            console.log("Reconstructed project data from projectInfo:", projectData);
          }
        } else {
          console.warn("QAP is missing project data, using fallback:", jsonData);
        }
        
        // Convert QAP to a properly typed object with all required fields
        const safeQap: any = {
          id: jsonData.id,
          projectId: jsonData.projectId || 0,
          templateId: jsonData.templateId || 0,
          title: jsonData.title || "Untitled QAP",
          clientName: jsonData.clientName || "",
          equipmentType: jsonData.equipmentType || "General",
          standardsApplicable: jsonData.standardsApplicable || "",
          revision: jsonData.revision || "0",
          preparedBy: jsonData.preparedBy || 0,
          approvedBy: jsonData.approvedBy || null,
          status: jsonData.status || "draft",
          content: jsonData.content || "",
          remarks: jsonData.remarks || "",
          project: projectData,
          // Include projectInfo for displaying project in a user-friendly format
          projectInfo: jsonData.projectInfo || `${projectData.code} - ${projectData.name}`,
          preparedByUser: jsonData.preparedByUser || { id: 0, username: "Unknown" },
          approvedByUser: jsonData.approvedByUser || null,
          versions: jsonData.versions || [],
          createdAt: jsonData.createdAt || new Date().toISOString(),
          updatedAt: jsonData.updatedAt || new Date().toISOString(),
        };
        
        console.log("Successfully processed QAP data:", {
          id: safeQap.id,
          projectId: safeQap.projectId,
          title: safeQap.title,
          status: safeQap.status,
          project: `${safeQap.project.code} - ${safeQap.project.name}`
        });
        
        return safeQap;
      } catch (error) {
        console.error("Error fetching QAP:", error);
        throw error;
      }
    },
    enabled: !isNaN(qapId),
    retry: 1,
  });

  // Setup form
  const form = useForm<z.infer<typeof qapFormSchema>>({
    resolver: zodResolver(qapFormSchema),
    defaultValues: {
      title: "",
      clientName: "",
      equipmentType: "",
      standardsApplicable: "",
      revision: "",
      content: "",
      status: "draft",
      remarks: "",
      projectId: "",
      poNumber: "",
    },
  });

  // Update form when data is loaded
  useEffect(() => {
    if (qap) {
      form.reset({
        title: qap.title || "",
        clientName: qap.clientName || "",
        equipmentType: qap.equipmentType || "",
        standardsApplicable: qap.standardsApplicable || "",
        revision: qap.revision || "0",
        content: qap.content || "",
        status: qap.status || "draft",
        remarks: qap.remarks || "",
        projectId: qap.projectId?.toString() || "",
        poNumber: "",
      });
      
      // Parse QAP items from content if available
      if (qap.content && qap.content.includes('table')) {
        parseQapItemsFromContent(qap.content);
      }
    }
  }, [qap, form]);
  
  // Function to parse QAP items from HTML content
  const parseQapItemsFromContent = (content: string) => {
    try {
      console.log("Attempting to parse QAP items from content...");
      
      // Create a temporary div to parse HTML content
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = content;
      
      // First try: Look for rows in the QAP table
      const rows = tempDiv.querySelectorAll('.qap-table tbody tr');
      
      if (rows.length > 0) {
        console.log(`Found ${rows.length} QAP items in content`);
        
        const parsedItems: QapItem[] = Array.from(rows).map((row, index) => {
          const cells = row.querySelectorAll('td');
          if (cells.length < 13) {
            console.warn(`Row ${index} doesn't have enough cells (${cells.length}), skipping`);
            return null; // Skip if row doesn't have enough cells
          }
          
          // Parse component operation and its sub-option
          const componentCell = cells[1].textContent || "";
          let componentOperation = "Review of Documents";
          let subMaterial = "";
          let reviewDocument = "";
          let processInspection = "";
          let finalAssessment = "";
          
          if (componentCell.includes("Raw Material")) {
            componentOperation = "Raw Material";
            const parts = componentCell.split('-');
            if (parts.length > 1) {
              subMaterial = parts[1].trim();
            }
          } else if (componentCell.includes("Review of Documents")) {
            componentOperation = "Review of Documents";
            const parts = componentCell.split('-');
            if (parts.length > 1) {
              reviewDocument = parts[1].trim();
            }
          } else if (componentCell.includes("In Process Inspection")) {
            componentOperation = "In Process Inspection";
            const parts = componentCell.split('-');
            if (parts.length > 1) {
              processInspection = parts[1].trim();
            }
          } else if (componentCell.includes("Final Assessment")) {
            componentOperation = "Final Assessment";
            const parts = componentCell.split('-');
            if (parts.length > 1) {
              finalAssessment = parts[1].trim();
            }
          } else if (componentCell.includes("Testing & Painting")) {
            componentOperation = "Testing & Painting";
          }
          
          // Parse agency checkmarks
          const mChecked = (cells[9].textContent || "").includes("✓");
          const cChecked = (cells[10].textContent || "").includes("✓");
          const sgsChecked = (cells[11].textContent || "").includes("✓");
          
          return {
            id: index + 1,
            slNo: index + 1,
            componentOperation,
            subMaterial,
            reviewDocument,
            processInspection,
            finalAssessment,
            characteristicsChecked: cells[2].textContent?.trim() || "",
            class: cells[3].textContent?.trim() || "Major",
            typeOfCheck: cells[4].textContent?.trim() || "Visual",
            quantumOfCheck: cells[5].textContent?.trim() || "100%",
            referenceDocument: cells[6].textContent?.trim() || "",
            acceptanceNorms: cells[7].textContent?.trim() || "",
            formatOfRecords: cells[8].textContent?.trim() || "",
            agency: {
              M: mChecked,
              C: cChecked,
              SGS: sgsChecked
            },
            remark: cells[12].textContent?.trim() || ""
          };
        }).filter(item => item !== null) as QapItem[];
        
        if (parsedItems.length > 0) {
          setQapItems(parsedItems);
          console.log("Parsed QAP items from content:", parsedItems);
        } else {
          console.warn("No valid QAP items parsed from content, using default item");
          setQapItems([{
            id: 1,
            slNo: 1,
            componentOperation: "Review of Documents",
            subMaterial: "",
            reviewDocument: "",
            processInspection: "",
            finalAssessment: "",
            characteristicsChecked: "Review & approval",
            class: "Major",
            typeOfCheck: "Visual",
            quantumOfCheck: "100%",
            referenceDocument: "Design & drawing",
            acceptanceNorms: "Compliance to Drawing",
            formatOfRecords: "Inspection Test Plan",
            agency: { M: true, C: false, SGS: false },
            remark: ""
          }]);
        }
      } else {
        console.warn("No QAP table rows found in content, using default item");
        setQapItems([{
          id: 1,
          slNo: 1,
          componentOperation: "Review of Documents",
          subMaterial: "",
          reviewDocument: "",
          processInspection: "",
          finalAssessment: "",
          characteristicsChecked: "Review & approval",
          class: "Major",
          typeOfCheck: "Visual",
          quantumOfCheck: "100%",
          referenceDocument: "Design & drawing",
          acceptanceNorms: "Compliance to Drawing",
          formatOfRecords: "Inspection Test Plan",
          agency: { M: true, C: false, SGS: false },
          remark: ""
        }]);
      }
    } catch (error) {
      console.error("Error parsing QAP items from content:", error);
      // Use default QAP item
      setQapItems([{
        id: 1,
        slNo: 1,
        componentOperation: "Review of Documents",
        characteristicsChecked: "Review & approval",
        class: "Major",
        typeOfCheck: "Visual",
        quantumOfCheck: "100%",
        referenceDocument: "Design & drawing",
        acceptanceNorms: "Compliance to Drawing",
        formatOfRecords: "Inspection Test Plan",
        agency: { M: true, C: false, SGS: false },
        remark: ""
      }]);
    }
  };

  // Function to generate QAP table HTML from QAP items
  const generateQapTableHtml = (qapItemsArray: QapItem[]) => {
    try {
      // Build table HTML
      return `
      <div class="qap-container">
        <table class="qap-table">
          <thead>
            <tr>
              <th>SL.NO</th>
              <th>COMPONENT & OPERATION</th>
              <th>CHARACTERISTICS CHECKED</th>
              <th>CLASS</th>
              <th>TYPE OF CHECK</th>
              <th>QUANTUM OF CHECK</th>
              <th>REFERENCE DOCUMENT</th>
              <th>ACCEPTANCE NORMS</th>
              <th>FORMAT OF RECORDS</th>
              <th colspan="3">AGENCY</th>
              <th>REMARK</th>
            </tr>
            <tr>
              <th></th>
              <th></th>
              <th></th>
              <th></th>
              <th></th>
              <th></th>
              <th></th>
              <th></th>
              <th></th>
              <th>M</th>
              <th>C</th>
              <th>SGS</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${qapItemsArray.map((item, index) => {
              // Determine component operation string with sub-option if applicable
              let componentOpString = item.componentOperation;
              
              if (item.componentOperation === 'Raw Material' && item.subMaterial) {
                componentOpString = `${item.componentOperation} - ${item.subMaterial}`;
              } else if (item.componentOperation === 'Review of Documents' && item.reviewDocument) {
                componentOpString = `${item.componentOperation} - ${item.reviewDocument}`;
              } else if (item.componentOperation === 'In Process Inspection' && item.processInspection) {
                componentOpString = `${item.componentOperation} - ${item.processInspection}`;
              } else if (item.componentOperation === 'Final Assessment' && item.finalAssessment) {
                componentOpString = `${item.componentOperation} - ${item.finalAssessment}`;
              }
              
              return `<tr>
                <td>${item.slNo}</td>
                <td>${componentOpString}</td>
                <td>${item.characteristicsChecked}</td>
                <td>${item.class}</td>
                <td>${item.typeOfCheck}</td>
                <td>${item.quantumOfCheck}</td>
                <td>${item.referenceDocument}</td>
                <td>${item.acceptanceNorms}</td>
                <td>${item.formatOfRecords}</td>
                <td>${item.agency.M ? '✓' : ''}</td>
                <td>${item.agency.C ? '✓' : ''}</td>
                <td>${item.agency.SGS ? '✓' : ''}</td>
                <td>${item.remark}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      `;
    } catch (error) {
      console.error("Error generating QAP table HTML:", error);
      return "<p>Error generating QAP table. Please try again.</p>";
    }
  };

  // Update QAP mutation
  const updateQapMutation = useMutation({
    mutationFn: async (values: z.infer<typeof qapFormSchema>) => {
      try {
        // Using improved apiRequest which automatically parses JSON response
        const data = await apiRequest('PUT', `/api/quality/generated-qaps/${qapId}`, values);
        console.log("Update QAP response:", data);
        return data;
      } catch (error) {
        console.error("Error updating QAP:", error);
        throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "QAP updated",
        description: "Quality Assurance Plan has been updated successfully",
      });
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['/api/quality/generated-qaps'] });
      queryClient.invalidateQueries({ queryKey: ['/api/quality/generated-qaps', qapId] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update QAP",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  // Approve QAP mutation
  const approveQapMutation = useMutation({
    mutationFn: async () => {
      try {
        // Use PATCH for status updates instead of PUT with improved apiRequest
        const data = await apiRequest('PATCH', `/api/quality/generated-qaps/${qapId}`, { status: 'approved' });
        console.log("Approve QAP response:", data);
        return data;
      } catch (error) {
        console.error("Error approving QAP:", error);
        throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "QAP approved",
        description: "Quality Assurance Plan has been approved successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/quality/generated-qaps'] });
      queryClient.invalidateQueries({ queryKey: ['/api/quality/generated-qaps', qapId] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to approve QAP",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  const onSubmit = (values: z.infer<typeof qapFormSchema>) => {
    try {
      // Generate HTML content from QAP items if there are any
      if (qapItems && qapItems.length > 0) {
        console.log(`Generating QAP HTML content from ${qapItems.length} items`);
        const qapTableHtml = generateQapTableHtml(qapItems);
        
        // Add table HTML to the content
        values.content = qapTableHtml;
      } else {
        console.warn("No QAP items available for content generation");
      }
      
      // Ensure project ID is included in the update
      if (qap) {
        // Try different sources for the project ID
        if (qap.projectId) {
          // Use the original projectId if available
          values.projectId = qap.projectId.toString();
          console.log(`Including project ID ${values.projectId} from QAP data in update`);
        } else if (qap.project && qap.project.id) {
          // Use the project.id if available
          values.projectId = qap.project.id.toString();
          console.log(`Including project ID ${values.projectId} from project object in update`);
        } else {
          // Log warning but don't break the update
          console.warn("Warning: Project ID is missing, using existing value in form");
        }
      }
      
      console.log("Submitting QAP update with values:", values);
      updateQapMutation.mutate(values);
    } catch (error) {
      console.error("Error in form submission:", error);
      toast({
        title: "Error preparing QAP data",
        description: "There was an error preparing the QAP data for submission.",
        variant: "destructive",
      });
    }
  };

  // Add, remove, move up, move down QAP items
  const addQapItem = () => {
    const newId = qapItems.length > 0 ? Math.max(...qapItems.map(item => item.id)) + 1 : 1;
    setQapItems([
      ...qapItems,
      {
        id: newId,
        slNo: qapItems.length + 1,
        componentOperation: "Review of Documents",
        subMaterial: "",
        reviewDocument: "",
        processInspection: "",
        finalAssessment: "",
        characteristicsChecked: "Review & approval",
        class: "Major",
        typeOfCheck: "Visual",
        quantumOfCheck: "100%",
        referenceDocument: "Design & drawing",
        acceptanceNorms: "Compliance to Drawing",
        formatOfRecords: "Inspection Test Plan",
        agency: { M: true, C: false, SGS: false },
        remark: ""
      }
    ]);
  };

  const removeQapItem = (id: number) => {
    setQapItems(qapItems.filter(item => item.id !== id).map((item, index) => ({
      ...item,
      slNo: index + 1
    })));
  };

  const moveQapItemUp = (id: number) => {
    const index = qapItems.findIndex(item => item.id === id);
    if (index <= 0) return;
    
    const newItems = [...qapItems];
    [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
    
    // Update sequence numbers
    const updatedItems = newItems.map((item, i) => ({
      ...item,
      slNo: i + 1
    }));
    
    setQapItems(updatedItems);
  };

  const moveQapItemDown = (id: number) => {
    const index = qapItems.findIndex(item => item.id === id);
    if (index === -1 || index === qapItems.length - 1) return;
    
    const newItems = [...qapItems];
    [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
    
    // Update sequence numbers
    const updatedItems = newItems.map((item, i) => ({
      ...item,
      slNo: i + 1
    }));
    
    setQapItems(updatedItems);
  };

  const updateQapItem = (id: number, updatedItem: Partial<QapItem>) => {
    setQapItems(qapItems.map(item => 
      item.id === id ? { ...item, ...updatedItem } : item
    ));
  };

  // Handle export
  const handleExport = () => {
    // Open export URL in new tab
    window.open(`/api/quality/generated-qaps/${qapId}/export`, '_blank');
  };

  // Check if user can edit QAP
  const canEdit = () => {
    if (!user || !qap) return false;
    
    // Superusers can edit any QAP
    if (user.role === "Superuser") return true;
    
    // Managers and Senior Managers can edit drafts or their own QAPs
    if (["Manager", "Senior Manager", "General Manager"].includes(user.role)) {
      return qap.status !== "approved" || qap.preparedBy === user.id;
    }
    
    // Other users can only edit their own drafts
    return qap.preparedBy === user.id && qap.status !== "approved";
  };

  // Check if user can approve QAP
  const canApprove = () => {
    if (!user || !qap) return false;
    
    // Only these roles can approve QAPs
    if (!["Superuser", "Senior Manager", "Manager", "General Manager"].includes(user.role)) {
      return false;
    }
    
    // Can't approve already approved QAPs
    return (qap?.status || "") !== "approved";
  };

  // Format QAP number
  const formatQapNumber = () => {
    try {
      if (!qap) return "QAP-???";
      
      // Get project code from projectInfo if available
      let projectCode = "???";
      
      // Try to get project code from projectInfo first (which comes from the server)
      if (qap.projectInfo) {
        const parts = qap.projectInfo.split(' - ');
        if (parts.length > 0) {
          projectCode = parts[0];
        }
      } 
      // Fallback to project object if projectInfo is not available
      else if (qap.project && qap.project.code) {
        projectCode = qap.project.code;
      }
      
      // Ensure ID exists
      const id = qap.id;
      if (!id) return `QAP-${projectCode}-???`;
      
      // Format the QAP number
      return `QAP-${projectCode}-${String(id).padStart(3, '0')}`;
    } catch (error) {
      console.error("Error formatting QAP number:", error);
      return "QAP-???-???";
    }
  };

  // Handle back button
  const handleBack = () => {
    navigate("/quality-assurance-plan");
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Layout>
    );
  }

  if (error || !qap) {
    return (
      <Layout>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load QAP. Please try again later.
          </AlertDescription>
        </Alert>
        <Button onClick={handleBack} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to QAPs
        </Button>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Link href="/quality-assurance-plan">
              <Button variant="outline" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold">{isEditing ? "Edit" : "View"} Quality Assurance Plan</h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm">
              {formatQapNumber()}
            </Badge>
            <Badge
              variant={(qap?.status || "") === "approved" ? "default" : "secondary"}
              className="text-sm"
            >
              {qap?.status ? `${qap.status.charAt(0).toUpperCase()}${qap.status.slice(1)}` : "Draft"}
            </Badge>
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
        </div>
        
        <Separator />
        
        {isEditing ? (
          // Edit Mode with Tabs
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Tabs defaultValue="details" value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4">
                  <TabsTrigger value="details">QAP Details</TabsTrigger>
                  <TabsTrigger value="items">QAP Items</TabsTrigger>
                </TabsList>
                
                <TabsContent value="details">
                  <Card>
                    <CardContent className="p-6">
                      {/* First row with QAP Number, Category, and Revision Number */}
                      <div className="grid grid-cols-3 gap-4 mb-6">
                        <FormField
                          control={form.control}
                          name="title"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>QAP Number</FormLabel>
                              <FormDescription>Auto-generated based on project code</FormDescription>
                              <FormControl>
                                <Input 
                                  value={formatQapNumber()}
                                  disabled={true}
                                  className="bg-muted/30"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="equipmentType"
                          render={({ field }) => (
                            <FormItem className="px-2">
                              <FormLabel>Category</FormLabel>
                              <FormDescription>Select the equipment category</FormDescription>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="revision"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Revision Number</FormLabel>
                              <FormDescription>Auto-generated as '0' for new QAPs</FormDescription>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      {/* Project, Customer, PO Number row */}
                      <div className="grid grid-cols-3 gap-4 mb-6">
                        <FormField
                          control={form.control}
                          name="projectId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Project</FormLabel>
                              <FormDescription>Associated project details</FormDescription>
                              <FormControl>
                                <Input 
                                  {...field}
                                  value={qap?.projectInfo || (qap?.project ? `${qap.project.code} - ${qap.project.name}` : "")}
                                  disabled={true}
                                  className="bg-muted/30"
                                  readOnly
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="clientName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Customer</FormLabel>
                              <FormDescription>Client or customer name</FormDescription>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="poNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>PO Number</FormLabel>
                              <FormDescription>Purchase order reference</FormDescription>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      {/* Title, Standards Applicable row */}
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <FormField
                          control={form.control}
                          name="title"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>QAP Title</FormLabel>
                              <FormDescription>Title for the QAP</FormDescription>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="standardsApplicable"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Standards Applicable</FormLabel>
                              <FormDescription>Relevant quality standards</FormDescription>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      {/* Remarks field */}
                      <div className="mb-6">
                        <FormField
                          control={form.control}
                          name="remarks"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Remarks</FormLabel>
                              <FormDescription>Any additional notes or comments</FormDescription>
                              <FormControl>
                                <Textarea
                                  {...field}
                                  className="min-h-24"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="items">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle>QAP Items</CardTitle>
                        <Button onClick={addQapItem} variant="outline" size="sm">
                          <PlusIcon className="mr-2 h-4 w-4" />
                          Add Item
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {qapItems.length === 0 ? (
                        <div className="text-center py-6">
                          <p className="text-muted-foreground">No QAP items added yet.</p>
                          <Button onClick={addQapItem} variant="secondary" className="mt-4">
                            <PlusIcon className="mr-2 h-4 w-4" />
                            Add First Item
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {qapItems.map((item, index) => (
                            <Card key={item.id} className="p-4 bg-muted/30">
                              <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold">Item #{item.slNo}</h3>
                                <div className="flex space-x-2">
                                  <Button 
                                    onClick={() => moveQapItemUp(item.id)}
                                    variant="outline"
                                    size="icon"
                                    disabled={index === 0}
                                    className="h-8 w-8"
                                  >
                                    <ChevronUpIcon className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    onClick={() => moveQapItemDown(item.id)}
                                    variant="outline"
                                    size="icon"
                                    disabled={index === qapItems.length - 1}
                                    className="h-8 w-8"
                                  >
                                    <ChevronDownIcon className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    onClick={() => removeQapItem(item.id)}
                                    variant="destructive"
                                    size="icon"
                                    className="h-8 w-8"
                                  >
                                    <Trash2Icon className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                  <Label htmlFor={`item-${item.id}-component`}>Component & Operation</Label>
                                  <Select 
                                    value={item.componentOperation}
                                    onValueChange={(value) => updateQapItem(item.id, { componentOperation: value })}
                                  >
                                    <SelectTrigger className="mt-1">
                                      <SelectValue placeholder="Select Component/Operation" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Review of Documents">Review of Documents</SelectItem>
                                      <SelectItem value="Raw Material">Raw Material</SelectItem>
                                      <SelectItem value="In Process Inspection">In Process Inspection</SelectItem>
                                      <SelectItem value="Final Assessment">Final Assessment</SelectItem>
                                      <SelectItem value="Testing & Painting">Testing & Painting</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                
                                {/* Sub-options based on component operation */}
                                {item.componentOperation === "Raw Material" && (
                                  <div>
                                    <Label htmlFor={`item-${item.id}-sub-material`}>Material Type</Label>
                                    <Input
                                      id={`item-${item.id}-sub-material`}
                                      className="mt-1"
                                      value={item.subMaterial || ""}
                                      onChange={(e) => updateQapItem(item.id, { subMaterial: e.target.value })}
                                    />
                                  </div>
                                )}
                                
                                {item.componentOperation === "Review of Documents" && (
                                  <div>
                                    <Label htmlFor={`item-${item.id}-document-type`}>Document Type</Label>
                                    <Input
                                      id={`item-${item.id}-document-type`}
                                      className="mt-1"
                                      value={item.reviewDocument || ""}
                                      onChange={(e) => updateQapItem(item.id, { reviewDocument: e.target.value })}
                                    />
                                  </div>
                                )}
                                
                                {item.componentOperation === "In Process Inspection" && (
                                  <div>
                                    <Label htmlFor={`item-${item.id}-process`}>Process Type</Label>
                                    <Input
                                      id={`item-${item.id}-process`}
                                      className="mt-1"
                                      value={item.processInspection || ""}
                                      onChange={(e) => updateQapItem(item.id, { processInspection: e.target.value })}
                                    />
                                  </div>
                                )}
                                
                                {item.componentOperation === "Final Assessment" && (
                                  <div>
                                    <Label htmlFor={`item-${item.id}-assessment`}>Assessment Type</Label>
                                    <Input
                                      id={`item-${item.id}-assessment`}
                                      className="mt-1"
                                      value={item.finalAssessment || ""}
                                      onChange={(e) => updateQapItem(item.id, { finalAssessment: e.target.value })}
                                    />
                                  </div>
                                )}
                              </div>
                              
                              <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                  <Label htmlFor={`item-${item.id}-characteristics`}>Characteristics Checked</Label>
                                  <Input
                                    id={`item-${item.id}-characteristics`}
                                    className="mt-1"
                                    value={item.characteristicsChecked}
                                    onChange={(e) => updateQapItem(item.id, { characteristicsChecked: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor={`item-${item.id}-class`}>Class</Label>
                                  <Select 
                                    value={item.class}
                                    onValueChange={(value) => updateQapItem(item.id, { class: value })}
                                  >
                                    <SelectTrigger className="mt-1">
                                      <SelectValue placeholder="Select Class" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Major">Major</SelectItem>
                                      <SelectItem value="Critical">Critical</SelectItem>
                                      <SelectItem value="Minor">Minor</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                  <Label htmlFor={`item-${item.id}-type-of-check`}>Type of Check</Label>
                                  <Input
                                    id={`item-${item.id}-type-of-check`}
                                    className="mt-1"
                                    value={item.typeOfCheck}
                                    onChange={(e) => updateQapItem(item.id, { typeOfCheck: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor={`item-${item.id}-quantum-of-check`}>Quantum of Check</Label>
                                  <Input
                                    id={`item-${item.id}-quantum-of-check`}
                                    className="mt-1"
                                    value={item.quantumOfCheck}
                                    onChange={(e) => updateQapItem(item.id, { quantumOfCheck: e.target.value })}
                                  />
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                  <Label htmlFor={`item-${item.id}-reference-document`}>Reference Document</Label>
                                  <Input
                                    id={`item-${item.id}-reference-document`}
                                    className="mt-1"
                                    value={item.referenceDocument}
                                    onChange={(e) => updateQapItem(item.id, { referenceDocument: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor={`item-${item.id}-acceptance-norms`}>Acceptance Norms</Label>
                                  <Input
                                    id={`item-${item.id}-acceptance-norms`}
                                    className="mt-1"
                                    value={item.acceptanceNorms}
                                    onChange={(e) => updateQapItem(item.id, { acceptanceNorms: e.target.value })}
                                  />
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                  <Label htmlFor={`item-${item.id}-format-of-records`}>Format of Records</Label>
                                  <Input
                                    id={`item-${item.id}-format-of-records`}
                                    className="mt-1"
                                    value={item.formatOfRecords}
                                    onChange={(e) => updateQapItem(item.id, { formatOfRecords: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label>Agency</Label>
                                  <div className="flex space-x-4 mt-2">
                                    <div className="flex items-center">
                                      <Checkbox 
                                        id={`item-${item.id}-agency-m`} 
                                        checked={item.agency.M}
                                        onCheckedChange={(checked) => 
                                          updateQapItem(item.id, { agency: {...item.agency, M: !!checked} })
                                        }
                                      />
                                      <label htmlFor={`item-${item.id}-agency-m`} className="ml-2 text-sm">
                                        M (Manufacturer)
                                      </label>
                                    </div>
                                    <div className="flex items-center">
                                      <Checkbox 
                                        id={`item-${item.id}-agency-c`} 
                                        checked={item.agency.C}
                                        onCheckedChange={(checked) => 
                                          updateQapItem(item.id, { agency: {...item.agency, C: !!checked} })
                                        }
                                      />
                                      <label htmlFor={`item-${item.id}-agency-c`} className="ml-2 text-sm">
                                        C (Customer)
                                      </label>
                                    </div>
                                    <div className="flex items-center">
                                      <Checkbox 
                                        id={`item-${item.id}-agency-sgs`} 
                                        checked={item.agency.SGS}
                                        onCheckedChange={(checked) => 
                                          updateQapItem(item.id, { agency: {...item.agency, SGS: !!checked} })
                                        }
                                      />
                                      <label htmlFor={`item-${item.id}-agency-sgs`} className="ml-2 text-sm">
                                        SGS (Third Party)
                                      </label>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              
                              <div>
                                <Label htmlFor={`item-${item.id}-remark`}>Remark</Label>
                                <Input
                                  id={`item-${item.id}-remark`}
                                  className="mt-1"
                                  value={item.remark}
                                  onChange={(e) => updateQapItem(item.id, { remark: e.target.value })}
                                />
                              </div>
                            </Card>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
              
              <div className="flex justify-end space-x-2 mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateQapMutation.isPending}>
                  {updateQapMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        ) : (
          // View Mode
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle>QAP Details</CardTitle>
                  <div className="flex items-center space-x-2">
                    {qap?.status !== "approved" && canEdit() && (
                      <Button onClick={() => setIsEditing(true)} variant="outline" size="sm">
                        <PencilIcon className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                    )}
                    {qap?.status !== "approved" && canApprove() && (
                      <Button
                        onClick={() => {
                          if (confirm("Are you sure you want to approve this QAP?")) {
                            approveQapMutation.mutate();
                          }
                        }}
                        size="sm"
                        disabled={approveQapMutation.isPending}
                      >
                        {approveQapMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Approving...
                          </>
                        ) : (
                          <>
                            <CheckIcon className="mr-2 h-4 w-4" />
                            Approve
                          </>
                        )}
                      </Button>
                    )}
                    <Button
                      onClick={handleExport}
                      variant="outline"
                      size="sm"
                    >
                      <FileDownIcon className="mr-2 h-4 w-4" />
                      Export
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground">QAP Number</h3>
                    <p className="text-sm">{formatQapNumber()}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground">Status</h3>
                    <p className="text-sm capitalize">{qap?.status || "Draft"}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground">Project</h3>
                    <p className="text-sm">{qap?.projectInfo || (qap?.project ? `${qap.project.code} - ${qap.project.name}` : "Not specified")}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground">Customer</h3>
                    <p className="text-sm">{qap?.clientName || "Not specified"}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground">Title</h3>
                    <p className="text-sm">{qap?.title || "Not specified"}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground">Revision</h3>
                    <p className="text-sm">{qap?.revision || "0"}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground">Standards Applicable</h3>
                    <p className="text-sm">{qap?.standardsApplicable || "Not specified"}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground">Equipment Type</h3>
                    <p className="text-sm">{qap?.equipmentType || "Not specified"}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground">Prepared By</h3>
                    <p className="text-sm">{qap?.preparedByUser?.username || "Unknown"}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground">Approved By</h3>
                    <p className="text-sm">{qap?.approvedByUser?.username || "Not approved yet"}</p>
                  </div>
                  {qap?.remarks && (
                    <div className="col-span-2">
                      <h3 className="text-sm font-semibold text-muted-foreground">Remarks</h3>
                      <p className="text-sm whitespace-pre-line">{qap.remarks}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>QAP Content</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="qap-preview">
                  <div dangerouslySetInnerHTML={{ __html: qap?.content || "" }} />
                </div>
              </CardContent>
            </Card>
            
            {qap?.versions && qap.versions.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Version History</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {qap.versions.map((version) => (
                      <div key={version.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                        <div>
                          <p className="text-sm font-medium">Version {version.version}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(version.createdAt).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            By {version.createdByUser?.username || "Unknown"}
                          </p>
                        </div>
                        <Button variant="outline" size="sm">
                          <FileDownIcon className="mr-2 h-4 w-4" />
                          Export
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}