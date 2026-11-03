import assert from 'node:assert/strict';
import test from 'node:test';
import { sandboxInput, trainingInput, exampleInput } from '../src/contracts/v1/aether-playground';
test('playground contracts bound text and require explicit training intent with reviewed revisions', () => {
  assert.equal(sandboxInput.safeParse({modelId:'aether:8b',messages:[{role:'user',content:'Hello'}],maxOutputTokens:128,temperature:0.5}).success,true);
  assert.equal(sandboxInput.safeParse({modelId:'https://evil.example/model',messages:[],maxOutputTokens:128,temperature:0.5}).success,false);
  assert.equal(trainingInput.safeParse({baseModelId:'aether:8b',presetId:'small',examples:[],reason:'Reviewed training request',acknowledgeTraining:true}).success,false);
  assert.equal(exampleInput.safeParse({title:'Test',modelId:'aether:8b',prompt:'Hello',response:'',expectedResponse:'',notes:'',rating:null}).success,false);
});
