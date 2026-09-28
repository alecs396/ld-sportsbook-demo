import { useEffect } from "react";

// Small notification in the corner that hides itself after a few seconds.
export default function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className="toast" role="status">
      {message}
      <button className="remove" onClick={onClose} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
