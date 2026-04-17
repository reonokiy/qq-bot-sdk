/**
 * WebSocket 管理器（基于 Node.js 24 原生 globalThis.WebSocket）
 *
 * 职责：
 *  1. 建立 / 恢复与 QQ 开放平台网关的 WS 连接
 *  2. IDENTIFY / RESUME 鉴权
 *  3. 心跳维持（服务端指定间隔，含僵尸连接检测）
 *  4. 断线自动重连（指数退避）
 *  5. session_id + seq 持久化，支持断线续传（RESUME）
 */

import type {
  GatewayPayload,
  HelloData,
  IdentifyData,
  ResumeData,
  ReadyEventData,
} from './types/events.js';
import { OpCode, GatewayEvent } from './types/events.js';

// ── 公共类型 ──────────────────────────────────────────────────────────────────

export interface WebSocketManagerOptions {
  /** 网关 URL（含 v/encoding 查询参数） */
  gatewayUrl: string;
  /** 完整 Authorization token（Bot appid.token） */
  token: string;
  /** 订阅意图（Intents 位标志之和） */
  intents: number;
  /** 分片 [当前编号, 总数]，默认 [0,1] */
  shard?: [number, number];
  /** 最大重连次数，-1 表示无限，默认 10 */
  maxReconnectAttempts?: number;
  /** 重连基础延迟（ms），默认 1000，指数退避 */
  reconnectBaseDelay?: number;
  /** 重连最大延迟（ms），默认 60000 */
  maxReconnectDelay?: number;
  /** Dispatch 事件回调 */
  onDispatch: (event: string, data: unknown, seq: number) => void;
  /** 错误回调 */
  onError: (error: Error) => void;
  /** 断开回调 */
  onDisconnect: (code: number, reason: string) => void;
}

/** WebSocket 连接状态 */
export const ConnectionState = {
  DISCONNECTED:  'DISCONNECTED',
  CONNECTING:    'CONNECTING',
  CONNECTED:     'CONNECTED',
  IDENTIFYING:   'IDENTIFYING',
  READY:         'READY',
  RECONNECTING:  'RECONNECTING',
} as const;

/** ConnectionState 类型 */
export type ConnectionState = typeof ConnectionState[keyof typeof ConnectionState];

// ── 不可恢复的关闭码（4001-4915）────────────────────────────────────────────

/**
 * 这些关闭码说明当前 session 已无法续传，需重新 IDENTIFY。
 * 参考：https://bot.q.qq.com/wiki/develop/api/gateway/error/
 */
const NON_RESUMABLE_CLOSE_CODES = new Set([
  4001, // 无效 opcode
  4002, // 无效消息体
  4003, // 未鉴权
  4004, // 鉴权失败（token 错误）
  4005, // 已鉴权（重复鉴权）
  4007, // seq 错误
  4008, // 发包频率限制
  4009, // session 过期
  4010, // 无效分片
  4011, // 分片过多
  4012, // 无效 API 版本
  4013, // 无效 intent
  4014, // intent 未授权
  4900, // 内部错误
  4914, // 机器人已下架
  4915, // 机器人已封禁
]);

// ── 主类 ──────────────────────────────────────────────────────────────────────

/**
 * WebSocket 管理器
 *
 * 内部状态机：
 * ```
 * DISCONNECTED → CONNECTING → CONNECTED → IDENTIFYING → READY
 *                                  ↑              ↓ (断线 / 服务端 RECONNECT)
 *                           RECONNECTING ←────────┘
 * ```
 */
export class WebSocketManager {
  // ── 状态 ────────────────────────────────────────────────────────────────────
  private ws:              WebSocket | null = null;
  private state:           ConnectionState  = ConnectionState.DISCONNECTED;
  /** 最后收到的序列号（RESUME 时上报） */
  private lastSeq:         number           = 0;
  /** 当前 session ID（RESUME 时上报） */
  private sessionId:       string           = '';
  /** 重连次数计数器 */
  private reconnectCount:  number           = 0;
  /** 主动关闭标志（不触发重连） */
  private manualClose:     boolean          = false;

  // ── 定时器 ──────────────────────────────────────────────────────────────────
  private heartbeatTimer:  ReturnType<typeof setInterval>  | null = null;
  private reconnectTimer:  ReturnType<typeof setTimeout>   | null = null;
  /** 上一次心跳是否已收到 ACK（僵尸连接检测） */
  private heartbeatAcked:  boolean = true;

