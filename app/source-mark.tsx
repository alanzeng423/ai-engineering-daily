import type { IconType } from "react-icons";
import { BsOpenai } from "react-icons/bs";
import { FaMicrosoft } from "react-icons/fa6";
import { LuFileText, LuGlobe, LuRss } from "react-icons/lu";
import {
  SiAnthropic,
  SiArxiv,
  SiCloudflare,
  SiCncf,
  SiGithub,
  SiGoogle,
  SiHuggingface,
  SiMedium,
  SiReddit,
  SiSubstack,
  SiVercel,
  SiWechat,
  SiX,
  SiYoutube,
} from "react-icons/si";

type SourceIdentity = {
  brand: string;
  label: string;
  icon?: IconType;
  faviconUrl?: string;
};

const platformCatalog: Record<string, SourceIdentity> = {
  arxiv: { brand: "arxiv", label: "arXiv", icon: SiArxiv },
  huggingface: { brand: "hugging-face", label: "Hugging Face", icon: SiHuggingface },
  x: { brand: "x", label: "X", icon: SiX },
  reddit: { brand: "reddit", label: "Reddit", icon: SiReddit },
  wechat: { brand: "wechat", label: "微信公众号", icon: SiWechat },
  github: { brand: "github", label: "GitHub", icon: SiGithub },
  openreview: { brand: "openreview", label: "OpenReview", icon: LuFileText },
  medium: { brand: "medium", label: "Medium", icon: SiMedium },
  substack: { brand: "substack", label: "Substack", icon: SiSubstack },
  youtube: { brand: "youtube", label: "YouTube", icon: SiYoutube },
  newsletter: { brand: "newsletter", label: "Newsletter", icon: LuRss },
};

const siteCatalog: Array<SourceIdentity & { hosts: string[] }> = [
  { brand: "openai", label: "OpenAI", icon: BsOpenai, hosts: ["openai.com"] },
  {
    brand: "anthropic",
    label: "Anthropic",
    icon: SiAnthropic,
    hosts: ["anthropic.com", "claude.com"],
  },
  {
    brand: "google",
    label: "Google",
    icon: SiGoogle,
    hosts: ["google.com", "googleblog.com", "research.google"],
  },
  { brand: "github", label: "GitHub", icon: SiGithub, hosts: ["github.com", "github.blog"] },
  { brand: "vercel", label: "Vercel", icon: SiVercel, hosts: ["vercel.com"] },
  { brand: "microsoft", label: "Microsoft", icon: FaMicrosoft, hosts: ["microsoft.com"] },
  { brand: "cncf", label: "CNCF", icon: SiCncf, hosts: ["cncf.io"] },
  {
    brand: "cloudflare",
    label: "Cloudflare",
    icon: SiCloudflare,
    hosts: ["cloudflare.com"],
  },
];

function hostnameFor(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function hostMatches(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function resolveSource(type: string, url: string): SourceIdentity {
  const platform = platformCatalog[type];
  if (platform) return platform;

  const hostname = hostnameFor(url);
  const knownSite = siteCatalog.find((site) =>
    site.hosts.some((domain) => hostMatches(hostname, domain)),
  );
  if (knownSite) return knownSite;

  if (hostname) {
    return {
      brand: hostname,
      label: hostname,
      faviconUrl: `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(`https://${hostname}`)}&sz=32`,
    };
  }

  if (type === "paper") return { brand: "paper", label: "论文", icon: LuFileText };
  return { brand: type || "website", label: "网页", icon: LuGlobe };
}

export function SourceMark({
  type,
  url,
}: {
  type: string;
  url: string;
  source: string;
}) {
  const identity = resolveSource(type, url);
  const Icon = identity.icon;

  return (
    <span
      className="source-mark"
      data-source-type={type}
      data-source-brand={identity.brand}
      aria-label={`来源网站：${identity.label}`}
      title={`来源网站：${identity.label}`}
    >
      {Icon ? (
        <Icon aria-hidden="true" focusable="false" />
      ) : (
        <span
          aria-hidden="true"
          className="source-favicon"
          style={{ backgroundImage: `url("${identity.faviconUrl}")` }}
        />
      )}
    </span>
  );
}
