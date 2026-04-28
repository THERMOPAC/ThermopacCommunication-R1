import { useState, useMemo, useEffect, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, MoreHorizontal, Search, Settings, Package,
  Loader2, X, Filter, ChevronRight, ChevronDown, GitBranch, ArrowUp, ArrowDown
} from "lucide-react";
import { queryClient, apiRequest, getErrorMessage } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { Product, ProductAttributeOption } from "@shared/schema";

const unitOptions = ["pcs", "kg", "m", "ltr", "hours", "set", "lot", "nos"] as const;

const productFormSchema = z.object({
  itemFamily: z.string().min(1, "Item Family is required"),
  itemFamilyLabel: z.string(),
  itemProperty1: z.string().min(1, "Property 1 is required"),
  itemProperty1Label: z.string(),
  itemProperty2: z.string().min(1, "Property 2 is required"),
  itemProperty2Label: z.string(),
  itemProperty3: z.string().min(1, "Property 3 is required").regex(/^\d+(\s?[A-Za-z0-9/ ]+)?$/, "Must start with digits, optionally followed by text (e.g. 5 TON, 1000, 2000 LPH, 1000000 KCAL/H)"),
  description: z.string().optional(),
  unit: z.string().min(1, "Unit is required"),
  unitPrice: z.string().min(1, "Unit Price is required").regex(/^\d+(\.\d{1,2})?$/, "Enter a valid price (e.g. 100.00)"),
  currency: z.string().min(1, "Currency is required"),
  category: z.string().min(1, "Product Category is required"),
  hsnSacCode: z.string().min(1, "HSN/SAC Code is required"),
  makeOrBuy: z.string().default('Make'),
  preferredVendor: z.string().optional(),
  isActive: z.boolean().default(true),
  tagNo: z.string().min(1, "Tag No is required"),
  equipmentConfiguration: z.string().default('Vessel'),
});

type ProductFormValues = z.infer<typeof productFormSchema>;

const attributeFormSchema = z.object({
  attributeType: z.string().min(1),
  code: z.string().length(3, "Code must be exactly 3 characters"),
  label: z.string().min(1, "Label is required"),
  parentId: z.number().nullable().optional(),
}).refine((data) => {
  if (data.attributeType === "property_1" || data.attributeType === "property_2") {
    return data.parentId != null;
  }
  return true;
}, {
  message: "Parent selection is required",
  path: ["parentId"],
});

type AttributeFormValues = z.infer<typeof attributeFormSchema>;

