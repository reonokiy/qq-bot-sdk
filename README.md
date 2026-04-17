# qq-bot-sdk

> 腾讯 QQ 频道机器人 TypeScript SDK  
> 基于 [QQ 开放平台](https://bot.q.qq.com/wiki) 官方协议，运行在 **Node.js 24** 上，**零运行时依赖**。

---

## ✨ 特性

| 特性 | 说明 |
|------|------|
| 🚫 零依赖 | 仅使用 Node.js 24 原生 API：`fetch`、`WebSocket`、`FormData` |
| 🔒 完整类型 | 所有事件、API 参数均有精确 TypeScript 类型，IDE 智能提示完善 |
| ♻️ 自动重连 | 指数退避重连 + RESUME 断线续传，无需手动处理网络抖动 |
| 💓 心跳管理 | 僵尸连接检测（ACK 超时强制重连） |
| 📨 被动/主动消息 | 同时支持 `msg_id` 被动回复和主动推送 |
| 🖼️ 多种图片发送 | URL 直链 / Buffer 上传 / 网络下载转发 |

---

## 📋 环境要求

```
Node.js >= 24.0.0
```

> Node 24 原生支持 `WebSocket`、`fetch`、`FormData`、`File`、`Blob`，无需任何 polyfill。

---

## 📦 安装

```bash
# 克隆到本地后安装 dev 依赖（仅 typescript + @types/node）
npm install

# 编译
npm run build
```

---

## 🚀 快速开始

### 最简示例：收到 @ 消息回复

```typescript
import { Client, Intents } from 'qq-bot-sdk';

const client = new Client({
  appId:   'YOUR_APP_ID',
  token:   'YOUR_TOKEN',
  intents: Intents.PUBLIC_GUILD_MESSAGES | Intents.DIRECT_MESSAGE,
});

// 连接成功
client.on('ready', ({ user }) => {
  console.log(`✅ ${user.username} 已上线`);
});

// 被 @ 时回复
client.on('at_message_create', async (msg) => {
  await client.reply(msg, `你好，<@${msg.author!.id}>！`);
});

// 启动（返回 Promise<User>，READY 后 resolve）
await client.start();
```

---

## 📖 API 文档

### `new Client(options)`

```typescript
interface ClientOptions {
  appId:                string;           // 机器人 AppID
  token:                string;           // 机器人 Token
  intents?:             number;           // 订阅意图（默认：公域消息+私信+成员+频道）
  sandbox?:             boolean;          // 使用沙箱环境，默认 false
  baseUrl?:             string;           // 自定义 API Base URL
  timeout?:             number;           // HTTP 超时（ms），默认 10000
  shard?:               [number, number]; // WS 分片 [当前, 总数]，默认 [0,1]
  maxReconnectAttempts?: number;          // 最大重连次数，-1 无限，默认 10
  reconnectBaseDelay?:  number;           // 重连基础延迟（ms），默认 1000
}
```

### Intents（订阅意图）

```typescript
import { Intents } from 'qq-bot-sdk';

// 按位 OR 组合多个意图
const intents = Intents.PUBLIC_GUILD_MESSAGES  // 公域 AT 消息
              | Intents.DIRECT_MESSAGE         // 私信
              | Intents.GUILD_MEMBERS          // 频道成员变动
              | Intents.GUILDS;               // 频道事件
```

| 常量 | 说明 |
|------|------|
| `GUILDS` | 频道创建/更新/删除 |
| `GUILD_MEMBERS` | 成员加入/更新/离开 |
| `GUILD_MESSAGES` | 频道消息（**仅私域**） |
| `PUBLIC_GUILD_MESSAGES` | AT 消息（**公域**） |
| `DIRECT_MESSAGE` | 私信消息 |
| `GUILD_MESSAGE_REACTIONS` | 表情表态 |
| `MESSAGE_AUDIT` | 消息审核 |
| `INTERACTION` | 互动事件（按钮点击等） |

---

### 事件列表

```typescript
// 所有事件均有精确类型推断

client.on('ready',                ({ user }) => { /* ReadyEventData */ });
client.on('at_message_create',    (msg)      => { /* Message        */ });
client.on('message_create',       (msg)      => { /* Message（私域）*/ });
client.on('direct_message_create',(msg)      => { /* Message        */ });
client.on('message_delete',       (data)     => { /* MessageDeleteEventData */ });

client.on('guild_create',         (guild)    => { /* Guild          */ });
client.on('guild_update',         (guild)    => { /* Guild          */ });
client.on('guild_delete',         (guild)    => { /* Guild          */ });

client.on('channel_create',       (channel)  => { /* Channel        */ });
client.on('channel_update',       (channel)  => { /* Channel        */ });
client.on('channel_delete',       (channel)  => { /* Channel        */ });

client.on('guild_member_add',     (member)   => { /* GuildMemberEventData */ });
client.on('guild_member_update',  (member)   => { /* GuildMemberEventData */ });
client.on('guild_member_remove',  (member)   => { /* GuildMemberEventData */ });

client.on('message_reaction_add',    (data)  => { /* MessageReactionEventData */ });
client.on('message_reaction_remove', (data)  => { /* MessageReactionEventData */ });

client.on('interaction_create',   (data)     => { /* InteractionEventData */ });
client.on('message_audit_pass',   (data)     => { /* MessageAuditEventData */ });
client.on('message_audit_reject', (data)     => { /* MessageAuditEventData */ });

client.on('raw_message',          (payload)  => { /* GatewayPayload（调试用）*/ });
client.on('error',                (err)      => { /* Error           */ });
client.on('disconnect',           ({ code, reason }) => { });
```

---

### 发送消息

#### 文本消息（被动回复）

```typescript
// 快捷方法
await client.reply(msg, '回复内容');

// 完整参数
await client.sendMessage(msg.channel_id!, {
  content: '回复内容',
  msg_id:  msg.id,     // 被动消息必须携带，5 分钟内有效
});
```

#### 发送图片（URL 方式）

```typescript
await client.sendMessage(channelId, {
  image:  'https://example.com/image.png',
  msg_id: msg.id,
});
```

#### 发送图片（文件上传）

```typescript
import { readFile } from 'node:fs/promises';

const buf = await readFile('./image.jpg');  // Buffer extends Uint8Array

await client.sendFileMessage(channelId, {
  file_image: buf,          // Uint8Array | ArrayBuffer | Blob | File
  filename:   'image.jpg',
  msg_id:     msg.id,
});
```

#### 发送 Markdown

```typescript
await client.sendMessage(channelId, {
  markdown: {
    content: '## 标题\n**加粗** _斜体_ `代码`',
  },
  msg_id: msg.id,
});
```

#### 撤回消息

```typescript
await client.deleteMessage(channelId, messageId);
// 管理员直接删除（不给提示）
await client.deleteMessage(channelId, messageId, { hidetip: true });
```

---

### 私信

```typescript
// 方式一：自动创建会话（一步到位）
await client.sendDirectMessage(userId, sourceGuildId, {
  content: '这是一条私信',
});

// 方式二：在 direct_message_create 事件中快速回复
client.on('direct_message_create', async (msg) => {
  await client.replyDirect(msg, '已收到你的私信！');
});
```

---

### 成员管理

```typescript
// 踢人
await client.kickGuildMember(guildId, userId);
await client.kickGuildMember(guildId, userId, { add_blacklist: true });

// 禁言（秒）
await client.muteGuildMember(guildId, userId, 600);  // 禁言 10 分钟

// 解除禁言
await client.unmuteGuildMember(guildId, userId);
```

---

### 底层 HTTP API

`client.api` 暴露完整的 `HttpApi` 实例，可调用所有底层接口：

```typescript
// 获取频道列表
const guilds = await client.api.getUserGuilds();

// 给消息添加表情表态
await client.api.addReaction(channelId, messageId, { type: 1, id: '128' });

// 全体禁言
await client.api.muteGuild(guildId, { mute_seconds: '3600' });

// 给成员添加身份组
await client.api.addMemberRole(guildId, userId, roleId);

// 音频控制
await client.api.audioControl(channelId, {
  audio_url: 'https://example.com/music.mp3',
  status: 0,  // 0=开始播放
});
```

---

### 错误处理

```typescript
import { QQBotApiError } from 'qq-bot-sdk';

try {
  await client.sendMessage(channelId, { content: 'hello' });
} catch (err) {
  if (err instanceof QQBotApiError) {
    console.log('HTTP 状态码:', err.httpStatus);  // 例：429
    console.log('业务错误码:', err.code);          // 例：304023
    console.log('错误信息:',   err.message);
  }
}

// 全局错误监听
client.on('error', (err) => {
  console.error('SDK 内部错误:', err);
});
```

---

## 🏗️ 项目结构

```
qq-bot-sdk/
├── src/
│   ├── index.ts          # 公共 API 出口
│   ├── client.ts         # Client 主类（整合所有模块）
│   ├── http.ts           # HTTP API（原生 fetch，零依赖）
│   ├── websocket.ts      # WebSocket 管理（原生 WS，心跳/重连）
│   ├── event-emitter.ts  # 强类型事件发射器
│   └── types/
│       ├── index.ts      # 类型总出口
│       ├── message.ts    # 消息相关类型
│       ├── events.ts     # 事件 / OpCode / Intents / 事件映射
│       └── api.ts        # HTTP 请求/响应类型
├── dist/                 # 编译输出（.js + .d.ts + .map）
├── examples/
│   ├── basic.ts          # 基础示例：AT 消息回复 + 私信
│   └── send-file.ts      # 发送图片示例（URL / Buffer / 下载转发）
├── package.json          # 零运行时依赖
├── tsconfig.json         # ES2024 target，NodeNext module
└── README.md
```

---

## 🔌 WebSocket 状态机

```
DISCONNECTED
     │ connect()
     ▼
CONNECTING ──── WS open ────► CONNECTED
                                  │ recv HELLO
                                  ▼
                            IDENTIFYING
                    (send IDENTIFY / RESUME)
                                  │ recv READY
                                  ▼
                              READY ◄──── 正常运行
                                  │
                    断线/服务端 RECONNECT
                                  ▼
                           RECONNECTING
                    (指数退避 1s→2s→4s→...→60s)
                                  │ 重试
                                  ▼
                            CONNECTING...
```

---

## 📝 License

MIT
