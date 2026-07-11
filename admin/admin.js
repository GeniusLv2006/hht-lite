// Copyright (c) 2026 GeniusLv2006
// SPDX-License-Identifier: MPL-2.0

    const API_BASE = window.location.origin;

    // ── 会话管理：自动退出 ──────────────────────────────────────
    function autoLogout(msg) {
      // 清除服务端 Cookie
      fetch(`${API_BASE}/api/admin/logout`, { method: 'POST' }).catch(() => {});
      // 关闭所有弹窗
      document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
      document.getElementById('dashboard').style.display = 'none';
      document.getElementById('loginPage').style.display = 'flex';
      document.getElementById('username').value = '';
      document.getElementById('password').value = '';
      const err = document.getElementById('loginError');
      err.textContent = msg || '会话已过期，请重新登录';
      err.style.display = 'block';
    }

    // 全局 fetch 拦截：admin API 返回 401 时自动退出
    const _origFetch = window.fetch.bind(window);
    window.fetch = async function(url, opts) {
      const res = await _origFetch(url, opts);
      if (res.status === 401 && String(url).includes('/api/admin/')) {
        autoLogout('会话已过期，请重新登录');
      }
      return res;
    };
    // ────────────────────────────────────────────────────────────

    // XSS 防护：HTML 实体转义
    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[c]);
    }

    // 深色模式
    function updateDarkMode(isDark) {
      if (isDark) {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }
      const btn = document.getElementById('darkModeToggle');
      if (btn) btn.textContent = isDark ? '☀️ 浅色' : '🌙 深色';
    }
    function toggleDarkMode() {
      const isDark = !document.body.classList.contains('dark-mode');
      localStorage.setItem('adminDarkMode', isDark ? '1' : '0');
      updateDarkMode(isDark);
    }
    // 初始化深色模式
    (function initDarkMode() {
      const stored = localStorage.getItem('adminDarkMode');
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      // 如果有手动设置则使用手动设置，否则跟随系统
      const isDark = stored !== null ? stored === '1' : systemDark;
      updateDarkMode(isDark);
      // 监听系统深色模式变化（仅当没有手动设置时生效）
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (localStorage.getItem('adminDarkMode') === null) {
          updateDarkMode(e.matches);
        }
      });
    })();
    const FILTER_STORAGE_KEY = 'adminLogFilters';
    const defaultFilters = Object.freeze({
      openId: '',
      userName: '',
      tag: '',
      action: '',
      device: '',
      blocked: '',
      startDate: '',
      endDate: ''
    });
    const actionLabels = {
      page_load: '页面加载',
      qr_manual: '手动刷新',
      qr_auto: '自动刷新',
      qr_timeout: '生成超时',
      qr_blocked: '已被拉黑',
      admin_verify_attempt: '管理员验证',
      admin_verify_success: '验证成功',
      admin_verify: '管理员验证'
    };
    const deviceLabels = {
      iphone: 'iPhone',
      ipad: 'iPad',
      android: 'Android',
      mac: 'Mac',
      windows: 'Windows',
      wechat: '微信'
    };
    const blockedLabels = {
      blocked: '仅已拉黑',
      normal: '仅未拉黑'
    };
    const filterInputIds = ['filterOpenId', 'filterUserName', 'filterTag', 'filterAction', 'filterDevice', 'filterBlocked', 'filterStartDate', 'filterEndDate'];
    const autoApplyFilterIds = ['filterAction', 'filterDevice', 'filterBlocked', 'filterStartDate', 'filterEndDate'];
    let currentPage = 1;
    let totalPages = 1;
    let totalRecords = 0;
    let currentPageLogIds = [];
    const selectedLogIds = new Set();
    const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
    let currentPageSize = PAGE_SIZE_OPTIONS.includes(parseInt(localStorage.getItem('adminPageSize'), 10))
      ? parseInt(localStorage.getItem('adminPageSize'), 10)
      : 20;
    let currentFilters = { ...defaultFilters };
    let currentQuickRange = '';

    function normalizeFilterString(value) {
      return typeof value === 'string' ? value.trim() : '';
    }

    function normalizeLogId(value) {
      const parsed = Number.parseInt(value, 10);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }

    function normalizeFilters(source = {}) {
      const normalized = {
        openId: normalizeFilterString(source.openId),
        userName: normalizeFilterString(source.userName),
        tag: normalizeFilterString(source.tag),
        action: normalizeFilterString(source.action),
        device: normalizeFilterString(source.device),
        blocked: normalizeFilterString(source.blocked),
        startDate: normalizeFilterString(source.startDate),
        endDate: normalizeFilterString(source.endDate)
      };

      if (!['', 'blocked', 'normal'].includes(normalized.blocked)) normalized.blocked = '';
      if (normalized.startDate && normalized.endDate && normalized.startDate > normalized.endDate) {
        const temp = normalized.startDate;
        normalized.startDate = normalized.endDate;
        normalized.endDate = temp;
      }
      return normalized;
    }

    function readFiltersFromInputs() {
      return normalizeFilters({
        openId: document.getElementById('filterOpenId').value,
        userName: document.getElementById('filterUserName').value,
        tag: document.getElementById('filterTag').value,
        action: document.getElementById('filterAction').value,
        device: document.getElementById('filterDevice').value,
        blocked: document.getElementById('filterBlocked').value,
        startDate: document.getElementById('filterStartDate').value,
        endDate: document.getElementById('filterEndDate').value
      });
    }

    function writeFiltersToInputs(filters) {
      document.getElementById('filterOpenId').value = filters.openId || '';
      document.getElementById('filterUserName').value = filters.userName || '';
      document.getElementById('filterTag').value = filters.tag || '';
      document.getElementById('filterAction').value = filters.action || '';
      document.getElementById('filterDevice').value = filters.device || '';
      document.getElementById('filterBlocked').value = filters.blocked || '';
      document.getElementById('filterStartDate').value = filters.startDate || '';
      document.getElementById('filterEndDate').value = filters.endDate || '';
    }

    function formatDateInputValue(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    function buildShortcutRange(range) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = formatDateInputValue(today);
      if (range === 'today') return { startDate: end, endDate: end };
      if (range === 'last7') {
        const start = new Date(today);
        start.setDate(start.getDate() - 6);
        return { startDate: formatDateInputValue(start), endDate: end };
      }
      if (range === 'last30') {
        const start = new Date(today);
        start.setDate(start.getDate() - 29);
        return { startDate: formatDateInputValue(start), endDate: end };
      }
      if (range === 'month') {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return { startDate: formatDateInputValue(start), endDate: end };
      }
      return null;
    }

    function detectQuickRange(filters) {
      const ranges = ['today', 'last7', 'last30', 'month'];
      return ranges.find((range) => {
        const preset = buildShortcutRange(range);
        return preset && preset.startDate === filters.startDate && preset.endDate === filters.endDate;
      }) || '';
    }

    function updateShortcutState() {
      document.querySelectorAll('.filter-shortcut').forEach((button) => {
        button.classList.toggle('active', button.dataset.range === currentQuickRange);
      });
    }

    function buildFilterSummaryItems(filters) {
      const items = [];
      if (filters.openId) items.push(`OpenID：${filters.openId}`);
      if (filters.userName) items.push(`用户名：${filters.userName}`);
      if (filters.tag) items.push(`标签：${filters.tag}`);
      if (filters.action) items.push(`操作：${actionLabels[filters.action] || filters.action}`);
      if (filters.device) items.push(`设备：${deviceLabels[filters.device] || filters.device}`);
      if (filters.blocked) items.push(`状态：${blockedLabels[filters.blocked] || filters.blocked}`);
      if (filters.startDate || filters.endDate) {
        const rangeText = [filters.startDate || '开始', filters.endDate || '今天'].join(' ~ ');
        items.push(`时间：${rangeText}`);
      }
      return items;
    }

    function hasActiveLogFilters(filters = currentFilters) {
      return buildFilterSummaryItems(filters).length > 0;
    }

    function clearSelectedLogs(ids = null) {
      if (ids === null) {
        selectedLogIds.clear();
      } else {
        ids.forEach((id) => selectedLogIds.delete(id));
      }
      updateLogSelectionUi();
    }

    function toggleCurrentPageSelection(checked) {
      currentPageLogIds.forEach((id) => {
        if (checked) selectedLogIds.add(id);
        else selectedLogIds.delete(id);
      });
      updateLogSelectionUi();
    }

    function updateLogSelectionUi() {
      const selectedCount = selectedLogIds.size;
      const selectedOnPage = currentPageLogIds.filter((id) => selectedLogIds.has(id)).length;
      const selectPageCheckbox = document.getElementById('selectPageCheckbox');

      if (selectPageCheckbox) {
        selectPageCheckbox.checked = currentPageLogIds.length > 0 && selectedOnPage === currentPageLogIds.length;
        selectPageCheckbox.indeterminate = selectedOnPage > 0 && selectedOnPage < currentPageLogIds.length;
      }

      document.querySelectorAll('[data-log-select]').forEach((input) => {
        const logId = normalizeLogId(input.dataset.logid);
        const isSelected = logId !== null && selectedLogIds.has(logId);
        input.checked = isSelected;
        const container = input.closest('tr, .log-card');
        if (container) container.classList.toggle('is-selected', isSelected);
      });

      document.getElementById('logSelectionStatus').textContent = selectedCount > 0
        ? `已选 ${selectedCount} 条记录`
        : '未选中记录';
      document.getElementById('clearSelectionBtn').disabled = selectedCount === 0;
      document.getElementById('deleteSelectedBtn').disabled = selectedCount === 0;
      document.getElementById('deleteFilteredBtn').disabled = !hasActiveLogFilters() || totalRecords === 0;
      document.getElementById('selectVisibleBtn').disabled = currentPageLogIds.length === 0;
    }

    function renderFilterSummary(options = {}) {
      const { loading = false, total = totalRecords } = options;
      const summary = document.getElementById('filterSummary');
      if (!summary) return;
      const items = buildFilterSummaryItems(currentFilters);
      const chips = items.length
        ? items.map((item) => `<span class="filter-chip">${escapeHtml(item)}</span>`).join('')
        : '<span class="filter-chip empty">当前显示全部记录</span>';
      const countText = loading ? '记录数更新中…' : `命中 ${total} 条`;
      summary.innerHTML = `<span class="filter-summary-label">当前筛选</span>${chips}<span class="filter-summary-count">${countText}</span>`;
      updateShortcutState();
    }

    function syncFilterStateToUrl() {
      const url = new URL(window.location.href);
      Object.entries(currentFilters).forEach(([key, value]) => {
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
      });
      if (currentPage > 1) url.searchParams.set('page', String(currentPage));
      else url.searchParams.delete('page');
      if (currentPageSize !== 20) url.searchParams.set('limit', String(currentPageSize));
      else url.searchParams.delete('limit');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }

    function persistFilterState() {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(currentFilters));
      syncFilterStateToUrl();
    }

    function restoreFilterState() {
      const searchParams = new URLSearchParams(window.location.search);
      let storedFilters = {};
      try {
        storedFilters = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || '{}');
      } catch (error) {
        storedFilters = {};
      }

      const hasUrlFilters = Object.keys(defaultFilters).some((key) => searchParams.has(key));
      const initialFilters = hasUrlFilters
        ? Object.fromEntries(Object.keys(defaultFilters).map((key) => [key, searchParams.get(key) || '']))
        : storedFilters;

      currentFilters = normalizeFilters(initialFilters);

      const pageFromUrl = parseInt(searchParams.get('page'), 10);
      if (Number.isInteger(pageFromUrl) && pageFromUrl > 0) currentPage = pageFromUrl;

      const pageSizeFromUrl = parseInt(searchParams.get('limit'), 10);
      if (PAGE_SIZE_OPTIONS.includes(pageSizeFromUrl)) currentPageSize = pageSizeFromUrl;

      currentQuickRange = detectQuickRange(currentFilters);
      writeFiltersToInputs(currentFilters);
      document.getElementById('pageSizeSelect').value = String(currentPageSize);
      renderFilterSummary();
      syncFilterStateToUrl();
    }

    // Cookie 由服务端管理；adminLoggedIn 可读 Cookie 存在时验证后展示后台
    if (document.cookie.includes('adminLoggedIn=')) {
      showDashboard(); // 立即显示，避免登录页闪烁
      _origFetch(`${API_BASE}/api/admin/stats`).then(r => {
        if (r.ok) { loadStats(); loadLogs(); }
        else { autoLogout('登录已失效，请重新登录'); }
      }).catch(() => { loadStats(); loadLogs(); }); // 网络异常时乐观显示
    }

    // 页码输入框回车事件
    document.getElementById('jumpPageInput').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        jumpToPage();
      }
    });
    restoreFilterState();
    document.getElementById('pageSizeSelect').addEventListener('change', function(e) {
      const nextSize = parseInt(e.target.value, 10);
      currentPageSize = PAGE_SIZE_OPTIONS.includes(nextSize) ? nextSize : 20;
      localStorage.setItem('adminPageSize', String(currentPageSize));
      currentPage = 1;
      clearSelectedLogs();
      syncFilterStateToUrl();
      loadLogs();
    });
    document.getElementById('selectVisibleBtn').addEventListener('click', () => toggleCurrentPageSelection(true));
    document.getElementById('clearSelectionBtn').addEventListener('click', () => clearSelectedLogs());
    document.getElementById('deleteSelectedBtn').addEventListener('click', () => deleteSelectedLogs());
    document.getElementById('deleteFilteredBtn').addEventListener('click', () => deleteFilteredLogs());
    document.getElementById('selectPageCheckbox').addEventListener('change', (e) => {
      toggleCurrentPageSelection(e.target.checked);
    });
    updateLogSelectionUi();

    filterInputIds.forEach((id) => {
      const element = document.getElementById(id);
      if (!element) return;
      if (autoApplyFilterIds.includes(id)) {
        element.addEventListener('change', () => applyFilters());
      } else {
        element.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            applyFilters();
          }
        });
      }
    });

    document.getElementById('filterShortcuts').addEventListener('click', (event) => {
      const button = event.target.closest('[data-range]');
      if (!button) return;
      applyQuickRange(button.dataset.range);
    });

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await fetch(`${API_BASE}/api/admin/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: document.getElementById('username').value, password: document.getElementById('password').value })
        });
        const data = await res.json();
        if (data.success) { showDashboard(); loadStats(); loadLogs(); }
        else { document.getElementById('loginError').textContent = data.error || '登录失败'; document.getElementById('loginError').style.display = 'block'; }
      } catch (e) { document.getElementById('loginError').textContent = '网络错误'; document.getElementById('loginError').style.display = 'block'; }
    });

    document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await fetch(`${API_BASE}/api/admin/change-password`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldPassword: document.getElementById('oldPassword').value, newPassword: document.getElementById('newPassword').value })
        });
        const data = await res.json();
        if (data.success) { alert('密码修改成功'); hideModal('changePasswordModal'); } else { alert(data.error || '修改失败'); }
      } catch (e) { alert('网络错误'); }
    });

    document.getElementById('tagForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await fetch(`${API_BASE}/api/admin/tag`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ openId: document.getElementById('tagOpenId').value, tag: document.getElementById('tagValue').value })
        });
        const data = await res.json();
        if (data.success) { hideModal('tagModal'); loadLogs(); } else { alert(data.error || '操作失败'); }
      } catch (e) { alert('网络错误'); }
    });

    document.getElementById('blockForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const expiresAt = document.getElementById('blockExpiresAt').value;
      try {
        const res = await fetch(`${API_BASE}/api/admin/blacklist/add`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            openId: document.getElementById('blockOpenId').value,
            reason: document.getElementById('blockReason').value,
            ban_message: document.getElementById('blockBanMessage').value || null,
            expires_at: expiresAt || null
          })
        });
        const data = await res.json();
        if (data.success) { hideModal('blockModal'); loadStats(); loadLogs(); } else { alert(data.error || '操作失败'); }
      } catch (e) { alert('网络错误'); }
    });

    function showDashboard() { document.getElementById('loginPage').style.display = 'none'; document.getElementById('dashboard').style.display = 'block'; }
    async function logout() {
      await fetch(`${API_BASE}/api/admin/logout`, { method: 'POST' }).catch(() => {});
      location.reload();
    }

    // ── 日志/用户/黑名单按钮事件委托（替代 onclick 字符串注入）────────────────────
    function handleActionClick(e) {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const openId = btn.dataset.openid;
      const tag = btn.dataset.tag || '';
      const logId = normalizeLogId(btn.dataset.logid);
      if (action === 'tag')     showTagModal(openId, tag);
      else if (action === 'delete-log' && logId !== null) deleteSingleLog(logId);
      else if (action === 'unblock') unblockUser(openId);
      else if (action === 'block')   showBlockModal(openId);
      else if (action === 'filter')  filterByUser(openId);
    }
    function handleLogSelectionChange(e) {
      const checkbox = e.target.closest('[data-log-select]');
      if (!checkbox) return;
      const logId = normalizeLogId(checkbox.dataset.logid);
      if (logId === null) return;
      if (checkbox.checked) selectedLogIds.add(logId);
      else selectedLogIds.delete(logId);
      updateLogSelectionUi();
    }
    document.getElementById('logsTable').addEventListener('click', handleActionClick);
    document.getElementById('logCards').addEventListener('click', handleActionClick);
    document.getElementById('logsTable').addEventListener('change', handleLogSelectionChange);
    document.getElementById('logCards').addEventListener('change', handleLogSelectionChange);
    document.getElementById('blacklistContent').addEventListener('click', handleActionClick);
    document.getElementById('usersList').addEventListener('click', handleActionClick);
    // ──────────────────────────────────────────────────────────────────────────────

    function updateTableScrollHints() {
      const wrapper = document.getElementById('logsTableWrapper');
      const shell = document.getElementById('logsTableShell');
      if (!wrapper || !shell) return;
      const maxScroll = wrapper.scrollWidth - wrapper.clientWidth;
      const isScrollable = maxScroll > 1;
      shell.classList.toggle('is-scrollable', isScrollable);
      shell.classList.toggle('is-scroll-start', !isScrollable || wrapper.scrollLeft <= 1);
      shell.classList.toggle('is-scroll-end', !isScrollable || wrapper.scrollLeft >= maxScroll - 1);
    }

    function setupTableScrollHints() {
      const wrapper = document.getElementById('logsTableWrapper');
      if (!wrapper) return;
      wrapper.addEventListener('scroll', updateTableScrollHints, { passive: true });
      window.addEventListener('resize', updateTableScrollHints);
      if ('ResizeObserver' in window) {
        new ResizeObserver(updateTableScrollHints).observe(wrapper);
      }
      updateTableScrollHints();
    }
    setupTableScrollHints();

    function showModal(id) { document.getElementById(id).style.display = 'flex'; }
    function hideModal(id) { document.getElementById(id).style.display = 'none'; }
    function showChangePasswordModal() { showModal('changePasswordModal'); }
    function showClearLogsModal() { showModal('clearLogsModal'); }

    function showTagModal(openId, currentTag) {
      document.getElementById('tagOpenId').value = openId;
      document.getElementById('tagValue').value = currentTag || '';
      showModal('tagModal');
    }

    function showBlockModal(openId) {
      document.getElementById('blockOpenId').value = openId;
      document.getElementById('blockReason').value = '';
      document.getElementById('blockBanMessage').value = '';
      document.getElementById('blockExpiresAt').value = '';
      showModal('blockModal');
    }

    async function deleteLogsRequest(payload) {
      try {
        const res = await fetch(`${API_BASE}/api/admin/delete-logs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || '删除失败');
        return data;
      } catch (e) {
        console.error(e);
        alert(e.message || "删除失败");
        return null;
      }
    }

    async function deleteSingleLog(logId) {
      if (!confirm('确定删除这条记录吗？此操作不可恢复。')) return;
      const result = await deleteLogsRequest({ scope: 'ids', ids: [logId] });
      if (!result) return;
      clearSelectedLogs([logId]);
      alert(`已删除 ${result.deleted} 条记录`);
      loadStats();
      loadLogs();
    }

    async function deleteSelectedLogs() {
      const ids = Array.from(selectedLogIds);
      if (!ids.length) return;
      if (!confirm(`确定删除已选中的 ${ids.length} 条记录吗？此操作不可恢复。`)) return;
      const result = await deleteLogsRequest({ scope: 'ids', ids });
      if (!result) return;
      clearSelectedLogs(ids);
      alert(`已删除 ${result.deleted} 条记录`);
      loadStats();
      loadLogs();
    }

    async function deleteFilteredLogs() {
      if (!hasActiveLogFilters()) {
        alert('请先设置筛选条件，再执行筛选批量删除。');
        return;
      }
      if (!totalRecords) return;
      if (!confirm(`当前筛选结果共 ${totalRecords} 条，确定全部删除吗？此操作不可恢复。`)) return;
      const result = await deleteLogsRequest({ scope: 'filtered', filters: currentFilters });
      if (!result) return;
      clearSelectedLogs();
      alert(`已删除 ${result.deleted} 条记录`);
      loadStats();
      loadLogs();
    }

    async function unblockUser(openId) {
      if (!confirm('确定要解除拉黑吗？')) return;
      try {
        const res = await fetch(`${API_BASE}/api/admin/blacklist/remove`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ openId })
        });
        const data = await res.json();
        if (data.success) { loadStats(); loadLogs(); loadBlacklist(); }
      } catch (e) { alert('网络错误'); }
    }

    async function showUsersModal() {
      try {
        const res = await fetch(`${API_BASE}/api/admin/users`, {
          headers: {}
        });
        const data = await res.json();
        if (data.success) {
          document.getElementById("usersCount").textContent = data.data.length;
          document.getElementById("usersList").innerHTML = data.data.map(u => `
            <div class="list-item">
              <div class="list-item-info">
                <div class="list-item-title" style="font-size:12px;">${u.user_name ? `<span style="font-weight:600;">${escapeHtml(u.user_name)}</span> · ` : ''}${escapeHtml(u.open_id)}${u.tag ? `<span class="tag-badge">${escapeHtml(u.tag)}</span>` : ""}</div>
                <div class="list-item-subtitle">访问 ${u.log_count} 次 · 最后活跃 ${u.last_active ? formatShortDate(u.last_active) : "-"}</div>
              </div>
              <button class="btn-small btn-outline" data-action="filter" data-openid="${escapeHtml(u.open_id)}">筛选</button>
            </div>
          `).join("") || "<div class=\"empty-state\">暂无用户</div>";
          showModal("usersModal");
        }
      } catch (e) { console.error(e); }
    }

    function filterByUser(openId) {
      hideModal("usersModal");
      document.getElementById("filterOpenId").value = openId;
      applyFilters();
    }

    async function showBlacklistModal() {
      showModal('blacklistModal');
      await loadBlacklist();
    }

    async function loadBlacklist() {
      try {
        const res = await fetch(`${API_BASE}/api/admin/blacklist`, { headers: {} });
        const data = await res.json();
        const container = document.getElementById('blacklistContent');
        if (data.success && data.data.length > 0) {
          container.innerHTML = data.data.map(item => `
            <div class="list-item">
              <div class="list-item-info">
                <div class="list-item-title">${escapeHtml(item.open_id)}${item.tag ? `<span class="tag-badge">${escapeHtml(item.tag)}</span>` : ''}${item.expires_at ? `<span class="tag-badge" style="background:rgba(200,130,0,0.15);color:#b87a00;">临时</span>` : ''}</div>
                <div class="list-item-subtitle">${escapeHtml(item.reason) || '无原因'}${item.ban_message ? ` · 按钮：「${escapeHtml(item.ban_message)}」` : ''} · 封禁于 ${formatDate(item.created_at)}${item.expires_at ? ` · 解封于 ${formatDate(item.expires_at)}` : ' · 永久'}</div>
              </div>
              <button class="btn btn-small btn-outline" data-action="unblock" data-openid="${escapeHtml(item.open_id)}">解除</button>
            </div>
          `).join('');
        } else {
          container.innerHTML = '<div class="empty-state">暂无黑名单用户</div>';
        }
      } catch (e) { console.error(e); }
    }

    async function saveRetention() {
      try {
        const res = await fetch(`${API_BASE}/api/admin/update-retention`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days: parseInt(document.getElementById('retentionDays').value) })
        });
        if ((await res.json()).success) { alert('设置已保存'); loadStats(); }
      } catch (e) { alert('网络错误'); }
    }

    async function clearLogs() {
      const clearDays = document.getElementById('clearDays').value;
      if (!confirm(clearDays === 'all' ? '确定清除全部日志？' : `确定清除 ${clearDays} 天前的日志？`)) return;
      try {
        const res = await fetch(`${API_BASE}/api/admin/clear-logs`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days: parseInt(clearDays), clearAll: clearDays === 'all' })
        });
        const data = await res.json();
        if (data.success) { alert(`已删除 ${data.deleted} 条`); hideModal('clearLogsModal'); loadStats(); loadLogs(); }
      } catch (e) { alert('网络错误'); }
    }

    function refreshData() { loadStats(); loadLogs(); }

    function applyFilters() {
      currentFilters = readFiltersFromInputs();
      writeFiltersToInputs(currentFilters);
      currentQuickRange = detectQuickRange(currentFilters);
      currentPage = 1;
      clearSelectedLogs();
      persistFilterState();
      renderFilterSummary({ loading: true });
      loadLogs();
    }

    function applyQuickRange(range) {
      const shortcutRange = buildShortcutRange(range);
      if (!shortcutRange) return;
      document.getElementById('filterStartDate').value = shortcutRange.startDate;
      document.getElementById('filterEndDate').value = shortcutRange.endDate;
      currentQuickRange = range;
      applyFilters();
    }

    function resetFilters() {
      currentFilters = { ...defaultFilters };
      currentQuickRange = '';
      writeFiltersToInputs(currentFilters);
      currentPage = 1;
      clearSelectedLogs();
      persistFilterState();
      renderFilterSummary({ loading: true });
      loadLogs();
    }

    async function loadStats() {
      try {
        const res = await fetch(`${API_BASE}/api/admin/stats`, { headers: {} });
        const data = await res.json();
        if (data.success) {
          document.getElementById('statTotal').textContent = data.data.totalLogs;
          document.getElementById('statUnique').textContent = data.data.uniqueOpenIds;
          document.getElementById('statToday').textContent = data.data.todayLogs;
          document.getElementById('statBlocked').textContent = data.data.blockedCount;
          document.getElementById('statRetention').textContent = data.data.logRetentionDays + '天';
          document.getElementById('retentionDays').value = data.data.logRetentionDays;
        }
      } catch (e) { console.error(e); }
    }

    async function loadLogs() {
      renderFilterSummary({ loading: true });
      try {
        const params = new URLSearchParams({ page: currentPage, limit: currentPageSize });
        if (currentFilters.openId) params.append('openId', currentFilters.openId);
        if (currentFilters.userName) params.append('userName', currentFilters.userName);
        if (currentFilters.tag) params.append('tag', currentFilters.tag);
        if (currentFilters.action) params.append('action', currentFilters.action);
        if (currentFilters.device) params.append('device', currentFilters.device);
        if (currentFilters.blocked) params.append('blocked', currentFilters.blocked);
        if (currentFilters.startDate) params.append('startDate', currentFilters.startDate);
        if (currentFilters.endDate) params.append('endDate', currentFilters.endDate);

        const res = await fetch(`${API_BASE}/api/admin/logs?${params}`, { headers: {} });
        const data = await res.json();
        if (data.success) {
          const nextTotalPages = Math.max(data.pagination.totalPages || 0, 1);
          const nextTotalRecords = data.pagination.total || 0;
          if ((nextTotalRecords > 0 && currentPage > nextTotalPages) || (nextTotalRecords === 0 && currentPage !== 1)) {
            currentPage = nextTotalRecords === 0 ? 1 : nextTotalPages;
            syncFilterStateToUrl();
            return loadLogs();
          }
          totalPages = nextTotalPages;
          totalRecords = nextTotalRecords;
          currentPageLogIds = data.data.map((log) => normalizeLogId(log.id)).filter((id) => id !== null);
          syncFilterStateToUrl();
          renderLogs(data.data);
          renderLogCards(data.data);
          renderPagination(data.pagination);
          renderFilterSummary({ total: data.pagination.total });
          updateLogSelectionUi();
        }
      } catch (e) {
        console.error(e);
        renderFilterSummary({ total: totalRecords });
        currentPageLogIds = [];
        updateLogSelectionUi();
      }
    }

    // 详细设备解析
    function parseDevice(ua) {
      if (!ua) return { name: '未知', detail: '', badge: '', browser: '' };

      let name = '未知', detail = '', badge = '', browser = '';

      // 解析操作系统和设备
      if (/iPhone/.test(ua)) {
        name = 'iPhone';
        badge = 'ios';
        const iosMatch = ua.match(/iPhone OS ([\d_]+)/);
        if (iosMatch) {
          const iosVer = iosMatch[1].replace(/_/g, '.');
          detail = `iOS ${iosVer}`;
        }
      } else if (/iPad/.test(ua)) {
        name = 'iPad';
        badge = 'ios';
        const iosMatch = ua.match(/CPU OS ([\d_]+)/);
        if (iosMatch) {
          const iosVer = iosMatch[1].replace(/_/g, '.');
          detail = `iPadOS ${iosVer}`;
        }
      } else if (/Android/.test(ua)) {
        badge = 'android';
        const modelMatch = ua.match(/;\s*([^;)]+)\s*Build/);
        const verMatch = ua.match(/Android ([\d.]+)/);
        if (modelMatch && modelMatch[1]) {
          name = modelMatch[1].trim();
        } else {
          name = 'Android';
        }
        if (verMatch) {
          detail = `Android ${verMatch[1]}`;
        }
      } else if (/Mac OS X/.test(ua)) {
        name = 'Mac';
        badge = 'mac';
        const macMatch = ua.match(/Mac OS X ([\d_]+)/);
        if (macMatch) {
          const macVer = macMatch[1].replace(/_/g, '.');
          detail = `macOS ${macVer}`;
        }
      } else if (/Windows NT/.test(ua)) {
        name = 'Windows';
        badge = 'windows';
        const winMatch = ua.match(/Windows NT ([\d.]+)/);
        if (winMatch) {
          const winVer = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' }[winMatch[1]] || winMatch[1];
          detail = `Windows ${winVer}`;
        }
      } else if (/Linux/.test(ua)) {
        name = 'Linux';
      }

      // 解析浏览器
      if (/MicroMessenger/.test(ua)) {
        browser = '微信';
        badge = 'wechat';
        const wxMatch = ua.match(/MicroMessenger\/([\d.]+)/);
        if (wxMatch) browser = `微信 ${wxMatch[1].split('.').slice(0,2).join('.')}`;
      } else if (/Edg\//.test(ua)) {
        browser = 'Edge';
        const edgeMatch = ua.match(/Edg\/([\d]+)/);
        if (edgeMatch) browser = `Edge ${edgeMatch[1]}`;
      } else if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) {
        browser = 'Chrome';
        const chromeMatch = ua.match(/Chrome\/([\d]+)/);
        if (chromeMatch) browser = `Chrome ${chromeMatch[1]}`;
      } else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) {
        browser = 'Safari';
        const safariMatch = ua.match(/Version\/([\d.]+)/);
        if (safariMatch) browser = `Safari ${safariMatch[1].split('.').slice(0,2).join('.')}`;
      } else if (/Firefox\//.test(ua)) {
        browser = 'Firefox';
        const ffMatch = ua.match(/Firefox\/([\d]+)/);
        if (ffMatch) browser = `Firefox ${ffMatch[1]}`;
      }

      return { name, detail, badge, browser };
    }

    function renderOpenIdMeta(log, tagSafe) {
      const items = [];
      if (log.user_name) items.push(`<span class="user-name-sub">${escapeHtml(log.user_name)}</span>`);
      if (log.tag) items.push(`<span class="tag-badge">${tagSafe}</span>`);
      if (log.blocked_reason !== null) items.push('<span class="tag-badge blocked-badge">已拉黑</span>');
      return items.length ? `<div class="openid-meta-row">${items.join('')}</div>` : '';
    }

    function renderLogs(logs) {
      if (!logs.length) {
        document.getElementById('logsTable').innerHTML = '<tr><td colspan="7"><div class="empty-state">暂无符合条件的记录</div></td></tr>';
        requestAnimationFrame(updateTableScrollHints);
        return;
      }
      document.getElementById('logsTable').innerHTML = logs.map(log => {
        const logId = normalizeLogId(log.id);
        const isSelected = logId !== null && selectedLogIds.has(logId);
        const device = parseDevice(log.user_agent);
        const openIdSafe = escapeHtml(log.open_id);
        const tagSafe = escapeHtml(log.tag);
        const actionLabel = escapeHtml(formatAction(log.action));
        const openIdMeta = renderOpenIdMeta(log, tagSafe);
        return `
        <tr class="${isSelected ? 'is-selected' : ''}">
          <td class="table-select-col"><input type="checkbox" class="log-select-checkbox" data-log-select data-logid="${logId || ''}" ${isSelected ? 'checked' : ''} aria-label="选择该记录"></td>
          <td class="table-time-col" style="white-space:nowrap;">${formatDate(log.created_at)}</td>
          <td class="table-openid-col">
            <div class="openid-cell">${openIdSafe}</div>
            ${openIdMeta}
          </td>
          <td class="table-action-col"><span class="action-badge ${getActionClass(log.action)}">${actionLabel}</span></td>
          <td class="table-device-col">
            <div class="device-info">
              <div class="device-main">
                <span class="device-badge ${escapeHtml(device.badge)}">${escapeHtml(device.name)}</span>
                ${device.browser ? `<span class="device-badge">${escapeHtml(device.browser)}</span>` : ''}
              </div>
              ${device.detail ? `<div class="device-detail">${escapeHtml(device.detail)}</div>` : ''}
            </div>
          </td>
          <td class="ip-cell table-ip-col">
            ${escapeHtml(log.ip_address) || '-'}
            ${log.ip_geo ? `<div class="ip-geo">${escapeHtml(log.ip_geo)}</div>` : ''}
          </td>
          <td class="actions-cell table-actions-col">
            <button class="btn-tag" data-action="tag" data-openid="${openIdSafe}" data-tag="${tagSafe}">标签</button><button class="btn-delete" data-action="delete-log" data-logid="${logId || ''}">删除</button>
            ${log.blocked_reason !== null
              ? `<button class="btn-unblock" data-action="unblock" data-openid="${openIdSafe}">解黑</button>`
              : `<button class="btn-block" data-action="block" data-openid="${openIdSafe}">拉黑</button>`}
          </td>
        </tr>
      `}).join('');
      requestAnimationFrame(updateTableScrollHints);
    }

    function renderLogCards(logs) {
      if (!logs.length) {
        document.getElementById('logCards').innerHTML = '<div class="empty-state">暂无符合条件的记录</div>';
        return;
      }
      document.getElementById('logCards').innerHTML = logs.map(log => {
        const logId = normalizeLogId(log.id);
        const isSelected = logId !== null && selectedLogIds.has(logId);
        const device = parseDevice(log.user_agent);
        const openIdSafe = escapeHtml(log.open_id);
        const tagSafe = escapeHtml(log.tag);
        const actionLabel = escapeHtml(formatAction(log.action));
        const openIdMeta = renderOpenIdMeta(log, tagSafe);
        return `
        <div class="log-card ${isSelected ? 'is-selected' : ''}">
          <div class="log-card-header">
            <div class="log-card-header-main">
              <input type="checkbox" class="log-select-checkbox" data-log-select data-logid="${logId || ''}" ${isSelected ? 'checked' : ''} aria-label="选择该记录">
              <span class="log-card-time">${formatDate(log.created_at)}</span>
            </div>
            <span class="action-badge ${getActionClass(log.action)}">${actionLabel}</span>
          </div>
          <div class="log-card-openid">
            ${openIdSafe}
            ${openIdMeta}
          </div>
          <div class="device-info">
            <span class="device-badge ${escapeHtml(device.badge)}">${escapeHtml(device.name)}</span>
            ${device.browser ? `<span class="device-badge">${escapeHtml(device.browser)}</span>` : ''}
            ${device.detail ? `<span class="device-detail" style="margin-left:4px;">${escapeHtml(device.detail)}</span>` : ''}
          </div>
          <div class="log-card-ip">
            ${escapeHtml(log.ip_address) || '-'}
            ${log.ip_geo ? `<div class="ip-geo">${escapeHtml(log.ip_geo)}</div>` : ''}
          </div>
          <div class="log-card-row">
            <div></div>
            <div class="log-card-actions">
              <button class="btn-tag" data-action="tag" data-openid="${openIdSafe}" data-tag="${tagSafe}">标签</button><button class="btn-delete" data-action="delete-log" data-logid="${logId || ''}">删除</button>
              ${log.blocked_reason !== null
                ? `<button class="btn-unblock" data-action="unblock" data-openid="${openIdSafe}">解黑</button>`
                : `<button class="btn-block" data-action="block" data-openid="${openIdSafe}">拉黑</button>`}
            </div>
          </div>
        </div>
      `}).join('');
    }

    function renderPagination(p) {
      const safeTotalPages = Math.max(p.totalPages || 0, 1);
      let html = '';

      // 首页
      html += `<button onclick="goToPage(1)" ${p.page <= 1 ? 'disabled' : ''}>首页</button>`;
      html += `<button onclick="goToPage(${p.page - 1})" ${p.page <= 1 ? 'disabled' : ''}>上页</button>`;

      // 页码按钮
      const start = Math.max(1, p.page - 2);
      const end = Math.min(safeTotalPages, p.page + 2);

      if (start > 1) {
        html += `<button onclick="goToPage(1)">1</button>`;
        if (start > 2) html += `<span style="padding:0 4px;color:var(--ink-2);">…</span>`;
      }

      for (let i = start; i <= end; i++) {
        html += `<button class="${i === p.page ? 'current' : ''}" onclick="goToPage(${i})">${i}</button>`;
      }

      if (end < safeTotalPages) {
        if (end < safeTotalPages - 1) html += `<span style="padding:0 4px;color:var(--ink-2);">…</span>`;
        html += `<button onclick="goToPage(${safeTotalPages})">${safeTotalPages}</button>`;
      }

      html += `<button onclick="goToPage(${p.page + 1})" ${p.page >= safeTotalPages ? 'disabled' : ''}>下页</button>`;
      html += `<button onclick="goToPage(${safeTotalPages})" ${p.page >= safeTotalPages ? 'disabled' : ''}>末页</button>`;

      document.getElementById('paginationNav').innerHTML = html;

      // 更新跳转输入框
      document.getElementById('pageSizeSelect').value = String(p.limit || currentPageSize);
      document.getElementById('jumpPageInput').value = p.page;
      document.getElementById('jumpPageInput').max = safeTotalPages;
      document.getElementById('pageInfo').textContent = `第 ${p.page} 页，共 ${safeTotalPages} 页，共 ${p.total} 条记录，每页 ${p.limit || currentPageSize} 条`;
    }

    function jumpToPage() {
      const input = document.getElementById('jumpPageInput');
      let page = parseInt(input.value);
      if (isNaN(page) || page < 1) page = 1;
      if (page > totalPages) page = totalPages;
      input.value = page;
      goToPage(page);
    }

    function goToPage(page) {
      if (page < 1) page = 1;
      if (page > totalPages) page = totalPages;
      currentPage = page;
      syncFilterStateToUrl();
      loadLogs();
      // 滚动到顶部
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ===== 通知管理 =====
    async function showNotificationModal() {
      try {
        const res = await fetch('/api/admin/notification', {
          headers: {}
        });
        const n = res.ok ? await res.json() : null;
        if (n) {
          document.getElementById('notifAdminTitle').value = n.title || '';
          document.getElementById('notifAdminContent').value = n.content || '';
          document.getElementById('notifAdminType').value = n.type || 'once';
          const active = n.is_active === 1;
          document.getElementById('notifAdminStatus').innerHTML =
            active
              ? '<span style="color:#2d7a4a;">● 当前有活跃通知（' + (n.type === 'always' ? '每次弹出' : '首次弹出') + '）</span>'
              : '<span style="color:var(--ink-2);">● 当前无活跃通知</span>';
        } else {
          document.getElementById('notifAdminTitle').value = '';
          document.getElementById('notifAdminContent').value = '';
          document.getElementById('notifAdminType').value = 'once';
          document.getElementById('notifAdminStatus').innerHTML = '<span style="color:var(--ink-2);">● 当前无活跃通知</span>';
        }
      } catch (e) {
        document.getElementById('notifAdminStatus').innerHTML = '<span style="color:var(--accent);">● 加载失败</span>';
      }
      document.getElementById('notificationModal').style.display = 'flex';
    }

    async function saveNotification() {
      const title = document.getElementById('notifAdminTitle').value.trim();
      const content = document.getElementById('notifAdminContent').value.trim();
      const type = document.getElementById('notifAdminType').value;
      if (!title || !content) { alert('请填写标题和内容'); return; }
      try {
        const res = await fetch('/api/admin/notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, content, type, is_active: true })
        });
        if (res.ok) {
          hideModal('notificationModal');
          showAdminToast('通知已发布');
        } else {
          const err = await res.json();
          alert(err.error || '发布失败');
        }
      } catch (e) { alert('网络错误'); }
    }

    async function disableNotification() {
      if (!confirm('确认停用当前通知？')) return;
      try {
        const res = await fetch('/api/admin/notification', {
          method: 'DELETE',
          headers: {}
        });
        if (res.ok) {
          hideModal('notificationModal');
          showAdminToast('通知已停用');
        }
      } catch (e) { alert('网络错误'); }
    }

    function showAdminToast(msg) {
      let t = document.getElementById('adminToast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'adminToast';
        t.style.cssText = 'position:fixed;bottom:32px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:10px 20px;font-family:\'IBM Plex Mono\',monospace;font-size:12px;z-index:9999;opacity:0;transition:opacity 0.2s;white-space:nowrap;border-left:3px solid var(--accent);';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.style.opacity = '1';
      clearTimeout(t._timer);
      t._timer = setTimeout(() => { t.style.opacity = '0'; }, 2000);
    }

    function formatDate(d) { return new Date(d + 'Z').toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    function formatShortDate(d) { return new Date(d + 'Z').toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    function formatAction(a) { var m = { 'qr_manual': '手动刷新', 'qr_auto': '自动刷新', 'qr_timeout': '生成超时', 'qr_blocked': '已被拉黑', 'page_load': '页面加载', 'admin_verify_attempt': '管理员验证', 'admin_verify_success': '验证成功' }; return m[a] || '未知操作'; }
    function getActionClass(a) { if (a === 'qr_manual') return 'manual'; if (a === 'qr_auto') return 'auto'; if (a === 'qr_timeout') return 'timeout'; if (a === 'qr_blocked') return 'blocked'; if (a.includes('success')) return 'success'; if (a.includes('verify')) return 'verify'; if (a.includes('load')) return 'load'; return 'refresh'; }
