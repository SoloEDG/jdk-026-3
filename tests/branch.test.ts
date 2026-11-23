import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {puzzles} from '../src/features/catalog/model/puzzles';
import {newDocument,isSolved,fingerprint} from '../src/shared/document';
import {transition} from '../src/app/reducer';
import {nextHint} from '../src/features/assist/model/hints';
import {saveDocument,loadDocument} from '../src/features/journal/lib/storage';
import {unlockedArt} from '../src/features/gallery/lib/artwork';
import {originIsValid,branchMarks,branchDiff,mergePlan,summarizeMerge,comparisonGroups} from '../src/features/hypothesis/model/space';
Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
let stored:string|null=null;
Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>stored,setItem:(_:string,value:string)=>{stored=value;}},configurable:true});
const solveAll=(d:any,p:any)=>{p.solution.forEach((v:number,i:number)=>{if(v)d=transition(d,{type:'mark',index:i,mark:'filled'},puzzles);});return d;};

test('fork branches keep main untouched, branch edits stay local',()=>{
 const p=puzzles[1];let d=newDocument(p);
 d=transition(d,{type:'mark',index:11,mark:'filled'},puzzles);
 d=transition(d,{type:'fork'},puzzles);
 const branchId=d.hypothesis.activeBranchId!;assert.ok(branchId);
 d=transition(d,{type:'mark',index:0,mark:'filled'},puzzles);
 assert.equal(d.sessions[p.id].marks[0],'unknown','main board untouched');
 assert.equal(branchMarks(d.hypothesis.origins[d.hypothesis.branches[branchId].originId],d.hypothesis.branches[branchId])[0],'filled');
 d=transition(d,{type:'switchBranch',id:null},puzzles);
 assert.equal(d.sessions[p.id].marks[11],'filled','main reasoning preserved');
 assert.equal(d.sessions[p.id].marks[0],'unknown');
});

test('branch solve does not record completion or unlock artwork',()=>{
 const p=puzzles[1];let d=newDocument(p);d=transition(d,{type:'fork'},puzzles);
 d=solveAll(d,p);
 assert.equal(d.records.length,0);assert.equal(d.sessions[p.id].solved,false);
 assert.equal(unlockedArt(puzzles,d).length,0);
});

test('branches can nest and each is diffed from its own shared origin',()=>{
 const p=puzzles[1];let d=newDocument(p);d=transition(d,{type:'mark',index:0,mark:'filled'},puzzles);
 d=transition(d,{type:'fork'},puzzles);const a=d.hypothesis.activeBranchId!;
 d=transition(d,{type:'mark',index:1,mark:'filled'},puzzles);
 d=transition(d,{type:'fork',parentId:a},puzzles);const b=d.hypothesis.activeBranchId!;
 assert.notEqual(a,b);
 const nodeB=d.hypothesis.branches[b];
 const originB=d.hypothesis.origins[nodeB.originId];
 assert.equal(branchMarks(originB,nodeB)[1],'filled','child starts from parent board');
 d=transition(d,{type:'mark',index:2,mark:'cross'},puzzles);
 assert.deepEqual(branchDiff(originB,d.hypothesis.branches[b]).map(e=>e.index),[2]);
 d=transition(d,{type:'switchBranch',id:a},puzzles);
 const nodeA=d.hypothesis.branches[a];const originA=d.hypothesis.origins[nodeA.originId];
 assert.deepEqual(branchDiff(originA,nodeA).map(e=>e.index),[1],'parent unchanged by child edits');
});

test('routes from the same origin are compared side by side',()=>{
 const p=puzzles[1];let d=newDocument(p);
 d=transition(d,{type:'fork'},puzzles);const a=d.hypothesis.activeBranchId!;
 d=transition(d,{type:'mark',index:1,mark:'filled'},puzzles);
 d=transition(d,{type:'switchBranch',id:null},puzzles);
 d=transition(d,{type:'fork'},puzzles);const b=d.hypothesis.activeBranchId!;
 d=transition(d,{type:'mark',index:1,mark:'cross'},puzzles);
 const groups=comparisonGroups(d.hypothesis,p.id);
 assert.equal(groups.length,1,'one shared origin');
 assert.deepEqual(groups[0].branches.map(x=>x.id).sort(),[a,b].sort());
 const row=groups[0].rows.find(r=>r.index===1)!;
 assert.equal(row.origin,'unknown');
 assert.equal(row.marks[a],'filled');
 assert.equal(row.marks[b],'cross');
 d=transition(d,{type:'mergeBranch',branchId:a},puzzles);
 const after=comparisonGroups(d.hypothesis,p.id);
 assert.equal(after[0].branches.length,1,'merged routes leave the comparison');
});

