import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChevronRight } from "lucide-react";
import { format } from "date-fns";
import "./work-order-summary.css";

// Define the status color mapping
const statusColors: Record<string, string> = {
  planned: "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-800",
  on_hold: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800"
};

// Define the Work Order type
interface WorkOrder {
  id: number;
  workOrderNumber: string;
  title: string;
  status: 'planned' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
  productionLine: string | null;
  plannedStartDate: string | null;
  priority: string;
  progress: number;
}

interface WorkOrderSummaryProps {
  workOrder: WorkOrder;
  onEdit?: (id: number) => void;
}

// Calculate work order progress based on status
const getWorkOrderProgress = (status: string): number => {
  switch (status) {
    case "planned": return 10;
    case "in_progress": return 50;
    case "on_hold": return 30;
    case "completed": return 100;
    case "cancelled": return 0;
    default: return 0;
  }
};

const WorkOrderSummary: React.FC<WorkOrderSummaryProps> = ({ workOrder, onEdit }) => {
  const progress = workOrder.progress || getWorkOrderProgress(workOrder.status);
  
  const handleEdit = () => {
    if (onEdit) {
      onEdit(workOrder.id);
    } else {
      window.location.href = `/production/work-orders/details/${workOrder.id}`;
    }
  };

  return (
    <div className="work-order-summary">
      <div className="work-order-content">
        {/* Work Order Number */}
        <div className="work-order-number">
          {workOrder.workOrderNumber}
        </div>
        
        {/* Status */}
        <div className="work-order-status">
          <Badge className={statusColors[workOrder.status]}>
            {workOrder.status === "in_progress" ? "In Progress" : 
             workOrder.status.charAt(0).toUpperCase() + workOrder.status.slice(1)}
          </Badge>
        </div>
        
        {/* Title */}
        <div className="work-order-title">
          {workOrder.title}
        </div>
        
        {/* Production Team */}
        <div className="work-order-team">
          <span className="label">Team:</span>
          <span>{workOrder.productionLine || "Unassigned"}</span>
        </div>
        
        {/* Scheduled Date */}
        <div className="work-order-date">
          <span className="label">Date:</span>
          <span>
            {workOrder.plannedStartDate ? 
              format(new Date(workOrder.plannedStartDate), 'dd MMM yyyy') : 
              "Not scheduled"}
          </span>
        </div>
        
        {/* Priority */}
        <div className="work-order-priority">
          <span className="label">Priority:</span>
          <span>{workOrder.priority || "Medium"}</span>
        </div>
        
        {/* Edit Button */}
        <div className="work-order-action">
          <Button 
            variant="outline" 
            size="sm" 
            className="edit-button" 
            onClick={handleEdit}
          >
            Edit <ChevronRight className="icon" />
          </Button>
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="work-order-progress">
        <div className="progress-labels">
          <span>Progress</span>
          <span>{progress}%</span>
        </div>
        <Progress value={progress} className="progress-bar" />
      </div>
    </div>
  );
};

export default WorkOrderSummary;