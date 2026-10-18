const {test}=require('node:test');
const assert=require('node:assert/strict');
const W=require('../workspace.js');
const T=require('../tiers.js');
const pos=id=>({...T.makePosition({market:'Bills win',side:'yes',qty:100,entry:.4,fee:1}),id});
test('workspace envelope round trips zero marks and validates record identity',()=>{
 const d={...W.empty(),positions:[{...pos('one'),mark:0}]};
 const encoded=W.encode(d,3,100);
 assert.equal(W.decode(encoded).positions[0].mark,0);
 assert.equal(encoded.revision,3);
 assert.throws(()=>W.encode({...d,positions:[pos('one'),pos('one')]},1,100),/duplicate/i);
 assert.throws(()=>W.decode({revision:1,payload:'bad'}),/read|format/i);
});
test('cloud mutation rebases on authoritative current revision and preserves other device records',async()=>{
 let current=W.encode({...W.empty(),positions:[pos('other-device')]},8,100);
 const ref={async transaction(fn){current=fn(current);return {committed:true,snapshot:{val:()=>current}};}};
 const result=await W.transact(ref,doc=>({...doc,positions:[...doc.positions,pos('this-device')]}),200);
 assert.equal(result.revision,9);assert.equal(result.data.positions.length,2);
 assert.deepEqual(W.decode(current).positions.map(x=>x.id),['other-device','this-device']);
});
test('replayed import merges by id without duplicating journal records',()=>{
 const one={...W.empty(),positions:[pos('one')]};
 const two={...W.empty(),positions:[pos('one'),pos('two')]};
 assert.equal(W.merge(one,two).positions.length,2);
 assert.equal(W.merge(W.merge(one,two),two).positions.length,2);
});
test('invalid stored or imported values cannot turn into a valid ledger',()=>{
 for(const change of [{qty:NaN},{entry:2},{side:'other'},{exits:[{qty:101,price:.5,fee:0}]}])
  assert.throws(()=>W.validate({...W.empty(),positions:[{...pos('one'),...change}]}));
});
test('mutations denied by Firebase never report a successful save',async()=>{
 const ref={async transaction(){throw Error('PERMISSION_DENIED');}};
 await assert.rejects(W.transact(ref,x=>x),/PERMISSION_DENIED/);
});
