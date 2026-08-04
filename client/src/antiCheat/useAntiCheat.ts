/**
 * useAntiCheat — Dedicated Anti-Cheat Detection Hook
 *
 * This module consolidates ALL anti-cheat detection logic that was previously
 * inline in PlayPage.tsx. Centralizing here gives us:
 *  - A single 5s cooldown per violation type (prevents duplicate flagging)
 *  - Devtools size-diff detection
 *  - BroadcastChannel multi-tab detection
 *  - Unified server call path (pusherApi.trigger) with a retry guard
 *
 * Usage:
 *   useAntiCheat({ sessionId, participantId, participantName, isActive })
 *
 * Only runs when `isActive` is true (session status === 'active').
 */

import { useEffect, useRef } from 'react';
import { pusherApi } from '../api/client';

interface UseAntiCheatOptions {
  sessionId: string | undefined;
  participantId: string | null;
  participantName: string;
  /** Only detect and report violations when the quiz is actively running */
  isActive: boolean;
}

// Minimum milliseconds between reports of the same violation type
const VIOLATION_COOLDOWN_MS = 5000;

export function useAntiCheat({
  sessionId,
  participantId,
  participantName,
  isActive,
}: UseAntiCheatOptions): void {
  // Track last-reported timestamp per violation type to debounce duplicates
  const lastReportedRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!isActive || !sessionId || !participantId) return;

    // ── Violation reporter ─────────────────────────────────────────────────────
    const triggerViolation = async (type: string) => {
      const now = Date.now();
      const last = lastReportedRef.current[type] || 0;
      if (now - last < VIOLATION_COOLDOWN_MS) return; // cooldown guard
      lastReportedRef.current[type] = now;

      try {
        await pusherApi.trigger(`session-${sessionId}`, 'anti_cheat_violation', {
          studentName: participantName,
          studentId: participantId,
          violationType: type,
          timestamp: new Date().toISOString(),
        });
      } catch {
        /* silent — never crash the quiz because of a failed violation report */
      }
    };

    // ── Detectors ──────────────────────────────────────────────────────────────

    // 1. Tab hidden / app backgrounded
    const onVisibilityChange = () => {
      if (document.hidden) void triggerViolation('Tab Hidden / App Backgrounded');
    };

    // 2. Page unload / refresh
    const onPageLeave = () => void triggerViolation('Page Refresh / Leave');

    // 3. Window blur (devtools, alt-tab, etc.) — debounced 500ms to skip mobile keyboard events
    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    const onWindowBlur = () => {
      if (blurTimer !== null) return;
      blurTimer = setTimeout(() => {
        blurTimer = null;
        if (!document.hidden) {
          const activeTag = document.activeElement?.tagName?.toLowerCase();
          if (activeTag !== 'input' && activeTag !== 'textarea' && activeTag !== 'select') {
            void triggerViolation('Window Lost Focus');
          }
        }
      }, 500);
    };
    const onWindowFocus = () => {
      if (blurTimer !== null) { clearTimeout(blurTimer); blurTimer = null; }
    };

    // 4. Right-click context menu
    const onContextMenu = (e: Event) => {
      e.preventDefault();
      void triggerViolation('Right-Click Context Menu');
    };

    // 5. Keyboard shortcuts (DevTools, screenshots, view-source)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        void triggerViolation('Screenshot Attempt (PrintScreen)');
        return;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      const blocked =
        (ctrl && ['u', 's', 'p'].includes(e.key.toLowerCase())) ||
        e.key === 'F12' ||
        (ctrl && e.shiftKey && ['i', 'j', 'c', 'k'].includes(e.key.toLowerCase()));
      if (blocked) {
        e.preventDefault();
        void triggerViolation(`Blocked Shortcut: ${e.key}`);
      }
    };

    // 6. App freeze / background (iOS PWA)
    const onFreeze = () => void triggerViolation('App Frozen / Backgrounded');

    // 7. DevTools size detection — runs every 2 seconds
    // Compares window outer vs inner dimensions; a large gap means devtools are open.
    const DEVTOOLS_THRESHOLD = 160;
    let devtoolsOpen = false;
    const devtoolsInterval = setInterval(() => {
      // Skip size detection on mobile/touch devices where DevTools aren't natively resizable windows
      const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.matchMedia('(pointer: coarse)').matches;
      if (isMobile) return;

      const widthOpen = window.outerWidth > 0 && window.outerWidth - window.innerWidth > DEVTOOLS_THRESHOLD;
      const heightOpen = window.outerHeight > 0 && window.outerHeight - window.innerHeight > DEVTOOLS_THRESHOLD;
      const nowOpen = widthOpen || heightOpen;
      if (nowOpen && !devtoolsOpen) {
        devtoolsOpen = true;
        void triggerViolation('DevTools Opened (size detection)');
      } else if (!nowOpen) {
        devtoolsOpen = false;
      }
    }, 2000);

    // 8. Multi-tab detection via BroadcastChannel
    // If two tabs have the same session open, the second one notifies the first.
    let broadcastChannel: BroadcastChannel | null = null;
    try {
      broadcastChannel = new BroadcastChannel(`anticheat-${sessionId}-${participantId}`);
      broadcastChannel.postMessage('ping');
      broadcastChannel.onmessage = (e) => {
        if (e.data === 'ping') {
          // Another tab pinged us — they are a duplicate
          broadcastChannel?.postMessage('duplicate');
          void triggerViolation('Multi-Tab Detected');
        } else if (e.data === 'duplicate') {
          // We are the duplicate tab
          void triggerViolation('Multi-Tab Detected (this tab is duplicate)');
        }
      };
    } catch {
      /* BroadcastChannel not supported in this environment */
    }

    // ── Register listeners ─────────────────────────────────────────────────────
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageLeave);
    window.addEventListener('beforeunload', onPageLeave);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('freeze' as any, onFreeze as any);

    return () => {
      if (blurTimer !== null) clearTimeout(blurTimer);
      clearInterval(devtoolsInterval);
      broadcastChannel?.close();

      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageLeave);
      window.removeEventListener('beforeunload', onPageLeave);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('focus', onWindowFocus);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('freeze' as any, onFreeze as any);
    };
  }, [isActive, sessionId, participantId, participantName]);
}
