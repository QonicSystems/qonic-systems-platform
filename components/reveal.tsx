"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

/**
 * Fades content up as it scrolls into view. The hidden state lives in CSS (.reveal),
 * so a <noscript> rule in the layout keeps content visible when JS never runs, and the
 * reduced-motion block reveals it without transitioning.
 */
export function Reveal({ children, delay = 0, className = "", as: Tag = "div" }: { children: ReactNode; delay?: number; className?: string; as?: ElementType }) {
  const reference = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = reference.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setVisible(true);
      observer.disconnect();
    }, { threshold: 0.15, rootMargin: "0px 0px -60px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <Tag ref={reference} className={`reveal ${visible ? "is-visible" : ""} ${className}`.trim()} style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}>{children}</Tag>;
}
