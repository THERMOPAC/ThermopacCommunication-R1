import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, MoreHorizontal, Search, Settings, Package,
  Loader2, X, Filter
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
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
  itemFamilyLabel: z.string().min(1),
  itemProperty1: z.string().min(1, "Property 1 is required"),
  itemProperty1Label: z.string().min(1),
  itemProperty2: z.string().min(1, "Property 2 is required"),
  itemProperty2Label: z.string().min(1),
  itemProperty3: z.string().regex(/^\d{4}$/, "Must be exactly 4 digits"),
  description: z.string().optional(),
  unit: z.string().min(1, "Unit is required"),
  unitPrice: z.string().min(1, "Unit Price is required").regex(/^\d+(\.\d{1,2})?$/, "Invalid price"),
  category: z.string().optional(),
  hsnSacCode: z.string().optional(),
  isActive: z.boolean().default(true),
});

type ProductFormValues = z.infer<typeof productFormSchema>;

const attributeFormSchema = z.object({
  attributeType: z.string().min(1),
  code: z.string().length(3, "Code must be exactly 3 characters"),
  label: z.string().min(1, "Label is required"),
  sortOrder: z.number().default(0),
  isActive: z.boolean().default(true),
});

type AttributeFormValues = z.infer<typeof attributeFormSchema>;

