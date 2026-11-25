"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

interface Props {
  playbackId: string;
  playbackToken: string;
}

export default function MuxAdminPreviewPlayer({
  playbackId,
  playbackToken,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready">("loading");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    let usingHlsJs = false;

    const source =
      `https://stream.mux.com/${encodeURIComponent(playbackId)}.m3u8` +
      `?token=${encodeURIComponent(playbackToken)}`;

    setError(null);
    setStatus("loading");

    const handleLoadedMetadata = () => {
      setStatus("ready");
    };

    const handleVideoError = () => {
      const mediaError = video.error;

      if (!usingHlsJs) {
        setError(
          `Native playback failed (code ${mediaError?.code ?? "unknown"}).`,
        );
      }
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("error", handleVideoError);

    // Prefer HLS.js when Media Source Extensions are supported.
    if (Hls.isSupported()) {
      usingHlsJs = true;

      console.info("[Mux Preview] Using hls.js.");

      hls = new Hls({
        enableWorker: true,
      });

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        console.info("[Mux Preview] HLS attached to video.");
      });

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        console.info("[Mux Preview] Manifest parsed:", {
          levels: data.levels.length,
          resolutions: data.levels.map((level) => ({
            width: level.width,
            height: level.height,
          })),
        });
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.error("[Mux Preview] HLS error:", {
          type: data.type,
          details: data.details,
          fatal: data.fatal,
          status: data.response?.code,
          reason: data.reason,
        });

        if (data.fatal) {
          setError(
            `HLS playback failed: ${data.details}${
              data.response?.code ? ` (HTTP ${data.response.code})` : ""
            }.`,
          );
        }
      });

      hls.loadSource(source);
      hls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Fallback for browsers with native HLS but without MSE support.
      console.info("[Mux Preview] Using native HLS fallback.");

      video.src = source;
      video.load();
    } else {
      setError("Your browser does not support HLS playback.");
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("error", handleVideoError);

      hls?.destroy();

      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [playbackId, playbackToken]);

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-md bg-black">
        <video
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          className="aspect-video w-full"
        />

        {status === "loading" && !error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="rounded-md bg-black/70 px-3 py-2 text-sm text-white">
              Loading video stream...
            </p>
          </div>
        )}
      </div>

      {status === "ready" && !error && (
        <p className="text-xs text-muted-foreground">
          Video stream loaded. Press play to start playback.
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}
    </div>
  );
}
