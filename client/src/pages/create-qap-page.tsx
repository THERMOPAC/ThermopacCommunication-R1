import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useAuth } from "@/hooks/use-auth";
import Layout from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { FileText, ArrowLeft, Save, Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// Define schema for the QAP form
const qapFormSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  customerId: z.string().min(1, "Customer is required"),
  title: z.string().min(1, "Title is required"),
  category: z.enum(["Pressure Vessel", "Heat Exchanger", "Piping", "Structure", "Electrical", "Instrumentation", "General"], {
    required_error: "Category is required",
  }),
  revision: z.string().optional(),
  poNumber: z.string().optional(),
  qapNumber: z.string().min(1, "QAP number is required"),
  revisionNumber: z.string().default("0"),
  remarks: z.string().optional(),
});

type QAPFormValues = z.infer<typeof qapFormSchema>;

// Define interfaces
interface Project {
  id: number;
  name: string;
  code: string;
  customerId: number;
  customer?: {
    id: number;
    bpName: string;
    bpCode: string;
  };
}

interface Customer {
  id: number;
  bpCode: string;
  bpName: string;
}

// Define QAP Item interface
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

export default function CreateQAPPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedProjectCode, setSelectedProjectCode] = useState<string>("");
  const [qapItems, setQapItems] = useState<QapItem[]>([
    {
      id: 1,
      slNo: 1,
      componentOperation: "Review of Documents",
      subMaterial: "",
      characteristicsChecked: "Document completeness",
      class: "Major",
      typeOfCheck: "Visual",
      quantumOfCheck: "100%",
      referenceDocument: "Project specifications",
      acceptanceNorms: "Approved drawings",
      formatOfRecords: "Checklist",
      agency: { M: true, C: false, SGS: false },
      remark: "",
    }
  ]);

  // Initialize the form
  const form = useForm<QAPFormValues>({
    resolver: zodResolver(qapFormSchema),
    defaultValues: {
      projectId: "",
      customerId: "",
      title: "",
      category: "General",
      revision: "",
      poNumber: "",
      qapNumber: "",
      revisionNumber: "0",
      remarks: "",
    },
  });

  // Fetch projects
  const { data: projects = [], isLoading: isLoadingProjects } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
    throwOnError: false,
  });

  // Fetch customers
  const { data: customers = [], isLoading: isLoadingCustomers } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
    throwOnError: false,
  });

  // Handle project selection
  const handleProjectChange = (projectId: string) => {
    form.setValue("projectId", projectId);
    
    // Find the selected project
    const selectedProject = projects.find(project => project.id.toString() === projectId);
    
    if (selectedProject) {
      console.log("Selected project:", selectedProject);
      
      // Set the project code
      setSelectedProjectCode(selectedProject.code);
      
      // Auto-populate customer field if customer exists in the project
      if (selectedProject.customerId) {
        form.setValue("customerId", selectedProject.customerId.toString());
        
        // Find customer name to display
        const customerName = customers.find(c => c.id === selectedProject.customerId)?.bpName || "Unknown Customer";
        console.log("Auto-populated customer:", customerName);
      }
      
      // Set QAP number based on project code
      form.setValue("qapNumber", `QAP-${selectedProject.code}-001`);
      
      // Set title based on project name
      form.setValue("title", `Quality Assurance Plan for ${selectedProject.name}`);
    }
  };

  // Get project details
  const getProjectDetails = async (projectId: string) => {
    try {
      const project = await apiRequest('GET', `api/projects/${projectId}`, null);
      return project;
    } catch (error) {
      console.error("Error fetching project details:", error);
      return null;
    }
  };
  
  // Add a new QAP item
  const addQapItem = () => {
    const newId = qapItems.length + 1;
    const newItem: QapItem = {
      id: newId,
      slNo: newId,
      componentOperation: "Review of Documents",
      subMaterial: "",
      characteristicsChecked: "",
      finalAssessment: "",
      class: "Major",
      typeOfCheck: "Visual",
      quantumOfCheck: "100%",
      referenceDocument: "",
      acceptanceNorms: "",
      formatOfRecords: "",
      agency: { M: true, C: false, SGS: false },
      remark: "",
    };
    
    setQapItems([...qapItems, newItem]);
  };

  // Handle form submission
  const onSubmit = async (values: QAPFormValues) => {
    try {
      // Find project details to include in QAP content
      const selectedProject = projects.find(p => p.id.toString() === values.projectId);
      if (!selectedProject) {
        throw new Error("Project not found");
      }
      
      // Find customer details
      const selectedCustomer = customers.find(c => c.id.toString() === values.customerId);
      
      // Get template ID (using the existing template for now, would normally be selected)
      const templateId = 3;
      
      // Get current date in ISO format
      const currentDate = new Date().toISOString();
      
      // Use the QAP items from state
      // Ensure at least one item exists
      const qapTableItems = qapItems.length > 0 ? qapItems : [
        {
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
          acceptanceNorms: "Approved drawings",
          formatOfRecords: "Checklist",
          agency: { M: true, C: false, SGS: false },
          remark: values.remarks || "",
        }
      ];
      
      // Format QAP content as an HTML structure
      const contentHtml = `
        <div class="qap-document">
          <div class="qap-header">
            <h1>${values.title}</h1>
            <div class="qap-info">
              <p><strong>QAP Number:</strong> ${values.qapNumber}</p>
              <p><strong>Revision:</strong> ${values.revisionNumber}</p>
              <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
            </div>
          </div>
          
          <div class="qap-details">
            <p><strong>Project:</strong> ${selectedProject.code} - ${selectedProject.name}</p>
            <p><strong>Customer:</strong> ${selectedCustomer?.bpName || "N/A"}</p>
            <p><strong>Equipment Type:</strong> ${values.category}</p>
            <p><strong>PO Number:</strong> ${values.poNumber || "N/A"}</p>
          </div>
          
          <div class="qap-content">
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
                ${qapTableItems.map(item => `
                  <tr>
                    <td>${item.slNo}</td>
                    <td>${item.componentOperation === "Raw Material" && item.subMaterial 
                         ? `${item.componentOperation} - ${item.subMaterial}` 
                         : item.componentOperation === "Review of Documents" && item.reviewDocument
                         ? `${item.componentOperation} - ${item.reviewDocument}`
                         : item.componentOperation === "In Process Inspection" && item.processInspection
                         ? `${item.componentOperation} - ${item.processInspection}`
                         : item.componentOperation === "Final Assessment" && item.finalAssessment
                         ? `${item.componentOperation} - ${item.finalAssessment}`
                         : item.componentOperation}
                    </td>
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
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="qap-footer">
            <div class="signatures">
              <div class="prepared-by">
                <p><strong>Prepared By:</strong></p>
                <p>${user?.username || ""}</p>
              </div>
              <div class="approved-by">
                <p><strong>Approved By:</strong></p>
                <p></p>
              </div>
            </div>
          </div>
        </div>
      `;
      
      // Prepare data for API
      const qapData = {
        projectId: parseInt(values.projectId),
        templateId: templateId,
        title: values.title,
        clientName: selectedCustomer?.bpName || "",
        equipmentType: values.category,
        standards: "",
        revision: values.revisionNumber,
        content: contentHtml,
        status: "draft"
      };
      
      console.log("Submitting QAP data:", qapData);
      
      // Send to API
      const response = await apiRequest('POST', '/api/quality/generated-qaps', qapData);
      
      console.log("API response:", response);
      
      toast({
        title: "Success",
        description: "QAP created successfully",
      });
      
      // Redirect to QAP listing page
      setLocation("/quality-assurance-plan");
    } catch (error) {
      console.error("Error creating QAP:", error);
      toast({
        title: "Error",
        description: typeof error === 'object' && error !== null && 'message' in error 
          ? `Failed to create QAP: ${(error as Error).message}` 
          : "Failed to create QAP. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Layout>
      <Helmet>
        <title>Create Quality Assurance Plan | Thermopac</title>
      </Helmet>
      
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Link href="/quality-assurance-plan">
              <Button variant="outline" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold">Create Quality Assurance Plan</h1>
          </div>
          <FileText className="h-6 w-6 text-muted-foreground" />
        </div>
        
        <Separator />
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardContent className="p-6">
                {/* First row with QAP Number, Category, and Revision Number */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <FormField
                    control={form.control}
                    name="qapNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>QAP Number</FormLabel>
                        <FormDescription>Auto-generated based on project code</FormDescription>
                        <FormControl>
                          <Input 
                            placeholder="QAP-0001" 
                            {...field} 
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
                    name="category"
                    render={({ field }) => (
                      <FormItem className="px-2">
                        <FormLabel>Category</FormLabel>
                        <FormDescription>Select the equipment category</FormDescription>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Pressure Vessel">Pressure Vessel</SelectItem>
                            <SelectItem value="Heat Exchanger">Heat Exchanger</SelectItem>
                            <SelectItem value="Piping">Piping</SelectItem>
                            <SelectItem value="Structure">Structure</SelectItem>
                            <SelectItem value="Electrical">Electrical</SelectItem>
                            <SelectItem value="Instrumentation">Instrumentation</SelectItem>
                            <SelectItem value="General">General</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="revisionNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Revision Number</FormLabel>
                        <FormDescription>Auto-generated as "0" for new QAPs</FormDescription>
                        <FormControl>
                          <Input 
                            placeholder="0" 
                            {...field} 
                            disabled={true}
                            className="bg-muted/30"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                {/* Project, Customer, and PO Number in a row */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <FormField
                    control={form.control}
                    name="projectId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project</FormLabel>
                        <FormDescription>Select a project</FormDescription>
                        <Select 
                          onValueChange={(value) => handleProjectChange(value)} 
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a project" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {projects.map((project) => (
                              <SelectItem key={project.id} value={project.id.toString()}>
                                {project.code} - {project.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="customerId"
                    render={({ field }) => {
                      // Find the customer name to display
                      const selectedCustomer = customers.find(c => c.id.toString() === field.value);
                      
                      return (
                        <FormItem className="px-2">
                          <FormLabel>Customer</FormLabel>
                          <FormDescription>Auto-populated from project</FormDescription>
                          {field.value ? (
                            <div className="flex items-center space-x-2 p-2 border rounded-md bg-muted/30">
                              <div className="text-sm">
                                <span className="font-medium">{selectedCustomer?.bpName}</span>
                                {selectedCustomer?.bpCode && (
                                  <span className="text-muted-foreground ml-2">({selectedCustomer.bpCode})</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <Select 
                              onValueChange={field.onChange} 
                              defaultValue={field.value || "no-customer"}
                              disabled={true}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a project first" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="no-customer" className="hidden">Select a customer</SelectItem>
                                {customers.map((customer) => (
                                  <SelectItem key={customer.id} value={customer.id.toString()}>
                                    {customer.bpName} ({customer.bpCode})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                  
                  <FormField
                    control={form.control}
                    name="poNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>PO Number</FormLabel>
                        <FormDescription>Purchase order reference</FormDescription>
                        <FormControl>
                          <Input placeholder="PO-001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Remaining form fields in a two-column layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input placeholder="QAP Title" {...field} />
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
                        <FormLabel>Revision</FormLabel>
                        <FormControl>
                          <Input placeholder="A" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* QAP Header Row */}
                  <div className="col-span-1 md:col-span-2 mt-6 mb-4">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-medium text-lg">QAP Items</h3>
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm"
                        onClick={addQapItem}
                        className="flex gap-1 items-center"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Item
                      </Button>
                    </div>
                    <div className="overflow-x-auto">
                      <div className="min-w-full border rounded-md">
                        <div className="grid grid-cols-12 text-[8px] font-medium text-center bg-muted" style={{ gridTemplateColumns: '30px 40px 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr' }}>
                          <div className="p-1 border-r">ACTION</div>
                          <div className="p-1 border-r">SL.NO</div>
                          <div className="p-1 border-r">COMPONENT & OPERATION</div>
                          <div className="p-1 border-r">CHARACTERISTICS CHECKED</div>
                          <div className="p-1 border-r">CLASS</div>
                          <div className="p-1 border-r">TYPE OF CHECK</div>
                          <div className="p-1 border-r">QUANTUM OF CHECK</div>
                          <div className="p-1 border-r">REFERENCE DOCUMENT</div>
                          <div className="p-1 border-r">ACCEPTANCE NORMS</div>
                          <div className="p-1 border-r">FORMAT OF RECORDS</div>
                          <div className="p-1 border-r">AGENCY</div>
                          <div className="p-1">REMARK</div>
                        </div>
                        {qapItems.map((item, index) => (
                          <div key={item.id} className="grid grid-cols-12 text-[8px]" style={{ gridTemplateColumns: '30px 40px 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr' }}>
                            <div className="p-1 border-r border-t text-center">
                              <Button 
                                type="button" 
                                variant="ghost" 
                                size="icon"
                                onClick={addQapItem}
                                className="h-4 w-4"
                              >
                                <Plus className="h-2 w-2" />
                              </Button>
                            </div>
                            <div className="p-1 border-r border-t text-center">{item.slNo}</div>
                            <div className="p-1 border-r border-t">
                              <div className="space-y-1">
                                <Select 
                                  defaultValue="review-documents"
                                  onValueChange={(value) => {
                                    const updatedItems = [...qapItems];
                                    updatedItems[index] = {
                                      ...updatedItems[index],
                                      componentOperation: value === "review-documents" ? "Review of Documents" :
                                                        value === "raw-material" ? "Raw Material" :
                                                        value === "in-process" ? "In Process Inspection" :
                                                        value === "final-assessment" ? "Final Assessment" :
                                                        "Testing & Painting",
                                      // Clear sub-option fields when not relevant
                                      subMaterial: value !== "raw-material" ? "" : updatedItems[index].subMaterial,
                                      reviewDocument: value !== "review-documents" ? "" : updatedItems[index].reviewDocument,
                                      processInspection: value !== "in-process" ? "" : updatedItems[index].processInspection,
                                      finalAssessment: value !== "final-assessment" ? "" : updatedItems[index].finalAssessment
                                    };
                                    setQapItems(updatedItems);
                                  }}
                                >
                                  <SelectTrigger className="w-full h-5 text-[8px]">
                                    <SelectValue placeholder="Select option" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="review-documents">Review of Documents</SelectItem>
                                    <SelectItem value="raw-material">Raw Material</SelectItem>
                                    <SelectItem value="in-process">In Process Inspection</SelectItem>
                                    <SelectItem value="final-assessment">Final Assessment</SelectItem>
                                    <SelectItem value="testing-painting">Testing & Painting</SelectItem>
                                  </SelectContent>
                                </Select>
                                
                                {/* Dependent dropdown for Raw Material sub-options */}
                                {item.componentOperation === "Raw Material" && (
                                  <div className="pl-3 mt-1"> {/* Added padding-left for indentation */}
                                    <Select 
                                      value={item.subMaterial || ""}
                                      onValueChange={(value) => {
                                        const updatedItems = [...qapItems];
                                        updatedItems[index] = {
                                          ...updatedItems[index],
                                          subMaterial: value
                                        };
                                        setQapItems(updatedItems);
                                      }}
                                    >
                                      <SelectTrigger className="w-full h-5 text-[8px] border-dashed border-gray-400"> {/* Added dashed border to indicate hierarchy */}
                                        <SelectValue placeholder="Select material" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="Shell Dish">Shell Dish</SelectItem>
                                        <SelectItem value="Lugs">Lugs</SelectItem>
                                        <SelectItem value="Pipes">Pipes</SelectItem>
                                        <SelectItem value="Flanges">Flanges</SelectItem>
                                        <SelectItem value="Hard Ware">Hard Ware</SelectItem>
                                        <SelectItem value="Insulation">Insulation</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                                
                                {/* Dependent dropdown for Review of Documents sub-options */}
                                {item.componentOperation === "Review of Documents" && (
                                  <div className="pl-3 mt-1"> {/* Added padding-left for indentation */}
                                    <Select 
                                      value={item.reviewDocument || ""}
                                      onValueChange={(value) => {
                                        const updatedItems = [...qapItems];
                                        updatedItems[index] = {
                                          ...updatedItems[index],
                                          reviewDocument: value
                                        };
                                        setQapItems(updatedItems);
                                      }}
                                    >
                                      <SelectTrigger className="w-full h-5 text-[8px] border-dashed border-gray-400"> {/* Added dashed border to indicate hierarchy */}
                                        <SelectValue placeholder="Select document" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="Design & Drawings">Design & Drawings</SelectItem>
                                        <SelectItem value="Approval (ITP)">Approval (ITP)</SelectItem>
                                        <SelectItem value="WPS/PQR/WPQ & weld plan">WPS/PQR/WPQ & weld plan</SelectItem>
                                        <SelectItem value="Particular Material Appraisal">Particular Material Appraisal</SelectItem>
                                        <SelectItem value="Pneumatic & Hydrostatic leak test procedures">Pneumatic & Hydrostatic leak test procedures</SelectItem>
                                        <SelectItem value="(NDE) procedure">(NDE) procedure</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                                
                                {/* Dependent dropdown for In Process Inspection sub-options */}
                                {item.componentOperation === "In Process Inspection" && (
                                  <div className="pl-3 mt-1"> {/* Added padding-left for indentation */}
                                    <Select 
                                      value={item.processInspection || ""}
                                      onValueChange={(value) => {
                                        const updatedItems = [...qapItems];
                                        updatedItems[index] = {
                                          ...updatedItems[index],
                                          processInspection: value
                                        };
                                        setQapItems(updatedItems);
                                      }}
                                    >
                                      <SelectTrigger className="w-full h-5 text-[8px] border-dashed border-gray-400"> {/* Added dashed border to indicate hierarchy */}
                                        <SelectValue placeholder="Select inspection type" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="Identification of material and witnessing stamp transfer">Identification of material and witnessing stamp transfer</SelectItem>
                                        <SelectItem value="Examination of material cut edges and heat affected Zones">Examination of material cut edges and heat affected Zones</SelectItem>
                                        <SelectItem value="Examination of formed part">Examination of formed part</SelectItem>
                                        <SelectItem value="Examination of set up of seams for welding">Examination of set up of seams for welding</SelectItem>
                                        <SelectItem value="Examination of weld preparation">Examination of weld preparation</SelectItem>
                                        <SelectItem value="Inspection of second side of weld preparations">Inspection of second side of weld preparations</SelectItem>
                                        <SelectItem value="Nozzle, manhole Set-up on Shell & Dish End">Nozzle, manhole Set-up on Shell & Dish End</SelectItem>
                                        <SelectItem value="PWHT wherever applicable">PWHT wherever applicable</SelectItem>
                                        <SelectItem value="NDT tests for weld joints">NDT tests for weld joints</SelectItem>
                                        <SelectItem value="Final Visual & Dimension Inspection">Final Visual & Dimension Inspection</SelectItem>
                                        <SelectItem value="Pneumatic Test of Nozzle RF pads">Pneumatic Test of Nozzle RF pads</SelectItem>
                                        <SelectItem value="Hydrostatic Test">Hydrostatic Test</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                                
                                {/* Dependent dropdown for Final Assessment sub-options */}
                                {item.componentOperation === "Final Assessment" && (
                                  <div className="pl-3 mt-1"> {/* Added padding-left for indentation */}
                                    <Select 
                                      value={item.finalAssessment || ""}
                                      onValueChange={(value) => {
                                        const updatedItems = [...qapItems];
                                        updatedItems[index] = {
                                          ...updatedItems[index],
                                          finalAssessment: value
                                        };
                                        setQapItems(updatedItems);
                                      }}
                                    >
                                      <SelectTrigger className="w-full h-5 text-[8px] border-dashed border-gray-400"> {/* Added dashed border to indicate hierarchy */}
                                        <SelectValue placeholder="Select assessment type" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="Documentation review (heat chart, weld plans, test reports, NDT reports etc.)">Documentation review (heat chart, weld plans, test reports, NDT reports etc.)</SelectItem>
                                        <SelectItem value="Painting, stamping of data plate & signing of declaration">Painting, stamping of data plate & signing of declaration</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="p-1 border-r border-t">
                              <Select 
                                value={item.characteristicsChecked || ""}
                                onValueChange={(value) => {
                                  const updatedItems = [...qapItems];
                                  updatedItems[index] = {
                                    ...updatedItems[index],
                                    characteristicsChecked: value
                                  };
                                  setQapItems(updatedItems);
                                }}
                              >
                                <SelectTrigger className="w-full h-5 text-[8px]">
                                  <SelectValue placeholder="Select characteristic" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Review & approval">Review & approval</SelectItem>
                                  <SelectItem value="Physical Chemical dimensional & visual">Physical Chemical dimensional & visual</SelectItem>
                                  <SelectItem value="Dimensional Visual">Dimensional Visual</SelectItem>
                                  <SelectItem value="Identification of heat no, w.r.t Marking TC">Identification of heat no, w.r.t Marking TC</SelectItem>
                                  <SelectItem value="Visual">Visual</SelectItem>
                                  <SelectItem value="Welding">Welding</SelectItem>
                                  <SelectItem value="Weld defects">Weld defects</SelectItem>
                                  <SelectItem value="Weld leak">Weld leak</SelectItem>
                                  <SelectItem value="Documentation requirement as per PO">Documentation requirement as per PO</SelectItem>
                                  <SelectItem value="Painting as per RAL shade DFT measurement">Painting as per RAL shade DFT measurement</SelectItem>
                                  <SelectItem value="Final acceptance of vessel">Final acceptance of vessel</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="p-1 border-r border-t">
                              <Select 
                                defaultValue="Major"
                                onValueChange={(value) => {
                                  const updatedItems = [...qapItems];
                                  updatedItems[index] = {
                                    ...updatedItems[index],
                                    class: value
                                  };
                                  setQapItems(updatedItems);
                                }}
                              >
                                <SelectTrigger className="w-full h-5 text-[8px]">
                                  <SelectValue placeholder="Class" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Major">Major</SelectItem>
                                  <SelectItem value="Minor">Minor</SelectItem>
                                  <SelectItem value="Critical">Critical</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="p-1 border-r border-t">
                              <Select 
                                defaultValue="Visual"
                                onValueChange={(value) => {
                                  const updatedItems = [...qapItems];
                                  updatedItems[index] = {
                                    ...updatedItems[index],
                                    typeOfCheck: value
                                  };
                                  setQapItems(updatedItems);
                                }}
                              >
                                <SelectTrigger className="w-full h-5 text-[8px]">
                                  <SelectValue placeholder="Type" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Visual">Visual</SelectItem>
                                  <SelectItem value="Dimensional">Dimensional</SelectItem>
                                  <SelectItem value="Physical">Physical</SelectItem>
                                  <SelectItem value="Chemical">Chemical</SelectItem>
                                  <SelectItem value="NDT">NDT</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="p-1 border-r border-t">
                              <Input 
                                className="h-5 text-[8px]"
                                placeholder="100%"
                                value={item.quantumOfCheck}
                                onChange={(e) => {
                                  const updatedItems = [...qapItems];
                                  updatedItems[index] = {
                                    ...updatedItems[index],
                                    quantumOfCheck: e.target.value
                                  };
                                  setQapItems(updatedItems);
                                }}
                              />
                            </div>
                            <div className="p-1 border-r border-t">
                              <Select 
                                value={item.referenceDocument || ""}
                                onValueChange={(value) => {
                                  const updatedItems = [...qapItems];
                                  updatedItems[index] = {
                                    ...updatedItems[index],
                                    referenceDocument: value
                                  };
                                  setQapItems(updatedItems);
                                }}
                              >
                                <SelectTrigger className="w-full h-5 text-[8px]">
                                  <SelectValue placeholder="Select reference document" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Design & drawing">Design & drawing</SelectItem>
                                  <SelectItem value="WPS PQR WPQ & Weld plan">WPS PQR WPQ & Weld plan</SelectItem>
                                  <SelectItem value="As per Design Code">As per Design Code</SelectItem>
                                  <SelectItem value="Drawing Design Code & test procedure">Drawing Design Code & test procedure</SelectItem>
                                  <SelectItem value="Drawing respective WPS">Drawing respective WPS</SelectItem>
                                  <SelectItem value="Approved drawing">Approved drawing</SelectItem>
                                  <SelectItem value="Respective WPS">Respective WPS</SelectItem>
                                  <SelectItem value="Weld plan respective WPS">Weld plan respective WPS</SelectItem>
                                  <SelectItem value="Approved drawing weld plan NDT procedures">Approved drawing weld plan NDT procedures</SelectItem>
                                  <SelectItem value="Customer PO">Customer PO</SelectItem>
                                  <SelectItem value="Painting Procedure RAL (color code)">Painting Procedure RAL (color code)</SelectItem>
                                  <SelectItem value="Assessment of documents">Assessment of documents</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="p-1 border-r border-t">
                              <Input 
                                className="h-5 text-[8px]"
                                placeholder="Norms"
                                value={item.acceptanceNorms}
                                onChange={(e) => {
                                  const updatedItems = [...qapItems];
                                  updatedItems[index] = {
                                    ...updatedItems[index],
                                    acceptanceNorms: e.target.value
                                  };
                                  setQapItems(updatedItems);
                                }}
                              />
                            </div>
                            <div className="p-1 border-r border-t">
                              <Input 
                                className="h-5 text-[8px]"
                                placeholder="Format"
                                value={item.formatOfRecords}
                                onChange={(e) => {
                                  const updatedItems = [...qapItems];
                                  updatedItems[index] = {
                                    ...updatedItems[index],
                                    formatOfRecords: e.target.value
                                  };
                                  setQapItems(updatedItems);
                                }}
                              />
                            </div>
                            <div className="p-1 border-r border-t flex items-center justify-center space-x-1">
                              <div className="flex items-center space-x-1">
                                <input 
                                  type="checkbox" 
                                  className="h-2 w-2"
                                  checked={item.agency.M}
                                  onChange={(e) => {
                                    const updatedItems = [...qapItems];
                                    updatedItems[index] = {
                                      ...updatedItems[index],
                                      agency: {
                                        ...updatedItems[index].agency,
                                        M: e.target.checked
                                      }
                                    };
                                    setQapItems(updatedItems);
                                  }}
                                />
                                <span className="text-[8px]">M</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <input 
                                  type="checkbox" 
                                  className="h-2 w-2"
                                  checked={item.agency.C}
                                  onChange={(e) => {
                                    const updatedItems = [...qapItems];
                                    updatedItems[index] = {
                                      ...updatedItems[index],
                                      agency: {
                                        ...updatedItems[index].agency,
                                        C: e.target.checked
                                      }
                                    };
                                    setQapItems(updatedItems);
                                  }}
                                />
                                <span className="text-[8px]">C</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <input 
                                  type="checkbox" 
                                  className="h-2 w-2"
                                  checked={item.agency.SGS}
                                  onChange={(e) => {
                                    const updatedItems = [...qapItems];
                                    updatedItems[index] = {
                                      ...updatedItems[index],
                                      agency: {
                                        ...updatedItems[index].agency,
                                        SGS: e.target.checked
                                      }
                                    };
                                    setQapItems(updatedItems);
                                  }}
                                />
                                <span className="text-[8px]">SGS</span>
                              </div>
                            </div>
                            <div className="p-1 border-t">
                              <Input 
                                className="h-5 text-[8px]"
                                placeholder="Remarks"
                                value={item.remark}
                                onChange={(e) => {
                                  const updatedItems = [...qapItems];
                                  updatedItems[index] = {
                                    ...updatedItems[index],
                                    remark: e.target.value
                                  };
                                  setQapItems(updatedItems);
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground mt-2">
                      <p>Click the + button to add more QAP items. Items will be fully editable after creating the QAP document.</p>
                    </div>
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="remarks"
                    render={({ field }) => (
                      <FormItem className="col-span-1 md:col-span-2">
                        <FormLabel>Remarks</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Additional remarks or notes" 
                            className="min-h-[100px]"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
            
            <div className="flex justify-end gap-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setLocation("/quality-assurance-plan")}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex items-center gap-2">
                <Save size={16} />
                Save QAP
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </Layout>
  );
}