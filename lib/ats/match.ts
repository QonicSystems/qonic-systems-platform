/**
 * Smart Tech Stack & Skill Matcher.
 *
 * Computes a semantic match score (0-100%) between a candidate's skills / tech stack
 * and a target job or project's requirements.
 */

// Normalized synonym dictionary for common tech variations
const TECH_SYNONYMS: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  node: "nodejs",
  "node.js": "nodejs",
  react: "reactjs",
  "react.js": "reactjs",
  next: "nextjs",
  "next.js": "nextjs",
  vue: "vuejs",
  "vue.js": "vuejs",
  postgres: "postgresql",
  psql: "postgresql",
  mongo: "mongodb",
  k8s: "kubernetes",
  docker: "docker",
  aws: "amazon-web-services",
  gcp: "google-cloud-platform",
  azure: "microsoft-azure",
  golang: "go",
  py: "python",
};

/** Normalizes a tech keyword token. */
function normalizeToken(token: string): string {
  const clean = token.toLowerCase().trim().replace(/[^a-z0-9+#.-]/g, "");
  return TECH_SYNONYMS[clean] ?? clean;
}

/** Extracts an array of distinct normalized technology tokens from a string. */
export function extractTechTokens(text: string | null | undefined): string[] {
  if (!text) return [];
  const rawTokens = text
    .split(/[,;/|\n\t]+|\s+and\s+|\s+with\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const tokenSet = new Set<string>();
  for (const raw of rawTokens) {
    const norm = normalizeToken(raw);
    if (norm.length > 1) tokenSet.add(norm);
  }
  return Array.from(tokenSet);
}

export type TechMatchResult = {
  score: number; // 0 to 100
  matchedSkills: string[];
  missingSkills: string[];
  matchLevel: "PERFECT" | "HIGH" | "MEDIUM" | "LOW";
};

/**
 * Computes the compatibility score between a candidate's tech stack and target requirements.
 */
export function calculateTechMatch(
  candidateTechStack: string | null | undefined,
  targetRequirements: string | null | undefined
): TechMatchResult {
  const candidateTokens = extractTechTokens(candidateTechStack);
  const targetTokens = extractTechTokens(targetRequirements);

  if (targetTokens.length === 0) {
    return {
      score: candidateTokens.length > 0 ? 80 : 50,
      matchedSkills: candidateTokens,
      missingSkills: [],
      matchLevel: "HIGH",
    };
  }

  if (candidateTokens.length === 0) {
    return {
      score: 0,
      matchedSkills: [],
      missingSkills: targetTokens,
      matchLevel: "LOW",
    };
  }

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  for (const req of targetTokens) {
    const isMatched = candidateTokens.some(
      (cand) => cand === req || cand.includes(req) || req.includes(cand)
    );
    if (isMatched) {
      matchedSkills.push(req);
    } else {
      missingSkills.push(req);
    }
  }

  const ratio = matchedSkills.length / targetTokens.length;
  const score = Math.round(ratio * 100);

  let matchLevel: TechMatchResult["matchLevel"] = "LOW";
  if (score >= 90) matchLevel = "PERFECT";
  else if (score >= 65) matchLevel = "HIGH";
  else if (score >= 40) matchLevel = "MEDIUM";

  return {
    score,
    matchedSkills,
    missingSkills,
    matchLevel,
  };
}
