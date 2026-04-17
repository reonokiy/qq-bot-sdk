/**
 * WebSocket 事件 / Intent 类型定义
 * 基于腾讯 QQ 开放平台：https://bot.q.qq.com/wiki
 */

import type { Message, Member, User, Guild, Channel } from './message.js';

// ── WebSocket OpCode ──────────────────────────────────────────────────────────

/** WebSocket 操作码 */
export const enum OpCode {
  /** 服务端推送事件 */
  DISPATCH        = 0,
  /** 客户端发送心跳 */
  HEARTBEAT       = 1,
  /** 客户端鉴权 */
  IDENTIFY        = 2,
  /** 客户端断线重连 */
  RESUME          = 6,
  /** 服务端要求重连 */
  RECONNECT       = 7,
  /** session 无效 */
  INVALID_SESSION = 9,
  /** 连接成功，服务端发来 */
  HELLO           = 10,
  /** 心跳 ACK */
  HEARTBEAT_ACK   = 11,
}

// ── Dispatch 事件名 ───────────────────────────────────────────────────────────

export const GatewayEvent = {
  READY: 'READY',
  RESUMED: 'RESUMED',

  GUILD_CREATE: 'GUILD_CREATE',
  GUILD_UPDATE: 'GUILD_UPDATE',
  GUILD_DELETE: 'GUILD_DELETE',

  CHANNEL_CREATE: 'CHANNEL_CREATE',
  CHANNEL_UPDATE: 'CHANNEL_UPDATE',
  CHANNEL_DELETE: 'CHANNEL_DELETE',

  GUILD_MEMBER_ADD:    'GUILD_MEMBER_ADD',
  GUILD_MEMBER_UPDATE: 'GUILD_MEMBER_UPDATE',
  GUILD_MEMBER_REMOVE: 'GUILD_MEMBER_REMOVE',

  MESSAGE_CREATE: 'MESSAGE_CREATE',
  MESSAGE_DELETE: 'MESSAGE_DELETE',

  AT_MESSAGE_CREATE:    'AT_MESSAGE_CREATE',
  PUBLIC_MESSAGE_DELETE:'PUBLIC_MESSAGE_DELETE',

  DIRECT_MESSAGE_CREATE: 'DIRECT_MESSAGE_CREATE',
  DIRECT_MESSAGE_DELETE: 'DIRECT_MESSAGE_DELETE',

  MESSAGE_REACTION_ADD:    'MESSAGE_REACTION_ADD',
  MESSAGE_REACTION_REMOVE: 'MESSAGE_REACTION_REMOVE',

  AUDIO_START:   'AUDIO_START',
  AUDIO_FINISH:  'AUDIO_FINISH',
  AUDIO_ON_MIC:  'AUDIO_ON_MIC',
  AUDIO_OFF_MIC: 'AUDIO_OFF_MIC',

  MESSAGE_AUDIT_PASS:   'MESSAGE_AUDIT_PASS',
  MESSAGE_AUDIT_REJECT: 'MESSAGE_AUDIT_REJECT',

  INTERACTION_CREATE: 'INTERACTION_CREATE',

  FORUM_THREAD_CREATE:  'FORUM_THREAD_CREATE',
  FORUM_THREAD_UPDATE:  'FORUM_THREAD_UPDATE',
  FORUM_THREAD_DELETE:  'FORUM_THREAD_DELETE',
  FORUM_POST_CREATE:    'FORUM_POST_CREATE',
  FORUM_POST_DELETE:    'FORUM_POST_DELETE',
  FORUM_REPLY_CREATE:   'FORUM_REPLY_CREATE',
  FORUM_REPLY_DELETE:   'FORUM_REPLY_DELETE',

  OPEN_FORUM_THREAD_CREATE: 'OPEN_FORUM_THREAD_CREATE',
  OPEN_FORUM_THREAD_UPDATE: 'OPEN_FORUM_THREAD_UPDATE',
  OPEN_FORUM_THREAD_DELETE: 'OPEN_FORUM_THREAD_DELETE',
  OPEN_FORUM_POST_CREATE:   'OPEN_FORUM_POST_CREATE',
  OPEN_FORUM_POST_DELETE:   'OPEN_FORUM_POST_DELETE',
  OPEN_FORUM_REPLY_CREATE:  'OPEN_FORUM_REPLY_CREATE',
  OPEN_FORUM_REPLY_DELETE:  'OPEN_FORUM_REPLY_DELETE',
} as const;

export type GatewayEventName = typeof GatewayEvent[keyof typeof GatewayEvent];

// ── Intent 位标志 ─────────────────────────────────────────────────────────────

/**
 * 事件订阅意图（按位 OR 组合）
 *
 * @example
 * ```ts
 * const intents = Intents.PUBLIC_GUILD_MESSAGES | Intents.DIRECT_MESSAGE;
 * ```
 */
