import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { hashPassword } from "../lib/auth/password";
import { ROLE } from "../lib/auth/roles";

/**
 * Demo/test accounts — one per role, with known passwords.
 *
 * Development and test only. It refuses to run against NODE_ENV=production so
 * these predictable credentials can never reach a real deployment.
 */
const DEMO_PASSWORD = "Demo-Passw0rd-2026";

const PEOPLE = [
  { email: "cofounder@qonicsystems.com", name: "Priya Raman", role: ROLE.CO_FOUNDER, jobTitle: "Co-Founder", techStack: "Executive Leadership, System Design" },
  { email: "hr@qonicsystems.com", name: "Ananya Sharma", role: ROLE.DEVELOPER, jobTitle: "HR Operations Lead", techStack: "ATS, HR Governance, Contracts" },
  { email: "lead-dev@qonicsystems.com", name: "Neha Kulkarni", role: ROLE.DEVELOPER, jobTitle: "Lead Full-Stack Developer", techStack: "React, Next.js, Node.js, TypeScript, PostgreSQL" },
  { email: "backend-dev@qonicsystems.com", name: "Rahul Mehta", role: ROLE.DEVELOPER, jobTitle: "Senior Backend Developer", techStack: "Python, FastAPI, AWS, Docker, Kubernetes" },
  { email: "cloud-dev@qonicsystems.com", name: "Sana Iqbal", role: ROLE.DEVELOPER, jobTitle: "DevOps & Cloud Engineer", techStack: "Terraform, CI/CD, AWS, Golang, Linux" },
  { email: "developer@qonicsystems.com", name: "Arjun Nair", role: ROLE.DEVELOPER, jobTitle: "Software Engineer", techStack: "Next.js, TailwindCSS, GraphQL, Node.js" },
];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo accounts in production.");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  for (const person of PEOPLE) {
    const role = await db.role.findUniqueOrThrow({ where: { key: person.role } });
    const user = await db.user.upsert({
      where: { email: person.email },
      update: { roleId: role.id, jobTitle: person.jobTitle, techStack: person.techStack },
      create: { email: person.email, name: person.name, passwordHash, roleId: role.id, jobTitle: person.jobTitle, techStack: person.techStack, mustChangePassword: false },
    });

    if (person.email === "hr@qonicsystems.com") {
      // `contract.view_any` used to be listed here and matches nothing — the
      // catalog key is `contract.view_all` — so the HR demo account silently
      // came up one override short.
      const perms = await db.permission.findMany({ where: { key: { in: ["contract.generate", "contract.submit", "contract.view_all", "candidate.manage", "candidate.view"] } } });
      for (const p of perms) {
        await db.userPermissionOverride.upsert({
          where: { userId_permissionId: { userId: user.id, permissionId: p.id } },
          update: { effect: "ALLOW" },
          create: { userId: user.id, permissionId: p.id, effect: "ALLOW" },
        });
      }
    }

    console.log(`✔ ${person.email} (${role.label})`);
  }

  console.log(`\nAll demo accounts use the password: ${DEMO_PASSWORD}`);
  await db.$disconnect();
}

main().catch((error) => { console.error(error); process.exit(1); });
