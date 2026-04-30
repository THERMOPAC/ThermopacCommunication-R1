import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Helmet } from 'react-helmet';
import Layout from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Settings, FilePen, FolderOpen, Save, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { fmtDateTime } from '@/lib/date-utils';

export default function SystemSettingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Structuring Agent Settings ────────────────────────────────────────────
  const { data: agentSettings, isLoading: settingsLoading } = useQuery<{
    templatePath: string | null;
    stagingRoot: string | null;
    updatedBy?: string | null;
    updatedAt?: string | null;
  }>({
    queryKey: ['/api/epc-structuring-settings'],
  });

  const [templatePath, setTemplatePath] = useState('');
  const [stagingRoot, setStagingRoot]   = useState('');
  const [initialised, setInitialised]   = useState(false);

  if (agentSettings && !initialised) {
    setTemplatePath(agentSettings.templatePath ?? '');
    setStagingRoot(agentSettings.stagingRoot ?? '');
    setInitialised(true);
  }

  const saveSettingsMutation = useMutation({
    mutationFn: () => apiRequest('PUT', '/api/epc-structuring-settings', {
      templatePath: templatePath || null,
      stagingRoot:  stagingRoot  || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/epc-structuring-settings'] });
      toast({ title: 'Settings saved', description: 'Structuring agent paths updated.' });
    },
    onError: (err: any) => {
      toast({ title: 'Save failed', description: err?.message ?? 'Could not save settings.', variant: 'destructive' });
    },
  });

  const bothConfigured = !!(templatePath.trim() && stagingRoot.trim());

  return (
    <Layout>
      <Helmet><title>System Settings — THERMOPAC ERP</title></Helmet>

      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold">System Settings</h1>
            <p className="text-sm text-muted-foreground">Platform-wide configuration for integrated agents and services</p>
          </div>
        </div>

        {/* ── Structuring Agent Settings ──────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <FilePen className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-sm font-semibold">SolidWorks Structuring Agent</CardTitle>
              <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 dark:text-amber-300">
                WRITE ONLY · Phase 1
              </Badge>
            </div>
            <CardDescription className="text-xs">
              These paths are embedded into every structuring job sent to the Windows agent.
              The agent reads the template from <strong>Template Path</strong> and saves the
              output <code>.slddrw</code> under <strong>Staging Root</strong>.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {settingsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <>
                {/* Template Path */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                    SolidWorks Drawing Template Path
                  </Label>
                  <Input
                    value={templatePath}
                    onChange={e => setTemplatePath(e.target.value)}
                    placeholder="C:\SolidWorks\Templates\ThermopacDrawing.drwdot"
                    className="font-mono text-xs h-8"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Full Windows path to the <code>.drwdot</code> template file on the agent machine.
                    Example: <code>C:\SolidWorks\Templates\ThermopacDrawing.drwdot</code>
                  </p>
                </div>

                {/* Staging Root */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                    Staging Save Root Path
                  </Label>
                  <Input
                    value={stagingRoot}
                    onChange={e => setStagingRoot(e.target.value)}
                    placeholder="C:\ThermopacStaging\drawings"
                    className="font-mono text-xs h-8"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Root folder where the agent saves output drawings.
                    Each job creates a subfolder: <code>{'<stagingRoot>\\<drawingControlId>\\'}</code>.
                    Example: <code>C:\ThermopacStaging\drawings</code>
                  </p>
                </div>

                {/* Status indicator */}
                {!bothConfigured && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      Both paths must be configured before the Structuring Agent can process jobs.
                      The "Create SolidWorks Drawing" button on the DDS form will still queue jobs,
                      but the agent will skip them until paths are set.
                    </span>
                  </div>
                )}

                {bothConfigured && agentSettings?.updatedAt && (
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    Last saved by <strong>{agentSettings.updatedBy ?? '—'}</strong> on{' '}
                    {fmtDateTime(agentSettings.updatedAt)}
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    disabled={saveSettingsMutation.isPending}
                    onClick={() => saveSettingsMutation.mutate()}
                  >
                    {saveSettingsMutation.isPending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      : <Save className="h-3.5 w-3.5 mr-1.5" />}
                    Save Paths
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Placeholder for future settings sections ────────────────────── */}
        <Card className="opacity-60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground">More settings coming soon</CardTitle>
            <CardDescription className="text-xs">
              Additional system-wide configuration will appear here (email relay, GCS buckets, integration keys).
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </Layout>
  );
}
