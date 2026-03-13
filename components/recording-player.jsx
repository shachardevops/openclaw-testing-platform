'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

const MOBILE_VIEWPORT_MAX_WIDTH = 768;
const TABLET_VIEWPORT_MAX_WIDTH = 1024;

function normalizeViewport(value) {
  const raw = String(value || '').toLowerCase();
  if (!raw) return 'shared';
  if (raw.includes('mobile') || raw.includes('phone')) return 'mobile';
  if (raw.includes('tablet') || raw.includes('ipad')) return 'tablet';
  if (raw.includes('desktop')) return 'desktop';
  return 'shared';
}

function classifyViewportFromWidth(width) {
  if (!Number.isFinite(width) || width <= 0) return 'shared';
  if (width <= MOBILE_VIEWPORT_MAX_WIDTH) return 'mobile';
  if (width <= TABLET_VIEWPORT_MAX_WIDTH) return 'tablet';
  return 'desktop';
}

function viewportLabel(viewport) {
  if (viewport === 'mobile') return 'Mobile';
  if (viewport === 'tablet') return 'Tablet';
  if (viewport === 'desktop') return 'Desktop';
  return 'Shared';
}

/**
 * RecordingPlayer — playback component for screencast recordings.
 *
 * Shows the recording frames with a scrubable timeline below.
 * Event markers (findings, navigations, errors) are displayed on the timeline.
 */
