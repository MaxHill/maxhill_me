/**
 * A fully composable "outside click but not scroll" handler.
 * Reusable in any web component or general code.
 * 
 * Detects clicks outside of a host element while intelligently ignoring
 * scroll gestures and touch events that involve movement.
 */
export class OutsideClickController {
  private host: HTMLElement;
  private callback: (event: PointerEvent) => void;
  private threshold: number;
  private scrollCooldown: number;
  
  private startX: number = 0;
  private startY: number = 0;
  private ignoreUntil: number = 0;

  constructor(
    host: HTMLElement, 
    callback: (event: PointerEvent) => void, 
    options: { threshold?: number; scrollCooldown?: number } = {}
  ) {
    this.host = host;
    this.callback = callback;

    this.threshold = options.threshold ?? 8;      // movement px
    this.scrollCooldown = options.scrollCooldown ?? 100; // ms
  }

  connect(): void {
    document.addEventListener("pointerdown", this.handlePointerDown, true);
    document.addEventListener("pointerup", this.handlePointerUp, true);
    window.addEventListener("scroll", this.handleScroll, true);
  }

  disconnect(): void {
    document.removeEventListener("pointerdown", this.handlePointerDown, true);
    document.removeEventListener("pointerup", this.handlePointerUp, true);
    window.removeEventListener("scroll", this.handleScroll, true);
  }

  private handlePointerDown = (e: PointerEvent): void => {
    // Ignore multitouch
    if (e.pointerType === "touch" && !e.isPrimary) return;
    this.startX = e.clientX;
    this.startY = e.clientY;
  }

  private handlePointerUp = (e: PointerEvent): void => {
    const now = performance.now();
    if (now < this.ignoreUntil) return;

    // Ignore multitouch
    if (e.pointerType === "touch" && !e.isPrimary) return;

    const dx = Math.abs(e.clientX - this.startX);
    const dy = Math.abs(e.clientY - this.startY);
    const moved = Math.max(dx, dy);

    if (moved > this.threshold) return; // scroll → ignore

    // Must use composedPath() for Shadow DOM correctness
    if (e.composedPath().includes(this.host)) return;

    this.callback(e); // real outside click
  }

  private handleScroll = (): void => {
    this.ignoreUntil = performance.now() + this.scrollCooldown;
  }
}
