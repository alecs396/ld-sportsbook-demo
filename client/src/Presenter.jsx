import { useState } from "react";
import { useBoolVariationDetail } from "@launchdarkly/react-sdk";

// Presenter panel: demo controls docked under the sportsbook, so one window
// shows the app and why each flag has its value. Not part of the customer site.

// FLAG: both flags must exist in your LaunchDarkly project (see README).
const FLAGS = ["live-betting", "new-bet-slip"];

// Evaluation reasons explain why a context got its value.
function describeReason(reason) {
  switch (reason?.kind) {
    case "TARGET_MATCH":
      return "Individual target";
    case "RULE_MATCH":
      return `Rule ${reason.ruleIndex + 1}`;
    case "FALLTHROUGH":
      return "Default rule";
    case "OFF":
      return "Targeting off";
    case "ERROR":
      return `Error (${reason.errorKind})`;
    default:
      return "Waiting for LaunchDarkly";
  }
}

function FlagRow({ flagKey }) {
  const { value, reason } = useBoolVariationDetail(flagKey, false);
  return (
    <tr>
      <td>
        <code>{flagKey}</code>
      </td>
      <td className={value ? "on" : "off"}>{value ? "true" : "false"}</td>
      <td>{describeReason(reason)}</td>
    </tr>
  );
}

// The persona lives in App, so switching here is the same identify() call as
// the header dropdown.
export default function PresenterPanel({ personas, personaKey, onSelectPersona }) {
  const [open, setOpen] = useState(true);

  return (
    <section className="presenter" aria-label="Presenter panel">
      <header className="presenter-header">
        <span className="presenter-label">Presenter panel</span>
        <span className="muted">Demo controls, not part of the customer site</span>
        <button className="presenter-toggle" onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Show"}
        </button>
      </header>

      {open && (
        <div className="presenter-body">
          <div className="persona-buttons">
            {personas.map((p) => (
              <button
                key={p.key}
                className={p.key === personaKey ? "persona-button active" : "persona-button"}
                onClick={() => onSelectPersona(p.key)}
              >
                <strong>{p.name}</strong>
                <span className="muted">
                  {p.state} · {p.tier}
                  {p.isInternal ? " · QA" : ""}
                </span>
              </button>
            ))}
          </div>

          <table className="flag-table">
            <thead>
              <tr>
                <th>Flag</th>
                <th>Value</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {FLAGS.map((flagKey) => (
                <FlagRow key={flagKey} flagKey={flagKey} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
