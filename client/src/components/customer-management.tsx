import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Customer } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, UseFormReturn } from "react-hook-form";
import { z } from "zod";
import CustomerImport from "./customer-import";
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
  Star,
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

// Create a schema for customer validation
const customerSchema = z.object({
  bpCode: z.string().min(1, "BP Code is required").max(50),
  bpName: z.string().min(1, "BP Name is required").max(100),
  contactPerson: z.string().min(1, "Contact Person is required"),
  contactPosition: z.string().optional(),
  email: z.string().email("Invalid email address").min(1, "Email is required"),
  phone1: z.string().min(1, "Cellular is required"),
  contact2Name: z.string().optional(),
  contact2Position: z.string().optional(),
  contact2Email: z.string().optional(),
  contact2Phone: z.string().optional(),
  contact3Name: z.string().optional(),
  contact3Position: z.string().optional(),
  contact3Email: z.string().optional(),
  contact3Phone: z.string().optional(),
  billToAddress: z.string().min(1, "Billing Address is required"),
  shipToAddress: z.string().min(1, "Shipping Address is required"),
  cardType: z.string().default("C"),
  glblLocNum: z.string().optional().default(""),
  uStateSupply: z.string().default("--"),
  uBpGstType: z.string().default("G"),
  currency: z.string().default("USD"),
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

type CustomerFormValues = z.infer<typeof customerSchema>;

// ── Indian GST State codes ──────────────────────────────────────────────────
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

// ── Shared form body (used in both Add and Edit dialogs) ──────────────────────
function CustomerFormBody({
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
}: {
  form: UseFormReturn<CustomerFormValues>;
  onSubmit: (data: CustomerFormValues) => void;
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
}) {
  const handleCountryChange = (val: string, fieldOnChange: (v: string) => void) => {
    fieldOnChange(val);
    const cont = countryToContinent[val];
    if (cont) form.setValue("continent", cont);
    // Only auto-set currency from country if not manually overridden
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

  // Update State of Supply based on Card Type + GST Type combination
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

  const handleCardTypeChange = (val: string, fieldOnChange: (v: string) => void) => {
    fieldOnChange(val);
    let newGstType = form.getValues("uBpGstType") || "G";
    if (val === "C") {
      // Customer → Export defaults
      if (!currencyManuallySet) form.setValue("currency", "USD");
      if (!gstTypeManuallySet) {
        form.setValue("uBpGstType", "E");
        newGstType = "E";
      }
    } else if (val === "S") {
      // Supplier → Domestic defaults
      if (!currencyManuallySet) form.setValue("currency", "INR");
      if (!gstTypeManuallySet) {
        form.setValue("uBpGstType", "G");
        newGstType = "G";
      }
    }
    updateStateSupply(val, newGstType);
  };

  const handleGstTypeChange = (val: string, fieldOnChange: (v: string) => void) => {
    fieldOnChange(val);
    setGstTypeManuallySet(true);
    const cardType = form.getValues("cardType") || "C";
    updateStateSupply(cardType, val);
    // Clear GSTIN when switching to Export
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
          <div className="grid grid-cols-[1fr_3fr] gap-3">
            <FormField
              control={form.control}
              name="bpCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>BP Code *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="C00001"
                      {...field}
                      readOnly={bpCodeReadOnly}
                      disabled={bpCodeReadOnly}
                      className={bpCodeReadOnly ? "opacity-70 cursor-not-allowed font-mono" : "font-mono"}
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
                    <Input placeholder="e.g., ABC Industries Ltd." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* ── Section 2: Primary Contact (highlighted) ── */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-blue-500" />
            <h4 className="text-sm font-semibold text-blue-700">Primary Contact</h4>
            <span className="ml-1 text-xs bg-blue-100 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5">Required</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="contactPerson"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., John Smith" {...field} />
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
                  <FormLabel>Position / Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Managing Director" {...field} />
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
                    <Input type="email" placeholder="e.g., contact@example.com" {...field} />
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
                  <FormLabel>Cellular *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., +91 98211 37879" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* ── Section 3: Contact 2 (collapsible) ── */}
        <div className="rounded-xl border border-gray-200 bg-gray-50/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setContact2Open(!contact2Open)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-100/70 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-600">
                Contact 2&nbsp;
                <span className="text-xs font-normal text-gray-400">(Optional)</span>
              </span>
            </div>
            {contact2Open
              ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
              : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
          </button>
          {contact2Open && (
            <div className="px-4 pb-4 pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="contact2Name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Jane Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact2Position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Position / Title</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Purchase Manager" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact2Email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="e.g., jane@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact2Phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cellular</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., +91 98765 43210" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
        </div>

        {/* ── Section 4: Contact 3 (collapsible) ── */}
        <div className="rounded-xl border border-gray-200 bg-gray-50/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setContact3Open(!contact3Open)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-100/70 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-600">
                Contact 3&nbsp;
                <span className="text-xs font-normal text-gray-400">(Optional)</span>
              </span>
            </div>
            {contact3Open
              ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
              : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
          </button>
          {contact3Open && (
            <div className="px-4 pb-4 pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="contact3Name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Bob Wilson" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact3Position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Position / Title</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Technical Head" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact3Email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="e.g., bob@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact3Phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cellular</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., +44 7911 123456" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
        </div>

        {/* ── Section 5: Address / Location ── */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-amber-500" />
            <h4 className="text-sm font-semibold text-amber-700">Address / Location</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="billToAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Billing Address *</FormLabel>
                  <FormControl>
                    <Textarea placeholder="e.g., 123 Business St, Mumbai 400001" rows={4} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="shipToAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center justify-between">
                    <span>Shipping Address *</span>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs text-amber-600 hover:text-amber-800"
                      onClick={() => form.setValue("shipToAddress", form.getValues("billToAddress") || "")}
                    >
                      Copy from Billing
                    </Button>
                  </FormLabel>
                  <FormControl>
                    <Textarea placeholder="e.g., 123 Business St, Mumbai 400001" rows={4} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    <SelectContent className="max-h-60">
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
                  <FormLabel>Continent *</FormLabel>
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

        {/* ── Section 6: Tax / Commercial Info ── */}
        <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-violet-500" />
            <h4 className="text-sm font-semibold text-violet-700">Tax / Commercial Info</h4>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Card Type — locked to C (Customer), read-only display */}
            <FormItem>
              <FormLabel>Card Type</FormLabel>
              <Input value="Customer (C)" readOnly className="bg-muted/60 cursor-not-allowed text-xs" />
            </FormItem>
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Currency</FormLabel>
                  <Select
                    onValueChange={(val) => {
                      field.onChange(val);
                      setCurrencyManuallySet(true);
                    }}
                    value={field.value || "USD"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="INR">INR</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="AED">AED</SelectItem>
                      <SelectItem value="SAR">SAR</SelectItem>
                    </SelectContent>
                  </Select>
                  {!currencyManuallySet && (
                    <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
                      Auto-set · change to override
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="uBpGstType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>GST Type</FormLabel>
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
                  {!gstTypeManuallySet && (
                    <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
                      Auto-set · change to override
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="uStateSupply"
              render={({ field }) => {
                const gstType = form.watch("uBpGstType") || "G";
                const cardType = form.watch("cardType") || "C";
                const isExport = cardType === "C" && gstType === "E";
                return (
                  <FormItem>
                    <FormLabel>State of Supply</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || "--"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={isExport ? "-- N/A --" : "Select state"} />
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

          {/* GSTIN — hidden for Export (E) */}
          {form.watch("uBpGstType") !== "E" && (
            <FormField
              control={form.control}
              name="glblLocNum"
              render={({ field }) => (
                <FormItem className="max-w-xs">
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
          )}
        </div>

        {bpCodeFetchError && (
          <Alert variant="destructive" className="mb-2">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>SAP B1 Unavailable</AlertTitle>
            <AlertDescription>{bpCodeFetchError}</AlertDescription>
          </Alert>
        )}
        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !!bpCodeFetchError}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {submitLabel === "Create Customer" ? "Creating..." : "Updating..."}
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function CustomerManagement({ customers }: { customers: Customer[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [showSapSyncResult, setShowSapSyncResult] = useState(false);
  const [sapSyncResult, setSapSyncResult] = useState<{
    totalFetched: number; imported: number; skipped: number; failed: number; errors: string[];
  } | null>(null);
  const [bpCodeFetchError, setBpCodeFetchError] = useState<string | null>(null);

  // Collapsible contact sections (shared state — reset on dialog open)
  const [contact2Open, setContact2Open] = useState(false);
  const [contact3Open, setContact3Open] = useState(false);

  // Track whether Currency / GST Type were manually set by the user
  // false = auto-managed by Card Type logic; true = user explicitly chose a value
  const [currencyManuallySet, setCurrencyManuallySet] = useState(false);
  const [gstTypeManuallySet, setGstTypeManuallySet] = useState(false);

  const SAP_SYNC_ROLES = ['Superuser', 'General Manager', 'Senior Manager'];
  const canSapSync = SAP_SYNC_ROLES.includes((user as any)?.role ?? '');

  const [testCardCode, setTestCardCode] = useState('');

  const sapSyncMutation = useMutation({
    mutationFn: (cardCode?: string) => apiRequest('POST', '/api/customers/sap-sync', cardCode ? { cardCode } : {}),
    onSuccess: (data: any) => {
      setSapSyncResult(data);
      setShowSapSyncResult(true);
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      toast({ title: 'SAP Sync complete', description: `Imported ${data.imported}, skipped ${data.skipped}` });
    },
    onError: (err: any) => {
      toast({ title: 'SAP Sync failed', description: err.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  const forceResetSapMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/sap/session/force-reset'),
    onSuccess: (data: any) => {
      toast({ title: 'SAP Session Reset', description: data?.message ?? 'Session cleared — next sync will do a fresh login.' });
    },
    onError: (err: any) => {
      toast({ title: 'Force Reset Failed', description: err.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const defaultFormValues: CustomerFormValues = {
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
    billToAddress: "",
    shipToAddress: "",
    cardType: "C",
    glblLocNum: "",
    uStateSupply: "--",
    uBpGstType: "G",
    currency: "USD",
    continent: "",
    countryName: "",
  };

  // Define form
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: defaultFormValues,
  });

  // Create customer mutation
  const createMutation = useMutation({
    mutationFn: async (data: CustomerFormValues) => {
      return await apiRequest("POST", "/api/customers", { ...data, cardType: "C" });
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      const sapStatus = response?.sapSyncStatus;
      toast({
        title: "Customer created",
        description: sapStatus === 'synced'
          ? "Customer created and synced to SAP B1 successfully."
          : sapStatus === 'failed'
          ? `Customer created locally. SAP sync failed: ${response?.sapSyncError || 'Unknown error'}`
          : "Customer created locally. SAP sync was skipped.",
        variant: sapStatus === 'failed' ? "destructive" : "default",
      });
      setIsCreateDialogOpen(false);
      form.reset(defaultFormValues);
    },
    onError: (error) => {
      toast({
        title: "Failed to create customer",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update customer mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CustomerFormValues }) => {
      return await apiRequest("PUT", `/api/customers/${id}`, { ...data, cardType: "C" });
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      const sapStatus = response?.sapSyncStatus;
      toast({
        title: "Customer updated",
        description: sapStatus === 'synced'
          ? "Customer updated and synced to SAP B1 successfully."
          : sapStatus === 'failed'
          ? `Customer updated locally. SAP sync failed: ${response?.sapSyncError || 'Unknown error'}`
          : "Customer updated locally. SAP sync was skipped.",
        variant: sapStatus === 'failed' ? "destructive" : "default",
      });
      setIsEditDialogOpen(false);
      setEditingCustomer(null);
    },
    onError: (error) => {
      toast({
        title: "Failed to update customer",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete customer mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/customers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Customer deleted",
        description: "The customer has been deleted successfully.",
      });
      setIsDeleteDialogOpen(false);
      setCustomerToDelete(null);
    },
    onError: (error) => {
      toast({
        title: "Failed to delete customer",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Filter customers based on search query
  const filteredCustomers = customers.filter((customer) => {
    const searchTerm = searchQuery.toLowerCase();
    return (
      customer.bpCode.toLowerCase().includes(searchTerm) ||
      customer.bpName.toLowerCase().includes(searchTerm) ||
      (customer.contactPerson && customer.contactPerson.toLowerCase().includes(searchTerm)) ||
      (customer.email && customer.email.toLowerCase().includes(searchTerm))
    );
  });

  // Handle form submissions
  const onSubmitCreate = (data: CustomerFormValues) => {
    createMutation.mutate(data);
  };

  const onSubmitEdit = (data: CustomerFormValues) => {
    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer.id, data });
    }
  };

  const handleDelete = () => {
    if (customerToDelete) {
      deleteMutation.mutate(customerToDelete.id);
    }
  };

  // Open edit dialog and populate form with customer data
  const openEditDialog = (customer: Customer) => {
    setEditingCustomer(customer);
    const c2Name = (customer as any).contact2Name || "";
    const c3Name = (customer as any).contact3Name || "";
    // Auto-expand additional contact sections if they have data
    setContact2Open(!!c2Name);
    setContact3Open(!!c3Name);
    // For edit: treat existing Currency & GST Type as manually set — don't auto-overwrite them
    setCurrencyManuallySet(true);
    setGstTypeManuallySet(true);
    form.reset({
      bpCode: customer.bpCode,
      bpName: customer.bpName,
      contactPerson: customer.contactPerson || "",
      contactPosition: (customer as any).contactPosition || "",
      email: customer.email || "",
      phone1: (customer as any).phone1 || "",
      contact2Name: c2Name,
      contact2Position: (customer as any).contact2Position || "",
      contact2Email: (customer as any).contact2Email || "",
      contact2Phone: (customer as any).contact2Phone || "",
      contact3Name: c3Name,
      contact3Position: (customer as any).contact3Position || "",
      contact3Email: (customer as any).contact3Email || "",
      contact3Phone: (customer as any).contact3Phone || "",
      billToAddress: customer.billToAddress || "",
      shipToAddress: customer.shipToAddress || "",
      cardType: (customer as any).cardType || "C",
      glblLocNum: (customer as any).glblLocNum || "NA",
      uStateSupply: (customer as any).uStateSupply || "MH",
      uBpGstType: (customer as any).uBpGstType || "G",
      currency: (customer as any).currency || (customer.countryName === 'India' ? 'INR' : 'USD'),
      continent: customer.continent || "",
      countryName: customer.countryName || "",
    });
    setIsEditDialogOpen(true);
  };

  // Open delete confirmation dialog
  const openDeleteDialog = (customer: Customer) => {
    setCustomerToDelete(customer);
    setIsDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Search and Create bar */}
      <div className="flex justify-between items-center">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
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
            <>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  placeholder="C10301"
                  value={testCardCode}
                  onChange={(e) => setTestCardCode(e.target.value.toUpperCase())}
                  className="border border-gray-300 rounded px-2 py-1 text-xs w-24 font-mono"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="border-amber-300 text-amber-700 hover:bg-amber-50 gap-1 text-xs"
                  onClick={() => testCardCode && sapSyncMutation.mutate(testCardCode)}
                  disabled={sapSyncMutation.isPending || !testCardCode}
                  title="Test sync a single CardCode"
                >
                  {sapSyncMutation.isPending
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Search className="h-3 w-3" />}
                  Sync Specific Customer
                </Button>
              </div>
            </>
          )}
          <Button
            onClick={async () => {
              form.reset(defaultFormValues);
              setContact2Open(false);
              setContact3Open(false);
              setCurrencyManuallySet(false);
              setGstTypeManuallySet(false);
              // Apply Customer defaults on fresh open
              form.setValue("currency", "USD");
              form.setValue("uBpGstType", "E");
              form.setValue("uStateSupply", "--"); // Export → no state
              form.setValue("glblLocNum", "");   // Export → no GSTIN
              setBpCodeFetchError(null);
              form.setValue('bpCode', '');
              try {
                const res = await apiRequest("GET", "/api/customers/next-bp-code");
                if (res?.nextBpCode) {
                  form.setValue('bpCode', res.nextBpCode);
                  setBpCodeFetchError(null);
                } else if (res?.error) {
                  setBpCodeFetchError(res.error);
                }
              } catch (e: any) {
                setBpCodeFetchError(e?.message ?? 'SAP B1 is unavailable. Cannot generate BP Code. Retry after SAP is restored.');
              }
              setIsCreateDialogOpen(true);
            }}
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Customer
          </Button>
        </div>
      </div>

      {/* Customers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Customers</CardTitle>
          <CardDescription>
            Manage your business partners with full CRUD operations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredCustomers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">
                {searchQuery
                  ? "No customers found matching your search"
                  : "No customers found. Create your first customer!"}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[75px]">BP Code</TableHead>
                    <TableHead className="min-w-[250px]">BP Name</TableHead>
                    <TableHead className="w-[80px]">Card Type</TableHead>
                    <TableHead>Contact Person</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Cellular</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Continent</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium font-mono text-xs">{customer.bpCode}</TableCell>
                      <TableCell className="font-medium">{customer.bpName}</TableCell>
                      <TableCell>
                        <Badge
                          variant={(customer as any).cardType === "S" ? "secondary" : (customer as any).cardType === "L" ? "outline" : "default"}
                          className="text-xs"
                        >
                          {(customer as any).cardType === "S" ? "Supplier" : (customer as any).cardType === "L" ? "Lead" : "Customer"}
                        </Badge>
                      </TableCell>
                      <TableCell>{customer.contactPerson || "-"}</TableCell>
                      <TableCell className="text-xs">{customer.email || "-"}</TableCell>
                      <TableCell className="text-xs">{(customer as any).phone1 || "-"}</TableCell>
                      <TableCell>{customer.countryName || "-"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{customer.continent || "-"}</TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(customer)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(customer)}
                          >
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

      {/* ── Create Customer Dialog ── */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>
              Enter the customer details below to create a new business partner record.
            </DialogDescription>
          </DialogHeader>
          <CustomerFormBody
            form={form}
            onSubmit={onSubmitCreate}
            onCancel={() => { setIsCreateDialogOpen(false); setBpCodeFetchError(null); }}
            isPending={createMutation.isPending}
            submitLabel="Create Customer"
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
          />
        </DialogContent>
      </Dialog>

      {/* ── Edit Customer Dialog ── */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>
              Update the customer details below.
            </DialogDescription>
          </DialogHeader>
          <CustomerFormBody
            form={form}
            onSubmit={onSubmitEdit}
            onCancel={() => { setIsEditDialogOpen(false); setEditingCustomer(null); }}
            isPending={updateMutation.isPending}
            submitLabel="Update Customer"
            bpCodeReadOnly={true}
            contact2Open={contact2Open}
            setContact2Open={setContact2Open}
            contact3Open={contact3Open}
            setContact3Open={setContact3Open}
            currencyManuallySet={currencyManuallySet}
            setCurrencyManuallySet={setCurrencyManuallySet}
            gstTypeManuallySet={gstTypeManuallySet}
            setGstTypeManuallySet={setGstTypeManuallySet}
          />
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this customer? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {customerToDelete && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Warning</AlertTitle>
                <AlertDescription>
                  You are about to delete {customerToDelete.bpName} ({customerToDelete.bpCode}).
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Customer"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer Import Dialog */}
      <CustomerImport
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
      />

      {/* SAP Sync Result Dialog */}
      <Dialog open={showSapSyncResult} onOpenChange={setShowSapSyncResult}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>SAP Customer Sync — Results</DialogTitle>
            <DialogDescription>
              Sync completed for BusinessPartners where CardCode &gt; C10300.
            </DialogDescription>
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
                  <p className="text-xs text-amber-600 mt-0.5">Skipped (already exist)</p>
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
