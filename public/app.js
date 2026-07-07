// ==========================================
// Calendar Snap - Frontend Logic
// ==========================================

const state = {
  isAuthenticated: false,
  isCalendarGranted: false,
  isMockAuth: false,
  user: null,
  selectedImageBase64: null,
  selectedImageMimeType: null,
  currentEvents: [],
  analysisError: false,
  totalRegistered: parseInt(localStorage.getItem('cs_total') || '0')
};

const el = {
  btnLogin: document.getElementById('btn-login'),
  userInfo: document.getElementById('user-info'),
  userAvatar: document.getElementById('user-avatar'),
  userName: document.getElementById('user-name'),
  btnLogout: document.getElementById('btn-logout'),
  authAlert: document.getElementById('auth-alert'),
  grantAlert: document.getElementById('grant-alert'),
  readyAlert: document.getElementById('ready-alert'),
  btnGrantCalendar: document.getElementById('btn-grant-calendar'),
  configAlert: document.getElementById('config-alert'),
  dropZone: document.getElementById('drop-zone'),
  fileInput: document.getElementById('file-input'),
  cameraInput: document.getElementById('camera-input'),
  btnOpenFile: document.getElementById('btn-open-file'),
  btnOpenCamera: document.getElementById('btn-open-camera'),
  previewContainer: document.getElementById('preview-container'),
  previewImage: document.getElementById('preview-image'),
  btnRemoveImage: document.getElementById('btn-remove-image'),
  loader: document.getElementById('loader'),
  loadingText: document.getElementById('loading-text'),
  loadingProgress: document.getElementById('loading-progress'),
  retryArea: document.getElementById('retry-area'),
  btnRetry: document.getElementById('btn-retry'),
  eventsList: document.getElementById('events-list'),
  eventForm: document.getElementById('event-form'),
  eventTitle: document.getElementById('event-title'),
  eventStartDate: document.getElementById('event-start-date'),
  eventStartTime: document.getElementById('event-start-time'),
  eventEndDate: document.getElementById('event-end-date'),
  eventEndTime: document.getElementById('event-end-time'),
  eventLocation: document.getElementById('event-location'),
  eventDescription: document.getElementById('event-description'),
  btnAddCalendar: document.getElementById('btn-add-calendar'),
  toastContainer: document.getElementById('toast-container'),
  historySection: document.getElementById('history-section'),
  historyList: document.getElementById('history-list'),
  btnClearHistory: document.getElementById('btn-clear-history')
};

const LOADING_TIPS = [
  '🔍 AIが画像を読み込んでいます...',
  '🧠 テキストをじっくり解析中...',
  '📅 予定の日時を探しています...',
  '🤖 もう少しだけ待ってね！',
  '☕ AIが頑張ってます。コーヒーでも...',
  '✨ 予定情報を整理しています...',
  '🎯 もうすぐ完了します！',
];

let loadingTimers = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof lucide !== 'undefined') lucide.createIcons();
  setupEventListeners();
  await checkAuthStatus();
  renderHistory();
  updateCounter();
});

// ==========================================
// 1. 認証状態チェック
// ==========================================
async function checkAuthStatus() {
  try {
    const res = await fetch('/auth/status');
    if (!res.ok) throw new Error('Status check failed');
    const data = await res.json();

    if (data.configured === false) {
      el.configAlert.style.display = 'flex';
      el.btnLogin.disabled = true;
      el.btnLogin.style.opacity = '0.5';
      return;
    }

    state.isAuthenticated = data.isAuthenticated;
    state.isCalendarGranted = data.isCalendarGranted;
    state.isMockAuth = data.isMockAuth;
    state.user = data.user;
    updateAuthUI();
    updateSteps();
  } catch (error) {
    console.error('Failed to fetch auth status:', error);
    showToast('サーバーとの通信に失敗しました。', 'error');
    el.configAlert.style.display = 'flex';
  }
}

function updateAuthUI() {
  if (state.isAuthenticated) {
    el.userAvatar.src = state.user.picture || 'https://lh3.googleusercontent.com/a/default-user=s96-c';
    const suffix = state.isMockAuth ? ' (MOCK)' : '';
    el.userName.textContent = (state.user.name || state.user.email) + suffix;
    el.btnLogin.style.display = 'none';
    el.userInfo.style.display = 'flex';
    el.authAlert.style.display = 'none';

    if (state.isCalendarGranted) {
      el.grantAlert.style.display = 'none';
      el.readyAlert.style.display = 'flex';
    } else {
      el.grantAlert.style.display = 'flex';
      el.readyAlert.style.display = 'none';
    }
  } else {
    el.btnLogin.style.display = 'inline-flex';
    el.userInfo.style.display = 'none';
    el.authAlert.style.display = 'flex';
    el.grantAlert.style.display = 'none';
    el.readyAlert.style.display = 'none';
  }
  updateFormDisabledState();
}

