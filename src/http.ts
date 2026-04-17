/**
 * HTTP API 封装（基于 Node.js 24 原生 fetch）
 *
 * 零运行时依赖。完整覆盖腾讯 QQ 开放平台 REST API。
 * 文档：https://bot.q.qq.com/wiki/develop/api/
 */

import type {
  GatewayInfo,
  GatewayBotInfo,
  SendMessageParams,
  SendDirectMessageParams,
  SendFileMessageParams,
  CreateDirectMessageSessionParams,
  DeleteMessageParams,
  GetCurrentUserResponse,
  GetGuildsParams,
  AudioControlParams,
  ChannelPermissions,
  CreateAnnouncesParams,
  ApiErrorResponse,
  ReactionParams,
} from './types/api.js';
import type {
  Message,
  DirectMessageSession,
  Guild,
  Channel,
  Member,
} from './types/message.js';

// ── 常量 ──────────────────────────────────────────────────────────────────────

/** 正式环境 API 地址 */
export const PROD_BASE_URL    = 'https://api.sgroup.qq.com';
/** 沙箱环境 API 地址 */
export const SANDBOX_BASE_URL = 'https://sandbox.api.sgroup.qq.com';

// ── 错误类 ────────────────────────────────────────────────────────────────────

/**
 * QQ Bot API 请求错误
 *
 * @example
 * ```ts
 * try {
 *   await client.sendMessage(channelId, { content: 'hi' });
 * } catch (e) {
 *   if (e instanceof QQBotApiError) {
 *     console.log(e.httpStatus, e.code, e.message);
 *   }
 * }
 * ```
 */
export class QQBotApiError extends Error {
  /** HTTP 状态码 */
  public readonly httpStatus: number;
  /** 业务错误码 */
  public readonly code: number;
  /** 原始响应数据 */
  public readonly data: unknown;

  constructor(message: string, httpStatus: number, code: number, data?: unknown) {
    super(message);
    this.name = 'QQBotApiError';
    this.httpStatus = httpStatus;
    this.code = code;
    this.data = data;
  }
}

// ── HttpApi 配置 ──────────────────────────────────────────────────────────────

export interface HttpApiOptions {
  /** 机器人 AppID */
  appId: string;
  /** 机器人 Token */
  token: string;
  /** API Base URL（默认正式环境） */
  baseUrl?: string;
  /** 请求超时毫秒，默认 10000 */
  timeout?: number;
}

// ── 内部工具类型 ──────────────────────────────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions {
  method?: HttpMethod;
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** 直接传入 FormData，不设 Content-Type（让 fetch 自动加 boundary） */
  formData?: FormData;
  signal?: AbortSignal;
}

// ── 主类 ──────────────────────────────────────────────────────────────────────

/**
 * QQ 频道机器人 HTTP API 封装
 *
 * 使用 Node.js 24 原生 `fetch`，零运行时依赖。
 *
 * @example
 * ```ts
 * const api = new HttpApi({ appId: 'xxx', token: 'yyy' });
 * const msg = await api.sendMessage('channel_id', { content: 'Hello!' });
 * ```
 */
export class HttpApi {
  private readonly baseUrl: string;
  private readonly authorization: string;
  private readonly timeout: number;

  constructor(options: HttpApiOptions) {
    this.baseUrl      = (options.baseUrl ?? PROD_BASE_URL).replace(/\/$/, '');
    this.authorization = `Bot ${options.appId}.${options.token}`;
    this.timeout      = options.timeout ?? 10_000;
  }

  // ── 内部请求核心 ────────────────────────────────────────────────────────────

