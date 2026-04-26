import { useEffect, useId, useRef } from "react";

export interface PaymentItem {
  description: string;
  amount: number;
  currency: string;
}

export interface PaymentBreakdownData {
  total: number;
  currency: string;
  items: PaymentItem[];
  tax?: number;
  discount?: number;
  /** Optional reference id shown in the header (e.g. "pay_123"). */
  reference?: string;
}

interface PaymentBreakdownProps {
  data: PaymentBreakdownData;
  onClose?: () => void;
}

const fmt = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    amount
  );

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useDialogKeyboard(
  ref: React.RefObject<HTMLDivElement | null>,
  onClose: (() => void) | undefined
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const focusables = Array.from(
        el.querySelectorAll<HTMLElement>(FOCUSABLE)
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const root = el.getRootNode();
      const active =
        root instanceof ShadowRoot
          ? (root.activeElement as HTMLElement | null)
          : (document.activeElement as HTMLElement | null);

      if (e.shiftKey && (active === first || !active)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    el.addEventListener("keydown", handleKey);
    return () => el.removeEventListener("keydown", handleKey);
  }, [ref, onClose]);
}

export function PaymentBreakdown({ data, onClose }: PaymentBreakdownProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useDialogKeyboard(dialogRef, onClose);

  useEffect(() => {
    // Move focus into the dialog on mount so keyboard users can interact.
    const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
  }, []);

  const subtotal = data.items.reduce((sum, it) => sum + it.amount, 0);
  const hasAdjustments = data.tax !== undefined || data.discount !== undefined;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={{
        fontFamily: "var(--ui-font-body)",
        background: "var(--ui-surface)",
        color: "var(--ui-text)",
        borderColor: "var(--ui-border)",
        borderRadius: "var(--ui-radius)",
        boxShadow: "var(--ui-shadow)",
      }}
      className="relative w-[340px] max-w-full border px-5 pb-5 pt-4 outline-none"
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "var(--ui-muted)" }}
          >
            {data.reference ? `Payment · ${data.reference}` : "Payment"}
          </p>
          <h2
            id={titleId}
            className="mt-0.5 text-base font-medium leading-tight"
            style={{ color: "var(--ui-text)" }}
          >
            Breakdown
          </h2>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close payment breakdown"
            className="-mr-1 -mt-1 inline-flex h-7 w-7 items-center justify-center rounded-[calc(var(--ui-radius)/2)] text-base leading-none outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              color: "var(--ui-muted)",
              outlineColor: "var(--ui-accent)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--ui-text)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--ui-muted)")
            }
          >
            <span aria-hidden>×</span>
          </button>
        )}
      </header>

      <ol
        className="mt-4 space-y-1.5 text-sm"
        style={{ color: "var(--ui-text-subtle)" }}
      >
        {data.items.map((item, i) => (
          <li key={i} className="flex items-baseline gap-4">
            <span className="min-w-0 flex-1 truncate">{item.description}</span>
            <span
              className="tabular-nums"
              style={{ fontFamily: "var(--ui-font-numeric)" }}
            >
              {fmt(item.amount, item.currency)}
            </span>
          </li>
        ))}
      </ol>

      {hasAdjustments && (
        <>
          <div
            className="my-3 h-px"
            style={{ background: "var(--ui-border)" }}
            aria-hidden
          />
          <dl
            className="space-y-1 text-sm"
            style={{ color: "var(--ui-text-subtle)" }}
          >
            <div className="flex items-baseline gap-4">
              <dt className="flex-1">Subtotal</dt>
              <dd
                className="tabular-nums"
                style={{ fontFamily: "var(--ui-font-numeric)" }}
              >
                {fmt(subtotal, data.currency)}
              </dd>
            </div>
            {data.tax !== undefined && (
              <div className="flex items-baseline gap-4">
                <dt className="flex-1">Tax</dt>
                <dd
                  className="tabular-nums"
                  style={{ fontFamily: "var(--ui-font-numeric)" }}
                >
                  {fmt(data.tax, data.currency)}
                </dd>
              </div>
            )}
            {data.discount !== undefined && (
              <div
                className="flex items-baseline gap-4"
                style={{ color: "var(--ui-positive)" }}
              >
                <dt className="flex-1">Discount</dt>
                <dd
                  className="tabular-nums"
                  style={{ fontFamily: "var(--ui-font-numeric)" }}
                >
                  −{fmt(data.discount, data.currency)}
                </dd>
              </div>
            )}
          </dl>
        </>
      )}

      <div
        className="mt-4 border-t pt-3"
        style={{ borderColor: "var(--ui-rule)" }}
      >
        <div className="flex items-end justify-between gap-4">
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "var(--ui-muted)" }}
          >
            Total due
          </span>
          <span
            className="text-2xl font-semibold leading-none tabular-nums"
            style={{
              fontFamily: "var(--ui-font-numeric)",
              color: "var(--ui-accent)",
            }}
          >
            {fmt(data.total, data.currency)}
          </span>
        </div>
      </div>
    </div>
  );
}
