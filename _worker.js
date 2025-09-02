// Cloudflare Pages "Advanced" routing worker (no Functions folder needed)

// KV Namespace binding is expected to be "CONFIG_KV"

// --- START: API HANDLER FOR KV ---
async function handleConfigApi(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  const kv = env.CONFIG_KV;

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (method === 'OPTIONS') {
    return new Response(null, { headers });
  }
  
  // Helper to check if KV binding exists
  if (!kv) {
    return new Response(JSON.stringify({ error: 'KV namespace "CONFIG_KV" not found. Please check your wrangler.toml configuration.' }), { status: 500, headers });
  }

  // Check source existence (HEAD or GET)
  if ((method === 'HEAD' || method === 'GET') && url.pathname.startsWith('/api/config/sources/') && url.pathname.split('/').length === 5) {
    const sourceKey = url.pathname.split('/').pop();
    const data = await kv.get(`source:${sourceKey}`, { type: 'json' });
    const status = data !== null ? 200 : 404;
    return new Response(JSON.stringify(data || {}), { status, headers });
  }

  // Get all configuration (GET)
  if (method === 'GET' && url.pathname === '/api/config') {
    try {
      const configPromise = kv.get('config', { type: 'json' });
      const sourceKeysPromise = kv.list({ prefix: 'source:' });
      
      const [config, sourceKeys] = await Promise.all([configPromise, sourceKeysPromise]);
      
      const sourcePromises = sourceKeys.keys.map(key => kv.get(key.name, { type: 'json' }).then(value => ({
        source_key: key.name.replace('source:', ''),
        source_url: value.url,
        is_active: value.is_active
      })));
      
      const sources = await Promise.all(sourcePromises);

      return new Response(JSON.stringify({
        config: config || {},
        sources: sources || []
      }), { headers });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    }
  }

  // Update global config (PUT)
  if (method === 'PUT' && url.pathname === '/api/config') {
    try {
      const data = await request.json();
      if (data.config) {
        await kv.put('config', JSON.stringify(data.config));
      }
      return new Response(JSON.stringify({ success: true }), { headers });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    }
  }

  // Add a new source (POST)
  if (method === 'POST' && url.pathname === '/api/config/sources') {
    try {
      const data = await request.json();
      if (!data.source_key || !data.source_url) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers });
      }
      const value = { url: data.source_url, is_active: 1 };
      await kv.put(`source:${data.source_key}`, JSON.stringify(value));
      return new Response(JSON.stringify({ success: true }), { headers });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    }
  }

  // Update a source (PUT)
  if (method === 'PUT' && url.pathname.startsWith('/api/config/sources/')) {
    try {
      const sourceKey = url.pathname.split('/').pop();
      const data = await request.json();
      const value = { url: data.source_url, is_active: data.is_active ? 1 : 0 };
      await kv.put(`source:${sourceKey}`, JSON.stringify(value));
      return new Response(JSON.stringify({ success: true }), { headers });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    }
  }

  // Delete a source (DELETE)
  if (method === 'DELETE' && url.pathname.startsWith('/api/config/sources/')) {
    try {
      const sourceKey = url.pathname.split('/').pop();
      await kv.delete(`source:${sourceKey}`);
      return new Response(JSON.stringify({ success: true }), { headers });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });
}
// --- END: API HANDLER FOR KV ---


