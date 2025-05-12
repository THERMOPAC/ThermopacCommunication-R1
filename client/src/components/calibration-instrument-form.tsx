import { useState } from 'react';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { format } from 'date-fns';

// Form schema for calibration instruments
const calibrationInstrumentSchema = z.object({
  instrument_name: z.string().min(2, { message: "Instrument name is required" }),
  instrument_type: z.string().min(1, { message: "Instrument type is required" }),
  manufacturer: z.string().min(1, { message: "Manufacturer is required" }),
  serial_number: z.string().min(1, { message: "Serial number is required" }),
  location: z.string().min(1, { message: "Location is required" }),
  calibration_frequency: z.string().min(1, { message: "Calibration frequency is required" }),
  last_calibration_date: z.string().min(1, { message: "Last calibration date is required" }),
  calibration_status: z.string().min(1, { message: "Calibration status is required" }),
  certificate_number: z.string().optional(),
  remarks: z.string().optional(),
});

type CalibrationInstrumentFormData = z.infer<typeof calibrationInstrumentSchema>;

// Instrument types
const instrumentTypes = [
  "Pressure Gauge",
  "Temperature Gauge",
  "Vernier Caliper",
  "Micrometer",
  "Multimeter",
  "Oscilloscope",
  "Thermometer",
  "Flow Meter",
  "Level Gauge",
  "Torque Wrench",
  "Other"
];

// Calibration frequency options
const calibrationFrequencyOptions = [
  "3 Months",
  "6 Months",
  "1 Year",
  "2 Years",
  "3 Years",
  "5 Years"
];

// Calibration status options
const calibrationStatusOptions = [
  "Calibrated",
  "Due Soon",
  "Overdue",
  "Out of Service",
  "Pending"
];

interface CalibrationInstrumentFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  defaultValues?: Partial<CalibrationInstrumentFormData>;
  instrumentId?: number;
}

export function CalibrationInstrumentForm({ onSuccess, onCancel, defaultValues, instrumentId }: CalibrationInstrumentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const queryClient = useQueryClient();
  
  // Form setup
  const form = useForm<CalibrationInstrumentFormData>({
    resolver: zodResolver(calibrationInstrumentSchema),
    defaultValues: {
      instrument_name: "",
      instrument_type: "",
      manufacturer: "",
      serial_number: "",
      location: "",
      calibration_frequency: "",
      last_calibration_date: format(new Date(), 'yyyy-MM-dd'),
      calibration_status: "Calibrated",
      certificate_number: "",
      remarks: "",
      ...defaultValues
    },
  });
  
  // Handle file change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setCertificateFile(file);
    }
  };
  
  // Handle form submission
  const onSubmit = async (values: CalibrationInstrumentFormData) => {
    try {
      setIsSubmitting(true);
      
      // Create form data
      const formData = new FormData();
      
      // Add form values
      Object.entries(values).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });
      
      // Add certificate if available
      if (certificateFile) {
        formData.append("certificate", certificateFile);
      }
      
      // Determine URL and method based on whether we're updating or creating
      const url = instrumentId 
        ? `/api/quality/calibration/instruments/${instrumentId}` 
        : "/api/quality/calibration/instruments";
      const method = instrumentId ? "PUT" : "POST";
      
      console.log(`Submitting form to ${url} via ${method}`);
      console.log("Form values:", values);
      console.log("Certificate file:", certificateFile ? {
        name: certificateFile.name,
        type: certificateFile.type,
        size: certificateFile.size
      } : 'None');
      
      // Make API request
      const response = await fetch(url, {
        method,
        headers: {
          'Accept': 'application/json',
        },
        body: formData,
      });
      
      // Handle response
      if (!response.ok) {
        let errorMessage = "Failed to save instrument";
        
        try {
          if (response.headers.get('content-type')?.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } else {
            const errorText = await response.text();
            console.error("Received non-JSON error:", errorText.substring(0, 200));
            errorMessage = `Server error: ${response.status}`;
          }
        } catch (e) {
          console.error("Error parsing response:", e);
        }
        
        throw new Error(errorMessage);
      }
      
      // Success - update UI
      toast({
        title: "Success",
        description: instrumentId 
          ? "Calibration instrument updated successfully" 
          : "Calibration instrument created successfully",
      });
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/quality/calibration/instruments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quality/calibration/instruments/stats/dashboard"] });
      
      // Call success callback
      onSuccess();
      
    } catch (error) {
      console.error("Error saving calibration instrument:", error);
      toast({
        title: instrumentId ? "Error updating instrument" : "Error creating instrument",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="basic">Basic Information</TabsTrigger>
            <TabsTrigger value="calibration">Calibration Details</TabsTrigger>
          </TabsList>
          
          <TabsContent value="basic" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="instrument_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instrument Name*</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter instrument name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="instrument_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instrument Type*</FormLabel>
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
                        {instrumentTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
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
                name="manufacturer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Manufacturer*</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter manufacturer" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="serial_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Serial Number*</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter serial number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location*</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter location" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </TabsContent>
          
          <TabsContent value="calibration" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="calibration_frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Calibration Frequency*</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {calibrationFrequencyOptions.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
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
                name="last_calibration_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Calibration Date*</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="calibration_status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status*</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {calibrationStatusOptions.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
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
                name="certificate_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Certificate Number</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter certificate number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="col-span-2">
                <FormField
                  control={form.control}
                  name="remarks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Remarks</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Enter any additional information"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="col-span-2">
                <FormLabel htmlFor="certificate">Certificate File</FormLabel>
                <Input
                  id="certificate"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                />
                {certificateFile && (
                  <p className="text-sm mt-1">Selected file: {certificateFile.name}</p>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
        
        <div className="flex justify-end space-x-2">
          <Button variant="outline" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : instrumentId ? "Update" : "Create"}
          </Button>
        </div>
      </form>
    </Form>
  );
}