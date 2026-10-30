/**
 * How long after posting the author can still edit. Short on purpose: it
 * covers typos noticed right after posting, without letting a post change
 * after it has spread.
 */
export const EDIT_WINDOW_MS = 5 * 60 * 1000

/**
 * The time after which the post can no longer be edited, or undefined if the
 * record has no usable `createdAt`.
 */
export function getEditDeadline(record: {createdAt: string}): Date | undefined {
  const createdAt = new Date(record.createdAt).getTime()
  if (Number.isNaN(createdAt)) return undefined
  return new Date(createdAt + EDIT_WINDOW_MS)
}

/**
 * Whether the viewer can edit this post right now: only their own posts, and
 * only within {@link EDIT_WINDOW_MS} of posting.
 *
 * `createdAt` is set by the client that wrote the post, so a timestamp in the
 * future is treated as not editable rather than editable for longer.
 */
export function canEditPost({
  authorDid,
  viewerDid,
  record,
  now = Date.now(),
}: {
  authorDid: string
  viewerDid: string | undefined
  record: {createdAt: string}
  now?: number
}): boolean {
  if (!viewerDid || authorDid !== viewerDid) return false
  const deadline = getEditDeadline(record)
  if (!deadline) return false
  const createdAt = deadline.getTime() - EDIT_WINDOW_MS
  return createdAt <= now && now < deadline.getTime()
}
