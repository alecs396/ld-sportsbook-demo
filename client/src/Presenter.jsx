import { useState } from "react";
import { useBoolVariationDetail, useLDClient } from "@launchdarkly/react-sdk";

// Presenter panel (/presenter): demo controls, kept off the customer site.
// Picking a persona here also switches any open customer tab, over a
// BroadcastChannel (browser tabs on the same site, no server involved).
export const DEMO_CHANNEL = "sportsbook-demo";

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

export default function Presenter({ personas, initialPersonaKey }) {
  const ldClient = useLDClient();
  const [current, setCurrent] = useState(initialPersonaKey);

  async function selectPersona(key) {
    const persona = personas.find((p) => p.key === key);
    if (!persona) return;
    try {
      await ldClient.identify(persona);
    } catch (err) {
      console.error(`Could not switch LaunchDarkly context to ${key}`, err);
    }
    setCurrent(key);

    const channel = new BroadcastChannel(DEMO_CHANNEL);
    channel.postMessage({ type: "persona", key });
    channel.close();
  }

  return (
    <div className="presenter">
      <header className="header">
        <span className="logo">Presenter panel</span>
        <a className="muted" href="/" target="_blank" rel="noreferrer">
          Open customer site
        </a>
      </header>

      <main className="presenter-body">
        <section>
          <h2>Personas</h2>
          <div className="persona-buttons">
            {personas.map((p) => (
              <button
                key={p.key}
                className={p.key === current ? "persona-button active" : "persona-button"}
                onClick={() => selectPersona(p.key)}
              >
                <strong>{p.name}</strong>
                <span className="muted">
                  {p.state} · {p.tier}
                  {p.isInternal ? " · QA" : ""}
                </span>
                <code className="muted">{p.key}</code>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>Flag values for {current}</h2>
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
          <p className="muted">Values update live when flags change in LaunchDarkly.</p>
        </section>
      </main>
    </div>
  );
}
