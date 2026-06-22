import { useState, useMemo, useEffect, useRef } from "react";
import { fmtDate } from "@/lib/date-format";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, getErrorMessage } from "@/lib/queryClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  FileText, Plus, Pencil, Trash2, Loader2, Search, Eye, Package, Download,
  CheckCircle, XCircle, Circle, Send, Copy, Calendar, ChevronDown, ChevronRight, GitBranch, X, Paperclip,
  Rocket, ExternalLink, Lock, AlertTriangle, Archive, Shield, RefreshCw, FlaskConical, EyeOff,
  FileSpreadsheet, UploadCloud, ShoppingCart, FileSignature, FolderSearch, CloudLightning
} from "lucide-react";
import { ExcelJS } from "@/lib/excel-client-utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Product } from "@shared/schema";

const CONTINENT_NAME_TO_CODE: Record<string, string> = {
  'Africa': 'AF', 'Asia': 'AS', 'Europe': 'EU',
  'North America': 'NA', 'South America': 'SA', 'Oceania': 'OC',
};
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  'united arab emirates':'AE','argentina':'AR','australia':'AU','azerbaijan':'AZ',
  'bulgaria':'BG','bahrain':'BH','brazil':'BR','germany':'DE','algeria':'DZ',
  'ecuador':'EC','ethiopia':'ET','united kingdom':'GB','guinea':'GN','india':'IN',
  'kuwait':'KW','mexico':'MX','nigeria':'NG','new zealand':'NZ','panama':'PA',
  'poland':'PL','qatar':'QA','saudi arabia':'SA','sudan':'SD','turkey':'TR',
  'trinidad & tobago':'TT','united states':'US','canada':'CA','france':'FR',
  'italy':'IT','spain':'ES','china':'CN','japan':'JP','south korea':'KR',
  'singapore':'SG','malaysia':'MY','thailand':'TH','indonesia':'ID','philippines':'PH',
  'vietnam':'VN','south africa':'ZA','kenya':'KE','ghana':'GH','tanzania':'TZ',
  'egypt':'EG','morocco':'MA','tunisia':'TN','libya':'LY','oman':'OM',
  'yemen':'YE','jordan':'JO','lebanon':'LB','iraq':'IQ','iran':'IR',
  'pakistan':'PK','bangladesh':'BD','sri lanka':'LK','nepal':'NP','myanmar':'MM',
  'chile':'CL','colombia':'CO','peru':'PE','venezuela':'VE','uruguay':'UY',
  'paraguay':'PY','bolivia':'BO','romania':'RO','hungary':'HU','czech republic':'CZ',
  'slovakia':'SK','croatia':'HR','serbia':'RS','ukraine':'UA','belarus':'BY',
  'georgia':'GE','armenia':'AM','kazakhstan':'KZ','uzbekistan':'UZ',
};
const COUNTRY_TO_CONTINENT: Record<string, string> = {
  'AE':'AS','BH':'AS','IN':'AS','IQ':'AS','IR':'AS','JO':'AS','KW':'AS','LB':'AS',
  'OM':'AS','PK':'AS','QA':'AS','SA':'AS','SY':'AS','TR':'AS','YE':'AS','AZ':'AS',
  'GE':'AS','AM':'AS','KZ':'AS','UZ':'AS','CN':'AS','JP':'AS','KR':'AS','SG':'AS',
  'MY':'AS','TH':'AS','ID':'AS','PH':'AS','VN':'AS','BD':'AS','LK':'AS','NP':'AS','MM':'AS',
  'AU':'OC','NZ':'OC',
  'BR':'SA','AR':'SA','CL':'SA','CO':'SA','EC':'SA','PE':'SA','VE':'SA','UY':'SA','PY':'SA','BO':'SA',
  'US':'NA','CA':'NA','MX':'NA','PA':'NA','TT':'NA',
  'DE':'EU','FR':'EU','IT':'EU','ES':'EU','GB':'EU','PL':'EU','RO':'EU','HU':'EU',
  'CZ':'EU','SK':'EU','HR':'EU','RS':'EU','UA':'EU','BY':'EU','BG':'EU',
  'ZA':'AF','NG':'AF','KE':'AF','GH':'AF','TZ':'AF','EG':'AF','MA':'AF',
  'TN':'AF','LY':'AF','DZ':'AF','ET':'AF','GN':'AF','SD':'AF',
};
import { useAuth } from "@/hooks/use-auth";
import { useTestDataToggle } from "@/hooks/use-test-data-toggle";

const offerItemSchema = z.object({
  tempKey: z.string(),
  productId: z.number().nullable().optional(),
  productCode: z.string().optional(),
  description: z.string().min(1, "Description is required"),
  unit: z.string().min(1, "Unit is required"),
  quantity: z.string().min(1, "Quantity is required"),
  unitPrice: z.string().min(1, "Price is required"),
  discountPercent: z.string().optional(),
  hsnSacCode: z.string().optional(),
  isSubItem: z.boolean().optional(),
  parentTempKey: z.string().nullable().optional(),
});

const offerFormSchema = z.object({
  customerId: z.number().nullable().optional(),
  customerName: z.string().min(1, "Customer name is required"),
  customerEmail: z.string().optional(),
  customerAddress: z.string().optional(),
  contactPerson: z.string().optional(),
  subject: z.string().min(1, "Subject is required"),
  language: z.string().min(1, "Language is required"),
  currency: z.string().min(1, "Currency is required"),
  discountPercent: z.string().optional(),
  taxPercent: z.string().optional(),
  validUntil: z.string().optional(),
  paymentTerms: z.string().optional(),
  deliveryTerms: z.string().optional(),
  notes: z.string().optional(),
  termsAndConditions: z.string().optional(),
  offerType: z.enum(["standalone", "project-linked"]).default("standalone"),
  items: z.array(offerItemSchema).min(1, "At least one item is required"),
});

type OfferFormValues = z.infer<typeof offerFormSchema>;

const unitOptions = ["pcs", "kg", "m", "ltr", "hours", "set", "lot", "nos"] as const;

const statusColors: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-800",
  Sent: "bg-blue-100 text-blue-800",
  Approved: "bg-green-100 text-green-800",
  Rejected: "bg-red-100 text-red-800",
  Expired: "bg-yellow-100 text-yellow-800",
  Converted: "bg-purple-100 text-purple-800",
  "Order Confirmed": "bg-indigo-100 text-indigo-800",
};

interface PdfArtifact {
  id: number;
  revision: number;
  price_mode: string;
  artifact_status: string;
  is_confirmed: boolean;
  confirmed_at: string | null;
  epc_attachment_status: string | null;
  epc_attachment_id: number | null;
  file_size_bytes: number;
  generated_at: string;
}

