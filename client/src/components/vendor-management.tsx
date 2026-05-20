import { useState, useEffect } from "react";
import { VendorComplianceCard } from "@/components/vendor-compliance-card";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Customer } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, UseFormReturn } from "react-hook-form";
import { z } from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  PlusCircle,
  Pencil,
  Trash2,
  Search,
  X,
  AlertCircle,
  Loader2,
  Building2,
  Users,
  MapPin,
  Receipt,
  ChevronDown,
  ChevronUp,
  Truck,
  RefreshCw,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const countryToContinent: Record<string, string> = {
  "Afghanistan": "Asia", "Albania": "Europe", "Algeria": "Africa", "Andorra": "Europe",
  "Angola": "Africa", "Argentina": "South America", "Armenia": "Asia", "Australia": "Oceania",
  "Austria": "Europe", "Azerbaijan": "Asia", "Bahrain": "Asia", "Bangladesh": "Asia",
  "Belarus": "Europe", "Belgium": "Europe", "Benin": "Africa", "Bhutan": "Asia",
  "Bolivia": "South America", "Bosnia and Herzegovina": "Europe", "Botswana": "Africa",
  "Brazil": "South America", "Brunei": "Asia", "Bulgaria": "Europe", "Burkina Faso": "Africa",
  "Burundi": "Africa", "Cambodia": "Asia", "Cameroon": "Africa", "Canada": "North America",
  "Central African Republic": "Africa", "Chad": "Africa", "Chile": "South America",
  "China": "Asia", "Colombia": "South America", "Comoros": "Africa", "Congo": "Africa",
  "Costa Rica": "North America", "Croatia": "Europe", "Cuba": "North America", "Cyprus": "Europe",
  "Czech Republic": "Europe", "Denmark": "Europe", "Djibouti": "Africa",
  "Dominican Republic": "North America", "Ecuador": "South America", "Egypt": "Africa",
  "El Salvador": "North America", "Equatorial Guinea": "Africa", "Eritrea": "Africa",
  "Estonia": "Europe", "Eswatini": "Africa", "Ethiopia": "Africa", "Fiji": "Oceania",
  "Finland": "Europe", "France": "Europe", "Gabon": "Africa", "Gambia": "Africa",
  "Georgia": "Asia", "Germany": "Europe", "Ghana": "Africa", "Greece": "Europe",
  "Guatemala": "North America", "Guinea": "Africa", "Guinea-Bissau": "Africa",
  "Guyana": "South America", "Haiti": "North America", "Honduras": "North America",
  "Hungary": "Europe", "Iceland": "Europe", "India": "Asia", "Indonesia": "Asia",
  "Iran": "Asia", "Iraq": "Asia", "Ireland": "Europe", "Israel": "Asia", "Italy": "Europe",
  "Ivory Coast": "Africa", "Jamaica": "North America", "Japan": "Asia", "Jordan": "Asia",
  "Kazakhstan": "Asia", "Kenya": "Africa", "Kuwait": "Asia", "Kyrgyzstan": "Asia",
  "Laos": "Asia", "Latvia": "Europe", "Lebanon": "Asia", "Lesotho": "Africa",
  "Liberia": "Africa", "Libya": "Africa", "Liechtenstein": "Europe", "Lithuania": "Europe",
  "Luxembourg": "Europe", "Madagascar": "Africa", "Malawi": "Africa", "Malaysia": "Asia",
  "Maldives": "Asia", "Mali": "Africa", "Malta": "Europe", "Mauritania": "Africa",
  "Mauritius": "Africa", "Mexico": "North America", "Moldova": "Europe", "Monaco": "Europe",
  "Mongolia": "Asia", "Montenegro": "Europe", "Morocco": "Africa", "Mozambique": "Africa",
  "Myanmar": "Asia", "Namibia": "Africa", "Nepal": "Asia", "Netherlands": "Europe",
  "New Zealand": "Oceania", "Nicaragua": "North America", "Niger": "Africa", "Nigeria": "Africa",
  "North Korea": "Asia", "North Macedonia": "Europe", "Norway": "Europe", "Oman": "Asia",
  "Pakistan": "Asia", "Palestine": "Asia", "Panama": "North America",
  "Papua New Guinea": "Oceania", "Paraguay": "South America", "Peru": "South America",
  "Philippines": "Asia", "Poland": "Europe", "Portugal": "Europe", "Qatar": "Asia",
  "Romania": "Europe", "Russia": "Europe", "Rwanda": "Africa", "Saudi Arabia": "Asia",
  "Senegal": "Africa", "Serbia": "Europe", "Sierra Leone": "Africa", "Singapore": "Asia",
  "Slovakia": "Europe", "Slovenia": "Europe", "Somalia": "Africa", "South Africa": "Africa",
  "South Korea": "Asia", "South Sudan": "Africa", "Spain": "Europe", "Sri Lanka": "Asia",
  "Sudan": "Africa", "Suriname": "South America", "Sweden": "Europe", "Switzerland": "Europe",
  "Syria": "Asia", "Taiwan": "Asia", "Tajikistan": "Asia", "Tanzania": "Africa",
  "Thailand": "Asia", "Togo": "Africa", "Trinidad and Tobago": "North America",
  "Tunisia": "Africa", "Turkey": "Europe", "Turkmenistan": "Asia", "Uganda": "Africa",
  "Ukraine": "Europe", "United Arab Emirates": "Asia", "United Kingdom": "Europe",
  "United States": "North America", "Uruguay": "South America", "Uzbekistan": "Asia",
  "Venezuela": "South America", "Vietnam": "Asia", "Yemen": "Asia", "Zambia": "Africa",
  "Zimbabwe": "Africa"
};
const countries = Object.keys(countryToContinent).sort();

