/**
 * QQ 频道机器人客户端（主类）
 *
 * 整合 HttpApi + WebSocketManager + TypedEventEmitter，
 * 提供高级、易用的机器人开发接口。
 *
 * @example
 * ```ts
 * import { Client, Intents } from 'qq-bot-sdk';
 *
 * const client = new Client({
 *   appId: 'YOUR_APP_ID',
 *   token: 'YOUR_TOKEN',
 *   intents: Intents.PUBLIC_GUILD_MESSAGES | Intents.DIRECT_MESSAGE,
 * });
 *
 * client.on('ready', ({ user }) => console.log(`✅ ${user.username} 已上线`));
 *
 * client.on('at_message_create', async (msg) => {
 *   await client.reply(msg, `你好，<@${msg.author!.id}>！`);
 * });
 *
 * await client.start();
 * ```
 */

import { HttpApi, PROD_BASE_URL, SANDBOX_BASE_URL, QQBotApiError } from './http.js';
import type { HttpApiOptions } from './http.js';
import { WebSocketManager, ConnectionState } from './websocket.js';
import { ClientEventEmitter } from './event-emitter.js';
import { Intents, GatewayEvent } from './types/events.js';
import type { ClientEventMap, ReadyEventData } from './types/events.js';
import type {
  SendMessageParams,
  SendDirectMessageParams,
  SendFileMessageParams,
  CreateDirectMessageSessionParams,
  DeleteMessageParams,
} from './types/api.js';
import type {
  Message,
  DirectMessageSession,
  Guild,
  Channel,
  Member,
  User,
} from './types/message.js';

// ── 配置 ──────────────────────────────────────────────────────────────────────

export interface ClientOptions {
  /** 机器人 AppID */
  appId: string;
  /** 机器人 Token */
  token: string;
  /**
   * 订阅意图（默认：公域 AT 消息 + 私信 + 频道成员 + 频道事件）
   *
   * 按位 OR 组合多个意图：
   * ```ts
   * intents: Intents.PUBLIC_GUILD_MESSAGES | Intents.DIRECT_MESSAGE
   * ```
   */
  intents?: number;
  /**
   * 是否使用沙箱环境，默认 false
   * 沙箱环境 Base URL：https://sandbox.api.sgroup.qq.com
   */
  sandbox?: boolean;
  /** 自定义 API Base URL（优先级高于 sandbox） */
  baseUrl?: string;
  /** HTTP 请求超时（ms），默认 10000 */
  timeout?: number;
  /** WS 分片 [当前编号, 总数]，默认 [0,1] */
  shard?: [number, number];
  /** 最大重连次数，-1 无限，默认 10 */
  maxReconnectAttempts?: number;
  /** 重连基础延迟（ms），默认 1000（指数退避） */
  reconnectBaseDelay?: number;
}

/** 默认订阅意图 */
const DEFAULT_INTENTS =
  Intents.PUBLIC_GUILD_MESSAGES |
  Intents.DIRECT_MESSAGE        |
  Intents.GUILD_MEMBERS         |
  Intents.GUILDS;

// ── 主类 ──────────────────────────────────────────────────────────────────────

/**
 * QQ 频道机器人客户端
 *
 * 继承自 `ClientEventEmitter`，可直接调用 `.on()` 等方法。
 */
export class Client extends ClientEventEmitter {
  /** HTTP API 实例（可访问所有底层 API） */
  public readonly api: HttpApi;

  /** 机器人自身用户信息（READY 后可用，其余时候为 null） */
  public user: User | null = null;

  private wsManager: WebSocketManager | null = null;
  private readonly opts: Readonly<Required<ClientOptions>>;

  constructor(options: ClientOptions) {
    super();

    // 决定 Base URL
    const resolvedBaseUrl =
      options.baseUrl ??
      (options.sandbox ? SANDBOX_BASE_URL : PROD_BASE_URL);

    this.opts = {
      appId:                options.appId,
      token:                options.token,
      intents:              options.intents              ?? DEFAULT_INTENTS,
      sandbox:              options.sandbox              ?? false,
      baseUrl:              resolvedBaseUrl,
      timeout:              options.timeout              ?? 10_000,
      shard:                options.shard                ?? [0, 1],
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
      reconnectBaseDelay:   options.reconnectBaseDelay   ?? 1_000,
    };

    const httpOptions: HttpApiOptions = {
      appId:   this.opts.appId,
      token:   this.opts.token,
      baseUrl: this.opts.baseUrl,
      timeout: this.opts.timeout,
    };
    this.api = new HttpApi(httpOptions);
  }

