export type Placement =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-start"
  | "top-end"
  | "bottom-start"
  | "bottom-end"
  | "left-start"
  | "left-end"
  | "right-start"
  | "right-end";

export interface PositionOptions {
  anchor: HTMLElement;
  overlay: HTMLElement;
  placement?: Placement;
  offset?: number;
  boundary?: HTMLElement | null;
  autoFlip?: boolean;
  autoShift?: boolean;
}

export interface PositionResult {
  placement: Placement;
  top: number;
  left: number;
}

function getPlacementCoords(
  anchorRect: DOMRect,
  overlayRect: DOMRect,
  placement: Placement,
  offset: number
): { top: number; left: number } {
  const [side, alignment = "center"] = placement.split("-") as [string, string?];

  let top = 0;
  let left = 0;

  switch (side) {
    case "top":
      top = anchorRect.top - overlayRect.height - offset;
      break;
    case "bottom":
      top = anchorRect.bottom + offset;
      break;
    case "left":
      left = anchorRect.left - overlayRect.width - offset;
      break;
    case "right":
      left = anchorRect.right + offset;
      break;
  }

  switch (alignment) {
    case "start":
      if (side === "top" || side === "bottom") {
        left = anchorRect.left;
      } else {
        top = anchorRect.top;
      }
      break;
    case "end":
      if (side === "top" || side === "bottom") {
        left = anchorRect.right - overlayRect.width;
      } else {
        top = anchorRect.bottom - overlayRect.height;
      }
      break;
    default:
      if (side === "top" || side === "bottom") {
        left = anchorRect.left + (anchorRect.width - overlayRect.width) / 2;
      } else {
        top = anchorRect.top + (anchorRect.height - overlayRect.height) / 2;
      }
      break;
  }

  return { top, left };
}

function getOppositePlacement(placement: Placement): Placement {
  const [side, alignment] = placement.split("-") as [string, string?];
  const opposite: Record<string, string> = {
    top: "bottom",
    bottom: "top",
    left: "right",
    right: "left",
  };
  const newSide = opposite[side] ?? side;
  return alignment ? `${newSide}-${alignment}` as Placement : newSide as Placement;
}

function isOutOfBounds(
  top: number,
  left: number,
  overlayRect: DOMRect,
  boundary: DOMRect
): { top: boolean; left: boolean; right: boolean; bottom: boolean } {
  return {
    top: top < boundary.top,
    left: left < boundary.left,
    right: left + overlayRect.width > boundary.right,
    bottom: top + overlayRect.height > boundary.bottom,
  };
}

export function computePosition(options: PositionOptions): PositionResult {
  const {
    anchor,
    overlay,
    placement = "bottom",
    offset = 8,
    boundary = null,
    autoFlip = true,
    autoShift = true,
  } = options;

  const anchorRect = anchor.getBoundingClientRect();
  const overlayRect = overlay.getBoundingClientRect();
  const boundaryRect = boundary
    ? boundary.getBoundingClientRect()
    : new DOMRect(0, 0, window.innerWidth, window.innerHeight);

  let currentPlacement = placement;
  let coords = getPlacementCoords(anchorRect, overlayRect, currentPlacement, offset);
  let overflow = isOutOfBounds(coords.top, coords.left, overlayRect, boundaryRect);

  if (autoFlip) {
    const hasOverflow = Object.values(overflow).some(Boolean);
    if (hasOverflow) {
      const opposite = getOppositePlacement(currentPlacement);
      const oppositeCoords = getPlacementCoords(anchorRect, overlayRect, opposite, offset);
      const oppositeOverflow = isOutOfBounds(oppositeCoords.top, oppositeCoords.left, overlayRect, boundaryRect);

      const oppositeOverflowCount = Object.values(oppositeOverflow).filter(Boolean).length;
      const currentOverflowCount = Object.values(overflow).filter(Boolean).length;

      if (oppositeOverflowCount < currentOverflowCount) {
        currentPlacement = opposite;
        coords = oppositeCoords;
        overflow = oppositeOverflow;
      }
    }
  }

  if (autoShift) {
    if (overflow.left) {
      coords.left = boundaryRect.left;
    }
    if (overflow.right) {
      coords.left = boundaryRect.right - overlayRect.width;
    }
    if (overflow.top) {
      coords.top = boundaryRect.top;
    }
    if (overflow.bottom) {
      coords.top = boundaryRect.bottom - overlayRect.height;
    }
  }

  return {
    placement: currentPlacement,
    top: coords.top + window.scrollY,
    left: coords.left + window.scrollX,
  };
}

