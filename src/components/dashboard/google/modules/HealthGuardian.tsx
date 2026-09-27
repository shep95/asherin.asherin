import { useState, useEffect } from "react";
import {
  Heart, Activity, Moon, Thermometer, AlertTriangle, TrendingUp,
  TrendingDown, Droplets, Brain, Zap, Footprints, Timer, RefreshCw,
} from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";

const HealthGuardian = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const [loading, setLoading] = useState(false);
  const [fitnessData, setFitnessData] = useState<any[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Don't aggregate fitness across accounts — use primary only
      const data = await fetchGoogleData("fitness", undefined, undefined, false);
      setFitnessData(data.dailyData || []);
    } catch (err) {
      console.error("Failed to fetch fitness:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected) loadData();
  }, [isConnected]);

  const hasLiveData = fitnessData.length > 0;
  const todayData = fitnessData[fitnessData.length - 1];
  const avgSteps = hasLiveData ? Math.round(fitnessData.reduce((a, d) => a + d.steps, 0) / fitnessData.length) : 0;
  const avgHR = hasLiveData ? Math.round(fitnessData.filter((d) => d.heartRate > 0).reduce((a, d) => a + d.heartRate, 0) / (fitnessData.filter((d) => d.heartRate > 0).length || 1)) : 0;
  const totalCalories = hasLiveData ? Math.round(fitnessData.reduce((a, d) => a + d.calories, 0)) : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/5">
            <Heart className="h-6 w-6 text-foreground/70" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extralight tracking-wide text-foreground">Health Guardian</h2>
              {isConnected && (
                <button onClick={loadData} disabled={loading} className="flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-all disabled:opacity-50">
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                  Sync
                </button>
              )}
            </div>
            <p className="text-sm font-extralight leading-relaxed text-muted-foreground">
              {isConnected
                ? "Live fitness data connected — tracking steps, heart rate, and calories from Google Fit."
                : "Connect Google to track health metrics, detect anomalies, and predict illness patterns."}
            </p>
          </div>
        </div>
      </div>

      {/* Health Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Avg Steps/Day", value: hasLiveData ? avgSteps.toLocaleString() : "—" },
          { label: "Today Steps", value: todayData ? todayData.steps.toLocaleString() : "—" },
          { label: "Avg Heart Rate", value: avgHR > 0 ? `${avgHR} bpm` : "—" },
          { label: "Week Calories", value: totalCalories > 0 ? totalCalories.toLocaleString() : "—" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 text-center">
            <p className="text-xl font-extralight text-foreground">{loading ? "…" : s.value}</p>
            <p className="text-[10px] font-light text-muted-foreground/60 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Daily Breakdown */}
      {hasLiveData && (
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-4">
          <h3 className="text-sm font-light tracking-wide text-foreground flex items-center gap-2">
            <Activity className="h-4 w-4" /> 7-Day Activity (Live)
          </h3>
          <div className="space-y-2">
            {fitnessData.map((day) => (
              <div key={day.date} className="flex items-center gap-3 rounded-xl bg-foreground/5 px-4 py-2">
                <span className="text-[10px] font-light text-muted-foreground w-20 shrink-0">{new Date(day.date).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</span>
                <div className="flex-1 flex items-center gap-4 text-[10px]">
                  <span className="flex items-center gap-1 text-foreground">
                    <Footprints className="h-2.5 w-2.5" /> {day.steps.toLocaleString()}
                  </span>
                  {day.heartRate > 0 && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Heart className="h-2.5 w-2.5" /> {day.heartRate} bpm
                    </span>
                  )}
                  {day.calories > 0 && (
                    <span className="flex items-center gap-1 text-muted-foreground/50">
                      {day.calories.toLocaleString()} cal
                    </span>
                  )}
                </div>
                {/* Simple bar */}
                <div className="w-24 h-1.5 rounded-full bg-foreground/5 overflow-hidden">
                  <div className="h-full rounded-full bg-foreground/20" style={{ width: `${Math.min(100, (day.steps / 10000) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Data State */}
      {isConnected && !loading && !hasLiveData && (
        <div className="rounded-2xl border border-dashed border-border/30 bg-card/10 p-10 text-center space-y-3">
          <Heart className="h-10 w-10 text-muted-foreground/20 mx-auto" />
          <p className="text-sm font-extralight text-muted-foreground/50">
            No fitness data available — make sure Google Fit is active and syncing on your device.
          </p>
        </div>
      )}

      {/* Smart Insights */}
      {hasLiveData && (
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
          <h3 className="text-xs font-light tracking-wide text-foreground flex items-center gap-2">
            <Brain className="h-3.5 w-3.5" /> Smart Insights
          </h3>
          <div className="space-y-1.5">
            {[
              `Average ${avgSteps.toLocaleString()} steps/day this week`,
              avgHR > 0 ? `Resting heart rate averaging ${avgHR} bpm` : "Heart rate data not available — wear your device more",
              `Total ${totalCalories.toLocaleString()} calories burned this week`,
              todayData?.steps > avgSteps ? "Today you're above your daily average — keep it up!" : "Below average today — try a quick walk",
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-2 py-1">
                <Zap className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                <span className="text-[10px] font-extralight text-muted-foreground">{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isConnected && (
        <div className="rounded-2xl border border-dashed border-border/30 bg-card/10 p-10 text-center space-y-3">
          <Heart className="h-10 w-10 text-muted-foreground/20 mx-auto" />
          <p className="text-sm font-extralight text-muted-foreground/50">
            Connect Google to track health metrics, detect anomalies, and predict illness patterns.
          </p>
        </div>
      )}
    </div>
  );
};

export default HealthGuardian;
