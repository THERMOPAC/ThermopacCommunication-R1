import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Calculator, FileText, BarChart3, TrendingUp, Download, Save, FolderOpen, Database } from "lucide-react";
import Layout from "@/components/layout";

// Loan Calculator Component
function LoanCalculator() {
  const [loanAmount, setLoanAmount] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [loanTerm, setLoanTerm] = useState("");
  const [termUnit, setTermUnit] = useState("years");
  const [result, setResult] = useState<{
    monthlyPayment: number;
    totalPayment: number;
    totalInterest: number;
    amortizationSchedule?: Array<{
      month: number;
      payment: number;
      principal: number;
      interest: number;
      balance: number;
    }>;
  } | null>(null);

  const calculateLoan = () => {
    const principal = parseFloat(loanAmount);
    const annualRate = parseFloat(interestRate) / 100;
    const term = parseFloat(loanTerm);

    if (isNaN(principal) || isNaN(annualRate) || isNaN(term) || principal <= 0 || annualRate < 0 || term <= 0) {
      return;
    }

    // Convert term to months
    const months = termUnit === "years" ? term * 12 : term;
    const monthlyRate = annualRate / 12;

    // Calculate monthly payment using loan formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
    let monthlyPayment;
    if (monthlyRate === 0) {
      monthlyPayment = principal / months;
    } else {
      monthlyPayment = principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
    }

    const totalPayment = monthlyPayment * months;
    const totalInterest = totalPayment - principal;

    // Generate amortization schedule
    const amortizationSchedule = [];
    let balance = principal;

    for (let month = 1; month <= Math.min(months, 360); month++) { // Limit to 30 years for display
      const interestPayment = balance * monthlyRate;
      const principalPayment = monthlyPayment - interestPayment;
      balance -= principalPayment;

      amortizationSchedule.push({
        month,
        payment: monthlyPayment,
        principal: principalPayment,
        interest: interestPayment,
        balance: Math.max(0, balance)
      });

      if (balance <= 0) break;
    }

    setResult({
      monthlyPayment,
      totalPayment,
      totalInterest,
      amortizationSchedule
    });
  };

  const resetCalculator = () => {
    setLoanAmount("");
    setInterestRate("");
    setLoanTerm("");
    setTermUnit("years");
    setResult(null);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="loanAmount">Loan Amount</Label>
            <Input
              id="loanAmount"
              type="number"
              placeholder="Enter loan amount"
              value={loanAmount}
              onChange={(e) => setLoanAmount(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="interestRate">Annual Interest Rate (%)</Label>
            <Input
              id="interestRate"
              type="number"
              step="0.01"
              placeholder="Enter interest rate"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="loanTerm">Loan Term</Label>
              <Input
                id="loanTerm"
                type="number"
                step="0.1"
                placeholder="Enter term"
                value={loanTerm}
                onChange={(e) => setLoanTerm(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="termUnit">Unit</Label>
              <Select value={termUnit} onValueChange={setTermUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="years">Years</SelectItem>
                  <SelectItem value="months">Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={calculateLoan} className="flex-1">
              Calculate
            </Button>
            <Button onClick={resetCalculator} variant="outline">
              Reset
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {result && (
            <Card>
              <CardHeader>
                <CardTitle>Loan Calculation Results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label className="text-sm text-muted-foreground">Loan Amount</Label>
                    <p className="text-lg font-semibold">₹{parseFloat(loanAmount).toLocaleString()}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Interest Rate</Label>
                    <p className="text-lg font-semibold">{interestRate}% per annum</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Loan Term</Label>
                    <p className="text-lg font-semibold">{loanTerm} {termUnit}</p>
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <Label className="text-sm text-muted-foreground">Monthly Payment</Label>
                      <p className="text-xl font-bold text-blue-600">₹{result.monthlyPayment.toLocaleString()}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Total Payment</Label>
                      <p className="text-lg font-semibold">₹{result.totalPayment.toLocaleString()}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Total Interest</Label>
                      <p className="text-lg font-semibold text-red-600">₹{result.totalInterest.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {result.amortizationSchedule && result.amortizationSchedule.length > 0 && (
                  <div className="border-t pt-4">
                    <Label className="text-sm text-muted-foreground mb-2 block">Amortization Schedule (First 12 months)</Label>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      <div className="grid grid-cols-5 gap-2 text-xs font-semibold border-b pb-1">
                        <span>Month</span>
                        <span>Payment</span>
                        <span>Principal</span>
                        <span>Interest</span>
                        <span>Balance</span>
                      </div>
                      {result.amortizationSchedule.slice(0, 12).map((entry) => (
                        <div key={entry.month} className="grid grid-cols-5 gap-2 text-xs">
                          <span>{entry.month}</span>
                          <span>₹{Math.round(entry.payment).toLocaleString()}</span>
                          <span>₹{Math.round(entry.principal).toLocaleString()}</span>
                          <span>₹{Math.round(entry.interest).toLocaleString()}</span>
                          <span>₹{Math.round(entry.balance).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          
          {!result && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <Calculator className="h-12 w-12 mx-auto mb-4" />
                  <p>Enter loan details and click Calculate to see results</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// Profit Margin Calculator Component
function ProfitMarginCalculator() {
  const [revenue, setRevenue] = useState("");
  const [costOfGoods, setCostOfGoods] = useState("");
  const [operatingExpenses, setOperatingExpenses] = useState("");
  const [calculationType, setCalculationType] = useState("gross");
  const [result, setResult] = useState<{
    grossProfit: number;
    netProfit: number;
    grossMargin: number;
    netMargin: number;
    markup: number;
    breakdownData: Array<{
      label: string;
      amount: number;
      percentage: number;
    }>;
  } | null>(null);

  const calculateProfitMargin = () => {
    const rev = parseFloat(revenue);
    const cogs = parseFloat(costOfGoods);
    const opex = parseFloat(operatingExpenses) || 0;

    if (isNaN(rev) || isNaN(cogs) || rev <= 0 || cogs < 0) {
      return;
    }

    const grossProfit = rev - cogs;
    const netProfit = grossProfit - opex;
    const grossMargin = (grossProfit / rev) * 100;
    const netMargin = (netProfit / rev) * 100;
    const markup = cogs > 0 ? (grossProfit / cogs) * 100 : 0;

    const breakdownData = [
      { label: "Revenue", amount: rev, percentage: 100 },
      { label: "Cost of Goods Sold", amount: cogs, percentage: (cogs / rev) * 100 },
      { label: "Gross Profit", amount: grossProfit, percentage: grossMargin },
      { label: "Operating Expenses", amount: opex, percentage: (opex / rev) * 100 },
      { label: "Net Profit", amount: netProfit, percentage: netMargin }
    ];

    setResult({
      grossProfit,
      netProfit,
      grossMargin,
      netMargin,
      markup,
      breakdownData
    });
  };

  const resetCalculator = () => {
    setRevenue("");
    setCostOfGoods("");
    setOperatingExpenses("");
    setCalculationType("gross");
    setResult(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="revenue">Total Revenue (₹)</Label>
            <Input
              id="revenue"
              type="number"
              placeholder="Enter total revenue"
              value={revenue}
              onChange={(e) => setRevenue(e.target.value)}
              className="text-right"
            />
          </div>

          <div>
            <Label htmlFor="costOfGoods">Cost of Goods Sold (₹)</Label>
            <Input
              id="costOfGoods"
              type="number"
              placeholder="Enter cost of goods sold"
              value={costOfGoods}
              onChange={(e) => setCostOfGoods(e.target.value)}
              className="text-right"
            />
          </div>

          <div>
            <Label htmlFor="operatingExpenses">Operating Expenses (₹) - Optional</Label>
            <Input
              id="operatingExpenses"
              type="number"
              placeholder="Enter operating expenses"
              value={operatingExpenses}
              onChange={(e) => setOperatingExpenses(e.target.value)}
              className="text-right"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={calculateProfitMargin} className="flex-1">
              Calculate
            </Button>
            <Button variant="outline" onClick={resetCalculator}>
              Reset
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {result && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency(result.grossProfit)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatPercentage(result.grossMargin)} margin
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${result.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(result.netProfit)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatPercentage(result.netMargin)} margin
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Markup Percentage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-blue-600">
                    {formatPercentage(result.markup)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Markup over cost of goods
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Financial Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {result.breakdownData.map((item, index) => (
                      <div key={index} className="flex justify-between items-center text-sm">
                        <span>{item.label}</span>
                        <div className="text-right">
                          <div className="font-medium">{formatCurrency(item.amount)}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatPercentage(item.percentage)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {!result && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Enter revenue and cost details to calculate profit margins</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="mt-6 p-4 bg-muted/50 rounded-lg">
        <h3 className="font-semibold mb-2">Key Metrics Explained:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p><strong>Gross Margin:</strong> (Revenue - COGS) ÷ Revenue × 100</p>
            <p><strong>Net Margin:</strong> (Revenue - COGS - Operating Expenses) ÷ Revenue × 100</p>
          </div>
          <div>
            <p><strong>Markup:</strong> (Selling Price - Cost) ÷ Cost × 100</p>
            <p><strong>Break-even:</strong> Total Costs ÷ Gross Margin</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Break-even Calculator Component
function BreakEvenCalculator() {
  const [fixedCosts, setFixedCosts] = useState("");
  const [variableCostPerUnit, setVariableCostPerUnit] = useState("");
  const [sellingPricePerUnit, setSellingPricePerUnit] = useState("");
  const [targetProfit, setTargetProfit] = useState("");
  const [result, setResult] = useState<{
    breakEvenUnits: number;
    breakEvenRevenue: number;
    contributionMargin: number;
    contributionMarginRatio: number;
    unitsForTargetProfit: number;
    revenueForTargetProfit: number;
    safetyMarginUnits: number;
    safetyMarginRevenue: number;
    analysisData: Array<{
      units: number;
      revenue: number;
      fixedCosts: number;
      variableCosts: number;
      totalCosts: number;
      profit: number;
    }>;
  } | null>(null);

  const calculateBreakEven = () => {
    const fc = parseFloat(fixedCosts);
    const vc = parseFloat(variableCostPerUnit);
    const sp = parseFloat(sellingPricePerUnit);
    const tp = parseFloat(targetProfit) || 0;

    if (isNaN(fc) || isNaN(vc) || isNaN(sp) || fc < 0 || vc < 0 || sp <= 0) {
      return;
    }

    if (sp <= vc) {
      alert("Selling price must be greater than variable cost per unit");
      return;
    }

    const contributionMargin = sp - vc;
    const contributionMarginRatio = (contributionMargin / sp) * 100;
    const breakEvenUnits = Math.ceil(fc / contributionMargin);
    const breakEvenRevenue = breakEvenUnits * sp;
    const unitsForTargetProfit = tp > 0 ? Math.ceil((fc + tp) / contributionMargin) : breakEvenUnits;
    const revenueForTargetProfit = unitsForTargetProfit * sp;

    // Generate analysis data for different unit levels
    const analysisData = [];
    const maxUnits = Math.max(breakEvenUnits * 2, unitsForTargetProfit * 1.5, 100);
    const stepSize = Math.max(1, Math.floor(maxUnits / 10));

    for (let units = 0; units <= maxUnits; units += stepSize) {
      const revenue = units * sp;
      const variableCosts = units * vc;
      const totalCosts = fc + variableCosts;
      const profit = revenue - totalCosts;

      analysisData.push({
        units,
        revenue,
        fixedCosts: fc,
        variableCosts,
        totalCosts,
        profit
      });
    }

    // Calculate safety margins (assuming current sales at target profit level)
    const currentUnits = unitsForTargetProfit;
    const safetyMarginUnits = Math.max(0, currentUnits - breakEvenUnits);
    const safetyMarginRevenue = safetyMarginUnits * sp;

    setResult({
      breakEvenUnits,
      breakEvenRevenue,
      contributionMargin,
      contributionMarginRatio,
      unitsForTargetProfit,
      revenueForTargetProfit,
      safetyMarginUnits,
      safetyMarginRevenue,
      analysisData
    });
  };

  const resetCalculator = () => {
    setFixedCosts("");
    setVariableCostPerUnit("");
    setSellingPricePerUnit("");
    setTargetProfit("");
    setResult(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-IN').format(Math.round(value));
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="fixedCosts">Fixed Costs (₹)</Label>
            <Input
              id="fixedCosts"
              type="number"
              placeholder="Enter fixed costs per period"
              value={fixedCosts}
              onChange={(e) => setFixedCosts(e.target.value)}
              className="text-right"
            />
          </div>

          <div>
            <Label htmlFor="variableCostPerUnit">Variable Cost per Unit (₹)</Label>
            <Input
              id="variableCostPerUnit"
              type="number"
              placeholder="Enter variable cost per unit"
              value={variableCostPerUnit}
              onChange={(e) => setVariableCostPerUnit(e.target.value)}
              className="text-right"
            />
          </div>

          <div>
            <Label htmlFor="sellingPricePerUnit">Selling Price per Unit (₹)</Label>
            <Input
              id="sellingPricePerUnit"
              type="number"
              placeholder="Enter selling price per unit"
              value={sellingPricePerUnit}
              onChange={(e) => setSellingPricePerUnit(e.target.value)}
              className="text-right"
            />
          </div>

          <div>
            <Label htmlFor="targetProfit">Target Profit (₹) - Optional</Label>
            <Input
              id="targetProfit"
              type="number"
              placeholder="Enter desired profit amount"
              value={targetProfit}
              onChange={(e) => setTargetProfit(e.target.value)}
              className="text-right"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={calculateBreakEven} className="flex-1">
              Calculate
            </Button>
            <Button variant="outline" onClick={resetCalculator}>
              Reset
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {result && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Break-even Point</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold text-blue-600">
                      {formatNumber(result.breakEvenUnits)} units
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(result.breakEvenRevenue)} revenue
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Contribution Margin</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold text-green-600">
                      {formatCurrency(result.contributionMargin)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatPercentage(result.contributionMarginRatio)} ratio
                    </p>
                  </CardContent>
                </Card>
              </div>

              {parseFloat(targetProfit) > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Target Profit Requirements</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg font-bold text-purple-600">
                      {formatNumber(result.unitsForTargetProfit)} units
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(result.revenueForTargetProfit)} revenue needed
                    </p>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Safety Margin</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-bold text-orange-600">
                    {formatNumber(result.safetyMarginUnits)} units
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(result.safetyMarginRevenue)} buffer above break-even
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Cost-Volume-Profit Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {result.analysisData.slice(0, 8).map((item, index) => (
                      <div key={index} className="flex justify-between items-center text-xs border-b pb-1">
                        <span className="font-medium">{formatNumber(item.units)} units</span>
                        <div className="text-right">
                          <div>{formatCurrency(item.revenue)}</div>
                          <div className={`${item.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {item.profit >= 0 ? '+' : ''}{formatCurrency(item.profit)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {!result && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Enter cost and pricing details to calculate break-even point</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="mt-6 p-4 bg-muted/50 rounded-lg">
        <h3 className="font-semibold mb-2">Break-even Analysis Formulas:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p><strong>Break-even Point (Units):</strong> Fixed Costs ÷ Contribution Margin</p>
            <p><strong>Contribution Margin:</strong> Selling Price - Variable Cost per Unit</p>
          </div>
          <div>
            <p><strong>Break-even Revenue:</strong> Break-even Units × Selling Price</p>
            <p><strong>Target Profit Units:</strong> (Fixed Costs + Target Profit) ÷ Contribution Margin</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Currency Converter Component
function CurrencyConverter() {
  const [amount, setAmount] = useState("");
  const [fromCurrency, setFromCurrency] = useState("USD");
  const [toCurrency, setToCurrency] = useState("INR");
  const [result, setResult] = useState<{
    convertedAmount: number;
    exchangeRate: number;
    fromCurrency: string;
    toCurrency: string;
    lastUpdated: string;
    provider: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({});

  // Major world currencies
  const currencies = [
    { code: "USD", name: "US Dollar", symbol: "$" },
    { code: "EUR", name: "Euro", symbol: "€" },
    { code: "GBP", name: "British Pound", symbol: "£" },
    { code: "JPY", name: "Japanese Yen", symbol: "¥" },
    { code: "AUD", name: "Australian Dollar", symbol: "A$" },
    { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
    { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
    { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
    { code: "INR", name: "Indian Rupee", symbol: "₹" },
    { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
    { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$" },
    { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$" },
    { code: "SEK", name: "Swedish Krona", symbol: "kr" },
    { code: "NOK", name: "Norwegian Krone", symbol: "kr" },
    { code: "MXN", name: "Mexican Peso", symbol: "$" },
    { code: "ZAR", name: "South African Rand", symbol: "R" },
    { code: "BRL", name: "Brazilian Real", symbol: "R$" },
    { code: "RUB", name: "Russian Ruble", symbol: "₽" },
    { code: "KRW", name: "South Korean Won", symbol: "₩" },
    { code: "THB", name: "Thai Baht", symbol: "฿" },
  ];

  const fetchExchangeRates = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Try multiple free APIs in order of preference
      const apis = [
        {
          name: "Exchange Rates API",
          url: `https://api.exchangerate-api.com/v4/latest/${fromCurrency}`,
          parser: (data: any) => ({ rates: data.rates, date: data.date })
        },
        {
          name: "Fixer.io (Fallback)",
          url: `https://api.fixer.io/latest?base=${fromCurrency}`,
          parser: (data: any) => ({ rates: data.rates, date: data.date })
        }
      ];

      let success = false;
      
      for (const api of apis) {
        try {
          const response = await fetch(api.url);
          if (response.ok) {
            const data = await response.json();
            const { rates, date } = api.parser(data);
            setExchangeRates(rates);
            
            const convertedAmount = parseFloat(amount) * (rates[toCurrency] || 1);
            setResult({
              convertedAmount,
              exchangeRate: rates[toCurrency] || 1,
              fromCurrency,
              toCurrency,
              lastUpdated: date || new Date().toISOString(),
              provider: api.name
            });
            success = true;
            break;
          }
        } catch (apiError) {
          console.log(`${api.name} failed, trying next...`);
        }
      }
      
      if (!success) {
        throw new Error("All exchange rate APIs are currently unavailable");
      }
    } catch (err) {
      setError("Unable to fetch exchange rates. Please check your internet connection or try again later.");
      console.error("Exchange rate fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const convertCurrency = () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Please enter a valid amount");
      return;
    }
    
    if (fromCurrency === toCurrency) {
      setResult({
        convertedAmount: amountNum,
        exchangeRate: 1,
        fromCurrency,
        toCurrency,
        lastUpdated: new Date().toISOString(),
        provider: "Same Currency"
      });
      return;
    }

    fetchExchangeRates();
  };

  const swapCurrencies = () => {
    const temp = fromCurrency;
    setFromCurrency(toCurrency);
    setToCurrency(temp);
    setResult(null);
  };

  const resetConverter = () => {
    setAmount("");
    setFromCurrency("USD");
    setToCurrency("INR");
    setResult(null);
    setError(null);
    setExchangeRates({});
  };

  const formatCurrency = (amount: number, currencyCode: string) => {
    const currency = currencies.find(c => c.code === currencyCode);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    }).format(value);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              placeholder="Enter amount to convert"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-right"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="fromCurrency">From</Label>
              <Select value={fromCurrency} onValueChange={setFromCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.code} - {currency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="toCurrency">To</Label>
              <Select value={toCurrency} onValueChange={setToCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.code} - {currency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={convertCurrency} disabled={isLoading} className="flex-1">
              {isLoading ? "Converting..." : "Convert"}
            </Button>
            <Button variant="outline" onClick={swapCurrencies}>
              ⇄
            </Button>
            <Button variant="outline" onClick={resetConverter}>
              Reset
            </Button>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {result && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Conversion Result</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="text-center">
                      <div className="text-lg text-muted-foreground">
                        {formatCurrency(parseFloat(amount), fromCurrency)}
                      </div>
                      <div className="text-2xl font-bold text-green-600">
                        {formatCurrency(result.convertedAmount, toCurrency)}
                      </div>
                    </div>
                    
                    <div className="border-t pt-3 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Exchange Rate:</span>
                        <span className="font-medium">
                          1 {fromCurrency} = {formatNumber(result.exchangeRate)} {toCurrency}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Provider:</span>
                        <span className="font-medium">{result.provider}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Last Updated:</span>
                        <span className="font-medium">
                          {new Date(result.lastUpdated).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Quick Conversions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 text-xs">
                    {[1, 10, 100, 1000].map((multiplier) => (
                      <div key={multiplier} className="flex justify-between">
                        <span>{multiplier} {fromCurrency}:</span>
                        <span className="font-medium">
                          {formatCurrency(multiplier * result.exchangeRate, toCurrency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {!result && !isLoading && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Enter amount and select currencies to convert</p>
                  <p className="text-xs mt-2">Real-time exchange rates from multiple sources</p>
                </div>
              </CardContent>
            </Card>
          )}

          {isLoading && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p>Fetching latest exchange rates...</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="mt-6 p-4 bg-muted/50 rounded-lg">
        <h3 className="font-semibold mb-2">Exchange Rate Information:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p><strong>Data Sources:</strong> Multiple reliable financial APIs</p>
            <p><strong>Update Frequency:</strong> Real-time on conversion</p>
          </div>
          <div>
            <p><strong>Supported Currencies:</strong> 20+ major world currencies</p>
            <p><strong>Accuracy:</strong> Bank-grade exchange rates</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ROI Calculator Component
function ROICalculator() {
  const [initialInvestment, setInitialInvestment] = useState("");
  const [finalValue, setFinalValue] = useState("");
  const [additionalInvestments, setAdditionalInvestments] = useState("");
  const [cashFlows, setCashFlows] = useState("");
  const [timeHorizon, setTimeHorizon] = useState("");
  const [calculationType, setCalculationType] = useState("basic");
  const [result, setResult] = useState<{
    roi: number;
    totalReturn: number;
    annualizedReturn: number;
    totalGain: number;
    totalInvestment: number;
    profitabilityIndex: number;
    paybackPeriod: number;
    breakdownData: Array<{
      metric: string;
      value: number;
      formatted: string;
      description: string;
    }>;
    performanceData: Array<{
      year: number;
      investment: number;
      returns: number;
      cumulative: number;
      roi: number;
    }>;
  } | null>(null);

  const calculateROI = () => {
    const initial = parseFloat(initialInvestment);
    const final = parseFloat(finalValue);
    const additional = parseFloat(additionalInvestments) || 0;
    const cashFlow = parseFloat(cashFlows) || 0;
    const years = parseFloat(timeHorizon) || 1;

    if (isNaN(initial) || isNaN(final) || initial <= 0 || final < 0 || years <= 0) {
      return;
    }

    const totalInvestment = initial + additional;
    const totalGain = final - totalInvestment + cashFlow;
    const roi = (totalGain / totalInvestment) * 100;
    const totalReturn = ((final + cashFlow) / totalInvestment) * 100;
    const annualizedReturn = (Math.pow((final + cashFlow) / totalInvestment, 1 / years) - 1) * 100;
    const profitabilityIndex = (final + cashFlow) / totalInvestment;
    const paybackPeriod = totalInvestment / ((final + cashFlow - totalInvestment) / years);

    // Generate performance data for visualization
    const performanceData = [];
    for (let year = 0; year <= years; year++) {
      const yearlyInvestment = year === 0 ? initial : (year === years ? additional : 0);
      const yearlyReturns = year === 0 ? 0 : ((final + cashFlow - totalInvestment) / years);
      const cumulative = (initial + (additional * year / years)) * Math.pow(1 + (annualizedReturn / 100), year);
      
      performanceData.push({
        year,
        investment: yearlyInvestment,
        returns: yearlyReturns,
        cumulative,
        roi: year === 0 ? 0 : ((cumulative - totalInvestment) / totalInvestment) * 100
      });
    }

    const breakdownData = [
      {
        metric: "ROI Percentage",
        value: roi,
        formatted: `${roi.toFixed(2)}%`,
        description: "Return on Investment as percentage"
      },
      {
        metric: "Total Return",
        value: totalReturn,
        formatted: `${totalReturn.toFixed(2)}%`,
        description: "Total return including cash flows"
      },
      {
        metric: "Annualized Return",
        value: annualizedReturn,
        formatted: `${annualizedReturn.toFixed(2)}%`,
        description: "Compound annual growth rate"
      },
      {
        metric: "Total Gain",
        value: totalGain,
        formatted: formatCurrency(totalGain),
        description: "Absolute profit/loss amount"
      },
      {
        metric: "Profitability Index",
        value: profitabilityIndex,
        formatted: profitabilityIndex.toFixed(3),
        description: "Value created per unit invested"
      },
      {
        metric: "Payback Period",
        value: paybackPeriod,
        formatted: `${paybackPeriod.toFixed(1)} years`,
        description: "Time to recover initial investment"
      }
    ];

    setResult({
      roi,
      totalReturn,
      annualizedReturn,
      totalGain,
      totalInvestment,
      profitabilityIndex,
      paybackPeriod,
      breakdownData,
      performanceData
    });
  };

  const resetCalculator = () => {
    setInitialInvestment("");
    setFinalValue("");
    setAdditionalInvestments("");
    setCashFlows("");
    setTimeHorizon("");
    setCalculationType("basic");
    setResult(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-IN').format(Math.round(value));
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="calculationType">Calculation Type</Label>
            <Select value={calculationType} onValueChange={setCalculationType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">Basic ROI</SelectItem>
                <SelectItem value="advanced">Advanced with Cash Flows</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="initialInvestment">Initial Investment (₹)</Label>
            <Input
              id="initialInvestment"
              type="number"
              placeholder="Enter initial investment amount"
              value={initialInvestment}
              onChange={(e) => setInitialInvestment(e.target.value)}
              className="text-right"
            />
          </div>

          <div>
            <Label htmlFor="finalValue">Final Value (₹)</Label>
            <Input
              id="finalValue"
              type="number"
              placeholder="Enter current/final value"
              value={finalValue}
              onChange={(e) => setFinalValue(e.target.value)}
              className="text-right"
            />
          </div>

          {calculationType === "advanced" && (
            <>
              <div>
                <Label htmlFor="additionalInvestments">Additional Investments (₹) - Optional</Label>
                <Input
                  id="additionalInvestments"
                  type="number"
                  placeholder="Enter additional investments"
                  value={additionalInvestments}
                  onChange={(e) => setAdditionalInvestments(e.target.value)}
                  className="text-right"
                />
              </div>

              <div>
                <Label htmlFor="cashFlows">Cash Flows Received (₹) - Optional</Label>
                <Input
                  id="cashFlows"
                  type="number"
                  placeholder="Enter total cash flows received"
                  value={cashFlows}
                  onChange={(e) => setCashFlows(e.target.value)}
                  className="text-right"
                />
              </div>
            </>
          )}

          <div>
            <Label htmlFor="timeHorizon">Time Horizon (Years)</Label>
            <Input
              id="timeHorizon"
              type="number"
              step="0.1"
              placeholder="Enter investment period"
              value={timeHorizon}
              onChange={(e) => setTimeHorizon(e.target.value)}
              className="text-right"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={calculateROI} className="flex-1">
              Calculate ROI
            </Button>
            <Button variant="outline" onClick={resetCalculator}>
              Reset
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {result && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">ROI</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${result.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatPercentage(result.roi)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {result.totalGain >= 0 ? 'Profit' : 'Loss'}: {formatCurrency(Math.abs(result.totalGain))}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Annualized Return</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${result.annualizedReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatPercentage(result.annualizedReturn)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      CAGR over {parseFloat(timeHorizon)} years
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Investment Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Total Investment:</span>
                      <span className="font-medium">{formatCurrency(result.totalInvestment)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Final Value:</span>
                      <span className="font-medium">{formatCurrency(parseFloat(finalValue))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Gain/Loss:</span>
                      <span className={`font-medium ${result.totalGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {result.totalGain >= 0 ? '+' : ''}{formatCurrency(result.totalGain)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Performance Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {result.breakdownData.map((item, index) => (
                      <div key={index} className="flex justify-between items-center text-xs border-b pb-1">
                        <div>
                          <div className="font-medium">{item.metric}</div>
                          <div className="text-muted-foreground">{item.description}</div>
                        </div>
                        <div className="text-right font-medium">
                          {item.formatted}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {!result && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Enter investment details to calculate ROI and performance metrics</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="mt-6 p-4 bg-muted/50 rounded-lg">
        <h3 className="font-semibold mb-2">ROI Calculation Formulas:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p><strong>Basic ROI:</strong> (Final Value - Initial Investment) ÷ Initial Investment × 100</p>
            <p><strong>Annualized Return:</strong> ((Final Value ÷ Initial Investment)^(1/years) - 1) × 100</p>
          </div>
          <div>
            <p><strong>Profitability Index:</strong> Final Value ÷ Initial Investment</p>
            <p><strong>Payback Period:</strong> Initial Investment ÷ Average Annual Return</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Tax Calculator Component (Advance Tax Calculator for Corporate Taxpayers in India)
function TaxCalculator() {
  const [annualIncome, setAnnualIncome] = useState("");
  const [taxRate, setTaxRate] = useState("30"); // Default 30% for companies
  const [surchargeRate, setSurchargeRate] = useState("10");
  const [cessRate, setCessRate] = useState("4"); // Health and Education Cess 4%
  const [paidJune, setPaidJune] = useState("");
  const [paidSeptember, setPaidSeptember] = useState("");
  const [paidDecember, setPaidDecember] = useState("");
  const [paidMarch, setPaidMarch] = useState("");
  const [selectedFinancialYear, setSelectedFinancialYear] = useState("");
  const [notes, setNotes] = useState("");
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [result, setResult] = useState<{
    totalTax: number;
    instalments: Array<{
      dueDate: string;
      percentageDue: number;
      taxDue: number;
      paid: number;
      balance: number;
      interestApplicable: boolean;
    }>;
  } | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available financial years
  const { data: financialYearsData } = useQuery({
    queryKey: ['/api/advance-tax/financial-years'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch saved calculations
  const { data: savedCalculations, isLoading: calculationsLoading } = useQuery({
    queryKey: ['/api/advance-tax/calculations'],
    staleTime: 30 * 1000, // 30 seconds
  });

  // Save calculation mutation
  const saveCalculationMutation = useMutation({
    mutationFn: async (calculationData: any) => {
      const response = await fetch('/api/advance-tax/calculations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(calculationData),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save calculation');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/advance-tax/calculations'] });
      toast({
        title: "Calculation Saved",
        description: "Your advance tax calculation has been saved successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Save Failed",
        description: "Failed to save calculation. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Set current financial year on load
  useEffect(() => {
    if (financialYearsData?.currentFinancialYear && !selectedFinancialYear) {
      setSelectedFinancialYear(financialYearsData.currentFinancialYear);
    }
  }, [financialYearsData, selectedFinancialYear]);

  const calculateTax = () => {
    const income = parseFloat(annualIncome);
    const baseTaxRate = parseFloat(taxRate) / 100;
    const surcharge = parseFloat(surchargeRate) / 100;
    const cess = parseFloat(cessRate) / 100;

    if (isNaN(income) || income <= 0) {
      return;
    }

    // Calculate base tax
    const baseTax = income * baseTaxRate;
    
    // Calculate surcharge on base tax
    const surchargeAmount = baseTax * surcharge;
    
    // Calculate tax + surcharge
    const taxPlusSurcharge = baseTax + surchargeAmount;
    
    // Calculate cess on (tax + surcharge)
    const cessAmount = taxPlusSurcharge * cess;
    
    // Total tax liability
    const totalTax = taxPlusSurcharge + cessAmount;

    // Advance tax instalment percentages and due dates
    const instalmentSchedule = [
      { dueDate: "15 June", percentage: 15, paid: parseFloat(paidJune) || 0 },
      { dueDate: "15 September", percentage: 45, paid: parseFloat(paidSeptember) || 0 },
      { dueDate: "15 December", percentage: 75, paid: parseFloat(paidDecember) || 0 },
      { dueDate: "15 March", percentage: 100, paid: parseFloat(paidMarch) || 0 }
    ];

    const instalments = instalmentSchedule.map((instalment, index) => {
      const taxDue = (totalTax * instalment.percentage) / 100;
      const balance = taxDue - instalment.paid;
      
      // Interest under Section 234C is applicable if:
      // 1. June instalment: Less than 15% paid by due date
      // 2. September instalment: Less than 45% paid by due date (cumulative)
      let interestApplicable = false;
      
      if (index === 0) { // June
        interestApplicable = instalment.paid < (totalTax * 0.15);
      } else if (index === 1) { // September
        const totalPaidTillSeptember = (parseFloat(paidJune) || 0) + instalment.paid;
        interestApplicable = totalPaidTillSeptember < (totalTax * 0.45);
      }

      return {
        dueDate: instalment.dueDate,
        percentageDue: instalment.percentage,
        taxDue,
        paid: instalment.paid,
        balance,
        interestApplicable
      };
    });

    setResult({ totalTax, instalments });
  };

  // Helper function to load a saved calculation
  const loadCalculation = (calculation: any) => {
    setAnnualIncome(calculation.annualTaxableIncome);
    setTaxRate(calculation.taxRate);
    setSurchargeRate(calculation.surchargeRate);
    setCessRate(calculation.cessRate);
    setPaidJune(calculation.paidJune || "");
    setPaidSeptember(calculation.paidSeptember || "");
    setPaidDecember(calculation.paidDecember || "");
    setPaidMarch(calculation.paidMarch || "");
    setSelectedFinancialYear(calculation.financialYear);
    setNotes(calculation.notes || "");
    setLoadDialogOpen(false); // Close the dialog after loading
    
    toast({
      title: "Calculation Loaded",
      description: `Loaded calculation for FY ${calculation.financialYear}`,
    });
  };

  // Helper function to save current calculation
  const saveCalculation = () => {
    if (!selectedFinancialYear || !annualIncome) {
      toast({
        title: "Missing Information",
        description: "Please select a financial year and enter annual income",
        variant: "destructive",
      });
      return;
    }

    const calculationData = {
      financialYear: selectedFinancialYear,
      annualTaxableIncome: parseFloat(annualIncome),
      taxRate: parseFloat(taxRate),
      surchargeRate: parseFloat(surchargeRate),
      cessRate: parseFloat(cessRate),
      paidJune: parseFloat(paidJune) || 0,
      paidSeptember: parseFloat(paidSeptember) || 0,
      paidDecember: parseFloat(paidDecember) || 0,
      paidMarch: parseFloat(paidMarch) || 0,
      notes: notes,
    };

    saveCalculationMutation.mutate(calculationData);
  };

  const resetCalculator = () => {
    setAnnualIncome("");
    setTaxRate("30");
    setSurchargeRate("10");
    setCessRate("4");
    setPaidJune("");
    setPaidSeptember("");
    setPaidDecember("");
    setPaidMarch("");
    setNotes("");
    setResult(null);
  };

  const exportToPDF = () => {
    if (!result) return;
    
    // Create a simple text-based export (can be enhanced with a PDF library)
    const content = `
ADVANCE TAX CALCULATOR - CORPORATE TAXPAYERS (INDIA)
===================================================

Annual Income: ₹${parseFloat(annualIncome).toLocaleString()}
Tax Rate: ${taxRate}%
Surcharge Rate: ${surchargeRate}%
Health & Education Cess: ${cessRate}%
Total Tax Liability: ₹${result.totalTax.toLocaleString()}

INSTALMENT SCHEDULE:
-------------------
Due Date       % Due    Tax Due         Paid           Balance        Interest Risk
${result.instalments.map(inst => 
  `${inst.dueDate.padEnd(12)} ${inst.percentageDue.toString().padEnd(8)} ₹${Math.round(inst.taxDue).toLocaleString().padEnd(12)} ₹${Math.round(inst.paid).toLocaleString().padEnd(12)} ₹${Math.round(inst.balance).toLocaleString().padEnd(12)} ${inst.interestApplicable ? 'Yes' : 'No'}`
).join('\n')}

Note: Interest under Section 234C may apply if advance tax payments are insufficient.
    `.trim();

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'advance-tax-calculation.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          {/* Financial Year Selection and Database Controls */}
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Database className="h-4 w-4" />
                Financial Year & Data Management
              </Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={saveCalculation}
                  disabled={saveCalculationMutation.isPending}
                  className="flex items-center gap-1"
                >
                  <Save className="h-3 w-3" />
                  {saveCalculationMutation.isPending ? "Saving..." : "Save"}
                </Button>
                <Dialog open={loadDialogOpen} onOpenChange={setLoadDialogOpen}>
                  <DialogTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="flex items-center gap-1">
                      <FolderOpen className="h-3 w-3" />
                      Load
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Load Saved Calculation</DialogTitle>
                      <DialogDescription>
                        Select a previously saved calculation to load
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      {calculationsLoading ? (
                        <p className="text-center text-muted-foreground">Loading saved calculations...</p>
                      ) : savedCalculations && savedCalculations.length > 0 ? (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {savedCalculations.map((calc: any) => (
                            <div 
                              key={calc.id} 
                              className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                              onClick={() => loadCalculation(calc)}
                            >
                              <div>
                                <p className="font-medium">FY {calc.financialYear}</p>
                                <p className="text-sm text-muted-foreground">
                                  Income: ₹{parseFloat(calc.annualTaxableIncome).toLocaleString()}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Updated: {new Date(calc.updatedAt).toLocaleDateString()}
                                </p>
                              </div>
                              <Button variant="ghost" size="sm">Load</Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-center text-muted-foreground">No saved calculations found</p>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <div>
                <Label htmlFor="financialYear" className="text-xs">Financial Year</Label>
                <Select value={selectedFinancialYear} onValueChange={setSelectedFinancialYear}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Financial Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {financialYearsData?.availableFinancialYears?.map((fy: string) => (
                      <SelectItem key={fy} value={fy}>
                        FY {fy} {fy === financialYearsData.currentFinancialYear ? "(Current)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="annualIncome">Annual Taxable Income (₹)</Label>
            <Input
              id="annualIncome"
              type="number"
              placeholder="Enter annual income"
              value={annualIncome}
              onChange={(e) => setAnnualIncome(e.target.value)}
              className="text-right"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label htmlFor="taxRate">Tax Rate (%)</Label>
              <Input
                id="taxRate"
                type="number"
                step="0.1"
                placeholder="30"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="surchargeRate">Surcharge (%)</Label>
              <Input
                id="surchargeRate"
                type="number"
                step="0.01"
                min="0"
                placeholder="Enter surcharge rate"
                value={surchargeRate}
                onChange={(e) => setSurchargeRate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cessRate">Cess (%)</Label>
              <Input
                id="cessRate"
                type="number"
                step="0.1"
                placeholder="4"
                value={cessRate}
                onChange={(e) => setCessRate(e.target.value)}
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <Label className="text-sm font-semibold mb-2 block">Tax Already Paid</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="paidJune" className="text-xs">By 15 June</Label>
                <Input
                  id="paidJune"
                  type="number"
                  placeholder="0"
                  value={paidJune}
                  onChange={(e) => setPaidJune(e.target.value)}
                  className="text-right"
                />
              </div>
              <div>
                <Label htmlFor="paidSeptember" className="text-xs">By 15 September</Label>
                <Input
                  id="paidSeptember"
                  type="number"
                  placeholder="0"
                  value={paidSeptember}
                  onChange={(e) => setPaidSeptember(e.target.value)}
                  className="text-right"
                />
              </div>
              <div>
                <Label htmlFor="paidDecember" className="text-xs">By 15 December</Label>
                <Input
                  id="paidDecember"
                  type="number"
                  placeholder="0"
                  value={paidDecember}
                  onChange={(e) => setPaidDecember(e.target.value)}
                  className="text-right"
                />
              </div>
              <div>
                <Label htmlFor="paidMarch" className="text-xs">By 15 March</Label>
                <Input
                  id="paidMarch"
                  type="number"
                  placeholder="0"
                  value={paidMarch}
                  onChange={(e) => setPaidMarch(e.target.value)}
                  className="text-right"
                />
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Input
              id="notes"
              type="text"
              placeholder="Add any notes about this calculation"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={calculateTax} className="flex-1">
              Calculate Tax
            </Button>
            <Button onClick={resetCalculator} variant="outline">
              Reset
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {result && (
            <Card>
              <CardHeader>
                <CardTitle>Tax Calculation Results</CardTitle>
                <div className="flex gap-2">
                  <Button onClick={exportToPDF} variant="outline" size="sm">
                    Export to File
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-xs text-muted-foreground">Annual Income</Label>
                    <p className="font-semibold">₹{parseFloat(annualIncome).toLocaleString()}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Total Tax Liability</Label>
                    <p className="font-bold text-red-600">₹{Math.round(result.totalTax).toLocaleString()}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Tax Rate</Label>
                    <p className="font-semibold">{taxRate}%</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Surcharge</Label>
                    <p className="font-semibold">{surchargeRate}%</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Health & Education Cess</Label>
                    <p className="font-semibold">{cessRate}%</p>
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <Label className="text-sm font-semibold mb-2 block">Advance Tax Schedule</Label>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-1">Due Date</th>
                          <th className="text-right p-1">% Due</th>
                          <th className="text-right p-1">Tax Due</th>
                          <th className="text-right p-1">Paid</th>
                          <th className="text-right p-1">Balance</th>
                          <th className="text-center p-1">Interest Risk</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.instalments.map((instalment, index) => (
                          <tr key={index} className="border-b">
                            <td className="p-1">{instalment.dueDate}</td>
                            <td className="text-right p-1">{instalment.percentageDue}%</td>
                            <td className="text-right p-1">₹{Math.round(instalment.taxDue).toLocaleString()}</td>
                            <td className="text-right p-1">₹{Math.round(instalment.paid).toLocaleString()}</td>
                            <td className={`text-right p-1 font-semibold ${instalment.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              ₹{Math.round(instalment.balance).toLocaleString()}
                            </td>
                            <td className="text-center p-1">
                              {instalment.interestApplicable ? (
                                <span className="text-red-600 font-semibold">Yes</span>
                              ) : (
                                <span className="text-green-600">No</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="mt-3 text-xs text-muted-foreground">
                    <p>• Interest under Section 234C may apply for insufficient advance tax payments</p>
                    <p>• Minimum 15% due by June 15, 45% cumulative by September 15</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          {!result && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <Calculator className="h-12 w-12 mx-auto mb-4" />
                  <p>Enter income and tax details to calculate advance tax</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// Interest Calculator Component
function InterestCalculator() {
  const [principal, setPrincipal] = useState("");
  const [rate, setRate] = useState("");
  const [time, setTime] = useState("");
  const [compoundFrequency, setCompoundFrequency] = useState("1");
  const [calculationType, setCalculationType] = useState("simple");
  const [result, setResult] = useState<{
    interest: number;
    totalAmount: number;
    breakdown?: Array<{ year: number; interest: number; balance: number }>;
  } | null>(null);

  const calculateInterest = () => {
    const p = parseFloat(principal);
    const r = parseFloat(rate) / 100;
    const t = parseFloat(time);
    const n = parseInt(compoundFrequency);

    if (isNaN(p) || isNaN(r) || isNaN(t) || p <= 0 || r < 0 || t <= 0) {
      return;
    }

    if (calculationType === "simple") {
      const interest = p * r * t;
      const totalAmount = p + interest;
      setResult({ interest, totalAmount });
    } else {
      // Compound Interest: A = P(1 + r/n)^(nt)
      const totalAmount = p * Math.pow(1 + r / n, n * t);
      const interest = totalAmount - p;
      
      // Generate year-by-year breakdown
      const breakdown = [];
      for (let year = 1; year <= t; year++) {
        const yearBalance = p * Math.pow(1 + r / n, n * year);
        const yearInterest = yearBalance - (year === 1 ? p : p * Math.pow(1 + r / n, n * (year - 1)));
        breakdown.push({
          year,
          interest: yearInterest,
          balance: yearBalance
        });
      }
      
      setResult({ interest, totalAmount, breakdown });
    }
  };

  const resetCalculator = () => {
    setPrincipal("");
    setRate("");
    setTime("");
    setCompoundFrequency("1");
    setCalculationType("simple");
    setResult(null);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="calculationType">Interest Type</Label>
            <Select value={calculationType} onValueChange={setCalculationType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">Simple Interest</SelectItem>
                <SelectItem value="compound">Compound Interest</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="principal">Principal Amount</Label>
            <Input
              id="principal"
              type="number"
              placeholder="Enter principal amount"
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="rate">Annual Interest Rate (%)</Label>
            <Input
              id="rate"
              type="number"
              step="0.01"
              placeholder="Enter interest rate"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="time">Time Period (Years)</Label>
            <Input
              id="time"
              type="number"
              step="0.1"
              placeholder="Enter time in years"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>

          {calculationType === "compound" && (
            <div>
              <Label htmlFor="frequency">Compounding Frequency</Label>
              <Select value={compoundFrequency} onValueChange={setCompoundFrequency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Annually</SelectItem>
                  <SelectItem value="2">Semi-annually</SelectItem>
                  <SelectItem value="4">Quarterly</SelectItem>
                  <SelectItem value="12">Monthly</SelectItem>
                  <SelectItem value="365">Daily</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={calculateInterest} className="flex-1">
              Calculate
            </Button>
            <Button onClick={resetCalculator} variant="outline">
              Reset
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {result && (
            <Card>
              <CardHeader>
                <CardTitle>Calculation Results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm text-muted-foreground">Principal Amount</Label>
                    <p className="text-lg font-semibold">₹{parseFloat(principal).toLocaleString()}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Interest Rate</Label>
                    <p className="text-lg font-semibold">{rate}% per annum</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Time Period</Label>
                    <p className="text-lg font-semibold">{time} years</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Interest Type</Label>
                    <p className="text-lg font-semibold capitalize">{calculationType}</p>
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-muted-foreground">Total Interest</Label>
                      <p className="text-xl font-bold text-green-600">₹{result.interest.toLocaleString()}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Final Amount</Label>
                      <p className="text-xl font-bold text-blue-600">₹{result.totalAmount.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {result.breakdown && (
                  <div className="border-t pt-4">
                    <Label className="text-sm text-muted-foreground mb-2 block">Year-by-Year Breakdown</Label>
                    <div className="max-h-40 overflow-y-auto space-y-2">
                      {result.breakdown.map((year) => (
                        <div key={year.year} className="flex justify-between items-center text-sm border-b pb-1">
                          <span>Year {year.year}</span>
                          <span>Interest: ₹{year.interest.toLocaleString()}</span>
                          <span>Balance: ₹{year.balance.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          
          {!result && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <Calculator className="h-12 w-12 mx-auto mb-4" />
                  <p>Enter values and click Calculate to see results</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FinanceToolsPage() {
  const [activeTab, setActiveTab] = useState("calculators");
  const [isInterestCalculatorOpen, setIsInterestCalculatorOpen] = useState(false);
  const [isLoanCalculatorOpen, setIsLoanCalculatorOpen] = useState(false);
  const [isTaxCalculatorOpen, setIsTaxCalculatorOpen] = useState(false);
  const [isProfitMarginCalculatorOpen, setIsProfitMarginCalculatorOpen] = useState(false);
  const [isBreakEvenCalculatorOpen, setIsBreakEvenCalculatorOpen] = useState(false);
  const [isROICalculatorOpen, setIsROICalculatorOpen] = useState(false);
  const [isCurrencyConverterOpen, setIsCurrencyConverterOpen] = useState(false);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Finance Tools</h1>
            <p className="text-muted-foreground">
              Financial utilities and tools for calculations, analysis, and reporting
            </p>
          </div>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-4 gap-4 w-full md:w-fit">
            <TabsTrigger value="calculators">Calculators</TabsTrigger>
            <TabsTrigger value="converters">Converters</TabsTrigger>
            <TabsTrigger value="analysis">Analysis Tools</TabsTrigger>
            <TabsTrigger value="utilities">Utilities</TabsTrigger>
          </TabsList>
          
          {/* Calculators Tab */}
          <TabsContent value="calculators" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Interest Calculator</CardTitle>
                    <CardDescription>
                      Calculate simple and compound interest
                    </CardDescription>
                  </div>
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog open={isInterestCalculatorOpen} onOpenChange={setIsInterestCalculatorOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full">
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Interest Calculator</DialogTitle>
                        <DialogDescription>
                          Calculate simple and compound interest with detailed breakdowns
                        </DialogDescription>
                      </DialogHeader>
                      <InterestCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Loan Calculator</CardTitle>
                    <CardDescription>
                      Calculate loan payments and schedules
                    </CardDescription>
                  </div>
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog open={isLoanCalculatorOpen} onOpenChange={setIsLoanCalculatorOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full">
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Loan Calculator</DialogTitle>
                        <DialogDescription>
                          Calculate monthly payments, total costs, and view amortization schedules
                        </DialogDescription>
                      </DialogHeader>
                      <LoanCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Tax Calculator</CardTitle>
                    <CardDescription>
                      Advance Tax Calculator for Corporate Taxpayers (India)
                    </CardDescription>
                  </div>
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog open={isTaxCalculatorOpen} onOpenChange={setIsTaxCalculatorOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full">
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Advance Tax Calculator - Corporate Taxpayers (India)</DialogTitle>
                        <DialogDescription>
                          Calculate advance tax liability, split across four instalments, and check interest applicability under Section 234C
                        </DialogDescription>
                      </DialogHeader>
                      <TaxCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Profit Margin Calculator</CardTitle>
                    <CardDescription>
                      Calculate profit margins and markups
                    </CardDescription>
                  </div>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog open={isProfitMarginCalculatorOpen} onOpenChange={setIsProfitMarginCalculatorOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full">
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Profit Margin Calculator</DialogTitle>
                        <DialogDescription>
                          Calculate gross profit, net profit, markup percentages, and view detailed financial breakdowns
                        </DialogDescription>
                      </DialogHeader>
                      <ProfitMarginCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Break-even Calculator</CardTitle>
                    <CardDescription>
                      Calculate break-even points
                    </CardDescription>
                  </div>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog open={isBreakEvenCalculatorOpen} onOpenChange={setIsBreakEvenCalculatorOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full">
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Break-even Calculator</DialogTitle>
                        <DialogDescription>
                          Calculate break-even points, contribution margins, target profit requirements, and perform cost-volume-profit analysis
                        </DialogDescription>
                      </DialogHeader>
                      <BreakEvenCalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">ROI Calculator</CardTitle>
                    <CardDescription>
                      Calculate return on investment
                    </CardDescription>
                  </div>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog open={isROICalculatorOpen} onOpenChange={setIsROICalculatorOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full">
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>ROI Calculator</DialogTitle>
                        <DialogDescription>
                          Calculate return on investment, annualized returns, profitability index, and payback periods for your investments
                        </DialogDescription>
                      </DialogHeader>
                      <ROICalculator />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          {/* Converters Tab */}
          <TabsContent value="converters" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Currency Converter</CardTitle>
                    <CardDescription>
                      Convert between different currencies
                    </CardDescription>
                  </div>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog open={isCurrencyConverterOpen} onOpenChange={setIsCurrencyConverterOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full">
                        Open Converter
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Currency Converter</DialogTitle>
                        <DialogDescription>
                          Convert between major world currencies with real-time exchange rates from reliable financial data sources
                        </DialogDescription>
                      </DialogHeader>
                      <CurrencyConverter />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Number Converter</CardTitle>
                    <CardDescription>
                      Convert numbers to words and vice versa
                    </CardDescription>
                  </div>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">
                    Open Converter
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Unit Converter</CardTitle>
                    <CardDescription>
                      Convert measurements and units
                    </CardDescription>
                  </div>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">
                    Open Converter
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          {/* Analysis Tools Tab */}
          <TabsContent value="analysis" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Cash Flow Analyzer</CardTitle>
                    <CardDescription>
                      Analyze cash flow patterns and trends
                    </CardDescription>
                  </div>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">
                    Open Analyzer
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Ratio Analysis</CardTitle>
                    <CardDescription>
                      Calculate financial ratios and metrics
                    </CardDescription>
                  </div>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">
                    Open Analyzer
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Budget Analyzer</CardTitle>
                    <CardDescription>
                      Analyze budget vs actual performance
                    </CardDescription>
                  </div>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">
                    Open Analyzer
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          {/* Utilities Tab */}
          <TabsContent value="utilities" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Report Generator</CardTitle>
                    <CardDescription>
                      Generate custom financial reports
                    </CardDescription>
                  </div>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">
                    Generate Report
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Data Export</CardTitle>
                    <CardDescription>
                      Export financial data to various formats
                    </CardDescription>
                  </div>
                  <Download className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">
                    Export Data
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Backup Manager</CardTitle>
                    <CardDescription>
                      Backup and restore financial data
                    </CardDescription>
                  </div>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">
                    Manage Backups
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Settings Manager</CardTitle>
                    <CardDescription>
                      Configure finance module settings
                    </CardDescription>
                  </div>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">
                    Open Settings
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}