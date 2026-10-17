"use client";
// A small error boundary for one card or picture: when its children throw while rendering, it shows `fallback` (nothing by
// default) and logs the error, instead of taking the whole page down to the root error screen. For extras that a lifter can do
// without (a drawing, a suggestion), never for the core of a page.
import { Component, type ErrorInfo, type ReactNode } from "react";

export interface SafeBoundaryProps {
  /** Names the part in the console log ("Next up", "equipment drawing"). */
  label: string;
  children: ReactNode;
  /** What to show instead; receives the error so a fallback can mention it. */
  fallback?: (error: Error) => ReactNode;
}

export class SafeBoundary extends Component<SafeBoundaryProps, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}] failed to render`, error, info.componentStack);
  }

  override render() {
    if (this.state.error) return this.props.fallback ? this.props.fallback(this.state.error) : null;
    return this.props.children;
  }
}
