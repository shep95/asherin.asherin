import { useState, useEffect, useCallback } from "react";
import { Heart, Activity, Footprints, RefreshCw, AlertTriangle } from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";
import { CONNECT_UNAVAILABLE, describeFailure } from "../offline";

// vitals — google fit, seven days, against the operator's own average.
// it never "predicts illness": the copy that said so is gone.

interface FitDay { date: string; steps: number; heartRate: number; calories: number }

const HealthGuardian = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fitnessData, setFitnessData] = useState<FitDay[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // fitness is read from the primary account only — never aggregated across people.
      const data = await fetchGoogleData("fitness", undefined, undefined, false);
      setFitnessData(data.dailyData || []);
    } catch (err) {
      setError(describeFailure(err, "fitness organ"));
    } finally {
      setLoading(false);
    }
  }, [fetchGoogleData]);

  useEffect(() => {
    if (isConnected) void loadData();
  }, [isConnected, loadData]);

  const hasLiveData = fitnessData.length > 0;
  const todayData = fitnessData[fitnessData.length - 1];
  const avgSteps = hasLiveData ? Math.round(fitnessData.reduce((a, d) => a + d.steps, 0) / fitnessData.length) : 0;
  const hrDays = fitnessData.filter((d) => d.heartRate > 0);
  const avgHR = hrDays.length ? Math.round(hrDays.reduce((a, d) => a + d.heartRate, 0) / hrDays.length) : 0;
  const totalCalories = hasLiveData ? Math.round(fitnessData.reduce((a, d) => a + d.calories, 0)) : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
            <Heart className="h-6 w-6 text-foreground/70" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extralight tracking-wide text-foreground">physiological signals</h2>
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
              {isConnected
                ? "seven days of steps, heart rate and calories from google fit, each day against the week's own average. no diagnosis is drawn."
                : CONNECT_UNAVAILABLE}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-border/25 bg-card/20 px-4 py-3 text-[11px] font-extralight text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {error}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "avg steps / day", value: hasLiveData ? avgSteps.toLocaleString() : "—" },
          { label: "today steps", value: todayData ? todayData.steps.toLocaleString() : "—" },
          { label: "avg heart rate", value: avgHR > 0 ? `${avgHR} bpm` : "—" },
          { label: "week calories", value: totalCalories > 0 ? totalCalories.toLocaleString() : "—" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 text-center">
            <p className="text-xl font-extralight text-foreground">{loading ? "…" : s.value}</p>
            <p className="text-[10px] font-light text-muted-foreground/60 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {hasLiveData && (
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-4">
          <h3 className="text-sm font-light tracking-wide text-foreground flex items-center gap-2">
            <Activity className="h-4 w-4" aria-hidden /> seven-day activity
          </h3>
          <div className="space-y-2">
            {fitnessData.map((day) => (
              <div key={day.date} className="flex items-center gap-3 rounded-xl bg-foreground/5 px-4 py-2">
                <span className="w-20 shrink-0 text-[10px] font-light text-muted-foreground">
                  {new Date(day.date).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-[10px]">
                  <span className="flex items-center gap-1 text-foreground">
                    <Footprints className="h-2.5 w-2.5" aria-hidden /> {day.steps.toLocaleString()}
                  </span>
                  {day.heartRate > 0 && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Heart className="h-2.5 w-2.5" aria-hidden /> {day.heartRate} bpm
                    </span>
                  )}
                  {day.calories > 0 && <span className="text-muted-foreground/50">{day.calories.toLocaleString()} cal</span>}
                </div>
                <div className="hidden sm:block w-24 h-1.5 rounded-full bg-foreground/5 overflow-hidden" aria-hidden>
                  <div className="h-full rounded-full bg-foreground/20" style={{ width: `${Math.min(100, (day.steps / Math.max(1, avgSteps)) * 50)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] font-extralight text-muted-foreground/50">
            bars are each day against the week's own average, not against a universal target.
          </p>
        </div>
      )}

      {isConnected && !loading && !error && !hasLiveData && (
        <div className="rounded-2xl border border-dashed border-border/30 bg-card/10 p-10 text-center">
          <p className="text-sm font-extralight text-muted-foreground/50">
            google fit returned no days. the account may not record fitness, or the fitness scope was not granted.
          </p>
        </div>
      )}
    </div>
  );
};

export default HealthGuardian;