export default function ProductsPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [isAttributeDialogOpen, setIsAttributeDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingAttribute, setEditingAttribute] = useState<ProductAttributeOption | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [activeAttributeTab, setActiveAttributeTab] = useState("item_family");

  const { data: products = [], isLoading: isLoadingProducts } = useQuery<Product[]>({
    queryKey: ['/api/sales-marketing/products'],
  });

  const { data: attributeOptions = [], isLoading: isLoadingAttributes } = useQuery<ProductAttributeOption[]>({
    queryKey: ['/api/sales-marketing/product-attributes'],
  });

  const familyOptions = useMemo(() =>
    attributeOptions.filter((o) => o.attributeType === "item_family" && o.isActive),
    [attributeOptions]
  );
  const property1Options = useMemo(() =>
    attributeOptions.filter((o) => o.attributeType === "property_1" && o.isActive),
    [attributeOptions]
  );
  const property2Options = useMemo(() =>
    attributeOptions.filter((o) => o.attributeType === "property_2" && o.isActive),
    [attributeOptions]
  );

  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => { if (p.category) cats.add(p.category); });
    return Array.from(cats).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch = !searchQuery ||
        p.productCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === "all" || p.category === categoryFilter;
      const matchesStatus = statusFilter === "all" ||
        (statusFilter === "active" && p.isActive) ||
        (statusFilter === "inactive" && !p.isActive);
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, searchQuery, categoryFilter, statusFilter]);

  const productForm = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      itemFamily: "", itemFamilyLabel: "",
      itemProperty1: "", itemProperty1Label: "",
      itemProperty2: "", itemProperty2Label: "",
      itemProperty3: "", description: "",
      unit: "", unitPrice: "", category: "", hsnSacCode: "",
      isActive: true,
    },
  });

  const attributeForm = useForm<AttributeFormValues>({
    resolver: zodResolver(attributeFormSchema),
    defaultValues: {
      attributeType: "item_family", code: "", label: "",
      sortOrder: 0, isActive: true,
    },
  });

  const watchFamily = productForm.watch("itemFamily");
  const watchProp1 = productForm.watch("itemProperty1");
  const watchProp2 = productForm.watch("itemProperty2");
  const watchProp3 = productForm.watch("itemProperty3");
  const watchFamilyLabel = productForm.watch("itemFamilyLabel");
  const watchProp1Label = productForm.watch("itemProperty1Label");
  const watchProp2Label = productForm.watch("itemProperty2Label");

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
      attributeForm.reset({ attributeType: activeAttributeTab, code: "", label: "", sortOrder: 0, isActive: true });
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
      attributeForm.reset({ attributeType: activeAttributeTab, code: "", label: "", sortOrder: 0, isActive: true });
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

  const handleOpenCreateProduct = () => {
    setEditingProduct(null);
    productForm.reset({
      itemFamily: "", itemFamilyLabel: "",
      itemProperty1: "", itemProperty1Label: "",
      itemProperty2: "", itemProperty2Label: "",
      itemProperty3: "", description: "",
      unit: "", unitPrice: "", category: "", hsnSacCode: "",
      isActive: true,
    });
    setIsProductDialogOpen(true);
  };

  const handleOpenEditProduct = (product: Product) => {
    setEditingProduct(product);
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
      unitPrice: product.unitPrice,
      category: product.category || "",
      hsnSacCode: product.hsnSacCode || "",
      isActive: product.isActive ?? true,
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
    setIsAttributeDialogOpen(true);
  };

  const handleOpenEditAttribute = (attr: ProductAttributeOption) => {
    setEditingAttribute(attr);
    attributeForm.reset({
      attributeType: attr.attributeType,
      code: attr.code,
      label: attr.label,
      sortOrder: attr.sortOrder ?? 0,
      isActive: attr.isActive ?? true,
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
    }
  };

  const handleSelectProp1 = (code: string) => {
    const opt = property1Options.find((o) => o.code === code);
    if (opt) {
      productForm.setValue("itemProperty1", opt.code);
      productForm.setValue("itemProperty1Label", opt.label);
    }
  };

  const handleSelectProp2 = (code: string) => {
    const opt = property2Options.find((o) => o.code === code);
    if (opt) {
      productForm.setValue("itemProperty2", opt.code);
      productForm.setValue("itemProperty2Label", opt.label);
    }
  };

  const currentAttributeOptions = useMemo(() => {
    return attributeOptions.filter((o) => o.attributeType === activeAttributeTab);
  }, [attributeOptions, activeAttributeTab]);

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
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex flex-1 gap-2 flex-wrap items-center">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by code or description..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
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
                      {searchQuery || categoryFilter !== "all" || statusFilter !== "all"
                        ? "Try adjusting your search or filters"
                        : "Get started by adding your first product"}
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead>HSN/SAC</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProducts.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell className="font-mono font-medium">{product.productCode}</TableCell>
                          <TableCell>{product.description}</TableCell>
                          <TableCell>{product.category || "-"}</TableCell>
                          <TableCell>{product.unit}</TableCell>
                          <TableCell className="text-right">{parseFloat(product.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
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
                      ))}
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
                <Tabs value={activeAttributeTab} onValueChange={setActiveAttributeTab}>
                  <TabsList className="mb-4">
                    <TabsTrigger value="item_family">Item Family</TabsTrigger>
                    <TabsTrigger value="property_1">Property 1</TabsTrigger>
                    <TabsTrigger value="property_2">Property 2</TabsTrigger>
                  </TabsList>

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
                              <TableHead>Code</TableHead>
                              <TableHead>Label</TableHead>
                              <TableHead>Sort Order</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="w-[100px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {currentAttributeOptions
                              .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                              .map((attr) => (
                              <TableRow key={attr.id}>
                                <TableCell className="font-mono font-medium">{attr.code}</TableCell>
                                <TableCell>{attr.label}</TableCell>
                                <TableCell>{attr.sortOrder ?? 0}</TableCell>
                                <TableCell>
                                  <Badge variant={attr.isActive ? "default" : "secondary"}>
                                    {attr.isActive ? "Active" : "Inactive"}
                                  </Badge>
                                </TableCell>
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
                            ))}
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
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProduct ? "Edit Product" : "Create Product"}</DialogTitle>
              <DialogDescription>
                {editingProduct ? "Update product details" : "Define a new product with item attributes"}
              </DialogDescription>
            </DialogHeader>

            <Form {...productForm}>
              <form onSubmit={productForm.handleSubmit(onProductSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={productForm.control}
                    name="itemFamily"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Item Family</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={handleSelectFamily}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Item Family" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {familyOptions.map((opt) => (
                              <SelectItem key={opt.id} value={opt.code}>
                                {opt.code} - {opt.label}
                              </SelectItem>
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
                        <FormLabel>Item Property 1</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={handleSelectProp1}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Property 1" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {property1Options.map((opt) => (
                              <SelectItem key={opt.id} value={opt.code}>
                                {opt.code} - {opt.label}
                              </SelectItem>
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
                        <FormLabel>Item Property 2</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={handleSelectProp2}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Property 2" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {property2Options.map((opt) => (
                              <SelectItem key={opt.id} value={opt.code}>
                                {opt.code} - {opt.label}
                              </SelectItem>
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
                        <FormLabel>Item Property 3 (4-digit)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="e.g. 0200"
                            maxLength={4}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {liveProductCode && (
                  <div className="rounded-md border p-3 bg-muted/50 space-y-1">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium text-muted-foreground">Product Code:</Label>
                      <span className="font-mono font-semibold">{liveProductCode}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium text-muted-foreground">Description:</Label>
                      <span className="text-sm">{liveDescription}</span>
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
                        <Input
                          {...field}
                          placeholder={liveDescription || "Auto-generated from attributes"}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={productForm.control}
                    name="unit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Unit" />
                            </SelectTrigger>
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
                        <FormLabel>Unit Price</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="0.00" type="text" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={productForm.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. Valves, Pipes" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={productForm.control}
                    name="hsnSacCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>HSN/SAC Code</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. 8481" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

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

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => { setIsProductDialogOpen(false); setEditingProduct(null); }}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createProductMutation.isPending || updateProductMutation.isPending}>
                    {(createProductMutation.isPending || updateProductMutation.isPending) && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {editingProduct ? "Update Product" : "Create Product"}
                  </Button>
                </DialogFooter>
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
                      <Select value={field.value} onValueChange={field.onChange} disabled={!!editingAttribute}>
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

                <FormField
                  control={attributeForm.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code (3 characters)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="e.g. VAL"
                          maxLength={3}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={attributeForm.control}
                  name="label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Label</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. Valve" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={attributeForm.control}
                  name="sortOrder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sort Order</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          value={field.value}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={attributeForm.control}
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
      </div>
    </Layout>
  );
}
