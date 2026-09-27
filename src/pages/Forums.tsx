import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  MessageSquare,
  Lightbulb,
  Bug,
  Radio,
  Send,
  Loader2,
  Plus,
  Brain,
  ArrowBigUp,
  ArrowBigDown,
  ShieldCheck,
} from "lucide-react";
import LandingBackground from "@/components/LandingBackground";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { isAdminEmail } from "@/lib/adminEmail";

type Category = "idea" | "leak" | "bug" | "theory";

interface ForumPost {
  id: string;
  user_id: string;
  category: Category;
  title: string;
  body: string;
  author_name: string | null;
  created_at: string;
}

interface ForumReply {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  author_name: string | null;
  created_at: string;
}

interface VoteRow {
  post_id: string;
  user_id: string;
  value: number;
}

const ALL_CATEGORIES: { id: Category; label: string; icon: typeof Lightbulb; desc: string; adminOnly?: boolean }[] = [
  { id: "idea", label: "Ideas", icon: Lightbulb, desc: "Suggestions, upvote what you want built" },
  { id: "theory", label: "Theories", icon: Brain, desc: "Open-source theories to advance AI for humanity" },
  { id: "leak", label: "Leaks", icon: Radio, desc: "Insider intel & disclosures" },
  { id: "bug", label: "Bugs", icon: Bug, desc: "Report privately, only admins see reports" },
];

/** logged-out visible twin of /blog/paid-seat-free-door. not a compose paste. */
const ForumsWorkLineTwin = () => (
  <aside className="mb-6 rounded-2xl border border-border/20 bg-card/40 backdrop-blur-md p-5">
    <p className="text-[10px] font-light tracking-[0.3em] uppercase text-muted-foreground/60">from the journal</p>
    <h2 className="mt-2 text-xl font-light tracking-tight text-foreground">personas are not thinking patterns.</h2>
    <p className="mt-3 text-sm font-extralight leading-relaxed text-muted-foreground">
      personas don&apos;t make the model smarter. thinking patterns do. ~ asherin.com
    </p>
    <p className="mt-3 text-sm font-extralight leading-relaxed text-muted-foreground">
      bring your own api key and you pay that vendor for inference. the first click is not a paywall. one
      public-index look works logged out.
    </p>
    <Link
      to="/blog/personalities-are-not-thinking-patterns"
      className="mt-4 inline-block text-[11px] font-light tracking-[0.2em] uppercase text-foreground/80 hover:underline"
    >
      read the journal note
    </Link>
  </aside>
);