function PdfDownloadDialog({ offerId, onClose, onDownload }: {
  offerId: number | null;
  onClose: () => void;
  onDownload: (id: number, mode: 'combined' | 'breakup' | 'technical') => void;
}) {
  const { toast } = useToast();
  const { data: artifacts, isLoading: artifactsLoading } = useQuery<PdfArtifact[]>({
    queryKey: ['/api/sales-marketing/offers', offerId, 'artifacts'],
    queryFn: () => fetch(`/api/sales-marketing/offers/${offerId}/artifacts`, { credentials: 'include' }).then(r => r.json()),
    enabled: offerId !== null,
  });

  const repairMutation = useMutation({
    mutationFn: async (artifactId: number) => {
      const res = await apiRequest('POST', `/api/sales-marketing/artifacts/${artifactId}/repair-epc-attachment`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'EPC attachment repaired successfully' });
      if (offerId) queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offers', offerId, 'artifacts'] });
    },
    onError: (err: any) => {
      toast({ title: 'Repair failed', description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const confirmedArtifacts = artifacts?.filter(a => a.is_confirmed) || [];
  const activeArtifacts = artifacts?.filter(a => !a.is_confirmed && a.artifact_status === 'active') || [];

  return (
    <Dialog open={offerId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Quotation PDF</DialogTitle>
          <DialogDescription>Generate or download stored quotation PDFs</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="generate" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="generate">Generate PDF</TabsTrigger>
            <TabsTrigger value="history">
              Stored ({artifacts?.length || 0})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="generate" className="space-y-3 pt-2">
            <Button variant="outline" className="w-full justify-start h-auto py-3 px-4" onClick={() => offerId && onDownload(offerId, 'combined')}>
              <div className="text-left">
                <div className="font-medium">Combined Price</div>
                <div className="text-xs text-muted-foreground">List all sub-products but show only the main product total price</div>
              </div>
            </Button>
            <Button variant="outline" className="w-full justify-start h-auto py-3 px-4" onClick={() => offerId && onDownload(offerId, 'breakup')}>
              <div className="text-left">
                <div className="font-medium">Breakup Price</div>
                <div className="text-xs text-muted-foreground">Show main product with sub-product details and individual prices</div>
              </div>
            </Button>
            <Button variant="outline" className="w-full justify-start h-auto py-3 px-4" onClick={() => offerId && onDownload(offerId, 'technical')}>
              <div className="text-left">
                <div className="font-medium">Technical Offer</div>
                <div className="text-xs text-muted-foreground">Same as Combined Price but without any pricing - technical specification only</div>
              </div>
            </Button>
          </TabsContent>
          <TabsContent value="history" className="pt-2">
            {artifactsLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : !artifacts?.length ? (
              <p className="text-sm text-muted-foreground text-center py-6">No stored PDF artifacts yet. Generate a PDF to create one.</p>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {confirmedArtifacts.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Lock className="h-3.5 w-3.5 text-indigo-600" />
                      <span className="text-xs font-semibold text-indigo-600 uppercase">Confirmed</span>
                    </div>
                    {confirmedArtifacts.map(a => (
                      <div key={a.id} className="flex items-center justify-between rounded-md border p-3 mb-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium capitalize">{a.price_mode}</span>
                            <Badge variant="secondary" className="text-[10px]">Rev {a.revision}</Badge>
                            {a.epc_attachment_status === 'attached' && (
                              <Badge className="bg-green-100 text-green-700 text-[10px]"><Shield className="h-3 w-3 mr-0.5" /> EPC</Badge>
                            )}
                            {a.epc_attachment_status === 'failed' && (
                              <Badge className="bg-red-100 text-red-700 text-[10px]"><AlertTriangle className="h-3 w-3 mr-0.5" /> Failed</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatBytes(a.file_size_bytes)} · Confirmed {a.confirmed_at ? fmtDate(a.confirmed_at) : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {a.epc_attachment_status === 'failed' && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Repair EPC attachment"
                              disabled={repairMutation.isPending}
                              onClick={() => repairMutation.mutate(a.id)}>
                              <RefreshCw className={`h-3.5 w-3.5 ${repairMutation.isPending ? 'animate-spin' : ''}`} />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Download"
                            onClick={() => offerId && window.open(`/api/sales-marketing/offers/${offerId}/pdf?priceMode=${a.price_mode}`, '_blank')}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {activeArtifacts.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase">Active</span>
                    </div>
                    {activeArtifacts.map(a => (
                      <div key={a.id} className="flex items-center justify-between rounded-md border p-3 mb-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium capitalize">{a.price_mode}</span>
                            <Badge variant="secondary" className="text-[10px]">Rev {a.revision}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatBytes(a.file_size_bytes)} · Generated {fmtDate(a.generated_at)}
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Download"
                          onClick={() => offerId && window.open(`/api/sales-marketing/offers/${offerId}/pdf?priceMode=${a.price_mode}`, '_blank')}>
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export function OffersContent() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isSuperuser = user?.role === 'Superuser';
  const { showTestData, toggle: toggleTestData } = useTestDataToggle();
  const [searchQuery, setSearchQuery] = useState("");
  const [customerComboOpen, setCustomerComboOpen] = useState(false);
  const [customerSearchInput, setCustomerSearchInput] = useState("");
  const customerComboRef = useRef<HTMLDivElement>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [fyFilter, setFyFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<any>(null);
  const [viewingOffer, setViewingOffer] = useState<any>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [productPickerSearch, setProductPickerSearch] = useState("");
  const [filterFamily, setFilterFamily] = useState("__all__");
  const [filterProp1, setFilterProp1] = useState("__all__");
  const [filterProp2, setFilterProp2] = useState("__all__");
  const [filterProp3, setFilterProp3] = useState("__all__");
  const [pdfDownloadOfferId, setPdfDownloadOfferId] = useState<number | null>(null);
  const [gcsPathTestOffer, setGcsPathTestOffer] = useState<any>(null);
  const [gcsGenerating, setGcsGenerating] = useState<Record<string, boolean>>({});
  const [gcsLastResult, setGcsLastResult] = useState<{ mode: string; gcsObjectPath: string; attachmentSeq: number } | null>(null);
  const [confirmOrderOffer, setConfirmOrderOffer] = useState<any>(null);
  const [conversionResult, setConversionResult] = useState<any>(null);
  const [confirmDocFile, setConfirmDocFile] = useState<File | null>(null);
  const [confirmDocUploading, setConfirmDocUploading] = useState(false);
  const [confirmDocUploaded, setConfirmDocUploaded] = useState(false);
  const [epcFormData, setEpcFormData] = useState({
    continentCode: '', countryCode: '', projectType: '', priority: 'Medium',
    startDate: '', targetEndDate: '', managerId: 0, automationMode: 'full_auto' as 'manual' | 'full_auto',
    disciplineCode: '', mdmt: '', inspectionBy: '', voltageFrequency: '',
  });
  const [conversionErrors, setConversionErrors] = useState<any[]>([]);

  const { data: offers = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/sales-marketing/offers', { showTest: showTestData }],
    queryFn: () => fetch(`/api/sales-marketing/offers?showTest=${showTestData}`, { credentials: 'include' }).then(r => r.json()),
  });

  const testFlagMutation = useMutation({
    mutationFn: async ({ id, isTest }: { id: number; isTest: boolean }) => {
      return apiRequest('PATCH', `/api/sales-marketing/offers/${id}/test-flag`, { isTest });
    },
    onSuccess: (_data, { isTest }) => {
      toast({ title: isTest ? 'Marked as test data' : 'Unmarked from test data' });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offers'] });
    },
    onError: (err: any) => {
      toast({ title: 'Failed to update test flag', description: getErrorMessage(err), variant: 'destructive' });
    },
  });

  const { data: offerSubjects = [] } = useQuery<string[]>({
    queryKey: ['/api/sales-marketing/offer-subjects'],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['/api/sales-marketing/products'],
  });

  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: ['/api/users'],
  });

  const { data: productChildLinks = [] } = useQuery<any[]>({
    queryKey: ['/api/sales-marketing/product-children'],
  });

  const childProductsMap = useMemo(() => {
    const map = new Map<number, Array<Product & { quantity: number }>>();
    for (const link of productChildLinks) {
      const childProduct = products.find(p => p.id === link.childProductId);
      if (childProduct) {
        const existing = map.get(link.parentProductId) || [];
        existing.push({ ...childProduct, quantity: link.quantity || 1 });
        map.set(link.parentProductId, existing);
      }
    }
    return map;
  }, [products, productChildLinks]);

  const { data: gcsPathTestData, isLoading: gcsPathTestLoading } = useQuery<any>({
    queryKey: ['/api/offers', gcsPathTestOffer?.id, 'gcs-path-test'],
    queryFn: async () => {
      if (!gcsPathTestOffer?.id) return null;
      const r = await fetch(`/api/offers/${gcsPathTestOffer.id}/gcs-path-test`);
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      return r.json();
    },
    enabled: !!gcsPathTestOffer?.id,
  });

  const { data: gcsCoPathData, isLoading: gcsCoPathLoading } = useQuery<any>({
    queryKey: ['/api/offers', gcsPathTestOffer?.id, 'gcs-co-path-test'],
    queryFn: async () => {
      if (!gcsPathTestOffer?.id) return null;
      const r = await fetch(`/api/offers/${gcsPathTestOffer.id}/gcs-co-path-test`);
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      return r.json();
    },
    enabled: !!gcsPathTestOffer?.id,
  });

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ['/api/sales-marketing/customers'],
  });

  const form = useForm<OfferFormValues>({
    resolver: zodResolver(offerFormSchema),
    defaultValues: {
      customerId: null, customerName: "", customerEmail: "", customerAddress: "",
      contactPerson: "", subject: "", language: "English", currency: "USD", discountPercent: "0",
      taxPercent: "0", validUntil: "", paymentTerms: "", deliveryTerms: "",
      notes: "", termsAndConditions: "", offerType: "standalone" as const, items: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const watchItems = useWatch({ control: form.control, name: "items" });
  const watchDiscountPercent = useWatch({ control: form.control, name: "discountPercent" });
  const watchTaxPercent = useWatch({ control: form.control, name: "taxPercent" });

  const subtotal = (watchItems || []).reduce((sum, item) => {
    if (item.isSubItem) return sum;
    const qty = parseFloat(item.quantity || "0");
    const price = parseFloat(item.unitPrice || "0");
    const disc = parseFloat(item.discountPercent || "0");
    const lineTotal = qty * price * (1 - disc / 100);
    return sum + lineTotal;
  }, 0);
  const discPct = parseFloat(watchDiscountPercent || "0");
  const discountAmount = subtotal * (discPct / 100);
  const afterDiscount = subtotal - discountAmount;
  const taxPct = parseFloat(watchTaxPercent || "0");
  const taxAmount = afterDiscount * (taxPct / 100);
  const totalAmount = afterDiscount + taxAmount;
  const calculations = { subtotal, discountAmount, taxAmount, totalAmount };

  // Extract 4-char FY code from offer number e.g. "OFR-2627-0001" → "2627"
  const fyOptions = useMemo(() => {
    const codes = new Set<string>();
    for (const o of offers as any[]) {
      const match = /OFR-(\d{4})-/.exec(o.offerNumber || "");
      if (match) codes.add(match[1]);
    }
    return Array.from(codes).sort((a, b) => b.localeCompare(a));
  }, [offers]);

  const filteredOffers = useMemo(() => {
    return (offers as any[]).filter((o: any) => {
      const matchesSearch = !searchQuery ||
        o.offerNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.subject?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || o.status === statusFilter;
      const matchesFy = fyFilter === "all" || /OFR-(\d{4})-/.exec(o.offerNumber || "")?.[1] === fyFilter;
      return matchesSearch && matchesStatus && matchesFy;
    });
  }, [offers, searchQuery, statusFilter, fyFilter]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/sales-marketing/offers', data);
    },
    onSuccess: (savedOffer: any) => {
      toast({ title: "Offer created", description: "Offer has been created successfully. You can now download the PDF." });
      setEditingOffer(savedOffer);
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offers'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) =>
      apiRequest('PATCH', `/api/sales-marketing/offers/${id}`, data),
    onSuccess: (updatedOffer: any) => {
      toast({ title: "Offer updated", description: "Offer has been updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offers'] });
      form.reset(form.getValues());
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) =>
      apiRequest('PATCH', `/api/sales-marketing/offers/${id}/status`, { status }),
    onSuccess: () => {
      toast({ title: "Status updated" });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offers'] });
    },
  });

  const confirmOrderMutation = useMutation({
    mutationFn: async ({ id, epcParams }: { id: number; epcParams: any }) =>
      apiRequest('PATCH', `/api/sales-marketing/offers/${id}/status`, { status: 'Order Confirmed', epcParams }),
    onSuccess: (result: any) => {
      if (result.alreadyConverted) {
        toast({ title: "Already Converted", description: `Project ${result.project?.code} already exists for this offer.` });
      } else {
        toast({ title: "Order Confirmed", description: `EPC Project ${result.project?.code} created. Order: ${result.orderNumber}` });
      }
      setConversionResult(result);
      setConversionErrors([]);
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offers'] });
    },
    onError: (error: any) => {
      let msg = error.message || 'Conversion failed';
      try {
        const parsed = JSON.parse(msg.replace(/^[^{]*/, ''));
        if (parsed.failures) {
          setConversionErrors(parsed.failures);
          msg = 'Validation failed — see details below';
        }
      } catch {}
      toast({ title: "Conversion Failed", description: msg, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest('DELETE', `/api/sales-marketing/offers/${id}`),
    onSuccess: () => {
      toast({ title: "Offer deleted" });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offers'] });
    },
  });

  const resetAndClose = () => {
    setIsFormOpen(false);
    setEditingOffer(null);
    form.reset({
      customerId: null, customerName: "", customerEmail: "", customerAddress: "",
      contactPerson: "", subject: "", language: "English", currency: "USD", discountPercent: "0",
      taxPercent: "0", validUntil: "", paymentTerms: "", deliveryTerms: "",
      notes: "", termsAndConditions: "", offerType: "standalone" as const, items: [],
    });
  };

  const handleNewOffer = () => {
    resetAndClose();
    const now = new Date();
    const validUntil = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const formatted = validUntil.toISOString().split('T')[0];
    form.setValue("validUntil", formatted);
    form.setValue("currency", "USD");
    form.setValue("paymentTerms", "40% Advance with PO, 60% against readiness");
    form.setValue("deliveryTerms", "Ex-Works Mumbai Factory");
    setIsFormOpen(true);
  };

  const handleEditOffer = async (offer: any) => {
    try {
      const res = await fetch(`/api/sales-marketing/offers/${offer.id}`, { credentials: 'include' });
      const data = await res.json();
      setEditingOffer(data);
      form.reset({
        customerId: data.customerId,
        customerName: data.customerName || "",
        customerEmail: data.customerEmail || "",
        customerAddress: data.customerAddress || "",
        contactPerson: data.contactPerson || "",
        subject: data.subject || "",
        language: data.language || "English",
        currency: data.currency || "USD",
        discountPercent: data.discountPercent || "0",
        taxPercent: data.taxPercent || "0",
        validUntil: data.validUntil ? new Date(data.validUntil).toISOString().split('T')[0] : "",
        paymentTerms: data.paymentTerms || "",
        deliveryTerms: data.deliveryTerms || "",
        notes: data.notes || "",
        termsAndConditions: data.termsAndConditions || "",
        offerType: (data.offerType || "standalone") as "standalone" | "project-linked",
        items: (data.items || []).map((item: any) => ({
          tempKey: String(item.id),
          productId: item.productId,
          productCode: item.productCode || "",
          description: item.description || "",
          unit: item.unit || "",
          quantity: item.quantity || "0",
          unitPrice: item.unitPrice || "0",
          discountPercent: item.discountPercent || "0",
          hsnSacCode: item.hsnSacCode || "",
          isSubItem: item.isSubItem || false,
          parentTempKey: item.parentItemId ? String(item.parentItemId) : null,
        })),
      });
      setIsFormOpen(true);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load offer details", variant: "destructive" });
    }
  };

  const handleViewOffer = async (offer: any) => {
    try {
      const res = await fetch(`/api/sales-marketing/offers/${offer.id}`, { credentials: 'include' });
      const data = await res.json();
      setViewingOffer(data);
      setIsViewOpen(true);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load offer details", variant: "destructive" });
    }
  };

  const handleSelectCustomer = (customerId: string) => {
    const customer = customers.find((c: any) => c.id === parseInt(customerId));
    if (customer) {
      form.setValue("customerId", customer.id);
      form.setValue("customerName", customer.bpName || "");
      form.setValue("customerEmail", customer.email || customer.sapEmail || "");
      form.setValue("customerAddress", customer.billToAddress || customer.sapMailAddress || "");
      form.setValue("contactPerson", customer.contactPerson || "");
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerComboRef.current && !customerComboRef.current.contains(e.target as Node)) {
        setCustomerComboOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredCustomers = useMemo(() => {
    const q = customerSearchInput.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c: any) =>
      (c.bpCode ?? "").toLowerCase().includes(q) ||
      (c.bpName ?? "").toLowerCase().includes(q)
    );
  }, [customers, customerSearchInput]);

  const handleAddProduct = (product: Product) => {
    const children = childProductsMap.get(product.id) || [];
    const parentTempKey = crypto.randomUUID();
    append({
      tempKey: parentTempKey,
      productId: product.id,
      productCode: product.productCode,
      description: product.description,
      unit: product.unit,
      quantity: "1",
      unitPrice: product.unitPrice,
      discountPercent: "0",
      hsnSacCode: product.hsnSacCode || "",
      isSubItem: false,
      parentTempKey: null,
    });
    if (children.length > 0) {
      for (const child of children) {
        append({
          tempKey: crypto.randomUUID(),
          productId: child.id,
          productCode: child.productCode,
          description: child.description,
          unit: child.unit,
          quantity: String(child.quantity || 1),
          unitPrice: child.unitPrice,
          discountPercent: "0",
          hsnSacCode: child.hsnSacCode || "",
          isSubItem: true,
          parentTempKey: parentTempKey,
        });
      }
    }
  };

  const handleRemoveItem = (index: number) => {
    const item = watchItems?.[index];
    const allItems = watchItems || [];

    // Collect all descendant tempKeys recursively
    function collectDescendants(parentTempKey: string): string[] {
      const result: string[] = [];
      for (const wi of allItems) {
        if (wi.parentTempKey === parentTempKey && wi.tempKey) {
          result.push(wi.tempKey);
          result.push(...collectDescendants(wi.tempKey));
        }
      }
      return result;
    }

    if (item?.tempKey) {
      const descendantKeys = new Set(collectDescendants(item.tempKey));
      const indicesToRemove: number[] = [index];
      allItems.forEach((wi, i) => {
        if (i !== index && wi.tempKey && descendantKeys.has(wi.tempKey)) {
          indicesToRemove.push(i);
        }
      });
      indicesToRemove.sort((a, b) => b - a);
      for (const idx of indicesToRemove) remove(idx);
      return;
    }
    remove(index);
  };

  const getItemDepth = (item: any, items: any[]): number => {
    if (!item?.parentTempKey) return 0;
    const parent = items.find(i => i.tempKey === item.parentTempKey);
    return parent ? 1 + getItemDepth(parent, items) : 0;
  };

  const handleAddSubItem = (parentIndex: number) => {
    const parentItem = watchItems?.[parentIndex];
    if (!parentItem) return;
    const depth = getItemDepth(parentItem, watchItems || []);
    if (depth >= 2) {
      toast({ title: "Depth limit reached", description: "Maximum 3 levels supported (Parent → Child → Sub-item).", variant: "destructive" });
      return;
    }
    append({
      tempKey: crypto.randomUUID(),
      productId: null,
      productCode: "",
      description: "",
      unit: parentItem.unit || "pcs",
      quantity: "1",
      unitPrice: "0",
      discountPercent: "0",
      hsnSacCode: "",
      isSubItem: true,
      parentTempKey: parentItem.tempKey,
    });
  };

  const handleAddBlankItem = () => {
    append({
      tempKey: crypto.randomUUID(),
      productId: null,
      productCode: "",
      description: "",
      unit: "pcs",
      quantity: "1",
      unitPrice: "0",
      discountPercent: "0",
      hsnSacCode: "",
      isSubItem: false,
      parentTempKey: null,
    });
  };

  const onSubmit = (data: OfferFormValues) => {
    const payload = {
      ...data,
      subtotal: calculations.subtotal.toFixed(2),
      discountAmount: calculations.discountAmount.toFixed(2),
      taxAmount: calculations.taxAmount.toFixed(2),
      totalAmount: calculations.totalAmount.toFixed(2),
      validUntil: data.validUntil ? new Date(data.validUntil) : null,
      items: data.items.map((item, idx) => {
        const qty = parseFloat(item.quantity || "0");
        const price = parseFloat(item.unitPrice || "0");
        const disc = parseFloat(item.discountPercent || "0");
        const lineTotal = qty * price * (1 - disc / 100);
        return {
          tempKey: item.tempKey,
          productId: item.productId ?? null,
          productCode: item.productCode || null,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountPercent: item.discountPercent || "0",
          hsnSacCode: item.hsnSacCode || null,
          isSubItem: item.isSubItem || false,
          parentTempKey: item.parentTempKey || null,
          totalPrice: lineTotal.toFixed(2),
          sortOrder: idx,
        };
      }),
    };

    if (editingOffer) {
      updateMutation.mutate({ id: editingOffer.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDuplicate = async (offer: any) => {
    try {
      const res = await fetch(`/api/sales-marketing/offers/${offer.id}`, { credentials: 'include' });
      const data = await res.json();
      setEditingOffer(null);
      form.reset({
        customerId: data.customerId,
        customerName: data.customerName || "",
        customerEmail: data.customerEmail || "",
        customerAddress: data.customerAddress || "",
        contactPerson: data.contactPerson || "",
        subject: data.subject || "",
        language: data.language || "English",
        currency: data.currency || "USD",
        discountPercent: data.discountPercent || "0",
        taxPercent: data.taxPercent || "0",
        validUntil: "",
        paymentTerms: data.paymentTerms || "",
        deliveryTerms: data.deliveryTerms || "",
        notes: data.notes || "",
        termsAndConditions: data.termsAndConditions || "",
        items: (() => {
          const idToNewTempKey = new Map<string, string>(
            (data.items || []).map((item: any) => [String(item.id), crypto.randomUUID()])
          );
          return (data.items || []).map((item: any) => ({
            tempKey: idToNewTempKey.get(String(item.id)) || crypto.randomUUID(),
            productId: item.productId,
            productCode: item.productCode || "",
            description: item.description || "",
            unit: item.unit || "",
            quantity: item.quantity || "0",
            unitPrice: item.unitPrice || "0",
            discountPercent: item.discountPercent || "0",
            hsnSacCode: item.hsnSacCode || "",
            isSubItem: item.isSubItem || false,
            parentTempKey: item.parentItemId ? (idToNewTempKey.get(String(item.parentItemId)) || null) : null,
          }));
        })(),
      });
      setIsFormOpen(true);
    } catch (error) {
      toast({ title: "Error", description: "Failed to duplicate offer", variant: "destructive" });
    }
  };

  const handleDownloadPdf = (offerId: number, priceMode: 'combined' | 'breakup' | 'technical') => {
    window.open(`/api/sales-marketing/offers/${offerId}/pdf?priceMode=${priceMode}`, '_blank');
    queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offers'] });
    setPdfDownloadOfferId(null);
  };

  const handleExportExcel = async () => {
    const data = form.getValues();
    const items = data.items || [];

    const discPct = parseFloat(data.discountPercent || "0");
    const taxPct = parseFloat(data.taxPercent || "0");
    const subtotal = items.reduce((sum, item) => {
      if (item.isSubItem) return sum;
      const qty = parseFloat(item.quantity || "0");
      const price = parseFloat(item.unitPrice || "0");
      const disc = parseFloat(item.discountPercent || "0");
      return sum + qty * price * (1 - disc / 100);
    }, 0);
    const discountAmount = subtotal * (discPct / 100);
    const afterDiscount = subtotal - discountAmount;
    const taxAmount = afterDiscount * (taxPct / 100);
    const totalAmount = afterDiscount + taxAmount;
    const cur = data.currency || "USD";

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "THERMOPAC QMS";
    const ws = workbook.addWorksheet("Quotation");

    const BRAND_BLUE = "FF1E3A5F";
    const LIGHT_BLUE = "FFE8F0FE";
    const ACCENT = "FF2563EB";
    const SUB_ROW = "FFF8FAFF";
    const TOTAL_BG = "FFF0F4FF";

    const thin: ExcelJS.Border = { style: "thin", color: { argb: "FFCBD5E1" } };
    const allBorders = { top: thin, left: thin, bottom: thin, right: thin };

    ws.columns = [
      { key: "col1", width: 5 },
      { key: "col2", width: 46 },
      { key: "col3", width: 10 },
      { key: "col4", width: 10 },
      { key: "col5", width: 16 },
      { key: "col6", width: 10 },
      { key: "col7", width: 16 },
    ];

    const addRow = (values: any[], options?: {
      bold?: boolean; bg?: string; fontSize?: number;
      height?: number; border?: boolean; align?: ExcelJS.Alignment["horizontal"];
      numFmt?: string; color?: string;
    }) => {
      const row = ws.addRow(values);
      if (options?.height) row.height = options.height;
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        if (col > values.length) return;
        if (options?.bold) cell.font = { ...cell.font, bold: true };
        if (options?.fontSize) cell.font = { ...cell.font, size: options.fontSize };
        if (options?.color) cell.font = { ...cell.font, color: { argb: options.color } };
        if (options?.bg) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: options.bg } };
        if (options?.border) cell.border = allBorders;
        if (options?.align) cell.alignment = { horizontal: options.align, vertical: "middle", wrapText: true };
        if (options?.numFmt) cell.numFmt = options.numFmt;
      });
      return row;
    };

    const merge = (startRow: number, startCol: number, endRow: number, endCol: number) =>
      ws.mergeCells(startRow, startCol, endRow, endCol);

    const offerLabel = editingOffer?.offerNumber || "DRAFT";
    const customerLine = [data.customerName, data.customerEmail].filter(Boolean).join(" · ");

    const r1 = addRow(["THERMOPAC", "", "", "", "", "", ""], { bold: true, bg: BRAND_BLUE, fontSize: 14, height: 28, align: "left", color: "FFFFFFFF" });
    merge(r1.number, 1, r1.number, 4);
    r1.getCell(5).value = "QUOTATION";
    r1.getCell(5).font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
    r1.getCell(5).alignment = { horizontal: "right", vertical: "middle" };
    merge(r1.number, 5, r1.number, 7);
    r1.eachCell({ includeEmpty: true }, c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BLUE } }; });

    addRow([]);

    const infoRows: [string, string, string, string][] = [
      ["Offer No.", offerLabel, "Date", editingOffer ? fmtDate(editingOffer.offerDate) : fmtDate(new Date().toISOString())],
      ["Customer", data.customerName || "", "Valid Until", data.validUntil ? fmtDate(data.validUntil) : ""],
      ["Contact", data.contactPerson || "", "Currency", cur],
      ["Subject", data.subject || "", "Payment", data.paymentTerms || ""],
      ["Address", data.customerAddress || "", "Delivery", data.deliveryTerms || ""],
    ];
    for (const [lbl1, val1, lbl2, val2] of infoRows) {
      const r = ws.addRow([lbl1, val1, "", lbl2, "", val2, ""]);
      r.height = 18;
      r.getCell(1).font = { bold: true, size: 9, color: { argb: "FF475569" } };
      r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_BLUE } };
      r.getCell(2).font = { size: 9 };
      r.getCell(4).font = { bold: true, size: 9, color: { argb: "FF475569" } };
      r.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_BLUE } };
      r.getCell(6).font = { size: 9 };
      r.getCell(2).alignment = { vertical: "middle", wrapText: false };
      r.getCell(6).alignment = { vertical: "middle", wrapText: false };
      merge(r.number, 2, r.number, 3);
      merge(r.number, 5, r.number, 5);
      merge(r.number, 6, r.number, 7);
      [1, 2, 4, 6].forEach(c => { r.getCell(c).border = allBorders; r.getCell(3).border = allBorders; r.getCell(5).border = allBorders; r.getCell(7).border = allBorders; });
    }

    addRow([]);

    const hdrs = ["#", "Description", "Unit", "Qty", `Unit Price (${cur})`, "Disc %", `Line Total (${cur})`];
    const hRow = ws.addRow(hdrs);
    hRow.height = 20;
    hRow.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } };
      cell.border = allBorders;
      cell.alignment = { horizontal: col >= 4 ? "right" : "left", vertical: "middle" };
    });

    let mainItemSeq = 0;
    for (const item of items) {
      const isSubItem = item.isSubItem || false;
      const qty = parseFloat(item.quantity || "0");
      const price = parseFloat(item.unitPrice || "0");
      const disc = parseFloat(item.discountPercent || "0");
      const lt = qty * price * (1 - disc / 100);
      if (!isSubItem) mainItemSeq++;
      const label = isSubItem ? `   └ ${item.description}` : item.description;
      const seqLabel = isSubItem ? "" : mainItemSeq;
      const iRow = ws.addRow([seqLabel, label, item.unit || "", qty, price, disc > 0 ? disc : "", lt]);
      iRow.height = 16;
      iRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      iRow.getCell(2).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
      [3, 4, 5, 6, 7].forEach(c => { iRow.getCell(c).alignment = { horizontal: "right", vertical: "middle" }; });
      iRow.getCell(4).numFmt = "#,##0.00";
      iRow.getCell(5).numFmt = "#,##0.00";
      iRow.getCell(7).numFmt = "#,##0.00";
      iRow.eachCell({ includeEmpty: true }, cell => {
        cell.border = allBorders;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isSubItem ? "FFF5F7FF" : "FFFFFFFF" } };
        if (isSubItem) cell.font = { size: 9, italic: true, color: { argb: "FF64748B" } };
        else cell.font = { size: 9 };
      });
    }

    addRow([]);

    const totals: [string, number][] = [
      ["Subtotal", subtotal],
      ...(discountAmount > 0 ? [[`Discount (${discPct}%)`, -discountAmount] as [string, number]] : []),
      ...(taxAmount > 0 ? [[`Tax / GST (${taxPct}%)`, taxAmount] as [string, number]] : []),
    ];
    for (const [lbl, val] of totals) {
      const tRow = ws.addRow(["", "", "", "", "", lbl, val]);
      tRow.height = 16;
      tRow.getCell(6).font = { size: 9, color: { argb: "FF475569" } };
      tRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };
      tRow.getCell(7).font = { size: 9 };
      tRow.getCell(7).numFmt = "#,##0.00";
      tRow.getCell(7).alignment = { horizontal: "right", vertical: "middle" };
      tRow.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_BG } };
      tRow.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_BG } };
      [6, 7].forEach(c => tRow.getCell(c).border = allBorders);
      merge(tRow.number, 6, tRow.number, 6);
    }

    const totRow = ws.addRow(["", "", "", "", "", `TOTAL (${cur})`, totalAmount]);
    totRow.height = 20;
    totRow.getCell(6).font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    totRow.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BLUE } };
    totRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };
    totRow.getCell(7).font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    totRow.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BLUE } };
    totRow.getCell(7).numFmt = "#,##0.00";
    totRow.getCell(7).alignment = { horizontal: "right", vertical: "middle" };
    [6, 7].forEach(c => totRow.getCell(c).border = allBorders);

    if (data.notes) {
      addRow([]);
      const nLbl = ws.addRow(["Notes"]);
      nLbl.getCell(1).font = { bold: true, size: 9 };
      const nVal = ws.addRow([data.notes]);
      nVal.getCell(1).font = { size: 9 };
      nVal.getCell(1).alignment = { wrapText: true };
      nVal.height = 36;
      merge(nVal.number, 1, nVal.number, 7);
    }
    if (data.termsAndConditions) {
      addRow([]);
      const tLbl = ws.addRow(["Terms & Conditions"]);
      tLbl.getCell(1).font = { bold: true, size: 9 };
      const tVal = ws.addRow([data.termsAndConditions]);
      tVal.getCell(1).font = { size: 9 };
      tVal.getCell(1).alignment = { wrapText: true };
      tVal.height = 36;
      merge(tVal.number, 1, tVal.number, 7);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = (data.customerName || "Customer").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 20);
    a.download = `${offerLabel}_${safeName}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Excel exported", description: `${a.download} downloaded.` });
  };

  const offersContent = (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div />
        <div className="flex items-center gap-2">
          {isSuperuser && (
            <Button
              variant={showTestData ? "secondary" : "outline"}
              size="sm"
              onClick={toggleTestData}
              title={showTestData ? "Hide test data" : "Show test data"}
              className={showTestData ? "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200" : ""}
            >
              {showTestData ? <EyeOff className="mr-1.5 h-3.5 w-3.5" /> : <FlaskConical className="mr-1.5 h-3.5 w-3.5" />}
              {showTestData ? "Hide Test Data" : "Show Test Data"}
            </Button>
          )}
          <Button onClick={handleNewOffer}>
            <Plus className="mr-2 h-4 w-4" /> New Offer
          </Button>
        </div>
      </div>
      {isSuperuser && showTestData && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
          <FlaskConical className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Test data visible. Use the <strong>flask icon</strong> button on each row to mark/unmark records as test data.</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by offer number, customer, or subject..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Draft">Draft</SelectItem>
              <SelectItem value="Sent">Sent</SelectItem>
              <SelectItem value="Approved">Approved</SelectItem>
              <SelectItem value="Rejected">Rejected</SelectItem>
              <SelectItem value="Expired">Expired</SelectItem>
              <SelectItem value="Converted">Converted</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fyFilter} onValueChange={setFyFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Financial Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All FY</SelectItem>
              {fyOptions.map(fy => (
                <SelectItem key={fy} value={fy}>
                  FY {fy.slice(0, 2)}-{fy.slice(2)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : filteredOffers.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">No offers found</p>
                <p className="text-sm">Create your first offer to get started</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[160px]">Offer #</TableHead>
                    <TableHead className="min-w-[180px]">Customer</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Valid Until</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOffers.map((offer: any) => (
                    <TableRow key={offer.id} className={offer.isTest ? "bg-amber-50/40" : ""}>
                      <TableCell className="font-mono font-medium">
                        {offer.offerNumber}
                        {offer.revision > 0 && <Badge variant="outline" className="ml-1 text-xs">Rev.{offer.revision}</Badge>}
                        {offer.templatePdfName && <Paperclip className="inline h-3 w-3 ml-1 text-muted-foreground" title={`Template: ${offer.templatePdfName}`} />}
                        {offer.isTest && <Badge className="ml-1.5 text-[10px] px-1 py-0 bg-amber-100 text-amber-800 border border-amber-300"><FlaskConical className="inline h-2.5 w-2.5 mr-0.5" />Test</Badge>}
                        {offer.offerType === 'project-linked' && <Badge className="ml-1.5 text-[10px] px-1 py-0 bg-purple-100 text-purple-700 border border-purple-300"><FileSignature className="inline h-2.5 w-2.5 mr-0.5" />Proj</Badge>}
                        {offer.status === 'Approved' && !offer.confirmationDocGcsPath && (
                          <Badge className="ml-1.5 text-[10px] px-1 py-0 bg-orange-100 text-orange-700 border border-orange-300" title="Confirmation document not yet uploaded">
                            <UploadCloud className="inline h-2.5 w-2.5 mr-0.5" />Doc Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{offer.customerName}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{offer.subject}</TableCell>
                      <TableCell>{offer.createdAt ? fmtDate(offer.createdAt) : "-"}</TableCell>
                      <TableCell>{offer.validUntil ? fmtDate(offer.validUntil) : "-"}</TableCell>
                      <TableCell className="text-right font-medium">
                        {offer.currency} {parseFloat(offer.totalAmount || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[offer.status] || "bg-gray-100 text-gray-800"}>
                          {offer.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleViewOffer(offer)} title="View">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {offer.status !== "Order Confirmed" && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditOffer(offer)} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-600" onClick={() => setPdfDownloadOfferId(offer.id)} title="Download PDF">
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => handleDuplicate(offer)} title={offer.status === "Order Confirmed" ? "Duplicate to create a revision" : "Duplicate"}>
                            <Copy className="h-4 w-4" />
                          </Button>
                          {offer.status === "Draft" && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => statusMutation.mutate({ id: offer.id, status: "Sent" })} title="Mark as Sent">
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          {offer.status === "Sent" && (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" onClick={() => statusMutation.mutate({ id: offer.id, status: "Approved" })} title="Approve">
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => statusMutation.mutate({ id: offer.id, status: "Rejected" })} title="Reject">
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {offer.status === "Approved" && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-600" onClick={() => {
                              setConfirmOrderOffer(offer);
                              setConversionResult(null);
                              setConversionErrors([]);
                              setConfirmDocFile(null);
                              setConfirmDocUploading(false);
                              setConfirmDocUploaded(!!offer.confirmationDocGcsPath);
                              const today = new Date().toISOString().split('T')[0];
                              const sixMonths = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                              const customer = customers.find((c: any) => c.id === offer.customerId);
                              const subjectToProjectType: Record<string, string> = {
                                'Continuous Polishing System': 'CPS System',
                                'Continuous Polishing Sys...': 'CPS System',
                                'Used Engine Oil Refinery': 'Re-refining Plant',
                                'Automatic Lubricant Blending Plant': 'Lube Blending Plant',
                                'Automatic Lubricant Blen...': 'Lube Blending Plant',
                                'Spares for Refinery Equipment': 'Spares',
                                'Spares for Refinery Equip...': 'Spares',
                                'Grease Manufacturing Plant': 'Grease Plant',
                              };
                              const inferredType = Object.entries(subjectToProjectType).find(
                                ([key]) => offer.subject?.toLowerCase().includes(key.toLowerCase().replace('...', ''))
                              );
                              const managerId = offer.approvedBy || offer.createdBy || 0;
                              const rawCC = customer?.continentCode || '';
                              const rawCO = customer?.countryCode || '';
                              const derivedCO = rawCO
                                || (customer?.countryName ? COUNTRY_NAME_TO_CODE[customer.countryName.toLowerCase()] || '' : '')
                                || '';
                              const derivedCC = rawCC
                                || (customer?.continent ? CONTINENT_NAME_TO_CODE[customer.continent] : '')
                                || (derivedCO ? COUNTRY_TO_CONTINENT[derivedCO] : '')
                                || '';
                              setEpcFormData({
                                continentCode: derivedCC,
                                countryCode: derivedCO,
                                projectType: inferredType?.[1] || '',
                                priority: 'Medium',
                                startDate: today,
                                targetEndDate: sixMonths,
                                managerId,
                                disciplineCode: '',
                                mdmt: '',
                                inspectionBy: '',
                                voltageFrequency: '',
                              });
                            }} title="Confirm Order → Create EPC Project">
                              <Rocket className="h-4 w-4" />
                            </Button>
                          )}
                          {offer.status === "Order Confirmed" && (
                            <Badge variant="outline" className="text-indigo-700 border-indigo-300 text-xs">
                              <Lock className="h-3 w-3 mr-1" /> Locked
                            </Badge>
                          )}
                          {offer.status === "Draft" && (
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                              onClick={() => { if (confirm(`Delete offer ${offer.offerNumber}?`)) deleteMutation.mutate(offer.id); }}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-violet-600 opacity-60 hover:opacity-100"
                            onClick={() => setGcsPathTestOffer(offer)}
                            title="Test GCS Path"
                          >
                            <FolderSearch className="h-4 w-4" />
                          </Button>
                          {isSuperuser && (
                            <Button
                              variant="ghost" size="icon"
                              className={`h-8 w-8 ${offer.isTest ? "text-amber-600" : "text-muted-foreground opacity-30 hover:opacity-100"}`}
                              onClick={() => testFlagMutation.mutate({ id: offer.id, isTest: !offer.isTest })}
                              disabled={testFlagMutation.isPending}
                              title={offer.isTest ? "Unmark as test data" : "Mark as test data"}
                            >
                              <FlaskConical className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* VIEW OFFER DIALOG */}
        <Dialog open={isViewOpen} onOpenChange={(open) => { if (!open) { setIsViewOpen(false); setViewingOffer(null); } }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Offer {viewingOffer?.offerNumber}
                <Badge className={statusColors[viewingOffer?.status] || ""}>{viewingOffer?.status}</Badge>
                <Button variant="outline" size="sm" className="ml-auto text-indigo-600" onClick={() => viewingOffer && setPdfDownloadOfferId(viewingOffer.id)}>
                  <Download className="mr-1 h-3 w-3" /> Download PDF
                </Button>
              </DialogTitle>
            </DialogHeader>
            {viewingOffer && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><Label className="text-muted-foreground">Customer</Label><p className="font-medium">{viewingOffer.customerName}</p></div>
                  <div><Label className="text-muted-foreground">Contact Person</Label><p>{viewingOffer.contactPerson || "-"}</p></div>
                  <div><Label className="text-muted-foreground">Email</Label><p>{viewingOffer.customerEmail || "-"}</p></div>
                  <div><Label className="text-muted-foreground">Valid Until</Label><p>{viewingOffer.validUntil ? fmtDate(viewingOffer.validUntil) : "-"}</p></div>
                  <div className="col-span-2"><Label className="text-muted-foreground">Subject</Label><p className="font-medium">{viewingOffer.subject}</p></div>
                  <div><Label className="text-muted-foreground">Language</Label><p>{viewingOffer.language || "English"}</p></div>
                  {viewingOffer.customerAddress && <div className="col-span-2"><Label className="text-muted-foreground">Address</Label><p>{viewingOffer.customerAddress}</p></div>}
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Product Code</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Disc %</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(viewingOffer.items || []).map((item: any, idx: number) => {
                      const isSub = item.isSubItem || false;
                      const mainIndex = isSub ? "" : (viewingOffer.items || []).slice(0, idx + 1).filter((i: any) => !i.isSubItem).length;
                      return (
                        <TableRow key={item.id} className={isSub ? "bg-muted/30" : ""}>
                          <TableCell>{isSub ? <span className="text-muted-foreground ml-1">└</span> : mainIndex}</TableCell>
                          <TableCell className={`font-mono ${isSub ? "pl-6 text-muted-foreground" : ""}`}>{item.productCode || "-"}</TableCell>
                          <TableCell className={isSub ? "text-muted-foreground" : ""}>{item.description}{isSub && <Badge variant="secondary" className="ml-2 text-xs h-4">sub-item</Badge>}</TableCell>
                          <TableCell>{item.unit}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">{parseFloat(item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right">{item.discountPercent || "0"}%</TableCell>
                          <TableCell className={`text-right font-medium ${isSub ? "text-muted-foreground" : ""}`}>{parseFloat(item.totalPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                <div className="flex justify-end">
                  <div className="w-64 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal:</span><span>{viewingOffer.currency} {parseFloat(viewingOffer.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                    {parseFloat(viewingOffer.discountPercent || "0") > 0 && (
                      <div className="flex justify-between text-red-600"><span>Discount ({viewingOffer.discountPercent}%):</span><span>-{parseFloat(viewingOffer.discountAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                    )}
                    {parseFloat(viewingOffer.taxPercent || "0") > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Tax ({viewingOffer.taxPercent}%):</span><span>{parseFloat(viewingOffer.taxAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                    )}
                    <div className="flex justify-between font-bold border-t pt-1"><span>Total:</span><span>{viewingOffer.currency} {parseFloat(viewingOffer.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                  </div>
                </div>

                {viewingOffer.paymentTerms && <div><Label className="text-muted-foreground">Payment Terms</Label><p className="text-sm">{viewingOffer.paymentTerms}</p></div>}
                {viewingOffer.deliveryTerms && <div><Label className="text-muted-foreground">Delivery Terms</Label><p className="text-sm">{viewingOffer.deliveryTerms}</p></div>}
                {viewingOffer.notes && <div><Label className="text-muted-foreground">Notes</Label><p className="text-sm">{viewingOffer.notes}</p></div>}
                {viewingOffer.termsAndConditions && <div><Label className="text-muted-foreground">Terms & Conditions</Label><p className="text-sm whitespace-pre-wrap">{viewingOffer.termsAndConditions}</p></div>}

              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* CONFIRM ORDER DIALOG */}
        <Dialog open={!!confirmOrderOffer} onOpenChange={(open) => { if (!open) { setConfirmOrderOffer(null); setConversionResult(null); setConversionErrors([]); setConfirmDocFile(null); setConfirmDocUploaded(false); } }}>
          <DialogContent className={conversionResult ? "max-w-xl" : "max-w-lg"}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Rocket className="h-5 w-5 text-indigo-600" />
                Confirm Order &amp; Create EPC Project
              </DialogTitle>
              <DialogDescription>
                Offer {confirmOrderOffer?.offerNumber} — {confirmOrderOffer?.customerName}
              </DialogDescription>
            </DialogHeader>

            {conversionResult ? (
              <div className="space-y-3">

                {/* ── Phase 0: Project & Items ─────────────────────────────── */}
                <div className="flex items-start gap-2.5 rounded-lg border bg-green-50 border-green-200 px-3 py-2.5">
                  <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-green-900">Project &amp; Items Created</p>
                    <p className="text-xs text-green-700 mt-0.5">
                      {conversionResult.alreadyConverted
                        ? 'This offer was already converted — returning existing project.'
                        : `Project ${conversionResult.project?.code} · Order ${conversionResult.orderNumber} · ${conversionResult.itemsCreated} item${conversionResult.itemsCreated !== 1 ? 's' : ''} created`}
                    </p>
                    {(conversionResult.itemsPendingMapping?.length > 0) && (
                      <p className="text-xs text-amber-700 mt-1 font-medium">
                        ⚠ {conversionResult.itemsPendingMapping.length} custom item{conversionResult.itemsPendingMapping.length !== 1 ? 's' : ''} created as stub{conversionResult.itemsPendingMapping.length !== 1 ? 's' : ''} — mapping tasks raised for project manager.
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 bg-green-100 text-green-700">Done</span>
                </div>

                {/* ── Pipeline phases ───────────────────────────────────────── */}
                {!conversionResult.alreadyConverted && (() => {
                  const ar = conversionResult.automationResult;
                  if (!ar) return (
                    <p className="text-xs text-muted-foreground px-1">Manual mode — pipeline not triggered automatically.</p>
                  );

                  const steps: any[] = ar.stepResults || [];
                  const completed: number = ar.phasesCompleted ?? 0;

                  const getStatus = (n: number): 'completed' | 'failed' | 'skipped' => {
                    if (n <= completed) return 'completed';
                    if (!ar.success && n === completed + 1) return 'failed';
                    return 'skipped';
                  };

                  const ps = (n: number) => steps.filter((s: any) => s.phase === n);

                  const phaseDefs = [
                    {
                      n: 1,
                      label: 'Phase 1 — DO & PO Draft Approval',
                      detail: (s: any[]) => {
                        const done = s.filter((x: any) => !x.skipped);
                        const dos = done.filter((x: any) => x.step?.includes('_DO_')).length;
                        const pos = done.filter((x: any) => x.step?.includes('_PO_')).length;
                        const parts = [dos && `${dos} DO`, pos && `${pos} PO`].filter(Boolean);
                        return parts.length ? `${parts.join(', ')} draft${done.length !== 1 ? 's' : ''} approved` : `${done.length} drafts approved`;
                      },
                    },
                    {
                      n: 2,
                      label: 'Phase 2 — WO Draft Approval',
                      detail: (s: any[]) => {
                        const n = s.filter((x: any) => !x.skipped).length;
                        return `${n} WO draft${n !== 1 ? 's' : ''} approved`;
                      },
                    },
                    {
                      n: 3,
                      label: 'Phase 3 — Activation & Release',
                      detail: (s: any[]) => {
                        const act = (t: string) => s.filter((x: any) => x.step?.startsWith(`activate_${t}`) && !x.skipped).length;
                        const released = s.filter((x: any) => x.step?.startsWith('release_wo') && !x.skipped).length;
                        const issued   = s.filter((x: any) => x.step?.startsWith('issue_po')   && !x.skipped).length;
                        const dos = act('DO'), wos = act('WO'), pos = act('PO');
                        return [
                          dos  && `${dos} DO${dos  !== 1 ? 's' : ''} activated`,
                          wos  && `${wos} WO${wos  !== 1 ? 's' : ''} activated`,
                          released && `${released} WO${released !== 1 ? 's' : ''} released`,
                          pos  && `${pos} PO${pos  !== 1 ? 's' : ''} activated`,
                          issued   && `${issued} PO${issued   !== 1 ? 's' : ''} issued`,
                        ].filter(Boolean).join(' · ') || 'Activation complete';
                      },
                    },
                    {
                      n: 4,
                      label: 'Phase 4 — Quality Plans & Inspections',
                      detail: (s: any[]) => {
                        const qpls = s.filter((x: any) => x.step?.startsWith('create_qpl')         && !x.skipped).length;
                        const ins  = s.filter((x: any) => x.step?.startsWith('create_inspection')  && !x.skipped).length;
                        return [
                          qpls && `${qpls} quality plan${qpls !== 1 ? 's' : ''}`,
                          ins  && `${ins} inspection record${ins !== 1 ? 's' : ''}`,
                        ].filter(Boolean).join(' · ') || 'Quality plans created';
                      },
                    },
                    {
                      n: 5,
                      label: 'Phase 5 — Completion Verification',
                      detail: (s: any[]) => s.some((x: any) => !x.skipped) ? 'All gates verified' : 'Verification complete',
                    },
                  ];

                  return (
                    <div className="space-y-1.5">
                      {phaseDefs.map(({ n, label, detail }) => {
                        const status = getStatus(n);
                        const s = ps(n);
                        return (
                          <div key={n} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${
                            status === 'failed'   ? 'bg-red-50 border-red-200'     :
                            status === 'skipped'  ? 'bg-muted/30 border-border'    :
                                                    'bg-green-50 border-green-200'
                          }`}>
                            {status === 'failed'  ? <XCircle  className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />            :
                             status === 'skipped' ? <Circle   className="h-4 w-4 text-muted-foreground/40 mt-0.5 shrink-0" /> :
                                                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />}
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm font-medium ${
                                status === 'failed'  ? 'text-red-900'          :
                                status === 'skipped' ? 'text-muted-foreground' :
                                                       'text-green-900'
                              }`}>{label}</p>
                              <p className={`text-xs mt-0.5 ${
                                status === 'failed'  ? 'text-red-700'          :
                                status === 'skipped' ? 'text-muted-foreground' :
                                                       'text-green-700'
                              }`}>
                                {status === 'skipped' ? 'Not reached' :
                                 status === 'failed'  ? (
                                   <>
                                     <span className="font-semibold">Error: </span>{ar.failedError || 'Unknown error'}
                                     {ar.failedStep && <><br /><span className="font-mono text-[10px] opacity-60">{ar.failedStep}</span></>}
                                   </>
                                 ) : detail(s)}
                              </p>
                            </div>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 mt-0.5 ${
                              status === 'failed'  ? 'bg-red-100 text-red-700'           :
                              status === 'skipped' ? 'bg-muted text-muted-foreground'    :
                                                     'bg-green-100 text-green-700'
                            }`}>
                              {status === 'failed' ? 'Failed' : status === 'skipped' ? 'Skipped' : 'Done'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                <DialogFooter className="pt-1">
                  <Button variant="outline" onClick={() => { setConfirmOrderOffer(null); setConversionResult(null); }}>Close</Button>
                  <Button onClick={() => { window.location.href = `/projects/${conversionResult.project?.id}`; }}>
                    <ExternalLink className="h-4 w-4 mr-1" /> Open Project
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <div className="space-y-4">
                {/* ── Step 1: Mandatory confirmation document ──────────────── */}
                {(() => {
                  const isProjectLinked = confirmOrderOffer?.offerType === 'project-linked';
                  const docLabel = isProjectLinked ? 'Sales Contract (Customer-Signed)' : 'Customer Order / PO';
                  const Icon = isProjectLinked ? FileSignature : ShoppingCart;
                  const alreadyUploaded = confirmDocUploaded || !!confirmOrderOffer?.confirmationDocGcsPath;
                  return (
                    <div className={`rounded-lg border-2 p-3 ${alreadyUploaded ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className={`h-4 w-4 ${alreadyUploaded ? 'text-green-600' : 'text-amber-600'}`} />
                        <span className="text-sm font-semibold">
                          {alreadyUploaded ? '✓ ' : 'Required: '}{docLabel}
                        </span>
                        <Badge variant="outline" className={`ml-auto text-[10px] ${alreadyUploaded ? 'border-green-400 text-green-700' : 'border-amber-400 text-amber-700'}`}>
                          {alreadyUploaded ? 'Uploaded' : 'Mandatory'}
                        </Badge>
                      </div>
                      {alreadyUploaded ? (
                        <p className="text-xs text-green-700">
                          {confirmOrderOffer?.confirmationDocFilename || confirmDocFile?.name || 'Document uploaded'} — ready for conversion.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs text-amber-800">
                            Upload the signed {docLabel} from the customer before proceeding. This document is required and will be stored in GCS.
                          </p>
                          <div className="flex items-center gap-2">
                            <input
                              type="file"
                              accept="application/pdf"
                              className="hidden"
                              id="confirm-doc-input"
                              onChange={e => setConfirmDocFile(e.target.files?.[0] || null)}
                            />
                            <label htmlFor="confirm-doc-input" className="cursor-pointer inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50">
                              <UploadCloud className="h-3.5 w-3.5" />
                              {confirmDocFile ? confirmDocFile.name.slice(0, 30) : 'Choose PDF…'}
                            </label>
                            {confirmDocFile && (
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-amber-600 hover:bg-amber-700"
                                disabled={confirmDocUploading}
                                onClick={async () => {
                                  if (!confirmOrderOffer || !confirmDocFile) return;
                                  setConfirmDocUploading(true);
                                  try {
                                    const fd = new FormData();
                                    fd.append('file', confirmDocFile);
                                    const r = await fetch(`/api/sales-marketing/offers/${confirmOrderOffer.id}/confirmation-doc`, {
                                      method: 'POST', body: fd, credentials: 'include',
                                    });
                                    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Upload failed'); }
                                    setConfirmDocUploaded(true);
                                    queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offers'] });
                                    toast({ title: 'Document uploaded', description: `${docLabel} saved to GCS.` });
                                  } catch (err: any) {
                                    toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
                                  } finally {
                                    setConfirmDocUploading(false);
                                  }
                                }}
                              >
                                {confirmDocUploading ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Uploading…</> : 'Upload'}
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="rounded-lg border p-3 bg-muted/30 text-sm">
                  <p className="font-medium mb-1">This action will:</p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-0.5 text-xs">
                    <li>Create an EPC project in planning status</li>
                    <li>Map offer items to EPC project items</li>
                    <li>Lock this offer from further editing</li>
                    <li>Generate an order number for traceability</li>
                  </ul>
                </div>

                {conversionErrors.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <ul className="list-disc list-inside text-xs">
                        {conversionErrors.map((e: any, i: number) => (
                          <li key={i}><strong>{e.field}</strong>: {e.reason}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">
                      Continent Code *
                      {!epcFormData.continentCode && (
                        <span className="ml-1 text-orange-600">(enter manually — not set on customer)</span>
                      )}
                    </Label>
                    <Input
                      value={epcFormData.continentCode}
                      maxLength={2}
                      readOnly={!!epcFormData.continentCode}
                      placeholder="e.g. AS"
                      onChange={(e) => setEpcFormData(p => ({ ...p, continentCode: e.target.value.toUpperCase().slice(0, 2) }))}
                      className={epcFormData.continentCode ? "bg-muted cursor-not-allowed" : "border-orange-400 placeholder:text-orange-300"}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">
                      Country Code *
                      {!epcFormData.countryCode && (
                        <span className="ml-1 text-orange-600">(enter manually — not set on customer)</span>
                      )}
                    </Label>
                    <Input
                      value={epcFormData.countryCode}
                      maxLength={2}
                      readOnly={!!epcFormData.countryCode}
                      placeholder="e.g. SA"
                      onChange={(e) => setEpcFormData(p => ({ ...p, countryCode: e.target.value.toUpperCase().slice(0, 2) }))}
                      className={epcFormData.countryCode ? "bg-muted cursor-not-allowed" : "border-orange-400 placeholder:text-orange-300"}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Project Type</Label>
                    <Input value={epcFormData.projectType} readOnly className="bg-muted cursor-not-allowed" />
                  </div>
                  <div>
                    <Label className="text-xs">Priority</Label>
                    <Select value={epcFormData.priority} onValueChange={(v) => setEpcFormData(p => ({ ...p, priority: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['Low', 'Medium', 'High'].map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Start Date *</Label>
                    <Input type="date" value={epcFormData.startDate}
                      onChange={(e) => setEpcFormData(p => ({ ...p, startDate: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Target End Date *</Label>
                    <Input type="date" value={epcFormData.targetEndDate}
                      onChange={(e) => setEpcFormData(p => ({ ...p, targetEndDate: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Project Manager *</Label>
                    <Input
                      value={(() => {
                        const mgr = allUsers.find((u: any) => u.id === epcFormData.managerId);
                        return mgr ? `${mgr.fullName || mgr.username} (${mgr.role})` : '';
                      })()}
                      readOnly className="bg-muted cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* ── Technical defaults required for DDS ─────────────────── */}
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 font-medium">
                  The following 4 fields are mandatory — they will be saved on the project and used as defaults in Design Data Sheets for all equipment.
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs">Project Discipline *</Label>
                    <Select value={epcFormData.disciplineCode} onValueChange={(v) => setEpcFormData(p => ({ ...p, disciplineCode: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select discipline…" /></SelectTrigger>
                      <SelectContent>
                        {['ASME SEC VIII Div-1', 'ASME 31.3', 'EN 13445', 'PED 2014/68/EU', 'API 650'].map(d => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">MDMT *</Label>
                    <Select value={epcFormData.mdmt} onValueChange={(v) => setEpcFormData(p => ({ ...p, mdmt: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select MDMT…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="-29 Deg °C">-29 Deg °C</SelectItem>
                        <SelectItem value="0 Deg °C">0 Deg °C</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Inspection By *</Label>
                    <Select value={epcFormData.inspectionBy} onValueChange={(v) => setEpcFormData(p => ({ ...p, inspectionBy: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select inspector…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SGS India">SGS India</SelectItem>
                        <SelectItem value="TUV India">TUV India</SelectItem>
                        <SelectItem value="Thermopac">Thermopac</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Three-Phase Voltage &amp; Frequency *</Label>
                    <Select value={epcFormData.voltageFrequency} onValueChange={(v) => setEpcFormData(p => ({ ...p, voltageFrequency: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select voltage & frequency…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="380V / 50 Hz">380V / 50 Hz</SelectItem>
                        <SelectItem value="400V / 50 Hz">400V / 50 Hz</SelectItem>
                        <SelectItem value="415V / 50 Hz">415V / 50 Hz</SelectItem>
                        <SelectItem value="380V / 60 Hz">380V / 60 Hz</SelectItem>
                        <SelectItem value="400V / 60 Hz">400V / 60 Hz</SelectItem>
                        <SelectItem value="415V / 60 Hz">415V / 60 Hz</SelectItem>
                        <SelectItem value="440V / 60 Hz">440V / 60 Hz</SelectItem>
                        <SelectItem value="460V / 60 Hz">460V / 60 Hz</SelectItem>
                        <SelectItem value="480V / 60 Hz">480V / 60 Hz</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setConfirmOrderOffer(null)}>Cancel</Button>
                  <Button
                    className="bg-indigo-600 hover:bg-indigo-700"
                    disabled={
                      confirmOrderMutation.isPending ||
                      !(confirmDocUploaded || !!confirmOrderOffer?.confirmationDocGcsPath) ||
                      !epcFormData.continentCode || !epcFormData.countryCode ||
                      !epcFormData.startDate || !epcFormData.targetEndDate || !epcFormData.managerId ||
                      !epcFormData.disciplineCode || !epcFormData.mdmt ||
                      !epcFormData.inspectionBy || !epcFormData.voltageFrequency
                    }
                    onClick={() => {
                      if (!confirmOrderOffer) return;
                      confirmOrderMutation.mutate({ id: confirmOrderOffer.id, epcParams: epcFormData });
                    }}
                  >
                    {confirmOrderMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Converting...</> : <><Rocket className="h-4 w-4 mr-1" /> Confirm Order</>}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* CREATE/EDIT OFFER DIALOG */}
        <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) resetAndClose(); }}>
          <DialogContent className="max-w-7xl h-[92vh] flex flex-col gap-0 p-0 overflow-hidden">

            {/* ── Styled Header ── */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b bg-gradient-to-r from-slate-50 to-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="h-4.5 w-4.5 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold leading-tight">
                    {editingOffer ? `Edit Offer — ${editingOffer.offerNumber}` : "Create New Offer"}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {editingOffer ? "Update details and line items below" : "Fill in customer details and add line items"}
                  </p>
                </div>
              </div>
              {editingOffer && (
                <Badge variant="outline" className="text-xs capitalize shrink-0">{editingOffer.status}</Badge>
              )}
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">

                {/* ── Scrollable Body ── */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

                  {/* Customer Details Card */}
                  <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-slate-50/70">
                      <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                      <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Customer Details</h3>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-4 gap-3">
                        <div ref={customerComboRef} className="relative">
                          <Label className="text-xs font-medium text-slate-600 mb-1.5 block">Select Customer</Label>
                          <div
                            className="flex items-center h-9 w-full rounded-md border border-input bg-background px-3 text-sm cursor-pointer gap-2"
                            onClick={() => setCustomerComboOpen(o => !o)}
                          >
                            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate text-muted-foreground">
                              {form.watch("customerId")
                                ? (() => { const c = customers.find((x: any) => x.id === form.watch("customerId")); return c ? `${c.bpCode} - ${c.bpName}` : "Select customer…"; })()
                                : "Select customer…"}
                            </span>
                          </div>
                          {customerComboOpen && (
                            <div className="absolute z-50 mt-1 w-[340px] rounded-md border bg-popover shadow-md overflow-hidden">
                              <div className="p-2 border-b">
                                <input
                                  autoFocus
                                  className="w-full h-8 px-2 text-sm rounded border border-input bg-background outline-none focus:ring-1 focus:ring-ring"
                                  placeholder="Search by code or name…"
                                  value={customerSearchInput}
                                  onChange={e => setCustomerSearchInput(e.target.value)}
                                  onClick={e => e.stopPropagation()}
                                />
                              </div>
                              <div className="max-h-52 overflow-y-auto">
                                {filteredCustomers.length === 0 ? (
                                  <p className="p-3 text-xs text-muted-foreground text-center">No customer found</p>
                                ) : (
                                  filteredCustomers.map((c: any) => (
                                    <div
                                      key={c.id}
                                      className="px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
                                      onMouseDown={e => e.preventDefault()}
                                      onClick={() => {
                                        handleSelectCustomer(c.id.toString());
                                        setCustomerSearchInput("");
                                        setCustomerComboOpen(false);
                                      }}
                                    >
                                      <span className="font-medium text-xs text-muted-foreground mr-1.5">{c.bpCode}</span>
                                      {c.bpName}
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        <FormField control={form.control} name="customerName" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-slate-600">Customer Name *</FormLabel>
                            <FormControl><Input {...field} className="h-9 text-sm" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="contactPerson" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-slate-600">Contact Person</FormLabel>
                            <FormControl><Input {...field} className="h-9 text-sm" /></FormControl>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="customerEmail" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-slate-600">Email</FormLabel>
                            <FormControl><Input {...field} type="email" className="h-9 text-sm" /></FormControl>
                          </FormItem>
                        )} />
                      </div>
                      <FormField control={form.control} name="customerAddress" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-slate-600">Address</FormLabel>
                          <FormControl><Textarea {...field} rows={1} className="text-sm resize-none" /></FormControl>
                        </FormItem>
                      )} />
                    </div>
                  </div>

                  {/* Offer Details Card */}
                  <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-slate-50/70">
                      <span className="h-2 w-2 rounded-full bg-violet-500 shrink-0" />
                      <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Offer Details</h3>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-[2fr_1fr_1fr] gap-3">
                        <FormField control={form.control} name="subject" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-slate-600">Subject *</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select subject" /></SelectTrigger></FormControl>
                              <SelectContent>
                                {offerSubjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="language" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-slate-600">Language *</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select language" /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="English">English</SelectItem>
                                <SelectItem value="Spanish">Spanish</SelectItem>
                                <SelectItem value="French">French</SelectItem>
                                <SelectItem value="Arabic">Arabic</SelectItem>
                                <SelectItem value="Portuguese">Portuguese</SelectItem>
                                <SelectItem value="Russian">Russian</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="offerType" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-slate-600">Offer Type *</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="standalone">Standalone (Customer Order)</SelectItem>
                                <SelectItem value="project-linked">Project-Linked (Sales Contract)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                      <div className="grid grid-cols-[80px_140px_1fr_1fr] gap-3">
                        <FormField control={form.control} name="currency" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-slate-600">Currency *</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="USD">USD</SelectItem>
                                <SelectItem value="EUR">EUR</SelectItem>
                                <SelectItem value="GBP">GBP</SelectItem>
                                <SelectItem value="INR">INR</SelectItem>
                                <SelectItem value="AED">AED</SelectItem>
                                <SelectItem value="SAR">SAR</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="validUntil" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-slate-600">Valid Until</FormLabel>
                            <FormControl><Input {...field} type="date" className="h-9 text-sm" /></FormControl>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="paymentTerms" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-slate-600">Payment Terms</FormLabel>
                            <Select value={field.value || ""} onValueChange={field.onChange}>
                              <FormControl><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select terms" /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="40% Advance with PO, 60% against readiness">40% Advance with PO, 60% against readiness</SelectItem>
                                <SelectItem value="50% Advance with PO, 50% against readiness">50% Advance with PO, 50% against readiness</SelectItem>
                                <SelectItem value="100% Advance with PO">100% Advance with PO</SelectItem>
                                <SelectItem value="Net 30 days">Net 30 days</SelectItem>
                                <SelectItem value="Net 60 days">Net 60 days</SelectItem>
                                <SelectItem value="LC at Sight">LC at Sight</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="deliveryTerms" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-slate-600">Delivery Terms</FormLabel>
                            <Select value={field.value || ""} onValueChange={field.onChange}>
                              <FormControl><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select delivery terms" /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="Ex-Works Mumbai Factory">Ex-Works Mumbai Factory</SelectItem>
                                <SelectItem value="FOB Mumbai Port">FOB Mumbai Port</SelectItem>
                                <SelectItem value="CIF Destination Port">CIF Destination Port</SelectItem>
                                <SelectItem value="DDP Destination">DDP Destination</SelectItem>
                                <SelectItem value="5-6 Months for shipment, 1.5 Months shipping, 1 Month commissioning">5-6 Months shipment + 1.5 Months shipping + 1 Month commissioning</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />
                      </div>
                    </div>
                  </div>

                  {/* Line Items Card */}
                  <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b bg-slate-50/70">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                        <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Line Items</h3>
                        {fields.length > 0 && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-1">{fields.length}</Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5 px-2.5"
                          onClick={() => { setProductPickerSearch(""); setIsProductPickerOpen(true); }}>
                          <Package className="h-3 w-3" /> Add from Products
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5 px-2.5"
                          onClick={handleAddBlankItem}>
                          <Plus className="h-3 w-3" /> Custom Item
                        </Button>
                      </div>
                    </div>

                    {fields.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="h-11 w-11 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                          <Package className="h-5 w-5 text-slate-400" />
                        </div>
                        <p className="text-sm font-medium text-slate-500">No items added yet</p>
                        <p className="text-xs text-muted-foreground mt-1">Use the buttons above to add from the product catalog or enter a custom item</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50 hover:bg-slate-50 border-b-2 border-slate-200">
                              <TableHead className="w-[36px] px-3 py-2 h-9 text-[11px] font-semibold text-slate-500">#</TableHead>
                              <TableHead className="px-3 py-2 h-9 text-[11px] font-semibold text-slate-500">Description</TableHead>
                              <TableHead className="w-[74px] px-2 py-2 h-9 text-[11px] font-semibold text-slate-500">Unit</TableHead>
                              <TableHead className="w-[90px] px-2 py-2 h-9 text-[11px] font-semibold text-slate-500 text-right">Qty</TableHead>
                              <TableHead className="w-[114px] px-2 py-2 h-9 text-[11px] font-semibold text-slate-500 text-right">Unit Price</TableHead>
                              <TableHead className="w-[66px] px-2 py-2 h-9 text-[11px] font-semibold text-slate-500 text-right">Disc %</TableHead>
                              <TableHead className="w-[114px] px-3 py-2 h-9 text-[11px] font-semibold text-slate-500 text-right">Line Total</TableHead>
                              <TableHead className="w-[54px] px-2 py-2 h-9"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {fields.map((field, index) => {
                              const item = watchItems?.[index];
                              const allWatchItems = watchItems || [];
                              const depth = getItemDepth(item, allWatchItems);
                              const isSubItem = item?.isSubItem || false;
                              const qty = parseFloat(item?.quantity || "0");
                              const price = parseFloat(item?.unitPrice || "0");
                              const disc = parseFloat(item?.discountPercent || "0");
                              const lineTotal = qty * price * (1 - disc / 100);
                              const hasChildren = allWatchItems.some(wi => wi.parentTempKey === item?.tempKey);
                              const canAddSub = depth < 2;
                              const isZeroPrice = depth === 0 && price === 0 && qty > 0;
                              const depthIndent = depth === 1 ? "pl-4" : depth >= 2 ? "pl-8" : "";
                              return (
                                <TableRow
                                  key={field.id}
                                  className={[
                                    "group transition-colors",
                                    depth === 0
                                      ? index % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                                      : depth === 1 ? "bg-slate-50/80"
                                      : "bg-violet-50/40",
                                    isZeroPrice ? "!bg-amber-50/60" : "",
                                    "hover:!bg-blue-50/50",
                                  ].filter(Boolean).join(" ")}
                                >
                                  <TableCell className="px-3 py-1.5 text-xs text-slate-400 w-[36px] font-mono">
                                    {depth === 0
                                      ? <span className="font-semibold text-slate-600">
                                          {index + 1 - allWatchItems.slice(0, index).filter(wi => wi.isSubItem).length}
                                        </span>
                                      : depth === 1
                                        ? <span className="text-base leading-none">└</span>
                                        : <span className="text-base leading-none pl-3">└</span>
                                    }
                                  </TableCell>
                                  <TableCell className="px-3 py-1.5">
                                    <Input
                                      value={item?.description || ""}
                                      onChange={(e) => form.setValue(`items.${index}.description`, e.target.value, { shouldDirty: true })}
                                      className={[
                                        "h-7 text-sm border-transparent bg-transparent focus:border-input focus:bg-white px-1",
                                        depth === 0 ? "font-medium text-slate-800" : depth === 1 ? "pl-4 text-slate-500" : "pl-8 text-slate-400 text-xs",
                                      ].join(" ")}
                                      placeholder="Item description"
                                    />
                                    <div className={`flex items-center gap-1 mt-0.5 px-1 ${depthIndent}`}>
                                      {item?.productCode && (
                                        <span className="text-[10px] text-slate-400 font-mono">{item.productCode}</span>
                                      )}
                                      {hasChildren && (
                                        <Badge variant="outline" className="text-[10px] h-3.5 gap-0.5 px-1 border-violet-200 text-violet-600">
                                          <GitBranch className="h-2 w-2" /> breakdown
                                        </Badge>
                                      )}
                                      {depth === 1 && (
                                        <Badge variant="secondary" className="text-[10px] h-3.5 px-1">sub-item</Badge>
                                      )}
                                      {depth >= 2 && (
                                        <Badge variant="outline" className="text-[10px] h-3.5 px-1 border-violet-300 text-violet-600 bg-violet-50">sub-sub-item</Badge>
                                      )}
                                      {isZeroPrice && (
                                        <Badge variant="outline" className="text-[10px] h-3.5 px-1 border-amber-300 text-amber-600 bg-amber-50">no price</Badge>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="px-2 py-1.5 w-[74px]">
                                    <select
                                      {...form.register(`items.${index}.unit`)}
                                      className="h-7 w-full text-xs border border-input rounded-md bg-background px-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                                    >
                                      {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                  </TableCell>
                                  <TableCell className="px-2 py-1.5 w-[90px]">
                                    <Input
                                      value={item?.quantity ? parseFloat(item.quantity).toFixed(2) : ""}
                                      onChange={(e) => form.setValue(`items.${index}.quantity`, e.target.value, { shouldDirty: true, shouldTouch: true })}
                                      onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) form.setValue(`items.${index}.quantity`, v.toFixed(2), { shouldDirty: true, shouldTouch: true }); }}
                                      className="h-7 text-xs text-right px-1 border-transparent bg-transparent focus:border-input focus:bg-white"
                                      type="number" step="0.01"
                                    />
                                  </TableCell>
                                  <TableCell className="px-2 py-1.5 w-[114px]">
                                    <Input
                                      value={item?.unitPrice || ""}
                                      onChange={(e) => form.setValue(`items.${index}.unitPrice`, e.target.value, { shouldDirty: true, shouldTouch: true })}
                                      className="h-7 text-xs text-right px-1 border-transparent bg-transparent focus:border-input focus:bg-white"
                                      type="number" step="0.01"
                                    />
                                  </TableCell>
                                  <TableCell className="px-2 py-1.5 w-[66px]">
                                    <Input
                                      value={item?.discountPercent || ""}
                                      onChange={(e) => form.setValue(`items.${index}.discountPercent`, e.target.value, { shouldDirty: true, shouldTouch: true })}
                                      className="h-7 text-xs text-right px-1 border-transparent bg-transparent focus:border-input focus:bg-white"
                                      type="number" step="0.01"
                                    />
                                  </TableCell>
                                  <TableCell className={`text-right font-semibold text-xs px-3 py-1.5 tabular-nums w-[114px] ${isSubItem ? "text-slate-400" : "text-slate-700"}`}>
                                    {lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell className="px-2 py-1.5 w-[54px]">
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                      {canAddSub && (
                                        <Button type="button" variant="ghost" size="icon"
                                          className="h-6 w-6 text-slate-400 hover:text-violet-600"
                                          title={depth === 0 ? "Add sub-item" : "Add sub-sub-item"}
                                          onClick={() => handleAddSubItem(index)}>
                                          <GitBranch className="h-3 w-3" />
                                        </Button>
                                      )}
                                      <Button type="button" variant="ghost" size="icon"
                                        className="h-6 w-6 text-slate-400 hover:text-destructive"
                                        onClick={() => handleRemoveItem(index)}>
                                        {depth === 0 ? <Trash2 className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    {form.formState.errors.items?.message && (
                      <p className="px-4 py-2 text-xs text-destructive">{form.formState.errors.items.message}</p>
                    )}
                  </div>

                  {/* Totals Panel */}
                  {fields.length > 0 && (
                    <div className="flex justify-end">
                      <div className="w-80 rounded-xl border bg-slate-50/60 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 space-y-2.5">
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Subtotal</span>
                            <span className="font-medium tabular-nums">
                              {form.watch("currency")} {calculations.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-slate-500 whitespace-nowrap">Discount %</span>
                            <div className="flex items-center gap-2">
                              <Input {...form.register("discountPercent")} className="h-7 w-20 text-right text-sm" type="number" step="0.01" />
                              <span className="text-sm text-red-500 tabular-nums w-28 text-right">
                                −{calculations.discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-slate-500 whitespace-nowrap">Tax %</span>
                            <div className="flex items-center gap-2">
                              <Input {...form.register("taxPercent")} className="h-7 w-20 text-right text-sm" type="number" step="0.01" />
                              <span className="text-sm text-emerald-600 tabular-nums w-28 text-right">
                                +{calculations.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-between items-center px-4 py-3 border-t bg-white font-bold text-base">
                          <span className="text-slate-700">Total</span>
                          <span className="tabular-nums text-primary">
                            {form.watch("currency")} {calculations.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Notes & Terms Card */}
                  <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-slate-50/70">
                      <span className="h-2 w-2 rounded-full bg-orange-400 shrink-0" />
                      <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Notes & Terms</h3>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-3">
                      <FormField control={form.control} name="notes" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-slate-600">Notes</FormLabel>
                          <FormControl><Textarea {...field} rows={3} className="text-sm resize-none" placeholder="Internal notes or special instructions" /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="termsAndConditions" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-slate-600">Terms & Conditions</FormLabel>
                          <FormControl><Textarea {...field} rows={3} className="text-sm resize-none" placeholder="Standard terms and conditions" /></FormControl>
                        </FormItem>
                      )} />
                    </div>
                  </div>

                </div>

                {/* ── Sticky Footer ── */}
                <div className="flex items-center justify-between px-6 py-3 border-t bg-slate-50/90 backdrop-blur-sm shrink-0">
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {fields.length > 0
                      ? `${fields.filter((_f, i) => !(watchItems?.[i]?.isSubItem)).length} item(s) · ${form.watch("currency")} ${calculations.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                      : "No items added yet"}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" size="sm" className="h-8" onClick={resetAndClose}>Cancel</Button>
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                      onClick={handleExportExcel}>
                      <FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel
                    </Button>
                    {editingOffer && (
                      <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5"
                        onClick={() => setPdfDownloadOfferId(editingOffer.id)}>
                        <Download className="h-3.5 w-3.5" /> Download PDF
                      </Button>
                    )}
                    <Button type="submit" size="sm" className="h-8 min-w-[110px]"
                      disabled={
                        createMutation.isPending ||
                        updateMutation.isPending ||
                        (!!editingOffer && !form.formState.isDirty)
                      }>
                      {(createMutation.isPending || updateMutation.isPending)
                        ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving…</>
                        : editingOffer ? "Update Offer" : "Save Offer"
                      }
                    </Button>
                  </div>
                </div>

              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Dialog open={isProductPickerOpen} onOpenChange={(open) => {
          if (!open) {
            setIsProductPickerOpen(false);
            setProductPickerSearch("");
            setFilterFamily("__all__");
            setFilterProp1("__all__");
            setFilterProp2("__all__");
            setFilterProp3("__all__");
          }
        }}>
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Select Product</DialogTitle>
              <DialogDescription>Search and select a product to add as a line item</DialogDescription>
            </DialogHeader>
            {(() => {
              const activeBase = products.filter(p => p.isActive);

              // Derive cascading option lists
              const familyOptions = (() => {
                const seen = new Map<string, string>();
                for (const p of activeBase) seen.set(p.itemFamily, p.itemFamilyLabel || p.itemFamily);
                return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
              })();

              const afterFamily = filterFamily === "__all__" ? activeBase : activeBase.filter(p => p.itemFamily === filterFamily);

              const prop1Options = (() => {
                const seen = new Map<string, string>();
                for (const p of afterFamily) seen.set(p.itemProperty1, p.itemProperty1Label || p.itemProperty1);
                return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
              })();

              const afterProp1 = filterProp1 === "__all__" ? afterFamily : afterFamily.filter(p => p.itemProperty1 === filterProp1);

              const prop2Options = (() => {
                const seen = new Map<string, string>();
                for (const p of afterProp1) seen.set(p.itemProperty2, p.itemProperty2Label || p.itemProperty2);
                return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
              })();

              const afterProp2 = filterProp2 === "__all__" ? afterProp1 : afterProp1.filter(p => p.itemProperty2 === filterProp2);

              const prop3Options = (() => {
                const seen = new Set<string>();
                for (const p of afterProp2) seen.add(p.itemProperty3);
                return Array.from(seen).sort();
              })();

              const afterProp3 = filterProp3 === "__all__" ? afterProp2 : afterProp2.filter(p => p.itemProperty3 === filterProp3);

              const filteredProducts = afterProp3
                .filter(p => {
                  if (!productPickerSearch) return true;
                  const q = productPickerSearch.toLowerCase();
                  return p.productCode.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
                })
                .sort((a, b) => {
                  const fc = a.itemFamily.localeCompare(b.itemFamily);
                  if (fc !== 0) return fc;
                  const p1 = a.itemProperty1.localeCompare(b.itemProperty1);
                  if (p1 !== 0) return p1;
                  const p2 = a.itemProperty2.localeCompare(b.itemProperty2);
                  if (p2 !== 0) return p2;
                  return a.itemProperty3.localeCompare(b.itemProperty3);
                });

              const hasFilters = filterFamily !== "__all__" || filterProp1 !== "__all__" || filterProp2 !== "__all__" || filterProp3 !== "__all__" || productPickerSearch;

              const resetAll = () => {
                setFilterFamily("__all__");
                setFilterProp1("__all__");
                setFilterProp2("__all__");
                setFilterProp3("__all__");
                setProductPickerSearch("");
              };

              return (
                <div className="flex flex-col gap-3 min-h-0 flex-1">
                  {/* Cascading filter row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <Select value={filterFamily} onValueChange={(v) => { setFilterFamily(v); setFilterProp1("__all__"); setFilterProp2("__all__"); setFilterProp3("__all__"); }}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="All Families" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All Families</SelectItem>
                        {familyOptions.map(([code, label]) => (
                          <SelectItem key={code} value={code}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={filterProp1} onValueChange={(v) => { setFilterProp1(v); setFilterProp2("__all__"); setFilterProp3("__all__"); }} disabled={prop1Options.length === 0}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="All Property 1" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All Property 1</SelectItem>
                        {prop1Options.map(([code, label]) => (
                          <SelectItem key={code} value={code}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={filterProp2} onValueChange={(v) => { setFilterProp2(v); setFilterProp3("__all__"); }} disabled={prop2Options.length === 0}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="All Property 2" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All Property 2</SelectItem>
                        {prop2Options.map(([code, label]) => (
                          <SelectItem key={code} value={code}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={filterProp3} onValueChange={setFilterProp3} disabled={prop3Options.length === 0}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="All Property 3" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All Property 3</SelectItem>
                        {prop3Options.map(v => (
                          <SelectItem key={v} value={v}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Search + reset row */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Filter by product code or description..."
                        value={productPickerSearch}
                        onChange={(e) => setProductPickerSearch(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>
                    {hasFilters && (
                      <Button variant="ghost" size="sm" className="h-9 px-3 text-xs shrink-0 gap-1" onClick={resetAll}>
                        <X className="h-3.5 w-3.5" />Clear
                      </Button>
                    )}
                  </div>

                  {/* Result count badge */}
                  <div className="flex items-center justify-between px-0.5">
                    <span className="text-xs text-muted-foreground">{filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Product list */}
                  <div className="flex-1 overflow-y-auto border rounded-md max-h-[380px]">
                    {filteredProducts.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm">No matching products found</p>
                        {hasFilters && <Button variant="link" size="sm" className="text-xs mt-1" onClick={resetAll}>Clear all filters</Button>}
                      </div>
                    ) : (
                      filteredProducts.map(p => {
                        const children = childProductsMap.get(p.id) || [];
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between p-3 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer transition-colors"
                            onClick={() => {
                              handleAddProduct(p);
                              setIsProductPickerOpen(false);
                              setProductPickerSearch("");
                              setFilterFamily("__all__");
                              setFilterProp1("__all__");
                              setFilterProp2("__all__");
                              setFilterProp3("__all__");
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-medium text-sm">{p.productCode}</span>
                                {children.length > 0 && <Badge variant="outline" className="text-xs">{children.length} sub</Badge>}
                              </div>
                              <p className="text-sm text-muted-foreground truncate">{p.description}</p>
                            </div>
                            <div className="text-right ml-3 shrink-0">
                              <p className="text-sm font-medium">{p.currency || "USD"} {parseFloat(p.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
        {/* ── GCS Path Test Dialog ─────────────────────────────────────────── */}
        <Dialog open={!!gcsPathTestOffer} onOpenChange={(open) => { if (!open) setGcsPathTestOffer(null); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderSearch className="h-5 w-5 text-violet-600" />
                GCS Governance Path Test
              </DialogTitle>
              <DialogDescription>
                Resolved GCS storage paths for <span className="font-semibold">{gcsPathTestOffer?.offerNumber}</span> — {gcsPathTestOffer?.customerName}
              </DialogDescription>
            </DialogHeader>

            {gcsPathTestLoading && (
              <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Resolving paths…</span>
              </div>
            )}

            {!gcsPathTestLoading && gcsPathTestData && (
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                {/* Offer identity row */}
                <div className="flex flex-wrap gap-2 text-xs">
                  {[
                    ['Type', gcsPathTestData.offer.offerType === 'project-linked' ? 'Project-Linked' : 'Standalone'],
                    ['Rev', `Rev-${String(gcsPathTestData.offer.revision).padStart(2, '0')}`],
                    ['CC', gcsPathTestData.offer.continentCode ?? '—'],
                    ['CO', gcsPathTestData.offer.countryCode ?? '—'],
                    ['ShortCode', gcsPathTestData.offer.shortCode ?? '—'],
                    ['FY', gcsPathTestData.offer.fyCode],
                    ['Slug', gcsPathTestData.offer.subjectSlug],
                  ].map(([label, val]) => (
                    <span key={label} className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded px-2 py-0.5 font-mono">
                      <span className="text-slate-500">{label}:</span>
                      <span className="font-semibold text-slate-800">{val}</span>
                    </span>
                  ))}
                </div>

                {gcsPathTestData.offer.missingGeo && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>Customer is missing continent/country/short-code — cannot compute next path. Update the customer record first.</AlertDescription>
                  </Alert>
                )}

                {/* Quotation governance rule — DB-driven */}
                {gcsPathTestData.qtnPathTemplate && (
                  <div className="rounded border border-violet-300 bg-violet-50 px-3 py-2.5 space-y-2">
                    <p className="text-[10px] font-semibold text-violet-700 uppercase tracking-wide">
                      Governance Rule — {gcsPathTestData.qtnDocType} (DB-Driven)
                    </p>
                    <div>
                      <p className="text-[9px] text-violet-500 uppercase font-semibold mb-0.5">Template (from DB)</p>
                      <p className="text-[11px] font-mono break-all text-violet-900 bg-white border border-violet-200 rounded px-2 py-1">
                        {gcsPathTestData.qtnPathTemplate}
                      </p>
                    </div>
                    {gcsPathTestData.qtnGeoResolvedTemplate && (
                      <div>
                        <p className="text-[9px] text-violet-500 uppercase font-semibold mb-0.5">Geo-Resolved (offer tokens filled in)</p>
                        <p className="text-[11px] font-mono break-all text-violet-900 bg-white border border-violet-200 rounded px-2 py-1">
                          {gcsPathTestData.qtnGeoResolvedTemplate}
                        </p>
                      </div>
                    )}
                    {gcsPathTestData.qtnFolderPrefix && (
                      <p className="text-[10px] text-violet-600">
                        Folder: <span className="font-mono bg-violet-100 px-1 rounded">{gcsPathTestData.qtnFolderPrefix}</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Already uploaded files */}
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                    Files Already on GCS ({gcsPathTestData.existingFiles.length})
                  </p>
                  {gcsPathTestData.existingFiles.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No PDFs generated for this offer yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {gcsPathTestData.existingFiles.map((f: any) => (
                        <div key={f.id} className={`rounded border px-2 py-1.5 flex items-start gap-2 ${
                          f.pathMismatch ? 'bg-amber-50 border-amber-300' :
                          f.status === 'active' ? 'bg-green-50 border-green-200' :
                          'bg-slate-50 border-slate-200 opacity-60'
                        }`}>
                          {f.pathMismatch
                            ? <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                            : <CheckCircle className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${f.status === 'active' ? 'text-green-600' : 'text-slate-400'}`} />
                          }
                          <div className="min-w-0">
                            <p className="text-[11px] font-mono break-all text-slate-800">{f.gcsObjectPath}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Rev-{String(f.revision).padStart(2,'0')} · {f.priceMode} · {f.status}
                              {f.pathMismatch && <span className="ml-1 text-amber-600 font-semibold">· path differs from current rule</span>}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Save to GCS section */}
                <div className="border-t pt-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">Save to GCS</p>
                    <span className="text-xs font-mono bg-violet-100 text-violet-800 border border-violet-200 rounded px-2 py-0.5">
                      Next seq: <span className="font-bold">{String(gcsPathTestData.nextSeq).padStart(3,'0')}</span>
                    </span>
                  </div>

                  {gcsPathTestData.offer.missingGeo ? (
                    <p className="text-xs text-amber-700 italic">Fix customer geography codes first.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { mode: 'combined',  label: 'Combined',  desc: 'Lump-sum total' },
                        { mode: 'breakup',   label: 'Breakup',   desc: 'Per-item prices' },
                        { mode: 'technical', label: 'Technical', desc: 'No pricing' },
                      ].map(({ mode, label, desc }) => {
                        const isGenerating = !!gcsGenerating[mode];
                        const anyGenerating = Object.values(gcsGenerating).some(Boolean);
                        return (
                          <Button
                            key={mode}
                            variant="outline"
                            disabled={isGenerating || anyGenerating}
                            className="flex flex-col h-auto py-2.5 px-3 gap-0.5 text-left items-start hover:border-violet-400 hover:bg-violet-50 disabled:opacity-60"
                            onClick={async () => {
                              setGcsGenerating(prev => ({ ...prev, [mode]: true }));
                              setGcsLastResult(null);
                              try {
                                const data = await apiRequest<{ artifactId: number; gcsObjectPath: string; attachmentSeq: number }>('POST', `/api/sales-marketing/offers/${gcsPathTestData.offer.id}/generate-and-store`, { priceMode: mode });
                                setGcsLastResult({ mode, gcsObjectPath: (data as any).gcsObjectPath, attachmentSeq: (data as any).attachmentSeq });
                                queryClient.invalidateQueries({ queryKey: ['/api/offers', gcsPathTestData.offer.id, 'gcs-path-test'] });
                              } catch (err: any) {
                                toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
                              } finally {
                                setGcsGenerating(prev => ({ ...prev, [mode]: false }));
                              }
                            }}
                          >
                            <span className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                              {isGenerating
                                ? <Loader2 className="h-3 w-3 animate-spin text-violet-500" />
                                : <CloudLightning className="h-3 w-3 text-violet-500" />}
                              {label}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{desc}</span>
                          </Button>
                        );
                      })}
                    </div>
                  )}

                  {/* Final resolved GCS path after upload */}
                  {gcsLastResult && (
                    <div className="rounded border border-green-300 bg-green-50 px-3 py-2 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        <span className="text-xs font-semibold text-green-800 capitalize">
                          {gcsLastResult.mode} PDF — Saved as seq {String(gcsLastResult.attachmentSeq).padStart(3,'0')}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono break-all text-green-900 pl-5">{gcsLastResult.gcsObjectPath}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Customer Order Path section ────────────────────── */}
            <div className="border-t pt-3 mt-1">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <FolderSearch className="h-3.5 w-3.5" />
                Customer Order (CO) Path
              </p>

              {gcsCoPathLoading && (
                <div className="flex items-center gap-2 py-2 text-muted-foreground text-xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Resolving CO path…
                </div>
              )}

              {!gcsCoPathLoading && gcsCoPathData && !gcsCoPathData.converted && (
                <p className="text-xs text-muted-foreground italic">
                  This offer has not been converted to an order yet — no CO path exists.
                </p>
              )}

              {!gcsCoPathLoading && gcsCoPathData?.converted && gcsCoPathData.missingProject && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>Order number <span className="font-mono">{gcsCoPathData.orderNumber}</span> found but no project is linked to this conversion.</AlertDescription>
                </Alert>
              )}

              {!gcsCoPathLoading && gcsCoPathData?.converted && !gcsCoPathData.missingProject && (
                <div className="space-y-3">
                  {/* Project identity badges */}
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {[
                      ['Project', gcsCoPathData.projectCode ?? '—'],
                      ['Order', gcsCoPathData.orderNumber ?? '—'],
                      ['Seq', gcsCoPathData.projectSeq ?? '—'],
                      ['CC', gcsCoPathData.continentCode ?? '—'],
                      ['CO', gcsCoPathData.countryCode ?? '—'],
                      ['SC', gcsCoPathData.shortCode ?? '—'],
                      ['FY', gcsCoPathData.fyCode ?? '—'],
                    ].map(([label, val]) => (
                      <span key={label} className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 rounded px-2 py-0.5 font-mono">
                        <span className="text-blue-500">{label}:</span>
                        <span className="font-semibold text-blue-900">{val}</span>
                      </span>
                    ))}
                  </div>

                  {gcsCoPathData.missingGeo && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>Project is missing geo codes — update the customer record on the project first.</AlertDescription>
                    </Alert>
                  )}

                  {/* DB-driven governance rule */}
                  {gcsCoPathData.pathTemplate && (
                    <div className="rounded border border-violet-300 bg-violet-50 px-3 py-2.5 space-y-2">
                      <p className="text-[10px] font-semibold text-violet-700 uppercase tracking-wide">
                        Governance Rule — CO_DOCUMENT (DB-Driven)
                      </p>
                      <div>
                        <p className="text-[9px] text-violet-500 uppercase font-semibold mb-0.5">Template (from DB)</p>
                        <p className="text-[11px] font-mono break-all text-violet-900 bg-white border border-violet-200 rounded px-2 py-1">
                          {gcsCoPathData.pathTemplate}
                        </p>
                      </div>
                      {gcsCoPathData.geoResolvedTemplate && (
                        <div>
                          <p className="text-[9px] text-violet-500 uppercase font-semibold mb-0.5">Geo-Resolved (project tokens filled in)</p>
                          <p className="text-[11px] font-mono break-all text-violet-900 bg-white border border-violet-200 rounded px-2 py-1">
                            {gcsCoPathData.geoResolvedTemplate}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* CO folder prefix */}
                  {gcsCoPathData.folderPrefix && (
                    <div className="rounded border border-green-200 bg-green-50 px-3 py-2">
                      <p className="text-[10px] text-green-600 font-semibold uppercase mb-1">Folder Prefix (computed)</p>
                      <p className="text-[11px] font-mono break-all text-green-900">{gcsCoPathData.folderPrefix}</p>
                      <p className="text-[10px] text-green-600 mt-1">
                        <span className="font-mono bg-green-100 px-1 rounded">Next seq: {String(gcsCoPathData.nextCoSeq).padStart(3,'0')}</span>
                        {' '}· Filename = <span className="font-mono">{'{seq}-{label}-rev-{rev}.pdf'}</span>
                      </p>
                    </div>
                  )}

                  {/* Existing CO documents */}
                  <div>
                    <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                      CO Docs Already on GCS ({gcsCoPathData.existingCoDocs?.length ?? 0})
                    </p>
                    {!gcsCoPathData.existingCoDocs?.length ? (
                      <p className="text-xs text-muted-foreground italic">No CO documents uploaded for this order yet.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {gcsCoPathData.existingCoDocs.map((d: any) => (
                          <div key={d.id} className={`rounded border px-2 py-1.5 flex items-start gap-2 ${d.status === 'active' ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                            <CheckCircle className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${d.status === 'active' ? 'text-green-600' : 'text-slate-400'}`} />
                            <div className="min-w-0">
                              <p className="text-[11px] font-mono break-all text-slate-800">{d.gcsObjectPath}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                seq {String(d.attachmentSeq).padStart(3,'0')} · {d.documentLabel} · {d.originalFileName}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setGcsPathTestOffer(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <PdfDownloadDialog
          offerId={pdfDownloadOfferId}
          onClose={() => setPdfDownloadOfferId(null)}
          onDownload={handleDownloadPdf}
        />
      </div>
  );

  return offersContent;
}

export default function OffersPage() {
  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <FileText className="h-6 w-6" /> Offers / Quotations
            </h1>
            <p className="text-muted-foreground">Create and manage customer offers and quotations</p>
          </div>
        </div>
        <OffersContent />
      </div>
    </Layout>
  );
}