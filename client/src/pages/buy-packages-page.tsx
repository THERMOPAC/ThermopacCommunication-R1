import { useState, Fragment, useCallback } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus, ChevronRight, ChevronDown, Package, Layers,
  CheckCircle2, Archive, Edit2, Loader2, Search, ExternalLink,
} from "lucide-react";

// ── Role helpers ──────────────────────────────────────────────────────────────
const ROLE_LEVEL: Record<string, number> = {
  Superuser: 0, "General Manager": 1, "Senior Manager": 2,
  Manager: 3, "Senior Executive": 4, Employee: 5,
};
const rl = (role?: string) => ROLE_LEVEL[role ?? ""] ?? 999;
const isManager       = (r?: string) => rl(r) <= 3;
const isSeniorManager = (r?: string) => rl(r) <= 2;

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS: Record<string, { label: string; cls: string }> = {
  draft:    { label: "Draft",    cls: "bg-slate-100 text-slate-700 border border-slate-200" },
  active:   { label: "Active",   cls: "bg-emerald-100 text-emerald-800 border border-emerald-200" },
  archived: { label: "Archived", cls: "bg-orange-100 text-orange-800 border border-orange-200" },
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface BuyPackage {
  id: number; productId: number; productCode: string; productDescription: string;
  packageCode: string; name: string; description: string | null;
  version: number; status: string; isActive: boolean; lineCount: number;
  createdAt: string;
}
interface PackageLine {
  id: number; buy_package_header_id: number; line_number: number;
  buy_group_id: number; buy_group_code: string; buy_group_label: string;
  buy_subgroup_id: number; buy_subgroup_code: string; buy_subgroup_label: string;
  uom_id: number; uom_code: string; uom_label: string;
  generic_requirement: string; default_quantity: string;
  default_specification: string | null; technical_attributes: Record<string, unknown> | null;
  selection_required: boolean; datasheet_required: boolean;
  inspection_required: boolean; certificate_required: boolean; compliance_required: boolean;
  notes: string | null; sort_order: number;
}
interface BuyGroup { id: number; code: string; label: string; sortOrder: number; }
interface Product  { id: number; productCode: string; description: string; makeOrBuy: string; parentId: number | null; isGrandparent: boolean; }

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BuyPackagesPage() {
  const { toast } = useToast();
  const { user }  = useAuth();
  const role      = (user as any)?.role as string | undefined;
  const canWrite  = isManager(role);
  const canAction = isSeniorManager(role);

  // Filters / expand
  const [statusFilter,   setStatusFilter]   = useState<"all" | "draft" | "active" | "archived">("all");
  const [productFilter,  setProductFilter]  = useState<string>("all");
  const [search,         setSearch]         = useState("");
  const [expandedId,     setExpandedId]     = useState<number | null>(null);

  // Dialogs
  const [showCreate, setShowCreate] = useState(false);
  const [editPkg,    setEditPkg]    = useState<BuyPackage | null>(null);

  // Header form
  const [hdr, setHdr] = useState({ productId: "", packageCode: "", name: "", description: "" });
  const [codeLoading, setCodeLoading] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: packages = [], isLoading: pkgLoad } = useQuery<BuyPackage[]>({
    queryKey: ["/api/buy-packages"],
  });

  const { data: expandedLines = [], isLoading: linesLoad } = useQuery<PackageLine[]>({
    queryKey: ["/api/buy-packages", expandedId, "lines"],
    queryFn: () =>
      fetch(`/api/buy-packages/${expandedId}/lines`, { credentials: "include" }).then((r) => r.json()),
    enabled: expandedId !== null,
  });

  const { data: groups = [] } = useQuery<BuyGroup[]>({ queryKey: ["/api/buy-groups"] });

  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/sales-marketing/products"],
  });
  const buyProducts = allProducts.filter((p) => p.isGrandparent === true);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const visiblePackages = packages.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (productFilter !== "all" && String(p.productId) !== productFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.packageCode.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.productCode ?? "").toLowerCase().includes(q) ||
        (p.productDescription ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  // ── Invalidation helpers ──────────────────────────────────────────────────────
  const invalidatePkgs = () => queryClient.invalidateQueries({ queryKey: ["/api/buy-packages"] });

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const createPkg = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/buy-packages", body),
    onSuccess: () => { toast({ title: "Package created" }); setShowCreate(false); invalidatePkgs(); },
    onError:   (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const patchPkg = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) => apiRequest("PATCH", `/api/buy-packages/${id}`, body),
    onSuccess: () => { toast({ title: "Package updated" }); setEditPkg(null); invalidatePkgs(); },
    onError:   (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const activatePkg = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/buy-packages/${id}/activate`, {}),
    onSuccess: () => { toast({ title: "Package activated" }); invalidatePkgs(); },
    onError:   (e: any) => toast({ title: "Cannot activate", description: e.message, variant: "destructive" }),
  });

  const archivePkg = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/buy-packages/${id}/archive`, {}),
    onSuccess: () => { toast({ title: "Package archived" }); invalidatePkgs(); },
    onError:   (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const fetchGeneratedCode = useCallback(async (productId: string) => {
    if (!productId) return;
    setCodeLoading(true);
    try {
      const res = await fetch(`/api/buy-packages/generate-code?productId=${productId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setHdr((h) => ({ ...h, packageCode: data.packageCode }));
      }
    } catch {
      // silently ignore — user can type manually
    } finally {
      setCodeLoading(false);
    }
  }, []);

  function openCreate() {
    setHdr({ productId: "", packageCode: "", name: "", description: "" });
    setShowCreate(true);
  }

  function openEdit(pkg: BuyPackage) {
    setHdr({ productId: String(pkg.productId), packageCode: pkg.packageCode, name: pkg.name, description: pkg.description ?? "" });
    setEditPkg(pkg);
  }

  function submitHeader(isEdit: boolean) {
    if (!hdr.productId || !hdr.packageCode || !hdr.name) {
      toast({ title: "Product, package code, and name are required", variant: "destructive" }); return;
    }
    const body = {
      productId: Number(hdr.productId),
      packageCode: hdr.packageCode.trim().toUpperCase(),
      name: hdr.name.trim(),
      description: hdr.description.trim() || null,
    };
    if (isEdit && editPkg) {
      patchPkg.mutate({ id: editPkg.id, body: { name: body.name, description: body.description } });
    } else {
      createPkg.mutate(body);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="max-w-screen-xl mx-auto p-6 space-y-5">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Package className="h-6 w-6 text-primary" />
              BUY Package Catalog
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Standard procurement templates — Phase 1 · PPPC
            </p>
          </div>
          {canWrite && (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> New Package
            </Button>
          )}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search code, name, product…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {/* Product family filter */}
            <div className="w-52">
              <Select value={productFilter} onValueChange={setProductFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All product families" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All product families</SelectItem>
                  {buyProducts.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.productCode} — {p.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-1 flex-wrap">
              {(["all", "draft", "active", "archived"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    statusFilter === s
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {s === "all" ? "All" : STATUS[s]?.label ?? s}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Main table */}
        {pkgLoad ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : visiblePackages.length === 0 ? (
          <Card>
            <CardContent className="py-20 text-center">
              <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-muted-foreground">No packages found.</p>
              {canWrite && (
                <Button variant="outline" className="mt-4 gap-2" onClick={openCreate}>
                  <Plus className="h-4 w-4" /> Create First Package
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-8" />
                  <TableHead>Package Code</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-center w-16">Ver.</TableHead>
                  <TableHead className="text-center w-28">Status</TableHead>
                  <TableHead className="text-center w-16">Lines</TableHead>
                  <TableHead className="text-right w-44">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblePackages.map((pkg) => {
                  const isExpanded = expandedId === pkg.id;
                  const scfg = STATUS[pkg.status] ?? STATUS.draft;
                  return (
                    <Fragment key={pkg.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() => setExpandedId((cur) => (cur === pkg.id ? null : pkg.id))}
                      >
                        <TableCell className="pl-4">
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm font-semibold">{pkg.packageCode}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-medium text-primary">{pkg.productCode}</span>
                          <p className="text-xs text-muted-foreground truncate max-w-[180px]">{pkg.productDescription}</p>
                        </TableCell>
                        <TableCell className="font-medium text-sm">{pkg.name}</TableCell>
                        <TableCell className="text-center">
                          <span className="font-mono text-sm text-muted-foreground">v{pkg.version}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${scfg.cls}`}>
                            {scfg.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                            <Layers className="h-3.5 w-3.5" />{pkg.lineCount}
                          </span>
                        </TableCell>
                        <TableCell className="text-right pr-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Link href={`/products/buy-packages/${pkg.id}/lines`}>
                              <Button variant="outline" size="sm" className="gap-1 text-primary border-primary/30 hover:bg-primary/5">
                                <ExternalLink className="h-3.5 w-3.5" /> View Lines
                              </Button>
                            </Link>
                            {canWrite && pkg.status === "draft" && (
                              <Button variant="ghost" size="sm" onClick={() => openEdit(pkg)}>
                                <Edit2 className="h-4 w-4" />
                              </Button>
                            )}
                            {canAction && pkg.status === "draft" && (
                              <Button
                                variant="outline" size="sm"
                                className="text-emerald-700 border-emerald-200 hover:bg-emerald-50 gap-1"
                                onClick={() => activatePkg.mutate(pkg.id)}
                                disabled={activatePkg.isPending}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" /> Activate
                              </Button>
                            )}
                            {canAction && pkg.status === "active" && (
                              <Button
                                variant="outline" size="sm"
                                className="text-orange-700 border-orange-200 hover:bg-orange-50 gap-1"
                                onClick={() => archivePkg.mutate(pkg.id)}
                                disabled={archivePkg.isPending}
                              >
                                <Archive className="h-3.5 w-3.5" /> Archive
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Expanded summary — compact line count breakdown per group */}
                      {isExpanded && (() => {
                        const linesMap = new Map<number, number>();
                        for (const line of expandedLines) {
                          linesMap.set(line.buy_group_id, (linesMap.get(line.buy_group_id) ?? 0) + 1);
                        }
                        const populatedGroups = groups.filter((g) => (linesMap.get(g.id) ?? 0) > 0);

                        return (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={8} className="p-0 bg-muted/20 border-t">
                              <div className="px-6 py-3 flex items-center gap-4 flex-wrap">
                                {linesLoad ? (
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                                  </div>
                                ) : populatedGroups.length === 0 ? (
                                  <span className="text-sm text-muted-foreground">No lines added yet.</span>
                                ) : (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {populatedGroups.map((g) => (
                                      <span key={g.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium">
                                        {g.label}
                                        <span className="font-bold">{linesMap.get(g.id)}</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <Link href={`/products/buy-packages/${pkg.id}/lines`} onClick={(e) => e.stopPropagation()}>
                                  <Button size="sm" variant="outline" className="gap-1.5 ml-auto h-7 text-xs">
                                    <ExternalLink className="h-3 w-3" /> Manage Lines
                                  </Button>
                                </Link>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })()}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* ── Create Package Dialog ─────────────────────────────────────────── */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New BUY Package</DialogTitle>
              <DialogDescription>Create a standard procurement template linked to a catalog product.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>BUY Product <span className="text-red-500">*</span></Label>
                <Select
                  value={hdr.productId}
                  onValueChange={(v) => {
                    const prod = buyProducts.find((p) => String(p.id) === v);
                    setHdr((h) => ({
                      ...h,
                      productId: v,
                      packageCode: "",
                      name: prod?.description ?? "",
                      description: prod?.description ?? "",
                    }));
                    fetchGeneratedCode(v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a BUY catalog product…" />
                  </SelectTrigger>
                  <SelectContent>
                    {buyProducts.length === 0 && (
                      <SelectItem value="_none" disabled>No BUY products in catalog</SelectItem>
                    )}
                    {buyProducts.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.productCode} — {p.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Package Code <span className="text-red-500">*</span></Label>
                  <span className="text-[11px] text-muted-foreground">Auto-generated</span>
                </div>
                <div className="relative">
                  <Input
                    placeholder={codeLoading ? "Generating…" : "Select a product above"}
                    value={hdr.packageCode}
                    readOnly
                    maxLength={30}
                    className="font-mono pr-8 bg-muted cursor-not-allowed select-all"
                  />
                  {codeLoading && (
                    <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Package Name <span className="text-red-500">*</span></Label>
                  <span className="text-[11px] text-muted-foreground">Auto-generated</span>
                </div>
                <Input
                  placeholder="Select a product above"
                  value={hdr.name}
                  readOnly
                  maxLength={255}
                  className="bg-muted cursor-not-allowed"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Description</Label>
                  <span className="text-[11px] text-muted-foreground">From product</span>
                </div>
                <Textarea
                  placeholder="Select a product above"
                  value={hdr.description}
                  readOnly
                  rows={3}
                  className="bg-muted cursor-not-allowed resize-none"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={() => submitHeader(false)} disabled={createPkg.isPending}>
                {createPkg.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Package
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Edit Package Dialog ───────────────────────────────────────────── */}
        <Dialog open={!!editPkg} onOpenChange={(o) => !o && setEditPkg(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Package — {editPkg?.packageCode}</DialogTitle>
              <DialogDescription>Package code and product cannot be changed on an existing package.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Package Name <span className="text-red-500">*</span></Label>
                <Input value={hdr.name} onChange={(e) => setHdr((h) => ({ ...h, name: e.target.value }))} maxLength={255} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={hdr.description} onChange={(e) => setHdr((h) => ({ ...h, description: e.target.value }))} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditPkg(null)}>Cancel</Button>
              <Button onClick={() => submitHeader(true)} disabled={patchPkg.isPending}>
                {patchPkg.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </Layout>
  );
}
