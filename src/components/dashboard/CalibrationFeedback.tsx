import { useState } from "react";
import { Check, ChevronDown, ChevronUp, X, AlertTriangle } from "lucide-react";

export type FeedbackType = "perfect" | "too_shallow" | "too_deep" | "missed_point" | "factually_wrong";

interface CalibrationFeedbackProps {
  messageId: string;
  onFeedback: (messageId: string, feedback: FeedbackType) => void;
  existingFeedback?: FeedbackType | null;
}

const feedbackOptions: { id: FeedbackType; icon: React.ElementType; label: string; color: string }[] = [
  { id: "perfect", icon: Check, label: "Perfect", color: "text-emerald-500 hover:bg-emerald-500/10" },
  { id: "too_shallow", icon: ChevronUp, label: "Too shallow", color: "text-amber-500 hover:bg-amber-500/10" },
  { id: "too_deep", icon: ChevronDown, label: "Too deep", color: "text-blue-400 hover:bg-blue-400/10" },
  { id: "missed_point", icon: X, label: "Missed the point", color: "text-orange-500 hover:bg-orange-500/10" },
  { id: "factually_wrong", icon: AlertTriangle, label: "Factually wrong", color: "text-destructive hover:bg-destructive/10" },
];

const CalibrationFeedback = ({ messageId, onFeedback, existingFeedback }: CalibrationFeedbackProps) => {
  const [submitted, setSubmitted] = useState<FeedbackType | null>(existingFeedback ?? null);

  const handleFeedback = (fb: FeedbackType) => {
    setSubmitted(fb);
    onFeedback(messageId, fb);
  };

  if (submitted) {
    const chosen = feedbackOptions.find((f) => f.id === submitted);
    return (
      <span className="text-[10px] font-light text-muted-foreground/40 flex items-center gap-1">
        {chosen && <chosen.icon className="h-2.5 w-2.5" />}
        Calibrated
      </span>
    );
  }

  return (
    <div className="flex items-center gap-0.5">
      {feedbackOptions.map((fb) => (
        <button
          key={fb.id}
          onClick={() => handleFeedback(fb.id)}
          title={fb.label}
          className={`rounded-md p-1 transition-colors ${fb.color}`}
        >
          <fb.icon className="h-2.5 w-2.5" />
        </button>
      ))}
    </div>
  );
};

export default CalibrationFeedback;