const countryToPhoneCode: Record<string, string> = {
  "Afghanistan": "+93", "Albania": "+355", "Algeria": "+213", "Andorra": "+376",
  "Angola": "+244", "Argentina": "+54", "Armenia": "+374", "Australia": "+61",
  "Austria": "+43", "Azerbaijan": "+994", "Bahrain": "+973", "Bangladesh": "+880",
  "Belarus": "+375", "Belgium": "+32", "Benin": "+229", "Bhutan": "+975",
  "Bolivia": "+591", "Bosnia and Herzegovina": "+387", "Botswana": "+267",
  "Brazil": "+55", "Brunei": "+673", "Bulgaria": "+359", "Burkina Faso": "+226",
  "Burundi": "+257", "Cambodia": "+855", "Cameroon": "+237", "Canada": "+1",
  "Central African Republic": "+236", "Chad": "+235", "Chile": "+56",
  "China": "+86", "Colombia": "+57", "Comoros": "+269", "Congo": "+242",
  "Costa Rica": "+506", "Croatia": "+385", "Cuba": "+53", "Cyprus": "+357",
  "Czech Republic": "+420", "Denmark": "+45", "Djibouti": "+253",
  "Dominican Republic": "+1", "Ecuador": "+593", "Egypt": "+20",
  "El Salvador": "+503", "Equatorial Guinea": "+240", "Eritrea": "+291",
  "Estonia": "+372", "Eswatini": "+268", "Ethiopia": "+251", "Fiji": "+679",
  "Finland": "+358", "France": "+33", "Gabon": "+241", "Gambia": "+220",
  "Georgia": "+995", "Germany": "+49", "Ghana": "+233", "Greece": "+30",
  "Guatemala": "+502", "Guinea": "+224", "Guinea-Bissau": "+245",
  "Guyana": "+592", "Haiti": "+509", "Honduras": "+504",
  "Hungary": "+36", "Iceland": "+354", "India": "+91", "Indonesia": "+62",
  "Iran": "+98", "Iraq": "+964", "Ireland": "+353", "Israel": "+972", "Italy": "+39",
  "Ivory Coast": "+225", "Jamaica": "+1", "Japan": "+81", "Jordan": "+962",
  "Kazakhstan": "+7", "Kenya": "+254", "Kuwait": "+965", "Kyrgyzstan": "+996",
  "Laos": "+856", "Latvia": "+371", "Lebanon": "+961", "Lesotho": "+266",
  "Liberia": "+231", "Libya": "+218", "Liechtenstein": "+423", "Lithuania": "+370",
  "Luxembourg": "+352", "Madagascar": "+261", "Malawi": "+265", "Malaysia": "+60",
  "Maldives": "+960", "Mali": "+223", "Malta": "+356", "Mauritania": "+222",
  "Mauritius": "+230", "Mexico": "+52", "Moldova": "+373", "Monaco": "+377",
  "Mongolia": "+976", "Montenegro": "+382", "Morocco": "+212", "Mozambique": "+258",
  "Myanmar": "+95", "Namibia": "+264", "Nepal": "+977", "Netherlands": "+31",
  "New Zealand": "+64", "Nicaragua": "+505", "Niger": "+227", "Nigeria": "+234",
  "North Korea": "+850", "North Macedonia": "+389", "Norway": "+47", "Oman": "+968",
  "Pakistan": "+92", "Palestine": "+970", "Panama": "+507",
  "Papua New Guinea": "+675", "Paraguay": "+595", "Peru": "+51",
  "Philippines": "+63", "Poland": "+48", "Portugal": "+351", "Qatar": "+974",
  "Romania": "+40", "Russia": "+7", "Rwanda": "+250", "Saudi Arabia": "+966",
  "Senegal": "+221", "Serbia": "+381", "Sierra Leone": "+232", "Singapore": "+65",
  "Slovakia": "+421", "Slovenia": "+386", "Somalia": "+252", "South Africa": "+27",
  "South Korea": "+82", "South Sudan": "+211", "Spain": "+34", "Sri Lanka": "+94",
  "Sudan": "+249", "Suriname": "+597", "Sweden": "+46", "Switzerland": "+41",
  "Syria": "+963", "Taiwan": "+886", "Tajikistan": "+992", "Tanzania": "+255",
  "Thailand": "+66", "Togo": "+228", "Trinidad and Tobago": "+1",
  "Tunisia": "+216", "Turkey": "+90", "Turkmenistan": "+993", "Uganda": "+256",
  "Ukraine": "+380", "United Arab Emirates": "+971", "United Kingdom": "+44",
  "United States": "+1", "Uruguay": "+598", "Uzbekistan": "+998",
  "Venezuela": "+58", "Vietnam": "+84", "Yemen": "+967", "Zambia": "+260",
  "Zimbabwe": "+263"
};

