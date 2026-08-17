"use client";

import React from "react";

type Props = {
  stack: string | ReadonlyArray<string> | null | undefined;
  className?: string;
  limit?: number;
};

/** High-contrast, tailored color themes for tech stack tokens */
const TECH_THEMES: Record<string, { bg: string; text: string; border: string }> = {
  // React / Frontend / Mobile
  react: { bg: "bg-cyan-500/15", text: "text-cyan-800 dark:text-cyan-300", border: "border-cyan-400/30" },
  nextjs: { bg: "bg-slate-900/10", text: "text-slate-900 dark:text-slate-200", border: "border-slate-400/40" },
  vue: { bg: "bg-emerald-500/15", text: "text-emerald-800 dark:text-emerald-300", border: "border-emerald-400/30" },
  angular: { bg: "bg-red-500/15", text: "text-red-800 dark:text-red-300", border: "border-red-400/30" },
  "react native": { bg: "bg-cyan-500/15", text: "text-cyan-800 dark:text-cyan-300", border: "border-cyan-400/30" },
  flutter: { bg: "bg-sky-500/15", text: "text-sky-800 dark:text-sky-300", border: "border-sky-400/30" },
  html: { bg: "bg-orange-500/15", text: "text-orange-800 dark:text-orange-300", border: "border-orange-400/30" },
  css: { bg: "bg-blue-500/15", text: "text-blue-800 dark:text-blue-300", border: "border-blue-400/30" },
  tailwind: { bg: "bg-teal-500/15", text: "text-teal-800 dark:text-teal-300", border: "border-teal-400/30" },

  // Languages & Core
  typescript: { bg: "bg-blue-500/15", text: "text-blue-800 dark:text-blue-300", border: "border-blue-400/30" },
  javascript: { bg: "bg-amber-500/15", text: "text-amber-800 dark:text-amber-300", border: "border-amber-400/30" },
  python: { bg: "bg-yellow-500/15", text: "text-yellow-800 dark:text-yellow-300", border: "border-yellow-400/30" },
  golang: { bg: "bg-cyan-500/15", text: "text-cyan-800 dark:text-cyan-300", border: "border-cyan-400/30" },
  go: { bg: "bg-cyan-500/15", text: "text-cyan-800 dark:text-cyan-300", border: "border-cyan-400/30" },
  rust: { bg: "bg-orange-600/15", text: "text-orange-900 dark:text-orange-300", border: "border-orange-500/30" },
  java: { bg: "bg-red-500/15", text: "text-red-800 dark:text-red-300", border: "border-red-400/30" },
  kotlin: { bg: "bg-purple-500/15", text: "text-purple-800 dark:text-purple-300", border: "border-purple-400/30" },
  swift: { bg: "bg-orange-500/15", text: "text-orange-800 dark:text-orange-300", border: "border-orange-400/30" },
  "c#": { bg: "bg-purple-600/15", text: "text-purple-900 dark:text-purple-300", border: "border-purple-500/30" },
  ".net": { bg: "bg-indigo-600/15", text: "text-indigo-900 dark:text-indigo-300", border: "border-indigo-500/30" },

  // Backend / Frameworks
  nodejs: { bg: "bg-emerald-600/15", text: "text-emerald-900 dark:text-emerald-300", border: "border-emerald-500/30" },
  "node.js": { bg: "bg-emerald-600/15", text: "text-emerald-900 dark:text-emerald-300", border: "border-emerald-500/30" },
  node: { bg: "bg-emerald-600/15", text: "text-emerald-900 dark:text-emerald-300", border: "border-emerald-500/30" },
  express: { bg: "bg-slate-600/15", text: "text-slate-800 dark:text-slate-300", border: "border-slate-400/30" },
  nestjs: { bg: "bg-rose-500/15", text: "text-rose-800 dark:text-rose-300", border: "border-rose-400/30" },
  django: { bg: "bg-emerald-800/15", text: "text-emerald-900 dark:text-emerald-300", border: "border-emerald-600/30" },
  fastapi: { bg: "bg-teal-600/15", text: "text-teal-900 dark:text-teal-300", border: "border-teal-500/30" },
  flask: { bg: "bg-slate-700/15", text: "text-slate-900 dark:text-slate-300", border: "border-slate-500/30" },
  spring: { bg: "bg-green-600/15", text: "text-green-900 dark:text-green-300", border: "border-green-500/30" },
  "spring boot": { bg: "bg-green-600/15", text: "text-green-900 dark:text-green-300", border: "border-green-500/30" },
  graphql: { bg: "bg-pink-600/15", text: "text-pink-900 dark:text-pink-300", border: "border-pink-500/30" },

  // Cloud & DevOps
  aws: { bg: "bg-amber-500/15", text: "text-amber-900 dark:text-amber-300", border: "border-amber-400/40" },
  azure: { bg: "bg-sky-600/15", text: "text-sky-900 dark:text-sky-300", border: "border-sky-500/30" },
  gcp: { bg: "bg-blue-600/15", text: "text-blue-900 dark:text-blue-300", border: "border-blue-500/30" },
  docker: { bg: "bg-sky-500/15", text: "text-sky-800 dark:text-sky-300", border: "border-sky-400/30" },
  kubernetes: { bg: "bg-blue-600/15", text: "text-blue-900 dark:text-blue-300", border: "border-blue-500/30" },
  terraform: { bg: "bg-purple-600/15", text: "text-purple-900 dark:text-purple-300", border: "border-purple-500/30" },
  devops: { bg: "bg-indigo-500/15", text: "text-indigo-800 dark:text-indigo-300", border: "border-indigo-400/30" },
  linux: { bg: "bg-yellow-600/15", text: "text-yellow-900 dark:text-yellow-300", border: "border-yellow-500/30" },

  // Databases & Storage
  postgresql: { bg: "bg-blue-700/15", text: "text-blue-950 dark:text-blue-300", border: "border-blue-500/30" },
  postgres: { bg: "bg-blue-700/15", text: "text-blue-950 dark:text-blue-300", border: "border-blue-500/30" },
  mysql: { bg: "bg-blue-500/15", text: "text-blue-900 dark:text-blue-300", border: "border-blue-400/30" },
  mongodb: { bg: "bg-emerald-600/15", text: "text-emerald-900 dark:text-emerald-300", border: "border-emerald-500/30" },
  redis: { bg: "bg-rose-600/15", text: "text-rose-900 dark:text-rose-300", border: "border-rose-500/30" },
  sql: { bg: "bg-indigo-500/15", text: "text-indigo-900 dark:text-indigo-300", border: "border-indigo-400/30" },
};

