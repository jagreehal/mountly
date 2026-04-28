import React, { useEffect, useState } from "react";
import { createWidget } from "mountly-react";
import { emitCounterChanged, onCounterChanged } from "./bus";

function ReactCounter(): React.JSX.Element {
  const [count, setCount] = useState(0);
  const [vuePeer, setVuePeer] = useState(0);
  const [sveltePeer, setSveltePeer] = useState(0);

  useEffect(
    () =>
      onCounterChanged((e) => {
        if (e.source === "vue") setVuePeer(e.value);
        if (e.source === "svelte") setSveltePeer(e.value);
      }),
    [],
  );

  return (
    <section className="rf-card">
      <h2>React 19 Widget</h2>
      <p>react={count} | vue={vuePeer} | svelte={sveltePeer}</p>
      <button onClick={() => {
        const next = count + 1;
        setCount(next);
        emitCounterChanged({ source: "react", value: next });
      }}>+ React</button>
    </section>
  );
}

export default createWidget(ReactCounter, {
  shadow: false,
  styles: ".rf-card{border:2px solid rgb(200,60,60);color:rgb(200,60,60);padding:8px;margin:8px 0;border-radius:8px}",
});
