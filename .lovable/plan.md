Update the rejected-image footer in both Normal and Preview Once image flows.

1. In `src/components/novachat/messages/NormalImageMessage.tsx`:
   - Change the rejected label from `❌ Image Rejected` to `❌ Rejected`.
   - Move the time to the left side and the rejected label to the right side.

2. In `src/components/novachat/messages/PreviewOnceMessage.tsx`:
   - Apply the same label and position swap.

3. Run typecheck/build to confirm no regressions.

No layout, blur, or container changes — only the footer text and alignment swap.