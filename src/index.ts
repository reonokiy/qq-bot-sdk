/**
 * qq-bot-sdk 主入口
 *
 * 腾讯 QQ 频道机器人 TypeScript SDK
 * - 基于 Node.js 24 原生 API（fetch、WebSocket、FormData）
 * - 零运行时依赖
 * - 完整 TypeScript 类型支持
 *
 * @packageDocumentation
 */

// ── 核心类 ────────────────────────────────────────────────────────────────────
export { Client }             from './client.js';
export type { ClientOptions } from './client.js';

export { HttpApi, QQBotApiError, PROD_BASE_URL, SANDBOX_BASE_URL } from './http.js';
export type { HttpApiOptions }                                       from './http.js';

export { WebSocketManager, ConnectionState } from './websocket.js';
export type { WebSocketManagerOptions }       from './websocket.js';

export { TypedEventEmitter, ClientEventEmitter } from './event-emitter.js';

// ── 类型 ──────────────────────────────────────────────────────────────────────
export type {
  // message.ts
  User,
  Member,
  Message,
  MessageAttachment,
  MessageEmbed,
  MessageMarkdown,
  MessageKeyboard,
  MessageReference,
  KeyboardButton,
  KeyboardRow,
  DirectMessageSession,
  Guild,
  Channel,
} from './types/message.js';

export type {
  // events.ts
  GatewayPayload,
  HelloData,
  IdentifyData,
  ResumeData,
  ReadyEventData,
  GuildMemberEventData,
  MessageDeleteEventData,
  Emoji,
  MessageReactionEventData,
  AudioEventData,
  MessageAuditEventData,
  InteractionEventData,
  ClientEventMap,
  GatewayEventName,
  IntentsValue,
} from './types/events.js';

export {
  // events.ts（值，非类型）
  Intents,
  GatewayEvent,
  OpCode,
} from './types/events.js';

export type {
  // api.ts
  SendMessageParams,
  SendDirectMessageParams,
  SendFileMessageParams,
  CreateDirectMessageSessionParams,
  DeleteMessageParams,
  GatewayInfo,
  GatewayBotInfo,
  ApiErrorResponse,
  GetCurrentUserResponse,
  GetGuildsParams,
  ReactionParams,
  AudioControlParams,
  ChannelPermissions,
  CreateAnnouncesParams,
} from './types/api.js';
