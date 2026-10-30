import {canEditPost, EDIT_WINDOW_MS, getEditDeadline} from './util'

const AUTHOR = 'did:plc:author'
const OTHER = 'did:plc:other'
const CREATED_AT = '2026-10-30T12:00:00.000Z'
const CREATED_MS = new Date(CREATED_AT).getTime()

describe('getEditDeadline', () => {
  it('is five minutes after createdAt', () => {
    expect(getEditDeadline({createdAt: CREATED_AT})?.getTime()).toBe(
      CREATED_MS + EDIT_WINDOW_MS,
    )
  })

  it('is undefined for an unparseable createdAt', () => {
    expect(getEditDeadline({createdAt: 'not a date'})).toBeUndefined()
  })
})

describe('canEditPost', () => {
  const base = {authorDid: AUTHOR, record: {createdAt: CREATED_AT}}

  it('allows the author inside the window', () => {
    expect(
      canEditPost({...base, viewerDid: AUTHOR, now: CREATED_MS + 60_000}),
    ).toBe(true)
  })

  it('rejects other accounts', () => {
    expect(
      canEditPost({...base, viewerDid: OTHER, now: CREATED_MS + 60_000}),
    ).toBe(false)
  })

  it('rejects logged-out viewers', () => {
    expect(
      canEditPost({...base, viewerDid: undefined, now: CREATED_MS + 60_000}),
    ).toBe(false)
  })

  it('rejects once the window has passed', () => {
    expect(
      canEditPost({
        ...base,
        viewerDid: AUTHOR,
        now: CREATED_MS + EDIT_WINDOW_MS,
      }),
    ).toBe(false)
  })

  it('rejects a createdAt in the future', () => {
    expect(
      canEditPost({...base, viewerDid: AUTHOR, now: CREATED_MS - 60_000}),
    ).toBe(false)
  })
})
