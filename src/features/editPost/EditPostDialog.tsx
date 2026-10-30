import {useState} from 'react'
import {View} from 'react-native'
import {RichText} from '@bsky/sdk/richtext'
import {Trans, useLingui} from '@lingui/react/macro'

import {MAX_GRAPHEME_LENGTH} from '#/lib/constants'
import {isNetworkError} from '#/lib/strings/errors'
import {shortenLinks} from '#/lib/strings/rich-text-manip'
import {logger} from '#/logger'
import {CharProgress} from '#/view/com/composer/char-progress/CharProgress'
import {atoms as a, useTheme, web} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import * as TextField from '#/components/forms/TextField'
import {Loader} from '#/components/Loader'
import * as Prompt from '#/components/Prompt'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {
  EditWindowClosedError,
  EmptyPostError,
  PostChangedError,
  PostTooLongError,
  useEditPostMutation,
} from './useEditPostMutation'

/**
 * Lets the author fix the text of a post they just published. Embeds,
 * replies and other settings stay as they are; only the text is editable.
 */
export function EditPostDialog({
  control,
  postUri,
  initialText,
}: {
  control: Dialog.DialogControlProps
  postUri: string
  initialText: string
}) {
  const {t: l} = useLingui()
  const discardControl = Prompt.usePromptControl()
  const [dirty, setDirty] = useState(false)

  const onPressCancel = () => {
    if (dirty) {
      discardControl.open()
    } else {
      control.close()
    }
  }

  return (
    <Dialog.Outer
      control={control}
      nativeOptions={{preventDismiss: dirty}}
      onClose={() => setDirty(false)}
      testID="editPostDialog">
      <Inner
        control={control}
        postUri={postUri}
        initialText={initialText}
        setDirty={setDirty}
        onPressCancel={onPressCancel}
      />
      <Prompt.Basic
        control={discardControl}
        title={l`Discard changes?`}
        description={l`Your edits to this post won’t be saved.`}
        onConfirm={() => control.close()}
        confirmButtonCta={l`Discard`}
        confirmButtonColor="negative"
      />
    </Dialog.Outer>
  )
}

function Inner({
  control,
  postUri,
  initialText,
  setDirty,
  onPressCancel,
}: {
  control: Dialog.DialogControlProps
  postUri: string
  initialText: string
  setDirty: (dirty: boolean) => void
  onPressCancel: () => void
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const [text, setText] = useState(initialText)
  const {mutate: editPost, isPending} = useEditPostMutation()

  const graphemeLength = shortenLinks(new RichText({text})).graphemeLength
  const isTooLong = graphemeLength > MAX_GRAPHEME_LENGTH
  const isUnchanged = text.trim() === initialText.trim()

  const onChangeText = (next: string) => {
    setText(next)
    setDirty(next.trim() !== initialText.trim())
  }

  const onPressSave = () => {
    editPost(
      {uri: postUri, text},
      {
        onSuccess() {
          control.close(() => {
            Toast.show(l({message: 'Post edited', context: 'toast'}))
          })
        },
        onError(e) {
          if (e instanceof EditWindowClosedError) {
            Toast.show(
              l`Posts can only be edited for 5 minutes after posting`,
              {
                type: 'error',
              },
            )
          } else if (e instanceof PostChangedError) {
            Toast.show(
              l`This post changed since you opened it. Close and try again.`,
              {type: 'error'},
            )
          } else if (e instanceof EmptyPostError) {
            Toast.show(l`Your post can’t be empty`, {type: 'error'})
          } else if (e instanceof PostTooLongError) {
            Toast.show(l`Your post is too long`, {type: 'error'})
          } else if (isNetworkError(e)) {
            Toast.show(
              l`Couldn’t save your edit. Check your connection and try again.`,
              {type: 'error'},
            )
          } else {
            logger.error('Failed to edit post', {safeMessage: e})
            Toast.show(l`Couldn’t save your edit, please try again`, {
              type: 'error',
            })
          }
        },
      },
    )
  }

  const canSave = !isUnchanged && !isTooLong && !isPending

  return (
    <Dialog.ScrollableInner
      label={l`Edit post`}
      style={[web({maxWidth: 500})]}
      contentContainerStyle={[a.px_0, a.pt_0]}
      header={
        <Dialog.Header
          renderLeft={() => (
            <Button
              label={l`Cancel`}
              onPress={onPressCancel}
              size="small"
              color="primary"
              variant="ghost"
              style={[a.rounded_full]}
              testID="editPostCancelBtn">
              <ButtonText style={[a.text_md]}>
                <Trans>Cancel</Trans>
              </ButtonText>
            </Button>
          )}
          renderRight={() => (
            <Button
              label={l`Save`}
              onPress={onPressSave}
              disabled={!canSave}
              size="small"
              color="primary"
              variant="ghost"
              style={[a.rounded_full]}
              testID="editPostSaveBtn">
              <ButtonText
                style={[a.text_md, !canSave && t.atoms.text_contrast_low]}>
                <Trans>Save</Trans>
              </ButtonText>
              {isPending && <ButtonIcon icon={Loader} />}
            </Button>
          )}>
          <Dialog.HeaderText>
            <Trans>Edit post</Trans>
          </Dialog.HeaderText>
        </Dialog.Header>
      }>
      <View style={[a.pt_lg, a.px_xl, a.gap_md]}>
        <TextField.Root isInvalid={isTooLong}>
          <Dialog.Input
            value={text}
            onChangeText={onChangeText}
            multiline
            autoFocus
            label={l`Post text`}
            testID="editPostTextInput"
          />
        </TextField.Root>
        <View style={[a.flex_row, a.align_start, a.gap_md]}>
          <Text
            style={[
              a.flex_1,
              a.text_sm,
              a.leading_snug,
              t.atoms.text_contrast_medium,
            ]}>
            <Trans>
              You can edit the text for 5 minutes after posting. Images, link
              cards and other settings stay as they are.
            </Trans>
          </Text>
          <CharProgress count={graphemeLength} />
        </View>
      </View>
    </Dialog.ScrollableInner>
  )
}
