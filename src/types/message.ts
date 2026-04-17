/**
 * 消息相关类型定义
 * 基于腾讯 QQ 开放平台官方文档：https://bot.q.qq.com/wiki
 */

/** 用户 / 机器人基本信息 */
export interface User {
  /** 用户 ID */
  id: string;
  /** 用户名 */
  username: string;
  /** 头像 URL */
  avatar?: string;
  /** 是否是机器人 */
  bot?: boolean;
  /** 跨频道唯一标识 */
  union_openid?: string;
  /** 用户在频道的 union 账号 */
  union_user_account?: string;
}

/** 频道成员信息 */
export interface Member {
  /** 用户信息 */
  user?: User;
  /** 频道内昵称 */
  nick?: string;
  /** 拥有的身份组 ID 列表 */
  roles?: string[];
  /** 加入频道时间（ISO8601） */
  joined_at?: string;
  /** 是否被禁言 */
  deaf?: boolean;
  /** 是否静音 */
  mute?: boolean;
  /** 是否待审核 */
  pending?: boolean;
  /** 所在频道 ID */
  guild_id?: string;
}

/** 消息附件（图片 / 文件） */
export interface MessageAttachment {
  /** 附件 ID */
  id?: string;
  /** 文件名 */
  filename: string;
  /** 文件大小（字节） */
  size?: number;
  /** CDN URL */
  url: string;
  /** 代理 URL */
  proxy_url?: string;
  /** 图片高度（仅图片） */
  height?: number;
  /** 图片宽度（仅图片） */
  width?: number;
  /** MIME 类型 */
  content_type?: string;
}

/** 消息 embed */
export interface MessageEmbed {
  title?: string;
  description?: string;
  /** 提示词，覆盖显示在正文中 */
  prompt?: string;
  thumbnail?: { url: string };
  fields?: Array<{ name: string }>;
}

/** Markdown 消息内容 */
export interface MessageMarkdown {
  /** 模板 ID */
  template_id?: number;
  /** 自定义 Markdown 文本 */
  content?: string;
  /** 模板参数 */
  params?: Array<{ key: string; values: string[] }>;
}

/** 按钮渲染数据 */
export interface ButtonRenderData {
  label: string;
  visited_label: string;
  /** 0-灰色不可点击，1-蓝色可点击 */
  style: 0 | 1;
}

/** 按钮操作权限 */
export interface ButtonPermission {
  /** 0-指定用户，1-管理员，2-所有人，3-指定身份组 */
  type: 0 | 1 | 2 | 3;
  specify_role_ids?: string[];
  specify_user_ids?: string[];
}

/** 按钮操作数据 */
export interface ButtonAction {
  /** 0-跳转，1-回调，2-指令 */
  type: 0 | 1 | 2;
  permission: ButtonPermission;
  click_limit?: number;
  data: string;
  reply?: boolean;
  enter?: boolean;
  at_bot_show_channel_list?: boolean;
}

/** 单个按钮 */
export interface KeyboardButton {
  id?: string;
  render_data: ButtonRenderData;
  action: ButtonAction;
}

/** 按钮行 */
export interface KeyboardRow {
  buttons: KeyboardButton[];
}

/** 消息键盘 */
export interface MessageKeyboard {
  id?: string;
  content?: { rows: KeyboardRow[] };
}

/** 消息引用（回复） */
export interface MessageReference {
  /** 被引用消息 ID */
  message_id: string;
  /** 被引用消息不存在时是否忽略错误 */
  ignore_get_message_error?: boolean;
}

/** 完整消息对象 */
export interface Message {
  /** 消息 ID */
  id: string;
  /** 所在频道 ID */
  guild_id?: string;
  /** 所在子频道 ID */
  channel_id?: string;
  /** 消息文本内容 */
  content?: string;
  /** 发送时间（ISO8601） */
  timestamp?: string;
  /** 编辑时间 */
  edited_timestamp?: string;
  /** 是否 @全体 */
  mention_everyone?: boolean;
  /** 发送者 */
  author?: User;
  /** 发送者频道成员信息 */
  member?: Member;
  /** 附件列表 */
  attachments?: MessageAttachment[];
  /** embed 列表 */
  embeds?: MessageEmbed[];
  /** 被 @ 的用户列表 */
  mentions?: User[];
  pinned?: boolean;
  type?: number;
  flags?: number;
  /** 引用的消息（回复） */
  message_reference?: MessageReference;
  /** Markdown 内容 */
  markdown?: MessageMarkdown;
  /** 按钮 */
  keyboard?: MessageKeyboard;
  /** DM 场景下的虚拟 guild_id */
  src_guild_id?: string;
  seq?: number;
  seq_in_channel?: string;
}

/** 私信会话对象 */
export interface DirectMessageSession {
  /** DM 虚拟频道 ID（后续发消息用） */
  guild_id: string;
  /** 子频道 ID */
  channel_id: string;
  /** 创建时间 */
  create_time?: string;
}

/** 频道信息 */
export interface Guild {
  id: string;
  name: string;
  icon?: string;
  owner_id?: string;
  owner?: boolean;
  member_count?: number;
  max_members?: number;
  description?: string;
  joined_at?: string;
}

/** 子频道信息 */
export interface Channel {
  id: string;
  guild_id: string;
  name: string;
  type: number;
  sub_type?: number;
  position?: number;
  parent_id?: string;
  owner_id?: string;
  private_type?: number;
  speak_permission?: number;
  application_id?: string;
  permissions?: string;
}
