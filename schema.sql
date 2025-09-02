-- D1数据库模型设计 - IPTV配置存储

-- 删除现有表（如果存在）
DROP TABLE IF EXISTS config;
DROP TABLE IF EXISTS sources;

-- 创建配置表 - 存储全局配置如useStdName
CREATE TABLE config (
  id TEXT PRIMARY KEY,  -- 配置项ID，如'default'
  use_std_name BOOLEAN DEFAULT 1,  -- 是否使用标准化名称
  primary_chinese_source TEXT,  -- 主要中文源的键名或URL
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建源表 - 存储IPTV源配置
CREATE TABLE sources (
  source_key TEXT PRIMARY KEY,  -- 源的键名，如'aktv', 'iptv-org'
  source_url TEXT NOT NULL,  -- 源的URL
  is_active BOOLEAN DEFAULT 1,  -- 是否启用
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 插入默认配置
INSERT INTO config (id, use_std_name, primary_chinese_source)
VALUES ('default', 1, 'm3u888');

-- 插入默认源
INSERT INTO sources (source_key, source_url)
VALUES 
  ('aktv', 'https://aktv.space/live.m3u'),
  ('iptv-org', 'https://iptv-org.github.io/iptv/index.m3u'),
  ('m3u888', 'https://m3u888.zabc.net/get.php?username=tg_1660325115&password=abaf9ae6&token=52d66cf8283a9a8f0cac98032fdd1dd891403fd5aeb5bd2afc67ac337c3241be&type=m3u');