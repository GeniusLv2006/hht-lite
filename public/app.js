        function updateThemeIcon() {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
                (!document.documentElement.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
            const lightIcon = document.getElementById('theme-icon-light');
            const darkIcon = document.getElementById('theme-icon-dark');
            // 使用 class 切换实现平滑过渡
            lightIcon.classList.toggle('visible', !isDark);
            lightIcon.classList.toggle('hidden', isDark);
            darkIcon.classList.toggle('visible', isDark);
            darkIcon.classList.toggle('hidden', !isDark);
            const themeColor = isDark ? '#111110' : '#e8e4dd';
            document.querySelector('meta[name="theme-color"]').setAttribute('content', themeColor);
        }

        function toggleTheme() {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            let newTheme;
            if (!currentTheme) {
                newTheme = prefersDark ? 'light' : 'dark';
            } else {
                newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            }
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcon();
        }

        document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
        updateThemeIcon();

        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (!localStorage.getItem('theme')) {
                updateThemeIcon();
            }
        });

        function isIos() {
            return /iPhone/.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches;
        }

        function isInStandaloneMode() {
            return ('standalone' in navigator) && navigator.standalone;
        }

        function showIosPrompt() {
            if (isIos() && !isInStandaloneMode() && !localStorage.getItem('iosPromptClosed')) {
                document.getElementById('iosPrompt').style.display = 'block';
            }
        }

        document.getElementById('closePrompt').addEventListener('click', function () {
            document.getElementById('iosPrompt').style.display = 'none';
            localStorage.setItem('iosPromptClosed', 'true');
        });

        window.addEventListener('load', showIosPrompt);

        // XSS 防护：HTML 实体转义
        function escapeHtml(str) {
            if (!str) return '';
            return String(str).replace(/[&<>"']/g, c => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            })[c]);
        }

        // satoken localStorage 缓存（跨 PWA 会话复用，避免每次冷启动重新取 token）
        const SATOKEN_CACHE_KEY = 'satoken_cache';
        const SATOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 小时

        // 用户信息缓存
        const USER_NAME_KEY = 'user_name';
        const USER_ID_KEY   = 'user_id';

        // QR 码纠错等级
        const QR_ECL_KEY     = 'qr_ecl';
        const QR_ECL_DEFAULT = 'M';
        let qrEcl = localStorage.getItem(QR_ECL_KEY) || QR_ECL_DEFAULT;

        let userName = localStorage.getItem(USER_NAME_KEY) || '';

        let _greetingShown = false;
        function updateHeaderGreeting() {
            if (!userName || _greetingShown) return;
            if (sessionStorage.getItem('greeting_shown')) return;
            _greetingShown = true;
            sessionStorage.setItem('greeting_shown', '1');
            const toast = document.getElementById('greeting-toast');
            if (!toast) return;
            const h = new Date().getHours();
            const g = h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
            toast.textContent = `${g}，${userName}`;
            requestAnimationFrame(() => toast.classList.add('show'));
            setTimeout(() => toast.classList.remove('show'), 8000);
        }

        function loadCachedSatoken() {
            try {
                const c = JSON.parse(localStorage.getItem(SATOKEN_CACHE_KEY) || '{}');
                if (c.token && typeof c.exp === 'number' && c.exp > Date.now()) return c.token;
            } catch {}
            return '';
        }

        function saveSatokenCache(token) {
            try {
                localStorage.setItem(SATOKEN_CACHE_KEY, JSON.stringify({ token, exp: Date.now() + SATOKEN_TTL_MS }));
            } catch {}
        }

        function clearSatokenCache() {
            localStorage.removeItem(SATOKEN_CACHE_KEY);
        }

        let openId = localStorage.getItem('openId') || '';
        let satoken = sessionStorage.getItem('satoken') || loadCachedSatoken();
        const REQUEST_INTERVAL = 8 * 1000;
        let retryCount = 0;
        const MAX_RETRY_COUNT = 5;
        const BASE_RETRY_DELAY = 2000;

        // 黑名单缓存
        const BLACKLIST_CACHE_KEY = 'blacklist_cache';
        const BLACKLIST_CACHE_DURATION = 5 * 60 * 1000; // 5 分钟
        const BLACKLIST_CACHE_SCHEMA = 2;
        const OWN_SERVER_TIMEOUT_MS = 5000;
        const OWN_SERVER_STATUS_GRACE_MS = 1500;

        let isInitialLoad = true;

        const tipsElement = document.getElementById('tips');
        const serverStatusElement = document.getElementById('server-status');
        const qrcodeElement = document.getElementById('qrcode');
        const setOpenIdBtn = document.getElementById('setOpenIdBtn');
        const refreshQRCodeBtn = document.getElementById('refreshQRCodeBtn');
        const REFRESH_BTN_ORIGINAL_HTML = refreshQRCodeBtn.innerHTML;
        const HDR_ASSIST_KEY = 'hdr_brightness_assist';
        const HDR_PRIMER_SRC = './videos/white1.mp4';
        let hdrPrimerVideo = null;
        let qrWakeLock = null;
        let hasVisibleQRCode = false;

        function isBrightnessAssistEnabled() {
            try {
                return localStorage.getItem(HDR_ASSIST_KEY) === '1';
            } catch {
                return false;
            }
        }

        function ensureHdrPrimerVideo() {
            if (hdrPrimerVideo && hdrPrimerVideo.isConnected) return hdrPrimerVideo;
            const video = document.createElement('video');
            video.className = 'hdr-primer-video';
            video.src = HDR_PRIMER_SRC;
            video.muted = true;
            video.loop = true;
            video.autoplay = true;
            video.playsInline = true;
            video.preload = 'auto';
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            video.setAttribute('aria-hidden', 'true');
            video.tabIndex = -1;
            try { video.disablePictureInPicture = true; } catch {}
            qrcodeElement.appendChild(video);
            hdrPrimerVideo = video;
            return video;
        }

        async function requestQrWakeLock() {
            if (!isBrightnessAssistEnabled() || document.hidden || !('wakeLock' in navigator) || qrWakeLock) return;
            try {
                qrWakeLock = await navigator.wakeLock.request('screen');
                qrWakeLock.addEventListener('release', () => {
                    qrWakeLock = null;
                });
            } catch {}
        }

        function releaseQrWakeLock() {
            if (!qrWakeLock) return;
            const lock = qrWakeLock;
            qrWakeLock = null;
            try {
                const released = lock.release();
                if (released && typeof released.catch === 'function') released.catch(() => {});
            } catch {}
        }

        function pauseBrightnessAssist() {
            if (hdrPrimerVideo) {
                try { hdrPrimerVideo.pause(); } catch {}
            }
            releaseQrWakeLock();
        }

        function stopBrightnessAssist() {
            hasVisibleQRCode = false;
            pauseBrightnessAssist();
            if (hdrPrimerVideo) {
                try { hdrPrimerVideo.remove(); } catch {}
                hdrPrimerVideo = null;
            }
        }

        function startBrightnessAssist() {
            hasVisibleQRCode = true;
            if (!isBrightnessAssistEnabled() || document.hidden) {
                pauseBrightnessAssist();
                return;
            }
            const video = ensureHdrPrimerVideo();
            try {
                const playing = video.play();
                if (playing && typeof playing.catch === 'function') playing.catch(() => {});
            } catch {}
            requestQrWakeLock();
        }

        function renderQRCodeSvg(qr, cellSize = 10, margin = 40) {
            const moduleCount = qr.getModuleCount();
            const size = moduleCount * cellSize + margin * 2;
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
            svg.setAttribute('width', size);
            svg.setAttribute('height', size);
            svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
            svg.setAttribute('aria-label', '门禁二维码');
            svg.setAttribute('role', 'img');

            let pathData = '';
            for (let row = 0; row < moduleCount; row++) {
                for (let col = 0; col < moduleCount; col++) {
                    if (qr.isDark(row, col)) {
                        pathData += `M${col * cellSize + margin},${row * cellSize + margin}h${cellSize}v${cellSize}h-${cellSize}z`;
                    }
                }
            }

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', pathData);
            path.setAttribute('fill', '#000');
            svg.appendChild(path);
            return svg;
        }

        function applyButtonFreeze() {
            clearTimeout(window.btnFreezeTimer);
            const remaining = Math.ceil((manualFrozenUntil - Date.now()) / 1000);
            if (remaining <= 0) {
                manualFrozenUntil = 0;
                localStorage.removeItem('manual_frozen_until');
                refreshQRCodeBtn.disabled = false;
                refreshQRCodeBtn.innerHTML = REFRESH_BTN_ORIGINAL_HTML;
                if (autoRefreshEnabled && !rateLimitActive) {
                    clearTimeout(window.refreshTimeout);
                    refreshQRCode(false);
                }
                return;
            }
            refreshQRCodeBtn.disabled = true;
            refreshQRCodeBtn.textContent = `冻结中 ${remaining}s`;
            window.btnFreezeTimer = setTimeout(applyButtonFreeze, 1000);
        }
        const messageBox = document.getElementById('message-box');
        const inputDialog = document.getElementById('input-dialog');
        const dialogMessage = document.getElementById('dialog-message');
        const dialogInput = document.getElementById('dialog-input');
        const dialogConfirm = document.getElementById('dialog-confirm');
        const dialogCancel = document.getElementById('dialog-cancel');
        const splashScreen = document.getElementById('splash-screen');
        const qrcodeContainer = document.getElementById('qrcode-container');

        // 自动刷新状态（持久化到 localStorage）
        let autoRefreshEnabled = localStorage.getItem('auto_refresh') !== '0';
        let appInitialized = false; // 协议同意并完成 initApp() 后置为 true
        let swUpdatePending = false; // SW 更新即将触发 reload，阻止旧页面提前弹出版本日志
        const autoRefreshCheckbox = document.getElementById('auto-refresh-checkbox');
        const hdrAssistCheckbox = document.getElementById('hdr-assist-checkbox');
        autoRefreshCheckbox.checked = autoRefreshEnabled;
        autoRefreshCheckbox.addEventListener('change', () => {
            autoRefreshEnabled = autoRefreshCheckbox.checked;
            localStorage.setItem('auto_refresh', autoRefreshEnabled ? '1' : '0');
            if (autoRefreshEnabled && !rateLimitActive) {
                if (Date.now() < manualFrozenUntil) {
                    // 冻结期间不给立即刷新，按正常间隔调度，防止通过开关绕过限制
                    clearTimeout(window.refreshTimeout);
                    window.refreshTimeout = setTimeout(() => refreshQRCode(false), REQUEST_INTERVAL);
                } else {
                    refreshQRCode(false);
                }
            } else if (!autoRefreshEnabled) {
                clearTimeout(window.refreshTimeout);
            }
        });
        hdrAssistCheckbox.checked = isBrightnessAssistEnabled();
        hdrAssistCheckbox.addEventListener('change', () => {
            localStorage.setItem(HDR_ASSIST_KEY, hdrAssistCheckbox.checked ? '1' : '0');
            if (hasVisibleQRCode) {
                if (hdrAssistCheckbox.checked) {
                    startBrightnessAssist();
                } else {
                    pauseBrightnessAssist();
                    if (hdrPrimerVideo) {
                        try { hdrPrimerVideo.remove(); } catch {}
                        hdrPrimerVideo = null;
                    }
                }
            }
        });

        setOpenIdBtn.addEventListener('click', () => handleSetOpenId());
        refreshQRCodeBtn.addEventListener('click', () => refreshQRCode(true));

        // ECL 选择器初始化
        document.querySelectorAll('.ecl-btn').forEach(btn => {
            if (btn.dataset.ecl === qrEcl) btn.classList.add('active');
            btn.addEventListener('click', () => {
                qrEcl = btn.dataset.ecl;
                localStorage.setItem(QR_ECL_KEY, qrEcl);
                document.querySelectorAll('.ecl-btn').forEach(b => b.classList.toggle('active', b === btn));
                refreshQRCode(true);
            });
        });

        function showSplashScreen() {
            splashScreen.style.display = 'flex';
            splashScreen.classList.remove('hidden');
        }

        function hideSplashScreen() {
            splashScreen.classList.add('hidden');
            setTimeout(() => {
                splashScreen.style.display = 'none';
                updateHeaderGreeting(); // splash 完全消失后才开始计时
            }, 300);
        }

        function showMessage(message, duration = 3000, type = '') {
            messageBox.textContent = message;
            messageBox.className = type;
            messageBox.style.display = 'block';
            clearTimeout(messageBox._hideTimer);
            messageBox._hideTimer = setTimeout(() => {
                messageBox.style.display = 'none';
                messageBox.className = '';
            }, duration);
        }

        function fetchOwnServer(path, options = {}, timeoutMs = OWN_SERVER_TIMEOUT_MS) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            return fetch(path, { ...options, signal: controller.signal })
                .finally(() => clearTimeout(timeout));
        }

        const ownServerFailures = new Map();
        const ownServerFailureTimers = new Map();

        function renderOwnServerStatus() {
            if (!serverStatusElement) return;
            if (ownServerFailures.size === 0) {
                serverStatusElement.classList.remove('show');
                serverStatusElement.innerHTML = '';
                return;
            }
            const latest = Array.from(ownServerFailures.values()).pop();
            serverStatusElement.innerHTML = `
                <div class="server-status-title">辅助服务离线，二维码不受影响</div>
                <div class="server-status-detail">${latest.sourceLabel}接口${latest.detail} · ${latest.time}</div>
            `;
            serverStatusElement.classList.add('show');
        }

        function markOwnServerUnavailable(source, error) {
            clearTimeout(ownServerFailureTimers.get(source));
            const now = new Date().toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            const detail = error?.name === 'AbortError' ? '超时' : '连接失败';
            const sourceLabel = {
                startup: '状态检查',
                blacklist: '黑名单',
                log: '日志',
                version: '版本',
                notification: '公告'
            }[source] || source;
            const timer = setTimeout(() => {
                ownServerFailureTimers.delete(source);
                ownServerFailures.set(source, { sourceLabel, detail, time: now });
                renderOwnServerStatus();
            }, OWN_SERVER_STATUS_GRACE_MS);
            ownServerFailureTimers.set(source, timer);
        }

        function markOwnServerAvailable(source) {
            if (!source) {
                ownServerFailureTimers.forEach(timer => clearTimeout(timer));
                ownServerFailureTimers.clear();
                ownServerFailures.clear();
            } else {
                clearTimeout(ownServerFailureTimers.get(source));
                ownServerFailureTimers.delete(source);
                ownServerFailures.delete(source);
                if (source === 'version') {
                    clearTimeout(ownServerFailureTimers.get('startup'));
                    ownServerFailureTimers.delete('startup');
                    ownServerFailures.delete('startup');
                }
                if (source === 'startup') {
                    clearTimeout(ownServerFailureTimers.get('version'));
                    ownServerFailureTimers.delete('version');
                    ownServerFailures.delete('version');
                }
            }
            renderOwnServerStatus();
        }

        async function probeOwnServer() {
            try {
                const res = await fetchOwnServer('/api/version', { cache: 'no-store' });
                if (!res.ok) throw new Error('status ' + res.status);
                markOwnServerAvailable('startup');
                return await res.json();
            } catch (error) {
                markOwnServerUnavailable('startup', error);
                return null;
            }
        }

        function showInputDialog(msg, placeholder = '请输入', isPassword = false) {
            return new Promise((resolve) => {
                dialogMessage.textContent = msg;
                dialogInput.value = '';
                dialogInput.placeholder = placeholder;
                dialogInput.type = isPassword ? 'password' : 'text';
                _showOverlay(inputDialog);
                dialogInput.focus();

                function handleConfirm() {
                    const value = dialogInput.value;
                    _hideOverlay(inputDialog);
                    dialogInput.type = 'text';
                    resolve(value);
                    cleanup();
                }

                function handleCancel() {
                    _hideOverlay(inputDialog);
                    dialogInput.type = 'text';
                    resolve(null);
                    cleanup();
                }

                function cleanup() {
                    dialogConfirm.removeEventListener('click', handleConfirm);
                    dialogCancel.removeEventListener('click', handleCancel);
                }

                dialogConfirm.addEventListener('click', handleConfirm);
                dialogCancel.addEventListener('click', handleCancel);
            });
        }

        // 黑名单缓存管理
        function getBlacklistCache(targetOpenId) {
            try {
                const cache = JSON.parse(localStorage.getItem(BLACKLIST_CACHE_KEY) || '{}');
                const entry = cache[targetOpenId];
                if (!entry) return null;
                const now = Date.now();
                if (entry.blocked === true && now - entry.timestamp < BLACKLIST_CACHE_DURATION) {
                    return { blocked: true, reason: entry.reason || null, ban_message: entry.ban_message || null };
                }
                if (entry.schema === BLACKLIST_CACHE_SCHEMA && entry.blocked === false && entry.allow_until && now < entry.allow_until) {
                    return { blocked: false, reason: null, ban_message: null };
                }
            } catch (e) {}
            return null;
        }

        function setBlacklistCache(targetOpenId, blocked, reason, ban_message, offlineAllowTtl) {
            try {
                const cache = JSON.parse(localStorage.getItem(BLACKLIST_CACHE_KEY) || '{}');
                const now = Date.now();
                // 顺手清理过期条目，防止无限增长
                for (const key of Object.keys(cache)) {
                    const entry = cache[key];
                    const blockedExpired = entry.blocked === true && now - entry.timestamp >= BLACKLIST_CACHE_DURATION;
                    const allowExpired = entry.schema === BLACKLIST_CACHE_SCHEMA && entry.blocked === false && (!entry.allow_until || now >= entry.allow_until);
                    const legacyAllow = entry.blocked === false && entry.schema !== BLACKLIST_CACHE_SCHEMA;
                    if (blockedExpired || allowExpired || legacyAllow) delete cache[key];
                }
                if (blocked) {
                    cache[targetOpenId] = { schema: BLACKLIST_CACHE_SCHEMA, blocked: true, reason, ban_message, timestamp: now };
                } else if (Number.isFinite(offlineAllowTtl) && offlineAllowTtl > 0) {
                    cache[targetOpenId] = {
                        schema: BLACKLIST_CACHE_SCHEMA,
                        blocked: false,
                        reason: null,
                        ban_message: null,
                        timestamp: now,
                        allow_until: now + offlineAllowTtl * 1000
                    };
                } else {
                    delete cache[targetOpenId];
                }
                localStorage.setItem(BLACKLIST_CACHE_KEY, JSON.stringify(cache));
            } catch (e) {}
        }

        // 检查黑名单（带缓存）
        async function checkBlacklist(targetOpenId, forceRefresh = false) {
            if (!forceRefresh) {
                const cached = getBlacklistCache(targetOpenId);
                if (cached) {
                    return { blocked: cached.blocked, reason: cached.reason, ban_message: cached.ban_message };
                }
            }

            try {
                const res = await fetchOwnServer('/api/check-blacklist', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ openId: targetOpenId })
                });
                if (!res.ok) throw new Error('status ' + res.status);
                const data = await res.json();
                const offlineAllowTtl = Number(data.offline_allow_ttl);
                setBlacklistCache(targetOpenId, data.blocked, data.reason, data.ban_message, offlineAllowTtl);
                markOwnServerAvailable('blacklist');
                return { blocked: data.blocked, reason: data.reason, ban_message: data.ban_message };
            } catch (error) {
                markOwnServerUnavailable('blacklist', error);
                const cached = getBlacklistCache(targetOpenId);
                if (cached) return { blocked: cached.blocked, reason: cached.reason, ban_message: cached.ban_message };
                return {
                    blocked: true,
                    reason: '无法连接验证服务，请稍后重试',
                    ban_message: '验证服务不可用'
                };
            }
        }

        // 记录访问日志
        async function logAccess(action) {
            if (!openId) return;
            try {
                await fetchOwnServer('/api/log-access', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ openId, action })
                });
                markOwnServerAvailable('log');
            } catch (error) {
                markOwnServerUnavailable('log', error);
            }
        }

        async function handleSetOpenId() {
            const newOpenId = await showInputDialog('修改 OpenID', '请输入 OpenID');
            if (newOpenId === null) return;

            // 检查是否被拉黑（强制刷新）
            const blacklistResult = await checkBlacklist(newOpenId, true);
            if (blacklistResult.blocked) {
                showMessage((blacklistResult.ban_message || '此 OpenID 已被禁用') + (blacklistResult.reason ? '\n' + blacklistResult.reason : ''), 5000);
                return;
            }

            openId = newOpenId;
            localStorage.setItem('openId', openId);
            satoken = '';
            sessionStorage.setItem('satoken', satoken);
            clearSatokenCache();
            isInitialLoad = true;
            autoRefreshCount = 0;
            refreshQRCode();
        }

        async function request(path) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            try {
                const response = await fetch(`https://api.215123.cn${path}`, {
                    method: 'GET',
                    headers: { 'satoken': satoken },
                    signal: controller.signal
                });
                clearTimeout(timeout);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return await response.json();
            } catch (e) {
                clearTimeout(timeout);
                throw e;
            }
        }

        async function getSatoken() {
            try {
                const data = await request(`/web-app/auth/certificateLogin?openId=${openId}`);
                satoken = data.data.token;
                if (!satoken) throw new Error('satoken为空');
                sessionStorage.setItem('satoken', satoken);
                saveSatokenCache(satoken);
                // 提取并持久化姓名/userId
                const respName   = data.data?.name   || '';
                const respUserId = data.data?.userId || '';
                if (respName) {
                    localStorage.setItem(USER_NAME_KEY, respName);
                    localStorage.setItem(USER_ID_KEY,   respUserId);
                    userName = respName;
                    updateHeaderGreeting();
                }
                return 0;
            } catch (error) {
                hideSplashScreen(); // OpenID 无效时先隐藏 splash，防止其遮挡输入框
                showMessage('OpenID 无效');
                await handleSetOpenId();
                return -1;
            }
        }

        // Tab 可见性变化时暂停/恢复 QR 刷新，节省后台流量和电量
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                clearTimeout(window.refreshTimeout);
                pauseBrightnessAssist();
            } else if (appInitialized && autoRefreshEnabled && !rateLimitActive) {
                if (hasVisibleQRCode) startBrightnessAssist();
                refreshQRCode(false);
            } else if (hasVisibleQRCode) {
                startBrightnessAssist();
            }
        });

        // ── QR 刷新速率控制 ───────────────────────────────────────────────────────
        // 策略A: 本次会话自动刷新累计达 10 次 → 弹窗确认后重置继续
        // 策略B: 60 秒内手动刷新累计达 10 次 → 弹窗 + 10s 倒计时后继续
        let autoRefreshCount = 0;
        const AUTO_REFRESH_LIMIT = 10;

        const manualRefreshWindow = [];
        const MANUAL_RATE_LIMIT = 10;
        const MANUAL_RATE_WINDOW = 60 * 1000;
        const MANUAL_LOCKOUT_SECONDS = 10;

        let rateLimitActive = false;
        let manualFrozenUntil = parseInt(localStorage.getItem('manual_frozen_until') || '0');
        if (manualFrozenUntil > Date.now()) { applyButtonFreeze(); }

        function isManualRateLimited() {
            const now = Date.now();
            while (manualRefreshWindow.length > 0 && manualRefreshWindow[0] < now - MANUAL_RATE_WINDOW) {
                manualRefreshWindow.shift();
            }
            return manualRefreshWindow.length >= MANUAL_RATE_LIMIT;
        }

        function _showOverlay(el) {
            // Do NOT set height inline — CSS top:0/bottom:0 covers the full viewport.
            // window.innerHeight excludes the iOS safe-area bottom, causing a strip.
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
            el.style.visibility = 'visible';
        }
        function _hideOverlay(el) {
            el.style.height = '';
            el.style.opacity = '';
            el.style.pointerEvents = '';
            el.style.visibility = '';
        }

        function showRateLimitModal(type) {
            clearTimeout(window.refreshTimeout);
            rateLimitActive = true;
            const modal = document.getElementById('rate-limit-modal');
            const body = document.querySelector('.rate-limit-body');
            const btn = document.getElementById('close-rate-limit');

            if (type === 'auto') {
                body.textContent = '本次打开应用后已累计自动刷新 ' + AUTO_REFRESH_LIMIT + ' 次，请确认是否继续自动刷新。';
                btn.disabled = false;
                btn.textContent = '继续刷新';
                btn.onclick = () => {
                    _hideOverlay(modal);
                    btn.onclick = null;
                    rateLimitActive = false;
                    autoRefreshCount = 0;
                    refreshQRCode(false);
                };
            } else {
                body.textContent = '60 秒内手动刷新次数已达上限，请稍作等待后继续使用。';
                let remaining = MANUAL_LOCKOUT_SECONDS;
                btn.disabled = true;
                btn.textContent = '';
                btn.appendChild(document.createTextNode('请等待 '));
                const cdSpan = document.createElement('span');
                cdSpan.textContent = remaining;
                btn.appendChild(cdSpan);
                btn.appendChild(document.createTextNode(' 秒'));
                const timer = setInterval(() => {
                    remaining--;
                    cdSpan.textContent = remaining;
                    if (remaining <= 0) {
                        clearInterval(timer);
                        btn.disabled = false;
                        btn.textContent = '我知道了';
                    }
                }, 1000);
                btn.onclick = () => {
                    if (!btn.disabled) {
                        _hideOverlay(modal);
                        btn.onclick = null;
                        rateLimitActive = false;
                        manualRefreshWindow.length = 0;
                        manualFrozenUntil = Date.now() + 60 * 1000;
                        localStorage.setItem('manual_frozen_until', manualFrozenUntil);
                        applyButtonFreeze();
                        refreshQRCode(false);
                    }
                };
            }
            _showOverlay(modal);
        }
        // ─────────────────────────────────────────────────────────────────────────

        async function refreshQRCode(isManual = false) {
            // 手动刷新：检查冻结期与 60 秒滑动窗口
            if (!isInitialLoad && isManual) {
                if (Date.now() < manualFrozenUntil) {
                    applyButtonFreeze();
                    return;
                }
                if (isManualRateLimited()) {
                    showRateLimitModal('manual');
                    return;
                }
                manualRefreshWindow.push(Date.now());
            }
            // 添加加载状态
            qrcodeContainer.classList.add('loading');
            clearTimeout(window.refreshTimeout);
            tipsElement.textContent = '正在更新...';

            // openId 未设置时直接进入设置流程，无需发送任何网络请求
            if (!openId) {
                stopBrightnessAssist();
                qrcodeContainer.classList.remove('loading');
                hideSplashScreen();
                await handleSetOpenId();
                return;
            }

            // 冷启动时 satoken 为空：优先 await 已发出的预取 Promise，避免重复请求
            if (!satoken) {
                if (_satokenPrefetch) await _satokenPrefetch;
            }
            if (!satoken) {
                const retryTime = await getSatoken();
                if (retryTime < 0) {
                    qrcodeContainer.classList.remove('loading');
                    hideSplashScreen();
                    return;
                }
            }

            // 并行执行黑名单检查和二维码请求
            const [blacklistResult, qrResult] = await Promise.allSettled([
                openId ? checkBlacklist(openId) : Promise.resolve({ blocked: false }),
                request('/pms/welcome/make-qrcode')
            ]);

            // 先检查黑名单结果
            if (blacklistResult.status === 'fulfilled' && blacklistResult.value.blocked) {
                stopBrightnessAssist();
                refreshQRCodeBtn.disabled = true;
                refreshQRCodeBtn.style.background = '#c23b22';
                refreshQRCodeBtn.textContent = blacklistResult.value.ban_message || '此 OpenID 已被禁用';
                tipsElement.style.whiteSpace = 'pre-wrap';
                tipsElement.textContent = blacklistResult.value.reason || '';
                qrcodeElement.innerHTML = '';
                qrcodeContainer.classList.remove('loading');
                if (isInitialLoad) {
                    logAccess('qr_blocked');
                    isInitialLoad = false;
                }
                hideSplashScreen();
                return;
            }

            // 处理二维码结果
            if (qrResult.status === 'fulfilled') {
                try {
                    const code = qrResult.value.data;
                    if (!code) throw new Error('code为空');
                    generateQRCode(code);
                    retryCount = 0;

                    // 记录日志
                    if (isInitialLoad) {
                        logAccess('page_load');
                        isInitialLoad = false;
                    } else if (isManual) {
                        logAccess('qr_manual');
                    } else {
                        autoRefreshCount++;
                        logAccess('qr_auto');
                    }

                    // 调度下一次自动刷新（或触发自动刷新限额弹窗）
                    if (autoRefreshEnabled && !rateLimitActive) {
                        if (!isManual && autoRefreshCount >= AUTO_REFRESH_LIMIT) {
                            window.refreshTimeout = setTimeout(() => showRateLimitModal('auto'), REQUEST_INTERVAL);
                        } else {
                            window.refreshTimeout = setTimeout(() => refreshQRCode(false), REQUEST_INTERVAL);
                        }
                    }
                } catch (error) {
                    stopBrightnessAssist();
                    retryCount++;
                    clearSatokenCache(); // token 可能过期，清除缓存确保下次冷启动重新取
                    const retryTime = await getSatoken();
                    if (retryTime >= 0 && retryCount <= MAX_RETRY_COUNT) {
                        const retryDelay = retryCount <= 1 ? 0 : Math.min(BASE_RETRY_DELAY * Math.pow(2, retryCount - 1), 30000);
                        window.refreshTimeout = setTimeout(() => refreshQRCode(false), retryDelay);
                    } else {
                        stopBrightnessAssist();
                        logAccess('qr_timeout');
                        tipsElement.textContent = '网络连接失败，请检查网络后点击刷新';
                    }
                }
            } else {
                // QR 请求失败
                stopBrightnessAssist();
                retryCount++;
                clearSatokenCache(); // token 可能过期，清除缓存确保下次冷启动重新取
                const retryTime = await getSatoken();
                if (retryTime >= 0 && retryCount <= MAX_RETRY_COUNT) {
                    const retryDelay = retryCount <= 1 ? 0 : Math.min(BASE_RETRY_DELAY * Math.pow(2, retryCount - 1), 30000);
                    window.refreshTimeout = setTimeout(() => refreshQRCode(false), retryDelay);
                } else {
                    stopBrightnessAssist();
                    logAccess('qr_timeout');
                    tipsElement.textContent = '网络连接失败，请检查网络后点击刷新';
                }
            }

            // 移除加载状态
            qrcodeContainer.classList.remove('loading');
            hideSplashScreen();
        }

        function generateQRCode(data) {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            tipsElement.textContent = `上次刷新 ${timeStr}`;

            const qr = qrcode(0, qrEcl);
            qr.addData(data);
            qr.make();

            qrcodeElement.querySelector('img, svg')?.remove();
            qrcodeElement.appendChild(renderQRCodeSvg(qr));
            startBrightnessAssist();
        }

        // Service Worker
        if ('serviceWorker' in navigator) {
            const wasControlled = !!navigator.serviceWorker.controller;

            // 统一更新触发函数：设置 pwa_updated 标记后再 reload
            // 防止多条链路竞争导致标记未写入就已刷新
            let _updateTriggered = false;
            function _triggerUpdate() {
                if (_updateTriggered) return;
                _updateTriggered = true;
                localStorage.setItem('pwa_updated', '1');
                window.location.reload();
            }

            navigator.serviceWorker.register('./service-worker.js').then(reg => {
                // 兜底链路：监听 SW 文件本身的安装激活
                reg.addEventListener('updatefound', () => {
                    swUpdatePending = true; // SW 正在安装，即将触发 reload，阻止旧页面弹版本日志
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'activated' && wasControlled) {
                            _triggerUpdate();
                        }
                    });
                });
            }).catch(() => {});

            // 链路一：ETag 检测到 HTML 变化（SW 文件未变但内容已更新）
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data?.type === 'SW_UPDATE_AVAILABLE') {
                    swUpdatePending = true;
                    _triggerUpdate();
                }
            });

            // 链路二：新 SW（新 CACHE_NAME）激活并接管页面
            // 注：controllerchange 早于 statechange === 'activated' 触发，须在此设置标记
            const _prevController = navigator.serviceWorker.controller;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (_prevController) { // 排除首次安装（controller 从 null 变为 SW）
                    swUpdatePending = true;
                    _triggerUpdate();
                }
            });

            // 应用切回前台时主动检查版本（解决 iOS PWA 后台恢复不更新问题）
            let _lastVersionCheck = 0;
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && navigator.serviceWorker.controller) {
                    const now = Date.now();
                    if (now - _lastVersionCheck > 30000) { // 最多每 30 秒检查一次
                        _lastVersionCheck = now;
                        navigator.serviceWorker.controller.postMessage({ type: 'CHECK_VERSION' });
                    }
                }
            });

            // 页面加载完成后触发一次检查（SW 文件未变但 HTML 已更新时生效）
            navigator.serviceWorker.ready.then(reg => {
                reg.active?.postMessage({ type: 'CHECK_VERSION' });
            });
        }

        // 版本更新日志（从后端获取，仅保留最新版本）
        async function showVersionModal() {
            const versionList = document.getElementById('version-list');
            versionList.innerHTML = '<div style="color:var(--ink-2);font-family:\'IBM Plex Mono\',monospace;font-size:12px;text-align:center;padding:12px 0;">正在加载...</div>';
            const _vm = document.getElementById('version-modal');
            _showOverlay(_vm);

            try {
                const info = await versionInfoPromise;
                if (!info) throw new Error('no data');
                versionList.innerHTML = `
                    <div class="version-item">
                        <div class="version-item-header">
                            <span class="version-item-version">${escapeHtml(info.version)}</span>
                            <span class="version-item-date">${escapeHtml(info.date)}</span>
                        </div>
                        <ul class="version-item-changes">
                            ${info.changes.map(c => `<li>${escapeHtml(c)}</li>`).join('')}
                        </ul>
                    </div>
                    <div style="margin-top:16px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ink-2);line-height:1.75;">
                        <p style="margin-bottom:8px;">本项目基于 <a href="https://github.com/mercutiojohn/hht-web" target="_blank" style="color:var(--accent);text-decoration:none;">mercutiojohn/hht-web</a> 进行二次开发，在此表示感谢。</p>
                        <p style="margin-bottom:8px;">由 <a href="https://github.com/GeniusLv2006" target="_blank" style="color:var(--accent);text-decoration:none;">GeniusLv2006</a> 使用 Codex 进行优化与功能扩展。</p>
                        <p style="color:var(--accent);">本程序仅供内部学习与测试使用，开发者不对因使用本程序产生的任何后果承担责任。</p>
                    </div>
                `;
            } catch (e) {
                versionList.innerHTML = '<div style="color:var(--ink-2);font-family:\'IBM Plex Mono\',monospace;font-size:12px;text-align:center;padding:12px 0;">版本信息加载失败，请稍后重试</div>';
            }
        }

        // 版本/通知在 QR 加载完成后才发起，避免冷启动时抢占 satoken/QR 的网络带宽
        // initApp() 中赋值，showVersionModal() 使用前需确认已初始化
        let versionInfoPromise = null;
        let notificationPromise = null;

        // 冷启动 satoken 预取：QR 依赖此 token，需尽早发起
        // 用 Promise 变量存储，refreshQRCode 可 await 复用而不重复发请求
        const _satokenPrefetch = (!satoken && openId)
            ? request(`/web-app/auth/certificateLogin?openId=${openId}`)
                .then(data => {
                    const token = data?.data?.token;
                    if (token) {
                        satoken = token;
                        sessionStorage.setItem('satoken', token);
                        saveSatokenCache(token);
                    }
                    // 提取并持久化姓名/userId
                    const respName   = data?.data?.name   || '';
                    const respUserId = data?.data?.userId || '';
                    if (respName) {
                        localStorage.setItem(USER_NAME_KEY, respName);
                        localStorage.setItem(USER_ID_KEY,   respUserId);
                        userName = respName;
                        updateHeaderGreeting();
                    }
                })
                .catch(() => {})
            : null;

        // 通知弹窗
        function showNotificationModal(n) {
            document.getElementById('notif-modal-title').textContent = n.title;
            document.getElementById('notif-modal-body').textContent = n.content;
            const _nm = document.getElementById('notif-modal');
            _showOverlay(_nm);
        }
        document.getElementById('close-notif-modal').addEventListener('click', () => {
            _hideOverlay(document.getElementById('notif-modal'));
        });
        document.getElementById('notif-modal').addEventListener('click', (e) => {
            if (e.target.id === 'notif-modal') _hideOverlay(e.currentTarget);
        });

        document.getElementById('version-btn').addEventListener('click', showVersionModal);
        document.getElementById('terms-btn').addEventListener('click', () => showAgreementModal(true));
        document.getElementById('agreement-close-view').addEventListener('click', hideAgreementModal);
        document.getElementById('close-version-modal').addEventListener('click', () => {
            _hideOverlay(document.getElementById('version-modal'));
        });
        document.getElementById('version-modal').addEventListener('click', (e) => {
            if (e.target.id === 'version-modal') _hideOverlay(e.currentTarget);
        });

        // 服务协议相关
        const AGREEMENT_KEY = 'agreement_accepted';
        const AGREEMENT_VERSION_KEY = 'agreement_version';
        const CURRENT_AGREEMENT_VERSION = '2026030402'; // 协议版本号，更新协议时递增
        const agreementModal = document.getElementById('agreement-modal');
        const declinedOverlay = document.getElementById('declined-overlay');
        const agreementAcceptBtn = document.getElementById('agreement-accept');
        const agreementCheckbox = document.getElementById('agreement-check');
        let agreementCountdown = 5;
        let countdownTimer = null;

        function checkAgreement() {
            const accepted = localStorage.getItem(AGREEMENT_KEY) === 'true';
            const version = localStorage.getItem(AGREEMENT_VERSION_KEY);
            // 需要同意且版本匹配才算已同意
            return accepted && version === CURRENT_AGREEMENT_VERSION;
        }

        function updateAcceptButton() {
            if (agreementCountdown > 0) {
                agreementAcceptBtn.textContent = `请阅读协议 (${agreementCountdown})`;
                agreementAcceptBtn.disabled = true;
            } else if (!agreementCheckbox.checked) {
                agreementAcceptBtn.textContent = '请勾选确认';
                agreementAcceptBtn.disabled = true;
            } else {
                agreementAcceptBtn.textContent = '同意';
                agreementAcceptBtn.disabled = false;
            }
        }

        function startCountdown() {
            agreementCountdown = 5;
            agreementCheckbox.checked = false;
            updateAcceptButton();

            countdownTimer = setInterval(() => {
                agreementCountdown--;
                updateAcceptButton();
                if (agreementCountdown <= 0) {
                    clearInterval(countdownTimer);
                }
            }, 1000);
        }

        function showAgreementModal(viewOnly = false) {
            // agreement-modal z-index(10002) > declined-overlay(10001)，直接叠加渐入
            // 不立即隐藏 declined-overlay，防止主界面在过渡期间闪现
            agreementModal.style.height = window.innerHeight + 'px';
            // 切换页脚：查看模式只显示关闭按钮
            document.getElementById('agreement-accept-footer').style.display = viewOnly ? 'none' : '';
            document.getElementById('agreement-view-footer').style.display = viewOnly ? '' : 'none';
            // 使用 class 实现平滑过渡
            requestAnimationFrame(() => {
                agreementModal.classList.add('show');
            });
            // 等过渡完成后再隐藏底层遮罩，确保无缝切换
            setTimeout(() => { declinedOverlay.style.display = 'none'; }, 300);
            if (!viewOnly) startCountdown();
        }

        function hideAgreementModal() {
            agreementModal.classList.remove('show');
            // 等待过渡完成后清除内联高度
            setTimeout(() => {
                agreementModal.style.height = '';
            }, 250);
            if (countdownTimer) {
                clearInterval(countdownTimer);
            }
        }

        function showDeclinedOverlay() {
            declinedOverlay.style.display = 'flex';
            // 用 hideAgreementModal 关闭弹窗，保持状态一致（不留内联 style 残留）
            hideAgreementModal();
        }

        agreementCheckbox.addEventListener('change', updateAcceptButton);

        agreementAcceptBtn.addEventListener('click', () => {
            if (agreementCountdown > 0 || !agreementCheckbox.checked) return;
            localStorage.setItem(AGREEMENT_KEY, 'true');
            localStorage.setItem(AGREEMENT_VERSION_KEY, CURRENT_AGREEMENT_VERSION);
            hideAgreementModal();
            hideSplashScreen();
            initApp();
        });

        document.getElementById('agreement-decline').addEventListener('click', () => {
            showDeclinedOverlay();
            hideSplashScreen();
        });

        document.getElementById('reopen-agreement').addEventListener('click', () => {
            showAgreementModal();
        });

        // 页面初始化
        async function initPage() {
            // 显示开屏动画
            showSplashScreen();

            // 检查是否已同意协议
            if (!checkAgreement()) {
                hideSplashScreen();
                showAgreementModal();
                return;
            }

            // 已同意协议，初始化应用
            initApp();
        }

        // 应用初始化（同意协议后执行）
        async function initApp() {
            appInitialized = true; // 标记 App 已初始化，允许 visibilitychange 触发刷新
            const pwaUpdated = localStorage.getItem('pwa_updated') === '1';
            if (pwaUpdated) localStorage.removeItem('pwa_updated');
            const ownServerProbePromise = probeOwnServer();

            // 开始加载二维码（完成后隐藏开屏动画）
            await refreshQRCode();

            // QR 已显示，现在再并行发起版本和通知请求，不阻塞首屏
            versionInfoPromise = ownServerProbePromise.then(cachedInfo => cachedInfo || fetchOwnServer('/api/version')
                .then(r => r.json()))
                .then(info => {
                    if (!info) return null;
                    markOwnServerAvailable('version');
                    return info;
                })
                .catch((error) => {
                    markOwnServerUnavailable('version', error);
                    return null;
                });
            notificationPromise = fetchOwnServer('/api/notification')
                .then(r => r.ok ? r.json() : null)
                .then(notif => {
                    markOwnServerAvailable('notification');
                    return notif;
                })
                .catch((error) => {
                    markOwnServerUnavailable('notification', error);
                    return null;
                });
            versionInfoPromise.then(info => {
                document.getElementById('version-btn').textContent = (info && info.version) ? info.version : '?';
            });

            // 版本变更后首次访问即弹出更新日志
            try {
                const info = await versionInfoPromise;
                if (!info) throw new Error('no data');
                const lastVersion = localStorage.getItem('last_seen_version');
                if (info.version) {
                    const versionChanged = lastVersion && lastVersion !== info.version;
                    if (pwaUpdated) {
                        // SW 更新后的稳定页面：必然弹窗 + 绿色更新提示
                        showMessage('✓ 已更新至 ' + info.version, 4000, 'success');
                        showVersionModal();
                        localStorage.setItem('last_seen_version', info.version);
                    } else if (versionChanged && !swUpdatePending) {
                        // 普通版本变更（ETag 路径），且无 SW 更新即将触发：弹窗
                        showVersionModal();
                        localStorage.setItem('last_seen_version', info.version);
                    }
                    // swUpdatePending 时：跳过弹窗和版本记录，等 reload 后的稳定页面再处理
                }
            } catch (e) {
                // 网络异常时静默失败，不影响主流程
            }

            // 管理员通知
            try {
                const notif = await notificationPromise;
                if (notif && notif.title) {
                    const seenKey = 'seen_notif_' + notif.nonce;
                    if (notif.type === 'always' || !localStorage.getItem(seenKey)) {
                        if (notif.type === 'once') localStorage.setItem(seenKey, '1');
                        showNotificationModal(notif);
                    }
                }
            } catch (_) {}
        }

        initPage();