export default function RecordingPlayer({ taskId, onClose, jumpToFindingId }) {
  const [manifest, setManifest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [hoveredEvent, setHoveredEvent] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const imgRef = useRef(null);
  const playTimerRef = useRef(null);
  const timelineRef = useRef(null);

  const [isLive, setIsLive] = useState(false);
  const [followLive, setFollowLive] = useState(true);
  const liveTimerRef = useRef(null);

  // Load manifest
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/recording?action=manifest&taskId=${encodeURIComponent(taskId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setManifest(data.manifest);
          setCurrentIndex(0);
          setIsLive(!!data.manifest?.active);
        } else {
          setError(data.error || 'Failed to load recording');
        }
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, [taskId]);

  // Poll for new frames when recording is live
  useEffect(() => {
    if (!isLive) return;
    liveTimerRef.current = setInterval(() => {
      fetch(`/api/recording?action=manifest&taskId=${encodeURIComponent(taskId)}`)
        .then(r => r.json())
        .then(data => {
          if (!data.ok || !data.manifest) return;
          const newFrames = data.manifest.frames || [];
          const oldLen = manifest?.frames?.length || 0;
          setManifest(data.manifest);
          if (!data.manifest.active) setIsLive(false);
          // Auto-follow: jump to latest frame if user hasn't scrubbed away
          if (followLive && newFrames.length > oldLen) {
            setCurrentIndex(newFrames.length - 1);
          }
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(liveTimerRef.current);
  }, [isLive, taskId, manifest?.frames?.length, followLive]);

  const frames = manifest?.frames || [];
  const events = manifest?.events || [];
  const durationMs = manifest?.durationMs || 0;
  const currentFrame = frames[currentIndex];
  const currentViewport = currentFrame ? classifyViewportFromWidth(currentFrame.w) : 'shared';

  const findClosestFrameIndex = useCallback((targetTs) => {
    if (frames.length === 0) return 0;
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < frames.length; i++) {
      const dist = Math.abs(frames[i].ts - targetTs);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    }
    return closest;
  }, [frames]);

  const jumpToTimestamp = useCallback((targetTs, opts = {}) => {
    setFollowLive(!!opts.followLive);
    setCurrentIndex(findClosestFrameIndex(targetTs));
    setPlaying(false);
    if (!opts.keepSelection) setSelectedEvent(null);
  }, [findClosestFrameIndex]);

  /** Distance in ms between a timestamp and the closest frame */
  const frameGapMs = useCallback((targetTs) => {
    if (frames.length === 0) return Infinity;
    const idx = findClosestFrameIndex(targetTs);
    return Math.abs(frames[idx].ts - targetTs);
  }, [frames, findClosestFrameIndex]);

  const inferEventViewport = useCallback((event) => {
    const explicit = normalizeViewport(event?.data?.viewport);
    if (explicit !== 'shared') return explicit;
    const nearestFrame = frames[findClosestFrameIndex(event?.ts || 0)];
    return classifyViewportFromWidth(nearestFrame?.w);
  }, [findClosestFrameIndex, frames]);

  // Auto-jump to a specific finding on manifest load
  const jumpedRef = useRef(false);
  useEffect(() => {
    jumpedRef.current = false;
  }, [taskId, jumpToFindingId]);

  useEffect(() => {
    if (!jumpToFindingId || !manifest || jumpedRef.current || frames.length === 0) return;
    const findingEvent = events.find(
      e => e.type === 'finding' && e.data?.id === jumpToFindingId
    );
    if (!findingEvent) return;
    jumpToTimestamp(findingEvent.ts);
    jumpedRef.current = true;
  }, [jumpToFindingId, manifest, events, frames.length, jumpToTimestamp]);

  // Preload adjacent frames
  useEffect(() => {
    if (!currentFrame) return;
    // Preload next 3 frames
    for (let i = 1; i <= 3; i++) {
      const next = frames[currentIndex + i];
      if (next) {
        const img = new Image();
        img.src = `/api/recording?action=frame&taskId=${encodeURIComponent(taskId)}&file=${next.file}`;
      }
    }
  }, [currentIndex, frames, taskId]);

  // Update displayed frame
  useEffect(() => {
    if (!currentFrame || !imgRef.current) return;
    imgRef.current.src = `/api/recording?action=frame&taskId=${encodeURIComponent(taskId)}&file=${currentFrame.file}`;
  }, [currentFrame, taskId]);

  // Playback timer
  useEffect(() => {
    if (!playing || frames.length === 0) return;
    const interval = (manifest?.frameIntervalMs || 1000) / playbackSpeed;
    playTimerRef.current = setInterval(() => {
      setCurrentIndex(prev => {
        if (prev >= frames.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, interval);
    return () => clearInterval(playTimerRef.current);
  }, [playing, playbackSpeed, frames.length, manifest?.frameIntervalMs]);

  const togglePlay = useCallback(() => {
    if (currentIndex >= frames.length - 1) {
      setCurrentIndex(0);
      setPlaying(true);
    } else {
      setPlaying(p => !p);
    }
  }, [currentIndex, frames.length]);

  // Keyboard controls
  useEffect(() => {
    const handler = (e) => {
      // Don't capture keys when user is typing in an input or textarea
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      if (e.key === 'ArrowLeft') { setPlaying(false); setFollowLive(false); setCurrentIndex(i => Math.max(0, i - 1)); }
      if (e.key === 'ArrowRight') { setPlaying(false); setFollowLive(false); setCurrentIndex(i => Math.min(frames.length - 1, i + 1)); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlay, frames.length]);

  // Jump to position on timeline click
  const handleTimelineClick = useCallback((e) => {
    if (!timelineRef.current || frames.length === 0) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTs = ratio * durationMs;
    setSelectedEvent(null);
    jumpToTimestamp(targetTs);
  }, [frames.length, durationMs, jumpToTimestamp]);

  // Categorize events for the timeline
  const eventMarkers = useMemo(() => {
    if (!durationMs || events.length === 0) return [];
    return events
      .filter(e => ['finding', 'navigation', 'error', 'session', 'app_log'].includes(e.type))
      .map(e => ({
        ...e,
        position: Math.min(100, (e.ts / durationMs) * 100),
        viewport: inferEventViewport(e),
      }));
  }, [events, durationMs, inferEventViewport]);

  const findingMarkers = useMemo(() =>
    eventMarkers.filter(e => e.type === 'finding'), [eventMarkers]
  );

  const navMarkers = useMemo(() =>
    eventMarkers.filter(e => e.type === 'navigation'), [eventMarkers]
  );

  const appLogMarkers = useMemo(() =>
    eventMarkers.filter(e => e.type === 'app_log'), [eventMarkers]
  );

  const viewportSections = useMemo(() => {
    if (frames.length === 0) return [];

    const sections = [];
    let startIndex = 0;
    let bucket = classifyViewportFromWidth(frames[0]?.w);

    for (let i = 1; i <= frames.length; i++) {
      const nextBucket = i < frames.length ? classifyViewportFromWidth(frames[i]?.w) : null;
      if (i === frames.length || nextBucket !== bucket) {
        const startFrame = frames[startIndex];
        const endFrame = frames[i - 1];
        sections.push({
          viewport: bucket,
          startIndex,
          endIndex: i - 1,
          startTs: startFrame?.ts || 0,
          endTs: endFrame?.ts || 0,
          frameCount: i - startIndex,
          width: startFrame?.w || endFrame?.w || null,
          height: startFrame?.h || endFrame?.h || null,
        });
        startIndex = i;
        bucket = nextBucket;
      }
    }

    return sections;
  }, [frames]);

  const viewportSummary = useMemo(() => {
    const summary = {
      desktop: { frames: 0, sections: [], findings: [], appLogs: [] },
      tablet: { frames: 0, sections: [], findings: [], appLogs: [] },
      mobile: { frames: 0, sections: [], findings: [], appLogs: [] },
      shared: { frames: 0, sections: [], findings: [], appLogs: [] },
    };

    for (const frame of frames) {
      summary[classifyViewportFromWidth(frame?.w)].frames += 1;
    }

    for (const section of viewportSections) {
      summary[section.viewport].sections.push(section);
    }

    for (const marker of findingMarkers) {
      summary[marker.viewport || 'shared'].findings.push(marker);
    }

    for (const marker of appLogMarkers) {
      summary[marker.viewport || 'shared'].appLogs.push(marker);
    }

    return summary;
  }, [frames, viewportSections, findingMarkers, appLogMarkers]);

  const formatTime = (ms) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const currentTs = currentFrame?.ts || 0;
  const progress = durationMs > 0 ? (currentTs / durationMs) * 100 : 0;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
        Loading recording...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <div className="text-zinc-500 text-sm">{error}</div>
        {onClose && (
          <button onClick={onClose} className="font-mono text-[10px] text-accent hover:text-accent/80">
            Back
          </button>
        )}
      </div>
    );
  }

  const sevColor = (sev) => {
    if (!sev) return 'bg-zinc-500';
    const s = sev.toUpperCase();
    if (s === 'P1' || s === 'BUG') return 'bg-red-500';
    if (s === 'P2') return 'bg-red-400';
    if (s === 'P3' || s === 'WARNING') return 'bg-amber-400';
    if (s === 'P4' || s === 'INFO') return 'bg-amber-300';
    return 'bg-zinc-400';
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0a]">
      {/* Header */}
      <div className="px-3 py-1.5 border-b border-border bg-card/30 flex items-center gap-3 shrink-0">
        {onClose && (
          <button onClick={onClose} className="font-mono text-[9px] text-zinc-500 hover:text-zinc-300 transition-colors">
            {'\u2190'} Back
          </button>
        )}
        <span className="font-mono text-[10px] text-zinc-300 font-medium">{taskId}</span>
        {isLive && (
          <span className="flex items-center gap-1.5 font-mono text-[9px] text-red-400 bg-red-400/10 px-2 py-0.5 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            LIVE
          </span>
        )}
        {manifest?.startedAt && (
          <span className="font-mono text-[8px] text-zinc-600">
            {new Date(manifest.startedAt).toLocaleDateString('en-GB')}{' '}
            {new Date(manifest.startedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <span className="font-mono text-[8px] text-zinc-600">
          {frames.length} frames
        </span>
        <span className="font-mono text-[8px] text-zinc-600">
          {formatTime(durationMs)}
        </span>
        {findingMarkers.length > 0 && (
          <span className="font-mono text-[9px] text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">
            {findingMarkers.length} finding{findingMarkers.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {frames.length > 0 && (
        <div className="shrink-0 grid grid-cols-1 gap-2 border-b border-border bg-card/15 px-3 py-2 md:grid-cols-3 max-h-[140px] overflow-y-auto">
          {['desktop', 'tablet', 'mobile'].filter(vp => viewportSummary[vp].frames > 0 || currentViewport === vp).map((viewport) => {
            const summary = viewportSummary[viewport];
            const isActiveViewport = currentViewport === viewport;
            const vpColors = {
              mobile: { active: 'border-amber-300/40 bg-amber-300/8', dot: 'bg-amber-300', btn: 'border-amber-300/20 bg-amber-300/6 text-amber-200 hover:bg-amber-300/12' },
              tablet: { active: 'border-purple-400/40 bg-purple-400/8', dot: 'bg-purple-400', btn: 'border-purple-400/20 bg-purple-400/6 text-purple-200 hover:bg-purple-400/12' },
              desktop: { active: 'border-blue-400/35 bg-blue-400/8', dot: 'bg-blue-400', btn: 'border-blue-400/20 bg-blue-400/6 text-blue-200 hover:bg-blue-400/12' },
            };
            const vc = vpColors[viewport] || vpColors.desktop;
            return (
              <div
                key={viewport}
                className={`rounded-lg border px-3 py-2 ${
                  isActiveViewport ? vc.active : 'border-border bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${vc.dot}`} />
                    <span className="font-mono text-[10px] uppercase tracking-[1px] text-zinc-300">
                      {viewportLabel(viewport)}
                    </span>
                  </div>
                  <span className="font-mono text-[9px] text-zinc-500">
                    {summary.frames} frame{summary.frames !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[9px] text-zinc-500">
                  <span>{summary.sections.length} segment{summary.sections.length !== 1 ? 's' : ''}</span>
                  <span>{summary.findings.length} finding{summary.findings.length !== 1 ? 's' : ''}</span>
                  <span>{summary.appLogs.length} log event{summary.appLogs.length !== 1 ? 's' : ''}</span>
                </div>

                {summary.sections.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {summary.sections.map((section, index) => (
                      <button
                        key={`${viewport}-${section.startTs}-${index}`}
                        onClick={() => jumpToTimestamp(section.startTs)}
                        className={`rounded border px-2 py-1 font-mono text-[9px] transition-colors ${vc.btn}`}
                        title={`Jump to ${viewportLabel(viewport)} segment`}
                      >
                        {formatTime(section.startTs)}-{formatTime(section.endTs)}
                        {section.width ? ` · ${section.width}x${section.height}` : ''}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 font-mono text-[9px] text-zinc-600">
                    No {viewportLabel(viewport).toLowerCase()} frames captured in this recording.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Video frame */}
      <div className="flex-1 flex items-center justify-center overflow-hidden relative min-h-[200px]">
        {frames.length > 0 ? (
          <img
            ref={imgRef}
            alt={`Frame ${currentIndex + 1}`}
            className="max-w-full max-h-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="text-zinc-600 text-sm">No frames</div>
        )}

        {/* Current page URL overlay */}
        {currentFrame?.pageUrl && (
          <div className="absolute top-2 left-2 right-2">
            <div className="flex items-center gap-2 bg-black/70 backdrop-blur-sm rounded px-2 py-1">
              <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[8px] ${
                currentViewport === 'mobile'
                  ? 'bg-amber-300/15 text-amber-200'
                  : currentViewport === 'tablet'
                    ? 'bg-purple-400/15 text-purple-200'
                    : currentViewport === 'desktop'
                      ? 'bg-blue-400/15 text-blue-200'
                      : 'bg-zinc-700 text-zinc-300'
              }`}>
                {viewportLabel(currentViewport)}
                {currentFrame?.w ? ` ${currentFrame.w}x${currentFrame.h}` : ''}
              </span>
              <span className="min-w-0 truncate font-mono text-[9px] text-zinc-400">
                {currentFrame.pageUrl}
              </span>
            </div>
          </div>
        )}

        {/* Sparse frame warning — nearest frame is far from current view target */}
        {selectedEvent && frameGapMs(selectedEvent.ts) > 30000 && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-amber-400/10 border border-amber-400/30 rounded-lg px-3 py-1.5 z-10">
            <span className="font-mono text-[9px] text-amber-300">
              No frame captured at this time — showing nearest frame ({formatTime(frameGapMs(selectedEvent.ts))} away)
            </span>
          </div>
        )}

        {/* Selected event detail panel */}
        {selectedEvent && (
          <div className="absolute bottom-4 left-4 right-4 bg-elevated/95 backdrop-blur-sm border border-border rounded-lg px-4 py-3 shadow-xl z-10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2 font-mono text-[9px] text-zinc-400">
                  <span>{formatTime(selectedEvent.ts)} — {selectedEvent.type}</span>
                  {selectedEvent.viewport !== 'shared' && (
                    <span className={`rounded px-1 py-0.5 ${
                      selectedEvent.viewport === 'mobile'
                        ? 'bg-amber-300/15 text-amber-200'
                        : selectedEvent.viewport === 'tablet'
                        ? 'bg-purple-400/15 text-purple-200'
                        : 'bg-blue-400/15 text-blue-200'
                    }`}>
                      {viewportLabel(selectedEvent.viewport)}
                    </span>
                  )}
                </div>
                {selectedEvent.type === 'finding' && (
                  <div>
                    <span className={`inline-block font-mono text-[8px] text-white px-1 rounded mr-1 ${sevColor(selectedEvent.data.severity)}`}>
                      {selectedEvent.data.severity}
                    </span>
                    <span className="text-[11px] text-zinc-200">{selectedEvent.data.title}</span>
                    {selectedEvent.data.module && (
                      <div className="font-mono text-[9px] text-zinc-500 mt-0.5">{selectedEvent.data.module}</div>
                    )}
                  </div>
                )}
                {selectedEvent.type === 'app_log' && (
                  <div>
                    <span className={`inline-block font-mono text-[8px] text-white px-1 rounded mr-1 ${
                      selectedEvent.data.severity === 'error' ? 'bg-red-500' : 'bg-amber-400 text-black'
                    }`}>
                      {selectedEvent.data.severity}
                    </span>
                    <span className="text-[11px] text-zinc-200 break-all">{selectedEvent.data.text}</span>
                  </div>
                )}
                {selectedEvent.type === 'navigation' && (
                  <div className="font-mono text-[10px] text-zinc-300 break-all">{selectedEvent.data.url}</div>
                )}
                {selectedEvent.type === 'session' && (
                  <div className="text-[10px] text-zinc-300 break-all">{selectedEvent.data.text}</div>
                )}
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="shrink-0 font-mono text-[9px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {'\u2715'}
              </button>
            </div>
          </div>
        )}

        {/* Hovered event tooltip */}
        {hoveredEvent && !selectedEvent && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-elevated border border-border rounded-lg px-3 py-2 shadow-xl max-w-sm z-10">
            <div className="mb-0.5 flex items-center gap-2 font-mono text-[9px] text-zinc-400">
              <span>{formatTime(hoveredEvent.ts)} — {hoveredEvent.type}</span>
              {hoveredEvent.viewport !== 'shared' && (
                <span className={`rounded px-1 py-0.5 ${
                  hoveredEvent.viewport === 'mobile'
                    ? 'bg-amber-300/15 text-amber-200'
                    : hoveredEvent.viewport === 'tablet'
                    ? 'bg-purple-400/15 text-purple-200'
                    : 'bg-blue-400/15 text-blue-200'
                }`}>
                  {viewportLabel(hoveredEvent.viewport)}
                </span>
              )}
            </div>
            {hoveredEvent.type === 'finding' && (
              <div>
                <span className={`inline-block font-mono text-[8px] text-white px-1 rounded mr-1 ${sevColor(hoveredEvent.data.severity)}`}>
                  {hoveredEvent.data.severity}
                </span>
                <span className="text-[11px] text-zinc-200">{hoveredEvent.data.title}</span>
                {hoveredEvent.data.module && (
                  <div className="font-mono text-[9px] text-zinc-500 mt-0.5">{hoveredEvent.data.module}</div>
                )}
              </div>
            )}
            {hoveredEvent.type === 'navigation' && (
              <div className="font-mono text-[10px] text-zinc-300 break-all">{hoveredEvent.data.url}</div>
            )}
            {hoveredEvent.type === 'session' && (
              <div className="text-[10px] text-zinc-300">{hoveredEvent.data.text}</div>
            )}
            {hoveredEvent.type === 'app_log' && (
              <div>
                <span className={`inline-block font-mono text-[8px] text-white px-1 rounded mr-1 ${
                  hoveredEvent.data.severity === 'error' ? 'bg-red-500' : 'bg-amber-400 text-black'
                }`}>
                  {hoveredEvent.data.severity}
                </span>
                <span className="text-[10px] text-zinc-300">{hoveredEvent.data.text}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls + Timeline */}
      <div className="shrink-0 border-t border-border bg-card/30 max-h-[45%] flex flex-col overflow-hidden">
        {/* Transport controls */}
        <div className="px-3 py-2 flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="font-mono text-sm text-zinc-300 hover:text-white transition-colors w-6 text-center"
          >
            {playing ? '\u23f8' : '\u25b6'}
          </button>
          <span className="font-mono text-[10px] text-zinc-400 w-20">
            {formatTime(currentTs)} / {formatTime(durationMs)}
          </span>
          <span className="font-mono text-[9px] text-zinc-600">
            {currentIndex + 1}/{frames.length}
          </span>

          {/* Live follow toggle */}
          {isLive && (
            <button
              onClick={() => {
                setFollowLive(true);
                setCurrentIndex(frames.length - 1);
              }}
              className={`font-mono text-[9px] px-2 py-0.5 rounded transition-colors ${
                followLive
                  ? 'text-red-400 bg-red-400/10'
                  : 'text-zinc-500 hover:text-zinc-300 bg-white/[0.03]'
              }`}
            >
              {followLive ? 'Following' : 'Follow live'}
            </button>
          )}

          {/* Speed control */}
          <div className="flex items-center gap-1 ml-auto">
            {[0.5, 1, 2, 4].map(speed => (
              <button
                key={speed}
                onClick={() => setPlaybackSpeed(speed)}
                className={`font-mono text-[9px] px-1.5 py-0.5 rounded transition-colors ${
                  playbackSpeed === speed
                    ? 'text-accent bg-accent/10'
                    : 'text-zinc-600 hover:text-zinc-400'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        {/* Timeline bar */}
        <div
          ref={timelineRef}
          className="relative h-6 mx-3 mb-1 cursor-pointer group"
          onClick={handleTimelineClick}
        >
          {/* Track background */}
          <div className="absolute inset-x-0 top-2 h-2 bg-zinc-800 rounded-full overflow-hidden">
            {viewportSections.map((section, index) => {
              if (section.viewport === 'shared') return null;
              const left = durationMs > 0 ? (section.startTs / durationMs) * 100 : 0;
              const width = durationMs > 0
                ? Math.max(1.5, ((Math.max(section.endTs, section.startTs) - section.startTs) / durationMs) * 100)
                : 0;
              return (
                <div
                  key={`${section.viewport}-${section.startTs}-${index}`}
                  className={`absolute inset-y-0 ${
                    section.viewport === 'mobile' ? 'bg-amber-300/15' : section.viewport === 'tablet' ? 'bg-purple-400/15' : 'bg-blue-400/15'
                  }`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              );
            })}
            {/* Progress fill */}
            <div
              className="h-full bg-accent/40 transition-[width] duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Playhead */}
          <div
            className="absolute top-0.5 w-1 h-5 bg-accent rounded-full -translate-x-1/2 transition-[left] duration-100 shadow-lg shadow-accent/20"
            style={{ left: `${progress}%` }}
          />

          {/* Finding markers (red triangles) */}
          {findingMarkers.map((marker, i) => (
            <div
              key={`f-${i}`}
              className="absolute top-0 -translate-x-1/2 cursor-pointer z-10"
              style={{ left: `${marker.position}%` }}
              onMouseEnter={() => setHoveredEvent(marker)}
              onMouseLeave={() => setHoveredEvent(null)}
              onClick={(e) => {
                e.stopPropagation();
                jumpToTimestamp(marker.ts, { keepSelection: true });
                setSelectedEvent(marker);
              }}
            >
              <div className={`w-2 h-2 rotate-45 ${sevColor(marker.data.severity)} shadow-sm`} />
            </div>
          ))}

          {/* Navigation markers (small blue dots) */}
          {navMarkers.map((marker, i) => (
            <div
              key={`n-${i}`}
              className="absolute top-[11px] -translate-x-1/2"
              style={{ left: `${marker.position}%` }}
              onMouseEnter={() => setHoveredEvent(marker)}
              onMouseLeave={() => setHoveredEvent(null)}
            >
              <div className="w-1 h-1 rounded-full bg-blue-400/60" />
            </div>
          ))}

          {/* App log warning/error markers */}
          {appLogMarkers.map((marker, i) => (
            <div
              key={`a-${i}`}
              className="absolute top-[9px] -translate-x-1/2 cursor-pointer z-10"
              style={{ left: `${marker.position}%` }}
              onMouseEnter={() => setHoveredEvent(marker)}
              onMouseLeave={() => setHoveredEvent(null)}
              onClick={(e) => {
                e.stopPropagation();
                jumpToTimestamp(marker.ts, { keepSelection: true });
                setSelectedEvent(marker);
              }}
            >
              <div className={`h-3 w-[3px] rounded-full ${
                marker.data.severity === 'error' ? 'bg-red-400/90' : 'bg-amber-300/90'
              }`} />
            </div>
          ))}
        </div>

        {['desktop', 'tablet', 'mobile', 'shared'].some((viewport) => {
          const summary = viewportSummary[viewport];
          return summary.findings.length > 0 || summary.appLogs.length > 0;
        }) && (
          <div className="space-y-2 px-3 pb-3 overflow-y-auto min-h-0">
            {['desktop', 'tablet', 'mobile', 'shared'].map((viewport) => {
              const summary = viewportSummary[viewport];
              if (summary.findings.length === 0 && summary.appLogs.length === 0) return null;

              return (
                <div key={viewport} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${
                      viewport === 'mobile'
                        ? 'bg-amber-300'
                        : viewport === 'tablet'
                          ? 'bg-purple-400'
                          : viewport === 'desktop'
                            ? 'bg-blue-400'
                            : 'bg-zinc-500'
                    }`} />
                    <span className="font-mono text-[10px] uppercase tracking-[1px] text-zinc-500">
                      {viewportLabel(viewport)}
                    </span>
                    <span className="font-mono text-[9px] text-zinc-600">
                      {summary.findings.length} finding{summary.findings.length !== 1 ? 's' : ''} · {summary.appLogs.length} log event{summary.appLogs.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {summary.findings.map((marker, index) => (
                      <button
                        key={`finding-${viewport}-${marker.data.id || index}-${marker.ts}`}
                        onClick={() => {
                          jumpToTimestamp(marker.ts, { keepSelection: true });
                          setSelectedEvent(selectedEvent?.ts === marker.ts && selectedEvent?.type === marker.type ? null : marker);
                        }}
                        className={`flex items-center gap-1.5 rounded border px-2 py-1 transition-colors group ${
                          selectedEvent?.ts === marker.ts && selectedEvent?.type === marker.type
                            ? 'bg-accent/10 border-accent/30'
                            : jumpToFindingId && marker.data.id === jumpToFindingId
                              ? 'bg-accent/10 border-accent/30'
                              : 'bg-white/[0.03] border-border hover:bg-white/[0.06]'
                        }`}
                        title={`${viewportLabel(viewport)} finding — click to see details`}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-sm ${sevColor(marker.data.severity)}`} />
                        <span className="font-mono text-[8px] text-zinc-500 shrink-0">{formatTime(marker.ts)}</span>
                        <span className="font-mono text-[9px] text-zinc-400 group-hover:text-zinc-200 truncate max-w-[220px]">
                          {marker.data.id}: {marker.data.title}
                        </span>
                      </button>
                    ))}

                    {summary.appLogs.slice(-8).map((marker, index) => (
                      <button
                        key={`log-${viewport}-${index}-${marker.ts}`}
                        onClick={() => {
                          jumpToTimestamp(marker.ts, { keepSelection: true });
                          setSelectedEvent(selectedEvent?.ts === marker.ts && selectedEvent?.type === marker.type ? null : marker);
                        }}
                        className={`flex items-center gap-1.5 rounded border px-2 py-1 transition-colors group ${
                          selectedEvent?.ts === marker.ts && selectedEvent?.type === marker.type
                            ? 'bg-red-400/10 border-red-400/30'
                            : 'border-border bg-white/[0.03] hover:bg-white/[0.06]'
                        }`}
                        title={`Click to see full details`}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-sm ${
                          marker.data.severity === 'error' ? 'bg-red-400' : 'bg-amber-300'
                        }`} />
                        <span className="font-mono text-[8px] text-zinc-500 shrink-0">{formatTime(marker.ts)}</span>
                        <span className="font-mono text-[9px] text-zinc-400 group-hover:text-zinc-200 truncate max-w-[280px]">
                          {marker.data.text}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
