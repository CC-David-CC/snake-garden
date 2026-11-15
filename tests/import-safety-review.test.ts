import {describe,expect,it} from 'vitest';
import {SnakeSession} from '../src/model/snake.js';
import {decodeSave as decodeSnake,encodeSave as encodeSnake} from '../src/model/save.js';

describe('bounded snake imports',()=>{
 it('rejects snake arrays larger than the board and out-of-board/duplicate cells',()=>{const text=encodeSnake(new SnakeSession('test','classic',0));const big=JSON.parse(text);big.payload.snake=Array.from({length:257},()=>({x:1,y:1}));expect(()=>decodeSnake(JSON.stringify(big))).toThrow();const outside=JSON.parse(text);outside.payload.snake[0].x=16;expect(()=>decodeSnake(JSON.stringify(outside))).toThrow();const duplicate=JSON.parse(text);duplicate.payload.snake[1]=duplicate.payload.snake[0];expect(()=>decodeSnake(JSON.stringify(duplicate))).toThrow();expect(()=>decodeSnake(text)).not.toThrow()});
});
