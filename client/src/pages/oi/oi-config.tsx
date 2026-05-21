import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import { Settings, Shield } from "lucide-react";

const WEIGHT_FIELDS = [
  { key: "technicalWeight",   label: "Technical" },
  { key: "qualityWeight",     label: "Quality" },
  { key: "safetyWeight",      label: "Safety" },
  { key: "financialWeight",   label: "Financial" },
  { key: "complianceWeight",  label: "Compliance" },
  { key: "scheduleWeight",    label: "Schedule" },
  { key: "liabilityWeight",   label: "Liability" },
  { key: "customerWeight",    label: "Customer" },
  { key: "operationalWeight", label: "Operational" },
];

const PROB_LABELS = ["Very Low (1)","Low (2)","Medium (3)","High (4)","Very High (5)"];
const IMPACT_LABELS = ["Negligible (1)","Minor (2)","Moderate (3)","Major (4)","Catastrophic (5)"];
const RATING_OPTIONS = ["low","medium","high","critical"];
const RATING_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const DEFAULT_MATRIX: Record<string, string> = {
  "1-1":"low","1-2":"low","1-3":"low","1-4":"medium","1-5":"medium",
  "2-1":"low","2-2":"low","2-3":"medium","2-4":"medium","2-5":"high",
  "3-1":"low","3-2":"medium","3-3":"medium","3-4":"high","3-5":"high",
  "4-1":"medium","4-2":"medium","4-3":"high","4-4":"high","4-5":"critical",
  "5-1":"medium","5-2":"high","5-3":"high","5-4":"critical","5-5":"critical",
};

export default function OiConfigPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isSuperuser = user?.role === "Superuser";

  const { data: weights } = useQuery<any>({ queryKey: ["/api/oi/config/risk-weights"] });
  const { data: matrixRows } = useQuery<any[]>({ queryKey: ["/api/oi/config/risk-matrix"] });

  const [weightForm, setWeightForm] = useState<Record<string, string>>({});
  const [matrixForm, setMatrixForm] = useState<Record<string, string>>({...DEFAULT_MATRIX});

  useEffect(() => {
    if (weights) {
      const init: Record<string, string> = {};
      WEIGHT_FIELDS.forEach(f => { init[f.key] = String(weights[f.key] ?? "1.0"); });
      setWeightForm(init);
    }
  }, [weights]);

  useEffect(() => {
    if (matrixRows && matrixRows.length > 0) {
      const init: Record<string, string> = {};
      matrixRows.forEach(r => { init[`${r.probability}-${r.impact}`] = r.riskRating; });
      setMatrixForm(prev => ({ ...DEFAULT_MATRIX, ...init }));
    }
  }, [matrixRows]);

  const weightsMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {};
      WEIGHT_FIELDS.forEach(f => { payload[f.key] = parseFloat(weightForm[f.key] ?? "1.0"); });
      return apiRequest("PUT", "/api/oi/config/risk-weights", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/oi/config/risk-weights"] });
      toast({ title: "Risk weights saved" });
    },
    onError: () => toast({ title: "Error", description: "Failed to save weights.", variant: "destructive" }),
  });

  const matrixMutation = useMutation({
    mutationFn: async (cell: { p: number; i: number; r: string }) => {
      return apiRequest("PUT", "/api/oi/config/risk-matrix", {
        probability: cell.p, impact: cell.i, riskRating: cell.r,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/oi/config/risk-matrix"] }),
  });

  if (!isSuperuser) {
    return (
      <Layout>
        <div className="p-4">
          <p className="text-gray-500">Configuration is restricted to Superusers.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Settings className="h-5 w-5 text-gray-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">OI Configuration</h1>
            <p className="text-sm text-gray-500">Risk weight and matrix configuration — Superuser only</p>
          </div>
        </div>

        {/* Risk Weights */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Shield className="h-4 w-4" /> Risk Weight Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-3 gap-3">
              {WEIGHT_FIELDS.map(f => (
                <div key={f.key} className="space-y-1">
                  <label className="text-xs text-gray-500">{f.label} Weight</label>
                  <Input
                    type="number" step="0.1" min="0" max="5"
                    value={weightForm[f.key] ?? "1.0"}
                    onChange={e => setWeightForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
            <Button onClick={() => weightsMutation.mutate()} disabled={weightsMutation.isPending} size="sm">
              {weightsMutation.isPending ? "Saving..." : "Save Weights"}
            </Button>
          </CardContent>
        </Card>

        {/* Risk Matrix */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700">Risk Matrix (Probability × Impact)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="p-2 text-left text-gray-500">P \ I</th>
                    {IMPACT_LABELS.map((l, i) => (
                      <th key={i} className="p-2 text-center text-gray-600 min-w-[110px]">{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PROB_LABELS.map((pl, pi) => (
                    <tr key={pi}>
                      <td className="p-2 text-gray-600 font-medium">{pl}</td>
                      {IMPACT_LABELS.map((il, ii) => {
                        const key = `${pi+1}-${ii+1}`;
                        const rating = matrixForm[key] ?? "low";
                        return (
                          <td key={ii} className="p-1">
                            <select
                              className={`w-full rounded px-2 py-1 text-xs font-medium border-0 ${RATING_COLORS[rating]}`}
                              value={rating}
                              onChange={e => {
                                setMatrixForm(prev => ({ ...prev, [key]: e.target.value }));
                                matrixMutation.mutate({ p: pi+1, i: ii+1, r: e.target.value });
                              }}
                            >
                              {RATING_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-2">Changes auto-save on selection.</p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
