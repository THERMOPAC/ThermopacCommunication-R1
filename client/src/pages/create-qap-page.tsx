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
import { FileText, ArrowLeft, Save } from "lucide-react";
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

export default function CreateQAPPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedProjectCode, setSelectedProjectCode] = useState<string>("");

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
      
      // Prepare QAP table structure for display
      const qapTableItems = [
        {
          slNo: 1,
          componentOperation: "Review of Documents",
          characteristicsChecked: "Document completeness",
          class: "Major",
          typeOfCheck: "Visual",
          quantumOfCheck: "100%",
          referenceDocument: "Project specifications",
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
                    <td>${item.componentOperation}</td>
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
                    <h3 className="font-medium text-lg mb-3">QAP Items</h3>
                    <div className="overflow-x-auto">
                      <div className="min-w-full border rounded-md">
                        <div className="grid grid-cols-11 text-xs font-medium text-center bg-muted">
                          <div className="p-2 border-r">SL.NO</div>
                          <div className="p-2 border-r">COMPONENT & OPERATION</div>
                          <div className="p-2 border-r">CHARACTERISTICS CHECKED</div>
                          <div className="p-2 border-r">CLASS</div>
                          <div className="p-2 border-r">TYPE OF CHECK</div>
                          <div className="p-2 border-r">QUANTUM OF CHECK</div>
                          <div className="p-2 border-r">REFERENCE DOCUMENT</div>
                          <div className="p-2 border-r">ACCEPTANCE NORMS</div>
                          <div className="p-2 border-r">FORMAT OF RECORDS</div>
                          <div className="p-2 border-r">AGENCY</div>
                          <div className="p-2">REMARK</div>
                        </div>
                        <div className="grid grid-cols-11 text-xs">
                          <div className="p-3 border-r border-t text-center">1</div>
                          <div className="p-3 border-r border-t">
                            <Select defaultValue="review-documents">
                              <SelectTrigger className="w-full h-6 text-xs">
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
                          </div>
                          <div className="p-3 border-r border-t"></div>
                          <div className="p-3 border-r border-t"></div>
                          <div className="p-3 border-r border-t"></div>
                          <div className="p-3 border-r border-t"></div>
                          <div className="p-3 border-r border-t"></div>
                          <div className="p-3 border-r border-t"></div>
                          <div className="p-3 border-r border-t"></div>
                          <div className="p-3 border-r border-t"></div>
                          <div className="p-3 border-t"></div>
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground mt-2">
                      <p>QAP items will be editable after creating the QAP document.</p>
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