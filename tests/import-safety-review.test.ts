import {describe,expect,it} from 'vitest';
import {SnakeSession} from '../src/model/snake.js';
import {decodeSave as decodeSnake,encodeSave as encodeSnake} from '../src/model/save.js';
import {OwlSession} from '../../../04-rive-interactives/owl-companion/src/model/owlSession.js';
import {decodeSave as decodeOwl,encodeSave as encodeOwl} from '../../../04-rive-interactives/owl-companion/src/model/save.js';

describe('bounded game imports',()=>{
 it('rejects snake arrays larger than the board and out-of-board/duplicate cells',()=>{const text=encodeSnake(new SnakeSession('test','classic',0));const big=JSON.parse(text);big.payload.snake=Array.from({length:257},()=>({x:1,y:1}));expect(()=>decodeSnake(JSON.stringify(big))).toThrow();const outside=JSON.parse(text);outside.payload.snake[0].x=16;expect(()=>decodeSnake(JSON.stringify(outside))).toThrow();const duplicate=JSON.parse(text);duplicate.payload.snake[1]=duplicate.payload.snake[0];expect(()=>decodeSnake(JSON.stringify(duplicate))).toThrow();expect(()=>decodeSnake(text)).not.toThrow()});
 it('accepts an actual completed firefly round with its valid negative timer',()=>{const owl=new OwlSession('test');owl.startActivity('firefly',3);for(let i=0;i<100&&owl.phase==='playing';i++)owl.advance(250);expect(owl.phase).toBe('result');expect(owl.firefly!.snapshot().stepRemainingMs).toBeLessThan(0);expect(()=>decodeOwl(encodeOwl(owl))).not.toThrow()});
 it('rejects oversized owl activity arrays and out-of-range options',()=>{const owl=new OwlSession('test');owl.startActivity('blink',1);const b=JSON.parse(encodeOwl(owl));b.payload.blink.pattern=Array(5000).fill(0);expect(()=>decodeOwl(JSON.stringify(b))).toThrow();owl.startActivity('match',1);const m=JSON.parse(encodeOwl(owl));m.payload.match.options=[0,1,500];expect(()=>decodeOwl(JSON.stringify(m))).toThrow()});
});
