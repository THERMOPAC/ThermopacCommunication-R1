import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { fmtDate, fmtDateTime } from "@/lib/date-format";
import {
  Building2, FileText, MapPin, Landmark, Settings, Palette,
  Upload, History, AlertTriangle, CheckCircle2, Clock, Loader2,
  Download, Eye, RefreshCw, ChevronRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CompanyMaster {
  id: number; company_code: string; short_name: string; legal_name: string;
  display_name: string; company_type?: string; industry?: string;
  fy_start_month: number; base_currency: string; timezone: string;
  logo_gcs_path?: string; signature_gcs_path?: string; seal_gcs_path?: string;
  is_active: boolean; version: number; created_at: string; updated_at: string;
}
interface LegalTax { id: number; company_id: number; cin?: string; pan?: string; gstin?: string;
  iec_code?: string; iec_branch?: string; lut_number?: string; lut_validity_date?: string;
  lut_financial_year?: string; msme_udyam?: string; tan?: string; pf_number?: string;
  esi_number?: string; gst_registration_type?: string; gst_state_code?: string;
  export_without_gst: boolean; ad_code?: string; authorized_dealer_bank?: string; version: number; }
interface Address { id: number; company_id: number; address_type: string;
  address_line1?: string; address_line2?: string; city?: string; district?: string;
  state?: string; country: string; pin_code?: string; is_active: boolean; version: number; }
interface BankAccount { id: number; company_id: number; bank_name: string; branch?: string;
  beneficiary_name: string; account_number: string; ifsc?: string; swift?: string; iban?: string;
  currency: string; is_primary: boolean; is_active: boolean; version: number; }
interface ErpConfig { id: number; company_id: number; sap_company_db?: string; sap_branch_code?: string;
  default_warehouse?: string; default_cost_center?: string; default_payment_terms?: string;
  default_delivery_terms?: string; base_uom?: string; decimal_precision: number; version: number; }
interface Branding { id: number; company_id: number; default_letterhead?: string; footer_text?: string;
  terms_conditions?: string; rfq_footer?: string; offer_footer?: string; purchase_footer?: string;
  report_watermark?: string; version: number; }
interface CompanyDoc { id: number; company_id: number; doc_type: string; revision_number: number;
  file_name: string; gcs_path: string; content_type?: string; size_bytes?: number;
  status: string; expiry_date?: string; is_active: boolean; uploaded_at: string; notes?: string; }
interface AuditEntry { id: number; action: string; table_name?: string; field_name?: string;
  old_value?: string; new_value?: string; changed_by_name?: string; changed_at: string; notes?: string; }
interface CompanyPayload extends CompanyMaster {
  legalTax?: LegalTax; addresses: Address[]; bankAccounts: BankAccount[];
  erpConfig?: ErpConfig; branding?: Branding; documents: CompanyDoc[]; }

const DOC_TYPES = ['GST_CERTIFICATE','PAN_CARD','IEC_CERTIFICATE','LUT_COPY','MSME_CERTIFICATE',
  'CANCELLED_CHEQUE','INCORPORATION_CERTIFICATE','FACTORY_LICENSE','PF_ESI_DOCUMENT'];
const DOC_LABELS: Record<string,string> = {
  GST_CERTIFICATE:'GST Certificate', PAN_CARD:'PAN Card', IEC_CERTIFICATE:'IEC Certificate',
  LUT_COPY:'LUT Copy', MSME_CERTIFICATE:'MSME Certificate', CANCELLED_CHEQUE:'Cancelled Cheque',
  INCORPORATION_CERTIFICATE:'Incorporation Certificate', FACTORY_LICENSE:'Factory License',
  PF_ESI_DOCUMENT:'PF / ESI Documents',
};
const MANDATORY_DOCS = ['GST_CERTIFICATE','PAN_CARD','CANCELLED_CHEQUE','INCORPORATION_CERTIFICATE'];
const ADDRESS_TYPES = ['registered_office','corporate_office','factory','dispatch','billing'];
const ADDRESS_LABELS: Record<string,string> = {
  registered_office:'Registered Office', corporate_office:'Corporate Office',
  factory:'Factory', dispatch:'Dispatch', billing:'Billing',
};

// ── Schemas ───────────────────────────────────────────────────────────────────

const generalSchema = z.object({
  shortName: z.string().min(1, 'Required'),
  legalName: z.string().min(1, 'Required'),
  displayName: z.string().min(1, 'Required'),
  companyType: z.string().optional(),
  industry: z.string().optional(),
  fyStartMonth: z.coerce.number().min(1).max(12),
  baseCurrency: z.string().length(3, 'Must be 3-letter ISO code'),
  timezone: z.string().min(1, 'Required'),
  version: z.number(),
});

const legalSchema = z.object({
  cin: z.string().optional(), pan: z.string().optional(), gstin: z.string().optional(),
  iecCode: z.string().optional(), iecBranch: z.string().optional(),
  lutNumber: z.string().optional(), lutValidityDate: z.string().optional(),
  lutFinancialYear: z.string().optional(), msmeUdyam: z.string().optional(),
  tan: z.string().optional(), pfNumber: z.string().optional(), esiNumber: z.string().optional(),
  gstRegistrationType: z.string().optional(), gstStateCode: z.string().optional(),
  exportWithoutGst: z.boolean().default(false),
  adCode: z.string().optional(), authorizedDealerBank: z.string().optional(),
  version: z.number(),
});

const bankSchema = z.object({
  bankName: z.string().min(1,'Required'), beneficiaryName: z.string().min(1,'Required'),
  accountNumber: z.string().min(1,'Required'), branch: z.string().optional(),
  ifsc: z.string().optional(), swift: z.string().optional(), iban: z.string().optional(),
  currency: z.string().default('INR'), isPrimary: z.boolean().default(false),
});

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CompanyInformationPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isSuperuser = user?.role === 'Superuser';
  const isAccountsHead = user?.role === 'Accounts Head';
  const isAdminManager = user?.role === 'Manager' && user?.department === 'Administration';
  const canWrite = isSuperuser;
  const canWriteLegal = isSuperuser || isAccountsHead;
  const canUploadDocs = isSuperuser || isAdminManager;

  const { data, isLoading, error } = useQuery<{ company: CompanyPayload }>({
    queryKey: ['/api/company/active'],
  });
  const company = data?.company;

  if (isLoading) return (
    <Layout>
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    </Layout>
  );

  if (error || !company) return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">No active company record found.</p>
        {isSuperuser && (
          <p className="text-sm text-muted-foreground">Create a company record via the API to get started.</p>
        )}
      </div>
    </Layout>
  );

  return (
    <Layout>
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <span>Administration</span><ChevronRight className="h-3 w-3" /><span>Company Information</span>
            </div>
            <h1 className="text-2xl font-semibold">{company.display_name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline">{company.company_code}</Badge>
              {company.company_type && <Badge variant="secondary">{company.company_type}</Badge>}
              <Badge className="bg-green-100 text-green-800">Active</Badge>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="general">
          <TabsList className="flex flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="general" className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />General</TabsTrigger>
            <TabsTrigger value="legal" className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />Legal & Tax</TabsTrigger>
            <TabsTrigger value="address" className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />Address</TabsTrigger>
            <TabsTrigger value="banking" className="flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5" />Banking</TabsTrigger>
            <TabsTrigger value="erp" className="flex items-center gap-1.5"><Settings className="h-3.5 w-3.5" />ERP Config</TabsTrigger>
            <TabsTrigger value="branding" className="flex items-center gap-1.5"><Palette className="h-3.5 w-3.5" />Branding</TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-1.5"><Upload className="h-3.5 w-3.5" />Documents</TabsTrigger>
            {isSuperuser && <TabsTrigger value="audit" className="flex items-center gap-1.5"><History className="h-3.5 w-3.5" />Audit Log</TabsTrigger>}
          </TabsList>

          <TabsContent value="general"><GeneralTab company={company} canWrite={canWrite} toast={toast} qc={qc} /></TabsContent>
          <TabsContent value="legal"><LegalTab legalTax={company.legalTax} companyId={company.id} canWrite={canWriteLegal} toast={toast} qc={qc} /></TabsContent>
          <TabsContent value="address"><AddressTab addresses={company.addresses} companyId={company.id} canWrite={canWrite} toast={toast} qc={qc} /></TabsContent>
          <TabsContent value="banking"><BankingTab accounts={company.bankAccounts} companyId={company.id} canWrite={canWriteLegal} isSuperuser={isSuperuser} toast={toast} qc={qc} /></TabsContent>
          <TabsContent value="erp"><ErpConfigTab erpConfig={company.erpConfig} companyId={company.id} canWrite={canWrite} toast={toast} qc={qc} /></TabsContent>
          <TabsContent value="branding"><BrandingTab branding={company.branding} companyId={company.id} canWrite={canWrite} logoPath={company.logo_gcs_path} sigPath={company.signature_gcs_path} sealPath={company.seal_gcs_path} toast={toast} qc={qc} /></TabsContent>
          <TabsContent value="documents"><DocumentsTab documents={company.documents} companyId={company.id} canWrite={canUploadDocs} canWriteLegal={canWriteLegal} toast={toast} qc={qc} /></TabsContent>
          {isSuperuser && <TabsContent value="audit"><AuditTab companyId={company.id} /></TabsContent>}
        </Tabs>
      </div>
    </Layout>
  );
}

