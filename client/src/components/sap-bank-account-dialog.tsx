import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, Building2 } from "lucide-react";

interface SapBankAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (bankAccountCode: string) => void;
  title?: string;
  description?: string;
  isPending?: boolean;
}

export default function SapBankAccountDialog({
  open,
  onOpenChange,
  onConfirm,
  title = "Select Bank Account for SAP Posting",
  description = "Choose the bank or cash account from which this payment was made. This will be used as the credit account in the SAP Journal Entry.",
  isPending = false,
}: SapBankAccountDialogProps) {
  const [bankAccountCode, setBankAccountCode] = useState("");
  const [manualEntry, setManualEntry] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: sapAccounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ["/api/statutory/sap-bank-accounts"],
    enabled: open,
  });

  const accounts: { code: string; name: string }[] = (sapAccounts as any)?.accounts || [];
  const filteredAccounts = accounts.filter(
    (a) =>
      a.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleConfirm = () => {
    if (bankAccountCode.trim()) {
      onConfirm(bankAccountCode.trim());
      setBankAccountCode("");
      setManualEntry(false);
      setSearchTerm("");
    }
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setBankAccountCode("");
      setManualEntry(false);
      setSearchTerm("");
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loadingAccounts ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span className="text-muted-foreground">Loading SAP accounts...</span>
            </div>
          ) : accounts.length > 0 && !manualEntry ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search accounts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-60 overflow-y-auto border rounded-md">
                {filteredAccounts.length > 0 ? (
                  filteredAccounts.map((acc) => (
                    <div
                      key={acc.code}
                      className={`px-3 py-2 cursor-pointer hover:bg-accent transition-colors text-sm ${
                        bankAccountCode === acc.code ? "bg-accent font-medium" : ""
                      }`}
                      onClick={() => setBankAccountCode(acc.code)}
                    >
                      {acc.name}
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-4 text-center text-muted-foreground text-sm">
                    No accounts match "{searchTerm}"
                  </div>
                )}
              </div>
              {bankAccountCode && (
                <div className="text-sm text-muted-foreground">
                  Selected: <span className="font-mono font-medium text-foreground">{bankAccountCode}</span>
                </div>
              )}
              <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => setManualEntry(true)}>
                Or enter account code manually
              </Button>
            </>
          ) : (
            <>
              <div>
                <Label>Bank / Cash Account Code</Label>
                <Input
                  value={bankAccountCode}
                  onChange={(e) => setBankAccountCode(e.target.value)}
                  placeholder="e.g., 1020001"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Enter the SAP GL account code for the bank/cash account
                </p>
              </div>
              {accounts.length > 0 && (
                <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => { setManualEntry(false); setBankAccountCode(""); }}>
                  Select from SAP accounts instead
                </Button>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={isPending}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!bankAccountCode.trim() || isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Posting...
              </>
            ) : (
              "Post to SAP"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