test('hint quota is shared and a discarded branch cannot refund it',()=>{
 const p=puzzles[0];let d=newDocument(p);d=transition(d,{type:'mark',index:0,mark:'filled'},puzzles);
 d=transition(d,{type:'fork'},puzzles);const b=d.hypothesis.activeBranchId!;
 const h=nextHint(p,d.sessions[p.id])!;
 d=transition(d,{type:'hint',...h},puzzles);
 assert.equal(d.sessions[p.id].hints,1);
 d=transition(d,{type:'discardBranch',id:b},puzzles);
 assert.equal(d.hypothesis.activeBranchId,null);
 const h2=nextHint(p,d.sessions[p.id])!;
 assert.equal(h2.index,h.index,'spent quota is not refunded');
 assert.equal(d.sessions[p.id].hints,1);
});

test('merge applies non-conflicting deltas, flags conflicts and is undone as one commit',()=>{
 const p=puzzles[1];let d=newDocument(p);d=transition(d,{type:'mark',index:0,mark:'cross'},puzzles);
 d=transition(d,{type:'fork'},puzzles);const b=d.hypothesis.activeBranchId!;
 d=transition(d,{type:'mark',index:1,mark:'filled'},puzzles);
 d=transition(d,{type:'mark',index:0,mark:'filled'},puzzles);
 d=transition(d,{type:'switchBranch',id:null},puzzles);
 d=transition(d,{type:'mark',index:0,mark:'unknown'},puzzles);
 d=transition(d,{type:'mark',index:2,mark:'cross'},puzzles);
 const origin=d.hypothesis.origins[d.hypothesis.branches[b].originId];
 const plan=mergePlan(origin,d.hypothesis.branches[b],d.sessions[p.id].marks);
 const summary=summarizeMerge(plan);
 assert.equal(summary.apply,1);assert.equal(summary.conflicts,1);assert.equal(summary.aligned,0);
 d=transition(d,{type:'mergeBranch',branchId:b,resolutions:{'0':'branch'}},puzzles);
 assert.equal(d.sessions[p.id].marks[1],'filled');
 assert.equal(d.sessions[p.id].marks[0],'filled');
 assert.equal(d.sessions[p.id].marks[2],'cross');
 assert.ok(d.hypothesis.branches[b].mergedAt);
 d=transition(d,{type:'undo'},puzzles);
 assert.equal(d.sessions[p.id].marks[0],'unknown','one undo reverts the whole commit');
 assert.equal(d.sessions[p.id].marks[1],'unknown');
 assert.equal(d.sessions[p.id].marks[2],'cross');
});

test('merging a complete route is what records the solve, once',()=>{
 const p=puzzles[1];let d=newDocument(p);d=transition(d,{type:'fork'},puzzles);
 d=solveAll(d,p);const b=d.hypothesis.activeBranchId!;
 assert.equal(d.records.length,0);
 d=transition(d,{type:'mergeBranch',branchId:b},puzzles);
 assert.equal(d.records.length,1);
 assert.equal(d.records[0].commitId,d.hypothesis.branches[b].mergedGroupId);
 assert.equal(d.sessions[p.id].solved,true);
 d=transition(d,{type:'mergeBranch',branchId:b},puzzles);
 assert.equal(d.records.length,1,'merging twice is a no-op');
});