  // ── 连接管理 ─────────────────────────────────────────────────────────────────

  /**
   * 启动机器人
   *
   * 流程：
   * 1. GET /gateway/bot 获取 WS 地址
   * 2. 建立 WebSocket 连接
   * 3. 等待 READY 事件
   * 4. resolve 并返回机器人 User 对象
   *
   * @throws 获取 Gateway 失败 或 WS 连接超时时 reject
   */
  async start(): Promise<User> {
    // 1. 获取 Gateway URL
    let gatewayUrl: string;
    try {
      const info = await this.api.getGatewayBot();
      gatewayUrl = info.url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`获取 Gateway URL 失败: ${msg}`);
    }

    // 2. 拼接版本参数
    const separator = gatewayUrl.includes('?') ? '&' : '?';
    const wsUrl = `${gatewayUrl}${separator}v=2&encoding=json`;

    // 3. 构建 WS 管理器
    const token = `Bot ${this.opts.appId}.${this.opts.token}`;
    this.wsManager = new WebSocketManager({
      gatewayUrl:            wsUrl,
      token,
      intents:               this.opts.intents,
      shard:                 this.opts.shard,
      maxReconnectAttempts:  this.opts.maxReconnectAttempts,
      reconnectBaseDelay:    this.opts.reconnectBaseDelay,
      onDispatch:            this.handleDispatch.bind(this),
      onError:               (e) => this.emit('error', e),
      onDisconnect:          (code, reason) => this.emit('disconnect', { code, reason }),
    });

