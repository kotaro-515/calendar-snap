// ==========================================
// Calendar Snap - Frontend Logic (Express連携版)
// ==========================================

// 状態管理
const state = {
  isAuthenticated: false,
  isCalendarGranted: false,
  isMockAuth: false,
  user: null,
  selectedImageBase64: null,
  selectedImageMimeType: null,
  currentYear: new Date().getFullYear() // 2026年
};

// UIエレメントの取得
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
  previewContainer: document.getElementById('preview-container'),
  previewImage: document.getElementById('preview-image'),
  btnRemoveImage: document.getElementById('btn-remove-image'),
  loader: document.getElementById('loader'),
  
  eventForm: document.getElementById('event-form'),
  eventTitle: document.getElementById('event-title'),
  eventStartDate: document.getElementById('event-start-date'),
  eventStartTime: document.getElementById('event-start-time'),
  eventEndDate: document.getElementById('event-end-date'),
  eventEndTime: document.getElementById('event-end-time'),
  eventLocation: document.getElementById('event-location'),
  eventDescription: document.getElementById('event-description'),
  btnAddCalendar: document.getElementById('btn-add-calendar'),
  toastContainer: document.getElementById('toast-container')
};

// ==========================================
// 1. 初期化処理 & 認証状態チェック
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  // Lucideアイコンの初期化
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
  
  // イベントリスナーの登録
  setupEventListeners();
  
  // サーバーの認証状態をチェック
  await checkAuthStatus();
});

// バックエンドから認証ステータスを取得し、UIを更新
async function checkAuthStatus() {
  try {
    const res = await fetch('/auth/status');
    if (!res.ok) throw new Error('Status check failed');
    
    const data = await res.json();
    
    // サーバーの環境変数が設定されていない場合
    if (data.configured === false) {
      el.configAlert.style.display = 'flex';
      el.btnLogin.disabled = true;
      el.btnLogin.style.opacity = '0.5';
      el.btnLogin.title = 'サーバーの.envファイルに必要なキーが設定されていません';
      return;
    }
    
    state.isAuthenticated = data.isAuthenticated;
    state.isCalendarGranted = data.isCalendarGranted;
    state.isMockAuth = data.isMockAuth;
    state.user = data.user;
    
    updateAuthUI();
  } catch (error) {
    console.error('Failed to fetch auth status:', error);
    showToast('サーバーとの通信に失敗しました。サーバーが起動しているか確認してください。', 'error');
    el.configAlert.style.display = 'flex';
  }
}

