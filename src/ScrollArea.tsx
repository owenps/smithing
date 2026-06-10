import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

interface ScrollAreaMetrics {
  clientHeight: number;
  clientWidth: number;
  scrollHeight: number;
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
}

interface DragState {
  axis: "vertical" | "horizontal";
  clientStart: number;
  scrollStart: number;
  thumbSize: number;
  trackSize: number;
  scrollSize: number;
  clientSize: number;
}

export function ScrollArea({ className, children }: { className?: string; children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [metrics, setMetrics] = useState<ScrollAreaMetrics>({
    clientHeight: 0,
    clientWidth: 0,
    scrollHeight: 0,
    scrollLeft: 0,
    scrollTop: 0,
    scrollWidth: 0,
  });

  const updateMetrics = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setMetrics({
      clientHeight: viewport.clientHeight,
      clientWidth: viewport.clientWidth,
      scrollHeight: viewport.scrollHeight,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      scrollWidth: viewport.scrollWidth,
    });
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    updateMetrics();
    const resizeObserver = new ResizeObserver(updateMetrics);
    resizeObserver.observe(viewport);
    if (viewport.firstElementChild) resizeObserver.observe(viewport.firstElementChild);

    const mutationObserver = new MutationObserver(updateMetrics);
    mutationObserver.observe(viewport, { childList: true, subtree: true });

    viewport.addEventListener("scroll", updateMetrics, { passive: true });
    return () => {
      viewport.removeEventListener("scroll", updateMetrics);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  const verticalVisible = metrics.scrollHeight > metrics.clientHeight + 1;
  const horizontalVisible = metrics.scrollWidth > metrics.clientWidth + 1;
  const verticalThumbHeight = thumbSize(metrics.clientHeight, metrics.scrollHeight);
  const horizontalThumbWidth = thumbSize(metrics.clientWidth, metrics.scrollWidth);
  const verticalThumbTop = thumbOffset(
    metrics.scrollTop,
    metrics.scrollHeight,
    metrics.clientHeight,
    verticalThumbHeight,
  );
  const horizontalThumbLeft = thumbOffset(
    metrics.scrollLeft,
    metrics.scrollWidth,
    metrics.clientWidth,
    horizontalThumbWidth,
  );

  const startDrag = (
    axis: DragState["axis"],
    event: PointerEvent<HTMLDivElement>,
    thumbSize: number,
  ) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      axis,
      clientStart: axis === "vertical" ? event.clientY : event.clientX,
      scrollStart: axis === "vertical" ? viewport.scrollTop : viewport.scrollLeft,
      thumbSize,
      trackSize: axis === "vertical" ? viewport.clientHeight : viewport.clientWidth,
      scrollSize: axis === "vertical" ? viewport.scrollHeight : viewport.scrollWidth,
      clientSize: axis === "vertical" ? viewport.clientHeight : viewport.clientWidth,
    };
  };

  const drag = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const dragState = dragRef.current;
    if (!viewport || !dragState) return;

    const currentClient = dragState.axis === "vertical" ? event.clientY : event.clientX;
    const delta = currentClient - dragState.clientStart;
    const trackScrollable = dragState.trackSize - dragState.thumbSize;
    const contentScrollable = dragState.scrollSize - dragState.clientSize;
    if (trackScrollable <= 0 || contentScrollable <= 0) return;

    const nextScroll = dragState.scrollStart + (delta / trackScrollable) * contentScrollable;
    if (dragState.axis === "vertical") viewport.scrollTop = nextScroll;
    else viewport.scrollLeft = nextScroll;
  };

  const stopDrag = () => {
    dragRef.current = null;
  };

  return (
    <div className={["fluidity-scroll-area", className].filter(Boolean).join(" ")}>
      <div ref={viewportRef} className="fluidity-scroll-area-viewport">
        {children}
      </div>
      {verticalVisible ? (
        <div className="fluidity-scroll-area-scrollbar fluidity-scroll-area-scrollbar-vertical">
          <div
            className="fluidity-scroll-area-thumb"
            style={{ height: verticalThumbHeight, transform: `translateY(${verticalThumbTop}px)` }}
            onPointerDown={(event) => startDrag("vertical", event, verticalThumbHeight)}
            onPointerMove={drag}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
          />
        </div>
      ) : null}
      {horizontalVisible ? (
        <div className="fluidity-scroll-area-scrollbar fluidity-scroll-area-scrollbar-horizontal">
          <div
            className="fluidity-scroll-area-thumb"
            style={{
              width: horizontalThumbWidth,
              transform: `translateX(${horizontalThumbLeft}px)`,
            }}
            onPointerDown={(event) => startDrag("horizontal", event, horizontalThumbWidth)}
            onPointerMove={drag}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
          />
        </div>
      ) : null}
    </div>
  );
}

function thumbSize(clientSize: number, scrollSize: number) {
  if (clientSize <= 0 || scrollSize <= clientSize) return 0;
  return Math.max(20, (clientSize / scrollSize) * clientSize);
}

function thumbOffset(
  scrollOffset: number,
  scrollSize: number,
  clientSize: number,
  thumbSize: number,
) {
  const contentScrollable = scrollSize - clientSize;
  const trackScrollable = clientSize - thumbSize;
  if (contentScrollable <= 0 || trackScrollable <= 0) return 0;
  return (scrollOffset / contentScrollable) * trackScrollable;
}