const Forums = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = isAdminEmail(user?.email);
  const CATEGORIES = useMemo(() => ALL_CATEGORIES.filter((c) => !c.adminOnly || isAdmin), [isAdmin]);

  const [tab, setTab] = useState<Category>("idea");
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [votes, setVotes] = useState<Record<string, { score: number; mine: number }>>({});
  const [loading, setLoading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activePost, setActivePost] = useState<ForumPost | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [replyBody, setReplyBody] = useState("");

  const loadPosts = async (cat: Category) => {
    setLoading(true);
    const { data } = await supabase
      .from("forum_posts")
      .select("*")
      .eq("category", cat)
      .order("created_at", { ascending: false })
      .limit(200);
    const list = (data ?? []) as ForumPost[];
    setPosts(list);
    // Load votes only for ideas
    if (cat === "idea" && list.length) {
      const ids = list.map((p) => p.id);
      const { data: vs } = await supabase.from("forum_post_votes").select("post_id, user_id, value").in("post_id", ids);
      const rows = (vs ?? []) as VoteRow[];
      const map: Record<string, { score: number; mine: number }> = {};
      for (const id of ids) map[id] = { score: 0, mine: 0 };
      for (const v of rows) {
        if (!map[v.post_id]) map[v.post_id] = { score: 0, mine: 0 };
        map[v.post_id].score += v.value;
        if (user && v.user_id === user.id) map[v.post_id].mine = v.value;
      }
      setVotes(map);
    } else {
      setVotes({});
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPosts(tab); /* eslint-disable-next-line */
  }, [tab, user?.id]);

  const submitPost = async () => {
    if (!user) {
      toast({ title: "Sign in required" });
      return;
    }
    const t = title.trim(),
      b = body.trim();
    if (t.length < 3 || t.length > 200) {
      toast({ title: "Title 3-200 chars", variant: "destructive" });
      return;
    }
    if (!b || b.length > 8000) {
      toast({ title: "Body 1-8000 chars", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("forum_posts").insert({
      user_id: user.id,
      category: tab,
      title: t,
      body: b,
      author_name: user.email?.split("@")[0] ?? null,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    setTitle("");
    setBody("");
    setComposeOpen(false);
    if (tab === "bug") {
      toast({ title: "Bug report submitted", description: "Sent privately to the admin review queue." });
    } else if (tab === "theory") {
      toast({
        title: "Theory submitted",
        description: "Declared open-source, anyone (incl. other AIs) may read & build on it.",
      });
    }
    loadPosts(tab);
  };

  const openPost = async (p: ForumPost) => {
    setActivePost(p);
    const { data } = await supabase
      .from("forum_replies")
      .select("*")
      .eq("post_id", p.id)
      .order("created_at", { ascending: true });
    setReplies((data ?? []) as ForumReply[]);
  };

  const submitReply = async () => {
    if (!user || !activePost) return;
    const b = replyBody.trim();
    if (!b || b.length > 4000) {
      toast({ title: "Reply 1-4000 chars", variant: "destructive" });
      return;
    }
    const { error, data } = await supabase
      .from("forum_replies")
      .insert({
        post_id: activePost.id,
        user_id: user.id,
        body: b,
        author_name: user.email?.split("@")[0] ?? null,
      })
      .select()
      .single();
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    setReplies((r) => [...r, data as ForumReply]);
    setReplyBody("");
  };

  const castVote = async (postId: string, value: 1 | -1) => {
    if (!user) {
      toast({ title: "Sign in to vote" });
      return;
    }
    const cur = votes[postId] ?? { score: 0, mine: 0 };
    // Toggle off if clicking the same vote
    if (cur.mine === value) {
      await supabase.from("forum_post_votes").delete().eq("post_id", postId).eq("user_id", user.id);
      setVotes((v) => ({ ...v, [postId]: { score: cur.score - value, mine: 0 } }));
      return;
    }
    const { error } = await supabase
      .from("forum_post_votes")
      .upsert({ post_id: postId, user_id: user.id, value }, { onConflict: "post_id,user_id" });
    if (error) {
      toast({ title: "Vote failed", description: error.message, variant: "destructive" });
      return;
    }
    const delta = value - cur.mine;
    setVotes((v) => ({ ...v, [postId]: { score: cur.score + delta, mine: value } }));
  };

  const activeCat = CATEGORIES.find((c) => c.id === tab) ?? CATEGORIES[0];
  const ActiveIcon = activeCat.icon;

  const displayedPosts =
    tab === "idea"
      ? [...posts].sort((a, b) => {
          const diff = (votes[b.id]?.score ?? 0) - (votes[a.id]?.score ?? 0);
          if (diff !== 0) return diff;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        })
      : posts;

  return (
    <LandingBackground>
      <Header />
      <main className="relative z-10 mx-auto max-w-5xl px-6 pt-28 pb-24">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-extralight tracking-[0.15em] text-muted-foreground/60 hover:text-foreground transition-colors uppercase mb-8"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <MessageSquare className="h-5 w-5 text-foreground/70" strokeWidth={1.3} />
          <p className="text-[10px] font-light tracking-[0.4em] text-muted-foreground/60 uppercase">Community Forums</p>
        </div>
        <h1 className="text-5xl sm:text-6xl font-extralight tracking-[0.1em] mb-3">FORUMS</h1>
        <p className="max-w-xl text-sm font-extralight leading-relaxed text-muted-foreground/80 mb-10">
          Share ideas, submit theories, drop leaks. Text only, no file uploads.
        </p>
        <ForumsWorkLineTwin />

        {/* Category tabs */}
        <div className={`grid gap-2 mb-6 ${CATEGORIES.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
          {CATEGORIES.map(({ id, label, icon: Icon, desc, adminOnly }) => (
            <button
              key={id}
              onClick={() => {
                setTab(id);
                setActivePost(null);
              }}
              className={`text-left rounded-2xl border backdrop-blur-md p-4 transition-all ${
                tab === id
                  ? "border-foreground/40 bg-foreground/[0.07]"
                  : "border-border/15 bg-card/30 hover:border-border/40 hover:bg-card/50"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-4 w-4 text-foreground/70" strokeWidth={1.4} />
                {adminOnly && <ShieldCheck className="h-3 w-3 text-foreground/40" />}
              </div>
              <p className="text-sm font-light tracking-wide text-foreground">{label}</p>
              <p className="text-[10px] font-light text-muted-foreground/60 mt-1 leading-relaxed">{desc}</p>
            </button>
          ))}
        </div>

        {/* Category-specific disclaimers */}
        {tab === "theory" && (
          <div className="mb-4 rounded-xl border border-foreground/15 bg-foreground/[0.03] p-3 text-[11px] font-light leading-relaxed text-muted-foreground">
            <span className="tracking-[0.15em] uppercase text-foreground/70">Open Source Notice -</span> Theories
            submitted here are declared open-source. Anyone, including Asherin and other AI systems, may read, cite, and
            build upon them to advance AI for humanity.
          </div>
        )}
        {tab === "bug" && !isAdmin && (
          <div className="mb-4 rounded-xl border border-foreground/15 bg-foreground/[0.03] p-3 text-[11px] font-light leading-relaxed text-muted-foreground">
            <span className="tracking-[0.15em] uppercase text-foreground/70">Private Report -</span> Bug reports are
            hidden from other users. Only admins can review them. Include the software name, what happened, and steps to
            reproduce.
          </div>
        )}
        {tab === "bug" && isAdmin && (
          <div className="mb-4 rounded-xl border border-foreground/20 bg-foreground/[0.05] p-3 text-[11px] font-light leading-relaxed text-muted-foreground">
            <span className="tracking-[0.15em] uppercase text-foreground/70">Admin Queue -</span> Bug reports are hidden
            from users. Daily digest is emailed to the admin mailbox on file at 12:00 UTC.
          </div>
        )}

        {!activePost ? (
          <>
            {/* Compose, bugs visible to any signed-in user for reporting, but visibility is admin-only */}
            <div className="rounded-2xl border border-border/20 bg-card/40 backdrop-blur-md mb-6">
              {!composeOpen ? (
                <button
                  onClick={() => {
                    if (!user) {
                      toast({ title: "Sign in to post" });
                      return;
                    }
                    setComposeOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left text-sm font-light text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  {tab === "bug" ? "Report a bug (private to admins)…" : `Share a ${tab}…`}
                </button>
              ) : (
                <div className="p-5 space-y-3">
                  <div className="flex items-center gap-2 text-[10px] font-light tracking-[0.25em] text-muted-foreground/70 uppercase">
                    <ActiveIcon className="h-3 w-3" /> New {tab}
                  </div>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={200}
                    placeholder="Title"
                    className="w-full bg-transparent border-b border-border/20 pb-2 text-base font-light text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-foreground/40 transition-colors"
                  />
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    maxLength={8000}
                    rows={6}
                    placeholder={
                      tab === "bug"
                        ? "Which software, what happened, steps to reproduce. Only admins can see this."
                        : tab === "theory"
                          ? "State your theory. Include reasoning, examples, and workflow. Open-source once posted."
                          : `Describe your ${tab} in detail. Text only, no file uploads.`
                    }
                    className="w-full bg-transparent text-sm font-light text-foreground placeholder:text-muted-foreground/40 outline-none resize-none leading-relaxed"
                  />
                  <div className="flex items-center justify-between pt-2 border-t border-border/15">
                    <span className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/50 uppercase">
                      {body.length} / 8000
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setComposeOpen(false);
                          setTitle("");
                          setBody("");
                        }}
                        className="text-[11px] font-light tracking-[0.2em] text-muted-foreground hover:text-foreground uppercase"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={submitPost}
                        disabled={submitting}
                        className="inline-flex items-center gap-2 rounded-lg border border-foreground/30 bg-foreground/10 px-4 py-1.5 text-[11px] font-light tracking-[0.2em] text-foreground hover:bg-foreground/20 transition-all uppercase disabled:opacity-50"
                      >
                        {submitting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        Post
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Posts list */}
            <div className="space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground/60">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : displayedPosts.length === 0 ? (
                <div className="rounded-2xl border border-border/15 bg-card/20 p-12 text-center">
                  <ActiveIcon className="h-6 w-6 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.2} />
                  <p className="text-sm font-light text-muted-foreground/60 tracking-wide">
                    {tab === "bug" && !isAdmin
                      ? "Reports go directly to admins, you won't see them listed here."
                      : `No ${tab}s yet. Be the first.`}
                  </p>
                </div>
              ) : (
                displayedPosts.map((p) => {
                  const v = votes[p.id] ?? { score: 0, mine: 0 };
                  return (
                    <div key={p.id} className="flex items-stretch gap-3">
                      {tab === "idea" && (
                        <div className="flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-border/15 bg-card/30 backdrop-blur-md px-2 py-3 min-w-[52px]">
                          <button
                            onClick={() => castVote(p.id, 1)}
                            className={`p-1 rounded-md transition-colors ${v.mine === 1 ? "text-foreground bg-foreground/10" : "text-muted-foreground/60 hover:text-foreground"}`}
                          >
                            <ArrowBigUp className="h-4 w-4" strokeWidth={1.6} />
                          </button>
                          <span
                            className={`text-xs font-light tabular-nums ${v.score > 0 ? "text-foreground" : v.score < 0 ? "text-muted-foreground/50" : "text-muted-foreground/70"}`}
                          >
                            {v.score}
                          </span>
                          <button
                            onClick={() => castVote(p.id, -1)}
                            className={`p-1 rounded-md transition-colors ${v.mine === -1 ? "text-foreground bg-foreground/10" : "text-muted-foreground/60 hover:text-foreground"}`}
                          >
                            <ArrowBigDown className="h-4 w-4" strokeWidth={1.6} />
                          </button>
                        </div>
                      )}
                      <button
                        onClick={() => openPost(p)}
                        className="flex-1 block text-left rounded-2xl border border-border/15 bg-card/30 backdrop-blur-md hover:border-border/40 hover:bg-card/50 transition-all p-5 group"
                      >
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <h3 className="text-base font-light text-foreground tracking-wide group-hover:text-foreground">
                            {p.title}
                          </h3>
                          <span className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/50 uppercase whitespace-nowrap pt-1">
                            {new Date(p.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs font-light text-muted-foreground/80 line-clamp-2 leading-relaxed">
                          {p.body}
                        </p>
                        <p className="mt-3 text-[10px] font-light tracking-[0.2em] text-muted-foreground/40 uppercase">
, {p.author_name ?? "anon"}
                        </p>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <>
            <button
              onClick={() => {
                setActivePost(null);
                setReplies([]);
              }}
              className="text-[11px] font-light tracking-[0.2em] text-muted-foreground hover:text-foreground uppercase mb-4 inline-flex items-center gap-2"
            >
              <ArrowLeft className="h-3 w-3" /> Back to {tab}s
            </button>
            <div className="rounded-2xl border border-border/20 bg-card/40 backdrop-blur-md p-6 mb-6">
              <h2 className="text-2xl font-extralight tracking-wide text-foreground mb-2">{activePost.title}</h2>
              <p className="text-[10px] font-light tracking-[0.2em] text-muted-foreground/60 uppercase mb-4">
                {activePost.category} · {activePost.author_name ?? "anon"} ·{" "}
                {new Date(activePost.created_at).toLocaleDateString()}
              </p>
              <p className="text-sm font-light text-foreground/85 leading-relaxed whitespace-pre-wrap">
                {activePost.body}
              </p>
            </div>

            <p className="text-[10px] font-light tracking-[0.25em] text-muted-foreground/60 uppercase mb-3">
              {replies.length} replies
            </p>
            <div className="space-y-2 mb-6">
              {replies.map((r) => (
                <div key={r.id} className="rounded-xl border border-border/15 bg-card/30 backdrop-blur-md p-4">
                  <p className="text-sm font-light text-foreground/85 leading-relaxed whitespace-pre-wrap">{r.body}</p>
                  <p className="mt-2 text-[10px] font-light tracking-[0.2em] text-muted-foreground/40 uppercase">
, {r.author_name ?? "anon"} · {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-border/20 bg-card/40 backdrop-blur-md p-4">
              {user ? (
                <div className="flex items-end gap-3">
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    maxLength={4000}
                    rows={2}
                    placeholder="Write a reply…"
                    className="flex-1 bg-transparent text-sm font-light text-foreground placeholder:text-muted-foreground/50 outline-none resize-none"
                  />
                  <button
                    onClick={submitReply}
                    className="rounded-lg border border-foreground/30 bg-foreground/10 px-3 py-2 hover:bg-foreground/20 transition-all"
                  >
                    <Send className="h-4 w-4 text-foreground" />
                  </button>
                </div>
              ) : (
                <p className="text-center text-[11px] font-light tracking-[0.2em] text-muted-foreground/60 uppercase py-2">
                  Sign in to reply
                </p>
              )}
            </div>
          </>
        )}
      </main>
    </LandingBackground>
  );
};

export default Forums;
