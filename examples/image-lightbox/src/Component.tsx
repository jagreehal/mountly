import { useEffect, useId, useRef } from "react";

export interface ImageLightboxData {
  src: string;
  alt: string;
  caption?: string;
  /** Optional index shown as “03 / 12” style caption prefix. */
  index?: number;
  total?: number;
}

interface ImageLightboxProps {
  data: ImageLightboxData;
  onClose?: () => void;
}

const FOCUSABLE =
  'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function ImageLightbox({ data, onClose }: ImageLightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const captionId = useId();

  useEffect(() => {
    const el = dialogRef.current;
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
    const first = el.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => el.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const counter =
    data.index !== undefined && data.total !== undefined
      ? `${String(data.index).padStart(2, "0")} / ${String(data.total).padStart(2, "0")}`
      : null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={data.caption ? captionId : undefined}
      aria-label={data.caption ? undefined : data.alt}
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
      style={{
        background: "var(--lb-backdrop)",
        animation: "lb-fade-in 200ms ease-out",
      }}
      className="fixed inset-0 z-[2147483000] grid grid-rows-[1fr_auto] outline-none"
    >
      {counter && (
        <div
          className="pointer-events-none absolute left-6 top-6 text-[11px] tracking-[0.3em]"
          style={{
            color: "var(--lb-caption-subtle)",
            fontFamily: "var(--lb-font-mono)",
            animation: "lb-rise 400ms 60ms backwards ease-out",
          }}
        >
          {counter}
        </div>
      )}

      {onClose && (
        <button
          type="button"
          aria-label="Close lightbox"
          onClick={onClose}
          className="absolute right-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-full text-base outline-none transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            background: "var(--lb-button-bg)",
            color: "var(--lb-button-fg)",
            outlineColor: "var(--lb-accent)",
            animation: "lb-rise 400ms 80ms backwards ease-out",
          }}
        >
          <span aria-hidden>×</span>
        </button>
      )}

      <div className="flex min-h-0 items-center justify-center p-8">
        <img
          src={data.src}
          alt={data.alt}
          draggable={false}
          className="max-h-full max-w-full select-none object-contain"
          style={{
            border: "1px solid var(--lb-frame)",
            animation: "lb-rise 500ms 40ms backwards cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </div>

      <figcaption
        id={captionId}
        className="px-8 pb-8 text-center"
        style={{
          fontFamily: "var(--lb-font-caption)",
          animation: "lb-rise 500ms 160ms backwards ease-out",
        }}
      >
        {data.caption && (
          <p
            className="mx-auto max-w-prose text-[13px] leading-relaxed"
            style={{ color: "var(--lb-caption)" }}
          >
            {data.caption}
          </p>
        )}
        <p
          className="mt-2 text-[10px] uppercase tracking-[0.25em]"
          style={{ color: "var(--lb-caption-subtle)" }}
        >
          Press <kbd className="font-normal">Esc</kbd> or click outside to close
        </p>
      </figcaption>
    </div>
  );
}
