import {type Client} from '@atproto/lex'
import {AtUri} from '@atproto/syntax'
import {RichText} from '@bsky/sdk/richtext'
import {useMutation, useQueryClient} from '@tanstack/react-query'

import {resolveRT} from '#/lib/api/resolveRT'
import {MAX_GRAPHEME_LENGTH} from '#/lib/constants'
import {matchXrpcError} from '#/lib/xrpc-error'
import {updatePostShadow} from '#/state/cache/post-shadow'
import {useAppviewClient, usePdsClient} from '#/state/session'
import {app, com} from '#/lexicons'
import * as bsky from '#/types/bsky'
import {canEditPost} from './util'

/** The edit window closed between opening the editor and saving. */
export class EditWindowClosedError extends Error {}

/**
 * The record changed after the editor loaded it, e.g. it was edited from
 * another device, so saving would overwrite changes the author hasn't seen.
 */
export class PostChangedError extends Error {}

/** The edited post would have no text and nothing else to show. */
export class EmptyPostError extends Error {}

/** The edited text is over the post length limit. */
export class PostTooLongError extends Error {}

/**
 * Rewrites the text of one of the viewer's own posts.
 *
 * Only `text` and `facets` change. Everything else on the record - createdAt,
 * reply refs, embeds, langs, labels - is carried over from the copy on the
 * PDS, so an edit can't turn a post into a different kind of post.
 *
 * The write uses `swapRecord` with the CID that was read, so it fails instead
 * of silently overwriting if the post changed in the meantime.
 */
export async function editPostRecord({
  pdsClient,
  appviewClient,
  uri,
  text,
  now = Date.now(),
}: {
  pdsClient: Client
  appviewClient: Client
  uri: string
  text: string
  now?: number
}) {
  const urip = new AtUri(uri)
  const repo = pdsClient.assertDid

  const current = await pdsClient.call(com.atproto.repo.getRecord, {
    repo,
    collection: 'app.bsky.feed.post',
    rkey: urip.rkeySafe,
  })
  if (!bsky.isType(app.bsky.feed.post, current.value) || !current.cid) {
    throw new Error('Record is not a post')
  }
  const prev = current.value

  if (
    !canEditPost({authorDid: urip.host, viewerDid: repo, record: prev, now})
  ) {
    throw new EditWindowClosedError()
  }

  const rt = await resolveRT(appviewClient, new RichText({text}))
  if (rt.graphemeLength > MAX_GRAPHEME_LENGTH) {
    throw new PostTooLongError()
  }
  if (!rt.text && !prev.embed) {
    throw new EmptyPostError()
  }

  const {facets: _prevFacets, ...rest} = prev
  const next: app.bsky.feed.post.Main = {
    ...rest,
    $type: 'app.bsky.feed.post',
    text: rt.text,
    ...(rt.facets?.length ? {facets: rt.facets} : {}),
  }

  try {
    const res = await pdsClient.call(com.atproto.repo.putRecord, {
      repo,
      collection: 'app.bsky.feed.post',
      rkey: urip.rkeySafe,
      record: next,
      swapRecord: current.cid,
      validate: true,
    })
    return {record: next, cid: res.cid}
  } catch (e) {
    if (matchXrpcError(e, com.atproto.repo.putRecord) === 'InvalidSwap') {
      throw new PostChangedError()
    }
    throw e
  }
}

export function useEditPostMutation() {
  const pdsClient = usePdsClient()
  const appviewClient = useAppviewClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({uri, text}: {uri: string; text: string}) =>
      editPostRecord({pdsClient, appviewClient, uri, text}),
    onSuccess({record, cid}, {uri}) {
      updatePostShadow(queryClient, uri, {
        editedRecord: record,
        editedCid: cid,
      })
    },
  })
}