// ==========================================
// 2. ステップインジケーター
// ==========================================
function updateSteps() {
  const ids = ['si-1', 'si-2', 'si-3', 'si-4'];
  const stepItems = ids.map(id => document.getElementById(id)).filter(Boolean);
  if (!stepItems.length) return;

  stepItems.forEach(s => s.classList.remove('active', 'done'));

  if (!state.isAuthenticated) {
    stepItems[0].classList.add('active');
  } else if (!state.isCalendarGranted) {
    stepItems[0].classList.add('done');
    stepItems[1].classList.add('active');
  } else {
    stepItems[0].classList.add('done');
    stepItems[1].classList.add('done');
    stepItems[2].classList.add('active');
  }
}

// ==========================================
// 3. イベントリスナー
// ==========================================
function setupEventListeners() {
  el.btnLogin.addEventListener('click', () => window.location.href = '/auth/google');
  el.btnGrantCalendar.addEventListener('click', () => window.location.href = '/auth/grant');
  el.btnLogout.addEventListener('click', () => window.location.href = '/auth/logout');

  el.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.dropZone.classList.add('dragover');
  });
  el.dropZone.addEventListener('dragleave', () => el.dropZone.classList.remove('dragover'));
  el.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    el.dropZone.classList.remove('dragover');
    if (!state.isCalendarGranted) {
      showToast('先にカレンダー連携を許可してください 📅', 'warning');
      return;
    }
    if (e.dataTransfer.files.length > 0) handleImageSelect(e.dataTransfer.files[0]);
  });

  el.dropZone.addEventListener('click', (e) => {
    if (e.target.closest('#btn-open-file') || e.target.closest('#btn-open-camera')) return;
    if (!state.isCalendarGranted) {
      showToast('先にカレンダー連携を許可してください 📅', 'warning');
      return;
    }
    el.fileInput.click();
  });

  el.btnOpenFile.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!state.isCalendarGranted) {
      showToast('先にカレンダー連携を許可してください 📅', 'warning');
      return;
    }
    el.fileInput.click();
  });

  el.btnOpenCamera.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!state.isCalendarGranted) {
      showToast('先にカレンダー連携を許可してください 📅', 'warning');
      return;
    }
    el.cameraInput.click();
  });

  el.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleImageSelect(e.target.files[0]);
  });
  el.cameraInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleImageSelect(e.target.files[0]);
  });

  el.btnRemoveImage.addEventListener('click', (e) => {
    e.stopPropagation();
    resetImage();
  });

  el.btnAddCalendar.addEventListener('click', addEventToGoogleCalendar);

  if (el.btnRetry) {
    el.btnRetry.addEventListener('click', () => {
      el.retryArea.style.display = 'none';
      analyzeImage();
    });
  }

  if (el.btnClearHistory) {
    el.btnClearHistory.addEventListener('click', clearHistory);
  }
}

