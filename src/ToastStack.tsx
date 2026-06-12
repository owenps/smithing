import { BrailleSpinner } from "./BrailleSpinner";

export type ToastSeverity = "error" | "info" | "success";

const toastSeverityLabels: Record<ToastSeverity, string> = {
  error: "Error",
  info: "Info",
  success: "Success",
};

export interface ToastAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
}

export interface AppToast {
  id: string;
  severity: ToastSeverity;
  title: string;
  detail?: string;
  actions?: ToastAction[];
  autoDismiss?: boolean;
  loading?: boolean;
}

interface ToastStackProps {
  toasts: AppToast[];
  onDismiss: (toastId: string) => void;
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" aria-live="polite" aria-relevant="additions removals">
      {toasts.map((toast) => (
        <article key={toast.id} className={`toast toast-${toast.severity}`}>
          {toast.loading ? (
            <span className="toast-loading-icon" aria-hidden="true">
              <BrailleSpinner />
            </span>
          ) : (
            <span className="toast-icon" aria-hidden="true" />
          )}
          <div className="toast-copy">
            <span className="toast-status-label">{toastSeverityLabels[toast.severity]}</span>
            <h2>{toast.title}</h2>
            {toast.detail ? <p>{toast.detail}</p> : null}
            {toast.actions?.length ? (
              <div className="toast-actions">
                {toast.actions.map((action) => (
                  <button
                    key={action.label}
                    className={`toast-action toast-action-${action.variant ?? "secondary"}`}
                    type="button"
                    onClick={action.onClick}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            className="toast-dismiss"
            type="button"
            aria-label={`Dismiss ${toast.title}`}
            onClick={() => onDismiss(toast.id)}
          >
            ×
          </button>
        </article>
      ))}
    </div>
  );
}