// ── General Tab ───────────────────────────────────────────────────────────────

function GeneralTab({ company, canWrite, toast, qc }: { company: CompanyPayload; canWrite: boolean; toast: any; qc: any }) {
  const form = useForm({ resolver: zodResolver(generalSchema), defaultValues: {
    shortName: company.short_name, legalName: company.legal_name, displayName: company.display_name,
    companyType: company.company_type ?? '', industry: company.industry ?? '',
    fyStartMonth: company.fy_start_month, baseCurrency: company.base_currency,
    timezone: company.timezone, version: company.version,
  }});
  const { formState: { isDirty, isSubmitting } } = form;

  useEffect(() => { form.reset({ shortName: company.short_name, legalName: company.legal_name, displayName: company.display_name, companyType: company.company_type ?? '', industry: company.industry ?? '', fyStartMonth: company.fy_start_month, baseCurrency: company.base_currency, timezone: company.timezone, version: company.version }); }, [company]);

  const onSubmit = async (data: any) => {
    try {
      await apiRequest('PATCH', `/api/company/${company.id}/general`, data);
      toast({ title: 'General details saved.' });
      qc.invalidateQueries({ queryKey: ['/api/company/active'] });
    } catch (e: any) {
      const body = await e.response?.json().catch(() => ({}));
      if (body?.error === 'CONCURRENT_UPDATE') toast({ title: 'Conflict', description: body.message, variant: 'destructive' });
      else toast({ title: 'Save failed', description: body?.message ?? e.message, variant: 'destructive' });
    }
  };

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (isDirty) e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  return (
    <Card>
      <CardHeader><CardTitle>General Information</CardTitle><CardDescription>Core company identity fields.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Legal Name *" error={form.formState.errors.legalName?.message}><Input {...form.register('legalName')} disabled={!canWrite} /></Field>
            <Field label="Display Name *" error={form.formState.errors.displayName?.message}><Input {...form.register('displayName')} disabled={!canWrite} /></Field>
            <Field label="Short Name *" error={form.formState.errors.shortName?.message}><Input {...form.register('shortName')} disabled={!canWrite} /></Field>
            <Field label="Company Type"><Input {...form.register('companyType')} disabled={!canWrite} placeholder="LLP, Pvt Ltd…" /></Field>
            <Field label="Industry"><Input {...form.register('industry')} disabled={!canWrite} /></Field>
            <Field label="FY Start Month"><Input type="number" {...form.register('fyStartMonth')} disabled={!canWrite} min={1} max={12} /></Field>
            <Field label="Base Currency" error={form.formState.errors.baseCurrency?.message}><Input {...form.register('baseCurrency')} disabled={!canWrite} maxLength={3} placeholder="INR" /></Field>
            <Field label="Timezone" error={form.formState.errors.timezone?.message}><Input {...form.register('timezone')} disabled={!canWrite} placeholder="Asia/Kolkata" /></Field>
          </div>
          {canWrite && (
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={!isDirty || isSubmitting}>{isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : 'Save General'}</Button>
              {isDirty && <Button type="button" variant="outline" onClick={() => form.reset()}>Revert</Button>}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

// ── Legal & Tax Tab ───────────────────────────────────────────────────────────

function LegalTab({ legalTax, companyId, canWrite, toast, qc }: { legalTax?: LegalTax; companyId: number; canWrite: boolean; toast: any; qc: any }) {
  const defaults = { cin: legalTax?.cin??'', pan: legalTax?.pan??'', gstin: legalTax?.gstin??'',
    iecCode: legalTax?.iec_code??'', iecBranch: legalTax?.iec_branch??'', lutNumber: legalTax?.lut_number??'',
    lutValidityDate: legalTax?.lut_validity_date??'', lutFinancialYear: legalTax?.lut_financial_year??'',
    msmeUdyam: legalTax?.msme_udyam??'', tan: legalTax?.tan??'', pfNumber: legalTax?.pf_number??'',
    esiNumber: legalTax?.esi_number??'', gstRegistrationType: legalTax?.gst_registration_type??'',
    gstStateCode: legalTax?.gst_state_code??'', exportWithoutGst: legalTax?.export_without_gst??false,
    adCode: legalTax?.ad_code??'', authorizedDealerBank: legalTax?.authorized_dealer_bank??'',
    version: legalTax?.version??1 };
  const form = useForm({ resolver: zodResolver(legalSchema), defaultValues: defaults });
  const { formState: { isDirty, isSubmitting } } = form;
  useEffect(() => { form.reset(defaults); }, [legalTax]);

  const onSubmit = async (data: any) => {
    try {
      await apiRequest('PATCH', `/api/company/${companyId}/legal-tax`, data);
      toast({ title: 'Legal & Tax details saved.' });
      qc.invalidateQueries({ queryKey: ['/api/company/active'] });
    } catch (e: any) {
      const body = await e.response?.json().catch(() => ({}));
      if (body?.fields) toast({ title: 'Validation error', description: Object.values(body.fields).join('; '), variant: 'destructive' });
      else toast({ title: 'Save failed', description: body?.message ?? e.message, variant: 'destructive' });
    }
  };

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (isDirty) e.preventDefault(); };
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
  }, [isDirty]);

  return (
    <Card>
      <CardHeader><CardTitle>Legal & Tax</CardTitle><CardDescription>Statutory identifiers and tax registrations. Changes are permanently audit-logged.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="CIN" error={form.formState.errors.cin?.message}><Input {...form.register('cin')} disabled={!canWrite} maxLength={21} /></Field>
            <Field label="PAN" error={form.formState.errors.pan?.message}><Input {...form.register('pan')} disabled={!canWrite} maxLength={10} className="uppercase" /></Field>
            <Field label="GSTIN" error={form.formState.errors.gstin?.message}><Input {...form.register('gstin')} disabled={!canWrite} maxLength={15} className="uppercase" /></Field>
            <Field label="GST Registration Type"><Input {...form.register('gstRegistrationType')} disabled={!canWrite} placeholder="Regular, Composition…" /></Field>
            <Field label="GST State Code"><Input {...form.register('gstStateCode')} disabled={!canWrite} maxLength={3} /></Field>
            <Field label="TAN"><Input {...form.register('tan')} disabled={!canWrite} maxLength={10} className="uppercase" /></Field>
            <Field label="IEC Code"><Input {...form.register('iecCode')} disabled={!canWrite} maxLength={10} /></Field>
            <Field label="IEC Branch"><Input {...form.register('iecBranch')} disabled={!canWrite} /></Field>
            <Field label="LUT Number"><Input {...form.register('lutNumber')} disabled={!canWrite} /></Field>
            <Field label="LUT Validity Date"><Input type="date" {...form.register('lutValidityDate')} disabled={!canWrite} /></Field>
            <Field label="LUT Financial Year"><Input {...form.register('lutFinancialYear')} disabled={!canWrite} placeholder="2526" /></Field>
            <Field label="MSME Udyam No."><Input {...form.register('msmeUdyam')} disabled={!canWrite} /></Field>
            <Field label="PF Number"><Input {...form.register('pfNumber')} disabled={!canWrite} /></Field>
            <Field label="ESI Number"><Input {...form.register('esiNumber')} disabled={!canWrite} /></Field>
            <Field label="AD Code"><Input {...form.register('adCode')} disabled={!canWrite} /></Field>
            <Field label="Authorized Dealer Bank"><Input {...form.register('authorizedDealerBank')} disabled={!canWrite} /></Field>
          </div>
          {canWrite && (
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={!isDirty || isSubmitting}>{isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : 'Save Legal & Tax'}</Button>
              {isDirty && <Button type="button" variant="outline" onClick={() => form.reset()}>Revert</Button>}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

// ── Address Tab ───────────────────────────────────────────────────────────────

function AddressTab({ addresses, companyId, canWrite, toast, qc }: { addresses: Address[]; companyId: number; canWrite: boolean; toast: any; qc: any }) {
  const [saving, setSaving] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    for (const t of ADDRESS_TYPES) {
      const a = addresses.find(x => x.address_type === t);
      init[t] = { addressLine1: a?.address_line1??'', addressLine2: a?.address_line2??'', city: a?.city??'', district: a?.district??'', state: a?.state??'', country: a?.country??'India', pinCode: a?.pin_code??'', version: a?.version??1 };
    }
    return init;
  });

  const save = async (type: string) => {
    setSaving(type);
    try {
      await apiRequest('PATCH', `/api/company/${companyId}/address/${type}`, forms[type]);
      toast({ title: `${ADDRESS_LABELS[type]} saved.` });
      qc.invalidateQueries({ queryKey: ['/api/company/active'] });
    } catch (e: any) {
      const body = await e.response?.json().catch(() => ({}));
      toast({ title: 'Save failed', description: body?.message ?? e.message, variant: 'destructive' });
    } finally { setSaving(null); }
  };

  return (
    <div className="space-y-4">
      {ADDRESS_TYPES.map(type => (
        <Card key={type}>
          <CardHeader className="py-4"><CardTitle className="text-base">{ADDRESS_LABELS[type]}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(['addressLine1','addressLine2','city','district','state','country','pinCode'] as const).map(f => (
                <Field key={f} label={f.replace(/([A-Z])/g,' $1').replace(/^./, s => s.toUpperCase())}>
                  <Input value={forms[type][f]} onChange={e => setForms(p => ({ ...p, [type]: { ...p[type], [f]: e.target.value }}))} disabled={!canWrite} />
                </Field>
              ))}
            </div>
            {canWrite && <div className="pt-3"><Button size="sm" disabled={saving === type} onClick={() => save(type)}>{saving === type ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Save {ADDRESS_LABELS[type]}</Button></div>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Banking Tab ───────────────────────────────────────────────────────────────

function BankingTab({ accounts, companyId, canWrite, isSuperuser, toast, qc }: { accounts: BankAccount[]; companyId: number; canWrite: boolean; isSuperuser: boolean; toast: any; qc: any }) {
  const [showAdd, setShowAdd] = useState(false);
  const form = useForm({ resolver: zodResolver(bankSchema), defaultValues: { bankName:'', beneficiaryName:'', accountNumber:'', branch:'', ifsc:'', swift:'', iban:'', currency:'INR', isPrimary:false }});

  const addMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', `/api/company/${companyId}/bank-accounts`, data),
    onSuccess: () => { toast({ title: 'Bank account added.' }); qc.invalidateQueries({ queryKey: ['/api/company/active'] }); setShowAdd(false); form.reset(); },
    onError: async (e: any) => { const b = await e.response?.json().catch(() => ({})); toast({ title: 'Error', description: b?.message ?? e.message, variant: 'destructive' }); },
  });

  const softDelete = async (bankId: number) => {
    try {
      await apiRequest('DELETE', `/api/company/${companyId}/bank-accounts/${bankId}`, {});
      toast({ title: 'Bank account deactivated.' });
      qc.invalidateQueries({ queryKey: ['/api/company/active'] });
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const active = accounts.filter(a => a.is_active);

  return (
    <div className="space-y-4">
      {active.length === 0 && <Card><CardContent className="py-8 text-center text-muted-foreground">No bank accounts added yet.</CardContent></Card>}
      {active.map(a => (
        <Card key={a.id}>
          <CardContent className="py-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium">{a.bank_name}{a.branch ? ` — ${a.branch}` : ''}</div>
                <div className="text-sm text-muted-foreground">{a.beneficiary_name} · {a.account_number}</div>
                {a.ifsc && <div className="text-sm text-muted-foreground">IFSC: {a.ifsc}</div>}
                <div className="text-sm text-muted-foreground">{a.currency}{a.is_primary ? ' · Primary' : ''}</div>
              </div>
              <div className="flex gap-2">
                {a.is_primary && <Badge className="bg-green-100 text-green-800">Primary</Badge>}
                {isSuperuser && <Button size="sm" variant="outline" onClick={() => softDelete(a.id)}>Deactivate</Button>}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      {canWrite && !showAdd && <Button onClick={() => setShowAdd(true)}>+ Add Bank Account</Button>}
      {showAdd && (
        <Card>
          <CardHeader><CardTitle className="text-base">New Bank Account</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(d => addMutation.mutate(d))} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Bank Name *" error={form.formState.errors.bankName?.message}><Input {...form.register('bankName')} /></Field>
                <Field label="Branch"><Input {...form.register('branch')} /></Field>
                <Field label="Beneficiary Name *" error={form.formState.errors.beneficiaryName?.message}><Input {...form.register('beneficiaryName')} /></Field>
                <Field label="Account Number *" error={form.formState.errors.accountNumber?.message}><Input {...form.register('accountNumber')} /></Field>
                <Field label="IFSC"><Input {...form.register('ifsc')} className="uppercase" /></Field>
                <Field label="SWIFT"><Input {...form.register('swift')} className="uppercase" /></Field>
                <Field label="IBAN"><Input {...form.register('iban')} /></Field>
                <Field label="Currency"><Input {...form.register('currency')} maxLength={3} /></Field>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={addMutation.isPending}>{addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Add Account</Button>
                <Button type="button" variant="outline" onClick={() => { setShowAdd(false); form.reset(); }}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── ERP Config Tab ────────────────────────────────────────────────────────────

function ErpConfigTab({ erpConfig, companyId, canWrite, toast, qc }: { erpConfig?: ErpConfig; companyId: number; canWrite: boolean; toast: any; qc: any }) {
  const [form, setForm] = useState({ sapCompanyDb: erpConfig?.sap_company_db??'', sapBranchCode: erpConfig?.sap_branch_code??'', defaultWarehouse: erpConfig?.default_warehouse??'', defaultCostCenter: erpConfig?.default_cost_center??'', defaultPaymentTerms: erpConfig?.default_payment_terms??'', defaultDeliveryTerms: erpConfig?.default_delivery_terms??'', baseUom: erpConfig?.base_uom??'', decimalPrecision: erpConfig?.decimal_precision??2, version: erpConfig?.version??1 });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await apiRequest('PATCH', `/api/company/${companyId}/erp-config`, form);
      toast({ title: 'ERP Configuration saved.' });
      qc.invalidateQueries({ queryKey: ['/api/company/active'] });
    } catch (e: any) { const b = await e.response?.json().catch(() => ({})); toast({ title: 'Error', description: b?.message ?? e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader><CardTitle>ERP Configuration</CardTitle><CardDescription>SAP B1 and ERP default settings.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {([['sapCompanyDb','SAP Company DB'],['sapBranchCode','SAP Branch Code'],['defaultWarehouse','Default Warehouse'],['defaultCostCenter','Default Cost Center'],['defaultPaymentTerms','Default Payment Terms'],['defaultDeliveryTerms','Default Delivery Terms'],['baseUom','Base UOM']] as [string,string][]).map(([key, label]) => (
            <Field key={key} label={label}><Input value={(form as any)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} disabled={!canWrite} /></Field>
          ))}
          <Field label="Decimal Precision"><Input type="number" value={form.decimalPrecision} min={0} max={6} onChange={e => setForm(p => ({ ...p, decimalPrecision: parseInt(e.target.value) }))} disabled={!canWrite} /></Field>
        </div>
        {canWrite && <Button disabled={saving} onClick={save}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Save ERP Config</Button>}
      </CardContent>
    </Card>
  );
}

// ── Branding Tab ──────────────────────────────────────────────────────────────

function BrandingTab({ branding, companyId, canWrite, logoPath, sigPath, sealPath, toast, qc }: { branding?: Branding; companyId: number; canWrite: boolean; logoPath?: string; sigPath?: string; sealPath?: string; toast: any; qc: any }) {
  const [form, setForm] = useState({ footerText: branding?.footer_text??'', defaultLetterhead: branding?.default_letterhead??'', termsConditions: branding?.terms_conditions??'', rfqFooter: branding?.rfq_footer??'', offerFooter: branding?.offer_footer??'', purchaseFooter: branding?.purchase_footer??'', reportWatermark: branding?.report_watermark??'', version: branding?.version??1 });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string|null>(null);

  const save = async () => {
    setSaving(true);
    try {
      await apiRequest('PATCH', `/api/company/${companyId}/branding`, form);
      toast({ title: 'Branding text saved.' });
      qc.invalidateQueries({ queryKey: ['/api/company/active'] });
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const uploadAsset = async (type: 'logo'|'signature'|'seal', file: File) => {
    setUploading(type);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch(`/api/company/${companyId}/branding/${type}`, { method:'POST', body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? 'Upload failed');
      toast({ title: `${type.charAt(0).toUpperCase() + type.slice(1)} uploaded.` });
      qc.invalidateQueries({ queryKey: ['/api/company/active'] });
    } catch (e: any) { toast({ title: 'Upload failed', description: e.message, variant: 'destructive' }); }
    finally { setUploading(null); }
  };

  const assetTypes: Array<{ key: 'logo'|'signature'|'seal'; label: string; path?: string }> = [
    { key: 'logo', label: 'Company Logo', path: logoPath },
    { key: 'signature', label: 'Authorized Signature', path: sigPath },
    { key: 'seal', label: 'Company Seal', path: sealPath },
  ];

  return (
    <div className="space-y-4">
      {/* Branding Assets */}
      <Card>
        <CardHeader><CardTitle className="text-base">Branding Assets</CardTitle><CardDescription>Image files (JPEG/PNG/WEBP, max 2 MB each)</CardDescription></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {assetTypes.map(({ key, label, path }) => (
              <div key={key} className="border rounded-lg p-4 space-y-2">
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-muted-foreground truncate">{path ? path.split('/').pop() : 'Not uploaded'}</div>
                {canWrite && (
                  <label className="cursor-pointer">
                    <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp"
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadAsset(key, f); e.target.value = ''; }} />
                    <Button size="sm" variant="outline" asChild><span>{uploading === key ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}Upload</span></Button>
                  </label>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Text Fields */}
      <Card>
        <CardHeader><CardTitle className="text-base">Letterhead & Footer Text</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {([['footerText','Footer Text'],['rfqFooter','RFQ Footer'],['offerFooter','Offer Footer'],['purchaseFooter','Purchase Order Footer'],['reportWatermark','Report Watermark'],['termsConditions','Terms & Conditions']] as [string,string][]).map(([key, label]) => (
            <Field key={key} label={label}><Textarea value={(form as any)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} disabled={!canWrite} rows={3} /></Field>
          ))}
          {canWrite && <Button disabled={saving} onClick={save}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Save Branding Text</Button>}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Documents Tab ─────────────────────────────────────────────────────────────

function DocumentsTab({ documents, companyId, canWrite, canWriteLegal, toast, qc }: { documents: CompanyDoc[]; companyId: number; canWrite: boolean; canWriteLegal: boolean; toast: any; qc: any }) {
  const [uploading, setUploading] = useState<string|null>(null);
  const [downloading, setDownloading] = useState<number|null>(null);
  const docByType = Object.fromEntries(documents.map(d => [d.doc_type, d]));

  const upload = async (docType: string, file: File) => {
    setUploading(docType);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch(`/api/company/${companyId}/documents/${docType}`, { method:'POST', body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? body.error ?? 'Upload failed');
      toast({ title: `${DOC_LABELS[docType]} uploaded.` });
      qc.invalidateQueries({ queryKey: ['/api/company/active'] });
    } catch (e: any) { toast({ title: 'Upload failed', description: e.message, variant: 'destructive' }); }
    finally { setUploading(null); }
  };

  const download = async (docId: number, fileName: string) => {
    setDownloading(docId);
    try {
      const body: any = await apiRequest('GET', `/api/company/doc/${docId}/download`);
      window.open(body.url, '_blank');
    } catch (e: any) { toast({ title: 'Download failed', description: e.message, variant: 'destructive' }); }
    finally { setDownloading(null); }
  };

  const updateStatus = async (docId: number, status: string) => {
    try {
      await apiRequest('PATCH', `/api/company/doc/${docId}/status`, { status });
      toast({ title: 'Status updated.' });
      qc.invalidateQueries({ queryKey: ['/api/company/active'] });
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  return (
    <div className="space-y-3">
      {DOC_TYPES.map(dt => {
        const doc = docByType[dt];
        const isMandatory = MANDATORY_DOCS.includes(dt);
        return (
          <Card key={dt}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${doc ? 'bg-green-100' : 'bg-muted'}`}>
                    {doc ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Clock className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{DOC_LABELS[dt]}{isMandatory && <span className="text-red-500 ml-1">*</span>}</div>
                    {doc ? (
                      <div className="text-xs text-muted-foreground">Rev {doc.revision_number} · {doc.file_name} · {fmtDate(doc.uploaded_at)}</div>
                    ) : (
                      <div className="text-xs text-muted-foreground">{isMandatory ? 'Required' : 'Optional'} — not uploaded</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {doc && (
                    <>
                      <Badge variant={doc.status === 'verified' ? 'default' : doc.status === 'expired' ? 'destructive' : 'secondary'} className="text-xs">{doc.status}</Badge>
                      <Button size="sm" variant="ghost" disabled={downloading === doc.id} onClick={() => download(doc.id, doc.file_name)}>
                        {downloading === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      </Button>
                      {canWriteLegal && doc.status !== 'verified' && (
                        <Button size="sm" variant="ghost" onClick={() => updateStatus(doc.id, 'verified')} title="Mark verified">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        </Button>
                      )}
                    </>
                  )}
                  {canWrite && (
                    <label className="cursor-pointer">
                      <input type="file" className="hidden" accept=".pdf,image/jpeg,image/png,image/webp"
                        onChange={e => { const f = e.target.files?.[0]; if (f) upload(dt, f); e.target.value = ''; }} />
                      <Button size="sm" variant="outline" asChild>
                        <span>{uploading === dt ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}{doc ? 'Replace' : 'Upload'}</span>
                      </Button>
                    </label>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Audit Log Tab ─────────────────────────────────────────────────────────────

function AuditTab({ companyId }: { companyId: number }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery<{ log: AuditEntry[]; total: number; page: number }>({
    queryKey: ['/api/company', companyId, 'audit-log', page],
    queryFn: () => fetch(`/api/company/${companyId}/audit-log?page=${page}`).then(r => r.json()),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Audit Log</CardTitle><CardDescription>Permanent, immutable record of all changes.</CardDescription></CardHeader>
      <CardContent>
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
          <div className="space-y-2">
            {(data?.log ?? []).map(entry => (
              <div key={entry.id} className="border rounded-md p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{entry.action}</Badge>
                    {entry.field_name && <span className="text-muted-foreground">{entry.field_name}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground">{fmtDateTime(entry.changed_at)}</span>
                </div>
                {entry.old_value !== undefined && entry.new_value !== undefined && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    <span className="line-through">{entry.old_value ?? '—'}</span>
                    {' → '}
                    <span className="font-medium">{entry.new_value ?? '—'}</span>
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-0.5">by {entry.changed_by_name ?? 'System'}</div>
              </div>
            ))}
            {(data?.total ?? 0) > 50 && (
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={(page * 50) >= (data?.total ?? 0)} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Field helper ──────────────────────────────────────────────────────────────

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
