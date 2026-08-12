// Local-first SPA: dynamic per-agent routes (/bench/[agentId], /play/[agentId], WP5/WP6)
// can't be prerendered, so the whole app renders client-side against the static build.
export const ssr = false;