const DEFAULT_THEME = {
  bg: "bg-slate-100 dark:bg-neutral-800",
  text: "text-slate-700 dark:text-neutral-300",
  border: "border-slate-300 dark:border-neutral-700",
};

export function TechStackBadges({ stack, className = "", limit }: Props) {
  if (!stack) return <span className="text-slate-400 text-xs italic">—</span>;

  const rawList: string[] = typeof stack === "string"
    ? stack.split(/[,;|•]+/).map((s: string) => s.trim()).filter(Boolean)
    : Array.isArray(stack)
    ? (stack as readonly string[]).map((s) => String(s).trim()).filter(Boolean)
    : [];

  if (rawList.length === 0) return <span className="text-slate-400 text-xs italic">—</span>;

  const displayList = limit && limit > 0 ? rawList.slice(0, limit) : rawList;
  const remaining = limit && rawList.length > limit ? rawList.length - limit : 0;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {displayList.map((tech: string, idx: number) => {
        const key = tech.toLowerCase().replace(/[\s\-_.]+/g, "");
        const theme = TECH_THEMES[key] || TECH_THEMES[tech.toLowerCase()] || DEFAULT_THEME;

        return (
          <span
            key={`${tech}-${idx}`}
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${theme.bg} ${theme.text} ${theme.border} transition-all shadow-xs`}
            title={tech}
          >
            {tech}
          </span>
        );
      })}
      {remaining > 0 && (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300 dark:bg-neutral-800 dark:text-neutral-400"
          title={`${remaining} more technologies`}
        >
          +{remaining}
        </span>
      )}
    </div>
  );
}
