var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-fqDde3/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// _worker.js
async function handleConfigApi(request, env, ctx) {
  const url = new URL(request.url);
  const method = request.method;
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };
  if (method === "OPTIONS") {
    return new Response(null, { headers });
  }
  if (method === "HEAD" && url.pathname.startsWith("/api/config/sources/")) {
    try {
      const sourceKey = url.pathname.split("/").pop();
      const source = await env.DB.prepare(
        "SELECT source_key FROM sources WHERE source_key = ?"
      ).bind(sourceKey).first();
      if (source) {
        return new Response(null, { status: 200, headers });
      } else {
        return new Response(null, { status: 404, headers });
      }
    } catch (error) {
      return new Response(null, { status: 500, headers });
    }
  }
  if (method === "GET" && url.pathname === "/api/config") {
    try {
      const configResult = await env.DB.prepare(
        "SELECT use_std_name, primary_chinese_source FROM config WHERE id = 'default'"
      ).first();
      const sourcesResult = await env.DB.prepare(
        "SELECT source_key, source_url, is_active FROM sources"
      ).all();
      return new Response(JSON.stringify({
        config: configResult || {},
        sources: sourcesResult?.results || []
      }), { headers });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    }
  }
  if (method === "PUT" && url.pathname === "/api/config") {
    try {
      const data = await request.json();
      if (data.config) {
        await env.DB.prepare(
          "UPDATE config SET use_std_name = ?, primary_chinese_source = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 'default'"
        ).bind(
          data.config.use_std_name ? 1 : 0,
          data.config.primary_chinese_source
        ).run();
      }
      return new Response(JSON.stringify({ success: true }), { headers });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    }
  }
  if (method === "POST" && url.pathname === "/api/config/sources") {
    try {
      const data = await request.json();
      if (!data.source_key || !data.source_url) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers });
      }
      await env.DB.prepare(
        "INSERT INTO sources (source_key, source_url) VALUES (?, ?)"
      ).bind(
        data.source_key,
        data.source_url
      ).run();
      return new Response(JSON.stringify({ success: true }), { headers });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    }
  }
  if (method === "PUT" && url.pathname.startsWith("/api/config/sources/")) {
    try {
      const sourceKey = url.pathname.split("/").pop();
      const data = await request.json();
      await env.DB.prepare(
        "UPDATE sources SET source_url = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE source_key = ?"
      ).bind(
        data.source_url,
        data.is_active ? 1 : 0,
        sourceKey
      ).run();
      return new Response(JSON.stringify({ success: true }), { headers });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    }
  }
  if (method === "DELETE" && url.pathname.startsWith("/api/config/sources/")) {
    try {
      const sourceKey = url.pathname.split("/").pop();
      await env.DB.prepare(
        "DELETE FROM sources WHERE source_key = ?"
      ).bind(sourceKey).run();
      return new Response(JSON.stringify({ success: true }), { headers });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    }
  }
  return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
}
__name(handleConfigApi, "handleConfigApi");
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/hello") {
      return new Response("ok\n", { headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    if (url.pathname.startsWith("/api/config")) {
      return await handleConfigApi(request, env, ctx);
    }
    if (url.pathname === "/merged.m3u" || url.pathname === "/chinese.m3u") {
      try {
        const debug = url.searchParams.get("debug");
        const isChineseOnly = url.pathname === "/chinese.m3u";
        const configParam = url.searchParams.get("config");
        const useStdName = url.searchParams.get("useStdName") === "1";
        const SOURCE_MAP = {};
        let config = {
          sources: [],
          primaryChineseSource: "",
          useStdName: true
          // 默认使用标准化名称
        };
        try {
          const dbConfig = await env.DB.prepare(
            "SELECT use_std_name, primary_chinese_source FROM config WHERE id = 'default'"
          ).first();
          if (dbConfig) {
            config.useStdName = dbConfig.use_std_name === 1;
            const dbSources = await env.DB.prepare(
              "SELECT source_key, source_url FROM sources WHERE is_active = 1"
            ).all();
            if (dbSources && dbSources.results && dbSources.results.length > 0) {
              dbSources.results.forEach((source) => {
                SOURCE_MAP[source.source_key] = source.source_url;
              });
              config.sources = dbSources.results.map((source) => source.source_url);
              if (dbConfig.primary_chinese_source) {
                config.primaryChineseSource = SOURCE_MAP[dbConfig.primary_chinese_source] || dbConfig.primary_chinese_source;
              }
            }
          } else {
            await env.DB.prepare(
              "INSERT INTO config (id, use_std_name, primary_chinese_source) VALUES ('default', 1, 'm3u888')"
            ).run();
            config.useStdName = true;
            config.primaryChineseSource = "m3u888";
            const defaultSources = [
              { key: "aktv", url: "https://aktv.space/live.m3u", is_active: 1 },
              { key: "iptv-org", url: "https://iptv-org.github.io/iptv/index.m3u", is_active: 1 },
              { key: "m3u888", url: "https://m3u888.zabc.net/get.php?username=tg_1660325115&password=abaf9ae6&token=52d66cf8283a9a8f0cac98032fdd1dd891403fd5aeb5bd2afc67ac337c3241be&type=m3u", is_active: 1 }
            ];
            const batch = [];
            for (const source of defaultSources) {
              batch.push(
                env.DB.prepare(
                  "INSERT INTO sources (source_key, source_url, is_active) VALUES (?, ?, ?)"
                ).bind(source.key, source.url, source.is_active)
              );
              SOURCE_MAP[source.key] = source.url;
              config.sources.push(source.url);
            }
            await env.DB.batch(batch);
          }
        } catch (error) {
          console.error("Error fetching config from D1:", error);
          const defaultSources = [
            { key: "aktv", url: "https://aktv.space/live.m3u" },
            { key: "iptv-org", url: "https://iptv-org.github.io/iptv/index.m3u" },
            { key: "m3u888", url: "https://m3u888.zabc.net/get.php?username=tg_1660325115&password=abaf9ae6&token=52d66cf8283a9a8f0cac98032fdd1dd891403fd5aeb5bd2afc67ac337c3241be&type=m3u" }
          ];
          defaultSources.forEach((source) => {
            SOURCE_MAP[source.key] = source.url;
            config.sources.push(source.url);
          });
          config.primaryChineseSource = "https://m3u888.zabc.net/get.php?username=tg_1660325115&password=abaf9ae6&token=52d66cf8283a9a8f0cac98032fdd1dd891403fd5aeb5bd2afc67ac337c3241be&type=m3u";
        }
        const sourceMapParam = url.searchParams.get("sourceMap");
        if (sourceMapParam) {
          try {
            const customSourceMap = {};
            sourceMapParam.split(",").forEach((pair) => {
              const [key, value] = pair.split("=").map(decodeURIComponent);
              if (key && value) {
                customSourceMap[key] = value;
                SOURCE_MAP[key] = value;
              }
            });
          } catch (e) {
            console.warn("Invalid sourceMap parameter:", e);
          }
        }
        const sourcesParam = url.searchParams.get("sources");
        if (sourcesParam) {
          const sourcesList = sourcesParam.split(",").map((s) => s.trim());
          config.sources = sourcesList.map((s) => SOURCE_MAP[s] || s);
        }
        const primaryParam = url.searchParams.get("primaryChineseSource");
        if (primaryParam) {
          config.primaryChineseSource = SOURCE_MAP[primaryParam] || primaryParam;
        }
        const primaryChineseUrl = url.searchParams.get("primaryChineseUrl");
        if (primaryChineseUrl) {
          config.primaryChineseSource = decodeURIComponent(primaryChineseUrl);
        }
        config.useStdName = useStdName;
        if (configParam) {
          try {
            const decodedConfig = JSON.parse(atob(configParam));
            if (decodedConfig.sources) config.sources = decodedConfig.sources;
            if (decodedConfig.primaryChineseSource) config.primaryChineseSource = decodedConfig.primaryChineseSource;
            if (decodedConfig.useStdName !== void 0) config.useStdName = decodedConfig.useStdName;
          } catch (e) {
            console.warn("Invalid config parameter:", e);
          }
        }
        const SOURCES = config.sources;
        const PRIMARY_CHINESE_SOURCE = config.primaryChineseSource;
        const USE_STD_NAME = config.useStdName;
        const HEADER = "#EXTM3U";
        const standardizeCategory = /* @__PURE__ */ __name((group) => {
          if (!group) return "Uncategorized";
          const g = group.toLowerCase();
          const categoryMap = {
            "news": "News",
            "sport": "Sports",
            "movie": "Movies",
            "music": "Music",
            "kids": "Kids",
            "children": "Kids",
            "documentary": "Documentary",
            "lifestyle": "Lifestyle",
            "entertainment": "Entertainment",
            "comedy": "Comedy",
            "series": "Series",
            "education": "Education",
            "local": "Local",
            "religion": "Religious",
            "shop": "Shopping",
            "Undefined": "Others"
          };
          for (const key in categoryMap) {
            if (g.includes(key)) return categoryMap[key];
          }
          return group;
        }, "standardizeCategory");
        const parseM3U = /* @__PURE__ */ __name((text, source) => {
          const lines = text.split(/\r?\n/).map((l) => l.trim());
          const out = [];
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line || line.startsWith("#EXTM3U")) continue;
            if (line.startsWith("#EXTINF")) {
              const info = line;
              const next = lines[i + 1] || "";
              const stream = next && !next.startsWith("#") ? next : "";
              if (!stream) continue;
              const name = (info.split(",").pop() || "").trim();
              const tvgIdMatch = info.match(/tvg-id=(?:"([^"]*)"|([^\s,]+))/i);
              const groupTitleMatch = info.match(/group-title=(?:"([^"]*)"|([^\s,]+))/i);
              const tvgChnoMatch = info.match(/tvg-chno=(?:"([^"]*)"|([^\s,]+))/i);
              const durationMatch = info.match(/#EXTINF:(-?\d+(?:\.\d+)?)/i);
              const duration = durationMatch ? parseFloat(durationMatch[1]) : -1;
              out.push({
                info,
                url: stream,
                name,
                tvgId: tvgIdMatch ? (tvgIdMatch[1] || tvgIdMatch[2] || "").trim() : "",
                group: groupTitleMatch ? (groupTitleMatch[1] || groupTitleMatch[2] || "").trim() : "",
                tvgChno: tvgChnoMatch ? (tvgChnoMatch[1] || tvgChnoMatch[2] || "").trim() : "",
                duration,
                source
              });
              i++;
            }
          }
          return out;
        }, "parseM3U");
        const dedupe = /* @__PURE__ */ __name((entries) => {
          const byUrl = /* @__PURE__ */ new Set(), byTvg = /* @__PURE__ */ new Set(), out = [];
          for (const e of entries) {
            const uk = e.url.toLowerCase();
            const tk = e.tvgId ? e.tvgId.toLowerCase() : "";
            if (byUrl.has(uk) || tk && byTvg.has(tk)) continue;
            byUrl.add(uk);
            if (tk) byTvg.add(tk);
            out.push(e);
          }
          return out;
        }, "dedupe");
        const serialize = /* @__PURE__ */ __name((entries) => {
          const lines = [HEADER];
          const usedChannelNumbers = /* @__PURE__ */ new Set();
          for (const e of entries) {
            if (e.tvgChno && e.tvgChno.trim() !== "") {
              const num = parseInt(e.tvgChno.trim(), 10);
              if (!isNaN(num) && num > 0) {
                usedChannelNumbers.add(num);
              }
            }
          }
          let nextAvailableChno = 101;
          const findNextAvailableChannel = /* @__PURE__ */ __name(() => {
            while (usedChannelNumbers.has(nextAvailableChno)) {
              nextAvailableChno++;
            }
            return nextAvailableChno;
          }, "findNextAvailableChannel");
          for (const e of entries) {
            let newGroup = e.group;
            if (USE_STD_NAME === "1" || USE_STD_NAME === 1) {
              newGroup = e.isDesignatedChinese ? "\u4E2D\u6587\u9891\u9053" : standardizeCategory(e.group);
            }
            const commaIndex = e.info.lastIndexOf(",");
            if (commaIndex === -1) {
              lines.push(e.info, e.url);
              continue;
            }
            let attributesPart = e.info.substring(0, commaIndex);
            const namePart = e.info.substring(commaIndex);
            if (USE_STD_NAME === "1" || USE_STD_NAME === 1) {
              if (/group-title=/.test(attributesPart)) {
                attributesPart = attributesPart.replace(/group-title=(?:"[^"]*"|[^\s]+)/i, `group-title="${newGroup}"`);
              } else {
                attributesPart += ` group-title="${newGroup}"`;
              }
            }
            let finalChannelNumber;
            const hasExistingChno = e.tvgChno && e.tvgChno.trim() !== "";
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
          return lines.join("\n") + "\n";
        }, "serialize");
        const cache = caches.default;
        const cacheKeyUrl = `https://pages.internal${url.pathname}`;
        const cacheKey = new Request(cacheKeyUrl, { method: "GET" });
        if (!debug) {
          const hit = await cache.match(cacheKey);
          if (hit) return hit;
        }
        const responses = await Promise.all(SOURCES.map(async (src) => {
          const r = await fetch(src, { redirect: "follow" });
          if (!r.ok) console.warn(`Fetch failed ${r.status} ${src}`);
          return { text: r.ok ? await r.text() : "", source: src };
        }));
        let all = responses.flatMap((res) => parseM3U(res.text, res.source));
        all.forEach((e) => {
          const hasChineseChars = /[\u4e00-\u9fa5]/.test(e.name);
          const isFromPrimarySource = e.source === PRIMARY_CHINESE_SOURCE;
          if (isFromPrimarySource || hasChineseChars) {
            e.isDesignatedChinese = true;
            if (USE_STD_NAME === "1" || USE_STD_NAME === 1) {
              e.group = "\u4E2D\u6587\u9891\u9053";
            }
          }
        });
        if (isChineseOnly) {
          all = all.filter((e) => e.isDesignatedChinese);
        }
        const unique = dedupe(all).sort((a, b) => a.name.localeCompare(b.name) || a.tvgId.localeCompare(b.tvgId));
        if (debug) {
          const usedChannelNumbers = /* @__PURE__ */ new Set();
          for (const e of unique) {
            if (e.tvgChno && e.tvgChno.trim() !== "") {
              const num = parseInt(e.tvgChno.trim(), 10);
              if (!isNaN(num) && num > 0) {
                usedChannelNumbers.add(num);
              }
            }
          }
          let nextAvailableChno = 101;
          const findNextAvailableChannel = /* @__PURE__ */ __name(() => {
            while (usedChannelNumbers.has(nextAvailableChno)) {
              nextAvailableChno++;
            }
            return nextAvailableChno;
          }, "findNextAvailableChannel");
          const debugEntries = [];
          for (const e of unique) {
            let finalChannelNumber;
            const hasExistingChno = e.tvgChno && e.tvgChno.trim() !== "";
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
            const finalGroup = USE_STD_NAME === "1" || USE_STD_NAME === 1 ? e.isDesignatedChinese ? "\u4E2D\u6587\u9891\u9053" : standardizeCategory(e.group) : e.group;
            debugEntries.push({
              ...e,
              finalChno: finalChannelNumber,
              finalGroup,
              originalChno: e.tvgChno || "EMPTY"
            });
          }
          const body2 = [
            `=== M3U PLAYLIST DEBUG DIRECTORY ===`,
            `Playlist Type: ${isChineseOnly ? "Chinese Only" : "Merged"}`,
            `Total Sources: ${SOURCES.length}`,
            `Raw Parsed Entries: ${all.length}`,
            `Unique Entries: ${unique.length}`,
            ``,
            `=== COMPLETE CHANNEL DIRECTORY (All ${debugEntries.length} channels) ===`,
            ...debugEntries.map(
              (e, i) => `${String(i + 1).padStart(4, " ")}. [Ch ${String(e.finalChno).padStart(3, " ")}] ${e.name} [${e.finalGroup}]`
            ),
            ``,
            `=== CHANNEL ASSIGNMENT STATISTICS ===`,
            `\u2022 Channels with existing valid numbers: ${debugEntries.filter((e) => e.originalChno !== "EMPTY" && !isNaN(parseInt(e.originalChno))).length}`,
            `\u2022 Channels assigned new numbers: ${debugEntries.filter((e) => e.originalChno === "EMPTY" || isNaN(parseInt(e.originalChno))).length}`,
            `\u2022 Lowest channel number: ${Math.min(...debugEntries.map((e) => e.finalChno))}`,
            `\u2022 Highest channel number: ${Math.max(...debugEntries.map((e) => e.finalChno))}`,
            `\u2022 Next available slot would be: ${nextAvailableChno}`,
            ``,
            `=== DETAILED SAMPLE (First 10 channels) ===`,
            ...debugEntries.slice(0, 10).map(
              (e, i) => `${i + 1}. CHANNEL ${e.finalChno}: "${e.name}"
   Group: [${e.finalGroup}]
   Original chno: ${e.originalChno} | Duration: ${e.duration}
   Stream: ${e.url}
`
            )
          ].join("\n");
          return new Response(body2, { headers: { "content-type": "text/plain; charset=utf-8" } });
        }
        const filename = isChineseOnly ? "chinese.m3u" : "merged.m3u";
        const body = serialize(unique);
        const resp = new Response(body, {
          headers: {
            "content-type": "application/x-mpegURL; charset=utf-8",
            "content-disposition": `attachment; filename="${filename}"`,
            "cache-control": "public, max-age=600, s-maxage=3600"
          }
        });
        await cache.put(cacheKey, resp.clone());
        return resp;
      } catch (err) {
        return new Response(`ERROR: ${err?.message || err}
`, { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
    }
    if (!env.ASSETS) {
      return new Response("Not found", { status: 404 });
    }
    return env.ASSETS.fetch(request);
  }
};

// ../../../../AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-fqDde3/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../../AppData/Roaming/npm/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-fqDde3/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=_worker.js.map
