import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { 
  Plus, 
  Calendar, 
  MapPin, 
  Clock, 
  DollarSign, 
  FileText, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Plane,
  Hotel,
  Car,
  Receipt,
  Users,
  TrendingUp,
  Upload,
  Download,
  Trash2,
  Eye,
  Paperclip
} from 'lucide-react';

// Form schemas
const tripFormSchema = z.object({
  employeeId: z.string().min(1, 'Employee is required'),
  tripTitle: z.string().min(1, 'Trip title is required'),
  purpose: z.string().min(1, 'Purpose is required'),
  destination: z.string().min(1, 'Destination is required'),
  fromDate: z.string().min(1, 'From date is required'),
  toDate: z.string().min(1, 'To date is required'),
  estimatedTravelCost: z.string().default('0'),
  estimatedAccommodationCost: z.string().default('0'),
  estimatedMiscCost: z.string().default('0'),
  advanceRequested: z.string().default('0'),
  supportingDocumentUrl: z.string().optional(),
});

const approvalFormSchema = z.object({
  action: z.enum(['approve', 'reject']),
  comments: z.string().optional(),
  approvalType: z.enum(['manager', 'admin', 'finance']),
});

const documentUploadSchema = z.object({
  documentType: z.string().min(1, 'Document type is required'),
  description: z.string().optional(),
});

type TripFormData = z.infer<typeof tripFormSchema>;
type ApprovalFormData = z.infer<typeof approvalFormSchema>;
type DocumentUploadData = z.infer<typeof documentUploadSchema>;

// Document type options
const documentTypeOptions = [
  { value: 'travel_booking', label: 'Travel Booking' },
  { value: 'hotel_confirmation', label: 'Hotel Confirmation' },
  { value: 'meeting_invitation', label: 'Meeting Invitation' },
  { value: 'visa_documents', label: 'Visa Documents' },
  { value: 'advance_payment_request', label: 'Advance Payment Request' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'expense_receipt', label: 'Expense Receipt' },
  { value: 'trip_report', label: 'Trip Report' },
];