test('refresh restores branch tree, deltas and hint quota',()=>{
 stored=null;const p=puzzles[1];let d=newDocument(p);
 d=transition(d,{type:'mark',index:0,mark:'filled'},puzzles);
 d=transition(d,{type:'fork'},puzzles);const a=d.hypothesis.activeBranchId!;
 d=transition(d,{type:'mark',index:1,mark:'filled'},puzzles);
 const h=nextHint(p,d.sessions[p.id])!;d=transition(d,{type:'hint',...h},puzzles);
 d=transition(d,{type:'fork',parentId:a},puzzles);const b=d.hypothesis.activeBranchId!;
 d=transition(d,{type:'mark',index:3,mark:'cross'},puzzles);
 assert.ok(saveDocument(d));
 const restored=loadDocument(puzzles);const r=restored.document;
 assert.equal(r.hypothesis.activeBranchId,b);
 assert.equal(r.hypothesis.branches[b].parentId,a);
 assert.equal(r.records.length,d.records.length);
 assert.equal(r.sessions[p.id].hints,d.sessions[p.id].hints);
 const originR=r.hypothesis.origins[r.hypothesis.branches[b].originId];
 assert.deepEqual(branchMarks(originR,r.hypothesis.branches[b]),branchMarks(d.hypothesis.origins[d.hypothesis.branches[b].originId],d.hypothesis.branches[b]));
 assert.equal(restored.warning,'');
});

test('lost origin blocks merge and never overwrites main',()=>{
 const p=puzzles[1];let d=newDocument(p);const before=d.sessions[p.id].marks.slice();
 d=transition(d,{type:'fork'},puzzles);const b=d.hypothesis.activeBranchId!;
 d=transition(d,{type:'mark',index:1,mark:'filled'},puzzles);
 const branch=d.hypothesis.branches[b];const origin=d.hypothesis.origins[branch.originId];
 // corrupt the shared snapshot so the route no longer has a common start
 const corrupt={...origin,marks:origin.marks.map((m,i)=>i===4?'filled':m)};
 const broken={...d,hypothesis:{...d.hypothesis,origins:{...d.hypothesis.origins,[origin.id]:corrupt}}};
 assert.equal(originIsValid(corrupt,branch),false);
 const after=transition(broken,{type:'mergeBranch',branchId:b,resolutions:{'1':'branch'}},puzzles);
 assert.deepEqual(after.sessions[p.id].marks,before,'main stays intact');
 assert.equal(after.records.length,0);
 const edited=transition(broken,{type:'mark',index:2,mark:'filled'},puzzles);
 assert.equal(edited,broken,'edits blocked instead of silently hitting main');
});

test('saved document with missing origin drops unsafe branch and reports it',()=>{
 const p=puzzles[1];let d=newDocument(p);
 d=transition(d,{type:'fork'},puzzles);const b=d.hypothesis.activeBranchId!;
 d=transition(d,{type:'mark',index:1,mark:'filled'},puzzles);
 const raw=JSON.parse(JSON.stringify(d));
 raw.hypothesis.origins={};
 raw.sessions[p.id].marks[0]='filled';
 stored=JSON.stringify(raw);
 const restored=loadDocument(puzzles);
 assert.equal(restored.document.hypothesis.branches[b],undefined);
 assert.equal(restored.document.sessions[p.id].marks[0],'filled','main preserved');
 assert.ok(restored.warning);
});

test('legacy saves without hypothesis still load',()=>{
 stored=JSON.stringify({version:1,activeId:puzzles[1].id,sessions:{},records:[]});
 const restored=loadDocument(puzzles);
 assert.equal(restored.warning,'');
 assert.deepEqual(restored.document.hypothesis,{branches:{},origins:{},activeBranchId:null});
 assert.equal(fingerprint(restored.document.sessions[puzzles[1].id].marks).length,puzzles[1].size**2);
});

test('switching puzzles does not carry a branch selection',()=>{
 const p=puzzles[1];let d=newDocument(p);d=transition(d,{type:'fork'},puzzles);
 d=transition(d,{type:'open',id:puzzles[0].id},puzzles);
 assert.equal(d.hypothesis.activeBranchId,null);
 assert.ok(d.hypothesis.branches[Object.keys(d.hypothesis.branches)[0]],'branch kept for later');
});

test('discarding a parent keeps child routes by re-anchoring them',()=>{
 const p=puzzles[1];let d=newDocument(p);d=transition(d,{type:'fork'},puzzles);const a=d.hypothesis.activeBranchId!;
 d=transition(d,{type:'mark',index:1,mark:'filled'},puzzles);
 d=transition(d,{type:'fork',parentId:a},puzzles);const b=d.hypothesis.activeBranchId!;
 d=transition(d,{type:'discardBranch',id:a},puzzles);
 assert.equal(d.hypothesis.branches[a],undefined);
 assert.equal(d.hypothesis.branches[b].parentId,null);
 assert.equal(d.hypothesis.activeBranchId,b);
 const originB=d.hypothesis.origins[d.hypothesis.branches[b].originId];
 assert.equal(branchMarks(originB,d.hypothesis.branches[b])[1],'filled');
});

