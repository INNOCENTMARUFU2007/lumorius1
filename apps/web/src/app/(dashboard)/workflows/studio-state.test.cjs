const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const file=require('node:path').join(__dirname,'studio-state.ts');
const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const result={exports:{}};new Function('module','exports',source)(result,result.exports);
const {readStudioLocation,taskOutputLink,stepSummary,resultLabel}=result.exports;
const id='c283066b-ecb0-42d4-87a8-fde0de676482';
test('restores selected results and rejects invalid navigation identifiers',()=>{
 assert.deepEqual(readStudioLocation('?studio=results&runId='+id),{view:'results',runId:id,workflowId:null});
 assert.deepEqual(readStudioLocation('?studio=oops&runId=bad&workflowId=../../admin'),{view:'automations',runId:null,workflowId:null});
});
test('links only valid created task records',()=>{
 assert.equal(taskOutputLink({taskId:id}),'/tasks?task='+id);
 assert.equal(taskOutputLink({taskId:'https://outside.invalid'}),null);
});
test('incomplete and failed steps never claim success',()=>{
 assert.equal(stepSummary('failed',{}),'Action failed');
 assert.equal(stepSummary('running',{}),'Action in progress');
 assert.equal(stepSummary('completed',{createdCount:0}),'0 notifications created');
});
test('analysis and applied business changes have distinct states',()=>{
 assert.equal(resultLabel('succeeded'),'Analysis ready');
 assert.equal(resultLabel('applied'),'Approved changes applied');
});
