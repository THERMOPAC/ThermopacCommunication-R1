import { useState, useMemo } from "react";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  FileText, Plus, Pencil, Trash2, Loader2, Search, Eye, Package,
  CheckCircle, XCircle, Send, Copy, Calendar, ChevronDown, ChevronRight, GitBranch, X
} from "lucide-react";
import type { Product } from "@shared/schema";

const offerItemSchema = z.object({
  productId: z.number().nullable().optional(),
  productCode: z.string().optional(),
  description: z.string().min(1, "Description is required"),
  unit: z.string().min(1, "Unit is required"),
  quantity: z.string().min(1, "Quantity is required"),
  unitPrice: z.string().min(1, "Price is required"),
  discountPercent: z.string().optional(),
  hsnSacCode: z.string().optional(),
  isSubItem: z.boolean().optional(),
  parentItemIndex: z.number().nullable().optional(),
});

const offerFormSchema = z.object({
  customerId: z.number().nullable().optional(),
  customerName: z.string().min(1, "Customer name is required"),
  customerEmail: z.string().optional(),
  customerAddress: z.string().optional(),
  contactPerson: z.string().optional(),
  subject: z.string().min(1, "Subject is required"),
  currency: z.string().min(1, "Currency is required"),
  discountPercent: z.string().optional(),
  taxPercent: z.string().optional(),
  validUntil: z.string().optional(),
  paymentTerms: z.string().optional(),
  deliveryTerms: z.string().optional(),
  notes: z.string().optional(),
  termsAndConditions: z.string().optional(),
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
};

export default function OffersPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<any>(null);
  const [viewingOffer, setViewingOffer] = useState<any>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [productPickerSearch, setProductPickerSearch] = useState("");

  const { data: offers = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/sales-marketing/offers'],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['/api/sales-marketing/products'],
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

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ['/api/sales-marketing/customers'],
  });

  const form = useForm<OfferFormValues>({
    resolver: zodResolver(offerFormSchema),
    defaultValues: {
      customerId: null, customerName: "", customerEmail: "", customerAddress: "",
      contactPerson: "", subject: "", currency: "USD", discountPercent: "0",
      taxPercent: "0", validUntil: "", paymentTerms: "", deliveryTerms: "",
      notes: "", termsAndConditions: "", items: [],
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

  const filteredOffers = useMemo(() => {
    return offers.filter((o: any) => {
      const matchesSearch = !searchQuery ||
        o.offerNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.subject?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || o.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [offers, searchQuery, statusFilter]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => apiRequest('POST', '/api/sales-marketing/offers', data),
    onSuccess: () => {
      toast({ title: "Offer created", description: "Offer has been created successfully" });
      resetAndClose();
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offers'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) =>
      apiRequest('PATCH', `/api/sales-marketing/offers/${id}`, data),
    onSuccess: () => {
      toast({ title: "Offer updated", description: "Offer has been updated successfully" });
      resetAndClose();
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/offers'] });
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
      contactPerson: "", subject: "", currency: "USD", discountPercent: "0",
      taxPercent: "0", validUntil: "", paymentTerms: "", deliveryTerms: "",
      notes: "", termsAndConditions: "", items: [],
    });
  };

  const handleNewOffer = () => {
    resetAndClose();
    const now = new Date();
    const validUntil = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const formatted = validUntil.toISOString().split('T')[0];
    form.setValue("validUntil", formatted);
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
        currency: data.currency || "USD",
        discountPercent: data.discountPercent || "0",
        taxPercent: data.taxPercent || "0",
        validUntil: data.validUntil ? new Date(data.validUntil).toISOString().split('T')[0] : "",
        paymentTerms: data.paymentTerms || "",
        deliveryTerms: data.deliveryTerms || "",
        notes: data.notes || "",
        termsAndConditions: data.termsAndConditions || "",
        items: (data.items || []).map((item: any, idx: number) => ({
          productId: item.productId,
          productCode: item.productCode || "",
          description: item.description || "",
          unit: item.unit || "",
          quantity: item.quantity || "0",
          unitPrice: item.unitPrice || "0",
          discountPercent: item.discountPercent || "0",
          hsnSacCode: item.hsnSacCode || "",
          isSubItem: item.isSubItem || false,
          parentItemIndex: item.isSubItem ? idx - 1 >= 0 ? (() => {
            for (let pi = idx - 1; pi >= 0; pi--) {
              if (!(data.items[pi]?.isSubItem)) return pi;
            }
            return null;
          })() : null : null,
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

  const handleAddProduct = (product: Product) => {
    const children = childProductsMap.get(product.id) || [];
    const parentIndex = fields.length;
    append({
      productId: product.id,
      productCode: product.productCode,
      description: product.description,
      unit: product.unit,
      quantity: "1",
      unitPrice: product.unitPrice,
      discountPercent: "0",
      hsnSacCode: product.hsnSacCode || "",
      isSubItem: false,
      parentItemIndex: null,
    });
    if (children.length > 0) {
      for (const child of children) {
        append({
          productId: child.id,
          productCode: child.productCode,
          description: child.description,
          unit: child.unit,
          quantity: String(child.quantity || 1),
          unitPrice: child.unitPrice,
          discountPercent: "0",
          hsnSacCode: child.hsnSacCode || "",
          isSubItem: true,
          parentItemIndex: parentIndex,
        });
      }
    }
  };

  const handleRemoveItem = (index: number) => {
    const item = watchItems?.[index];
    if (item?.isSubItem && item?.parentItemIndex != null) {
      const parentIdx = item.parentItemIndex;
      const parentItem = watchItems?.[parentIdx];
      if (parentItem) {
        const childPrice = parseFloat(item.unitPrice || "0") * parseFloat(item.quantity || "1");
        const currentParentPrice = parseFloat(parentItem.unitPrice || "0");
        const newParentPrice = Math.max(0, currentParentPrice - childPrice);
        form.setValue(`items.${parentIdx}.unitPrice`, newParentPrice.toFixed(2));
      }
    }
    if (!item?.isSubItem) {
      const indicesToRemove: number[] = [index];
      (watchItems || []).forEach((wi, i) => {
        if (wi.isSubItem && wi.parentItemIndex === index) {
          indicesToRemove.push(i);
        }
      });
      indicesToRemove.sort((a, b) => b - a);
      for (const idx of indicesToRemove) {
        remove(idx);
      }
      const currentItems = form.getValues("items");
      const updatedItems = currentItems.map((ci) => {
        if (ci.parentItemIndex != null && ci.parentItemIndex > index) {
          return { ...ci, parentItemIndex: ci.parentItemIndex - indicesToRemove.length };
        }
        return ci;
      });
      form.setValue("items", updatedItems);
      return;
    }
    remove(index);
  };

  const handleAddBlankItem = () => {
    append({
      productId: null,
      productCode: "",
      description: "",
      unit: "pcs",
      quantity: "1",
      unitPrice: "0",
      discountPercent: "0",
      hsnSacCode: "",
      isSubItem: false,
      parentItemIndex: null,
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
        const { parentItemIndex, ...rest } = item;
        return {
          ...rest,
          isSubItem: item.isSubItem || false,
          parentItemId: null,
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
        currency: data.currency || "USD",
        discountPercent: data.discountPercent || "0",
        taxPercent: data.taxPercent || "0",
        validUntil: "",
        paymentTerms: data.paymentTerms || "",
        deliveryTerms: data.deliveryTerms || "",
        notes: data.notes || "",
        termsAndConditions: data.termsAndConditions || "",
        items: (data.items || []).map((item: any, idx: number) => ({
          productId: item.productId,
          productCode: item.productCode || "",
          description: item.description || "",
          unit: item.unit || "",
          quantity: item.quantity || "0",
          unitPrice: item.unitPrice || "0",
          discountPercent: item.discountPercent || "0",
          hsnSacCode: item.hsnSacCode || "",
          isSubItem: item.isSubItem || false,
          parentItemIndex: item.isSubItem ? (() => {
            for (let pi = idx - 1; pi >= 0; pi--) {
              if (!(data.items[pi]?.isSubItem)) return pi;
            }
            return null;
          })() : null,
        })),
      });
      setIsFormOpen(true);
    } catch (error) {
      toast({ title: "Error", description: "Failed to duplicate offer", variant: "destructive" });
    }
  };

  const offersContent = (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div />
        <Button onClick={handleNewOffer}>
          <Plus className="mr-2 h-4 w-4" /> New Offer
        </Button>
      </div>

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
                    <TableHead>Offer #</TableHead>
                    <TableHead>Customer</TableHead>
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
                    <TableRow key={offer.id}>
                      <TableCell className="font-mono font-medium">{offer.offerNumber}</TableCell>
                      <TableCell>{offer.customerName}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{offer.subject}</TableCell>
                      <TableCell>{offer.createdAt ? new Date(offer.createdAt).toLocaleDateString() : "-"}</TableCell>
                      <TableCell>{offer.validUntil ? new Date(offer.validUntil).toLocaleDateString() : "-"}</TableCell>
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
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditOffer(offer)} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDuplicate(offer)} title="Duplicate">
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
                          {offer.status === "Draft" && (
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                              onClick={() => { if (confirm(`Delete offer ${offer.offerNumber}?`)) deleteMutation.mutate(offer.id); }}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
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
              </DialogTitle>
            </DialogHeader>
            {viewingOffer && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><Label className="text-muted-foreground">Customer</Label><p className="font-medium">{viewingOffer.customerName}</p></div>
                  <div><Label className="text-muted-foreground">Contact Person</Label><p>{viewingOffer.contactPerson || "-"}</p></div>
                  <div><Label className="text-muted-foreground">Email</Label><p>{viewingOffer.customerEmail || "-"}</p></div>
                  <div><Label className="text-muted-foreground">Valid Until</Label><p>{viewingOffer.validUntil ? new Date(viewingOffer.validUntil).toLocaleDateString() : "-"}</p></div>
                  <div className="col-span-2"><Label className="text-muted-foreground">Subject</Label><p className="font-medium">{viewingOffer.subject}</p></div>
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

        {/* CREATE/EDIT OFFER DIALOG */}
        <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) resetAndClose(); }}>
          <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingOffer ? `Edit Offer ${editingOffer.offerNumber}` : "Create New Offer"}</DialogTitle>
              <DialogDescription>
                {editingOffer ? "Update the offer details and line items" : "Fill in customer details and add products to create an offer"}
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Customer Section */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Customer Details</h3>

                  <div className="space-y-4">
                    <div>
                      <Label>Select Customer</Label>
                      <Select onValueChange={handleSelectCustomer}>
                        <SelectTrigger>
                          <SelectValue placeholder="Search and select customer..." />
                        </SelectTrigger>
                        <SelectContent>
                          {customers.map((c: any) => (
                            <SelectItem key={c.id} value={c.id.toString()}>
                              {c.bpCode} - {c.bpName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <FormField control={form.control} name="customerName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer Name <span className="text-destructive">*</span></FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField control={form.control} name="contactPerson" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Person</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="customerEmail" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl><Input {...field} type="email" /></FormControl>
                        </FormItem>
                      )} />
                    </div>

                    <FormField control={form.control} name="customerAddress" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl><Textarea {...field} rows={2} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </div>

                {/* Offer Details */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Offer Details</h3>
                  <FormField control={form.control} name="subject" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subject <span className="text-destructive">*</span></FormLabel>
                      <FormControl><Input {...field} placeholder="e.g. Quotation for Used Oil Refinery Equipment" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <FormField control={form.control} name="currency" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency <span className="text-destructive">*</span></FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
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
                        <FormLabel>Valid Until</FormLabel>
                        <FormControl><Input {...field} type="date" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="paymentTerms" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Terms</FormLabel>
                        <FormControl><Input {...field} placeholder="e.g. Net 30 days" /></FormControl>
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="deliveryTerms" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delivery Terms</FormLabel>
                      <FormControl><Input {...field} placeholder="e.g. FOB, CIF, Ex-Works" /></FormControl>
                    </FormItem>
                  )} />
                </div>

                {/* Line Items */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Line Items</h3>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => { setProductPickerSearch(""); setIsProductPickerOpen(true); }}>
                        <Package className="mr-1 h-3 w-3" /> Add from Products
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={handleAddBlankItem}>
                        <Plus className="mr-1 h-3 w-3" /> Custom Item
                      </Button>
                    </div>
                  </div>

                  {fields.length === 0 ? (
                    <div className="border rounded-md p-6 text-center text-muted-foreground">
                      <p>No items added yet. Select a product from the dropdown or add a custom item.</p>
                    </div>
                  ) : (
                    <div className="border rounded-md overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[40px]">#</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="w-[80px]">Unit</TableHead>
                            <TableHead className="w-[80px]">Qty</TableHead>
                            <TableHead className="w-[100px]">Unit Price</TableHead>
                            <TableHead className="w-[70px]">Disc %</TableHead>
                            <TableHead className="w-[100px] text-right">Line Total</TableHead>
                            <TableHead className="w-[40px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {fields.map((field, index) => {
                            const item = watchItems?.[index];
                            const isSubItem = item?.isSubItem || false;
                            const qty = parseFloat(item?.quantity || "0");
                            const price = parseFloat(item?.unitPrice || "0");
                            const disc = parseFloat(item?.discountPercent || "0");
                            const lineTotal = qty * price * (1 - disc / 100);
                            const hasChildren = !isSubItem && (watchItems || []).some(wi => wi.isSubItem && wi.parentItemIndex === index);
                            return (
                              <TableRow key={field.id} className={isSubItem ? "bg-muted/30" : ""}>
                                <TableCell className="text-muted-foreground">
                                  {isSubItem ? (
                                    <span className="text-muted-foreground ml-2">└</span>
                                  ) : (
                                    index + 1 - (watchItems || []).slice(0, index).filter(wi => wi.isSubItem).length
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Input
                                    value={item?.description || ""}
                                    onChange={(e) => form.setValue(`items.${index}.description`, e.target.value, { shouldDirty: true })}
                                    className={`h-8 text-sm ${isSubItem ? "pl-6" : ""}`}
                                    placeholder="Item description"
                                  />
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {item?.productCode && (
                                      <span className="text-xs text-muted-foreground font-mono">{item.productCode}</span>
                                    )}
                                    {hasChildren && (
                                      <Badge variant="outline" className="text-xs h-4 gap-1">
                                        <GitBranch className="h-2.5 w-2.5" /> breakdown
                                      </Badge>
                                    )}
                                    {isSubItem && (
                                      <Badge variant="secondary" className="text-xs h-4">sub-item</Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <select
                                    {...form.register(`items.${index}.unit`)}
                                    className="h-8 w-full text-sm border rounded px-1"
                                  >
                                    {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                                  </select>
                                </TableCell>
                                <TableCell>
                                  <Input
                                    value={item?.quantity || ""}
                                    onChange={(e) => form.setValue(`items.${index}.quantity`, e.target.value, { shouldDirty: true })}
                                    className="h-8 text-sm text-right" type="number" step="0.001"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    value={item?.unitPrice || ""}
                                    onChange={(e) => form.setValue(`items.${index}.unitPrice`, e.target.value, { shouldDirty: true })}
                                    className="h-8 text-sm text-right" type="number" step="0.01"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    value={item?.discountPercent || ""}
                                    onChange={(e) => form.setValue(`items.${index}.discountPercent`, e.target.value, { shouldDirty: true })}
                                    className="h-8 text-sm text-right" type="number" step="0.01"
                                  />
                                </TableCell>
                                <TableCell className={`text-right font-medium text-sm ${isSubItem ? "text-muted-foreground" : ""}`}>
                                  {lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell>
                                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemoveItem(index)}>
                                    {isSubItem ? <X className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  {form.formState.errors.items?.message && (
                    <p className="text-sm text-destructive">{form.formState.errors.items.message}</p>
                  )}
                </div>

                {/* Totals */}
                {fields.length > 0 && (
                  <div className="flex justify-end">
                    <div className="w-72 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal:</span>
                        <span className="font-medium">{form.watch("currency")} {calculations.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground whitespace-nowrap">Discount %:</span>
                        <Input {...form.register("discountPercent")} className="h-8 w-20 text-right text-sm" type="number" step="0.01" />
                        <span className="text-sm text-red-600">-{calculations.discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground whitespace-nowrap">Tax %:</span>
                        <Input {...form.register("taxPercent")} className="h-8 w-20 text-right text-sm" type="number" step="0.01" />
                        <span className="text-sm">+{calculations.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between font-bold border-t pt-2">
                        <span>Total:</span>
                        <span>{form.watch("currency")} {calculations.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Notes & Terms */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Notes & Terms</h3>
                  <FormField control={form.control} name="notes" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl><Textarea {...field} rows={2} placeholder="Internal notes or special instructions" /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="termsAndConditions" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Terms & Conditions</FormLabel>
                      <FormControl><Textarea {...field} rows={3} placeholder="Standard terms and conditions" /></FormControl>
                    </FormItem>
                  )} />
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={resetAndClose}>Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editingOffer ? "Update Offer" : "Create Offer"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Dialog open={isProductPickerOpen} onOpenChange={(open) => { if (!open) { setIsProductPickerOpen(false); setProductPickerSearch(""); } }}>
          <DialogContent className="max-w-4xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Select Product</DialogTitle>
              <DialogDescription>Search and select a product to add as a line item</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter by product code or description..."
                  value={productPickerSearch}
                  onChange={(e) => setProductPickerSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-[400px] overflow-y-auto border rounded-md">
                {(() => {
                  const activeProducts = products
                    .filter(p => p.isActive)
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
                  if (activeProducts.length === 0) {
                    return (
                      <div className="p-6 text-center text-muted-foreground">
                        <p>No matching products found</p>
                      </div>
                    );
                  }
                  return activeProducts.map(p => {
                    const children = childProductsMap.get(p.id) || [];
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between p-3 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer"
                        onClick={() => { handleAddProduct(p); setIsProductPickerOpen(false); setProductPickerSearch(""); }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium text-sm">{p.productCode}</span>
                            {children.length > 0 && <Badge variant="outline" className="text-xs">{children.length} sub</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">{p.description}</p>
                        </div>
                        <div className="text-right ml-3">
                          <p className="text-sm font-medium">{p.currency || "USD"} {parseFloat(p.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
  );

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
        {offersContent}
      </div>
    </Layout>
  );
}