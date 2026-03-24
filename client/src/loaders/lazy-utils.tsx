import { lazy, Suspense, ComponentType } from "react";
import { Loader2 } from "lucide-react";

function retryImport<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  retries = 3,
  delay = 1000
): Promise<{ default: T }> {
  return new Promise((resolve, reject) => {
    importFn()
      .then(resolve)
      .catch((error: Error) => {
        if (retries <= 0) {
          reject(error);
          return;
        }
        setTimeout(() => {
          retryImport(importFn, retries - 1, delay * 1.5).then(resolve, reject);
        }, delay);
      });
  });
}

export function lazyWithRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
) {
  return lazy(() => retryImport(importFn));
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-border" />
    </div>
  );
}

export function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}
