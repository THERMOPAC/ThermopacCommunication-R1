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
  const onSubmit = (values: QAPFormValues) => {
    // This would be replaced with actual API call
    console.log("Form values:", values);
    toast({
      title: "Success",
      description: "QAP created successfully",
    });
    setLocation("/quality-assurance-plan");
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
                              value={field.value}
                              disabled={true}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a project first" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
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