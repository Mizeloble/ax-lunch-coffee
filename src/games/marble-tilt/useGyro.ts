'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Tunable client-side knobs.

/** Tilt angle (degrees) that maps to full-scale ±1 force. 20° is reachable with
 *  a quick wrist flick — at 30° users were tilting their whole forearm and
 *  rarely hitting full scale, which made tilt feel weak. */
const MAX_TILT_DEG = 20;
/** Sensor noise floor (degrees). Within this much of the tare zero, treat the
 *  tilt as exactly 0 — otherwise the phone's natural ±1° accelerometer noise
 *  silently drifts the marble even when you think you're holding still. */
const SENSOR_DEADZONE_DEG = 1.0;
/** Outgoing tilt rate cap (Hz). Server applies whatever the latest value is, so pushing
 *  much higher just wastes packets without smoother control. */
const EMIT_HZ = 20;
/** Skip emit when |Δx| from the last sent value is below this — keeps idle phones quiet. */
const DEADZONE = 0.02;

const EMIT_INTERVAL_MS = 1000 / EMIT_HZ;

export type GyroState = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported';

type DeviceOrientationEventStatic = typeof DeviceOrientationEvent & {
  // iOS 13+ Safari: requires a user-gesture-triggered permission grant.
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

// Permission state is page-global: a grant made through any hook instance (the
// lobby gate, the main renderer's auto-request) applies to every other instance
// (e.g. the PermissionPip badge, which never requests itself). Per-instance
// useState would leave the badge stuck on 'idle' after the real grant, so the
// state lives at module scope and instances subscribe to it.
let sharedGyroState: GyroState = 'idle';
const gyroStateListeners = new Set<(s: GyroState) => void>();
function setSharedGyroState(s: GyroState) {
  sharedGyroState = s;
  for (const l of gyroStateListeners) l(s);
}

/**
 * Subscribe to deviceorientation events and emit a normalized X-axis tilt value
 * via the supplied callback while `active` is true.
 *
 *  - On iOS Safari, `requestPermission()` must be called from a user gesture
 *    (button tap). The hook starts in `idle` and waits for a manual call.
 *  - On Android Chrome / desktop browsers that expose `deviceorientation`
 *    without permission, `requestPermission()` immediately flips to `granted`
 *    so the same UI flow works on both platforms.
 *  - "Tare" (zero) point is captured on the first event after the hook
 *    activates. Call `tare()` to force a re-capture (e.g. just before a round
 *    starts so the user's adjusted grip becomes the new neutral).
 */
export function useGyro(opts: {
  active: boolean;
  onTilt: (x: number) => void;
}): { state: GyroState; requestPermission: () => void; tare: () => void } {
  const { active, onTilt } = opts;
  const [state, setState] = useState<GyroState>(sharedGyroState);

  // Stay in sync with the page-global permission state (see module scope above).
  useEffect(() => {
    const listener = (s: GyroState) => setState(s);
    gyroStateListeners.add(listener);
    setState(sharedGyroState);
    return () => {
      gyroStateListeners.delete(listener);
    };
  }, []);

  const onTiltRef = useRef(onTilt);
  onTiltRef.current = onTilt;
  const activeRef = useRef(active);
  activeRef.current = active;

  const gamma0Ref = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);
  const lastEmitTsRef = useRef<number>(0);

  // Detect support / iOS-permission requirement once on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('DeviceOrientationEvent' in window)) {
      setSharedGyroState('unsupported');
      return;
    }
    const ctor = window.DeviceOrientationEvent as DeviceOrientationEventStatic;
    if (typeof ctor.requestPermission !== 'function') {
      // Android & permissive browsers — the listener will start firing as soon
      // as we attach it, no permission gate. Stay in `idle` until the user taps
      // the enable button so the UX is consistent across platforms (one tap
      // either way), then auto-grant on `requestPermission()`.
      // (Some browsers gate orientation behind https — surfaced as silent no-events.)
    }
  }, []);

  const requestPermission = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (sharedGyroState === 'granted' || sharedGyroState === 'unsupported') return;
    if (!('DeviceOrientationEvent' in window)) {
      setSharedGyroState('unsupported');
      return;
    }
    const ctor = window.DeviceOrientationEvent as DeviceOrientationEventStatic;
    if (typeof ctor.requestPermission === 'function') {
      setSharedGyroState('requesting');
      ctor
        .requestPermission()
        .then((res) => {
          setSharedGyroState(res === 'granted' ? 'granted' : 'denied');
        })
        .catch(() => setSharedGyroState('denied'));
    } else {
      setSharedGyroState('granted');
    }
  }, []);

  // Attach the listener once we're granted; tare on the first event after the
  // round goes active.
  useEffect(() => {
    if (state !== 'granted') return;
    if (typeof window === 'undefined') return;

    const handler = (event: DeviceOrientationEvent) => {
      if (!activeRef.current) return;
      const gamma = event.gamma; // ±90°, left-right roll. May be null if sensor isn't ready.
      if (gamma == null) return;

      if (gamma0Ref.current == null) {
        gamma0Ref.current = gamma;
      }
      const dGamma = gamma - gamma0Ref.current;
      // Sensor deadzone: phones jitter ±1° even at rest. Without this the
      // marble drifts to whichever side the noise leans on average.
      let x: number;
      if (Math.abs(dGamma) < SENSOR_DEADZONE_DEG) {
        x = 0;
      } else {
        // Map [DEADZONE_DEG, MAX_TILT_DEG] → [0, 1] preserving sign so just-past-deadzone
        // tilts feel like a tiny push rather than jumping straight to 5% deflection.
        const sign = dGamma >= 0 ? 1 : -1;
        const range = MAX_TILT_DEG - SENSOR_DEADZONE_DEG;
        const mag = Math.min(1, (Math.abs(dGamma) - SENSOR_DEADZONE_DEG) / range);
        x = sign * mag;
      }

      const now = Date.now();
      if (now - lastEmitTsRef.current < EMIT_INTERVAL_MS) return;
      // Skip-emit only when both old and new are exactly zero — otherwise we'd
      // never send a final zero after stopping, and the server's stale-decay
      // would take 250 ms to kick in.
      if (lastSentRef.current === 0 && x === 0) return;

      lastEmitTsRef.current = now;
      lastSentRef.current = x;
      onTiltRef.current(x);
    };

    window.addEventListener('deviceorientation', handler);
    return () => {
      window.removeEventListener('deviceorientation', handler);
    };
  }, [state]);

  // Reset tare whenever `active` flips off → on, so each round starts neutral
  // even if the phone has drifted between rounds.
  useEffect(() => {
    if (active) {
      gamma0Ref.current = null;
      lastSentRef.current = 0;
      lastEmitTsRef.current = 0;
    }
  }, [active]);

  // Force a re-tare on the next event. Useful right before a round starts so
  // the user's just-adjusted grip becomes the new neutral, instead of whatever
  // pose they had when the renderer first mounted during countdown.
  const tare = useCallback(() => {
    gamma0Ref.current = null;
    lastSentRef.current = 0;
  }, []);

  return { state, requestPermission, tare };
}
