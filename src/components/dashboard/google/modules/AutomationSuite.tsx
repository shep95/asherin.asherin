import { Mail, Calendar, DollarSign, Cake, MapPin, Car, Moon, Dumbbell, Brain, Zap } from "lucide-react";

// relay — standing orders.
//
// the previous version listed nine automations with toggles and reported
// "7 of 9 automations active". the toggles flipped a react flag and nothing
// else: no scheduler, no rule store, no action ever ran. on this device there
// is no process that could run one while the tab is closed, so the desk now
// lists the orders it was chartered for and states that none is armed.

interface StandingOrder {
  icon: React.ElementType;
  name: string;
  desc: string;
  trigger: string;
}

const ORDERS: StandingOrder[] = [
  { icon: Mail, name: "reply drafting", desc: "draft, never send, a reply to mail from priority contacts in your own register", trigger: "new mail from a priority contact" },
  { icon: Calendar, name: "focus blocking", desc: "hold focus time where the calendar shows open bands", trigger: "an uncontested morning band" },
  { icon: DollarSign, name: "renewal warning", desc: "warn three days before a recurring charge the ledger has proven", trigger: "a projected renewal date" },
  { icon: Cake, name: "birthday note", desc: "surface a birthday from the address book the day before", trigger: "a birthday field on a contact" },
  { icon: MapPin, name: "place reminder", desc: "raise a task when you enter a named place", trigger: "arrival at a venue" },
  { icon: Car, name: "departure hint", desc: "suggest when to leave for a located event", trigger: "a located event within two hours" },
  { icon: Moon, name: "rest window", desc: "suggest a bedtime from tomorrow's first event", trigger: "tomorrow's first timed event" },
  { icon: Dumbbell, name: "workout window", desc: "suggest a workout slot from step-count pattern", trigger: "a quiet band in the step histogram" },
  { icon: Brain, name: "load warning", desc: "flag a day where mail volume and meeting density both spike", trigger: "two load signals in one day" },
];

const AutomationSuite = () => (
  <div className="space-y-6">
    <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-5 flex items-start gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
        <Zap className="h-6 w-6 text-foreground/70" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="text-sm font-light tracking-wide text-foreground">standing orders</h3>
        <p className="text-[11px] font-extralight leading-relaxed text-muted-foreground">
          none of these orders is armed. there is no scheduler on this device and no google account to watch, so a switch
          here would change nothing — it has been removed rather than left to look live.
        </p>
      </div>
    </div>

    <div className="space-y-3">
      <h3 className="text-sm font-light tracking-wide text-foreground">the orders this desk is chartered for</h3>
      <ul className="space-y-2">
        {ORDERS.map((a) => (
          <li key={a.name} className="flex items-start gap-3 rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
              <a.icon className="h-4 w-4 text-foreground/70" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <span className="text-xs font-light text-foreground">{a.name}</span>
              <p className="text-[10px] font-extralight text-muted-foreground">{a.desc}</p>
              <p className="text-[9px] font-extralight text-muted-foreground/40">trigger: {a.trigger}</p>
            </div>
            <span className="shrink-0 rounded-full border border-border/25 px-2 py-0.5 font-mono text-[9px] text-muted-foreground/60">
              not armed
            </span>
          </li>
        ))}
      </ul>
    </div>
  </div>
);

export default AutomationSuite;