// ==========================================
// 4. 画像処理
// ==========================================
function handleImageSelect(file) {
  if (!file.type.startsWith('image/')) {
    showToast('画像ファイルを選択してください 🖼️', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('画像サイズは5MB以下にしてください', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    el.previewImage.src = e.target.result;
    el.dropZone.style.display = 'none';
    el.previewContainer.style.display = 'block';
    if (el.retryArea) el.retryArea.style.display = 'none';
    state.selectedImageBase64 = e.target.result.split(',')[1];
    state.selectedImageMimeType = file.type;
    analyzeImage();
  };
  reader.readAsDataURL(file);
}

function resetImage() {
  state.selectedImageBase64 = null;
  state.selectedImageMimeType = null;
  state.currentEvents = [];
  el.fileInput.value = '';
  if (el.cameraInput) el.cameraInput.value = '';
  el.previewImage.src = '';
  el.previewContainer.style.display = 'none';
  el.dropZone.style.display = 'flex';
  if (el.retryArea) el.retryArea.style.display = 'none';
  if (el.eventsList) { el.eventsList.style.display = 'none'; el.eventsList.innerHTML = ''; }
  el.eventForm.reset();
  updateFormDisabledState();
}

// ==========================================
// 5. AI画像解析
// ==========================================
async function analyzeImage() {
  if (!state.selectedImageBase64) return;

  state.analysisError = false;
  el.loader.style.display = 'none'; // 水泡オーバーレイで代替
  el.eventForm.style.opacity = '0.4';
  if (el.eventsList) el.eventsList.style.display = 'none';
  updateFormDisabledState(true);
  showBubbleOverlay();
  startLoadingAnimation();

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: state.selectedImageBase64, mimeType: state.selectedImageMimeType })
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || '解析リクエストに失敗しました');
    }

    const responseData = await res.json();
    const events = responseData.events || [responseData];
    state.currentEvents = events;

    if (events.length === 1) {
      displayParsedEvent(events[0]);
      showToast('✨ AIが予定を検出しました！内容を確認してください', 'success');
    } else {
      displayEventsList(events);
      showToast(`✨ ${events.length}件の予定を検出！選んでください`, 'success');
    }

    const stepItems = document.querySelectorAll('.step-item');
    if (stepItems[2]) stepItems[2].classList.add('done');
    if (stepItems[3]) stepItems[3].classList.add('active');

  } catch (error) {
    console.error('Analysis Error:', error);
    state.analysisError = true;
    if (el.retryArea) el.retryArea.style.display = 'block';
    showToast('解析に失敗しました。再試行してみてください 🔄', 'error');
    updateFormDisabledState();
  } finally {
    stopLoadingAnimation();
    hideBubbleOverlay();
    el.loader.style.display = 'none';
    el.eventForm.style.opacity = '1';
  }
}

