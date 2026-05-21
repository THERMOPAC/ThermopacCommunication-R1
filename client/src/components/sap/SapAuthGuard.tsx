/**
 * SapAuthGuard — v2.0 (SAP Session Unification, 2026-05-21)
 *
 * DEPRECATION NOTICE — Legacy per-user SAP authentication removed.
 * The frontend no longer prompts for SAP credentials.
 * All SAP calls route through the backend SapCentralSession singleton
 * which uses server-side SAP_B1_USERNAME / SAP_B1_PASSWORD secrets.
 * No SAP credentials are ever sent to or stored in the browser.
 *
 * This component is now a transparent pass-through wrapper retained for
 * backward compat. It renders children immediately. SAP unavailability
 * is handled by each page's own query error state.
 */
export function SapAuthGuard({
  children,
  onSessionStatusChange: _onSessionStatusChange,
}: {
  children: React.ReactNode;
  onSessionStatusChange?: (isActive: boolean) => void;
}) {
  return <>{children}</>;
}