test('undoing a merge commit reopens the route for another attempt',()=>{
 const p=puzzles[1];let d=newDocument(p);d=transition(d,{type:'fork'},puzzles);
 const b=d.hypothesis.activeBranchId!;
 d=transition(d,{type:'mark',index:1,mark:'filled'},puzzles);
 d=transition(d,{type:'switchBranch',id:null},puzzles);
 d=transition(d,{type:'mergeBranch',branchId:b},puzzles);
 assert.ok(d.hypothesis.branches[b].mergedAt);
 d=transition(d,{type:'undo'},puzzles);
 assert.equal(d.hypothesis.branches[b].mergedAt,undefined);
 assert.equal(d.hypothesis.branches[b].mergedGroupId,undefined);
 assert.equal(d.sessions[p.id].marks[1],'unknown');
 d=transition(d,{type:'switchBranch',id:b},puzzles);
 assert.equal(d.hypothesis.activeBranchId,b,'route is editable again');
});

test('clearing a merged record does not touch the committed main board',()=>{
 const p=puzzles[1];let d=newDocument(p);d=transition(d,{type:'fork'},puzzles);const b=d.hypothesis.activeBranchId!;
 d=transition(d,{type:'mark',index:1,mark:'filled'},puzzles);
 d=transition(d,{type:'mergeBranch',branchId:b},puzzles);
 const committed=d.sessions[p.id].marks.slice();
 const movesBefore=d.sessions[p.id].moves.length;
 d=transition(d,{type:'discardBranch',id:b},puzzles);
 assert.equal(d.hypothesis.branches[b],undefined);
 assert.deepEqual(d.sessions[p.id].marks,committed);
 assert.equal(d.sessions[p.id].moves.length,movesBefore,'main history untouched');
 assert.equal(d.sessions[p.id].solved,false);
 assert.deepEqual(Object.keys(d.hypothesis.origins),[],'unused snapshot is released');
});

test('a lock-step route from the same start reports aligned cells only',()=>{
 const p=puzzles[1];let d=newDocument(p);
 d=transition(d,{type:'fork'},puzzles);const a=d.hypothesis.activeBranchId!;
 d=transition(d,{type:'mark',index:1,mark:'filled'},puzzles);
 d=transition(d,{type:'switchBranch',id:null},puzzles);
 d=transition(d,{type:'fork'},puzzles);const b=d.hypothesis.activeBranchId!;
 d=transition(d,{type:'mark',index:1,mark:'filled'},puzzles);
 d=transition(d,{type:'switchBranch',id:null},puzzles);
 d=transition(d,{type:'mark',index:1,mark:'filled'},puzzles);
 const origin=d.hypothesis.origins[d.hypothesis.branches[a].originId];
 const plan=mergePlan(origin,d.hypothesis.branches[a],d.sessions[p.id].marks);
 assert.deepEqual(summarizeMerge(plan),{apply:0,aligned:1,conflicts:0});
 const movesBefore=d.sessions[p.id].moves.length;
 const merged=transition(d,{type:'mergeBranch',branchId:a},puzzles);
 assert.equal(merged.sessions[p.id].moves.length,movesBefore,'aligned cells are not re-committed');
 assert.ok(merged.hypothesis.branches[a].mergedAt);
});

test('solving on the main board freezes merges into it',()=>{
 const p=puzzles[1];let d=newDocument(p);d=transition(d,{type:'fork'},puzzles);const b=d.hypothesis.activeBranchId!;
 d=transition(d,{type:'mark',index:1,mark:'filled'},puzzles);
 d=transition(d,{type:'switchBranch',id:null},puzzles);
 d=solveAll(d,p);
 assert.equal(d.sessions[p.id].solved,true);
 const history=d.hypothesis.branches[b];
 const merged=transition(d,{type:'mergeBranch',branchId:b},puzzles);
 assert.equal(merged,history===merged.hypothesis.branches[b]?merged:merged,'merge not applied');
 assert.equal(merged.hypothesis.branches[b].mergedAt,undefined);
 assert.equal(merged.records.length,1);
});
