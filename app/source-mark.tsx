import type { IconType } from "react-icons";
import { LuFileText, LuGlobe, LuNewspaper, LuRss } from "react-icons/lu";
import {
  SiArxiv,
  SiGithub,
  SiHuggingface,
  SiMedium,
  SiReddit,
  SiSubstack,
  SiWechat,
  SiX,
  SiYoutube,
} from "react-icons/si";

const sourceCatalog: Record<string, { label: string; icon: IconType }> = {
  arxiv: { label: "arXiv", icon: SiArxiv },
  huggingface: { label: "Hugging Face", icon: SiHuggingface },
  x: { label: "X", icon: SiX },
  reddit: { label: "Reddit", icon: SiReddit },
  wechat: { label: "微信公众号", icon: SiWechat },
  github: { label: "GitHub", icon: SiGithub },
  openreview: { label: "OpenReview", icon: LuFileText },
  medium: { label: "Medium", icon: SiMedium },
  substack: { label: "Substack", icon: SiSubstack },
  youtube: { label: "YouTube", icon: SiYoutube },
  newsletter: { label: "Newsletter", icon: LuRss },
  blog: { label: "技术博客", icon: LuNewspaper },
  paper: { label: "论文", icon: LuFileText },
  website: { label: "网页", icon: LuGlobe },
};

export function SourceMark({ type }: { type: string }) {
  const source = sourceCatalog[type] ?? { label: type || "网页", icon: LuGlobe };
  const Icon = source.icon;

  return (
    <span
      className="source-mark"
      data-source-type={type}
      aria-label={`来源平台：${source.label}`}
      title={`来源平台：${source.label}`}
    >
      <Icon aria-hidden="true" focusable="false" />
      <span>{source.label}</span>
    </span>
  );
}
