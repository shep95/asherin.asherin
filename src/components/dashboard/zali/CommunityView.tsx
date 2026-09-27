import { useState, useEffect, useCallback, useMemo } from "react";
import {
  MessageCircleQuestion, Lightbulb, Vote, Plus, ArrowBigUp, ArrowBigDown,
  MessageSquare, Clock, TrendingUp, Filter, X, Send, Trash2, ChevronDown
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

type PostCategory = "question" | "request" | "feature";
type SortMode = "newest" | "popular";

interface CommunityPost {
  id: string;
  userId: string;
  category: PostCategory;
  title: string;
  content: string;
  votes: number;
  repliesCount: number;
  status: string;
  createdAt: Date;
}

interface Reply {
  id: string;
  userId: string;
  content: string;
  createdAt: Date;
}

const CATEGORY_META: Record<PostCategory, { label: string; icon: typeof MessageCircleQuestion; color: string }> = {
  question: { label: "Questions", icon: MessageCircleQuestion, color: "text-blue-400" },
  request: { label: "Requests", icon: Lightbulb, color: "text-amber-400" },
  feature: { label: "Feature Votes", icon: Vote, color: "text-emerald-400" },
};

const CommunityView = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<PostCategory | "all">("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [showCompose, setShowCompose] = useState(false);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [replyText, setReplyText] = useState("");
  const [userVotes, setUserVotes] = useState<Record<string, string>>({});

  // Compose state
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState<PostCategory>("question");
  const [submitting, setSubmitting] = useState(false);

  // Load posts
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("community_posts")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) {
        setPosts(data.map((p: any) => ({
          id: p.id, userId: p.user_id, category: p.category as PostCategory,
          title: p.title, content: p.content, votes: p.votes,
          repliesCount: p.replies_count, status: p.status,
          createdAt: new Date(p.created_at),
        })));
      }
      // Load user's votes
      const { data: votesData } = await supabase
        .from("community_votes")
        .select("*")
        .eq("user_id", user.id);
      if (votesData) {
        const voteMap: Record<string, string> = {};
        votesData.forEach((v: any) => { voteMap[v.post_id] = v.vote_type; });
        setUserVotes(voteMap);
      }
      setLoading(false);
    };
    load();
  }, [user]);

  // Realtime posts
  useEffect(() => {
    const channel = supabase
      .channel("community-posts-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "community_posts" }, () => {
        // Refresh
        supabase.from("community_posts").select("*").order("created_at", { ascending: false }).then(({ data }) => {
          if (data) setPosts(data.map((p: any) => ({
            id: p.id, userId: p.user_id, category: p.category as PostCategory,
            title: p.title, content: p.content, votes: p.votes,
            repliesCount: p.replies_count, status: p.status,
            createdAt: new Date(p.created_at),
          })));
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filteredPosts = useMemo(() => {
    let list = activeCategory === "all" ? posts : posts.filter(p => p.category === activeCategory);
    if (sortMode === "popular") list = [...list].sort((a, b) => b.votes - a.votes);
    return list;
  }, [posts, activeCategory, sortMode]);

  const handleVote = useCallback(async (postId: string, direction: "up" | "down") => {
    if (!user) return;
    const existing = userVotes[postId];
    if (existing === direction) {
      // Remove vote
      await supabase.from("community_votes").delete().eq("user_id", user.id).eq("post_id", postId);
      const delta = direction === "up" ? -1 : 1;
      await supabase.from("community_posts").update({ votes: posts.find(p => p.id === postId)!.votes + delta }).eq("id", postId);
      setUserVotes(prev => { const n = { ...prev }; delete n[postId]; return n; });
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, votes: p.votes + delta } : p));
    } else {
      // Upsert vote
      await supabase.from("community_votes").upsert({ user_id: user.id, post_id: postId, vote_type: direction }, { onConflict: "user_id,post_id" });
      let delta = direction === "up" ? 1 : -1;
      if (existing) delta *= 2; // Swing from opposite
      await supabase.from("community_posts").update({ votes: posts.find(p => p.id === postId)!.votes + delta }).eq("id", postId);
      setUserVotes(prev => ({ ...prev, [postId]: direction }));
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, votes: p.votes + delta } : p));
    }
  }, [user, userVotes, posts]);

  const handleSubmitPost = useCallback(async () => {
    if (!user || !newTitle.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from("community_posts").insert({
      user_id: user.id, category: newCategory, title: newTitle.trim(), content: newContent.trim(),
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Posted!" });
      setNewTitle(""); setNewContent(""); setShowCompose(false);
    }
    setSubmitting(false);
  }, [user, newTitle, newContent, newCategory, toast]);

  const loadReplies = useCallback(async (postId: string) => {
    const { data } = await supabase
      .from("community_replies")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    if (data) setReplies(data.map((r: any) => ({ id: r.id, userId: r.user_id, content: r.content, createdAt: new Date(r.created_at) })));
  }, []);

  const handleExpand = useCallback((postId: string) => {
    if (expandedPost === postId) { setExpandedPost(null); return; }
    setExpandedPost(postId);
    setReplyText("");
    loadReplies(postId);
  }, [expandedPost, loadReplies]);

  const handleReply = useCallback(async (postId: string) => {
    if (!user || !replyText.trim()) return;
    await supabase.from("community_replies").insert({ user_id: user.id, post_id: postId, content: replyText.trim() });
    await supabase.from("community_posts").update({ replies_count: (posts.find(p => p.id === postId)?.repliesCount || 0) + 1 }).eq("id", postId);
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, repliesCount: p.repliesCount + 1 } : p));
    setReplyText("");
    loadReplies(postId);
  }, [user, replyText, posts, loadReplies]);

  const handleDeletePost = useCallback(async (postId: string) => {
    await supabase.from("community_posts").delete().eq("id", postId);
    setPosts(prev => prev.filter(p => p.id !== postId));
    if (expandedPost === postId) setExpandedPost(null);
    toast({ title: "Post deleted" });
  }, [expandedPost, toast]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header bar */}
      <div className="flex-shrink-0 px-4 sm:px-6 py-4 border-b border-border/20 bg-card/30 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-light tracking-[0.15em] text-foreground uppercase">Community</h2>
          <button
            onClick={() => setShowCompose(!showCompose)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/20 text-accent text-xs font-light hover:bg-accent/30 transition-colors"
          >
            {showCompose ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showCompose ? "Cancel" : "New Post"}
          </button>
        </div>

        {/* Category filters */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveCategory("all")}
            className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-light transition-colors ${
              activeCategory === "all" ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-foreground/5"
            }`}
          >
            All
          </button>
          {(Object.entries(CATEGORY_META) as [PostCategory, typeof CATEGORY_META["question"]][]).map(([key, meta]) => {
            const Icon = meta.icon;
            return (
              <button
                key={key}
                onClick={() => setActiveCategory(key)}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-light transition-colors flex items-center gap-1.5 ${
                  activeCategory === key ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-foreground/5"
                }`}
              >
                <Icon className={`h-3 w-3 ${meta.color}`} />
                {meta.label}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setSortMode("newest")}
              className={`p-1.5 rounded text-[10px] ${sortMode === "newest" ? "text-foreground" : "text-muted-foreground/50"}`}
              title="Newest"
            >
              <Clock className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setSortMode("popular")}
              className={`p-1.5 rounded text-[10px] ${sortMode === "popular" ? "text-foreground" : "text-muted-foreground/50"}`}
              title="Popular"
            >
              <TrendingUp className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Compose panel */}
      {showCompose && (
        <div className="flex-shrink-0 px-4 sm:px-6 py-4 border-b border-border/20 bg-card/20 space-y-3">
          <div className="flex gap-2">
            {(Object.entries(CATEGORY_META) as [PostCategory, typeof CATEGORY_META["question"]][]).map(([key, meta]) => {
              const Icon = meta.icon;
              return (
                <button
                  key={key}
                  onClick={() => setNewCategory(key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-light transition-colors border ${
                    newCategory === key
                      ? "border-accent/40 bg-accent/10 text-foreground"
                      : "border-border/20 text-muted-foreground hover:border-border/40"
                  }`}
                >
                  <Icon className={`h-3 w-3 ${meta.color}`} />
                  {meta.label.replace(/s$/, "")}
                </button>
              );
            })}
          </div>
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Title..."
            className="w-full bg-background/50 border border-border/20 rounded-lg px-3 py-2 text-sm font-light text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-accent/40"
          />
          <textarea
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder="Details (optional)..."
            rows={3}
            className="w-full bg-background/50 border border-border/20 rounded-lg px-3 py-2 text-xs font-light text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-accent/40 resize-none"
          />
          <button
            onClick={handleSubmitPost}
            disabled={submitting || !newTitle.trim()}
            className="px-4 py-2 rounded-lg bg-accent/20 text-accent text-xs font-light hover:bg-accent/30 transition-colors disabled:opacity-40"
          >
            {submitting ? "Posting..." : "Post"}
          </button>
        </div>
      )}

      {/* Posts list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-3 space-y-2">
        {filteredPosts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/40">
            <MessageCircleQuestion className="h-8 w-8 mb-3" />
            <p className="text-xs font-light">No posts yet. Be the first!</p>
          </div>
        )}

        {filteredPosts.map(post => {
          const meta = CATEGORY_META[post.category];
          const Icon = meta.icon;
          const isExpanded = expandedPost === post.id;
          const myVote = userVotes[post.id];
          const isOwn = post.userId === user?.id;

          return (
            <div key={post.id} className="border border-border/20 rounded-xl bg-card/30 backdrop-blur-sm overflow-hidden">
              <div className="flex">
                {/* Vote column */}
                <div className="flex flex-col items-center py-3 px-2 gap-0.5 border-r border-border/10">
                  <button
                    onClick={() => handleVote(post.id, "up")}
                    className={`p-1 rounded transition-colors ${myVote === "up" ? "text-accent" : "text-muted-foreground/40 hover:text-foreground"}`}
                  >
                    <ArrowBigUp className="h-4 w-4" />
                  </button>
                  <span className={`text-xs font-medium tabular-nums ${post.votes > 0 ? "text-accent" : post.votes < 0 ? "text-destructive" : "text-muted-foreground/60"}`}>
                    {post.votes}
                  </span>
                  <button
                    onClick={() => handleVote(post.id, "down")}
                    className={`p-1 rounded transition-colors ${myVote === "down" ? "text-destructive" : "text-muted-foreground/40 hover:text-foreground"}`}
                  >
                    <ArrowBigDown className="h-4 w-4" />
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`h-3 w-3 flex-shrink-0 ${meta.color}`} />
                        <span className={`text-[10px] font-light uppercase tracking-wider ${meta.color}`}>{meta.label.replace(/s$/, "")}</span>
                        <span className="text-[10px] text-muted-foreground/30">·</span>
                        <span className="text-[10px] text-muted-foreground/40 font-light">
                          {formatDistanceToNow(post.createdAt, { addSuffix: true })}
                        </span>
                      </div>
                      <h3 className="text-sm font-light text-foreground leading-snug truncate">{post.title}</h3>
                      {post.content && (
                        <p className="text-xs text-muted-foreground/60 font-light mt-1 line-clamp-2">{post.content}</p>
                      )}
                    </div>
                    {isOwn && (
                      <button onClick={() => handleDeletePost(post.id)} className="p-1 text-muted-foreground/30 hover:text-destructive transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Footer */}
                  <button
                    onClick={() => handleExpand(post.id)}
                    className="flex items-center gap-1.5 mt-2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                  >
                    <MessageSquare className="h-3 w-3" />
                    <span className="text-[10px] font-light">{post.repliesCount} {post.repliesCount === 1 ? "reply" : "replies"}</span>
                    <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </button>
                </div>
              </div>

              {/* Expanded replies */}
              {isExpanded && (
                <div className="border-t border-border/10 bg-background/30">
                  <div className="max-h-60 overflow-y-auto px-4 py-2 space-y-2">
                    {replies.length === 0 && (
                      <p className="text-[10px] text-muted-foreground/30 font-light py-2">No replies yet.</p>
                    )}
                    {replies.map(r => (
                      <div key={r.id} className="flex gap-2 py-1.5">
                        <div className="w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-[8px] text-accent font-medium">
                            {r.userId === user?.id ? "You" : "U"}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-light text-foreground/80">{r.content}</p>
                          <span className="text-[9px] text-muted-foreground/30">{formatDistanceToNow(r.createdAt, { addSuffix: true })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 border-t border-border/10">
                    <input
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleReply(post.id)}
                      placeholder="Write a reply..."
                      className="flex-1 bg-background/50 border border-border/20 rounded-lg px-3 py-1.5 text-xs font-light text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-accent/40"
                    />
                    <button
                      onClick={() => handleReply(post.id)}
                      disabled={!replyText.trim()}
                      className="p-1.5 rounded-lg text-accent hover:bg-accent/10 transition-colors disabled:opacity-30"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CommunityView;
