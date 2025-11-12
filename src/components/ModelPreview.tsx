"use client";

import { createElement, useEffect } from "react";

type Props = {
  src?: string | null;
  poster?: string | null;
};

export function ModelPreview({ src, poster }: Props) {
  useEffect(() => {
    void import("@google/model-viewer");
  }, []);

  if (!src) {
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-zinc-300/80 bg-white/30 p-6 text-center text-sm text-zinc-500 dark:border-white/20 dark:bg-white/5 dark:text-zinc-300">
        生成完成后，这里会展示可交互的 3D 模型。
      </div>
    );
  }

  const viewerProps = {
    src,
    alt: "Seed3D output",
    exposure: 1.1,
    "shadow-intensity": 1,
    "camera-controls": "true",
    "interaction-prompt": "auto",
    style: {
      width: "100%",
      height: "100%",
      minHeight: "360px",
      borderRadius: "1rem",
      background:
        "radial-gradient(circle at top, rgba(255,255,255,0.12), rgba(15,23,42,0.9))",
    },
  } as const;

  return createElement("model-viewer", viewerProps as Record<string, unknown>);
}