export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!env.CONFIG_KV) {
      return new Response(JSON.stringify({ error: 'KV namespace "CONFIG_KV" not found. Please check your wrangler.toml configuration.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/hello') {
      return new Response('ok\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    
    if (url.pathname.startsWith('/api/config')) {
      return await handleConfigApi(request, env);
    }

    if (url.pathname === '/merged.m3u' || url.pathname === '/chinese.m3u') {
      try {
        const debug = url.searchParams.get('debug');
        const isChineseOnly = url.pathname === '/chinese.m3u';
        const useStdNameParam = url.searchParams.get('useStdName');

        // --- START: LOAD CONFIG FROM KV ---
        let dbConfig, dbSources;
        const SOURCE_MAP = {};
        
        try {
            dbConfig = await env.CONFIG_KV.get('config', { type: 'json' });
            const sourceKeys = await env.CONFIG_KV.list({ prefix: 'source:' });
            
            const sourcePromises = sourceKeys.keys.map(async (key) => {
                const value = await env.CONFIG_KV.get(key.name, { type: 'json' });
                if (value.is_active === 1) {
                    return {
                        key: key.name.replace('source:', ''),
                        url: value.url
                    };
                }
                return null;
            });
            
            dbSources = (await Promise.all(sourcePromises)).filter(Boolean); // Filter out inactive/null sources

        } catch (e) {
            return new Response(`Error reading from KV: ${e.message}`, { status: 500 });
        }
        
        // Handle case where KV is empty (first run)
        if (!dbConfig || !dbSources || dbSources.length === 0) {
            // In a real scenario, you might want to auto-initialize,
            // but for now, we'll return an error directing the user to run the init script.
            return new Response('Configuration not found in KV. Please run the `initialize-kv.js` script.', { status: 500 });
        }
        
        dbSources.forEach(source => {
            SOURCE_MAP[source.key] = source.url;
        });

        const config = {
          sources: dbSources.map(s => s.url),
          primaryChineseSource: SOURCE_MAP[dbConfig.primary_chinese_source] || '',
          // 已移除标准化频道名称和分组功能
        };
        // --- END: LOAD CONFIG FROM KV ---

        // --- URL Parameter Overrides (this logic remains the same) ---
        const sourcesParam = url.searchParams.get('sources');
        if (sourcesParam) {
          config.sources = sourcesParam.split(',').map(s => SOURCE_MAP[s.trim()] || s.trim());
        }

        const primaryParam = url.searchParams.get('primaryChineseSource');
        if (primaryParam) {
          config.primaryChineseSource = SOURCE_MAP[primaryParam] || primaryParam;
        }
        
        const primaryChineseUrl = url.searchParams.get('primaryChineseUrl');
        if (primaryChineseUrl) {
          config.primaryChineseSource = decodeURIComponent(primaryChineseUrl);
        }
        
        const configParam = url.searchParams.get('config');
        if (configParam) {
          try {
            const decodedConfig = JSON.parse(atob(configParam));
            if (decodedConfig.sources) config.sources = decodedConfig.sources;
            if (decodedConfig.primaryChineseSource) config.primaryChineseSource = decodedConfig.primaryChineseSource;
            if (decodedConfig.useStdName !== undefined) config.useStdName = decodedConfig.useStdName;
          } catch (e) {
            console.warn('Invalid config parameter:', e);
          }
        }
        // --- End of URL Overrides ---

        // The entire M3U processing logic below this line is IDENTICAL to your original file.
        // No changes are needed here.
        
        const SOURCES = config.sources;
        const PRIMARY_CHINESE_SOURCE = config.primaryChineseSource;
        // 已移除标准化频道名称和分组功能
        const HEADER = '#EXTM3U';

        // 已移除标准化频道名称和分组功能

        const parseM3U = (text, source) => {
          const lines = text.split(/\r?\n/).map(l => l.trim());
          const out = [];
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line || line.startsWith('#EXTM3U')) continue;
            if (line.startsWith('#EXTINF')) {
              const info = line;
              const next = lines[i + 1] || '';
              const stream = next && !next.startsWith('#') ? next : '';
              if (!stream) continue;

              const name = (info.split(',').pop() || '').trim();
              const tvgIdMatch = info.match(/tvg-id=(?:"([^"]*)"|([^\s,]+))/i);
              const groupTitleMatch = info.match(/group-title=(?:"([^"]*)"|([^\s,]+))/i);
              const tvgChnoMatch = info.match(/tvg-chno=(?:"([^"]*)"|([^\s,]+))/i);
              
              const durationMatch = info.match(/#EXTINF:(-?\d+(?:\.\d+)?)/i);
              const duration = durationMatch ? parseFloat(durationMatch[1]) : -1;

              out.push({
                info, url: stream, name,
                tvgId: tvgIdMatch ? (tvgIdMatch[1] || tvgIdMatch[2] || '').trim() : '',
                group: groupTitleMatch ? (groupTitleMatch[1] || groupTitleMatch[2] || '').trim() : '',
                tvgChno: tvgChnoMatch ? (tvgChnoMatch[1] || tvgChnoMatch[2] || '').trim() : '',
                duration: duration,
                source: source
              });
              i++;
            }
          }
          return out;
        };

        const dedupe = (entries) => {
          const byUrl = new Set(), byTvg = new Set(), out = [];
          for (const e of entries) {
            const uk = e.url.toLowerCase();
            const tk = e.tvgId ? e.tvgId.toLowerCase() : '';
            if (byUrl.has(uk) || (tk && byTvg.has(tk))) continue;
            byUrl.add(uk);
            if (tk) byTvg.add(tk);
            out.push(e);
          }
          return out;
        };
        
        const serialize = (entries) => {
          const lines = [HEADER];
          const usedChannelNumbers = new Set();
          
          for (const e of entries) {
            if (e.tvgChno && e.tvgChno.trim() !== '') {
              const num = parseInt(e.tvgChno.trim(), 10);
              if (!isNaN(num) && num > 0) {
                usedChannelNumbers.add(num);
              }
            }
          }

          let nextAvailableChno = 101;
          const findNextAvailableChannel = () => {
            while (usedChannelNumbers.has(nextAvailableChno)) {
              nextAvailableChno++;
            }
            return nextAvailableChno;
          };

          for (const e of entries) {
            let newGroup = e.group;
            // 已移除标准化频道名称和分组功能
            newGroup = e.group;
            
            const commaIndex = e.info.lastIndexOf(',');
            if (commaIndex === -1) {
                lines.push(e.info, e.url);
                continue;
            }
            
            let attributesPart = e.info.substring(0, commaIndex);
            const namePart = e.info.substring(commaIndex);

            if (USE_STD_NAME) {
                if (/group-title=/.test(attributesPart)) {
                    attributesPart = attributesPart.replace(/group-title=(?:"[^"]*"|[^\s]+)/i, `group-title="${newGroup}"`);
                } else {
                    attributesPart += ` group-title="${newGroup}"`;
                }
            }

            let finalChannelNumber;
            const hasExistingChno = e.tvgChno && e.tvgChno.trim() !== '';
            if (hasExistingChno) {
              const existingChnoNum = parseInt(e.tvgChno.trim(), 10);
              if (!isNaN(existingChnoNum) && existingChnoNum > 0) {
                finalChannelNumber = existingChnoNum;
              } else {
                finalChannelNumber = findNextAvailableChannel();
                usedChannelNumbers.add(finalChannelNumber);
                nextAvailableChno++;
              }
            } else {
              finalChannelNumber = findNextAvailableChannel();
              usedChannelNumbers.add(finalChannelNumber);
              nextAvailableChno++;
            }
            
            if (/tvg-chno=/.test(attributesPart)) {
                attributesPart = attributesPart.replace(/tvg-chno=(?:"[^"]*"|[^\s]+)/i, `tvg-chno="${finalChannelNumber}"`);
            } else {
                attributesPart += ` tvg-chno="${finalChannelNumber}"`;
            }

            lines.push(attributesPart + namePart, e.url);
          }
          return lines.join('\n') + '\n';
        };

        const cache = caches.default;
        const cacheKeyUrl = `https://pages.internal${url.pathname}`;
        const cacheKey = new Request(cacheKeyUrl, { method: 'GET' });
        if (!debug) { const hit = await cache.match(cacheKey); if (hit) return hit; }

        const responses = await Promise.all(SOURCES.map(async (src) => {
          const r = await fetch(src, { redirect: 'follow' });
          if (!r.ok) console.warn(`Fetch failed ${r.status} ${src}`);
          return { text: r.ok ? await r.text() : '', source: src };
        }));

        let all = responses.flatMap(res => parseM3U(res.text, res.source));

        all.forEach(e => {
            const hasChineseChars = /[\u4e00-\u9fa5]/.test(e.name);
            const isFromPrimarySource = e.source === PRIMARY_CHINESE_SOURCE;
            // 如果有指定主要中文源，则只将该源中的频道标记为中文频道
            // 如果没有指定主要中文源，则将所有包含中文字符的频道标记为中文频道
            if ((PRIMARY_CHINESE_SOURCE && isFromPrimarySource) || (!PRIMARY_CHINESE_SOURCE && hasChineseChars)) {
                e.isDesignatedChinese = true;
            }
        });

        if (isChineseOnly) { all = all.filter(e => e.isDesignatedChinese); }

        const unique = dedupe(all).sort((a, b) => a.name.localeCompare(b.name) || a.tvgId.localeCompare(b.tvgId));

        if (debug) {
            // Debug logic remains the same
            const usedChannelNumbers = new Set();
            for (const e of unique) {
                if (e.tvgChno && e.tvgChno.trim() !== '') {
                const num = parseInt(e.tvgChno.trim(), 10);
                if (!isNaN(num) && num > 0) usedChannelNumbers.add(num);
                }
            }
            let nextAvailableChno = 101;
            const findNextAvailableChannel = () => {
                while (usedChannelNumbers.has(nextAvailableChno)) nextAvailableChno++;
                return nextAvailableChno;
            };
            const debugEntries = unique.map(e => {
                let finalChannelNumber;
                const hasExistingChno = e.tvgChno && e.tvgChno.trim() !== '';
                if (hasExistingChno) {
                    const num = parseInt(e.tvgChno.trim(), 10);
                    finalChannelNumber = !isNaN(num) && num > 0 ? num : findNextAvailableChannel();
                } else {
                    finalChannelNumber = findNextAvailableChannel();
                }
                if (!usedChannelNumbers.has(finalChannelNumber)) {
                    usedChannelNumbers.add(finalChannelNumber);
                }
                const finalGroup = e.group;
                return { ...e, finalChno: finalChannelNumber, finalGroup, originalChno: e.tvgChno || 'EMPTY' };
            });
            // 生成详细的debug信息
            const groupedEntries = {};
            debugEntries.forEach(entry => {
                if (!groupedEntries[entry.finalGroup]) {
                    groupedEntries[entry.finalGroup] = [];
                }
                groupedEntries[entry.finalGroup].push(entry);
            });
            
            const debugLines = [
                `总频道数: ${debugEntries.length}`,
                `总分组数: ${Object.keys(groupedEntries).length}`,
                '\n分组频道列表:'
            ];
            
            Object.keys(groupedEntries).sort().forEach(group => {
                const entries = groupedEntries[group];
                debugLines.push(`\n分组: ${group} (${entries.length}个频道)`);
                entries.sort((a, b) => a.finalChno - b.finalChno).forEach(entry => {
                    debugLines.push(`  ${entry.finalChno}: ${entry.name} [${entry.tvgId || 'NO-ID'}] (原始频道号: ${entry.originalChno})`);
                });
            });
            
            const body = debugLines.join('\n');
            return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
        }
        
        const filename = isChineseOnly ? 'chinese.m3u' : 'merged.m3u';
        const body = serialize(unique);
        const resp = new Response(body, {
          headers: {
            'content-type': 'application/x-mpegURL; charset=utf-8',
            'content-disposition': `attachment; filename="${filename}"`,
            'cache-control': 'public, max-age=600, s-maxage=3600'
          }
        });
        await cache.put(cacheKey, resp.clone());
        return resp;

      } catch (err) {
        return new Response(`ERROR: ${err?.message || err}\n`, { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
    }

    if (!env.ASSETS) {
      return new Response('Not found', { status: 404 });
    }
    return env.ASSETS.fetch(request);
  }
};