// 認証状態に応じたUIの切り替え
function updateAuthUI() {
  if (state.isAuthenticated) {
    // ログイン状態：ヘッダーのユーザープロフィール表示
    el.userAvatar.src = state.user.picture || 'https://lh3.googleusercontent.com/a/default-user=s96-c';
    
    // 模擬ログインの場合は (MOCK) を付与
    const suffix = state.isMockAuth ? ' (MOCK)' : '';
    el.userName.textContent = (state.user.name || state.user.email) + suffix;
    
    el.btnLogin.style.display = 'none';
    el.userInfo.style.display = 'flex';
    el.authAlert.style.display = 'none';
    
    if (state.isCalendarGranted) {
      // カレンダーAPI連携許可済み：ドロップ可能な「準備完了」状態
      el.grantAlert.style.display = 'none';
      
      if (state.isMockAuth) {
        const readyTitle = el.readyAlert.querySelector('h4');
        const readyDesc = el.readyAlert.querySelector('p');
        if (readyTitle) readyTitle.textContent = 'ハイブリッド模擬モードで準備完了！';
        if (readyDesc) readyDesc.innerHTML = 'Google設定なしで動作中です。画像をドロップすると<strong>本物のGemini AI</strong>が予定を解析します。';
      }
      
      el.readyAlert.style.display = 'flex';
    } else {
      // ログイン済みだがカレンダー未連携：許可を求める状態
      if (state.isMockAuth) {
        const grantTitle = el.grantAlert.querySelector('h4');
        const grantDesc = el.grantAlert.querySelector('p');
        const grantBtn = document.getElementById('btn-grant-calendar');
        if (grantTitle) grantTitle.textContent = '模擬カレンダー連携の許可';
        if (grantDesc) grantDesc.textContent = 'カレンダー連携を模擬体験します。実際のGoogleカレンダーには影響を与えませんのでご安心ください。';
        if (grantBtn) grantBtn.innerHTML = '<i data-lucide="shield-check"></i> 模擬カレンダー連携を許可する';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
      
      el.grantAlert.style.display = 'flex';
      el.readyAlert.style.display = 'none';
    }
  } else {
    // 未ログイン状態
    el.btnLogin.style.display = 'inline-flex';
    el.userInfo.style.display = 'none';
    
    if (state.isMockAuth) {
      const authTitle = el.authAlert.querySelector('h4');
      const authDesc = el.authAlert.querySelector('p');
      if (authTitle) authTitle.textContent = 'ハイブリッド模擬モードで起動中';
      if (authDesc) authDesc.innerHTML = 'Google Cloudの設定不要で動作しています。右上の「Googleでログイン」から模擬認証を行い、<strong>本物のAI解析</strong>をお試しください（完全無料）。';
      
      el.btnLogin.innerHTML = `
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="18px" height="18px" viewBox="0 0 48 48" style="margin-right: 8px;">
          <g>
            <path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
          </g>
        </svg>
        Googleでログイン (模擬)
      `;
    }
    
    el.authAlert.style.display = 'flex';
    el.grantAlert.style.display = 'none';
    el.readyAlert.style.display = 'none';
  }
  
  updateFormDisabledState();
}

// ==========================================
// 2. イベントリスナーの設定
// ==========================================
function setupEventListeners() {
  // Googleログインボタン
  el.btnLogin.addEventListener('click', () => {
    // バックエンドのログインルートにリダイレクト
    window.location.href = '/auth/google';
  });
  
  // カレンダーAPI連携許可ボタン
  el.btnGrantCalendar.addEventListener('click', () => {
    // バックエンドのカレンダー連携（追加認可）ルートにリダイレクト
    window.location.href = '/auth/grant';
  });
  
  // ログアウトボタン
  el.btnLogout.addEventListener('click', () => {
    // バックエンドのログアウトルートにリダイレクト
    window.location.href = '/auth/logout';
  });
  
  // ドラッグ＆ドロップイベント
  el.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.dropZone.classList.add('dragover');
  });
  
  el.dropZone.addEventListener('dragleave', () => {
    el.dropZone.classList.remove('dragover');
  });
  
  el.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    el.dropZone.classList.remove('dragover');
    
    if (!state.isCalendarGranted) {
      showToast('画像を解析する前に、GoogleカレンダーのAPI連携を許可してください。', 'warning');
      return;
    }
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleImageSelect(files[0]);
    }
  });
  
  el.dropZone.addEventListener('click', () => {
    if (!state.isCalendarGranted) {
      showToast('画像を解析する前に、GoogleカレンダーのAPI連携を許可してください。', 'warning');
      return;
    }
    el.fileInput.click();
  });
  
  el.fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      handleImageSelect(files[0]);
    }
  });
  
  // 画像削除ボタン
  el.btnRemoveImage.addEventListener('click', (e) => {
    e.stopPropagation();
    resetImage();
  });
  
  // カレンダー追加ボタン
  el.btnAddCalendar.addEventListener('click', addEventToGoogleCalendar);
}

// ==========================================
// 3. 画像処理 & アップロード
// ==========================================
function handleImageSelect(file) {
  if (!file.type.startsWith('image/')) {
    showToast('画像ファイルを選択してください。', 'error');
    return;
  }
  
  if (file.size > 5 * 1024 * 1024) {
    showToast('画像サイズは5MB以下にしてください。', 'error');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = (e) => {
    el.previewImage.src = e.target.result;
    el.dropZone.style.display = 'none';
    el.previewContainer.style.display = 'block';
    
    // Base64データを抽出
    state.selectedImageBase64 = e.target.result.split(',')[1];
    state.selectedImageMimeType = file.type;
    
    // 解析スタート
    analyzeImage();
  };
  reader.readAsDataURL(file);
}

// 画像の初期化
function resetImage() {
  state.selectedImageBase64 = null;
  state.selectedImageMimeType = null;
  el.fileInput.value = '';
  el.previewImage.src = '';
  el.previewContainer.style.display = 'none';
  el.dropZone.style.display = 'flex';
  
  el.eventForm.reset();
  updateFormDisabledState();
}

// ==========================================
// 4. バックエンドAPI経由の画像解析 (Gemini AI)
// ==========================================
async function analyzeImage() {
  if (!state.selectedImageBase64) return;
  
  // UIを「解析中」状態に
  el.loader.style.display = 'flex';
  el.eventForm.style.opacity = '0.5';
  updateFormDisabledState(true); // すべて一時的に無効化
  
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image: state.selectedImageBase64,
        mimeType: state.selectedImageMimeType
      })
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || '解析リクエストに失敗しました');
    }
    
    const responseData = await res.json();
    displayParsedEvent(responseData);
    showToast('AIによる予定の解析が完了しました！', 'success');
  } catch (error) {
    console.error('Analysis Error:', error);
    showToast(error.message || '画像の解析に失敗しました。画像が鮮明であることを確認してください。', 'error');
    updateFormDisabledState();
  } finally {
    el.loader.style.display = 'none';
    el.eventForm.style.opacity = '1';
  }
}