  // ── 配置（填充默认值后为 Required） ─────────────────────────────────────────
  private readonly cfg: Readonly<Required<WebSocketManagerOptions>>;

  constructor(options: WebSocketManagerOptions) {
    this.cfg = {
      gatewayUrl:            options.gatewayUrl,
      token:                 options.token,
      intents:               options.intents,
      shard:                 options.shard             ?? [0, 1],
      maxReconnectAttempts:  options.maxReconnectAttempts ?? 10,
      reconnectBaseDelay:    options.reconnectBaseDelay   ?? 1_000,
      maxReconnectDelay:     options.maxReconnectDelay    ?? 60_000,
      onDispatch:            options.onDispatch,
      onError:               options.onError,
      onDisconnect:          options.onDisconnect,
    };
  }

  // ── 公开接口 ─────────────────────────────────────────────────────────────────

  get connectionState(): ConnectionState { return this.state;     }
  get currentSessionId(): string          { return this.sessionId; }
  get lastSequence(): number              { return this.lastSeq;   }

  /** 建立连接（幂等：连接中 / 已就绪时无操作） */
  connect(): void {
    if (
      this.state === ConnectionState.CONNECTING ||
      this.state === ConnectionState.CONNECTED  ||
      this.state === ConnectionState.READY
    ) return;

    this.manualClose = false;
    this.setState(ConnectionState.CONNECTING);
    this.openConnection();
  }

  /** 主动断开，不触发重连 */
  disconnect(): void {
    this.manualClose = true;
    this.cleanup();
    this.setState(ConnectionState.DISCONNECTED);
  }

  /** 发送原始 WS 帧 */
  send(payload: GatewayPayload): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  // ── 连接创建 ─────────────────────────────────────────────────────────────────

