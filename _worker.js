// Cloudflare Pages "Advanced" routing worker (no Functions folder needed)
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1) Quick health check
    if (url.pathname === '/hello') {
      return new Response('ok\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }

    // 2) Generate a playlist (merged or Chinese-only)
    if (url.pathname === '/merged.m3u' || url.pathname === '/chinese.m3u') {
      try {
        const debug = url.searchParams.get('debug');
        const isChineseOnly = url.pathname === '/chinese.m3u';

        // Configuration can be updated via URL parameters for flexibility
        const configParam = url.searchParams.get('config');
        const useStdName = url.searchParams.get('useStdName') === '1'; // 新参数：控制是否标准化频道名称
        
        // 定义源URL的键值对映射 - 使用键值对系统简化配置
        const SOURCE_MAP = {
          'aktv': 'https://aktv.space/live.m3u',
          'iptv-org': 'https://iptv-org.github.io/iptv/index.m3u',
          'm3u888': 'https://m3u888.zabc.net/get.php?username=tg_1660325115&password=abaf9ae6&token=52d66cf8283a9a8f0cac98032fdd1dd891403fd5aeb5bd2afc67ac337c3241be&type=m3u'
          // 可以轻松添加更多源映射
        };
        
        let config = {
          sources: [
            SOURCE_MAP['aktv'],
            SOURCE_MAP['iptv-org'],
            SOURCE_MAP['m3u888']
          ],
          primaryChineseSource: SOURCE_MAP['m3u888'],
          useStdName: true // 默认使用标准化名称
        };
        
        // 处理sourceMap参数 - 允许自定义源键值对映射
        const sourceMapParam = url.searchParams.get('sourceMap');
        if (sourceMapParam) {
          try {
            // 解析sourceMap参数
            const customSourceMap = {};
            sourceMapParam.split(',').forEach(pair => {
              const [key, value] = pair.split('=').map(decodeURIComponent);
              if (key && value) {
                customSourceMap[key] = value;
                // 添加到全局SOURCE_MAP
                SOURCE_MAP[key] = value;
              }
            });
          } catch (e) {
            console.warn('Invalid sourceMap parameter:', e);
          }
        }
        
        // 从URL参数获取源配置（支持键名或完整URL）
        const sourcesParam = url.searchParams.get('sources');
        if (sourcesParam) {
          const sourcesList = sourcesParam.split(',').map(s => s.trim());
          config.sources = sourcesList.map(s => SOURCE_MAP[s] || s); // 如果在映射中找到键，使用映射的URL，否则使用原始值
        }
        
        // 从URL参数获取主要中文源（支持键名或完整URL）
        const primaryParam = url.searchParams.get('primaryChineseSource');
        if (primaryParam) {
          config.primaryChineseSource = SOURCE_MAP[primaryParam] || primaryParam;
        }
        
        // 处理primaryChineseUrl参数 - 直接指定主要中文源URL
        const primaryChineseUrl = url.searchParams.get('primaryChineseUrl');
        if (primaryChineseUrl) {
          config.primaryChineseSource = decodeURIComponent(primaryChineseUrl);
        }
        
        // 设置是否使用标准化名称 - 根据URL参数控制是否修改group-title
        config.useStdName = useStdName;
        
        // Allow updating configuration via URL parameter (base64 encoded JSON)
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
        
        const SOURCES = config.sources;
        const PRIMARY_CHINESE_SOURCE = config.primaryChineseSource;
        const USE_STD_NAME = config.useStdName;
        const HEADER = '#EXTM3U';

        const standardizeCategory = (group) => {
          if (!group) return 'Uncategorized';
          const g = group.toLowerCase();
          const categoryMap = {
            'news': 'News', 'sport': 'Sports', 'movie': 'Movies', 'music': 'Music', 'kids': 'Kids',
            'children': 'Kids', 'documentary': 'Documentary', 'lifestyle': 'Lifestyle',
            'entertainment': 'Entertainment', 'comedy': 'Comedy', 'series': 'Series',
            'education': 'Education', 'local': 'Local', 'religion': 'Religious', 'shop': 'Shopping',
            'Undefined': 'Others',
          };
          for (const key in categoryMap) {
            if (g.includes(key)) return categoryMap[key];
          }
          return group;
        };

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
              
              // Extract duration from EXTINF line (e.g., #EXTINF:-1 or #EXTINF:120)
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
        
        // --- FIXED: Robust channel number assignment logic (for all channels) ---
        const serialize = (entries) => {
          const lines = [HEADER];
          const usedChannelNumbers = new Set();
          
          // First pass: collect all existing valid channel numbers from all entries
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

          // Process ALL entries (removed the duration === -1 condition)
          for (const e of entries) {
            // 根据useStdName参数决定是否标准化组名
            let newGroup = e.group;
            if (USE_STD_NAME === '1' || USE_STD_NAME === 1) {
                // 如果是中文频道，设置为'中文频道'，否则标准化类别
                newGroup = e.isDesignatedChinese ? '中文频道' : standardizeCategory(e.group);
            }
            
            const commaIndex = e.info.lastIndexOf(',');
            if (commaIndex === -1) {
                lines.push(e.info, e.url); // Push unmodified if format is unexpected
                continue;
            }
            
            let attributesPart = e.info.substring(0, commaIndex);
            const namePart = e.info.substring(commaIndex);

            // 只有在启用标准化名称时才修改group-title
            if (USE_STD_NAME === '1' || USE_STD_NAME === 1) {
                // Handle group-title: replace if present, otherwise append.
                if (/group-title=/.test(attributesPart)) {
                    attributesPart = attributesPart.replace(/group-title=(?:"[^"]*"|[^\s]+)/i, `group-title="${newGroup}"`);
                } else {
                    attributesPart += ` group-title="${newGroup}"`;
                }
            }

            // Handle tvg-chno for ALL channels (regardless of duration)
            let finalChannelNumber;
            
            // Check if channel has a valid existing tvg-chno
            const hasExistingChno = e.tvgChno && e.tvgChno.trim() !== '';
            if (hasExistingChno) {
              const existingChnoNum = parseInt(e.tvgChno.trim(), 10);
              if (!isNaN(existingChnoNum) && existingChnoNum > 0) {
                // Keep the existing valid channel number
                finalChannelNumber = existingChnoNum;
              } else {
                // Invalid channel number, assign a new one
                finalChannelNumber = findNextAvailableChannel();
                usedChannelNumbers.add(finalChannelNumber);
                nextAvailableChno++;
              }
            } else {
              // No channel number or empty, assign a new one
              finalChannelNumber = findNextAvailableChannel();
              usedChannelNumbers.add(finalChannelNumber);
              nextAvailableChno++;
            }
            
            // Always ensure tvg-chno is present: replace if present, otherwise append.
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
            // 使用更全面的中文字符范围匹配
            const hasChineseChars = /[\u4e00-\u9fa5]/.test(e.name);
            // 确保正确比较源URL，使用严格相等
            const isFromPrimarySource = e.source === PRIMARY_CHINESE_SOURCE;
            
            // 标记中文频道
            if (isFromPrimarySource || hasChineseChars) {
                e.isDesignatedChinese = true;
                
                // 如果启用了标准化名称，将所有中文频道的组名设置为'中文频道'
                if (USE_STD_NAME === '1' || USE_STD_NAME === 1) {
                    e.group = '中文频道';
                }
            }
        });

        if (isChineseOnly) { all = all.filter(e => e.isDesignatedChinese); }

        const unique = dedupe(all).sort((a, b) => a.name.localeCompare(b.name) || a.tvgId.localeCompare(b.tvgId));

        if (debug) {
          // Simulate the exact channel number assignment logic used in serialize()
          const usedChannelNumbers = new Set();
          
          // First pass: collect all existing valid channel numbers from all entries
          for (const e of unique) {
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

          // Process each entry to assign channel numbers (same logic as serialize)
          const debugEntries = [];
          for (const e of unique) {
            let finalChannelNumber;
            const hasExistingChno = e.tvgChno && e.tvgChno.trim() !== '';
            
            if (hasExistingChno) {
              const existingChnoNum = parseInt(e.tvgChno.trim(), 10);
              if (!isNaN(existingChnoNum) && existingChnoNum > 0) {
                // Keep the existing valid channel number
                finalChannelNumber = existingChnoNum;
              } else {
                // Invalid channel number, assign a new one
                finalChannelNumber = findNextAvailableChannel();
                usedChannelNumbers.add(finalChannelNumber);
                nextAvailableChno++;
              }
            } else {
              // No channel number or empty, assign a new one
              finalChannelNumber = findNextAvailableChannel();
              usedChannelNumbers.add(finalChannelNumber);
              nextAvailableChno++;
            }
            
            // 根据useStdName参数决定是否标准化组名
            const finalGroup = (USE_STD_NAME === '1' || USE_STD_NAME === 1) ? 
                (e.isDesignatedChinese ? '中文频道' : standardizeCategory(e.group)) : 
                e.group;
            debugEntries.push({
              ...e,
              finalChno: finalChannelNumber,
              finalGroup: finalGroup,
              originalChno: e.tvgChno || 'EMPTY'
            });
          }

          const body = [
            `=== M3U PLAYLIST DEBUG DIRECTORY ===`,
            `Playlist Type: ${isChineseOnly ? 'Chinese Only' : 'Merged'}`,
            `Total Sources: ${SOURCES.length}`,
            `Raw Parsed Entries: ${all.length}`,
            `Unique Entries: ${unique.length}`,
            ``,
            `=== COMPLETE CHANNEL DIRECTORY (All ${debugEntries.length} channels) ===`,
            ...debugEntries.map((e, i) => 
              `${String(i + 1).padStart(4, ' ')}. [Ch ${String(e.finalChno).padStart(3, ' ')}] ${e.name} [${e.finalGroup}]`
            ),
            ``,
            `=== CHANNEL ASSIGNMENT STATISTICS ===`,
            `• Channels with existing valid numbers: ${debugEntries.filter(e => e.originalChno !== 'EMPTY' && !isNaN(parseInt(e.originalChno))).length}`,
            `• Channels assigned new numbers: ${debugEntries.filter(e => e.originalChno === 'EMPTY' || isNaN(parseInt(e.originalChno))).length}`,
            `• Lowest channel number: ${Math.min(...debugEntries.map(e => e.finalChno))}`,
            `• Highest channel number: ${Math.max(...debugEntries.map(e => e.finalChno))}`,
            `• Next available slot would be: ${nextAvailableChno}`,
            ``,
            `=== DETAILED SAMPLE (First 10 channels) ===`,
            ...debugEntries.slice(0, 10).map((e, i) => 
              `${i + 1}. CHANNEL ${e.finalChno}: "${e.name}"\n   Group: [${e.finalGroup}]\n   Original chno: ${e.originalChno} | Duration: ${e.duration}\n   Stream: ${e.url}\n`
            )
          ].join('\n');
          
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

    return env.ASSETS.fetch(request);
  }

};
