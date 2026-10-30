# Edit post (prototype)

Lets an author fix the text of a post shortly after publishing it.

## Rules

- Only your own posts.
- Only within 5 minutes of the post's `createdAt` (`EDIT_WINDOW_MS`). The menu
  item hides after that, and saving checks again.
- Text only. Embeds (images, video, link cards, quotes), reply refs, languages,
  labels and `createdAt` are copied over unchanged from the record on the PDS.

## How it works

1. **Edit post** in the post menu (`PostMenuItems`) opens `EditPostDialog`.
2. `editPostRecord` reads the current record from the PDS, rechecks the window,
   resolves facets with the same `resolveRT` used for new posts, and writes the
   result with `com.atproto.repo.putRecord`.
3. The write passes `swapRecord` set to the CID that was read, so if the post
   changed in the meantime (e.g. edited from another device) it fails with
   `PostChangedError` instead of overwriting.
4. On success the edited record and its new CID go into the post shadow
   (`editedRecord`, `editedCid`), and every post view reads its text through
   `getShadowedPostRecord`, so the edit shows up everywhere at once.

The URI doesn't change, so likes, reposts and replies stay attached to the
post.

## What this does not do yet

These need AppView and lexicon support, not just client changes:

- An "edited" marker other people can see. `app.bsky.feed.post` has no field
  for it, and the client can't reliably tell an edited post apart from one
  whose `indexedAt` is late for other reasons.
- Edit history. Only the latest version of a record is kept and served.
- Limiting a post to a single edit, which depends on the marker above.
- Notifying people who already engaged with the original text.

Existing likes, reposts and quotes keep the CID of the version they were made
against, so how they should relate to an edited post is also an AppView
question.
