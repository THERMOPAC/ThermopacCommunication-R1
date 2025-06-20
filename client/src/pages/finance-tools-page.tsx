import React, { useState, useEffect } from "react";
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
import { Settings, Calculator, FileText, BarChart3, TrendingUp, Download, Save, FolderOpen, Database, Ruler, ArrowLeftRight, Plus, Trash2, Calendar, DollarSign, Target, Percent, PieChart, AlertTriangle, RotateCcw } from "lucide-react";
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

// Number Converter Component
function NumberConverter() {
  const [numberInput, setNumberInput] = useState("");
  const [wordsInput, setWordsInput] = useState("");
  const [convertedWords, setConvertedWords] = useState("");
  const [convertedNumber, setConvertedNumber] = useState("");
  const [conversionType, setConversionType] = useState("numberToWords");
  const [currency, setCurrency] = useState("INR");
  const [error, setError] = useState<string | null>(null);

  // Number to words conversion
  const numberToWords = (num: number): string => {
    if (num === 0) return "Zero";
    
    const ones = [
      "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
      "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
      "Seventeen", "Eighteen", "Nineteen"
    ];
    
    const tens = [
      "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
    ];
    
    const convert = (n: number): string => {
      if (n === 0) return "";
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "");
      if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " " + convert(n % 100) : "");
      if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 !== 0 ? " " + convert(n % 1000) : "");
      if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 !== 0 ? " " + convert(n % 100000) : "");
      if (n < 1000000000) return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 !== 0 ? " " + convert(n % 10000000) : "");
      return convert(Math.floor(n / 1000000000)) + " Arab" + (n % 1000000000 !== 0 ? " " + convert(n % 1000000000) : "");
    };
    
    return convert(num);
  };

  // Words to number conversion (basic implementation)
  const wordsToNumber = (words: string): number => {
    const wordMap: { [key: string]: number } = {
      "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
      "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
      "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
      "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20,
      "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70,
      "eighty": 80, "ninety": 90, "hundred": 100, "thousand": 1000,
      "lakh": 100000, "crore": 10000000, "arab": 1000000000
    };

    const cleanWords = words.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/);
    let result = 0;
    let current = 0;
    
    for (const word of cleanWords) {
      if (wordMap[word]) {
        const value = wordMap[word];
        if (value === 100) {
          current *= 100;
        } else if (value >= 1000) {
          result += current * value;
          current = 0;
        } else {
          current += value;
        }
      }
    }
    
    return result + current;
  };

  const convertNumberToWords = () => {
    setError(null);
    const num = parseFloat(numberInput);
    
    if (isNaN(num)) {
      setError("Please enter a valid number");
      return;
    }
    
    if (num < 0) {
      setError("Negative numbers are not supported");
      return;
    }
    
    if (num > 999999999999) {
      setError("Number too large (maximum 999,999,999,999)");
      return;
    }
    
    const integerPart = Math.floor(num);
    const decimalPart = Math.round((num - integerPart) * 100);
    
    let result = numberToWords(integerPart);
    
    if (currency === "INR") {
      result += " Rupees";
      if (decimalPart > 0) {
        result += " and " + numberToWords(decimalPart) + " Paise";
      }
    } else {
      result += " Dollars";
      if (decimalPart > 0) {
        result += " and " + numberToWords(decimalPart) + " Cents";
      }
    }
    
    result += " Only";
    setConvertedWords(result);
  };

  const convertWordsToNumber = () => {
    setError(null);
    try {
      const num = wordsToNumber(wordsInput);
      if (num === 0 && !wordsInput.toLowerCase().includes("zero")) {
        setError("Could not parse the words. Please check spelling and format.");
        return;
      }
      setConvertedNumber(num.toLocaleString('en-IN'));
    } catch (err) {
      setError("Error converting words to number. Please check the format.");
    }
  };

  const resetConverter = () => {
    setNumberInput("");
    setWordsInput("");
    setConvertedWords("");
    setConvertedNumber("");
    setError(null);
  };

  const formatIndianNumber = (num: string) => {
    const number = parseFloat(num);
    if (isNaN(number)) return "";
    return new Intl.NumberFormat('en-IN').format(number);
  };

  const sampleConversions = [
    { number: "1234567", words: "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven" },
    { number: "50000", words: "Fifty Thousand" },
    { number: "100", words: "One Hundred" },
    { number: "999", words: "Nine Hundred Ninety Nine" }
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="conversionType">Conversion Type</Label>
            <Select value={conversionType} onValueChange={setConversionType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="numberToWords">Number to Words</SelectItem>
                <SelectItem value="wordsToNumber">Words to Number</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {conversionType === "numberToWords" && (
            <>
              <div>
                <Label htmlFor="numberInput">Enter Number</Label>
                <Input
                  id="numberInput"
                  type="number"
                  placeholder="Enter number (e.g., 1234567)"
                  value={numberInput}
                  onChange={(e) => setNumberInput(e.target.value)}
                  className="text-right"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Formatted: {numberInput ? formatIndianNumber(numberInput) : ""}
                </p>
              </div>

              <div>
                <Label htmlFor="currency">Currency Format</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">Indian Rupees (INR)</SelectItem>
                    <SelectItem value="USD">US Dollars (USD)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={convertNumberToWords} className="w-full">
                Convert to Words
              </Button>
            </>
          )}

          {conversionType === "wordsToNumber" && (
            <>
              <div>
                <Label htmlFor="wordsInput">Enter Words</Label>
                <textarea
                  id="wordsInput"
                  placeholder="Enter number in words (e.g., One Lakh Twenty Three Thousand Four Hundred Fifty Six)"
                  value={wordsInput}
                  onChange={(e) => setWordsInput(e.target.value)}
                  className="w-full min-h-[100px] p-3 border rounded-md resize-none"
                />
              </div>

              <Button onClick={convertWordsToNumber} className="w-full">
                Convert to Number
              </Button>
            </>
          )}

          <Button variant="outline" onClick={resetConverter} className="w-full">
            Reset
          </Button>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {convertedWords && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Words Result</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm font-medium text-green-800 break-words">
                    {convertedWords}
                  </p>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  <p><strong>Input:</strong> {formatIndianNumber(numberInput)}</p>
                  <p><strong>Currency:</strong> {currency === "INR" ? "Indian Rupees" : "US Dollars"}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {convertedNumber && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Number Result</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-lg font-bold text-blue-800">
                    {convertedNumber}
                  </p>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  <p><strong>Input:</strong> {wordsInput}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {!convertedWords && !convertedNumber && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Enter a number or words to see the conversion</p>
                  <p className="text-xs mt-2">Perfect for financial documents and check writing</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Sample Conversions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-xs">
                {sampleConversions.map((sample, index) => (
                  <div key={index} className="border-b pb-2 last:border-b-0">
                    <div className="font-medium">{formatIndianNumber(sample.number)}</div>
                    <div className="text-muted-foreground">{sample.words}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-6 p-4 bg-muted/50 rounded-lg">
        <h3 className="font-semibold mb-2">Number Conversion Features:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p><strong>Indian Number System:</strong> Supports Lakh, Crore, Arab notation</p>
            <p><strong>Currency Format:</strong> Rupees/Paise and Dollars/Cents</p>
          </div>
          <div>
            <p><strong>Range:</strong> Up to 999,999,999,999 (999 Arab)</p>
            <p><strong>Use Cases:</strong> Check writing, financial documents</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Unit Converter Component
function UnitConverter() {
  const [amount, setAmount] = useState("");
  const [fromUnit, setFromUnit] = useState("");
  const [toUnit, setToUnit] = useState("");
  const [category, setCategory] = useState("length");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Unit conversion definitions
  const unitCategories = {
    length: {
      name: "Length",
      units: {
        mm: { name: "Millimeter", factor: 1 },
        cm: { name: "Centimeter", factor: 10 },
        m: { name: "Meter", factor: 1000 },
        km: { name: "Kilometer", factor: 1000000 },
        inch: { name: "Inch", factor: 25.4 },
        ft: { name: "Foot", factor: 304.8 },
        yard: { name: "Yard", factor: 914.4 },
        mile: { name: "Mile", factor: 1609344 }
      }
    },
    weight: {
      name: "Weight",
      units: {
        mg: { name: "Milligram", factor: 1 },
        g: { name: "Gram", factor: 1000 },
        kg: { name: "Kilogram", factor: 1000000 },
        ton: { name: "Metric Ton", factor: 1000000000 },
        oz: { name: "Ounce", factor: 28349.5 },
        lb: { name: "Pound", factor: 453592 },
        stone: { name: "Stone", factor: 6350293 }
      }
    },
    temperature: {
      name: "Temperature",
      units: {
        celsius: { name: "Celsius (°C)", factor: 1 },
        fahrenheit: { name: "Fahrenheit (°F)", factor: 1 },
        kelvin: { name: "Kelvin (K)", factor: 1 }
      }
    },
    volume: {
      name: "Volume",
      units: {
        ml: { name: "Milliliter", factor: 1 },
        l: { name: "Liter", factor: 1000 },
        gallon_us: { name: "US Gallon", factor: 3785.41 },
        gallon_uk: { name: "UK Gallon", factor: 4546.09 },
        fl_oz_us: { name: "US Fluid Ounce", factor: 29.5735 },
        fl_oz_uk: { name: "UK Fluid Ounce", factor: 28.4131 },
        cup: { name: "Cup", factor: 236.588 },
        pint: { name: "Pint", factor: 473.176 }
      }
    },
    area: {
      name: "Area",
      units: {
        sq_mm: { name: "Square Millimeter", factor: 1 },
        sq_cm: { name: "Square Centimeter", factor: 100 },
        sq_m: { name: "Square Meter", factor: 1000000 },
        sq_km: { name: "Square Kilometer", factor: 1000000000000 },
        sq_inch: { name: "Square Inch", factor: 645.16 },
        sq_ft: { name: "Square Foot", factor: 92903 },
        acre: { name: "Acre", factor: 4046856422 },
        hectare: { name: "Hectare", factor: 10000000000 }
      }
    },
    pressure: {
      name: "Pressure",
      units: {
        pa: { name: "Pascal", factor: 1 },
        kpa: { name: "Kilopascal", factor: 1000 },
        mpa: { name: "Megapascal", factor: 1000000 },
        bar: { name: "Bar", factor: 100000 },
        psi: { name: "PSI", factor: 6894.76 },
        atm: { name: "Atmosphere", factor: 101325 },
        mmhg: { name: "mmHg", factor: 133.322 }
      }
    }
  };

  const convertTemperature = (value: number, from: string, to: string): number => {
    let celsius: number;
    
    // Convert to Celsius first
    switch (from) {
      case 'celsius':
        celsius = value;
        break;
      case 'fahrenheit':
        celsius = (value - 32) * 5/9;
        break;
      case 'kelvin':
        celsius = value - 273.15;
        break;
      default:
        return value;
    }
    
    // Convert from Celsius to target
    switch (to) {
      case 'celsius':
        return celsius;
      case 'fahrenheit':
        return celsius * 9/5 + 32;
      case 'kelvin':
        return celsius + 273.15;
      default:
        return celsius;
    }
  };

  const convertUnit = () => {
    setError(null);
    setResult(null);
    
    const inputValue = parseFloat(amount);
    if (isNaN(inputValue)) {
      setError("Please enter a valid number");
      return;
    }
    
    if (!fromUnit || !toUnit) {
      setError("Please select both from and to units");
      return;
    }
    
    if (fromUnit === toUnit) {
      setResult(inputValue.toString());
      return;
    }
    
    const categoryData = unitCategories[category as keyof typeof unitCategories];
    
    if (category === 'temperature') {
      const convertedValue = convertTemperature(inputValue, fromUnit, toUnit);
      setResult(convertedValue.toFixed(6).replace(/\.?0+$/, ''));
    } else {
      const fromFactor = categoryData.units[fromUnit as keyof typeof categoryData.units]?.factor;
      const toFactor = categoryData.units[toUnit as keyof typeof categoryData.units]?.factor;
      
      if (!fromFactor || !toFactor) {
        setError("Invalid unit selection");
        return;
      }
      
      // Convert to base unit, then to target unit
      const baseValue = inputValue * fromFactor;
      const convertedValue = baseValue / toFactor;
      setResult(convertedValue.toFixed(6).replace(/\.?0+$/, ''));
    }
  };

  const swapUnits = () => {
    const temp = fromUnit;
    setFromUnit(toUnit);
    setToUnit(temp);
    setResult(null);
  };

  const resetConverter = () => {
    setAmount("");
    setFromUnit("");
    setToUnit("");
    setResult(null);
    setError(null);
  };

  const formatNumber = (num: string) => {
    const number = parseFloat(num);
    if (isNaN(number)) return "";
    return new Intl.NumberFormat('en-IN').format(number);
  };

  const currentUnits = unitCategories[category as keyof typeof unitCategories];

  // Set default units when category changes
  React.useEffect(() => {
    const units = Object.keys(currentUnits.units);
    if (units.length >= 2) {
      setFromUnit(units[0]);
      setToUnit(units[1]);
    }
    setResult(null);
    setError(null);
  }, [category]);

  const commonConversions = [
    { from: "1 meter", to: "3.281 feet", category: "Length" },
    { from: "1 kilogram", to: "2.205 pounds", category: "Weight" },
    { from: "100°C", to: "212°F", category: "Temperature" },
    { from: "1 liter", to: "0.264 US gallon", category: "Volume" }
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(unitCategories).map(([key, cat]) => (
                  <SelectItem key={key} value={key}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-right"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Formatted: {amount ? formatNumber(amount) : ""}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="fromUnit">From Unit</Label>
              <Select value={fromUnit} onValueChange={setFromUnit}>
                <SelectTrigger>
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(currentUnits.units).map(([key, unit]) => (
                    <SelectItem key={key} value={key}>{unit.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="toUnit">To Unit</Label>
              <Select value={toUnit} onValueChange={setToUnit}>
                <SelectTrigger>
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(currentUnits.units).map(([key, unit]) => (
                    <SelectItem key={key} value={key}>{unit.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={convertUnit} className="flex-1">
              Convert
            </Button>
            <Button variant="outline" onClick={swapUnits}>
              <ArrowLeftRight className="h-4 w-4" />
            </Button>
          </div>

          <Button variant="outline" onClick={resetConverter} className="w-full">
            Reset
          </Button>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {result && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Conversion Result</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="text-center">
                    <p className="text-lg font-bold text-green-800">
                      {formatNumber(result)}
                    </p>
                    <p className="text-sm text-green-600 mt-1">
                      {currentUnits.units[toUnit as keyof typeof currentUnits.units]?.name}
                    </p>
                  </div>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  <p><strong>Input:</strong> {formatNumber(amount)} {currentUnits.units[fromUnit as keyof typeof currentUnits.units]?.name}</p>
                  <p><strong>Category:</strong> {currentUnits.name}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {!result && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <Ruler className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Enter an amount and select units to convert</p>
                  <p className="text-xs mt-2">Supports multiple unit categories</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Common Conversions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-xs">
                {commonConversions.map((conversion, index) => (
                  <div key={index} className="border-b pb-2 last:border-b-0">
                    <div className="font-medium">{conversion.from} = {conversion.to}</div>
                    <div className="text-muted-foreground">{conversion.category}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-6 p-4 bg-muted/50 rounded-lg">
        <h3 className="font-semibold mb-2">Unit Converter Features:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p><strong>Categories:</strong> Length, Weight, Temperature, Volume, Area, Pressure</p>
            <p><strong>Precision:</strong> High precision calculations with up to 6 decimal places</p>
          </div>
          <div>
            <p><strong>Units:</strong> Metric, Imperial, and specialized units</p>
            <p><strong>Use Cases:</strong> Engineering calculations, cooking, construction</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Cash Flow Analyzer Component
function CashFlowAnalyzer() {
  const [cashFlowData, setCashFlowData] = useState([
    { id: 1, date: "2024-01-01", type: "inflow", category: "Revenue", description: "Product Sales", amount: 50000 },
    { id: 2, date: "2024-01-15", type: "outflow", category: "Operating", description: "Office Rent", amount: 8000 },
    { id: 3, date: "2024-02-01", type: "inflow", category: "Revenue", description: "Service Income", amount: 30000 },
    { id: 4, date: "2024-02-10", type: "outflow", category: "Operating", description: "Salaries", amount: 25000 }
  ]);
  const [newEntry, setNewEntry] = useState({
    date: "",
    type: "inflow",
    category: "",
    description: "",
    amount: ""
  });
  const [analysisType, setAnalysisType] = useState("monthly");
  const [analysisResults, setAnalysisResults] = useState<any>(null);

  const categories = {
    inflow: ["Revenue", "Investment", "Loan", "Asset Sale", "Other Income"],
    outflow: ["Operating", "Capital", "Debt Payment", "Tax", "Other Expense"]
  };

  const addCashFlowEntry = () => {
    if (!newEntry.date || !newEntry.category || !newEntry.description || !newEntry.amount) {
      return;
    }

    const entry = {
      id: Date.now(),
      ...newEntry,
      amount: parseFloat(newEntry.amount)
    };

    setCashFlowData([...cashFlowData, entry]);
    setNewEntry({
      date: "",
      type: "inflow",
      category: "",
      description: "",
      amount: ""
    });
  };

  const deleteCashFlowEntry = (id: number) => {
    setCashFlowData(cashFlowData.filter(entry => entry.id !== id));
  };

  const analyzeCashFlow = () => {
    if (cashFlowData.length === 0) {
      setAnalysisResults(null);
      return;
    }

    const totalInflow = cashFlowData
      .filter(entry => entry.type === "inflow")
      .reduce((sum, entry) => sum + entry.amount, 0);

    const totalOutflow = cashFlowData
      .filter(entry => entry.type === "outflow")
      .reduce((sum, entry) => sum + entry.amount, 0);

    const netCashFlow = totalInflow - totalOutflow;

    // Monthly analysis
    const monthlyData = {};
    cashFlowData.forEach(entry => {
      const month = entry.date.substring(0, 7); // YYYY-MM
      if (!monthlyData[month]) {
        monthlyData[month] = { inflow: 0, outflow: 0 };
      }
      monthlyData[month][entry.type] += entry.amount;
    });

    const monthlyAnalysis = Object.entries(monthlyData).map(([month, data]: [string, any]) => ({
      month,
      inflow: data.inflow,
      outflow: data.outflow,
      net: data.inflow - data.outflow
    }));

    // Category analysis
    const categoryData = {};
    cashFlowData.forEach(entry => {
      const key = `${entry.type}_${entry.category}`;
      if (!categoryData[key]) {
        categoryData[key] = { category: entry.category, type: entry.type, total: 0 };
      }
      categoryData[key].total += entry.amount;
    });

    const categoryAnalysis = Object.values(categoryData);

    // Cash flow velocity (average time between transactions)
    const sortedDates = cashFlowData.map(entry => new Date(entry.date)).sort((a, b) => a.getTime() - b.getTime());
    let totalDaysBetween = 0;
    for (let i = 1; i < sortedDates.length; i++) {
      const daysBetween = (sortedDates[i].getTime() - sortedDates[i-1].getTime()) / (1000 * 60 * 60 * 24);
      totalDaysBetween += daysBetween;
    }
    const avgDaysBetween = sortedDates.length > 1 ? totalDaysBetween / (sortedDates.length - 1) : 0;

    // Trend analysis
    const recentMonths = monthlyAnalysis.slice(-3);
    const avgRecentNet = recentMonths.reduce((sum, month) => sum + month.net, 0) / Math.max(recentMonths.length, 1);
    const trend = avgRecentNet > 0 ? "positive" : avgRecentNet < 0 ? "negative" : "neutral";

    setAnalysisResults({
      totalInflow,
      totalOutflow,
      netCashFlow,
      monthlyAnalysis,
      categoryAnalysis,
      avgDaysBetween: Math.round(avgDaysBetween),
      trend,
      avgRecentNet,
      cashFlowRatio: totalOutflow > 0 ? (totalInflow / totalOutflow) : 0
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const resetAnalysis = () => {
    setCashFlowData([]);
    setAnalysisResults(null);
  };

  React.useEffect(() => {
    if (cashFlowData.length > 0) {
      analyzeCashFlow();
    }
  }, [cashFlowData]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <div className="space-y-4">
          <h3 className="font-semibold">Add Cash Flow Entry</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={newEntry.date}
                onChange={(e) => setNewEntry({...newEntry, date: e.target.value})}
              />
            </div>
            
            <div>
              <Label htmlFor="type">Type</Label>
              <Select value={newEntry.type} onValueChange={(value) => setNewEntry({...newEntry, type: value, category: ""})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inflow">Cash Inflow</SelectItem>
                  <SelectItem value="outflow">Cash Outflow</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="category">Category</Label>
            <Select value={newEntry.category} onValueChange={(value) => setNewEntry({...newEntry, category: value})}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories[newEntry.type as keyof typeof categories].map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Enter description"
              value={newEntry.description}
              onChange={(e) => setNewEntry({...newEntry, description: e.target.value})}
            />
          </div>

          <div>
            <Label htmlFor="amount">Amount (₹)</Label>
            <Input
              id="amount"
              type="number"
              placeholder="Enter amount"
              value={newEntry.amount}
              onChange={(e) => setNewEntry({...newEntry, amount: e.target.value})}
              className="text-right"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={addCashFlowEntry} className="flex-1">
              <Plus className="h-4 w-4 mr-2" />
              Add Entry
            </Button>
            <Button variant="outline" onClick={resetAnalysis}>
              Reset
            </Button>
          </div>
        </div>

        {/* Analysis Results */}
        <div className="space-y-4">
          {analysisResults && (
            <>
              <h3 className="font-semibold">Cash Flow Analysis</h3>
              
              <div className="grid grid-cols-1 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Total Inflow:</span>
                        <span className="font-medium text-green-600">
                          {formatCurrency(analysisResults.totalInflow)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Outflow:</span>
                        <span className="font-medium text-red-600">
                          {formatCurrency(analysisResults.totalOutflow)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="font-medium">Net Cash Flow:</span>
                        <span className={`font-bold ${analysisResults.netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(analysisResults.netCashFlow)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Key Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Cash Flow Ratio:</span>
                        <span className="font-medium">
                          {analysisResults.cashFlowRatio.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Trend:</span>
                        <span className={`font-medium capitalize ${
                          analysisResults.trend === 'positive' ? 'text-green-600' : 
                          analysisResults.trend === 'negative' ? 'text-red-600' : 'text-yellow-600'
                        }`}>
                          {analysisResults.trend}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Avg Days Between Transactions:</span>
                        <span className="font-medium">{analysisResults.avgDaysBetween}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          {!analysisResults && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Add cash flow entries to see analysis</p>
                  <p className="text-xs mt-2">Track inflows and outflows to analyze patterns</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Data Table */}
      {cashFlowData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Cash Flow Entries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {cashFlowData.slice(-10).reverse().map((entry) => (
                <div key={entry.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        entry.type === 'inflow' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {entry.type === 'inflow' ? 'IN' : 'OUT'}
                      </span>
                      <span className="font-medium">{entry.description}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {entry.date} • {entry.category}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${entry.type === 'inflow' ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(entry.amount)}
                    </span>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => deleteCashFlowEntry(entry.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {cashFlowData.length > 10 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Showing last 10 entries of {cashFlowData.length} total
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly Analysis */}
      {analysisResults && analysisResults.monthlyAnalysis.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Monthly Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analysisResults.monthlyAnalysis.map((month: any) => (
                <div key={month.month} className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="font-medium">{month.month}</span>
                  <div className="flex gap-4 text-sm">
                    <span className="text-green-600">In: {formatCurrency(month.inflow)}</span>
                    <span className="text-red-600">Out: {formatCurrency(month.outflow)}</span>
                    <span className={`font-bold ${month.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      Net: {formatCurrency(month.net)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 p-4 bg-muted/50 rounded-lg">
        <h3 className="font-semibold mb-2">Cash Flow Analysis Features:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p><strong>Real-time Analysis:</strong> Automatic calculations as you add entries</p>
            <p><strong>Multiple Categories:</strong> Revenue, Operating, Capital, and more</p>
          </div>
          <div>
            <p><strong>Trend Analysis:</strong> Identify positive/negative cash flow patterns</p>
            <p><strong>Key Metrics:</strong> Cash flow ratio, velocity, and trend indicators</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Ratio Analysis Component
function RatioAnalysis() {
  const [financialData, setFinancialData] = useState({
    // Balance Sheet Data
    currentAssets: "",
    totalAssets: "",
    currentLiabilities: "",
    totalLiabilities: "",
    totalEquity: "",
    inventory: "",
    accountsReceivable: "",
    cash: "",
    longTermDebt: "",
    
    // Income Statement Data
    revenue: "",
    netIncome: "",
    grossProfit: "",
    operatingIncome: "",
    interestExpense: "",
    costOfGoodsSold: "",
    
    // Market Data
    marketValue: "",
    numberOfShares: "",
    dividendsPerShare: ""
  });

  const [ratios, setRatios] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("liquidity");

  const calculateRatios = () => {
    const data = financialData;
    
    // Convert string inputs to numbers
    const currentAssets = parseFloat(data.currentAssets) || 0;
    const totalAssets = parseFloat(data.totalAssets) || 0;
    const currentLiabilities = parseFloat(data.currentLiabilities) || 0;
    const totalLiabilities = parseFloat(data.totalLiabilities) || 0;
    const totalEquity = parseFloat(data.totalEquity) || 0;
    const inventory = parseFloat(data.inventory) || 0;
    const accountsReceivable = parseFloat(data.accountsReceivable) || 0;
    const cash = parseFloat(data.cash) || 0;
    const longTermDebt = parseFloat(data.longTermDebt) || 0;
    const revenue = parseFloat(data.revenue) || 0;
    const netIncome = parseFloat(data.netIncome) || 0;
    const grossProfit = parseFloat(data.grossProfit) || 0;
    const operatingIncome = parseFloat(data.operatingIncome) || 0;
    const interestExpense = parseFloat(data.interestExpense) || 0;
    const costOfGoodsSold = parseFloat(data.costOfGoodsSold) || 0;
    const marketValue = parseFloat(data.marketValue) || 0;
    const numberOfShares = parseFloat(data.numberOfShares) || 0;
    const dividendsPerShare = parseFloat(data.dividendsPerShare) || 0;

    // Liquidity Ratios
    const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : 0;
    const quickRatio = currentLiabilities > 0 ? (currentAssets - inventory) / currentLiabilities : 0;
    const cashRatio = currentLiabilities > 0 ? cash / currentLiabilities : 0;
    const workingCapital = currentAssets - currentLiabilities;

    // Activity/Efficiency Ratios
    const assetTurnover = totalAssets > 0 ? revenue / totalAssets : 0;
    const inventoryTurnover = inventory > 0 ? costOfGoodsSold / inventory : 0;
    const receivablesTurnover = accountsReceivable > 0 ? revenue / accountsReceivable : 0;
    const daysInInventory = inventoryTurnover > 0 ? 365 / inventoryTurnover : 0;
    const daysInReceivables = receivablesTurnover > 0 ? 365 / receivablesTurnover : 0;

    // Leverage/Debt Ratios
    const debtToAssets = totalAssets > 0 ? totalLiabilities / totalAssets : 0;
    const debtToEquity = totalEquity > 0 ? totalLiabilities / totalEquity : 0;
    const equityRatio = totalAssets > 0 ? totalEquity / totalAssets : 0;
    const interestCoverage = interestExpense > 0 ? operatingIncome / interestExpense : 0;

    // Profitability Ratios
    const grossProfitMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const operatingMargin = revenue > 0 ? (operatingIncome / revenue) * 100 : 0;
    const netProfitMargin = revenue > 0 ? (netIncome / revenue) * 100 : 0;
    const returnOnAssets = totalAssets > 0 ? (netIncome / totalAssets) * 100 : 0;
    const returnOnEquity = totalEquity > 0 ? (netIncome / totalEquity) * 100 : 0;

    // Market Valuation Ratios
    const earningsPerShare = numberOfShares > 0 ? netIncome / numberOfShares : 0;
    const priceToEarnings = earningsPerShare > 0 ? (marketValue / numberOfShares) / earningsPerShare : 0;
    const dividendYield = marketValue > 0 ? (dividendsPerShare * numberOfShares / marketValue) * 100 : 0;
    const bookValuePerShare = numberOfShares > 0 ? totalEquity / numberOfShares : 0;
    const priceToBook = bookValuePerShare > 0 ? (marketValue / numberOfShares) / bookValuePerShare : 0;

    const calculatedRatios = {
      liquidity: {
        currentRatio: { value: currentRatio, benchmark: "1.5-3.0", status: currentRatio >= 1.5 && currentRatio <= 3.0 ? "good" : currentRatio < 1.5 ? "poor" : "high" },
        quickRatio: { value: quickRatio, benchmark: "1.0-1.5", status: quickRatio >= 1.0 && quickRatio <= 1.5 ? "good" : quickRatio < 1.0 ? "poor" : "high" },
        cashRatio: { value: cashRatio, benchmark: "0.1-0.2", status: cashRatio >= 0.1 && cashRatio <= 0.2 ? "good" : cashRatio < 0.1 ? "poor" : "high" },
        workingCapital: { value: workingCapital, benchmark: "Positive", status: workingCapital > 0 ? "good" : "poor" }
      },
      activity: {
        assetTurnover: { value: assetTurnover, benchmark: "0.5-2.0", status: assetTurnover >= 0.5 && assetTurnover <= 2.0 ? "good" : "review" },
        inventoryTurnover: { value: inventoryTurnover, benchmark: "4-12", status: inventoryTurnover >= 4 && inventoryTurnover <= 12 ? "good" : "review" },
        receivablesTurnover: { value: receivablesTurnover, benchmark: "6-12", status: receivablesTurnover >= 6 && receivablesTurnover <= 12 ? "good" : "review" },
        daysInInventory: { value: daysInInventory, benchmark: "30-90 days", status: daysInInventory >= 30 && daysInInventory <= 90 ? "good" : "review" },
        daysInReceivables: { value: daysInReceivables, benchmark: "30-60 days", status: daysInReceivables >= 30 && daysInReceivables <= 60 ? "good" : "review" }
      },
      leverage: {
        debtToAssets: { value: debtToAssets * 100, benchmark: "30-60%", status: debtToAssets >= 0.3 && debtToAssets <= 0.6 ? "good" : debtToAssets < 0.3 ? "conservative" : "high" },
        debtToEquity: { value: debtToEquity, benchmark: "0.3-1.0", status: debtToEquity >= 0.3 && debtToEquity <= 1.0 ? "good" : debtToEquity < 0.3 ? "conservative" : "high" },
        equityRatio: { value: equityRatio * 100, benchmark: "40-70%", status: equityRatio >= 0.4 && equityRatio <= 0.7 ? "good" : "review" },
        interestCoverage: { value: interestCoverage, benchmark: "> 2.5", status: interestCoverage > 2.5 ? "good" : "poor" }
      },
      profitability: {
        grossProfitMargin: { value: grossProfitMargin, benchmark: "20-40%", status: grossProfitMargin >= 20 && grossProfitMargin <= 40 ? "good" : "review" },
        operatingMargin: { value: operatingMargin, benchmark: "10-20%", status: operatingMargin >= 10 && operatingMargin <= 20 ? "good" : "review" },
        netProfitMargin: { value: netProfitMargin, benchmark: "5-15%", status: netProfitMargin >= 5 && netProfitMargin <= 15 ? "good" : "review" },
        returnOnAssets: { value: returnOnAssets, benchmark: "5-15%", status: returnOnAssets >= 5 && returnOnAssets <= 15 ? "good" : "review" },
        returnOnEquity: { value: returnOnEquity, benchmark: "10-20%", status: returnOnEquity >= 10 && returnOnEquity <= 20 ? "good" : "review" }
      },
      market: {
        earningsPerShare: { value: earningsPerShare, benchmark: "Industry Avg", status: "review" },
        priceToEarnings: { value: priceToEarnings, benchmark: "10-25", status: priceToEarnings >= 10 && priceToEarnings <= 25 ? "good" : "review" },
        dividendYield: { value: dividendYield, benchmark: "2-6%", status: dividendYield >= 2 && dividendYield <= 6 ? "good" : "review" },
        bookValuePerShare: { value: bookValuePerShare, benchmark: "Industry Avg", status: "review" },
        priceToBook: { value: priceToBook, benchmark: "1-3", status: priceToBook >= 1 && priceToBook <= 3 ? "good" : "review" }
      }
    };

    setRatios(calculatedRatios);
  };

  const formatNumber = (value: number, isPercentage = false, isCurrency = false, decimals = 2) => {
    if (isNaN(value) || !isFinite(value)) return "N/A";
    
    if (isCurrency) {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(value);
    }
    
    if (isPercentage) {
      return `${value.toFixed(decimals)}%`;
    }
    
    return value.toFixed(decimals);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "good": return "text-green-600";
      case "poor": return "text-red-600";
      case "high": return "text-orange-600";
      case "conservative": return "text-blue-600";
      default: return "text-yellow-600";
    }
  };

  const resetForm = () => {
    setFinancialData({
      currentAssets: "",
      totalAssets: "",
      currentLiabilities: "",
      totalLiabilities: "",
      totalEquity: "",
      inventory: "",
      accountsReceivable: "",
      cash: "",
      longTermDebt: "",
      revenue: "",
      netIncome: "",
      grossProfit: "",
      operatingIncome: "",
      interestExpense: "",
      costOfGoodsSold: "",
      marketValue: "",
      numberOfShares: "",
      dividendsPerShare: ""
    });
    setRatios(null);
  };

  React.useEffect(() => {
    // Calculate ratios when any financial data changes
    const hasData = Object.values(financialData).some(value => value !== "");
    if (hasData) {
      calculateRatios();
    }
  }, [financialData]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Financial Data Input</h3>
            <Button variant="outline" size="sm" onClick={resetForm}>
              Reset All
            </Button>
          </div>
          
          <Tabs defaultValue="balance-sheet" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
              <TabsTrigger value="income">Income Statement</TabsTrigger>
              <TabsTrigger value="market">Market Data</TabsTrigger>
            </TabsList>

            <TabsContent value="balance-sheet" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="currentAssets">Current Assets (₹)</Label>
                  <Input
                    id="currentAssets"
                    type="number"
                    placeholder="0"
                    value={financialData.currentAssets}
                    onChange={(e) => setFinancialData({...financialData, currentAssets: e.target.value})}
                    className="text-right"
                  />
                </div>
                <div>
                  <Label htmlFor="totalAssets">Total Assets (₹)</Label>
                  <Input
                    id="totalAssets"
                    type="number"
                    placeholder="0"
                    value={financialData.totalAssets}
                    onChange={(e) => setFinancialData({...financialData, totalAssets: e.target.value})}
                    className="text-right"
                  />
                </div>
                <div>
                  <Label htmlFor="currentLiabilities">Current Liabilities (₹)</Label>
                  <Input
                    id="currentLiabilities"
                    type="number"
                    placeholder="0"
                    value={financialData.currentLiabilities}
                    onChange={(e) => setFinancialData({...financialData, currentLiabilities: e.target.value})}
                    className="text-right"
                  />
                </div>
                <div>
                  <Label htmlFor="totalLiabilities">Total Liabilities (₹)</Label>
                  <Input
                    id="totalLiabilities"
                    type="number"
                    placeholder="0"
                    value={financialData.totalLiabilities}
                    onChange={(e) => setFinancialData({...financialData, totalLiabilities: e.target.value})}
                    className="text-right"
                  />
                </div>
                <div>
                  <Label htmlFor="totalEquity">Total Equity (₹)</Label>
                  <Input
                    id="totalEquity"
                    type="number"
                    placeholder="0"
                    value={financialData.totalEquity}
                    onChange={(e) => setFinancialData({...financialData, totalEquity: e.target.value})}
                    className="text-right"
                  />
                </div>
                <div>
                  <Label htmlFor="inventory">Inventory (₹)</Label>
                  <Input
                    id="inventory"
                    type="number"
                    placeholder="0"
                    value={financialData.inventory}
                    onChange={(e) => setFinancialData({...financialData, inventory: e.target.value})}
                    className="text-right"
                  />
                </div>
                <div>
                  <Label htmlFor="accountsReceivable">Accounts Receivable (₹)</Label>
                  <Input
                    id="accountsReceivable"
                    type="number"
                    placeholder="0"
                    value={financialData.accountsReceivable}
                    onChange={(e) => setFinancialData({...financialData, accountsReceivable: e.target.value})}
                    className="text-right"
                  />
                </div>
                <div>
                  <Label htmlFor="cash">Cash & Equivalents (₹)</Label>
                  <Input
                    id="cash"
                    type="number"
                    placeholder="0"
                    value={financialData.cash}
                    onChange={(e) => setFinancialData({...financialData, cash: e.target.value})}
                    className="text-right"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="income" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="revenue">Revenue (₹)</Label>
                  <Input
                    id="revenue"
                    type="number"
                    placeholder="0"
                    value={financialData.revenue}
                    onChange={(e) => setFinancialData({...financialData, revenue: e.target.value})}
                    className="text-right"
                  />
                </div>
                <div>
                  <Label htmlFor="netIncome">Net Income (₹)</Label>
                  <Input
                    id="netIncome"
                    type="number"
                    placeholder="0"
                    value={financialData.netIncome}
                    onChange={(e) => setFinancialData({...financialData, netIncome: e.target.value})}
                    className="text-right"
                  />
                </div>
                <div>
                  <Label htmlFor="grossProfit">Gross Profit (₹)</Label>
                  <Input
                    id="grossProfit"
                    type="number"
                    placeholder="0"
                    value={financialData.grossProfit}
                    onChange={(e) => setFinancialData({...financialData, grossProfit: e.target.value})}
                    className="text-right"
                  />
                </div>
                <div>
                  <Label htmlFor="operatingIncome">Operating Income (₹)</Label>
                  <Input
                    id="operatingIncome"
                    type="number"
                    placeholder="0"
                    value={financialData.operatingIncome}
                    onChange={(e) => setFinancialData({...financialData, operatingIncome: e.target.value})}
                    className="text-right"
                  />
                </div>
                <div>
                  <Label htmlFor="costOfGoodsSold">Cost of Goods Sold (₹)</Label>
                  <Input
                    id="costOfGoodsSold"
                    type="number"
                    placeholder="0"
                    value={financialData.costOfGoodsSold}
                    onChange={(e) => setFinancialData({...financialData, costOfGoodsSold: e.target.value})}
                    className="text-right"
                  />
                </div>
                <div>
                  <Label htmlFor="interestExpense">Interest Expense (₹)</Label>
                  <Input
                    id="interestExpense"
                    type="number"
                    placeholder="0"
                    value={financialData.interestExpense}
                    onChange={(e) => setFinancialData({...financialData, interestExpense: e.target.value})}
                    className="text-right"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="market" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="marketValue">Market Value (₹)</Label>
                  <Input
                    id="marketValue"
                    type="number"
                    placeholder="0"
                    value={financialData.marketValue}
                    onChange={(e) => setFinancialData({...financialData, marketValue: e.target.value})}
                    className="text-right"
                  />
                </div>
                <div>
                  <Label htmlFor="numberOfShares">Number of Shares</Label>
                  <Input
                    id="numberOfShares"
                    type="number"
                    placeholder="0"
                    value={financialData.numberOfShares}
                    onChange={(e) => setFinancialData({...financialData, numberOfShares: e.target.value})}
                    className="text-right"
                  />
                </div>
                <div>
                  <Label htmlFor="dividendsPerShare">Dividends per Share (₹)</Label>
                  <Input
                    id="dividendsPerShare"
                    type="number"
                    placeholder="0"
                    value={financialData.dividendsPerShare}
                    onChange={(e) => setFinancialData({...financialData, dividendsPerShare: e.target.value})}
                    className="text-right"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Analysis Results */}
        <div className="space-y-4">
          {ratios ? (
            <>
              <h3 className="font-semibold">Ratio Analysis Results</h3>
              
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="liquidity">Liquidity</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                  <TabsTrigger value="leverage">Leverage</TabsTrigger>
                  <TabsTrigger value="profitability">Profit</TabsTrigger>
                </TabsList>

                <TabsContent value="liquidity" className="space-y-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Liquidity Ratios</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 text-sm">
                        {Object.entries(ratios.liquidity).map(([key, ratio]: [string, any]) => (
                          <div key={key} className="flex justify-between items-center">
                            <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                            <div className="text-right">
                              <div className={`font-medium ${getStatusColor(ratio.status)}`}>
                                {key === 'workingCapital' 
                                  ? formatNumber(ratio.value, false, true)
                                  : formatNumber(ratio.value)
                                }
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Target: {ratio.benchmark}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="activity" className="space-y-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Activity Ratios</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 text-sm">
                        {Object.entries(ratios.activity).map(([key, ratio]: [string, any]) => (
                          <div key={key} className="flex justify-between items-center">
                            <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                            <div className="text-right">
                              <div className={`font-medium ${getStatusColor(ratio.status)}`}>
                                {key.includes('days') ? `${formatNumber(ratio.value, false, false, 0)} days` : formatNumber(ratio.value)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Target: {ratio.benchmark}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="leverage" className="space-y-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Leverage Ratios</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 text-sm">
                        {Object.entries(ratios.leverage).map(([key, ratio]: [string, any]) => (
                          <div key={key} className="flex justify-between items-center">
                            <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                            <div className="text-right">
                              <div className={`font-medium ${getStatusColor(ratio.status)}`}>
                                {key.includes('Ratio') && !key.includes('equity') 
                                  ? formatNumber(ratio.value, true)
                                  : formatNumber(ratio.value)
                                }
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Target: {ratio.benchmark}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="profitability" className="space-y-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Profitability Ratios</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 text-sm">
                        {Object.entries(ratios.profitability).map(([key, ratio]: [string, any]) => (
                          <div key={key} className="flex justify-between items-center">
                            <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                            <div className="text-right">
                              <div className={`font-medium ${getStatusColor(ratio.status)}`}>
                                {formatNumber(ratio.value, true)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Target: {ratio.benchmark}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Enter financial data to calculate ratios</p>
                  <p className="text-xs mt-2">Input balance sheet and income statement data</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="mt-6 p-4 bg-muted/50 rounded-lg">
        <h3 className="font-semibold mb-2">Ratio Analysis Features:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p><strong>Comprehensive Analysis:</strong> Liquidity, activity, leverage, and profitability ratios</p>
            <p><strong>Industry Benchmarks:</strong> Compare against standard financial benchmarks</p>
          </div>
          <div>
            <p><strong>Real-time Calculations:</strong> Automatic updates as you enter data</p>
            <p><strong>Visual Indicators:</strong> Color-coded status for quick assessment</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Budget Analyzer Component
function BudgetAnalyzer() {
  const [budgetData, setBudgetData] = useState({
    categories: [
      { id: 1, name: "Revenue", budgeted: "", actual: "", type: "income" },
      { id: 2, name: "Cost of Goods Sold", budgeted: "", actual: "", type: "expense" },
      { id: 3, name: "Marketing", budgeted: "", actual: "", type: "expense" },
      { id: 4, name: "Operations", budgeted: "", actual: "", type: "expense" },
      { id: 5, name: "Administrative", budgeted: "", actual: "", type: "expense" },
      { id: 6, name: "Research & Development", budgeted: "", actual: "", type: "expense" }
    ]
  });

  const [analysis, setAnalysis] = useState<any>(null);
  const [period, setPeriod] = useState("monthly");

  const addCategory = () => {
    const newCategory = {
      id: Date.now(),
      name: "",
      budgeted: "",
      actual: "",
      type: "expense"
    };
    setBudgetData({
      ...budgetData,
      categories: [...budgetData.categories, newCategory]
    });
  };

  const removeCategory = (id: number) => {
    setBudgetData({
      ...budgetData,
      categories: budgetData.categories.filter(cat => cat.id !== id)
    });
  };

  const updateCategory = (id: number, field: string, value: string) => {
    setBudgetData({
      ...budgetData,
      categories: budgetData.categories.map(cat =>
        cat.id === id ? { ...cat, [field]: value } : cat
      )
    });
  };

  const calculateAnalysis = () => {
    const categories = budgetData.categories.filter(cat => 
      cat.name && (cat.budgeted || cat.actual)
    );

    let totalBudgetedIncome = 0;
    let totalActualIncome = 0;
    let totalBudgetedExpenses = 0;
    let totalActualExpenses = 0;

    const categoryAnalysis = categories.map(cat => {
      const budgeted = parseFloat(cat.budgeted) || 0;
      const actual = parseFloat(cat.actual) || 0;
      const variance = actual - budgeted;
      const variancePercentage = budgeted > 0 ? (variance / budgeted) * 100 : 0;

      if (cat.type === "income") {
        totalBudgetedIncome += budgeted;
        totalActualIncome += actual;
      } else {
        totalBudgetedExpenses += budgeted;
        totalActualExpenses += actual;
      }

      return {
        ...cat,
        budgeted,
        actual,
        variance,
        variancePercentage,
        status: Math.abs(variancePercentage) <= 5 ? "good" : 
               Math.abs(variancePercentage) <= 15 ? "warning" : "critical"
      };
    });

    const budgetedNetIncome = totalBudgetedIncome - totalBudgetedExpenses;
    const actualNetIncome = totalActualIncome - totalActualExpenses;
    const netVariance = actualNetIncome - budgetedNetIncome;
    const netVariancePercentage = budgetedNetIncome !== 0 ? (netVariance / budgetedNetIncome) * 100 : 0;

    setAnalysis({
      categories: categoryAnalysis,
      summary: {
        totalBudgetedIncome,
        totalActualIncome,
        totalBudgetedExpenses,
        totalActualExpenses,
        budgetedNetIncome,
        actualNetIncome,
        netVariance,
        netVariancePercentage,
        incomeVariance: totalActualIncome - totalBudgetedIncome,
        expenseVariance: totalActualExpenses - totalBudgetedExpenses,
        incomeVariancePercentage: totalBudgetedIncome > 0 ? ((totalActualIncome - totalBudgetedIncome) / totalBudgetedIncome) * 100 : 0,
        expenseVariancePercentage: totalBudgetedExpenses > 0 ? ((totalActualExpenses - totalBudgetedExpenses) / totalBudgetedExpenses) * 100 : 0
      }
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getVarianceColor = (status: string) => {
    switch (status) {
      case "good": return "text-green-600";
      case "warning": return "text-yellow-600";
      case "critical": return "text-red-600";
      default: return "text-gray-600";
    }
  };

  const getVarianceIcon = (variance: number) => {
    if (variance > 0) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (variance < 0) return <TrendingUp className="h-4 w-4 text-red-600 rotate-180" />;
    return <div className="h-4 w-4" />;
  };

  const resetAnalysis = () => {
    setBudgetData({
      categories: [
        { id: 1, name: "Revenue", budgeted: "", actual: "", type: "income" },
        { id: 2, name: "Cost of Goods Sold", budgeted: "", actual: "", type: "expense" },
        { id: 3, name: "Marketing", budgeted: "", actual: "", type: "expense" },
        { id: 4, name: "Operations", budgeted: "", actual: "", type: "expense" },
        { id: 5, name: "Administrative", budgeted: "", actual: "", type: "expense" },
        { id: 6, name: "Research & Development", budgeted: "", actual: "", type: "expense" }
      ]
    });
    setAnalysis(null);
  };

  React.useEffect(() => {
    const hasData = budgetData.categories.some(cat => 
      cat.name && (cat.budgeted || cat.actual)
    );
    if (hasData) {
      calculateAnalysis();
    } else {
      setAnalysis(null);
    }
  }, [budgetData]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Budget vs Actual Analysis</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addCategory}>
                <Plus className="h-4 w-4 mr-1" />
                Add Category
              </Button>
              <Button variant="outline" size="sm" onClick={resetAnalysis}>
                Reset All
              </Button>
            </div>
          </div>

          <div className="mb-4">
            <Label htmlFor="period">Analysis Period</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {budgetData.categories.map((category, index) => (
              <Card key={category.id} className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Category name"
                      value={category.name}
                      onChange={(e) => updateCategory(category.id, "name", e.target.value)}
                      className="flex-1"
                    />
                    <Select 
                      value={category.type} 
                      onValueChange={(value) => updateCategory(category.id, "type", value)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="income">Income</SelectItem>
                        <SelectItem value="expense">Expense</SelectItem>
                      </SelectContent>
                    </Select>
                    {budgetData.categories.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeCategory(category.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor={`budgeted-${category.id}`}>Budgeted Amount (₹)</Label>
                      <Input
                        id={`budgeted-${category.id}`}
                        type="number"
                        placeholder="0"
                        value={category.budgeted}
                        onChange={(e) => updateCategory(category.id, "budgeted", e.target.value)}
                        className="text-right"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`actual-${category.id}`}>Actual Amount (₹)</Label>
                      <Input
                        id={`actual-${category.id}`}
                        type="number"
                        placeholder="0"
                        value={category.actual}
                        onChange={(e) => updateCategory(category.id, "actual", e.target.value)}
                        className="text-right"
                      />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Analysis Results */}
        <div className="space-y-4">
          {analysis ? (
            <>
              <h3 className="font-semibold">Analysis Results</h3>
              
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Net Income</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      <div className="text-lg font-semibold">
                        {formatCurrency(analysis.summary.actualNetIncome)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Budgeted: {formatCurrency(analysis.summary.budgetedNetIncome)}
                      </div>
                      <div className={`text-xs flex items-center gap-1 ${analysis.summary.netVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {getVarianceIcon(analysis.summary.netVariance)}
                        {formatCurrency(Math.abs(analysis.summary.netVariance))} 
                        ({Math.abs(analysis.summary.netVariancePercentage).toFixed(1)}%)
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Total Income</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      <div className="text-lg font-semibold">
                        {formatCurrency(analysis.summary.totalActualIncome)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Budgeted: {formatCurrency(analysis.summary.totalBudgetedIncome)}
                      </div>
                      <div className={`text-xs flex items-center gap-1 ${analysis.summary.incomeVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {getVarianceIcon(analysis.summary.incomeVariance)}
                        {formatCurrency(Math.abs(analysis.summary.incomeVariance))} 
                        ({Math.abs(analysis.summary.incomeVariancePercentage).toFixed(1)}%)
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Total Expenses</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      <div className="text-lg font-semibold">
                        {formatCurrency(analysis.summary.totalActualExpenses)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Budgeted: {formatCurrency(analysis.summary.totalBudgetedExpenses)}
                      </div>
                      <div className={`text-xs flex items-center gap-1 ${analysis.summary.expenseVariance <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {getVarianceIcon(-analysis.summary.expenseVariance)}
                        {formatCurrency(Math.abs(analysis.summary.expenseVariance))} 
                        ({Math.abs(analysis.summary.expenseVariancePercentage).toFixed(1)}%)
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Budget Accuracy</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      <div className="text-lg font-semibold">
                        {(100 - Math.abs(analysis.summary.netVariancePercentage)).toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Accuracy Score
                      </div>
                      <div className={`text-xs ${Math.abs(analysis.summary.netVariancePercentage) <= 5 ? 'text-green-600' : Math.abs(analysis.summary.netVariancePercentage) <= 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {Math.abs(analysis.summary.netVariancePercentage) <= 5 ? 'Excellent' : 
                         Math.abs(analysis.summary.netVariancePercentage) <= 15 ? 'Good' : 'Needs Review'}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Category Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Category Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {analysis.categories.map((cat: any) => (
                      <div key={cat.id} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${cat.type === 'income' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                          <span className="font-medium text-sm">{cat.name}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm">
                            {formatCurrency(cat.actual)} / {formatCurrency(cat.budgeted)}
                          </div>
                          <div className={`text-xs flex items-center gap-1 ${getVarianceColor(cat.status)}`}>
                            {getVarianceIcon(cat.variance)}
                            {Math.abs(cat.variancePercentage).toFixed(1)}%
                            {cat.variancePercentage > 5 && <AlertTriangle className="h-3 w-3" />}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <PieChart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Enter budget and actual amounts to see analysis</p>
                  <p className="text-xs mt-2">Add categories and fill in data to get started</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="mt-6 p-4 bg-muted/50 rounded-lg">
        <h3 className="font-semibold mb-2">Budget Analysis Features:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p><strong>Variance Analysis:</strong> Compare budgeted vs actual amounts with percentage calculations</p>
            <p><strong>Category Management:</strong> Add, remove, and categorize income and expense items</p>
          </div>
          <div>
            <p><strong>Performance Indicators:</strong> Color-coded status indicators and accuracy scoring</p>
            <p><strong>Real-time Updates:</strong> Automatic recalculation as you enter data</p>
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

    // Calculate cumulative balances
    let cumulativePaid = 0;
    const instalments = instalmentSchedule.map((instalment, index) => {
      const taxDue = (totalTax * instalment.percentage) / 100;
      cumulativePaid += instalment.paid;
      const cumulativeTaxDue = (totalTax * instalment.percentage) / 100;
      const balance = cumulativeTaxDue - cumulativePaid;
      
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

// Currency Holding Decision Calculator Component
function CurrencyHoldingDecisionCalculator() {
  const [currencyType, setCurrencyType] = useState("USD");
  const [amount, setAmount] = useState("");
  const [currentRate, setCurrentRate] = useState("");
  const [targetRate, setTargetRate] = useState("");
  const [holdingPeriod, setHoldingPeriod] = useState("");
  const [fdInterestRate, setFdInterestRate] = useState("");
  const [inflationRate, setInflationRate] = useState("");
  const [isLoadingRate, setIsLoadingRate] = useState(false);
  const [rateLastUpdated, setRateLastUpdated] = useState<string | null>(null);
  const [result, setResult] = useState<{
    inrNow: number;
    fdGain: number;
    inrFuture: number;
    fxGain: number;
    netBenefit: number;
    recommendation: string;
    realGainAfterInflation: number;
    analysis: {
      convertNowTotal: number;
      holdTotal: number;
      breakEvenRate: number;
      riskAssessment: string;
    };
  } | null>(null);

  const currencyOptions = [
    { value: "USD", label: "US Dollar (USD)", symbol: "$" },
    { value: "EUR", label: "Euro (EUR)", symbol: "€" },
    { value: "GBP", label: "British Pound (GBP)", symbol: "£" }
  ];

  const fetchCurrentExchangeRate = async () => {
    setIsLoadingRate(true);
    try {
      // Using ExchangeRate-API which provides free access
      const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${currencyType}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch exchange rate');
      }
      
      const data = await response.json();
      const rate = data.rates.INR;
      
      if (rate) {
        setCurrentRate(rate.toFixed(2));
        setRateLastUpdated(new Date().toLocaleString());
        
        // Auto-calculate forward rate if holding period is provided
        if (holdingPeriod) {
          calculateForwardRate(rate);
        }
      } else {
        throw new Error('INR rate not found');
      }
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      // Fallback: try alternative API
      try {
        const fallbackResponse = await fetch(`https://open.er-api.com/v6/latest/${currencyType}`);
        const fallbackData = await fallbackResponse.json();
        const rate = fallbackData.rates.INR;
        
        if (rate) {
          setCurrentRate(rate.toFixed(2));
          setRateLastUpdated(new Date().toLocaleString());
          
          // Auto-calculate forward rate if holding period is provided
          if (holdingPeriod) {
            calculateForwardRate(rate);
          }
        } else {
          alert('Unable to fetch current exchange rate. Please enter manually.');
        }
      } catch (fallbackError) {
        alert('Unable to fetch current exchange rate. Please enter manually.');
      }
    } finally {
      setIsLoadingRate(false);
    }
  };

  const calculateForwardRate = (spotRate: number) => {
    const days = parseFloat(holdingPeriod);
    if (!days || days <= 0) return;

    // Interest rate differentials (approximate values based on current economic conditions)
    const interestRateDifferentials = {
      USD: 0.035, // US interest rates - India interest rates (approximate)
      EUR: 0.025, // EU interest rates - India interest rates  
      GBP: 0.030  // UK interest rates - India interest rates
    };

    // Forward rate calculation using interest rate parity
    // Forward Rate = Spot Rate × (1 + foreign rate) / (1 + domestic rate) ^ (days/365)
    const rateDifferential = interestRateDifferentials[currencyType as keyof typeof interestRateDifferentials] || 0.03;
    
    // Calculate forward premium/discount
    const timeToMaturity = days / 365;
    const forwardMultiplier = Math.pow(1 + rateDifferential, timeToMaturity);
    
    // Add market volatility factor based on currency
    const volatilityFactors = {
      USD: 0.02, // 2% annual volatility
      EUR: 0.025, // 2.5% annual volatility
      GBP: 0.03   // 3% annual volatility
    };
    
    const volatility = volatilityFactors[currencyType as keyof typeof volatilityFactors] || 0.025;
    const volatilityAdjustment = Math.random() * volatility * timeToMaturity * (Math.random() > 0.5 ? 1 : -1);
    
    // Calculate forward rate
    const forwardRate = spotRate * forwardMultiplier * (1 + volatilityAdjustment);
    
    setTargetRate(forwardRate.toFixed(2));
  };

  const calculateDecision = () => {
    const amt = parseFloat(amount);
    const currentExRate = parseFloat(currentRate);
    const targetExRate = parseFloat(targetRate);
    const days = parseFloat(holdingPeriod);
    const fdRate = parseFloat(fdInterestRate);
    const inflation = parseFloat(inflationRate) || 0;

    if (!amt || !currentExRate || !targetExRate || !days || !fdRate) return;

    // Immediate INR conversion
    const inrNow = amt * currentExRate;

    // FD interest earnings (if converted now)
    const fdGain = inrNow * (fdRate / 100) * (days / 365);

    // Future INR if held and converted later
    const inrFuture = amt * targetExRate;

    // FX Gain/Loss
    const fxGain = inrFuture - inrNow;

    // Net benefit comparison
    const netBenefit = fxGain - fdGain;

    // Real gain after inflation adjustment
    const inflationLoss = inrNow * (inflation / 100) * (days / 365);
    const realGainAfterInflation = netBenefit - inflationLoss;

    // Break-even exchange rate
    const breakEvenRate = currentExRate + (fdGain / amt);

    // Analysis
    const convertNowTotal = inrNow + fdGain;
    const holdTotal = inrFuture;

    // Risk assessment
    let riskAssessment = "";
    const rateChange = ((targetExRate - currentExRate) / currentExRate) * 100;
    
    if (Math.abs(rateChange) < 2) {
      riskAssessment = "Low volatility expected";
    } else if (Math.abs(rateChange) < 5) {
      riskAssessment = "Moderate volatility expected";
    } else {
      riskAssessment = "High volatility expected";
    }

    // Recommendation
    let recommendation = "";
    if (fxGain > fdGain * 1.1) { // 10% buffer for risk
      recommendation = "Hold Currency - Potential FX gains outweigh FD earnings";
    } else if (fdGain >= fxGain) {
      recommendation = "Convert Now - FD earnings are safer and comparable";
    } else {
      recommendation = "Marginal Benefit - Consider risk tolerance and market conditions";
    }

    setResult({
      inrNow,
      fdGain,
      inrFuture,
      fxGain,
      netBenefit,
      recommendation,
      realGainAfterInflation,
      analysis: {
        convertNowTotal,
        holdTotal,
        breakEvenRate,
        riskAssessment
      }
    });
  };

  const formatCurrency = (amount: number, currency = "INR") => {
    if (currency === "INR") {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(amount);
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2
    }).format(amount);
  };

  const resetCalculator = () => {
    setAmount("");
    setCurrentRate("");
    setTargetRate("");
    setHoldingPeriod("");
    setFdInterestRate("");
    setInflationRate("");
    setResult(null);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="currencyType">Currency Type</Label>
            <Select value={currencyType} onValueChange={setCurrencyType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencyOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="amount">Amount in {currencyType}</Label>
            <Input
              id="amount"
              type="number"
              placeholder="e.g., 10000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-right"
            />
          </div>

          <div>
            <Label htmlFor="currentRate">Current Exchange Rate (to INR)</Label>
            <div className="flex gap-2">
              <Input
                id="currentRate"
                type="number"
                step="0.01"
                placeholder="e.g., 83.25"
                value={currentRate}
                onChange={(e) => setCurrentRate(e.target.value)}
                className="text-right"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fetchCurrentExchangeRate}
                disabled={isLoadingRate}
                className="px-3"
              >
                {isLoadingRate ? (
                  <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  "Fetch"
                )}
              </Button>
            </div>
            {rateLastUpdated && (
              <p className="text-xs text-muted-foreground mt-1">
                Last updated: {rateLastUpdated}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="targetRate">Target Exchange Rate (to INR)</Label>
            <div className="flex gap-2">
              <Input
                id="targetRate"
                type="number"
                step="0.01"
                placeholder="e.g., 84.50"
                value={targetRate}
                onChange={(e) => setTargetRate(e.target.value)}
                className="text-right"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (currentRate && holdingPeriod) {
                    calculateForwardRate(parseFloat(currentRate));
                  } else {
                    alert('Please enter current rate and holding period first');
                  }
                }}
                disabled={!currentRate || !holdingPeriod}
                className="px-3"
              >
                Forward
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Use Forward button to calculate estimated future rate based on interest rate parity
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="holdingPeriod">Holding Period (days)</Label>
            <Input
              id="holdingPeriod"
              type="number"
              placeholder="e.g., 30"
              value={holdingPeriod}
              onChange={(e) => setHoldingPeriod(e.target.value)}
              className="text-right"
            />
          </div>

          <div>
            <Label htmlFor="fdInterestRate">INR FD Interest Rate (% per annum)</Label>
            <Input
              id="fdInterestRate"
              type="number"
              step="0.01"
              placeholder="e.g., 7.5"
              value={fdInterestRate}
              onChange={(e) => setFdInterestRate(e.target.value)}
              className="text-right"
            />
          </div>

          <div>
            <Label htmlFor="inflationRate">INR Inflation Rate (% per annum) - Optional</Label>
            <Input
              id="inflationRate"
              type="number"
              step="0.01"
              placeholder="e.g., 6.0"
              value={inflationRate}
              onChange={(e) => setInflationRate(e.target.value)}
              className="text-right"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={calculateDecision} className="flex-1">
              <Calculator className="h-4 w-4 mr-2" />
              Calculate Decision
            </Button>
            <Button onClick={resetCalculator} variant="outline">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">INR Value Today</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-blue-600">
                  {formatCurrency(result.inrNow)}
                </div>
                <p className="text-xs text-muted-foreground">
                  If converted immediately
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">FD Interest Earnings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-green-600">
                  {formatCurrency(result.fdGain)}
                </div>
                <p className="text-xs text-muted-foreground">
                  For {holdingPeriod} days
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Future INR Value</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-purple-600">
                  {formatCurrency(result.inrFuture)}
                </div>
                <p className="text-xs text-muted-foreground">
                  At target exchange rate
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">FX Gain/Loss</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-xl font-bold ${result.fxGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {result.fxGain >= 0 ? '+' : ''}{formatCurrency(result.fxGain)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Currency appreciation/depreciation
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recommendation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`p-4 rounded-lg mb-4 ${
                result.recommendation.includes('Hold') ? 'bg-green-50 border border-green-200' :
                result.recommendation.includes('Convert') ? 'bg-blue-50 border border-blue-200' :
                'bg-yellow-50 border border-yellow-200'
              }`}>
                <p className="font-semibold text-lg">{result.recommendation}</p>
                <p className="text-sm mt-2">
                  Net Benefit: <span className={`font-bold ${result.netBenefit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {result.netBenefit >= 0 ? '+' : ''}{formatCurrency(result.netBenefit)}
                  </span>
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Convert Now Scenario:</h4>
                  <p className="text-sm">Total Value: {formatCurrency(result.analysis.convertNowTotal)}</p>
                  <p className="text-sm text-muted-foreground">
                    (Principal + FD Interest for {holdingPeriod} days)
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Hold Currency Scenario:</h4>
                  <p className="text-sm">Total Value: {formatCurrency(result.analysis.holdTotal)}</p>
                  <p className="text-sm text-muted-foreground">
                    (At target rate of ₹{targetRate})
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t">
                <h4 className="font-semibold mb-2">Additional Analysis:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p><strong>Break-even Rate:</strong> ₹{result.analysis.breakEvenRate.toFixed(2)}</p>
                    <p><strong>Risk Assessment:</strong> {result.analysis.riskAssessment}</p>
                  </div>
                  <div>
                    {inflationRate && (
                      <p><strong>Real Gain (after inflation):</strong> 
                        <span className={`ml-1 ${result.realGainAfterInflation >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(result.realGainAfterInflation)}
                        </span>
                      </p>
                    )}
                    <p><strong>Rate Change Required:</strong> {((parseFloat(targetRate) - parseFloat(currentRate)) / parseFloat(currentRate) * 100).toFixed(2)}%</p>
                  </div>
                </div>
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
              <p>Enter currency details to analyze the holding decision</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 p-4 bg-muted/50 rounded-lg">
        <h3 className="font-semibold mb-2">Key Considerations:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p><strong>Market Risk:</strong> Exchange rates can be volatile and unpredictable</p>
            <p><strong>Opportunity Cost:</strong> FD earnings provide guaranteed returns</p>
          </div>
          <div>
            <p><strong>Time Factor:</strong> Longer holding periods increase uncertainty</p>
            <p><strong>Inflation Impact:</strong> Consider real returns after inflation</p>
          </div>
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
  const [isNumberConverterOpen, setIsNumberConverterOpen] = useState(false);
  const [isUnitConverterOpen, setIsUnitConverterOpen] = useState(false);
  const [isCashFlowAnalyzerOpen, setIsCashFlowAnalyzerOpen] = useState(false);
  const [isRatioAnalysisOpen, setIsRatioAnalysisOpen] = useState(false);
  const [isBudgetAnalyzerOpen, setIsBudgetAnalyzerOpen] = useState(false);
  const [isCurrencyHoldingDecisionOpen, setIsCurrencyHoldingDecisionOpen] = useState(false);

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
                    <CardTitle className="text-base">Currency Holding Decision Calculator</CardTitle>
                    <CardDescription>
                      Decide whether to convert foreign currency or hold for better rates
                    </CardDescription>
                  </div>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog open={isCurrencyHoldingDecisionOpen} onOpenChange={setIsCurrencyHoldingDecisionOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full">
                        Open Calculator
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Currency Holding Decision Calculator</DialogTitle>
                        <DialogDescription>
                          Compare the benefits of converting foreign currency immediately vs holding for potential exchange rate improvements
                        </DialogDescription>
                      </DialogHeader>
                      <CurrencyHoldingDecisionCalculator />
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
                  <Dialog open={isNumberConverterOpen} onOpenChange={setIsNumberConverterOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full">
                        Open Converter
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Number Converter</DialogTitle>
                        <DialogDescription>
                          Convert numbers to words and vice versa. Perfect for financial documents, check writing, and official paperwork with Indian number system support
                        </DialogDescription>
                      </DialogHeader>
                      <NumberConverter />
                    </DialogContent>
                  </Dialog>
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
                  <Ruler className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Dialog open={isUnitConverterOpen} onOpenChange={setIsUnitConverterOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full">
                        Open Converter
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Unit Converter</DialogTitle>
                        <DialogDescription>
                          Convert between various units including length, weight, temperature, volume, area, and pressure. Perfect for engineering calculations and technical work
                        </DialogDescription>
                      </DialogHeader>
                      <UnitConverter />
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          {/* Analysis Tools Tab */}
          <TabsContent value="analysis" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setIsCashFlowAnalyzerOpen(true)}
              >
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
                  <Button variant="outline" className="w-full" onClick={(e) => { e.stopPropagation(); setIsCashFlowAnalyzerOpen(true); }}>
                    Open Analyzer
                  </Button>
                </CardContent>
              </Card>

              <Card 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setIsRatioAnalysisOpen(true)}
              >
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
                  <Button variant="outline" className="w-full" onClick={(e) => { e.stopPropagation(); setIsRatioAnalysisOpen(true); }}>
                    Open Analyzer
                  </Button>
                </CardContent>
              </Card>

              <Card 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setIsBudgetAnalyzerOpen(true)}
              >
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
                  <Button variant="outline" className="w-full" onClick={(e) => { e.stopPropagation(); setIsBudgetAnalyzerOpen(true); }}>
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

        {/* Cash Flow Analyzer Dialog */}
        <Dialog open={isCashFlowAnalyzerOpen} onOpenChange={setIsCashFlowAnalyzerOpen}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Cash Flow Analyzer
              </DialogTitle>
              <DialogDescription>
                Track, analyze, and visualize cash flow patterns with comprehensive metrics
              </DialogDescription>
            </DialogHeader>
            <CashFlowAnalyzer />
          </DialogContent>
        </Dialog>

        {/* Ratio Analysis Dialog */}
        <Dialog open={isRatioAnalysisOpen} onOpenChange={setIsRatioAnalysisOpen}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Ratio Analysis
              </DialogTitle>
              <DialogDescription>
                Calculate and analyze financial ratios with industry benchmarks
              </DialogDescription>
            </DialogHeader>
            <RatioAnalysis />
          </DialogContent>
        </Dialog>

        {/* Budget Analyzer Dialog */}
        <Dialog open={isBudgetAnalyzerOpen} onOpenChange={setIsBudgetAnalyzerOpen}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5" />
                Budget Analyzer
              </DialogTitle>
              <DialogDescription>
                Compare budgeted vs actual performance with variance analysis
              </DialogDescription>
            </DialogHeader>
            <BudgetAnalyzer />
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}