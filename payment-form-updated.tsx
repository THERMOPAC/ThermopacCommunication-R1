{/* Row with 4 equal-width fields */}
<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
  <FormField
    control={form.control}
    name="referenceNumber"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Reference Number</FormLabel>
        <FormControl>
          <div className="relative">
            <Input 
              placeholder="PAY-2526-001" 
              {...field} 
              readOnly 
              className="bg-muted cursor-not-allowed" 
            />
          </div>
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
        <Select 
          onValueChange={field.onChange}
          value={field.value || 'USD'}
        >
          <FormControl>
            <SelectTrigger>
              <SelectValue placeholder="Select currency" />
            </SelectTrigger>
          </FormControl>
          <SelectContent>
            <SelectItem value="USD">USD</SelectItem>
            <SelectItem value="EUR">EUR</SelectItem>
            <SelectItem value="GBP">GBP</SelectItem>
            <SelectItem value="INR">INR</SelectItem>
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
    name="sapPaymentNo"
    render={({ field }) => (
      <FormItem>
        <FormLabel>SAP Payment No</FormLabel>
        <FormControl>
          <Input 
            placeholder="Enter SAP payment number"
            {...field}
            value={field.value || ''}
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
  
  <FormField
    control={form.control}
    name="paymentType"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Payment Type</FormLabel>
        <Select 
          onValueChange={field.onChange}
          value={field.value || 'Product'}
        >
          <FormControl>
            <SelectTrigger>
              <SelectValue placeholder="Select payment type" />
            </SelectTrigger>
          </FormControl>
          <SelectContent>
            <SelectItem value="Product">Product</SelectItem>
            <SelectItem value="Service">Service</SelectItem>
          </SelectContent>
        </Select>
        <FormMessage />
      </FormItem>
    )}
  />
</div>