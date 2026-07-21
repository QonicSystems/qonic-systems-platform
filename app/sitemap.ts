import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap { const baseUrl = `https://${site.domain}`; return ["", "/about", "/industries", "/services", "/contact", "/privacy", "/terms"].map((path) => ({ url: `${baseUrl}${path}`, lastModified: new Date(), changeFrequency: "monthly", priority: path === "" ? 1 : 0.7 })); }
