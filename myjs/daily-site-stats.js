/**
 * Add daily PV/UV deltas to Fluid's LeanCloud footer statistics.
 *
 * The theme stores total counters in LeanCloud as:
 * - site-pv
 * - site-uv
 *
 * This script keeps separate daily counters in the same Counter class:
 * - site-pv-YYYY-MM-DD
 * - site-uv-YYYY-MM-DD
 */
(function(window, document) {
  'use strict';

  var TIME_ZONE = 'Asia/Shanghai';
  var COUNTER_CLASS = 'Counter';
  var DAILY_UV_KEY = 'LeanCloud_Daily_UV_Flag';

  function getLeanCloudConfig() {
    var config = window.CONFIG || {};
    var analytics = config.web_analytics || {};
    return analytics.leancloud || {};
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function getTodayKey() {
    if (window.Intl && Intl.DateTimeFormat) {
      try {
        var parts = new Intl.DateTimeFormat('en-US', {
          timeZone: TIME_ZONE,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).formatToParts(new Date());
        var dateParts = {};
        parts.forEach(function(part) {
          dateParts[part.type] = part.value;
        });
        if (dateParts.year && dateParts.month && dateParts.day) {
          return dateParts.year + '-' + dateParts.month + '-' + dateParts.day;
        }
      } catch (error) {
        console.warn('Daily stats timezone fallback:', error);
      }
    }

    var now = new Date();
    return now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
  }

  function shouldCount() {
    var config = window.CONFIG || {};
    var leancloud = getLeanCloudConfig();
    var isAnalyticsEnabled = config.web_analytics && config.web_analytics.enable;
    var isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    var isDnt = window.Fluid && window.Fluid.ctx && window.Fluid.ctx.dnt;

    return Boolean(isAnalyticsEnabled && !isDnt && !(leancloud.ignore_local && isLocal));
  }

  function isDailyUV(todayKey) {
    try {
      if (localStorage.getItem(DAILY_UV_KEY) === todayKey) {
        return false;
      }
      localStorage.setItem(DAILY_UV_KEY, todayKey);
      return true;
    } catch (error) {
      console.warn('Daily UV localStorage unavailable:', error);
      return false;
    }
  }

  function requestFactory(apiServer, appId, appKey) {
    return function(method, url, data) {
      return fetch(apiServer + '/1.1' + url, {
        method: method,
        headers: {
          'X-LC-Id': appId,
          'X-LC-Key': appKey,
          'Content-Type': 'application/json'
        },
        body: data ? JSON.stringify(data) : undefined
      });
    };
  }

  function getRecord(request, target, allowCreate) {
    var query = encodeURIComponent(JSON.stringify({ target: target }));

    return request('get', '/classes/' + COUNTER_CLASS + '?where=' + query)
      .then(function(resp) {
        return resp.json();
      })
      .then(function(data) {
        if (data.code || data.error) {
          throw new Error(data.error || ('LeanCloud error: ' + data.code));
        }
        if (data.results && data.results.length > 0) {
          return data.results[0];
        }
        if (!allowCreate) {
          return {
            target: target,
            time: 0
          };
        }

        return request('post', '/classes/' + COUNTER_CLASS, {
          target: target,
          time: 0
        }).then(function(resp) {
          return resp.json();
        }).then(function(data) {
          if (data.code || data.error) {
            throw new Error(data.error || ('LeanCloud error: ' + data.code));
          }
          return data;
        });
      });
  }

  function buildIncrement(objectId) {
    return {
      method: 'PUT',
      path: '/1.1/classes/' + COUNTER_CLASS + '/' + objectId,
      body: {
        time: {
          __op: 'Increment',
          amount: 1
        }
      }
    };
  }

  function increment(request, requests) {
    if (!requests.length) {
      return Promise.resolve();
    }

    return request('post', '/batch', { requests: requests }).then(function(resp) {
      return resp.json();
    });
  }

  function setDelta(selector, statName, value) {
    var totalEle = document.querySelector(selector);
    if (!totalEle) {
      return;
    }

    var container = totalEle.parentElement;
    var deltaEle = container.querySelector('[data-daily-stat="' + statName + '"]');
    if (!deltaEle) {
      deltaEle = document.createElement('span');
      deltaEle.className = 'daily-site-stat-delta';
      deltaEle.dataset.dailyStat = statName;
    }

    for (var index = container.childNodes.length - 1; index >= 0; index--) {
      var node = container.childNodes[index];
      if (node === deltaEle) {
        continue;
      }
      if (node.nodeType === 3) {
        node.textContent = node.textContent.replace(/\s+$/, '');
      }
      break;
    }

    deltaEle.textContent = '(+' + Math.max(0, Number(value) || 0) + ')';
    container.appendChild(deltaEle);
  }

  function getApiServer(appId, serverUrl) {
    if (serverUrl) {
      return Promise.resolve(serverUrl);
    }

    if (appId.indexOf('-') > -1) {
      return Promise.resolve('https://' + appId.slice(0, 8).toLowerCase() + '.api.lncldglobal.com');
    }

    return fetch('https://app-router.leancloud.cn/2/route?appId=' + appId)
      .then(function(resp) {
        return resp.json();
      })
      .then(function(data) {
        return data.api_server ? 'https://' + data.api_server : '';
      });
  }

  function init() {
    var hasFooterStats = document.querySelector('#leancloud-site-pv') || document.querySelector('#leancloud-site-uv');
    if (!hasFooterStats) {
      return;
    }

    var leancloud = getLeanCloudConfig();
    var appId = leancloud.app_id;
    var appKey = leancloud.app_key;
    if (!appId || !appKey) {
      return;
    }

    var todayKey = getTodayKey();
    var countEnabled = shouldCount();
    var uvEnabled = countEnabled && isDailyUV(todayKey);
    var targets = {
      pv: 'site-pv-' + todayKey,
      uv: 'site-uv-' + todayKey
    };

    getApiServer(appId, leancloud.server_url)
      .then(function(apiServer) {
        if (!apiServer) {
          throw new Error('LeanCloud api server is empty');
        }

        var request = requestFactory(apiServer, appId, appKey);
        return Promise.all([
          getRecord(request, targets.pv, countEnabled),
          getRecord(request, targets.uv, uvEnabled)
        ]).then(function(records) {
          var pvRecord = records[0];
          var uvRecord = records[1];
          var increments = [];
          var willIncrementPv = countEnabled && pvRecord.objectId;
          var willIncrementUv = uvEnabled && uvRecord.objectId;

          if (willIncrementPv) {
            increments.push(buildIncrement(pvRecord.objectId));
          }
          if (willIncrementUv) {
            increments.push(buildIncrement(uvRecord.objectId));
          }

          setDelta('#leancloud-site-pv', 'pv', (pvRecord.time || 0) + (willIncrementPv ? 1 : 0));
          setDelta('#leancloud-site-uv', 'uv', (uvRecord.time || 0) + (willIncrementUv ? 1 : 0));

          return increment(request, increments);
        });
      })
      .catch(function(error) {
        console.error('Daily site stats error:', error);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window, document);