function displayEventsList(events) {
  el.eventsList.innerHTML = `<p class="events-list-title">📋 検出された予定（${events.length}件） — タップして選択</p>`;
  events.forEach((event) => {
    const card = document.createElement('div');
    card.className = 'event-card';
    card.innerHTML = `
      <div class="event-card-info">
        <div class="event-card-title">${escapeHtml(event.summary || '（タイトルなし）')}</div>
        <div class="event-card-date">📅 ${event.startDate || ''} ${event.startTime || ''}</div>
      </div>
      <button class="event-card-btn">選択</button>
    `;
    card.querySelector('.event-card-btn').addEventListener('click', () => {
      document.querySelectorAll('.event-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      displayParsedEvent(event);
      showToast('フォームに入力しました。確認してください ✅', 'success');
    });
    el.eventsList.appendChild(card);
  });
  el.eventsList.style.display = 'flex';
  el.eventsList.style.flexDirection = 'column';
  el.eventsList.style.gap = '0.6rem';
}

function displayParsedEvent(data) {
  el.eventTitle.value = data.summary || '';
  el.eventLocation.value = data.location || '';
  el.eventDescription.value = data.description || '';
  el.eventStartDate.value = data.startDate || '';
  el.eventStartTime.value = data.startTime || '';
  el.eventEndDate.value = data.endDate || data.startDate || '';
  el.eventEndTime.value = data.endTime || '';
  updateFormDisabledState();
}

// ==========================================
// 6. Googleカレンダーに追加
// ==========================================
async function addEventToGoogleCalendar() {
  if (!state.isCalendarGranted) {
    showToast('カレンダー連携を許可してください 📅', 'warning');
    return;
  }

  const summary = el.eventTitle.value.trim();
  const location = el.eventLocation.value.trim();
  const description = el.eventDescription.value.trim();
  const startDate = el.eventStartDate.value;
  const startTime = el.eventStartTime.value;
  const endDate = el.eventEndDate.value;
  const endTime = el.eventEndTime.value;

  if (!summary || !startDate || !startTime || !endDate || !endTime) {
    showToast('タイトルと日時を入力してください', 'error');
    return;
  }

  if (new Date(`${startDate}T${startTime}`) > new Date(`${endDate}T${endTime}`)) {
    showToast('終了日時は開始日時より後にしてください', 'error');
    return;
  }

  el.btnAddCalendar.disabled = true;
  el.btnAddCalendar.innerHTML = '⏳ 登録中...';

  try {
    const res = await fetch('/api/calendar/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary, location, description, startDate, startTime, endDate, endTime })
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || '登録リクエストに失敗しました');
    }

    const createdEvent = await res.json();

    launchConfetti();
    showToast('🎉 カレンダーに登録しました！', 'success');
    saveToHistory({ summary, location, startDate, startTime, endDate, endTime, eventId: createdEvent.id || null });

    if (createdEvent.htmlLink) {
      setTimeout(() => {
        showToast(`<a href="${createdEvent.htmlLink}" target="_blank" style="color:var(--accent-secondary);text-decoration:underline;">📅 カレンダーで確認する →</a>`, 'success');
      }, 1200);
    }

    resetImage();
  } catch (error) {
    console.error('Calendar Add Error:', error);
    showToast(`登録エラー: ${error.message}`, 'error');
  } finally {
    el.btnAddCalendar.disabled = false;
    el.btnAddCalendar.innerHTML = '<i data-lucide="calendar-plus"></i> Googleカレンダーに追加する';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

// ==========================================
// 7. 履歴管理
// ==========================================
const HISTORY_KEY = 'cs_history';
const MAX_HISTORY = 10;

function saveToHistory(event) {
  const history = loadHistoryData();
  history.unshift({ ...event, addedAt: new Date().toISOString() });
  if (history.length > MAX_HISTORY) history.pop();
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  state.totalRegistered++;
  localStorage.setItem('cs_total', state.totalRegistered);
  updateCounter();
  renderHistory();
}

function loadHistoryData() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}

function renderHistory() {
  const history = loadHistoryData();
  if (!el.historySection || !el.historyList) return;
  if (history.length === 0) { el.historySection.style.display = 'none'; return; }
  el.historySection.style.display = 'block';
  el.historyList.innerHTML = '';

  history.forEach((item, index) => {
    const added = new Date(item.addedAt);
    const dateStr = `${added.getMonth() + 1}/${added.getDate()} ${added.getHours()}:${String(added.getMinutes()).padStart(2, '0')}`;
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <div class="history-item-title">${escapeHtml(item.summary)}</div>
      <div class="history-item-date">📅 ${item.startDate} ${item.startTime}</div>
      <div class="history-item-added">✓ ${dateStr} に登録</div>
      ${item.eventId ? `<button class="history-delete-btn" title="カレンダーから削除">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>` : ''}
    `;
    if (item.eventId) {
      div.querySelector('.history-delete-btn').addEventListener('click', () => deleteCalendarEvent(item.eventId, index));
    }
    el.historyList.appendChild(div);
  });
}

async function deleteCalendarEvent(eventId, index) {
  if (!confirm('このカレンダーの予定を削除しますか？')) return;
  try {
    const res = await fetch('/api/calendar/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '削除に失敗しました');
    }
    // 履歴からも削除
    const history = loadHistoryData();
    history.splice(index, 1);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
    showToast('🗑️ カレンダーから削除しました', 'success');
  } catch (error) {
    showToast(`削除エラー: ${error.message}`, 'error');
  }
}

function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
  showToast('履歴を削除しました', 'success');
}

// ==========================================
// 8. 登録カウンター
// ==========================================
function updateCounter() {
  const badge = document.getElementById('counter-badge');
  if (!badge) return;
  if (state.totalRegistered === 0) { badge.style.display = 'none'; return; }
  badge.style.display = 'inline-flex';
  badge.textContent = `🎯 ${state.totalRegistered}件登録済み`;
}

// ==========================================
// 9. 水泡オーバーレイ
// ==========================================
function showBubbleOverlay() {
  const overlay = document.getElementById('bubble-overlay');
  if (!overlay) return;

  // 既存の水泡をクリア
  overlay.querySelectorAll('.bubble').forEach(b => b.remove());

  // 水泡を生成
  for (let i = 0; i < 35; i++) {
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    const size = Math.random() * 45 + 8;
    bubble.style.setProperty('--duration', `${Math.random() * 3 + 2.5}s`);
    bubble.style.setProperty('--delay', `${Math.random() * 5}s`);
    bubble.style.cssText += `
      left: ${Math.random() * 100}%;
      width: ${size}px;
      height: ${size}px;
    `;
    overlay.appendChild(bubble);
  }

  overlay.style.display = 'flex';
}

function hideBubbleOverlay() {
  const overlay = document.getElementById('bubble-overlay');
  if (!overlay) return;
  overlay.style.opacity = '0';
  overlay.style.transition = 'opacity 0.5s ease';
  setTimeout(() => {
    overlay.style.display = 'none';
    overlay.style.opacity = '';
    overlay.style.transition = '';
  }, 500);
}

// ==========================================
// 10. ローディングアニメーション
// ==========================================
function startLoadingAnimation() {
  const stepEls = ['step-1', 'step-2', 'step-3', 'step-4'].map(id => document.getElementById(id));
  let stepIndex = 0;
  let tipIndex = 0;
  let progress = 0;

  const progressTimer = setInterval(() => {
    if (progress < 88) {
      progress += Math.random() * 7 + 2;
      if (el.loadingProgress) el.loadingProgress.style.width = `${Math.min(progress, 88)}%`;
    }
  }, 450);

  const stepTimer = setInterval(() => {
    if (stepEls[stepIndex]) stepEls[stepIndex].classList.add('active');
    if (stepIndex > 0 && stepEls[stepIndex - 1]) stepEls[stepIndex - 1].classList.add('done');
    if (stepIndex < stepEls.length - 1) stepIndex++;
  }, 1800);

  const bubbleText = document.getElementById('bubble-loading-text');
  const bubbleProgress = document.getElementById('bubble-progress');

  const textTimer = setInterval(() => {
    tipIndex = (tipIndex + 1) % LOADING_TIPS.length;
    const msg = LOADING_TIPS[tipIndex];
    [el.loadingText, bubbleText].forEach(t => {
      if (!t) return;
      t.style.opacity = '0';
      setTimeout(() => { t.textContent = msg; t.style.opacity = '1'; }, 300);
    });
  }, 2200);

  if (el.loadingText) el.loadingText.textContent = LOADING_TIPS[0];
  if (bubbleText) bubbleText.textContent = LOADING_TIPS[0];
  if (bubbleProgress) {
    const bpTimer = setInterval(() => {
      if (progress < 88 && bubbleProgress) bubbleProgress.style.width = `${Math.min(progress, 88)}%`;
    }, 450);
    loadingTimers.push(bpTimer);
  }
  loadingTimers = [progressTimer, stepTimer, textTimer];
}

function stopLoadingAnimation() {
  loadingTimers.forEach(t => clearInterval(t));
  loadingTimers = [];
  ['step-1', 'step-2', 'step-3', 'step-4'].forEach(id => {
    const s = document.getElementById(id);
    if (s) s.classList.remove('active', 'done');
  });
  setTimeout(() => { if (el.loadingProgress) el.loadingProgress.style.width = '0%'; }, 400);
}

// ==========================================
// 10. 紙吹雪アニメーション
// ==========================================
function launchConfetti() {
  const colors = ['#c2410c', '#4d7c0f', '#b45309', '#ea580c', '#15803d', '#d97706', '#7c3aed'];
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden;';
  document.body.appendChild(container);

  if (!document.getElementById('confetti-style')) {
    const style = document.createElement('style');
    style.id = 'confetti-style';
    style.textContent = `@keyframes confetti-fall{0%{transform:translateY(-20px) rotate(0deg);opacity:1;}100%{transform:translateY(105vh) rotate(720deg);opacity:0;}}`;
    document.head.appendChild(style);
  }

  for (let i = 0; i < 90; i++) {
    const piece = document.createElement('div');
    const color = colors[Math.floor(Math.random() * colors.length)];
    const size = Math.random() * 10 + 5;
    const isCircle = Math.random() > 0.5;
    piece.style.cssText = `position:absolute;top:-20px;left:${Math.random() * 100}%;width:${size}px;height:${isCircle ? size : size * 0.5}px;background:${color};border-radius:${isCircle ? '50%' : '2px'};animation:confetti-fall ${Math.random() * 1.5 + 1.5}s ${Math.random() * 0.8}s ease-in forwards;opacity:0.9;`;
    container.appendChild(piece);
  }
  setTimeout(() => container.remove(), 3500);
}

// ==========================================
// 11. UI制御ユーティリティ
// ==========================================
function updateFormDisabledState(forceDisableAll = false) {
  const isImageLoaded = !!state.selectedImageBase64;
  const isCalendarGranted = !!state.isCalendarGranted;
  const disableInputs = forceDisableAll || !isImageLoaded;
  const disableAdd = forceDisableAll || !isImageLoaded || !isCalendarGranted;

  ['eventTitle', 'eventStartDate', 'eventStartTime', 'eventEndDate', 'eventEndTime', 'eventLocation', 'eventDescription'].forEach(k => {
    if (el[k]) el[k].disabled = disableInputs;
  });
  if (el.btnAddCalendar) el.btnAddCalendar.disabled = disableAdd;
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span style="font-size:0.9rem;font-weight:500;">${message}</span>`;
  el.toastContainer.appendChild(toast);
  if (typeof lucide !== 'undefined') lucide.createIcons();
  setTimeout(() => {
    toast.classList.add('hide');
    toast.addEventListener('animationend', () => toast.remove());
  }, 4500);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
