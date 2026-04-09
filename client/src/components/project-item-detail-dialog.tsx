import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Boxes,
  CheckCircle,
  Loader2,
  Upload,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProjectItemDetailDialogProps {
  item: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ProjectItemDetailDialog({ item, open, onOpenChange }: ProjectItemDetailDialogProps) {
  const { toast } = useToast();

  const sapSyncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/project-items/${item.id}/sap-sync`);
    },
    onSuccess: (data: any) => {
      toast({ title: "SAP Sync Successful", description: `Item ${data.itemCode} synced with BarCode ${data.codeBars}` });
    },
    onError: (err: any) => {
      toast({ title: "SAP Sync Failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-amber-500" />
            Project Item: {item.itemCode || item.masterItem?.itemCode || "N/A"}
          </DialogTitle>
          <DialogDescription>
            {item.description || item.masterItem?.description || "No description"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Item Code</label>
              <div className="mt-1 font-mono text-sm bg-muted rounded px-3 py-2 break-all">
                {item.itemCode || item.masterItem?.itemCode || "N/A"}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">CodeBars (SAP BarCode)</label>
              <div className="mt-1 font-mono text-sm bg-amber-50 border border-amber-200 rounded px-3 py-2">
                {item.codeBars || "-"}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</label>
            <div className="mt-1 text-sm bg-muted rounded px-3 py-2">
              {item.description || item.masterItem?.description || "N/A"}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quantity</label>
              <div className="mt-1 text-sm bg-muted rounded px-3 py-2">{item.quantity || "0"}</div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">UOM</label>
              <div className="mt-1 text-sm bg-muted rounded px-3 py-2">{item.uom || item.masterItem?.uom || "N/A"}</div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Make / Buy</label>
              <div className="mt-1 text-sm bg-muted rounded px-3 py-2">{item.makeOrBuy || item.masterItem?.makeOrBuy || "N/A"}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</label>
              <div className="mt-1">
                <Badge variant={
                  item.status === "Completed" ? "default" :
                  item.status === "Under Construction" ? "secondary" :
                  item.status === "Cancelled" ? "destructive" :
                  "outline"
                }>
                  {item.status || "Not Started"}
                </Badge>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Source</label>
              <div className="mt-1 text-sm bg-muted rounded px-3 py-2">{item.source || "-"}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">BP Code</label>
              <div className="mt-1 text-sm bg-muted rounded px-3 py-2">{item.bpCode || "-"}</div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Product Code</label>
              <div className="mt-1 text-sm bg-muted rounded px-3 py-2">{item.productCode || "-"}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Source Order</label>
              <div className="mt-1 text-sm bg-muted rounded px-3 py-2">{item.sourceOrderNumber || "-"}</div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">CodeBars (SAP BarCode)</label>
              <div className="mt-1 font-mono text-sm bg-amber-50 border border-amber-200 rounded px-3 py-2">{item.codeBars || "-"}</div>
            </div>
          </div>

          {item.notes && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</label>
              <div className="mt-1 text-sm bg-muted rounded px-3 py-2">{item.notes}</div>
            </div>
          )}

          <div className="border-t pt-3">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">SAP Sync Status</label>
            <div className="mt-2 flex items-center gap-3">
              {item.sapSynced ? (
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle className="h-3 w-3 mr-1" /> Synced
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">Not Synced</Badge>
              )}
              {item.sapSyncedAt && (
                <span className="text-xs text-muted-foreground">
                  {format(new Date(item.sapSyncedAt), "dd MMM yyyy HH:mm")}
                </span>
              )}
              <Button
                size="sm"
                variant={item.sapSynced ? "outline" : "default"}
                disabled={!item.codeBars || sapSyncMutation.isPending}
                onClick={() => sapSyncMutation.mutate()}
                className="ml-auto"
              >
                {sapSyncMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Syncing...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-1" /> {item.sapSynced ? "Re-sync to SAP" : "Sync to SAP B1"}</>
                )}
              </Button>
            </div>
            {(item.sapSyncError || sapSyncMutation.isError) && (
              <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
                {(sapSyncMutation.error as any)?.message || item.sapSyncError}
              </div>
            )}
            <div className="mt-2 text-xs text-muted-foreground">
              SAP payload: ItemCode={item.itemCode}, BarCode={item.codeBars}, ItemsGroupCode=104, UOM={item.uom || 'Nos'}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
