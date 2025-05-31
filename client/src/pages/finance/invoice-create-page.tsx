import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation } from 'wouter';
import { Helmet } from "react-helmet";
import Layout from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from 'date-fns';
import { Loader2, CalendarIcon, Plus, Trash2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
// Use direct implementation instead of external utils

// Add global CSS style to hide number input arrows
const globalStyles = `
@layer utilities {
  input[type="number"]::-webkit-inner-spin-button,
  input[type="number"]::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  input[type="number"] {
    -moz-appearance: textfield;
  }
}
`;

// Add the style to the document
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.innerHTML = globalStyles;
  document.head.appendChild(styleEl);
}

// Custom CSS class for number inputs without arrows
const hideNumberInputArrows = "appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

// Create form schema
const invoiceFormSchema = z.object({
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  customerId: z.string().min(1, "Customer is required"),
  projectId: z.string().optional(),
  issueDate: z.date({
    required_error: "Issue date is required",
  }),
  dueDate: z.date({
    required_error: "Due date is required",
  }),
  currency: z.string().default("INR"),
  sapInvoiceNo: z.string().min(1, "SAP Invoice No is required"),
  invoiceType: z.enum(["Product", "Service"]),
  shippingBillNumber: z.string().optional(),
  notes: z.string().optional(),
  // Export and BRC fields
  isExport: z.boolean().default(false),
  brcRequired: z.boolean().default(true),
  items: z.array(
    z.object({
      description: z.string().min(1, "Description is required"),
      amount: z.string().min(1, "Amount is required"),
    })
  ).min(1, "At least one item is required"),
  // Fields for advance payment application
  applyAdvancePayments: z.boolean().default(false),
  advancePaymentAllocations: z.array(
    z.object({
      paymentId: z.number(),
      amountToApply: z.string(),
    })
  ).optional(),
});

type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

interface InvoiceCreatePageProps {
  isEditMode?: boolean;
}

