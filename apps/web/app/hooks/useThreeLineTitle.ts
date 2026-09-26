import { type RefObject, useLayoutEffect } from "react";

// Exam titles read best as about three even lines on large screens (two wide lines look
// mechanical). The line count depends on where words break, so a fixed width can't produce it for
// every name: long names need a wide measure, short ones a narrow one.
//
// titleMeasureCh() gives the starting width — about 40% of the title's length in `ch` — which the
// server renders, so the first paint is already close. This hook then measures the real title and
// adjusts that width one `ch` at a time until it's exactly `lines` lines. Below `minWidthPx` (phones,
// tablets) the title just wraps naturally.

const LINES = 3;
const MIN_WIDTH_PX = 1024;

export function titleMeasureCh(title: string): number {
  return Math.max(12, Math.ceil(title.length * 0.4));
}

function lineCount(el: HTMLElement): number {
  const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight);
  return lineHeight > 0 ? Math.round(el.getBoundingClientRect().height / lineHeight) : 0;
}

export function useThreeLineTitle(ref: RefObject<HTMLElement | null>, title: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !title) return;

    const fit = () => {
      if (window.innerWidth < MIN_WIDTH_PX) {
        el.style.maxWidth = "";
        return;
      }
      let ch = titleMeasureCh(title);
      el.style.maxWidth = `${ch}ch`;
      // Too many lines: widen. Too few (and still room to narrow): tighten. Bounded, and a title
      // too short for three lines simply stays as it is.
      for (let i = 0; i < 40 && lineCount(el) > LINES; i++) el.style.maxWidth = `${++ch}ch`;
      for (let i = 0; i < 40 && lineCount(el) < LINES && ch > 12; i++) {
        el.style.maxWidth = `${--ch}ch`;
        if (lineCount(el) > LINES) {
          el.style.maxWidth = `${++ch}ch`;
          break;
        }
      }
    };

    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [ref, title]);
}
