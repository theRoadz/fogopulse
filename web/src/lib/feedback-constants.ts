/**
 * Feedback rate-limiting constants — server-side only.
 * Do NOT import in 'use client' components.
 */

/** Max issues per wallet per hour (configurable via env) */
export const FEEDBACK_RATE_LIMIT = Number(process.env.FEEDBACK_RATE_LIMIT) || 5
/** Max replies per wallet per hour */
export const FEEDBACK_REPLY_RATE_LIMIT = 20