// 解析結果をフォームにセット
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
// 5. バックエンドAPI経由のGoogleカレンダー予定追加
// ==========================================
async function addEventToGoogleCalendar() {
  if (!state.isCalendarGranted) {
    showToast('カレンダーに追加するにはGoogleカレンダー連携の許可が必要です。', 'warning');
    return;
  }
  
  // 入力フォームの値の検証
  const summary = el.eventTitle.value.trim();
  const location = el.eventLocation.value.trim();
  const description = el.eventDescription.value.trim();
  
  const startDate = el.eventStartDate.value;
  const startTime = el.eventStartTime.value;
  const endDate = el.eventEndDate.value;
  const endTime = el.eventEndTime.value;
  
  if (!summary || !startDate || !startTime || !endDate || !endTime) {
    showToast('必須項目（タイトル、日時）を入力してください。', 'error');
    return;
  }
  
  const startDt = `${startDate}T${startTime}:00`;
  const endDt = `${endDate}T${endTime}:00`;
  
  // 日時の前後関係をチェック
  if (new Date(startDt) > new Date(endDt)) {
    showToast('終了日時は開始日時より後の時間を設定してください。', 'error');
    return;
  }

  el.btnAddCalendar.disabled = true;
  el.btnAddCalendar.textContent = "カレンダーに追加中...";
  
  try {
    const res = await fetch('/api/calendar/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        summary,
        location,
        description,
        startDate,
        startTime,
        endDate,
        endTime
      })
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || 'カレンダー登録リクエストに失敗しました');
    }
    
    const createdEvent = await res.json();
    const successMsg = state.isMockAuth
      ? 'カレンダーに予定を模擬登録しました！ 🎉'
      : 'Googleカレンダーに予定を登録しました！ 🎉';
    showToast(successMsg, 'success');
    
    // カレンダーの直通リンク表示
    if (createdEvent.htmlLink) {
      setTimeout(() => {
        const linkText = state.isMockAuth ? '模擬カレンダーで確認する' : 'カレンダーで確認する';
        showToast(`<a href="${createdEvent.htmlLink}" target="_blank" style="color: var(--accent-secondary); text-decoration: underline;">${linkText}</a>`, 'success');
      }, 1000);
    }
    
    resetImage();
  } catch (error) {
    console.error('Calendar Add Error:', error);
    showToast(`追加エラー: ${error.message}`, 'error');
  } finally {
    el.btnAddCalendar.disabled = false;
    el.btnAddCalendar.innerHTML = '<i data-lucide="calendar-plus"></i> Googleカレンダーに追加する';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

// ==========================================
// 6. UI制御ユーティリティ
// ==========================================

// フォームの活性・非活性制御
function updateFormDisabledState(forceDisableAll = false) {
  const isImageLoaded = !!state.selectedImageBase64;
  const isCalendarGranted = !!state.isCalendarGranted;
  
  const shouldDisableInputs = forceDisableAll || !isImageLoaded;
  const shouldDisableAddButton = forceDisableAll || !isImageLoaded || !isCalendarGranted;
  
  el.eventTitle.disabled = shouldDisableInputs;
  el.eventStartDate.disabled = shouldDisableInputs;
  el.eventStartTime.disabled = shouldDisableInputs;
  el.eventEndDate.disabled = shouldDisableInputs;
  el.eventEndTime.disabled = shouldDisableInputs;
  el.eventLocation.disabled = shouldDisableInputs;
  el.eventDescription.disabled = shouldDisableInputs;
  
  el.btnAddCalendar.disabled = shouldDisableAddButton;
}

// トースト通知の表示
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'info';
  if (type === 'success') icon = 'check-circle';
  if (type === 'error') icon = 'alert-triangle';
  if (type === 'warning') icon = 'alert-circle';
  
  toast.innerHTML = `
    <i data-lucide="${icon}"></i>
    <span style="font-size: 0.9rem; font-weight: 500;">${message}</span>
  `;
  
  el.toastContainer.appendChild(toast);
  if (typeof lucide !== 'undefined') lucide.createIcons();
  
  setTimeout(() => {
    toast.classList.add('hide');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 4000);
}