export const Intents = {
  /** 频道事件 */
  GUILDS:                        1 << 0,
  /** 频道成员事件 */
  GUILD_MEMBERS:                 1 << 1,
  /** 私域消息（MESSAGE_CREATE） */
  GUILD_MESSAGES:                1 << 9,
  /** 消息表情表态 */
  GUILD_MESSAGE_REACTIONS:       1 << 10,
  /** 私信事件 */
  DIRECT_MESSAGE:                1 << 12,
  /** 开放论坛事件 */
  OPEN_FORUMS_EVENT:             1 << 18,
  /** 音视频成员事件 */
  AUDIO_OR_LIVE_CHANNEL_MEMBER:  1 << 19,
  /** 单聊消息（C2C） */
  C2C_MESSAGE_CREATE:            1 << 25,
  /** 互动事件 */
  INTERACTION:                   1 << 26,
  /** 消息审核事件 */
  MESSAGE_AUDIT:                 1 << 27,
  /** 私域论坛事件 */
  FORUMS_EVENT:                  1 << 28,
  /** 公域 AT 消息（AT_MESSAGE_CREATE） */
  PUBLIC_GUILD_MESSAGES:         1 << 30,
} as const;

export type IntentsValue = typeof Intents[keyof typeof Intents];

// ── WebSocket 帧结构 ──────────────────────────────────────────────────────────

/** WebSocket 消息帧 */
export interface GatewayPayload<T = unknown> {
  op: OpCode;
  d?: T;
  /** 序列号（仅 op=0 时有） */
  s?: number;
  /** 事件名称（仅 op=0 时有） */
  t?: string;
}

/** HELLO 帧的 d 字段 */
export interface HelloData {
  heartbeat_interval: number;
}

/** IDENTIFY 帧的 d 字段 */
export interface IdentifyData {
  token: string;
  intents: number;
  shard?: [number, number];
  properties?: Record<string, string>;
}

/** RESUME 帧的 d 字段 */
export interface ResumeData {
  token: string;
  session_id: string;
  seq: number;
}

/** READY 事件数据 */
export interface ReadyEventData {
  version: number;
  session_id: string;
  user: User;
  shard?: [number, number];
}

// ── 具体事件载荷类型 ───────────────────────────────────────────────────────────

/** 成员事件数据（含 guild_id） */
export interface GuildMemberEventData extends Member {
  guild_id: string;
}

/** 消息删除事件数据 */
export interface MessageDeleteEventData {
  message: Message;
  op_user: { id: string };
}

/** 表情对象 */
export interface Emoji {
  id: string;
  /** 1-系统表情，2-emoji */
  type: 1 | 2;
}

/** 消息表情表态事件数据 */
export interface MessageReactionEventData {
  user_id: string;
  guild_id: string;
  channel_id: string;
  target: { id: string; type: number };
  emoji: Emoji;
}

/** 音频事件数据 */
export interface AudioEventData {
  audio_url?: string;
  text?: string;
  guild_id?: string;
  channel_id?: string;
}

/** 消息审核事件数据 */
export interface MessageAuditEventData {
  audit_id: string;
  message_id?: string;
  guild_id: string;
  channel_id: string;
  audit_time: string;
  create_time: string;
  seq_in_channel: string;
}

/** 互动事件数据 */
export interface InteractionEventData {
  id: string;
  application_id: string;
  type: number;
  data: { type: number; resolved?: Record<string, unknown> };
  guild_id?: string;
  channel_id?: string;
  user_id?: string;
  version: number;
}

// ── 客户端事件映射（用于 TypeScript 类型推断） ────────────────────────────────

/**
 * Client 可监听的全部事件及其参数类型
 * 使用 `client.on('event', (...args) => {})` 时 IDE 可自动推断参数类型
 */
export interface ClientEventMap {
  ready:               [ReadyEventData];
  resumed:             [];
  at_message_create:   [Message];
  message_create:      [Message];
  message_delete:      [MessageDeleteEventData];
  direct_message_create: [Message];
  direct_message_delete: [MessageDeleteEventData];
  guild_create:        [Guild];
  guild_update:        [Guild];
  guild_delete:        [Guild];
  channel_create:      [Channel];
  channel_update:      [Channel];
  channel_delete:      [Channel];
  guild_member_add:    [GuildMemberEventData];
  guild_member_update: [GuildMemberEventData];
  guild_member_remove: [GuildMemberEventData];
  message_reaction_add:    [MessageReactionEventData];
  message_reaction_remove: [MessageReactionEventData];
  audio_start:   [AudioEventData];
  audio_finish:  [AudioEventData];
  audio_on_mic:  [AudioEventData];
  audio_off_mic: [AudioEventData];
  message_audit_pass:   [MessageAuditEventData];
  message_audit_reject: [MessageAuditEventData];
  interaction_create:   [InteractionEventData];
  /** 所有原始 WebSocket 帧（调试用） */
  raw_message: [GatewayPayload];
  error:       [Error];
  disconnect:  [{ code: number; reason: string }];
}