// Countries list for destination dropdown
const countries = [
  { code: 'AF', name: 'Afghanistan' },
  { code: 'AL', name: 'Albania' },
  { code: 'DZ', name: 'Algeria' },
  { code: 'AS', name: 'American Samoa' },
  { code: 'AD', name: 'Andorra' },
  { code: 'AO', name: 'Angola' },
  { code: 'AI', name: 'Anguilla' },
  { code: 'AQ', name: 'Antarctica' },
  { code: 'AG', name: 'Antigua and Barbuda' },
  { code: 'AR', name: 'Argentina' },
  { code: 'AM', name: 'Armenia' },
  { code: 'AW', name: 'Aruba' },
  { code: 'AU', name: 'Australia' },
  { code: 'AT', name: 'Austria' },
  { code: 'AZ', name: 'Azerbaijan' },
  { code: 'BS', name: 'Bahamas' },
  { code: 'BH', name: 'Bahrain' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'BB', name: 'Barbados' },
  { code: 'BY', name: 'Belarus' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BZ', name: 'Belize' },
  { code: 'BJ', name: 'Benin' },
  { code: 'BM', name: 'Bermuda' },
  { code: 'BT', name: 'Bhutan' },
  { code: 'BO', name: 'Bolivia' },
  { code: 'BQ', name: 'Bonaire' },
  { code: 'BA', name: 'Bosnia and Herzegovina' },
  { code: 'BW', name: 'Botswana' },
  { code: 'BV', name: 'Bouvet Island' },
  { code: 'BR', name: 'Brazil' },
  { code: 'IO', name: 'British Indian Ocean Territory' },
  { code: 'BN', name: 'Brunei' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'BF', name: 'Burkina Faso' },
  { code: 'BI', name: 'Burundi' },
  { code: 'CV', name: 'Cape Verde' },
  { code: 'KH', name: 'Cambodia' },
  { code: 'CM', name: 'Cameroon' },
  { code: 'CA', name: 'Canada' },
  { code: 'KY', name: 'Cayman Islands' },
  { code: 'CF', name: 'Central African Republic' },
  { code: 'TD', name: 'Chad' },
  { code: 'CL', name: 'Chile' },
  { code: 'CN', name: 'China' },
  { code: 'CX', name: 'Christmas Island' },
  { code: 'CC', name: 'Cocos Islands' },
  { code: 'CO', name: 'Colombia' },
  { code: 'KM', name: 'Comoros' },
  { code: 'CG', name: 'Congo' },
  { code: 'CD', name: 'Congo (Democratic Republic)' },
  { code: 'CK', name: 'Cook Islands' },
  { code: 'CR', name: 'Costa Rica' },
  { code: 'CI', name: 'Côte d\'Ivoire' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CU', name: 'Cuba' },
  { code: 'CW', name: 'Curaçao' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'DK', name: 'Denmark' },
  { code: 'DJ', name: 'Djibouti' },
  { code: 'DM', name: 'Dominica' },
  { code: 'DO', name: 'Dominican Republic' },
  { code: 'EC', name: 'Ecuador' },
  { code: 'EG', name: 'Egypt' },
  { code: 'SV', name: 'El Salvador' },
  { code: 'GQ', name: 'Equatorial Guinea' },
  { code: 'ER', name: 'Eritrea' },
  { code: 'EE', name: 'Estonia' },
  { code: 'SZ', name: 'Eswatini' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'FK', name: 'Falkland Islands' },
  { code: 'FO', name: 'Faroe Islands' },
  { code: 'FJ', name: 'Fiji' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'GF', name: 'French Guiana' },
  { code: 'PF', name: 'French Polynesia' },
  { code: 'TF', name: 'French Southern Territories' },
  { code: 'GA', name: 'Gabon' },
  { code: 'GM', name: 'Gambia' },
  { code: 'GE', name: 'Georgia' },
  { code: 'DE', name: 'Germany' },
  { code: 'GH', name: 'Ghana' },
  { code: 'GI', name: 'Gibraltar' },
  { code: 'GR', name: 'Greece' },
  { code: 'GL', name: 'Greenland' },
  { code: 'GD', name: 'Grenada' },
  { code: 'GP', name: 'Guadeloupe' },
  { code: 'GU', name: 'Guam' },
  { code: 'GT', name: 'Guatemala' },
  { code: 'GG', name: 'Guernsey' },
  { code: 'GN', name: 'Guinea' },
  { code: 'GW', name: 'Guinea-Bissau' },
  { code: 'GY', name: 'Guyana' },
  { code: 'HT', name: 'Haiti' },
  { code: 'HM', name: 'Heard Island and McDonald Islands' },
  { code: 'VA', name: 'Holy See' },
  { code: 'HN', name: 'Honduras' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IS', name: 'Iceland' },
  { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IR', name: 'Iran' },
  { code: 'IQ', name: 'Iraq' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IM', name: 'Isle of Man' },
  { code: 'IL', name: 'Israel' },
  { code: 'IT', name: 'Italy' },
  { code: 'JM', name: 'Jamaica' },
  { code: 'JP', name: 'Japan' },
  { code: 'JE', name: 'Jersey' },
  { code: 'JO', name: 'Jordan' },
  { code: 'KZ', name: 'Kazakhstan' },
  { code: 'KE', name: 'Kenya' },
  { code: 'KI', name: 'Kiribati' },
  { code: 'KP', name: 'Korea (North)' },
  { code: 'KR', name: 'Korea (South)' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'KG', name: 'Kyrgyzstan' },
  { code: 'LA', name: 'Laos' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LB', name: 'Lebanon' },
  { code: 'LS', name: 'Lesotho' },
  { code: 'LR', name: 'Liberia' },
  { code: 'LY', name: 'Libya' },
  { code: 'LI', name: 'Liechtenstein' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MO', name: 'Macao' },
  { code: 'MK', name: 'Macedonia' },
  { code: 'MG', name: 'Madagascar' },
  { code: 'MW', name: 'Malawi' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'MV', name: 'Maldives' },
  { code: 'ML', name: 'Mali' },
  { code: 'MT', name: 'Malta' },
  { code: 'MH', name: 'Marshall Islands' },
  { code: 'MQ', name: 'Martinique' },
  { code: 'MR', name: 'Mauritania' },
  { code: 'MU', name: 'Mauritius' },
  { code: 'YT', name: 'Mayotte' },
  { code: 'MX', name: 'Mexico' },
  { code: 'FM', name: 'Micronesia' },
  { code: 'MD', name: 'Moldova' },
  { code: 'MC', name: 'Monaco' },
  { code: 'MN', name: 'Mongolia' },
  { code: 'ME', name: 'Montenegro' },
  { code: 'MS', name: 'Montserrat' },
  { code: 'MA', name: 'Morocco' },
  { code: 'MZ', name: 'Mozambique' },
  { code: 'MM', name: 'Myanmar' },
  { code: 'NA', name: 'Namibia' },
  { code: 'NR', name: 'Nauru' },
  { code: 'NP', name: 'Nepal' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NC', name: 'New Caledonia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'NI', name: 'Nicaragua' },
  { code: 'NE', name: 'Niger' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'NU', name: 'Niue' },
  { code: 'NF', name: 'Norfolk Island' },
  { code: 'MP', name: 'Northern Mariana Islands' },
  { code: 'NO', name: 'Norway' },
  { code: 'OM', name: 'Oman' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'PW', name: 'Palau' },
  { code: 'PS', name: 'Palestine' },
  { code: 'PA', name: 'Panama' },
  { code: 'PG', name: 'Papua New Guinea' },
  { code: 'PY', name: 'Paraguay' },
  { code: 'PE', name: 'Peru' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PN', name: 'Pitcairn' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'PR', name: 'Puerto Rico' },
  { code: 'QA', name: 'Qatar' },
  { code: 'RE', name: 'Réunion' },
  { code: 'RO', name: 'Romania' },
  { code: 'RU', name: 'Russia' },
  { code: 'RW', name: 'Rwanda' },
  { code: 'BL', name: 'Saint Barthélemy' },
  { code: 'SH', name: 'Saint Helena' },
  { code: 'KN', name: 'Saint Kitts and Nevis' },
  { code: 'LC', name: 'Saint Lucia' },
  { code: 'MF', name: 'Saint Martin' },
  { code: 'PM', name: 'Saint Pierre and Miquelon' },
  { code: 'VC', name: 'Saint Vincent and the Grenadines' },
  { code: 'WS', name: 'Samoa' },
  { code: 'SM', name: 'San Marino' },
  { code: 'ST', name: 'Sao Tome and Principe' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'SN', name: 'Senegal' },
  { code: 'RS', name: 'Serbia' },
  { code: 'SC', name: 'Seychelles' },
  { code: 'SL', name: 'Sierra Leone' },
  { code: 'SG', name: 'Singapore' },
  { code: 'SX', name: 'Sint Maarten' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'SB', name: 'Solomon Islands' },
  { code: 'SO', name: 'Somalia' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'GS', name: 'South Georgia and the South Sandwich Islands' },
  { code: 'SS', name: 'South Sudan' },
  { code: 'ES', name: 'Spain' },
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'SD', name: 'Sudan' },
  { code: 'SR', name: 'Suriname' },
  { code: 'SJ', name: 'Svalbard and Jan Mayen' },
  { code: 'SE', name: 'Sweden' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'SY', name: 'Syria' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'TJ', name: 'Tajikistan' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'TH', name: 'Thailand' },
  { code: 'TL', name: 'Timor-Leste' },
  { code: 'TG', name: 'Togo' },
  { code: 'TK', name: 'Tokelau' },
  { code: 'TO', name: 'Tonga' },
  { code: 'TT', name: 'Trinidad and Tobago' },
  { code: 'TN', name: 'Tunisia' },
  { code: 'TR', name: 'Turkey' },
  { code: 'TM', name: 'Turkmenistan' },
  { code: 'TC', name: 'Turks and Caicos Islands' },
  { code: 'TV', name: 'Tuvalu' },
  { code: 'UG', name: 'Uganda' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'UM', name: 'United States Minor Outlying Islands' },
  { code: 'UY', name: 'Uruguay' },
  { code: 'UZ', name: 'Uzbekistan' },
  { code: 'VU', name: 'Vanuatu' },
  { code: 'VE', name: 'Venezuela' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'VG', name: 'Virgin Islands (British)' },
  { code: 'VI', name: 'Virgin Islands (U.S.)' },
  { code: 'WF', name: 'Wallis and Futuna' },
  { code: 'EH', name: 'Western Sahara' },
  { code: 'YE', name: 'Yemen' },
  { code: 'ZM', name: 'Zambia' },
  { code: 'ZW', name: 'Zimbabwe' }
];

// Status badge component
const StatusBadge = ({ status }: { status: string }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'submitted':
        return 'bg-yellow-100 text-yellow-800';
      case 'manager_approved':
        return 'bg-blue-100 text-blue-800';
      case 'final_approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'draft':
        return 'Draft';
      case 'submitted':
        return 'Submitted';
      case 'manager_approved':
        return 'Manager Approved';
      case 'final_approved':
        return 'Final Approved';
      case 'rejected':
        return 'Rejected';
      default:
        return status;
    }
  };

  return (
    <Badge className={getStatusColor(status)}>
      {getStatusText(status)}
    </Badge>
  );
};

// Trip request form component
const TripRequestForm = ({ onSuccess }: { onSuccess?: () => void }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Get employees list for dropdown
  const { data: employees = [] } = useQuery({
    queryKey: ['/api/admin/users'],
    queryFn: () => apiRequest('GET', '/api/admin/users')
  });

  // Group employees by role for organized dropdown
  const groupedEmployees = React.useMemo(() => {
    const roleOrder = ['Superuser', 'General Manager', 'Senior Manager', 'Manager', 'Employee'];
    const groups: Record<string, any[]> = {};
    
    employees.forEach((employee: any) => {
      const role = employee.role || 'Employee';
      if (!groups[role]) {
        groups[role] = [];
      }
      groups[role].push(employee);
    });
    
    // Sort employees within each group alphabetically
    Object.values(groups).forEach(group => {
      group.sort((a, b) => {
        const nameA = a.firstName && a.lastName ? `${a.firstName} ${a.lastName}` : a.username;
        const nameB = b.firstName && b.lastName ? `${b.firstName} ${b.lastName}` : b.username;
        return nameA.localeCompare(nameB);
      });
    });
    
    return roleOrder.filter(role => groups[role]).map(role => ({
      role,
      employees: groups[role]
    }));
  }, [employees]);
  
  const form = useForm<TripFormData>({
    resolver: zodResolver(tripFormSchema),
    defaultValues: {
      employeeId: '',
      tripTitle: '',
      purpose: '',
      destination: '',
      fromDate: '',
      toDate: '',
      estimatedTravelCost: '0',
      estimatedAccommodationCost: '0',
      estimatedMiscCost: '0',
      advanceRequested: '0',
      supportingDocumentUrl: '',
    },
  });

  const createTripMutation = useMutation({
    mutationFn: (data: TripFormData) => apiRequest('POST', '/api/trips', data),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Trip request created successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/trips'] });
      form.reset();
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create trip request',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: TripFormData) => {
    createTripMutation.mutate(data);
  };

  const totalEstimatedCost = 
    parseFloat(form.watch('estimatedTravelCost') || '0') +
    parseFloat(form.watch('estimatedAccommodationCost') || '0') +
    parseFloat(form.watch('estimatedMiscCost') || '0');

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Employee Selection */}
        <FormField
          control={form.control}
          name="employeeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Employee *</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee for trip request" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {groupedEmployees.map((group) => (
                    <SelectGroup key={group.role}>
                      <SelectLabel className="text-blue-600 font-semibold">
                        {group.role}
                      </SelectLabel>
                      {group.employees.map((employee: any) => (
                        <SelectItem key={employee.id} value={employee.id.toString()}>
                          {employee.firstName && employee.lastName 
                            ? `${employee.firstName} ${employee.lastName}` 
                            : employee.username}
                          {employee.department && ` • ${employee.department}`}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="tripTitle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Trip Title</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Client Meeting in Mumbai" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="destination"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Destination Country *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select destination country" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {countries.map((country) => (
                      <SelectItem key={country.code} value={country.name}>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="purpose"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Purpose of Travel</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Describe the purpose of your business trip..." 
                  rows={3}
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="fromDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>From Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="toDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>To Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Estimated Costs</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="estimatedTravelCost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Travel Cost (₹)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="estimatedAccommodationCost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Accommodation Cost (₹)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="estimatedMiscCost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Miscellaneous Cost (₹)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="font-medium">Total Estimated Cost:</span>
              <span className="text-lg font-bold text-blue-600">₹{totalEstimatedCost.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <FormField
          control={form.control}
          name="advanceRequested"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Advance Requested (₹)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" placeholder="0" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="supportingDocumentUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Supporting Document URL</FormLabel>
              <FormControl>
                <Input placeholder="https://..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-4">
          <Button type="button" variant="outline" onClick={() => form.reset()}>
            Reset
          </Button>
          <Button type="submit" disabled={createTripMutation.isPending}>
            {createTripMutation.isPending ? 'Creating...' : 'Create Trip Request'}
          </Button>
        </div>
      </form>
    </Form>
  );
};

// Trip dashboard component
const TripDashboard = () => {
  const { data: dashboard } = useQuery({
    queryKey: ['/api/trips/dashboard'],
    queryFn: () => apiRequest('GET', '/api/trips/dashboard'),
  });

  if (!dashboard) return <div>Loading dashboard...</div>;

  const statusCounts = dashboard.statusCounts || [];
  const upcomingTrips = dashboard.upcomingTrips || [];
  const pendingApprovals = dashboard.pendingApprovals || [];

  return (
    <div className="space-y-6">
      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {statusCounts.map((status: any) => (
          <Card key={status.status}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 capitalize">{status.status.replace('_', ' ')}</p>
                  <p className="text-2xl font-bold">{status.count}</p>
                </div>
                <div className="text-blue-600">
                  {status.status === 'final_approved' && <CheckCircle className="h-8 w-8" />}
                  {status.status === 'rejected' && <XCircle className="h-8 w-8" />}
                  {status.status === 'submitted' && <Clock className="h-8 w-8" />}
                  {status.status === 'draft' && <FileText className="h-8 w-8" />}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Upcoming Trips */}
      {upcomingTrips.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Upcoming Trips
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {upcomingTrips.map((trip: any) => (
                <div key={trip.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">{trip.tripTitle}</p>
                    <p className="text-sm text-gray-600">{trip.destination}</p>
                    <p className="text-sm text-gray-600">{trip.employeeName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{new Date(trip.fromDate).toLocaleDateString()}</p>
                    <StatusBadge status={trip.status} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Approvals */}
      {pendingApprovals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Pending Approvals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingApprovals.map((trip: any) => (
                <div key={trip.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                  <div>
                    <p className="font-medium">{trip.tripTitle}</p>
                    <p className="text-sm text-gray-600">{trip.destination}</p>
                    <p className="text-sm text-gray-600">{trip.employeeName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{new Date(trip.fromDate).toLocaleDateString()}</p>
                    <StatusBadge status={trip.status} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// Trip list component
const TripList = () => {
  const { data: trips, isLoading } = useQuery({
    queryKey: ['/api/trips/user'],
    queryFn: () => apiRequest('GET', '/api/trips/user'),
  });

  if (isLoading) return <div>Loading trips...</div>;

  return (
    <div className="space-y-4">
      {trips?.map((trip: any) => (
        <Card key={trip.id}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-semibold mb-2">{trip.tripTitle}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span>{trip.destination}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>{new Date(trip.fromDate).toLocaleDateString()} - {new Date(trip.toDate).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    <span>₹{(parseFloat(trip.estimatedTravelCost) + parseFloat(trip.estimatedAccommodationCost) + parseFloat(trip.estimatedMiscCost)).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>{new Date(trip.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <p className="mt-2 text-sm text-gray-700">{trip.purpose}</p>
              </div>
              <div className="ml-4">
                <StatusBadge status={trip.status} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

// Document Upload Component
const DocumentUploadForm = ({ tripId, onSuccess }: { tripId: number; onSuccess?: () => void }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const form = useForm<DocumentUploadData>({
    resolver: zodResolver(documentUploadSchema),
    defaultValues: {
      documentType: '',
      description: '',
    },
  });

  const uploadDocument = useMutation({
    mutationFn: async (data: { file: File; documentType: string; description?: string }) => {
      const formData = new FormData();
      formData.append('file', data.file);
      formData.append('documentType', data.documentType);
      if (data.description) {
        formData.append('description', data.description);
      }

      const response = await fetch(`/api/trips/${tripId}/documents`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Document uploaded successfully',
      });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/documents`] });
      form.reset();
      setSelectedFile(null);
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setSelectedFile(file || null);
  };

  const onSubmit = (data: DocumentUploadData) => {
    if (!selectedFile) {
      toast({
        title: 'Error',
        description: 'Please select a file to upload',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    uploadDocument.mutate({
      file: selectedFile,
      documentType: data.documentType,
      description: data.description || undefined,
    }, {
      onSettled: () => setIsUploading(false),
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="documentType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Document Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select document type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {documentTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Brief description of the document" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="file">Select File</Label>
            <div className="flex items-center space-x-2">
              <Input
                id="file"
                type="file"
                onChange={handleFileChange}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.txt,.zip"
                className="flex-1"
              />
              <Upload className="h-4 w-4 text-gray-500" />
            </div>
            {selectedFile && (
              <div className="text-sm text-gray-600">
                Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
              </div>
            )}
            <div className="text-xs text-gray-500">
              Supported formats: PDF, DOC, DOCX, XLS, XLSX, Images, TXT, ZIP (Max 50MB)
            </div>
          </div>

          <Button 
            type="submit" 
            disabled={isUploading || !selectedFile || !form.watch('documentType')}
            className="w-full"
          >
            {isUploading ? (
              <>
                <Upload className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload Document
              </>
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
};

// Trip Documents List Component
const TripDocumentsList = ({ tripId }: { tripId: number }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: documents = [], isLoading } = useQuery({
    queryKey: [`/api/trips/${tripId}/documents`],
    queryFn: () => apiRequest('GET', `/api/trips/${tripId}/documents`),
  });

  const deleteDocument = useMutation({
    mutationFn: (documentId: number) => 
      apiRequest('DELETE', `/api/trip-documents/${documentId}`),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Document deleted successfully',
      });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/documents`] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete document',
        variant: 'destructive',
      });
    },
  });

  const downloadDocument = async (documentId: number) => {
    try {
      const response = await apiRequest('GET', `/api/trip-documents/${documentId}/download`);
      window.open(response.downloadUrl, '_blank');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to download document',
        variant: 'destructive',
      });
    }
  };

  const getDocumentIcon = (fileType: string) => {
    if (fileType?.includes('pdf')) return <FileText className="h-4 w-4 text-red-600" />;
    if (fileType?.includes('image')) return <Eye className="h-4 w-4 text-blue-600" />;
    if (fileType?.includes('document') || fileType?.includes('word')) return <FileText className="h-4 w-4 text-blue-600" />;
    if (fileType?.includes('sheet') || fileType?.includes('excel')) return <FileText className="h-4 w-4 text-green-600" />;
    return <Paperclip className="h-4 w-4 text-gray-600" />;
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return 'Unknown';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDocumentType = (type: string) => {
    return documentTypeOptions.find(opt => opt.value === type)?.label || type;
  };

  if (isLoading) {
    return <div className="text-center py-4">Loading documents...</div>;
  }

  if (!documents.length) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Paperclip className="h-12 w-12 mx-auto mb-4 text-gray-300" />
        <p>No documents uploaded yet</p>
        <p className="text-sm">Upload travel documents to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {documents.map((doc: any) => (
        <div key={doc.id} className="border rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3 flex-1">
              {getDocumentIcon(doc.fileType)}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-sm truncate">{doc.documentName}</h4>
                <div className="text-xs text-gray-500 mt-1 space-y-1">
                  <div>Type: {formatDocumentType(doc.documentType)}</div>
                  <div>Size: {formatFileSize(doc.fileSize)}</div>
                  <div>Uploaded by: {doc.uploadedByName}</div>
                  <div>Date: {new Date(doc.uploadedAt).toLocaleDateString()}</div>
                  {doc.description && (
                    <div className="text-gray-600">Description: {doc.description}</div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2 ml-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadDocument(doc.id)}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => deleteDocument.mutate(doc.id)}
                disabled={deleteDocument.isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Trip Documents Tab Component
const TripDocumentsTab = () => {
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);

  const { data: trips = [], isLoading } = useQuery({
    queryKey: ['/api/trips/user'],
    queryFn: () => apiRequest('GET', '/api/trips/user'),
  });

  if (isLoading) {
    return <div className="text-center py-8">Loading trips...</div>;
  }

  if (!trips.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trip Documents</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8 text-gray-500">
          <Paperclip className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p>No trips found</p>
          <p className="text-sm">Create a trip request first to upload documents</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Trip Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Trip to Manage Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {trips.map((trip: any) => (
              <div
                key={trip.id}
                className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                  selectedTripId === trip.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedTripId(trip.id)}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm truncate">{trip.tripTitle}</h4>
                    <StatusBadge status={trip.status} />
                  </div>
                  <div className="text-xs text-gray-500 space-y-1">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      <span>{trip.destination}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{new Date(trip.fromDate).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {!selectedTripId && (
            <div className="text-center mt-6 text-gray-500">
              <p>Select a trip above to manage its documents</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Trip Documents */}
      {selectedTripId && (
        <TripDetailsWithDocuments tripId={selectedTripId} />
      )}
    </div>
  );
};

// Trip Details with Documents Component
const TripDetailsWithDocuments = ({ tripId }: { tripId: number }) => {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  
  const { data: trip, isLoading: tripLoading } = useQuery({
    queryKey: [`/api/trips/${tripId}`],
    queryFn: () => apiRequest('GET', `/api/trips/${tripId}`),
  });

  if (tripLoading) {
    return <div className="text-center py-8">Loading trip details...</div>;
  }

  if (!trip) {
    return <div className="text-center py-8 text-gray-500">Trip not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Trip Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane className="h-5 w-5" />
            {trip.tripTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-500" />
              <span>{trip.destination}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <span>{new Date(trip.fromDate).toLocaleDateString()} - {new Date(trip.toDate).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-500" />
              <span>{trip.employeeName}</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={trip.status} />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-sm text-gray-700">{trip.purpose}</p>
          </div>
        </CardContent>
      </Card>

      {/* Documents Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              Trip Documents
            </CardTitle>
            <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Document
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Upload Trip Document</DialogTitle>
                </DialogHeader>
                <DocumentUploadForm 
                  tripId={tripId} 
                  onSuccess={() => setUploadDialogOpen(false)} 
                />
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <TripDocumentsList tripId={tripId} />
        </CardContent>
      </Card>
    </div>
  );
};

// Main component
export default function BusinessTripManagement() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Business Trip Management</h1>
            <p className="text-gray-600 mt-2">Request, track, and manage business travel</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Request Trip
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Trip Request</DialogTitle>
              </DialogHeader>
              <TripRequestForm onSuccess={() => setIsCreateDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="request">My Trips</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="approvals">Approvals</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <TripDashboard />
          </TabsContent>

          <TabsContent value="request">
            <Card>
              <CardHeader>
                <CardTitle>My Trip Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <TripList />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents">
            <TripDocumentsTab />
          </TabsContent>

          <TabsContent value="approvals">
            <Card>
              <CardHeader>
                <CardTitle>Pending Approvals</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">Approval workflow functionality coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports">
            <Card>
              <CardHeader>
                <CardTitle>Trip Reports</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">Reporting functionality coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}