  private buildUrl(path: string, params?: RequestOptions['params']): string {
    const url = new URL(path, this.baseUrl + '/');
    // URL 构造时 base 必须有斜线结尾，path 不以斜线开头；此处手动拼接更可靠
    const fullUrl = new URL(this.baseUrl + path);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) fullUrl.searchParams.set(k, String(v));
      }
    }
    // 消除 TS unused variable 警告
    void url;
    return fullUrl.toString();
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', params, body, formData } = options;

    const url = this.buildUrl(path, params);

    const headers: Record<string, string> = {
      Authorization: this.authorization,
      'X-Union-Appid': this.authorization.split(' ')[1]?.split('.')[0] ?? '',
    };

    let bodyInit: FormData | string | undefined;

    if (formData) {
      // 使用原生 FormData，不手动设 Content-Type（fetch 自动加 boundary）
      bodyInit = formData;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      bodyInit = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: bodyInit,
        signal: controller.signal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new QQBotApiError(`Network error: ${msg}`, 0, 0, null);
    } finally {
      clearTimeout(timeoutId);
    }

    // 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    // 解析响应体
    let responseData: unknown;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    if (!response.ok) {
      const errBody = responseData as Partial<ApiErrorResponse>;
      throw new QQBotApiError(
        errBody?.message ?? `HTTP ${response.status}`,
        response.status,
        errBody?.code ?? response.status,
        errBody?.data,
      );
    }

    return responseData as T;
  }

  // ── 快捷方法 ────────────────────────────────────────────────────────────────

  private get<T>(path: string, params?: RequestOptions['params']): Promise<T> {
    return this.request<T>(path, { method: 'GET', params });
  }

  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body });
  }

  private postForm<T>(path: string, formData: FormData): Promise<T> {
    return this.request<T>(path, { method: 'POST', formData });
  }

  private put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body });
  }

  private patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body });
  }

  private delete<T>(path: string, body?: unknown, params?: RequestOptions['params']): Promise<T> {
    return this.request<T>(path, { method: 'DELETE', body, params });
  }

  // ── Gateway ─────────────────────────────────────────────────────────────────

  /** GET /gateway */
  getGateway(): Promise<GatewayInfo> {
    return this.get<GatewayInfo>('/gateway');
  }

  /** GET /gateway/bot（含分片建议） */
  getGatewayBot(): Promise<GatewayBotInfo> {
    return this.get<GatewayBotInfo>('/gateway/bot');
  }

  // ── 用户 ────────────────────────────────────────────────────────────────────

  /** GET /users/@me */
  getCurrentUser(): Promise<GetCurrentUserResponse> {
    return this.get<GetCurrentUserResponse>('/users/@me');
  }

  /** GET /users/@me/guilds */
  getUserGuilds(params?: GetGuildsParams): Promise<Guild[]> {
    return this.get<Guild[]>('/users/@me/guilds', params as Record<string, string>);
  }

  // ── 频道 ────────────────────────────────────────────────────────────────────

  /** GET /guilds/{guild_id} */
  getGuild(guildId: string): Promise<Guild> {
    return this.get<Guild>(`/guilds/${guildId}`);
  }

  // ── 子频道 ──────────────────────────────────────────────────────────────────

  /** GET /channels/{channel_id} */
  getChannel(channelId: string): Promise<Channel> {
    return this.get<Channel>(`/channels/${channelId}`);
  }

  /** GET /guilds/{guild_id}/channels */
  getChannels(guildId: string): Promise<Channel[]> {
    return this.get<Channel[]>(`/guilds/${guildId}/channels`);
  }

  // ── 消息 ────────────────────────────────────────────────────────────────────

  /** GET /channels/{channel_id}/messages/{message_id} */
  getMessage(channelId: string, messageId: string): Promise<Message> {
    return this.get<Message>(`/channels/${channelId}/messages/${messageId}`);
  }

  /**
   * 发送频道消息（JSON）
   * POST /channels/{channel_id}/messages
   *
   * @example
   * ```ts
   * // 回复消息
   * await api.sendMessage('channel_id', { content: '收到！', msg_id: msg.id });
   * // 发送图片 URL
   * await api.sendMessage('channel_id', { image: 'https://...', msg_id: msg.id });
   * ```
   */
  sendMessage(channelId: string, params: SendMessageParams): Promise<Message> {
    // 兼容 image_url 别名 → 转为官方的 image 字段
    const body: Record<string, unknown> = { ...params };
    if (params.image_url && !params.image) {
      body['image'] = params.image_url;
    }
    delete body['image_url'];
    return this.post<Message>(`/channels/${channelId}/messages`, body);
  }

  /**
   * 发送频道图片（文件流）
   * POST /channels/{channel_id}/messages  —  multipart/form-data
   *
   * 使用 Node.js 24 原生 FormData + Blob，无需第三方库。
   *
   * @example
   * ```ts
   * import { readFile } from 'node:fs/promises';
   * const buf = await readFile('./cat.jpg');
   * await api.sendFileMessage('channel_id', {
   *   file_image: buf,
   *   filename: 'cat.jpg',
   *   msg_id: msg.id,
   * });
   * ```
   */
  sendFileMessage(channelId: string, params: SendFileMessageParams): Promise<Message> {
    const form = new FormData();

    // 将图片数据包装为 Blob/File 后追加
    const fileData = params.file_image;
    const filename = params.filename ?? 'image.png';

    if (fileData instanceof File) {
      form.append('file_image', fileData, filename);
    } else if (fileData instanceof Blob) {
      form.append('file_image', new File([fileData], filename));
    } else {
      // Uint8Array | ArrayBuffer → Blob → File
      const blob = new Blob([fileData]);
      form.append('file_image', new File([blob], filename));
    }

    if (params.content)  form.append('content',  params.content);
    if (params.msg_id)   form.append('msg_id',   params.msg_id);
    if (params.event_id) form.append('event_id', params.event_id);

    return this.postForm<Message>(`/channels/${channelId}/messages`, form);
  }

  /**
   * 撤回消息
   * DELETE /channels/{channel_id}/messages/{message_id}
   */
  deleteMessage(
    channelId: string,
    messageId: string,
    params?: DeleteMessageParams,
  ): Promise<void> {
    return this.delete<void>(
      `/channels/${channelId}/messages/${messageId}`,
      undefined,
      params as Record<string, string>,
    );
  }

  // ── 私信 ────────────────────────────────────────────────────────────────────

  /**
   * 创建私信会话
   * POST /users/@me/dms
   */
  createDirectMessageSession(
    params: CreateDirectMessageSessionParams,
  ): Promise<DirectMessageSession> {
    return this.post<DirectMessageSession>('/users/@me/dms', params);
  }

  /**
   * 发送私信消息
   * POST /dms/{guild_id}/messages
   */
  sendDirectMessage(guildId: string, params: SendDirectMessageParams): Promise<Message> {
    return this.post<Message>(`/dms/${guildId}/messages`, params);
  }

  /**
   * 撤回私信消息
   * DELETE /dms/{guild_id}/messages/{message_id}
   */
  deleteDirectMessage(
    guildId: string,
    messageId: string,
    params?: DeleteMessageParams,
  ): Promise<void> {
    return this.delete<void>(
      `/dms/${guildId}/messages/${messageId}`,
      undefined,
      params as Record<string, string>,
    );
  }

  // ── 成员 ────────────────────────────────────────────────────────────────────

  /** GET /guilds/{guild_id}/members/{user_id} */
  getGuildMember(guildId: string, userId: string): Promise<Member> {
    return this.get<Member>(`/guilds/${guildId}/members/${userId}`);
  }

  /** GET /guilds/{guild_id}/members */
  getGuildMembers(
    guildId: string,
    params?: { after?: string; limit?: number },
  ): Promise<Member[]> {
    return this.get<Member[]>(
      `/guilds/${guildId}/members`,
      params as Record<string, string>,
    );
  }

  /**
   * 踢出成员
   * DELETE /guilds/{guild_id}/members/{user_id}
   */
  removeGuildMember(
    guildId: string,
    userId: string,
    options?: {
      add_blacklist?: boolean;
      delete_history_msg_days?: -1 | 0 | 3 | 7 | 15 | 30;
    },
  ): Promise<void> {
    return this.delete<void>(`/guilds/${guildId}/members/${userId}`, options);
  }

  // ── 身份组 ──────────────────────────────────────────────────────────────────

  /** GET /guilds/{guild_id}/roles */
  getGuildRoles(guildId: string): Promise<unknown> {
    return this.get(`/guilds/${guildId}/roles`);
  }

  /** PUT /guilds/{guild_id}/members/{user_id}/roles/{role_id} */
  addMemberRole(
    guildId: string,
    userId: string,
    roleId: string,
    channelId?: string,
  ): Promise<void> {
    const body = channelId ? { id: channelId, type: 5 } : undefined;
    return this.put<void>(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, body);
  }

  /** DELETE /guilds/{guild_id}/members/{user_id}/roles/{role_id} */
  removeMemberRole(
    guildId: string,
    userId: string,
    roleId: string,
    channelId?: string,
  ): Promise<void> {
    const body = channelId ? { id: channelId, type: 5 } : undefined;
    return this.delete<void>(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, body);
  }

  // ── 禁言 ────────────────────────────────────────────────────────────────────

  /** PATCH /guilds/{guild_id}/members/{user_id}/mute */
  muteGuildMember(
    guildId: string,
    userId: string,
    options: { mute_end_timestamp?: string; mute_seconds?: string },
  ): Promise<void> {
    return this.patch<void>(`/guilds/${guildId}/members/${userId}/mute`, options);
  }

  /** 解除禁言（mute_seconds=0） */
  unmuteGuildMember(guildId: string, userId: string): Promise<void> {
    return this.patch<void>(`/guilds/${guildId}/members/${userId}/mute`, {
      mute_seconds: '0',
    });
  }

  /** PATCH /guilds/{guild_id}/mute（全体禁言） */
  muteGuild(
    guildId: string,
    options: { mute_end_timestamp?: string; mute_seconds?: string },
  ): Promise<void> {
    return this.patch<void>(`/guilds/${guildId}/mute`, options);
  }

  // ── 表情表态 ─────────────────────────────────────────────────────────────────

  /** PUT /channels/{channel_id}/messages/{message_id}/reactions/{type}/{id} */
  addReaction(channelId: string, messageId: string, emoji: ReactionParams): Promise<void> {
    return this.put<void>(
      `/channels/${channelId}/messages/${messageId}/reactions/${emoji.type}/${emoji.id}`,
    );
  }

  /** DELETE /channels/{channel_id}/messages/{message_id}/reactions/{type}/{id} */
  deleteReaction(channelId: string, messageId: string, emoji: ReactionParams): Promise<void> {
    return this.delete<void>(
      `/channels/${channelId}/messages/${messageId}/reactions/${emoji.type}/${emoji.id}`,
    );
  }

  /** GET /channels/{channel_id}/messages/{message_id}/reactions/{type}/{id} */
  getReactionUsers(
    channelId: string,
    messageId: string,
    emoji: ReactionParams,
    params?: { cookie?: string; limit?: number },
  ): Promise<{ users: unknown[]; cookie: string; is_end: boolean }> {
    return this.get(
      `/channels/${channelId}/messages/${messageId}/reactions/${emoji.type}/${emoji.id}`,
      params as Record<string, string>,
    );
  }

  // ── 公告 ────────────────────────────────────────────────────────────────────

  /** POST /guilds/{guild_id}/announces */
  createAnnounces(guildId: string, params: CreateAnnouncesParams): Promise<unknown> {
    return this.post(`/guilds/${guildId}/announces`, params);
  }

  /** DELETE /guilds/{guild_id}/announces/{message_id} */
  deleteAnnounces(guildId: string, messageId: string): Promise<void> {
    return this.delete<void>(`/guilds/${guildId}/announces/${messageId}`);
  }

  // ── 子频道权限 ───────────────────────────────────────────────────────────────

  /** GET /channels/{channel_id}/members/{user_id}/permissions */
  getChannelMemberPermissions(
    channelId: string,
    userId: string,
  ): Promise<ChannelPermissions> {
    return this.get<ChannelPermissions>(
      `/channels/${channelId}/members/${userId}/permissions`,
    );
  }

  /** PUT /channels/{channel_id}/members/{user_id}/permissions */
  updateChannelMemberPermissions(
    channelId: string,
    userId: string,
    permissions: { add?: string; remove?: string },
  ): Promise<void> {
    return this.put<void>(
      `/channels/${channelId}/members/${userId}/permissions`,
      permissions,
    );
  }

  // ── 音频 ────────────────────────────────────────────────────────────────────

  /** POST /channels/{channel_id}/audio */
  audioControl(channelId: string, params: AudioControlParams): Promise<unknown> {
    return this.post(`/channels/${channelId}/audio`, params);
  }
}
