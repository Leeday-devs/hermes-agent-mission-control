import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceHealth, watchdogTransition, retainEvents, filterEvents } from '../../hermes-bridge/lib/operational.mjs';
test('source health is evidence based and ages',()=>{const now=Date.parse('2026-01-01T00:00:00Z');assert.equal(sourceHealth('wiki',{lastSuccess:'2025-12-31T23:55:00Z',count:4},now).state,'stale');assert.equal(sourceHealth('wiki',{},now).state,'unavailable')});
test('watchdog only notifies escalation and recovery is explicit',()=>{assert.deepEqual(watchdogTransition({state:'live'},{state:'stale'}),{changed:true,notify:true,recovered:false});assert.equal(watchdogTransition({state:'stale'},{state:'live'}).recovered,true)});
test('system log filtering and retention are bounded',()=>{const events=Array.from({length:2100},(_,i)=>({id:String(i),createdAt:new Date(Date.now()-i*1000).toISOString(),title:'event '+i,detail:'safe',agent:'qa',source:'rooms',severity:'info',task:'x',state:'completed',kind:'room',href:'/mission-control'} as const));assert.equal(retainEvents(events).length,2000);assert.equal(filterEvents(events,{agent:'qa',search:'event 1'}).length>0,true)});
