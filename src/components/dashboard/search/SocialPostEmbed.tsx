import { useMemo } from "react";
import { Play, MessageSquare, Youtube, Instagram, Twitter, Facebook, Linkedin, Music2, ExternalLink } from "lucide-react";

interface SocialPostEmbedProps {
  url: string;
}

type Platform =
  | { kind: "youtube"; videoId: string; embed: string }
  | { kind: "twitter"; tweetId: string; user: string; embed: string }
  | { kind: "instagram"; postId: string; embed: string }
  | { kind: "tiktok"; videoId: string; embed: string }
  | { kind: "reddit"; embed: string }
  | { kind: "facebook"; embed: string }
  | { kind: "linkedin"; postId: string }
  | { kind: "vimeo"; videoId: string; embed: string }
  | { kind: "spotify"; embed: string }
  | null;

function detectPlatform(rawUrl: string): Platform {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const path = u.pathname;

    // YouTube
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return { kind: "youtube", videoId: v, embed: `https://www.youtube-nocookie.com/embed/${v}` };
      const shortsMatch = path.match(/^\/shorts\/([\w-]+)/);
      if (shortsMatch) return { kind: "youtube", videoId: shortsMatch[1], embed: `https://www.youtube-nocookie.com/embed/${shortsMatch[1]}` };
    }
    if (host === "youtu.be") {
      const id = path.slice(1).split("/")[0];
      if (id) return { kind: "youtube", videoId: id, embed: `https://www.youtube-nocookie.com/embed/${id}` };
    }

    // Twitter / X
    if (host === "twitter.com" || host === "x.com" || host === "mobile.twitter.com") {
      const m = path.match(/^\/([\w_]+)\/status\/(\d+)/);
      if (m) {
        return {
          kind: "twitter",
          user: m[1],
          tweetId: m[2],
          embed: `https://platform.twitter.com/embed/Tweet.html?id=${m[2]}&theme=dark&dnt=true`,
        };
      }
    }

    // Instagram
    if (host === "instagram.com") {
      const m = path.match(/^\/(p|reel|tv)\/([\w-]+)/);
      if (m) {
        return {
          kind: "instagram",
          postId: m[2],
          embed: `https://www.instagram.com/${m[1]}/${m[2]}/embed/captioned/`,
        };
      }
    }

    // TikTok
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
      const m = path.match(/\/video\/(\d+)/);
      if (m) {
        return {
          kind: "tiktok",
          videoId: m[1],
          embed: `https://www.tiktok.com/embed/v2/${m[1]}`,
        };
      }
    }

    // Reddit
    if (host === "reddit.com" || host.endsWith(".reddit.com")) {
      // Reddit supports embed by appending ?ref_source=embed via the embed.html
      const embedUrl = `https://www.redditmedia.com${path}?ref_source=embed&theme=dark&embed=true`;
      return { kind: "reddit", embed: embedUrl };
    }

    // Facebook
    if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.watch") {
      const embedUrl = `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(rawUrl)}&show_text=true&width=500`;
      return { kind: "facebook", embed: embedUrl };
    }

    // LinkedIn (no public iframe — fall back to link card)
    if (host === "linkedin.com") {
      const m = path.match(/posts\/([\w-]+)/);
      if (m) return { kind: "linkedin", postId: m[1] };
    }

    // Vimeo
    if (host === "vimeo.com") {
      const m = path.match(/^\/(\d+)/);
      if (m) return { kind: "vimeo", videoId: m[1], embed: `https://player.vimeo.com/video/${m[1]}` };
    }

    // Spotify
    if (host === "open.spotify.com") {
      return { kind: "spotify", embed: `https://open.spotify.com/embed${path}?theme=0` };
    }

    return null;
  } catch {
    return null;
  }
}

const PlatformIcon = ({ kind }: { kind: NonNullable<Platform>["kind"] }) => {
  const cls = "h-3.5 w-3.5";
  switch (kind) {
    case "youtube": return <Youtube className={cls} />;
    case "twitter": return <Twitter className={cls} />;
    case "instagram": return <Instagram className={cls} />;
    case "tiktok": return <Music2 className={cls} />;
    case "reddit": return <MessageSquare className={cls} />;
    case "facebook": return <Facebook className={cls} />;
    case "linkedin": return <Linkedin className={cls} />;
    case "vimeo":
    case "spotify": return <Play className={cls} />;
  }
};

