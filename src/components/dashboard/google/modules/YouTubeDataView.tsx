import { useState, useEffect, useCallback } from "react";
import { Youtube, Play, Eye, Users, RefreshCw, AlertTriangle } from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";
import { CONNECT_UNAVAILABLE, describeFailure } from "../offline";

interface Channel {
  snippet?: { title?: string; description?: string; publishedAt?: string; thumbnails?: { default?: { url?: string } } };
  statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean };
}

const YouTubeDataView = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const [loading, setLoading] = useState(false);
  const [channelData, setChannelData] = useState<Channel | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGoogleData("youtube_channels");
      setChannelData(data?.items?.length > 0 ? data.items[0] : null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (/403|scope|forbidden/i.test(msg)) {
        setError("the youtube scope was not granted on this account. re-connect with youtube permission to read the channel.");
      } else {
        setError(describeFailure(err, "youtube organ"));
      }
    } finally {
      setLoading(false);
    }
  }, [fetchGoogleData]);

  useEffect(() => {
    if (isConnected) void loadData();
  }, [isConnected, loadData]);

  const stats = channelData?.statistics;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
            <Youtube className="h-6 w-6 text-foreground/70" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extralight tracking-wide text-foreground">youtube</h2>
              {isConnected && (
                <button
                  type="button"
                  onClick={() => void loadData()}
                  disabled={loading}
                  className="flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
                  read again
                </button>
              )}
            </div>
            <p className="text-sm font-extralight leading-relaxed text-muted-foreground">
              {!isConnected
                ? CONNECT_UNAVAILABLE
                : channelData
                  ? `channel: ${channelData.snippet?.title || "untitled"}`
                  : "the channel owned by the connected account — subscribers, views and video count."}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-border/25 bg-card/20 px-4 py-3 text-[11px] font-extralight text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {error}
        </p>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "subscribers", value: Number(stats.subscriberCount || 0).toLocaleString(), icon: Users },
              { label: "total views", value: Number(stats.viewCount || 0).toLocaleString(), icon: Eye },
              { label: "videos", value: Number(stats.videoCount || 0).toLocaleString(), icon: Play },
              { label: "subscriber count hidden", value: stats.hiddenSubscriberCount ? "yes" : "no", icon: Users },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 text-center">
                <s.icon className="h-4 w-4 text-foreground/40 mx-auto mb-1" aria-hidden />
                <p className="text-xl font-extralight text-foreground">{loading ? "…" : s.value}</p>
                <p className="text-[10px] font-light text-muted-foreground/60 mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {channelData?.snippet && (
            <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
              <h3 className="text-sm font-light tracking-wide text-foreground">channel</h3>
              <div className="flex items-center gap-4">
                {channelData.snippet.thumbnails?.default?.url && (
                  <img src={channelData.snippet.thumbnails.default.url} alt="" className="h-16 w-16 rounded-xl object-cover" referrerPolicy="no-referrer" />
                )}
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-light text-foreground">{channelData.snippet.title}</p>
                  <p className="text-[10px] font-extralight text-muted-foreground line-clamp-2">{channelData.snippet.description || "no description"}</p>
                  {channelData.snippet.publishedAt && (
                    <p className="text-[10px] text-muted-foreground/40">created {new Date(channelData.snippet.publishedAt).toLocaleDateString()}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {isConnected && !stats && !error && !loading && (
        <div className="rounded-2xl border border-dashed border-border/30 bg-card/10 p-10 text-center">
          <p className="text-sm font-extralight text-muted-foreground/50">no youtube channel is owned by this account.</p>
        </div>
      )}
    </div>
  );
};

export default YouTubeDataView;
