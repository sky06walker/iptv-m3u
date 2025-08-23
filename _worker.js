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

        const SOURCES = [
          'https://aktv.space/live.m3u',
          'https://iptv-org.github.io/iptv/index.m3u'
        ];
        const PRIMARY_CHINESE_SOURCE = 'https://aktv.space/live.m3u';
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
            const newGroup = e.isDesignatedChinese ? e.group : standardizeCategory(e.group);
            
            const commaIndex = e.info.lastIndexOf(',');
            if (commaIndex === -1) {
                lines.push(e.info, e.url); // Push unmodified if format is unexpected
                continue;
            }
            
            let attributesPart = e.info.substring(0, commaIndex);
            const namePart = e.info.substring(commaIndex);

            // Handle group-title: replace if present, otherwise append.
            if (/group-title=/.test(attributesPart)) {
                attributesPart = attributesPart.replace(/group-title=(?:"[^"]*"|[^\s]+)/i, `group-title="${newGroup}"`);
            } else {
                attributesPart += ` group-title="${newGroup}"`;
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
            const hasChineseChars = /[\u4e00-\u9fa5]/.test(e.name);
            const isFromPrimarySource = e.source === PRIMARY_CHINESE_SOURCE;
            if (isFromPrimarySource || hasChineseChars) {
                e.isDesignatedChinese = true;
                e.group = '中文频道';
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
            
            const finalGroup = e.isDesignatedChinese ? e.group : standardizeCategory(e.group);
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
