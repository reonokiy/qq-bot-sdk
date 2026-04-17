/**
 * HTTP API 请求 / 响应类型定义
 * 基于腾讯 QQ 开放平台：https://bot.q.qq.com/wiki
 */

import type { MessageMarkdown, MessageKeyboard, MessageReference } from './message.js';

// ── 发送消息参数 ───────────────────────────────────────────────────────────────

/**
 * 发送频道 / 私信消息参数
 * POST /channels/{channel_id}/messages
 * POST /dms/{guild_id}/messages
 */
export interface SendMessageParams {
  /** 文本内容 */
  content?: string;
  embed?: {
    title?: string;
    description?: string;
    prompt?: string;
    thumbnail?: { url: string };
    fields?: Array<{ name: string }>;
  };
  ark?: {
    template_id: number;
    kv: Array<{
      key: string;
      value?: string;
      obj?: Array<{ obj_kv: Array<{ key: string; value: string }> }>;
    }>;
  };
  /** 引用消息（回复） */
  message_reference?: MessageReference;
  /** 图片 URL（官方字段名 image） */
  image?: string;
  /** 图片 URL 别名（SDK 自动转换为 image） */
  image_url?: string;
  /** 被动回复：原消息 ID（5 分钟内有效） */
  msg_id?: string;
  markdown?: MessageMarkdown;
  keyboard?: MessageKeyboard;
  /** 被动回复：触发事件 ID */
  event_id?: string;
}

/** 发送私信参数（与频道消息相同结构） */
export type SendDirectMessageParams = SendMessageParams;

/**
 * 文件图片消息参数（multipart/form-data）
 * POST /channels/{channel_id}/messages  —  file_image 字段
 */
export interface SendFileMessageParams {
  /**
   * 图片数据。支持：
   * - `Uint8Array` / `ArrayBuffer`（Buffer）
   * - `Blob` / `File`
   * - 任意 `BodyInit` 兼容数据
   */
  file_image: Uint8Array | ArrayBuffer | Blob | File;
  /** 文件名（默认 image.png） */
  filename?: string;
  /** 被动回复：原消息 ID */
  msg_id?: string;
  /** 同时发送的文字内容 */
  content?: string;
  /** 被动回复：事件 ID */
  event_id?: string;
}

// ── 私信会话 ──────────────────────────────────────────────────────────────────

/** 创建私信会话参数 */
export interface CreateDirectMessageSessionParams {
  /** 目标用户 ID */
  recipient_id: string;
  /** 来源频道 ID */
  source_guild_id: string;
}

// ── 消息撤回 ──────────────────────────────────────────────────────────────────

/** 撤回消息参数 */
export interface DeleteMessageParams {
  /** true=管理员直接删除，false=给用户提示（默认） */
  hidetip?: boolean;
}

// ── Gateway ───────────────────────────────────────────────────────────────────

export interface GatewayInfo {
  url: string;
}

export interface GatewayBotInfo extends GatewayInfo {
  shards: number;
  session_start_limit: {
    total: number;
    remaining: number;
    reset_after: number;
    max_concurrency: number;
  };
}

// ── 通用 ──────────────────────────────────────────────────────────────────────

/** API 错误响应体 */
export interface ApiErrorResponse {
  code: number;
  message: string;
  data?: unknown;
}

/** 获取当前用户信息响应 */
export interface GetCurrentUserResponse {
  id: string;
  username: string;
  avatar?: string;
  bot: boolean;
  union_openid?: string;
  union_user_account?: string;
}

/** 获取频道列表参数 */
export interface GetGuildsParams {
  before?: string;
  after?: string;
  limit?: number;
}

/** 表情表态参数 */
export interface ReactionParams {
  /** 1-系统表情，2-emoji */
  type: 1 | 2;
  id: string;
}

/** 音频控制参数 */
export interface AudioControlParams {
  audio_url?: string;
  text?: string;
  /** 0-开始，1-暂停，2-继续，3-停止 */
  status: 0 | 1 | 2 | 3;
}

/** 子频道用户权限 */
export interface ChannelPermissions {
  channel_id: string;
  user_id: string;
  /** 权限位（十六进制字符串） */
  permissions: string;
}

/** 创建公告参数 */
export interface CreateAnnouncesParams {
  message_id?: string;
  channel_id?: string;
  /** 0-成员公告，1-欢迎公告 */
  announces_type?: 0 | 1;
  recommend_channels?: Array<{ channel_id: string; introduce: string }>;
}
