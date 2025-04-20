import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { format } from "date-fns";
import { Loader2, Save, ArrowLeft, FileText, Send, Check, AlertTriangle, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import Layout from "@/components/layout";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
});

export default function ViewEditQAPPage() {
  const { id } = useParams<{ id: string }>();
  const qapId = parseInt(id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  // Query QAP data
  const { data: qap, isLoading, error } = useQuery({
    queryKey: ['/api/quality/generated-qaps', qapId],
    enabled: !isNaN(qapId),
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
      });
    }
  }, [qap, form]);

  // Update QAP mutation
  const updateQapMutation = useMutation({
    mutationFn: async (values: z.infer<typeof qapFormSchema>) => {
      return apiRequest(`/api/quality/generated-qaps/${qapId}`, 'PUT', values);
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
      return apiRequest(`/api/quality/generated-qaps/${qapId}`, 'PUT', { status: 'approved' });
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
    updateQapMutation.mutate(values);
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
    if (!qap || !qap?.project) return "QAP-???";
    return `QAP-${qap?.project?.code || "???"}-${String(qap?.id || "").padStart(3, '0')}`;
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={handleBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to QAPs
          </Button>
          <div className="flex items-center gap-2">
            {canEdit() && !isEditing && (
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                Edit QAP
              </Button>
            )}
            {canApprove() && (qap?.status || "") !== "approved" && (
              <Button
                variant="outline"
                className="text-green-600 border-green-600 hover:bg-green-50"
                onClick={() => approveQapMutation.mutate()}
                disabled={approveQapMutation.isPending}
              >
                {approveQapMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Approve
              </Button>
            )}
            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        <div className="space-y-6 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Button 
                variant="outline" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => navigate("/quality-assurance-plan")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-2xl font-bold">{qap?.status === "draft" ? "Edit" : "View"} Quality Assurance Plan</h1>
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
              <FileText className="h-6 w-6 text-muted-foreground ml-2" />
            </div>
          </div>

          <Separator />

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              {isEditing ? (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <Card>
                      <CardContent className="p-6">
                        {/* First row: Title and Revision */}
                        <div className="grid grid-cols-2 gap-4 mb-6">
                          <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Title</FormLabel>
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
                                <FormLabel>Revision</FormLabel>
                                <FormControl>
                                  <Input {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        {/* Second row: Client Name and Equipment Type */}
                        <div className="grid grid-cols-2 gap-4 mb-6">
                          <FormField
                            control={form.control}
                            name="clientName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Client Name</FormLabel>
                                <FormControl>
                                  <Input {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="equipmentType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Equipment Type</FormLabel>
                                <FormControl>
                                  <Input {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        {/* Third row: Standards Applicable */}
                        <div className="mb-6">
                          <FormField
                            control={form.control}
                            name="standardsApplicable"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Standards Applicable</FormLabel>
                                <FormControl>
                                  <Input {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        {/* Fourth row: Remarks */}
                        <div className="mb-6">
                          <FormField
                            control={form.control}
                            name="remarks"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Remarks</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder="Additional notes or remarks"
                                    className="min-h-[100px]"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        {/* Fifth row: Buttons */}
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsEditing(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            disabled={updateQapMutation.isPending}
                          >
                            {updateQapMutation.isPending && (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            <Save className="mr-2 h-4 w-4" />
                            Save Changes
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </form>
                </Form>
              ) : (
                <Card>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">
                          Project
                        </h3>
                        <p>{qap?.project?.name || "N/A"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">
                          Project Code
                        </h3>
                        <p>{qap?.project?.code || "N/A"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">
                          Client
                        </h3>
                        <p>{qap?.clientName || "N/A"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">
                          Equipment Type
                        </h3>
                        <p>{qap?.equipmentType || "N/A"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">
                          Standards
                        </h3>
                        <p>{qap?.standardsApplicable || "N/A"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">
                          Revision
                        </h3>
                        <p>{qap?.revision || "0"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">
                          Prepared By
                        </h3>
                        <p>
                          {qap?.preparedByUser?.username || "Unknown"} on{" "}
                          {qap?.createdAt ? format(new Date(qap.createdAt), "MMM dd, yyyy") : "Unknown"}
                        </p>
                      </div>
                      {(qap?.status || "") === "approved" && qap?.approvedByUser && (
                        <div>
                          <h3 className="text-sm font-medium text-muted-foreground mb-1">
                            Approved By
                          </h3>
                          <p>
                            {qap?.approvedByUser?.username || "Unknown"}
                            {qap?.approvedDate && (
                              <> on {format(new Date(qap.approvedDate), "MMM dd, yyyy")}</>
                            )}
                          </p>
                        </div>
                      )}
                    </div>

                    {qap?.remarks && (
                      <div className="mt-6">
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">
                          Remarks
                        </h3>
                        <p className="whitespace-pre-wrap">{qap?.remarks}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="content">
              {isEditing ? (
                <Form {...form}>
                  <form className="space-y-6">
                    <Card>
                      <CardContent className="p-6">
                        <FormField
                          control={form.control}
                          name="content"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>QAP Content</FormLabel>
                              <FormControl>
                                <Textarea
                                  {...field}
                                  className="font-mono min-h-[60vh]"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="flex justify-end gap-2 mt-6">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsEditing(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            onClick={form.handleSubmit(onSubmit)}
                            disabled={updateQapMutation.isPending}
                          >
                            {updateQapMutation.isPending && (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            <Save className="mr-2 h-4 w-4" />
                            Save Changes
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </form>
                </Form>
              ) : (
                <Card>
                  <CardContent className="p-6">
                    <div className="flex justify-end mb-4">
                      <Button variant="outline" onClick={handleExport}>
                        <FileText className="mr-2 h-4 w-4" />
                        View Full Document
                      </Button>
                    </div>
                    <div className="max-h-[600px] overflow-auto border rounded-md p-4">
                      <div
                        className="prose max-w-none"
                        dangerouslySetInnerHTML={{
                          __html: qap?.content || "<p>No content available</p>",
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="history">
              <Card>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-medium">Revision History</h3>
                    </div>

                    {qap?.versions && qap.versions.length > 0 ? (
                      <div className="space-y-4">
                        {qap.versions.map((version: any) => (
                          <div
                            key={version.id}
                            className="border rounded-md p-4 space-y-2"
                          >
                            <div className="flex justify-between">
                              <div>
                                <span className="font-medium">Version {version.version}</span>
                                <span className="text-muted-foreground ml-2">
                                  ({version.revision})
                                </span>
                              </div>
                              <span className="text-sm text-muted-foreground">
                                {format(new Date(version.createdAt), "MMM dd, yyyy HH:mm")}
                              </span>
                            </div>
                            <p className="text-sm">
                              Created by {version.createdByUser?.username || "Unknown"}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No revision history available</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}