export default function ProductsPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [codeFilter, setCodeFilter] = useState("");
  const [descriptionFilter, setDescriptionFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [familyFilter, setFamilyFilter] = useState<string>("all");
  const [prop1Filter, setProp1Filter] = useState<string>("all");
  const [prop2Filter, setProp2Filter] = useState<string>("all");
  const [prop3Filter, setProp3Filter] = useState<string>("all");
  const [hierarchyFilter, setHierarchyFilter] = useState<string>("all");
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [isAttributeDialogOpen, setIsAttributeDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingAttribute, setEditingAttribute] = useState<ProductAttributeOption | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [activeAttributeTab, setActiveAttributeTab] = useState("item_family");
  const [attrFamilyFilter, setAttrFamilyFilter] = useState<string>("all");
  const [tableFamilyFilter, setTableFamilyFilter] = useState<string>("all");
  const [tableProp1Filter, setTableProp1Filter] = useState<string>("all");
  const [expandedProducts, setExpandedProducts] = useState<Set<number>>(new Set());
  const [isSubProductPickerOpen, setIsSubProductPickerOpen] = useState(false);
  const [linkingParentProduct, setLinkingParentProduct] = useState<Product | null>(null);
  const [subProductSearch, setSubProductSearch] = useState("");
  const [subProductProp3Filter, setSubProductProp3Filter] = useState<string>("all");
  const [recentlyLinkedIds, setRecentlyLinkedIds] = useState<Set<number>>(new Set());

  const { data: products = [], isLoading: isLoadingProducts } = useQuery<Product[]>({
    queryKey: ['/api/sales-marketing/products'],
  });

  const { data: attributeOptions = [], isLoading: isLoadingAttributes } = useQuery<ProductAttributeOption[]>({
    queryKey: ['/api/sales-marketing/product-attributes'],
  });

  const { data: productChildLinks = [] } = useQuery<any[]>({
    queryKey: ['/api/sales-marketing/product-children'],
  });

  const { data: sapVendors = [] } = useQuery<{code: string; name: string}[]>({
    queryKey: ['/api/sap/vendors'],
  });

  const familyOptions = useMemo(() =>
    attributeOptions.filter((o) => o.attributeType === "item_family" && o.isActive),
    [attributeOptions]
  );
  const allProperty1Options = useMemo(() =>
    attributeOptions.filter((o) => o.attributeType === "property_1" && o.isActive),
    [attributeOptions]
  );
  const allProperty2Options = useMemo(() =>
    attributeOptions.filter((o) => o.attributeType === "property_2" && o.isActive),
    [attributeOptions]
  );

  const categories = ["Finish Goods", "Bought-Out Items", "Raw Materials", "Consumables"];

  const childProductsMap = useMemo(() => {
    const map = new Map<number, Array<Product & { quantity: number; sortOrder: number }>>();
    productChildLinks.forEach((link: any) => {
      const child = products.find(p => p.id === link.childProductId);
      if (child) {
        if (!map.has(link.parentProductId)) map.set(link.parentProductId, []);
        map.get(link.parentProductId)!.push({ ...child, quantity: link.quantity || 1, sortOrder: link.sortOrder ?? 0 });
      }
    });
    map.forEach((children) => children.sort((a, b) => a.sortOrder - b.sortOrder));
    return map;
  }, [products, productChildLinks]);

  const childProductIdSet = useMemo(() => {
    const ids = new Set<number>();
    productChildLinks.forEach((link: any) => ids.add(link.childProductId));
    return ids;
  }, [productChildLinks]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const children = childProductsMap.get(p.id) || [];
      const isParent = children.length > 0;
      const isChild = childProductIdSet.has(p.id);
      const matchesHierarchy = hierarchyFilter === "all" ||
        (hierarchyFilter === "parent" && isParent) ||
        (hierarchyFilter === "child" && isChild);
      const matchesSearch = !searchQuery ||
        p.productCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        children.some(c => c.productCode.toLowerCase().includes(searchQuery.toLowerCase()) || c.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCode = !codeFilter || p.productCode.toLowerCase().includes(codeFilter.toLowerCase());
      const matchesDescription = !descriptionFilter || p.description.toLowerCase().includes(descriptionFilter.toLowerCase());
      const matchesCategory = categoryFilter === "all" || p.category === categoryFilter;
      const matchesStatus = statusFilter === "all" ||
        (statusFilter === "active" && p.isActive) ||
        (statusFilter === "inactive" && !p.isActive);
      const matchesFamily = familyFilter === "all" || p.itemFamily === familyFilter;
      const matchesProp1 = prop1Filter === "all" || p.itemProperty1 === prop1Filter;
      const matchesProp2 = prop2Filter === "all" || p.itemProperty2 === prop2Filter;
      const matchesProp3 = prop3Filter === "all" || p.itemProperty3 === prop3Filter;
      return matchesHierarchy && matchesSearch && matchesCode && matchesDescription && matchesCategory && matchesStatus && matchesFamily && matchesProp1 && matchesProp2 && matchesProp3;
    }).sort((a, b) => {
      const familyCompare = a.itemFamily.localeCompare(b.itemFamily);
      if (familyCompare !== 0) return familyCompare;
      const prop1Compare = a.itemProperty1.localeCompare(b.itemProperty1);
      if (prop1Compare !== 0) return prop1Compare;
      const prop2Compare = a.itemProperty2.localeCompare(b.itemProperty2);
      if (prop2Compare !== 0) return prop2Compare;
      return a.itemProperty3.localeCompare(b.itemProperty3);
    });
  }, [products, childProductsMap, childProductIdSet, hierarchyFilter, searchQuery, codeFilter, descriptionFilter, categoryFilter, statusFilter, familyFilter, prop1Filter, prop2Filter, prop3Filter]);

  const toggleExpand = (productId: number) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const productForm = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      itemFamily: "", itemFamilyLabel: "",
      itemProperty1: "", itemProperty1Label: "",
      itemProperty2: "", itemProperty2Label: "",
      itemProperty3: "", description: "",
      unit: "", unitPrice: "", currency: "USD", category: "Finish Goods", hsnSacCode: "",
      makeOrBuy: "Make", preferredVendor: "", isActive: true, tagNo: "",
      equipmentConfiguration: "Vessel",
    },
  });

  const attributeForm = useForm<AttributeFormValues>({
    resolver: zodResolver(attributeFormSchema),
    defaultValues: {
      attributeType: "item_family", code: "", label: "", parentId: null,
    },
  });

  const watchFamily = productForm.watch("itemFamily");
  const watchProp1 = productForm.watch("itemProperty1");
  const watchProp2 = productForm.watch("itemProperty2");
  const watchProp3 = productForm.watch("itemProperty3");
  const watchFamilyLabel = productForm.watch("itemFamilyLabel");
  const watchProp1Label = productForm.watch("itemProperty1Label");
  const watchProp2Label = productForm.watch("itemProperty2Label");

  const selectedFamilyId = useMemo(() => {
    const family = familyOptions.find((o) => o.code === watchFamily);
    return family?.id ?? null;
  }, [familyOptions, watchFamily]);

  const selectedProp1Id = useMemo(() => {
    const prop1 = allProperty1Options.find((o) => o.code === watchProp1 && o.parentId === selectedFamilyId);
    return prop1?.id ?? null;
  }, [allProperty1Options, watchProp1, selectedFamilyId]);

  const property1Options = useMemo(() =>
    selectedFamilyId ? allProperty1Options.filter((o) => o.parentId === selectedFamilyId) : allProperty1Options,
    [allProperty1Options, selectedFamilyId]
  );
  const property2Options = useMemo(() =>
    selectedProp1Id ? allProperty2Options.filter((o) => o.parentId === selectedProp1Id) : [],
    [allProperty2Options, selectedProp1Id]
  );

  const liveProductCode = useMemo(() => {
    if (watchFamily && watchProp1 && watchProp2 && watchProp3) {
      return `${watchFamily}-${watchProp1}-${watchProp2}-${watchProp3}`;
    }
    return "";
  }, [watchFamily, watchProp1, watchProp2, watchProp3]);

  const liveDescription = useMemo(() => {
    const parts = [watchFamilyLabel, watchProp1Label, watchProp2Label, watchProp3].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "";
  }, [watchFamilyLabel, watchProp1Label, watchProp2Label, watchProp3]);

  const createProductMutation = useMutation({
    mutationFn: async (data: ProductFormValues) => {
      const payload = {
        ...data,
        productCode: `${data.itemFamily}-${data.itemProperty1}-${data.itemProperty2}-${data.itemProperty3}`,
        description: data.description || `${data.itemFamilyLabel} ${data.itemProperty1Label} ${data.itemProperty2Label} ${data.itemProperty3}`,
        unitPrice: data.unitPrice,
        category: data.category || null,
        hsnSacCode: data.hsnSacCode || null,
        makeOrBuy: data.makeOrBuy || 'Make',
        preferredVendor: data.preferredVendor || null,
        tagNo: data.tagNo || null,
      };
      return apiRequest('POST', '/api/sales-marketing/products', payload);
    },
    onSuccess: () => {
      toast({ title: "Product created", description: "Product has been created successfully" });
      setIsProductDialogOpen(false);
      setEditingProduct(null);
      productForm.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/products'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to create product", variant: "destructive" });
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ProductFormValues }) => {
      const payload = {
        ...data,
        productCode: `${data.itemFamily}-${data.itemProperty1}-${data.itemProperty2}-${data.itemProperty3}`,
        description: data.description || `${data.itemFamilyLabel} ${data.itemProperty1Label} ${data.itemProperty2Label} ${data.itemProperty3}`,
        unitPrice: data.unitPrice,
        category: data.category || null,
        hsnSacCode: data.hsnSacCode || null,
        makeOrBuy: data.makeOrBuy || 'Make',
        preferredVendor: data.preferredVendor || null,
        tagNo: data.tagNo || null,
      };
      return apiRequest('PATCH', `/api/sales-marketing/products/${id}`, payload);
    },
    onSuccess: () => {
      toast({ title: "Product updated", description: "Product has been updated successfully" });
      setIsProductDialogOpen(false);
      setEditingProduct(null);
      productForm.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/products'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to update product", variant: "destructive" });
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/sales-marketing/products/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Product deleted", description: "Product has been deleted successfully" });
      setDeleteConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/products'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to delete product", variant: "destructive" });
    },
  });

  const createAttributeMutation = useMutation({
    mutationFn: async (data: AttributeFormValues) => {
      return apiRequest('POST', '/api/sales-marketing/product-attributes', data);
    },
    onSuccess: () => {
      toast({ title: "Attribute created", description: "Attribute option has been created" });
      attributeForm.reset({ attributeType: activeAttributeTab, code: "", label: "", parentId: null });
      setEditingAttribute(null);
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/product-attributes'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to create attribute", variant: "destructive" });
    },
  });

  const updateAttributeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<AttributeFormValues> }) => {
      return apiRequest('PATCH', `/api/sales-marketing/product-attributes/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Attribute updated", description: "Attribute option has been updated" });
      setEditingAttribute(null);
      attributeForm.reset({ attributeType: activeAttributeTab, code: "", label: "", parentId: null });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/product-attributes'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to update attribute", variant: "destructive" });
    },
  });

  const deleteAttributeMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/sales-marketing/product-attributes/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Attribute deleted", description: "Attribute option has been deleted" });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/product-attributes'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to delete attribute", variant: "destructive" });
    },
  });

  const addChildMutation = useMutation({
    mutationFn: async ({ parentId, childProductId, quantity }: { parentId: number; childProductId: number; quantity?: number }) => {
      return apiRequest('POST', `/api/sales-marketing/products/${parentId}/children`, { childProductId, quantity: quantity || 1 });
    },
    onSuccess: (_data, variables) => {
      toast({ title: "Sub-product linked", description: "Sub-product has been added successfully" });
      setRecentlyLinkedIds(prev => new Set(prev).add(variables.childProductId));
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/product-children'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/products'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to link sub-product", variant: "destructive" });
    },
  });

  const updateChildQuantityMutation = useMutation({
    mutationFn: async ({ parentId, childId, quantity }: { parentId: number; childId: number; quantity: number }) => {
      return apiRequest('PATCH', `/api/sales-marketing/products/${parentId}/children/${childId}`, { quantity });
    },
    onSuccess: () => {
      toast({ title: "Quantity updated" });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/product-children'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/products'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to update quantity", variant: "destructive" });
    },
  });

  const removeChildMutation = useMutation({
    mutationFn: async ({ parentId, childId }: { parentId: number; childId: number }) => {
      return apiRequest('DELETE', `/api/sales-marketing/products/${parentId}/children/${childId}`);
    },
    onSuccess: () => {
      toast({ title: "Sub-product removed" });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/product-children'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/products'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to remove sub-product", variant: "destructive" });
    },
  });

  const reorderChildrenMutation = useMutation({
    mutationFn: async ({ parentId, childIds }: { parentId: number; childIds: number[] }) => {
      return apiRequest('PATCH', `/api/sales-marketing/products/${parentId}/children/reorder`, { childIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sales-marketing/product-children'] });
    },
  });

  const moveChild = (parentId: number, childId: number, direction: 'up' | 'down') => {
    const children = childProductsMap.get(parentId) || [];
    const idx = children.findIndex(c => c.id === childId);
    if (idx < 0) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === children.length - 1) return;
    const newOrder = children.map(c => c.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    reorderChildrenMutation.mutate({ parentId, childIds: newOrder });
  };

  const handleOpenCreateProduct = () => {
    setEditingProduct(null);
    productForm.reset({
      itemFamily: "", itemFamilyLabel: "",
      itemProperty1: "", itemProperty1Label: "",
      itemProperty2: "", itemProperty2Label: "",
      itemProperty3: "", description: "",
      unit: "", unitPrice: "", currency: "USD", category: "Finish Goods", hsnSacCode: "",
      makeOrBuy: "Make", preferredVendor: "", isActive: true,
      tagNo: "", equipmentConfiguration: "Vessel",
    });
    setIsProductDialogOpen(true);
  };

  const handleOpenAddSubProduct = (parent: Product) => {
    setLinkingParentProduct(parent);
    setSubProductSearch("");
    setIsSubProductPickerOpen(true);
    setExpandedProducts((prev) => new Set([...prev, parent.id]));
  };

  const handleOpenEditProduct = (product: Product) => {
    setEditingProduct(product);
    const hasChildren = (childProductsMap.get(product.id) || []).length > 0;
    productForm.reset({
      itemFamily: product.itemFamily,
      itemFamilyLabel: product.itemFamilyLabel,
      itemProperty1: product.itemProperty1,
      itemProperty1Label: product.itemProperty1Label,
      itemProperty2: product.itemProperty2,
      itemProperty2Label: product.itemProperty2Label,
      itemProperty3: product.itemProperty3,
      description: product.description,
      unit: product.unit,
      unitPrice: hasChildren ? parseFloat(product.unitPrice).toFixed(2) : product.unitPrice,
      currency: product.currency || "USD",
      category: product.category || "Finish Goods",
      hsnSacCode: product.hsnSacCode || "",
      makeOrBuy: (product as any).makeOrBuy || "Make",
      preferredVendor: (product as any).preferredVendor || "",
      isActive: product.isActive ?? true,
      tagNo: (product as any).tagNo || "",
      equipmentConfiguration: (product as any).equipmentConfiguration || "Vessel",
    });
    setIsProductDialogOpen(true);
  };

  const onProductSubmit = (data: ProductFormValues) => {
    if (editingProduct) {
      updateProductMutation.mutate({ id: editingProduct.id, data });
    } else {
      createProductMutation.mutate(data);
    }
  };

  const handleOpenCreateAttribute = () => {
    setEditingAttribute(null);
    attributeForm.reset({ attributeType: activeAttributeTab, code: "", label: "", sortOrder: 0, isActive: true });
    setAttrFamilyFilter("all");
    setIsAttributeDialogOpen(true);
  };

  const handleOpenEditAttribute = (attr: ProductAttributeOption) => {
    setEditingAttribute(attr);
    attributeForm.reset({
      attributeType: attr.attributeType,
      code: attr.code,
      label: attr.label,
      parentId: attr.parentId ?? null,
    });
    setIsAttributeDialogOpen(true);
  };

  const onAttributeSubmit = (data: AttributeFormValues) => {
    if (editingAttribute) {
      updateAttributeMutation.mutate({ id: editingAttribute.id, data });
    } else {
      createAttributeMutation.mutate(data);
    }
  };

  const handleSelectFamily = (code: string) => {
    const opt = familyOptions.find((o) => o.code === code);
    if (opt) {
      productForm.setValue("itemFamily", opt.code);
      productForm.setValue("itemFamilyLabel", opt.label);
      productForm.setValue("itemProperty1", "");
      productForm.setValue("itemProperty1Label", "");
      productForm.setValue("itemProperty2", "");
      productForm.setValue("itemProperty2Label", "");
      productForm.setValue("itemProperty3", "");
      productForm.setValue("description", "");
    }
  };

  const handleSelectProp1 = (code: string) => {
    const opt = property1Options.find((o) => o.code === code);
    if (opt) {
      productForm.setValue("itemProperty1", opt.code);
      productForm.setValue("itemProperty1Label", opt.label);
      productForm.setValue("itemProperty2", "");
      productForm.setValue("itemProperty2Label", "");
      productForm.setValue("itemProperty3", "");
      productForm.setValue("description", "");
    }
  };

  const handleSelectProp2 = (code: string) => {
    const opt = property2Options.find((o) => o.code === code);
    if (opt) {
      productForm.setValue("itemProperty2", opt.code);
      productForm.setValue("itemProperty2Label", opt.label);
      productForm.setValue("description", "");
    }
  };

  const currentAttributeOptions = useMemo(() => {
    let filtered = attributeOptions.filter((o) => o.attributeType === activeAttributeTab);
    if (activeAttributeTab === "property_1" && tableFamilyFilter !== "all") {
      filtered = filtered.filter((o) => o.parentId?.toString() === tableFamilyFilter);
    }
    if (activeAttributeTab === "property_2") {
      if (tableFamilyFilter !== "all") {
        const prop1IdsForFamily = allProperty1Options
          .filter((p) => p.parentId?.toString() === tableFamilyFilter)
          .map((p) => p.id);
        filtered = filtered.filter((o) => o.parentId && prop1IdsForFamily.includes(o.parentId));
      }
      if (tableProp1Filter !== "all") {
        filtered = filtered.filter((o) => o.parentId?.toString() === tableProp1Filter);
      }
    }
    return filtered;
  }, [attributeOptions, activeAttributeTab, tableFamilyFilter, tableProp1Filter, allProperty1Options]);

  const attributeTypeLabels: Record<string, string> = {
    item_family: "Item Family",
    property_1: "Property 1",
    property_2: "Property 2",
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6">
        <Tabs defaultValue="products">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <Package className="h-6 w-6" /> Product Database
              </h1>
              <p className="text-muted-foreground">Manage your product catalog and item attributes</p>
            </div>
            <TabsList>
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="attributes">Manage Attributes</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="products" className="space-y-4">
            <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
              {(["all", "parent", "child"] as const).map((val) => (
                <button
                  key={val}
                  onClick={() => setHierarchyFilter(val)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                    hierarchyFilter === val
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {val === "all" ? "All" : val === "parent" ? "Parent" : "Child"}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
                <div className="flex flex-1 gap-2 flex-wrap items-center">
                  <div className="relative min-w-[180px] max-w-[220px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Product Code..."
                      value={codeFilter}
                      onChange={(e) => setCodeFilter(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Description..."
                      value={descriptionFilter}
                      onChange={(e) => setDescriptionFilter(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-[160px]">
                      <Filter className="h-4 w-4 mr-1" />
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleOpenCreateProduct}>
                  <Plus className="mr-2 h-4 w-4" /> Add Product
                </Button>
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                <Select value={familyFilter} onValueChange={(val) => { setFamilyFilter(val); setProp1Filter("all"); setProp2Filter("all"); setProp3Filter("all"); }}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Item Family" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Families</SelectItem>
                    {familyOptions.sort((a, b) => a.label.localeCompare(b.label)).map((opt) => (
                      <SelectItem key={opt.id} value={opt.code}>{opt.code} - {opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={prop1Filter} onValueChange={(val) => { setProp1Filter(val); setProp2Filter("all"); setProp3Filter("all"); }}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Property 1" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Property 1</SelectItem>
                    {allProperty1Options
                      .filter((o) => familyFilter === "all" || familyOptions.find(f => f.code === familyFilter)?.id === o.parentId)
                      .sort((a, b) => a.label.localeCompare(b.label))
                      .map((opt) => (
                        <SelectItem key={opt.id} value={opt.code}>{opt.code} - {opt.label}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Select value={prop2Filter} onValueChange={(val) => { setProp2Filter(val); setProp3Filter("all"); }}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Property 2" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Property 2</SelectItem>
                    {allProperty2Options
                      .filter((o) => {
                        if (prop1Filter !== "all") return allProperty1Options.find(p => p.code === prop1Filter)?.id === o.parentId;
                        if (familyFilter !== "all") {
                          const familyId = familyOptions.find(f => f.code === familyFilter)?.id;
                          const prop1Ids = allProperty1Options.filter(p => p.parentId === familyId).map(p => p.id);
                          return o.parentId && prop1Ids.includes(o.parentId);
                        }
                        return true;
                      })
                      .sort((a, b) => a.label.localeCompare(b.label))
                      .map((opt) => (
                        <SelectItem key={opt.id} value={opt.code}>{opt.code} - {opt.label}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Select value={prop3Filter} onValueChange={setProp3Filter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Property 3" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Property 3</SelectItem>
                    {[...new Set(products
                      .filter((p) => {
                        if (familyFilter !== "all" && p.itemFamily !== familyFilter) return false;
                        if (prop1Filter !== "all" && p.itemProperty1 !== prop1Filter) return false;
                        if (prop2Filter !== "all" && p.itemProperty2 !== prop2Filter) return false;
                        return true;
                      })
                      .map(p => p.itemProperty3))]
                      .sort((a, b) => a.localeCompare(b))
                      .map((val) => (
                        <SelectItem key={val} value={val}>{val}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                {isLoadingProducts ? (
                  <div className="p-6 space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg font-medium">No products found</p>
                    <p className="text-sm">
                      {codeFilter || descriptionFilter || categoryFilter !== "all" || statusFilter !== "all" || familyFilter !== "all" || prop1Filter !== "all" || prop2Filter !== "all" || prop3Filter !== "all" || hierarchyFilter !== "all"
                        ? "Try adjusting your search or filters"
                        : "Get started by adding your first product"}
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]"></TableHead>
                        <TableHead>Product Code</TableHead>
                        <TableHead>Tag No</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Make/Buy</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-center w-[70px]">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead>HSN/SAC</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProducts.map((product) => {
                        const children = childProductsMap.get(product.id) || [];
                        const hasChildren = children.length > 0;
                        const isExpanded = expandedProducts.has(product.id);
                        return (
                          <Fragment key={product.id}>
                            <TableRow className="group">
                              <TableCell className="w-[40px] px-2">
                                {hasChildren ? (
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleExpand(product.id)}>
                                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                  </Button>
                                ) : (
                                  <span className="w-6 h-6 inline-block" />
                                )}
                              </TableCell>
                              <TableCell className="font-mono font-medium">
                                {product.productCode}
                                {hasChildren && (
                                  <Badge variant="outline" className="ml-2 text-xs">{children.length} sub</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {(product as any).tagNo
                                  ? <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{(product as any).tagNo}</span>
                                  : <span className="text-muted-foreground text-xs">—</span>}
                              </TableCell>
                              <TableCell>{product.description}</TableCell>
                              <TableCell>{product.category || "-"}</TableCell>
                              <TableCell>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${(product as any).makeOrBuy === 'Buy' ? 'bg-blue-100 text-blue-700' : (product as any).makeOrBuy === 'Service' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                                  {(product as any).makeOrBuy || 'Make'}
                                </span>
                              </TableCell>
                              <TableCell>{product.unit}</TableCell>
                              <TableCell className="text-center text-muted-foreground">—</TableCell>
                              <TableCell className="text-right">{product.currency || "USD"} {parseFloat(product.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                              <TableCell>{product.hsnSacCode || "-"}</TableCell>
                              <TableCell>
                                <Badge variant={product.isActive ? "default" : "secondary"}>
                                  {product.isActive ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleOpenEditProduct(product)}>
                                      <Pencil className="mr-2 h-4 w-4" /> Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleOpenAddSubProduct(product)}>
                                      <GitBranch className="mr-2 h-4 w-4" /> Add Sub-Product
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-destructive"
                                      onClick={() => setDeleteConfirmId(product.id)}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                            {isExpanded && children.map((child) => (
                              <TableRow key={child.id} className="bg-muted/30">
                                <TableCell className="w-[40px] px-2" />
                                <TableCell className="font-mono text-sm pl-8">
                                  <span className="text-muted-foreground mr-1">└</span>
                                  {child.productCode}
                                </TableCell>
                                <TableCell className="text-sm">{child.description}</TableCell>
                                <TableCell className="text-sm">{child.category || "-"}</TableCell>
                                <TableCell className="text-sm">{child.unit}</TableCell>
                                <TableCell className="text-center">
                                  <Input
                                    type="number"
                                    min={1}
                                    className="w-[60px] h-7 text-center text-sm mx-auto"
                                    defaultValue={child.quantity}
                                    onBlur={(e) => {
                                      const newQty = parseInt(e.target.value);
                                      if (newQty && newQty > 0 && newQty !== child.quantity) {
                                        updateChildQuantityMutation.mutate({ parentId: product.id, childId: child.id, quantity: newQty });
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="text-right text-sm text-muted-foreground">
                                  {child.currency || "USD"} {(parseFloat(child.unitPrice) * child.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="text-sm">{child.hsnSacCode || "-"}</TableCell>
                                <TableCell>
                                  <Badge variant={child.isActive ? "default" : "secondary"} className="text-xs">
                                    {child.isActive ? "Active" : "Inactive"}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-0.5">
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveChild(product.id, child.id, 'up')} disabled={children.indexOf(child) === 0}>
                                      <ArrowUp className="h-3 w-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveChild(product.id, child.id, 'down')} disabled={children.indexOf(child) === children.length - 1}>
                                      <ArrowDown className="h-3 w-3" />
                                    </Button>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7">
                                        <MoreHorizontal className="h-3 w-3" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => handleOpenEditProduct(child)}>
                                        <Pencil className="mr-2 h-4 w-4" /> Edit
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="text-destructive"
                                        onClick={() => {
                                          if (confirm(`Remove "${child.productCode}" as a sub-product of "${product.productCode}"?`)) {
                                            removeChildMutation.mutate({ parentId: product.id, childId: child.id });
                                          }
                                        }}
                                      >
                                        <X className="mr-2 h-4 w-4" /> Remove Sub-Product
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="attributes" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings className="h-5 w-5" /> Attribute Options
                </CardTitle>
                <Button size="sm" onClick={handleOpenCreateAttribute}>
                  <Plus className="mr-2 h-4 w-4" /> Add Option
                </Button>
              </CardHeader>
              <CardContent>
                <Tabs value={activeAttributeTab} onValueChange={(val) => { setActiveAttributeTab(val); setTableFamilyFilter("all"); setTableProp1Filter("all"); }}>
                  <TabsList className="mb-4">
                    <TabsTrigger value="item_family">Item Family</TabsTrigger>
                    <TabsTrigger value="property_1">Property 1</TabsTrigger>
                    <TabsTrigger value="property_2">Property 2</TabsTrigger>
                  </TabsList>

                  {(activeAttributeTab === "property_1" || activeAttributeTab === "property_2") && (
                    <div className="flex gap-3 mb-4">
                      <div className="w-64">
                        <Select value={tableFamilyFilter} onValueChange={(val) => { setTableFamilyFilter(val); setTableProp1Filter("all"); }}>
                          <SelectTrigger>
                            <SelectValue placeholder="Filter by Item Family" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Item Families</SelectItem>
                            {familyOptions.sort((a, b) => a.label.localeCompare(b.label)).map((opt) => (
                              <SelectItem key={opt.id} value={opt.id.toString()}>
                                {opt.code} - {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {activeAttributeTab === "property_2" && (
                        <div className="w-64">
                          <Select value={tableProp1Filter} onValueChange={setTableProp1Filter}>
                            <SelectTrigger>
                              <SelectValue placeholder="Filter by Property 1" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Property 1</SelectItem>
                              {allProperty1Options
                                .filter((o) => tableFamilyFilter === "all" || o.parentId?.toString() === tableFamilyFilter)
                                .sort((a, b) => a.label.localeCompare(b.label))
                                .map((opt) => (
                                  <SelectItem key={opt.id} value={opt.id.toString()}>
                                    {opt.code} - {opt.label}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}

                  {["item_family", "property_1", "property_2"].map((tabVal) => (
                    <TabsContent key={tabVal} value={tabVal}>
                      {isLoadingAttributes ? (
                        <div className="space-y-2">
                          {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-10 w-full" />
                          ))}
                        </div>
                      ) : currentAttributeOptions.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                          <p>No options defined for {attributeTypeLabels[tabVal]}.</p>
                          <p className="text-sm">Add options to populate the dropdown in the product form.</p>
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {activeAttributeTab === "property_1" && (
                                <TableHead>Item Family</TableHead>
                              )}
                              {activeAttributeTab === "property_2" && (
                                <>
                                  <TableHead>Item Family</TableHead>
                                  <TableHead>Property 1</TableHead>
                                </>
                              )}
                              <TableHead>Code</TableHead>
                              <TableHead>Label</TableHead>
                              <TableHead className="w-[100px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {currentAttributeOptions
                              .sort((a, b) => {
                                const parentA = a.parentId ? attributeOptions.find(f => f.id === a.parentId) : null;
                                const parentB = b.parentId ? attributeOptions.find(f => f.id === b.parentId) : null;
                                if (activeAttributeTab === "property_2") {
                                  const grandParentA = parentA?.parentId ? familyOptions.find(f => f.id === parentA.parentId) : null;
                                  const grandParentB = parentB?.parentId ? familyOptions.find(f => f.id === parentB.parentId) : null;
                                  const familyCompare = (grandParentA?.code ?? "zzz").localeCompare(grandParentB?.code ?? "zzz");
                                  if (familyCompare !== 0) return familyCompare;
                                  const prop1Compare = (parentA?.code ?? "zzz").localeCompare(parentB?.code ?? "zzz");
                                  if (prop1Compare !== 0) return prop1Compare;
                                } else if (activeAttributeTab === "property_1") {
                                  const familyCompare = (parentA?.code ?? "zzz").localeCompare(parentB?.code ?? "zzz");
                                  if (familyCompare !== 0) return familyCompare;
                                }
                                return a.code.localeCompare(b.code);
                              })
                              .map((attr) => {
                              const parentOption = attr.parentId ? attributeOptions.find(f => f.id === attr.parentId) : null;
                              return (
                              <TableRow key={attr.id}>
                                {activeAttributeTab === "property_1" && (
                                  <TableCell>{parentOption ? `${parentOption.code} - ${parentOption.label}` : "—"}</TableCell>
                                )}
                                {activeAttributeTab === "property_2" && (
                                  <>
                                    <TableCell>
                                      {parentOption ? (() => {
                                        const grandParent = parentOption.parentId ? familyOptions.find(f => f.id === parentOption.parentId) : null;
                                        return grandParent ? `${grandParent.code} - ${grandParent.label}` : "—";
                                      })() : "—"}
                                    </TableCell>
                                    <TableCell>
                                      {parentOption ? `${parentOption.code} - ${parentOption.label}` : "—"}
                                    </TableCell>
                                  </>
                                )}
                                <TableCell className="font-mono font-medium">{attr.code}</TableCell>
                                <TableCell>{attr.label}</TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEditAttribute(attr)}>
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                                      onClick={() => {
                                        if (confirm(`Delete attribute "${attr.code} - ${attr.label}"?`)) {
                                          deleteAttributeMutation.mutate(attr.id);
                                        }
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                            })}
                          </TableBody>
                        </Table>
                      )}
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={isProductDialogOpen} onOpenChange={(open) => { if (!open) { setIsProductDialogOpen(false); setEditingProduct(null); } }}>
          <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>{editingProduct ? "Edit Product" : "Create Product"}</DialogTitle>
              <DialogDescription>
                {editingProduct ? "Update product details" : "Define a new product with item attributes"}
              </DialogDescription>
            </DialogHeader>

            <Form {...productForm}>
              <form onSubmit={productForm.handleSubmit(onProductSubmit)} className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-1">
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={productForm.control}
                    name="itemFamily"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Item Family <span className="text-destructive">*</span></FormLabel>
                        <Select value={field.value} onValueChange={handleSelectFamily}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select Item Family" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {familyOptions.map((opt) => (
                              <SelectItem key={opt.id} value={opt.code}>{opt.code} - {opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={productForm.control}
                    name="itemProperty1"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Item Property 1 <span className="text-destructive">*</span></FormLabel>
                        <Select value={field.value} onValueChange={handleSelectProp1}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select Property 1" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {property1Options.map((opt) => (
                              <SelectItem key={opt.id} value={opt.code}>{opt.code} - {opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={productForm.control}
                    name="itemProperty2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Item Property 2 <span className="text-destructive">*</span></FormLabel>
                        <Select value={field.value} onValueChange={handleSelectProp2}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select Property 2" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {property2Options.map((opt) => (
                              <SelectItem key={opt.id} value={opt.code}>{opt.code} - {opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={productForm.control}
                    name="itemProperty3"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Item Property 3 <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            onChange={(e) => {
                              field.onChange(e.target.value.toUpperCase());
                              productForm.setValue("description", "");
                            }}
                            placeholder="e.g. 2000 LPH"
                            maxLength={20}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {liveProductCode && (
                  <div className="rounded-md border p-2 bg-muted/50 flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">Code:</span>
                      <span className="font-mono font-semibold">{liveProductCode}</span>
                    </div>
                    <div className="flex items-center gap-1 truncate">
                      <span className="text-muted-foreground">Desc:</span>
                      <span className="truncate">{liveDescription}</span>
                    </div>
                  </div>
                )}

                <FormField
                  control={productForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description Override (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder={liveDescription || "Auto-generated from attributes"} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-3 gap-3">
                  <FormField
                    control={productForm.control}
                    name="unit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit <span className="text-destructive">*</span></FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select Unit" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {unitOptions.map((u) => (
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={productForm.control}
                    name="unitPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit Price <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="0.00" type="text" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={productForm.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency <span className="text-destructive">*</span></FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Currency" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                            <SelectItem value="GBP">GBP</SelectItem>
                            <SelectItem value="INR">INR</SelectItem>
                            <SelectItem value="AED">AED</SelectItem>
                            <SelectItem value="SAR">SAR</SelectItem>
                            <SelectItem value="JPY">JPY</SelectItem>
                            <SelectItem value="CNY">CNY</SelectItem>
                            <SelectItem value="CHF">CHF</SelectItem>
                            <SelectItem value="CAD">CAD</SelectItem>
                            <SelectItem value="AUD">AUD</SelectItem>
                            <SelectItem value="SGD">SGD</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={productForm.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product Category <span className="text-destructive">*</span></FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Finish Goods">Finish Goods</SelectItem>
                            <SelectItem value="Bought-Out Items">Bought-Out Items</SelectItem>
                            <SelectItem value="Raw Materials">Raw Materials</SelectItem>
                            <SelectItem value="Consumables">Consumables</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={productForm.control}
                    name="hsnSacCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>HSN/SAC Code <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. 8481" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={productForm.control}
                    name="makeOrBuy"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Make / Buy</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || 'Make'}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Make or Buy" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Make">Make</SelectItem>
                            <SelectItem value="Buy">Buy</SelectItem>
                            <SelectItem value="Service">Service</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={productForm.control}
                    name="preferredVendor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preferred Vendor</FormLabel>
                        <Select
                          onValueChange={(val) => field.onChange(val === "__none__" ? "" : val)}
                          value={field.value || "__none__"}
                        >
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select SAP vendor" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">-- None --</SelectItem>
                            {sapVendors.map((v) => (
                              <SelectItem key={v.code} value={v.name}>{v.code} - {v.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={productForm.control}
                    name="tagNo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tag No <span className="text-destructive">*</span> <span className="text-muted-foreground text-xs">(e.g. RF/FE/E1)</span></FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. RF/FE/E1" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={productForm.control}
                    name="equipmentConfiguration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Equipment Configuration</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || 'Vessel'}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select configuration" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Vessel">Vessel</SelectItem>
                            <SelectItem value="Jacketed Vessel">Jacketed Vessel</SelectItem>
                            <SelectItem value="Heat Exchanger">Heat Exchanger</SelectItem>
                            <SelectItem value="Jacketed Vessel and Heat Exchanger">Jacketed Vessel and Heat Exchanger</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                </div>
                <div className="flex items-center justify-between pt-3 border-t mt-1">
                  <FormField
                    control={productForm.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-3">
                        <FormLabel className="mt-0">Active</FormLabel>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => { setIsProductDialogOpen(false); setEditingProduct(null); }}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createProductMutation.isPending || updateProductMutation.isPending}>
                      {(createProductMutation.isPending || updateProductMutation.isPending) && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {editingProduct ? "Update Product" : "Create Product"}
                    </Button>
                  </div>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Dialog open={isAttributeDialogOpen} onOpenChange={(open) => { if (!open) { setIsAttributeDialogOpen(false); setEditingAttribute(null); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingAttribute ? "Edit Attribute Option" : "Add Attribute Option"}</DialogTitle>
              <DialogDescription>
                {editingAttribute ? "Update the attribute option details" : "Add a new dropdown option for product attributes"}
              </DialogDescription>
            </DialogHeader>

            <Form {...attributeForm}>
              <form onSubmit={attributeForm.handleSubmit(onAttributeSubmit)} className="space-y-4">
                <FormField
                  control={attributeForm.control}
                  name="attributeType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Attribute Type</FormLabel>
                      <Select value={field.value} onValueChange={(val) => { field.onChange(val); attributeForm.setValue('parentId', null); setAttrFamilyFilter("all"); }} disabled={!!editingAttribute}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="item_family">Item Family</SelectItem>
                          <SelectItem value="property_1">Property 1</SelectItem>
                          <SelectItem value="property_2">Property 2</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {attributeForm.watch("attributeType") === "property_1" && (
                  <FormField
                    control={attributeForm.control}
                    name="parentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Item Family <span className="text-destructive">*</span></FormLabel>
                        <Select
                          value={field.value?.toString() ?? ""}
                          onValueChange={(val) => field.onChange(parseInt(val))}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Item Family" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {familyOptions.sort((a, b) => a.label.localeCompare(b.label)).map((opt) => (
                              <SelectItem key={opt.id} value={opt.id.toString()}>
                                {opt.code} - {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {attributeForm.watch("attributeType") === "property_2" && (
                  <>
                    <FormItem>
                      <FormLabel>Filter by Item Family</FormLabel>
                      <Select
                        value={attrFamilyFilter}
                        onValueChange={(val) => { setAttrFamilyFilter(val); attributeForm.setValue('parentId', null); }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="All Families" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="all">All Families</SelectItem>
                          {familyOptions.sort((a, b) => a.label.localeCompare(b.label)).map((opt) => (
                            <SelectItem key={opt.id} value={opt.id.toString()}>
                              {opt.code} - {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                    <FormField
                      control={attributeForm.control}
                      name="parentId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Property 1 <span className="text-destructive">*</span></FormLabel>
                          <Select
                            value={field.value?.toString() ?? ""}
                            onValueChange={(val) => field.onChange(parseInt(val))}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select Property 1" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {allProperty1Options
                                .filter((o) => attrFamilyFilter === "all" || o.parentId?.toString() === attrFamilyFilter)
                                .sort((a, b) => {
                                  const parentA = familyOptions.find(f => f.id === a.parentId);
                                  const parentB = familyOptions.find(f => f.id === b.parentId);
                                  const familyCompare = (parentA?.label ?? "").localeCompare(parentB?.label ?? "");
                                  if (familyCompare !== 0) return familyCompare;
                                  return a.label.localeCompare(b.label);
                                }).map((opt) => {
                                  const parentFamily = familyOptions.find(f => f.id === opt.parentId);
                                  return (
                                    <SelectItem key={opt.id} value={opt.id.toString()}>
                                      {parentFamily ? `${parentFamily.code}-` : ""}{opt.code} - {opt.label}{parentFamily ? ` (${parentFamily.label})` : ""}
                                    </SelectItem>
                                  );
                                })}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                <FormField
                  control={attributeForm.control}
                  name="label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Label</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="e.g. Used Oil Refinery"
                          onChange={(e) => {
                            field.onChange(e.target.value);
                            const words = e.target.value.trim().split(/\s+/).filter(Boolean);
                            const autoCode = words.map(w => w[0]).join('').toUpperCase().slice(0, 3);
                            if (autoCode) {
                              attributeForm.setValue('code', autoCode);
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={attributeForm.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code (3 characters, auto-generated)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="e.g. UOR"
                          maxLength={3}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => { setIsAttributeDialogOpen(false); setEditingAttribute(null); }}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createAttributeMutation.isPending || updateAttributeMutation.isPending}>
                    {(createAttributeMutation.isPending || updateAttributeMutation.isPending) && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {editingAttribute ? "Update" : "Create"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Product</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this product? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={deleteProductMutation.isPending}
                onClick={() => { if (deleteConfirmId) deleteProductMutation.mutate(deleteConfirmId); }}
              >
                {deleteProductMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isSubProductPickerOpen} onOpenChange={(open) => { if (!open) { setIsSubProductPickerOpen(false); setLinkingParentProduct(null); setSubProductSearch(""); setSubProductProp3Filter("all"); setRecentlyLinkedIds(new Set()); } }}>
          <DialogContent className="max-w-5xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Link Sub-Product</DialogTitle>
              <DialogDescription>
                {linkingParentProduct && `Select an existing product to add as a sub-product under ${linkingParentProduct.productCode} — ${linkingParentProduct.description}`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products by code or description..."
                    value={subProductSearch}
                    onChange={(e) => setSubProductSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={subProductProp3Filter} onValueChange={setSubProductProp3Filter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Property 3" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Property 3</SelectItem>
                    {[...new Set(products.map(p => p.itemProperty3))]
                      .sort((a, b) => a.localeCompare(b))
                      .map(v => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="max-h-[400px] overflow-y-auto border rounded-md">
                {(() => {
                  const existingChildIds = linkingParentProduct
                    ? (childProductsMap.get(linkingParentProduct.id) || []).map(c => c.id)
                    : [];
                  const availableProducts = products.filter(p => {
                    if (linkingParentProduct && p.id === linkingParentProduct.id) return false;
                    if (existingChildIds.includes(p.id)) return false;
                    if (recentlyLinkedIds.has(p.id)) return false;
                    if (subProductProp3Filter !== "all" && p.itemProperty3 !== subProductProp3Filter) return false;
                    if (!subProductSearch) return true;
                    return p.productCode.toLowerCase().includes(subProductSearch.toLowerCase()) ||
                      p.description.toLowerCase().includes(subProductSearch.toLowerCase());
                  });
                  if (availableProducts.length === 0) {
                    return (
                      <div className="p-6 text-center text-muted-foreground">
                        <p>No matching products found</p>
                      </div>
                    );
                  }
                  return availableProducts.map(p => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-3 border-b last:border-b-0 hover:bg-muted/50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-sm">{p.productCode}</span>
                          <Badge variant="outline" className="text-xs">{p.category || "—"}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{p.description}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <p className="text-sm font-medium whitespace-nowrap">{p.currency || "USD"} {parseFloat(p.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        <Input
                          type="number"
                          min={1}
                          defaultValue={1}
                          className="w-[60px] h-8 text-center text-sm"
                          id={`sub-qty-${p.id}`}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => {
                            if (linkingParentProduct) {
                              const qtyInput = document.getElementById(`sub-qty-${p.id}`) as HTMLInputElement;
                              const qty = parseInt(qtyInput?.value || '1') || 1;
                              addChildMutation.mutate({ parentId: linkingParentProduct.id, childProductId: p.id, quantity: qty });
                            }
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add
                        </Button>
                      </div>
                    </div>
                  ));
                })()}
              </div>
              {addChildMutation.isPending && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Linking...
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
