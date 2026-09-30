import { useCallback, useRef, useState } from "react";

/* lățimea reală a containerului, ca SVG-ul să deseneze text la mărimea lui adevărată */
export function useWidth(fallback = 640) {
  const [width, setWidth] = useState(fallback);
  const observer = useRef(null);
  const ref = useCallback((el) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    const update = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      if (w > 0) setWidth(Math.max(200, w));
    };
    update();
    if (typeof ResizeObserver !== "undefined") {
      observer.current = new ResizeObserver(update);
      observer.current.observe(el);
    }
  }, []);
  return [ref, width];
}