const vendorSchema = z.object({
  bpCode: z.string().min(1, "BP Code is required"),
  bpName: z.string().min(1, "BP Name is required"),
  contactPerson: z.string().min(1, "Contact Person is required"),
  contactPosition: z.string().min(1, "Position is required"),
  email: z.string().email("Invalid email address").min(1, "Email is required"),
  phone1: z.string().min(1, "Phone is required"),
  contact2Name: z.string().optional(),
  contact2Position: z.string().optional(),
  contact2Email: z.string().email("Invalid email").optional().or(z.literal("")),
  contact2Phone: z.string().optional(),
  contact3Name: z.string().optional(),
  contact3Position: z.string().optional(),
  contact3Email: z.string().email("Invalid email").optional().or(z.literal("")),
  contact3Phone: z.string().optional(),
  billAddrLine1: z.string().min(1, "Address Line 1 is required"),
  billAddrLine2: z.string().min(1, "Address Line 2 is required"),
  billAddrBlock: z.string().optional().default(""),
  billAddrBuilding: z.string().optional().default(""),
  billAddrCity: z.string().min(1, "City is required"),
  shipAddrLine1: z.string().min(1, "Address Line 1 is required"),
  shipAddrLine2: z.string().min(1, "Address Line 2 is required"),
  shipAddrBlock: z.string().optional().default(""),
  shipAddrBuilding: z.string().optional().default(""),
  shipAddrCity: z.string().min(1, "City is required"),
  cardType: z.string().default("V"),
  glblLocNum: z.string().optional().default(""),
  panNumber: z.string().optional().default(""),
  uStateSupply: z.string().min(1, "State of Supply is required"),
  uBpGstType: z.string().min(1, "GST Type is required"),
  currency: z.string().min(1, "Currency is required"),
  continent: z.string().min(1, "Continent is required"),
  countryName: z.string().min(1, "Country is required"),
}).superRefine((data, ctx) => {
  const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (
    data.uBpGstType !== "E" &&
    data.glblLocNum &&
    data.glblLocNum.trim() !== "" &&
    data.glblLocNum.trim() !== "NA"
  ) {
    if (!GSTIN_REGEX.test(data.glblLocNum.trim().toUpperCase())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid GSTIN format (e.g., 27AAPFU0939F1ZV)",
        path: ["glblLocNum"],
      });
    }
  }
});

type VendorFormValues = z.infer<typeof vendorSchema>;

const INDIAN_GST_STATES = [
  { code: "AN", name: "Andaman & Nicobar Islands" },
  { code: "AP", name: "Andhra Pradesh" },
  { code: "AR", name: "Arunachal Pradesh" },
  { code: "AS", name: "Assam" },
  { code: "BR", name: "Bihar" },
  { code: "CG", name: "Chhattisgarh" },
  { code: "CH", name: "Chandigarh" },
  { code: "DD", name: "Daman, Diu & Dadra" },
  { code: "DL", name: "Delhi" },
  { code: "DN", name: "Dadra & Nagar Haveli" },
  { code: "GA", name: "Goa" },
  { code: "GJ", name: "Gujarat" },
  { code: "HP", name: "Himachal Pradesh" },
  { code: "HR", name: "Haryana" },
  { code: "JH", name: "Jharkhand" },
  { code: "JK", name: "Jammu & Kashmir" },
  { code: "KA", name: "Karnataka" },
  { code: "KL", name: "Kerala" },
  { code: "LA", name: "Ladakh" },
  { code: "LD", name: "Lakshadweep" },
  { code: "MH", name: "Maharashtra" },
  { code: "ML", name: "Meghalaya" },
  { code: "MN", name: "Manipur" },
  { code: "MP", name: "Madhya Pradesh" },
  { code: "MZ", name: "Mizoram" },
  { code: "NL", name: "Nagaland" },
  { code: "OD", name: "Odisha" },
  { code: "PB", name: "Punjab" },
  { code: "PY", name: "Puducherry" },
  { code: "RJ", name: "Rajasthan" },
  { code: "SK", name: "Sikkim" },
  { code: "TG", name: "Telangana" },
  { code: "TN", name: "Tamil Nadu" },
  { code: "TR", name: "Tripura" },
  { code: "UK", name: "Uttarakhand" },
  { code: "UP", name: "Uttar Pradesh" },
  { code: "WB", name: "West Bengal" },
];

