import { describe, expect, it } from 'vitest';
import { conversationMessages } from '../src/lib/admin/aetherConversation';
const turn = { user: 'Earlier question', answer: 'Earlier answer' };
describe('ephemeral sandbox conversation bounds', () => {
  it('includes prior pairs before the current prompt and optional system context', () => { expect(conversationMessages([turn], 'System context', 'Next question', {maxMessages:12,maxInputCharacters:16000}).messages).toEqual([{role:'system',content:'System context'},{role:'user',content:'Earlier question'},{role:'assistant',content:'Earlier answer'},{role:'user',content:'Next question'}]); });
  it('drops oldest complete pairs for peer message and character budgets', () => { const result=conversationMessages([turn,{user:'Recent',answer:'Answer'}],'','Next',{maxMessages:3,maxInputCharacters:20}); expect(result.droppedPairs).toBe(1); expect(result.messages).toEqual([{role:'user',content:'Recent'},{role:'assistant',content:'Answer'},{role:'user',content:'Next'}]); });
  it('shortens only previous answer context, keeping source answers intact', () => { const original={user:'Question',answer:'x'.repeat(5000)}; const result=conversationMessages([original],'','Next',{maxMessages:12,maxInputCharacters:16000}); expect(result.truncatedAnswers).toBe(1); expect(result.messages[1].content.length).toBe(4000); expect(original.answer.length).toBe(5000); });
  it('rejects current input that cannot fit rather than silently changing it', () => { expect(()=>conversationMessages([],'System','Question',{maxMessages:1,maxInputCharacters:16000})).toThrow(); expect(()=>conversationMessages([],'','Question',{maxMessages:12,maxInputCharacters:2})).toThrow(); });
});
