/**
 * 强类型事件发射器
 *
 * 基于 Node.js 原生 EventEmitter，增加 TypeScript 泛型约束，
 * 确保事件名和回调参数类型严格对应。
 *
 * @example
 * ```ts
 * const client = new Client(...);
 *
 * // IDE 自动推断 msg 类型为 Message
 * client.on('at_message_create', (msg) => console.log(msg.content));
 * ```
 */

import { EventEmitter } from 'node:events';
import type { ClientEventMap } from './types/events.js';

// TypeScript 泛型中的 "任意函数" 类型（避免 eslint any 警告）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => void;

/** 从事件映射中提取指定事件的监听器签名 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener<Map, K extends keyof Map> = Map[K] extends any[]
  ? (...args: Map[K]) => void
  : never;

/**
 * 通用强类型事件发射器
 *
 * @typeParam EM - 事件名 → 参数元组 的映射对象类型
 */
export class TypedEventEmitter<EM extends object> {
  protected readonly _emitter = new EventEmitter({ captureRejections: true });

  constructor() {
    // 允许大量监听器，避免 MaxListenersExceededWarning
    this._emitter.setMaxListeners(200);
  }

  on<K extends keyof EM & string>(event: K, listener: Listener<EM, K>): this {
    this._emitter.on(event, listener as AnyFn);
    return this;
  }

  once<K extends keyof EM & string>(event: K, listener: Listener<EM, K>): this {
    this._emitter.once(event, listener as AnyFn);
    return this;
  }

  off<K extends keyof EM & string>(event: K, listener: Listener<EM, K>): this {
    this._emitter.off(event, listener as AnyFn);
    return this;
  }

  emit<K extends keyof EM & string>(
    event: K,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: EM[K] extends any[] ? EM[K] : never
  ): boolean {
    return this._emitter.emit(event, ...args);
  }

  removeAllListeners<K extends keyof EM & string>(event?: K): this {
    this._emitter.removeAllListeners(event);
    return this;
  }

  listenerCount<K extends keyof EM & string>(event: K): number {
    return this._emitter.listenerCount(event);
  }

  listeners<K extends keyof EM & string>(event: K): Listener<EM, K>[] {
    return this._emitter.listeners(event) as Listener<EM, K>[];
  }
}

/** QQ Bot 客户端专用事件发射器 */
export class ClientEventEmitter extends TypedEventEmitter<ClientEventMap> {}
