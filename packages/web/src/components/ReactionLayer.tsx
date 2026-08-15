// Floating emoji reactions: spawned locally or via collab broadcast, they
// rise from the sender's cursor and fade out.
import { useCallback, useEffect, useRef, useState } from "react";

export interface Float {
  id: number; emoji: string; x: number; y: number; name?: string;
}

let nextId = 1;

export function useReactionLayer() {
  const [floats, setFloats] = useState<Float[]>([]);
  const timers = useRef<number[]>([]);

  const spawn = useCallback((emoji: string, x: number, y: number, name?: string) => {
    const id = nextId++;
    const jitter = () => (Math.random() - 0.5) * 40;
    const batch = [0, 120, 260, 420].map((delay) =>
      window.setTimeout(() => {
        setFloats((f) => [...f, { id: id * 10 + delay, emoji, x: x + jitter(), y: y + jitter() * 0.4, name }]);
      }, delay),
    );
    timers.current.push(...batch);
    window.setTimeout(() => setFloats((f) => f.filter((fl) => Math.floor(fl.id / 10) !== id)), 2600);
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return { floats, spawn };
}

export default function ReactionLayer({ floats }: { floats: Float[] }) {
  return (
    <div className="reaction-layer">
      {floats.map((f) => (
        <span key={f.id} className="float-emoji" style={{ left: f.x, top: f.y }}>
          {f.emoji}
          {f.name && <i>{f.name}</i>}
        </span>
      ))}
    </div>
  );
}