export function applyPosition(options: PositionOptions): PositionResult {
  const { overlay } = options;
  const result = computePosition(options);

  overlay.style.position = "absolute";
  overlay.style.top = `${result.top}px`;
  overlay.style.left = `${result.left}px`;

  return result;
}

export interface OverlayOptions {
  element: HTMLElement;
  zIndex?: number;
  closeOnEsc?: boolean;
  closeOnOutsideClick?: boolean;
  trapFocus?: boolean;
  returnFocusTo?: HTMLElement | null;
  onClose?: () => void;
}

export interface OverlayHandle {
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
  updatePosition: () => void;
}

const overlayStack: OverlayHandle[] = [];

function getTopZIndex(): number {
  if (overlayStack.length === 0) return 1000;
  return 1000 + overlayStack.length * 10;
}

function escapeOverlay(overlay: OverlayHandle): void {
  const index = overlayStack.indexOf(overlay);
  if (index !== -1) {
    overlayStack.splice(index, 1);
  }
}

export function createOverlay(options: OverlayOptions): OverlayHandle {
  const {
    element,
    zIndex,
    closeOnEsc = true,
    closeOnOutsideClick = true,
    trapFocus = false,
    returnFocusTo = null,
    onClose,
  } = options;

  let isOpen = false;
  let previousFocus: HTMLElement | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const handleEsc = (e: KeyboardEvent) => {
    if (e.key === "Escape" && closeOnEsc && isOpen) {
      close();
    }
  };

  const handleOutsideClick = (e: MouseEvent) => {
    if (!closeOnOutsideClick || !isOpen) return;
    if (!element.contains(e.target as Node)) {
      close();
    }
  };

  const handleTabTrap = (e: KeyboardEvent) => {
    if (!trapFocus || !isOpen) return;
    if (e.key !== "Tab") return;

    const focusable = element.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const open = (): void => {
    if (isOpen) return;
    isOpen = true;

    previousFocus = document.activeElement as HTMLElement | null;

    element.style.zIndex = String(zIndex ?? getTopZIndex());
    element.style.display = "block";

    overlayStack.push(handle);

    document.addEventListener("keydown", handleEsc);
    document.addEventListener("click", handleOutsideClick, true);
    document.addEventListener("keydown", handleTabTrap);

    if (trapFocus) {
      const focusable = element.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusable?.focus();
    }
  };

  const close = (): void => {
    if (!isOpen) return;
    isOpen = false;

    escapeOverlay(handle);

    element.style.display = "none";

    document.removeEventListener("keydown", handleEsc);
    document.removeEventListener("click", handleOutsideClick, true);
    document.removeEventListener("keydown", handleTabTrap);

    if (returnFocusTo) {
      returnFocusTo.focus();
    } else if (previousFocus) {
      previousFocus.focus();
    }

    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }

    onClose?.();
  };

  const updatePosition = (): void => {
    if (!isOpen) return;
  };

  const handle: OverlayHandle = {
    open,
    close,
    isOpen: () => isOpen,
    updatePosition,
  };

  return handle;
}

export function getOverlayStack(): ReadonlyArray<OverlayHandle> {
  return [...overlayStack];
}

export function closeAllOverlays(): void {
  while (overlayStack.length > 0) {
    overlayStack[overlayStack.length - 1]?.close();
  }
}
