/**
 * 基础示例：收到 @ 消息后回复，并响应私信
 *
 * 运行方式（Node.js 24 原生运行 TypeScript）：
 *   node --experimental-strip-types examples/basic.ts
 *
 * 或者先编译再运行：
 *   npm run build
 *   node dist/examples/basic.js   （需调整 tsconfig include）
 */

// 从已编译的 dist 目录引入（或直接用 ts-node / Node 24 strip-types）
import { Client, Intents } from '../dist/index.js';

// ── 配置（实际使用时替换为真实值或从环境变量读取） ─────────────────────────────
const APP_ID = process.env['QQ_APP_ID'] ?? 'YOUR_APP_ID';
const TOKEN  = process.env['QQ_TOKEN']  ?? 'YOUR_TOKEN';

// ── 创建客户端 ────────────────────────────────────────────────────────────────
const client = new Client({
  appId:  APP_ID,
  token:  TOKEN,
  // 订阅：公域 AT 消息 + 私信 + 频道成员 + 频道事件
  intents: Intents.PUBLIC_GUILD_MESSAGES
         | Intents.DIRECT_MESSAGE
         | Intents.GUILD_MEMBERS
         | Intents.GUILDS,
  // sandbox: true,  // 取消注释以使用沙箱环境
});

// ── 事件监听 ──────────────────────────────────────────────────────────────────

/** READY：连接成功 */
client.on('ready', ({ user }) => {
  console.log(`✅ Bot 已上线：${user.username}（ID: ${user.id}）`);
});

/** AT_MESSAGE_CREATE：在频道里被 @ */
client.on('at_message_create', async (msg) => {
  const author  = msg.author?.username ?? '未知用户';
  const content = msg.content ?? '';
  console.log(`📨 收到来自 ${author} 的 @ 消息：${content}`);

  try {
    // 快速回复（自动带上 msg_id，实现被动回复）
    const sent = await client.reply(msg, `你好，<@${msg.author!.id}>！我收到了你的消息 👋`);
    console.log(`✉️  回复成功，消息 ID: ${sent.id}`);
  } catch (err) {
    console.error('❌ 回复失败:', err);
  }
});

/** DIRECT_MESSAGE_CREATE：收到私信 */
client.on('direct_message_create', async (msg) => {
  const content = msg.content ?? '';
  console.log(`💬 收到私信：${content}`);

  try {
    // 回复私信（使用 guild_id = DM 虚拟频道 ID）
    await client.replyDirect(msg, `已收到你的私信：「${content}」`);
    console.log('✉️  私信回复成功');
  } catch (err) {
    console.error('❌ 私信回复失败:', err);
  }
});

/** GUILD_MEMBER_ADD：成员加入频道 */
client.on('guild_member_add', (member) => {
  const name = member.user?.username ?? '新成员';
  console.log(`👋 ${name} 加入了频道 ${member.guild_id}`);
});

/** GUILD_MEMBER_REMOVE：成员离开频道 */
client.on('guild_member_remove', (member) => {
  const name = member.user?.username ?? '某成员';
  console.log(`👋 ${name} 离开了频道 ${member.guild_id}`);
});

/** 连接断开 */
client.on('disconnect', ({ code, reason }) => {
  console.warn(`⚠️  WS 断开 [${code}]: ${reason}`);
});

/** 错误处理 */
client.on('error', (err) => {
  console.error('❌ 发生错误:', err.message);
});

// ── 启动 ──────────────────────────────────────────────────────────────────────
console.log('🚀 正在连接到 QQ 开放平台...');

client.start()
  .then((user) => {
    console.log(`🎉 连接成功！机器人：${user.username}`);
  })
  .catch((err: unknown) => {
    console.error('💥 启动失败:', err);
    process.exit(1);
  });

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n🛑 正在关闭 Bot...');
  client.stop();
  process.exit(0);
});
