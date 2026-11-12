import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  readLastLocation,
  rememberLastLocation,
  restoreTarget,
} from "../lib/lastLocation";

/**
 * Reopens the screen the account last used, once per launch, and then keeps the
 * remembered location current. The launch target is decided on the first render
 * and the one-shot guard lives in a ref, so clicking "All notes" later never
 * bounces back to the restored note.
 */
export function useLastLocation(userId: string): void {
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname, search } = location;
  const [launch] = useState(() => ({
    target: restoreTarget(location, readLastLocation(userId)),
    from: pathname + search,
  }));
  const restored = useRef(false);
  const pending = useRef(launch.target !== null);

  // React Router 7 defers navigations through a transition, so a layout effect
  // scheduled during the first mount is dropped; the ordinary effect applies.
  useEffect(() => {
    if (!launch.target || restored.current) return;
    restored.current = true;
    navigate(
      { pathname: launch.target.pathname, search: launch.target.search },
      { replace: true }
    );
  }, [launch, navigate]);

  useEffect(() => {
    // The launch URL only counts once the restored screen has replaced it.
    if (pending.current && pathname + search !== launch.from) {
      pending.current = false;
    }
    if (pending.current) return;
    rememberLastLocation(userId, { pathname, search });
  }, [launch.from, pathname, search, userId]);
}
