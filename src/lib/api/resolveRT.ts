import {type Client} from '@atproto/lex'
import {RichText} from '@bsky/sdk/richtext'

import {shortenLinks, stripInvalidMentions} from '#/lib/strings/rich-text-manip'

/**
 * Trims the text and resolves its facets (mentions, links, tags) the way a
 * published post needs them. Shared with editing so an edited post is
 * formatted exactly like a new one.
 */
export async function resolveRT(appviewClient: Client, richtext: RichText) {
  const trimmedText = richtext.text
    // Trim leading whitespace-only lines (but don't break ASCII art).
    .replace(/^(\s*\n)+/, '')
    // Trim any trailing whitespace.
    .trimEnd()
  let rt = new RichText({text: trimmedText}, {cleanNewlines: true})
  await rt.detectFacets(appviewClient)

  rt = shortenLinks(rt)
  rt = stripInvalidMentions(rt)
  return rt
}
