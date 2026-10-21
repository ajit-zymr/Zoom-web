import { useEffect, useState } from "react";
import { getHealth, type LiveKitReadiness } from "../api";
import { mediaStatusCopy } from "../lib/mediaStatus";

export function MediaStatus() {
  const [livekit, setLivekit] = useState<LiveKitReadiness | "offline" | "checking">("checking");

  useEffect(() => {
    let active = true;
    getHealth()
      .then((health) => {
        if (active) {
          setLivekit(health.livekit);
        }
      })
      .catch(() => {
        if (active) {
          setLivekit("offline");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const tone = livekit === "ready" ? "ready" : livekit === "checking" ? "checking" : "warn";
  const message = livekit === "checking" ? "Checking the meeting server…" : mediaStatusCopy(livekit);

  return (
    <p className={`status-banner ${tone}`} role="status">
      {message}
    </p>
  );
}