    // 4. 等待 READY
    return new Promise<User>((resolve, reject) => {
      const cleanUp = () => {
        this.off('ready', onReady);
        this.off('error', onError);
      };

      const onReady = (data: ReadyEventData) => {
        cleanUp();
        this.user = data.user;
        resolve(data.user);
      };

      const onError = (error: Error) => {
        cleanUp();
        reject(error);
      };

      this.once('ready', onReady);
      this.once('error', onError);

      this.wsManager!.connect();
    });
  }

  /** 停止机器人（主动断开，不触发重连） */
  stop(): void {
    this.wsManager?.disconnect();
    this.wsManager = null;
  }

  /** 当前 WS 连接状态 */
  get connectionState(): ConnectionState {
    return this.wsManager?.connectionState ?? ConnectionState.DISCONNECTED;
  }

  // ── 消息 API ─────────────────────────────────────────────────────────────────

  /**
   * 发送频道消息（JSON 方式）
   *
   * @example
   * ```ts
   * // 被动回复（带 msg_id）
   * await client.sendMessage(msg.channel_id!, {
   *   content: '收到！',
   *   msg_id: msg.id,
   * });
   *
   * // 主动发图片 URL
   * await client.sendMessage(channelId, {
   *   image: 'https://example.com/banner.png',
   * });
   * ```
   */
  sendMessage(channelId: string, params: SendMessageParams): Promise<Message> {
    return this.api.sendMessage(channelId, params);
  }

  /**
   * 发送频道图片消息（文件数据，multipart）
   *
   * @example
   * ```ts
   * import { readFile } from 'node:fs/promises';
   *
   * const buf = await readFile('./cat.jpg');
   * await client.sendFileMessage(msg.channel_id!, {
   *   file_image: buf,       // Uint8Array / Buffer
   *   filename: 'cat.jpg',
   *   msg_id: msg.id,
   * });
   * ```
   */
  sendFileMessage(channelId: string, params: SendFileMessageParams): Promise<Message> {
    return this.api.sendFileMessage(channelId, params);
  }

  /**
   * 快速回复消息（自动附带 msg_id）
   *
   * @example
   * ```ts
   * client.on('at_message_create', async (msg) => {
   *   await client.reply(msg, '你好！');
   * });
   * ```
   */
  async reply(message: Message, content: string): Promise<Message> {
    if (!message.channel_id) {
      throw new Error('无法回复：消息缺少 channel_id');
    }
    return this.api.sendMessage(message.channel_id, {
      content,
      msg_id: message.id,
    });
  }

  /** 撤回频道消息 */
  deleteMessage(
    channelId: string,
    messageId: string,
    params?: DeleteMessageParams,
  ): Promise<void> {
    return this.api.deleteMessage(channelId, messageId, params);
  }

  // ── 私信 API ─────────────────────────────────────────────────────────────────

  /**
   * 给用户发送私信（自动创建会话）
   *
   * @param userId       - 目标用户 ID
   * @param sourceGuildId - 来源频道 ID（触发私信的频道）
   * @param params       - 消息参数
   *
   * @example
   * ```ts
   * client.on('at_message_create', async (msg) => {
   *   await client.sendDirectMessage(
   *     msg.author!.id,
   *     msg.guild_id!,
   *     { content: '这是一条私信～' }
   *   );
   * });
   * ```
   */
  async sendDirectMessage(
    userId: string,
    sourceGuildId: string,
    params: SendDirectMessageParams,
  ): Promise<Message> {
    const session = await this.api.createDirectMessageSession({
      recipient_id:    userId,
      source_guild_id: sourceGuildId,
    });
    return this.api.sendDirectMessage(session.guild_id, params);
  }

  /**
   * 在已有私信会话中发消息
   * @param guildId - 由 createDirectMessageSession 返回的虚拟 guild_id
   */
  sendDirectMessageToSession(guildId: string, params: SendDirectMessageParams): Promise<Message> {
    return this.api.sendDirectMessage(guildId, params);
  }

  /**
   * 快速回复私信（在 DIRECT_MESSAGE_CREATE 事件中使用）
   *
   * @example
   * ```ts
   * client.on('direct_message_create', async (msg) => {
   *   await client.replyDirect(msg, '收到私信！');
   * });
   * ```
   */
  async replyDirect(message: Message, content: string): Promise<Message> {
    const guildId = message.guild_id ?? message.src_guild_id;
    if (!guildId) throw new Error('无法回复私信：消息缺少 guild_id');
    return this.api.sendDirectMessage(guildId, {
      content,
      msg_id: message.id,
    });
  }

  /** 创建私信会话（获取虚拟 guild_id） */
  createDirectMessageSession(params: CreateDirectMessageSessionParams): Promise<DirectMessageSession> {
    return this.api.createDirectMessageSession(params);
  }

  /** 撤回私信消息 */
  deleteDirectMessage(
    guildId: string,
    messageId: string,
    params?: DeleteMessageParams,
  ): Promise<void> {
    return this.api.deleteDirectMessage(guildId, messageId, params);
  }

  // ── 频道 / 子频道 / 成员 API ──────────────────────────────────────────────────

  /** 获取机器人加入的频道列表 */
  getGuilds(): Promise<Guild[]> {
    return this.api.getUserGuilds();
  }

  /** 获取频道详情 */
  getGuild(guildId: string): Promise<Guild> {
    return this.api.getGuild(guildId);
  }

  /** 获取子频道详情 */
  getChannel(channelId: string): Promise<Channel> {
    return this.api.getChannel(channelId);
  }

  /** 获取频道的子频道列表 */
  getChannels(guildId: string): Promise<Channel[]> {
    return this.api.getChannels(guildId);
  }

  /** 获取频道成员详情 */
  getGuildMember(guildId: string, userId: string): Promise<Member> {
    return this.api.getGuildMember(guildId, userId);
  }

  /**
   * 踢出频道成员
   * @param options.add_blacklist - 是否同时加入黑名单
   */
  kickGuildMember(
    guildId: string,
    userId: string,
    options?: { add_blacklist?: boolean },
  ): Promise<void> {
    return this.api.removeGuildMember(guildId, userId, options);
  }

  /**
   * 禁言成员（单位：秒）
   * @example await client.muteGuildMember(guildId, userId, 600); // 禁言 10 分钟
   */
  muteGuildMember(guildId: string, userId: string, seconds: number): Promise<void> {
    return this.api.muteGuildMember(guildId, userId, {
      mute_seconds: String(seconds),
    });
  }

  /** 解除成员禁言 */
  unmuteGuildMember(guildId: string, userId: string): Promise<void> {
    return this.api.unmuteGuildMember(guildId, userId);
  }

  // ── 内部：事件分发 ───────────────────────────────────────────────────────────

  private handleDispatch(event: string, data: unknown, seq: number): void {
    // 原始帧（调试用）
    this.emit('raw_message', { op: 0, t: event, d: data, s: seq });

    switch (event) {
      // ── 基础 ──
      case GatewayEvent.READY:
        this.emit('ready', data as ClientEventMap['ready'][0]);
        break;
      case GatewayEvent.RESUMED:
        this.emit('resumed');
        break;

      // ── 频道消息 ──
      case GatewayEvent.AT_MESSAGE_CREATE:
        this.emit('at_message_create', data as Message);
        break;
      case GatewayEvent.MESSAGE_CREATE:
        this.emit('message_create', data as Message);
        break;
      case GatewayEvent.MESSAGE_DELETE:
      case GatewayEvent.PUBLIC_MESSAGE_DELETE:
        this.emit('message_delete', data as ClientEventMap['message_delete'][0]);
        break;

      // ── 私信 ──
      case GatewayEvent.DIRECT_MESSAGE_CREATE:
        this.emit('direct_message_create', data as Message);
        break;
      case GatewayEvent.DIRECT_MESSAGE_DELETE:
        this.emit('direct_message_delete', data as ClientEventMap['direct_message_delete'][0]);
        break;

      // ── 频道 ──
      case GatewayEvent.GUILD_CREATE:
        this.emit('guild_create', data as Guild);
        break;
      case GatewayEvent.GUILD_UPDATE:
        this.emit('guild_update', data as Guild);
        break;
      case GatewayEvent.GUILD_DELETE:
        this.emit('guild_delete', data as Guild);
        break;

      // ── 子频道 ──
      case GatewayEvent.CHANNEL_CREATE:
        this.emit('channel_create', data as Channel);
        break;
      case GatewayEvent.CHANNEL_UPDATE:
        this.emit('channel_update', data as Channel);
        break;
      case GatewayEvent.CHANNEL_DELETE:
        this.emit('channel_delete', data as Channel);
        break;

      // ── 成员 ──
      case GatewayEvent.GUILD_MEMBER_ADD:
        this.emit('guild_member_add', data as ClientEventMap['guild_member_add'][0]);
        break;
      case GatewayEvent.GUILD_MEMBER_UPDATE:
        this.emit('guild_member_update', data as ClientEventMap['guild_member_update'][0]);
        break;
      case GatewayEvent.GUILD_MEMBER_REMOVE:
        this.emit('guild_member_remove', data as ClientEventMap['guild_member_remove'][0]);
        break;

      // ── 表情表态 ──
      case GatewayEvent.MESSAGE_REACTION_ADD:
        this.emit('message_reaction_add', data as ClientEventMap['message_reaction_add'][0]);
        break;
      case GatewayEvent.MESSAGE_REACTION_REMOVE:
        this.emit('message_reaction_remove', data as ClientEventMap['message_reaction_remove'][0]);
        break;

      // ── 音频 ──
      case GatewayEvent.AUDIO_START:
        this.emit('audio_start', data as ClientEventMap['audio_start'][0]);
        break;
      case GatewayEvent.AUDIO_FINISH:
        this.emit('audio_finish', data as ClientEventMap['audio_finish'][0]);
        break;
      case GatewayEvent.AUDIO_ON_MIC:
        this.emit('audio_on_mic', data as ClientEventMap['audio_on_mic'][0]);
        break;
      case GatewayEvent.AUDIO_OFF_MIC:
        this.emit('audio_off_mic', data as ClientEventMap['audio_off_mic'][0]);
        break;

      // ── 消息审核 ──
      case GatewayEvent.MESSAGE_AUDIT_PASS:
        this.emit('message_audit_pass', data as ClientEventMap['message_audit_pass'][0]);
        break;
      case GatewayEvent.MESSAGE_AUDIT_REJECT:
        this.emit('message_audit_reject', data as ClientEventMap['message_audit_reject'][0]);
        break;

      // ── 互动 ──
      case GatewayEvent.INTERACTION_CREATE:
        this.emit('interaction_create', data as ClientEventMap['interaction_create'][0]);
        break;

      // 未处理的事件可从 raw_message 中捕获
      default:
        break;
    }
  }
}

// ── 重新导出，方便用户引用 ────────────────────────────────────────────────────
export { Intents, QQBotApiError, PROD_BASE_URL, SANDBOX_BASE_URL, ConnectionState };
