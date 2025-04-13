import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Briefcase, CheckCircle, AlertCircle, Building } from "lucide-react";
import PageHeader from "@/components/page-header";
import DataTable from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

export default function ProjectCommissioningPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Fetch projects that can be commissioned
  const { data: projects, isLoading: projectsLoading } = useQuery<any[]>({
    queryKey: ['/api/projects'],
    select: (data) => data.filter((project) => 
      project.status === 'Completed' || 
      project.currentPhase === 'Quality'
    ),
  });
  
  // Mock commissioning data for demonstration
  const commissioningData = projects?.map((project) => ({
    id: project.id,
    projectCode: project.code,
    projectName: project.name,
    status: Math.random() > 0.5 ? 'Ready for Commissioning' : 'Pending Checklist',
    checklistComplete: Math.random() > 0.3,
    documentationReady: Math.random() > 0.3,
    customerApproved: Math.random() > 0.7,
    handoverDate: Math.random() > 0.5 
      ? new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000).toLocaleDateString() 
      : 'Not Scheduled'
  }));

  // Display status badge with appropriate color
  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'Ready for Commissioning':
        return <Badge className="bg-green-500">{status}</Badge>;
      case 'Pending Checklist':
        return <Badge className="bg-amber-500">{status}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getChecklistStatusBadge = (isComplete: boolean) => {
    return isComplete 
      ? <Badge className="bg-green-500">Complete</Badge>
      : <Badge className="bg-amber-500">Incomplete</Badge>;
  };

  // Define columns for the commissioning projects table
  const commissioning = {
    columns: [
      { 
        header: "Project",
        cell: ({ row }: { row: any }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.projectCode}</span>
            <span className="text-muted-foreground text-sm">{row.original.projectName}</span>
          </div>
        ),
      },
      {
        header: "Status",
        cell: ({ row }: { row: any }) => getStatusBadge(row.original.status),
      },
      {
        header: "Checklist",
        cell: ({ row }: { row: any }) => getChecklistStatusBadge(row.original.checklistComplete),
      },
      {
        header: "Documentation",
        cell: ({ row }: { row: any }) => (
          row.original.documentationReady
            ? <Badge className="bg-green-500">Ready</Badge>
            : <Badge className="bg-amber-500">Pending</Badge>
        ),
      },
      {
        header: "Customer Approval",
        cell: ({ row }: { row: any }) => (
          row.original.customerApproved
            ? <Badge className="bg-green-500">Approved</Badge>
            : <Badge variant="outline">Awaiting</Badge>
        ),
      },
      {
        header: "Handover Date",
        cell: ({ row }: { row: any }) => row.original.handoverDate,
      },
      {
        header: "Actions",
        cell: ({ row }: { row: any }) => (
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                toast({
                  title: "Managing commissioning",
                  description: `Opening commissioning details for project ${row.original.projectCode}`,
                });
              }}
            >
              Manage
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              disabled={!row.original.checklistComplete || !row.original.documentationReady}
              onClick={() => {
                toast({
                  title: "Scheduling handover",
                  description: `Opening handover scheduler for project ${row.original.projectCode}`,
                });
              }}
            >
              Schedule Handover
            </Button>
          </div>
        ),
      },
    ],
    data: commissioningData || [],
  };

  // Define columns for the commissioning summary statistics
  const stats = [
    {
      title: "Ready for Handover",
      value: commissioningData?.filter(p => 
        p.checklistComplete && p.documentationReady && p.customerApproved
      ).length || 0,
      description: "Projects ready for client handover",
      icon: CheckCircle,
      color: "text-green-500"
    },
    {
      title: "Pending Documentation",
      value: commissioningData?.filter(p => !p.documentationReady).length || 0,
      description: "Projects awaiting final documentation",
      icon: ClipboardList,
      color: "text-amber-500"
    },
    {
      title: "Pending Customer Approval",
      value: commissioningData?.filter(p => !p.customerApproved).length || 0,
      description: "Projects awaiting client sign-off",
      icon: Building,
      color: "text-blue-500"
    },
    {
      title: "Pending Checklist Items",
      value: commissioningData?.filter(p => !p.checklistComplete).length || 0,
      description: "Projects with incomplete checklists",
      icon: AlertCircle,
      color: "text-red-500"
    }
  ];

  return (
    <Layout>
      <PageHeader
        title="Project Commissioning"
        subtitle="Manage project handover and commissioning activities"
        icon={<Briefcase className="h-6 w-6" />}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-xl">{stat.title}</CardTitle>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
              <p className="text-muted-foreground text-sm">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="commissioning">
        <TabsList className="mb-4">
          <TabsTrigger value="commissioning">Commissioning Projects</TabsTrigger>
          <TabsTrigger value="checklists">Commissioning Checklists</TabsTrigger>
          <TabsTrigger value="documentation">Documentation</TabsTrigger>
          <TabsTrigger value="handover">Handover Schedules</TabsTrigger>
        </TabsList>
        
        <TabsContent value="commissioning">
          <Card>
            <CardHeader>
              <CardTitle>Projects Ready for Commissioning</CardTitle>
              <CardDescription>
                View and manage projects in the commissioning phase
              </CardDescription>
            </CardHeader>
            <CardContent>
              {projectsLoading ? (
                <div className="flex justify-center items-center h-64">
                  <p>Loading commissioning projects...</p>
                </div>
              ) : commissioningData?.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <ClipboardList className="h-10 w-10 text-muted-foreground mb-4" />
                  <h3 className="font-semibold text-lg">No commissioning projects</h3>
                  <p className="text-muted-foreground max-w-md">
                    There are no projects currently in the commissioning phase.
                  </p>
                </div>
              ) : (
                <DataTable columns={commissioning.columns} data={commissioning.data} />
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button 
                variant="outline" 
                onClick={() => {
                  toast({
                    title: "Exporting data",
                    description: "Exporting commissioning status to Excel"
                  });
                }}
              >
                Export to Excel
              </Button>
              <Button 
                onClick={() => {
                  toast({
                    title: "Commissioning Report",
                    description: "Generating commissioning status report"
                  });
                }}
              >
                Generate Report
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="checklists">
          <Card>
            <CardHeader>
              <CardTitle>Commissioning Checklists</CardTitle>
              <CardDescription>
                Manage and complete commissioning checklists for each project
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <ClipboardList className="h-10 w-10 text-muted-foreground mb-4" />
                <h3 className="font-semibold text-lg">Select a project to view checklists</h3>
                <p className="text-muted-foreground max-w-md">
                  Choose a project from the Commissioning Projects tab to view and complete its checklists.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="documentation">
          <Card>
            <CardHeader>
              <CardTitle>Commissioning Documentation</CardTitle>
              <CardDescription>
                Manage project handover documentation and client approval documents
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <ClipboardList className="h-10 w-10 text-muted-foreground mb-4" />
                <h3 className="font-semibold text-lg">Select a project to view documentation</h3>
                <p className="text-muted-foreground max-w-md">
                  Choose a project from the Commissioning Projects tab to manage its handover documentation.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="handover">
          <Card>
            <CardHeader>
              <CardTitle>Handover Schedules</CardTitle>
              <CardDescription>
                Schedule and manage project handover activities and client meetings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <ClipboardList className="h-10 w-10 text-muted-foreground mb-4" />
                <h3 className="font-semibold text-lg">Upcoming handover activities</h3>
                <p className="text-muted-foreground max-w-md">
                  No upcoming handover activities scheduled. Select a project to schedule a handover.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Layout>
  );
}