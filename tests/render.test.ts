import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createElement} from 'react';
import {renderToString} from 'react-dom/server';
import {App} from '../src/app/App';
import {puzzles} from '../src/features/catalog/model/puzzles';
import {newDocument} from '../src/shared/document';
import {transition} from '../src/app/reducer';
import {saveDocument} from '../src/features/journal/lib/storage';
Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
let stored:string|null=null;
Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>stored,setItem:(_:string,value:string)=>{stored=value;}},configurable:true});
/** React inserts comment markers between adjacent text nodes; strip them so
 * assertions can match the sentence a user actually reads. */
const text=(element: ReturnType<typeof createElement>) =>
 renderToString(element).replaceAll('<!-- -->','');

test('app renders the main board and the hypothesis space',()=>{
 stored=null;
 const html=text(createElement(App));
 assert.match(html,/假设推演/);
 assert.match(html,/从主盘开一条支线/);
 assert.match(html,/每一幅图，都藏着一个惊喜/);
});

test('app renders branch state restored from the saved document',()=>{
 const p=puzzles[1];
 let d=newDocument(p);
 d=transition(d,{type:'mark',index:0,mark:'filled'},puzzles);
 d=transition(d,{type:'fork'},puzzles);
 d=transition(d,{type:'mark',index:1,mark:'cross'},puzzles);
 const id=d.hypothesis.activeBranchId!;
 d=transition(d,{type:'fork',parentId:id},puzzles);
 const nested=d.hypothesis.activeBranchId!;
 assert.ok(d.hypothesis.branches[nested].parentId);
 assert.ok(saveDocument(d));
 const html=text(createElement(App));
 const name=d.hypothesis.branches[nested].name;
 assert.ok(html.includes(`正在支线「${name}」里推演`), 'active route banner');
 assert.ok(html.includes('回到主盘'));
 assert.ok(html.includes('1 格变化'), 'parent diff is shown');
 assert.ok(html.includes('在这条支线里继续开分支'), 'nested fork action exists');
});

test('a corrupted origin renders an explicit warning, never a silent main-board swap',()=>{
 const p=puzzles[1];
 let d=newDocument(p);
 d=transition(d,{type:'fork'},puzzles);
 d=transition(d,{type:'mark',index:1,mark:'cross'},puzzles);
 const raw=JSON.parse(JSON.stringify(d));
 raw.hypothesis.origins={};
 stored=JSON.stringify(raw);
 const html=text(createElement(App));
 assert.ok(html.includes('失去共同的起点'), 'explicit origin-loss warning');
 assert.ok(html.includes('主盘内容未受影响'), 'main board is protected');
});
