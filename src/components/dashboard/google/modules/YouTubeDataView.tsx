import { useState, useEffect } from "react";
import { Youtube, Play, Eye, Users, ThumbsUp, RefreshCw } from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";

const YouTubeDataView = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const [loading, setLoading] = useState(false);
  const [channelData, setChannelData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGoogleData("youtube_channels");
      if (data?.items?.length > 0) {
        setChannelData(data.items[0]);
      } else {
        setChannelData(null);
      }
    } catch (err: any) {
      console.error("YouTube data error:", err);
      if (err.message?.includes("403") || err.message?.includes("scope") || err.message?.includes("forbidden")) {
        setError("YouTube API scope not authorized. Re-connect your Google account with YouTube permissions.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected) loadData();
  }, [isConnected]);

  const stats = channelData?.statistics;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/5">
            <Youtube className="h-6 w-6 text-foreground/70" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extralight tracking-wide text-foreground">YouTube Intelligence</h2>
              {isConnected && (
                <button onClick={loadData} disabled={loading} className="flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-all disabled:opacity-50">
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                  Sync
                </button>
              )}
            </div>
            <p className="text-sm font-extralight leading-relaxed text-muted-foreground">
              {channelData ? `Channel: ${channelData.snippet?.title || "Your Channel"}` : "Analyzing your YouTube channel data."}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 text-center space-y-2">
          <Youtube className="h-8 w-8 text-amber-400/40 mx-auto" />
          <p className="text-xs font-light text-amber-400">{error}</p>
          <p className="text-[10px] font-extralight text-muted-foreground">YouTube Data API scope may need to be added to your Google connection.</p>
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Subscribers", value: Number(stats.subscriberCount || 0).toLocaleString(), icon: Users },
              { label: "Total Views", value: Number(stats.viewCount || 0).toLocaleString(), icon: Eye },
              { label: "Videos", value: Number(stats.videoCount || 0).toLocaleString(), icon: Play },
              { label: "Hidden Subs", value: stats.hiddenSubscriberCount ? "Yes" : "No", icon: ThumbsUp },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 text-center">
                <s.icon className="h-4 w-4 text-foreground/40 mx-auto mb-1" />
                <p className="text-xl font-extralight text-foreground">{loading ? "…" : s.value}</p>
                <p className="text-[10px] font-light text-muted-foreground/60 mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {channelData.snippet && (
            <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
              <h3 className="text-sm font-light tracking-wide text-foreground">Channel Info</h3>
              <div className="flex items-center gap-4">
                {channelData.snippet.thumbnails?.default?.url && (
                  <img src={channelData.snippet.thumbnails.default.url} alt="" className="h-16 w-16 rounded-xl object-cover" />
                )}
                <div className="space-y-1">
                  <p className="text-sm font-light text-foreground">{channelData.snippet.title}</p>
                  <p className="text-[10px] font-extralight text-muted-foreground line-clamp-2">{channelData.snippet.description || "No description"}</p>
                  <p className="text-[10px] text-muted-foreground/40">Created: {new Date(channelData.snippet.publishedAt).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!stats && !error && !loading && (
        <div className="rounded-2xl border border-dashed border-border/30 bg-card/10 p-10 text-center space-y-3">
          <Youtube className="h-10 w-10 text-muted-foreground/20 mx-auto" />
          <p className="text-sm font-extralight text-muted-foreground/50">
            {isConnected ? "No YouTube channel found for this account" : "Connect Google to view YouTube data"}
          </p>
        </div>
      )}
    </div>
  );
};

export default YouTubeDataView;