const PLATFORM_LABEL: Record<NonNullable<Platform>["kind"], string> = {
  youtube: "YouTube",
  twitter: "X / Twitter",
  instagram: "Instagram",
  tiktok: "TikTok",
  reddit: "Reddit",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  vimeo: "Vimeo",
  spotify: "Spotify",
};

/** Providers whose player the page's frame-src admits. Keep in step with the CSP. */
const FRAMEABLE = new Set<NonNullable<Platform>["kind"]>(["youtube", "vimeo"]);

export function isSocialUrl(url: string): boolean {
  return detectPlatform(url) !== null;
}

const SocialPostEmbed = ({ url }: SocialPostEmbedProps) => {
  const platform = useMemo(() => detectPlatform(url), [url]);

  if (!platform) return null;

  // The page policy (frame-src in index.html / vercel.json) admits only the
  // youtube-nocookie, youtube and vimeo players. Any other provider's iframe
  // would be refused by the browser and leave a blank box, so those render as
  // a link card instead. LinkedIn offers no embed at all.
  if (!FRAMEABLE.has(platform.kind) || !("embed" in platform)) {
    return (
      <div className="mt-3 rounded-xl border border-border/20 bg-foreground/[0.03] p-4">
        <div className="flex items-center gap-2 text-[10px] font-light text-muted-foreground/60 uppercase tracking-wider mb-2">
          <PlatformIcon kind={platform.kind} />
          <span>{PLATFORM_LABEL[platform.kind]} post</span>
        </div>
        <p className="text-xs font-light text-muted-foreground/80">
          {platform.kind === "linkedin" ? "LinkedIn does not allow inline previews." : "not embedded here — third-party post players are kept off this page."} open the post in a new tab to view it.
        </p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-[11px] text-foreground/80 hover:text-foreground">
          open on {PLATFORM_LABEL[platform.kind]} <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  // Aspect ratio per platform — sized to crop tightly around the actual post chrome
  // so we never expose blank iframe whitespace or a bright provider background.
  // Twitter is intentionally tall to fit the post + action row without trailing white.
  const aspectClass =
    platform.kind === "youtube" || platform.kind === "vimeo" ? "aspect-video"
    : platform.kind === "tiktok" ? "aspect-[9/14]"
    : platform.kind === "instagram" ? "h-[640px]"
    : platform.kind === "twitter" ? "h-[560px]"
    : platform.kind === "spotify" ? "h-[152px]"
    : platform.kind === "reddit" ? "h-[480px]"
    : "h-[480px]";

  return (
    <div className="mt-3 rounded-xl overflow-hidden border border-border/20 bg-card/60 backdrop-blur-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/15 bg-foreground/[0.04]">
        <div className="flex items-center gap-2 text-[10px] font-light text-muted-foreground/70 uppercase tracking-[0.15em]">
          <PlatformIcon kind={platform.kind} />
          <span>{PLATFORM_LABEL[platform.kind]}</span>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] font-light text-muted-foreground/50 hover:text-foreground transition-colors"
        >
          open <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      {/* Themed iframe shell — bg matches card so any iframe chrome blends, no white flash.
          The iframe is intentionally widened ~16px past the right edge and clipped by
          `overflow-hidden` on the parent, so the cross-origin scrollbar (which we cannot
          style with CSS) is hidden off-canvas. A bottom + right gradient mask further
          hides any stray white padding from the provider (Twitter's classic embed). */}
      <div
        className={`relative w-full overflow-hidden ${aspectClass}`}
        style={{ background: "hsl(var(--card))", colorScheme: "dark" }}
      >
        <iframe
          src={platform.embed}
          title={`${PLATFORM_LABEL[platform.kind]} embed`}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          scrolling="no"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation allow-forms"
          className="absolute inset-y-0 left-0 border-0"
          style={{
            colorScheme: "dark",
            background: "hsl(var(--card))",
            // Widen past the container so the native iframe scrollbar is clipped off-canvas
            width: "calc(100% + 18px)",
            height: "100%",
          }}
        />
        {/* Bottom mask — hides iframe whitespace seen on Twitter's classic embed */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16"
          style={{
            background: "linear-gradient(to bottom, transparent, hsl(var(--card)) 70%)",
          }}
        />
      </div>
    </div>
  );
};

export default SocialPostEmbed;