export default function InvoiceCreatePage({ isEditMode = false }: InvoiceCreatePageProps) {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  
  // Extract invoice ID from URL if in edit mode
  let invoiceId: string | null = null;
  if (isEditMode) {
    const pathSegments = location.split('/');
    invoiceId = pathSegments[pathSegments.indexOf('invoices') + 1];
  }
  
  // Get customers
  const { data: customers, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ['/api/customers'],
  });
  
  // Get projects
  const { data: projects, isLoading: isLoadingProjects } = useQuery({
    queryKey: ['/api/projects'],
  });
  
  // Get invoice if in edit mode
  const { data: invoiceData, isLoading: isLoadingInvoice } = useQuery({
    queryKey: [`/api/simple-finance/invoices/${invoiceId}`],
    enabled: !!isEditMode && !!invoiceId,
    queryFn: async ({queryKey}) => {
      console.log('Fetching invoice with ID:', invoiceId);
      try {
        // Direct fetch to get the complete invoice data including notes
        const response = await fetch(`/api/simple-finance/invoices/${invoiceId}`);
        if (!response.ok) {
          console.error('Server returned error:', response.status, response.statusText);
          throw new Error('Failed to fetch invoice details');
        }
        
        const invoice = await response.json();
        console.log('Original invoice data from database:', invoice);
        
        // Get invoice items
        let invoiceItems = [];
        try {
          const itemsResponse = await fetch(`/api/simple-finance/invoice-items/${invoice.id}`);
          if (itemsResponse.ok) {
            const itemsData = await itemsResponse.json();
            if (Array.isArray(itemsData) && itemsData.length > 0) {
              invoiceItems = itemsData.map((item: any) => ({
                id: item.id,
                description: item.description || 'Item description',
                amount: String(item.amount || item.lineTotal || invoice.totalAmount)
              }));
            }
          }
        } catch (error) {
          console.warn('Could not fetch invoice items, using default:', error);
        }
        
        // If no items were found, create a default one
        if (invoiceItems.length === 0) {
          invoiceItems = [
            {
              id: 1,
              description: invoice.invoiceType === 'Service' 
                ? 'Service as per SAP invoice' 
                : 'Items as per SAP invoice',
              amount: String(invoice.totalAmount || '0')
            }
          ];
        }
        
        // Format the data to match expected structure
        const formattedData = {
          invoice: {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            customerId: invoice.customerId,
            projectId: invoice.projectId,
            issueDate: invoice.issueDate,
            dueDate: invoice.dueDate,
            totalAmount: invoice.totalAmount,
            currency: invoice.currency || 'USD',
            sapInvoiceNo: invoice.sapInvoiceNo || '',
            invoiceType: invoice.invoiceType || 'Product',
            shippingBillNumber: invoice.shippingBillNumber || '',
            isExport: invoice.isExport || false,
            brcRequired: invoice.brcRequired !== undefined ? invoice.brcRequired : true,
            status: invoice.status,
            notes: invoice.notes || '',
          },
          items: invoiceItems
        };
        
        console.log('Formatted invoice data for edit:', formattedData);
        return formattedData;
      } catch (error) {
        console.error('Error in invoice data fetch:', error);
        throw error;
      }
    },
  });
  
  // Create form first, so we can watch the invoice type
  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      invoiceNumber: isEditMode && invoiceData?.invoice 
        ? invoiceData.invoice.invoiceNumber
        : '', // Leave blank for user to enter
      customerId: isEditMode && invoiceData?.invoice ? String(invoiceData.invoice.customerId) : '',
      projectId: isEditMode && invoiceData?.invoice && invoiceData.invoice.projectId 
        ? String(invoiceData.invoice.projectId) 
        : '',
      issueDate: isEditMode && invoiceData?.invoice ? new Date(invoiceData.invoice.issueDate) : new Date(),
      dueDate: isEditMode && invoiceData?.invoice 
        ? new Date(invoiceData.invoice.dueDate)
        : new Date(new Date().setDate(new Date().getDate() + 30)), // Due in 30 days
      currency: isEditMode && invoiceData?.invoice ? invoiceData.invoice.currency : 'USD',
      sapInvoiceNo: isEditMode && invoiceData?.invoice ? invoiceData.invoice.sapInvoiceNo || '' : '',
      invoiceType: isEditMode && invoiceData?.invoice && invoiceData.invoice.invoiceType
        ? invoiceData.invoice.invoiceType
        : 'Product',
      shippingBillNumber: isEditMode && invoiceData?.invoice ? invoiceData.invoice.shippingBillNumber || '' : '',
      notes: isEditMode && invoiceData?.invoice ? invoiceData.invoice.notes || '' : '',
      // Export and BRC fields with defaults
      isExport: isEditMode && invoiceData?.invoice ? invoiceData.invoice.isExport || false : false,
      brcRequired: isEditMode && invoiceData?.invoice ? invoiceData.invoice.brcRequired || false : true,
      items: isEditMode && invoiceData?.items && invoiceData.items.length > 0
        ? invoiceData.items.map((item: any) => ({
            description: item.description || '',
            amount: String(item.amount) || '0',
          }))
        : [
            {
              description: 'Items as per SAP invoice',
              amount: '0',
            },
          ],
      // Add the new advance payment fields
      applyAdvancePayments: false,
      advancePaymentAllocations: [],
    }
  });
  
  // Get the current invoice type to filter advances by type
  const currentInvoiceType = form.watch('invoiceType');
  
  // Get unallocated advance payments for selected customer, filtered by invoice type
  const { data: unallocatedAdvances, isLoading: isLoadingAdvances } = useQuery({
    queryKey: [`/api/finance/payments/unallocated-advances/${selectedCustomerId}`, currentInvoiceType],
    queryFn: async () => {
      const response = await fetch(`/api/finance/payments/unallocated-advances/${selectedCustomerId}?invoiceType=${currentInvoiceType}`, {
        credentials: 'include'
      });
      return response.json();
    },
    enabled: !!selectedCustomerId && !isEditMode && !!currentInvoiceType,
  });
  
  // Calculate total invoice amount for auto-applying advance payments
  const calculateInvoiceTotal = () => {
    const items = form.watch('items');
    return items.reduce((total, item) => total + parseFloat(item.amount || '0'), 0);
  };
  
  // For automatic invoice number generation
  const [isGeneratingInvoiceNumber, setIsGeneratingInvoiceNumber] = useState(false);
  
  // Form was already created at the top of the component
  
  // Set up field array for invoice items
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });
  
  // Effect to update form when invoice data is loaded in edit mode
  useEffect(() => {
    if (isEditMode && invoiceData && form) {
      // Log received data for debugging
      console.log('Received invoice data for edit:', invoiceData);
      
      // Handle both possible data structures (direct or nested inside 'invoice')
      const invoice = invoiceData.invoice || invoiceData;
      
      if (invoice && invoice.id) {
        console.log('Using invoice data:', invoice);
        
        // Create a default item if none exists
        let formItems;
        if (invoiceData.items && invoiceData.items.length > 0) {
          formItems = invoiceData.items.map((item: any) => ({
            description: item.description || '',
            amount: String(item.amount || invoice.totalAmount || '0')
          }));
        } else {
          // If no items exist, create one with the invoice total amount
          const defaultDescription = invoice.invoiceType === 'Service' 
            ? 'Service as per SAP invoice' 
            : 'Items as per SAP invoice';
            
          formItems = [{
            description: defaultDescription,
            amount: String(invoice.totalAmount || '0')
          }];
        }
        
        console.log('Setting form items:', formItems);
        
        // Handle projectId (use empty string when null for proper dropdown display)
        const projectIdValue = invoice.projectId ? String(invoice.projectId) : '';
        console.log('Setting projectId to:', projectIdValue);
        
        // Reset form with complete data
        form.reset({
          invoiceNumber: invoice.invoiceNumber,
          customerId: String(invoice.customerId),
          projectId: projectIdValue,
          issueDate: new Date(invoice.issueDate),
          dueDate: new Date(invoice.dueDate),
          currency: invoice.currency || 'USD',
          sapInvoiceNo: invoice.sapInvoiceNo || '',
          invoiceType: invoice.invoiceType || 'Product',
          notes: invoice.notes || '',
          items: formItems,
        });
        
        // Immediately verify critical fields are set properly
        setTimeout(() => {
          console.log('Verifying form values are set properly');
          form.setValue('invoiceNumber', invoice.invoiceNumber);
          form.setValue('customerId', String(invoice.customerId));
          form.setValue('sapInvoiceNo', invoice.sapInvoiceNo || '');
        }, 100);
      }
    }
  }, [isEditMode, invoiceData, form]);
  
  // Effect to update the description when the invoice type changes
  useEffect(() => {
    const invoiceType = form.watch('invoiceType');
    const currentDescription = form.getValues('items.0.description');
    
    // Only update if this is a default description or empty
    const isDefaultDescription = !currentDescription ||
      currentDescription === 'Items as per SAP invoice' ||
      currentDescription === 'Service as per SAP invoice';
      
    if (isDefaultDescription) {
      if (invoiceType === 'Product') {
        form.setValue('items.0.description', 'Items as per SAP invoice');
      } else if (invoiceType === 'Service') {
        form.setValue('items.0.description', 'Service as per SAP invoice');
      }
    }
  }, [form.watch('invoiceType')]);
  
  // Effect to auto-generate invoice number when issue date changes (for new invoices only)
  useEffect(() => {
    const updateInvoiceNumber = async () => {
      if (!isEditMode) {
        // Get the current issue date
        const currentIssueDate = form.getValues('issueDate');
        if (currentIssueDate) {
          try {
            setIsGeneratingInvoiceNumber(true);
            
            // Make a request to the server to get the next invoice number
            const dateStr = format(currentIssueDate, 'yyyy-MM-dd');
            const response = await fetch(`/api/finance/test/invoice-number?date=${dateStr}`);
            
            if (!response.ok) {
              throw new Error('Failed to get invoice number from server');
            }
            
            const data = await response.json();
            
            if (data.nextInvoiceNumber) {
              console.log(`Generated invoice number from server: ${data.nextInvoiceNumber}`);
              form.setValue('invoiceNumber', data.nextInvoiceNumber);
            } else {
              throw new Error('Server did not return a valid invoice number');
            }
          } catch (error) {
            console.error('Failed to generate invoice number:', error);
            // Use a consistent fallback format that follows our INV-YYZZ-XXX pattern
            // Get the financial year based on Indian calendar (April to March)
            const date = new Date(currentIssueDate);
            const startYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
            const endYear = startYear + 1;
            
            // Format YY-ZZ part
            const startYearStr = startYear.toString().substring(2);
            const endYearStr = endYear.toString().substring(2);
            const financialYear = `${startYearStr}${endYearStr}`;
            
            // The most direct and reliable approach - use the existing database records to determine numbering
            try {
              // Get all invoices and find the latest one for this financial year
              const response = await fetch('/api/simple-finance/invoices-list');
              if (response.ok) {
                const invoices = await response.json();
                
                // Filter for invoices with the current financial year
                const matchingInvoices = invoices.filter((invoice: any) => {
                  return invoice.invoiceNumber && invoice.invoiceNumber.includes(`INV-${financialYear}-`);
                });
                
                if (matchingInvoices.length > 0) {
                  // Sort by invoice number in descending order to get the highest one
                  matchingInvoices.sort((a: any, b: any) => {
                    // Extract sequence numbers for comparison
                    const getSeq = (inv: any) => {
                      const match = inv.invoiceNumber.match(/INV-\d{4}-(\d{2,3})/);
                      return match ? parseInt(match[1], 10) : 0;
                    };
                    return getSeq(b) - getSeq(a);
                  });
                  
                  // Get the highest invoice number
                  const highestInvoice = matchingInvoices[0];
                  console.log(`Found highest invoice for ${financialYear}: ${highestInvoice.invoiceNumber}`);
                  
                  // Extract and increment the sequence number
                  const match = highestInvoice.invoiceNumber.match(/INV-\d{4}-(\d{2,3})/);
                  if (match && match[1]) {
                    const sequenceNumber = parseInt(match[1], 10) + 1;
                    const sequenceStr = sequenceNumber.toString().padStart(3, '0');
                    const newInvoiceNumber = `INV-${financialYear}-${sequenceStr}`;
                    console.log(`Generated next invoice number: ${newInvoiceNumber}`);
                    form.setValue('invoiceNumber', newInvoiceNumber);
                    return;
                  }
                } else {
                  console.log(`No invoices found for financial year ${financialYear}, will use starting number`);
                }
              }
            } catch (fetchError) {
              console.error('Error fetching invoice list:', fetchError);
            }
            
            // If all else fails, start fresh from 001
            const sequenceStr = '001';
            form.setValue('invoiceNumber', `INV-${financialYear}-${sequenceStr}`);
          } finally {
            setIsGeneratingInvoiceNumber(false);
          }
        }
      }
    };
    
    // Generate invoice number on initial load for new invoices
    if (!isEditMode && !isGeneratingInvoiceNumber) {
      updateInvoiceNumber();
    }
    
    // Set up a subscription to the issue date field
    const subscription = form.watch((value, { name }) => {
      if (name === 'issueDate' && !isEditMode && !isGeneratingInvoiceNumber) {
        updateInvoiceNumber();
      }
    });
    
    // Clean up the subscription
    return () => subscription.unsubscribe();
  }, [form, isEditMode, isGeneratingInvoiceNumber]);
  
  // Create a real-time watcher for item amount changes to immediately update advance payment allocation
  const watchedItems = form.watch('items');
  
  // Effect to auto-update the advance payment allocation amounts when invoice amount changes
  useEffect(() => {
    // Only do this if we're not in edit mode and have advance payments
    if (!isEditMode && unallocatedAdvances?.advances?.length > 0) {
      // Filter advances to match the current invoice type
      const currentType = form.watch('invoiceType');
      const filteredAdvances = unallocatedAdvances.advances.filter((payment: any) => 
        payment.paymentType === currentType
      );
      
      if (filteredAdvances.length > 0) {
        const invoiceTotal = calculateInvoiceTotal();
        console.log('Invoice total calculated:', invoiceTotal);
        
        // If we have unallocated advances, enable the checkbox by default
        form.setValue('applyAdvancePayments', true);
        
        // Create complete allocations array with pre-calculated amounts
        let remainingToAllocate = invoiceTotal;
        const allocations = filteredAdvances.map(payment => {
          const availableAmount = parseFloat(payment.unallocatedAmount);
          let amountToApply = 0;
          
          if (remainingToAllocate > 0 && availableAmount > 0) {
            // Apply either the full available amount or remaining invoice amount, whichever is smaller
            amountToApply = Math.min(availableAmount, remainingToAllocate);
            // Format to 2 decimal places and convert back to number to avoid floating point issues
            amountToApply = parseFloat(amountToApply.toFixed(2));
            remainingToAllocate -= amountToApply;
            console.log(`Pre-allocating ${amountToApply.toFixed(2)} from payment ${payment.referenceNumber} (${payment.id})`);
          }
          
          return {
            paymentId: payment.id,
            amountToApply: amountToApply > 0 ? amountToApply.toFixed(2) : '0'
          };
        });
        
        // Set the entire allocations array at once - this ensures the UI updates properly
        form.setValue('advancePaymentAllocations', allocations, {
          shouldValidate: true,
          shouldDirty: true
        });
        
        // For debugging - log each allocation that was set
        allocations.forEach((alloc, i) => {
          console.log(`Allocation ${i}: Payment ID ${alloc.paymentId}, Amount ${alloc.amountToApply}`);
        });
      }
    }
  }, [isEditMode, unallocatedAdvances, watchedItems]);
  
  // Create invoice mutation using our more reliable direct route
  const createInvoice = useMutation({
    mutationFn: async (values: InvoiceFormValues) => {
      // Transform values for direct API
      // This uses our new SQL-direct approach that bypasses ORM mapping issues
      const apiData = {
        invoice: {
          invoiceNumber: values.invoiceNumber,
          customerId: parseInt(values.customerId),
          projectId: values.projectId ? parseInt(values.projectId) : null,
          issueDate: format(values.issueDate, 'yyyy-MM-dd'),
          dueDate: format(values.dueDate, 'yyyy-MM-dd'),
          totalAmount: String(values.items.reduce((total, item) => total + parseFloat(item.amount || '0'), 0)),
          currency: values.currency,
          sapInvoiceNo: values.sapInvoiceNo || null,
          invoiceType: values.invoiceType,
          shippingBillNumber: values.shippingBillNumber || null,
          status: 'Pending',
          notes: values.notes || null,
          isExport: values.isExport || false,
          brcRequired: values.brcRequired || true,
        },
        items: values.items.map(item => ({
          description: item.description,
          quantity: "1",
          unitPrice: String(parseFloat(item.amount || "0")),
          amount: String(parseFloat(item.amount || "0")),
          taxRate: "0",
          taxAmount: "0",
          discountPercent: "0",
          discountAmount: "0",
          lineTotal: String(parseFloat(item.amount || "0")),
        }))
      };
      
      // Add advance payment allocations if enabled
      if (values.applyAdvancePayments && values.advancePaymentAllocations?.length > 0) {
        // Filter out allocations with zero or empty amounts
        const validAllocations = values.advancePaymentAllocations.filter(alloc => 
          alloc.amountToApply && parseFloat(alloc.amountToApply) > 0
        );
        
        if (validAllocations.length > 0) {
          apiData.advancePaymentAllocations = validAllocations.map(alloc => ({
            paymentId: alloc.paymentId,
            amountToApply: alloc.amountToApply
          }));
        }
      }
      
      // Log the data being sent
      console.log('Sending invoice data using direct method:', JSON.stringify(apiData, null, 2));
      
      // Use native fetch with credentials included - targeting our new direct endpoint
      console.log('Sending invoice data to direct invoice route...');
      const response = await fetch('/api/finance/invoices/direct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Important: Include credentials for authenticated requests
        body: JSON.stringify(apiData)
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('Invoice creation failed:', response.status, errorText);
        throw new Error(`Failed to create invoice: ${response.status} ${errorText}`);
      }
      
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Invoice created",
        description: "Invoice has been created successfully",
      });
      // Update both query keys to ensure proper refresh
      queryClient.invalidateQueries({ queryKey: ['/api/finance/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/simple-finance/invoices'] });
      navigate('/finance/invoices');
    },
    onError: (error: any) => {
      console.error('Error creating invoice:', error);
      const errorMessage = error?.message || "Failed to create invoice. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });
  
  // Update invoice mutation
  const updateInvoice = useMutation({
    mutationFn: async (values: InvoiceFormValues) => {
      console.log('Original form values for update:', values);
      
      // Ensure dates are in proper format - make sure we have valid Date objects first
      let issueDate = values.issueDate instanceof Date ? values.issueDate : new Date(values.issueDate);
      let dueDate = values.dueDate instanceof Date ? values.dueDate : new Date(values.dueDate);
      
      // Format dates for API
      const formattedIssueDate = format(issueDate, 'yyyy-MM-dd');
      const formattedDueDate = format(dueDate, 'yyyy-MM-dd');
      
      console.log('Formatted dates:', { issueDate, dueDate, formattedIssueDate, formattedDueDate });
      
      // Calculate total amount from items
      const totalAmount = String(values.items.reduce(
        (total, item) => total + parseFloat(item.amount || '0'), 0
      ));
      
      // Format project ID correctly
      const projectId = values.projectId && values.projectId !== '' 
        ? values.projectId  // Keep as string for the API
        : null;
      
      // Extract SAP Invoice Number with fallback
      const sapInvoiceNo = typeof values.sapInvoiceNo === 'string' ? values.sapInvoiceNo : '';
      
      // Extract notes with fallback
      const notes = typeof values.notes === 'string' ? values.notes : '';
      
      console.log('Extracted values:', { 
        sapInvoiceNo, 
        notes,
        projectId,
        customerId: values.customerId
      });
      
      // Transform values for API with explicit property assignments
      const apiData = {
        invoice: {
          invoiceNumber: values.invoiceNumber,
          customerId: parseInt(values.customerId), // Ensure it's a number
          projectId: projectId,
          issueDate: formattedIssueDate,
          dueDate: formattedDueDate,
          totalAmount: totalAmount,
          currency: values.currency,
          sapInvoiceNo: sapInvoiceNo,
          invoiceType: values.invoiceType,
          shippingBillNumber: values.shippingBillNumber || null,
          isExport: values.isExport || false,
          brcRequired: values.brcRequired !== undefined ? values.brcRequired : true,
          status: 'Pending',
          notes: notes,
        },
        items: values.items.map(item => ({
          description: item.description,
          quantity: "1",
          unitPrice: String(parseFloat(item.amount || "0")),
          amount: String(parseFloat(item.amount || "0")),
          taxRate: "0",
          taxAmount: "0",
          discountPercent: "0",
          discountAmount: "0",
          lineTotal: String(parseFloat(item.amount || "0"))
        }))
      };
      
      // Log the data being sent
      console.log('Updating invoice data:', JSON.stringify(apiData, null, 2));
      
      try {
        // Use the direct invoice API for better field mapping between frontend and database
        console.log('Updating invoice with direct invoice route...');
        const response = await fetch(`/api/finance/invoices/direct/${invoiceId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(apiData)
        });
        
        // Check response before trying to parse as JSON
        if (!response.ok) {
          const contentType = response.headers.get('content-type');
          if (contentType && !contentType.includes('application/json')) {
            // Handle non-JSON error response
            const errorText = await response.text();
            console.error('Received non-JSON error response:', errorText);
            throw new Error(`Server returned an error: ${response.status}`);
          } else {
            // Try to get JSON error
            try {
              const errorData = await response.json();
              throw new Error(errorData.error || `Server error: ${response.status}`);
            } catch (jsonError) {
              throw new Error(`Failed to update invoice: ${response.status}`);
            }
          }
        }
        
        // For successful responses
        try {
          return await response.json();
        } catch (jsonError) {
          console.log('Response was OK but could not parse JSON, returning success object');
          return { success: true, message: 'Invoice updated successfully' };
        }
      } catch (error) {
        console.error('Error during invoice update:', error);
        // If it's an Error instance, rethrow it
        if (error instanceof Error) {
          throw error;
        }
        // Otherwise create a new error
        throw new Error('Failed to communicate with the server');
      }
    },
    onSuccess: () => {
      toast({
        title: "Invoice updated",
        description: "Invoice has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/invoices'] });
      queryClient.invalidateQueries({ queryKey: [`/api/finance/invoices/${invoiceId}`] });
      navigate('/finance/invoices');
    },
    onError: (error: any) => {
      console.error('Error updating invoice:', error);
      const errorMessage = error?.message || "Failed to update invoice. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });
  
  // Submit handler - with improved error handling
  const onSubmit = async (values: InvoiceFormValues) => {
    console.log("Form submitted with values:", values);
    
    try {
      if (isEditMode && invoiceId) {
        console.log("Updating existing invoice:", invoiceId);
        updateInvoice.mutate(values);
      } else {
        console.log("Creating new invoice");
        
        // Instead of using the mutation directly, manually handle the form submission
        // Transform values for API
        const apiData = {
          invoice: {
            invoiceNumber: values.invoiceNumber,
            customerId: parseInt(values.customerId),
            projectId: values.projectId ? parseInt(values.projectId) : null,
            issueDate: format(values.issueDate, 'yyyy-MM-dd'),
            dueDate: format(values.dueDate, 'yyyy-MM-dd'),
            totalAmount: String(values.items.reduce((total, item) => total + parseFloat(item.amount || '0'), 0)),
            currency: values.currency,
            sapInvoiceNo: values.sapInvoiceNo || null,
            invoiceType: values.invoiceType,
            shippingBillNumber: values.shippingBillNumber || null,
            status: 'Pending',
            notes: values.notes || null,
            isExport: values.isExport || false,
            brcRequired: values.brcRequired || true,
          },
          items: values.items.map(item => ({
            description: item.description,
            quantity: "1",
            unitPrice: String(parseFloat(item.amount || "0")),
            amount: String(parseFloat(item.amount || "0")),
            taxRate: "0",
            taxAmount: "0",
            discountPercent: "0",
            discountAmount: "0",
            lineTotal: String(parseFloat(item.amount || "0")),
          }))
        };
        
        // Add advance payment allocations if enabled
        if (values.applyAdvancePayments && values.advancePaymentAllocations?.length > 0) {
          // Filter out allocations with zero or empty amounts
          const validAllocations = values.advancePaymentAllocations.filter(alloc => 
            alloc.amountToApply && parseFloat(alloc.amountToApply) > 0
          );
          
          if (validAllocations.length > 0) {
            apiData.advancePaymentAllocations = validAllocations.map(alloc => ({
              paymentId: alloc.paymentId,
              amountToApply: alloc.amountToApply
            }));
          }
        }
        
        console.log('Sending invoice data to server:', JSON.stringify(apiData, null, 2));
        
        // Use our fixed direct endpoint that properly handles invoiceType and outstanding_amount
        console.log('Using fixed direct invoice creation endpoint with invoice number:', values.invoiceNumber);
        const response = await fetch('/api/finance/invoices/direct', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(apiData)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Invoice creation failed:', response.status, errorText);
          throw new Error(`Failed to create invoice: ${response.status} ${response.statusText}`);
        }
        
        let data;
        try {
          // Try to parse as JSON
          const responseText = await response.text();
          data = JSON.parse(responseText);
          console.log('Invoice created successfully:', data);
        } catch (parseError) {
          console.error('Error parsing JSON response:', parseError);
          
          // Log additional debugging info
          console.log('Invoice submission was successful (status 200) but response was not valid JSON');
          console.log('Response received:', 'Response could not be displayed');
          
          // Make a second request to validate if the invoice was actually created
          try {
            // Wait a moment to allow database operations to complete
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Check if invoice exists
            const checkResponse = await fetch('/api/simple-finance/invoices-list', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
              credentials: 'include'
            });
            
            if (checkResponse.ok) {
              const invoiceList = await checkResponse.json();
              console.log('Retrieved invoice list:', invoiceList);
              const createdInvoice = invoiceList.find(
                (inv: any) => inv.invoiceNumber === values.invoiceNumber
              );
              
              if (createdInvoice) {
                toast({
                  title: "Invoice created successfully",
                  description: `Invoice ${values.invoiceNumber} has been created in the system.`,
                });
              } else {
                toast({
                  title: "Invoice likely created",
                  description: "The server responded successfully, but we couldn't verify the invoice was created.",
                });
              }
            } else {
              toast({
                title: "Invoice likely created",
                description: "The server responded but we couldn't verify if the invoice was created.",
              });
            }
          } catch (verifyError) {
            console.error('Error verifying invoice creation:', verifyError);
            toast({
              title: "Invoice likely created",
              description: "The server responded but didn't return the expected format. The invoice may have been created successfully.",
            });
          }
          
          queryClient.invalidateQueries({ queryKey: ['/api/finance/invoices'] });
          navigate('/finance/invoices');
          return;
        }
        
        // Show success message
        toast({
          title: "Invoice created",
          description: "Invoice has been created successfully",
        });
        
        // Invalidate queries and navigate
        queryClient.invalidateQueries({ queryKey: ['/api/finance/invoices'] });
        navigate('/finance/invoices');
      }
    } catch (error) {
      console.error('Error in form submission:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to process invoice. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  // This function is now intentionally removed as we no longer need to calculate 
  // the amount based on quantity and unit price. The user will enter the amount directly.
  
  // Add item function is also removed as we'll only have a single invoice line
  
  // Show loading state when fetching data
  if (isLoadingCustomers || isLoadingProjects || (isEditMode && isLoadingInvoice)) {
    return (
      <Layout>
        <Helmet>
          <title>{isEditMode ? 'Edit Invoice' : 'Create Invoice'} | Thermopac</title>
        </Helmet>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="mr-2 h-16 w-16 animate-spin" />
          <p>Loading...</p>
        </div>
      </Layout>
    );
  }
  
  return (
    <Layout>
      <Helmet>
        <title>{isEditMode ? 'Edit Invoice' : 'Create Invoice'} | Thermopac</title>
      </Helmet>
      <div className="container py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">{isEditMode ? 'Edit Invoice' : 'Create New Invoice'}</h1>
          <Button variant="outline" onClick={() => navigate('/finance/invoices')}>
            Cancel
          </Button>
        </div>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Invoice Information</CardTitle>
              <CardDescription>
                Enter the basic information for this invoice
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <FormField
                  control={form.control}
                  name="invoiceNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice Number</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter invoice number" 
                          {...field}
                          readOnly={isEditMode}
                          className={isEditMode ? "bg-muted cursor-not-allowed" : ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="USD" 
                          value="USD"
                          {...field}
                          onChange={() => {}} 
                          readOnly 
                          className="bg-muted cursor-not-allowed"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="sapInvoiceNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SAP Invoice No</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter SAP invoice number" 
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="invoiceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice Type</FormLabel>
                      {isEditMode ? (
                        <FormControl>
                          <Input
                            value={field.value}
                            readOnly
                            className="bg-muted cursor-not-allowed"
                          />
                        </FormControl>
                      ) : (
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Product">Product</SelectItem>
                            <SelectItem value="Service">Service</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="shippingBillNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Shipping Bill No</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter shipping bill number" 
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="customerId"
                render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer</FormLabel>
                      {isEditMode ? (
                        <FormControl>
                          <Input
                            value={customers?.find((c: any) => c.id.toString() === field.value)?.bpName || field.value}
                            readOnly
                            className="bg-muted cursor-not-allowed"
                          />
                        </FormControl>
                      ) : (
                        <Select 
                          onValueChange={(value) => {
                            field.onChange(value);
                            setSelectedCustomerId(value);
                          }} 
                          value={field.value || ""}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select customer" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {customers?.map((customer: any) => (
                              <SelectItem key={customer.id} value={customer.id.toString()}>
                                {customer.bpName} ({customer.bpCode})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Display unallocated advance payments if available */}
                {!isEditMode && selectedCustomerId && unallocatedAdvances && parseFloat(unallocatedAdvances.totalUnallocatedAmount || '0') > 0 && (
                  <div className="col-span-1 md:col-span-2 mt-2">
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                      <div className="flex items-center">
                        <div className="mr-2 text-blue-700">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                          </svg>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-blue-700">Available Advance Payment</h4>
                          <p className="text-sm text-blue-700 mt-1">
                            This customer has unallocated advance payments totaling{" "}
                            <span className="font-mono bg-blue-100 text-blue-700 border border-blue-300 px-1 rounded">
                              {unallocatedAdvances.currency === 'INR' ? '₹' : '$'}
                              {parseFloat(unallocatedAdvances.totalUnallocatedAmount || '0').toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </span>
                            {" "}which can be used against this invoice.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                <FormField
                  control={form.control}
                  name="projectId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project (Optional)</FormLabel>
                      <Select 
                        onValueChange={(value) => {
                          console.log("Project selected:", value);
                          field.onChange(value === "none" ? "" : value);
                        }}
                        value={field.value === "" || field.value === null || field.value === undefined ? "none" : field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select project" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No Project</SelectItem>
                          {projects?.map((project: any) => (
                            <SelectItem key={project.id} value={project.id.toString()}>
                              {project.name} ({project.code})
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
                  name="issueDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Issue Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className="w-full pl-3 text-left font-normal"
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Due Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className="w-full pl-3 text-left font-normal"
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="col-span-1 md:col-span-2">
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter any additional notes here..."
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </CardContent>
          </Card>
          
          {/* Advance Payment Section - Only shown in create mode when customer is selected and has unallocated advances */}
          {!isEditMode && selectedCustomerId && unallocatedAdvances && Array.isArray(unallocatedAdvances.advances) && 
           unallocatedAdvances.advances.filter(payment => payment.paymentType === form.watch('invoiceType')).length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Apply Advance Payments</CardTitle>
                <CardDescription>
                  Use available advance payments from this customer to pay for this invoice
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="applyAdvancePayments"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <div className="flex h-5 items-center">
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                          </div>
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>
                            Apply available advance payments
                          </FormLabel>
                          <FormDescription>
                            Total unallocated: {unallocatedAdvances?.currency || 'USD'}{' '}
                            {parseFloat(unallocatedAdvances?.totalUnallocatedAmount || '0').toFixed(2)}
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />

                  {form.watch('applyAdvancePayments') && (
                    <div className="border rounded-md overflow-hidden mt-4">
                      <div className="bg-green-50 px-4 py-3 border-b">
                        <div className="flex items-center">
                          <div className="mr-2 text-green-600">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                              <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                          </div>
                          <div>
                            <h4 className="text-sm font-medium text-green-700">Advance Payments Auto-Applied</h4>
                            <p className="text-sm text-green-600">
                              The system has automatically calculated optimal allocation of advance payments. You can adjust the amounts as needed.
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-muted px-4 py-2 font-medium text-sm grid grid-cols-12 gap-4">
                        <div className="col-span-3">Reference Number</div>
                        <div className="col-span-2">Date</div>
                        <div className="col-span-2">Total Amount</div>
                        <div className="col-span-2">Available</div>
                        <div className="col-span-3">Apply Amount</div>
                      </div>
                      
                      {Array.isArray(unallocatedAdvances?.advances) && unallocatedAdvances.advances
                        .filter((payment: any) => payment.paymentType === form.watch('invoiceType'))
                        .map((payment: any, index: number) => {
                        // Calculate the apply amount based on invoice total and previously allocated payments
                        // Get either the current value from the form (if it exists) or the defaultValue (from our calculation)
                        const currentApplyAmount = form.watch(`advancePaymentAllocations.${index}.amountToApply`) || '0';
                        const isApplying = parseFloat(currentApplyAmount) > 0;
                        
                        return (
                          <div key={payment.id} className={`px-4 py-3 border-t grid grid-cols-12 gap-4 items-center text-sm ${isApplying ? 'bg-green-50' : ''}`}>
                            <div className="col-span-3 font-medium">{payment.referenceNumber}</div>
                            <div className="col-span-2">{new Date(payment.paymentDate).toLocaleDateString()}</div>
                            <div className="col-span-2">{payment.currency} {parseFloat(payment.amount).toFixed(2)}</div>
                            <div className="col-span-2">{payment.currency} {parseFloat(payment.unallocatedAmount).toFixed(2)}</div>
                            <div className="col-span-3">
                              <FormField
                                control={form.control}
                                name={`advancePaymentAllocations.${index}.amountToApply`}
                                render={({ field }) => {
                                  // Make sure to sync up with the default value
                                  // Using uncontrolled input with defaultValue to avoid rendering conflicts
                                  return (
                                    <FormItem className="m-0">
                                      <FormControl>
                                        <div className="flex items-center">
                                          <span className="mr-2">{payment.currency}</span>
                                          <Input
                                            type="text"
                                            min="0"
                                            max={payment.unallocatedAmount}
                                            step="0.01"
                                            className={`${hideNumberInputArrows} ${isApplying ? 'border-green-500 bg-green-50' : ''}`}
                                            value={field.value || '0'}
                                            onChange={(e) => {
                                              // Ensure numeric value and update form
                                              let value = e.target.value.replace(/[^0-9.]/g, '');
                                              
                                              // Validate value is not greater than available amount
                                              const numValue = parseFloat(value);
                                              const maxAmount = parseFloat(payment.unallocatedAmount);
                                              
                                              if (!isNaN(numValue) && numValue > maxAmount) {
                                                value = maxAmount.toString();
                                                console.log(`Limiting allocation to max available: ${maxAmount}`);
                                              }
                                              
                                              field.onChange(value);
                                              
                                              // Force recalculate total with a slight delay to ensure form state is updated
                                              setTimeout(() => {
                                                const allocations = form.getValues('advancePaymentAllocations') || [];
                                                const appliedAmount = allocations.reduce(
                                                  (total, alloc) => {
                                                    const amt = parseFloat(alloc?.amountToApply || '0');
                                                    return total + (isNaN(amt) ? 0 : amt);
                                                  }, 
                                                  0
                                                );
                                                console.log('Total applied amount updated:', appliedAmount.toFixed(2));
                                                
                                                // Update the UI to show the total applied amount
                                                const remainingToPay = calculateInvoiceTotal() - appliedAmount;
                                                console.log('Remaining to pay:', remainingToPay.toFixed(2));
                                              }, 10);
                                            }}
                                          />
                                        </div>
                                      </FormControl>
                                      {isApplying && (
                                        <div className="text-xs text-green-600 mt-1">
                                          This amount will be applied automatically
                                        </div>
                                      )}
                                    </FormItem>
                                  );
                                }}
                              />
                              <FormField
                                control={form.control}
                                name={`advancePaymentAllocations.${index}.paymentId`}
                                render={({ field }) => (
                                  <input type="hidden" {...field} defaultValue={payment.id} />
                                )}
                              />
                            </div>
                          </div>
                        );
                      })}
                      
                      {/* Summary section */}
                      <div className="bg-gray-50 px-4 py-3 border-t">
                        <div className="flex justify-between">
                          <div className="font-medium">Total Invoice Amount:</div>
                          <div>{unallocatedAdvances?.currency || 'USD'} {calculateInvoiceTotal().toFixed(2)}</div>
                        </div>
                        
                        <div className="flex justify-between mt-1">
                          <div className="font-medium">Total Applied from Advances:</div>
                          <div className="text-green-600 font-medium">
                            {unallocatedAdvances?.currency || 'USD'} {
                              form.watch('advancePaymentAllocations')?.reduce((total, alloc) => 
                                total + parseFloat(alloc.amountToApply || '0'), 0).toFixed(2)
                            }
                          </div>
                        </div>
                        
                        <div className="flex justify-between mt-1">
                          <div className="font-medium">Remaining to Pay:</div>
                          <div className="text-blue-600 font-medium">
                            {unallocatedAdvances?.currency || 'USD'} {
                              Math.max(0, calculateInvoiceTotal() - 
                                form.watch('advancePaymentAllocations')?.reduce((total, alloc) => 
                                  total + parseFloat(alloc.amountToApply || '0'), 0)
                              ).toFixed(2)
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          
          <Card>
            <CardHeader>
              <CardTitle>Invoice Item</CardTitle>
              <CardDescription>
                Enter the invoice line item details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border p-4 rounded-md space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium">Invoice Line</h4>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-8">
                      <FormField
                        control={form.control}
                        name="items.0.description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                readOnly={isEditMode}
                                className={isEditMode ? "bg-muted cursor-not-allowed" : ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="md:col-span-4">
                      <FormField
                        control={form.control}
                        name="items.0.amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Amount</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                className={`text-right ${hideNumberInputArrows} ${isEditMode ? "bg-muted cursor-not-allowed" : ""}`}
                                {...field}
                                readOnly={isEditMode}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            
            <CardFooter className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/finance/invoices')}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createInvoice.isPending || updateInvoice.isPending}
              >
                {(createInvoice.isPending || updateInvoice.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isEditMode ? 'Update Invoice' : 'Create Invoice'}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
      </div>
    </Layout>
  );
}