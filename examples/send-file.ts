/**
 * 发送文件 / 图片示例
 *
 * 演示三种发送图片的方式：
 *  1. 图片 URL（最简单）
 *  2. 本地文件（读取为 Buffer，multipart 上传）
 *  3. 从网络下载图片后转发
 *
 * 运行方式：
 *   node --experimental-strip-types examples/send-file.ts
 */

import { readFile } from 'node:fs/promises';
import { Client, Intents } from '../dist/index.js';

const APP_ID = process.env['QQ_APP_ID'] ?? 'YOUR_APP_ID';
const TOKEN  = process.env['QQ_TOKEN']  ?? 'YOUR_TOKEN';

const client = new Client({
  appId:   APP_ID,
  token:   TOKEN,
  intents: Intents.PUBLIC_GUILD_MESSAGES,
});

client.on('ready', ({ user }) => {
  console.log(`✅ ${user.username} 已就绪`);
});

client.on('at_message_create', async (msg) => {
  const channelId = msg.channel_id!;
  const text      = (msg.content ?? '').trim();

  // ── 命令路由 ──────────────────────────────────────────────────────────────

  if (text.includes('图片url')) {
    // ── 方式一：发送图片 URL ─────────────────────────────────────────────────
    console.log('发送图片 URL...');
    await client.sendMessage(channelId, {
      image:  'https://www.qq.com/favicon.ico',
      content: '这是一张通过 URL 发送的图片 ↑',
      msg_id: msg.id,
    });

  } else if (text.includes('本地图片')) {
    // ── 方式二：发送本地图片文件（Buffer）────────────────────────────────────
    console.log('读取本地文件并上传...');
    try {
      // 读取本地图片文件为 Buffer（Uint8Array）
      const imageBuffer = await readFile('./examples/assets/sample.png');
      await client.sendFileMessage(channelId, {
        file_image: imageBuffer,   // Uint8Array（Node Buffer extends Uint8Array）
        filename:   'sample.png',
        content:    '这是一张本地上传的图片 ↑',
        msg_id:     msg.id,
      });
      console.log('✅ 本地图片发送成功');
    } catch (err) {
      console.error('读取文件失败:', err);
      await client.reply(msg, '❌ 找不到本地图片文件，请确保 examples/assets/sample.png 存在');
    }

  } else if (text.includes('下载图片')) {
    // ── 方式三：下载网络图片后以文件形式发送 ────────────────────────────────
    console.log('下载图片...');
    try {
      // 使用 Node 24 原生 fetch 下载图片
      const resp = await fetch('https://www.qq.com/favicon.ico');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      // ArrayBuffer → Uint8Array
      const arrayBuffer = await resp.arrayBuffer();
      const imageData   = new Uint8Array(arrayBuffer);

      await client.sendFileMessage(channelId, {
        file_image: imageData,
        filename:   'favicon.ico',
        content:    '从网络下载并转发的图片 ↑',
        msg_id:     msg.id,
      });
      console.log('✅ 下载图片发送成功');
    } catch (err) {
      console.error('下载失败:', err);
      await client.reply(msg, '❌ 下载图片失败');
    }

  } else if (text.includes('markdown')) {
    // ── 方式四：Markdown 消息 ─────────────────────────────────────────────────
    await client.sendMessage(channelId, {
      markdown: {
        content: '## 你好！\n这是一条 **Markdown** 消息\n- 支持列表\n- 支持**加粗**',
      },
      msg_id: msg.id,
    });

  } else {
    // 帮助提示
    await client.reply(msg, [
      '📖 文件发送示例命令：',
      '• @bot 图片url     → 发送 URL 图片',
      '• @bot 本地图片    → 上传本地文件',
      '• @bot 下载图片    → 下载后转发',
      '• @bot markdown    → 发送 Markdown',
    ].join('\n'));
  }
});

client.on('error', (err) => console.error('❌', err.message));

console.log('🚀 启动文件发送示例...');
client.start().catch((err: unknown) => {
  console.error('启动失败:', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  client.stop();
  process.exit(0);
});