  private openConnection(): void {
    // 先清理定时器但不关闭 ws（已在上次 cleanup 中处理）
    this.clearTimers();

    try {
      this.ws = new WebSocket(this.cfg.gatewayUrl);
    } catch (err) {
      this.cfg.onError(new Error(`WebSocket 创建失败: ${err}`));
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen    = () => this.onOpen();
    this.ws.onmessage = (ev) => this.onMessage(ev);
    this.ws.onclose   = (ev) => this.onClose(ev);
    this.ws.onerror   = (ev) => this.onError(ev);
  }

  // ── 事件处理 ─────────────────────────────────────────────────────────────────

  private onOpen(): void {
    this.setState(ConnectionState.CONNECTED);
    this.reconnectCount = 0;
    // 等待服务端发来 HELLO
  }

  private onMessage(ev: MessageEvent): void {
    let payload: GatewayPayload;
    try {
      payload = JSON.parse(ev.data as string) as GatewayPayload;
    } catch {
      this.cfg.onError(new Error(`无法解析 WS 消息: ${ev.data as string}`));
      return;
    }

    // 更新序列号
    if (payload.s != null) this.lastSeq = payload.s;

    switch (payload.op) {
      case OpCode.HELLO:
        this.handleHello(payload.d as HelloData);
        break;
      case OpCode.DISPATCH:
        this.handleDispatch(payload);
        break;
      case OpCode.HEARTBEAT_ACK:
        this.heartbeatAcked = true;
        break;
      case OpCode.HEARTBEAT:
        // 服务端要求立刻回一次心跳
        this.sendHeartbeat();
        break;
      case OpCode.RECONNECT:
        this.handleServerReconnect();
        break;
      case OpCode.INVALID_SESSION:
        this.handleInvalidSession(payload.d as boolean);
        break;
    }
  }

  private onClose(ev: CloseEvent): void {
    this.clearTimers();
    this.cfg.onDisconnect(ev.code, ev.reason || 'Unknown reason');

    if (this.manualClose) return;

    // 不可恢复：清除 session，强制 re-IDENTIFY
    if (NON_RESUMABLE_CLOSE_CODES.has(ev.code)) {
      this.sessionId = '';
      this.lastSeq   = 0;
    }

    this.setState(ConnectionState.RECONNECTING);
    this.scheduleReconnect();
  }

  private onError(_ev: Event): void {
    // WebSocket 的 error 事件没有详细信息，实际错误会在 onclose 中体现
    this.cfg.onError(new Error('WebSocket 连接发生错误'));
  }

  // ── 协议处理 ─────────────────────────────────────────────────────────────────

  /** 收到 HELLO → 启动心跳 → 鉴权或续传 */
  private handleHello(data: HelloData): void {
    this.startHeartbeat(data.heartbeat_interval);
    if (this.sessionId) {
      this.sendResume();
    } else {
      this.sendIdentify();
    }
  }

  /** 收到 Dispatch（op=0） */
  private handleDispatch(payload: GatewayPayload): void {
    const event = payload.t ?? '';
    const data  = payload.d;

    if (event === GatewayEvent.READY) {
      const rd = data as ReadyEventData;
      this.sessionId = rd.session_id;
      this.setState(ConnectionState.READY);
    }

    this.cfg.onDispatch(event, data, this.lastSeq);
  }

  /** 服务端要求主动重连（保留 session 做 RESUME） */
  private handleServerReconnect(): void {
    this.cleanup();
    this.setState(ConnectionState.RECONNECTING);
    this.scheduleReconnect();
  }

  /** session 无效处理 */
  private handleInvalidSession(resumable: boolean): void {
    if (!resumable) {
      this.sessionId = '';
      this.lastSeq   = 0;
    }
    // 随机 1-5 秒后重连，避免雪崩
    const jitter = Math.floor(Math.random() * 4_000) + 1_000;
    setTimeout(() => {
      this.cleanup();
      this.setState(ConnectionState.RECONNECTING);
      this.scheduleReconnect();
    }, jitter);
  }

  // ── 心跳 ─────────────────────────────────────────────────────────────────────

  private startHeartbeat(intervalMs: number): void {
    this.clearHeartbeat();
    this.heartbeatAcked = true;

    this.heartbeatTimer = setInterval(() => {
      if (!this.heartbeatAcked) {
        // 上次心跳未收到 ACK → 僵尸连接，强制重连
        this.cfg.onError(new Error('心跳 ACK 超时，正在重连...'));
        this.cleanup();
        this.setState(ConnectionState.RECONNECTING);
        this.scheduleReconnect();
        return;
      }
      this.heartbeatAcked = false;
      this.sendHeartbeat();
    }, intervalMs);
  }

  private sendHeartbeat(): void {
    this.send({ op: OpCode.HEARTBEAT, d: this.lastSeq || null } as GatewayPayload);
  }

  // ── 鉴权 ─────────────────────────────────────────────────────────────────────

  private sendIdentify(): void {
    this.setState(ConnectionState.IDENTIFYING);
    const d: IdentifyData = {
      token:      this.cfg.token,
      intents:    this.cfg.intents,
      shard:      this.cfg.shard,
      properties: {
        $os:      process.platform,
        $browser: 'qq-bot-sdk',
        $device:  'qq-bot-sdk',
      },
    };
    this.send({ op: OpCode.IDENTIFY, d });
  }

  private sendResume(): void {
    this.setState(ConnectionState.IDENTIFYING);
    const d: ResumeData = {
      token:      this.cfg.token,
      session_id: this.sessionId,
      seq:        this.lastSeq,
    };
    this.send({ op: OpCode.RESUME, d });
  }

  // ── 重连 ─────────────────────────────────────────────────────────────────────

  /**
   * 指数退避重连
   * delay = min(base * 2^attempt, maxDelay)
   */
  private scheduleReconnect(): void {
    const { maxReconnectAttempts, reconnectBaseDelay, maxReconnectDelay } = this.cfg;

    if (maxReconnectAttempts !== -1 && this.reconnectCount >= maxReconnectAttempts) {
      this.cfg.onError(
        new Error(`已达最大重连次数 ${maxReconnectAttempts}，停止重连。`),
      );
      this.setState(ConnectionState.DISCONNECTED);
      return;
    }

    const delay = Math.min(
      reconnectBaseDelay * (2 ** this.reconnectCount),
      maxReconnectDelay,
    );
    this.reconnectCount++;

    this.reconnectTimer = setTimeout(() => {
      this.setState(ConnectionState.CONNECTING);
      this.openConnection();
    }, delay);
  }

  // ── 资源清理 ─────────────────────────────────────────────────────────────────

  private clearHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearHeartbeat();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private cleanup(): void {
    this.clearTimers();
    if (this.ws) {
      // 移除事件监听，防止触发重连逻辑
      this.ws.onopen    = null;
      this.ws.onmessage = null;
      this.ws.onclose   = null;
      this.ws.onerror   = null;
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  private setState(s: ConnectionState): void {
    this.state = s;
  }
}
