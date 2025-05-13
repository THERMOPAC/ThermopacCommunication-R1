import React from "react";
import { Helmet } from "react-helmet";
import Layout from "@/components/layout";
import WorkOrderSummary from "@/components/work-order-summary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

// Sample work order data for demonstration
const sampleWorkOrders = [
  {
    id: 1,
    workOrderNumber: "WO-2025-001",
    title: "Fabrication of Heat Exchanger Components",
    status: "in_progress" as const,
    productionLine: "Production Team-1",
    plannedStartDate: "2025-04-15",
    priority: "High",
    progress: 50
  },
  {
    id: 2,
    workOrderNumber: "WO-2025-002",
    title: "Assembly of Control Panel for HVAC System",
    status: "planned" as const,
    productionLine: "Production Team-2",
    plannedStartDate: "2025-04-20",
    priority: "Medium",
    progress: 10
  },
  {
    id: 3,
    workOrderNumber: "WO-2025-003",
    title: "Machining of Precision Valve Components",
    status: "completed" as const,
    productionLine: "Production Team-1",
    plannedStartDate: "2025-04-05",
    priority: "High",
    progress: 100
  },
  {
    id: 4,
    workOrderNumber: "WO-2025-004",
    title: "Construction of Pressure Vessel",
    status: "on_hold" as const,
    productionLine: "Production Team-3",
    plannedStartDate: "2025-04-12",
    priority: "Low",
    progress: 30
  },
  {
    id: 5,
    workOrderNumber: "WO-2025-005",
    title: "Installation of Electrical Wiring for Control Systems",
    status: "cancelled" as const,
    productionLine: null,
    plannedStartDate: null,
    priority: "Medium",
    progress: 0
  }
];

export default function WorkOrderSummaryDemo() {
  const handleEditWorkOrder = (id: number) => {
    toast({
      title: "Edit Work Order",
      description: `Editing work order with ID: ${id}`,
    });
  };

  return (
    <Layout>
      <Helmet>
        <title>Work Order Summary Demo | Thermopac</title>
      </Helmet>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Work Order Summary Demo</h1>
          <p className="text-muted-foreground mt-2">
            This page demonstrates a responsive work order summary component that displays work orders in a single line.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Single-Line Work Order Display</CardTitle>
            <CardDescription>
              Resize your browser window to see how the component adapts to different screen sizes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sampleWorkOrders.map(workOrder => (
                <WorkOrderSummary 
                  key={workOrder.id}
                  workOrder={workOrder}
                  onEdit={handleEditWorkOrder}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Responsive Behavior</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium">Desktop (1024px and above):</h3>
                <p className="text-sm text-muted-foreground">
                  All information is displayed in a single line, with the progress bar positioned below.
                </p>
              </div>
              <div>
                <h3 className="font-medium">Tablet (768px to 1023px):</h3>
                <p className="text-sm text-muted-foreground">
                  The title moves to its own line, allowing other elements to remain visible and properly sized.
                </p>
              </div>
              <div>
                <h3 className="font-medium">Mobile (below 768px):</h3>
                <p className="text-sm text-muted-foreground">
                  Elements rearrange into a more compact grid layout that's easier to read on small screens.
                </p>
              </div>
              <div>
                <h3 className="font-medium">Small Mobile (below 480px):</h3>
                <p className="text-sm text-muted-foreground">
                  Elements stack vertically to maximize readability on very small screens.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}