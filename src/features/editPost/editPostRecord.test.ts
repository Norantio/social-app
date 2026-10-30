import {type Client, XrpcResponseError} from '@atproto/lex'

import {com} from '#/lexicons'
import {
  editPostRecord,
  EditWindowClosedError,
  EmptyPostError,
  PostChangedError,
} from './useEditPostMutation'

/*
 * The hook's imports reach the post caches and session state, which pull in
 * native UI modules. Only the plain `editPostRecord` function is under test.
 */
jest.mock('#/state/cache/post-shadow', () => ({updatePostShadow: jest.fn()}))
jest.mock('#/state/session', () => ({
  useAppviewClient: jest.fn(),
  usePdsClient: jest.fn(),
}))

const DID = 'did:plc:author'
const URI = `at://${DID}/app.bsky.feed.post/3kabc123`
const CREATED_AT = '2026-10-30T12:00:00.000Z'
const ONE_MINUTE_LATER = new Date(CREATED_AT).getTime() + 60_000

const ORIGINAL = {
  $type: 'app.bsky.feed.post',
  text: 'helo world',
  createdAt: CREATED_AT,
  langs: ['en'],
  reply: {
    root: {uri: `at://${DID}/app.bsky.feed.post/root`, cid: 'bafyroot'},
    parent: {uri: `at://${DID}/app.bsky.feed.post/root`, cid: 'bafyroot'},
  },
  embed: {
    $type: 'app.bsky.embed.external',
    external: {uri: 'https://example.com', title: 'Example', description: ''},
  },
}

/** The parts of a putRecord call the tests look at. */
type PutParams = {
  record: Record<string, unknown>
  swapRecord?: string
  validate?: boolean
}

/**
 * A stand-in PDS that answers getRecord with `record` and putRecord with
 * `putResult`, recording what was written.
 */
function fakePds({
  record = ORIGINAL,
  putResult,
}: {
  record?: Record<string, unknown>
  putResult?: () => Promise<unknown>
} = {}) {
  const puts: PutParams[] = []
  const client = {
    assertDid: DID,
    call: jest.fn(async (method: unknown, params: PutParams) => {
      if (method === com.atproto.repo.getRecord) {
        return {uri: URI, cid: 'bafyoriginal', value: record}
      }
      if (method === com.atproto.repo.putRecord) {
        puts.push(params)
        return putResult ? putResult() : {uri: URI, cid: 'bafyedited'}
      }
      throw new Error('unexpected call')
    }),
  }
  return {client: client as unknown as Client, puts}
}

const appviewClient = {} as Client

describe('editPostRecord', () => {
  it('changes only the text and keeps the rest of the record', async () => {
    const {client, puts} = fakePds()
    const result = await editPostRecord({
      pdsClient: client,
      appviewClient,
      uri: URI,
      text: 'hello world',
      now: ONE_MINUTE_LATER,
    })

    expect(puts).toHaveLength(1)
    expect(puts[0].record).toEqual({...ORIGINAL, text: 'hello world'})
    expect(result).toEqual({
      record: {...ORIGINAL, text: 'hello world'},
      cid: 'bafyedited',
    })
  })

  it('guards the write with the CID it read', async () => {
    const {client, puts} = fakePds()
    await editPostRecord({
      pdsClient: client,
      appviewClient,
      uri: URI,
      text: 'hello world',
      now: ONE_MINUTE_LATER,
    })
    expect(puts[0].swapRecord).toBe('bafyoriginal')
    expect(puts[0].validate).toBe(true)
  })

  it('recomputes facets from the new text', async () => {
    const {client, puts} = fakePds({
      record: {
        ...ORIGINAL,
        text: 'see https://old.example',
        facets: [
          {
            index: {byteStart: 4, byteEnd: 23},
            features: [
              {
                $type: 'app.bsky.richtext.facet#link',
                uri: 'https://old.example',
              },
            ],
          },
        ],
      },
    })
    await editPostRecord({
      pdsClient: client,
      appviewClient,
      uri: URI,
      text: 'no links any more',
      now: ONE_MINUTE_LATER,
    })
    expect(puts[0].record.facets).toBeUndefined()
  })

  it('refuses once the edit window has closed', async () => {
    const {client, puts} = fakePds()
    await expect(
      editPostRecord({
        pdsClient: client,
        appviewClient,
        uri: URI,
        text: 'too late',
        now: ONE_MINUTE_LATER + 10 * 60_000,
      }),
    ).rejects.toBeInstanceOf(EditWindowClosedError)
    expect(puts).toHaveLength(0)
  })

  it('refuses to empty a post that has no embed', async () => {
    const {embed: _embed, ...noEmbed} = ORIGINAL
    const {client} = fakePds({record: noEmbed})
    await expect(
      editPostRecord({
        pdsClient: client,
        appviewClient,
        uri: URI,
        text: '   ',
        now: ONE_MINUTE_LATER,
      }),
    ).rejects.toBeInstanceOf(EmptyPostError)
  })

  it('reports a conflict when the post changed elsewhere', async () => {
    const {client} = fakePds({
      putResult: () =>
        Promise.reject(
          new XrpcResponseError(
            com.atproto.repo.putRecord.main,
            new Response(null, {status: 400}),
            {
              encoding: 'application/json',
              body: {error: 'InvalidSwap', message: 'Record was at bafyother'},
            },
          ),
        ),
    })
    await expect(
      editPostRecord({
        pdsClient: client,
        appviewClient,
        uri: URI,
        text: 'hello world',
        now: ONE_MINUTE_LATER,
      }),
    ).rejects.toBeInstanceOf(PostChangedError)
  })
})
