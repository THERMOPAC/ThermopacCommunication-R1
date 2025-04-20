import React from "react";
import { Helmet } from "react-helmet";
import { useAuth } from "@/hooks/use-auth";
import Layout from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { FileText, ArrowLeft, Check, Save } from "lucide-react";

// Define schema for the QAP form
const qapFormSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  customerId: z.string().min(1, "Customer is required"),
  title: z.string().min(1, "Title is required"),
  itemDescription: z.string().min(1, "Item description is required"),
  drawingNumber: z.string().optional(),
  revision: z.string().optional(),
  poNumber: z.string().optional(),
  qapNumber: z.string().min(1, "QAP number is required"),
  revisionNumber: z.string().default("0"),
  remarks: z.string().optional(),
});

type QAPFormValues = z.infer<typeof qapFormSchema>;

export default function CreateQAPPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Initialize the form
  const form = useForm<QAPFormValues>({
    resolver: zodResolver(qapFormSchema),
    defaultValues: {
      projectId: "",
      customerId: "",
      title: "",
      itemDescription: "",
      drawingNumber: "",
      revision: "",
      poNumber: "",
      qapNumber: "",
      revisionNumber: "0",
      remarks: "",
    },
  });

  // Fetch projects
  const { data: projects = [] } = useQuery<{ id: number; name: string; code: string; customer: { id: number; bpName: string } }[]>({
    queryKey: ['api/projects'],
    throwOnError: false,
  });

  // Fetch customers
  const { data: customers = [] } = useQuery<{ id: number; bpCode: string; bpName: string }[]>({
    queryKey: ['api/customers'],
    throwOnError: false,
  });

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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="projectId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
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
                                {project.name} ({project.code})
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
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a customer" />
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
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
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
                    name="qapNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>QAP Number</FormLabel>
                        <FormControl>
                          <Input placeholder="QAP-0001" {...field} />
                        </FormControl>
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
                        <FormControl>
                          <Input placeholder="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="itemDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Item Description</FormLabel>
                        <FormControl>
                          <Input placeholder="Item Description" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="drawingNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Drawing Number</FormLabel>
                        <FormControl>
                          <Input placeholder="DRG-001" {...field} />
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
                    name="poNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>PO Number</FormLabel>
                        <FormControl>
                          <Input placeholder="PO-001" {...field} />
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