function VendorFormBody({
  form,
  onSubmit,
  onCancel,
  isPending,
  submitLabel,
  bpCodeReadOnly,
  contact2Open,
  setContact2Open,
  contact3Open,
  setContact3Open,
  currencyManuallySet,
  setCurrencyManuallySet,
  gstTypeManuallySet,
  setGstTypeManuallySet,
  bpCodeFetchError,
  sapSyncFailureAlert,
  onRetryBpCode,
  isRetryingBpCode,
  vendorId,
}: {
  form: UseFormReturn<VendorFormValues>;
  onSubmit: (data: VendorFormValues) => void;
  onCancel: () => void;
  isPending: boolean;
  submitLabel: string;
  bpCodeReadOnly?: boolean;
  contact2Open: boolean;
  setContact2Open: (v: boolean) => void;
  contact3Open: boolean;
  setContact3Open: (v: boolean) => void;
  currencyManuallySet: boolean;
  setCurrencyManuallySet: (v: boolean) => void;
  gstTypeManuallySet: boolean;
  setGstTypeManuallySet: (v: boolean) => void;
  bpCodeFetchError?: string | null;
  sapSyncFailureAlert?: string | null;
  onRetryBpCode?: () => void;
  isRetryingBpCode?: boolean;
  vendorId?: number;
}) {
  const handleCountryChange = (val: string, fieldOnChange: (v: string) => void) => {
    fieldOnChange(val);
    const cont = countryToContinent[val];
    if (cont) form.setValue("continent", cont);
    if (!currencyManuallySet) {
      form.setValue("currency", val === "India" ? "INR" : "USD");
    }
    const phoneCode = countryToPhoneCode[val];
    if (phoneCode) {
      const current = form.getValues("phone1") || "";
      const stripped = current.replace(/^\+\d+\s*/, "");
      form.setValue("phone1", phoneCode + " " + stripped);
    }
  };

  const updateStateSupply = (cardType: string, gstType: string) => {
    const isExport = cardType === "C" && gstType === "E";
    if (isExport) {
      form.setValue("uStateSupply", "--");
    } else {
      const current = form.getValues("uStateSupply");
      if (!current || current === "" || current === "--") {
        form.setValue("uStateSupply", "MH");
      }
    }
  };

  const handleGstTypeChange = (val: string, fieldOnChange: (v: string) => void) => {
    fieldOnChange(val);
    setGstTypeManuallySet(true);
    const cardType = form.getValues("cardType") || "V";
    updateStateSupply(cardType, val);
    if (val === "E") {
      form.setValue("glblLocNum", "");
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">

        {/* ── Section 1: Business Partner Info ── */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-500" />
            <h4 className="text-sm font-semibold text-slate-700">Business Partner Info</h4>
          </div>
          {bpCodeFetchError && (
            <Alert variant="destructive" className="mb-1 py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-xs font-semibold">SAP B1 Unavailable — BP Code cannot be generated</AlertTitle>
              <AlertDescription className="text-xs flex items-center justify-between gap-2">
                <span>{bpCodeFetchError}</span>
                {onRetryBpCode && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 h-6 text-xs border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={onRetryBpCode}
                    disabled={isRetryingBpCode}
                  >
                    {isRetryingBpCode
                      ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Retrying…</>
                      : <><RefreshCw className="h-3 w-3 mr-1" />Retry</>}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-[1fr_3fr] gap-3">
            <FormField
              control={form.control}
              name="bpCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>BP Code *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      readOnly={bpCodeReadOnly}
                      className={
                        bpCodeReadOnly
                          ? "bg-muted/60 cursor-not-allowed font-mono text-xs"
                          : bpCodeFetchError
                            ? "font-mono text-xs border-destructive focus-visible:ring-destructive"
                            : "font-mono text-xs"
                      }
                      placeholder={bpCodeFetchError ? "SAP unavailable — close and retry" : "Fetching from SAP…"}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="bpName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>BP Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Vendor / Supplier company name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* ── Section 2: Primary Contact ── */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" />
            <h4 className="text-sm font-semibold text-blue-700">Primary Contact</h4>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <FormField
              control={form.control}
              name="contactPerson"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Person *</FormLabel>
                  <FormControl>
                    <Input placeholder="Full name" {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contactPosition"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Position *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Sales Manager" {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email *</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="contact@vendor.com" {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone1"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone *</FormLabel>
                  <FormControl>
                    <Input placeholder="+91 98765 43210" {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* ── Section 3: Additional Contacts (collapsible) ── */}
        <div className="rounded-xl border border-gray-200 bg-gray-50/40 p-4 space-y-3">
          <button
            type="button"
            className="flex items-center gap-2 w-full text-left"
            onClick={() => setContact2Open(!contact2Open)}
          >
            <Users className="h-4 w-4 text-gray-400" />
            <h4 className="text-sm font-semibold text-gray-600">Contact 2</h4>
            {contact2Open ? <ChevronUp className="h-3 w-3 text-gray-400 ml-auto" /> : <ChevronDown className="h-3 w-3 text-gray-400 ml-auto" />}
          </button>
          {contact2Open && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <FormField control={form.control} name="contact2Name" render={({ field }) => (
                <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Full name" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="contact2Position" render={({ field }) => (
                <FormItem><FormLabel>Position</FormLabel><FormControl><Input placeholder="e.g., Director" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="contact2Email" render={({ field }) => (
                <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="email@vendor.com" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="contact2Phone" render={({ field }) => (
                <FormItem><FormLabel>Phone</FormLabel><FormControl><Input placeholder="+91 ..." {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
          )}

          <button
            type="button"
            className="flex items-center gap-2 w-full text-left mt-1"
            onClick={() => setContact3Open(!contact3Open)}
          >
            <Users className="h-4 w-4 text-gray-400" />
            <h4 className="text-sm font-semibold text-gray-600">Contact 3</h4>
            {contact3Open ? <ChevronUp className="h-3 w-3 text-gray-400 ml-auto" /> : <ChevronDown className="h-3 w-3 text-gray-400 ml-auto" />}
          </button>
          {contact3Open && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <FormField control={form.control} name="contact3Name" render={({ field }) => (
                <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Full name" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="contact3Position" render={({ field }) => (
                <FormItem><FormLabel>Position</FormLabel><FormControl><Input placeholder="e.g., GM" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="contact3Email" render={({ field }) => (
                <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="email@vendor.com" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="contact3Phone" render={({ field }) => (
                <FormItem><FormLabel>Phone</FormLabel><FormControl><Input placeholder="+91 ..." {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
          )}
        </div>

        {/* ── Section 4: Address ── */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-amber-500" />
              <h4 className="text-sm font-semibold text-amber-700">Address</h4>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-3 text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
              onClick={() => {
                form.setValue("shipAddrLine1", form.getValues("billAddrLine1") || "");
                form.setValue("shipAddrLine2", form.getValues("billAddrLine2") || "");
                form.setValue("shipAddrBlock", form.getValues("billAddrBlock") || "");
                form.setValue("shipAddrBuilding", form.getValues("billAddrBuilding") || "");
                form.setValue("shipAddrCity", form.getValues("billAddrCity") || "");
              }}
            >
              Transfer Billing → Shipping
            </Button>
          </div>

          {/* Billing | Shipping side-by-side */}
          <div className="grid grid-cols-2 gap-6">
            {/* LEFT: Billing Address */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide border-b border-amber-200 pb-1">Billing Address</p>
              <FormField control={form.control} name="billAddrLine1" render={({ field }) => (
                <FormItem>
                  <FormLabel>Address Line 1 *</FormLabel>
                  <FormControl><Input placeholder="Street / Road" {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="billAddrLine2" render={({ field }) => (
                <FormItem>
                  <FormLabel>Address Line 2 *</FormLabel>
                  <FormControl><Input placeholder="Area / Locality" {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="billAddrBlock" render={({ field }) => (
                <FormItem>
                  <FormLabel>Block</FormLabel>
                  <FormControl><Input placeholder="Block / Sector (optional)" {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="billAddrBuilding" render={({ field }) => (
                <FormItem>
                  <FormLabel>Building</FormLabel>
                  <FormControl><Input placeholder="Building / Complex name (optional)" {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="billAddrCity" render={({ field }) => (
                <FormItem>
                  <FormLabel>City *</FormLabel>
                  <FormControl><Input placeholder="City" {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* RIGHT: Shipping Address */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide border-b border-amber-200 pb-1">Shipping Address</p>
              <FormField control={form.control} name="shipAddrLine1" render={({ field }) => (
                <FormItem>
                  <FormLabel>Address Line 1 *</FormLabel>
                  <FormControl><Input placeholder="Street / Road" {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="shipAddrLine2" render={({ field }) => (
                <FormItem>
                  <FormLabel>Address Line 2 *</FormLabel>
                  <FormControl><Input placeholder="Area / Locality" {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="shipAddrBlock" render={({ field }) => (
                <FormItem>
                  <FormLabel>Block</FormLabel>
                  <FormControl><Input placeholder="Block / Sector (optional)" {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="shipAddrBuilding" render={({ field }) => (
                <FormItem>
                  <FormLabel>Building</FormLabel>
                  <FormControl><Input placeholder="Building / Complex name (optional)" {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="shipAddrCity" render={({ field }) => (
                <FormItem>
                  <FormLabel>City *</FormLabel>
                  <FormControl><Input placeholder="City" {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="countryName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Country *</FormLabel>
                  <Select
                    onValueChange={(val) => handleCountryChange(val, field.onChange)}
                    value={field.value || ""}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      {countries.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="continent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Continent</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value || ""}
                      readOnly
                      className="bg-muted/60 cursor-not-allowed"
                      placeholder="Auto-filled from country"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* ── Section 5: Tax / Commercial Info ── */}
        <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-violet-500" />
            <h4 className="text-sm font-semibold text-violet-700">Tax / Commercial Info</h4>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Card Type — locked to V, read-only display */}
            <FormItem>
              <FormLabel>Card Type</FormLabel>
              <Input value="Vendor / Supplier (V)" readOnly disabled className="bg-muted/60 cursor-not-allowed text-xs" />
            </FormItem>

            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Currency *</FormLabel>
                  <Select
                    onValueChange={(val) => {
                      field.onChange(val);
                      setCurrencyManuallySet(true);
                    }}
                    value={field.value || "INR"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="INR">INR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="AED">AED</SelectItem>
                      <SelectItem value="SAR">SAR</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="uBpGstType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>GST Type *</FormLabel>
                  <Select
                    onValueChange={(val) => handleGstTypeChange(val, field.onChange)}
                    value={field.value || "G"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="G">Regular (G)</SelectItem>
                      <SelectItem value="C">Composition (C)</SelectItem>
                      <SelectItem value="U">Unregistered (U)</SelectItem>
                      <SelectItem value="E">Export (E)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="uStateSupply"
              render={({ field }) => {
                const gstType = form.watch("uBpGstType") || "G";
                const cardType = "V";
                const isExport = cardType === "C" && gstType === "E";
                return (
                  <FormItem>
                    <FormLabel>State of Supply *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || "MH"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select state" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="--">-- Not Applicable --</SelectItem>
                        {INDIAN_GST_STATES.map((s) => (
                          <SelectItem key={s.code} value={s.code}>
                            {s.code} – {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isExport && (
                      <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
                        Not applicable for Export
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          </div>

          {/* GSTIN + PAN — single row */}
          <div className="grid grid-cols-2 gap-4">
            {form.watch("uBpGstType") !== "E" ? (
              <FormField
                control={form.control}
                name="glblLocNum"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GSTIN</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., 27AAPFU0939F1ZV"
                        maxLength={15}
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
                      15-character GST Identification Number
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div />
            )}
            <FormField
              control={form.control}
              name="panNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Permanent Account Number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., ABCDE1234F"
                      maxLength={10}
                      {...field}
                      value={field.value || ""}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
                    10-character PAN (e.g., ABCDE1234F)
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* ── Section 6: Mandatory Compliance Documents ── */}
        <VendorComplianceCard vendorId={vendorId} />

        {sapSyncFailureAlert && (
          <Alert variant="destructive" className="mb-2">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>SAP B1 Sync Failed — Record Saved Locally</AlertTitle>
            <AlertDescription>
              {sapSyncFailureAlert}
              <br />
              <span className="text-xs opacity-90">This record is marked "SAP Sync Failed" until corrected. Close this dialog and use the Retry SAP Sync action on the record.</span>
            </AlertDescription>
          </Alert>
        )}
        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {sapSyncFailureAlert ? "Close" : "Cancel"}
          </Button>
          {!sapSyncFailureAlert && (
          <Button type="submit" disabled={isPending || !!bpCodeFetchError}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {submitLabel === "Create Vendor" ? "Creating..." : "Updating..."}
              </>
            ) : (
              submitLabel
            )}
          </Button>
          )}
        </DialogFooter>
      </form>
    </Form>
  );
}

export default function VendorManagement({ vendors }: { vendors: Customer[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [showSapSyncResult, setShowSapSyncResult] = useState(false);
  const [sapSyncResult, setSapSyncResult] = useState<{
    totalFetched: number; imported: number; skipped: number; failed: number; errors: string[];
  } | null>(null);

  const [contact2Open, setContact2Open] = useState(false);
  const [contact3Open, setContact3Open] = useState(false);
  const [currencyManuallySet, setCurrencyManuallySet] = useState(false);
  const [gstTypeManuallySet, setGstTypeManuallySet] = useState(false);
  const [bpCodeFetchError, setBpCodeFetchError] = useState<string | null>(null);
  const [isRetryingBpCode, setIsRetryingBpCode] = useState(false);

  const fetchNextBpCode = async () => {
    setIsRetryingBpCode(true);
    setBpCodeFetchError(null);
    form.setValue('bpCode', '');
    try {
      const res = await apiRequest("GET", "/api/customers/next-vendor-bp-code");
      if (res?.nextBpCode) {
        form.setValue('bpCode', res.nextBpCode);
        setBpCodeFetchError(null);
      } else if (res?.error) {
        setBpCodeFetchError(res.error);
      }
    } catch (e: any) {
      setBpCodeFetchError(e?.message ?? 'SAP B1 is unavailable. Cannot generate BP Code. Retry after SAP is restored.');
    } finally {
      setIsRetryingBpCode(false);
    }
  };

  // Auto-fetch BP code whenever the Add Vendor dialog opens
  useEffect(() => {
    if (isCreateDialogOpen) {
      fetchNextBpCode();
    }
  }, [isCreateDialogOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const SAP_SYNC_ROLES = ['Superuser', 'General Manager', 'Senior Manager'];
  const canSapSync = SAP_SYNC_ROLES.includes((user as any)?.role ?? '');

  const [testCardCode, setTestCardCode] = useState('');

  const sapSyncMutation = useMutation({
    mutationFn: (cardCode?: string) => apiRequest('POST', '/api/customers/vendor-sap-sync', cardCode ? { cardCode } : {}),
    onSuccess: (data: any) => {
      setSapSyncResult(data);
      setShowSapSyncResult(true);
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      toast({ title: 'SAP Sync complete', description: `Imported ${data.imported}, updated ${data.skipped}` });
    },
    onError: (err: any) => {
      toast({ title: 'SAP Sync failed', description: err.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  const vendorBulkSyncMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/customers/vendor-sap-sync', {}),
    onSuccess: (data: any) => {
      setSapSyncResult(data);
      setShowSapSyncResult(true);
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      toast({ title: 'Vendor SAP Sync complete', description: `Imported ${data.imported}, updated ${data.skipped}` });
    },
    onError: (err: any) => {
      toast({ title: 'Vendor SAP Sync failed', description: err.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [editingVendor, setEditingVendor] = useState<Customer | null>(null);
  const [vendorToDelete, setVendorToDelete] = useState<Customer | null>(null);

  const defaultFormValues: VendorFormValues = {
    bpCode: "",
    bpName: "",
    contactPerson: "",
    contactPosition: "",
    email: "",
    phone1: "",
    contact2Name: "",
    contact2Position: "",
    contact2Email: "",
    contact2Phone: "",
    contact3Name: "",
    contact3Position: "",
    contact3Email: "",
    contact3Phone: "",
    billAddrLine1: "",
    billAddrLine2: "",
    billAddrBlock: "",
    billAddrBuilding: "",
    billAddrCity: "",
    shipAddrLine1: "",
    shipAddrLine2: "",
    shipAddrBlock: "",
    shipAddrBuilding: "",
    shipAddrCity: "",
    cardType: "V",
    glblLocNum: "",
    panNumber: "",
    uStateSupply: "MH",
    uBpGstType: "G",
    currency: "INR",
    continent: "",
    countryName: "",
  };

  const form = useForm<VendorFormValues>({
    resolver: zodResolver(vendorSchema),
    defaultValues: defaultFormValues,
  });

  const createMutation = useMutation({
    mutationFn: async (data: VendorFormValues) => {
      return await apiRequest("POST", "/api/customers", { ...data, cardType: "V" });
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      const sapStatus = response?.sapSyncStatus;
      toast({
        title: "Vendor created",
        description: sapStatus === 'synced'
          ? "Vendor created and synced to SAP B1 successfully."
          : sapStatus === 'failed'
          ? `Vendor created locally. SAP sync failed: ${response?.sapSyncError || 'Unknown error'}`
          : "Vendor created locally. SAP sync was skipped.",
        variant: sapStatus === 'failed' ? "destructive" : "default",
      });
      setIsCreateDialogOpen(false);
      form.reset(defaultFormValues);
    },
    onError: (error) => {
      toast({ title: "Failed to create vendor", description: error.message, variant: "destructive" });
    },
  });

  const [editSapSyncError, setEditSapSyncError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: VendorFormValues }) => {
      return await apiRequest("PUT", `/api/customers/${id}`, { ...data, cardType: "V" });
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      const sapStatus = response?.sapSyncStatus;
      if (sapStatus === 'failed') {
        setEditSapSyncError(response?.sapSyncError || 'SAP B1 rejected the update. Check SAP connectivity.');
      } else {
        setEditSapSyncError(null);
        const warning = response?.sapSyncWarning;
        toast({
          title: "Vendor updated",
          description: warning
            ? `Synced to SAP B1. Note: ${warning}`
            : sapStatus === 'synced'
              ? "Vendor updated and synced to SAP B1 successfully."
              : "Vendor updated locally. SAP sync was skipped.",
          variant: warning ? "default" : undefined,
        });
        setIsEditDialogOpen(false);
        setEditingVendor(null);
      }
    },
    onError: (error) => {
      toast({ title: "Failed to update vendor", description: error.message, variant: "destructive" });
    },
  });

  const retrySapSyncMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/customers/${id}/retry-sap-sync`);
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      if (response?.success) {
        toast({
          title: "SAP sync successful",
          description: response?.warning
            ? `Synced to SAP B1. Note: ${response.warning}`
            : "Record is now synced to SAP B1.",
        });
      } else {
        toast({ title: "SAP retry failed", description: response?.error || "Unknown error", variant: "destructive" });
      }
    },
    onError: (error) => {
      toast({ title: "SAP retry failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/customers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Vendor deleted", description: "The vendor has been deleted successfully." });
      setIsDeleteDialogOpen(false);
      setVendorToDelete(null);
    },
    onError: (error) => {
      toast({ title: "Failed to delete vendor", description: error.message, variant: "destructive" });
    },
  });

  const filteredVendors = vendors.filter((v) => {
    const searchTerm = searchQuery.toLowerCase();
    return (
      v.bpCode.toLowerCase().includes(searchTerm) ||
      v.bpName.toLowerCase().includes(searchTerm) ||
      (v.contactPerson && v.contactPerson.toLowerCase().includes(searchTerm)) ||
      (v.email && v.email.toLowerCase().includes(searchTerm))
    );
  });

  const onSubmitCreate = (data: VendorFormValues) => createMutation.mutate(data);
  const onSubmitEdit = (data: VendorFormValues) => {
    if (editingVendor) updateMutation.mutate({ id: editingVendor.id, data });
  };
  const handleDelete = () => {
    if (vendorToDelete) deleteMutation.mutate(vendorToDelete.id);
  };

  const openEditDialog = (vendor: Customer) => {
    setEditingVendor(vendor);
    const c2Name = (vendor as any).contact2Name || "";
    const c3Name = (vendor as any).contact3Name || "";
    setContact2Open(!!c2Name);
    setContact3Open(!!c3Name);
    setCurrencyManuallySet(true);
    setGstTypeManuallySet(true);
    form.reset({
      bpCode: vendor.bpCode,
      bpName: vendor.bpName,
      contactPerson: vendor.contactPerson || "",
      contactPosition: (vendor as any).contactPosition || "",
      email: vendor.email || "",
      phone1: (vendor as any).phone1 || "",
      contact2Name: c2Name,
      contact2Position: (vendor as any).contact2Position || "",
      contact2Email: (vendor as any).contact2Email || "",
      contact2Phone: (vendor as any).contact2Phone || "",
      contact3Name: c3Name,
      contact3Position: (vendor as any).contact3Position || "",
      contact3Email: (vendor as any).contact3Email || "",
      contact3Phone: (vendor as any).contact3Phone || "",
      billAddrLine1: (vendor as any).billAddrLine1 || "",
      billAddrLine2: (vendor as any).billAddrLine2 || "",
      billAddrBlock: (vendor as any).billAddrBlock || "",
      billAddrBuilding: (vendor as any).billAddrBuilding || "",
      billAddrCity: (vendor as any).billAddrCity || "",
      shipAddrLine1: (vendor as any).shipAddrLine1 || "",
      shipAddrLine2: (vendor as any).shipAddrLine2 || "",
      shipAddrBlock: (vendor as any).shipAddrBlock || "",
      shipAddrBuilding: (vendor as any).shipAddrBuilding || "",
      shipAddrCity: (vendor as any).shipAddrCity || "",
      cardType: "V",
      glblLocNum: ((vendor as any).glblLocNum && (vendor as any).glblLocNum !== 'NA') ? (vendor as any).glblLocNum : "",
      panNumber: (vendor as any).panNumber || "",
      uStateSupply: (vendor as any).uStateSupply || "MH",
      uBpGstType: (vendor as any).uBpGstType || "G",
      currency: (vendor as any).currency || "INR",
      continent: vendor.continent || "",
      countryName: vendor.countryName || "",
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (vendor: Customer) => {
    setVendorToDelete(vendor);
    setIsDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Search and Create bar */}
      <div className="flex justify-between items-center">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vendors..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1 h-7 w-7 p-0"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {canSapSync && (
            <div className="flex items-center gap-1">
              <input
                type="text"
                placeholder="V10001"
                value={testCardCode}
                onChange={(e) => setTestCardCode(e.target.value.toUpperCase())}
                className="border border-gray-300 rounded px-2 py-1 text-xs w-24 font-mono"
              />
              <Button
                variant="outline"
                size="sm"
                className="border-amber-300 text-amber-700 hover:bg-amber-50 gap-1 text-xs"
                onClick={() => testCardCode && sapSyncMutation.mutate(testCardCode)}
                disabled={sapSyncMutation.isPending || vendorBulkSyncMutation.isPending || !testCardCode}
                title="Test sync a single CardCode"
              >
                {sapSyncMutation.isPending
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Search className="h-3 w-3" />}
                Sync Specific Vendor
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-blue-300 text-blue-700 hover:bg-blue-50 gap-1 text-xs"
                onClick={() => vendorBulkSyncMutation.mutate()}
                disabled={true}
                title="Bulk sync temporarily disabled — use Sync Specific Vendor instead"
              >
                {vendorBulkSyncMutation.isPending
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Truck className="h-3 w-3" />}
                Sync Vendors from SAP
              </Button>
            </div>
          )}
          <Button
            onClick={async () => {
              form.reset(defaultFormValues);
              setContact2Open(false);
              setContact3Open(false);
              setCurrencyManuallySet(false);
              setGstTypeManuallySet(false);
              setIsCreateDialogOpen(true);
            }}
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Vendor
          </Button>
        </div>
      </div>

      {/* Vendors Table */}
      <Card>
        <CardHeader>
          <CardTitle>Vendors / Suppliers</CardTitle>
          <CardDescription>
            Manage your vendor and supplier business partners.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredVendors.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">
                {searchQuery
                  ? "No vendors found matching your search"
                  : "No vendors found. Create your first vendor!"}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[75px]">BP Code</TableHead>
                    <TableHead className="min-w-[250px]">BP Name</TableHead>
                    <TableHead>Contact Person</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>GST Type</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVendors.map((vendor) => (
                    <TableRow key={vendor.id}>
                      <TableCell className="font-medium font-mono text-xs">{vendor.bpCode}</TableCell>
                      <TableCell className="font-medium">{vendor.bpName}</TableCell>
                      <TableCell>{vendor.contactPerson || "-"}</TableCell>
                      <TableCell className="text-xs">{vendor.email || "-"}</TableCell>
                      <TableCell className="text-xs">{(vendor as any).phone1 || "-"}</TableCell>
                      <TableCell>{vendor.countryName || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          <Badge variant="secondary" className="text-xs">
                            {(vendor as any).uBpGstType === "G" ? "Regular"
                              : (vendor as any).uBpGstType === "E" ? "Export"
                              : (vendor as any).uBpGstType === "C" ? "Composition"
                              : (vendor as any).uBpGstType === "U" ? "Unregistered"
                              : (vendor as any).uBpGstType || "-"}
                          </Badge>
                          {(vendor as any).sapSyncStatus === 'failed' && (
                            <Badge variant="destructive" className="text-xs">SAP Sync Failed</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(vendor)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {(vendor as any).sapSyncStatus === 'failed' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => retrySapSyncMutation.mutate(vendor.id)}
                              disabled={retrySapSyncMutation.isPending}
                              title="Retry SAP Sync"
                            >
                              <RefreshCw className="h-4 w-4 text-amber-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => openDeleteDialog(vendor)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Create Vendor Dialog ── */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[1100px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Vendor / Supplier</DialogTitle>
            <DialogDescription>
              Enter the vendor details below to create a new business partner record.
            </DialogDescription>
          </DialogHeader>
          <VendorFormBody
            form={form}
            onSubmit={onSubmitCreate}
            onCancel={() => { setIsCreateDialogOpen(false); setBpCodeFetchError(null); }}
            isPending={createMutation.isPending}
            submitLabel="Create Vendor"
            bpCodeReadOnly={true}
            contact2Open={contact2Open}
            setContact2Open={setContact2Open}
            contact3Open={contact3Open}
            setContact3Open={setContact3Open}
            currencyManuallySet={currencyManuallySet}
            setCurrencyManuallySet={setCurrencyManuallySet}
            gstTypeManuallySet={gstTypeManuallySet}
            setGstTypeManuallySet={setGstTypeManuallySet}
            bpCodeFetchError={bpCodeFetchError}
            onRetryBpCode={fetchNextBpCode}
            isRetryingBpCode={isRetryingBpCode}
          />
          {/* vendorId intentionally omitted — compliance docs require vendor to exist first */}
        </DialogContent>
      </Dialog>

      {/* ── Edit Vendor Dialog ── */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) { setEditingVendor(null); setEditSapSyncError(null); } }}>
        <DialogContent className="sm:max-w-[1100px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Vendor / Supplier</DialogTitle>
            <DialogDescription>Update the vendor details below.</DialogDescription>
          </DialogHeader>
          <VendorFormBody
            form={form}
            onSubmit={onSubmitEdit}
            onCancel={() => { setIsEditDialogOpen(false); setEditingVendor(null); setEditSapSyncError(null); }}
            isPending={updateMutation.isPending}
            submitLabel="Update Vendor"
            bpCodeReadOnly={true}
            contact2Open={contact2Open}
            setContact2Open={setContact2Open}
            contact3Open={contact3Open}
            setContact3Open={setContact3Open}
            currencyManuallySet={currencyManuallySet}
            setCurrencyManuallySet={setCurrencyManuallySet}
            gstTypeManuallySet={gstTypeManuallySet}
            setGstTypeManuallySet={setGstTypeManuallySet}
            sapSyncFailureAlert={editSapSyncError}
            vendorId={editingVendor?.id}
          />
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this vendor? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {vendorToDelete && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Warning</AlertTitle>
                <AlertDescription>
                  You are about to delete {vendorToDelete.bpName} ({vendorToDelete.bpCode}).
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</>
              ) : (
                "Delete Vendor"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SAP Sync Result Dialog */}
      <Dialog open={showSapSyncResult} onOpenChange={setShowSapSyncResult}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>SAP Vendor Sync — Results</DialogTitle>
            <DialogDescription>Sync completed for BusinessPartners (CardType = V).</DialogDescription>
          </DialogHeader>
          {sapSyncResult && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border p-3 text-center">
                  <p className="text-2xl font-bold text-slate-800">{sapSyncResult.totalFetched}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Fetched from SAP</p>
                </div>
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700">{sapSyncResult.imported}</p>
                  <p className="text-xs text-emerald-600 mt-0.5">Imported</p>
                </div>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">{sapSyncResult.skipped}</p>
                  <p className="text-xs text-amber-600 mt-0.5">Updated (synced fields)</p>
                </div>
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">{sapSyncResult.failed}</p>
                  <p className="text-xs text-red-600 mt-0.5">Failed</p>
                </div>
              </div>
              {sapSyncResult.errors.length > 0 && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 max-h-40 overflow-y-auto">
                  <p className="text-xs font-medium text-red-700 mb-1">Error details:</p>
                  {sapSyncResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowSapSyncResult(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
