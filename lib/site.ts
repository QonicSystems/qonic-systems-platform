export const site = {
  name: "QONIC consulting",
  /** Used wherever a plain, unstyled name is needed (PDF letterheads, emails). */
  legalName: "QONIC Consulting",
  tagline: "Consulting, Clarified",
  description: "Connecting Talent. Creating Tomorrow.",
  domain: "consulting.qonicsystems.com",
  email: "hello@qonicsystems.com",
  phone: "+1 (555) 123-4567",
  address: ["Global Plaza, Innovation District,", "Suite 400"],
  /** Taken directly from the supplied logo artwork. */
  brand: {
    /** The cube — the site's single highlight colour. */
    mark: "#FFD700",
    /** The wordmark, and the site's ink. */
    ink: "#111111",
    accent: "#FFD700",
  },
};

export const navigation = [
  ["Home", "/"],
  ["About Us", "/about"],
  ["Industries", "/industries"],
  ["Services", "/services"],
  ["Careers", "/careers"],
  ["Testimonials", "/#testimonials"],
  ["Contact Us", "/contact"],
] as const;

export const industries = [
  {
    title: "Information Technology",
    copy: "From cloud architects to cybersecurity specialists, we connect technology teams with the expertise that moves business forward.",
    icon: "code",
  },
  {
    title: "Non-IT & Corporate",
    copy: "Build high-performing finance, operations, HR, and executive teams with candidates who fit your culture and goals.",
    icon: "briefcase",
  },
  {
    title: "Pharmaceuticals",
    copy: "Advance discovery and commercialization with specialized talent across clinical, regulatory, quality, and manufacturing roles.",
    icon: "flask",
  },
  {
    title: "Biotechnology",
    copy: "Find the scientists, engineers, and leaders helping turn breakthrough science into real-world impact.",
    icon: "dna",
  },
  {
    title: "Medical Devices",
    copy: "Connect with proven experts in product development, quality systems, regulatory affairs, and market access.",
    icon: "heart",
  },
];

export const processSteps = [
  ["01", "Discovery", "We learn your business, culture, technical needs, and the outcomes the role must deliver."],
  ["02", "Sourcing & Vetting", "Our specialist recruiters identify, engage, and thoroughly assess exceptional candidates."],
  ["03", "Placement & Onboarding", "We manage the process through acceptance and remain a partner long after the placement."],
] as const;

export const testimonials = [
  {
    quote:
      "QONIC understood the specialized talent we needed from day one. They delivered a senior clinical operations leader who transformed our trial timelines.",
    name: "Dr. Sarah Mitchell",
    role: "VP Clinical Operations, NovaBio Therapeutics",
    initials: "SM",
  },
  {
    quote:
      "Their technology practice combines market intelligence with a genuinely consultative approach. Every candidate was relevant, prepared, and impressive.",
    name: "Marcus Chen",
    role: "Chief Technology Officer, TechFlow Solutions",
    initials: "MC",
  },
  {
    quote:
      "The team made a demanding search feel straightforward. Their communication, judgment, and attention to fit were exceptional throughout.",
    name: "Elena Rodriguez",
    role: "Director of Talent, MedTech Innovators",
    initials: "ER",
  },
];
