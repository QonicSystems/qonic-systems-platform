"use client";

import { useEffect, useState } from "react";
import { testimonials } from "@/lib/site";

export function TestimonialCarousel() {
  const [current, setCurrent] = useState(0);
  const next = () => setCurrent((index) => (index + 1) % testimonials.length);
  const previous = () => setCurrent((index) => (index - 1 + testimonials.length) % testimonials.length);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(next, 6000);
    return () => window.clearInterval(timer);
  }, []);

  return <div className="testimonial-region" role="region" aria-roledescription="carousel" aria-label="Client testimonials" onKeyDown={(event) => { if (event.key === "ArrowLeft") previous(); if (event.key === "ArrowRight") next(); }}>
    <article className="testimonial-card" aria-live="polite"><div className="testimonial-stars" aria-label="5 out of 5 stars">★★★★★</div><blockquote key={current}>“{testimonials[current].quote}”</blockquote><div key={`by-${current}`} className="mt-8 flex items-center gap-4" style={{ animation: "quote-in .5s var(--ease) .06s both" }}><span className="avatar">{testimonials[current].initials}</span><div><strong>{testimonials[current].name}</strong><p>{testimonials[current].role}</p></div></div></article>
    <div className="mt-8 flex items-center justify-center gap-4"><button className="carousel-button" type="button" onClick={previous} aria-label="Previous testimonial">←</button><div className="flex gap-2" role="tablist" aria-label="Choose testimonial">{testimonials.map((testimonial, index) => <button key={testimonial.name} type="button" className={`carousel-dot ${current === index ? "is-active" : ""}`} onClick={() => setCurrent(index)} aria-label={`Show testimonial ${index + 1}`} aria-selected={current === index} role="tab" />)}</div><button className="carousel-button" type="button" onClick={next} aria-label="Next testimonial">→</button></div>
  </div>;
}
