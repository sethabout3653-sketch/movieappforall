import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Server,
  Check,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { MediaItem, MediaType, ServerOption } from "../types";
import { STREAM_SERVERS, fetchTMDB } from "../services/tmdb";
import {
  saveContinueWatchingItem,
  getContinueWatchingList,
} from "../services/storage";

interface PlayerModalProps {
  item: MediaItem;
  initialSeason?: number;
  initialEpisode?: number;
  onClose: () => void;
  onProgressUpdate?: () => void;
}

type PlayerMessage = {
  event?: string;
  type?: string;
  status?: string;
  data?: unknown;
  payload?: unknown;
  currentTime?: number;
  time?: number;
  seconds?: number;
  position?: number;
  secondsWatched?: number;
  duration?: number;
  totalDuration?: number;
  length?: number;
  progress?: number;
  percentage?: number;
  percent?: number;
};

export const PlayerModal: React.FC<PlayerModalProps> = ({
  item,
  initialSeason = 1,
  initialEpisode = 1,
  onClose,
  onProgressUpdate,
}) => {
  const mediaType: MediaType = item.media_type || (item.title ? "movie" : "tv");
  const title = item.title || item.name || "Title";

  const [selectedServer, setSelectedServer] = useState<ServerOption>(
    STREAM_SERVERS[0]
  );
  const [season, setSeason] = useState<number>(initialSeason);
  const [episode, setEpisode] = useState<number>(initialEpisode);
  const [totalSeasons, setTotalSeasons] = useState<number>(1);
  const [episodesInSeason, setEpisodesInSeason] = useState<number>(24);
  const [showServerMenu, setShowServerMenu] = useState<boolean>(false);

  const [progressPercentage, setProgressPercentage] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(item.title ? 7200 : 2700);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      const target = containerRef.current || document.documentElement;
      target.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  // Invisible Click-Shield state to intercept initial ad/redirect overlays
  const [shieldActive, setShieldActive] = useState<boolean>(true);

  // Sandbox is added after a delay, but the server loads immediately.
  const [sandboxEnabled, setSandboxEnabled] = useState<boolean>(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<number | null>(null);
  const sandboxTimerRef = useRef<number | null>(null);
  const lastMessageTimeRef = useRef<number>(Date.now());
  const playStateRef = useRef({ isPlaying: false, shieldActive: true });

  useEffect(() => {
    playStateRef.current = { isPlaying, shieldActive };
  }, [isPlaying, shieldActive]);

  const uniqueId = useMemo(() => {
    return mediaType === "tv" ? `tv-${item.id}` : `movie-${item.id}`;
  }, [mediaType, item.id]);

  const currentEmbedUrl = useMemo(() => {
    return selectedServer.getUrl(item.id, mediaType, season, episode);
  }, [selectedServer, item.id, mediaType, season, episode]);

  // Reset shield and start a new 6-second sandbox timer whenever stream/episode changes.
  useEffect(() => {
    setShieldActive(true);
    setSandboxEnabled(false);

    if (sandboxTimerRef.current) {
      window.clearTimeout(sandboxTimerRef.current);
    }

    sandboxTimerRef.current = window.setTimeout(() => {
      setSandboxEnabled(true);
    }, 6000);

    return () => {
      if (sandboxTimerRef.current) {
        window.clearTimeout(sandboxTimerRef.current);
      }
    };
  }, [selectedServer.id, item.id, season, episode]);

  // Apply sandbox after the timer expires without remounting the iframe.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    if (sandboxEnabled) {
      iframe.setAttribute(
        "sandbox",
        "allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-presentation allow-same-origin allow-scripts allow-downloads"
      );
    } else {
      iframe.removeAttribute("sandbox");
    }
  }, [sandboxEnabled]);

  useEffect(() => {
    let cancelled = false;

    const loadRuntime = async () => {
      try {
        if (mediaType === "tv") {
          const data = await fetchTMDB(`/tv/${item.id}`);
          if (cancelled) return;

          if (typeof data?.number_of_seasons === "number") {
            setTotalSeasons(data.number_of_seasons);
          }

          const seasonInfo = data?.seasons?.find(
            (x: { season_number: number }) => x.season_number === season
          );
          if (typeof seasonInfo?.episode_count === "number") {
            setEpisodesInSeason(seasonInfo.episode_count);
          }

          if (
            Array.isArray(data?.episode_run_time) &&
            data.episode_run_time.length > 0
          ) {
            const minutes = data.episode_run_time[0];
            if (typeof minutes === "number" && minutes > 0) {
              setDuration(minutes * 60);
            }
          }

          try {
            const epData = await fetchTMDB(
              `/tv/${item.id}/season/${season}/episode/${episode}`
            );
            if (cancelled) return;

            if (typeof epData?.runtime === "number" && epData.runtime > 0) {
              setDuration(epData.runtime * 60);
            }
          } catch {
            // ignore episode runtime failure
          }
        } else {
          const data = await fetchTMDB(`/movie/${item.id}`);
          if (cancelled) return;

          if (typeof data?.runtime === "number" && data.runtime > 0) {
            setDuration(data.runtime * 60);
          }
        }
      } catch {
        // ignore runtime failures
      }
    };

    loadRuntime();

    return () => {
      cancelled = true;
    };
  }, [item.id, mediaType, season, episode]);

  useEffect(() => {
    const list = getContinueWatchingList();
    const existing = list.find(
      (x) =>
        x.id === uniqueId ||
        (x.tmdbId === item.id && x.mediaType === mediaType)
    );

    if (existing) {
      if (existing.serverId) {
        const savedServer = STREAM_SERVERS.find(
          (s) => s.id === existing.serverId
        );
        if (savedServer) {
          setSelectedServer(savedServer);
        }
      }

      if (typeof existing.progressPercentage === "number") {
        setProgressPercentage(existing.progressPercentage);
      }

      if (typeof existing.currentTime === "number") {
        setCurrentTime(existing.currentTime);
      } else if (
        typeof existing.progressPercentage === "number" &&
        existing.progressPercentage > 0 &&
        duration > 0
      ) {
        setCurrentTime(
          Math.round((existing.progressPercentage / 100) * duration)
        );
      }

      if (typeof existing.duration === "number" && existing.duration > 0) {
        setDuration(existing.duration);
      }

      if (mediaType === "tv") {
        if (typeof existing.season === "number") setSeason(existing.season);
        if (typeof existing.episode === "number") setEpisode(existing.episode);
      }
    } else {
      setProgressPercentage(0);
      setCurrentTime(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueId, item.id, mediaType]);

  useEffect(() => {
    const mediaTitle = item.title || item.name || "Title";
    if (mediaType === "tv") {
      document.title = `Watching ${mediaTitle} (S${season}:E${episode}) - FREEFLIX`;
    } else {
      document.title = `Watching ${mediaTitle} - FREEFLIX`;
    }

    return () => {
      document.title = "FREEFLIX - Stream Movies & TV Shows";
    };
  }, [item, mediaType, season, episode]);

  const handleClose = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    onClose();
  };

  const persistState = () => {
    saveContinueWatchingItem({
      id: uniqueId,
      tmdbId: item.id,
      mediaType,
      title,
      posterPath: item.poster_path,
      backdropPath: item.backdrop_path,
      progressPercentage,
      currentTime,
      duration,
      season: mediaType === "tv" ? season : undefined,
      episode: mediaType === "tv" ? episode : undefined,
      certification: item.certification,
      voteAverage: item.vote_average,
      completed: progressPercentage >= 95,
      serverId: selectedServer.id,
    });

    if (onProgressUpdate) onProgressUpdate();
  };

  useEffect(() => {
    const handleSaveState = () => {
      persistState();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        persistState();
      }
    };

    window.addEventListener("beforeunload", handleSaveState);
    window.addEventListener("pagehide", handleSaveState);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      handleSaveState();
      window.removeEventListener("beforeunload", handleSaveState);
      window.removeEventListener("pagehide", handleSaveState);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    uniqueId,
    progressPercentage,
    currentTime,
    duration,
    season,
    episode,
    selectedServer.id,
  ]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const raw = event.data;
        const data: PlayerMessage =
          typeof raw === "string" ? JSON.parse(raw) : raw;

        if (!data || typeof data !== "object") return;

        lastMessageTimeRef.current = Date.now();

        const eventType = String(
          data.event || data.type || data.status || ""
        ).toLowerCase();

        if (eventType.includes("play") || eventType.includes("start")) {
          setIsPlaying(true);
        } else if (
          eventType.includes("pause") ||
          eventType.includes("stop") ||
          eventType.includes("end")
        ) {
          setIsPlaying(false);
        }

        const payload =
          (data.data as Record<string, unknown>) ||
          (data.payload as Record<string, unknown>) ||
          (data as unknown as Record<string, unknown>);

        const cur =
          payload.currentTime ??
          payload.time ??
          payload.seconds ??
          payload.position ??
          payload.secondsWatched;
        const dur = payload.duration ?? payload.totalDuration ?? payload.length;
        const pct = payload.progress ?? payload.percentage ?? payload.percent;

        if (typeof cur === "number" && typeof dur === "number" && dur > 0) {
          const roundedCurrent = Math.max(0, Math.round(cur));
          const roundedDuration = Math.max(1, Math.round(dur));
          const calculatedPct = Math.min(
            100,
            Math.max(0, Math.round((roundedCurrent / roundedDuration) * 100))
          );

          setCurrentTime(roundedCurrent);
          setDuration(roundedDuration);
          setProgressPercentage(calculatedPct);
          setIsPlaying(true);
        } else if (typeof pct === "number") {
          const normalizedPct = Math.min(
            100,
            Math.max(0, Math.round(pct <= 1 ? pct * 100 : pct))
          );
          setProgressPercentage(normalizedPct);
          if (duration > 0) {
            setCurrentTime(Math.round((normalizedPct / 100) * duration));
          }
          setIsPlaying(true);
        }
      } catch {
        // ignore malformed messages
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [duration]);

  useEffect(() => {
    const ticker = setInterval(() => {
      const now = Date.now();
      const noRecentMessages = now - lastMessageTimeRef.current > 5000;

      if (playStateRef.current.isPlaying && noRecentMessages) {
        setCurrentTime((prev) => {
          const next = prev + 1;
          setProgressPercentage(
            Math.min(100, Math.round((next / Math.max(1, duration)) * 100))
          );
          return next;
        });
      }
    }, 1000);

    return () => clearInterval(ticker);
  }, [duration]);

  useEffect(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      persistState();
    }, 400);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressPercentage, currentTime, duration, season, episode, selectedServer.id]);

  const handleNextEpisode = () => {
    if (episode < episodesInSeason) {
      setEpisode((prev) => prev + 1);
    } else if (season < totalSeasons) {
      setSeason((prev) => prev + 1);
      setEpisode(1);
    }
  };

  const handleRestart = () => {
    setCurrentTime(0);
    setProgressPercentage(0);
    setIsPlaying(false);
    persistState();
  };

  const sandboxAttrs =
    "allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-presentation allow-same-origin allow-scripts allow-downloads";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-50 bg-black flex flex-col justify-between"
      >
        {/* TOP HEADER CONTROLS */}
        <div className="w-full px-4 sm:px-8 py-4 sm:py-5 bg-gradient-to-b from-black/90 via-black/50 to-transparent flex items-center justify-between z-30 pointer-events-none">
          <div className="flex items-center gap-4 pointer-events-auto">
            <button
              onClick={handleClose}
              className="p-2 sm:p-2.5 rounded-full bg-zinc-900/95 border border-white/10 text-white hover:bg-white hover:text-black hover:scale-110 transition-all shadow-lg"
              title="Close player"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] sm:text-xs uppercase font-extrabold text-black bg-white px-2 py-0.5 rounded-md shadow-md tracking-wider">
                  FREEFLIX
                </span>
                <h2 className="text-sm sm:text-lg md:text-xl font-black text-white line-clamp-1 drop-shadow-md uppercase tracking-wide font-sans">
                  {title}
                </h2>
              </div>

              {mediaType === "tv" && (
                <p className="text-[10px] sm:text-xs text-zinc-300 font-bold mt-0.5 tracking-wide">
                  SEASON {season} • EPISODE {episode}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 pointer-events-auto">
            <button
              onClick={handleRestart}
              className="flex items-center gap-2 bg-zinc-900/95 border border-white/20 hover:border-white text-white px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold shadow-xl transition-all"
              title="Restart playback"
            >
              <RotateCcw className="w-4 h-4 text-white" />
              <span className="hidden sm:inline">Restart</span>
            </button>

            <div className="relative">
              <button
                onClick={() => setShowServerMenu((v) => !v)}
                className="flex items-center gap-2 bg-zinc-900/95 border border-white/20 hover:border-white text-white px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold shadow-xl transition-all"
              >
                <Server className="w-4 h-4 text-white" />
                <span className="hidden sm:inline tracking-wide">
                  {selectedServer.name}
                </span>
                <span className="sm:hidden tracking-wide">
                  {selectedServer.id.toUpperCase()}
                </span>
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              </button>

              {showServerMenu && (
                <div className="absolute right-0 mt-3 w-64 bg-zinc-900/95 border border-white/10 rounded-2xl shadow-2xl z-50 p-2 space-y-1 max-h-80 overflow-y-auto">
                  <div className="text-[10px] font-black uppercase text-zinc-500 px-3 py-2 tracking-wider">
                    Select Streaming Server
                  </div>
                  {STREAM_SERVERS.map((server) => {
                    const isSelected = server.id === selectedServer.id;
                    return (
                      <button
                        key={server.id}
                        onClick={() => {
                          setSelectedServer(server);
                          setShowServerMenu(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-left transition-all ${
                          isSelected
                            ? "bg-white text-black shadow-lg font-black"
                            : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="tracking-wide">{server.name}</span>
                          {server.badge && (
                            <span className="text-[9px] bg-black/50 px-1.5 py-0.5 rounded border border-white/10 font-black text-white uppercase">
                              {server.badge}
                            </span>
                          )}
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-black" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* VIDEO PLAYER CONTAINER */}
        <div
          ref={containerRef}
          className="relative flex-1 w-full bg-black flex items-center justify-center overflow-hidden"
        >
          {/* CLICK SHIELD OVERLAY: Traps and destroys hidden ad-click redirects */}
          {shieldActive && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                setShieldActive(false);
              }}
              className="absolute inset-0 z-20 bg-transparent cursor-pointer"
              title="Click once to activate video player"
            />
          )}

          {/* CUSTOM FULLSCREEN TRIGGER FOR VIDEASY: Captures clicks on the player's fullscreen button */}
          {!shieldActive && selectedServer.id === 'videasy' && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
              }}
              className="absolute bottom-0 right-0 w-[80px] h-[70px] z-30 cursor-pointer bg-transparent"
              title="Toggle Fullscreen"
            />
          )}

          <iframe
            ref={iframeRef}
            key={`${selectedServer.id}-${season}-${episode}`}
            src={currentEmbedUrl}
            title={title}
            className="w-full h-full border-0 absolute inset-0 z-10"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture; accelerometer; gyroscope; clipboard-write; web-share"
            allowFullScreen
            // sandbox is intentionally applied later via ref after 6 seconds
            // so the stream loads immediately.
            scrolling="no"
            frameBorder="0"
            referrerPolicy="no-referrer"
          />
        </div>

        {/* BOTTOM BAR CONTROLS */}
        {mediaType === "tv" && (
          <div className="w-full px-4 sm:px-8 py-4 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-wrap items-center justify-between gap-3 z-30 pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto bg-zinc-900/95 border border-white/10 rounded-xl p-1.5 shadow-lg text-white">
              <button
                onClick={() => setEpisode(Math.max(1, episode - 1))}
                disabled={episode <= 1}
                className="px-3 py-1.5 hover:bg-white/20 rounded-lg disabled:opacity-50 transition-colors font-bold text-xs"
              >
                Prev
              </button>

              <div className="flex items-center gap-1.5 px-2 text-xs font-bold uppercase tracking-wider">
                <span>S</span>
                <select
                  value={season}
                  onChange={(e) => {
                    setSeason(Number(e.target.value));
                    setEpisode(1);
                  }}
                  className="bg-black/50 border border-white/20 rounded px-1.5 py-1 outline-none focus:border-white cursor-pointer"
                >
                  {Array.from({ length: Math.max(1, totalSeasons) }).map(
                    (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    )
                  )}
                </select>

                <span className="ml-1">E</span>
                <select
                  value={episode}
                  onChange={(e) => setEpisode(Number(e.target.value))}
                  className="bg-black/50 border border-white/20 rounded px-1.5 py-1 outline-none focus:border-white cursor-pointer"
                >
                  {Array.from({ length: Math.max(1, episodesInSeason) }).map(
                    (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    )
                  )}
                </select>
              </div>

              <button
                onClick={() => handleNextEpisode()}
                disabled={episode >= episodesInSeason && season >= totalSeasons}
                className="px-3 py-1.5 hover:bg-white/20 rounded-lg disabled:opacity-50 transition-colors font-bold text-xs"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};