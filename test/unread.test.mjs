import test from 'node:test';
import assert from 'node:assert/strict';
import {unreadCount,seedReadMarkers,markRoomRead,mergeReadMarkers,roomCards} from '../public/lobby.js';
test('unread markers persist independent room positions, count messages after leaving, and clear only the entered room',()=>{
  const a={id:'a',createdAt:1,messageCount:10},b={id:'b',createdAt:2,messageCount:5};
  let markers=seedReadMarkers({},[a,b]);assert.equal(unreadCount(a,markers),0);
  const later={...a,messageCount:13};assert.equal(unreadCount(later,markers),3);assert.equal(unreadCount({...b,messageCount:9},markers),4);
  markers=JSON.parse(JSON.stringify(markers));assert.equal(unreadCount(later,markers),3);
  markers=markRoomRead(markers,{...a,messages:Array(13),messageCount:undefined});assert.equal(unreadCount(later,markers),0);assert.equal(unreadCount({...b,messageCount:9},markers),4);
  markers=markRoomRead(markers,{...a,messageCount:11});assert.equal(markers.a.count,13);
});
test('a new gathering resets the baseline, dissolved rooms are pruned and shared tabs merge read progress without going backwards',()=>{
  const room={id:'a',createdAt:1,messageCount:10};let markers=seedReadMarkers({},[room]);
  markers=mergeReadMarkers(markers,{a:{createdAt:1,count:14},b:{createdAt:1,count:2},bad:{count:'invalid'}});
  assert.equal(markers.a.count,14);assert.equal(markers.bad,undefined);
  markers=seedReadMarkers(markers,[{...room,createdAt:2,messageCount:1}]);assert.equal(markers.b,undefined);assert.equal(markers.a.count,1);
  assert.equal(unreadCount({...room,createdAt:2,messageCount:3},markers),2);
});
test('home cards display a red unread count with accessible full quantity and cap the visual number',()=>{
  const room={id:'a',name:'群聊',createdAt:1,messageCount:150,agents:[]};
  const options={avatar:()=>'',esc:String,icon:()=>'',readMarkers:{a:{createdAt:1,count:0}}};
  const html=roomCards([room],options);assert.match(html,/class="unread-badge"/);assert.match(html,/150 条未读消息/);assert.match(html,/>99\+</);
  assert.ok(!roomCards([room],{...options,readMarkers:markRoomRead(options.readMarkers,room)}).includes('unread-badge'));
});
