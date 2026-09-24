import { useEffect, useState } from "react";

/** Renders what its worker answers, so a test can see the worker ran. */
export default function WorkerEcho() {
  const [reply, setReply] = useState("waiting");
  useEffect(() => {
    const worker = new Worker(new URL("./echo.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event) => setReply(String(event.data));
    worker.onerror = () => setReply("worker failed");
    worker.postMessage("ping");
    return () => worker.terminate();
  }, []);
  return <p data-testid="reply">{reply}</p>;
}
