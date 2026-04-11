import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { GitPullRequest, FileCheck, Plus, Send, CheckCircle, XCircle, Play, Lock, Loader2, ArrowRight, AlertTriangle } from 'lucide-react';

const roleHierarchy: Record<string, number> = {
  Superuser: 0, "General Manager": 1, "Senior Manager": 2, Manager: 3, "Senior Executive": 4, Employee: 5,
};
function rl(role: string) { return roleHierarchy[role] ?? 99; }

const ECR_STATUS_STYLE: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700",
  Submitted: "bg-blue-100 text-blue-700",
  Approved: "bg-emerald-100 text-emerald-700",
  Rejected: "bg-red-100 text-red-600",
};

const ECN_STATUS_STYLE: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700",
  Issued: "bg-blue-100 text-blue-700",
  Implemented: "bg-emerald-100 text-emerald-700",
  Closed: "bg-gray-100 text-gray-600",
};

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface Props {
  drawingControlId: number;
  dwgControlNumber: string;
  revisionCode: string;
  userRole: string;
  drawingStatus: string;
}

export default function DrawingEngineeringChanges({ drawingControlId, dwgControlNumber, revisionCode, userRole, drawingStatus }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('ecr');
  const [createEcrOpen, setCreateEcrOpen] = useState(false);
  const [createEcnOpen, setCreateEcnOpen] = useState(false);
  const [ecrDesc, setEcrDesc] = useState('');
  const [ecrReason, setEcrReason] = useState('');
  const [ecrNotes, setEcrNotes] = useState('');
  const [ecnEcrId, setEcnEcrId] = useState('');
  const [ecnDesc, setEcnDesc] = useState('');
  const [ecnImpl, setEcnImpl] = useState('');
  const [ecnNotes, setEcnNotes] = useState('');
  const [rejectDialogId, setRejectDialogId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const ecrKey = ['/api/drawing-controls', drawingControlId, 'ecr'];
  const ecnKey = ['/api/drawing-controls', drawingControlId, 'ecn'];
  const approvedEcrKey = ['/api/drawing-controls', drawingControlId, 'ecr', 'approved'];

  const { data: ecrs = [], isLoading: ecrLoading } = useQuery<any[]>({
    queryKey: ecrKey,
    queryFn: () => fetch(`/api/drawing-controls/${drawingControlId}/ecr`, { credentials: 'include' }).then(r => r.json()),
  });

  const { data: ecns = [], isLoading: ecnLoading } = useQuery<any[]>({
    queryKey: ecnKey,
    queryFn: () => fetch(`/api/drawing-controls/${drawingControlId}/ecn`, { credentials: 'include' }).then(r => r.json()),
  });

  const { data: approvedEcrs = [] } = useQuery<any[]>({
    queryKey: approvedEcrKey,
    queryFn: () => fetch(`/api/drawing-controls/${drawingControlId}/ecr/approved`, { credentials: 'include' }).then(r => r.json()),
    enabled: createEcnOpen,
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ecrKey });
    queryClient.invalidateQueries({ queryKey: ecnKey });
    queryClient.invalidateQueries({ queryKey: approvedEcrKey });
    queryClient.invalidateQueries({ queryKey: ['/api/drawing-controls'] });
  }

  const createEcrMut = useMutation({
    mutationFn: () => apiRequest('POST', `/api/drawing-controls/${drawingControlId}/ecr`, { description: ecrDesc, reason: ecrReason, notes: ecrNotes }),
    onSuccess: () => { invalidateAll(); setCreateEcrOpen(false); setEcrDesc(''); setEcrReason(''); setEcrNotes(''); toast({ title: 'ECR created' }); },
    onError: (e: any) => toast({ title: 'Failed to create ECR', description: e.message, variant: 'destructive' }),
  });

  const submitEcrMut = useMutation({
    mutationFn: (id: number) => apiRequest('PUT', `/api/drawing-ecr/${id}/submit`),
    onSuccess: () => { invalidateAll(); toast({ title: 'ECR submitted for review' }); },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const approveEcrMut = useMutation({
    mutationFn: (id: number) => apiRequest('PUT', `/api/drawing-ecr/${id}/approve`),
    onSuccess: () => { invalidateAll(); toast({ title: 'ECR approved' }); },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const rejectEcrMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => apiRequest('PUT', `/api/drawing-ecr/${id}/reject`, { reason }),
    onSuccess: () => { invalidateAll(); setRejectDialogId(null); setRejectReason(''); toast({ title: 'ECR rejected' }); },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const createEcnMut = useMutation({
    mutationFn: () => apiRequest('POST', `/api/drawing-controls/${drawingControlId}/ecn`, {
      ecr_id: ecnEcrId ? parseInt(ecnEcrId) : undefined,
      description: ecnDesc, implementation_details: ecnImpl, notes: ecnNotes,
    }),
    onSuccess: () => { invalidateAll(); setCreateEcnOpen(false); setEcnEcrId(''); setEcnDesc(''); setEcnImpl(''); setEcnNotes(''); toast({ title: 'ECN created' }); },
    onError: (e: any) => toast({ title: 'Failed to create ECN', description: e.message, variant: 'destructive' }),
  });

  const issueEcnMut = useMutation({
    mutationFn: (id: number) => apiRequest('PUT', `/api/drawing-ecn/${id}/issue`),
    onSuccess: () => { invalidateAll(); toast({ title: 'ECN issued' }); },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const implementEcnMut = useMutation({
    mutationFn: (id: number) => apiRequest('PUT', `/api/drawing-ecn/${id}/implement`),
    onSuccess: (data: any) => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({ title: 'ECN implemented', description: data.message || 'New drawing revision created' });
    },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const closeEcnMut = useMutation({
    mutationFn: (id: number) => apiRequest('PUT', `/api/drawing-ecn/${id}/close`),
    onSuccess: () => { invalidateAll(); toast({ title: 'ECN closed' }); },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const isTerminal = ['canceled', 'superseded'].includes(drawingStatus);
  const canCreateEcr = rl(userRole) <= 3 && !isTerminal;
  const canCreateEcn = rl(userRole) <= 2 && !isTerminal;
  const canApproveEcr = rl(userRole) <= 2;
  const canIssueEcn = rl(userRole) <= 2;
  const canImplementEcn = rl(userRole) <= 1;
  const canCloseEcn = rl(userRole) <= 2;

  return (
    <Card className="shadow-sm">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-[11px] font-medium flex items-center gap-1.5">
          <GitPullRequest className="h-3.5 w-3.5" /> Engineering Changes
          <span className="text-muted-foreground font-normal ml-1">
            ({ecrs.length} ECR{ecrs.length !== 1 ? 's' : ''}, {ecns.length} ECN{ecns.length !== 1 ? 's' : ''})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-2">
            <TabsList className="h-7">
              <TabsTrigger value="ecr" className="text-[10px] h-6 px-2.5">ECR</TabsTrigger>
              <TabsTrigger value="ecn" className="text-[10px] h-6 px-2.5">ECN</TabsTrigger>
            </TabsList>
            <div className="flex gap-1">
              {activeTab === 'ecr' && canCreateEcr && (
                <Button size="sm" variant="outline" className="h-6 text-[9px] px-2" onClick={() => setCreateEcrOpen(true)}>
                  <Plus className="h-3 w-3 mr-0.5" /> Create ECR
                </Button>
              )}
              {activeTab === 'ecn' && canCreateEcn && (
                <Button size="sm" variant="outline" className="h-6 text-[9px] px-2" onClick={() => setCreateEcnOpen(true)}>
                  <Plus className="h-3 w-3 mr-0.5" /> Create ECN
                </Button>
              )}
            </div>
          </div>

          <TabsContent value="ecr" className="mt-0">
            {ecrLoading ? (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground py-3"><Loader2 className="h-3 w-3 animate-spin" /> Loading...</div>
            ) : ecrs.length === 0 ? (
              <p className="text-[10px] text-muted-foreground italic py-3">No Engineering Change Requests for this drawing.</p>
            ) : (
              <div className="space-y-2">
                {ecrs.map((ecr: any) => (
                  <div key={ecr.id} className="border rounded-md p-2 text-[10px] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium font-mono">{ecr.document_number}</span>
                      <Badge className={`text-[9px] h-4 px-1.5 ${ECR_STATUS_STYLE[ecr.status] || ''}`}>{ecr.status}</Badge>
                    </div>
                    <div className="text-muted-foreground"><strong>Description:</strong> {ecr.description}</div>
                    <div className="text-muted-foreground"><strong>Reason:</strong> {ecr.reason}</div>
                    <div className="flex gap-3 text-muted-foreground">
                      <span>Raised by: {ecr.requested_by_name || '—'}</span>
                      <span>Date: {formatDate(ecr.requested_date)}</span>
                    </div>
                    {ecr.approved_by_name && (
                      <div className="text-muted-foreground">
                        {ecr.status === 'Rejected' ? 'Rejected' : 'Approved'} by: {ecr.approved_by_name} on {formatDate(ecr.approved_date)}
                      </div>
                    )}
                    {ecr.notes && <div className="text-muted-foreground italic">{ecr.notes}</div>}
                    <TooltipProvider>
                      <div className="flex gap-1 pt-1">
                        {ecr.status === 'Draft' && rl(userRole) <= 3 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="outline" className="h-5 text-[9px] px-1.5" onClick={() => submitEcrMut.mutate(ecr.id)} disabled={submitEcrMut.isPending}>
                                <Send className="h-2.5 w-2.5 mr-0.5" /> Submit
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="text-[10px]">Submit for Senior Manager review</TooltipContent>
                          </Tooltip>
                        )}
                        {ecr.status === 'Submitted' && canApproveEcr && (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="outline" className="h-5 text-[9px] px-1.5 text-emerald-600" onClick={() => approveEcrMut.mutate(ecr.id)} disabled={approveEcrMut.isPending}>
                                  <CheckCircle className="h-2.5 w-2.5 mr-0.5" /> Approve
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="text-[10px]">Approve this change request</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="outline" className="h-5 text-[9px] px-1.5 text-red-600" onClick={() => { setRejectDialogId(ecr.id); setRejectReason(''); }} disabled={rejectEcrMut.isPending}>
                                  <XCircle className="h-2.5 w-2.5 mr-0.5" /> Reject
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="text-[10px]">Reject with reason</TooltipContent>
                            </Tooltip>
                          </>
                        )}
                        {ecr.status === 'Approved' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1 text-[9px] text-emerald-600">
                                <CheckCircle className="h-2.5 w-2.5" /> Ready for ECN
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="text-[10px]">Create an ECN from the ECN tab to implement this change</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TooltipProvider>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="ecn" className="mt-0">
            {ecnLoading ? (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground py-3"><Loader2 className="h-3 w-3 animate-spin" /> Loading...</div>
            ) : ecns.length === 0 ? (
              <p className="text-[10px] text-muted-foreground italic py-3">No Engineering Change Notices for this drawing.</p>
            ) : (
              <div className="space-y-2">
                {ecns.map((ecn: any) => (
                  <div key={ecn.id} className="border rounded-md p-2 text-[10px] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium font-mono">{ecn.document_number}</span>
                      <Badge className={`text-[9px] h-4 px-1.5 ${ECN_STATUS_STYLE[ecn.status] || ''}`}>{ecn.status}</Badge>
                    </div>
                    {ecn.ecr_document_number && (
                      <div className="text-muted-foreground"><strong>From ECR:</strong> {ecn.ecr_document_number}</div>
                    )}
                    <div className="text-muted-foreground"><strong>Description:</strong> {ecn.description}</div>
                    <div className="text-muted-foreground"><strong>Implementation:</strong> {ecn.implementation_details}</div>
                    <div className="flex gap-3 text-muted-foreground">
                      <span>Issued by: {ecn.issued_by_name || '—'}</span>
                      <span>Date: {formatDate(ecn.issued_date)}</span>
                    </div>
                    {ecn.resulting_revision && (
                      <div className="flex items-center gap-1 text-emerald-700 font-medium">
                        <ArrowRight className="h-2.5 w-2.5" /> Resulting Revision: Rev {ecn.resulting_revision}
                      </div>
                    )}
                    {ecn.implemented_by_name && (
                      <div className="text-muted-foreground">
                        Implemented by: {ecn.implemented_by_name} on {formatDate(ecn.implementation_date)}
                      </div>
                    )}
                    {ecn.notes && <div className="text-muted-foreground italic">{ecn.notes}</div>}
                    <TooltipProvider>
                      <div className="flex gap-1 pt-1">
                        {ecn.status === 'Draft' && canIssueEcn && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="outline" className="h-5 text-[9px] px-1.5" onClick={() => issueEcnMut.mutate(ecn.id)} disabled={issueEcnMut.isPending}>
                                <Send className="h-2.5 w-2.5 mr-0.5" /> Issue
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="text-[10px]">Issue ECN for implementation</TooltipContent>
                          </Tooltip>
                        )}
                        {ecn.status === 'Issued' && canImplementEcn && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="outline" className="h-5 text-[9px] px-1.5 text-emerald-600" onClick={() => implementEcnMut.mutate(ecn.id)} disabled={implementEcnMut.isPending}>
                                {implementEcnMut.isPending ? <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" /> : <Play className="h-2.5 w-2.5 mr-0.5" />}
                                Implement
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="text-[10px]">Implement ECN — creates new drawing revision and supersedes current</TooltipContent>
                          </Tooltip>
                        )}
                        {ecn.status === 'Issued' && !canImplementEcn && (
                          <div className="flex items-center gap-1 text-[9px] text-amber-600">
                            <Lock className="h-2.5 w-2.5" /> GM/Superuser required to implement
                          </div>
                        )}
                        {ecn.status === 'Implemented' && canCloseEcn && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="outline" className="h-5 text-[9px] px-1.5" onClick={() => closeEcnMut.mutate(ecn.id)} disabled={closeEcnMut.isPending}>
                                <FileCheck className="h-2.5 w-2.5 mr-0.5" /> Close
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="text-[10px]">Close ECN after verification</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TooltipProvider>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      <Dialog open={createEcrOpen} onOpenChange={setCreateEcrOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Create Engineering Change Request</DialogTitle>
            <DialogDescription className="text-xs">
              DWG {dwgControlNumber} — Rev {revisionCode}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Description *</Label>
              <Textarea value={ecrDesc} onChange={(e) => setEcrDesc(e.target.value)} placeholder="What needs to change?" className="text-xs mt-1" rows={3} />
            </div>
            <div>
              <Label className="text-xs">Reason *</Label>
              <Textarea value={ecrReason} onChange={(e) => setEcrReason(e.target.value)} placeholder="Why is this change needed?" className="text-xs mt-1" rows={2} />
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Input value={ecrNotes} onChange={(e) => setEcrNotes(e.target.value)} placeholder="Additional notes" className="text-xs mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateEcrOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => createEcrMut.mutate()} disabled={createEcrMut.isPending || !ecrDesc.trim() || !ecrReason.trim()}>
              {createEcrMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Create ECR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createEcnOpen} onOpenChange={setCreateEcnOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Create Engineering Change Notice</DialogTitle>
            <DialogDescription className="text-xs">
              DWG {dwgControlNumber} — Rev {revisionCode}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Source ECR {rl(userRole) > 0 ? '*' : '(optional for Superuser)'}</Label>
              {approvedEcrs.length === 0 ? (
                <div className="flex items-center gap-1.5 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-1">
                  <AlertTriangle className="h-3 w-3" />
                  No approved ECRs available. An ECR must be approved before creating an ECN.
                </div>
              ) : (
                <Select value={ecnEcrId} onValueChange={setEcnEcrId}>
                  <SelectTrigger className="text-xs mt-1"><SelectValue placeholder="Select approved ECR" /></SelectTrigger>
                  <SelectContent>
                    {approvedEcrs.map((ecr: any) => (
                      <SelectItem key={ecr.id} value={ecr.id.toString()} className="text-xs">
                        {ecr.document_number} — {ecr.description?.substring(0, 60)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label className="text-xs">Description *</Label>
              <Textarea value={ecnDesc} onChange={(e) => setEcnDesc(e.target.value)} placeholder="What change is being implemented?" className="text-xs mt-1" rows={3} />
            </div>
            <div>
              <Label className="text-xs">Implementation Details *</Label>
              <Textarea value={ecnImpl} onChange={(e) => setEcnImpl(e.target.value)} placeholder="How will this change be implemented?" className="text-xs mt-1" rows={3} />
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Input value={ecnNotes} onChange={(e) => setEcnNotes(e.target.value)} placeholder="Additional notes" className="text-xs mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateEcnOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => createEcnMut.mutate()}
              disabled={createEcnMut.isPending || !ecnDesc.trim() || !ecnImpl.trim() || (rl(userRole) > 0 && !ecnEcrId)}>
              {createEcnMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Create ECN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectDialogId !== null} onOpenChange={(open) => { if (!open) setRejectDialogId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Reject ECR</DialogTitle>
            <DialogDescription className="text-xs">Provide a reason for rejection.</DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Rejection Reason *</Label>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Why is this ECR being rejected?" className="text-xs mt-1" rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRejectDialogId(null)}>Cancel</Button>
            <Button size="sm" variant="destructive" onClick={() => rejectDialogId && rejectEcrMut.mutate({ id: rejectDialogId, reason: rejectReason })}
              disabled={rejectEcrMut.isPending || !rejectReason.trim()}>
              {rejectEcrMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
