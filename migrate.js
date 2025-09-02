// 数据库迁移脚本 - 将默认配置迁移到D1数据库

/**
 * 迁移默认配置到D1数据库
 * 使用方法: wrangler d1 execute iptv_config --file=./migrate.js
 */

// 默认源配置
const DEFAULT_SOURCES = [
  { key: 'aktv', url: 'https://aktv.space/live.m3u', is_active: 1 },
  { key: 'iptv-org', url: 'https://iptv-org.github.io/iptv/index.m3u', is_active: 1 },
  { key: 'm3u888', url: 'https://m3u888.zabc.net/get.php?username=tg_1660325115&password=abaf9ae6&token=52d66cf8283a9a8f0cac98032fdd1dd891403fd5aeb5bd2afc67ac337c3241be&type=m3u', is_active: 1 },
  { key: 'epg-best', url: 'https://epg.best/live.m3u', is_active: 1 },
  { key: 'iptv-plus', url: 'https://iptv-plus.net/live.m3u', is_active: 1 }
];

// 默认全局配置
const DEFAULT_CONFIG = {
  use_std_name: 1,
  primary_chinese_source: 'm3u888'
};

// 迁移SQL语句
const MIGRATION_SQL = `
-- 确保表存在
CREATE TABLE IF NOT EXISTS config (
  id TEXT PRIMARY KEY,
  use_std_name INTEGER DEFAULT 1,
  primary_chinese_source TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sources (
  source_key TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 插入默认配置
INSERT OR REPLACE INTO config (id, use_std_name, primary_chinese_source)
VALUES ('default', ${DEFAULT_CONFIG.use_std_name}, '${DEFAULT_CONFIG.primary_chinese_source}');

-- 插入默认源
${DEFAULT_SOURCES.map(source => `INSERT OR REPLACE INTO sources (source_key, source_url, is_active) VALUES ('${source.key}', '${source.url}', ${source.is_active});`).join('\n')}
`;

// 输出迁移SQL
console.log(MIGRATION_SQL);