// ============================================
// デバッグモード設定
// ============================================
// 本番環境（Vercel / 本番ドメイン）では強制的にfalse
const IS_PRODUCTION = window.location.hostname.includes('vercel.app') ||
                      window.location.hostname.includes('.com') ||
                      window.location.hostname.includes('.jp') ||
                      (!window.location.hostname.includes('localhost') &&
                       !window.location.hostname.includes('127.0.0.1'));
const DEBUG_MODE = IS_PRODUCTION ? false : true; // 開発時のみtrue、本番は強制false
const log = DEBUG_MODE ? console.log.bind(console) : () => {};
const warn = DEBUG_MODE ? console.warn.bind(console) : () => {};
const logError = DEBUG_MODE ? console.error.bind(console) : () => {};

// ============================================
// バージョン管理 & キャッシュクリア
// ============================================
const APP_VERSION = '4.12.0-' + Date.now();
if (DEBUG_MODE) log('🚀 ArchiDeck バージョン:', APP_VERSION);

// 起動時にキャッシュを強制クリア
(async function forceClearCache() {
  try {
    // Service Worker のキャッシュをクリア
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      await caches.delete(name);
      log('🗑️ キャッシュ削除:', name);
    }

    // Service Worker を登録解除（完全無効化）
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
        log('🗑️ Service Worker 登録解除');
      }
    }
    log('✅ キャッシュクリア完了');
  } catch (e) {
    log('キャッシュクリアエラー（無視可）:', e);
  }
})();

// ============================================
// ユーティリティ関数
// ============================================

// デバウンス関数 - 連続呼び出しを制限
function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// スロットル関数 - 一定間隔で実行を制限
function throttle(func, limit = 100) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// 二重クリック防止ヘルパー
const SaveGuard = {
  _locks: new Set(),

  // 保存処理をロック（二重実行防止）
  async run(key, asyncFn) {
    if (this._locks.has(key)) {
      return false;
    }
    this._locks.add(key);
    try {
      return await asyncFn();
    } finally {
      this._locks.delete(key);
    }
  },

  // ロック状態を確認
  isLocked(key) {
    return this._locks.has(key);
  }
};

// 安全なJSONパース（エラー時はデフォルト値を返す）
function safeJsonParse(str, defaultValue = null) {
  if (!str) return defaultValue;
  try {
    return JSON.parse(str);
  } catch (e) {
    warn('JSON.parseエラー:', e.message);
    return defaultValue;
  }
}

// モーダル管理ユーティリティ
const ModalManager = {
  activeModal: null,
  previousFocus: null,

  // モーダルを開く（フォーカス管理付き）
  open(modalElement, firstFocusSelector = 'input:not([type="hidden"]), select, textarea, button') {
    if (!modalElement) return;

    // 既存のEscapeハンドラがあれば先に解除（蓄積防止）
    if (this._escapeHandler) {
      document.removeEventListener('keydown', this._escapeHandler);
      this._escapeHandler = null;
    }

    // 現在のフォーカス要素を保存
    this.previousFocus = document.activeElement;
    this.activeModal = modalElement;

    // モーダルを表示
    modalElement.classList.add('show');

    // 最初の入力要素にフォーカス
    setTimeout(() => {
      const firstFocusable = modalElement.querySelector(firstFocusSelector);
      if (firstFocusable) {
        firstFocusable.focus();
      }
    }, 100);

    // Escapeキーでのクローズを設定
    this._escapeHandler = (e) => {
      if (e.key === 'Escape' && this.activeModal === modalElement) {
        this.close(modalElement);
      }
    };
    document.addEventListener('keydown', this._escapeHandler);
  },

  // モーダルを閉じる
  close(modalElement) {
    if (!modalElement) return;

    modalElement.classList.remove('show');

    // Escapeハンドラを解除
    if (this._escapeHandler) {
      document.removeEventListener('keydown', this._escapeHandler);
      this._escapeHandler = null;
    }

    // 前のフォーカス要素に戻す
    if (this.previousFocus && typeof this.previousFocus.focus === 'function') {
      this.previousFocus.focus();
    }

    this.activeModal = null;
    this.previousFocus = null;
  }
};

// リクエストアイドルコールバック（ポリフィル付き）
const requestIdleCallback = window.requestIdleCallback || function(cb) {
  const start = Date.now();
  return setTimeout(() => {
    cb({
      didTimeout: false,
      timeRemaining: () => Math.max(0, 50 - (Date.now() - start))
    });
  }, 1);
};

// デバウンス済み検索関数
const debouncedRenderProjects = debounce(() => {
  renderProjects();
  // 検索履歴を保存
  const query = document.getElementById('searchQuery')?.value.trim();
  if (query && query.length >= 2) {
    saveSearchHistory(query);
  }
}, 250);

// コンテキストメニュー機能
const ContextMenu = {
  currentProjectId: null,
  menu: null,

  init() {
    this.menu = document.getElementById('contextMenu');
    // 案件カードの右クリックイベントをデリゲート
    document.addEventListener('contextmenu', (e) => {
      const card = e.target.closest('[data-project-id]');
      if (card && document.getElementById('projectsTab').contains(card)) {
        e.preventDefault();
        this.show(e.clientX, e.clientY, card.dataset.projectId);
      }
    });
    // クリックでメニューを閉じる
    document.addEventListener('click', () => this.hide());
  },

  show(x, y, projectId) {
    this.currentProjectId = projectId;
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    // メニュー項目を動的に更新（4番目の子要素がアーカイブ項目）
    const archiveItem = this.menu.querySelector('.context-menu-item:nth-child(4)');
    if (archiveItem) {
      archiveItem.innerHTML = project.is_archived ? '📂 復元' : '📦 完了済みに移動';
    }

    // 画面外にはみ出さないように位置調整
    this.menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
    this.menu.style.top = Math.min(y, window.innerHeight - 250) + 'px';
    this.menu.classList.add('show');
  },

  hide() {
    if (this.menu) this.menu.classList.remove('show');
    this.currentProjectId = null;
  },

  edit() {
    if (this.currentProjectId) openProjectModal(this.currentProjectId);
    this.hide();
  },

  toggleSelect() {
    if (this.currentProjectId) BatchOperations.toggle(this.currentProjectId);
    this.hide();
  },

  archive() {
    if (this.currentProjectId) {
      const project = projects.find(p => p.id === this.currentProjectId);
      if (project) {
        toggleArchive(this.currentProjectId, !project.is_archived);
      }
    }
    this.hide();
  },

  delete() {
    if (this.currentProjectId) deleteProject(this.currentProjectId);
    this.hide();
  }
};

// 検索オートコンプリート機能
function getSearchHistory() {
  return safeJsonParse(localStorage.getItem('archideck_search_history'), []);
}

function saveSearchHistory(query) {
  let history = getSearchHistory();
  // 重複を削除して先頭に追加
  history = history.filter(h => h.toLowerCase() !== query.toLowerCase());
  history.unshift(query);
  // 最大20件まで保持
  history = history.slice(0, 20);
  localStorage.setItem('archideck_search_history', JSON.stringify(history));
}

function updateSearchSuggestions() {
  const datalist = document.getElementById('searchSuggestions');
  if (!datalist) return;

  const history = getSearchHistory();
  // 顧客名一覧を取得（重複なし）
  const customers = [...new Set(projects.map(p => p.customer).filter(Boolean))];

  // 履歴と顧客名を統合（履歴優先）
  const suggestions = [...new Set([...history, ...customers])].slice(0, 15);

  datalist.innerHTML = suggestions.map(s => `<option value="${escapeHtml(s)}">`).join('');
}

// ============================================
// Undo/Redo 管理
// ============================================
const UndoManager = {
  history: [],
  redoStack: [],
  maxHistory: 50,
  isUndoing: false,

  // アクションを記録
  record(action) {
    if (this.isUndoing) return;

    this.history.push({
      ...action,
      timestamp: Date.now()
    });

    // 履歴の上限を超えたら古いものを削除
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // 新しいアクションが記録されたらRedoスタックをクリア
    this.redoStack = [];

    this.updateUI();
    log(`📝 操作記録: ${action.description}`, action);
  },

  // 元に戻す
  async undo() {
    if (this.history.length === 0) {
      showToast('元に戻す操作がありません', 'info');
      return;
    }

    this.isUndoing = true;

    try {
      const action = this.history.pop();
      this.redoStack.push(action);

      await this.revert(action);

      showToast(`↩️ 元に戻しました: ${action.description}`, 'success');
      announceToScreenReader(`元に戻しました: ${action.description}`);
    } catch (error) {
      logError('Undo失敗:', error);
      showToast('元に戻す操作に失敗しました', 'error');
    } finally {
      this.isUndoing = false;
      this.updateUI();
    }
  },

  // やり直す
  async redo() {
    if (this.redoStack.length === 0) {
      showToast('やり直す操作がありません', 'info');
      return;
    }

    this.isUndoing = true;

    try {
      const action = this.redoStack.pop();
      this.history.push(action);

      await this.apply(action);

      showToast(`↪️ やり直しました: ${action.description}`, 'success');
      announceToScreenReader(`やり直しました: ${action.description}`);
    } catch (error) {
      logError('Redo失敗:', error);
      showToast('やり直す操作に失敗しました', 'error');
    } finally {
      this.isUndoing = false;
      this.updateUI();
    }
  },

  // アクションを元に戻す
  async revert(action) {
    switch (action.type) {
      case 'UPDATE_PROJECT': {
        const { error } = await supabase
          .from('projects')
          .update(action.oldValue)
          .eq('id', action.projectId);
        if (error) throw new Error(`案件更新失敗: ${error.message}`);
        // ローカルデータも更新
        const projectIdx = projects.findIndex(p => p.id === action.projectId);
        if (projectIdx !== -1) {
          Object.assign(projects[projectIdx], action.oldValue);
        }
        renderProjects();
        break;
      }

      case 'UPDATE_TASK': {
        const proj = projects.find(p => p.id === action.projectId);
        if (proj && proj.tasks) {
          proj.tasks[action.taskKey] = { ...action.oldValue };
          const { error } = await supabase
            .from('projects')
            .update({ tasks: proj.tasks })
            .eq('id', action.projectId);
          if (error) throw new Error(`タスク更新失敗: ${error.message}`);
        }
        renderProjects();
        break;
      }

      case 'CREATE_PROJECT': {
        const { error } = await supabase.from('projects').delete().eq('id', action.projectId);
        if (error) throw new Error(`案件削除失敗: ${error.message}`);
        projects = projects.filter(p => p.id !== action.projectId);
        renderProjects();
        renderSidebar();
        break;
      }

      case 'DELETE_PROJECT': {
        const { data, error } = await supabase
          .from('projects')
          .insert(action.oldValue)
          .select()
          .single();
        if (error) throw new Error(`案件復元失敗: ${error.message}`);
        if (data) {
          projects.push(data);
        }
        renderProjects();
        renderSidebar();
        break;
      }

      case 'ARCHIVE_PROJECT': {
        const { error } = await supabase
          .from('projects')
          .update({ is_archived: action.oldValue })
          .eq('id', action.projectId);
        if (error) throw new Error(`アーカイブ更新失敗: ${error.message}`);
        const archiveIdx = projects.findIndex(p => p.id === action.projectId);
        if (archiveIdx !== -1) {
          projects[archiveIdx].is_archived = action.oldValue;
        }
        renderProjects();
        renderSidebar();
        break;
      }

      default:
        warn('未対応のアクションタイプ:', action.type);
    }
  },

  // アクションを再適用
  async apply(action) {
    switch (action.type) {
      case 'UPDATE_PROJECT': {
        const { error } = await supabase
          .from('projects')
          .update(action.newValue)
          .eq('id', action.projectId);
        if (error) throw new Error(`案件更新失敗: ${error.message}`);
        const projectIdx = projects.findIndex(p => p.id === action.projectId);
        if (projectIdx !== -1) {
          Object.assign(projects[projectIdx], action.newValue);
        }
        renderProjects();
        break;
      }

      case 'UPDATE_TASK': {
        const proj = projects.find(p => p.id === action.projectId);
        if (proj && proj.tasks) {
          proj.tasks[action.taskKey] = { ...action.newValue };
          const { error } = await supabase
            .from('projects')
            .update({ tasks: proj.tasks })
            .eq('id', action.projectId);
          if (error) throw new Error(`タスク更新失敗: ${error.message}`);
        }
        renderProjects();
        break;
      }

      case 'CREATE_PROJECT': {
        const { data, error } = await supabase
          .from('projects')
          .insert(action.newValue)
          .select()
          .single();
        if (error) throw new Error(`案件作成失敗: ${error.message}`);
        if (data) {
          projects.push(data);
        }
        renderProjects();
        renderSidebar();
        break;
      }

      case 'DELETE_PROJECT': {
        const { error } = await supabase.from('projects').delete().eq('id', action.projectId);
        if (error) throw new Error(`案件削除失敗: ${error.message}`);
        projects = projects.filter(p => p.id !== action.projectId);
        renderProjects();
        renderSidebar();
        break;
      }

      case 'ARCHIVE_PROJECT': {
        const { error } = await supabase
          .from('projects')
          .update({ is_archived: action.newValue })
          .eq('id', action.projectId);
        if (error) throw new Error(`アーカイブ更新失敗: ${error.message}`);
        const archiveIdx = projects.findIndex(p => p.id === action.projectId);
        if (archiveIdx !== -1) {
          projects[archiveIdx].is_archived = action.newValue;
        }
        renderProjects();
        renderSidebar();
        break;
      }

      default:
        warn('未対応のアクションタイプ:', action.type);
    }
  },

  // UI更新
  updateUI() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');

    if (undoBtn) {
      undoBtn.disabled = this.history.length === 0;
      undoBtn.title = this.history.length > 0
        ? `元に戻す: ${this.history[this.history.length - 1].description}`
        : '元に戻す操作がありません';
    }

    if (redoBtn) {
      redoBtn.disabled = this.redoStack.length === 0;
      redoBtn.title = this.redoStack.length > 0
        ? `やり直す: ${this.redoStack[this.redoStack.length - 1].description}`
        : 'やり直す操作がありません';
    }
  },

  // 履歴をクリア
  clear() {
    this.history = [];
    this.redoStack = [];
    this.updateUI();
  },

  // 操作可能かチェック
  canUndo() {
    return this.history.length > 0;
  },

  canRedo() {
    return this.redoStack.length > 0;
  }
};

// ============================================
// Supabase初期化
// ============================================
const SUPABASE_URL = 'https://twzsirpfudqwboeyakta.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3enNpcnBmdWRxd2JvZXlha3RhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MzM4NjgsImV4cCI6MjA3NzAwOTg2OH0.E_8GxfsO6Scjc0dDoEoyxq3i4lfvNxYZvnSL1OlSDSM';

// Supabase CDNのロード確認
if (!window.supabase) {
  logError('❌ Supabase CDN が読み込まれていません！');
  alert('Supabase CDN が読み込まれていません。ページを再読み込みしてください。');
}

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
log('✅ Supabase初期化完了:', SUPABASE_URL);

// グローバル変数
let currentUser = null;
let currentDesigner = null;
let currentUserCategory = null; // 'admin' | '設計' | 'IC'
let projects = [];
let designers = [];

// 部署マスタ（localStorage管理）
let departmentMaster = [];
const DEFAULT_DEPARTMENTS = ['注文住宅事業部', '不動産事業部', '外構事業部', 'AX戦略部'];
const OLD_DEFAULT_DEPARTMENTS = ['経営企画部', 'システム開発部', '設計部', '営業部', '工事部', 'IC部'];

function loadDepartmentMaster() {
  const saved = localStorage.getItem('departmentMaster');
  const version = localStorage.getItem('departmentMasterVersion');

  // バージョン2未満または未設定の場合は強制的にデフォルト値を設定
  if (!version || parseInt(version) < 2) {
    departmentMaster = [...DEFAULT_DEPARTMENTS];
    saveDepartmentMaster();
    localStorage.setItem('departmentMasterVersion', '2');
    return;
  }

  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // 有効な配列かつ空でない場合のみ使用
      if (Array.isArray(parsed) && parsed.length > 0) {
        departmentMaster = parsed;
      } else {
        departmentMaster = [...DEFAULT_DEPARTMENTS];
        saveDepartmentMaster();
      }
    } catch (e) {
      // JSONパースエラーの場合はデフォルト値を使用
      departmentMaster = [...DEFAULT_DEPARTMENTS];
      saveDepartmentMaster();
    }
  } else {
    departmentMaster = [...DEFAULT_DEPARTMENTS];
    saveDepartmentMaster();
  }
}

function saveDepartmentMaster() {
  localStorage.setItem('departmentMaster', JSON.stringify(departmentMaster));
}

function renderDepartmentChips() {
  const container = document.getElementById('departmentChips');
  if (!container) return;

  container.innerHTML = departmentMaster.map((dept, index) => `
    <span class="department-chip" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 16px; font-size: 13px;">
      ${escapeHtml(dept)}
      <button onclick="removeDepartment(${index})" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; line-height: 1; padding: 0 0 0 4px;">&times;</button>
    </span>
  `).join('');
}

function updateDepartmentDropdowns() {
  // departmentMasterが空の場合は先に読み込む
  if (!departmentMaster || departmentMaster.length === 0) {
    loadDepartmentMaster();
  }

  const selects = document.querySelectorAll('#newDesignerDepartmentInline, #editDesignerDepartment');
  selects.forEach(select => {
    const currentValue = select.value;
    const options = '<option value="">部署を選択</option>' +
      departmentMaster.map(dept => `<option value="${escapeHtml(dept)}" ${currentValue === dept ? 'selected' : ''}>${escapeHtml(dept)}</option>`).join('');
    select.innerHTML = options;
  });
}

function addDepartment() {
  const input = document.getElementById('newDepartmentName');
  const name = input.value.trim();

  if (!name) {
    showToast('部署名を入力してください', 'error');
    return;
  }

  if (departmentMaster.includes(name)) {
    showToast('既に存在する部署名です', 'error');
    return;
  }

  departmentMaster.push(name);
  saveDepartmentMaster();
  renderDepartmentChips();
  updateDepartmentDropdowns();
  input.value = '';
  showToast('部署を追加しました', 'success');
}

function removeDepartment(index) {
  if (!confirm(`「${departmentMaster[index]}」を削除しますか？`)) return;

  departmentMaster.splice(index, 1);
  saveDepartmentMaster();
  renderDepartmentChips();
  updateDepartmentDropdowns();
  showToast('部署を削除しました', 'success');
}

// IC関連定数（新旧両方のキーに対応）
// メーカー選択タスク（選択すると青色になる）
const IC_MAKER_SELECT_TASKS = [
  'ic_kitchen', 'ic_bath', 'ic_washroom', 'ic_toilet', 'ic_lighting',
  // 旧キー
  'ic_washroom_1f', 'ic_washroom_2f', 'ic_toilet_1f', 'ic_toilet_2f'
];
// 水廻りタスク（複数選択可能）
const IC_MULTI_SELECT_TASKS = [
  'ic_kitchen', 'ic_bath', 'ic_washroom', 'ic_toilet',
  // 旧キー
  'ic_washroom_1f', 'ic_washroom_2f', 'ic_toilet_1f', 'ic_toilet_2f'
];
// メールボタン表示対象タスク
const IC_MAKER_TASKS = [
  'ic_kitchen', 'ic_bath', 'ic_washroom', 'ic_toilet', 'ic_lighting',
  'ic_tategu', 'ic_tile_pres', 'ic_curtain', 'ic_zousaku', 'ic_furniture',
  // 旧キー
  'ic_washroom_1f', 'ic_washroom_2f', 'ic_toilet_1f', 'ic_toilet_2f'
];
// 「無し」「保存済」が青、「依頼済」が黄色のタスク
const IC_REQUEST_TASKS = ['ic_iron_pres', 'ic_tile_pres', 'ic_exterior_meeting', 'ic_curtain', 'ic_zousaku', 'ic_furniture'];
const INTERNAL_STATUSES = ['オリジナル', 'GRAFTECT', '-', '']; // 社内対応ステータス（メール不要）

// ============================================
// 変更履歴機能（無制限保持）
// ============================================

// 変更履歴を保存
async function saveChangeHistory(projectId, changeType, fieldName, oldValue, newValue, description = '') {
  try {
    const userName = currentUser?.email || 'unknown';

    await supabase.from('change_history').insert({
      project_id: projectId,
      user_name: userName,
      change_type: changeType,
      field_name: fieldName,
      old_value: oldValue?.toString() || '',
      new_value: newValue?.toString() || '',
      description: description
    });

    log('📝 変更履歴を保存:', { changeType, fieldName, oldValue, newValue });
  } catch (e) {
    // 変更履歴の保存失敗は無視（メイン処理に影響させない）
    logError('変更履歴保存エラー:', e);
  }
}

// 案件の変更履歴を取得（無制限）
async function getProjectChangeHistory(projectId) {
  try {
    const { data, error } = await supabase
      .from('change_history')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return data || [];
  } catch (e) {
    logError('変更履歴取得エラー:', e);
    return [];
  }
}

// 変更履歴を表示するモーダル
async function showChangeHistory(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) {
    showToast('案件が見つかりません', 'error');
    return;
  }

  // 履歴を取得
  const history = await getProjectChangeHistory(projectId);

  // モーダルを表示
  const modalHtml = `
    <div class="modal-backdrop" onclick="closeChangeHistoryModal()">
      <div class="modal-content" style="max-width: 700px; max-height: 80vh;" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>📜 変更履歴 - ${escapeHtml(project.customer)}</h3>
          <button class="btn btn-ghost" onclick="closeChangeHistoryModal()">&times;</button>
        </div>
        <div class="modal-body" style="overflow-y: auto; max-height: 60vh;">
          ${history.length > 0 ? `
            <table class="table" style="font-size: 13px;">
              <thead>
                <tr>
                  <th style="width: 150px;">日時</th>
                  <th style="width: 120px;">ユーザー</th>
                  <th style="width: 100px;">変更種別</th>
                  <th>内容</th>
                </tr>
              </thead>
              <tbody>
                ${history.map(h => `
                  <tr>
                    <td style="white-space: nowrap; color: var(--text-secondary);">${formatDateTime(h.created_at)}</td>
                    <td style="font-weight: 500;">${escapeHtml(h.user_name?.replace(/@.*$/, '') || '不明')}</td>
                    <td><span class="badge ${getChangeTypeBadgeClass(h.change_type)}">${getChangeTypeLabel(h.change_type)}</span></td>
                    <td>
                      <div><strong>${escapeHtml(h.field_name || '')}</strong></div>
                      ${h.old_value || h.new_value ? `
                        <div style="font-size: 12px; color: var(--text-muted);">
                          ${h.old_value ? `<span style="text-decoration: line-through; color: #ef4444;">${escapeHtml(h.old_value)}</span>` : ''}
                          ${h.old_value && h.new_value ? ' → ' : ''}
                          ${h.new_value ? `<span style="color: #10b981;">${escapeHtml(h.new_value)}</span>` : ''}
                        </div>
                      ` : ''}
                      ${h.description ? `<div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">${escapeHtml(h.description)}</div>` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `
            <div style="text-align: center; padding: 40px; color: var(--text-muted);">
              <p>変更履歴がありません</p>
            </div>
          `}
        </div>
      </div>
    </div>
  `;

  // 既存の履歴モーダルがあれば削除
  const existingModal = document.getElementById('changeHistoryModal');
  if (existingModal) existingModal.remove();

  // モーダルを追加
  const modalDiv = document.createElement('div');
  modalDiv.id = 'changeHistoryModal';
  modalDiv.innerHTML = modalHtml;
  document.body.appendChild(modalDiv);
}

// 変更履歴モーダルを閉じる
function closeChangeHistoryModal() {
  const modal = document.getElementById('changeHistoryModal');
  if (modal) modal.remove();
}

// 変更種別のラベルを取得
function getChangeTypeLabel(changeType) {
  const labels = {
    'task_update': 'タスク',
    'status_change': 'ステータス',
    'project_update': '案件情報',
    'archive': 'アーカイブ',
    'assignee_change': '担当者',
    'date_change': '日付'
  };
  return labels[changeType] || changeType || '変更';
}

// 変更種別のバッジクラスを取得
function getChangeTypeBadgeClass(changeType) {
  const classes = {
    'task_update': 'badge-primary',
    'status_change': 'badge-warning',
    'project_update': 'badge-secondary',
    'archive': 'badge-success',
    'assignee_change': 'badge-info',
    'date_change': 'badge-secondary'
  };
  return classes[changeType] || 'badge-secondary';
}

// ============================================
// 日付計算ヘルパー関数
// ============================================

// 日本の祝日リスト（2025年・2026年）
const japaneseHolidays = [
  // 2025年
  '2025-01-01', // 元日
  '2025-01-13', // 成人の日
  '2025-02-11', // 建国記念の日
  '2025-02-23', // 天皇誕生日
  '2025-02-24', // 振替休日
  '2025-03-20', // 春分の日
  '2025-04-29', // 昭和の日
  '2025-05-03', // 憲法記念日
  '2025-05-04', // みどりの日
  '2025-05-05', // こどもの日
  '2025-05-06', // 振替休日
  '2025-07-21', // 海の日
  '2025-08-11', // 山の日
  '2025-09-15', // 敬老の日
  '2025-09-23', // 秋分の日
  '2025-10-13', // スポーツの日
  '2025-11-03', // 文化の日
  '2025-11-23', // 勤労感謝の日
  '2025-11-24', // 振替休日
  // 2026年
  '2026-01-01', // 元日
  '2026-01-12', // 成人の日
  '2026-02-11', // 建国記念の日
  '2026-02-23', // 天皇誕生日
  '2026-03-20', // 春分の日
  '2026-04-29', // 昭和の日
  '2026-05-03', // 憲法記念日
  '2026-05-04', // みどりの日
  '2026-05-05', // こどもの日
  '2026-05-06', // 振替休日
  '2026-07-20', // 海の日
  '2026-08-11', // 山の日
  '2026-09-21', // 敬老の日
  '2026-09-22', // 国民の休日
  '2026-09-23', // 秋分の日
  '2026-10-12', // スポーツの日
  '2026-11-03', // 文化の日
  '2026-11-23', // 勤労感謝の日
];

// 祝日かどうかを判定
function isJapaneseHoliday(dateStr) {
  return japaneseHolidays.includes(dateStr);
}

// 日付をYYYY-MM-DD形式に変換
function formatDateISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 次の金曜日を計算する関数（金曜日が祝日なら木曜日）
function getNextFriday() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=日, 1=月, ..., 5=金, 6=土
  let daysUntilFriday;

  if (dayOfWeek === 5) {
    // 今日が金曜日の場合、来週の金曜日（7日後）
    daysUntilFriday = 7;
  } else if (dayOfWeek === 6) {
    // 土曜日の場合、6日後の金曜日
    daysUntilFriday = 6;
  } else {
    // 日〜木の場合、今週の金曜日
    daysUntilFriday = 5 - dayOfWeek;
  }

  const nextFriday = new Date(today);
  nextFriday.setDate(today.getDate() + daysUntilFriday);
  const fridayStr = formatDateISO(nextFriday);

  // 金曜日が祝日の場合は木曜日にする
  if (isJapaneseHoliday(fridayStr)) {
    const thursday = new Date(nextFriday);
    thursday.setDate(nextFriday.getDate() - 1);
    return formatDateISO(thursday);
  }

  return fridayStr;
}

// 日付を日本語表記に変換
function formatDateJapanese(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const weekday = weekdays[date.getDay()];
  return `${year}年${month}月${day}日（${weekday}）`;
}

// 翌週の金曜日を計算する関数（換気システム依頼用、金曜日が祝日なら木曜日）
function getNextWeekFriday() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=日, 1=月, ..., 5=金, 6=土

  // まず今週の金曜日までの日数を計算
  let daysUntilThisFriday;
  if (dayOfWeek <= 5) {
    daysUntilThisFriday = 5 - dayOfWeek;
  } else {
    // 土曜日の場合は6日後が金曜日
    daysUntilThisFriday = 6;
  }

  // 翌週の金曜日なので+7日
  const daysUntilNextWeekFriday = daysUntilThisFriday + 7;

  const nextWeekFriday = new Date(today);
  nextWeekFriday.setDate(today.getDate() + daysUntilNextWeekFriday);
  const fridayStr = formatDateISO(nextWeekFriday);

  // 金曜日が祝日の場合は木曜日にする
  if (isJapaneseHoliday(fridayStr)) {
    const thursday = new Date(nextWeekFriday);
    thursday.setDate(nextWeekFriday.getDate() - 1);
    return formatDateISO(thursday);
  }

  return fridayStr;
}

let emailTemplates = [];
let vendors = [];
let taskMappings = {};
let currentDesignerTab = 'ALL';
let editingProjectId = null;
let editingTemplateId = null;
let editingVendorId = null;

// 新システム用変数
let vendorCategories = [];
let tasksV2 = [];
let vendorsV2 = [];
let taskVendorMappings = [];
let products = [];

// マルチテナント対応（SaaS版）
let currentOrganization = null;
let currentSubscription = null;

// FCモード（フランチャイズ向けホワイトラベル）
let isFCMode = false;
let fcSlug = null;
let organizationSettings = null;

// 組織情報を読み込む
async function loadOrganization() {
  try {
    const { data: memberData } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', currentUser.id)
      .eq('status', 'active')
      .single();

    if (memberData) {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', memberData.organization_id)
        .single();

      if (orgData) {
        currentOrganization = orgData;
        applyWhiteLabel(orgData);

        const { data: subData } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('organization_id', orgData.id)
          .single();

        currentSubscription = subData;
        checkSubscriptionStatus(subData);
      }
    }
  } catch (error) {
    log('組織情報の読み込みをスキップ（テーブル未作成の可能性）');
  }
}

// ホワイトラベル適用
function applyWhiteLabel(org) {
  if (!org) return;

  // ロゴ変更
  if (org.logo_url) {
    const logoElements = document.querySelectorAll('.logo, .sidebar-logo');
    logoElements.forEach(el => {
      if (el.tagName === 'IMG') {
        el.src = org.logo_url;
      }
    });
  }

  // カラー変更
  if (org.primary_color) {
    document.documentElement.style.setProperty('--primary-color', org.primary_color);
  }
  if (org.secondary_color) {
    document.documentElement.style.setProperty('--secondary-color', org.secondary_color);
  }

  // タイトル変更
  if (org.name) {
    document.title = `ArchiDeck | ${org.name}`;
  }
}

// サブスクリプション状態チェック
function checkSubscriptionStatus(sub) {
  if (!sub) return;

  if (sub.status === 'trial') {
    const trialEnd = new Date(sub.trial_ends_at);
    const now = new Date();
    const daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));

    if (daysLeft <= 3 && daysLeft > 0) {
      showToast(`トライアル期間があと${daysLeft}日で終了します`, 'warning');
    } else if (daysLeft <= 0) {
      showToast('トライアル期間が終了しました。プランをアップグレードしてください。', 'error');
    }
  } else if (sub.status === 'past_due') {
    showToast('お支払いが遅延しています。管理画面で確認してください。', 'error');
  }
}

// 無限ループ防止フラグ
let isHandlingHashChange = false;

// 担当者のカテゴリに応じたタスクリストを取得（新システム）
function getTasksForAssignee(assigneeName) {
  const designer = designers.find(d => d.name === assigneeName);
  const category = designer?.category || '設計';

  // tasksV2が空の場合は空配列を返す
  if (!tasksV2 || tasksV2.length === 0) {
    warn('⚠️ tasksV2テーブルにデータがありません。migration_customizable_system.sqlを実行してください。');
    return [];
  }

  return tasksV2.filter(t => t.category === category).sort((a, b) => a.display_order - b.display_order);
}

// カテゴリ別のタスク定義を取得（Supabase + localStorage統合）
function getTasksForCategory(category) {
  // まずtasksV2（Supabase）から取得
  const supabaseTasks = tasksV2.filter(t => t.category === category).sort((a, b) => a.display_order - b.display_order);
  if (supabaseTasks.length > 0) {
    return supabaseTasks;
  }

  // Supabaseにデータがない場合、localStorageから取得（外構・不動産・工事）
  let localTasks = [];
  if (category === '外構' && typeof exteriorTasks !== 'undefined' && Array.isArray(exteriorTasks)) {
    localTasks = exteriorTasks;
  } else if (category === '不動産' && typeof realestateTasks !== 'undefined' && Array.isArray(realestateTasks)) {
    localTasks = realestateTasks;
  } else if (category === '工事' && typeof constructionTasks !== 'undefined' && Array.isArray(constructionTasks)) {
    localTasks = constructionTasks;
  }

  // localStorageのタスクをtasksV2互換の形式に変換
  return localTasks.map((t, index) => ({
    id: t.id,
    task_key: t.id,
    task_name: t.name,
    category: category,
    display_order: t.order || index + 1,
    has_state: true,
    state_options: t.states,
    has_email_button: false
  }));
}

// タスクの状態オプションを取得（新システム）
function getTaskStateOptions(taskKey) {
  // まずtasksV2（Supabase）から探す
  const task = tasksV2.find(t => t.task_key === taskKey);
  if (task && task.has_state && task.state_options) {
    // JSON文字列の場合はパース
    let options = task.state_options;
    if (typeof options === 'string') {
      try {
        options = JSON.parse(options);
      } catch (e) {
        return null;
      }
    }
    return options;
  }

  // localStorageベースのタスク（外構・不動産・工事）からも探す
  if (typeof exteriorTasks !== 'undefined' && Array.isArray(exteriorTasks)) {
    const exteriorTask = exteriorTasks.find(t => t.id === taskKey);
    if (exteriorTask && exteriorTask.states) return exteriorTask.states;
  }

  if (typeof realestateTasks !== 'undefined' && Array.isArray(realestateTasks)) {
    const realestateTask = realestateTasks.find(t => t.id === taskKey);
    if (realestateTask && realestateTask.states) return realestateTask.states;
  }

  if (typeof constructionTasks !== 'undefined' && Array.isArray(constructionTasks)) {
    const constructionTask = constructionTasks.find(t => t.id === taskKey);
    if (constructionTask && constructionTask.states) return constructionTask.states;
  }

  return null;
}

// ============================================
// 認証処理
// ============================================

// ユーザー名・アバター表示の共通関数
function updateUserDisplay(displayName) {
  const userNameEl = document.getElementById('userName');
  const userAvatarEl = document.getElementById('userAvatar');
  if (userNameEl) userNameEl.textContent = displayName;
  if (userAvatarEl) userAvatarEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=4A90E2&color=fff&size=32`;
}

// パスワード再設定UI表示
function showForgotPassword() {
  document.getElementById('forgotPasswordSection').style.display = 'block';
  document.getElementById('forgotEmail').value = document.getElementById('loginEmail').value;
  document.getElementById('forgotEmail').focus();
}

function hideForgotPassword() {
  document.getElementById('forgotPasswordSection').style.display = 'none';
}

// パスワード再設定メール送信
async function sendPasswordReset() {
  const email = document.getElementById('forgotEmail').value.trim();

  if (!email) {
    showToast('メールアドレスを入力してください', 'error');
    return;
  }

  if (!window.supabase) {
    showToast('エラー: システムが初期化されていません', 'error');
    return;
  }

  // 確認ダイアログを表示
  if (!confirm(`パスワードを再発行しますか？\n\n${email} 宛にパスワード再設定用のメールを送信します。\nメール内のリンクから新しいパスワードを設定してください。`)) {
    return;
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });

    if (error) {
      logError('パスワードリセットエラー:', error);
      showToast('メール送信に失敗しました: ' + error.message, 'error');
      return;
    }

    showToast('パスワード再設定用のメールを送信しました。メールをご確認ください。', 'success', 5000);
    hideForgotPassword();
  } catch (e) {
    logError('パスワードリセット例外:', e);
    showToast('エラーが発生しました', 'error');
  }
}

// アカウント情報表示
function renderAccountInfo() {
  const emailEl = document.getElementById('accountEmail');
  const usernameEl = document.getElementById('accountUsername');

  if (currentUser) {
    if (emailEl) emailEl.textContent = currentUser.email || '-';
    if (usernameEl) usernameEl.textContent = currentUser.email?.split('@')[0] || '-';
  } else {
    if (emailEl) emailEl.textContent = 'ログインしていません';
    if (usernameEl) usernameEl.textContent = '-';
  }
}

// パスワード変更
async function changePassword() {
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  // バリデーション
  if (!newPassword) {
    showToast('新しいパスワードを入力してください', 'error');
    return;
  }

  // 英数字混合8文字以上のチェック
  const hasLetter = /[a-zA-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  if (newPassword.length < 8 || !hasLetter || !hasNumber) {
    showToast('パスワードは英字と数字を含む8文字以上で設定してください', 'error');
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast('パスワードが一致しません', 'error');
    return;
  }

  if (!window.supabase) {
    showToast('エラー: システムが初期化されていません', 'error');
    return;
  }

  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) {
      logError('パスワード変更エラー:', error);
      showToast('パスワード変更に失敗しました: ' + error.message, 'error');
      return;
    }

    // 入力欄をクリア
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';

    showToast('パスワードを変更しました', 'success');
  } catch (e) {
    logError('パスワード変更例外:', e);
    showToast('エラーが発生しました', 'error');
  }
}

// パスワード設定モーダルを表示（初回ログイン/パスワードリセット用）
function showSetPasswordModal() {
  log('🔑 パスワード設定画面を表示');
  document.getElementById('loginContainer').style.display = 'none';
  document.getElementById('mainContainer').classList.remove('show');
  document.getElementById('setPasswordContainer').style.display = 'flex';
}

// 新しいパスワードを保存（初回設定用）
async function saveNewPassword() {
  if (SaveGuard.isLocked('saveNewPassword')) return;

  const newPassword = document.getElementById('setNewPassword').value;
  const confirmPassword = document.getElementById('setConfirmPassword').value;

  // バリデーション
  if (!newPassword) {
    showToast('新しいパスワードを入力してください', 'error');
    return;
  }

  // 英数字混合8文字以上のチェック
  const hasLetter = /[a-zA-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  if (newPassword.length < 8 || !hasLetter || !hasNumber) {
    showToast('パスワードは英字と数字を含む8文字以上で設定してください', 'error');
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast('パスワードが一致しません', 'error');
    return;
  }

  if (!window.supabase) {
    showToast('エラー: システムが初期化されていません', 'error');
    return;
  }

  await SaveGuard.run('saveNewPassword', async () => {
  try {
    // セッション状態を確認
    const { data: { session } } = await supabase.auth.getSession();
    log('🔑 パスワード設定時のセッション:', session ? session.user.email : 'なし');

    if (!session) {
      showToast('セッションが無効です。メールのリンクを再度クリックしてください。', 'error');
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) {
      logError('パスワード設定エラー:', error);
      showToast('パスワード設定に失敗しました: ' + error.message, 'error');
      return;
    }

    // 入力欄をクリア
    document.getElementById('setNewPassword').value = '';
    document.getElementById('setConfirmPassword').value = '';

    // パスワード設定画面を非表示にしてログイン画面へ
    document.getElementById('setPasswordContainer').style.display = 'none';
    document.getElementById('loginContainer').style.display = 'flex';

    showToast('パスワードを設定しました。新しいパスワードでログインしてください。', 'success', 5000);
  } catch (e) {
    logError('パスワード設定例外:', e);
    showToast('エラーが発生しました', 'error');
  }
  }); // SaveGuard.run
}

async function signIn() {
  const email = document.getElementById('loginEmail')?.value?.trim() || '';
  const password = document.getElementById('loginPassword')?.value?.trim() || '';

  if (!email) {
    showToast('メールアドレスを入力してください', 'error');
    return;
  }

  if (!password) {
    showToast('パスワードを入力してください', 'error');
    return;
  }

  if (!window.supabase) {
    showToast('エラー: Supabaseが初期化されていません。ページを再読み込みしてください。', 'error');
    return;
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) throw error;
    // ログイン成功 - onAuthStateChangeで処理される
  } catch (error) {
    showToast('ログインに失敗しました: ' + error.message, 'error');
  }
}

async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    location.reload();
  } catch (error) {
    logError('ログアウトエラー:', error);
    showToast('ログアウトに失敗しました', 'error');
  }
}

async function checkAuth() {
  log('🔍 認証状態をチェック中...');

  // URLハッシュにパスワードリカバリートークンが含まれているかチェック
  const hashParams = window.location.hash.substring(1);

  // エラーがある場合（リンク期限切れ等）
  if (hashParams.includes('error=')) {
    const urlParams = new URLSearchParams(hashParams);
    const errorCode = urlParams.get('error_code');
    const errorDesc = urlParams.get('error_description');
    log('❌ 認証エラー:', errorCode, errorDesc);

    if (errorCode === 'otp_expired') {
      showToast('メールリンクの有効期限が切れています。「パスワードを忘れた方」から再送信してください。', 'error', 8000);
    } else {
      showToast('認証エラー: ' + (errorDesc || errorCode), 'error', 8000);
    }
    document.getElementById('loginContainer').style.display = 'flex';
    document.getElementById('mainContainer').classList.remove('show');
    history.replaceState(null, '', window.location.pathname);
    return;
  }

  const isRecoveryFlow = hashParams.includes('type=recovery') || hashParams.includes('type=signup');

  if (isRecoveryFlow) {
    log('🔑 パスワードリカバリーフロー検出');
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('setPasswordContainer').style.display = 'flex';

    let retryCount = 0;
    const maxRetries = 20;
    const waitForSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        log('✅ リカバリーセッション確立:', session.user.email);
        return;
      }
      retryCount++;
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500));
        await waitForSession();
      } else {
        showToast('セッションの確立に失敗しました。', 'error');
        document.getElementById('setPasswordContainer').style.display = 'none';
        document.getElementById('loginContainer').style.display = 'flex';
      }
    };
    await waitForSession();
    return;
  }

  // ローカルストレージから直接セッションを確認
  const storageKey = 'sb-twzsirpfudqwboeyakta-auth-token';
  const storedSession = localStorage.getItem(storageKey);
  let session = null;

  if (storedSession) {
    try {
      const parsed = JSON.parse(storedSession);
      const isExpired = parsed.expires_at ? (parsed.expires_at * 1000 < Date.now()) : true;

      if (!isExpired && parsed.access_token && parsed.user) {
        session = {
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
          expires_at: parsed.expires_at,
          user: parsed.user
        };
      } else if (isExpired) {
        localStorage.removeItem(storageKey);
      }
    } catch (parseError) {
      localStorage.removeItem(storageKey);
    }
  }

  // localStorageにセッションがない場合のみgetSession()を呼ぶ
  if (!session) {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('getSession timeout')), 3000)
      );
      const sessionPromise = supabase.auth.getSession();
      const result = await Promise.race([sessionPromise, timeoutPromise]);
      session = result.data?.session;
    } catch (e) {
      document.getElementById('loginContainer').style.display = 'flex';
      document.getElementById('mainContainer').classList.remove('show');
      return;
    }
  }

  if (session) {
    log('✅ セッション検出:', session.user.email);
    currentUser = session.user;
    document.getElementById('loginContainer').style.display = 'none';

    // admin@ghouse.jpの場合は管理者モードで直接メイン画面へ
    if (currentUser.email === 'admin@ghouse.jp') {
      await selectAccountType('admin');
      return;
    }

    // 担当情報を取得
    try {
      const { data: designerData } = await supabase
        .from('designers')
        .select('*')
        .eq('email', currentUser.email)
        .single();

      if (designerData) {
        currentDesigner = designerData;
        currentUserCategory = designerData.category;
        log('✅ 担当情報取得:', currentDesigner.name);

        if (!designerData.auth_confirmed) {
          await supabase.from('designers').update({ auth_confirmed: true }).eq('id', designerData.id);
          currentDesigner.auth_confirmed = true;
        }
      }
    } catch (e) {
      // エラー時も続行
    }

    // メインコンテナを表示
    document.getElementById('mainContainer').classList.add('show');
    updateUserDisplay(currentDesigner?.name || currentUser.email.split('@')[0]);
    await init();

    if (!window.location.hash || window.location.hash === '#') {
      window.location.hash = 'projects';
    }
  } else {
    document.getElementById('loginContainer').style.display = 'flex';
    document.getElementById('mainContainer').classList.remove('show');
  }
}

// 認証処理中フラグ
let isAuthProcessing = false;
// サイレントサインアウト中フラグ（リロード防止用）
let isSilentSignOut = false;

// 認証状態変更を監視
supabase.auth.onAuthStateChange(async (event, session) => {
  log('🔔 認証イベント:', event);

  if (event === 'SIGNED_IN' && session && session.user && !currentUser && !isAuthProcessing) {
    isAuthProcessing = true;
    currentUser = session.user;
    document.getElementById('loginContainer').style.display = 'none';

    // admin@ghouse.jpの場合は管理者モードで直接メイン画面へ
    if (currentUser.email === 'admin@ghouse.jp') {
      currentUserCategory = 'admin';
      document.getElementById('mainContainer').classList.add('show');
      updateUserDisplay('管理者');
      await init();
      isAuthProcessing = false;
      return;
    }

    // 担当情報を取得
    const { data: designerData } = await supabase
      .from('designers')
      .select('*')
      .eq('email', currentUser.email)
      .single();

    if (designerData) {
      currentDesigner = designerData;
      currentUserCategory = designerData.category;
    }

    document.getElementById('mainContainer').classList.add('show');
    updateUserDisplay(currentDesigner?.name || currentUser.email.split('@')[0]);
    await init();
    isAuthProcessing = false;
  } else if (event === 'PASSWORD_RECOVERY') {
    showSetPasswordModal();
  } else if (event === 'SIGNED_OUT') {
    if (!isSilentSignOut) {
      location.reload();
    }
  }
});

// アカウントタイプ選択
async function selectAccountType(category) {
  log('🎯 アカウントタイプ選択:', category);
  currentUserCategory = category;
  document.getElementById('mainContainer').classList.add('show');

  // ユーザー名・アバターを表示（デモモード対応）
  const displayName = currentDesigner?.name || (currentUser?.email ? currentUser.email.split('@')[0] : 'demo');
  updateUserDisplay(displayName);

  // 切り替えボタンを表示
  updateCategorySwitchButton();

  await init();

  // 初期化完了後にデフォルトタブを設定（1回だけ）
  if (!window.location.hash || window.location.hash === '#') {
    window.location.hash = 'projects';
  }

  log('✅ アカウントタイプ選択完了');
}

// カテゴリ切り替えボタンの表示更新
function updateCategorySwitchButton() {
  const btn = document.getElementById('categorySwitchBtn');
  const label = document.getElementById('currentCategoryLabel');

  if (currentUserCategory === '設計') {
    label.textContent = '📐 設計';
  } else if (currentUserCategory === 'IC') {
    label.textContent = '🎨 IC';
  } else if (currentUserCategory === '外構') {
    label.textContent = '🌳 外構';
  } else if (currentUserCategory === '不動産') {
    label.textContent = '🏠 不動産';
  } else if (currentUserCategory === 'admin') {
    label.textContent = '👑 管理者';
  }

  btn.style.display = 'block';
}

// カテゴリ切り替えメニューの開閉
function toggleCategorySwitcher() {
  const menu = document.getElementById('categorySwitchMenu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

// メニュー外クリックで閉じる
document.addEventListener('click', function(e) {
  const menu = document.getElementById('categorySwitchMenu');
  const btn = document.getElementById('categorySwitchBtn');
  if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
    menu.style.display = 'none';
  }
});

// カテゴリ切り替え
async function switchCategory(category) {
  log('🔄 カテゴリ切り替え:', category);

  // メニューを閉じる
  document.getElementById('categorySwitchMenu').style.display = 'none';

  // 同じカテゴリなら何もしない
  if (currentUserCategory === category) {
    log('⏭️ 同じカテゴリのためスキップ');
    return;
  }

  // カテゴリを更新
  currentUserCategory = category;

  // ボタン表示を更新
  updateCategorySwitchButton();

  // データを再読み込み
  showStatus('読み込み中...', 'saving');
  await init();

  showToast(`${category === 'admin' ? '管理者' : category + '担当'}画面に切り替えました`, 'success');
  log('✅ カテゴリ切り替え完了');
}

// ============================================
// FCモード（フランチャイズ向けホワイトラベル）
// ============================================
function detectFCMode() {
  // URLパラメータからFCスラッグを取得
  const urlParams = new URLSearchParams(window.location.search);
  const fcParam = urlParams.get('fc');

  // localStorageからFCモード情報を取得
  const fcModeData = localStorage.getItem('fc_mode');

  if (fcParam) {
    isFCMode = true;
    fcSlug = fcParam;
    log('🏪 FCモード検出（URLパラメータ）:', fcSlug);
  } else if (fcModeData) {
    try {
      const fcConfig = JSON.parse(fcModeData);
      // 24時間以内の設定のみ有効
      if (fcConfig.timestamp && (Date.now() - fcConfig.timestamp < 24 * 60 * 60 * 1000)) {
        isFCMode = true;
        fcSlug = fcConfig.slug;
        log('🏪 FCモード検出（localStorage）:', fcSlug);
      }
    } catch (e) {
      warn('FC設定の解析に失敗:', e);
    }
  }

  // FCモードの場合はUI調整（非同期で実行）
  if (isFCMode) {
    applyFCMode().catch(e => warn('FCモード適用エラー:', e));
  }
}

async function applyFCMode() {
  log('🎨 FCモードUI適用中...');

  // 管理者ボタンを非表示にするCSS追加
  const fcStyle = document.createElement('style');
  fcStyle.id = 'fc-mode-styles';
  fcStyle.textContent = `
    /* FCモード: 管理者関連を非表示 */
    .fc-hide { display: none !important; }

    /* アカウント選択画面の管理者ボタン */
    button[onclick="selectAccountType('admin')"] { display: none !important; }

    /* カテゴリ切り替えの管理者ボタン */
    button[onclick="switchCategory('admin')"] { display: none !important; }

    /* 設定画面の管理者専用セクション */
    .admin-only-section { display: none !important; }

    /* ヘッダーのGハウスロゴ */
    .header-logo-text .ghouse-text { display: none !important; }
  `;
  document.head.appendChild(fcStyle);

  // FC組織情報をDBから読み込み
  let fcOrg = null;
  try {
    const { data, error } = await supabase
      .from('fc_organizations')
      .select('*')
      .eq('slug', fcSlug)
      .eq('is_active', true)
      .single();

    if (!error && data) {
      fcOrg = data;
      log('📦 FC組織情報取得:', fcOrg.name);
    }
  } catch (e) {
    warn('FC組織情報取得エラー:', e);
  }

  // FC組織のカスタム設定を適用
  if (fcOrg) {
    // タイトル設定
    document.title = fcOrg.name + ' | 設計業務管理システム';

    // プライマリカラーを適用
    if (fcOrg.primary_color) {
      document.documentElement.style.setProperty('--primary-color', fcOrg.primary_color);
    }

    // ロゴを適用（ヘッダー）
    setTimeout(() => {
      const headerLogo = document.querySelector('.header-logo-text');
      if (headerLogo) {
        if (fcOrg.logo_url) {
          headerLogo.innerHTML = `<img src="${escapeHtml(fcOrg.logo_url)}" alt="${escapeHtml(fcOrg.name)}" style="height: 32px; vertical-align: middle;">`;
        } else {
          headerLogo.innerHTML = `<span style="color: var(--primary-color);">${escapeHtml(fcOrg.name)}</span>`;
        }
      }

      // ログイン画面のロゴテキストを変更
      const loginLogoText = document.querySelector('.login-logo-text');
      if (loginLogoText) {
        if (fcOrg.logo_url) {
          loginLogoText.innerHTML = `<img src="${escapeHtml(fcOrg.logo_url)}" alt="${escapeHtml(fcOrg.name)}" style="height: 48px;">`;
        } else {
          loginLogoText.innerHTML = `<span style="color: var(--primary-color);">${escapeHtml(fcOrg.name)}</span>`;
        }
      }

      // 設定画面で組織名を表示
      const orgNameDisplay = document.getElementById('orgNameDisplay');
      if (orgNameDisplay) {
        orgNameDisplay.textContent = fcOrg.name;
      }
    }, 100);
  } else {
    // FC組織が見つからない場合はデフォルト設定
    document.title = '設計業務管理システム';

    // ログイン画面のGハウス表示を非表示
    const loginBranding = document.querySelector('#loginContainer p[style*="color: var(--text-muted)"]');
    if (loginBranding && loginBranding.textContent.includes('Gハウス')) {
      loginBranding.style.display = 'none';
    }

    // ログイン画面のロゴテキストを変更
    const loginLogoText = document.querySelector('.login-logo-text');
    if (loginLogoText) {
      loginLogoText.innerHTML = '<span style="color: var(--primary-color);">設計業務</span>管理システム';
    }

    setTimeout(() => {
      const headerLogo = document.querySelector('.header-logo-text');
      if (headerLogo && headerLogo.innerHTML.includes('Gハウス')) {
        headerLogo.innerHTML = '<span style="color: var(--primary-color);">Archi</span>Deck';
      }

      const orgNameDisplay = document.getElementById('orgNameDisplay');
      if (orgNameDisplay && fcSlug) {
        orgNameDisplay.textContent = fcSlug + ' 専用システム';
      }
    }, 100);
  }

  log('✅ FCモードUI適用完了');
}

function exitFCMode() {
  localStorage.removeItem('fc_mode');
  isFCMode = false;
  fcSlug = null;
  // URLパラメータを削除してリロード
  const url = new URL(window.location);
  url.searchParams.delete('fc');
  window.location.href = url.toString();
}

// ============================================
// キーボードショートカット
// ============================================
function initKeyboardShortcuts() {
  document.addEventListener('keydown', handleKeyboardShortcut);
}

function handleKeyboardShortcut(e) {
  // モーダルが開いている場合のEscapeキー
  if (e.key === 'Escape') {
    // .show クラスのモーダルを閉じる
    const openModals = document.querySelectorAll('.modal.show');
    openModals.forEach(modal => modal.classList.remove('show'));
    // サイドバーを閉じる
    closeSidebar();
    return;
  }

  // Ctrl/Cmd + キー のショートカット
  if (e.ctrlKey || e.metaKey) {
    switch (e.key.toLowerCase()) {
      case 'n':
        // 新規案件作成
        if (!isLoginScreen()) {
          e.preventDefault();
          showNewProjectModal();
        }
        break;
      case 's':
        // 保存（現在の状態を同期）
        e.preventDefault();
        forceReloadData();
        showToast('データを同期しました', 'success');
        break;
      case 'k':
        // クイック検索
        e.preventDefault();
        const searchInput = document.querySelector('#searchQuery');
        if (searchInput) {
          searchInput.focus();
        }
        break;
      case 'z':
        // 元に戻す / やり直す
        e.preventDefault();
        if (e.shiftKey) {
          // Ctrl+Shift+Z = やり直す
          UndoManager.redo();
        } else {
          // Ctrl+Z = 元に戻す
          UndoManager.undo();
        }
        break;
      case 'y':
        // Ctrl+Y = やり直す（Windows標準）
        e.preventDefault();
        UndoManager.redo();
        break;
      case 'e':
        // Ctrl+E = CSV出力
        if (!isLoginScreen()) {
          e.preventDefault();
          exportToCSV();
        }
        break;
      case 'a':
        // Ctrl+A = 全選択（テキスト入力中でない場合）
        if (!isLoginScreen() && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
          e.preventDefault();
          BatchOperations.selectAll();
        }
        break;
      case 'd':
        // Ctrl+Shift+D = ダークモード切り替え
        if (e.shiftKey) {
          e.preventDefault();
          toggleDarkMode();
        }
        break;
    }
  }

  // Shift + キー のショートカット
  if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
    switch (e.key) {
      case '?':
        // ショートカットヘルプを表示
        showShortcutHelp();
        break;
    }
  }

  // 数字キーでタブ切り替え（入力中でない場合）
  if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'SELECT') {
      switch (e.key) {
        case '1':
          switchTab('projects');
          break;
        case '2':
          switchTab('analytics');
          break;
        case '3':
          switchTab('settings');
          break;
        case 'r':
          // フィルターリセット
          e.preventDefault();
          resetAllFilters();
          break;
        case 'j':
          // 次のカードへ移動
          e.preventDefault();
          CardNavigation.next();
          break;
        case 'k':
          // 前のカードへ移動
          e.preventDefault();
          CardNavigation.prev();
          break;
        case 'Enter':
          // 選択カード編集
          if (CardNavigation.currentIndex >= 0) {
            e.preventDefault();
            CardNavigation.edit();
          }
          break;
        case 'x':
          // カード選択トグル
          e.preventDefault();
          CardNavigation.toggleSelect();
          break;
      }
    }
  }
}

// カードナビゲーション
const CardNavigation = {
  currentIndex: -1,

  getCards() {
    return [...document.querySelectorAll('#projectsContainer .project-card')];
  },

  highlightCard(index) {
    const cards = this.getCards();
    cards.forEach((card, i) => {
      card.classList.remove('keyboard-focused');
      if (i === index) {
        card.classList.add('keyboard-focused');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    this.currentIndex = index;
  },

  next() {
    const cards = this.getCards();
    if (cards.length === 0) return;
    const newIndex = this.currentIndex < cards.length - 1 ? this.currentIndex + 1 : 0;
    this.highlightCard(newIndex);
  },

  prev() {
    const cards = this.getCards();
    if (cards.length === 0) return;
    const newIndex = this.currentIndex > 0 ? this.currentIndex - 1 : cards.length - 1;
    this.highlightCard(newIndex);
  },

  edit() {
    const cards = this.getCards();
    if (this.currentIndex >= 0 && this.currentIndex < cards.length) {
      const projectId = cards[this.currentIndex].dataset.projectId;
      if (projectId) editProject(projectId);
    }
  },

  toggleSelect() {
    const cards = this.getCards();
    if (this.currentIndex >= 0 && this.currentIndex < cards.length) {
      const projectId = cards[this.currentIndex].dataset.projectId;
      if (projectId) BatchOperations.toggle(projectId);
    }
  },

  reset() {
    this.currentIndex = -1;
    this.getCards().forEach(card => card.classList.remove('keyboard-focused'));
  }
};

// フィルターパネル表示切り替え
function toggleFilterPanel() {
  const panel = document.getElementById('filterPanel');
  const btn = document.getElementById('filterToggleBtn');
  if (panel.style.display === 'none') {
    panel.style.display = 'block';
    btn.innerHTML = '🔼 絞込';
  } else {
    panel.style.display = 'none';
    btn.innerHTML = '🔽 絞込';
  }
}

// フィルターリセット
function resetAllFilters() {
  const specFilter = document.getElementById('specFilter');
  const archiveFilter = document.getElementById('archiveFilter');
  const icProgressFilter = document.getElementById('icProgressFilter');
  const icAssigneeFilter = document.getElementById('icAssigneeFilter');
  const exteriorAssigneeFilter = document.getElementById('exteriorAssigneeFilter');
  const realestateAssigneeFilter = document.getElementById('realestateAssigneeFilter');
  const sourceFilter = document.getElementById('sourceFilter');
  const sortOrder = document.getElementById('sortOrder');
  const searchQuery = document.getElementById('searchQuery');

  if (specFilter) specFilter.value = '';
  if (archiveFilter) archiveFilter.value = 'active';
  if (icProgressFilter) icProgressFilter.value = '';
  if (icAssigneeFilter) icAssigneeFilter.value = '';
  if (exteriorAssigneeFilter) exteriorAssigneeFilter.value = '';
  if (realestateAssigneeFilter) realestateAssigneeFilter.value = '';
  if (sourceFilter) sourceFilter.value = '';
  if (sortOrder) sortOrder.value = 'updated_desc';
  if (searchQuery) searchQuery.value = '';

  renderProjects();
  showToast('フィルターをリセットしました', 'info');
}

// ダークモード切り替え
function toggleDarkMode() {
  const html = document.documentElement;
  const currentTheme = html.dataset.theme;
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  html.dataset.theme = newTheme;
  localStorage.setItem('archideck_theme', newTheme);

  // ボタンアイコン更新
  const darkModeBtn = document.getElementById('darkModeBtn');
  if (darkModeBtn) {
    darkModeBtn.textContent = newTheme === 'dark' ? '☀️' : '🌙';
  }

  showToast(newTheme === 'dark' ? 'ダークモードを有効化しました' : 'ライトモードに戻しました', 'info');
}

// ダークモード初期化
function initDarkMode() {
  const savedTheme = localStorage.getItem('archideck_theme');
  if (savedTheme === 'dark') {
    document.documentElement.dataset.theme = 'dark';
    const darkModeBtn = document.getElementById('darkModeBtn');
    if (darkModeBtn) {
      darkModeBtn.textContent = '☀️';
    }
  }
}

function isLoginScreen() {
  const loginContainer = document.getElementById('loginContainer');
  return loginContainer && loginContainer.style.display !== 'none';
}

function showShortcutHelp() {
  const helpContent = `
    <div style="padding: 20px; max-height: 80vh; overflow-y: auto;">
      <h3 style="margin-bottom: 16px; font-size: 18px;">⌨️ キーボードショートカット</h3>
      <div style="display: grid; gap: 8px;">
        <div style="font-weight: 600; color: var(--primary-color); margin-top: 8px;">基本操作</div>
        <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
          <span>Ctrl/Cmd + N</span><span>新規案件作成</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
          <span>Ctrl/Cmd + S</span><span>データ同期</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
          <span>Ctrl/Cmd + K</span><span>検索にフォーカス</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
          <span>Escape</span><span>モーダルを閉じる</span>
        </div>
        <div style="font-weight: 600; color: var(--primary-color); margin-top: 8px;">タブ切り替え</div>
        <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
          <span>1</span><span>案件タブ</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
          <span>2</span><span>分析タブ</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
          <span>3</span><span>設定タブ</span>
        </div>
        <div style="font-weight: 600; color: var(--primary-color); margin-top: 8px;">フィルター・表示</div>
        <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
          <span>R</span><span>フィルターリセット</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
          <span>D</span><span>統計ダッシュボード切り替え</span>
        </div>
        <div style="font-weight: 600; color: var(--primary-color); margin-top: 8px;">編集・選択</div>
        <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
          <span>Ctrl/Cmd + Z</span><span>元に戻す（Undo）</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
          <span>Ctrl/Cmd + Shift + Z</span><span>やり直す（Redo）</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
          <span>Ctrl/Cmd + A</span><span>全案件選択</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
          <span>Ctrl/Cmd + E</span><span>CSV出力</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
          <span>Ctrl/Cmd + Shift + D</span><span>ダークモード切り替え</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
          <span>Shift + ?</span><span>このヘルプを表示</span>
        </div>
        <div style="font-weight: 600; color: var(--primary-color); margin-top: 8px;">カードナビゲーション</div>
        <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
          <span>J</span><span>次のカードへ移動</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
          <span>K</span><span>前のカードへ移動</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
          <span>Enter</span><span>カードを編集</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary); border-radius: 6px;">
          <span>X</span><span>カード選択トグル</span>
        </div>
      </div>
    </div>
  `;

  // 簡易モーダルで表示
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
  modal.innerHTML = `
    <div class="modal-content" style="background: var(--bg-primary); border-radius: 12px; max-width: 400px; width: 90%;">
      ${helpContent}
      <div style="padding: 0 20px 20px; text-align: right;">
        <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">閉じる</button>
      </div>
    </div>
  `;
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  document.body.appendChild(modal);
}

// ============================================
// 初期化
// ============================================
async function init() {
  log('🚀 初期化開始...');
  showStatus('読み込み中...', 'saving');

  // 基本初期化
  initKeyboardShortcuts();
  ContextMenu.init();
  SessionManager.init();
  detectFCMode();

  try {
    // マルチテナント: 組織情報を先に読み込む
    await loadOrganization();

    log('📦 データ読み込み開始...');

    // データを並列読み込み
    const results = await Promise.allSettled([
      loadDesigners(),
      loadCurrentDesigner(),
      loadProjects(),
      loadEmailTemplates(),
      loadVendors(),
      loadTaskMappings(),
      loadVendorCategories(),
      loadTasksV2(),
      loadVendorsV2(),
      loadTaskVendorMappings(),
      loadProducts(),
      loadFcOrganizations(),
      loadAllProjectTasks()
    ]);

    // 各結果を確認
    const names = ['スタッフ', '現在のスタッフ', '案件', 'テンプレート', '業者', 'タスク設定', 'カテゴリ', 'タスクV2', '業者V2', 'タスク業者紐づけ', '商品', 'FC組織', '案件タスク'];
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        logError(`❌ ${names[index]}の読み込み失敗:`, result.reason);
      }
    });

    // 失敗したものがあればエラーを表示
    const failedCount = results.filter(r => r.status === 'rejected').length;
    if (failedCount > 0) {
      showToast(`${failedCount}件のデータ読み込みに失敗しました`, 'error');
    }

    // 業者データとカテゴリデータをマージ
    mergeVendorCategories();

    // 部署マスタを読み込み
    loadDepartmentMaster();

    // ICタスク自動マイグレーション
    await autoMigrateICTasks();

    // ICメールボタン設定の強制同期
    await syncICEmailButtonSettings();

    log('🎨 画面描画開始...');
    renderSidebar();

    // ログイン時に自分の担当タブを自動選択
    if (currentDesigner && currentDesigner.name) {
      selectDesigner(currentDesigner.name);
    } else {
      renderProjects();
    }

    renderTemplates();
    renderVendorsV2();

    // 新システムのUI初期化
    populateVendorCategoryDropdown();
    populateProductDropdown();

    // 各管理画面の初期描画
    renderDesignerListInline();
    renderCategoryFilters();
    populateAssigneeFilters();
    renderVendorsV2();
    renderCategoriesList();
    renderTasksManagement();
    renderProductsList();

    // モバイルスワイプジェスチャー初期化
    MobileGestures.init();

    // 期限リマインダーのチェック（3秒後）
    setTimeout(() => DeadlineManager.checkReminders(), 3000);

    // kintone自動同期（5秒後）
    setTimeout(() => autoSyncKintone(), 5000);

    // 変更履歴は無制限保持（クリーンアップなし）

    log('✅ 初期化完了');
    showStatus('保存済み', 'saved');

    // リアルタイム同期を開始
    setupRealtimeSync();

  } catch (error) {
    logError('❌ 初期化エラー:', error);
    showStatus('エラー', 'error');
    showToast('データの読み込みに失敗しました: ' + error.message, 'error');
  }
}

// ============================================
// リアルタイム同期（同時接続対応）
// ============================================
let realtimeChannel = null;

function setupRealtimeSync() {
  try {
    // 既存のチャンネルがあれば解除
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
    }

    log('🔄 リアルタイム同期を開始...');

    // 案件テーブルの変更を監視
    realtimeChannel = supabase
      .channel('realtime-sync')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'projects'
      }, (payload) => {
        handleProjectChange(payload);
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'designers'
      }, (payload) => {
        handleDesignerChange(payload);
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'project_tasks'
      }, (payload) => {
        handleTaskChange(payload);
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'project_minutes'
      }, (payload) => {
        handleMinutesChange(payload);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          log('✅ リアルタイム同期: 接続完了');
        } else if (status === 'CHANNEL_ERROR') {
          log('❌ リアルタイム同期: 接続エラー');
        }
      });

  } catch (e) {
    logError('❌ リアルタイム同期セットアップエラー:', e);
  }
}

// 案件変更ハンドラー
function handleProjectChange(payload) {
  const { eventType, new: newRecord, old: oldRecord } = payload;
  log(`📡 リアルタイム: projects ${eventType}`, payload);

  // 自分自身の変更は無視（二重更新防止）
  const lastLocalUpdate = localStorage.getItem('lastProjectUpdate');
  if (lastLocalUpdate && newRecord?.id) {
    const parsed = safeJsonParse(lastLocalUpdate, {});
    if (parsed.id === newRecord.id && Date.now() - parsed.time < 2000) {
      log('⏭️ 自分の変更をスキップ');
      return;
    }
  }

  switch (eventType) {
    case 'INSERT':
      // 新規案件が追加された
      if (newRecord && !projects.find(p => p.id === newRecord.id)) {
        projects.push(newRecord);
        showToast(`新規案件が追加されました: ${newRecord.customer}`, 'info', 3000);
        renderSidebar();
        renderProjects();
      }
      break;

    case 'UPDATE':
      // 案件が更新された
      if (newRecord) {
        const idx = projects.findIndex(p => p.id === newRecord.id);
        if (idx !== -1) {
          const oldData = projects[idx];
          projects[idx] = { ...oldData, ...newRecord };

          // 重要な変更があった場合のみ通知
          if (oldData.is_archived !== newRecord.is_archived ||
              oldData.assigned_to !== newRecord.assigned_to ||
              oldData.ic_assignee !== newRecord.ic_assignee) {
            showToast(`案件が更新されました: ${newRecord.customer}`, 'info', 2000);
          }

          renderSidebar();
          renderProjects();
        }
      }
      break;

    case 'DELETE':
      // 案件が削除された
      if (oldRecord) {
        const idx = projects.findIndex(p => p.id === oldRecord.id);
        if (idx !== -1) {
          projects.splice(idx, 1);
          showToast(`案件が削除されました: ${oldRecord.customer}`, 'warning', 3000);
          renderSidebar();
          renderProjects();
        }
      }
      break;
  }
}

// 担当変更ハンドラー
function handleDesignerChange(payload) {
  const { eventType, new: newRecord, old: oldRecord } = payload;
  log(`📡 リアルタイム: designers ${eventType}`, payload);

  switch (eventType) {
    case 'INSERT':
      if (newRecord && !designers.find(d => d.id === newRecord.id)) {
        designers.push(newRecord);
        renderSidebar();
        populateAssigneeFilters();
      }
      break;

    case 'UPDATE':
      if (newRecord) {
        const idx = designers.findIndex(d => d.id === newRecord.id);
        if (idx !== -1) {
          designers[idx] = { ...designers[idx], ...newRecord };
          renderSidebar();
          populateAssigneeFilters();
        }
      }
      break;

    case 'DELETE':
      if (oldRecord) {
        const idx = designers.findIndex(d => d.id === oldRecord.id);
        if (idx !== -1) {
          designers.splice(idx, 1);
          renderSidebar();
          populateAssigneeFilters();
        }
      }
      break;
  }
}

// タスク変更ハンドラー
function handleTaskChange(payload) {
  const { eventType, new: newRecord } = payload;
  log(`📡 リアルタイム: project_tasks ${eventType}`, payload);

  // タスクが変更された案件を再描画
  if (newRecord && newRecord.project_id) {
    const projectCard = document.querySelector(`[data-project-id="${newRecord.project_id}"]`);
    if (projectCard) {
      // タスクリストを再読み込み
      loadProjectTasks(newRecord.project_id);
    }
  }

  // カレンダー用のタスクデータを更新
  loadAllProjectTasks().then(() => {
    // カレンダーが表示中なら再描画
    const calendarTab = document.getElementById('calendarTab');
    if (calendarTab && calendarTab.classList.contains('active')) {
      renderCalendar();
    }
  });
}

// 議事録変更ハンドラー
function handleMinutesChange(payload) {
  const { eventType, new: newRecord } = payload;
  log(`📡 リアルタイム: project_minutes ${eventType}`, payload);

  // 議事録が変更された案件を再描画
  if (newRecord && newRecord.project_id) {
    const projectCard = document.querySelector(`[data-project-id="${newRecord.project_id}"]`);
    if (projectCard) {
      loadProjectMinutes(newRecord.project_id);
    }
  }
}

// 自分の変更を記録（リアルタイム同期での二重更新防止用）
function markLocalUpdate(projectId) {
  localStorage.setItem('lastProjectUpdate', JSON.stringify({
    id: projectId,
    time: Date.now()
  }));
}

// ============================================
// データ強制リロード
// ============================================
let isReloading = false;

async function forceReloadData() {
  // 重複実行防止
  if (isReloading) {
    showToast('再読み込み中です...', 'info');
    return;
  }

  isReloading = true;

  // ボタンを無効化
  const reloadBtns = document.querySelectorAll('[onclick*="forceReloadData"]');
  reloadBtns.forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
  });

  try {
    showStatus('キャッシュクリア中...', 'saving');

    // キャッシュをクリア
    try {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        await caches.delete(name);
      }
    } catch (e) {
      warn('キャッシュクリアエラー:', e);
    }

    showStatus('データ読み込み中...', 'saving');

    // データを再読み込み
    await init();

    showStatus('保存済み', 'saved');
    showToast(`データを再読み込みしました。案件数: ${projects.length}件`, 'success');
  } catch (error) {
    logError('再読み込みエラー:', error);
    showStatus('エラー', 'error');
    showToast('再読み込みに失敗しました', 'danger');
  } finally {
    isReloading = false;
    // ボタンを再有効化
    reloadBtns.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
    });
  }
}

// ============================================
// デバッグ情報表示（ポップアップ）
// ============================================
async function showDebugInfo() {
  // データベースに直接アクセスして件数を確認
  let dbProjectsCount = '取得中...';
  let dbDesignersCount = '取得中...';
  let dbError = null;

  try {
    const projectsResult = await supabase.from('projects').select('id', { count: 'exact', head: true });
    const designersResult = await supabase.from('designers').select('id', { count: 'exact', head: true });

    dbProjectsCount = projectsResult.count ?? `エラー: ${projectsResult.error?.message}`;
    dbDesignersCount = designersResult.count ?? `エラー: ${designersResult.error?.message}`;

    if (projectsResult.error) dbError = projectsResult.error;
    if (designersResult.error) dbError = designersResult.error;
  } catch (e) {
    dbError = e;
  }

  const info = `
ArchiDeck デバッグ情報
========================
バージョン: ${APP_VERSION}
ユーザー: ${currentUser?.email || '未ログイン'}
カテゴリ: ${currentUserCategory || '未選択'}
担当タブ: ${currentDesignerTab}

メモリ上のデータ
----------------
案件数: ${projects.length}件
担当数: ${designers.length}人
タスク数: ${tasksV2.length}件
業者数: ${vendorsV2.length}件

データベース直接確認
--------------------
DB案件数: ${dbProjectsCount}件
DB担当数: ${dbDesignersCount}人
${dbError ? `DBエラー: ${dbError.message || dbError}` : ''}

案件詳細
--------
${projects.slice(0, 5).map(p => `・${p.customer} (設計:${p.assigned_to || '未割当'}, IC:${p.ic_assignee || '未割当'})`).join('\n')}
${projects.length > 5 ? `...他${projects.length - 5}件` : ''}
${projects.length === 0 ? '（案件データなし）' : ''}

担当詳細
----------
${designers.slice(0, 5).map(d => `・${d.name} (${d.category})`).join('\n')}
${designers.length > 5 ? `...他${designers.length - 5}人` : ''}
${designers.length === 0 ? '（担当データなし）' : ''}

アーカイブ状況
--------------
アクティブ: ${projects.filter(p => !p.is_archived).length}件
完了済み: ${projects.filter(p => p.is_archived).length}件

フィルター
----------
アーカイブフィルター: ${document.getElementById('archiveFilter')?.value || '不明'}
検索: ${document.getElementById('searchQuery')?.value || 'なし'}
商品: ${document.getElementById('specFilter')?.value || '全て'}

RLS注意
-------
データベースに数があってもメモリが0の場合、
RLS(Row Level Security)がデータをブロックしている
可能性があります。Supabase管理画面でRLS設定を確認してください。
  `.trim();

  alert(info);
  log(info);

  // データが0件の場合は警告を表示
  if (projects.length === 0 || designers.length === 0) {
    logError('🚨 データ消失問題検出！');
    logError('Supabaseのダッシュボードで以下を確認してください:');
    logError('1. projectsテーブルにデータがあるか');
    logError('2. designersテーブルにデータがあるか');
    logError('3. RLSポリシーが正しく設定されているか');
    logError('4. anon keyに適切な権限があるか');
  }
}

// ============================================
// デバッグ用グローバル関数
// ============================================
// コンソールで debug() を実行すると、全データの詳細が表示されます
window.debug = function() {
  log('='.repeat(80));
  log('🔍 デバッグ情報');
  log('='.repeat(80));

  log('\n📊 基本情報:');
  log('  - 担当数:', designers.length);
  log('  - 案件数:', projects.length);
  log('  - タスク数:', tasksV2.length);
  log('  - 業者数:', vendorsV2.length);

  log('\n👥 担当一覧:');
  designers.forEach(d => {
    log(`  - [${d.category}] ${d.name} (${d.email})`);
  });

  log('\n📋 案件一覧:');
  projects.forEach(p => {
    log(`  - ${p.customer}`);
    log(`    設計: "${p.assigned_to}" (trim: "${(p.assigned_to || '').trim()}")`);
    log(`    IC: "${p.ic_assignee}" (trim: "${(p.ic_assignee || '').trim()}")`);
    log(`    status: ${p.status}, is_archived: ${p.is_archived}`);
  });

  log('\n' + '='.repeat(80));
  return 'デバッグ情報を出力しました。上記を確認してください。';
};

// コンソールで checkAssignment('担当者名', '案件名') を実行すると、詳細チェックができます
window.checkAssignment = function(designerName, projectName) {
  log('='.repeat(80));
  log(`🔍 割り当てチェック: ${designerName} → ${projectName}`);
  log('='.repeat(80));

  const designer = designers.find(d => d.name.includes(designerName));
  if (!designer) {
    logError(`❌ 担当 "${designerName}" が見つかりません`);
    log('登録されている担当:', designers.map(d => d.name));
    return;
  }

  const project = projects.find(p => p.customer.includes(projectName));
  if (!project) {
    logError(`❌ 案件 "${projectName}" が見つかりません`);
    log('登録されている案件:', projects.map(p => p.customer));
    return;
  }

  log('\n✅ データ確認:');
  log('担当情報:', {
    name: designer.name,
    nameLength: designer.name.length,
    nameTrimmed: designer.name.trim(),
    category: designer.category,
    email: designer.email
  });

  log('\n案件情報:', {
    customer: project.customer,
    assigned_to: `"${project.assigned_to}"`,
    assigned_to_length: project.assigned_to?.length,
    assigned_to_trimmed: `"${(project.assigned_to || '').trim()}"`,
    ic_assignee: `"${project.ic_assignee}"`,
    ic_assignee_length: project.ic_assignee?.length,
    ic_assignee_trimmed: `"${(project.ic_assignee || '').trim()}"`,
    status: project.status,
    is_archived: project.is_archived
  });

  log('\n🔍 マッチング結果:');
  const designerNameTrimmed = designer.name.trim();
  const assignedToTrimmed = (project.assigned_to || '').trim();
  const icAssigneeTrimmed = (project.ic_assignee || '').trim();

  const matchAssigned = assignedToTrimmed === designerNameTrimmed;
  const matchIC = icAssigneeTrimmed === designerNameTrimmed;
  const statusOK = project.status !== 'completed';
  const archivedOK = !project.is_archived;
  const finalMatch = (matchAssigned || matchIC) && statusOK && archivedOK;

  log(`  - assigned_to一致: ${matchAssigned ? '✅' : '❌'} ("${assignedToTrimmed}" === "${designerNameTrimmed}")`);
  log(`  - ic_assignee一致: ${matchIC ? '✅' : '❌'} ("${icAssigneeTrimmed}" === "${designerNameTrimmed}")`);
  log(`  - statusチェック: ${statusOK ? '✅' : '❌'} (status !== "completed")`);
  log(`  - archivedチェック: ${archivedOK ? '✅' : '❌'} (!is_archived)`);
  log(`  - 最終判定: ${finalMatch ? '✅ カウントされる' : '❌ カウントされない'}`);

  if (!finalMatch) {
    log('\n💡 カウントされない理由:');
    if (!matchAssigned && !matchIC) {
      log('  - 担当者名が一致していません');
      if (assignedToTrimmed !== designerNameTrimmed) {
        log(`    設計: "${assignedToTrimmed}" ≠ "${designerNameTrimmed}"`);
      }
      if (icAssigneeTrimmed !== designerNameTrimmed) {
        log(`    IC: "${icAssigneeTrimmed}" ≠ "${designerNameTrimmed}"`);
      }
    }
    if (!statusOK) {
      log(`  - statusが "completed" です`);
    }
    if (!archivedOK) {
      log(`  - is_archived が true です`);
    }
  }

  log('\n' + '='.repeat(80));
  return finalMatch ? 'この案件はカウントされます ✅' : 'この案件はカウントされません ❌';
};

log('💡 デバッグ関数が利用可能です:');
log('  - debug() : 全データの詳細を表示');
log('  - checkAssignment("担当者名", "案件名") : 割り当てチェック');

// ============================================
// データ読み込み
// ============================================
async function loadDesigners() {
  log('🔄 担当データ読み込み開始...');

  try {
    const { data, error, count } = await supabaseWithTimeout(() =>
      supabase
        .from('designers')
        .select('*', { count: 'exact' })
        .order('display_order'),
      10000
    );

    if (error) {
      logError('❌ 担当データ読み込みエラー:', error);
      designers = [];
      return;
    }

    designers = data || [];
    log('✅ 担当データ読み込み完了:', designers.length, '件');
  } catch (err) {
    logError('❌ loadDesigners()タイムアウトまたはエラー:', err);
    designers = [];
  }
}

async function loadCurrentDesigner() {
  if (!currentUser || !currentUser.email) return;

  // admin@ghouse.jpの場合は担当を特定しない（全案件閲覧可能）
  if (currentUser.email === 'admin@ghouse.jp') {
    currentDesigner = null;
    return;
  }

  try {
    const { data, error } = await supabaseWithTimeout(() =>
      supabase
        .from('designers')
        .select('*')
        .eq('email', currentUser.email)
        .single(),
      10000
    );

    if (error) {
      warn('担当情報の取得に失敗:', error);
      currentDesigner = null;
      return;
    }

    currentDesigner = data;
    log('現在の担当:', currentDesigner);
  } catch (e) {
    warn('担当情報取得タイムアウト:', e.message);
    currentDesigner = null;
  }
}

async function loadProjects() {
  log('🔄 案件データ読み込み中...');
  try {
    const { data, error } = await supabaseWithTimeout(() =>
      supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false }),
      15000  // 案件データは多い可能性があるので長めに
    );
    if (error) {
      logError('❌ 案件データ読み込みエラー:', error);
      projects = [];
      return;
    }
    projects = data || [];
    log('✅ 案件データ読み込み完了:', projects.length, '件');

    // クリーンアップは非同期で後から実行（ブロックしない）
    setTimeout(() => cleanupProjectAssignees(), 1000);
  } catch (err) {
    logError('❌ loadProjects()タイムアウトまたはエラー:', err);
    projects = [];
  }
}

async function cleanupProjectAssignees() {
  log('🧹 案件の担当者データをクリーンアップ中...');
  let updatedCount = 0;

  for (const project of projects) {
    // "null"という文字列もnullとして扱う
    let assigned = (project.assigned_to || '').trim();
    let icAssigned = (project.ic_assignee || '').trim();
    let exteriorAssigned = (project.exterior_assignee || '').trim();
    let realestateAssigned = (project.realestate_assignee || '').trim();

    if (assigned === 'null' || assigned === 'undefined') assigned = '';
    if (icAssigned === 'null' || icAssigned === 'undefined') icAssigned = '';
    if (exteriorAssigned === 'null' || exteriorAssigned === 'undefined') exteriorAssigned = '';
    if (realestateAssigned === 'null' || realestateAssigned === 'undefined') realestateAssigned = '';

    let needsUpdate = false;

    // trim()した結果が元の値と違う場合、または"null"文字列の場合は更新
    if (project.assigned_to !== assigned ||
        project.ic_assignee !== icAssigned ||
        project.exterior_assignee !== exteriorAssigned ||
        project.realestate_assignee !== realestateAssigned ||
        project.assigned_to === 'null' ||
        project.ic_assignee === 'null' ||
        project.exterior_assignee === 'null' ||
        project.realestate_assignee === 'null') {
      needsUpdate = true;
    }

    if (needsUpdate) {
      log(`🔧 クリーンアップ: ${project.customer}`);

      const { error } = await supabase
        .from('projects')
        .update({
          assigned_to: assigned || null,
          ic_assignee: icAssigned || null,
          exterior_assignee: exteriorAssigned || null,
          realestate_assignee: realestateAssigned || null
        })
        .eq('id', project.id);

      if (!error) {
        project.assigned_to = assigned || null;
        project.ic_assignee = icAssigned || null;
        project.exterior_assignee = exteriorAssigned || null;
        project.realestate_assignee = realestateAssigned || null;
        updatedCount++;
      } else {
        logError('❌ クリーンアップ失敗:', project.customer, error);
      }
    }
  }

  if (updatedCount > 0) {
    log(`✅ ${updatedCount}件の案件をクリーンアップしました`);
  } else {
    log('✅ クリーンアップ不要（全案件正常）');
  }
}

async function loadEmailTemplates() {
  try {
    const { data, error } = await supabaseWithTimeout(() =>
      supabase.from('email_templates').select('*').order('display_name'),
      10000
    );
    if (error) {
      logError('❌ メールテンプレート読み込みエラー:', error);
      emailTemplates = [];
      return;
    }
    emailTemplates = data || [];
    log('✅ メールテンプレート読み込み完了:', emailTemplates.length, '件');
  } catch (err) {
    logError('❌ loadEmailTemplatesタイムアウト:', err);
    emailTemplates = [];
  }
}

async function loadVendors() {
  try {
    const { data, error } = await supabaseWithTimeout(() =>
      supabase.from('template_vendors').select('*').order('company'),
      10000
    );
    if (error) {
      logError('❌ 業者読み込みエラー:', error);
      vendors = [];
      return;
    }
    vendors = data || [];
    log('✅ 業者読み込み完了:', vendors.length, '件');
  } catch (err) {
    logError('❌ loadVendorsタイムアウト:', err);
    vendors = [];
  }
}

async function loadTaskMappings() {
  try {
    const { data, error } = await supabaseWithTimeout(() =>
      supabase.from('task_template_mappings').select('*'),
      10000
    );
    if (error) {
      logError('❌ タスクマッピング読み込みエラー:', error);
      taskMappings = {};
      return;
    }
    taskMappings = {};
    (data || []).forEach(mapping => {
      taskMappings[mapping.task_key] = mapping.template_id;
    });
    log('✅ タスクマッピング読み込み完了:', Object.keys(taskMappings).length, '件');
  } catch (err) {
    logError('❌ loadTaskMappingsタイムアウト:', err);
    taskMappings = {};
  }
}

// 汎用タイムアウト付きSupabaseクエリ
async function supabaseWithTimeout(queryFn, timeoutMs = 10000) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Query timeout')), timeoutMs)
  );
  return Promise.race([queryFn(), timeout]);
}

// 新システム用データ読み込み
async function loadVendorCategories() {
  try {
    const { data, error } = await supabaseWithTimeout(() =>
      supabase
        .from('vendor_categories')
        .select('*')
        .order('display_order'),
      10000
    );

    if (error) {
      logError('❌ 業者カテゴリ読み込みエラー:', error);
      vendorCategories = [];
      return;
    }

    vendorCategories = data || [];
    log('✅ 業者カテゴリ読み込み完了:', vendorCategories.length, '件');
  } catch (e) {
    logError('❌ 業者カテゴリ読み込みタイムアウト:', e.message);
    vendorCategories = [];
  }
}

async function loadTasksV2() {
  try {
    const { data, error } = await supabaseWithTimeout(() =>
      supabase.from('tasks').select('*').order('display_order'),
      10000
    );

    if (error) {
      logError('❌ タスク読み込みエラー:', error);
      tasksV2 = [];
      return;
    }

    tasksV2 = data || [];
    log('✅ タスク読み込み完了:', tasksV2.length, '件');

    // ICタスクが最新でない場合は警告表示
    const icTasks = tasksV2.filter(t => t.category === 'IC');
    const icTaskKeys = icTasks.map(t => t.task_key);
    const hasNewTasks = ['ic_washroom', 'ic_toilet', 'ic_meeting_drawing'].every(k => icTaskKeys.includes(k));
    const hasOldTasks = ['ic_washroom_1f', 'ic_washroom_2f', 'ic_toilet_1f', 'ic_toilet_2f'].some(k => icTaskKeys.includes(k));
    const needsMigration = !hasNewTasks || hasOldTasks;
    const notice = document.getElementById('icMigrationNotice');
    if (notice) {
      notice.style.display = needsMigration ? 'block' : 'none';
    }
  } catch (e) {
    logError('❌ loadTasksV2タイムアウト:', e);
    tasksV2 = [];
  }
}

// ICタスク26項目マイグレーション実行（メールボタン設定含む）
async function runICTasksMigration() {
  if (!confirm('ICタスクを26項目に更新します（メールボタン設定含む）。既存のICタスクは置き換えられます。続行しますか？')) {
    return;
  }

  showToast('🔄 ICタスクを更新中...', 'info');

  try {
    // ステップ0: has_email_buttonカラムが存在するか確認し、なければ追加
    // Supabaseでは直接ALTER TABLEできないため、RPC経由で実行

    // ステップ1: 既存ICタスクを削除
    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('category', 'IC');

    if (deleteError) {
      throw new Error('既存ICタスク削除エラー: ' + deleteError.message);
    }
    log('✅ 既存ICタスク削除完了');

    // ステップ2: 業者カテゴリを追加
    const newCategories = [
      { name: 'キッチン', display_order: 10 },
      { name: 'お風呂', display_order: 11 },
      { name: '洗面', display_order: 12 },
      { name: 'トイレ', display_order: 13 },
      { name: '照明', display_order: 14 },
      { name: '建具', display_order: 15 },
      { name: 'カーテン', display_order: 16 },
      { name: '造作', display_order: 17 },
      { name: '家具', display_order: 18 }
    ];

    for (const cat of newCategories) {
      await supabase.from('vendor_categories').upsert(cat, { onConflict: 'name' });
    }
    log('✅ 業者カテゴリ追加完了');

    // ステップ3: 新しいICタスク25項目を挿入（洗面・トイレは各1つに統合）
    const newICTasks = [
      { task_key: 'ic_funding_check', task_name: '資金計画・引継書確認', category: 'IC', display_order: 1, has_state: true, state_options: '["-", "確認済"]', has_email_button: false },
      { task_key: 'ic_kitchen', task_name: 'キッチン・カップボード', category: 'IC', display_order: 2, has_state: true, state_options: '["-", "GRAFTECT", "オリジナル", "Lixil", "Panasonic", "Takarastandard"]', has_email_button: true },
      { task_key: 'ic_bath', task_name: 'お風呂', category: 'IC', display_order: 3, has_state: true, state_options: '["-", "Lixil", "Panasonic", "Takarastandard"]', has_email_button: true },
      { task_key: 'ic_washroom', task_name: '洗面', category: 'IC', display_order: 4, has_state: true, state_options: '["-", "無し", "TOTO", "AICA", "Lixil", "Panasonic", "Takarastandard"]', has_email_button: true },
      { task_key: 'ic_toilet', task_name: 'トイレ', category: 'IC', display_order: 5, has_state: true, state_options: '["-", "無し", "TOTO", "Lixil", "Panasonic"]', has_email_button: true },
      { task_key: 'ic_lighting', task_name: '照明プラン', category: 'IC', display_order: 6, has_state: true, state_options: '["-", "ODELIC", "DAIKO", "KOIZUMI", "Panasonic"]', has_email_button: true },
      { task_key: 'ic_spec_doc', task_name: '仕様書作成', category: 'IC', display_order: 7, has_state: true, state_options: '["-", "作成済"]', has_email_button: false },
      { task_key: 'ic_longterm_doc', task_name: '長期資料送付', category: 'IC', display_order: 8, has_state: true, state_options: '["-", "送付済"]', has_email_button: false },
      { task_key: 'ic_exterior_meeting', task_name: '外構への打合せ依頼', category: 'IC', display_order: 9, has_state: true, state_options: '["-", "無し", "依頼済", "保存済"]', has_email_button: false },
      { task_key: 'ic_execution_drawing', task_name: '実施図', category: 'IC', display_order: 10, has_state: true, state_options: '["-", "修正依頼済", "図面チェック済"]', has_email_button: false },
      { task_key: 'ic_exterior_pres', task_name: '外装プレゼン', category: 'IC', display_order: 11, has_state: true, state_options: '["-", "作成済"]', has_email_button: false },
      { task_key: 'ic_interior_pres', task_name: '内装プレゼン', category: 'IC', display_order: 12, has_state: true, state_options: '["-", "作成済"]', has_email_button: false },
      { task_key: 'ic_tategu', task_name: '建具プレゼン', category: 'IC', display_order: 13, has_state: true, state_options: '["-", "依頼済", "保存済"]', has_email_button: true },
      { task_key: 'ic_iron_pres', task_name: 'アイアンプレゼン', category: 'IC', display_order: 14, has_state: true, state_options: '["-", "無し", "依頼済", "保存済"]', has_email_button: false },
      { task_key: 'ic_tile_pres', task_name: 'タイルプレゼン', category: 'IC', display_order: 15, has_state: true, state_options: '["-", "無し", "依頼済", "保存済"]', has_email_button: true },
      { task_key: 'ic_curtain', task_name: 'カーテン紹介', category: 'IC', display_order: 16, has_state: true, state_options: '["-", "無し", "依頼済", "保存済"]', has_email_button: true },
      { task_key: 'ic_zousaku', task_name: '造作業者紹介', category: 'IC', display_order: 17, has_state: true, state_options: '["-", "無し", "依頼済", "保存済"]', has_email_button: true },
      { task_key: 'ic_furniture', task_name: '家具見積依頼', category: 'IC', display_order: 18, has_state: true, state_options: '["-", "無し", "依頼済", "保存済"]', has_email_button: true },
      { task_key: 'ic_iron', task_name: 'アイアン依頼', category: 'IC', display_order: 19, has_state: true, state_options: '["-", "無し", "依頼済", "保存済"]', has_email_button: true },
      { task_key: 'ic_other_estimate', task_name: 'その他見積依頼', category: 'IC', display_order: 20, has_state: true, state_options: '["-", "無し", "依頼済", "保存済"]', has_email_button: true, has_memo: true },
      { task_key: 'ic_final_checklist', task_name: '確定図チェックリスト', category: 'IC', display_order: 21, has_state: true, state_options: '["-", "実施済"]', has_email_button: false },
      { task_key: 'ic_meeting_drawing', task_name: '会議図面渡し', category: 'IC', display_order: 22, has_state: true, state_options: '["-", "送付済"]', has_email_button: false },
      { task_key: 'ic_op_check', task_name: 'OP見積チェック', category: 'IC', display_order: 23, has_state: true, state_options: '["-", "依頼済", "保存済"]', has_email_button: false },
      { task_key: 'ic_meeting_followup', task_name: '会議後確認事項送付', category: 'IC', display_order: 24, has_state: true, state_options: '["-", "送付済"]', has_email_button: false },
      { task_key: 'ic_final_approval', task_name: '確定図承認', category: 'IC', display_order: 25, has_state: true, state_options: '["-", "依頼中", "ダンドリワーク保存済"]', has_email_button: false }
    ];

    const { error: insertError } = await supabase
      .from('tasks')
      .upsert(newICTasks, { onConflict: 'task_key' });

    if (insertError) {
      throw new Error('ICタスク挿入エラー: ' + insertError.message);
    }
    log('✅ ICタスク追加完了');

    // データ再読み込み
    await loadTasksV2();
    await loadVendorCategories();
    renderTasksManagement();

    showToast('✅ ICタスクを27項目に更新しました！', 'success');

    // 警告を非表示
    const notice = document.getElementById('icMigrationNotice');
    if (notice) notice.style.display = 'none';

  } catch (error) {
    logError('ICタスクマイグレーションエラー:', error);
    showToast('❌ ICタスク更新に失敗しました: ' + error.message, 'error');
  }
}

// ICタスク自動マイグレーション（必須タスクキーが存在しない場合に実行）
async function autoMigrateICTasks() {
  const icTasks = tasksV2.filter(t => t.category === 'IC');
  const icTaskKeys = icTasks.map(t => t.task_key);

  // 必須タスクキー（これらが全て存在すればマイグレーション不要）
  const requiredTaskKeys = [
    'ic_washroom',      // 洗面（統合版）
    'ic_toilet',        // トイレ（統合版）
    'ic_meeting_drawing' // 会議図面渡し（新規）
  ];

  // 旧タスクキー（これらが存在する場合はマイグレーション必要）
  const oldTaskKeys = [
    'ic_washroom_1f', 'ic_washroom_2f',
    'ic_toilet_1f', 'ic_toilet_2f'
  ];

  // 必須タスクが全て存在するかチェック
  const hasAllRequired = requiredTaskKeys.every(key => icTaskKeys.includes(key));
  // 旧タスクが存在するかチェック
  const hasOldTasks = oldTaskKeys.some(key => icTaskKeys.includes(key));

  // 必須タスクが全て存在し、旧タスクがなければスキップ
  if (hasAllRequired && !hasOldTasks) {
    log('✅ ICタスクは最新状態です:', icTasks.length, '項目');
    return;
  }

  log('🔄 ICタスク自動マイグレーション開始...', {
    現在: icTasks.length,
    必須タスク存在: hasAllRequired,
    旧タスク存在: hasOldTasks
  });

  try {
    // 既存ICタスクを削除
    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('category', 'IC');

    if (deleteError) {
      throw new Error('既存ICタスク削除エラー: ' + deleteError.message);
    }

    // 業者カテゴリを追加
    const newCategories = [
      { name: 'キッチン', display_order: 10 },
      { name: 'お風呂', display_order: 11 },
      { name: '洗面', display_order: 12 },
      { name: 'トイレ', display_order: 13 },
      { name: '照明', display_order: 14 },
      { name: '建具', display_order: 15 },
      { name: 'カーテン', display_order: 16 },
      { name: '造作', display_order: 17 },
      { name: '家具', display_order: 18 }
    ];

    for (const cat of newCategories) {
      await supabase.from('vendor_categories').upsert(cat, { onConflict: 'name' });
    }

    // 25項目のICタスクを挿入（洗面・トイレは各1つに統合）
    const newICTasks = [
      { task_key: 'ic_funding_check', task_name: '資金計画・引継書確認', category: 'IC', display_order: 1, has_state: true, state_options: '["-", "確認済"]', has_email_button: false },
      { task_key: 'ic_kitchen', task_name: 'キッチン・カップボード', category: 'IC', display_order: 2, has_state: true, state_options: '["-", "GRAFTECT", "オリジナル", "Lixil", "Panasonic", "Takarastandard"]', has_email_button: true },
      { task_key: 'ic_bath', task_name: 'お風呂', category: 'IC', display_order: 3, has_state: true, state_options: '["-", "Lixil", "Panasonic", "Takarastandard"]', has_email_button: true },
      { task_key: 'ic_washroom', task_name: '洗面', category: 'IC', display_order: 4, has_state: true, state_options: '["-", "無し", "TOTO", "AICA", "Lixil", "Panasonic", "Takarastandard"]', has_email_button: true },
      { task_key: 'ic_toilet', task_name: 'トイレ', category: 'IC', display_order: 5, has_state: true, state_options: '["-", "無し", "TOTO", "Lixil", "Panasonic"]', has_email_button: true },
      { task_key: 'ic_lighting', task_name: '照明プラン', category: 'IC', display_order: 6, has_state: true, state_options: '["-", "ODELIC", "DAIKO", "KOIZUMI", "Panasonic"]', has_email_button: true },
      { task_key: 'ic_spec_doc', task_name: '仕様書作成', category: 'IC', display_order: 7, has_state: true, state_options: '["-", "作成済"]', has_email_button: false },
      { task_key: 'ic_longterm_doc', task_name: '長期資料送付', category: 'IC', display_order: 8, has_state: true, state_options: '["-", "送付済"]', has_email_button: false },
      { task_key: 'ic_exterior_meeting', task_name: '外構への打合せ依頼', category: 'IC', display_order: 9, has_state: true, state_options: '["-", "無し", "依頼済", "保存済"]', has_email_button: false },
      { task_key: 'ic_execution_drawing', task_name: '実施図', category: 'IC', display_order: 10, has_state: true, state_options: '["-", "修正依頼済", "図面チェック済"]', has_email_button: false },
      { task_key: 'ic_exterior_pres', task_name: '外装プレゼン', category: 'IC', display_order: 11, has_state: true, state_options: '["-", "作成済"]', has_email_button: false },
      { task_key: 'ic_interior_pres', task_name: '内装プレゼン', category: 'IC', display_order: 12, has_state: true, state_options: '["-", "作成済"]', has_email_button: false },
      { task_key: 'ic_tategu', task_name: '建具プレゼン', category: 'IC', display_order: 13, has_state: true, state_options: '["-", "依頼済", "保存済"]', has_email_button: true },
      { task_key: 'ic_iron_pres', task_name: 'アイアンプレゼン', category: 'IC', display_order: 14, has_state: true, state_options: '["-", "無し", "依頼済", "保存済"]', has_email_button: false },
      { task_key: 'ic_tile_pres', task_name: 'タイルプレゼン', category: 'IC', display_order: 15, has_state: true, state_options: '["-", "無し", "依頼済", "保存済"]', has_email_button: true },
      { task_key: 'ic_curtain', task_name: 'カーテン紹介', category: 'IC', display_order: 16, has_state: true, state_options: '["-", "無し", "依頼済", "保存済"]', has_email_button: true },
      { task_key: 'ic_zousaku', task_name: '造作業者紹介', category: 'IC', display_order: 17, has_state: true, state_options: '["-", "無し", "依頼済", "保存済"]', has_email_button: true },
      { task_key: 'ic_furniture', task_name: '家具見積依頼', category: 'IC', display_order: 18, has_state: true, state_options: '["-", "無し", "依頼済", "保存済"]', has_email_button: true },
      { task_key: 'ic_iron', task_name: 'アイアン依頼', category: 'IC', display_order: 19, has_state: true, state_options: '["-", "無し", "依頼済", "保存済"]', has_email_button: true },
      { task_key: 'ic_other_estimate', task_name: 'その他見積依頼', category: 'IC', display_order: 20, has_state: true, state_options: '["-", "無し", "依頼済", "保存済"]', has_email_button: true, has_memo: true },
      { task_key: 'ic_final_checklist', task_name: '確定図チェックリスト', category: 'IC', display_order: 21, has_state: true, state_options: '["-", "実施済"]', has_email_button: false },
      { task_key: 'ic_meeting_drawing', task_name: '会議図面渡し', category: 'IC', display_order: 22, has_state: true, state_options: '["-", "送付済"]', has_email_button: false },
      { task_key: 'ic_op_check', task_name: 'OP見積チェック', category: 'IC', display_order: 23, has_state: true, state_options: '["-", "依頼済", "保存済"]', has_email_button: false },
      { task_key: 'ic_meeting_followup', task_name: '会議後確認事項送付', category: 'IC', display_order: 24, has_state: true, state_options: '["-", "送付済"]', has_email_button: false },
      { task_key: 'ic_final_approval', task_name: '確定図承認', category: 'IC', display_order: 25, has_state: true, state_options: '["-", "依頼中", "ダンドリワーク保存済"]', has_email_button: false }
    ];

    const { error: insertError } = await supabase
      .from('tasks')
      .upsert(newICTasks, { onConflict: 'task_key' });

    if (insertError) {
      throw new Error('ICタスク挿入エラー: ' + insertError.message);
    }

    // タスクデータを再読み込み
    await loadTasksV2();
    await loadVendorCategories();

    log('✅ ICタスク自動マイグレーション完了 (25項目)');
    showToast('✅ ICタスクを25項目に自動更新しました', 'success');

  } catch (error) {
    logError('ICタスク自動マイグレーションエラー:', error);
    // エラーでも続行（既存機能に影響させない）
  }
}

// ICタスクのメールボタン設定を強制同期
// 特定のタスクは必ずhas_email_button: trueにする
// 新旧両方のキーを含める（マイグレーション前後の両方に対応）
const IC_EMAIL_REQUIRED_TASKS = [
  'ic_kitchen', 'ic_bath', 'ic_lighting', 'ic_tategu',
  'ic_tile_pres', 'ic_curtain', 'ic_zousaku', 'ic_furniture',
  // 新キー
  'ic_washroom', 'ic_toilet',
  // 旧キー（マイグレーション前のDB用）
  'ic_washroom_1f', 'ic_washroom_2f', 'ic_toilet_1f', 'ic_toilet_2f'
];

async function syncICEmailButtonSettings() {
  try {
    // 対象タスクを取得
    const { data: tasks, error: fetchError } = await supabase
      .from('tasks')
      .select('id, task_key, has_email_button')
      .in('task_key', IC_EMAIL_REQUIRED_TASKS);

    if (fetchError) {
      logError('❌ ICメールボタン設定取得エラー:', fetchError);
      return;
    }

    if (!tasks || tasks.length === 0) {
      log('ℹ️ 対象ICタスクが見つかりません（マイグレーション前の可能性）');
      return;
    }

    // has_email_button が false または null のタスクを抽出
    const tasksToUpdate = tasks.filter(t => t.has_email_button !== true);

    if (tasksToUpdate.length === 0) {
      log('✅ ICメールボタン設定は正常です');
      return;
    }

    log('🔧 ICメールボタン設定を修正:', tasksToUpdate.map(t => t.task_key));

    // 一括更新
    for (const task of tasksToUpdate) {
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ has_email_button: true })
        .eq('id', task.id);

      if (updateError) {
        logError(`❌ ${task.task_key}のメールボタン設定更新エラー:`, updateError);
      }
    }

    // タスクデータを再読み込み
    await loadTasksV2();
    log('✅ ICメールボタン設定の同期完了');

  } catch (error) {
    logError('❌ syncICEmailButtonSettings エラー:', error);
  }
}

async function loadVendorsV2() {
  try {
    const { data, error } = await supabaseWithTimeout(() =>
      supabase.from('vendors_v2').select('*').order('company'),
      10000
    );

    if (error) {
      logError('❌ 業者V2読み込みエラー:', error);
      vendorsV2 = [];
      return;
    }

    vendorsV2 = data || [];
    log('✅ 業者V2読み込み完了:', vendorsV2.length, '件');
  } catch (e) {
    logError('❌ loadVendorsV2タイムアウト:', e);
    vendorsV2 = [];
  }
}

function mergeVendorCategories() {
  log('🔗 mergeVendorCategories() 開始:', {
    vendorsV2Length: vendorsV2.length,
    vendorCategoriesLength: vendorCategories.length,
    vendorCategories: vendorCategories
  });

  // カテゴリ情報を業者データにマージ（Promise.allSettled完了後に呼び出す）
  if (vendorsV2.length > 0 && vendorCategories.length > 0) {
    vendorsV2 = vendorsV2.map(vendor => {
      const category = vendorCategories.find(c => c.id === vendor.category_id);
      return {
        ...vendor,
        vendor_categories: category ? { name: category.name } : null
      };
    });
    log('✅ 業者-カテゴリマージ完了:', vendorsV2.slice(0, 2));
  } else {
    warn('⚠️ マージスキップ:', {
      vendorsV2Empty: vendorsV2.length === 0,
      vendorCategoriesEmpty: vendorCategories.length === 0
    });
  }
}

async function loadTaskVendorMappings() {
  try {
    const { data, error } = await supabaseWithTimeout(() =>
      supabase
        .from('task_vendor_mappings_v2')
        .select('*'),
      10000
    );

    if (error) {
      logError('❌ タスク-業者紐づけ読み込みエラー:', error);
      taskVendorMappings = [];
      return;
    }

    taskVendorMappings = data || [];
    log('✅ タスク-業者紐づけ読み込み完了:', taskVendorMappings.length, '件');
  } catch (e) {
    logError('❌ タスク-業者紐づけタイムアウト:', e.message);
    taskVendorMappings = [];
  }
}

async function loadProducts() {
  try {
    const { data, error } = await supabaseWithTimeout(() =>
      supabase.from('products').select('*').order('display_order'),
      10000
    );
    if (!error && data) {
      products = data;
    } else {
      // テーブルが存在しない場合のフォールバック
      products = [
        { id: '1', name: 'LIFE', display_order: 1 },
        { id: '2', name: 'LIFE+', display_order: 2 },
        { id: '3', name: 'HOURS', display_order: 3 },
        { id: '4', name: 'LACIE', display_order: 4 },
        { id: '5', name: 'LIFE Limited', display_order: 5 },
        { id: '6', name: 'LIFE+ Limited', display_order: 6 }
      ];
    }
    log('✅ 商品読み込み完了:', products.length, '件');
  } catch (e) {
    logError('❌ loadProductsタイムアウト:', e);
    products = [];
  }
}

// ============================================
// 業者管理V2
// ============================================
let currentCategoryFilter = 'ALL';

function renderVendorsV2() {
  log('📞 renderVendorsV2() 呼び出し開始');
  log('📊 vendorsV2配列の状態:', {
    length: vendorsV2.length,
    data: vendorsV2.slice(0, 3),
    '全データ': vendorsV2
  });

  const container = document.getElementById('vendorsGrid');
  log('🎯 vendorsGrid要素:', container ? 'found ✓' : 'NOT FOUND ✗');

  if (!container) {
    logError('❌ CRITICAL: vendorsGrid要素が見つかりません！');
    log('📍 現在のDOM状態:', document.getElementById('vendorsPanel'));
    return;
  }

  log('🔍 renderVendorsV2():', {
    totalVendors: vendorsV2.length,
    currentFilter: currentCategoryFilter,
    vendors: vendorsV2
  });

  const filtered = currentCategoryFilter === 'ALL'
    ? vendorsV2
    : vendorsV2.filter(v => v.category_id === currentCategoryFilter);

  log('🔍 フィルター後の業者数:', filtered.length);

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>業者が登録されていません<br><small>「+ 業者追加」ボタンから登録してください</small></p></div>';
    return;
  }

  container.innerHTML = filtered.map(vendor => {
    const categoryName = vendor.vendor_categories?.name || '未分類';
    return `
      <div class="vendor-card">
        <div class="vendor-header">
          <h3>${escapeHtml(vendor.company)}</h3>
          <span class="badge badge-primary">${escapeHtml(categoryName)}</span>
        </div>
        <div class="vendor-info">
          <div><strong>担当者:</strong> ${escapeHtml(vendor.contact || '-')}</div>
          <div><strong>TEL:</strong> ${escapeHtml(vendor.tel || '-')}</div>
          <div><strong>Email:</strong> ${escapeHtml(vendor.email || '-')}</div>
        </div>
        <div class="vendor-actions">
          <button class="btn btn-secondary btn-small" onclick="editVendorV2('${vendor.id}')">編集</button>
          <button class="btn btn-danger btn-small" onclick="deleteVendorV2('${vendor.id}')">削除</button>
        </div>
      </div>
    `;
  }).join('');
}

function setCategoryFilter(categoryId, e) {
  currentCategoryFilter = categoryId;
  document.querySelectorAll('.category-filter-btn').forEach(btn => btn.classList.remove('active'));
  if (e && e.target) {
    e.target.classList.add('active');
  }
  renderVendorsV2();
}

function openVendorModalV2(vendorId = null) {
  const modal = document.getElementById('vendorModalV2');
  const title = document.getElementById('vendorModalTitle');

  // カテゴリドロップダウンを更新
  populateVendorCategoryDropdown();

  if (vendorId) {
    const vendor = vendorsV2.find(v => v.id === vendorId);
    if (!vendor) return;

    title.textContent = '業者編集';
    document.getElementById('vendorId').value = vendor.id;
    document.getElementById('vendorCompany').value = vendor.company;
    document.getElementById('vendorContact').value = vendor.contact || '';
    document.getElementById('vendorTel').value = vendor.tel || '';
    document.getElementById('vendorEmail').value = vendor.email || '';
    document.getElementById('vendorCategory').value = vendor.category_id || '';
    document.getElementById('vendorSubject').value = vendor.subject_format || '';
    document.getElementById('vendorTemplate').value = vendor.template_text || '';
  } else {
    title.textContent = '業者追加';
    document.getElementById('vendorForm').reset();
    document.getElementById('vendorId').value = '';
  }

  ModalManager.open(modal, '#vendorCompany');
}

function closeVendorModalV2() {
  ModalManager.close(document.getElementById('vendorModalV2'));
}

async function saveVendorV2() {
  // 二重クリック防止
  if (SaveGuard.isLocked('saveVendorV2')) return;

  const id = document.getElementById('vendorId')?.value || '';
  const company = document.getElementById('vendorCompany')?.value?.trim() || '';
  const contact = document.getElementById('vendorContact')?.value?.trim() || '';
  const tel = document.getElementById('vendorTel')?.value?.trim() || '';
  const email = document.getElementById('vendorEmail')?.value?.trim() || '';
  const categoryId = document.getElementById('vendorCategory')?.value || '';
  const subjectFormat = document.getElementById('vendorSubject')?.value?.trim() || '';
  const templateText = document.getElementById('vendorTemplate')?.value?.trim() || '';

  if (!company) {
    showToast('会社名を入力してください', 'error');
    return;
  }

  if (!categoryId) {
    showToast('カテゴリを選択してください', 'error');
    return;
  }

  await SaveGuard.run('saveVendorV2', async () => {
    showStatus('保存中...', 'saving');

    const vendorData = {
      company,
      contact: contact || null,
      tel: tel || null,
      email: email || null,
      category_id: categoryId || null,
      subject_format: subjectFormat || null,
      template_text: templateText || null
    };

    let result;
    if (id) {
      result = await supabase
        .from('vendors_v2')
        .update(vendorData)
        .eq('id', id)
        .select('*, vendor_categories(name)');
    } else {
      result = await supabase
        .from('vendors_v2')
        .insert([vendorData])
        .select('*, vendor_categories(name)');
    }

    if (result.error) {
      showStatus('保存失敗', 'error');
      showToast('保存に失敗しました: ' + result.error.message, 'error');
      return;
    }

    showStatus('保存完了', 'success');
    showToast(id ? '業者を更新しました' : '業者を追加しました', 'success');
    closeVendorModalV2();
    await loadVendorsV2();
    mergeVendorCategories(); // カテゴリ情報をマージ
    renderVendorsV2();
  });
}

function editVendorV2(vendorId) {
  openVendorModalV2(vendorId);
}

async function deleteVendorV2(vendorId) {
  const vendor = vendorsV2.find(v => v.id === vendorId);
  if (!vendor) return;

  if (!confirm(`「${vendor.company}」を削除しますか？`)) return;

  await SaveGuard.run(`deleteVendor_${vendorId}`, async () => {
    showStatus('削除中...', 'saving');

    const { error } = await supabase
      .from('vendors_v2')
      .delete()
      .eq('id', vendorId);

    if (error) {
      showStatus('削除失敗', 'error');
      showToast('削除に失敗しました: ' + error.message, 'error');
      return;
    }

    showStatus('削除完了', 'success');
    showToast('業者を削除しました', 'success');
    await loadVendorsV2();
    renderVendorsV2();
  });
}

// ============================================
// カテゴリ管理
// ============================================
function renderCategoriesList() {
  const container = document.getElementById('categoriesGrid');
  if (!container) return;

  if (vendorCategories.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🏷️</div><p>カテゴリが登録されていません</p></div>';
    return;
  }

  // 表示順でソート
  const sortedCategories = [...vendorCategories].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  container.innerHTML = `
    <div class="table-container">
      <table class="table">
        <thead>
          <tr>
            <th style="width: 60px;"></th>
            <th>カテゴリ名</th>
            <th style="width: 100px;">業者数</th>
            <th style="width: 180px;">操作</th>
          </tr>
        </thead>
        <tbody>
          ${sortedCategories.map(cat => {
            const count = vendorsV2.filter(v => v.category_id === cat.id).length;
            return `
              <tr draggable="true" ondragstart="handleCategoryDragStart(event, '${cat.id}')" ondragover="handleCategoryDragOver(event)" ondrop="handleCategoryDrop(event, '${cat.id}')" style="cursor: move;">
                <td><span style="color: var(--text-muted);">⋮⋮</span></td>
                <td><strong>${cat.name}</strong></td>
                <td>${count}社</td>
                <td>
                  <button class="btn btn-secondary btn-small" onclick="editCategory('${cat.id}')">編集</button>
                  <button class="btn btn-danger btn-small" onclick="deleteCategory('${cat.id}')">削除</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function openCategoryModal(categoryId = null) {
  const modal = document.getElementById('categoryModal');
  const title = document.getElementById('categoryModalTitle');

  if (categoryId) {
    const category = vendorCategories.find(c => c.id === categoryId);
    if (!category) return;

    title.textContent = 'カテゴリ編集';
    document.getElementById('categoryId').value = category.id;
    document.getElementById('categoryName').value = category.name;
    document.getElementById('categoryOrder').value = category.display_order;
  } else {
    title.textContent = 'カテゴリ追加';
    document.getElementById('categoryForm').reset();
    document.getElementById('categoryId').value = '';
    document.getElementById('categoryOrder').value = vendorCategories.length + 1;
  }

  ModalManager.open(modal, '#categoryName');
}

function closeCategoryModal() {
  ModalManager.close(document.getElementById('categoryModal'));
}

async function saveCategory() {
  if (SaveGuard.isLocked('saveCategory')) return;

  const id = document.getElementById('categoryId').value;
  const name = document.getElementById('categoryName').value.trim();
  const order = parseInt(document.getElementById('categoryOrder').value) || 0;

  if (!name) {
    showToast('カテゴリ名を入力してください', 'error');
    return;
  }

  await SaveGuard.run('saveCategory', async () => {
    showStatus('保存中...', 'saving');

    const categoryData = {
      name,
      display_order: order
    };

    let result;
    if (id) {
      result = await supabase
        .from('vendor_categories')
        .update(categoryData)
        .eq('id', id)
        .select();
    } else {
      result = await supabase
        .from('vendor_categories')
        .insert([categoryData])
        .select();
    }

    if (result.error) {
      showStatus('保存失敗', 'error');
      showToast('保存に失敗しました: ' + result.error.message, 'error');
      return;
    }

    showStatus('保存完了', 'success');
    showToast(id ? 'カテゴリを更新しました' : 'カテゴリを追加しました', 'success');
    closeCategoryModal();
    await loadVendorCategories();
    renderCategoriesList();
    renderCategoryFilters();
  });
}

function editCategory(categoryId) {
  openCategoryModal(categoryId);
}

async function deleteCategory(categoryId) {
  const category = vendorCategories.find(c => c.id === categoryId);
  if (!category) return;

  const vendorCount = vendorsV2.filter(v => v.category_id === categoryId).length;
  if (vendorCount > 0) {
    showToast(`このカテゴリには${vendorCount}社の業者が紐づいています。先に業者を削除してください。`, 'error');
    return;
  }

  if (!confirm(`カテゴリ「${category.name}」を削除しますか？`)) return;

  await SaveGuard.run(`deleteCategory_${categoryId}`, async () => {
    showStatus('削除中...', 'saving');

    const { error } = await supabase
      .from('vendor_categories')
      .delete()
      .eq('id', categoryId);

    if (error) {
      showStatus('削除失敗', 'error');
      showToast('削除に失敗しました: ' + error.message, 'error');
      return;
    }

    showStatus('削除完了', 'success');
    showToast('カテゴリを削除しました', 'success');
    await loadVendorCategories();
    renderCategoriesList();
    renderCategoryFilters();
  });
}

// ドラッグ&ドロップでカテゴリの表示順を変更
let draggedCategoryId = null;

function handleCategoryDragStart(event, categoryId) {
  draggedCategoryId = categoryId;
  event.dataTransfer.effectAllowed = 'move';
  event.target.style.opacity = '0.5';
}

function handleCategoryDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  return false;
}

async function handleCategoryDrop(event, targetCategoryId) {
  event.preventDefault();
  event.stopPropagation();

  if (!draggedCategoryId || draggedCategoryId === targetCategoryId) {
    resetCategoryDragState();
    return;
  }

  const draggedCategory = vendorCategories.find(c => c.id === draggedCategoryId);
  const targetCategory = vendorCategories.find(c => c.id === targetCategoryId);

  if (!draggedCategory || !targetCategory) {
    resetCategoryDragState();
    return;
  }

  // 表示順を入れ替え
  const draggedOrder = draggedCategory.display_order;
  const targetOrder = targetCategory.display_order;

  showStatus('並び替え中...', 'saving');

  // 両方のカテゴリの表示順を更新
  const updates = [
    supabase.from('vendor_categories').update({ display_order: targetOrder }).eq('id', draggedCategoryId),
    supabase.from('vendor_categories').update({ display_order: draggedOrder }).eq('id', targetCategoryId)
  ];

  const results = await Promise.all(updates);

  if (results.some(r => r.error)) {
    showStatus('並び替え失敗', 'error');
    showToast('並び替えに失敗しました', 'error');
    resetCategoryDragState();
    return;
  }

  // ローカルデータも更新
  draggedCategory.display_order = targetOrder;
  targetCategory.display_order = draggedOrder;

  // 再描画
  renderCategoriesList();
  renderCategoryFilters();
  showStatus('並び替え完了', 'success');
  showToast('表示順を変更しました', 'success');
  resetCategoryDragState();
}

function resetCategoryDragState() {
  draggedCategoryId = null;
  // すべての行の透明度をリセット
  document.querySelectorAll('#categoriesGrid tr[draggable]').forEach(tr => {
    tr.style.opacity = '1';
  });
}

function renderCategoryFilters() {
  const container = document.getElementById('categoryFilters');
  if (!container) return;

  let html = `<button class="category-filter-btn ${currentCategoryFilter === 'ALL' ? 'active' : ''}" onclick="setCategoryFilter('ALL', event)">全て (${vendorsV2.length})</button>`;

  vendorCategories.forEach(cat => {
    const count = vendorsV2.filter(v => v.category_id === cat.id).length;
    html += `<button class="category-filter-btn ${currentCategoryFilter === cat.id ? 'active' : ''}" onclick="setCategoryFilter('${cat.id}', event)">${escapeHtml(cat.name)} (${count})</button>`;
  });

  container.innerHTML = html;
}

// 担当者フィルターのドロップダウンを初期化
function populateAssigneeFilters() {
  // IC担当者フィルター
  const icFilter = document.getElementById('icAssigneeFilter');
  if (icFilter) {
    const icAssignees = [...new Set(projects.map(p => p.ic_assignee).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
    icFilter.innerHTML = '<option value="">IC担当: すべて</option>' + icAssignees.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  }

  // 外構担当者フィルター
  const exteriorFilter = document.getElementById('exteriorAssigneeFilter');
  if (exteriorFilter) {
    const exteriorAssignees = [...new Set(projects.map(p => p.exterior_assignee).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
    exteriorFilter.innerHTML = '<option value="">外構担当: すべて</option>' + exteriorAssignees.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  }

  // 不動産担当者フィルター
  const realestateFilter = document.getElementById('realestateAssigneeFilter');
  if (realestateFilter) {
    const realestateAssignees = [...new Set(projects.map(p => p.realestate_assignee).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
    realestateFilter.innerHTML = '<option value="">不動産担当: すべて</option>' + realestateAssignees.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  }
}

// ============================================
// 商品管理
// ============================================
function renderProductsList() {
  const container = document.getElementById('productsGrid');
  if (!container) return;

  if (products.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>商品が登録されていません</p></div>';
    return;
  }

  // 表示順でソート
  const sortedProducts = [...products].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  container.innerHTML = '<div class="table-container"><table class="table"><thead><tr><th style="width: 60px;"></th><th>商品名</th><th style="width: 100px;">操作</th></tr></thead><tbody>' +
    sortedProducts.map(product => `
      <tr draggable="true" ondragstart="handleProductDragStart(event, '${product.id}')" ondragover="handleProductDragOver(event)" ondrop="handleProductDrop(event, '${product.id}')" style="cursor: move;">
        <td><span style="color: var(--text-muted);">⋮⋮</span></td>
        <td><strong>${escapeHtml(product.name)}</strong></td>
        <td><button class="btn btn-danger btn-small" onclick="deleteProductInline('${product.id}')">削除</button></td>
      </tr>
    `).join('') +
    '</tbody></table></div>';
}

async function addProductInline() {
  const name = document.getElementById('newProductNameInline').value.trim();

  if (!name) {
    showToast('商品名を入力してください', 'error');
    return;
  }

  if (products.find(p => p.name === name)) {
    showToast('既に存在する商品名です', 'error');
    return;
  }

  showStatus('追加中...', 'saving');

  const maxDisplayOrder = products.length > 0 ? Math.max(...products.map(p => p.display_order || 0)) : 0;
  const newDisplayOrder = maxDisplayOrder + 1;

  const { data, error } = await supabase
    .from('products')
    .insert([{ name, display_order: newDisplayOrder }])
    .select();

  if (error) {
    // テーブルが存在しない場合、ローカルに追加
    products.push({ id: Date.now().toString(), name, display_order: newDisplayOrder });
    document.getElementById('newProductNameInline').value = '';
    renderProductsList();
    populateProductDropdown();
    showStatus('保存済み', 'saved');
    showToast('商品を追加しました（ローカルのみ）', 'success');
    return;
  }

  products.push(data[0]);
  document.getElementById('newProductNameInline').value = '';
  renderProductsList();
  populateProductDropdown();
  showStatus('保存済み', 'saved');
  showToast('商品を追加しました', 'success');
}

async function deleteProductInline(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  if (!confirm(`商品「${product.name}」を削除しますか？`)) return;

  showStatus('削除中...', 'saving');

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', productId);

  if (error && !error.message.includes('does not exist')) {
    showStatus('エラー', 'error');
    showToast('削除に失敗しました: ' + error.message, 'error');
    return;
  }

  products = products.filter(p => p.id !== productId);
  renderProductsList();
  populateProductDropdown();
  showStatus('保存済み', 'saved');
  showToast('商品を削除しました', 'success');
}

// ドラッグ&ドロップで商品の表示順を変更
let draggedProductId = null;

function handleProductDragStart(event, productId) {
  draggedProductId = productId;
  event.dataTransfer.effectAllowed = 'move';
  event.target.style.opacity = '0.5';
}

function handleProductDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  return false;
}

async function handleProductDrop(event, targetProductId) {
  event.preventDefault();
  event.stopPropagation();

  if (!draggedProductId || draggedProductId === targetProductId) {
    resetProductDragState();
    return;
  }

  const draggedProduct = products.find(p => p.id === draggedProductId);
  const targetProduct = products.find(p => p.id === targetProductId);

  if (!draggedProduct || !targetProduct) {
    resetProductDragState();
    return;
  }

  // 表示順を入れ替え
  const draggedOrder = draggedProduct.display_order;
  const targetOrder = targetProduct.display_order;

  showStatus('並び替え中...', 'saving');

  // 両方の商品の表示順を更新
  const updates = [
    supabase.from('products').update({ display_order: targetOrder }).eq('id', draggedProductId),
    supabase.from('products').update({ display_order: draggedOrder }).eq('id', targetProductId)
  ];

  const results = await Promise.all(updates);

  if (results.some(r => r.error)) {
    // エラーがあってもローカルで更新
    draggedProduct.display_order = targetOrder;
    targetProduct.display_order = draggedOrder;
    renderProductsList();
    populateProductDropdown();
    showStatus('並び替え完了', 'success');
    showToast('表示順を変更しました（ローカルのみ）', 'success');
    resetProductDragState();
    return;
  }

  // ローカルデータも更新
  draggedProduct.display_order = targetOrder;
  targetProduct.display_order = draggedOrder;

  // 再描画
  renderProductsList();
  populateProductDropdown();
  showStatus('並び替え完了', 'success');
  showToast('表示順を変更しました', 'success');
  resetProductDragState();
}

function resetProductDragState() {
  draggedProductId = null;
  // すべての行の透明度をリセット
  document.querySelectorAll('#productsGrid tr[draggable]').forEach(tr => {
    tr.style.opacity = '1';
  });
}

function populateProductDropdown() {
  const select = document.getElementById('projectSpecifications');
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = '<option value="">選択してください</option>' +
    products.map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join('');

  if (currentValue) select.value = currentValue;
}

// ============================================
// タスク管理（設計・IC分離）
// ============================================
function renderTasksManagement() {
  const container = document.getElementById('tasksGrid');
  if (!container) return;

  const sekkeiTasks = tasksV2.filter(t => t.category === '設計');

  container.innerHTML = `
    <div class="table-container">
      <table class="table" style="table-layout: fixed; width: 100%;">
        <thead>
          <tr>
            <th style="width: 30px;"></th>
            <th style="text-align: left;">タスク名</th>
            <th style="width: 80px; text-align: center;">状態</th>
            <th style="width: 80px; text-align: center;">📧必須</th>
            <th style="width: 100px; text-align: center;">業者</th>
            <th style="width: 120px; text-align: right;">操作</th>
          </tr>
        </thead>
        <tbody id="sekkeiTasksBody">
          ${sekkeiTasks.map(task => renderTaskRow(task)).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top: 16px; padding: 12px; background: var(--bg-secondary); border-radius: var(--radius-md);">
      <p style="margin: 0; font-size: 13px; color: var(--text-secondary);">
        📐 設計タスク: ${sekkeiTasks.length}件登録済み
      </p>
    </div>
  `;
}

function renderIcTasksManagement() {
  const container = document.getElementById('icTasksGrid');
  if (!container) return;

  const icTasks = tasksV2.filter(t => t.category === 'IC');

  container.innerHTML = `
    <div class="table-container">
      <table class="table">
        <thead>
          <tr>
            <th style="width: 30px;"></th>
            <th>タスク名</th>
            <th style="width: 80px; text-align: center;">状態</th>
            <th style="width: 80px; text-align: center;">📧必須</th>
            <th style="width: 100px; text-align: center;">業者</th>
            <th style="width: 120px; text-align: right;">操作</th>
          </tr>
        </thead>
        <tbody id="icTasksBody">
          ${icTasks.map(task => renderTaskRow(task)).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top: 16px; padding: 12px; background: var(--bg-secondary); border-radius: var(--radius-md);">
      <p style="margin: 0; font-size: 13px; color: var(--text-secondary);">
        🎨 ICタスク: ${icTasks.length}件登録済み
      </p>
    </div>
  `;
}

function renderTaskRow(task) {
  // 業者登録状況を確認（template_vendorsから）
  // taskMappingsで変換、なければtask_keyをそのまま使用
  const templateId = taskMappings[task.task_key] || task.task_key;
  const taskVendors = vendors.filter(v => v.template_id === templateId);
  const hasVendors = taskVendors.length > 0;
  const hasEmailVendor = taskVendors.some(v => v.email);

  const stateInfo = task.has_state ?
    `<span class="badge badge-success">あり</span>` :
    `<span class="badge badge-secondary">なし</span>`;

  // メールボタン必須
  const emailRequired = task.has_email_button ?
    `<span class="badge badge-primary">必須</span>` :
    `<span class="badge badge-secondary">-</span>`;

  // 業者登録状況（クリックで業者管理モーダルを開く）
  const vendorBtnClass = hasVendors ? 'btn-secondary' : 'btn-ghost';
  const vendorCount = hasVendors ? `${taskVendors.length}社` : '未登録';
  const emailIcon = hasEmailVendor ? ' 📧' : '';

  return `
    <tr draggable="true" ondragstart="handleTaskDragStart(event, '${task.id}')" ondragover="handleTaskDragOver(event)" ondrop="handleTaskDrop(event, '${task.id}')" style="cursor: move;">
      <td style="width: 30px; text-align: center;"><span style="color: var(--text-muted);">⋮⋮</span></td>
      <td style="min-width: 200px;"><strong>${escapeHtml(task.task_name)}</strong></td>
      <td style="width: 80px; text-align: center;">${stateInfo}</td>
      <td style="width: 80px; text-align: center;">${emailRequired}</td>
      <td style="width: 100px; text-align: center;">
        <button class="btn ${vendorBtnClass} btn-small" onclick="openTaskVendorManager('${task.task_key}')" title="業者を管理">
          ${vendorCount}${emailIcon}
        </button>
      </td>
      <td style="width: 120px; text-align: right; white-space: nowrap;">
        <button class="btn btn-ghost btn-small" onclick="editTask('${task.id}')" title="編集">編集</button>
        <button class="btn btn-ghost btn-small" onclick="deleteTask('${task.id}')" title="削除" style="color: var(--danger-color);">削除</button>
      </td>
    </tr>
  `;
}

// ============================================
// 外構業務管理
// ============================================
// 外構タスクのデフォルト定義
const defaultExteriorTasks = [
  { id: 'ext_hearing', name: 'ヒアリング', order: 1, states: ['未着手', '完了'] },
  { id: 'ext_site_survey', name: '現地調査', order: 2, states: ['未着手', '調査済', '報告済'] },
  { id: 'ext_first_proposal', name: '初回提案', order: 3, states: ['未着手', '作成中', '提出済', '承認'] },
  { id: 'ext_estimate', name: '見積作成', order: 4, states: ['未着手', '作成中', '提出済', '承認'] },
  { id: 'ext_final_design', name: '最終設計', order: 5, states: ['未着手', '作成中', '確定'] },
  { id: 'ext_material_order', name: '資材発注', order: 6, states: ['未着手', '発注済', '納品済'] },
  { id: 'ext_construction', name: '施工', order: 7, states: ['未着手', '着工', '進行中', '完工'] },
  { id: 'ext_inspection', name: '完了検査', order: 8, states: ['未着手', '検査済', '引渡完了'] }
];

// 外構タスクをローカルストレージから読み込み
let exteriorTasks = safeJsonParse(localStorage.getItem('exteriorTasks'), defaultExteriorTasks);

function renderExteriorTasksManagement() {
  const container = document.getElementById('exteriorTasksGrid');
  if (!container) return;

  container.innerHTML = `
    <div class="table-container">
      <table class="table">
        <thead>
          <tr>
            <th style="width: 60px;"></th>
            <th>タスク名</th>
            <th>ステータスオプション</th>
            <th style="width: 180px;">操作</th>
          </tr>
        </thead>
        <tbody>
          ${exteriorTasks.map(task => `
            <tr>
              <td><span style="color: var(--text-muted);">⋮⋮</span></td>
              <td><strong>${task.name}</strong></td>
              <td>
                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                  ${task.states.map(s => `<span class="badge badge-secondary">${s}</span>`).join('')}
                </div>
              </td>
              <td>
                <button class="btn btn-secondary btn-small" onclick="editExteriorTask('${task.id}')">編集</button>
                <button class="btn btn-danger btn-small" onclick="deleteExteriorTask('${task.id}')">削除</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top: 16px; padding: 16px; background: var(--bg-secondary); border-radius: var(--radius-md);">
      <p style="margin: 0; color: var(--text-secondary); font-size: 14px;">
        💡 外構業務タスクは案件カードの「外構依頼」セクションで使用されます。
        各タスクのステータスを設定して、外構設計の進捗を管理できます。
      </p>
    </div>
  `;
}

function openExteriorTaskModal(taskId = null) {
  const name = taskId ? exteriorTasks.find(t => t.id === taskId)?.name : '';
  const states = taskId ? exteriorTasks.find(t => t.id === taskId)?.states.join(', ') : '未着手, 完了';

  const newName = prompt('タスク名を入力:', name);
  if (!newName) return;

  const newStates = prompt('ステータスオプション（カンマ区切り）:', states);
  if (!newStates) return;

  const statesArray = newStates.split(',').map(s => s.trim()).filter(s => s);

  if (taskId) {
    const task = exteriorTasks.find(t => t.id === taskId);
    if (task) {
      task.name = newName;
      task.states = statesArray;
    }
  } else {
    exteriorTasks.push({
      id: 'ext_' + Date.now(),
      name: newName,
      order: exteriorTasks.length + 1,
      states: statesArray
    });
  }

  localStorage.setItem('exteriorTasks', JSON.stringify(exteriorTasks));
  renderExteriorTasksManagement();
  showToast('外構タスクを保存しました', 'success');
}

function editExteriorTask(taskId) {
  openExteriorTaskModal(taskId);
}

function deleteExteriorTask(taskId) {
  if (!confirm('このタスクを削除しますか？')) return;

  exteriorTasks = exteriorTasks.filter(t => t.id !== taskId);
  localStorage.setItem('exteriorTasks', JSON.stringify(exteriorTasks));
  renderExteriorTasksManagement();
  showToast('タスクを削除しました', 'success');
}

// 不動産デフォルトタスク定義
const defaultRealestateTasks = [
  { id: 'real_hearing', name: 'ヒアリング', order: 1, states: ['未着手', '実施中', '完了'] },
  { id: 'real_search', name: '物件検索', order: 2, states: ['未着手', '検索中', '候補あり', '完了'] },
  { id: 'real_inspection', name: '物件内見', order: 3, states: ['未着手', '日程調整中', '内見済', '完了'] },
  { id: 'real_proposal', name: '提案', order: 4, states: ['未着手', '資料作成中', '提案済', '承認'] },
  { id: 'real_negotiation', name: '交渉', order: 5, states: ['未着手', '交渉中', '合意', '完了'] },
  { id: 'real_contract', name: '契約', order: 6, states: ['未着手', '書類準備', '契約済', '完了'] },
  { id: 'real_loan', name: 'ローン手続き', order: 7, states: ['未着手', '申込中', '審査中', '承認', '完了'] },
  { id: 'real_settlement', name: '決済・引渡', order: 8, states: ['未着手', '準備中', '決済完了', '引渡完了'] }
];

// 不動産タスクをローカルストレージから読み込み
let realestateTasks = safeJsonParse(localStorage.getItem('realestateTasks'), defaultRealestateTasks);

// 工事デフォルトタスク定義
const defaultConstructionTasks = [
  { id: 'const_hearing', name: 'ヒアリング', order: 1, states: ['未着手', '実施中', '完了'] },
  { id: 'const_survey', name: '現地調査', order: 2, states: ['未着手', '調査済', '報告済'] },
  { id: 'const_estimate', name: '見積作成', order: 3, states: ['未着手', '作成中', '提出済', '承認'] },
  { id: 'const_contract', name: '工事契約', order: 4, states: ['未着手', '調整中', '契約済'] },
  { id: 'const_permit', name: '届出・許可', order: 5, states: ['未着手', '申請中', '許可済'] },
  { id: 'const_order', name: '資材発注', order: 6, states: ['未着手', '発注済', '納品済'] },
  { id: 'const_start', name: '着工', order: 7, states: ['未着手', '準備中', '着工済'] },
  { id: 'const_progress', name: '施工', order: 8, states: ['未着手', '基礎工事', '躯体工事', '仕上工事', '完了'] },
  { id: 'const_inspection', name: '完了検査', order: 9, states: ['未着手', '検査予約', '検査済', '是正完了'] },
  { id: 'const_handover', name: '引渡し', order: 10, states: ['未着手', '最終確認', '引渡完了'] }
];

// 工事タスクをローカルストレージから読み込み
let constructionTasks = safeJsonParse(localStorage.getItem('constructionTasks'), defaultConstructionTasks);

// 不動産業務管理
function renderRealestateTasksManagement() {
  const container = document.getElementById('realestateTasksGrid');
  if (!container) return;

  container.innerHTML = `
    <div class="data-table">
      <table>
        <thead>
          <tr>
            <th style="width: 40px;">順序</th>
            <th>タスク名</th>
            <th>ステータスオプション</th>
            <th style="width: 150px;">操作</th>
          </tr>
        </thead>
        <tbody>
          ${realestateTasks.map((task, index) => `
            <tr>
              <td>${index + 1}</td>
              <td><strong>${task.name}</strong></td>
              <td>
                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                  ${task.states.map(s => `<span class="badge badge-secondary">${s}</span>`).join('')}
                </div>
              </td>
              <td>
                <button class="btn btn-secondary btn-small" onclick="editRealestateTask('${task.id}')">編集</button>
                <button class="btn btn-danger btn-small" onclick="deleteRealestateTask('${task.id}')">削除</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top: 16px; padding: 16px; background: var(--bg-secondary); border-radius: var(--radius-md);">
      <p style="margin: 0; color: var(--text-secondary); font-size: 14px;">
        💡 不動産業務タスクは案件カードの「不動産業務内容」セクションで使用されます。
      </p>
    </div>
  `;
}

function openRealestateTaskModal(taskId = null) {
  const name = taskId ? realestateTasks.find(t => t.id === taskId)?.name : '';
  const states = taskId ? realestateTasks.find(t => t.id === taskId)?.states.join(', ') : '未着手, 完了';

  const newName = prompt('タスク名を入力:', name);
  if (!newName) return;

  const newStates = prompt('ステータスオプション（カンマ区切り）:', states);
  if (!newStates) return;

  const statesArray = newStates.split(',').map(s => s.trim()).filter(s => s);

  if (taskId) {
    const task = realestateTasks.find(t => t.id === taskId);
    if (task) {
      task.name = newName;
      task.states = statesArray;
    }
  } else {
    realestateTasks.push({
      id: 're_' + Date.now(),
      name: newName,
      order: realestateTasks.length + 1,
      states: statesArray
    });
  }

  localStorage.setItem('realestateTasks', JSON.stringify(realestateTasks));
  renderRealestateTasksManagement();
  showToast('不動産タスクを保存しました', 'success');
}

function editRealestateTask(taskId) {
  openRealestateTaskModal(taskId);
}

function deleteRealestateTask(taskId) {
  if (!confirm('このタスクを削除しますか？')) return;

  realestateTasks = realestateTasks.filter(t => t.id !== taskId);
  localStorage.setItem('realestateTasks', JSON.stringify(realestateTasks));
  renderRealestateTasksManagement();
  showToast('タスクを削除しました', 'success');
}

// 工事業務管理
function renderConstructionTasksManagement() {
  const container = document.getElementById('constructionTasksGrid');
  if (!container) return;

  container.innerHTML = `
    <div class="data-table">
      <table>
        <thead>
          <tr>
            <th style="width: 40px;">順序</th>
            <th>タスク名</th>
            <th>ステータスオプション</th>
            <th style="width: 150px;">操作</th>
          </tr>
        </thead>
        <tbody>
          ${constructionTasks.map((task, index) => `
            <tr>
              <td>${index + 1}</td>
              <td><strong>${task.name}</strong></td>
              <td>
                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                  ${task.states.map(s => `<span class="badge badge-secondary">${s}</span>`).join('')}
                </div>
              </td>
              <td>
                <button class="btn btn-secondary btn-small" onclick="editConstructionTask('${task.id}')">編集</button>
                <button class="btn btn-danger btn-small" onclick="deleteConstructionTask('${task.id}')">削除</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top: 16px; padding: 16px; background: var(--bg-secondary); border-radius: var(--radius-md);">
      <p style="margin: 0; color: var(--text-secondary); font-size: 14px;">
        💡 工事業務タスクは案件カードの「工事業務内容」セクションで使用されます。
      </p>
    </div>
  `;
}

function openConstructionTaskModal(taskId = null) {
  const name = taskId ? constructionTasks.find(t => t.id === taskId)?.name : '';
  const states = taskId ? constructionTasks.find(t => t.id === taskId)?.states.join(', ') : '未着手, 完了';

  const newName = prompt('タスク名を入力:', name);
  if (!newName) return;

  const newStates = prompt('ステータスオプション（カンマ区切り）:', states);
  if (!newStates) return;

  const statesArray = newStates.split(',').map(s => s.trim()).filter(s => s);

  if (taskId) {
    const task = constructionTasks.find(t => t.id === taskId);
    if (task) {
      task.name = newName;
      task.states = statesArray;
    }
  } else {
    constructionTasks.push({
      id: 'con_' + Date.now(),
      name: newName,
      order: constructionTasks.length + 1,
      states: statesArray
    });
  }

  localStorage.setItem('constructionTasks', JSON.stringify(constructionTasks));
  renderConstructionTasksManagement();
  showToast('工事タスクを保存しました', 'success');
}

function editConstructionTask(taskId) {
  openConstructionTaskModal(taskId);
}

function deleteConstructionTask(taskId) {
  if (!confirm('このタスクを削除しますか？')) return;

  constructionTasks = constructionTasks.filter(t => t.id !== taskId);
  localStorage.setItem('constructionTasks', JSON.stringify(constructionTasks));
  renderConstructionTasksManagement();
  showToast('タスクを削除しました', 'success');
}

function openTaskModal(taskIdOrCategory = null) {
  const modal = document.getElementById('taskModal');
  const title = document.getElementById('taskModalTitle');

  // カテゴリ名が渡された場合（新規追加）
  const isCategory = taskIdOrCategory === '設計' || taskIdOrCategory === 'IC';

  if (taskIdOrCategory && !isCategory) {
    // 編集モード（taskIdが渡された）
    const task = tasksV2.find(t => t.id === taskIdOrCategory);
    if (!task) return;

    title.textContent = 'タスク編集';
    document.getElementById('taskId').value = task.id;
    document.getElementById('taskKey').value = task.task_key;
    document.getElementById('taskName').value = task.task_name;
    document.getElementById('taskCategory').value = task.category;
    document.getElementById('taskOrder').value = task.display_order;
    document.getElementById('taskHasState').checked = task.has_state;
    renderStateOptions(task.state_options || []);
    document.getElementById('taskHasEmailButton').checked = task.has_email_button !== false;
    toggleTaskState();
    populateTaskVendorSelection(taskIdOrCategory);
  } else {
    // 新規追加モード
    const category = isCategory ? taskIdOrCategory : '設計';
    title.textContent = `${category}タスク追加`;
    document.getElementById('taskForm').reset();
    document.getElementById('taskId').value = '';
    document.getElementById('taskCategory').value = category;
    document.getElementById('taskOrder').value = tasksV2.filter(t => t.category === category).length + 1;
    document.getElementById('taskHasState').checked = false;
    document.getElementById('taskHasEmailButton').checked = true;
    renderStateOptions([]);
    toggleTaskState();
    populateTaskVendorSelection(null);
  }

  ModalManager.open(modal, '#taskKey');
}

function populateTaskVendorSelection(taskId) {
  const container = document.getElementById('taskVendorSelection');
  if (!container) return;

  // 現在のタスクに紐づいている業者IDリストを取得
  const currentMappings = taskId ? taskVendorMappings.filter(m => m.task_id === taskId).map(m => m.vendor_id) : [];

  // カテゴリごとにグループ化して表示
  const categories = [...new Set(vendorsV2.map(v => v.vendor_categories?.name || '未分類'))].sort();

  container.innerHTML = categories.map(category => {
    const categoryVendors = vendorsV2.filter(v => (v.vendor_categories?.name || '未分類') === category);

    return `
      <div style="margin-bottom: 12px;">
        <div style="font-weight: 600; color: #4A90E2; margin-bottom: 4px; font-size: 12px;">${category}</div>
        ${categoryVendors.map(vendor => `
          <label style="display: block; padding: 4px 0; cursor: pointer;">
            <input type="checkbox"
                   value="${vendor.id}"
                   ${currentMappings.includes(vendor.id) ? 'checked' : ''}
                   style="margin-right: 8px;">
            ${escapeHtml(vendor.company)}
          </label>
        `).join('')}
      </div>
    `;
  }).join('');
}

function closeTaskModal() {
  ModalManager.close(document.getElementById('taskModal'));
}

function toggleTaskState() {
  const hasState = document.getElementById('taskHasState').checked;
  const stateGroup = document.getElementById('stateOptionsGroup');
  stateGroup.style.display = hasState ? 'block' : 'none';
}

function renderStateOptions(options = []) {
  const container = document.getElementById('stateOptionsList');
  if (!container) return;

  // 空の「-」は除外して表示
  const filteredOptions = options.filter(opt => opt && opt !== '-' && opt !== '');

  if (filteredOptions.length === 0) {
    // デフォルトで1つ空の入力欄を表示
    filteredOptions.push('');
  }

  container.innerHTML = filteredOptions.map((opt, index) => `
    <div class="state-option-item">
      <input type="text" class="state-option-input" value="${escapeHtml(opt)}" placeholder="例：依頼済">
      <button type="button" class="btn-remove" onclick="removeStateOption(${index})">削除</button>
    </div>
  `).join('');
}

function addStateOption() {
  const container = document.getElementById('stateOptionsList');
  if (!container) return;

  const newItem = document.createElement('div');
  newItem.className = 'state-option-item';
  newItem.innerHTML = `
    <input type="text" class="state-option-input" value="" placeholder="例：依頼済">
    <button type="button" class="btn-remove" onclick="this.parentElement.remove()">削除</button>
  `;
  container.appendChild(newItem);
  newItem.querySelector('input').focus();
}

function removeStateOption(index) {
  const container = document.getElementById('stateOptionsList');
  if (!container) return;

  const items = container.querySelectorAll('.state-option-item');
  if (items[index]) {
    items[index].remove();
  }
}

function collectStateOptions() {
  const container = document.getElementById('stateOptionsList');
  if (!container) return [];

  const inputs = container.querySelectorAll('.state-option-input');
  const options = ['-']; // 先頭に空の選択肢を追加

  inputs.forEach(input => {
    const value = input.value.trim();
    if (value && value !== '-') {
      options.push(value);
    }
  });

  return options;
}

async function saveTask() {
  if (SaveGuard.isLocked('saveTask')) return;

  const id = document.getElementById('taskId')?.value || '';
  const taskName = document.getElementById('taskName')?.value?.trim() || '';
  const category = document.getElementById('taskCategory')?.value || '';
  const order = parseInt(document.getElementById('taskOrder')?.value) || 0;
  const hasState = document.getElementById('taskHasState')?.checked || false;
  const hasEmailButton = document.getElementById('taskHasEmailButton')?.checked || false;

  if (!taskName) {
    showToast('タスク名を入力してください', 'error');
    return;
  }

  // タスクキーを自動生成（編集時は既存のキーを使用）
  let taskKey = document.getElementById('taskKey').value;
  if (!taskKey) {
    // 新規作成時：タスク名から自動生成（日本語を削除し、スペースをアンダースコアに変換）
    taskKey = 'task_' + taskName.replace(/[\u3000-\u9FFF]/g, '').replace(/\s+/g, '_').toLowerCase() + '_' + Date.now();
    // 安全のため、英数字とアンダースコアのみに制限
    taskKey = taskKey.replace(/[^a-z0-9_]/g, '_');
  }

  // 状態オプションを動的リストから収集
  let stateOptions = null;
  if (hasState) {
    stateOptions = collectStateOptions();
  }

  await SaveGuard.run('saveTask', async () => {
    showStatus('保存中...', 'saving');

    const taskData = {
      task_key: taskKey,
      task_name: taskName,
      category,
      display_order: order,
      has_state: hasState,
      state_options: stateOptions,
      has_email_button: hasEmailButton
    };

    let result;
    if (id) {
      result = await supabase
        .from('tasks')
        .update(taskData)
        .eq('id', id)
        .select();
    } else {
      result = await supabase
        .from('tasks')
        .insert([taskData])
        .select();
    }

    if (result.error) {
      showStatus('保存失敗', 'error');
      showToast('保存に失敗しました: ' + result.error.message, 'error');
      return;
    }

    // 業者紐づけの保存
    const savedTaskId = id || result.data[0].id;
    await saveTaskVendorMappings(savedTaskId);

    showStatus('保存完了', 'success');
    showToast(id ? 'タスクを更新しました' : 'タスクを追加しました', 'success');
    closeTaskModal();
    await loadTasksV2();
    await loadTaskVendorMappings();
    renderTasksManagement();
  });
}

async function saveTaskVendorMappings(taskId) {
  // 選択された業者IDを取得
  const checkboxes = document.querySelectorAll('#taskVendorSelection input[type="checkbox"]:checked');
  const selectedVendorIds = Array.from(checkboxes).map(cb => cb.value);

  // 既存の紐づけを全削除
  const { error: deleteError } = await supabase
    .from('task_vendor_mappings_v2')
    .delete()
    .eq('task_id', taskId);

  if (deleteError) {
    logError('業者紐づけ削除エラー:', deleteError);
    showToast('既存の紐づけ削除に失敗しました', 'error');
    return;
  }

  // 新しい紐づけを作成
  if (selectedVendorIds.length > 0) {
    const mappings = selectedVendorIds.map(vendorId => ({
      task_id: taskId,
      vendor_id: vendorId
    }));

    const { error } = await supabase
      .from('task_vendor_mappings_v2')
      .insert(mappings);

    if (error) {
      logError('業者紐づけ保存エラー:', error);
      showToast('業者紐づけの保存に失敗しました', 'error');
    }
  }
}

function editTask(taskId) {
  openTaskModal(taskId);
}

async function deleteTask(taskId) {
  const task = tasksV2.find(t => t.id === taskId);
  if (!task) return;

  if (!confirm(`タスク「${task.task_name}」を削除しますか？`)) return;

  await SaveGuard.run(`deleteTask_${taskId}`, async () => {
    showStatus('削除中...', 'saving');

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);

    if (error) {
      showStatus('削除失敗', 'error');
      showToast('削除に失敗しました: ' + error.message, 'error');
      return;
    }

    showStatus('削除完了', 'success');
    showToast('タスクを削除しました', 'success');
    await loadTasksV2();
    renderTasksManagement();
  });
}

// ドラッグ&ドロップでタスクの表示順を変更
let draggedTaskId = null;

function handleTaskDragStart(event, taskId) {
  draggedTaskId = taskId;
  event.dataTransfer.effectAllowed = 'move';
  event.target.style.opacity = '0.5';
}

function handleTaskDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  return false;
}

async function handleTaskDrop(event, targetTaskId) {
  event.preventDefault();
  event.stopPropagation();

  if (!draggedTaskId || draggedTaskId === targetTaskId) {
    resetDragState();
    return;
  }

  const draggedTask = tasksV2.find(t => t.id === draggedTaskId);
  const targetTask = tasksV2.find(t => t.id === targetTaskId);

  if (!draggedTask || !targetTask) {
    resetDragState();
    return;
  }

  // 同じカテゴリ内でのみ並び替え可能
  if (draggedTask.category !== targetTask.category) {
    showToast('同じカテゴリ内でのみ並び替え可能です', 'error');
    resetDragState();
    return;
  }

  // 表示順を入れ替え
  const draggedOrder = draggedTask.display_order;
  const targetOrder = targetTask.display_order;

  showStatus('並び替え中...', 'saving');

  // 両方のタスクの表示順を更新
  const updates = [
    supabase.from('tasks').update({ display_order: targetOrder }).eq('id', draggedTaskId),
    supabase.from('tasks').update({ display_order: draggedOrder }).eq('id', targetTaskId)
  ];

  const results = await Promise.all(updates);

  if (results.some(r => r.error)) {
    showStatus('並び替え失敗', 'error');
    showToast('並び替えに失敗しました', 'error');
    resetDragState();
    return;
  }

  // ローカルデータも更新
  draggedTask.display_order = targetOrder;
  targetTask.display_order = draggedOrder;

  // 再描画
  renderTasksManagement();
  showStatus('並び替え完了', 'success');
  showToast('表示順を変更しました', 'success');
  resetDragState();
}

function resetDragState() {
  draggedTaskId = null;
  // すべての行の透明度をリセット
  document.querySelectorAll('#tasksGrid tr[draggable]').forEach(tr => {
    tr.style.opacity = '1';
  });
}

// ============================================
// UI制御
// ============================================
// サイドバー描画
function renderSidebar() {
  const container = document.getElementById('sidebarContent');
  if (!container) return;

  const sekkeiDesigners = getSekkeiDesigners();
  const icDesigners = getIcDesigners();
  // 全案件: 完了済（is_archived）を除外
  const allCount = projects.filter(p => p.status !== 'completed' && !p.is_archived).length;

  // 完了済の件数
  const archivedCount = projects.filter(p => p.is_archived).length;
  // 部署別の完了済み件数（設計: 間取確定なし、IC: 間取確定あり）
  const archivedSekkei = projects.filter(p => p.is_archived && !p.layout_confirmed_date).length;
  const archivedIC = projects.filter(p => p.is_archived && p.layout_confirmed_date).length;

  let html = `
    <div class="sidebar-section">
      <div class="sidebar-item ${currentDesignerTab === 'ALL' ? 'active' : ''}" onclick="selectDesigner('ALL')">
        <span class="sidebar-item-label">全案件</span>
        <span class="sidebar-item-count">${allCount}</span>
      </div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-section-title" style="color: var(--success-color);">✓ 完了済</div>
      <div class="sidebar-item ${currentDesignerTab === 'ARCHIVED_SEKKEI' ? 'active' : ''}" onclick="selectDesigner('ARCHIVED_SEKKEI')" style="background: ${currentDesignerTab === 'ARCHIVED_SEKKEI' ? 'var(--success-bg)' : 'transparent'};">
        <span class="sidebar-item-label" style="color: var(--success-color);">📐 設計</span>
        <span class="sidebar-item-count" style="background: var(--success-color); color: white;">${archivedSekkei}</span>
      </div>
      <div class="sidebar-item ${currentDesignerTab === 'ARCHIVED_IC' ? 'active' : ''}" onclick="selectDesigner('ARCHIVED_IC')" style="background: ${currentDesignerTab === 'ARCHIVED_IC' ? 'var(--success-bg)' : 'transparent'};">
        <span class="sidebar-item-label" style="color: var(--success-color);">🎨 IC</span>
        <span class="sidebar-item-count" style="background: var(--success-color); color: white;">${archivedIC}</span>
      </div>
      <div class="sidebar-item ${currentDesignerTab === 'ARCHIVED' ? 'active' : ''}" onclick="selectDesigner('ARCHIVED')" style="background: ${currentDesignerTab === 'ARCHIVED' ? 'var(--success-bg)' : 'transparent'};">
        <span class="sidebar-item-label" style="color: var(--text-muted);">全て</span>
        <span class="sidebar-item-count" style="background: var(--text-muted); color: white;">${archivedCount}</span>
      </div>
    </div>
  `;

  // 件数による色分けヘルパー関数
  function getCountStyle(count) {
    if (count >= 7) {
      return 'color: #dc2626; font-weight: 700;'; // 赤色（危険）
    } else if (count >= 5) {
      return 'color: #d97706; font-weight: 600;'; // 黄色（注意）
    }
    return ''; // 通常（4件以下）
  }

  function getCountBadgeClass(count) {
    if (count >= 7) return 'badge-danger';
    if (count >= 5) return 'badge-warning';
    return 'badge-primary';
  }

  if (sekkeiDesigners.length > 0) {
    html += '<div class="sidebar-section"><div class="sidebar-section-title">📐 設計担当</div>';
    sekkeiDesigners.forEach(designer => {
      const designerName = designer.name.trim();
      const count = projects.filter(p => {
        const assigned = (p.assigned_to || '').trim();
        return assigned === designerName && p.status !== 'completed' && !p.is_archived;
      }).length;
      const archivedCountForDesigner = projects.filter(p => {
        const assigned = (p.assigned_to || '').trim();
        return assigned === designerName && p.is_archived;
      }).length;
      const nameStyle = getCountStyle(count);
      const badgeClass = getCountBadgeClass(count);
      html += `
        <div class="sidebar-item ${currentDesignerTab === designer.name ? 'active' : ''}" onclick="selectDesigner('${designer.name}')">
          <span class="sidebar-item-label" style="${nameStyle}">${designer.name}</span>
          <span class="sidebar-counts">
            <span class="sidebar-item-count ${badgeClass}">${count}</span>
            ${archivedCountForDesigner > 0 ? `<span class="sidebar-archived-count" onclick="event.stopPropagation(); selectDesignerArchived('${designer.name}')" title="完了済を表示">✓${archivedCountForDesigner}</span>` : ''}
          </span>
        </div>
      `;
    });
    html += '</div>';
  }

  if (icDesigners.length > 0) {
    html += '<div class="sidebar-section"><div class="sidebar-section-title">🎨 IC担当</div>';
    icDesigners.forEach(designer => {
      const designerName = designer.name.trim();
      // IC担当者の場合、間取確定が完了している案件のみ表示
      // 申請GO済み（is_archived）でもIC進捗100%未満はアクティブとして扱う
      const count = projects.filter(p => {
        // 間取確定日がない案件はICに表示しない
        if (!p.layout_confirmed_date) return false;
        const assigned = (p.assigned_to || '').trim();
        const icAssigned = (p.ic_assignee || '').trim();
        const isMyProject = assigned === designerName || icAssigned === designerName;
        if (!isMyProject) return false;
        if (p.status === 'completed') return false;
        // 申請GO済みの場合、IC進捗100%なら完了扱い、未満ならアクティブ扱い
        if (p.is_archived) {
          const icProgress = calculateICProgress(p);
          return icProgress !== null && icProgress < 100;
        }
        return true;
      }).length;
      // IC担当者の完了案件: 申請GO済みかつIC進捗100%（間取確定済みのみ）
      const archivedCountForDesigner = projects.filter(p => {
        // 間取確定日がない案件はICに表示しない
        if (!p.layout_confirmed_date) return false;
        const assigned = (p.assigned_to || '').trim();
        const icAssigned = (p.ic_assignee || '').trim();
        const isMyProject = assigned === designerName || icAssigned === designerName;
        if (!isMyProject) return false;
        if (!p.is_archived) return false;
        const icProgress = calculateICProgress(p);
        return icProgress === null || icProgress === 100; // IC担当なし、またはIC進捗100%
      }).length;
      const nameStyle = getCountStyle(count);
      const badgeClass = getCountBadgeClass(count);
      html += `
        <div class="sidebar-item ${currentDesignerTab === designer.name ? 'active' : ''}" onclick="selectDesigner('${designer.name}')">
          <span class="sidebar-item-label" style="${nameStyle}">${designer.name}</span>
          <span class="sidebar-counts">
            <span class="sidebar-item-count ${badgeClass}">${count}</span>
            ${archivedCountForDesigner > 0 ? `<span class="sidebar-archived-count" onclick="event.stopPropagation(); selectDesignerArchived('${designer.name}')" title="完了済を表示">✓${archivedCountForDesigner}</span>` : ''}
          </span>
        </div>
      `;
    });
    html += '</div>';
  }

  // 外構担当
  const exteriorDesigners = getExteriorDesigners();
  if (exteriorDesigners.length > 0) {
    html += '<div class="sidebar-section"><div class="sidebar-section-title">🏡 外構担当</div>';
    exteriorDesigners.forEach(designer => {
      const designerName = designer.name.trim();
      const count = projects.filter(p => {
        const exteriorAssigned = (p.exterior_assignee || '').trim();
        return exteriorAssigned === designerName && p.status !== 'completed' && !p.is_archived;
      }).length;
      const archivedCountForDesigner = projects.filter(p => {
        const exteriorAssigned = (p.exterior_assignee || '').trim();
        return exteriorAssigned === designerName && p.is_archived;
      }).length;
      const nameStyle = getCountStyle(count);
      const badgeClass = getCountBadgeClass(count);
      html += `
        <div class="sidebar-item ${currentDesignerTab === designer.name ? 'active' : ''}" onclick="selectDesigner('${designer.name}')">
          <span class="sidebar-item-label" style="${nameStyle}">${designer.name}</span>
          <span class="sidebar-counts">
            <span class="sidebar-item-count ${badgeClass}">${count}</span>
            ${archivedCountForDesigner > 0 ? `<span class="sidebar-archived-count" onclick="event.stopPropagation(); selectDesignerArchived('${designer.name}')" title="完了済を表示">✓${archivedCountForDesigner}</span>` : ''}
          </span>
        </div>
      `;
    });
    html += '</div>';
  }

  // 不動産担当
  const realestateDesigners = getRealestateDesigners();
  if (realestateDesigners.length > 0) {
    html += '<div class="sidebar-section"><div class="sidebar-section-title">🏢 不動産担当</div>';
    realestateDesigners.forEach(designer => {
      const designerName = designer.name.trim();
      const count = projects.filter(p => {
        const realestateAssigned = (p.realestate_assignee || '').trim();
        return realestateAssigned === designerName && p.status !== 'completed' && !p.is_archived;
      }).length;
      const archivedCountForDesigner = projects.filter(p => {
        const realestateAssigned = (p.realestate_assignee || '').trim();
        return realestateAssigned === designerName && p.is_archived;
      }).length;
      const nameStyle = getCountStyle(count);
      const badgeClass = getCountBadgeClass(count);
      html += `
        <div class="sidebar-item ${currentDesignerTab === designer.name ? 'active' : ''}" onclick="selectDesigner('${designer.name}')">
          <span class="sidebar-item-label" style="${nameStyle}">${designer.name}</span>
          <span class="sidebar-counts">
            <span class="sidebar-item-count ${badgeClass}">${count}</span>
            ${archivedCountForDesigner > 0 ? `<span class="sidebar-archived-count" onclick="event.stopPropagation(); selectDesignerArchived('${designer.name}')" title="完了済を表示">✓${archivedCountForDesigner}</span>` : ''}
          </span>
        </div>
      `;
    });
    html += '</div>';
  }

  // 工事担当
  const constructionDesigners = getConstructionDesigners();
  if (constructionDesigners.length > 0) {
    html += '<div class="sidebar-section"><div class="sidebar-section-title">🔨 工事担当</div>';
    constructionDesigners.forEach(designer => {
      const designerName = designer.name.trim();
      const count = projects.filter(p => {
        const constructionAssigned = (p.construction_assignee || '').trim();
        return constructionAssigned === designerName && p.status !== 'completed' && !p.is_archived;
      }).length;
      const archivedCountForDesigner = projects.filter(p => {
        const constructionAssigned = (p.construction_assignee || '').trim();
        return constructionAssigned === designerName && p.is_archived;
      }).length;
      const nameStyle = getCountStyle(count);
      const badgeClass = getCountBadgeClass(count);
      html += `
        <div class="sidebar-item ${currentDesignerTab === designer.name ? 'active' : ''}" onclick="selectDesigner('${designer.name}')">
          <span class="sidebar-item-label" style="${nameStyle}">${designer.name}</span>
          <span class="sidebar-counts">
            <span class="sidebar-item-count ${badgeClass}">${count}</span>
            ${archivedCountForDesigner > 0 ? `<span class="sidebar-archived-count" onclick="event.stopPropagation(); selectDesignerArchived('${designer.name}')" title="完了済を表示">✓${archivedCountForDesigner}</span>` : ''}
          </span>
        </div>
      `;
    });
    html += '</div>';
  }

  container.innerHTML = html;
}

function selectDesigner(name) {
  currentDesignerTab = name;
  console.log('📅 selectDesigner: 担当者変更', { name, currentDesignerTab });

  // アーカイブフィルターをリセット
  const archiveFilter = document.getElementById('archiveFilter');
  if (archiveFilter) {
    if (name === 'ARCHIVED' || name === 'ARCHIVED_SEKKEI' || name === 'ARCHIVED_IC') {
      // 完了済みタブ: 完了済みのみ表示
      archiveFilter.value = 'archived';
    } else {
      // その他のタブ: アクティブのみ表示
      archiveFilter.value = 'active';
    }
  }

  // URLを更新
  updateURLWithDesigner(name);

  renderSidebar();
  renderProjects();

  // カレンダーは常に再描画（担当者フィルタリングのため）
  console.log('📅 selectDesigner: renderCalendar呼び出し');
  renderCalendar();
}

// 担当者の完了済案件を表示
function selectDesignerArchived(name) {
  currentDesignerTab = name;

  // アーカイブフィルターを完了済に設定
  const archiveFilter = document.getElementById('archiveFilter');
  if (archiveFilter) {
    archiveFilter.value = 'archived';
  }

  // URLを更新
  updateURLWithDesigner(name);

  renderSidebar();
  renderProjects();
  renderCalendar(); // カレンダーも担当者に連動
}

// メインタブ切り替え
function switchMainTab(tabName, element) {
  log('📑 switchMainTab 開始:', {
    tabName: tabName,
    isHandlingHashChange: isHandlingHashChange,
    currentHash: window.location.hash,
    timestamp: new Date().toISOString()
  });

  // ヘッダーナビゲーションボタンを更新
  document.querySelectorAll('.header-nav-btn').forEach(btn => btn.classList.remove('active'));
  if (element) element.classList.add('active');

  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
  document.getElementById(tabName + 'Tab').classList.add('active');

  // URLを更新（handleHashChange処理中でない場合のみ）
  if (!isHandlingHashChange && window.location.hash !== '#' + tabName) {
    log('🔗 switchMainTab: URLを更新:', tabName);
    window.location.hash = tabName;
  } else {
    log('⏸️ switchMainTab: URL更新をスキップ (isHandlingHashChange=' + isHandlingHashChange + ')');
  }

  // カレンダータブの場合は描画
  if (tabName === 'calendar') {
    renderCalendar();
  }
}

// ===== カレンダー機能 =====
let calendarCurrentDate = new Date();

function navigateCalendar(direction) {
  calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + direction);
  renderCalendar();
}

function renderCalendar() {
  console.log('📅 renderCalendar: 開始', { currentDesignerTab });
  const grid = document.getElementById('calendarGrid');
  const title = document.getElementById('calendarTitle');
  if (!grid || !title) {
    console.log('📅 renderCalendar: DOM要素が見つからない', { grid: !!grid, title: !!title });
    return;
  }

  const year = calendarCurrentDate.getFullYear();
  const month = calendarCurrentDate.getMonth();

  // タイトル更新
  title.textContent = `${year}年${month + 1}月`;

  // 月の最初と最後の日
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay();

  // 期限付きタスクを収集
  const events = collectCalendarEvents();
  console.log('📅 renderCalendar: イベント収集完了', { eventCount: events.length });

  // カレンダーグリッド生成
  let html = '';

  // 曜日ヘッダー
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  dayNames.forEach(name => {
    html += `<div class="calendar-day-header">${name}</div>`;
  });

  // 今日の日付
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // 前月の日を埋める
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const day = prevMonthLastDay - i;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    html += `<div class="calendar-day other-month">
      <div class="calendar-day-number">${day}</div>
    </div>`;
  }

  // 当月の日
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const dayEvents = events.filter(e => e.date === dateStr);

    html += `<div class="calendar-day ${isToday ? 'today' : ''}">
      <div class="calendar-day-number">${day}</div>
      <div class="calendar-events">
        ${dayEvents.slice(0, 3).map(e => {
          const familyName = e.customer.replace(/様$/, '').split(/[\s　]+/)[0];
          return `<div class="calendar-event ${e.category}" title="${escapeHtml(e.customer.replace(/様$/, ''))}様邸: ${escapeHtml(e.taskName)}">${escapeHtml(familyName)}様 ${escapeHtml(e.taskName)}</div>`;
        }).join('')}
        ${dayEvents.length > 3 ? `<div class="calendar-event" style="background:#ddd;color:#666;">+${dayEvents.length - 3}件</div>` : ''}
      </div>
    </div>`;
  }

  // 翌月の日を埋める（6週分になるまで）
  const totalCells = startDayOfWeek + lastDay.getDate();
  const remainingCells = (7 - (totalCells % 7)) % 7;
  for (let day = 1; day <= remainingCells; day++) {
    html += `<div class="calendar-day other-month">
      <div class="calendar-day-number">${day}</div>
    </div>`;
  }

  grid.innerHTML = html;
}

function collectCalendarEvents() {
  const events = [];

  console.log('📅 collectCalendarEvents: 開始', { currentDesignerTab, totalProjects: projects.length });

  // サイドバーで選択した担当者の案件のみをフィルタリング
  const filteredProjects = projects.filter(project => {
    // 完了済みタブの場合（全て）
    if (currentDesignerTab === 'ARCHIVED') {
      return project.is_archived;
    }

    // 設計の完了済み
    if (currentDesignerTab === 'ARCHIVED_SEKKEI') {
      return project.is_archived && !project.layout_confirmed_date;
    }

    // ICの完了済み
    if (currentDesignerTab === 'ARCHIVED_IC') {
      return project.is_archived && project.layout_confirmed_date;
    }

    // 通常は完了済みを除外
    if (project.is_archived) return false;

    // 全案件の場合
    if (currentDesignerTab === 'ALL') return true;

    // 特定の担当者が選択されている場合
    const selectedName = currentDesignerTab.trim();
    const assigned = (project.assigned_to || '').trim();
    const icAssigned = (project.ic_assignee || '').trim();
    const exteriorAssigned = (project.exterior_assignee || '').trim();
    const realestateAssigned = (project.realestate_assignee || '').trim();
    const constructionAssigned = (project.construction_assignee || '').trim();
    const salesAssigned = (project.sales_assignee || '').trim();

    return assigned === selectedName ||
           icAssigned === selectedName ||
           exteriorAssigned === selectedName ||
           realestateAssigned === selectedName ||
           constructionAssigned === selectedName ||
           salesAssigned === selectedName;
  });

  console.log('📅 collectCalendarEvents: フィルタ後', { filteredCount: filteredProjects.length });

  // カレンダー表示から除外するタスク
  const excludedFromCalendar = ['area_check', 'evoltz'];

  filteredProjects.forEach(project => {
    const progressData = project.progress || {};

    // 設計タスクの期限と依頼日（面積チェック、evoltzは除外）
    tasksV2.filter(t => t.category === '設計' && !excludedFromCalendar.includes(t.task_key)).forEach(task => {
      const taskData = progressData[task.task_key];
      if (taskData?.due_date) {
        events.push({
          date: taskData.due_date,
          customer: project.customer,
          taskName: task.task_name + '(期限)',
          category: 'design',
          projectId: project.id
        });
      }
      if (taskData?.request_date) {
        events.push({
          date: taskData.request_date,
          customer: project.customer,
          taskName: task.task_name + '(依頼)',
          category: 'task',
          projectId: project.id
        });
      }
    });

    // ICタスクの期限と依頼日
    tasksV2.filter(t => t.category === 'IC').forEach(task => {
      const taskData = progressData[task.task_key];
      if (taskData?.due_date) {
        events.push({
          date: taskData.due_date,
          customer: project.customer,
          taskName: task.task_name + '(期限)',
          category: 'ic',
          projectId: project.id
        });
      }
      if (taskData?.request_date) {
        events.push({
          date: taskData.request_date,
          customer: project.customer,
          taskName: task.task_name + '(依頼)',
          category: 'task',
          projectId: project.id
        });
      }
    });

    // 外構タスクの依頼日
    tasksV2.filter(t => t.category === '外構').forEach(task => {
      const taskData = progressData[task.task_key];
      if (taskData?.request_date) {
        events.push({
          date: taskData.request_date,
          customer: project.customer,
          taskName: task.task_name + '(依頼)',
          category: 'exterior',
          projectId: project.id
        });
      }
    });

    // 工事タスクの依頼日
    tasksV2.filter(t => t.category === '工事').forEach(task => {
      const taskData = progressData[task.task_key];
      if (taskData?.request_date) {
        events.push({
          date: taskData.request_date,
          customer: project.customer,
          taskName: task.task_name + '(依頼)',
          category: 'construction',
          projectId: project.id
        });
      }
    });

    // 主要な日程
    if (project.layout_confirmed_date) {
      events.push({
        date: project.layout_confirmed_date,
        customer: project.customer,
        taskName: '間取確定',
        category: 'design',
        projectId: project.id
      });
    }

    if (project.construction_permit_date) {
      events.push({
        date: project.construction_permit_date,
        customer: project.customer,
        taskName: '着工許可',
        category: 'construction',
        projectId: project.id
      });
    }

    if (project.pre_contract_meeting_date) {
      events.push({
        date: project.pre_contract_meeting_date,
        customer: project.customer,
        taskName: '変更契約前会議',
        category: 'design',
        projectId: project.id
      });
    }

    if (project.meeting_drawing_date) {
      events.push({
        date: project.meeting_drawing_date,
        customer: project.customer,
        taskName: '会議図面渡し日',
        category: 'ic',
        projectId: project.id
      });
    }
  });

  // 登録タスクの期限を追加
  projectTasks.forEach(task => {
    const project = filteredProjects.find(p => p.id === task.project_id);
    if (project && task.due_date) {
      events.push({
        date: task.due_date,
        customer: project.customer,
        taskName: task.task_name + '(期限)',
        category: 'task',
        projectId: project.id
      });
    }
  });

  console.log('📅 collectCalendarEvents: 完了', { totalEvents: events.length });
  return events;
}

// サブタブ切り替え
function switchSubTab(panelName, element) {
  log('📑 switchSubTab 開始:', {
    panelName: panelName,
    isHandlingHashChange: isHandlingHashChange,
    currentHash: window.location.hash,
    timestamp: new Date().toISOString()
  });

  document.querySelectorAll('.sub-tab-btn').forEach(btn => btn.classList.remove('active'));
  if (element) element.classList.add('active');

  document.querySelectorAll('.sub-tab-panel').forEach(panel => panel.classList.remove('active'));
  document.getElementById(panelName + 'Panel').classList.add('active');

  // URLを更新（handleHashChange処理中でない場合のみ）
  if (!isHandlingHashChange && window.location.hash !== `#settings/${panelName}`) {
    log('🔗 switchSubTab: URLを更新:', panelName);
    window.location.hash = `settings/${panelName}`;
  } else {
    log('⏸️ switchSubTab: URL更新をスキップ (isHandlingHashChange=' + isHandlingHashChange + ')');
  }

  // サブタブ切り替え時に対応する描画関数を実行
  switch(panelName) {
    case 'staff':
      renderDesignerListInline();
      renderDepartmentChips();
      updateDepartmentDropdowns();
      break;
    case 'taskManagement':
      switchDeptTab('設計');
      break;
    case 'products':
      renderProductsList();
      break;
    case 'customize':
      break;
    case 'kintone':
      loadKintoneSettings();
      break;
    case 'backup':
      break;
    case 'fcManagement':
      renderFcList();
      break;
    case 'requestTemplates':
      renderRequestTemplatesGrid();
      break;
  }
}

// 部署タブ切り替え（統合業務管理用）
function switchDeptTab(dept) {
  // タブのアクティブ状態を切り替え
  document.querySelectorAll('.dept-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.dept === dept);
  });

  // コンテンツの表示を切り替え
  document.querySelectorAll('.dept-content').forEach(content => {
    content.classList.remove('active');
    content.style.display = 'none';
  });
  const activeContent = document.getElementById(`deptContent_${dept}`);
  if (activeContent) {
    activeContent.classList.add('active');
    activeContent.style.display = 'block';
  }

  // 対応するタスク一覧を描画
  switch(dept) {
    case '設計':
      renderTasksManagement();
      break;
    case 'IC':
      renderIcTasksManagement();
      break;
    case '外構':
      renderExteriorTasksManagement();
      break;
    case '不動産':
      renderRealestateTasksManagement();
      break;
    case '工事':
      renderConstructionTasksManagement();
      break;
  }
}

// 設定パネルを開く（カード式UI用）
function openSettingsPanel(panelName) {
  // カードグリッドを非表示
  const cardsView = document.getElementById('settingsCardsView');
  if (cardsView) cardsView.style.display = 'none';

  // 全パネルを非表示
  document.querySelectorAll('.sub-tab-panel').forEach(panel => panel.classList.remove('active'));

  // 指定パネルを表示
  const panel = document.getElementById(panelName + 'Panel');
  if (panel) panel.classList.add('active');

  // URLを更新
  if (!isHandlingHashChange && window.location.hash !== `#settings/${panelName}`) {
    window.location.hash = `settings/${panelName}`;
  }

  // パネル固有の初期化処理
  switch(panelName) {
    case 'staff':
      renderDesignerListInline();
      renderDepartmentChips();
      updateDepartmentDropdowns();
      break;
    case 'taskManagement':
      // デフォルトで設計タブを表示
      switchDeptTab('設計');
      break;
    case 'products':
      renderProductsList();
      break;
    case 'customize':
      break;
    case 'kintone':
      loadKintoneSettings();
      break;
    case 'backup':
      // バックアップ画面の初期化
      break;
    case 'fcManagement':
      // FC管理画面の初期化
      renderFcList();
      break;
    case 'requestTemplates':
      renderRequestTemplatesGrid();
      break;
  }
}

// 設定カード一覧に戻る
function closeSettingsPanel() {
  // 全パネルを非表示
  document.querySelectorAll('.sub-tab-panel').forEach(panel => panel.classList.remove('active'));

  // カードグリッドを表示
  const cardsView = document.getElementById('settingsCardsView');
  if (cardsView) cardsView.style.display = 'grid';
}

// 旧switchTab関数（互換性のため残す）
function switchTab(tabName, element) {
  document.querySelectorAll('.header-nav-btn').forEach(btn => btn.classList.remove('active'));
  if (element) {
    element.classList.add('active');
  } else {
    // フォールバック：tabNameに基づいてアクティブなボタンを見つける
    const buttons = document.querySelectorAll('.header-nav-btn');
    buttons.forEach((btn, index) => {
      const tabs = ['projects', 'analytics', 'settings'];
      if (tabs[index] === tabName) {
        btn.classList.add('active');
      }
    });
  }
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
  document.getElementById(tabName + 'Tab').classList.add('active');

  // タブ切り替え時に対応する描画関数を実行
  switch(tabName) {
    case 'tasks':
      renderTasksManagement();
      break;
  }
}

// カテゴリドロップダウンを動的に生成
function populateVendorCategoryDropdown() {
  const dropdown = document.getElementById('vendorCategory');
  if (!dropdown) return;

  dropdown.innerHTML = '<option value="">カテゴリを選択...</option>' +
    vendorCategories.map(cat => `<option value="${escapeHtml(cat.id)}">${escapeHtml(cat.name)}</option>`).join('');
}

let statusClearTimeout = null;
function showStatus(message, type) {
  const indicator = document.getElementById('statusIndicator');
  const text = document.getElementById('statusText');
  indicator.className = 'status-indicator status-' + type;
  text.textContent = message;

  // 保存完了後は3秒で通常状態に戻す
  if (statusClearTimeout) clearTimeout(statusClearTimeout);
  if (type === 'saved' || type === 'success') {
    statusClearTimeout = setTimeout(() => {
      indicator.className = 'status-indicator';
      text.textContent = '';
    }, 3000);
  }
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.className = 'toast toast-' + type + ' show';
  toast.textContent = message;

  // スクリーンリーダーにも通知
  announceToScreenReader(message);

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// スクリーンリーダー用アナウンス
function announceToScreenReader(message, priority = 'polite') {
  const liveRegion = document.getElementById('liveRegion');
  if (liveRegion) {
    liveRegion.setAttribute('aria-live', priority);
    liveRegion.textContent = message;
    // 同じメッセージでも再通知するために一度クリア
    setTimeout(() => {
      liveRegion.textContent = '';
    }, 1000);
  }
}

// ローディングオーバーレイ
function showLoading(message = '読み込み中...') {
  const overlay = document.getElementById('loadingOverlay');
  const text = document.getElementById('loadingText');
  if (overlay) {
    if (text) text.textContent = message;
    overlay.classList.add('show');
  }
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.classList.remove('show');
  }
}

// プログレス付きローディング
let loadingProgress = 0;
function showLoadingProgress(message, current, total) {
  const overlay = document.getElementById('loadingOverlay');
  const text = document.getElementById('loadingText');
  if (overlay && text) {
    const percent = Math.round((current / total) * 100);
    text.textContent = `${message} (${percent}%)`;
    overlay.classList.add('show');
  }
}

// ============================================
// ブラウザ通知システム
// ============================================
const NotificationSystem = {
  permission: 'default',
  soundEnabled: localStorage.getItem('notificationSound') !== 'false',

  async init() {
    if ('Notification' in window) {
      this.permission = Notification.permission;
      log('🔔 通知権限:', this.permission);
    }
  },

  async requestPermission() {
    if (!('Notification' in window)) {
      showToast('このブラウザは通知に対応していません', 'warning');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      this.permission = permission;

      if (permission === 'granted') {
        showToast('通知が有効になりました', 'success');
        return true;
      } else {
        showToast('通知が許可されませんでした', 'warning');
        return false;
      }
    } catch (error) {
      logError('通知権限リクエストエラー:', error);
      return false;
    }
  },

  async send(title, options = {}) {
    if (this.permission !== 'granted') {
      log('通知権限がありません');
      return null;
    }

    const defaultOptions = {
      icon: '/archideck/icon-192.png',
      badge: '/archideck/badge.png',
      tag: 'archideck-notification',
      requireInteraction: false,
      ...options
    };

    try {
      // サウンド再生
      if (this.soundEnabled && options.sound !== false) {
        this.playSound();
      }

      const notification = new Notification(title, defaultOptions);

      notification.onclick = () => {
        window.focus();
        notification.close();
        if (options.onClick) options.onClick();
      };

      return notification;
    } catch (error) {
      logError('通知送信エラー:', error);
      return null;
    }
  },

  playSound() {
    try {
      // シンプルな通知音を生成
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
      log('通知音再生エラー（無視可）:', e);
    }
  },

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    localStorage.setItem('notificationSound', this.soundEnabled);
    showToast(this.soundEnabled ? '通知音をオンにしました' : '通知音をオフにしました', 'info');
    return this.soundEnabled;
  },

  // 期限間近の案件を通知
  async checkDeadlines() {
    const today = new Date();
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(today.getDate() + 3);

    const upcomingDeadlines = projects.filter(p => {
      if (!p.tasks || p.status === 'completed' || p.is_archived) return false;

      return Object.entries(p.tasks).some(([key, task]) => {
        if (!task.due_date || task.status === 'completed') return false;
        const dueDate = new Date(task.due_date);
        return dueDate >= today && dueDate <= threeDaysLater;
      });
    });

    if (upcomingDeadlines.length > 0) {
      await this.send('期限間近のタスクがあります', {
        body: `${upcomingDeadlines.length}件の案件に期限が近いタスクがあります`,
        tag: 'deadline-warning'
      });
    }
  }
};

// 通知システム初期化
document.addEventListener('DOMContentLoaded', () => {
  NotificationSystem.init();
});

// ============================================
// 案件管理
// ============================================
function renderDesignerTabs() {
  const container = document.getElementById('designerTabs');
  if (!container) {
    warn('⚠️ designerTabs要素が見つかりません');
    return;
  }

  log('🎨 担当者タブ描画:', {
    '総担当数': designers.length,
    '設計担当': designers.filter(d => d.category === '設計').length,
    'IC担当': designers.filter(d => d.category === 'IC').length,
    '案件数': projects.length
  });

  const activeCount = projects.filter(p => p.status !== 'completed').length;

  let html = `<button class="designer-tab ${currentDesignerTab === 'ALL' ? 'active' : ''}" onclick="setDesignerTab('ALL')">全案件 (${activeCount})</button>`;

  // 設計担当
  const sekkeiDesigners = designers.filter(d => d.category === '設計');
  log('📐 設計担当:', sekkeiDesigners.map(d => d.name));
  if (sekkeiDesigners.length > 0) {
    html += '<div class="designer-group-label">設計担当</div>';
    sekkeiDesigners.forEach(designer => {
      const designerProjects = projects.filter(p => {
        const assigned = (p.assigned_to || '').trim();
        const designerName = designer.name.trim();
        return assigned === designerName && p.status !== 'completed' && !p.is_archived;
      });
      const count = designerProjects.length;

      html += `<button class="designer-tab ${currentDesignerTab === designer.name ? 'active' : ''}" onclick="setDesignerTab('${designer.name}')">${designer.name} (${count})</button>`;
    });
  } else {
    warn('⚠️ 設計担当が0名です');
  }

  // IC担当（間取確定済みのみ）
  const icDesigners = designers.filter(d => d.category === 'IC');
  log('🎨 IC担当:', icDesigners.map(d => d.name));
  if (icDesigners.length > 0) {
    html += '<div class="designer-group-label">IC担当</div>';
    icDesigners.forEach(designer => {
      const designerProjects = projects.filter(p => {
        const assigned = (p.assigned_to || '').trim();
        const icAssigned = (p.ic_assignee || '').trim();
        const designerName = designer.name.trim();
        // IC担当は間取確定済みの案件のみ表示
        const isICAssigned = icAssigned === designerName && p.layout_confirmed_date;
        const isDesignAssigned = assigned === designerName;
        return (isDesignAssigned || isICAssigned) && p.status !== 'completed' && !p.is_archived;
      });
      const count = designerProjects.length;

      html += `<button class="designer-tab ${currentDesignerTab === designer.name ? 'active' : ''}" onclick="setDesignerTab('${designer.name}')">${designer.name} (${count})</button>`;
    });
  }

  container.innerHTML = html;
}

function setDesignerTab(name) {
  currentDesignerTab = name;

  // URLを更新
  updateURLWithDesigner(name);

  renderDesignerTabs();
  renderProjects();
}

function renderProjects() {
  const container = document.getElementById('projectsGrid');
  const emptyState = document.getElementById('emptyProjects');

  log('🎨 renderProjects() 開始');
  log('📊 現在のタブ:', currentDesignerTab);
  log('📊 全案件数:', projects.length);
  log('📊 全案件:', projects.map(p => ({ customer: p.customer, assigned_to: p.assigned_to, ic_assignee: p.ic_assignee })));

  let filtered = projects.filter(p => {
    // 完了済タブが選択されている場合
    if (currentDesignerTab === 'ARCHIVED') {
      // 完了済案件のみ表示（全て）
      if (!p.is_archived) return false;

      // 検索クエリフィルター
      const query = document.getElementById('searchQuery').value.toLowerCase();
      if (query && !p.customer.toLowerCase().includes(query) && !(p.memo || '').toLowerCase().includes(query)) return false;

      return true;
    }

    // 設計の完了済み（間取確定なし = 設計段階で完了）
    if (currentDesignerTab === 'ARCHIVED_SEKKEI') {
      if (!p.is_archived) return false;
      if (p.layout_confirmed_date) return false; // 間取確定済みはIC扱い

      // 検索クエリフィルター
      const query = document.getElementById('searchQuery').value.toLowerCase();
      if (query && !p.customer.toLowerCase().includes(query) && !(p.memo || '').toLowerCase().includes(query)) return false;

      return true;
    }

    // ICの完了済み（間取確定あり = IC段階で完了）
    if (currentDesignerTab === 'ARCHIVED_IC') {
      if (!p.is_archived) return false;
      if (!p.layout_confirmed_date) return false; // 間取確定なしは設計扱い

      // 検索クエリフィルター
      const query = document.getElementById('searchQuery').value.toLowerCase();
      if (query && !p.customer.toLowerCase().includes(query) && !(p.memo || '').toLowerCase().includes(query)) return false;

      return true;
    }

    // 担当者フィルター（設計/IC/外構/不動産担当）
    if (currentDesignerTab !== 'ALL') {
      const assigned = (p.assigned_to || '').trim();
      const icAssigned = (p.ic_assignee || '').trim();
      const exteriorAssigned = (p.exterior_assignee || '').trim();
      const realestateAssigned = (p.realestate_assignee || '').trim();
      const currentTab = currentDesignerTab.trim();

      // IC担当としてマッチするには間取確定が必要
      const icMatches = icAssigned === currentTab && p.layout_confirmed_date;

      if (assigned !== currentTab && !icMatches && exteriorAssigned !== currentTab && realestateAssigned !== currentTab) {
        log(`❌ フィルタで除外: ${p.customer} (assigned_to: "${assigned}", ic: "${icAssigned}", 外構: "${exteriorAssigned}", 不動産: "${realestateAssigned}", currentTab: "${currentTab}")`);
        return false;
      }
    }

    // アーカイブフィルター（通常時は完了済を除外）
    const archiveFilter = document.getElementById('archiveFilter').value;
    const isArchived = p.is_archived || p.status === 'completed';

    // 全担当者共通: アーカイブ済みはアクティブ一覧から除外
    if (archiveFilter === 'active' && isArchived) return false;
    if (archiveFilter === 'archived' && !isArchived) return false;
    const query = document.getElementById('searchQuery').value.toLowerCase();
    if (query && !p.customer.toLowerCase().includes(query) && !(p.memo || '').toLowerCase().includes(query)) return false;

    const specFilter = document.getElementById('specFilter').value;
    if (specFilter && p.specifications !== specFilter) return false;

    // IC進捗フィルター
    const icProgressFilter = document.getElementById('icProgressFilter')?.value || '';
    if (icProgressFilter) {
      const icProgress = calculateICProgress(p);
      if (icProgressFilter === 'no_ic' && p.ic_assignee) return false;
      if (icProgressFilter === 'no_ic' && !p.ic_assignee) return true;
      if (!p.ic_assignee) return false;
      if (icProgressFilter === 'not_started' && icProgress !== 0) return false;
      if (icProgressFilter === 'in_progress' && (icProgress === 0 || icProgress === 100)) return false;
      if (icProgressFilter === 'completed' && icProgress !== 100) return false;
    }

    // IC担当者フィルター
    const icAssigneeFilter = document.getElementById('icAssigneeFilter')?.value || '';
    if (icAssigneeFilter && (p.ic_assignee || '') !== icAssigneeFilter) return false;

    // 外構担当者フィルター
    const exteriorAssigneeFilter = document.getElementById('exteriorAssigneeFilter')?.value || '';
    if (exteriorAssigneeFilter && (p.exterior_assignee || '') !== exteriorAssigneeFilter) return false;

    // 不動産担当者フィルター
    const realestateAssigneeFilter = document.getElementById('realestateAssigneeFilter')?.value || '';
    if (realestateAssigneeFilter && (p.realestate_assignee || '') !== realestateAssigneeFilter) return false;

    // ソースフィルター（kintone連携 / 手動追加・デモ）
    const sourceFilter = document.getElementById('sourceFilter')?.value || '';
    if (sourceFilter === 'kintone' && !p.kintone_record_id) return false;
    if (sourceFilter === 'demo' && p.kintone_record_id) return false;

    return true;
  });

  log('✅ フィルタ後の案件数:', filtered.length);
  log('✅ フィルタ後の案件:', filtered.map(p => ({ customer: p.customer, assigned_to: p.assigned_to })));

  // ソート処理
  const sortOrder = document.getElementById('sortOrder')?.value || 'updated_desc';
  filtered.sort((a, b) => {
    switch (sortOrder) {
      case 'custom':
        // カスタム順序（ドラッグ&ドロップで保存した順序）
        const customOrder = getCustomCardOrder();
        const aIdx = customOrder.indexOf(a.id);
        const bIdx = customOrder.indexOf(b.id);
        // 両方がカスタム順序にある場合
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        // 片方だけカスタム順序にある場合、カスタム順を優先
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        // どちらもカスタム順序にない場合は更新日順
        return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
      case 'updated_desc':
        return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
      case 'updated_asc':
        return new Date(a.updated_at || 0) - new Date(b.updated_at || 0);
      case 'progress_desc':
        return calculateProgress(b) - calculateProgress(a);
      case 'progress_asc':
        return calculateProgress(a) - calculateProgress(b);
      case 'customer_asc':
        return (a.customer || '').localeCompare(b.customer || '', 'ja');
      case 'customer_desc':
        return (b.customer || '').localeCompare(a.customer || '', 'ja');
      case 'created_desc':
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      default:
        return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    }
  });

  if (filtered.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  container.style.display = 'grid';
  emptyState.style.display = 'none';
  container.innerHTML = filtered.map(project => renderProjectCard(project)).join('');

  // カード展開状態を復元
  filtered.forEach(project => restoreCardStates(project.id));

  // カード描画後にタスクと議事録を読み込む（バッチ処理でN+1問題を回避）
  // バッジカウント読み込み（タスク数・議事録数）
  setTimeout(async () => {
    const BATCH_SIZE = 5; // 同時に5件まで
    for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
      const batch = filtered.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(project => loadBadgeCounts(project.id)));
    }
  }, 100);

}


// 案件カードにスクロール
function scrollToProject(projectId) {
  const card = document.querySelector(`[data-project-id="${projectId}"]`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('highlight-card');
    setTimeout(() => card.classList.remove('highlight-card'), 2000);
  }
}

// カード単位で再描画（セクションの開閉状態を保持）
function updateSingleProjectCard(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  const cardElement = document.querySelector(`[data-project-id="${projectId}"]`);
  if (!cardElement) return;

  // セクションの開閉状態を保持
  const sectionStates = [];
  cardElement.querySelectorAll('.card-section').forEach((section, idx) => {
    sectionStates[idx] = !section.classList.contains('collapsed');
  });

  // カードを再描画
  const newCard = document.createElement('div');
  newCard.innerHTML = renderProjectCard(project);
  const newCardElement = newCard.firstElementChild;

  // セクションの開閉状態を復元
  newCardElement.querySelectorAll('.card-section').forEach((section, idx) => {
    if (sectionStates[idx]) {
      section.classList.remove('collapsed');
    }
  });

  cardElement.replaceWith(newCardElement);

  // バッジカウント再ロード
  loadBadgeCounts(projectId);
}

function renderProjectCard(project) {
  const progress = calculateProgress(project);
  const icProgress = calculateICProgress(project);
  const exteriorProgress = calculateExteriorProgress(project);
  const realestateProgress = calculateRealestateProgress(project);
  const constructionProgress = calculateConstructionProgress(project);
  const progressData = project.progress || {};
  const staleDays = getProjectStaleDays(project);
  const tasks = getTasksForAssignee(project.assigned_to);

  // サイドバーで選択中の担当者のカテゴリを取得（IC選択時はIC業務のみ表示等）
  const selectedDesignerCategory = currentDesignerTab && currentDesignerTab !== 'ALL' && currentDesignerTab !== 'ARCHIVED'
    ? designers.find(d => d.name.trim() === currentDesignerTab.trim())?.category || null
    : null;
  // 表示カテゴリ（サイドバー選択優先、なければログインユーザーのカテゴリ）
  const viewCategory = selectedDesignerCategory || currentUserCategory;

  // 全タスク完了チェック
  const canArchive = tasks.every(taskDef => {
    const task = progressData[taskDef.task_key] || { completed: false, state: '' };
    if (!task.completed) return false;
    if (taskDef.has_state && task.state !== '保存済') return false;
    return true;
  });

  // 申請GO条件チェック
  const applicationGoEnabled = canPressApplicationGo(project);


  const tasksHtml = tasks.map(taskDef => {
    const key = taskDef.task_key;
    const task = progressData[key] || { completed: false, date: '', state: '', due_date: '' };
    const isApplicationGo = key === 'application';

    // 申請Goの場合は特別なフルワイド表示
    if (isApplicationGo) {
      if (task.completed) {
        // 既に完了済みの場合
        return `<div class="application-go-container application-go-completed">
          <div class="application-go-icon">✓</div>
          <div class="application-go-text">${taskDef.task_name} 完了</div>
        </div>`;
      } else if (applicationGoEnabled) {
        // 条件が揃っている場合：クリック可能なボタン
        return `<div class="application-go-container application-go-ready" onclick="confirmApplicationGo('${project.id}')">
          <div class="application-go-icon">🚀</div>
          <div class="application-go-text">${taskDef.task_name}</div>
          <div class="application-go-arrow">→</div>
        </div>`;
      } else {
        // 条件が揃っていない場合：無効表示（条件を明示）
        const requiredTasks = getApplicationGoRequiredTasks();
        const conditionsList = requiredTasks.length > 0
          ? requiredTasks.map(r => {
              const currentState = progressData[r.task_key]?.state || '-';
              const isOk = currentState === r.finalState;
              return `<div style="display:flex;align-items:center;gap:4px;font-size:11px;color:${isOk ? '#10b981' : '#ef4444'};">
                <span>${isOk ? '✓' : '✗'}</span>
                <span>${r.task_name.replace(/依頼$/, '')}:</span>
                <span>${currentState}</span>
              </div>`;
            }).join('')
          : '';
        return `<div class="application-go-container application-go-disabled">
          <div class="application-go-icon">🔒</div>
          <div class="application-go-text">${taskDef.task_name}</div>
          <div class="application-go-status">条件未達</div>
          <div class="application-go-conditions" style="margin-top:6px;">${conditionsList}</div>
        </div>`;
      }
    }

    // メールボタン表示条件: タスク設定でメール無効（has_email_button=false）でなければ表示
    // 設計タスクは常に表示（ステータスに関係なく）
    // 太陽光依頼は特別な外部リンクボタンを表示
    const showEmailButton = taskDef.has_email_button !== false;
    let emailBtn = '';
    if (key === 'solar') {
      // 太陽光依頼は外部サイトへのリンクボタン
      emailBtn = `<a href="https://bmp-shop.com/nextsolar/wp/wp-login.php" target="_blank" class="task-email-btn" title="太陽光サイトを開く" style="text-decoration:none;">🔗</a>`;
    } else if (showEmailButton) {
      emailBtn = `<button class="task-email-btn" onclick="openEmailFromTask('${project.id}', '${key}')" title="メール作成">📧</button>`;
    }

    // ステータスカード生成
    const stateOptions = getTaskStateOptions(key);
    const stateCards = generateStatusCards(stateOptions, task.state, project.id, key);

    // 依頼日バッジ
    const requestDateBadge = task.request_date
      ? `<span class="request-date-badge" title="依頼日: ${task.request_date}">${formatDateShort(task.request_date)}</span>`
      : '';

    // kintone日付バッジ（設計タスク: 間取確定・変更契約前会議）
    let kintoneDate = '';
    if (key === 'layout_confirmed' && project.layout_confirmed_date) {
      kintoneDate = `<span class="kintone-date-badge" title="kintone: 間取確定日">${formatDateShort(project.layout_confirmed_date)}</span>`;
    }
    if (key === 'pre_change_meeting' && project.pre_contract_meeting_date) {
      kintoneDate = `<span class="kintone-date-badge" title="kintone: 変更契約前会議">${formatDateShort(project.pre_contract_meeting_date)}</span>`;
    }

    return `<div class="task-item">
      <span class="task-label">${taskDef.task_name}</span>${kintoneDate}${stateCards}${requestDateBadge}${emailBtn}</div>`;
  }).join('');

  // IC業務内容を生成（設計と同じグリッド形式）
  const icTasks = tasksV2.filter(t => t.category === 'IC').sort((a, b) => a.display_order - b.display_order);
  const icTasksHtml = icTasks.map(taskDef => {
    const key = taskDef.task_key;
    const task = progressData[key] || { completed: false, date: '', state: '', due_date: '' };

    const templateId = taskMappings[key] || key;
    const hasVendor = vendors.some(v => v.template_id === templateId);
    const isInternalStatus = INTERNAL_STATUSES.includes(task.state);
    // ICタスクの場合: メーカーが選択されていれば(内部ステータス以外)メールボタンを表示
    const isICMakerTask = IC_MAKER_TASKS.includes(key);
    const isICRequestTask = IC_REQUEST_TASKS.includes(key);
    const hasMakerSelected = isICMakerTask && task.state && !isInternalStatus && task.state !== '-';
    // 依頼系タスク（依頼済/保存済の場合にメールボタン表示）
    const hasRequestStatus = isICRequestTask && task.state && (task.state === '依頼済' || task.state === '保存済');
    // has_email_button: true のICタスクで、ステータスが設定されていればメールボタンを表示
    const showICEmail = taskDef.has_email_button && task.state && task.state !== '-' && task.state !== '無し' && !isInternalStatus;
    const showEmailButton = showICEmail || (taskDef.has_email_button !== false && hasVendor && !isInternalStatus);
    const emailBtn = showEmailButton ?
      `<button class="task-email-btn" onclick="openEmailFromTask('${project.id}', '${key}')" title="${escapeHtml(task.state)}にメール作成">📧</button>` : '';

    // ステータスカード生成
    const stateOptions = getTaskStateOptions(key);
    const stateCards = generateStatusCards(stateOptions, task.state, project.id, key);

    // 依頼日バッジ
    const requestDateBadge = task.request_date
      ? `<span class="request-date-badge" title="依頼日: ${task.request_date}">${formatDateShort(task.request_date)}</span>`
      : '';

    // kintone日付バッジ（変更契約前会議・会議図面渡し）
    let kintoneDate = '';
    if (key === 'ic_pre_change_meeting' && project.pre_contract_meeting_date) {
      kintoneDate = `<span class="kintone-date-badge" title="kintone: 変更契約前会議">${formatDateShort(project.pre_contract_meeting_date)}</span>`;
    }
    if (key === 'ic_meeting_drawing' && project.meeting_drawing_date) {
      kintoneDate = `<span class="kintone-date-badge" title="kintone: 会議図面渡し日">${formatDateShort(project.meeting_drawing_date)}</span>`;
    }

    return `<div class="task-item">
      <span class="task-label">${taskDef.task_name}</span>${kintoneDate}${stateCards}${requestDateBadge}${emailBtn}</div>`;
  }).join('');

  // 外構業務内容を生成
  const exteriorTasksList = getTasksForCategory('外構');
  const exteriorTasksHtml = exteriorTasksList.map(taskDef => {
    const key = taskDef.task_key;
    const task = progressData[key] || { completed: false, date: '', state: '', due_date: '' };

    const templateId = taskMappings[key] || key;
    const hasVendor = vendors.some(v => v.template_id === templateId);
    const isInternalStatus = INTERNAL_STATUSES.includes(task.state);
    const showEmailButton = taskDef.has_email_button !== false && hasVendor && !isInternalStatus;
    const emailBtn = showEmailButton ?
      `<button class="task-email-btn" onclick="openEmailFromTask('${project.id}', '${key}')" title="メール作成">📧</button>` : '';

    // ステータスカード生成
    const stateOptions = getTaskStateOptions(key);
    const stateCards = generateStatusCards(stateOptions, task.state, project.id, key);

    // 依頼日バッジ
    const requestDateBadge = task.request_date
      ? `<span class="request-date-badge" title="依頼日: ${task.request_date}">${formatDateShort(task.request_date)}</span>`
      : '';

    return `<div class="task-item">
      <span class="task-label">${taskDef.task_name}</span>${stateCards}${requestDateBadge}${emailBtn}</div>`;
  }).join('');

  // 不動産業務内容を生成
  const realestateTasksList = getTasksForCategory('不動産');
  const realestateTasksHtml = realestateTasksList.map(taskDef => {
    const key = taskDef.task_key;
    const task = progressData[key] || { completed: false, date: '', state: '', due_date: '' };

    const templateId = taskMappings[key] || key;
    const hasVendor = vendors.some(v => v.template_id === templateId);
    const isInternalStatus = INTERNAL_STATUSES.includes(task.state);
    const showEmailButton = taskDef.has_email_button !== false && hasVendor && !isInternalStatus;
    const emailBtn = showEmailButton ?
      `<button class="task-email-btn" onclick="openEmailFromTask('${project.id}', '${key}')" title="メール作成">📧</button>` : '';

    // ステータスカード生成
    const stateOptions = getTaskStateOptions(key);
    const stateCards = generateStatusCards(stateOptions, task.state, project.id, key);

    // 依頼日バッジ
    const requestDateBadge = task.request_date
      ? `<span class="request-date-badge" title="依頼日: ${task.request_date}">${formatDateShort(task.request_date)}</span>`
      : '';

    return `<div class="task-item">
      <span class="task-label">${taskDef.task_name}</span>${stateCards}${requestDateBadge}${emailBtn}</div>`;
  }).join('');

  // 工事業務内容を生成
  const constructionTasksList = getTasksForCategory('工事');
  const constructionTasksHtml = constructionTasksList.map(taskDef => {
    const key = taskDef.task_key;
    const task = progressData[key] || { completed: false, date: '', state: '', due_date: '' };

    const templateId = taskMappings[key] || key;
    const hasVendor = vendors.some(v => v.template_id === templateId);
    const isInternalStatus = INTERNAL_STATUSES.includes(task.state);
    const showEmailButton = taskDef.has_email_button !== false && hasVendor && !isInternalStatus;
    const emailBtn = showEmailButton ?
      `<button class="task-email-btn" onclick="openEmailFromTask('${project.id}', '${key}')" title="メール作成">📧</button>` : '';

    // ステータスカード生成
    const stateOptions = getTaskStateOptions(key);
    const stateCards = generateStatusCards(stateOptions, task.state, project.id, key);

    // 依頼日バッジ
    const requestDateBadge = task.request_date
      ? `<span class="request-date-badge" title="依頼日: ${task.request_date}">${formatDateShort(task.request_date)}</span>`
      : '';

    return `<div class="task-item">
      <span class="task-label">${taskDef.task_name}</span>${stateCards}${requestDateBadge}${emailBtn}</div>`;
  }).join('');

  const isSelected = BatchOperations.isSelected(project.id);

  // 期限超過チェック
  const deadline = DeadlineManager.getDeadline(project.id);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue = deadline && new Date(deadline) < today && !project.is_archived;
  const isDueSoon = deadline && !isOverdue && (new Date(deadline) - today) <= 3 * 24 * 60 * 60 * 1000 && !project.is_archived;

  // 間取確定日が過ぎているのに「間取確定」が済になっていない場合は赤カード
  let isLayoutOverdue = false;
  if (project.layout_confirmed_date && !project.is_archived) {
    const layoutDate = new Date(project.layout_confirmed_date);
    layoutDate.setHours(0, 0, 0, 0);
    if (layoutDate < today) {
      // 間取確定タスクの状態をチェック
      const layoutTaskState = progressData['layout_confirmed']?.state || '';
      const layoutTaskDef = tasksV2.find(t => t.task_key === 'layout_confirmed');
      if (layoutTaskDef) {
        const isComplete = isTaskStateBlue('layout_confirmed', layoutTaskState, layoutTaskDef.state_options);
        if (!isComplete) {
          isLayoutOverdue = true;
        }
      }
    }
  }

  // 会議図面渡し日が過ぎているのに「会議図面渡し」が済になっていない場合も赤カード
  let isMeetingDrawingOverdue = false;
  if (project.meeting_drawing_date && !project.is_archived) {
    const meetingDate = new Date(project.meeting_drawing_date);
    meetingDate.setHours(0, 0, 0, 0);
    if (meetingDate < today) {
      // 会議図面渡しタスクの状態をチェック
      const meetingTaskState = progressData['ic_meeting_drawing']?.state || '';
      if (meetingTaskState !== '送付済') {
        isMeetingDrawingOverdue = true;
      }
    }
  }

  const isTaskOverdue = isLayoutOverdue || isMeetingDrawingOverdue;

  return `<div class="project-card ${isSelected ? 'selected' : ''} ${isOverdue || isTaskOverdue ? 'overdue' : ''} ${isDueSoon ? 'due-soon' : ''}" data-project-id="${project.id}" draggable="true" ondragstart="handleDragStart(event)" ondragover="handleDragOver(event)" ondrop="handleDrop(event)" ondragend="handleDragEnd(event)">
    <div class="card-header">
      <div style="display: flex; align-items: flex-start; gap: 8px;">
        <input type="checkbox" class="batch-checkbox" data-project-id="${project.id}" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); BatchOperations.toggle('${project.id}')" title="選択">
        <div>
          <div class="card-title"><span class="customer-name">${escapeHtml(project.customer)}</span><span class="badge badge-primary">${escapeHtml(project.specifications || 'LIFE')}</span>${project.is_archived ? '<span class="badge badge-success">完了済み</span>' : ''}${!project.is_archived && staleDays >= 7 ? `<span class="badge badge-warning" title="${staleDays}日間未更新">⚠️ ${staleDays}日</span>` : ''}</div>
          <div class="card-subtitle"><span class="quick-edit-trigger" onclick="event.stopPropagation(); QuickEdit.showAssigneeDropdown('${project.id}', this)" style="cursor: pointer; text-decoration: underline dotted;" title="クリックで担当者変更">設計：${escapeHtml(project.assigned_to || '未割当')}</span>${project.ic_assignee ? `<span class="quick-edit-trigger" onclick="event.stopPropagation(); QuickEdit.showAssigneeDropdown('${project.id}', this, 'ic_assignee')" style="cursor: pointer; text-decoration: underline dotted;" title="クリックでIC担当者変更"> | IC：${escapeHtml(project.ic_assignee)}</span>` : `<span class="quick-edit-trigger" onclick="event.stopPropagation(); QuickEdit.showAssigneeDropdown('${project.id}', this, 'ic_assignee')" style="cursor: pointer; color: var(--text-muted); font-size: 11px;" title="IC担当者を追加"> | +IC</span>`}${project.exterior_assignee ? `<span class="quick-edit-trigger" onclick="event.stopPropagation(); QuickEdit.showAssigneeDropdown('${project.id}', this, 'exterior_assignee')" style="cursor: pointer; text-decoration: underline dotted;" title="クリックで外構担当者変更"> | 外構：${escapeHtml(project.exterior_assignee)}</span>` : `<span class="quick-edit-trigger" onclick="event.stopPropagation(); QuickEdit.showAssigneeDropdown('${project.id}', this, 'exterior_assignee')" style="cursor: pointer; color: var(--text-muted); font-size: 11px;" title="外構担当者を追加"> | +外構</span>`}${project.realestate_assignee ? `<span class="quick-edit-trigger" onclick="event.stopPropagation(); QuickEdit.showAssigneeDropdown('${project.id}', this, 'realestate_assignee')" style="cursor: pointer; text-decoration: underline dotted;" title="クリックで不動産担当者変更"> | 不動産：${escapeHtml(project.realestate_assignee)}</span>` : `<span class="quick-edit-trigger" onclick="event.stopPropagation(); QuickEdit.showAssigneeDropdown('${project.id}', this, 'realestate_assignee')" style="cursor: pointer; color: var(--text-muted); font-size: 11px;" title="不動産担当者を追加"> | +不動産</span>`}${project.construction_assignee ? `<span class="quick-edit-trigger" onclick="event.stopPropagation(); QuickEdit.showAssigneeDropdown('${project.id}', this, 'construction_assignee')" style="cursor: pointer; text-decoration: underline dotted;" title="クリックで工事担当者変更"> | 工事：${escapeHtml(project.construction_assignee)}</span>` : `<span class="quick-edit-trigger" onclick="event.stopPropagation(); QuickEdit.showAssigneeDropdown('${project.id}', this, 'construction_assignee')" style="cursor: pointer; color: var(--text-muted); font-size: 11px;" title="工事担当者を追加"> | +工事</span>`}</div>
          ${(() => {
            const dates = [];
            if (project.layout_confirmed_date) dates.push(`間取確定: ${project.layout_confirmed_date}`);
            if (project.pre_contract_meeting_date) dates.push(`変更契約前会議: ${project.pre_contract_meeting_date}`);
            if (project.construction_permit_date) dates.push(`着工許可: ${project.construction_permit_date}`);
            return dates.length > 0 ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${dates.join(' | ')}</div>` : '';
          })()}
        </div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        ${project.is_archived ? `
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; background: var(--success-color); color: white; padding: 4px 12px; border-radius: 6px; font-size: 13px;">
            <input type="checkbox" checked onchange="restoreFromArchive('${project.id}')" style="width: 16px; height: 16px; cursor: pointer;">
            完了済
          </label>
        ` : `
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; background: #F3F4F6; padding: 4px 12px; border-radius: 6px; font-size: 12px; color: #6B7280; border: 1px solid #E5E7EB;" title="チェックで完了済みに移動">
            <input type="checkbox" onchange="markAsCompleted('${project.id}')" style="width: 14px; height: 14px; cursor: pointer;">
            完了
          </label>
        `}
        <button class="btn btn-ghost btn-small" onclick="showChangeHistory('${project.id}')" title="変更履歴">📜</button>
        <button class="btn btn-ghost btn-small" onclick="editProject('${project.id}')">編集</button>
      </div>
    </div>
    <div class="card-quick-actions">
      <button class="quick-action-btn" onclick="openCardModal('${project.id}', 'tasks')">✅ タスク<span class="section-badge badge-primary" id="taskBadge_${project.id}" style="display:none">0</span></button>
      <button class="quick-action-btn" onclick="openCardModal('${project.id}', 'minutes')">📄 議事録<span class="section-badge badge-primary" id="minutesBadge_${project.id}" style="display:none">0</span></button>
      <button class="quick-action-btn" onclick="openCardModal('${project.id}', 'handover')">📋 引継書<span class="section-badge badge-primary" id="handoverBadge_${project.id}" style="display:none">1</span></button>
    </div>

    ${(() => {
      // 部署別業務内容表示
      // 管理者: 排他的アコーディオン（1つ開くと他が閉じる）
      // 非管理者: 自分の部署のみ、アコーディオンなしで直接表示

      // 各カテゴリの完了・未完了タスク数を計算
      const countTasks = (taskList) => {
        const total = taskList.length;
        const completed = taskList.filter(t => {
          const task = progressData[t.task_key] || {};
          const stateOptions = getTaskStateOptions(t.task_key);
          const lastOption = stateOptions && stateOptions.length > 0 ? stateOptions[stateOptions.length - 1] : null;
          return task.state === lastOption;
        }).length;
        return { completed, total, incomplete: total - completed };
      };

      const designTaskList = tasksV2.filter(t => t.category === '設計').sort((a, b) => a.display_order - b.display_order);
      const designCount = countTasks(designTaskList);
      const icCount = countTasks(icTasks);
      const exteriorCount = countTasks(exteriorTasksList);
      const realestateCount = countTasks(realestateTasksList);
      const constructionCount = countTasks(constructionTasksList);

      // 管理者向け: アコーディオン（初期状態は閉じる、未完了/全タスク数を表示）
      const getBizContent = (title, icon, content, count) => {
        const countBadge = count.total > 0 ? `<span class="biz-task-count ${count.incomplete > 0 ? 'incomplete' : 'complete'}">${count.incomplete}/${count.total}</span>` : '';
        return `<div class="card-section biz-section collapsed"><div class="card-section-header" onclick="toggleBizSection(this, '${project.id}')"><span class="card-section-title">${icon} ${title}${countBadge}</span><span class="card-section-toggle">▼</span></div><div class="card-section-content">${content}</div></div>`;
      };

      // 非管理者向け: シンプルなセクション（アコーディオンあり、初期状態は閉じる、未完了/全タスク数を表示）
      const getSimpleBizContent = (title, icon, content, count) => {
        const countBadge = count.total > 0 ? `<span class="biz-task-count ${count.incomplete > 0 ? 'incomplete' : 'complete'}">${count.incomplete}/${count.total}</span>` : '';
        return `<div class="card-section biz-section collapsed"><div class="card-section-header" onclick="toggleBizSection(this, '${project.id}')"><span class="card-section-title">${icon} ${title}${countBadge}</span><span class="card-section-toggle">▼</span></div><div class="card-section-content">${content}</div></div>`;
      };

      if (viewCategory === 'admin' || !viewCategory) {
        // 管理者/ALL: すべての業務内容を表示（排他的アコーディオン）順序: 不動産→設計→IC→工事→外構
        return `<div class="biz-sections-group">
    ${getBizContent('不動産業務内容', '🏢', realestateTasksList.length > 0 ? `<div class="tasks-grid">${realestateTasksHtml}</div>` : '<p class="empty-task-message">不動産タスクが登録されていません</p>', realestateCount)}
    ${getBizContent('設計業務内容', '📐', `<div class="tasks-grid">${tasksHtml}</div>`, designCount)}
    ${getBizContent('IC業務内容', '🎨', icTasks.length > 0 ? `<div class="tasks-grid">${icTasksHtml}</div>` : '<p class="empty-task-message">ICタスクが登録されていません</p>', icCount)}
    ${getBizContent('工事業務内容', '🔨', constructionTasksList.length > 0 ? `<div class="tasks-grid">${constructionTasksHtml}</div>` : '<p class="empty-task-message">工事タスクが登録されていません</p>', constructionCount)}
    ${getBizContent('外構業務内容', '🏡', exteriorTasksList.length > 0 ? `<div class="tasks-grid">${exteriorTasksHtml}</div>` : '<p class="empty-task-message">外構タスクが登録されていません</p>', exteriorCount)}</div>`;
      } else if (viewCategory === '設計') {
        // 設計担当: 設計業務内容のみ、アコーディオンなし
        return getSimpleBizContent('設計業務内容', '📐', `<div class="tasks-grid">${tasksHtml}</div>`, designCount);
      } else if (viewCategory === 'IC') {
        // IC担当: IC業務内容のみ、アコーディオンなし
        return getSimpleBizContent('IC業務内容', '🎨', icTasks.length > 0 ? `<div class="tasks-grid">${icTasksHtml}</div>` : '<p class="empty-task-message">ICタスクが登録されていません</p>', icCount);
      } else if (viewCategory === '外構') {
        // 外構担当: 外構業務内容のみ、アコーディオンなし
        return getSimpleBizContent('外構業務内容', '🏡', exteriorTasksList.length > 0 ? `<div class="tasks-grid">${exteriorTasksHtml}</div>` : '<p class="empty-task-message">外構タスクが登録されていません</p>', exteriorCount);
      } else if (viewCategory === '不動産') {
        // 不動産担当: 不動産業務内容のみ、アコーディオンなし
        return getSimpleBizContent('不動産業務内容', '🏢', realestateTasksList.length > 0 ? `<div class="tasks-grid">${realestateTasksHtml}</div>` : '<p class="empty-task-message">不動産タスクが登録されていません</p>', realestateCount);
      } else if (viewCategory === '工事') {
        // 工事担当: 工事業務内容のみ、アコーディオンなし
        return getSimpleBizContent('工事業務内容', '🔨', constructionTasksList.length > 0 ? `<div class="tasks-grid">${constructionTasksHtml}</div>` : '<p class="empty-task-message">工事タスクが登録されていません</p>', constructionCount);
      } else {
        return '';
      }
    })()}

    <div class="project-card-footer"><span class="update-time">更新: ${formatDateTime(project.updated_at)}</span></div>
  </div>`;
}

function calculateProgress(project) {
  if (!project) return 0;
  const progressData = project.progress || {};
  const tasks = getTasksForAssignee(project.assigned_to);
  if (tasks.length === 0) return 0;
  const completed = tasks.filter(taskDef => progressData[taskDef.task_key]?.completed).length;
  return Math.round((completed / tasks.length) * 100);
}

// 案件の未更新日数を計算
function getProjectStaleDays(project) {
  if (!project.updated_at) return 0;
  const lastUpdate = new Date(project.updated_at);
  const now = new Date();
  const diffMs = now - lastUpdate;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// IC担当者用の進捗率計算（ICタスクベース）
function calculateICProgress(project) {
  if (!project.ic_assignee) return null;
  const progressData = project.progress || {};
  // ICカテゴリのタスクを取得
  const icTasks = tasksV2.filter(t => t.category === 'IC').sort((a, b) => a.display_order - b.display_order);
  if (icTasks.length === 0) return null;
  const completed = icTasks.filter(taskDef => progressData[taskDef.task_key]?.completed).length;
  return Math.round((completed / icTasks.length) * 100);
}

// 外構担当者用の進捗率計算（外構タスクベース）
function calculateExteriorProgress(project) {
  if (!project.exterior_assignee) return null;
  const progressData = project.progress || {};
  // 外構カテゴリのタスクを取得（Supabase + localStorage統合）
  const extTasks = getTasksForCategory('外構');
  if (extTasks.length === 0) return null;
  const completed = extTasks.filter(taskDef => progressData[taskDef.task_key]?.completed).length;
  return Math.round((completed / extTasks.length) * 100);
}

// 不動産担当者用の進捗率計算（不動産タスクベース）
function calculateRealestateProgress(project) {
  if (!project.realestate_assignee) return null;
  const progressData = project.progress || {};
  // 不動産カテゴリのタスクを取得（Supabase + localStorage統合）
  const realTasks = getTasksForCategory('不動産');
  if (realTasks.length === 0) return null;
  const completed = realTasks.filter(taskDef => progressData[taskDef.task_key]?.completed).length;
  return Math.round((completed / realTasks.length) * 100);
}

// 工事担当者用の進捗率計算（工事タスクベース）
function calculateConstructionProgress(project) {
  if (!project.construction_assignee) return null;
  const progressData = project.progress || {};
  // 工事カテゴリのタスクを取得（Supabase + localStorage統合）
  const constTasks = getTasksForCategory('工事');
  if (constTasks.length === 0) return null;
  const completed = constTasks.filter(taskDef => progressData[taskDef.task_key]?.completed).length;
  return Math.round((completed / constTasks.length) * 100);
}

// 全タスク完了チェックと自動アーカイブ
async function checkAndAutoArchive(project) {
  if (project.is_archived) return; // 既にアーカイブ済みならスキップ

  const progressData = project.progress || {};
  let allCompleted = true;
  let hasAnyAssignee = false;

  // 設計担当のタスクチェック
  if (project.assigned_to) {
    hasAnyAssignee = true;
    const designTasks = tasksV2.filter(t => t.category === '設計');
    if (designTasks.length > 0) {
      const designCompleted = designTasks.every(t => progressData[t.task_key]?.completed);
      if (!designCompleted) allCompleted = false;
    }
  }

  // IC担当のタスクチェック
  if (project.ic_assignee) {
    hasAnyAssignee = true;
    const icTasks = tasksV2.filter(t => t.category === 'IC');
    if (icTasks.length > 0) {
      const icCompleted = icTasks.every(t => progressData[t.task_key]?.completed);
      if (!icCompleted) allCompleted = false;
    }
  }

  // 外構担当のタスクチェック
  if (project.exterior_assignee) {
    hasAnyAssignee = true;
    const extTasks = getTasksForCategory('外構');
    if (extTasks.length > 0) {
      const extCompleted = extTasks.every(t => progressData[t.task_key]?.completed);
      if (!extCompleted) allCompleted = false;
    }
  }

  // 不動産担当のタスクチェック
  if (project.realestate_assignee) {
    hasAnyAssignee = true;
    const reTasks = getTasksForCategory('不動産');
    if (reTasks.length > 0) {
      const reCompleted = reTasks.every(t => progressData[t.task_key]?.completed);
      if (!reCompleted) allCompleted = false;
    }
  }

  // 工事担当のタスクチェック
  if (project.construction_assignee) {
    hasAnyAssignee = true;
    const conTasks = getTasksForCategory('工事');
    if (conTasks.length > 0) {
      const conCompleted = conTasks.every(t => progressData[t.task_key]?.completed);
      if (!conCompleted) allCompleted = false;
    }
  }

  // 担当者が設定されていて全タスク完了なら自動アーカイブ
  if (hasAnyAssignee && allCompleted) {
    // 確認ダイアログを表示
    const confirmed = await showConfirmDialog(
      '全タスク完了',
      `「${project.customer}」の全タスクが完了しました。\n案件を完了済みに移動しますか？`
    );

    if (confirmed) {
      const { error } = await supabase
        .from('projects')
        .update({ is_archived: true, updated_at: new Date().toISOString() })
        .eq('id', project.id);

      if (!error) {
        project.is_archived = true;
        showToast(`「${project.customer}」を完了済みに移動しました`, 'success');
        renderProjects();
        renderSidebar();
      }
    }
  }
}

// 確認ダイアログ（Promise版）
function showConfirmDialog(title, message) {
  return new Promise((resolve) => {
    const result = confirm(`${title}\n\n${message}`);
    resolve(result);
  });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function updateTaskStatus(projectId, taskKey, completed) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  // Undo用に変更前の状態を保存
  const oldProgress = JSON.parse(JSON.stringify(project.progress || {}));

  const progressData = project.progress || {};
  if (!progressData[taskKey]) progressData[taskKey] = {};
  progressData[taskKey].completed = completed;
  if (completed && !progressData[taskKey].date) {
    progressData[taskKey].date = new Date().toISOString().split('T')[0];
  }

  showStatus('保存中...', 'saving');
  const { error } = await supabase
    .from('projects')
    .update({ progress: progressData, updated_at: new Date().toISOString() })
    .eq('id', projectId);

  if (error) {
    showStatus('エラー', 'error');
    showToast('保存に失敗しました: ' + error.message, 'error');
    return;
  }

  // Undo記録
  const taskDef = tasksV2.find(t => t.task_key === taskKey);
  UndoManager.record({
    type: 'UPDATE_PROJECT',
    projectId: projectId,
    description: `${project.customer} - ${taskDef?.task_name || taskKey}を${completed ? '完了' : '未完了'}に変更`,
    oldValue: { progress: oldProgress },
    newValue: { progress: progressData }
  });

  project.progress = progressData;
  project.updated_at = new Date().toISOString();
  markLocalUpdate(projectId); // リアルタイム同期の二重更新防止
  renderProjects();
  showStatus('保存済み', 'saved');
}

// タスク期限のステータス判定
function getTaskDueStatus(dueDate, completed) {
  if (!dueDate || completed) {
    return { class: '', badgeClass: 'normal', label: '' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { class: 'overdue', badgeClass: 'overdue', label: `${Math.abs(diffDays)}日遅延` };
  } else if (diffDays === 0) {
    return { class: 'due-soon', badgeClass: 'overdue', label: '本日期限' };
  } else if (diffDays <= 3) {
    return { class: 'due-soon', badgeClass: 'due-soon', label: `あと${diffDays}日` };
  } else {
    const m = due.getMonth() + 1;
    const d = due.getDate();
    return { class: '', badgeClass: 'normal', label: `${m}/${d}` };
  }
}

// タスク期限の更新
async function updateTaskDueDate(projectId, taskKey, dueDate) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  // 過去日付チェック（警告のみ、保存は許可）
  if (dueDate && !Validators.isNotPastDate(dueDate)) {
    const confirmPast = confirm('過去の日付が設定されています。この日付で保存しますか？');
    if (!confirmPast) {
      renderProjects();
      return;
    }
  }

  // Undo用に変更前の状態を保存
  const oldProgress = JSON.parse(JSON.stringify(project.progress || {}));
  const oldDueDate = oldProgress[taskKey]?.due_date || '';

  // 既存のprogressデータを完全にコピーして新しいオブジェクトを作成
  const progressData = JSON.parse(JSON.stringify(project.progress || {}));
  // 既存のタスクデータを保持しながらdue_dateのみ更新
  if (!progressData[taskKey]) {
    progressData[taskKey] = { completed: false, date: '', state: '', due_date: '' };
  }
  progressData[taskKey].due_date = dueDate;

  showStatus('保存中...', 'saving');
  const { error } = await supabase
    .from('projects')
    .update({ progress: progressData, updated_at: new Date().toISOString() })
    .eq('id', projectId);

  if (error) {
    showStatus('エラー', 'error');
    ErrorHandler.handle(error, '期限保存');
    return;
  }

  // Undo記録
  const taskDef = tasksV2.find(t => t.task_key === taskKey);
  UndoManager.record({
    type: 'UPDATE_PROJECT',
    projectId: projectId,
    description: `${project.customer} - ${taskDef?.task_name || taskKey}の期限を${dueDate || '解除'}に変更`,
    oldValue: { progress: oldProgress },
    newValue: { progress: progressData }
  });

  project.progress = progressData;
  project.updated_at = new Date().toISOString();
  markLocalUpdate(projectId); // リアルタイム同期の二重更新防止
  renderProjects();
  showStatus('保存済み', 'saved');
  if (dueDate) {
    showToast('期限を設定しました', 'success');
  }
}

// タスクメモの更新（その他見積依頼など）
async function updateTaskMemo(projectId, taskKey, memo) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  // 既存のprogressデータを完全にコピーして新しいオブジェクトを作成
  const progressData = JSON.parse(JSON.stringify(project.progress || {}));
  // 既存のタスクデータを保持しながらmemoのみ更新
  if (!progressData[taskKey]) {
    progressData[taskKey] = { completed: false, date: '', state: '', due_date: '', memo: '' };
  }
  progressData[taskKey].memo = memo;

  showStatus('保存中...', 'saving');
  const { error } = await supabase
    .from('projects')
    .update({ progress: progressData, updated_at: new Date().toISOString() })
    .eq('id', projectId);

  if (error) {
    showStatus('エラー', 'error');
    ErrorHandler.handle(error, 'メモ保存');
    return;
  }

  project.progress = progressData;
  project.updated_at = new Date().toISOString();
  markLocalUpdate(projectId); // リアルタイム同期の二重更新防止
  showStatus('保存済み', 'saved');
}

// ステータス色分けのクラスを取得
// taskKey: オプション。ICタスクの特別な色分けに使用
function getStateColorClass(state, lastOption, taskKey = '') {
  // 空、-、null → 色なし（白）
  if (!state || state === '-' || state === '') {
    return '';
  }

  // メーカー選択タスク（キッチン・お風呂・洗面・トイレ・照明）: メーカー選択で青色
  if (IC_MAKER_SELECT_TASKS.includes(taskKey)) {
    return 'state-blue';
  }

  // 依頼系タスク（アイアンプレゼン・タイルプレゼン・外構・カーテン・造作・家具）:
  // 「無し」「保存済」は青色、「依頼済」は黄色
  if (IC_REQUEST_TASKS.includes(taskKey)) {
    if (state === '無' || state === '無し' || state === '保存済') {
      return 'state-blue';
    }
    if (state === '依頼済') {
      return 'state-yellow';
    }
  }

  // アイアン依頼・その他見積依頼: 「無し」「保存済」は青色、「依頼済」は黄色
  if (taskKey === 'ic_iron' || taskKey === 'ic_other_estimate') {
    if (state === '無' || state === '無し' || state === '保存済') {
      return 'state-blue';
    }
    if (state === '依頼済') {
      return 'state-yellow';
    }
  }

  // 「無し」「無」は常に青色（完了扱い）
  if (state === '無し' || state === '無') {
    return 'state-blue';
  }

  // 最後の選択肢（完了状態）→ 青
  if (state === lastOption) {
    return 'state-blue';
  }
  // その他（進行中）→ 黄
  return 'state-yellow';
}

// ステータスカード選択のHTML生成
function generateStatusCards(stateOptions, currentState, projectId, taskKey) {
  if (!stateOptions || !Array.isArray(stateOptions)) return '';
  const lastOption = stateOptions[stateOptions.length - 1];
  const isMultiSelect = IC_MULTI_SELECT_TASKS.includes(taskKey);

  // 複数選択の場合、currentStateはカンマ区切りの可能性がある
  const selectedStates = isMultiSelect && currentState ? currentState.split(',').map(s => s.trim()) : [currentState];

  return `<div class="status-cards${isMultiSelect ? ' multi-select' : ''}" data-project-id="${projectId}" data-task-key="${taskKey}" data-last-option="${lastOption}" data-multi-select="${isMultiSelect}">${stateOptions.map(state => {
    const isActive = selectedStates.includes(state);
    const stateClass = isActive ? getStateColorClass(state, lastOption, taskKey) : '';
    const displayText = state || '-';
    return `<span class="status-card${isActive ? ' active' : ''}${stateClass ? ' ' + stateClass : ''}" data-value="${escapeHtml(state)}" onclick="selectStatusCard(this, '${escapeHtml(projectId)}', '${escapeHtml(taskKey)}')">${escapeHtml(displayText)}</span>`;
  }).join('')}</div>`;
}

// ステータスカードクリック処理
function selectStatusCard(cardEl, projectId, taskKey) {
  const container = cardEl.closest('.status-cards');
  const lastOption = container.dataset.lastOption || '';
  const clickedState = cardEl.dataset.value;
  const isMultiSelect = container.dataset.multiSelect === 'true';

  let finalState;

  if (isMultiSelect) {
    // 複数選択モード
    const isCurrentlyActive = cardEl.classList.contains('active');

    if (clickedState === '-' || clickedState === '無し') {
      // 「-」または「無し」をクリックした場合は他の選択を全解除（単独選択）
      container.querySelectorAll('.status-card').forEach(c => {
        c.classList.remove('active', 'state-blue', 'state-yellow', 'state-red');
      });
      cardEl.classList.add('active');
      if (clickedState === '無し') {
        cardEl.classList.add('state-blue'); // 「無し」は青色
      }
      finalState = clickedState;
    } else {
      // メーカーをクリック
      // 「-」と「無し」の選択を解除
      container.querySelector('.status-card[data-value="-"]')?.classList.remove('active');
      container.querySelector('.status-card[data-value="無し"]')?.classList.remove('active', 'state-blue');

      if (isCurrentlyActive) {
        // 既に選択されていたらトグルで解除
        cardEl.classList.remove('active', 'state-blue', 'state-yellow', 'state-red');
      } else {
        // 選択を追加
        cardEl.classList.add('active');
        const stateClass = getStateColorClass(clickedState, lastOption, taskKey);
        if (stateClass) cardEl.classList.add(stateClass);
      }

      // 現在選択されているものを収集
      const selectedCards = container.querySelectorAll('.status-card.active');
      const selectedStates = Array.from(selectedCards)
        .map(c => c.dataset.value)
        .filter(v => v && v !== '-');

      finalState = selectedStates.length > 0 ? selectedStates.join(',') : '-';

      // 何も選択されていなければ「-」を選択
      if (finalState === '-') {
        container.querySelector('.status-card[data-value="-"]')?.classList.add('active');
      }
    }
  } else {
    // 単一選択モード
    const isCurrentlyActive = cardEl.classList.contains('active');

    // 全ての選択を解除
    container.querySelectorAll('.status-card').forEach(c => {
      c.classList.remove('active', 'state-blue', 'state-yellow', 'state-red');
    });

    if (isCurrentlyActive && clickedState !== '-') {
      // 既に選択されていたらトグルで解除 → 「-」に戻す
      const dashCard = container.querySelector('.status-card[data-value="-"]');
      if (dashCard) {
        dashCard.classList.add('active');
      }
      finalState = '-';
    } else {
      // 選択を追加
      cardEl.classList.add('active');
      const stateClass = getStateColorClass(clickedState, lastOption, taskKey);
      if (stateClass) cardEl.classList.add(stateClass);
      finalState = clickedState;
    }
  }

  // メールボタンの表示/非表示を更新（設計タスクは常に表示）
  const taskItem = cardEl.closest('.task-item');
  const taskDef = tasksV2.find(t => t.task_key === taskKey);
  const isDesignTask = taskDef?.category === '設計';
  const isInternalStatus = !finalState || finalState === '-' || INTERNAL_STATUSES.some(s => finalState.includes(s));
  if (taskItem && !isDesignTask) {
    const emailBtn = taskItem.querySelector('.task-email-btn');
    if (emailBtn) {
      emailBtn.style.display = isInternalStatus ? 'none' : '';
    }
  }

  // ICメーカータスクのツールチップ更新
  if (IC_MAKER_TASKS.includes(taskKey) && finalState && finalState !== '-') {
    if (!isInternalStatus) {
      cardEl.title = `📧 ${finalState}にメール送信可能`;
    } else {
      cardEl.removeAttribute('title');
    }
  }

  // 進捗データを保存
  updateTaskState(projectId, taskKey, finalState);

  // 設計またはICタスクの場合、全て完了したらアーカイブチェック
  const isDesignOrICTask = taskDef?.category === '設計' || taskDef?.category === 'IC';
  if (isDesignOrICTask) {
    setTimeout(() => checkAllTasksCompletionForArchive(projectId), 500);
  }
}

// 新旧タスクキーのマッピング（旧キーから新キーへ、または新キーに対応する旧キー群）
const TASK_KEY_MAPPING = {
  // 新キー → 旧キー群（フォールバック用）
  'ic_washroom': ['ic_washroom_1f', 'ic_washroom_2f'],
  'ic_toilet': ['ic_toilet_1f', 'ic_toilet_2f']
};

// progressDataからタスク状態を取得（新旧キー両方をチェック）
function getTaskStateFromProgress(progressData, taskKey) {
  // まず直接のキーをチェック
  if (progressData[taskKey]?.state) {
    return progressData[taskKey].state;
  }
  // 旧キーのフォールバック
  const oldKeys = TASK_KEY_MAPPING[taskKey];
  if (oldKeys) {
    for (const oldKey of oldKeys) {
      if (progressData[oldKey]?.state && progressData[oldKey].state !== '-') {
        return progressData[oldKey].state;
      }
    }
  }
  return '';
}

// 全タスク完了チェック＆アーカイブ確認（設計+IC全て青色になったら完了）
async function checkAllTasksCompletionForArchive(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project || project.is_archived) return;

  const progressData = project.progress || {};

  // 1. 設計タスクの完了チェック（青色=完了）
  const designTasks = tasksV2.filter(t => t.category === '設計' && t.has_state && t.task_key !== 'application');
  let allDesignComplete = true;
  let incompleteDesignTasks = [];

  for (const task of designTasks) {
    const taskState = getTaskStateFromProgress(progressData, task.task_key);
    let isComplete = isTaskStateBlue(task.task_key, taskState, task.state_options);
    if (!isComplete) {
      allDesignComplete = false;
      incompleteDesignTasks.push(task.task_name);
    }
  }

  log('📋 設計完了チェック:', { allDesignComplete, incompleteDesignTasks, designTasksCount: designTasks.length });

  if (!allDesignComplete) {
    return; // 設計タスクが未完了なら終了
  }

  // 2. IC担当案件の場合はICタスクもチェック（has_stateがtrueのタスクのみ）
  if (project.layout_confirmed_date) {
    const icTasks = tasksV2.filter(t => t.category === 'IC' && t.has_state);
    let allICComplete = true;
    let incompleteICTasks = [];

    for (const task of icTasks) {
      const taskState = getTaskStateFromProgress(progressData, task.task_key);
      let isComplete = isTaskStateBlue(task.task_key, taskState, task.state_options);
      if (!isComplete) {
        allICComplete = false;
        incompleteICTasks.push(task.task_name);
      }
    }

    log('📋 IC完了チェック:', { allICComplete, incompleteICTasks, icTasksCount: icTasks.length });

    if (!allICComplete) {
      return; // ICタスクが未完了なら終了
    }
  }

  // 全タスク完了 → 派手な完了モーダルを表示
  showCompletionCelebration(project);
}

// タスクの状態が青色（完了）かどうか判定
function isTaskStateBlue(taskKey, taskState, stateOptions) {
  // 未入力（-や空）は未完了
  if (!taskState || taskState === '-' || taskState === '') {
    return false;
  }

  // 申請GOは控えめに（完了済でも黄色のまま、青色にしない）
  if (taskKey === 'application') {
    return false;
  }

  // 水廻りタスク（複数選択可能）：「-」以外が選択されていれば完了（青色）
  if (IC_MULTI_SELECT_TASKS.includes(taskKey)) {
    // カンマ区切りの複数選択も対応
    const selectedStates = taskState.split(',').map(s => s.trim()).filter(s => s && s !== '-');
    return selectedStates.length > 0;
  }

  // メーカー選択タスク（照明プラン）：「-」以外が選択されていれば完了
  if (IC_MAKER_SELECT_TASKS.includes(taskKey)) {
    return taskState !== '-' && taskState !== '';
  }

  // 依頼系タスク（タイルプレゼン・外構・カーテン・造作・家具等）：
  // 「無し」「保存済」が青色=完了
  if (IC_REQUEST_TASKS.includes(taskKey)) {
    return taskState === '無し' || taskState === '無' || taskState === '保存済';
  }

  // その他のタスク：最終状態 or 「無し」で完了
  let options = stateOptions;
  if (typeof options === 'string') {
    try { options = JSON.parse(options); } catch (e) { options = []; }
  }
  if (Array.isArray(options) && options.length > 0) {
    const lastOption = options[options.length - 1];
    return taskState === lastOption || taskState === '無' || taskState === '無し';
  }

  return false;
}

// 🎊 派手な完了祝福モーダル表示
function showCompletionCelebration(project) {
  // 既存のモーダルがあれば削除
  const existingModal = document.getElementById('completionCelebrationModal');
  if (existingModal) existingModal.remove();

  // 紙吹雪を生成
  const confettiColors = ['#f94144', '#f3722c', '#f8961e', '#f9c74f', '#90be6d', '#43aa8b', '#577590', '#277da1', '#ff006e', '#8338ec'];
  let confettiHtml = '';
  for (let i = 0; i < 100; i++) {
    const color = confettiColors[Math.floor(Math.random() * confettiColors.length)];
    const left = Math.random() * 100;
    const delay = Math.random() * 3;
    const duration = 3 + Math.random() * 2;
    const size = 8 + Math.random() * 8;
    confettiHtml += `<div class="confetti" style="left:${left}%;background:${color};animation-delay:${delay}s;animation-duration:${duration}s;width:${size}px;height:${size}px;"></div>`;
  }

  const modal = document.createElement('div');
  modal.id = 'completionCelebrationModal';
  modal.className = 'celebration-modal';
  modal.innerHTML = `
    <div class="celebration-confetti">${confettiHtml}</div>
    <div class="celebration-content">
      <div class="celebration-fireworks">
        <span>🎆</span><span>🎇</span><span>🎆</span>
      </div>
      <div class="celebration-icon">🎉</div>
      <h2 class="celebration-title">おめでとうございます！</h2>
      <p class="celebration-subtitle">全てのタスクが完了しました！</p>
      <div class="celebration-project">
        <span class="celebration-customer">${escapeHtml(project.customer)}</span>
        <span class="celebration-specs">${escapeHtml(project.specifications || 'LIFE')}</span>
      </div>
      <p class="celebration-message">
        素晴らしいお仕事でした！<br>
        お疲れ様でした！🌟
      </p>
      <div class="celebration-buttons">
        <button class="btn btn-ghost celebration-btn-later" onclick="closeCompletionCelebration()">
          あとで移動する
        </button>
        <button class="btn celebration-btn-complete" onclick="completeAndArchive('${project.id}')">
          🏆 完了済みに移動する
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // アニメーションのためのクラス追加
  requestAnimationFrame(() => {
    modal.classList.add('show');
  });

  // 効果音的なバイブレーション（対応デバイスのみ）
  if (navigator.vibrate) {
    navigator.vibrate([100, 50, 100, 50, 200]);
  }
}

// 完了祝福モーダルを閉じる
function closeCompletionCelebration() {
  const modal = document.getElementById('completionCelebrationModal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 300);
  }
}

// 完了処理してアーカイブ
async function completeAndArchive(projectId) {
  closeCompletionCelebration();
  await archiveProjectDirect(projectId);
  showToast('🎊 案件を完了済みに移動しました！お疲れ様でした！', 'success', 5000);
}

// 直接アーカイブ実行（確認なし）
async function archiveProjectDirect(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  showStatus('更新中...', 'saving');

  const updateData = {
    is_archived: true,
    archived_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('projects')
    .update(updateData)
    .eq('id', projectId);

  if (error) {
    showStatus('エラー', 'error');
    showToast('更新に失敗しました: ' + error.message, 'error');
    return;
  }

  // ローカルデータを更新
  project.is_archived = true;
  project.archived_at = updateData.archived_at;
  markLocalUpdate(projectId); // リアルタイム同期の二重更新防止

  renderProjects();
  renderSidebar();
  showStatus('保存済み', 'saved');
  showToast('✅ 完了済み案件に移動しました', 'success');
}

// ステータス変更時に色も更新
function updateTaskStateWithColor(selectEl, projectId, taskKey) {
  const state = selectEl.value;
  const lastOption = selectEl.dataset.lastOption || '';

  // CSSクラスを更新
  selectEl.classList.remove('state-blue', 'state-yellow');
  const newClass = getStateColorClass(state, lastOption, taskKey);
  if (newClass) {
    selectEl.classList.add(newClass);
  }

  // メールボタンの表示/非表示を動的に更新
  const taskItem = selectEl.closest('.task-item');
  const isInternalStatus = INTERNAL_STATUSES.includes(state);
  if (taskItem) {
    const emailBtn = taskItem.querySelector('.task-email-btn');
    if (emailBtn) {
      emailBtn.style.display = isInternalStatus ? 'none' : '';
    }
  }

  // ツールチップを更新（メーカー選択タスク）
  if (IC_MAKER_TASKS.includes(taskKey)) {
    if (state && !isInternalStatus) {
      selectEl.title = `📧 ${state}にメール送信可能`;
    } else {
      selectEl.removeAttribute('title');
    }
  }

  // データを保存
  updateTaskState(projectId, taskKey, state);
}

async function updateTaskState(projectId, taskKey, state) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  // Undo用に変更前の状態を保存
  const oldProgress = JSON.parse(JSON.stringify(project.progress || {}));
  const oldState = oldProgress[taskKey]?.state || '';

  const progressData = project.progress || {};
  if (!progressData[taskKey]) progressData[taskKey] = {};
  progressData[taskKey].state = state;

  // 依頼日の記録（「依頼」を含むステータスに変更された時点で記録）
  if (state && state.includes('依頼') && !progressData[taskKey].request_date) {
    progressData[taskKey].request_date = new Date().toISOString().split('T')[0];
  }
  // ステータスが「-」に戻されたら依頼日をクリア
  if (state === '-' || state === '') {
    progressData[taskKey].request_date = null;
  }

  // ステータスが最終状態になったらcompletedをtrueにする
  const taskDef = tasksV2.find(t => t.task_key === taskKey);
  if (taskDef && taskDef.state_options) {
    try {
      const options = typeof taskDef.state_options === 'string'
        ? JSON.parse(taskDef.state_options)
        : taskDef.state_options;
      const lastOption = options[options.length - 1];
      progressData[taskKey].completed = (state === lastOption);
    } catch (e) {
      console.warn('ステータスオプションのパースに失敗:', e);
    }
  }

  // 申請Goが完了済みの場合、条件を再チェック
  let applicationGoCleared = false;
  if (progressData['application']?.completed) {
    // 一時的にprogressを更新して条件チェック
    const tempProject = { ...project, progress: progressData };
    if (!canPressApplicationGo(tempProject)) {
      // 条件から外れたので申請Goをクリア
      progressData['application'].completed = false;
      progressData['application'].date = null;
      applicationGoCleared = true;
    }
  }

  showStatus('保存中...', 'saving');

  // 申請Goがクリアされた場合、is_archivedもfalseに戻す
  const updateData = {
    progress: progressData,
    updated_at: new Date().toISOString()
  };
  if (applicationGoCleared) {
    updateData.is_archived = false;
  }

  const { error } = await supabase
    .from('projects')
    .update(updateData)
    .eq('id', projectId);

  if (error) {
    showStatus('エラー', 'error');
    showToast('保存に失敗しました: ' + error.message, 'error');
    return;
  }

  // Undo記録
  UndoManager.record({
    type: 'UPDATE_PROJECT',
    projectId: projectId,
    description: `${project.customer} - ${taskDef?.task_name || taskKey}を「${state || '未設定'}」に変更`,
    oldValue: { progress: oldProgress },
    newValue: { progress: progressData }
  });

  // 変更履歴を保存（7日間保持）
  if (oldState !== state) {
    saveChangeHistory(
      projectId,
      'task_update',
      taskDef?.task_name || taskKey,
      oldState || '-',
      state || '-',
      `${project.customer}: ${taskDef?.task_name || taskKey}`
    );
  }

  project.progress = progressData;
  project.updated_at = new Date().toISOString();

  // 全タスク完了チェック（設定されている担当者のタスクがすべて完了したら自動アーカイブ）
  checkAndAutoArchive(project);

  // 申請GOの状態が変わる可能性があるため、常にUIを更新
  // 該当の案件カードのみを更新（パフォーマンス最適化）
  const projectCard = document.querySelector(`.project-card[data-project-id="${projectId}"]`);
  if (projectCard) {
    const applicationGoEnabled = canPressApplicationGo(project);
    const applicationGoContainer = projectCard.querySelector('.application-go-container');
    if (applicationGoContainer) {
      const taskDef = tasksV2.find(t => t.task_key === 'application');
      const applicationGoData = progressData['application'] || {};

      if (applicationGoData.completed) {
        // 完了済み
        applicationGoContainer.outerHTML = `<div class="application-go-container application-go-completed">
          <div class="application-go-icon">✓</div>
          <div class="application-go-text">${taskDef?.task_name || '申請GO'} 完了</div>
        </div>`;
      } else if (applicationGoEnabled) {
        // 条件が揃っている：クリック可能
        applicationGoContainer.outerHTML = `<div class="application-go-container application-go-ready" onclick="confirmApplicationGo('${projectId}')">
          <div class="application-go-icon">🚀</div>
          <div class="application-go-text">${taskDef?.task_name || '申請GO'}</div>
          <div class="application-go-arrow">→</div>
        </div>`;
      } else {
        // 条件未達（条件を明示）
        const requiredTasks = getApplicationGoRequiredTasks();
        const conditionsList = requiredTasks.length > 0
          ? requiredTasks.map(r => {
              const currentState = progressData[r.task_key]?.state || '-';
              const isOk = currentState === r.finalState;
              return `<div style="display:flex;align-items:center;gap:4px;font-size:11px;color:${isOk ? '#10b981' : '#ef4444'};">
                <span>${isOk ? '✓' : '✗'}</span>
                <span>${r.task_name.replace(/依頼$/, '')}:</span>
                <span>${currentState}</span>
              </div>`;
            }).join('')
          : '';
        applicationGoContainer.outerHTML = `<div class="application-go-container application-go-disabled">
          <div class="application-go-icon">🔒</div>
          <div class="application-go-text">${taskDef?.task_name || '申請GO'}</div>
          <div class="application-go-status">条件未達</div>
          <div class="application-go-conditions" style="margin-top:6px;">${conditionsList}</div>
        </div>`;
      }
    }
  }

  if (applicationGoCleared) {
    project.is_archived = false;
    renderProjects();
    renderSidebar();
    showToast('申請Go条件から外れたため、完了状態を解除しました', 'warning');
  }
  showStatus('保存済み', 'saved');
}

function openProjectModal(projectId = null) {
  log('📝 openProjectModal() 呼び出し:', projectId);
  log('👥 designers配列:', designers);

  editingProjectId = projectId;
  const modal = document.getElementById('projectModal');
  const title = document.getElementById('projectModalTitle');

  log('🎯 modal要素:', modal);
  log('🎯 title要素:', title);

  let project = null;
  if (projectId) {
    project = projects.find(p => p.id === projectId);
    if (!project) {
      showToast('案件が見つかりません', 'error');
      return;
    }
    title.textContent = '案件編集';
    document.getElementById('projectCustomer').value = project.customer;
    document.getElementById('projectSpecifications').value = project.specifications || 'LIFE';
  } else {
    title.textContent = '案件追加';
    document.getElementById('projectCustomer').value = '';
    document.getElementById('projectSpecifications').value = 'LIFE';
  }

  // 設計担当者（設計カテゴリのみ）を埋める
  log('🔧 設計担当者をフィルタリング中...');
  const sekkeiDesigners = designers.filter(d => d.category === '設計');
  log('✅ 設計担当者:', sekkeiDesigners);

  const assignedToSelect = document.getElementById('projectAssignedTo');
  log('🎯 assignedToSelect要素:', assignedToSelect);

  if (assignedToSelect) {
    assignedToSelect.innerHTML = '<option value="">選択してください</option>' +
      sekkeiDesigners.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');

    // 値を設定（innerHTML後に実行）
    if (projectId && project) {
      // 編集時: 既存の担当者を選択
      assignedToSelect.value = project.assigned_to;
    } else if (currentDesignerTab !== 'ALL' && currentDesignerTab !== 'ARCHIVED') {
      // 新規案件の場合、現在選択中のタブの担当者を自動選択
      const currentDesigner = sekkeiDesigners.find(d => d.name === currentDesignerTab);
      if (currentDesigner) {
        assignedToSelect.value = currentDesigner.name;
      }
    } else {
      // 「全案件」タブの場合、最後に使用した担当者を自動選択
      const lastAssignee = localStorage.getItem('archideck_last_assignee');
      if (lastAssignee && sekkeiDesigners.find(d => d.name === lastAssignee)) {
        assignedToSelect.value = lastAssignee;
      }
    }
  }

  // IC担当者（ICカテゴリのみ）を埋める
  log('🔧 IC担当者をフィルタリング中...');
  const icDesigners = designers.filter(d => d.category === 'IC');
  log('✅ IC担当者:', icDesigners);

  const icAssigneeSelect = document.getElementById('projectIcAssignee');
  log('🎯 icAssigneeSelect要素:', icAssigneeSelect);

  if (icAssigneeSelect) {
    icAssigneeSelect.innerHTML = '<option value="">未定</option>' +
      icDesigners.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');

    // 値を設定（innerHTML後に実行）
    if (projectId && project) {
      // 編集時: 既存のIC担当者を選択
      icAssigneeSelect.value = project.ic_assignee || '';
    }
  }

  // テンプレートボタンの表示制御（編集時のみ表示）
  const templateButtons = document.getElementById('templateButtons');
  if (templateButtons) {
    templateButtons.style.display = projectId ? 'block' : 'none';
  }

  log('🎬 モーダルを表示します...');
  ModalManager.open(modal, '#projectCustomer');
  log('✅ openProjectModal() 完了');
}

function closeProjectModal() {
  ModalManager.close(document.getElementById('projectModal'));
  editingProjectId = null;
}

async function saveProject() {
  // 二重クリック防止
  if (SaveGuard.isLocked('saveProject')) {
    return;
  }

  const customer = document.getElementById('projectCustomer')?.value?.trim() || '';
  const assignedTo = document.getElementById('projectAssignedTo')?.value?.trim() || '';
  const icAssignee = document.getElementById('projectIcAssignee')?.value?.trim() || '';
  const specifications = document.getElementById('projectSpecifications')?.value || '';

  log('💾 saveProject開始:', { customer, assignedTo, icAssignee, specifications });

  if (!customer || !assignedTo) {
    showToast('お客様名と設計担当は必須です', 'error');
    return;
  }

  await SaveGuard.run('saveProject', async () => {
    showStatus('保存中...', 'saving');

    // 設計担当のIDを取得
    const designer = designers.find(d => d.name.trim() === assignedTo);
    const designerId = designer ? designer.id : null;

    // IC担当者のIDを取得（空文字列の場合はnull）
    const icDesigner = icAssignee ? designers.find(d => d.name.trim() === icAssignee) : null;
    const icDesignerId = icDesigner ? icDesigner.id : null;

    const blankProgress = {};
    tasksV2.forEach(task => {
      blankProgress[task.task_key] = { completed: false, date: '', state: '' };
    });

    if (editingProjectId) {
      const project = projects.find(p => p.id === editingProjectId);
      const { error } = await supabase
        .from('projects')
        .update({
          customer,
          assigned_to: assignedTo,
          designer_id: designerId,
          ic_assignee: icAssignee || null,
          ic_designer_id: icDesignerId,
          specifications,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingProjectId);

      if (error) {
        showStatus('エラー', 'error');
        showToast('保存に失敗しました: ' + error.message, 'error');
        return;
      }

      Object.assign(project, {
        customer,
        assigned_to: assignedTo,
        ic_assignee: icAssignee || null,
        ic_designer_id: icDesignerId,
        specifications,
        updated_at: new Date().toISOString()
      });
    } else {
      const newProject = {
        uid: 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        customer,
        assigned_to: assignedTo,
        designer_id: designerId,
        ic_assignee: icAssignee || null,
        ic_designer_id: icDesignerId,
        specifications,
        status: 'active',
        progress: blankProgress,
        created_by: currentUser?.id || null
      };

      const { data, error } = await supabase
        .from('projects')
        .insert([newProject])
        .select();

      if (error) {
        showStatus('エラー', 'error');
        showToast('保存に失敗しました: ' + error.message, 'error');
        return;
      }

      log('✅ 新規案件保存成功:', data[0]);
      log('📊 assigned_to:', data[0].assigned_to);
      log('📊 ic_assignee:', data[0].ic_assignee);
      projects.unshift(data[0]);
    }

    log('🔄 renderDesignerTabs()とrenderProjects()を実行します');
    log('📊 現在のprojects数:', projects.length);
    closeProjectModal();
    renderDesignerTabs();
    renderProjects();
    showStatus('保存済み', 'saved');
    showToast('案件を保存しました', 'success');
  });
}

function editProject(projectId) {
  openProjectModal(projectId);
}

async function deleteProject(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  if (!confirm(`「${project.customer}」を削除しますか？\n\n※削除した案件は「完了済み」フィルターで確認できます`)) return;

  await SaveGuard.run(`deleteProject_${projectId}`, async () => {
    showStatus('削除中...', 'saving');
    // 論理削除: deleted_atを設定し、is_archivedをtrueにする
    const { error } = await supabase
      .from('projects')
      .update({
        is_archived: true,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', projectId);

    if (error) {
      showStatus('エラー', 'error');
      showToast('削除に失敗しました: ' + error.message, 'error');
      return;
    }

    // メモリ上も更新（削除ではなくアーカイブ）
    if (project) {
      project.is_archived = true;
      project.deleted_at = new Date().toISOString();
    }
    renderDesignerTabs();
    renderProjects();
    showStatus('保存済み', 'saved');
    showToast('案件を削除しました（復元可能）', 'success');
  });
}

let archiveConfirmProjectId = null;

// 完了済み確認モーダルを開く
async function openArchiveConfirmModal(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  // 未完了タスクがあるか確認
  const { data: incompleteTasks } = await supabase
    .from('project_tasks')
    .select('id')
    .eq('project_id', projectId)
    .eq('is_completed', false);

  if (incompleteTasks && incompleteTasks.length > 0) {
    showToast(`未完了のタスクが${incompleteTasks.length}件あります。タスクを完了してから完了済みにしてください。`, 'warning');
    return;
  }

  archiveConfirmProjectId = projectId;
  document.getElementById('archiveConfirmProjectName').textContent = project.customer;
  ModalManager.open(document.getElementById('archiveConfirmModal'));
}

function closeArchiveConfirmModal() {
  ModalManager.close(document.getElementById('archiveConfirmModal'));
  archiveConfirmProjectId = null;
}

// 完了済みに移動を実行
async function executeArchive() {
  if (!archiveConfirmProjectId) return;

  const project = projects.find(p => p.id === archiveConfirmProjectId);
  if (!project) return;

  showStatus('更新中...', 'saving');

  const updateData = {
    is_archived: true,
    archived_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('projects')
    .update(updateData)
    .eq('id', archiveConfirmProjectId);

  if (error) {
    showStatus('エラー', 'error');
    showToast('更新に失敗しました: ' + error.message, 'error');
    closeArchiveConfirmModal();
    return;
  }

  // ローカルデータを更新
  project.is_archived = true;
  project.archived_at = updateData.archived_at;

  closeArchiveConfirmModal();
  renderProjects();
  renderSidebar();
  showStatus('保存済み', 'saved');
  showToast('案件を完了済みにしました', 'success');
}

async function toggleArchive(projectId, isArchived) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  // 完了済みにする場合はモーダルで確認
  if (isArchived) {
    openArchiveConfirmModal(projectId);
    return;
  }

  // 復元の場合は従来通りconfirmで確認
  if (!confirm('案件を復元しますか？')) return;

  showStatus('更新中...', 'saving');

  const updateData = {
    is_archived: false,
    archived_at: null
  };

  const { error } = await supabase
    .from('projects')
    .update(updateData)
    .eq('id', projectId);

  if (error) {
    showStatus('エラー', 'error');
    showToast('更新に失敗しました: ' + error.message, 'error');
    return;
  }

  // ローカルデータを更新
  project.is_archived = false;
  project.archived_at = null;
  markLocalUpdate(projectId); // リアルタイム同期の二重更新防止

  renderProjects();
  renderSidebar();
  showStatus('保存済み', 'saved');
  showToast('案件を復元しました', 'success');
}

// 完了済から復元（チェックボックス解除時）
// チェックボックスで完了済みにする
async function markAsCompleted(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  // 確認ダイアログ
  if (!confirm(`「${project.customer}」を完了済みに移動しますか？`)) {
    // キャンセルされた場合、チェックボックスを元に戻す
    renderProjects();
    return;
  }

  showStatus('更新中...', 'saving');

  const { error } = await supabase
    .from('projects')
    .update({
      is_archived: true,
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', projectId);

  if (error) {
    showStatus('エラー', 'error');
    showToast('完了処理に失敗しました: ' + error.message, 'error');
    renderProjects();
    return;
  }

  project.is_archived = true;
  project.archived_at = new Date().toISOString();

  showStatus('保存済み', 'saved');
  showToast(`「${project.customer}」を完了済みに移動しました`, 'success');
  renderProjects();
  renderSidebar();
}

async function restoreFromArchive(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  if (!confirm(`「${project.customer}」を担当者（${project.assigned_to || '未割当'}）に戻しますか？`)) {
    // キャンセルされた場合、チェックボックスを戻す
    renderProjects();
    return;
  }

  showStatus('復元中...', 'saving');

  const { error } = await supabase
    .from('projects')
    .update({
      is_archived: false,
      archived_at: null,
      deleted_at: null,  // 削除フラグもクリア
      updated_at: new Date().toISOString()
    })
    .eq('id', projectId);

  if (error) {
    showStatus('エラー', 'error');
    showToast('復元に失敗しました: ' + error.message, 'error');
    renderProjects(); // チェックボックスを戻す
    return;
  }

  project.is_archived = false;
  project.archived_at = null;
  project.deleted_at = null;  // メモリ上もクリア
  project.updated_at = new Date().toISOString();
  markLocalUpdate(projectId); // リアルタイム同期の二重更新防止

  // 担当者のタブに切り替え
  if (project.assigned_to) {
    currentDesignerTab = project.assigned_to;
  } else {
    currentDesignerTab = 'ALL';
  }

  renderSidebar();
  renderProjects();
  showStatus('保存済み', 'saved');
  showToast(`${project.customer} を復元しました`, 'success');
}

// ============================================
// 担当管理機能
// ============================================
function openDesignerModal() {
  renderDesignerList();
  ModalManager.open(document.getElementById('designerModal'));
}

function closeDesignerModal() {
  ModalManager.close(document.getElementById('designerModal'));
}

function renderDesignerList() {
  const container = document.getElementById('designerList');

  // カテゴリで並び替え（設計→IC）
  const sortedDesigners = [...designers].sort((a, b) => {
    if (a.category === '設計' && b.category === 'IC') return -1;
    if (a.category === 'IC' && b.category === '設計') return 1;
    return (a.display_order || 999) - (b.display_order || 999);
  });

  container.innerHTML = '<h3 style="margin: 24px 0 16px; font-size: 18px; font-weight: 600;">登録済み担当（' + designers.length + '名）</h3>' +
    '<div class="table-container"><table class="table"><thead><tr><th>担当名</th><th>カテゴリ</th><th>担当案件数</th><th>操作</th></tr></thead><tbody>' +
    sortedDesigners.map(designer => {
      const count = projects.filter(p => p.assigned_to === designer.name).length;
      const categoryLabel = designer.category === '設計' ? '設計担当' : 'IC担当';
      return `
        <tr>
          <td><strong>${designer.name}</strong></td>
          <td><span class="badge ${designer.category === '設計' ? 'badge-primary' : 'badge-success'}">${categoryLabel}</span></td>
          <td>${count}件</td>
          <td><button class="btn btn-danger btn-small" onclick="deleteDesigner('${designer.id}')">削除</button></td>
        </tr>
      `;
    }).join('') +
    '</tbody></table></div>';
}

async function addDesigner() {
  if (SaveGuard.isLocked('addDesigner')) return;

  const name = document.getElementById('newDesignerName')?.value?.trim() || '';
  const category = document.getElementById('newDesignerCategory')?.value || '';

  if (!name) {
    showToast('担当名を入力してください', 'error');
    return;
  }

  if (designers.find(d => d.name === name)) {
    showToast('既に存在する担当名です', 'error');
    return;
  }

  await SaveGuard.run('addDesigner', async () => {
  showStatus('追加中...', 'saving');

  // 同じカテゴリの最大display_orderを取得して+1
  const sameCategoryDesigners = designers.filter(d => d.category === category);
  const maxDisplayOrder = sameCategoryDesigners.length > 0
    ? Math.max(...sameCategoryDesigners.map(d => d.display_order || 0))
    : 0;
  const newDisplayOrder = maxDisplayOrder + 1;

  const { data, error } = await supabase
    .from('designers')
    .insert([{ name, category, email: `${name.replace(/\s/g, '')}@temp.local`, created_by: currentUser?.id, display_order: newDisplayOrder }])
    .select();

  if (error) {
    showStatus('エラー', 'error');
    showToast('追加に失敗しました: ' + error.message, 'error');
    return;
  }

  designers.push(data[0]);
  document.getElementById('newDesignerName').value = '';
  renderDesignerList();
  renderDesignerTabs();
  renderSidebar();
  showStatus('保存済み', 'saved');
  showToast('担当を追加しました', 'success');
  }); // SaveGuard.run
}

async function deleteDesigner(designerId) {
  const designer = designers.find(d => d.id === designerId);
  const hasProjects = projects.some(p => p.assigned_to === designer.name);

  if (hasProjects) {
    showToast('この担当は案件に割当てられています。案件の担当を変更してから削除してください。', 'error');
    return;
  }

  if (!confirm(`${designer.name}を削除しますか？`)) return;

  await SaveGuard.run(`deleteDesigner_${designerId}`, async () => {
    showStatus('削除中...', 'saving');
    const { error } = await supabase
      .from('designers')
      .delete()
      .eq('id', designerId);

    if (error) {
      showStatus('エラー', 'error');
      showToast('削除に失敗しました: ' + error.message, 'error');
      return;
    }

    designers = designers.filter(d => d.id !== designerId);
    renderDesignerList();
    renderDesignerListInline();
    renderSidebar();
    showStatus('保存済み', 'saved');
    showToast('担当を削除しました', 'success');
  });
}

// インライン版担当管理関数
function renderDesignerListInline() {
  const container = document.getElementById('designerListInline');
  if (!container) return;

  const sekkeiDesigners = [...designers].filter(d => d.category === '設計').sort((a, b) => (a.display_order || 999) - (b.display_order || 999));
  const icDesigners = [...designers].filter(d => d.category === 'IC').sort((a, b) => (a.display_order || 999) - (b.display_order || 999));
  const exteriorDesigners = [...designers].filter(d => d.category === '外構').sort((a, b) => (a.display_order || 999) - (b.display_order || 999));

  let html = '<h3 style="margin: 24px 0 16px; font-size: 18px; font-weight: 600;">登録済み担当（' + designers.length + '名）</h3>';
  html += '<p style="color: var(--text-secondary); margin-bottom: 16px;">💡 行をドラッグ&ドロップして表示順序を変更できます</p>';

  // 担当行を生成するヘルパー関数
  function renderDesignerRow(designer, category, countField) {
    const count = countField ? projects.filter(p => p[countField] === designer.name).length : '-';
    const emailDisplay = designer.email && !designer.email.includes('@temp.local') ? designer.email : '<span style="color: var(--text-muted);">未設定</span>';
    const phoneDisplay = designer.phone ? designer.phone : '<span style="color: var(--text-muted);">未設定</span>';
    const departmentDisplay = designer.department ? designer.department : '<span style="color: var(--text-muted);">未設定</span>';
    const hasValidEmail = designer.email && !designer.email.includes('@temp.local');
    const needsInvite = hasValidEmail && !designer.auth_confirmed;
    return `
      <tr class="draggable-row" draggable="true" data-designer-id="${designer.id}" data-category="${category}">
        <td><span class="drag-handle">≡</span></td>
        <td><strong>${designer.name}</strong>${designer.auth_confirmed ? ' <span style="color: var(--success-color); font-size: 12px;">✓</span>' : ''}</td>
        <td>${emailDisplay}</td>
        <td>${phoneDisplay}</td>
        <td>${departmentDisplay}</td>
        <td>${countField ? count + '件' : '-'}</td>
        <td>
          ${needsInvite ? `<button class="btn btn-primary btn-small" onclick="resendInvite('${designer.id}')" style="margin-right: 4px;">📧 招待</button>` : ''}
          <button class="btn btn-ghost btn-small" onclick="openEditDesignerModal('${designer.id}')" style="margin-right: 4px;">✏️ 編集</button>
          <button class="btn btn-danger btn-small" onclick="deleteDesignerInline('${designer.id}')">削除</button>
        </td>
      </tr>
    `;
  }

  // 設計担当
  if (sekkeiDesigners.length > 0) {
    html += '<h4 style="margin: 20px 0 12px; color: var(--primary-color);">📐 設計担当</h4>';
    html += '<div class="table-container"><table class="table"><thead><tr><th width="40"></th><th>担当名</th><th>メールアドレス</th><th>電話番号</th><th>部署</th><th>担当案件数</th><th>操作</th></tr></thead><tbody id="sekkeiTbody">';
    sekkeiDesigners.forEach(designer => {
      html += renderDesignerRow(designer, '設計', 'assigned_to');
    });
    html += '</tbody></table></div>';
  }

  // IC担当
  if (icDesigners.length > 0) {
    html += '<h4 style="margin: 20px 0 12px; color: var(--success-color);">🎨 IC担当</h4>';
    html += '<div class="table-container"><table class="table"><thead><tr><th width="40"></th><th>担当名</th><th>メールアドレス</th><th>電話番号</th><th>部署</th><th>担当案件数</th><th>操作</th></tr></thead><tbody id="icTbody">';
    icDesigners.forEach(designer => {
      html += renderDesignerRow(designer, 'IC', 'ic_assignee');
    });
    html += '</tbody></table></div>';
  }

  // 外構担当
  if (exteriorDesigners.length > 0) {
    html += '<h4 style="margin: 20px 0 12px; color: var(--secondary-color);">🌳 外構担当</h4>';
    html += '<div class="table-container"><table class="table"><thead><tr><th width="40"></th><th>担当名</th><th>メールアドレス</th><th>電話番号</th><th>部署</th><th>担当案件数</th><th>操作</th></tr></thead><tbody id="exteriorTbody">';
    exteriorDesigners.forEach(designer => {
      html += renderDesignerRow(designer, '外構', 'exterior_assignee');
    });
    html += '</tbody></table></div>';
  }

  // 不動産担当
  const realestateDesigners = [...designers].filter(d => d.category === '不動産').sort((a, b) => (a.display_order || 999) - (b.display_order || 999));
  if (realestateDesigners.length > 0) {
    html += '<h4 style="margin: 20px 0 12px; color: #8B4513;">🏠 不動産担当</h4>';
    html += '<div class="table-container"><table class="table"><thead><tr><th width="40"></th><th>担当名</th><th>メールアドレス</th><th>電話番号</th><th>部署</th><th>担当案件数</th><th>操作</th></tr></thead><tbody id="realestateTbody">';
    realestateDesigners.forEach(designer => {
      html += renderDesignerRow(designer, '不動産', 'realestate_assignee');
    });
    html += '</tbody></table></div>';
  }

  // 工事担当
  const constructionDesigners = [...designers].filter(d => d.category === '工事').sort((a, b) => (a.display_order || 999) - (b.display_order || 999));
  if (constructionDesigners.length > 0) {
    html += '<h4 style="margin: 20px 0 12px; color: #FF6B35;">🔨 工事担当</h4>';
    html += '<div class="table-container"><table class="table"><thead><tr><th width="40"></th><th>担当名</th><th>メールアドレス</th><th>電話番号</th><th>部署</th><th>担当案件数</th><th>操作</th></tr></thead><tbody id="constructionTbody">';
    constructionDesigners.forEach(designer => {
      html += renderDesignerRow(designer, '工事', 'construction_assignee');
    });
    html += '</tbody></table></div>';
  }

  // 営業担当
  const salesDesigners = [...designers].filter(d => d.category === '営業').sort((a, b) => (a.display_order || 999) - (b.display_order || 999));
  if (salesDesigners.length > 0) {
    html += '<h4 style="margin: 20px 0 12px; color: #2196F3;">💼 営業担当</h4>';
    html += '<div class="table-container"><table class="table"><thead><tr><th width="40"></th><th>担当名</th><th>メールアドレス</th><th>電話番号</th><th>部署</th><th>担当案件数</th><th>操作</th></tr></thead><tbody id="salesTbody">';
    salesDesigners.forEach(designer => {
      html += renderDesignerRow(designer, '営業', 'sales_assignee');
    });
    html += '</tbody></table></div>';
  }

  // 管理者
  const adminDesigners = [...designers].filter(d => d.category === '管理者').sort((a, b) => (a.display_order || 999) - (b.display_order || 999));
  if (adminDesigners.length > 0) {
    html += '<h4 style="margin: 20px 0 12px; color: #9C27B0;">👑 管理者</h4>';
    html += '<div class="table-container"><table class="table"><thead><tr><th width="40"></th><th>担当名</th><th>メールアドレス</th><th>電話番号</th><th>部署</th><th>担当案件数</th><th>操作</th></tr></thead><tbody id="adminTbody">';
    adminDesigners.forEach(designer => {
      html += renderDesignerRow(designer, '管理者', null);
    });
    html += '</tbody></table></div>';
  }

  container.innerHTML = html;

  // ドラッグ&ドロップイベント設定
  setupDragAndDrop();
}

// 担当編集モーダル
function openEditDesignerModal(designerId) {
  const designer = designers.find(d => d.id === designerId);
  if (!designer) return;

  const modal = document.createElement('div');
  modal.className = 'modal show';
  modal.id = 'editDesignerModal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <div class="modal-header">
        <h2 class="modal-title">担当編集</h2>
        <button class="close" onclick="closeEditDesignerModal()">&times;</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="editDesignerId" value="${escapeHtml(designer.id)}">
        <div class="form-group">
          <label class="form-label">担当名 *</label>
          <input type="text" class="form-input" id="editDesignerName" value="${escapeHtml(designer.name)}" style="width: 100%;">
        </div>
        <div class="form-group">
          <label class="form-label">メールアドレス</label>
          <input type="email" class="form-input" id="editDesignerEmail" value="${escapeHtml(designer.email && !designer.email.includes('@temp.local') ? designer.email : '')}" placeholder="例: staff@example.com" style="width: 100%;">
        </div>
        <div class="form-group">
          <label class="form-label">携帯電話番号（11桁・ハイフンなし）</label>
          <input type="tel" class="form-input" id="editDesignerPhone" value="${escapeHtml(designer.phone || '')}" placeholder="例: 09012345678" maxlength="11" pattern="[0-9]{11}" style="width: 100%;">
        </div>
        <div class="form-group">
          <label class="form-label">部署</label>
          <select class="form-input" id="editDesignerDepartment" style="width: 100%;">
            <option value="">部署を選択</option>
            ${departmentMaster.map(dept => `<option value="${escapeHtml(dept)}" ${designer.department === dept ? 'selected' : ''}>${escapeHtml(dept)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">カテゴリ</label>
          <select class="form-input" id="editDesignerCategory" style="width: 100%;">
            <option value="設計" ${designer.category === '設計' ? 'selected' : ''}>設計担当</option>
            <option value="IC" ${designer.category === 'IC' ? 'selected' : ''}>IC担当</option>
            <option value="外構" ${designer.category === '外構' ? 'selected' : ''}>外構担当</option>
            <option value="不動産" ${designer.category === '不動産' ? 'selected' : ''}>不動産担当</option>
            <option value="工事" ${designer.category === '工事' ? 'selected' : ''}>工事担当</option>
            <option value="営業" ${designer.category === '営業' ? 'selected' : ''}>営業担当</option>
            <option value="管理者" ${designer.category === '管理者' ? 'selected' : ''}>管理者</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeEditDesignerModal()">キャンセル</button>
        <button class="btn btn-primary" onclick="saveEditDesigner()">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function closeEditDesignerModal() {
  const modal = document.getElementById('editDesignerModal');
  if (modal) modal.remove();
}

async function saveEditDesigner() {
  if (SaveGuard.isLocked('saveEditDesigner')) return;

  const designerId = document.getElementById('editDesignerId').value;
  const name = document.getElementById('editDesignerName').value.trim();
  const email = document.getElementById('editDesignerEmail').value.trim();
  const phone = document.getElementById('editDesignerPhone').value.trim();
  const department = document.getElementById('editDesignerDepartment').value;
  const category = document.getElementById('editDesignerCategory').value;

  if (!name) {
    showToast('担当名を入力してください', 'error');
    return;
  }

  // 電話番号形式チェック（11桁の数字のみ）
  if (phone && !/^[0-9]{11}$/.test(phone)) {
    showToast('携帯電話番号は11桁の数字で入力してください（ハイフンなし）', 'error');
    return;
  }

  const designer = designers.find(d => d.id === designerId);
  if (!designer) return;

  // 名前が変更された場合、重複チェック
  if (name !== designer.name && designers.find(d => d.name === name && d.id !== designerId)) {
    showToast('既に存在する担当名です', 'error');
    return;
  }

  await SaveGuard.run('saveEditDesigner', async () => {
  showStatus('保存中...', 'saving');

  const oldName = designer.name;
  const updateData = {
    name,
    category,
    email: email || `${name.replace(/\s/g, '')}@temp.local`,
    phone: phone || null,
    department: department || null
  };

  const { error } = await supabase
    .from('designers')
    .update(updateData)
    .eq('id', designerId);

  if (error) {
    showStatus('エラー', 'error');
    showToast('保存に失敗しました: ' + error.message, 'error');
    return;
  }

  // 名前が変わった場合、関連する案件の担当者名も更新
  if (oldName !== name) {
    const fieldsToUpdate = {
      '設計': 'assigned_to',
      'IC': 'ic_assignee',
      '外構': 'exterior_assignee'
    };
    const field = fieldsToUpdate[designer.category];
    if (field) {
      const relatedProjects = projects.filter(p => p[field] === oldName);
      for (const project of relatedProjects) {
        await supabase.from('projects').update({ [field]: name }).eq('id', project.id);
        project[field] = name;
      }
    }
  }

  // ローカルデータを更新
  Object.assign(designer, updateData);

  closeEditDesignerModal();
  renderDesignerListInline();
  renderDesignerTabs();
  renderSidebar();
  renderProjects();
  showStatus('保存済み', 'saved');
  showToast('担当情報を更新しました', 'success');
  }); // SaveGuard.run
}

async function addDesignerInline() {
  if (SaveGuard.isLocked('addDesignerInline')) return;

  const name = document.getElementById('newDesignerNameInline').value.trim();
  const email = document.getElementById('newDesignerEmailInline').value.trim();
  const phone = document.getElementById('newDesignerPhoneInline').value.trim();
  const department = document.getElementById('newDesignerDepartmentInline').value;
  const category = document.getElementById('newDesignerCategoryInline').value;

  if (!name) {
    showToast('担当名を入力してください', 'error');
    return;
  }

  if (!email) {
    showToast('メールアドレスを入力してください', 'error');
    return;
  }

  // メールアドレス形式チェック
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showToast('有効なメールアドレスを入力してください', 'error');
    return;
  }

  // 電話番号形式チェック（11桁の数字のみ）
  if (phone && !/^[0-9]{11}$/.test(phone)) {
    showToast('携帯電話番号は11桁の数字で入力してください（ハイフンなし）', 'error');
    return;
  }

  if (designers.find(d => d.name === name)) {
    showToast('既に存在する担当名です', 'error');
    return;
  }

  if (designers.find(d => d.email === email)) {
    showToast('このメールアドレスは既に使用されています', 'error');
    return;
  }

  await SaveGuard.run('addDesignerInline', async () => {
  showStatus('追加中...', 'saving');

  try {
    // 同じカテゴリの最大display_orderを取得して+1
    const sameCategoryDesigners = designers.filter(d => d.category === category);
    const maxDisplayOrder = sameCategoryDesigners.length > 0
      ? Math.max(...sameCategoryDesigners.map(d => d.display_order || 0))
      : 0;
    const newDisplayOrder = maxDisplayOrder + 1;

    // 1. designersテーブルにレコード追加
    const { data, error } = await supabase
      .from('designers')
      .insert([{ name, category, email, phone: phone || null, department: department || null, created_by: currentUser?.id, display_order: newDisplayOrder }])
      .select();

    if (error) {
      throw new Error('担当情報の保存に失敗しました: ' + error.message);
    }

    const newDesigner = data[0];

    // 2. Supabase Authにユーザーを作成（一時パスワード）
    const tempPassword = crypto.randomUUID().slice(0, 16) + 'Aa1!'; // 一時パスワード
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email,
      password: tempPassword,
      options: {
        data: {
          name: name,
          designer_id: newDesigner.id
        },
        emailRedirectTo: window.location.origin
      }
    });

    if (authError) {
      console.warn('Supabase Auth登録エラー:', authError);
      // Authエラーでもdesignersテーブルへの追加は成功しているので続行
    }

    // 3. パスワード設定メールを送信
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });

    if (resetError) {
      console.warn('パスワードリセットメール送信エラー:', resetError);
    }

    designers.push(newDesigner);
    document.getElementById('newDesignerNameInline').value = '';
    document.getElementById('newDesignerEmailInline').value = '';
    document.getElementById('newDesignerPhoneInline').value = '';
    document.getElementById('newDesignerDepartmentInline').value = '';
    renderDesignerListInline();
    renderSidebar();
    showStatus('保存済み', 'saved');
    showToast(`担当を追加しました。${email} にパスワード設定メールを送信しました。`, 'success');

  } catch (err) {
    showStatus('エラー', 'error');
    showToast(err.message, 'error');
  }
  }); // SaveGuard.run
}

// 既存担当者に招待メールを再送信
async function resendInvite(designerId) {
  const designer = designers.find(d => d.id === designerId);
  if (!designer || !designer.email) {
    showToast('メールアドレスが設定されていません', 'error');
    return;
  }

  if (!confirm(`${designer.name}（${designer.email}）に招待メールを送信しますか？\n\nメール内のリンクからパスワードを設定できます。`)) {
    return;
  }

  showStatus('送信中...', 'saving');

  try {
    // 1. まずSupabase Authにユーザーを作成を試みる（既に存在する場合はエラーになる）
    const tempPassword = crypto.randomUUID().slice(0, 16) + 'Aa1!';
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: designer.email,
      password: tempPassword,
      options: {
        data: {
          name: designer.name,
          designer_id: designer.id
        },
        emailRedirectTo: window.location.origin
      }
    });

    if (authError && !authError.message.includes('already registered')) {
      console.warn('Auth登録:', authError.message);
    }

    // 2. パスワード設定メールを送信
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(designer.email, {
      redirectTo: window.location.origin
    });

    if (resetError) {
      throw new Error('メール送信に失敗しました: ' + resetError.message);
    }

    showStatus('保存済み', 'saved');
    showToast(`${designer.email} に招待メールを送信しました`, 'success');

  } catch (err) {
    showStatus('エラー', 'error');
    showToast(err.message, 'error');
  }
}

async function deleteDesignerInline(designerId) {
  const designer = designers.find(d => d.id === designerId);
  const hasProjects = projects.some(p => p.assigned_to === designer.name);

  if (hasProjects) {
    showToast('この担当は案件に割当てられています。案件の担当を変更してから削除してください。', 'error');
    return;
  }

  if (!confirm(`${designer.name}を削除しますか？`)) return;

  showStatus('削除中...', 'saving');
  const { error } = await supabase
    .from('designers')
    .delete()
    .eq('id', designerId);

  if (error) {
    showStatus('エラー', 'error');
    showToast('削除に失敗しました: ' + error.message, 'error');
    return;
  }

  designers = designers.filter(d => d.id !== designerId);
  renderDesignerListInline();
  renderSidebar();
  showStatus('保存済み', 'saved');
  showToast('担当を削除しました', 'success');
}

// ============================================
// 担当認証設定
// ============================================
function openDesignerAuthModal(designerId) {
  const designer = designers.find(d => d.id === designerId);
  if (!designer) return;

  document.getElementById('authDesignerId').value = designer.id;
  document.getElementById('authDesignerName').value = designer.name;
  document.getElementById('authDesignerEmail').value = designer.email && !designer.email.includes('@temp.local') ? designer.email : '';
  document.getElementById('authDesignerPassword').value = '';
  document.getElementById('authDesignerPasswordConfirm').value = '';

  ModalManager.open(document.getElementById('designerAuthModal'), '#authDesignerEmail');
}

function closeDesignerAuthModal() {
  ModalManager.close(document.getElementById('designerAuthModal'));
}

async function saveDesignerAuth() {
  const designerId = document.getElementById('authDesignerId').value;
  const email = document.getElementById('authDesignerEmail').value.trim();
  const password = document.getElementById('authDesignerPassword').value;
  const passwordConfirm = document.getElementById('authDesignerPasswordConfirm').value;

  // バリデーション
  if (!email) {
    showToast('メールアドレスを入力してください', 'error');
    return;
  }

  if (!password) {
    showToast('パスワードを入力してください', 'error');
    return;
  }

  if (password.length < 8) {
    showToast('パスワードは8文字以上で設定してください', 'error');
    return;
  }

  if (password !== passwordConfirm) {
    showToast('パスワードが一致しません', 'error');
    return;
  }

  showStatus('保存中...', 'saving');

  try {
    const designer = designers.find(d => d.id === designerId);
    const oldEmail = designer.email;

    log('🔐 ユーザーアカウント作成開始:', { email, designerId });

    // 1. Supabase Authにユーザーを作成
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          name: designer.name,
          designer_id: designerId
        },
        emailRedirectTo: window.location.origin
      }
    });

    log('🔐 signUp結果:', { authData, authError });

    if (authError) {
      // ユーザーが既に存在する場合は、パスワードだけを更新できないので警告
      if (authError.message.includes('already registered')) {
        showToast('⚠️ このメールアドレスは既に登録されています。パスワードの変更が必要な場合は、ログイン画面の「パスワードを忘れた」から変更してください。', 'error');
      } else {
        throw authError;
      }
    } else {
      log('✅ Supabase Authにユーザー作成完了:', authData.user?.id);
    }

    // 2. designersテーブルのemailを更新
    const { error: updateError } = await supabase
      .from('designers')
      .update({ email: email })
      .eq('id', designerId);

    if (updateError) {
      logError('❌ designers更新エラー:', updateError);
      showStatus('エラー', 'error');
      showToast('メールアドレスの保存に失敗しました: ' + updateError.message, 'error');
      return;
    }

    log('✅ designersテーブル更新完了');

    // 3. デザイナー配列を更新
    const designerIndex = designers.findIndex(d => d.id === designerId);
    if (designerIndex !== -1) {
      designers[designerIndex].email = email;
    }

    closeDesignerAuthModal();
    renderDesignerListInline();
    showStatus('保存済み', 'saved');

    if (authError && authError.message.includes('already registered')) {
      showToast('メールアドレスを保存しました（アカウントは既に存在します）', 'success');
    } else {
      showToast('✅ ログインアカウントを作成しました！このメールアドレスとパスワードでログインできます。', 'success', 5000);
    }

  } catch (error) {
    logError('❌ 認証設定エラー:', error);
    showStatus('エラー', 'error');
    showToast('認証設定に失敗しました: ' + error.message, 'error');
  }
}

// ドラッグ&ドロップ処理
let draggedElement = null;

function setupDragAndDrop() {
  const draggableRows = document.querySelectorAll('.draggable-row');

  draggableRows.forEach(row => {
    row.addEventListener('dragstart', handleDesignerDragStart);
    row.addEventListener('dragover', handleDesignerDragOver);
    row.addEventListener('drop', handleDesignerDrop);
    row.addEventListener('dragend', handleDesignerDragEnd);
    row.addEventListener('dragleave', handleDesignerDragLeave);
  });
}

function handleDesignerDragStart(e) {
  draggedElement = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDesignerDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }

  // 同じカテゴリ内でのみドロップ可能
  const draggedCategory = draggedElement.dataset.category;
  const targetCategory = this.dataset.category;

  if (draggedCategory === targetCategory && this !== draggedElement) {
    this.classList.add('drag-over');
  }

  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDesignerDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }

  const draggedCategory = draggedElement.dataset.category;
  const targetCategory = this.dataset.category;

  // 同じカテゴリ内でのみドロップ実行
  if (draggedCategory === targetCategory && draggedElement !== this) {
    const draggedId = draggedElement.dataset.designerId;
    const targetId = this.dataset.designerId;

    // 順序を入れ替え
    updateDesignerOrder(draggedId, targetId, draggedCategory);
  }

  this.classList.remove('drag-over');
  return false;
}

function handleDesignerDragEnd(e) {
  this.classList.remove('dragging');

  const allRows = document.querySelectorAll('.draggable-row');
  allRows.forEach(row => {
    row.classList.remove('drag-over');
  });
}

function handleDesignerDragLeave(e) {
  this.classList.remove('drag-over');
}

async function updateDesignerOrder(draggedId, targetId, category) {
  showStatus('並び替え中...', 'saving');

  // 該当カテゴリの担当を取得
  const categoryDesigners = designers.filter(d => d.category === category);

  // ドラッグされた担当とターゲット担当を見つける
  const draggedIndex = categoryDesigners.findIndex(d => d.id === draggedId);
  const targetIndex = categoryDesigners.findIndex(d => d.id === targetId);

  // 配列を並び替え
  const [draggedDesigner] = categoryDesigners.splice(draggedIndex, 1);
  categoryDesigners.splice(targetIndex, 0, draggedDesigner);

  // display_orderを再計算
  const updates = [];
  for (let i = 0; i < categoryDesigners.length; i++) {
    const designer = categoryDesigners[i];
    const newOrder = i + 1;

    if (designer.display_order !== newOrder) {
      updates.push({
        id: designer.id,
        display_order: newOrder
      });

      // ローカルデータも更新
      const localDesigner = designers.find(d => d.id === designer.id);
      if (localDesigner) {
        localDesigner.display_order = newOrder;
      }
    }
  }

  // Supabaseに一括更新
  for (const update of updates) {
    const { error } = await supabase
      .from('designers')
      .update({ display_order: update.display_order })
      .eq('id', update.id);

    if (error) {
      logError('並び替えエラー:', error);
      showStatus('エラー', 'error');
      showToast('並び替えに失敗しました: ' + error.message, 'error');
      return;
    }
  }

  // UI更新
  renderDesignerListInline();
  renderSidebar();
  showStatus('保存済み', 'saved');
  showToast('並び替えを保存しました', 'success');
}

// インライン版カテゴリ追加
async function addCategoryInline() {
  const name = document.getElementById('newCategoryNameInline').value.trim();

  if (!name) {
    showToast('カテゴリ名を入力してください', 'error');
    return;
  }

  if (vendorCategories.find(c => c.name === name)) {
    showToast('既に存在するカテゴリ名です', 'error');
    return;
  }

  showStatus('追加中...', 'saving');
  const { data, error } = await supabase
    .from('vendor_categories')
    .insert([{ name, display_order: vendorCategories.length + 1 }])
    .select();

  if (error) {
    showStatus('エラー', 'error');
    showToast('追加に失敗しました: ' + error.message, 'error');
    return;
  }

  vendorCategories.push(data[0]);
  document.getElementById('newCategoryNameInline').value = '';
  renderCategoriesList();
  renderCategoryFilters();
  populateVendorCategoryDropdown();
  showStatus('保存済み', 'saved');
  showToast('カテゴリを追加しました', 'success');
}

// ============================================
// メールテンプレート管理
// ============================================
function renderTemplates() {
  const container = document.getElementById('templatesTable');
  if (!container) return; // 要素が存在しない場合は何もしない

  const categoryFilterEl = document.getElementById('categoryFilter');
  const categoryFilter = categoryFilterEl ? categoryFilterEl.value : null;

  let filtered = emailTemplates;

  // currentUserCategoryに応じてフィルタリング（管理者以外）
  if (currentUserCategory && currentUserCategory !== 'admin') {
    filtered = emailTemplates.filter(t => t.category === currentUserCategory);
  }

  // さらにカテゴリフィルタを適用
  if (categoryFilter) {
    filtered = filtered.filter(t => t.category === categoryFilter);
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📧</div><div class="empty-title">テンプレートがありません</div><div class="empty-description">メールテンプレートを追加して、案件からワンクリックでメールを作成できます</div><button class="btn btn-primary" onclick="openTemplateModal()">+ テンプレート追加</button></div>';
    return;
  }

  container.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>表示名</th>
          <th>カテゴリ</th>
          <th>会社名</th>
          <th>メールアドレス</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(template => `
          <tr>
            <td><strong>${template.display_name}</strong></td>
            <td><span class="badge ${template.category === 'IC' ? 'badge-success' : 'badge-primary'}">${template.category}</span></td>
            <td>${template.company}</td>
            <td>${template.email || '—'}</td>
            <td>
              <div style="display: flex; gap: 8px;">
                <button class="btn btn-ghost btn-small" onclick="editTemplate('${template.id}')">編集</button>
                <button class="btn btn-danger btn-small" onclick="deleteTemplate('${template.id}')">削除</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function openTemplateModal(templateId = null) {
  editingTemplateId = templateId;
  const modal = document.getElementById('templateModal');
  const title = document.getElementById('templateModalTitle');

  if (templateId) {
    const template = emailTemplates.find(t => t.id === templateId);
    title.textContent = 'テンプレート編集';
    document.getElementById('templateId').value = template.template_id;
    document.getElementById('templateId').disabled = true;
    document.getElementById('templateDisplayName').value = template.display_name;
    document.getElementById('templateCategory').value = template.category;
    document.getElementById('templateCompany').value = template.company;
    document.getElementById('templateContact').value = template.contact || '';
    document.getElementById('templateEmail').value = template.email || '';
    document.getElementById('templateSubjectFormat').value = template.subject_format || '';
    document.getElementById('templateText').value = template.template_text || '';
  } else {
    title.textContent = 'テンプレート追加';
    document.getElementById('templateId').value = '';
    document.getElementById('templateId').disabled = false;
    document.getElementById('templateDisplayName').value = '';
    document.getElementById('templateCategory').value = '設計';
    document.getElementById('templateCompany').value = '';
    document.getElementById('templateContact').value = '';
    document.getElementById('templateEmail').value = '';
    document.getElementById('templateSubjectFormat').value = '';
    document.getElementById('templateText').value = '';
  }

  ModalManager.open(modal, '#templateId');
}

function closeTemplateModal() {
  ModalManager.close(document.getElementById('templateModal'));
  editingTemplateId = null;
}

async function saveTemplate() {
  if (SaveGuard.isLocked('saveTemplate')) return;

  const templateId = document.getElementById('templateId').value.trim();
  const displayName = document.getElementById('templateDisplayName').value.trim();
  const category = document.getElementById('templateCategory').value;
  const company = document.getElementById('templateCompany').value.trim();
  const contact = document.getElementById('templateContact').value.trim();
  const email = document.getElementById('templateEmail').value.trim();
  const subjectFormat = document.getElementById('templateSubjectFormat').value.trim();
  const templateText = document.getElementById('templateText').value.trim();

  if (!templateId || !displayName || !company || !subjectFormat || !templateText) {
    showToast('必須項目を入力してください', 'error');
    return;
  }

  await SaveGuard.run('saveTemplate', async () => {
    showStatus('保存中...', 'saving');

    const templateData = {
      template_id: templateId,
      display_name: displayName,
      category,
      company,
      contact,
      email,
      subject_format: subjectFormat,
      template_text: templateText,
      has_special_content: false,
      has_sub_options: false,
      created_by: currentUser.id
    };

    if (editingTemplateId) {
      const { error } = await supabase
        .from('email_templates')
        .update(templateData)
        .eq('id', editingTemplateId);

      if (error) {
        showStatus('エラー', 'error');
        showToast('保存に失敗しました: ' + error.message, 'error');
        return;
      }

      const template = emailTemplates.find(t => t.id === editingTemplateId);
      Object.assign(template, templateData);
    } else {
      const { data, error } = await supabase
        .from('email_templates')
        .insert([templateData])
        .select();

      if (error) {
        showStatus('エラー', 'error');
        showToast('保存に失敗しました: ' + error.message, 'error');
        return;
      }

      emailTemplates.push(data[0]);
    }

    closeTemplateModal();
    renderTemplates();
    showStatus('保存済み', 'saved');
    showToast('テンプレートを保存しました', 'success');
  });
}

function editTemplate(templateId) {
  openTemplateModal(templateId);
}

async function deleteTemplate(templateId) {
  if (!confirm('このテンプレートを削除しますか？')) return;

  showStatus('削除中...', 'saving');
  const { error } = await supabase
    .from('email_templates')
    .delete()
    .eq('id', templateId);

  if (error) {
    showStatus('エラー', 'error');
    showToast('削除に失敗しました: ' + error.message, 'error');
    return;
  }

  emailTemplates = emailTemplates.filter(t => t.id !== templateId);
  renderTemplates();
  showStatus('保存済み', 'saved');
  showToast('テンプレートを削除しました', 'success');
}

// ============================================
// タスクからのメール作成機能（モーダル確認後にGmail開く）
// ============================================
async function openEmailFromTask(projectId, taskKey) {
  const project = projects.find(p => p.id === projectId);
  if (!project) {
    showToast('案件が見つかりません', 'error');
    return;
  }

  // タスク定義を取得
  const taskDef = tasksV2.find(t => t.task_key === taskKey);
  if (!taskDef) {
    showToast('タスク定義が見つかりません', 'error');
    return;
  }

  // タスクに紐づいた業者を取得（taskMappings + vendorsを使用）
  const templateId = taskMappings[taskKey] || taskKey;
  let taskVendors = vendors.filter(v => v.template_id === templateId);

  if (taskVendors.length === 0) {
    showToast('このタスクに業者が紐づけられていません', 'error');
    return;
  }

  // ICタスクの場合: 選択中のメーカー名に対応した業者を優先的に選択
  if (IC_MAKER_TASKS.includes(taskKey)) {
    const progressData = project.progress || {};
    const selectedMaker = progressData[taskKey]?.state || '';

    if (selectedMaker && selectedMaker !== '-') {
      // 選択中のメーカー名に一致する業者を先頭に並び替え
      const matchingVendor = taskVendors.find(v =>
        v.company.toLowerCase().includes(selectedMaker.toLowerCase()) ||
        v.company === selectedMaker
      );
      if (matchingVendor) {
        taskVendors = [matchingVendor, ...taskVendors.filter(v => v.id !== matchingVendor.id)];
      }
    }
  }

  // 現在ログインしているユーザーの情報を署名に使用
  const staffName = currentDesigner?.name || '';
  const staffEmail = currentDesigner?.email && !currentDesigner.email.includes('@temp.local') ? currentDesigner.email : '';
  const staffPhone = currentDesigner?.phone || '';
  const staffDepartment = currentDesigner?.department || '';

  // 期日を設定（次の金曜日、祝日なら木曜日）
  const dueDateStr = formatDateJapanese(getNextFriday());

  // 選択中のメーカーに対応した業者（または最初の業者）のテンプレートを使用
  const vendor = taskVendors[0];

  // プレースホルダー置換
  const replacePlaceholders = (text) => {
    if (!text) return '';
    return text
      .replace(/\{customerName\}/g, project.customer)
      .replace(/\{dueDate\}/g, dueDateStr)
      .replace(/\{staffName\}/g, staffName)
      .replace(/\{staffEmail\}/g, staffEmail)
      .replace(/\{staffPhone\}/g, staffPhone)
      .replace(/\{staffDepartment\}/g, staffDepartment)
      .replace(/\{taskName\}/g, taskDef.task_name)
      .replace(/\{company\}/g, vendor.company)
      .replace(/\{contact\}/g, vendor.contact || 'ご担当者様');
  };

  // 顧客名から末尾の「様」を除去（重複防止）
  const customerName = project.customer.replace(/様$/, '');

  // デフォルトの件名フォーマット
  const defaultSubject = `【${taskDef.task_name}依頼】${customerName}様邸　期日：${dueDateStr}希望`;

  // デフォルトの本文テンプレート
  const defaultBody = `${vendor.company}
${vendor.contact || 'ご担当者'} 様

いつもお世話になっております。
株式会社Gハウスの${staffName}です。

下記案件につきまして、${taskDef.task_name}の御見積作成をお願いいたします。

――――――――――――――
【案件名】${customerName}様邸
【内容】${taskDef.task_name}
【提出期限】${dueDateStr}
――――――――――――――

必要資料は本メールに添付しております。
ご確認のうえ、もし不明点や追加で必要な資料等がございましたら、
お手数ですがご一報いただけますと幸いです。

お忙しいところ恐れ入りますが、
何卒よろしくお願いいたします。

株式会社Gハウス${staffDepartment ? '\n' + staffDepartment : ''}
${staffName}${staffPhone ? '\nTEL：' + staffPhone : ''}${staffEmail ? '\nMail：' + staffEmail : ''}`;

  // 初期の件名と本文を生成（常にデフォルトテンプレートを使用）
  const initialSubject = defaultSubject;
  const initialBody = defaultBody;

  // モーダルを表示
  showEmailModal(project, taskDef, taskVendors, initialSubject, initialBody);
}

// クイックメール機能 - ワンクリックでメール作成画面を開く
function quickEmail(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  // 最もよく使うタスク（構造依頼など）を取得、またはカスタムテンプレートを表示
  const quickModal = document.createElement('div');
  quickModal.id = 'quickEmailModal';
  quickModal.className = 'modal-overlay';
  quickModal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';

  // タスクリストを取得（taskMappings + vendorsを使用）
  const tasks = getTasksForAssignee(project.assigned_to);
  const tasksWithVendors = tasks.filter(t => {
    const templateId = taskMappings[t.task_key] || t.task_key;
    return vendors.some(v => v.template_id === templateId);
  });

  const taskOptions = tasksWithVendors.map(t =>
    `<button class="quick-email-btn" onclick="openEmailFromTask('${projectId}', '${t.task_key}'); document.getElementById('quickEmailModal').remove();" style="display: flex; align-items: center; gap: 12px; padding: 16px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; width: 100%; text-align: left; transition: all 0.2s;" onmouseover="this.style.background='var(--primary-light)'; this.style.borderColor='var(--primary-color)'" onmouseout="this.style.background='var(--bg-secondary)'; this.style.borderColor='var(--border-color)'">
      <span style="font-size: 20px;">📧</span>
      <span style="font-weight: 500;">${escapeHtml(t.task_name)}</span>
    </button>`
  ).join('');

  quickModal.innerHTML = `
    <div class="modal-content" style="background: var(--bg-primary); border-radius: 12px; max-width: 500px; width: 90%;">
      <div class="modal-header" style="padding: 20px; border-bottom: 1px solid var(--border-color);">
        <h3 style="font-size: 18px; font-weight: 600; margin: 0;">📧 クイックメール - ${escapeHtml(project.customer)}</h3>
      </div>
      <div class="modal-body" style="padding: 20px; max-height: 60vh; overflow-y: auto;">
        <p style="margin-bottom: 16px; color: var(--text-secondary);">メールを送信するタスクを選択してください</p>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${taskOptions || '<p style="color: var(--text-muted);">メール送信可能なタスクがありません</p>'}
        </div>
      </div>
      <div class="modal-footer" style="padding: 16px 20px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end;">
        <button class="btn btn-ghost" onclick="document.getElementById('quickEmailModal').remove()">閉じる</button>
      </div>
    </div>
  `;
  quickModal.addEventListener('click', (e) => {
    if (e.target === quickModal) quickModal.remove();
  });
  document.body.appendChild(quickModal);
}

function showEmailModal(project, taskDef, vendors, initialSubject, initialBody) {
  const modal = document.getElementById('emailModal');
  const content = document.getElementById('emailComposerContent');

  // 業者選択チェックボックスのHTML（XSS対策: escapeHtml適用）
  const vendorCheckboxes = vendors.map((v, idx) => `
    <label style="display: flex; align-items: center; gap: 8px; padding: 12px; background: var(--bg-secondary); border-radius: var(--radius-md); cursor: pointer;">
      <input type="checkbox"
        id="vendor_${escapeHtml(v.id)}"
        value="${escapeHtml(v.id)}"
        ${idx === 0 ? 'checked' : ''}
        onchange="updateEmailPreview()"
        style="width: 18px; height: 18px; cursor: pointer;">
      <div style="flex: 1;">
        <div style="font-weight: 600; margin-bottom: 2px;">${escapeHtml(v.company)}</div>
        <div style="font-size: 13px; color: var(--text-secondary);">${escapeHtml(v.contact || '')} - ${escapeHtml(v.email || '')}</div>
      </div>
    </label>
  `).join('');

  content.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 20px;">
      <div>
        <h3 style="margin: 0 0 8px 0; font-size: 18px;">📧 ${escapeHtml(taskDef.task_name)} - メール作成</h3>
        <div style="font-size: 14px; color: var(--text-secondary);">案件: ${escapeHtml(project.customer)}</div>
      </div>

      <div>
        <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 14px;">宛先業者を選択</label>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${vendorCheckboxes}
        </div>
      </div>

      <div>
        <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 14px;">件名</label>
        <input type="text" id="emailSubject" class="form-input" value="${escapeHtml(initialSubject)}">
      </div>

      <div>
        <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 14px;">本文</label>
        <textarea id="emailBody" class="form-textarea" rows="15" style="font-family: inherit; line-height: 1.8;">${escapeHtml(initialBody)}</textarea>
      </div>

      <div style="display: flex; gap: 12px; justify-content: flex-end; flex-wrap: wrap;">
        <button class="btn btn-secondary" onclick="closeEmailModal()">キャンセル</button>
        <button class="btn btn-secondary" onclick="copyEmailToClipboard()">📋 コピー</button>
        <button class="btn btn-secondary" onclick="openOutlookFromModal()">📨 Outlook</button>
        <button class="btn btn-primary" onclick="openGmailFromModal()">📧 Gmail</button>
      </div>
    </div>
  `;

  // グローバルに保存（openGmailFromModalで使用）
  window.__emailModalData = { project, taskDef, vendors };

  modal.classList.add('show');
}

function updateEmailPreview() {
  // 必要に応じて件名・本文のプレビュー更新処理を追加
}

// メールアドレス取得共通関数
function getSelectedEmailAddresses() {
  const { vendors } = window.__emailModalData || {};
  if (!vendors) return { addresses: '', vendors: [] };

  const selectedVendorIds = vendors
    .filter(v => document.getElementById(`vendor_${v.id}`)?.checked)
    .map(v => v.id);

  if (selectedVendorIds.length === 0) {
    showToast('業者を選択してください', 'error');
    return { addresses: '', vendors: [] };
  }

  const selectedVendors = vendors.filter(v => selectedVendorIds.includes(v.id));
  const emailAddresses = selectedVendors.map(v => v.email).filter(e => e).join(',');

  if (!emailAddresses) {
    showToast('選択された業者にメールアドレスが設定されていません', 'error');
    return { addresses: '', vendors: [] };
  }

  return { addresses: emailAddresses, vendors: selectedVendors };
}

function openGmailFromModal() {
  const subject = document.getElementById('emailSubject').value;
  const body = document.getElementById('emailBody').value;
  const { addresses } = getSelectedEmailAddresses();

  if (!addresses) return;

  // 本文に「添付」が含まれる場合のみ警告を表示
  if (body.includes('添付')) {
    if (!confirm('⚠️ 添付ファイルの確認\n\n本文に「添付」という記載がありますが、ファイルはGmail側で添付する必要があります。\n\n資料の準備はできていますか？')) {
      return;
    }
  }

  // Gmail URLを生成
  const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(addresses)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  // Gmailを新しいタブで開く
  window.open(gmailUrl, '_blank');

  // 送信履歴を記録
  logEmailSent('gmail', addresses, subject);

  // モーダルを閉じる
  closeEmailModal();

  // トーストで通知（添付がある場合のみ警告）
  const toastMsg = body.includes('添付') ? 'Gmailを開きました。資料の添付を忘れずに！' : 'Gmailを開きました';
  showToast(toastMsg, 'success');
}

function openOutlookFromModal() {
  const subject = document.getElementById('emailSubject').value;
  const body = document.getElementById('emailBody').value;
  const { addresses } = getSelectedEmailAddresses();

  if (!addresses) return;

  // 本文に「添付」が含まれる場合のみ警告を表示
  if (body.includes('添付')) {
    if (!confirm('⚠️ 添付ファイルの確認\n\n本文に「添付」という記載がありますが、ファイルはOutlook側で添付する必要があります。\n\n資料の準備はできていますか？')) {
      return;
    }
  }

  // mailto: URLを生成（PCのOutlookアプリが開く）
  const mailtoUrl = `mailto:${encodeURIComponent(addresses)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  // PCのデフォルトメールアプリを開く
  window.location.href = mailtoUrl;

  // 送信履歴を記録
  logEmailSent('outlook', addresses, subject);

  // モーダルを閉じる
  closeEmailModal();

  // トーストで通知（添付がある場合のみ警告）
  const toastMsg = body.includes('添付') ? 'Outlookを開きました。資料の添付を忘れずに！' : 'Outlookを開きました';
  showToast(toastMsg, 'success');
}

function copyEmailToClipboard() {
  const subject = document.getElementById('emailSubject').value;
  const body = document.getElementById('emailBody').value;
  const { addresses } = getSelectedEmailAddresses();

  if (!addresses) return;

  const emailText = `宛先: ${addresses}\n件名: ${subject}\n\n${body}`;

  navigator.clipboard.writeText(emailText).then(() => {
    showToast('メール内容をコピーしました', 'success');
  }).catch(() => {
    // フォールバック
    const textarea = document.createElement('textarea');
    textarea.value = emailText;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('メール内容をコピーしました', 'success');
  });
}

// メール送信履歴を記録
async function logEmailSent(method, to, subject) {
  const { project, taskDef } = window.__emailModalData || {};
  if (!project || !taskDef) return;

  log(`📧 メール送信記録: ${method} -> ${to}, 件名: ${subject}`);

  // 将来: Supabaseに送信履歴を保存
  // try {
  //   await supabase.from('email_logs').insert({
  //     project_id: project.id,
  //     task_key: taskDef.task_key,
  //     method,
  //     recipients: to,
  //     subject,
  //     sent_at: new Date().toISOString()
  //   });
  // } catch (e) {
  //   logError('メール履歴保存失敗:', e);
  // }
}

// テンプレート選択画面を表示
function showTemplateSelector(projectId, taskKey) {
  const project = projects.find(p => p.id === projectId);
  const currentTaskNames = getTaskNames();
  const taskName = currentTaskNames[taskKey];

  // 現在のカテゴリに応じたテンプレートをフィルタ
  const availableTemplates = emailTemplates.filter(t => t.category === currentUserCategory);

  let html = `
    <div class="form-section">
      <h3 style="margin-bottom: 8px; color: var(--text-primary);">メールテンプレート選択</h3>
      <p style="margin-bottom: 24px; color: var(--text-secondary); font-size: 14px;">
        案件：${project.customer} ／ タスク：${taskName}
      </p>

      <div style="display: grid; gap: 12px;">
        ${availableTemplates.map(template => `
          <button class="template-select-btn" onclick="selectTemplateForTask('${projectId}', '${taskKey}', '${template.template_id}')">
            <div style="font-weight: 600; margin-bottom: 4px;">${template.display_name}</div>
            <div style="font-size: 13px; color: var(--text-secondary);">${template.company}</div>
          </button>
        `).join('')}
      </div>

      ${availableTemplates.length === 0 ? '<p style="text-align: center; padding: 32px; color: var(--text-muted);">利用可能なテンプレートがありません</p>' : ''}
    </div>
  `;

  document.getElementById('emailComposerContent').innerHTML = html;
  ModalManager.open(document.getElementById('emailModal'));
}

// テンプレート選択後にメール作成画面を表示
function selectTemplateForTask(projectId, taskKey, templateId) {
  const project = projects.find(p => p.id === projectId);
  const template = emailTemplates.find(t => t.template_id === templateId);
  const designer = designers.find(d => d.id === project.designer_id);
  const staffName = designer ? designer.name : '';

  const composerHTML = createEmailComposer(project, template, staffName, taskKey);
  document.getElementById('emailComposerContent').innerHTML = composerHTML;
}

function createEmailComposer(project, template, staffName, taskKey) {
  const hasSubOptions = template.has_sub_options;
  const hasSpecialContent = template.has_special_content;

  let html = `
    <div class="form-section">
      <h3 style="margin-bottom: 16px; color: var(--text-primary);">${template.display_name}</h3>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
        <div class="form-group">
          <label class="form-label">お客様名:</label>
          <input type="text" class="form-input" id="modalCustomerName" value="${escapeHtml(project.customer)}" readonly style="background: #f5f5f5;">
        </div>
        <div class="form-group">
          <label class="form-label">担当者名:</label>
          <input type="text" class="form-input" id="modalStaffName" value="${escapeHtml(staffName)}" oninput="updateModalEmail()">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">期日:</label>
        <input type="date" class="form-input" id="modalDueDate" oninput="updateModalEmail()">
      </div>
  `;

  if (hasSpecialContent) {
    const defaultContent = template.default_special_content || '';
    html += `
      <div class="form-group">
        <label class="form-label">特記事項:</label>
        <textarea class="form-textarea" id="modalSpecialContent" rows="4" oninput="updateModalEmail()">${defaultContent}</textarea>
      </div>
    `;
  }

  if (hasSubOptions) {
    const templateVendors = vendors.filter(v => v.template_id === template.template_id);
    html += `
      <div class="form-group">
        <label class="form-label">業者選択:</label>
        <select class="form-select" id="modalVendorSelect" onchange="updateModalEmail()">
          <option value="">選択してください</option>
          ${templateVendors.map(v => `<option value="${escapeHtml(v.vendor_id)}">${escapeHtml(v.company)}</option>`).join('')}
        </select>
      </div>
    `;
  }

  html += `
    </div>

    <div style="margin-top: 24px;">
      <h3 style="margin-bottom: 12px; color: var(--text-primary);">📬 生成されたメール</h3>

      <div class="form-group">
        <label class="form-label">件名:</label>
        <div id="modalEmailSubject" style="padding: 12px; background: #f8f9fa; border-radius: 8px; font-weight: 500;"></div>
        <button class="btn btn-ghost btn-small" onclick="copyModalText('modalEmailSubject')" style="margin-top: 8px;">📋 件名をコピー</button>
      </div>

      <div class="form-group">
        <label class="form-label">送信先:</label>
        <div id="modalEmailAddress" style="padding: 12px; background: #f8f9fa; border-radius: 8px; color: var(--primary-color);"></div>
        <button class="btn btn-ghost btn-small" onclick="copyModalText('modalEmailAddress')" style="margin-top: 8px;">📋 アドレスをコピー</button>
      </div>

      <div class="form-group">
        <label class="form-label">本文:</label>
        <div id="modalEmailBody" style="padding: 16px; background: #f8f9fa; border-radius: 8px; white-space: pre-wrap; line-height: 1.8; min-height: 200px;"></div>
        <button class="btn btn-ghost btn-small" onclick="copyModalText('modalEmailBody')" style="margin-top: 8px;">📋 本文をコピー</button>
      </div>
    </div>

    <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
      <button class="btn btn-secondary" onclick="closeEmailModal()">閉じる</button>
      <button class="btn btn-primary" onclick="markTaskAsRequested('${project.id}', '${taskKey}')">依頼済みにする</button>
    </div>
  `;

  // データを保存（updateModalEmailで使用）
  window.__currentEmailData = {
    project,
    template,
    staffName,
    taskKey
  };

  // 初回メール生成
  setTimeout(() => updateModalEmail(), 100);

  return html;
}

function updateModalEmail() {
  if (!window.__currentEmailData) return;

  const { project, template } = window.__currentEmailData;

  const customerName = document.getElementById('modalCustomerName')?.value || project.customer;
  const staffName = document.getElementById('modalStaffName')?.value || '';
  const dueDate = document.getElementById('modalDueDate')?.value || '';
  const specialContent = document.getElementById('modalSpecialContent')?.value || template.default_special_content || '';
  const vendorSelect = document.getElementById('modalVendorSelect');
  const selectedVendorId = vendorSelect?.value || '';

  let subject = template.subject_format || '';
  let body = template.template_text || '';
  let email = template.email || '';
  let company = template.company || '';
  let contact = template.contact || '';

  // サブオプションがある場合は業者情報を使用
  if (template.has_sub_options && selectedVendorId) {
    const vendor = vendors.find(v => v.template_id === template.template_id && v.vendor_id === selectedVendorId);
    if (vendor) {
      company = vendor.company;
      contact = vendor.contact || 'ご担当者様';
      email = vendor.email || '';
    }
  }

  // 変数を置換
  subject = subject
    .replace(/\{customerName\}/g, customerName)
    .replace(/\{dueDate\}/g, dueDate);

  body = body
    .replace(/\{company\}/g, company)
    .replace(/\{contact\}/g, contact)
    .replace(/\{customerName\}/g, customerName)
    .replace(/\{staffName\}/g, staffName)
    .replace(/\{dueDate\}/g, dueDate)
    .replace(/\{specialContent\}/g, specialContent);

  // 表示を更新
  const subjectEl = document.getElementById('modalEmailSubject');
  const addressEl = document.getElementById('modalEmailAddress');
  const bodyEl = document.getElementById('modalEmailBody');

  if (subjectEl) subjectEl.textContent = subject;
  if (addressEl) addressEl.textContent = email;
  if (bodyEl) bodyEl.textContent = body;
}

function copyModalText(elementId) {
  const text = document.getElementById(elementId)?.textContent;
  if (!text || text.includes('{') || text.includes('選択してください')) {
    showToast('コピーできる内容がありません', 'error');
    return;
  }

  navigator.clipboard.writeText(text).then(() => {
    showToast('コピーしました！', 'success');
  }).catch(err => {
    logError('コピーに失敗:', err);
    showToast('コピーに失敗しました', 'error');
  });
}

async function markTaskAsRequested(projectId, taskKey) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  const progressData = project.progress || {};
  if (!progressData[taskKey]) progressData[taskKey] = {};
  progressData[taskKey].state = '依頼済';

  showStatus('保存中...', 'saving');
  const { error } = await supabase
    .from('projects')
    .update({ progress: progressData, updated_at: new Date().toISOString() })
    .eq('id', projectId);

  if (error) {
    logError('更新エラー:', error);
    showStatus('エラー', 'error');
    showToast('保存に失敗しました', 'error');
    return;
  }

  project.progress = progressData;
  markLocalUpdate(projectId); // リアルタイム同期の二重更新防止
  renderProjects();
  closeEmailModal();
  showStatus('保存済み', 'saved');
  showToast('依頼済みに更新しました', 'success');
}

function closeEmailModal() {
  ModalManager.close(document.getElementById('emailModal'));
  window.__currentEmailData = null;
}

// ============================================
// 統一メールテンプレートユーティリティ
// DBテンプレートを使用してメールを生成
// ============================================
const EmailTemplateUtil = {
  // DBからテンプレートを取得
  getTemplate(templateId) {
    return emailTemplates.find(t => t.template_id === templateId);
  },

  // 業者一覧を取得（複数業者選択テンプレート用）
  getVendors(templateId) {
    return vendors.filter(v => v.template_id === templateId);
  },

  // 担当者情報を取得
  getStaffInfo(project) {
    const designer = designers.find(d => d.id === project.designer_id);
    return {
      name: designer?.name || '',
      phone: designer?.phone || '',
      email: designer?.email || ''
    };
  },

  // テンプレート変数を置換
  replaceVariables(text, variables) {
    if (!text) return '';
    let result = text;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      result = result.replace(regex, value || '');
    }
    return result;
  },

  // メール本文を生成（標準形式）
  generateEmail(templateId, project, options = {}) {
    const template = this.getTemplate(templateId);
    if (!template) {
      console.error('テンプレートが見つかりません:', templateId);
      return null;
    }

    const staff = this.getStaffInfo(project);
    const dueDate = options.dueDate || getNextFriday();
    const dueDateFormatted = formatDateJapanese(dueDate);

    // 業者情報（サブオプション用）
    let company = template.company || '';
    let contact = template.contact || '';
    let email = template.email || '';

    if (template.has_sub_options && options.vendorId) {
      const vendor = this.getVendors(templateId).find(v => v.vendor_id === options.vendorId);
      if (vendor) {
        company = vendor.company;
        contact = vendor.contact;
        email = vendor.email;
      }
    }

    // 変数マッピング
    const variables = {
      customerName: project.customer || '',
      staffName: staff.name,
      staffPhone: staff.phone,
      staffEmail: staff.email,
      dueDate: dueDateFormatted,
      company: company,
      contact: contact,
      specialContent: options.specialContent || template.default_special_content || '',
      // サッシ用の追加変数
      region: options.region || '',
      entranceDoor: options.entranceDoor || '',
      sashColor: options.sashColor || '',
      // 互換性のための追加変数
      toCompany: company,
      toName: contact.replace(/さま|様/g, ''),
      toHonorific: contact.includes('さま') ? 'さま' : (contact.includes('様') ? '様' : '')
    };

    // 件名と本文を生成
    const subject = this.replaceVariables(template.subject_format, variables);
    const body = this.replaceVariables(template.template_text, variables);

    return {
      to: email,
      cc: '', // CCは必要に応じて設定
      subject,
      body,
      template,
      variables
    };
  }
};

// ============================================
// サッシプレゼン・開口部リスト作成依頼
// ============================================
let currentSashProjectId = null;
let currentSashProject = null;

// サッシ依頼モーダルを開く
function openSashRequestModal(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) {
    showToast('案件が見つかりません', 'error');
    return;
  }

  currentSashProjectId = projectId;
  currentSashProject = project;
  const staff = EmailTemplateUtil.getStaffInfo(project);

  // フォームにデータをセット
  document.getElementById('sashCustomerName').value = project.customer || '';
  document.getElementById('sashStaffName').value = staff.name;
  document.getElementById('sashDueDate').value = getNextFriday();
  document.getElementById('sashEntranceDoor').value = 'C10　カームブラック(仮)';
  document.getElementById('sashColor').value = '内外ブラック(仮)';

  // 地域オプションを動的生成
  const regionOptions = ['準防火地域', '法22条地域', '指定なし'];
  const regionSelect = document.getElementById('sashRegion');
  regionSelect.innerHTML = regionOptions
    .map(opt => `<option value="${escapeHtml(opt)}" ${opt === '準防火地域' ? 'selected' : ''}>${escapeHtml(opt)}</option>`)
    .join('');

  // メールプレビューを更新
  updateSashEmail();

  // モーダルを開く
  ModalManager.open(document.getElementById('sashRequestModal'));
}

// サッシ依頼モーダルを閉じる
function closeSashRequestModal() {
  ModalManager.close(document.getElementById('sashRequestModal'));
  currentSashProjectId = null;
  currentSashProject = null;
}

// サッシ依頼メールを更新
function updateSashEmail() {
  const template = EmailTemplateUtil.getTemplate('ogura');
  if (!template) {
    console.error('ogumaテンプレートが見つかりません');
    return;
  }

  // 入力値を取得
  const customerName = document.getElementById('sashCustomerName')?.value || '{お客様名}';
  const staffNameInput = document.getElementById('sashStaffName')?.value || '{担当者名}';
  const dueDateRaw = document.getElementById('sashDueDate')?.value || '';
  const dueDate = dueDateRaw ? formatDateJapanese(dueDateRaw) : '{期日}';
  const region = document.getElementById('sashRegion')?.value || '準防火地域';
  const entranceDoor = document.getElementById('sashEntranceDoor')?.value || '';
  const sashColor = document.getElementById('sashColor')?.value || '';

  // 担当者情報を取得
  const staff = currentSashProject ? EmailTemplateUtil.getStaffInfo(currentSashProject) : { name: '', phone: '', email: '' };

  // 業者情報を取得（template_vendorsから）
  const oguravVendors = EmailTemplateUtil.getVendors('ogura');
  const vendor = oguravVendors[0]; // 最初の業者を使用

  // 宛先を設定（業者から取得、なければテンプレートから）
  document.getElementById('sashEmailTo').textContent = vendor?.email || template.email || '';
  document.getElementById('sashEmailCc').textContent = vendor?.cc_email || '';

  // 変数マッピング
  const variables = {
    customerName,
    staffName: staffNameInput || staff.name,
    staffPhone: staff.phone || '',
    staffEmail: staff.email || '',
    dueDate,
    company: vendor?.company || template.company || '',
    contact: vendor?.contact || template.contact || '',
    region,
    entranceDoor,
    sashColor
  };

  // 件名を生成
  const subject = EmailTemplateUtil.replaceVariables(template.subject_format, variables);
  document.getElementById('sashEmailSubject').textContent = subject;

  // 本文を生成
  const body = EmailTemplateUtil.replaceVariables(template.template_text, variables);
  document.getElementById('sashEmailBody').textContent = body;
}

// サッシテキストをコピー
function copySashText(elementId) {
  const el = document.getElementById(elementId);
  const text = el?.textContent;
  if (!text || text.includes('{')) {
    showToast('入力内容を確認してください', 'error');
    return;
  }

  navigator.clipboard.writeText(text).then(() => {
    showToast('コピーしました！', 'success');
  }).catch(err => {
    logError('コピーに失敗:', err);
    showToast('コピーに失敗しました', 'error');
  });
}

// サッシ依頼を依頼済みにする
async function markSashAsRequested() {
  if (!currentSashProjectId) return;

  const project = projects.find(p => p.id === currentSashProjectId);
  if (!project) return;

  const progressData = project.progress || {};
  if (!progressData['sash']) progressData['sash'] = {};
  progressData['sash'].state = '依頼済';

  showStatus('保存中...', 'saving');
  const { error } = await supabase
    .from('projects')
    .update({ progress: progressData, updated_at: new Date().toISOString() })
    .eq('id', currentSashProjectId);

  if (error) {
    logError('更新エラー:', error);
    showStatus('エラー', 'error');
    showToast('保存に失敗しました', 'error');
    return;
  }

  project.progress = progressData;
  markLocalUpdate(currentSashProjectId);
  renderProjects();
  closeSashRequestModal();
  showStatus('保存済み', 'saved');
  showToast('サッシ依頼を依頼済みにしました', 'success');
}

// ============================================
// ダンパー（evoltz）依頼
// ============================================
let currentDamperProjectId = null;
let currentDamperProject = null;

// ダンパー依頼モーダルを開く
function openDamperRequestModal(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) {
    showToast('案件が見つかりません', 'error');
    return;
  }

  currentDamperProjectId = projectId;
  currentDamperProject = project;
  const staff = EmailTemplateUtil.getStaffInfo(project);

  // フォームにデータをセット
  document.getElementById('damperCustomerName').value = project.customer || '';
  document.getElementById('damperStaffName').value = staff.name;

  // メールプレビューを更新
  updateDamperEmail();

  // モーダルを開く
  ModalManager.open(document.getElementById('damperRequestModal'));
}

// ダンパー依頼モーダルを閉じる
function closeDamperRequestModal() {
  ModalManager.close(document.getElementById('damperRequestModal'));
  currentDamperProjectId = null;
  currentDamperProject = null;
}

// ダンパー依頼メールを更新
function updateDamperEmail() {
  const template = EmailTemplateUtil.getTemplate('senpaku');
  if (!template) {
    console.error('senpakuテンプレートが見つかりません');
    return;
  }

  // 入力値を取得
  const customerName = document.getElementById('damperCustomerName')?.value || '{お客様名}';
  const staffNameInput = document.getElementById('damperStaffName')?.value || '{担当者名}';

  // 担当者情報を取得
  const staff = currentDamperProject ? EmailTemplateUtil.getStaffInfo(currentDamperProject) : { name: '', phone: '', email: '' };

  // 業者情報を取得（template_vendorsから）
  const senpakuVendors = EmailTemplateUtil.getVendors('senpaku');
  const vendor = senpakuVendors[0]; // 最初の業者を使用

  // 宛先を設定（業者から取得、なければテンプレートから）
  document.getElementById('damperEmailTo').textContent = vendor?.email || template.email || '';
  document.getElementById('damperEmailCc').textContent = vendor?.cc_email || '';

  // 変数マッピング
  const variables = {
    customerName,
    staffName: staffNameInput || staff.name,
    staffPhone: staff.phone || '',
    staffEmail: staff.email || '',
    company: vendor?.company || template.company || '',
    contact: vendor?.contact || template.contact || ''
  };

  // 件名を生成
  const subject = EmailTemplateUtil.replaceVariables(template.subject_format, variables);
  document.getElementById('damperEmailSubject').textContent = subject;

  // 本文を生成
  const body = EmailTemplateUtil.replaceVariables(template.template_text, variables);
  document.getElementById('damperEmailBody').textContent = body;
}

// ダンパーテキストをコピー
function copyDamperText(elementId) {
  const el = document.getElementById(elementId);
  const text = el?.textContent;
  if (!text || text.includes('{')) {
    showToast('入力内容を確認してください', 'error');
    return;
  }

  navigator.clipboard.writeText(text).then(() => {
    showToast('コピーしました！', 'success');
  }).catch(err => {
    logError('コピーに失敗:', err);
    showToast('コピーに失敗しました', 'error');
  });
}

// ダンパー依頼を依頼済みにする
async function markDamperAsRequested() {
  if (!currentDamperProjectId) return;

  const project = projects.find(p => p.id === currentDamperProjectId);
  if (!project) return;

  const progressData = project.progress || {};
  if (!progressData['damper']) progressData['damper'] = {};
  progressData['damper'].state = '依頼済';

  showStatus('保存中...', 'saving');
  const { error } = await supabase
    .from('projects')
    .update({ progress: progressData, updated_at: new Date().toISOString() })
    .eq('id', currentDamperProjectId);

  if (error) {
    logError('更新エラー:', error);
    showStatus('エラー', 'error');
    showToast('保存に失敗しました', 'error');
    return;
  }

  project.progress = progressData;
  markLocalUpdate(currentDamperProjectId);
  renderProjects();
  closeDamperRequestModal();
  showStatus('保存済み', 'saved');
  showToast('ダンパー依頼を依頼済みにしました', 'success');
}

// ============================================
// 換気システム依頼（標準パナソニック）
// ============================================
let currentVentilationProjectId = null;
let currentVentilationProject = null;

// 換気システム依頼モーダルを開く
function openVentilationRequestModal(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) {
    showToast('案件が見つかりません', 'error');
    return;
  }

  currentVentilationProjectId = projectId;
  currentVentilationProject = project;
  const staff = EmailTemplateUtil.getStaffInfo(project);

  // フォームにデータをセット
  document.getElementById('ventilationCustomerName').value = project.customer || '';
  document.getElementById('ventilationStaffName').value = staff.name;
  document.getElementById('ventilationDueDate').value = getNextWeekFriday(); // 翌週金曜日

  // メールプレビューを更新
  updateVentilationEmail();

  // モーダルを開く
  ModalManager.open(document.getElementById('ventilationRequestModal'));
}

// 換気システム依頼モーダルを閉じる
function closeVentilationRequestModal() {
  ModalManager.close(document.getElementById('ventilationRequestModal'));
  currentVentilationProjectId = null;
  currentVentilationProject = null;
}

// 換気システム依頼メールを更新
function updateVentilationEmail() {
  const template = EmailTemplateUtil.getTemplate('panasonic');
  if (!template) {
    console.error('panasonicテンプレートが見つかりません');
    return;
  }

  // 入力値を取得
  const customerName = document.getElementById('ventilationCustomerName')?.value || '{お客様名}';
  const staffNameInput = document.getElementById('ventilationStaffName')?.value || '{担当者名}';
  const dueDateRaw = document.getElementById('ventilationDueDate')?.value || '';
  const dueDate = dueDateRaw ? formatDateJapanese(dueDateRaw) : '{期日}';

  // 担当者情報を取得
  const staff = currentVentilationProject ? EmailTemplateUtil.getStaffInfo(currentVentilationProject) : { name: '', phone: '', email: '' };

  // 業者情報を取得（template_vendorsから）
  const panasonicVendors = EmailTemplateUtil.getVendors('panasonic');
  const vendor = panasonicVendors[0]; // 最初の業者を使用

  // 宛先を設定（業者から取得、なければテンプレートから）
  document.getElementById('ventilationEmailTo').textContent = vendor?.email || template.email || '';
  document.getElementById('ventilationEmailCc').textContent = vendor?.cc_email || '';

  // 変数マッピング
  const variables = {
    customerName,
    staffName: staffNameInput || staff.name,
    staffPhone: staff.phone || '',
    staffEmail: staff.email || '',
    dueDate,
    company: vendor?.company || template.company || '',
    contact: vendor?.contact || template.contact || ''
  };

  // 件名を生成
  const subject = EmailTemplateUtil.replaceVariables(template.subject_format, variables);
  document.getElementById('ventilationEmailSubject').textContent = subject;

  // 本文を生成
  const body = EmailTemplateUtil.replaceVariables(template.template_text, variables);
  document.getElementById('ventilationEmailBody').textContent = body;
}

// 換気システムテキストをコピー
function copyVentilationText(elementId) {
  const el = document.getElementById(elementId);
  const text = el?.textContent;
  if (!text || text.includes('{')) {
    showToast('入力内容を確認してください', 'error');
    return;
  }

  navigator.clipboard.writeText(text).then(() => {
    showToast('コピーしました！', 'success');
  }).catch(err => {
    logError('コピーに失敗:', err);
    showToast('コピーに失敗しました', 'error');
  });
}

// 換気システム依頼を依頼済みにする
async function markVentilationAsRequested() {
  if (!currentVentilationProjectId) return;

  const project = projects.find(p => p.id === currentVentilationProjectId);
  if (!project) return;

  const progressData = project.progress || {};
  if (!progressData['ventilation']) progressData['ventilation'] = {};
  progressData['ventilation'].state = '依頼済';

  showStatus('保存中...', 'saving');
  const { error } = await supabase
    .from('projects')
    .update({ progress: progressData, updated_at: new Date().toISOString() })
    .eq('id', currentVentilationProjectId);

  if (error) {
    logError('更新エラー:', error);
    showStatus('エラー', 'error');
    showToast('保存に失敗しました', 'error');
    return;
  }

  project.progress = progressData;
  markLocalUpdate(currentVentilationProjectId);
  renderProjects();
  closeVentilationRequestModal();
  showStatus('保存済み', 'saved');
  showToast('換気システム依頼を依頼済みにしました', 'success');
}

// ============================================
// 地盤調査依頼
// ============================================
let currentGroundSurveyProjectId = null;
let currentGroundSurveyProject = null;

// 地盤調査依頼モーダルを開く
function openGroundSurveyRequestModal(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) {
    showToast('案件が見つかりません', 'error');
    return;
  }

  currentGroundSurveyProjectId = projectId;
  currentGroundSurveyProject = project;
  const staff = EmailTemplateUtil.getStaffInfo(project);

  // フォームにデータをセット
  document.getElementById('groundSurveyCustomerName').value = project.customer || '';
  document.getElementById('groundSurveyStaffName').value = staff.name;
  document.getElementById('groundSurveyDueDate').value = getNextFriday();

  // エリアオプションを動的生成（DBから取得）
  const groundSurveyVendors = EmailTemplateUtil.getVendors('ground_survey');
  const vendorSelect = document.getElementById('groundSurveyVendor');
  vendorSelect.innerHTML = groundSurveyVendors.map((v, i) =>
    `<option value="${v.vendor_id}" ${i === 0 ? 'selected' : ''}>${escapeHtml(v.company)}</option>`
  ).join('');

  // メールプレビューを更新（最初の業者で自動生成）
  updateGroundSurveyEmail();

  // モーダルを開く
  ModalManager.open(document.getElementById('groundSurveyRequestModal'));
}

// 地盤調査依頼モーダルを閉じる
function closeGroundSurveyRequestModal() {
  ModalManager.close(document.getElementById('groundSurveyRequestModal'));
  currentGroundSurveyProjectId = null;
  currentGroundSurveyProject = null;
}

// 地盤調査依頼メールを更新
function updateGroundSurveyEmail() {
  const template = EmailTemplateUtil.getTemplate('ground_survey');
  if (!template) {
    console.error('ground_surveyテンプレートが見つかりません');
    return;
  }

  // 入力値を取得
  const customerName = document.getElementById('groundSurveyCustomerName')?.value || '{お客様名}';
  const staffNameInput = document.getElementById('groundSurveyStaffName')?.value || '{担当者名}';
  const dueDateRaw = document.getElementById('groundSurveyDueDate')?.value || '';
  const dueDate = dueDateRaw ? formatDateJapanese(dueDateRaw) : '{期日}';
  const vendorId = document.getElementById('groundSurveyVendor')?.value || '';

  // 担当者情報を取得
  const staff = currentGroundSurveyProject ? EmailTemplateUtil.getStaffInfo(currentGroundSurveyProject) : { name: '', phone: '', email: '' };

  // 業者情報を取得（DBから）
  const groundSurveyVendors = EmailTemplateUtil.getVendors('ground_survey');
  const vendor = groundSurveyVendors.find(v => v.vendor_id === vendorId);

  if (vendor) {
    document.getElementById('groundSurveyEmailTo').textContent = vendor.email;
    document.getElementById('groundSurveyEmailCc').textContent = vendor.cc_email || '';
  } else {
    document.getElementById('groundSurveyEmailTo').textContent = 'エリアを選択してください';
    document.getElementById('groundSurveyEmailCc').textContent = '';
  }

  // 変数マッピング
  const variables = {
    customerName,
    staffName: staffNameInput || staff.name,
    staffPhone: staff.phone || '',
    staffEmail: staff.email || '',
    dueDate,
    company: vendor?.company || '',
    contact: vendor?.contact || ''
  };

  // 件名を生成
  const subject = EmailTemplateUtil.replaceVariables(template.subject_format, variables);
  document.getElementById('groundSurveyEmailSubject').textContent = subject;

  // 本文を生成
  if (vendor) {
    const body = EmailTemplateUtil.replaceVariables(template.template_text, variables);
    document.getElementById('groundSurveyEmailBody').textContent = body;
  } else {
    document.getElementById('groundSurveyEmailBody').textContent = 'エリアを選択すると本文が生成されます';
  }
}

// 地盤調査テキストをコピー
function copyGroundSurveyText(elementId) {
  const el = document.getElementById(elementId);
  const text = el?.textContent;
  if (!text || text.includes('{') || text.includes('選択してください')) {
    showToast('入力内容を確認してください', 'error');
    return;
  }

  navigator.clipboard.writeText(text).then(() => {
    showToast('コピーしました！', 'success');
  }).catch(err => {
    logError('コピーに失敗:', err);
    showToast('コピーに失敗しました', 'error');
  });
}

// 地盤調査依頼を依頼済みにする
async function markGroundSurveyAsRequested() {
  if (!currentGroundSurveyProjectId) return;

  const project = projects.find(p => p.id === currentGroundSurveyProjectId);
  if (!project) return;

  const progressData = project.progress || {};
  if (!progressData['groundSurvey']) progressData['groundSurvey'] = {};
  progressData['groundSurvey'].state = '依頼済';

  showStatus('保存中...', 'saving');
  const { error } = await supabase
    .from('projects')
    .update({ progress: progressData, updated_at: new Date().toISOString() })
    .eq('id', currentGroundSurveyProjectId);

  if (error) {
    logError('更新エラー:', error);
    showStatus('エラー', 'error');
    showToast('保存に失敗しました', 'error');
    return;
  }

  project.progress = progressData;
  markLocalUpdate(currentGroundSurveyProjectId);
  renderProjects();
  closeGroundSurveyRequestModal();
  showStatus('保存済み', 'saved');
  showToast('地盤調査依頼を依頼済みにしました', 'success');
}

// ============================================
// 外部給排水経路図依頼
// ============================================
let currentPlumbingProjectId = null;
let currentPlumbingProject = null;

// 外部給排水経路図依頼モーダルを開く
function openPlumbingRequestModal(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) {
    showToast('案件が見つかりません', 'error');
    return;
  }

  currentPlumbingProjectId = projectId;
  currentPlumbingProject = project;
  const staff = EmailTemplateUtil.getStaffInfo(project);

  // フォームにデータをセット
  document.getElementById('plumbingCustomerName').value = project.customer || '';
  document.getElementById('plumbingStaffName').value = staff.name;
  document.getElementById('plumbingDueDate').value = getNextFriday();

  // 業者選択を更新（DBから取得）
  const plumbingVendors = EmailTemplateUtil.getVendors('plumbing');
  const vendorSelect = document.getElementById('plumbingVendor');
  vendorSelect.innerHTML = plumbingVendors.map((v, i) =>
    `<option value="${v.vendor_id}" ${i === 0 ? 'selected' : ''}>${escapeHtml(v.company)}（${escapeHtml(v.contact)}）</option>`
  ).join('');

  // 案件タイプ選択は非表示にする（DB統合のため）
  const projectTypeSelect = document.getElementById('plumbingProjectType');
  if (projectTypeSelect) projectTypeSelect.style.display = 'none';

  // メールプレビューを更新
  updatePlumbingEmail();

  // モーダルを開く
  ModalManager.open(document.getElementById('plumbingRequestModal'));
}

// 外部給排水経路図依頼モーダルを閉じる
function closePlumbingRequestModal() {
  ModalManager.close(document.getElementById('plumbingRequestModal'));
  currentPlumbingProjectId = null;
  currentPlumbingProject = null;
}

// 案件タイプに応じて業者オプションを更新（DB統合後は不要だが互換性のため残す）
function updatePlumbingVendorOptions() {
  updatePlumbingEmail();
}

// 外部給排水経路図依頼メールを更新
function updatePlumbingEmail() {
  const template = EmailTemplateUtil.getTemplate('plumbing');
  if (!template) {
    console.error('plumbingテンプレートが見つかりません');
    return;
  }

  // 入力値を取得
  const customerName = document.getElementById('plumbingCustomerName')?.value || '{お客様名}';
  const staffNameInput = document.getElementById('plumbingStaffName')?.value || '{担当者名}';
  const dueDateRaw = document.getElementById('plumbingDueDate')?.value || '';
  const dueDate = dueDateRaw ? formatDateJapanese(dueDateRaw) : '{期日}';
  const vendorId = document.getElementById('plumbingVendor')?.value || '';

  // 担当者情報を取得
  const staff = currentPlumbingProject ? EmailTemplateUtil.getStaffInfo(currentPlumbingProject) : { name: '', phone: '', email: '' };

  // 業者情報を取得（DBから）
  const plumbingVendors = EmailTemplateUtil.getVendors('plumbing');
  const vendor = plumbingVendors.find(v => v.vendor_id === vendorId);

  if (vendor) {
    document.getElementById('plumbingEmailTo').textContent = vendor.email;
    document.getElementById('plumbingEmailCc').textContent = vendor.cc_email || '';
  } else {
    document.getElementById('plumbingEmailTo').textContent = '業者を選択してください';
    document.getElementById('plumbingEmailCc').textContent = '';
  }

  // 変数マッピング
  const variables = {
    customerName,
    staffName: staffNameInput || staff.name,
    staffPhone: staff.phone || '',
    staffEmail: staff.email || '',
    dueDate,
    company: vendor?.company || '',
    contact: vendor?.contact || ''
  };

  // 件名を生成
  const subject = EmailTemplateUtil.replaceVariables(template.subject_format, variables);
  document.getElementById('plumbingEmailSubject').textContent = subject;

  // 本文を生成
  if (vendor) {
    const body = EmailTemplateUtil.replaceVariables(template.template_text, variables);
    document.getElementById('plumbingEmailBody').textContent = body;
  } else {
    document.getElementById('plumbingEmailBody').textContent = '業者を選択すると本文が生成されます';
  }
}

// 外部給排水経路図テキストをコピー
function copyPlumbingText(elementId) {
  const el = document.getElementById(elementId);
  const text = el?.textContent;
  if (!text || text.includes('{') || text.includes('選択してください')) {
    showToast('入力内容を確認してください', 'error');
    return;
  }

  navigator.clipboard.writeText(text).then(() => {
    showToast('コピーしました！', 'success');
  }).catch(err => {
    logError('コピーに失敗:', err);
    showToast('コピーに失敗しました', 'error');
  });
}

// 外部給排水経路図依頼を依頼済みにする
async function markPlumbingAsRequested() {
  if (!currentPlumbingProjectId) return;

  const project = projects.find(p => p.id === currentPlumbingProjectId);
  if (!project) return;

  const progressData = project.progress || {};
  if (!progressData['plumbing']) progressData['plumbing'] = {};
  progressData['plumbing'].state = '依頼済';

  showStatus('保存中...', 'saving');
  const { error } = await supabase
    .from('projects')
    .update({ progress: progressData, updated_at: new Date().toISOString() })
    .eq('id', currentPlumbingProjectId);

  if (error) {
    logError('更新エラー:', error);
    showStatus('エラー', 'error');
    showToast('保存に失敗しました', 'error');
    return;
  }

  project.progress = progressData;
  markLocalUpdate(currentPlumbingProjectId);
  renderProjects();
  closePlumbingRequestModal();
  showStatus('保存済み', 'saved');
  showToast('外部給排水経路図依頼を依頼済みにしました', 'success');
}

// ============================================
// 独立したメール作成機能（削除予定）
// ============================================
function updateStandaloneEmail() {
  const templateSelect = document.getElementById('standaloneTemplateSelect');
  const templateId = templateSelect.value;

  if (!templateId) {
    // テンプレート未選択時はクリア
    document.getElementById('standaloneEmailSubject').textContent = '';
    document.getElementById('standaloneEmailAddress').textContent = '';
    document.getElementById('standaloneEmailBody').textContent = '';
    document.getElementById('standaloneVendorGroup').style.display = 'none';
    document.getElementById('standaloneSpecialContentGroup').style.display = 'none';
    return;
  }

  const template = emailTemplates.find(t => t.template_id === templateId);
  if (!template) return;

  // 特記事項フィールドの表示/非表示
  if (template.has_special_content) {
    document.getElementById('standaloneSpecialContentGroup').style.display = 'block';
  } else {
    document.getElementById('standaloneSpecialContentGroup').style.display = 'none';
  }

  // 入力値を取得
  const customerName = document.getElementById('standaloneCustomerName').value.trim();
  const staffName = document.getElementById('standaloneStaffName').value.trim();
  const dueDate = document.getElementById('standaloneDueDate').value;
  const specialContent = document.getElementById('standaloneSpecialContent').value.trim();

  // サブオプション（業者選択）があるテンプレートの場合
  if (template.has_sub_options) {
    document.getElementById('standaloneVendorGroup').style.display = 'block';
    const vendorSelect = document.getElementById('standaloneVendorSelect');
    const selectedVendorId = vendorSelect.value;

    // 業者選択ドロップダウンを更新
    if (vendorSelect.options.length === 0) {
      const templateVendors = vendors.filter(v => v.template_id === templateId);
      vendorSelect.innerHTML = '<option value="">業者を選択してください</option>' +
        templateVendors.map(v =>
          `<option value="${escapeHtml(v.vendor_id)}">${escapeHtml(v.company)}</option>`
        ).join('');
    }

    if (!selectedVendorId) {
      // 業者未選択時はメール生成しない
      document.getElementById('standaloneEmailSubject').textContent = '業者を選択してください';
      document.getElementById('standaloneEmailAddress').textContent = '';
      document.getElementById('standaloneEmailBody').textContent = '';
      return;
    }

    const vendor = vendors.find(v => v.template_id === templateId && v.vendor_id === selectedVendorId);
    if (!vendor) return;

    // 業者情報で変数を置換
    let subject = template.subject_format || '';
    let body = template.template_text || '';

    subject = subject
      .replace(/\{customerName\}/g, customerName || '{お客様名}')
      .replace(/\{dueDate\}/g, dueDate || '{期日}');

    body = body
      .replace(/\{company\}/g, vendor.company)
      .replace(/\{contact\}/g, vendor.contact || 'ご担当者様')
      .replace(/\{customerName\}/g, customerName || '{お客様名}')
      .replace(/\{staffName\}/g, staffName || '{担当者名}')
      .replace(/\{dueDate\}/g, dueDate || '{期日}')
      .replace(/\{specialContent\}/g, specialContent || template.default_special_content || '');

    document.getElementById('standaloneEmailSubject').textContent = subject;
    document.getElementById('standaloneEmailAddress').textContent = vendor.email || '';
    document.getElementById('standaloneEmailBody').textContent = body;
  } else {
    // サブオプションなしテンプレート
    document.getElementById('standaloneVendorGroup').style.display = 'none';

    let subject = template.subject_format || '';
    let body = template.template_text || '';

    subject = subject
      .replace(/\{customerName\}/g, customerName || '{お客様名}')
      .replace(/\{dueDate\}/g, dueDate || '{期日}');

    body = body
      .replace(/\{company\}/g, template.company)
      .replace(/\{contact\}/g, template.contact || 'ご担当者様')
      .replace(/\{customerName\}/g, customerName || '{お客様名}')
      .replace(/\{staffName\}/g, staffName || '{担当者名}')
      .replace(/\{dueDate\}/g, dueDate || '{期日}')
      .replace(/\{specialContent\}/g, specialContent || template.default_special_content || '');

    document.getElementById('standaloneEmailSubject').textContent = subject;
    document.getElementById('standaloneEmailAddress').textContent = template.email || '';
    document.getElementById('standaloneEmailBody').textContent = body;
  }
}

function copyStandaloneText(elementId) {
  const text = document.getElementById(elementId).textContent;
  if (!text || text.includes('{') || text.includes('選択してください')) {
    showToast('コピーできる内容がありません', 'error');
    return;
  }

  navigator.clipboard.writeText(text).then(() => {
    showToast('コピーしました', 'success');
  }).catch(err => {
    logError('コピーに失敗:', err);
    showToast('コピーに失敗しました', 'error');
  });
}

function populateStandaloneTemplateSelect() {
  const select = document.getElementById('standaloneTemplateSelect');
  if (!select) return;

  // currentUserCategoryに応じてフィルタリング
  let filtered = emailTemplates;
  if (currentUserCategory && currentUserCategory !== 'admin') {
    filtered = emailTemplates.filter(t => t.category === currentUserCategory);
  }

  select.innerHTML = '<option value="">テンプレートを選択してください</option>' +
    filtered.map(t =>
      `<option value="${escapeHtml(t.template_id)}">${escapeHtml(t.display_name)}</option>`
    ).join('');
}

// ============================================
// エクスポート機能
// ============================================
const ExportManager = {
  // エクスポートモーダルを表示
  showModal() {
    const modal = document.createElement('div');
    modal.id = 'exportModal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    modal.innerHTML = `
      <div class="modal-content" style="background: var(--bg-primary); border-radius: 12px; max-width: 500px; width: 90%;">
        <div class="modal-header" style="padding: 20px; border-bottom: 1px solid var(--border-color);">
          <h3 style="font-size: 18px; font-weight: 600;">📁 データエクスポート</h3>
        </div>
        <div class="modal-body" style="padding: 20px;">
          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label" style="font-weight: 500; margin-bottom: 8px; display: block;">エクスポート形式</label>
            <div style="display: grid; gap: 8px;">
              <label style="display: flex; align-items: center; gap: 8px; padding: 12px; background: var(--bg-secondary); border-radius: 8px; cursor: pointer;">
                <input type="radio" name="exportFormat" value="csv" checked> CSV（Excel対応）
              </label>
              <label style="display: flex; align-items: center; gap: 8px; padding: 12px; background: var(--bg-secondary); border-radius: 8px; cursor: pointer;">
                <input type="radio" name="exportFormat" value="json"> JSON
              </label>
              <label style="display: flex; align-items: center; gap: 8px; padding: 12px; background: var(--bg-secondary); border-radius: 8px; cursor: pointer;">
                <input type="radio" name="exportFormat" value="print"> 印刷用レポート
              </label>
            </div>
          </div>
          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label" style="font-weight: 500; margin-bottom: 8px; display: block;">エクスポート対象</label>
            <div style="display: grid; gap: 8px;">
              <label style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="exportProjects" checked> 案件データ（${projects.length}件）
              </label>
              <label style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="exportWithTasks" checked> タスク詳細を含める
              </label>
              <label style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="exportOnlyActive" checked> アクティブな案件のみ
              </label>
            </div>
          </div>
        </div>
        <div class="modal-footer" style="padding: 16px 20px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 12px;">
          <button class="btn btn-ghost" onclick="document.getElementById('exportModal').remove()">キャンセル</button>
          <button class="btn btn-primary" onclick="ExportManager.execute()">エクスポート</button>
        </div>
      </div>
    `;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);
  },

  execute() {
    const format = document.querySelector('input[name="exportFormat"]:checked').value;
    const includeProjects = document.getElementById('exportProjects').checked;
    const includeTasks = document.getElementById('exportWithTasks').checked;
    const onlyActive = document.getElementById('exportOnlyActive').checked;

    document.getElementById('exportModal').remove();

    let dataToExport = projects;
    if (onlyActive) {
      dataToExport = dataToExport.filter(p => p.status !== 'completed' && !p.is_archived);
    }

    switch (format) {
      case 'csv':
        this.exportCSV(dataToExport, includeTasks);
        break;
      case 'json':
        this.exportJSON(dataToExport, includeTasks);
        break;
      case 'print':
        this.exportPrint(dataToExport, includeTasks);
        break;
    }
  },

  exportCSV(data, includeTasks) {
    if (data.length === 0) {
      showToast('エクスポートする案件がありません', 'error');
      return;
    }

    let headers, rows;

    if (includeTasks) {
      headers = ['顧客名', '担当者', 'IC担当', '商品', '進捗率', 'タスク名', 'タスク状態', '期限', 'メモ', '作成日'];
      rows = [];
      data.forEach(p => {
        const progress = calculateProgress(p);
        const tasks = p.tasks || {};
        const taskEntries = Object.entries(tasks);

        if (taskEntries.length === 0) {
          rows.push([
            this.csvEscape(p.customer),
            this.csvEscape(p.assigned_to),
            this.csvEscape(p.ic_assignee),
            this.csvEscape(p.specifications || 'LIFE'),
            `${progress}%`,
            '', '', '',
            this.csvEscape(p.memo),
            p.created_at || ''
          ].join(','));
        } else {
          taskEntries.forEach(([key, task], idx) => {
            const taskDef = tasksV2.find(t => t.task_key === key);
            rows.push([
              idx === 0 ? this.csvEscape(p.customer) : '',
              idx === 0 ? this.csvEscape(p.assigned_to) : '',
              idx === 0 ? this.csvEscape(p.ic_assignee) : '',
              idx === 0 ? this.csvEscape(p.specifications || 'LIFE') : '',
              idx === 0 ? `${progress}%` : '',
              this.csvEscape(taskDef?.task_name || key),
              this.csvEscape(task.status || ''),
              task.due_date || '',
              idx === 0 ? this.csvEscape(p.memo) : '',
              idx === 0 ? (p.created_at || '') : ''
            ].join(','));
          });
        }
      });
    } else {
      headers = ['顧客名', '担当者', 'IC担当', '商品', '進捗率', 'メモ', '作成日', '更新日'];
      rows = data.map(p => {
        const progress = calculateProgress(p);
        return [
          this.csvEscape(p.customer),
          this.csvEscape(p.assigned_to),
          this.csvEscape(p.ic_assignee),
          this.csvEscape(p.specifications || 'LIFE'),
          `${progress}%`,
          this.csvEscape(p.memo),
          p.created_at || '',
          p.updated_at || ''
        ].join(',');
      });
    }

    const csvContent = [headers.join(','), ...rows].join('\n');
    this.download(csvContent, 'csv', 'projects');
    showToast(`${data.length}件の案件をCSVでエクスポートしました`, 'success');
  },

  exportJSON(data, includeTasks) {
    if (data.length === 0) {
      showToast('エクスポートする案件がありません', 'error');
      return;
    }

    const exportData = data.map(p => {
      const base = {
        customer: p.customer,
        assigned_to: p.assigned_to,
        ic_assignee: p.ic_assignee,
        specifications: p.specifications,
        progress: calculateProgress(p),
        status: p.status,
        memo: p.memo,
        created_at: p.created_at,
        updated_at: p.updated_at
      };

      if (includeTasks && p.tasks) {
        base.tasks = Object.entries(p.tasks).map(([key, task]) => {
          const taskDef = tasksV2.find(t => t.task_key === key);
          return {
            task_key: key,
            task_name: taskDef?.task_name || key,
            status: task.status,
            due_date: task.due_date,
            completed_at: task.completed_at
          };
        });
      }

      return base;
    });

    const jsonContent = JSON.stringify({
      exported_at: new Date().toISOString(),
      version: APP_VERSION,
      count: exportData.length,
      projects: exportData
    }, null, 2);

    this.download(jsonContent, 'json', 'projects');
    showToast(`${data.length}件の案件をJSONでエクスポートしました`, 'success');
  },

  exportPrint(data, includeTasks) {
    if (data.length === 0) {
      showToast('エクスポートする案件がありません', 'error');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('ポップアップがブロックされました。許可してください。', 'error');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <title>ArchiDeck - 案件レポート</title>
        <style>
          body { font-family: 'Noto Sans JP', sans-serif; padding: 20mm; color: #333; }
          h1 { text-align: center; border-bottom: 2px solid #2563EB; padding-bottom: 10px; }
          .meta { text-align: right; color: #666; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background: #f5f5f5; font-weight: 600; }
          .project-section { margin-bottom: 30px; page-break-inside: avoid; }
          .project-title { background: #2563EB; color: white; padding: 10px; margin-bottom: 10px; }
          .tasks-table { font-size: 12px; }
          .progress { font-weight: bold; color: #2563EB; }
          @media print {
            body { padding: 10mm; }
            .project-section { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <h1>ArchiDeck 案件レポート</h1>
        <div class="meta">
          出力日時: ${new Date().toLocaleString('ja-JP')}<br>
          案件数: ${data.length}件
        </div>
        ${data.map(p => {
          const progress = calculateProgress(p);
          const taskRows = includeTasks && p.tasks ? Object.entries(p.tasks).map(([key, task]) => {
            const taskDef = tasksV2.find(t => t.task_key === key);
            return `<tr>
              <td>${this.escapeHtml(taskDef?.task_name || key)}</td>
              <td>${this.escapeHtml(task.status || '未着手')}</td>
              <td>${task.due_date || '-'}</td>
            </tr>`;
          }).join('') : '';

          return `
            <div class="project-section">
              <div class="project-title">${this.escapeHtml(p.customer)} - ${this.escapeHtml(p.specifications || 'LIFE')}</div>
              <table>
                <tr><th>担当者</th><td>${this.escapeHtml(p.assigned_to || '-')}</td><th>IC担当</th><td>${this.escapeHtml(p.ic_assignee || '-')}</td></tr>
                <tr><th>進捗</th><td class="progress">${progress}%</td><th>作成日</th><td>${p.created_at?.split('T')[0] || '-'}</td></tr>
                ${p.memo ? `<tr><th>メモ</th><td colspan="3">${this.escapeHtml(p.memo)}</td></tr>` : ''}
              </table>
              ${includeTasks && taskRows ? `
                <table class="tasks-table">
                  <thead><tr><th>タスク</th><th>状態</th><th>期限</th></tr></thead>
                  <tbody>${taskRows}</tbody>
                </table>
              ` : ''}
            </div>
          `;
        }).join('')}
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => printWindow.print();
    showToast('印刷用レポートを生成しました', 'success');
  },

  csvEscape(str) {
    if (!str) return '""';
    return `"${String(str).replace(/"/g, '""')}"`;
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  },

  download(content, type, prefix) {
    const mimeTypes = {
      csv: 'text/csv;charset=utf-8;',
      json: 'application/json;charset=utf-8;'
    };
    const extensions = { csv: 'csv', json: 'json' };

    const bom = type === 'csv' ? new Uint8Array([0xEF, 0xBB, 0xBF]) : new Uint8Array([]);
    const blob = new Blob([bom, content], { type: mimeTypes[type] });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${prefix}_${new Date().toISOString().split('T')[0]}.${extensions[type]}`;
    link.click();
    URL.revokeObjectURL(url);
  }
};

// 後方互換性のため旧関数を残す
function exportCSV() {
  ExportManager.showModal();
}

// ============================================
// データインポート機能
// ============================================
const DataImporter = {
  showModal() {
    const modal = document.createElement('div');
    modal.id = 'importModal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    modal.innerHTML = `
      <div class="modal-content" style="background: var(--bg-primary); border-radius: 12px; max-width: 500px; width: 90%;">
        <div class="modal-header" style="padding: 20px; border-bottom: 1px solid var(--border-color);">
          <h3 style="font-size: 18px; font-weight: 600;">📥 データインポート</h3>
        </div>
        <div class="modal-body" style="padding: 20px;">
          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label" style="font-weight: 500; margin-bottom: 8px; display: block;">インポート形式</label>
            <select id="importFormat" class="form-input" style="width: 100%; padding: 10px;">
              <option value="csv">CSV（Excel出力ファイル）</option>
              <option value="json">JSON（バックアップファイル）</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label" style="font-weight: 500; margin-bottom: 8px; display: block;">ファイル選択</label>
            <input type="file" id="importFile" accept=".csv,.json" style="width: 100%;">
            <p style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">
              CSV: 顧客名,担当者,IC担当,商品,メモ の形式<br>
              JSON: エクスポートしたバックアップファイル
            </p>
          </div>
          <div id="importPreview" style="display: none; margin-bottom: 16px;">
            <label class="form-label" style="font-weight: 500; margin-bottom: 8px; display: block;">プレビュー</label>
            <div id="importPreviewContent" style="max-height: 200px; overflow-y: auto; background: var(--bg-secondary); padding: 12px; border-radius: 8px; font-size: 13px;"></div>
          </div>
          <div class="form-group">
            <label style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" id="importSkipDuplicates" checked>
              <span>重複する顧客名はスキップ</span>
            </label>
          </div>
        </div>
        <div class="modal-footer" style="padding: 16px 20px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 12px;">
          <button class="btn btn-ghost" onclick="document.getElementById('importModal').remove()">キャンセル</button>
          <button class="btn btn-primary" id="importExecuteBtn" onclick="DataImporter.execute()" disabled>インポート</button>
        </div>
      </div>
    `;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);

    // ファイル選択時のプレビュー
    document.getElementById('importFile').addEventListener('change', (e) => {
      this.previewFile(e.target.files[0]);
    });
  },

  async previewFile(file) {
    if (!file) return;

    const format = document.getElementById('importFormat').value;
    const previewDiv = document.getElementById('importPreview');
    const previewContent = document.getElementById('importPreviewContent');
    const executeBtn = document.getElementById('importExecuteBtn');

    try {
      const text = await file.text();
      let data;

      if (format === 'csv') {
        data = this.parseCSV(text);
      } else {
        data = this.parseJSON(text);
      }

      if (data.length === 0) {
        previewContent.innerHTML = '<p style="color: var(--danger-color);">データが見つかりません</p>';
        executeBtn.disabled = true;
        previewDiv.style.display = 'block';
        return;
      }

      // プレビュー表示（最大5件）
      const previewItems = data.slice(0, 5);
      previewContent.innerHTML = `
        <p style="margin-bottom: 8px; font-weight: 500;">${data.length}件のデータを検出</p>
        ${previewItems.map(item => `
          <div style="padding: 8px; background: var(--bg-primary); border-radius: 4px; margin-bottom: 4px;">
            ${escapeHtml(item.customer || item.顧客名 || '(顧客名なし)')} - ${escapeHtml(item.specifications || item.商品 || 'LIFE')}
          </div>
        `).join('')}
        ${data.length > 5 ? `<p style="color: var(--text-muted);">...他 ${data.length - 5}件</p>` : ''}
      `;

      this.pendingData = data;
      executeBtn.disabled = false;
      previewDiv.style.display = 'block';

    } catch (error) {
      previewContent.innerHTML = `<p style="color: var(--danger-color);">ファイル読み込みエラー: ${escapeHtml(error.message || 'Unknown error')}</p>`;
      executeBtn.disabled = true;
      previewDiv.style.display = 'block';
    }
  },

  parseCSV(text) {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    // ヘッダー解析
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length === 0) continue;

      const row = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });

      // 顧客名があれば有効なデータとして追加
      if (row['顧客名'] || row['customer']) {
        data.push({
          customer: row['顧客名'] || row['customer'] || '',
          assigned_to: row['担当者'] || row['assigned_to'] || '',
          ic_assignee: row['IC担当'] || row['ic_assignee'] || '',
          specifications: row['商品'] || row['specifications'] || 'LIFE',
          memo: row['メモ'] || row['memo'] || ''
        });
      }
    }

    return data;
  },

  parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  },

  parseJSON(text) {
    const json = JSON.parse(text);
    // エクスポート形式の場合
    if (json.projects && Array.isArray(json.projects)) {
      return json.projects;
    }
    // 配列の場合
    if (Array.isArray(json)) {
      return json;
    }
    return [];
  },

  async execute() {
    if (!this.pendingData || this.pendingData.length === 0) {
      showToast('インポートするデータがありません', 'error');
      return;
    }

    const skipDuplicates = document.getElementById('importSkipDuplicates').checked;
    const existingCustomers = new Set(projects.map(p => p.customer?.toLowerCase()));

    let imported = 0;
    let skipped = 0;

    showStatus('インポート中...', 'saving');

    for (const item of this.pendingData) {
      // 重複チェック
      if (skipDuplicates && existingCustomers.has(item.customer?.toLowerCase())) {
        skipped++;
        continue;
      }

      try {
        const newProject = {
          customer: item.customer,
          assigned_to: item.assigned_to || null,
          ic_assignee: item.ic_assignee || null,
          specifications: item.specifications || 'LIFE',
          memo: item.memo || '',
          status: 'active',
          progress: {},
          tasks: {}
        };

        const { data, error } = await supabase
          .from('projects')
          .insert(newProject)
          .select()
          .single();

        if (!error && data) {
          projects.push(data);
          existingCustomers.add(item.customer?.toLowerCase());
          imported++;
        }
      } catch (e) {
        logError('インポートエラー:', e);
      }
    }

    document.getElementById('importModal').remove();
    renderProjects();
    renderSidebar();
    showStatus('保存済み', 'saved');

    let message = `${imported}件をインポートしました`;
    if (skipped > 0) {
      message += `（${skipped}件は重複のためスキップ）`;
    }
    showToast(message, 'success');

    this.pendingData = null;
  },

  pendingData: null
};

// ============================================
// バッチ操作
// ============================================
const BatchOperations = {
  selected: new Set(),

  toggle(projectId) {
    if (this.selected.has(projectId)) {
      this.selected.delete(projectId);
    } else {
      this.selected.add(projectId);
    }
    this.updateUI();
  },

  selectAll() {
    const visibleCards = document.querySelectorAll('.project-card[data-project-id]');
    visibleCards.forEach(card => {
      this.selected.add(card.dataset.projectId);
    });
    this.updateUI();
    renderProjects();
  },

  deselectAll() {
    this.selected.clear();
    this.updateUI();
    renderProjects();
  },

  isSelected(projectId) {
    return this.selected.has(projectId);
  },

  updateUI() {
    const toolbar = document.getElementById('batchToolbar');
    const count = this.selected.size;

    if (count > 0) {
      if (!toolbar) {
        this.showToolbar();
      }
      document.getElementById('batchCount').textContent = `${count}件選択中`;
    } else {
      if (toolbar) toolbar.remove();
    }

    // チェックボックスの状態を更新
    document.querySelectorAll('.batch-checkbox').forEach(cb => {
      cb.checked = this.selected.has(cb.dataset.projectId);
    });
  },

  showToolbar() {
    const toolbar = document.createElement('div');
    toolbar.id = 'batchToolbar';
    toolbar.style.cssText = `
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      background: var(--bg-primary); border: 1px solid var(--border-color);
      padding: 12px 20px; border-radius: 12px; box-shadow: var(--shadow-lg);
      display: flex; align-items: center; gap: 16px; z-index: 1000;
    `;
    toolbar.innerHTML = `
      <span id="batchCount" style="font-weight: 600;">0件選択中</span>
      <button class="btn btn-ghost btn-small" onclick="BatchOperations.showAssignModal()">👤 担当変更</button>
      <button class="btn btn-ghost btn-small" onclick="BatchOperations.showICTaskModal()">🎨 IC一括更新</button>
      <button class="btn btn-ghost btn-small" onclick="BatchOperations.showDeadlineModal()">📅 期限設定</button>
      <button class="btn btn-ghost btn-small" onclick="BatchOperations.deselectAll()">✕ 選択解除</button>
    `;
    document.body.appendChild(toolbar);
  },

  showDeadlineModal() {
    if (this.selected.size === 0) return;

    const modal = document.createElement('div');
    modal.id = 'batchDeadlineModal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';

    modal.innerHTML = `
      <div class="modal-content" style="background: var(--bg-primary); border-radius: 12px; max-width: 400px; width: 90%;">
        <div class="modal-header" style="padding: 20px; border-bottom: 1px solid var(--border-color);">
          <h3 style="font-size: 18px; font-weight: 600;">📅 一括期限設定</h3>
        </div>
        <div class="modal-body" style="padding: 20px;">
          <p style="margin-bottom: 16px; color: var(--text-secondary);">${this.selected.size}件の案件に期限を設定します</p>
          <input type="date" id="batchDeadline" class="form-input" style="width: 100%;">
        </div>
        <div class="modal-footer" style="padding: 16px 20px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 12px;">
          <button class="btn btn-ghost" onclick="document.getElementById('batchDeadlineModal').remove()">キャンセル</button>
          <button class="btn btn-primary" onclick="BatchOperations.applyDeadline()">設定</button>
        </div>
      </div>
    `;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);
  },

  async applyDeadline() {
    const deadline = document.getElementById('batchDeadline').value;
    if (!deadline) {
      showToast('期限を選択してください', 'error');
      return;
    }

    document.getElementById('batchDeadlineModal').remove();
    showStatus('処理中...', 'saving');
    let count = 0;

    for (const projectId of this.selected) {
      DeadlineManager.setDeadline(projectId, deadline);
      count++;
    }

    this.selected.clear();
    this.updateUI();
    renderProjects();
    showStatus('保存済み', 'saved');
    showToast(`${count}件に期限を設定しました`, 'success');
  },

  async deleteSelected() {
    if (this.selected.size === 0) return;

    const confirmed = confirm(`${this.selected.size}件の案件を完全に削除しますか？この操作は元に戻せません。`);
    if (!confirmed) return;

    const doubleConfirm = confirm('本当に削除しますか？');
    if (!doubleConfirm) return;

    showStatus('処理中...', 'saving');
    let count = 0;

    for (const projectId of this.selected) {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId);

      if (!error) {
        projects = projects.filter(p => p.id !== projectId);
        count++;
      }
    }

    this.selected.clear();
    this.updateUI();
    renderProjects();
    renderSidebar();
    showStatus('保存済み', 'saved');
    showToast(`${count}件を削除しました`, 'success');
  },

  async archiveSelected() {
    if (this.selected.size === 0) return;

    // 申請GO条件をチェック
    const projectsToArchive = [];
    const failedProjects = [];
    for (const projectId of this.selected) {
      const project = projects.find(p => p.id === projectId);
      if (project && canPressApplicationGo(project)) {
        projectsToArchive.push(project);
      } else if (project) {
        failedProjects.push(project.customer);
      }
    }

    if (failedProjects.length > 0) {
      showToast(`以下の案件は申請GO条件を満たしていません: ${failedProjects.join(', ')}`, 'warning');
    }

    if (projectsToArchive.length === 0) {
      showToast('完了可能な案件がありません', 'error');
      return;
    }

    const confirmed = confirm(`${projectsToArchive.length}件の案件を完了済みにしますか？${failedProjects.length > 0 ? `\n（${failedProjects.length}件は条件未達のためスキップ）` : ''}`);
    if (!confirmed) return;

    showStatus('処理中...', 'saving');
    let count = 0;

    for (const project of projectsToArchive) {
      const { error } = await supabase
        .from('projects')
        .update({ is_archived: true, updated_at: new Date().toISOString() })
        .eq('id', project.id);

      if (!error) {
        project.is_archived = true;
        count++;
      }
    }

    this.selected.clear();
    this.updateUI();
    renderProjects();
    renderSidebar();
    showStatus('保存済み', 'saved');
    showToast(`${count}件を完了済みにしました`, 'success');
  },

  showAssignModal() {
    if (this.selected.size === 0) return;

    const modal = document.createElement('div');
    modal.id = 'batchAssignModal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';

    const designerOptions = designers
      .filter(d => d.category === '設計')
      .map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`)
      .join('');

    modal.innerHTML = `
      <div class="modal-content" style="background: var(--bg-primary); border-radius: 12px; max-width: 400px; width: 90%;">
        <div class="modal-header" style="padding: 20px; border-bottom: 1px solid var(--border-color);">
          <h3 style="font-size: 18px; font-weight: 600;">👤 一括担当者変更</h3>
        </div>
        <div class="modal-body" style="padding: 20px;">
          <p style="margin-bottom: 16px; color: var(--text-secondary);">${this.selected.size}件の案件の担当者を変更します</p>
          <select id="batchAssignee" class="form-input" style="width: 100%;">
            <option value="">担当者を選択</option>
            ${designerOptions}
          </select>
        </div>
        <div class="modal-footer" style="padding: 16px 20px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 12px;">
          <button class="btn btn-ghost" onclick="document.getElementById('batchAssignModal').remove()">キャンセル</button>
          <button class="btn btn-primary" onclick="BatchOperations.applyAssign()">変更</button>
        </div>
      </div>
    `;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);
  },

  async applyAssign() {
    const assignee = document.getElementById('batchAssignee').value;
    if (!assignee) {
      showToast('担当者を選択してください', 'error');
      return;
    }

    document.getElementById('batchAssignModal').remove();
    showStatus('処理中...', 'saving');
    let count = 0;

    for (const projectId of this.selected) {
      const { error } = await supabase
        .from('projects')
        .update({ assigned_to: assignee, updated_at: new Date().toISOString() })
        .eq('id', projectId);

      if (!error) {
        const project = projects.find(p => p.id === projectId);
        if (project) project.assigned_to = assignee;
        count++;
      }
    }

    this.selected.clear();
    this.updateUI();
    renderProjects();
    renderSidebar();
    showStatus('保存済み', 'saved');
    showToast(`${count}件の担当者を${assignee}に変更しました`, 'success');
  },

  showICTaskModal() {
    if (this.selected.size === 0) return;

    const icTasks = tasksV2.filter(t => t.category === 'IC').sort((a, b) => a.display_order - b.display_order);
    if (icTasks.length === 0) {
      showToast('ICタスクが登録されていません', 'error');
      return;
    }

    const taskOptions = icTasks.map(t => `<option value="${t.task_key}">${escapeHtml(t.task_name)}</option>`).join('');

    const modal = document.createElement('div');
    modal.id = 'batchICModal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';

    modal.innerHTML = `
      <div class="modal-content" style="background: var(--bg-primary); border-radius: 12px; max-width: 450px; width: 90%;">
        <div class="modal-header" style="padding: 20px; border-bottom: 1px solid var(--border-color);">
          <h3 style="font-size: 18px; font-weight: 600;">🎨 ICタスク一括更新</h3>
        </div>
        <div class="modal-body" style="padding: 20px;">
          <p style="margin-bottom: 16px; color: var(--text-secondary);">${this.selected.size}件の案件のICタスクを一括更新します</p>
          <div style="margin-bottom: 16px;">
            <label class="form-label">タスク</label>
            <select id="batchICTask" class="form-input" style="width: 100%;" onchange="BatchOperations.updateICStateOptions()">
              <option value="">タスクを選択</option>
              ${taskOptions}
            </select>
          </div>
          <div style="margin-bottom: 16px;">
            <label class="form-label">ステータス</label>
            <select id="batchICState" class="form-input" style="width: 100%;" disabled>
              <option value="">タスクを先に選択してください</option>
            </select>
          </div>
        </div>
        <div class="modal-footer" style="padding: 16px 20px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 12px;">
          <button class="btn btn-ghost" onclick="document.getElementById('batchICModal').remove()">キャンセル</button>
          <button class="btn btn-primary" onclick="BatchOperations.applyICTask()">一括更新</button>
        </div>
      </div>
    `;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);
  },

  updateICStateOptions() {
    const taskKey = document.getElementById('batchICTask').value;
    const stateSelect = document.getElementById('batchICState');

    if (!taskKey) {
      stateSelect.innerHTML = '<option value="">タスクを先に選択してください</option>';
      stateSelect.disabled = true;
      return;
    }

    const stateOptions = getTaskStateOptions(taskKey);
    if (stateOptions && Array.isArray(stateOptions)) {
      stateSelect.innerHTML = stateOptions.map(state => `<option value="${escapeHtml(state)}">${escapeHtml(state) || '-'}</option>`).join('');
      stateSelect.disabled = false;
    } else {
      stateSelect.innerHTML = '<option value="">ステータスなし</option>';
      stateSelect.disabled = true;
    }
  },

  async applyICTask() {
    const taskKey = document.getElementById('batchICTask').value;
    const state = document.getElementById('batchICState').value;

    if (!taskKey) {
      showToast('タスクを選択してください', 'error');
      return;
    }

    document.getElementById('batchICModal').remove();
    showStatus('処理中...', 'saving');
    let count = 0;

    for (const projectId of this.selected) {
      const project = projects.find(p => p.id === projectId);
      if (!project) continue;

      const progressData = project.progress || {};
      if (!progressData[taskKey]) progressData[taskKey] = {};
      progressData[taskKey].state = state;

      const { error } = await supabase
        .from('projects')
        .update({ progress: progressData, updated_at: new Date().toISOString() })
        .eq('id', projectId);

      if (!error) {
        project.progress = progressData;
        project.updated_at = new Date().toISOString();
        markLocalUpdate(projectId); // リアルタイム同期の二重更新防止
        count++;
      }
    }

    this.selected.clear();
    this.updateUI();
    renderProjects();
    showStatus('保存済み', 'saved');

    const taskDef = tasksV2.find(t => t.task_key === taskKey);
    showToast(`${count}件の「${taskDef?.task_name || taskKey}」を「${state || '-'}」に更新しました`, 'success');
  }
};

// ============================================
// フィルタープリセット管理
// ============================================
const FilterPresets = {
  presets: safeJsonParse(localStorage.getItem('filterPresets'), []),

  save() {
    localStorage.setItem('filterPresets', JSON.stringify(this.presets));
  },

  getCurrentFilter() {
    return {
      designer: currentDesignerTab,
      archive: document.getElementById('archiveFilter')?.value || 'active',
      search: document.getElementById('searchQuery')?.value || '',
      spec: document.getElementById('specFilter')?.value || ''
    };
  },

  addPreset(name) {
    if (!name || !name.trim()) {
      showToast('プリセット名を入力してください', 'error');
      return false;
    }

    const filter = this.getCurrentFilter();
    const preset = {
      id: Date.now().toString(),
      name: name.trim(),
      filter: filter,
      createdAt: new Date().toISOString()
    };

    this.presets.unshift(preset);
    this.save();
    this.renderDropdown();
    showToast(`「${name}」を保存しました`, 'success');
    return true;
  },

  deletePreset(id) {
    const preset = this.presets.find(p => p.id === id);
    if (preset && confirm(`「${preset.name}」を削除しますか？`)) {
      this.presets = this.presets.filter(p => p.id !== id);
      this.save();
      this.renderDropdown();
      showToast('プリセットを削除しました', 'info');
    }
  },

  applyPreset(id) {
    const preset = this.presets.find(p => p.id === id);
    if (!preset) return;

    const { filter } = preset;

    // 担当者タブを切り替え
    if (filter.designer) {
      currentDesignerTab = filter.designer;
      renderDesignerTabs();
    }

    // フィルター値を設定
    const archiveFilter = document.getElementById('archiveFilter');
    const searchQuery = document.getElementById('searchQuery');
    const specFilter = document.getElementById('specFilter');

    if (archiveFilter) archiveFilter.value = filter.archive || 'active';
    if (searchQuery) searchQuery.value = filter.search || '';
    if (specFilter) specFilter.value = filter.spec || '';

    renderProjects();
    showToast(`「${preset.name}」を適用しました`, 'success');
  },

  showSaveModal() {
    const filter = this.getCurrentFilter();
    const filterDesc = this.describeFilter(filter);

    const modal = document.createElement('div');
    modal.id = 'presetSaveModal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;';
    modal.innerHTML = `
      <div class="modal-content" style="background: var(--bg-primary); border-radius: 12px; width: 90%; max-width: 400px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
        <div class="modal-header" style="padding: 20px; border-bottom: 1px solid var(--border-color);">
          <h3 style="font-size: 18px; font-weight: 600;">フィルターを保存</h3>
        </div>
        <div class="modal-body" style="padding: 20px;">
          <div style="margin-bottom: 16px; padding: 12px; background: var(--bg-secondary); border-radius: 8px; font-size: 13px; color: var(--text-secondary);">
            <strong>現在のフィルター:</strong><br>${filterDesc}
          </div>
          <label style="display: block; margin-bottom: 8px; font-weight: 500;">プリセット名</label>
          <input type="text" id="presetName" class="form-input" style="width: 100%;" placeholder="例: 田中さんの進行中案件" autofocus>
        </div>
        <div class="modal-footer" style="padding: 16px 20px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 12px;">
          <button class="btn btn-ghost" onclick="document.getElementById('presetSaveModal').remove()">キャンセル</button>
          <button class="btn btn-primary" onclick="FilterPresets.confirmSave()">保存</button>
        </div>
      </div>
    `;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);

    // Enterキーで保存
    document.getElementById('presetName').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') FilterPresets.confirmSave();
    });
  },

  confirmSave() {
    const name = document.getElementById('presetName').value;
    if (this.addPreset(name)) {
      document.getElementById('presetSaveModal').remove();
    }
  },

  describeFilter(filter) {
    const parts = [];
    if (filter.designer && filter.designer !== 'ALL') {
      parts.push(`担当: ${filter.designer}`);
    }
    if (filter.archive && filter.archive !== 'active') {
      const labels = { all: '全て', archived: '完了済み' };
      parts.push(labels[filter.archive] || filter.archive);
    }
    if (filter.search) {
      parts.push(`検索: "${filter.search}"`);
    }
    if (filter.spec) {
      parts.push(`仕様: ${filter.spec}`);
    }
    return parts.length > 0 ? parts.join('、') : 'フィルターなし';
  },

  renderDropdown() {
    const container = document.getElementById('presetDropdown');
    if (!container) return;

    if (this.presets.length === 0) {
      container.innerHTML = '<div style="padding: 12px; color: var(--text-secondary); font-size: 13px;">保存済みプリセットはありません</div>';
      return;
    }

    container.innerHTML = this.presets.map(preset => `
      <div class="preset-item" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid var(--border-color); cursor: pointer;"
           onmouseenter="this.style.background='var(--bg-secondary)'"
           onmouseleave="this.style.background='white'">
        <div style="flex: 1;" onclick="FilterPresets.applyPreset('${preset.id}'); document.getElementById('presetMenu').style.display='none';">
          <div style="font-weight: 500; font-size: 14px;">${preset.name}</div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">${this.describeFilter(preset.filter)}</div>
        </div>
        <button class="btn btn-ghost btn-small" style="padding: 4px 8px; font-size: 12px;" onclick="event.stopPropagation(); FilterPresets.deletePreset('${preset.id}')">削除</button>
      </div>
    `).join('');
  },

  toggleMenu() {
    const menu = document.getElementById('presetMenu');
    if (!menu) return;

    if (menu.style.display === 'none' || !menu.style.display) {
      this.renderDropdown();
      menu.style.display = 'block';
      // 外側クリックで閉じる
      setTimeout(() => {
        document.addEventListener('click', this.closeMenuOnClickOutside);
      }, 10);
    } else {
      menu.style.display = 'none';
      document.removeEventListener('click', this.closeMenuOnClickOutside);
    }
  },

  closeMenuOnClickOutside(e) {
    const menu = document.getElementById('presetMenu');
    const btn = document.getElementById('presetBtn');
    if (menu && !menu.contains(e.target) && !btn.contains(e.target)) {
      menu.style.display = 'none';
      document.removeEventListener('click', FilterPresets.closeMenuOnClickOutside);
    }
  }
};

// ============================================
// クイック編集
// ============================================
const QuickEdit = {
  showAssigneeDropdown(projectId, element, assigneeType = 'assigned_to') {
    // 既存のドロップダウンを削除
    document.querySelectorAll('.quick-edit-dropdown').forEach(el => el.remove());

    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const rect = element.getBoundingClientRect();

    // 担当者タイプに応じてフィルタ
    const categoryMap = {
      'assigned_to': '設計',
      'ic_assignee': 'IC',
      'exterior_assignee': '外構',
      'realestate_assignee': '不動産'
    };
    const labelMap = {
      'assigned_to': '設計担当者',
      'ic_assignee': 'IC担当者',
      'exterior_assignee': '外構担当者',
      'realestate_assignee': '不動産担当者'
    };
    const category = categoryMap[assigneeType] || '設計';
    const label = labelMap[assigneeType] || '担当者';
    const designerList = designers.filter(d => d.category === category);
    const currentAssignee = project[assigneeType] || '';

    const dropdown = document.createElement('div');
    dropdown.className = 'quick-edit-dropdown';
    dropdown.style.cssText = `position: fixed; top: ${rect.bottom + 4}px; left: ${rect.left}px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 9999; min-width: 150px; max-height: 300px; overflow-y: auto;`;

    dropdown.innerHTML = `
      <div style="padding: 8px 12px; border-bottom: 1px solid var(--border-color); font-size: 12px; color: var(--text-secondary);">${label}を変更</div>
      <div class="quick-edit-option" style="padding: 10px 12px; cursor: pointer; font-size: 14px; ${!currentAssignee ? 'background: var(--primary-light); font-weight: 500;' : ''}"
           onmouseenter="this.style.background='var(--bg-secondary)'"
           onmouseleave="this.style.background='${!currentAssignee ? 'var(--primary-light)' : ''}'"
           onclick="QuickEdit.changeAssignee('${projectId}', '', '${assigneeType}')">（未設定）</div>
      ${designerList.map(d => `
        <div class="quick-edit-option" style="padding: 10px 12px; cursor: pointer; font-size: 14px; ${currentAssignee === d.name ? 'background: var(--primary-light); font-weight: 500;' : ''}"
             onmouseenter="this.style.background='var(--bg-secondary)'"
             onmouseleave="this.style.background='${currentAssignee === d.name ? 'var(--primary-light)' : ''}'"
             onclick="QuickEdit.changeAssignee('${projectId}', '${d.name}', '${assigneeType}')">${d.name}</div>
      `).join('')}
    `;

    document.body.appendChild(dropdown);

    // 外側クリックで閉じる
    setTimeout(() => {
      document.addEventListener('click', QuickEdit.closeDropdown);
    }, 10);
  },

  closeDropdown(e) {
    if (!e.target.closest('.quick-edit-dropdown') && !e.target.closest('.quick-edit-trigger')) {
      document.querySelectorAll('.quick-edit-dropdown').forEach(el => el.remove());
      document.removeEventListener('click', QuickEdit.closeDropdown);
    }
  },

  async changeAssignee(projectId, assignee, assigneeType = 'assigned_to') {
    document.querySelectorAll('.quick-edit-dropdown').forEach(el => el.remove());

    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const labelMap = {
      'assigned_to': '設計担当者',
      'ic_assignee': 'IC担当者',
      'exterior_assignee': '外構担当者',
      'realestate_assignee': '不動産担当者'
    };
    const label = labelMap[assigneeType] || '担当者';
    const oldAssignee = project[assigneeType];
    showStatus('保存中...', 'saving');

    const updateData = { updated_at: new Date().toISOString() };
    updateData[assigneeType] = assignee || null;

    const { error } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', projectId);

    if (error) {
      showStatus('エラー', 'error');
      showToast('変更に失敗しました', 'error');
      return;
    }

    UndoManager.record({
      type: 'UPDATE_PROJECT',
      projectId,
      description: `${project.customer} - ${label}を${oldAssignee || '未設定'}から${assignee || '未設定'}に変更`,
      oldValue: { [assigneeType]: oldAssignee },
      newValue: { [assigneeType]: assignee || null }
    });

    project[assigneeType] = assignee || null;
    project.updated_at = new Date().toISOString();
    renderProjects();
    renderSidebar();
    showStatus('保存済み', 'saved');
    showToast(`${label}を${assignee || '未設定'}に変更しました`, 'success');
  }
};

// ============================================
// 期限・リマインダー管理
// ============================================
const DeadlineManager = {
  reminders: safeJsonParse(localStorage.getItem('projectReminders'), {}),

  setDeadline(projectId, deadline) {
    this.reminders[projectId] = { deadline, notified: false };
    this.save();
  },

  getDeadline(projectId) {
    return this.reminders[projectId]?.deadline || null;
  },

  save() {
    localStorage.setItem('projectReminders', JSON.stringify(this.reminders));
  },

  checkReminders() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    projects.forEach(project => {
      const reminder = this.reminders[project.id];
      if (!reminder || reminder.notified || project.is_archived) return;

      const deadline = new Date(reminder.deadline);
      deadline.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));

      if (diffDays <= 3 && diffDays >= 0) {
        const msg = diffDays === 0 ? '本日が期限です' : `あと${diffDays}日で期限です`;
        showToast(`📅 ${project.customer}: ${msg}`, 'warning');
        this.reminders[project.id].notified = true;
        this.save();
      } else if (diffDays < 0) {
        showToast(`⚠️ ${project.customer}: 期限を${Math.abs(diffDays)}日過ぎています`, 'error');
        this.reminders[project.id].notified = true;
        this.save();
      }
    });
  },

  getStatus(projectId) {
    const deadline = this.getDeadline(projectId);
    if (!deadline) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(deadline);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { class: 'overdue', label: `${Math.abs(diffDays)}日超過`, color: '#EF4444' };
    if (diffDays === 0) return { class: 'today', label: '本日', color: '#F59E0B' };
    if (diffDays <= 3) return { class: 'soon', label: `あと${diffDays}日`, color: '#F59E0B' };
    return { class: 'normal', label: `${due.getMonth() + 1}/${due.getDate()}`, color: '#6B7280' };
  },

  showModal(projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const currentDeadline = this.getDeadline(projectId) || '';

    const modal = document.createElement('div');
    modal.id = 'deadlineModal';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;';
    modal.innerHTML = `
      <div style="background: var(--bg-primary); border-radius: 12px; width: 90%; max-width: 360px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
        <div style="padding: 20px; border-bottom: 1px solid var(--border-color);">
          <h3 style="font-size: 18px; font-weight: 600;">期限を設定</h3>
          <p style="font-size: 14px; color: var(--text-secondary); margin-top: 4px;">${escapeHtml(project.customer)}</p>
        </div>
        <div style="padding: 20px;">
          <input type="date" id="deadlineInput" class="form-input" style="width: 100%;" value="${currentDeadline}">
          <p style="font-size: 12px; color: var(--text-secondary); margin-top: 8px;">期限の3日前から通知が表示されます</p>
        </div>
        <div style="padding: 16px 20px; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between;">
          <button class="btn btn-ghost" onclick="DeadlineManager.clearDeadline('${projectId}')">クリア</button>
          <div style="display: flex; gap: 12px;">
            <button class="btn btn-ghost" onclick="document.getElementById('deadlineModal').remove()">キャンセル</button>
            <button class="btn btn-primary" onclick="DeadlineManager.saveFromModal('${projectId}')">保存</button>
          </div>
        </div>
      </div>
    `;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  },

  saveFromModal(projectId) {
    const deadline = document.getElementById('deadlineInput').value;
    if (deadline) {
      this.setDeadline(projectId, deadline);
      showToast('期限を設定しました', 'success');
    }
    document.getElementById('deadlineModal').remove();
    renderProjects();
  },

  clearDeadline(projectId) {
    delete this.reminders[projectId];
    this.save();
    document.getElementById('deadlineModal').remove();
    renderProjects();
    showToast('期限をクリアしました', 'info');
  }
};

// ============================================
// 案件テンプレート
// ============================================
const TemplateManager = {
  templates: safeJsonParse(localStorage.getItem('projectTemplates'), []),

  save() {
    localStorage.setItem('projectTemplates', JSON.stringify(this.templates));
  },

  createFromProject(projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const name = prompt('テンプレート名を入力してください:', `${project.specifications || 'LIFE'}テンプレート`);
    if (!name) return;

    const template = {
      id: Date.now().toString(),
      name: name,
      specifications: project.specifications,
      progress: project.progress || {},
      createdAt: new Date().toISOString()
    };

    this.templates.push(template);
    this.save();
    showToast(`テンプレート「${name}」を作成しました`, 'success');
  },

  applyTemplate(templateId, projectId) {
    const template = this.templates.find(t => t.id === templateId);
    const project = projects.find(p => p.id === projectId);
    if (!template || !project) return;

    project.specifications = template.specifications;
    project.progress = JSON.parse(JSON.stringify(template.progress));

    this.saveProject(project);
    showToast(`テンプレート「${template.name}」を適用しました`, 'success');
  },

  async saveProject(project) {
    const { error } = await supabase
      .from('projects')
      .update({
        specifications: project.specifications,
        progress: project.progress,
        updated_at: new Date().toISOString()
      })
      .eq('id', project.id);

    if (!error) {
      renderProjects();
    }
  },

  deleteTemplate(templateId) {
    const template = this.templates.find(t => t.id === templateId);
    if (template && confirm(`テンプレート「${template.name}」を削除しますか？`)) {
      this.templates = this.templates.filter(t => t.id !== templateId);
      this.save();
      showToast('テンプレートを削除しました', 'info');
    }
  },

  showSelectModal(projectId) {
    if (this.templates.length === 0) {
      showToast('保存済みテンプレートがありません', 'info');
      return;
    }

    const modal = document.createElement('div');
    modal.id = 'templateSelectModal';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;';
    modal.innerHTML = `
      <div style="background: var(--bg-primary); border-radius: 12px; width: 90%; max-width: 400px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
        <div style="padding: 20px; border-bottom: 1px solid var(--border-color);">
          <h3 style="font-size: 18px; font-weight: 600;">テンプレートを適用</h3>
        </div>
        <div style="padding: 12px; max-height: 300px; overflow-y: auto;">
          ${this.templates.map(t => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 8px;">
              <div>
                <div style="font-weight: 500;">${t.name}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">${t.specifications || 'LIFE'}</div>
              </div>
              <button class="btn btn-primary btn-small" onclick="TemplateManager.applyTemplate('${t.id}', '${projectId}'); document.getElementById('templateSelectModal').remove();">適用</button>
            </div>
          `).join('')}
        </div>
        <div style="padding: 16px 20px; border-top: 1px solid var(--border-color);">
          <button class="btn btn-ghost" style="width: 100%;" onclick="document.getElementById('templateSelectModal').remove()">キャンセル</button>
        </div>
      </div>
    `;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  },

  showManageModal() {
    const modal = document.createElement('div');
    modal.id = 'templateManageModal';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;';
    modal.innerHTML = `
      <div style="background: var(--bg-primary); border-radius: 12px; width: 90%; max-width: 450px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
        <div style="padding: 20px; border-bottom: 1px solid var(--border-color);">
          <h3 style="font-size: 18px; font-weight: 600;">テンプレート管理</h3>
        </div>
        <div style="padding: 12px; max-height: 400px; overflow-y: auto;">
          ${this.templates.length === 0 ? '<p style="padding: 20px; text-align: center; color: var(--text-secondary);">テンプレートがありません<br><small>案件の編集画面から「テンプレート保存」で作成できます</small></p>' : this.templates.map(t => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 8px;">
              <div>
                <div style="font-weight: 500;">${t.name}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">${t.specifications || 'LIFE'} | ${new Date(t.createdAt).toLocaleDateString()}</div>
              </div>
              <button class="btn btn-ghost btn-small" style="color: #EF4444;" onclick="TemplateManager.deleteTemplate('${t.id}'); document.getElementById('templateManageModal').remove(); TemplateManager.showManageModal();">削除</button>
            </div>
          `).join('')}
        </div>
        <div style="padding: 16px 20px; border-top: 1px solid var(--border-color);">
          <button class="btn btn-ghost" style="width: 100%;" onclick="document.getElementById('templateManageModal').remove()">閉じる</button>
        </div>
      </div>
    `;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }
};

// ============================================
// モバイルスワイプ操作
// ============================================
const MobileGestures = {
  startX: 0,
  startY: 0,
  currentCard: null,

  init() {
    document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
    document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    document.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: true });
  },

  handleTouchStart(e) {
    const card = e.target.closest('.project-card');
    if (!card) return;

    this.startX = e.touches[0].clientX;
    this.startY = e.touches[0].clientY;
    this.currentCard = card;
  },

  handleTouchMove(e) {
    if (!this.currentCard) return;

    const diffX = e.touches[0].clientX - this.startX;
    const diffY = e.touches[0].clientY - this.startY;

    // 横方向のスワイプを検出
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 30) {
      e.preventDefault();
      const maxSwipe = 100;
      const translateX = Math.max(-maxSwipe, Math.min(maxSwipe, diffX));
      this.currentCard.style.transform = `translateX(${translateX}px)`;
      this.currentCard.style.transition = 'none';

      // スワイプ方向に応じた背景色
      if (diffX > 50) {
        this.currentCard.style.background = 'linear-gradient(to right, #10B981 0%, white 30%)';
      } else if (diffX < -50) {
        this.currentCard.style.background = 'linear-gradient(to left, #F59E0B 0%, white 30%)';
      } else {
        this.currentCard.style.background = '';
      }
    }
  },

  handleTouchEnd(e) {
    if (!this.currentCard) return;

    const diffX = e.changedTouches[0].clientX - this.startX;
    const projectId = this.currentCard.dataset.projectId;

    this.currentCard.style.transform = '';
    this.currentCard.style.transition = 'transform 0.2s ease';
    this.currentCard.style.background = '';

    if (diffX < -80 && projectId) {
      // 左スワイプ: 完了切り替え
      const project = projects.find(p => p.id === projectId);
      if (project && calculateProgress(project) >= 100) {
        toggleArchive(projectId, !project.is_archived);
      } else {
        showToast('完了にするには進捗100%が必要です', 'info');
      }
    }

    this.currentCard = null;
  }
};

// ============================================
// セッションタイムアウト管理
// ============================================
const SessionManager = {
  timeoutMinutes: 60,
  warningMinutes: 5,
  lastActivity: Date.now(),
  timeoutId: null,
  warningId: null,
  warningShown: false,

  init() {
    this.resetTimer();
    this.setupActivityListeners();
    log('🔒 セッション管理開始（タイムアウト: ' + this.timeoutMinutes + '分）');
  },

  setupActivityListeners() {
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      document.addEventListener(event, () => this.onActivity(), { passive: true });
    });
  },

  onActivity() {
    this.lastActivity = Date.now();
    if (this.warningShown) {
      this.hideWarning();
    }
    this.resetTimer();
  },

  resetTimer() {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    if (this.warningId) clearTimeout(this.warningId);

    // 警告表示タイマー
    const warningMs = (this.timeoutMinutes - this.warningMinutes) * 60 * 1000;
    this.warningId = setTimeout(() => this.showWarning(), warningMs);

    // タイムアウトタイマー
    const timeoutMs = this.timeoutMinutes * 60 * 1000;
    this.timeoutId = setTimeout(() => this.onTimeout(), timeoutMs);
  },

  showWarning() {
    if (this.warningShown) return;
    this.warningShown = true;

    const warning = document.createElement('div');
    warning.id = 'sessionWarning';
    warning.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 10001;
      background: var(--warning-color); color: white;
      padding: 16px 20px; border-radius: 8px;
      box-shadow: var(--shadow-lg); max-width: 320px;
    `;
    warning.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 8px;">⏰ セッション期限</div>
      <div style="font-size: 14px; margin-bottom: 12px;">
        ${this.warningMinutes}分間操作がないとログアウトします
      </div>
      <button onclick="SessionManager.extendSession()"
        style="background: var(--bg-primary); color: var(--warning-color); border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: 600;">
        セッションを延長
      </button>
    `;
    document.body.appendChild(warning);
  },

  hideWarning() {
    this.warningShown = false;
    const warning = document.getElementById('sessionWarning');
    if (warning) warning.remove();
  },

  extendSession() {
    this.onActivity();
    showToast('セッションを延長しました', 'success');
  },

  onTimeout() {
    this.hideWarning();
    showToast('セッションがタイムアウトしました。再度ログインしてください。', 'warning');
    setTimeout(() => signOut(), 2000);
  },

  stop() {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    if (this.warningId) clearTimeout(this.warningId);
    this.hideWarning();
  }
};

// ============================================
// ドラッグ&ドロップ並び替え
// ============================================
let draggedProject = null;

let dragAndDropInitialized = false;

function enableDragAndDrop() {
  const container = document.getElementById('projectsContainer');
  if (!container || dragAndDropInitialized) return;

  dragAndDropInitialized = true;

  // イベントデリゲーションで親要素に1つだけリスナーを登録（メモリリーク防止）
  container.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.project-card');
    if (card) handleProjectDragStart.call(card, e);
  });

  container.addEventListener('dragover', (e) => {
    const card = e.target.closest('.project-card');
    if (card) handleProjectDragOver.call(card, e);
  });

  container.addEventListener('drop', (e) => {
    const card = e.target.closest('.project-card');
    if (card) handleProjectDrop.call(card, e);
  });

  container.addEventListener('dragend', (e) => {
    const card = e.target.closest('.project-card');
    if (card) handleProjectDragEnd.call(card, e);
  });

  // カードにdraggable属性を付与（MutationObserverで監視）
  const updateDraggable = () => {
    const cards = container.querySelectorAll('.project-card');
    cards.forEach((card, index) => {
      card.setAttribute('draggable', 'true');
      card.dataset.projectIndex = index;
    });
  };

  updateDraggable();

  // DOM変更時にdraggable属性を付与（イベントリスナーは追加しない）
  const observer = new MutationObserver(updateDraggable);
  observer.observe(container, { childList: true, subtree: true });
}

function handleProjectDragStart(e) {
  draggedProject = this;
  this.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
}

function handleProjectDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleProjectDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }

  if (draggedProject !== this) {
    const draggedIndex = parseInt(draggedProject.dataset.projectIndex);
    const targetIndex = parseInt(this.dataset.projectIndex);

    // 配列の順序を入れ替え
    const temp = projects[draggedIndex];
    projects.splice(draggedIndex, 1);
    projects.splice(targetIndex, 0, temp);

    // 再描画
    renderProjects();
  }

  return false;
}

function handleProjectDragEnd(e) {
  this.style.opacity = '1';

  // すべてのドラッグ状態をリセット
  const cards = document.querySelectorAll('.project-card');
  cards.forEach(card => {
    card.classList.remove('over');
  });
}

// ============================================
// URL直接アクセス機能（ハッシュルーティング）
// ============================================
function updateURLWithDesigner(designerName) {
  const currentHash = window.location.hash.substring(1); // #を除去
  const [pathPart] = currentHash.split('?');
  const mainTab = pathPart.split('/')[0] || 'projects';

  // 新しいURLを構築
  let newHash = mainTab;
  if (designerName !== 'ALL') {
    newHash += `?designer=${encodeURIComponent(designerName)}`;
  }

  // hashchangeイベントを発火させずにURLを更新
  history.replaceState(null, '', `#${newHash}`);
}

function handleHashChange() {
  // 無限ループ防止
  if (isHandlingHashChange) {
    log('⏸️ handleHashChange: すでに処理中のためスキップ');
    return;
  }

  const hash = window.location.hash.substring(1); // #を除去
  log('🔗 handleHashChange 開始:', {
    hash: hash,
    timestamp: new Date().toISOString(),
    vendorsV2Length: vendorsV2.length,
    taskVendorMappingsLength: taskVendorMappings.length
  });

  if (!hash) return;

  isHandlingHashChange = true;

  // URLパラメータを分離（例: projects?designer=箕浦）
  const [pathPart, queryPart] = hash.split('?');
  const [mainTab, subTab] = pathPart.split('/');

  // URLパラメータを解析
  const params = new URLSearchParams(queryPart || '');
  const designerParam = params.get('designer');

  // 担当者フィルターを復元
  if (designerParam) {
    currentDesignerTab = designerParam;
    // サイドバーと案件表示を更新（タブ切り替え後に実行）
    setTimeout(() => {
      renderSidebar();
      if (mainTab === 'projects') {
        renderProjects();
      }
    }, 150);
  }

  // メインタブの切り替え
  if (mainTab === 'projects') {
    const btn = document.querySelector('.header-nav-btn');
    if (btn) switchMainTab('projects', btn);
  } else if (mainTab === 'calendar') {
    const btn = document.querySelectorAll('.header-nav-btn')[1];
    if (btn) switchMainTab('calendar', btn);
    isHandlingHashChange = false;
    return;
  } else if (mainTab === 'analytics') {
    const btn = document.querySelectorAll('.header-nav-btn')[2];
    if (btn) switchMainTab('analytics', btn);
    isHandlingHashChange = false;
    return;
  } else if (mainTab === 'settings') {
    const btn = document.querySelectorAll('.header-nav-btn')[3];
    if (btn) switchMainTab('settings', btn);

    // サブタブ（設定パネル）の切り替え
    if (subTab) {
      setTimeout(() => {
        // 有効なパネル名のリスト
        const validPanels = ['staff', 'taskManagement', 'products', 'customize', 'kintone', 'backup', 'fcManagement'];
        if (validPanels.includes(subTab)) {
          openSettingsPanel(subTab);
        }
        // フラグをリセット（遅延後）
        setTimeout(() => {
          isHandlingHashChange = false;
          log('✅ handleHashChange完了');
        }, 150);
      }, 100);
    } else {
      // サブタブがない場合はすぐにフラグをリセット
      setTimeout(() => {
        isHandlingHashChange = false;
        log('✅ handleHashChange完了');
      }, 150);
    }
  } else {
    // 不明なタブの場合はすぐにフラグをリセット
    isHandlingHashChange = false;
  }
}

// ハッシュ変更時のリスナー
window.addEventListener('hashchange', handleHashChange);

// ============================================
// ArchiDeck v3.0 新機能
// ============================================

// グローバル変数追加
let projectTasks = [];
let projectMinutes = [];
let kintoneSettings = null;
let currentTaskSort = 'due';

// 全案件タスクを読み込み（カレンダー用）
async function loadAllProjectTasks() {
  try {
    const { data, error } = await supabase
      .from('project_tasks')
      .select('*')
      .eq('is_completed', false)
      .not('due_date', 'is', null);

    if (error) {
      console.error('project_tasks読み込みエラー:', error);
      projectTasks = [];
      return;
    }
    projectTasks = data || [];
    log('✅ project_tasks読み込み完了:', projectTasks.length, '件');
  } catch (err) {
    console.error('loadAllProjectTasks error:', err);
    projectTasks = [];
  }
}

// デザイナーカテゴリ別取得ヘルパー関数
function getDesignersByCategory(category) {
  return designers.filter(d => d.category === category).sort((a, b) => (a.display_order || 999) - (b.display_order || 999));
}
function getSekkeiDesigners() {
  return getDesignersByCategory('設計');
}
function getIcDesigners() {
  return getDesignersByCategory('IC');
}
function getExteriorDesigners() {
  return getDesignersByCategory('外構');
}
function getRealestateDesigners() {
  return getDesignersByCategory('不動産');
}
function getConstructionDesigners() {
  return getDesignersByCategory('工事');
}
function getSalesDesigners() {
  return getDesignersByCategory('営業');
}

// サイドバーに部署別折りたたみ機能を追加（全職種対応）
const originalRenderSidebar = renderSidebar;

// サイドバー折りたたみ状態管理
function getSidebarCollapseState() {
  const saved = localStorage.getItem('archideck_sidebar_collapse');
  return saved ? JSON.parse(saved) : {};
}

function setSidebarCollapseState(category, collapsed) {
  const state = getSidebarCollapseState();
  state[category] = collapsed;
  localStorage.setItem('archideck_sidebar_collapse', JSON.stringify(state));
}

function toggleSidebarSection(category) {
  const state = getSidebarCollapseState();
  const newState = !state[category];
  setSidebarCollapseState(category, newState);
  renderSidebar();
}

// 初期表示でログインユーザーの職種を開く
function getInitialExpandedCategories() {
  const state = getSidebarCollapseState();
  // 既にlocalStorageに状態がある場合はそれを使用
  if (Object.keys(state).length > 0) return state;

  // 初回: ログインユーザーの職種を開く
  const defaultState = { '設計': true, 'IC': true, '外構': true, '不動産': true, '工事': true, '営業': true };
  if (currentUserCategory && currentUserCategory !== 'admin') {
    // 自分の職種以外は閉じる
    Object.keys(defaultState).forEach(cat => {
      defaultState[cat] = (cat !== currentUserCategory);
    });
  } else {
    // 管理者は全て開く
    Object.keys(defaultState).forEach(cat => defaultState[cat] = false);
  }
  return defaultState;
}

renderSidebar = function() {
  const container = document.getElementById('sidebarContent');
  if (!container) return;

  const sekkeiDesigners = getSekkeiDesigners();
  const icDesigners = getIcDesigners();
  const exteriorDesigners = getExteriorDesigners();
  const realestateDesigners = getRealestateDesigners();
  const constructionDesigners = getConstructionDesigners();
  const salesDesigners = getSalesDesigners();
  const allCount = projects.filter(p => p.status !== 'completed' && !p.is_archived).length;
  const archivedCount = projects.filter(p => p.is_archived).length;

  const collapseState = getSidebarCollapseState();
  const initialState = getInitialExpandedCategories();

  // 折りたたみ状態を決定（localStorageに無ければ初期状態を使用）
  const isCollapsed = (cat) => {
    if (collapseState[cat] !== undefined) return collapseState[cat];
    return initialState[cat] || false;
  };

  let html = `
    <div class="sidebar-section">
      <div class="sidebar-item ${currentDesignerTab === 'ALL' ? 'active' : ''}" onclick="selectDesigner('ALL')">
        <span class="sidebar-item-label">全案件</span>
        <span class="sidebar-item-count">${allCount}</span>
      </div>
      <div class="sidebar-item ${currentDesignerTab === 'ARCHIVED' ? 'active' : ''}" onclick="selectDesigner('ARCHIVED')" style="background: ${currentDesignerTab === 'ARCHIVED' ? 'var(--success-bg)' : 'transparent'};">
        <span class="sidebar-item-label" style="color: var(--success-color);">✓ 完了済</span>
        <span class="sidebar-item-count" style="background: var(--success-color); color: white;">${archivedCount}</span>
      </div>
    </div>
  `;

  // セクション生成ヘルパー（案件数とタスク数を表示）
  function renderSection(category, icon, designersList, getProjectCount, getTaskCount) {
    if (designersList.length === 0) return '';

    const collapsed = isCollapsed(category);

    // セクション全体のタスク数を計算
    // 部署タイトル横のタスク数表示は不要（削除済み）
    const sectionTaskBadge = '';

    let sectionHtml = `<div class="sidebar-section sidebar-collapsible ${collapsed ? 'collapsed' : ''}">
      <div class="sidebar-section-title" onclick="toggleSidebarSection('${category}')" style="cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
        <span>${icon} ${category}担当${sectionTaskBadge}</span>
        <span class="sidebar-collapse-icon" style="font-size: 10px; transition: transform 0.2s;">${collapsed ? '▶' : '▼'}</span>
      </div>
      <div class="sidebar-section-items" style="${collapsed ? 'display: none;' : ''}">`;

    designersList.forEach(designer => {
      const count = getProjectCount(designer);
      const taskInfo = getTaskCount ? getTaskCount(designer) : { total: 0, completed: 0 };
      const incompleteTasks = taskInfo.total - taskInfo.completed;

      // 色分けロジック
      let countClass = 'count-blue';
      let nameClass = '';
      if (count >= 7) {
        nameClass = 'name-red';
        countClass = 'count-yellow';
      } else if (count >= 5) {
        countClass = 'count-yellow';
      }

      sectionHtml += `
        <div class="sidebar-item ${currentDesignerTab === designer.name ? 'active' : ''}" onclick="selectDesigner('${designer.name}')">
          <span class="sidebar-item-label ${nameClass}">${designer.name}</span>
          <button class="sidebar-task-btn" onclick="event.stopPropagation(); openStaffTasksModal('${designer.name}')" title="タスク一覧">📋</button>
          <span class="sidebar-item-count ${countClass}">${count}</span>
        </div>
      `;
    });

    sectionHtml += '</div></div>';
    return sectionHtml;
  }

  // タスク数計算ヘルパー（担当者の全案件のタスク完了状況）
  function calculateTaskCount(designerName, category) {
    let total = 0;
    let completed = 0;

    projects.filter(p => !p.is_archived && p.status !== 'completed').forEach(p => {
      let isAssigned = false;
      let taskList = [];

      if (category === '設計' && (p.assigned_to || '').trim() === designerName) {
        isAssigned = true;
        taskList = tasksV2.filter(t => t.category === '設計');
      } else if (category === 'IC' && (p.ic_assignee || '').trim() === designerName && p.layout_confirmed_date) {
        // IC担当は間取確定済みの案件のみ
        isAssigned = true;
        taskList = tasksV2.filter(t => t.category === 'IC');
      } else if (category === '外構' && (p.exterior_assignee || '').trim() === designerName) {
        isAssigned = true;
        taskList = getTasksForCategory('外構');
      } else if (category === '不動産' && (p.realestate_assignee || '').trim() === designerName) {
        isAssigned = true;
        taskList = getTasksForCategory('不動産');
      } else if (category === '工事' && (p.construction_assignee || '').trim() === designerName) {
        isAssigned = true;
        taskList = getTasksForCategory('工事');
      }

      if (isAssigned && taskList.length > 0) {
        const progressData = p.progress || {};
        taskList.forEach(taskDef => {
          total++;
          const task = progressData[taskDef.task_key] || {};
          const stateOptions = getTaskStateOptions(taskDef.task_key);
          const lastOption = stateOptions && stateOptions.length > 0 ? stateOptions[stateOptions.length - 1] : null;
          if (task.state === lastOption) {
            completed++;
          }
        });
      }
    });

    return { total, completed };
  }

  // 設計担当セクション
  html += renderSection('設計', '📐', sekkeiDesigners, (designer) => {
    return projects.filter(p => {
      const assigned = (p.assigned_to || '').trim();
      return assigned === designer.name.trim() && p.status !== 'completed' && !p.is_archived;
    }).length;
  }, (designer) => calculateTaskCount(designer.name.trim(), '設計'));

  // IC担当セクション（間取確定済みのみ）
  html += renderSection('IC', '🎨', icDesigners, (designer) => {
    return projects.filter(p => {
      const icAssigned = (p.ic_assignee || '').trim();
      // 間取確定済みの案件のみ表示
      return icAssigned === designer.name.trim() && p.status !== 'completed' && !p.is_archived && p.layout_confirmed_date;
    }).length;
  }, (designer) => calculateTaskCount(designer.name.trim(), 'IC'));

  // 外構担当セクション
  html += renderSection('外構', '🌳', exteriorDesigners, (designer) => {
    return projects.filter(p => {
      const exteriorAssigned = (p.exterior_assignee || '').trim();
      return exteriorAssigned === designer.name.trim() && p.status !== 'completed' && !p.is_archived;
    }).length;
  }, (designer) => calculateTaskCount(designer.name.trim(), '外構'));

  // 不動産担当セクション
  html += renderSection('不動産', '🏠', realestateDesigners, (designer) => {
    return projects.filter(p => {
      const realestateAssigned = (p.realestate_assignee || '').trim();
      return realestateAssigned === designer.name.trim() && p.status !== 'completed' && !p.is_archived;
    }).length;
  }, (designer) => calculateTaskCount(designer.name.trim(), '不動産'));

  // 工事担当セクション
  html += renderSection('工事', '🔨', constructionDesigners, (designer) => {
    return projects.filter(p => {
      const constructionAssigned = (p.construction_assignee || '').trim();
      return constructionAssigned === designer.name.trim() && p.status !== 'completed' && !p.is_archived;
    }).length;
  }, (designer) => calculateTaskCount(designer.name.trim(), '工事'));

  // 営業担当セクション
  html += renderSection('営業', '💼', salesDesigners, (designer) => {
    return projects.filter(p => {
      const salesAssigned = (p.sales_assignee || '').trim();
      return salesAssigned === designer.name.trim() && p.status !== 'completed' && !p.is_archived;
    }).length;
  }, null); // 営業にはタスク一覧なし

  container.innerHTML = html;
};

// 担当者タスク一覧モーダル
let currentStaffForTasks = null;

function openStaffTasksModal(staffName) {
  currentStaffForTasks = staffName;
  document.getElementById('staffTasksModalTitle').textContent = `${staffName} のタスク一覧`;
  renderStaffTasksList();
  ModalManager.open(document.getElementById('staffTasksModal'));
}

function closeStaffTasksModal() {
  ModalManager.close(document.getElementById('staffTasksModal'));
  currentStaffForTasks = null;
}

function sortTasksBy(sortType) {
  currentTaskSort = sortType;
  document.getElementById('sortByDueBtn').classList.toggle('btn-primary', sortType === 'due');
  document.getElementById('sortByDueBtn').classList.toggle('btn-ghost', sortType !== 'due');
  document.getElementById('sortByProjectBtn').classList.toggle('btn-primary', sortType === 'project');
  document.getElementById('sortByProjectBtn').classList.toggle('btn-ghost', sortType !== 'project');
  renderStaffTasksList();
}

async function renderStaffTasksList() {
  const container = document.getElementById('staffTasksList');
  if (!container || !currentStaffForTasks) return;

  // 担当者の案件を取得（IC担当は間取確定済みのみ）
  const staffProjects = projects.filter(p => {
    const assigned = (p.assigned_to || '').trim();
    const icAssigned = (p.ic_assignee || '').trim();
    const exteriorAssigned = (p.exterior_assignee || '').trim();
    // IC担当としてマッチするには間取確定が必要
    const icMatches = icAssigned === currentStaffForTasks && p.layout_confirmed_date;
    return (assigned === currentStaffForTasks || icMatches || exteriorAssigned === currentStaffForTasks) &&
           p.status !== 'completed' && !p.is_archived;
  });

  // project_tasksからタスクを取得
  const { data: tasks } = await supabase
    .from('project_tasks')
    .select('*')
    .in('project_id', staffProjects.map(p => p.id))
    .eq('is_completed', false)
    .order('due_date');

  if (!tasks || tasks.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>未完了のタスクはありません</p></div>';
    return;
  }

  // ソート
  let sortedTasks = [...tasks];
  if (currentTaskSort === 'due') {
    sortedTasks.sort((a, b) => {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    });
  } else {
    sortedTasks.sort((a, b) => {
      const projectA = staffProjects.find(p => p.id === a.project_id);
      const projectB = staffProjects.find(p => p.id === b.project_id);
      return (projectA?.customer || '').localeCompare(projectB?.customer || '');
    });
  }

  // 表示
  let html = '';
  const today = new Date().toISOString().split('T')[0];

  if (currentTaskSort === 'project') {
    // 邸名ごとにグループ化
    const grouped = {};
    sortedTasks.forEach(task => {
      const project = staffProjects.find(p => p.id === task.project_id);
      const key = project?.customer || '不明';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(task);
    });

    for (const [customer, customerTasks] of Object.entries(grouped)) {
      html += `<div class="task-list-group"><div class="task-list-group-title">${escapeHtml(customer)}</div>`;
      customerTasks.forEach(task => {
        const isOverdue = task.due_date && task.due_date < today;
        html += `
          <div class="project-task-item">
            <input type="checkbox" class="project-task-checkbox" onchange="toggleProjectTask('${task.id}', '${task.project_id}', this.checked)">
            <span class="project-task-name">${escapeHtml(task.task_name)}</span>
            ${task.due_date ? `<span class="project-task-due ${isOverdue ? 'overdue' : ''}">${escapeHtml(task.due_date)}</span>` : ''}
          </div>
        `;
      });
      html += '</div>';
    }
  } else {
    // 期限順
    sortedTasks.forEach(task => {
      const project = staffProjects.find(p => p.id === task.project_id);
      const isOverdue = task.due_date && task.due_date < today;
      html += `
        <div class="project-task-item">
          <input type="checkbox" class="project-task-checkbox" onchange="toggleProjectTask('${task.id}', '${task.project_id}', this.checked)">
          <span class="project-task-name">${escapeHtml(task.task_name)}</span>
          <span style="font-size: 12px; color: var(--text-muted);">${escapeHtml(project?.customer || '')}</span>
          ${task.due_date ? `<span class="project-task-due ${isOverdue ? 'overdue' : ''}">${escapeHtml(task.due_date)}</span>` : ''}
        </div>
      `;
    });
  }

  container.innerHTML = html;
}

// 案件タスク一覧読み込み
async function loadProjectTasksList(projectId) {
  const container = document.getElementById(`projectTasksList_${projectId}`);
  if (!container) return;

  try {
    const { data: tasks, error } = await supabase
      .from('project_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('due_date', { ascending: true, nullsFirst: false });

    if (error) {
      logError('Load tasks error:', error);
      container.innerHTML = '<div style="color: var(--text-muted); font-size: 12px;">タスクの読み込みに失敗しました</div>';
      updateTaskBadge(projectId, 0);
      return;
    }

    // 未解決タスク数を計算してバッジ更新
    const unresolvedCount = tasks ? tasks.filter(t => !t.is_completed).length : 0;
    updateTaskBadge(projectId, unresolvedCount);

    if (!tasks || tasks.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); font-size: 12px;">タスクはありません</div>';
      return;
    }

    container.innerHTML = tasks.map(t => `
      <div class="task-item" style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: ${t.is_completed ? 'var(--success-light)' : 'var(--bg-secondary)'}; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid ${t.is_completed ? 'var(--success-color)' : 'var(--primary-color)'};">
        <input type="checkbox" ${t.is_completed ? 'checked' : ''} onchange="toggleProjectTask('${t.id}', '${projectId}', this.checked)" style="width: 18px; height: 18px; cursor: pointer;">
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 13px; font-weight: 500; ${t.is_completed ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${escapeHtml(t.task_name)}</div>
          ${t.due_date ? `<div style="font-size: 11px; color: ${isOverdue(t.due_date) && !t.is_completed ? 'var(--danger-color)' : 'var(--text-muted)'}; margin-top: 2px;">期限: ${formatDate(t.due_date)}</div>` : ''}
        </div>
        <button class="btn btn-small btn-ghost" onclick="deleteProjectTask('${t.id}', '${projectId}')" style="flex-shrink: 0; padding: 4px 8px; font-size: 12px; color: var(--danger-color);">削除</button>
      </div>
    `).join('');
  } catch (error) {
    logError('Load tasks error:', error);
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 12px;">タスクの読み込みに失敗しました</div>';
    updateTaskBadge(projectId, 0);
  }
}

// タスクバッジを更新
function updateTaskBadge(projectId, count) {
  const badge = document.getElementById(`taskBadge_${projectId}`);
  if (badge) {
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }
}

// バッジのみ更新（カード用）
async function loadBadgeCounts(projectId) {
  try {
    // タスク数を取得
    const { data: tasks, error: taskError } = await supabase
      .from('project_tasks')
      .select('id, is_completed')
      .eq('project_id', projectId);

    if (!taskError && tasks) {
      const unresolvedCount = tasks.filter(t => !t.is_completed).length;
      updateTaskBadge(projectId, unresolvedCount);
    }

    // 議事録数を取得
    const { data: minutes, error: minError } = await supabase
      .from('project_minutes')
      .select('id')
      .eq('project_id', projectId);

    if (!minError && minutes) {
      updateMinutesBadge(projectId, minutes.length);
    }

    // 引継書バッジを取得（テーブルが存在しない場合もあるため、エラーは無視）
    try {
      const { data: handovers, error: handoverError } = await supabase
        .from('project_handovers')
        .select('content')
        .eq('project_id', projectId);

      // エラーがなく、データがある場合のみ処理
      if (!handoverError && handovers && handovers.length > 0) {
        const handover = handovers[0];
        let hasContent = false;
        try {
          const handoverData = JSON.parse(handover.content);
          hasContent = Object.values(handoverData).some(v => v && v.trim());
        } catch (e) {
          hasContent = !!(handover.content && handover.content.trim());
        }
        updateHandoverBadge(projectId, hasContent);
      }
    } catch (handoverErr) {
      // 引継書テーブルエラーは無視（テーブル未作成の環境向け）
    }
  } catch (e) {
    // エラーは静かに無視
  }
}

// 期限切れチェック
function isOverdue(dateStr) {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(dateStr);
  return dueDate < today;
}

// タスク完了状態を切り替え
async function toggleProjectTask(taskId, projectId, isCompleted) {
  const { error } = await supabase
    .from('project_tasks')
    .update({ is_completed: isCompleted, updated_at: new Date().toISOString() })
    .eq('id', taskId);

  if (error) {
    showToast('更新に失敗しました', 'error');
    return;
  }

  // 案件カード内のタスクリストを更新
  await loadProjectTasksList(projectId);
  // バッジカウントを更新
  await loadBadgeCounts(projectId);
  // 担当別タスク一覧も更新
  renderStaffTasksList();
}

// タスク削除
async function deleteProjectTask(taskId, projectId) {
  if (!confirm('このタスクを削除しますか？')) return;

  const { error } = await supabase
    .from('project_tasks')
    .delete()
    .eq('id', taskId);

  if (error) {
    showToast('削除に失敗しました', 'error');
    return;
  }

  showToast('タスクを削除しました', 'success');
  await loadProjectTasksList(projectId);
  // バッジカウントを更新
  await loadBadgeCounts(projectId);
}

// 案件にタスクを追加
async function addProjectTask(projectId, taskName, dueDate) {
  if (SaveGuard.isLocked(`addProjectTask_${projectId}`)) return;

  if (!taskName.trim()) {
    showToast('タスク名を入力してください', 'error');
    return;
  }

  const project = projects.find(p => p.id === projectId);

  await SaveGuard.run(`addProjectTask_${projectId}`, async () => {
  try {
    const { data, error } = await supabase
      .from('project_tasks')
      .insert({
        project_id: projectId,
        task_name: taskName.trim(),
        due_date: dueDate || null,
        assigned_to: project?.assigned_to || '',
        is_completed: false
      })
      .select();

    if (error) {
      logError('タスク追加エラー:', error);
      if (error.code === '42501') {
        showToast('タスク追加の権限がありません。管理者に連絡してください。', 'error');
      } else if (error.code === '42P01') {
        showToast('タスクテーブルが存在しません。データベースを確認してください。', 'error');
      } else {
        showToast(`タスク追加に失敗しました: ${error.message}`, 'error');
      }
      return;
    }

    // 入力欄をクリア
    const taskNameEl = document.getElementById(`newTaskName_${projectId}`);
    const taskDueEl = document.getElementById(`newTaskDue_${projectId}`);
    if (taskNameEl) taskNameEl.value = '';
    if (taskDueEl) taskDueEl.value = '';

    showToast('タスクを追加しました', 'success');

    // タスクリスト更新（エラーがあっても続行）
    try {
      await loadProjectTasksList(projectId);
    } catch (e) {
      console.warn('タスクリスト更新エラー:', e);
    }

    // バッジカウントを更新（エラーがあっても続行）
    try {
      await loadBadgeCounts(projectId);
    } catch (e) {
      console.warn('バッジカウント更新エラー:', e);
    }
  } catch (err) {
    logError('タスク追加例外:', err);
    showToast('タスク追加中にエラーが発生しました', 'error');
  }
  }); // SaveGuard.run
}

// 主要タスクのステータスを動的に取得（レポート用）
// category: '設計' or 'IC' - 表示するカテゴリ
function getMainTaskStatuses(progressData, category = '設計') {
  const statuses = [];

  // カテゴリ別の主要キーワード
  const mainKeywords = category === 'IC'
    ? ['キッチン', 'お風呂', '洗面', 'トイレ', '照明', '仕様書', '実施図', '確定図']
    : ['太陽光', '給排水', '換気', 'サッシ', '構造', 'エボルツ', 'evoltz'];

  tasksV2.filter(t => t.category === category).forEach(task => {
    if (task.task_name && task.has_state) {
      const isMain = mainKeywords.some(k => task.task_name.includes(k));
      if (isMain && progressData[task.task_key]?.state) {
        // タスク名を短縮
        let shortName = task.task_name
          .replace(/依頼$/, '')
          .replace(/作成$/, '')
          .replace(/プラン$/, '');
        statuses.push(`${shortName}:${progressData[task.task_key].state}`);
      }
    }
  });

  return statuses;
}

// 申請GO条件チェック（動的にタスクを検索）
function getApplicationGoRequiredTasks() {
  // タスク名のキーワードで必要なタスクを検索
  const keywords = ['太陽光', '給排水', '換気', 'サッシ'];
  const requiredTasks = [];

  keywords.forEach(keyword => {
    const task = tasksV2.find(t => t.task_name && t.task_name.includes(keyword) && t.has_state);
    if (task) {
      // state_optionsをパース（文字列の場合）
      let options = task.state_options;
      if (typeof options === 'string') {
        try {
          options = JSON.parse(options);
        } catch (e) {
          options = [];
        }
      }
      // 最終状態（state_optionsの最後の値）を取得
      const finalState = Array.isArray(options) && options.length > 0
        ? options[options.length - 1]
        : '保存済';
      requiredTasks.push({
        task_key: task.task_key,
        task_name: task.task_name,
        finalState: finalState
      });
    }
  });

  return requiredTasks;
}

function canPressApplicationGo(project) {
  const progressData = project.progress || {};
  const requiredTasks = getApplicationGoRequiredTasks();

  // 必要なタスクが見つからない場合は旧ロジックにフォールバック
  if (requiredTasks.length === 0) {
    log('⚠️ 申請GO: tasksV2からタスクが見つかりません。旧ロジックを使用');
    const solarOk = progressData['solar']?.state === '営業共有済';
    const plumbingOk = progressData['plumbing']?.state === '保存済';
    const ventilationOk = progressData['ventilation']?.state === '保存済';
    const sashOk = progressData['sash']?.state === '保存済';
    return solarOk && plumbingOk && ventilationOk && sashOk;
  }

  // 全ての必要タスクが最終状態かチェック
  const results = requiredTasks.map(req => {
    const currentState = progressData[req.task_key]?.state || '-';
    const ok = currentState === req.finalState;
    log(`📋 申請GO条件: ${req.task_name} (${req.task_key}) = "${currentState}" / 必要: "${req.finalState}" → ${ok ? '✓' : '✗'}`);
    return ok;
  });

  const allOk = results.every(r => r);
  log(`📋 申請GO判定: ${allOk ? '条件OK' : '条件未達'}`);
  return allOk;
}

// 申請GO確認モーダル
let applicationGoProjectId = null;

function confirmApplicationGo(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  applicationGoProjectId = projectId;
  const progressData = project.progress || {};
  const requiredTasks = getApplicationGoRequiredTasks();

  // 条件表示（動的に生成）
  let conditions;
  if (requiredTasks.length > 0) {
    conditions = requiredTasks.map(req => ({
      label: req.task_name,
      ok: progressData[req.task_key]?.state === req.finalState,
      value: progressData[req.task_key]?.state || '-',
      required: req.finalState
    }));
  } else {
    // フォールバック
    conditions = [
      { label: '太陽光依頼', ok: progressData['solar']?.state === '営業共有済', value: progressData['solar']?.state || '-', required: '営業共有済' },
      { label: '給排水図依頼', ok: progressData['plumbing']?.state === '保存済', value: progressData['plumbing']?.state || '-', required: '保存済' },
      { label: '換気図依頼', ok: progressData['ventilation']?.state === '保存済', value: progressData['ventilation']?.state || '-', required: '保存済' },
      { label: 'サッシ依頼', ok: progressData['sash']?.state === '保存済', value: progressData['sash']?.state || '-', required: '保存済' }
    ];
  }

  document.getElementById('applicationGoProjectName').textContent = project.customer;
  document.getElementById('applicationGoConditions').innerHTML = conditions.map(c =>
    `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
      <span style="color: ${c.ok ? '#10b981' : '#ef4444'};">${c.ok ? '✓' : '✗'}</span>
      <span>${c.label}:</span>
      <span style="font-weight: 500; color: ${c.ok ? '#10b981' : 'var(--text-secondary)'};">${c.value}</span>
    </div>`
  ).join('');

  ModalManager.open(document.getElementById('applicationGoModal'));
}

function closeApplicationGoModal() {
  ModalManager.close(document.getElementById('applicationGoModal'));
  applicationGoProjectId = null;
}

async function executeApplicationGo() {
  // 二重クリック防止
  if (SaveGuard.isLocked('executeApplicationGo')) return;
  if (!applicationGoProjectId) return;

  const project = projects.find(p => p.id === applicationGoProjectId);
  if (!project) return;

  // 条件を再チェック（モーダル表示後に条件が変わっている可能性があるため）
  if (!canPressApplicationGo(project)) {
    showToast('条件が満たされていません。タスクの状態を確認してください。', 'error');
    closeApplicationGoModal();
    return;
  }

  await SaveGuard.run('executeApplicationGo', async () => {
    // 申請タスクを完了としてマーク（完了済みには移動しない）
    const progressData = project.progress || {};
    if (!progressData['application']) progressData['application'] = {};
    progressData['application'].completed = true;
    progressData['application'].date = new Date().toISOString().split('T')[0];

    showStatus('保存中...', 'saving');
    // 重要: updated_at を現在の値に保持して、案件の位置を変えない
    // DBトリガーが自動更新しないよう、明示的に同じ値をセット
    const { error } = await supabase
      .from('projects')
      .update({
        progress: progressData,
        updated_at: project.updated_at // 現在の値を保持
      })
      .eq('id', applicationGoProjectId);

    if (error) {
      showStatus('エラー', 'error');
      showToast('申請GO処理に失敗しました: ' + error.message, 'error');
      return;
    }

    project.progress = progressData;
    // updated_at は変更しない（案件の位置を維持）

    closeApplicationGoModal();
    renderProjects();
    updateSidebar();
    showStatus('保存済み', 'saved');
    showToast(`${project.customer} の申請GOを完了しました`, 'success');
  });
}

// 未完了タスクがあるかチェック
function checkHasIncompleteTasks(project, progressData) {
  // 設計タスクをチェック
  const designTasks = tasksV2.filter(t => t.category === '設計' && t.has_state && t.task_key !== 'application');
  for (const task of designTasks) {
    const stateOptions = getTaskStateOptions(task.task_key);
    if (stateOptions && stateOptions.length > 0) {
      const finalState = stateOptions[stateOptions.length - 1];
      const currentState = progressData[task.task_key]?.state || '';
      // 未完了（最終状態でない）タスクがある場合
      if (currentState !== finalState && currentState !== '') {
        return true;
      }
    }
  }

  // ICタスクをチェック（間取確定済みの案件のみ）
  if (project.layout_confirmed_date) {
    const icTasks = tasksV2.filter(t => t.category === 'IC' && t.has_state);
    for (const task of icTasks) {
      const stateOptions = getTaskStateOptions(task.task_key);
      if (stateOptions && stateOptions.length > 0) {
        const finalState = stateOptions[stateOptions.length - 1];
        const currentState = progressData[task.task_key]?.state || '';
        if (currentState !== finalState && currentState !== '') {
          return true;
        }
      }
    }
  }

  return false;
}

// カードモーダル機能
function openCardModal(projectId, type) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  let title = '';
  let content = '';

  switch(type) {
    case 'tasks':
      title = `✅ タスク - ${project.customer}`;
      content = `
        <div id="modalTasksList_${projectId}" class="project-task-list"></div>
        <div class="add-task-form" style="margin-top:16px;display:flex;gap:8px;">
          <input type="text" id="modalNewTaskName_${projectId}" placeholder="タスク名" style="flex:1;padding:10px;border:1px solid var(--border-color);border-radius:6px;">
          <input type="date" id="modalNewTaskDue_${projectId}" style="padding:10px;border:1px solid var(--border-color);border-radius:6px;">
          <button class="btn btn-primary" onclick="addProjectTaskFromModal('${projectId}')">追加</button>
        </div>
      `;
      break;
    case 'minutes':
      title = `📄 議事録 - ${project.customer}`;
      content = `
        <div id="modalMinutesList_${projectId}" class="minutes-list" style="margin-bottom:16px;"></div>
        <div class="minutes-upload-area" style="padding:24px;border:2px dashed var(--border-color);border-radius:8px;text-align:center;cursor:pointer;" ondragover="handleMinutesDragOver(event)" ondragleave="handleMinutesDragLeave(event)" ondrop="handleDropWithDateModal(event, '${projectId}')" onclick="document.getElementById('modalMinutesUpload_${projectId}').click()">
          <input type="file" id="modalMinutesUpload_${projectId}" style="display:none" accept=".pdf,.doc,.docx,.xls,.xlsx" onchange="uploadMinutesWithDateModal('${projectId}', this.files[0])">
          <span style="font-size:24px;">📁</span>
          <div style="margin-top:8px;">クリックまたはドラッグ&ドロップ</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">PDF, Word, Excel対応</div>
        </div>
      `;
      break;
    case 'handover':
      title = `📋 引継書 - ${project.customer}`;
      content = `
        <div class="handover-sections">
          <div class="handover-section">
            <label class="handover-label">🏠 設計</label>
            <textarea class="handover-textarea" id="modalHandover_design_${projectId}" placeholder="設計からの引継事項..." rows="3"></textarea>
          </div>
          <div class="handover-section">
            <label class="handover-label">🎨 IC</label>
            <textarea class="handover-textarea" id="modalHandover_ic_${projectId}" placeholder="ICからの引継事項..." rows="3"></textarea>
          </div>
          <div class="handover-section">
            <label class="handover-label">🌳 外構</label>
            <textarea class="handover-textarea" id="modalHandover_exterior_${projectId}" placeholder="外構からの引継事項..." rows="3"></textarea>
          </div>
          <div class="handover-section">
            <label class="handover-label">🏢 不動産</label>
            <textarea class="handover-textarea" id="modalHandover_realestate_${projectId}" placeholder="不動産からの引継事項..." rows="3"></textarea>
          </div>
          <div class="handover-section">
            <label class="handover-label">🔧 工事</label>
            <textarea class="handover-textarea" id="modalHandover_construction_${projectId}" placeholder="工事からの引継事項..." rows="3"></textarea>
          </div>
        </div>
        <button class="btn btn-primary" style="margin-top:12px;" onclick="saveHandoverFromModal('${projectId}')">引継書を保存</button>
      `;
      break;
  }

  // モーダルHTML作成
  const modalHtml = `
    <div class="card-modal-overlay" onclick="closeCardModal(event)">
      <div class="card-modal" onclick="event.stopPropagation()">
        <div class="card-modal-header">
          <span class="card-modal-title">${title}</span>
          <button class="card-modal-close" onclick="closeCardModal()">&times;</button>
        </div>
        <div class="card-modal-body">${content}</div>
      </div>
    </div>
  `;

  // 既存モーダルを削除
  const existing = document.querySelector('.card-modal-overlay');
  if (existing) existing.remove();

  // モーダルを追加
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // データ読み込み
  if (type === 'tasks') {
    loadModalTasksList(projectId);
  } else if (type === 'minutes') {
    loadModalMinutesList(projectId);
  } else if (type === 'handover') {
    loadHandoverContent(projectId);
  }
}

function closeCardModal(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.querySelector('.card-modal-overlay');
  if (modal) modal.remove();
}

// モーダル用タスク読み込み
async function loadModalTasksList(projectId) {
  const container = document.getElementById(`modalTasksList_${projectId}`);
  if (!container) return;

  try {
    const { data: tasks, error } = await supabase
      .from('project_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('due_date', { ascending: true, nullsFirst: false });

    if (error || !tasks || tasks.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); font-size: 13px; padding: 20px; text-align: center;">タスクはありません</div>';
      return;
    }

    container.innerHTML = tasks.map(t => `
      <div class="task-item" style="display: flex; align-items: center; gap: 10px; padding: 12px; background: ${t.is_completed ? 'var(--success-light)' : 'var(--bg-secondary)'}; border-radius: 8px; margin-bottom: 8px; border-left: 3px solid ${t.is_completed ? 'var(--success-color)' : 'var(--primary-color)'};">
        <input type="checkbox" ${t.is_completed ? 'checked' : ''} onchange="toggleProjectTaskModal('${t.id}', '${projectId}', this.checked)" style="width: 18px; height: 18px; cursor: pointer;">
        <div style="flex: 1;">
          <div style="font-size: 14px; font-weight: 500; ${t.is_completed ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${escapeHtml(t.task_name)}</div>
          ${t.due_date ? `<div style="font-size: 12px; color: ${isOverdue(t.due_date) && !t.is_completed ? 'var(--danger-color)' : 'var(--text-muted)'}; margin-top: 4px;">期限: ${formatDate(t.due_date)}</div>` : ''}
        </div>
        <button class="btn btn-small btn-ghost" onclick="deleteProjectTaskModal('${t.id}', '${projectId}')" style="color: var(--danger-color);">削除</button>
      </div>
    `).join('');
  } catch (error) {
    container.innerHTML = '<div style="color: var(--text-muted);">読み込みに失敗しました</div>';
  }
}

async function addProjectTaskFromModal(projectId) {
  const taskName = document.getElementById(`modalNewTaskName_${projectId}`).value.trim();
  const dueDate = document.getElementById(`modalNewTaskDue_${projectId}`).value;
  if (!taskName) { showToast('タスク名を入力してください', 'error'); return; }
  await addProjectTask(projectId, taskName, dueDate);
  document.getElementById(`modalNewTaskName_${projectId}`).value = '';
  document.getElementById(`modalNewTaskDue_${projectId}`).value = '';
  loadModalTasksList(projectId);
}

async function toggleProjectTaskModal(taskId, projectId, isCompleted) {
  await toggleProjectTask(taskId, projectId, isCompleted);
  loadModalTasksList(projectId);
  await loadBadgeCounts(projectId);
}

async function deleteProjectTaskModal(taskId, projectId) {
  if (!confirm('このタスクを削除しますか？')) return;
  await supabase.from('project_tasks').delete().eq('id', taskId);
  showToast('タスクを削除しました', 'success');
  loadModalTasksList(projectId);
  loadProjectTasksList(projectId);
  await loadBadgeCounts(projectId);
}

// モーダル用メモ保存
async function saveSharedMemoFromModal(projectId) {
  const memo = document.getElementById(`modalSharedMemo_${projectId}`).value;
  const { error } = await supabase.from('projects').update({ shared_memo: memo, updated_at: new Date().toISOString() }).eq('id', projectId);
  if (error) { showToast('メモ保存に失敗しました', 'error'); return; }
  const project = projects.find(p => p.id === projectId);
  if (project) project.shared_memo = memo;
  showToast('メモを保存しました', 'success');
  closeCardModal();
  renderProjects();
}

// モーダル用議事録読み込み
async function loadModalMinutesList(projectId) {
  const container = document.getElementById(`modalMinutesList_${projectId}`);
  if (!container) return;

  try {
    const { data: minutes, error } = await supabase
      .from('project_minutes')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error || !minutes || minutes.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); font-size: 13px; padding: 16px; text-align: center;">アップロードされた議事録はありません</div>';
      return;
    }

    // 議事録を回数ごとにグループ化（meeting_date優先、なければcreated_atを使用）
    const sortedByDate = [...minutes].sort((a, b) => {
      const dateA = a.meeting_date || a.created_at.split('T')[0];
      const dateB = b.meeting_date || b.created_at.split('T')[0];
      return new Date(dateA) - new Date(dateB);
    });
    const dateGroups = {};
    sortedByDate.forEach(m => {
      const dateKey = m.meeting_date || m.created_at.split('T')[0]; // meeting_date優先
      if (!dateGroups[dateKey]) {
        dateGroups[dateKey] = [];
      }
      dateGroups[dateKey].push(m);
    });

    // グループに回数を割り当て（古い日付から1回目、2回目...）
    const groupKeys = Object.keys(dateGroups).sort();
    const groupedHtml = groupKeys.map((dateKey, index) => {
      const meetingNumber = index + 1;
      const groupMinutes = dateGroups[dateKey];
      const formattedDate = new Date(dateKey).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
      const firstMinuteId = groupMinutes[0].id; // グループの代表ID
      // カスタム名称があれば表示（meeting_nameフィールドを使用）
      const customName = groupMinutes[0].meeting_name || '';
      // 「0回目」「０回目」は「第０回目打合せ」に変換
      let displayTitle;
      if (customName) {
        const normalizedName = customName.replace(/０/g, '0');
        if (normalizedName === '0回目') {
          displayTitle = `📋 第０回目打合せ（${formattedDate}）`;
        } else {
          displayTitle = `📋 ${customName}（${formattedDate}）`;
        }
      } else {
        displayTitle = `📋 第${meetingNumber}回打合せ（${formattedDate}）`;
      }

      return `
        <div class="minutes-group" style="margin-bottom: 16px; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
          <div style="background: var(--bg-tertiary); padding: 10px 14px; font-weight: 600; font-size: 13px; color: var(--text-primary); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between;">
            <span>${displayTitle}</span>
            <div style="display: flex; gap: 4px;">
              <button class="btn btn-small btn-ghost" onclick="editMinuteName('${firstMinuteId}', '${escapeHtml(customName)}', '${dateKey}', '${projectId}')" style="padding: 2px 8px; font-size: 11px;" title="名称を編集">📝</button>
              <button class="btn btn-small btn-ghost" onclick="editMinuteDate('${firstMinuteId}', '${dateKey}', '${projectId}')" style="padding: 2px 8px; font-size: 11px;" title="日付を編集">📅</button>
            </div>
          </div>
          <div style="padding: 8px;">
            ${groupMinutes.map(m => `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: var(--bg-secondary); border-radius: 6px; margin-bottom: 6px;">
                <a href="${m.file_url}" target="_blank" style="color: var(--primary-color); text-decoration: none; font-size: 13px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">📄 ${escapeHtml(m.file_name)}</a>
                <div style="display: flex; gap: 4px;">
                  <button class="btn btn-small btn-ghost" onclick="editSingleMinuteDate('${m.id}', '${m.meeting_date || dateKey}', '${projectId}')" style="padding: 4px 8px; font-size: 11px;" title="この議事録の日付を変更">📅</button>
                  <button class="btn btn-small btn-ghost" onclick="deleteMinuteModal('${m.id}', '${projectId}')" style="color: var(--danger-color); padding: 4px 8px;">削除</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).reverse().join(''); // 新しい回から表示

    container.innerHTML = groupedHtml;
  } catch (error) {
    container.innerHTML = '<div style="color: var(--text-muted);">読み込みに失敗しました</div>';
  }
}

// 議事録グループの日付を編集（グループ内全ての議事録を更新）
async function editMinuteDate(minuteId, currentDate, projectId) {
  const newDate = prompt('打合せ日を入力してください（YYYY-MM-DD形式）:', currentDate);
  if (!newDate || newDate === currentDate) return;

  // 日付形式チェック
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    showToast('日付形式が正しくありません（例: 2026-01-08）', 'error');
    return;
  }

  showStatus('更新中...', 'saving');

  // 同じ日付の議事録を全て更新
  const { error } = await supabase
    .from('project_minutes')
    .update({ meeting_date: newDate })
    .eq('project_id', projectId)
    .or(`meeting_date.eq.${currentDate},meeting_date.is.null`);

  if (error) {
    showStatus('エラー', 'error');
    showToast('更新に失敗しました: ' + error.message, 'error');
    return;
  }

  showStatus('保存済み', 'saved');
  showToast('打合せ日を更新しました', 'success');
  await loadModalMinutesList(projectId);
}

// 議事録グループの名称を編集
async function editMinuteName(minuteId, currentName, currentDate, projectId) {
  const newName = prompt('打合せの名称を入力してください（例: 間取り確定打合せ）:', currentName || '');
  if (newName === null) return; // キャンセル

  showStatus('更新中...', 'saving');

  // 同じ日付の議事録を全て更新
  const { error } = await supabase
    .from('project_minutes')
    .update({ meeting_name: newName || null })
    .eq('project_id', projectId)
    .eq('meeting_date', currentDate);

  if (error) {
    showStatus('エラー', 'error');
    showToast('更新に失敗しました: ' + error.message, 'error');
    return;
  }

  showStatus('保存済み', 'saved');
  showToast(newName ? '名称を更新しました' : '名称をリセットしました', 'success');
  await loadModalMinutesList(projectId);
}

// 個別の議事録の日付を編集
async function editSingleMinuteDate(minuteId, currentDate, projectId) {
  const newDate = prompt('この議事録の打合せ日を入力してください（YYYY-MM-DD形式）:', currentDate);
  if (!newDate || newDate === currentDate) return;

  // 日付形式チェック
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    showToast('日付形式が正しくありません（例: 2026-01-08）', 'error');
    return;
  }

  showStatus('更新中...', 'saving');

  const { error } = await supabase
    .from('project_minutes')
    .update({ meeting_date: newDate })
    .eq('id', minuteId);

  if (error) {
    showStatus('エラー', 'error');
    showToast('更新に失敗しました: ' + error.message, 'error');
    return;
  }

  showStatus('保存済み', 'saved');
  showToast('打合せ日を更新しました', 'success');
  await loadModalMinutesList(projectId);
}

async function uploadMinutesWithDateModal(projectId, file) {
  // 打合せ日は今日の日付を自動設定
  await uploadMinutesWithDate(projectId, file);
  loadModalMinutesList(projectId);
}

function handleDropWithDateModal(event, projectId) {
  event.preventDefault();
  event.stopPropagation();
  const file = event.dataTransfer.files[0];
  if (file) uploadMinutesWithDateModal(projectId, file);
}

async function deleteMinuteModal(minuteId, projectId) {
  if (!confirm('この議事録を削除しますか？')) return;
  await supabase.from('project_minutes').delete().eq('id', minuteId);
  showToast('議事録を削除しました', 'success');
  loadModalMinutesList(projectId);
  loadMinutesList(projectId);
}

// モーダル用引継書読み込み
async function loadHandoverContent(projectId) {
  const departments = ['design', 'ic', 'exterior', 'realestate', 'construction'];

  try {
    const { data: handovers, error } = await supabase
      .from('project_handovers')
      .select('content')
      .eq('project_id', projectId);

    // エラーまたはデータなしの場合は終了
    if (error || !handovers || handovers.length === 0) return;

    const data = handovers[0];
    if (data && data.content) {
      // JSON形式かどうかを判定
      let handoverData;
      try {
        handoverData = JSON.parse(data.content);
      } catch (e) {
        // 旧形式（プレーンテキスト）の場合は設計に入れる
        handoverData = { design: data.content };
      }

      // 各部署のテキストエリアに値を設定
      departments.forEach(dept => {
        const textarea = document.getElementById(`modalHandover_${dept}_${projectId}`);
        if (textarea && handoverData[dept]) {
          textarea.value = handoverData[dept];
        }
      });
    }
  } catch (e) {}
}

async function saveHandoverFromModal(projectId) {
  const departments = ['design', 'ic', 'exterior', 'realestate', 'construction'];

  // 各部署の内容を収集
  const handoverData = {};
  departments.forEach(dept => {
    const textarea = document.getElementById(`modalHandover_${dept}_${projectId}`);
    if (textarea && textarea.value.trim()) {
      handoverData[dept] = textarea.value.trim();
    }
  });

  const content = JSON.stringify(handoverData);

  try {
    const { data: existingList } = await supabase
      .from('project_handovers')
      .select('id')
      .eq('project_id', projectId);

    const existing = existingList && existingList.length > 0 ? existingList[0] : null;

    let error;
    if (existing) {
      ({ error } = await supabase.from('project_handovers').update({ content, updated_at: new Date().toISOString() }).eq('id', existing.id));
    } else {
      ({ error } = await supabase.from('project_handovers').insert({ project_id: projectId, content }));
    }

    if (error) { showToast('引継書保存に失敗しました', 'error'); return; }
    showToast('引継書を保存しました', 'success');
    closeCardModal();
  } catch (e) {
    showToast('引継書保存中にエラーが発生しました', 'error');
  }
}

// 折りたたみ機能
function toggleCardSection(element) {
  const section = element.closest('.card-section');
  section.classList.toggle('collapsed');

  // セクション識別子を取得（例：projectId_sectionName）
  const card = section.closest('.project-card');
  if (card) {
    const projectId = card.dataset.projectId;
    const sectionTitle = section.querySelector('.card-section-header h4')?.textContent;
    if (projectId && sectionTitle) {
      const key = `archideck_card_${projectId}_${sectionTitle}`;
      const isCollapsed = section.classList.contains('collapsed');
      localStorage.setItem(key, isCollapsed ? 'collapsed' : 'expanded');
    }
  }
}

// 業務内容セクション用の排他的アコーディオン（1つ開くと他が閉じる）
function toggleBizSection(element, projectId) {
  const clickedSection = element.closest('.card-section.biz-section');
  const card = document.querySelector(`.project-card[data-project-id="${projectId}"]`);
  if (!card || !clickedSection) return;

  // 同じカード内の全業務内容セクションを取得
  const allBizSections = card.querySelectorAll('.card-section.biz-section');

  // クリックしたセクションが閉じている場合は開く（他は閉じる）
  if (clickedSection.classList.contains('collapsed')) {
    // 全て閉じる
    allBizSections.forEach(sec => sec.classList.add('collapsed'));
    // クリックしたものだけ開く
    clickedSection.classList.remove('collapsed');
  } else {
    // 既に開いている場合は閉じる
    clickedSection.classList.add('collapsed');
  }
}

// カード展開状態を復元
function restoreCardStates(projectId) {
  const card = document.querySelector(`.project-card[data-project-id="${projectId}"]`);
  if (!card) return;

  const sections = card.querySelectorAll('.card-section');
  sections.forEach(section => {
    const sectionTitle = section.querySelector('.card-section-header h4')?.textContent;
    if (sectionTitle) {
      const key = `archideck_card_${projectId}_${sectionTitle}`;
      const savedState = localStorage.getItem(key);
      if (savedState === 'collapsed') {
        section.classList.add('collapsed');
      } else if (savedState === 'expanded') {
        section.classList.remove('collapsed');
      }
    }
  });
}

// ドラッグ&ドロップ並べ替え
let draggedCard = null;
let customCardOrder = safeJsonParse(localStorage.getItem('archideck_card_order'), []);

function handleDragStart(event) {
  draggedCard = event.target.closest('.project-card');
  if (!draggedCard) return;
  draggedCard.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggedCard.dataset.projectId);
}

function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';

  const targetCard = event.target.closest('.project-card');
  if (!targetCard || targetCard === draggedCard) return;

  const container = document.getElementById('projectsContainer');
  const cards = [...container.querySelectorAll('.project-card:not(.dragging)')];
  const targetIndex = cards.indexOf(targetCard);
  const draggedIndex = cards.indexOf(draggedCard);

  // 視覚的フィードバック
  targetCard.classList.add('drag-over');
}

function handleDrop(event) {
  event.preventDefault();
  const targetCard = event.target.closest('.project-card');
  if (!targetCard || targetCard === draggedCard) return;

  const container = document.getElementById('projectsContainer');
  const rect = targetCard.getBoundingClientRect();
  const insertBefore = event.clientY < rect.top + rect.height / 2;

  if (insertBefore) {
    container.insertBefore(draggedCard, targetCard);
  } else {
    container.insertBefore(draggedCard, targetCard.nextSibling);
  }

  // カスタム順序を保存
  saveCardOrder();
  showToast('並び順を保存しました', 'info');
}

function handleDragEnd(event) {
  if (draggedCard) {
    draggedCard.classList.remove('dragging');
  }
  // 全てのdrag-overクラスを削除
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  draggedCard = null;
}

function saveCardOrder() {
  const container = document.getElementById('projectsContainer');
  const cards = container.querySelectorAll('.project-card');
  customCardOrder = [...cards].map(card => card.dataset.projectId);
  localStorage.setItem('archideck_card_order', JSON.stringify(customCardOrder));
}

function getCustomCardOrder() {
  return safeJsonParse(localStorage.getItem('archideck_card_order'), []);
}

function clearCustomCardOrder() {
  localStorage.removeItem('archideck_card_order');
  customCardOrder = [];
  renderProjects();
  showToast('並び順をリセットしました', 'info');
}

// モバイルサイドバー開閉
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('show');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.remove('open');
  overlay.classList.remove('show');
}

// ドラッグ&ドロップ関数（議事録アップロード用）
function handleMinutesDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.add('drag-over');
}

function handleMinutesDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.remove('drag-over');
}

function handleMinutesDrop(event, projectId) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.remove('drag-over');

  const files = event.dataTransfer.files;
  if (files.length > 0) {
    uploadMinutes(projectId, files[0]);
  }
}

// 打合せ日付きドロップ
function handleDropWithDate(event, projectId) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.remove('drag-over');

  const files = event.dataTransfer.files;
  if (files.length > 0) {
    uploadMinutesWithDate(projectId, files[0]);
  }
}

// ファイル選択トリガー
function triggerMinutesUpload(projectId) {
  document.getElementById(`minutesUpload_${projectId}`).click();
}

// ファイル名から打合せ日を予測
function predictMeetingDateFromFilename(filename) {
  // 様々な日付パターンを認識
  const patterns = [
    // YYYYMMDD形式: 20260108, 2026_01_08, 2026-01-08
    /(\d{4})[-_]?(\d{2})[-_]?(\d{2})/,
    // YYMMDD形式: 260108
    /(?:^|[^\d])(\d{2})(\d{2})(\d{2})(?:[^\d]|$)/,
    // MM月DD日形式: 1月8日, 01月08日
    /(\d{1,2})月(\d{1,2})日/,
    // MM-DD形式: 1-8, 01-08
    /(?:^|[^\d])(\d{1,2})[-\/](\d{1,2})(?:[^\d]|$)/,
    // R6.1.8形式 (令和)
    /R(\d{1,2})[.\-](\d{1,2})[.\-](\d{1,2})/i,
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      let year, month, day;

      if (pattern.source.includes('月')) {
        // MM月DD日形式
        year = new Date().getFullYear();
        month = parseInt(match[1], 10);
        day = parseInt(match[2], 10);
      } else if (pattern.source.includes('R')) {
        // 令和形式
        year = 2018 + parseInt(match[1], 10); // 令和1年=2019年
        month = parseInt(match[2], 10);
        day = parseInt(match[3], 10);
      } else if (match[1].length === 4) {
        // YYYYMMDD形式
        year = parseInt(match[1], 10);
        month = parseInt(match[2], 10);
        day = parseInt(match[3], 10);
      } else if (match[1].length === 2 && match[2].length === 2 && match[3].length === 2) {
        // YYMMDD形式
        year = 2000 + parseInt(match[1], 10);
        month = parseInt(match[2], 10);
        day = parseInt(match[3], 10);
      } else {
        // MM-DD形式
        year = new Date().getFullYear();
        month = parseInt(match[1], 10);
        day = parseInt(match[2], 10);
      }

      // 日付の妥当性チェック
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= 2030) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }

  // 予測できなかった場合は今日の日付
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

// 打合せ日・案件名・担当者を含む議事録アップロード
async function uploadMinutesWithDate(projectId, file) {
  if (!file) {
    showToast('ファイルを選択してください', 'error');
    return;
  }

  const project = projects.find(p => p.id === projectId);
  if (!project) {
    showToast('案件が見つかりません', 'error');
    return;
  }

  // ファイル名から打合せ日を予測（予測できなければ今日の日付）
  const meetingDate = predictMeetingDateFromFilename(file.name);

  // ファイルサイズチェック（10MB上限）
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    showToast('ファイルサイズは10MB以下にしてください', 'error');
    return;
  }

  // 対応ファイル形式チェック
  const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|doc|docx|xls|xlsx)$/i)) {
    showToast('PDF, Word, Excelファイルのみ対応しています', 'error');
    return;
  }

  // 元のファイル名を維持（表示用）
  const originalFileName = file.name;
  const ext = file.name.split('.').pop();
  const formattedDate = meetingDate.replace(/-/g, '');

  // ストレージ用のファイル名（ASCII文字のみ - Supabase Storageの制限対応）
  const safeFileName = `${Date.now()}_${formattedDate}.${ext}`;

  showToast('アップロード中...', 'info');

  try {
    // Supabase Storageにアップロード（ファイル名はASCIIのみ）
    const storagePath = `${projectId}/${safeFileName}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('minutes')
      .upload(storagePath, file);

    if (uploadError) {
      logError('Storage upload error:', uploadError);
      if (uploadError.message?.includes('bucket') || uploadError.statusCode === '404') {
        showToast('ストレージが設定されていません。管理者に連絡してください。', 'error');
      } else if (uploadError.message?.includes('policy')) {
        showToast('アップロード権限がありません。', 'error');
      } else {
        showToast('アップロードに失敗しました: ' + (uploadError.message || 'Unknown error'), 'error');
      }
      return;
    }

    // URLを取得
    const { data: urlData } = supabase.storage
      .from('minutes')
      .getPublicUrl(storagePath);

    // DBに登録（元のファイル名を維持 + 打合せ日を予測）
    const insertData = {
      project_id: projectId,
      file_name: originalFileName,
      file_url: urlData.publicUrl || '',
      file_size: file.size || 0,
      uploaded_by: currentUser?.email || 'anonymous@archideck.jp',
      meeting_date: meetingDate // ファイル名から予測した打合せ日
    };

    const { data: insertedData, error: dbError } = await supabase
      .from('project_minutes')
      .insert(insertData)
      .select();

    if (dbError) {
      logError('DB insert error:', dbError);
      console.error('DB insert error details:', JSON.stringify(dbError));
      // ストレージにアップロード済みのファイルを削除
      await supabase.storage.from('minutes').remove([storagePath]).catch(e => console.warn('ストレージ削除エラー:', e));
      showToast('議事録登録に失敗しました: ' + (dbError.message || dbError.code || 'Unknown error'), 'error');
      return;
    }

    // 通知を送信
    const notifyEmails = [];
    if (project.assigned_to) {
      const designer = designers.find(d => d.name === project.assigned_to);
      if (designer?.email) notifyEmails.push(designer.email);
    }
    if (project.ic_assignee) {
      const icDesigner = designers.find(d => d.name === project.ic_assignee);
      if (icDesigner?.email) notifyEmails.push(icDesigner.email);
    }
    if (project.exterior_assignee) {
      const extDesigner = designers.find(d => d.name === project.exterior_assignee);
      if (extDesigner?.email) notifyEmails.push(extDesigner.email);
    }

    for (const email of notifyEmails) {
      await supabase.from('notifications').insert({
        user_email: email,
        title: '新しい議事録がアップロードされました',
        message: `${project.customer}様の議事録「${autoTitle}」がアップロードされました`,
        link: `#projects?id=${projectId}`
      }).catch(e => console.warn('通知送信エラー:', e));
    }

    showToast('議事録をアップロードしました', 'success');
    await loadMinutesList(projectId);
  } catch (error) {
    logError('Upload error:', error);
    showToast('アップロードに失敗しました', 'error');
  }
}

// 共有メモ保存
async function saveSharedMemo(projectId) {
  const memo = document.getElementById(`sharedMemo_${projectId}`).value;
  const { error } = await supabase
    .from('projects')
    .update({ shared_memo: memo, updated_at: new Date().toISOString() })
    .eq('id', projectId);

  if (error) {
    showToast('メモ保存に失敗しました', 'error');
    return;
  }

  const project = projects.find(p => p.id === projectId);
  if (project) project.shared_memo = memo;
  showToast('メモを保存しました', 'success');
}

// 引継書保存
async function saveHandover(projectId) {
  const content = document.getElementById(`handover_${projectId}`).value;

  try {
    // 既存の引継書を確認
    const { data: existingList } = await supabase
      .from('project_handovers')
      .select('id')
      .eq('project_id', projectId);

    const existing = existingList && existingList.length > 0 ? existingList[0] : null;

    let error;
    if (existing) {
      ({ error } = await supabase
        .from('project_handovers')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', existing.id));
    } else {
      ({ error } = await supabase
        .from('project_handovers')
        .insert({ project_id: projectId, content }));
    }

    if (error) {
      showToast('引継書保存に失敗しました', 'error');
      return;
    }

    showToast('引継書を保存しました', 'success');
  } catch (e) {
    showToast('引継書保存中にエラーが発生しました', 'error');
  }
}

// 議事録アップロード
async function uploadMinutes(projectId, file) {
  if (!file) {
    showToast('ファイルを選択してください', 'error');
    return;
  }

  // ファイルサイズチェック（10MB上限）
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    showToast('ファイルサイズは10MB以下にしてください', 'error');
    return;
  }

  // 対応ファイル形式チェック
  const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|doc|docx|xls|xlsx)$/i)) {
    showToast('PDF, Word, Excelファイルのみ対応しています', 'error');
    return;
  }

  showToast('アップロード中...', 'info');

  try {
    // Supabase Storageにアップロード（ファイル名はASCIIのみ）
    const ext = file.name.split('.').pop();
    const safeStoragePath = `${projectId}/${Date.now()}.${ext}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('minutes')
      .upload(safeStoragePath, file);

    if (uploadError) {
      logError('Storage upload error:', uploadError);
      // バケットが存在しない場合のエラーメッセージ
      if (uploadError.message?.includes('bucket') || uploadError.statusCode === '404') {
        showToast('ストレージが設定されていません。管理者に連絡してください。', 'error');
      } else if (uploadError.message?.includes('policy')) {
        showToast('アップロード権限がありません。', 'error');
      } else {
        showToast('アップロードに失敗しました: ' + (uploadError.message || 'Unknown error'), 'error');
      }
      return;
    }

    // URLを取得
    const { data: urlData } = supabase.storage
      .from('minutes')
      .getPublicUrl(safeStoragePath);

    // DBに登録
    const insertData = {
      project_id: projectId,
      file_name: file.name,
      file_url: urlData.publicUrl || '',
      file_size: file.size || 0,
      uploaded_by: currentUser?.email || 'anonymous@archideck.jp'
    };

    const { data: insertedData, error: dbError } = await supabase
      .from('project_minutes')
      .insert(insertData)
      .select();

    if (dbError) {
      logError('DB insert error:', dbError);
      console.error('DB insert error details:', JSON.stringify(dbError));
      // ストレージにアップロード済みのファイルを削除
      await supabase.storage.from('minutes').remove([safeStoragePath]).catch(e => console.warn('ストレージ削除エラー:', e));
      showToast('議事録登録に失敗しました: ' + (dbError.message || dbError.code || 'Unknown error'), 'error');
      return;
    }

    // 通知を送信
    const project = projects.find(p => p.id === projectId);
    if (project) {
      const notifyEmails = [];
      if (project.assigned_to) {
        const designer = designers.find(d => d.name === project.assigned_to);
        if (designer?.email) notifyEmails.push(designer.email);
      }
      if (project.ic_assignee) {
        const icDesigner = designers.find(d => d.name === project.ic_assignee);
        if (icDesigner?.email) notifyEmails.push(icDesigner.email);
      }
      if (project.exterior_assignee) {
        const extDesigner = designers.find(d => d.name === project.exterior_assignee);
        if (extDesigner?.email) notifyEmails.push(extDesigner.email);
      }

      // 通知をDBに登録
      for (const email of notifyEmails) {
        await supabase.from('notifications').insert({
          user_email: email,
          title: '新しい議事録がアップロードされました',
          message: `${project.customer}様の議事録「${file.name}」がアップロードされました`,
          link: `#projects?id=${projectId}`
        }).catch(e => console.warn('通知送信エラー:', e));
      }
    }

    showToast('議事録をアップロードしました', 'success');
    await loadMinutesList(projectId);
  } catch (error) {
    logError('Upload error:', error);
    showToast('アップロードに失敗しました', 'error');
  }
}

// 議事録一覧読み込み
async function loadMinutesList(projectId) {
  const container = document.getElementById(`minutesList_${projectId}`);
  if (!container) return;

  try {
    const { data: minutes, error } = await supabase
      .from('project_minutes')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      logError('Load minutes error:', error);
      container.innerHTML = '<div style="color: var(--text-muted); font-size: 12px;">議事録の読み込みに失敗しました</div>';
      updateMinutesBadge(projectId, 0);
      return;
    }

    // 議事録数をバッジに表示
    const minutesCount = minutes ? minutes.length : 0;
    updateMinutesBadge(projectId, minutesCount);

    if (!minutes || minutes.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); font-size: 12px;">アップロードされた議事録はありません</div>';
      return;
    }

    container.innerHTML = minutes.map(m => `
      <div class="minute-item" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--bg-secondary); border-radius: 6px; margin-bottom: 8px;">
        <div style="flex: 1; min-width: 0;">
          <a href="${m.file_url}" target="_blank" style="color: var(--primary-color); text-decoration: none; font-size: 13px; font-weight: 500; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            📄 ${escapeHtml(m.file_name)}
          </a>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
            ${formatFileSize(m.file_size)} • ${formatDate(m.created_at)}
          </div>
        </div>
        <button class="btn btn-small btn-ghost" onclick="deleteMinute('${m.id}', '${projectId}')" style="flex-shrink: 0; padding: 4px 8px; font-size: 12px; color: var(--danger-color);">削除</button>
      </div>
    `).join('');
  } catch (error) {
    logError('Load minutes error:', error);
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 12px;">議事録の読み込みに失敗しました</div>';
    updateMinutesBadge(projectId, 0);
  }
}

// 議事録バッジを更新
function updateMinutesBadge(projectId, count) {
  const badge = document.getElementById(`minutesBadge_${projectId}`);
  if (badge) {
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }
}

// 引継書バッジを更新
function updateHandoverBadge(projectId, hasContent) {
  const badge = document.getElementById(`handoverBadge_${projectId}`);
  if (badge) {
    badge.style.display = hasContent ? 'inline-flex' : 'none';
  }
}

// 引継書バッジを読み込み時に更新
async function loadHandoverBadge(projectId) {
  try {
    const { data: handovers, error } = await supabase
      .from('project_handovers')
      .select('content')
      .eq('project_id', projectId);

    if (error || !handovers || handovers.length === 0) return;

    const data = handovers[0];
    if (data && data.content) {
      let hasContent = false;
      try {
        const handoverData = JSON.parse(data.content);
        hasContent = Object.values(handoverData).some(v => v && v.trim());
      } catch (e) {
        hasContent = !!data.content.trim();
      }
      updateHandoverBadge(projectId, hasContent);
    }
  } catch (e) {}
}

// 議事録削除
async function deleteMinute(minuteId, projectId) {
  if (!confirm('この議事録を削除しますか？')) return;

  try {
    const { error } = await supabase
      .from('project_minutes')
      .delete()
      .eq('id', minuteId);

    if (error) throw error;
    showToast('議事録を削除しました', 'success');
    await loadMinutesList(projectId);
  } catch (error) {
    logError('Delete minute error:', error);
    showToast('削除に失敗しました', 'error');
  }
}

// ファイルサイズフォーマット
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// 日付フォーマット
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// 依頼日用の短いフォーマット（M/D形式）
function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// HTMLエスケープ
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============================================
// バリデーション関数
// ============================================
const Validators = {
  // メールアドレス検証
  isValidEmail(email) {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  // パスワード検証（8文字以上、英数字混在）
  isValidPassword(password) {
    if (!password || password.length < 8) return false;
    return /^(?=.*[a-zA-Z])(?=.*\d).{8,}$/.test(password);
  },

  // 電話番号検証
  isValidPhone(phone) {
    if (!phone) return true; // 任意フィールド
    return /^[\d\-\+\(\)\s]{10,}$/.test(phone);
  },

  // 日付が過去でないかチェック
  isNotPastDate(dateStr) {
    if (!dateStr) return true;
    const inputDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return inputDate >= today;
  },

  // 日付が有効かチェック
  isValidDate(dateStr) {
    if (!dateStr) return true;
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
  },

  // 必須フィールドチェック
  isRequired(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
  },

  // 文字数制限チェック
  maxLength(value, max) {
    if (!value) return true;
    return String(value).length <= max;
  },

  // 数値範囲チェック
  inRange(value, min, max) {
    const num = Number(value);
    if (isNaN(num)) return false;
    return num >= min && num <= max;
  }
};

// フォームバリデーション結果
function validateForm(rules) {
  const errors = [];
  for (const [fieldName, validations] of Object.entries(rules)) {
    for (const { validate, message, value } of validations) {
      if (!validate(value)) {
        errors.push({ field: fieldName, message });
      }
    }
  }
  return errors;
}

// ============================================
// エラーハンドリング
// ============================================
const ErrorHandler = {
  // エラーメッセージのマッピング
  messages: {
    'Invalid login credentials': 'メールアドレスまたはパスワードが正しくありません',
    'Email not confirmed': 'メールアドレスの確認が完了していません',
    'User already registered': 'このメールアドレスは既に登録されています',
    'Password should be at least': 'パスワードは8文字以上で設定してください',
    'Network error': 'ネットワークエラーが発生しました。接続を確認してください',
    'timeout': 'タイムアウトしました。再度お試しください',
    'duplicate key': 'このデータは既に登録されています',
    'foreign key constraint': '関連するデータが存在するため削除できません',
    'permission denied': 'この操作を行う権限がありません',
  },

  // エラーメッセージを変換
  getUserMessage(error) {
    if (!error) return '予期せぬエラーが発生しました';

    const errorMsg = error.message || String(error);

    // マッピングから検索
    for (const [key, userMsg] of Object.entries(this.messages)) {
      if (errorMsg.toLowerCase().includes(key.toLowerCase())) {
        return userMsg;
      }
    }

    // Supabaseエラーコード対応
    if (error.code === 'PGRST116') return 'データが見つかりません';
    if (error.code === '23505') return 'このデータは既に存在します';
    if (error.code === '23503') return '関連するデータが存在しません';
    if (error.code === '42501') return 'この操作を行う権限がありません';

    // デフォルトメッセージ
    return 'エラーが発生しました。時間をおいて再度お試しください';
  },

  // エラーをログ＆通知
  handle(error, context = '') {
    logError(`❌ エラー [${context}]:`, error);

    const userMessage = this.getUserMessage(error);
    showToast(userMessage, 'error');

    // 本番環境ではエラーログを送信（将来実装）
    // this.sendErrorLog(error, context);
  }
};

// ============================================
// 分析ダッシュボード機能
// ============================================

function getProgressBadgeClass(progress) {
  if (progress >= 70) return 'high';
  if (progress >= 40) return 'medium';
  return 'low';
}

function generateWeeklyReport() {
  const today = new Date();
  const weekAgo = new Date(today - 7 * 24 * 60 * 60 * 1000);

  const activeProjects = projects.filter(p => !p.is_archived);
  const completedThisWeek = projects.filter(p => {
    if (!p.is_archived) return false;
    const updated = new Date(p.updated_at);
    return updated >= weekAgo;
  });

  // 今週更新された案件
  const updatedThisWeek = projects.filter(p => {
    const updated = new Date(p.updated_at);
    return updated >= weekAgo;
  });

  // 設計担当者別にグループ化
  const designerProjects = {};
  designers.filter(d => d.category === '設計').forEach(d => {
    designerProjects[d.name] = activeProjects.filter(p => p.assigned_to === d.name);
  });

  // IC担当者別にグループ化（間取確定済みのみ）
  const icProjects = {};
  designers.filter(d => d.category === 'IC').forEach(d => {
    icProjects[d.name] = activeProjects.filter(p => p.ic_assignee === d.name && p.layout_confirmed_date);
  });

  // 外構担当者別にグループ化
  const exteriorProjects = {};
  designers.filter(d => d.category === '外構').forEach(d => {
    exteriorProjects[d.name] = activeProjects.filter(p => p.exterior_assignee === d.name);
  });

  // 不動産担当者別にグループ化
  const realestateProjects = {};
  designers.filter(d => d.category === '不動産').forEach(d => {
    realestateProjects[d.name] = activeProjects.filter(p => p.realestate_assignee === d.name);
  });

  // 担当者別セクションを生成（共通関数）
  const generateDesignerSection = (projs, name, categoryLabel, weekAgo) => {
    const projectDetails = projs.map(p => {
      const progress = calculateProgress(p);
      const progressData = p.progress || {};

      // 主要タスクのステータスを取得（動的）
      const statuses = getMainTaskStatuses(progressData, categoryLabel === 'IC' ? 'IC' : '設計');
      const statusText = statuses.length > 0 ? statuses.join(' / ') : '未着手';
      const wasUpdated = new Date(p.updated_at) >= weekAgo;

      return `<div class="report-project-detail ${wasUpdated ? 'updated' : ''}">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <span style="font-weight: 600;">${escapeHtml(p.customer)}</span>
          <span class="report-progress-badge ${getProgressBadgeClass(progress)}">${progress}%</span>
        </div>
        <div style="font-size: 12px; color: var(--text-secondary);">${statusText}</div>
        ${wasUpdated ? '<div style="font-size: 11px; color: var(--primary-color); margin-top: 4px;">📝 今週更新</div>' : ''}
      </div>`;
    }).join('');

    return `<div class="report-designer-section">
      <div class="report-designer-header">
        <span class="report-designer-name">${escapeHtml(name)}</span>
        <span class="report-designer-count">${projs.length}件</span>
      </div>
      ${projectDetails}
    </div>`;
  };

  const designerSections = Object.entries(designerProjects)
    .filter(([name, projs]) => projs.length > 0)
    .map(([name, projs]) => generateDesignerSection(projs, name, '設計', weekAgo))
    .join('');

  const icSections = Object.entries(icProjects)
    .filter(([name, projs]) => projs.length > 0)
    .map(([name, projs]) => generateDesignerSection(projs, name, 'IC', weekAgo))
    .join('');

  const exteriorSections = Object.entries(exteriorProjects)
    .filter(([name, projs]) => projs.length > 0)
    .map(([name, projs]) => generateDesignerSection(projs, name, '外構', weekAgo))
    .join('');

  const realestateSections = Object.entries(realestateProjects)
    .filter(([name, projs]) => projs.length > 0)
    .map(([name, projs]) => generateDesignerSection(projs, name, '不動産', weekAgo))
    .join('');

  const report = `
    <div class="report-card">
      <div class="report-header">
        <h2>週報</h2>
        <span class="report-period">${weekAgo.toLocaleDateString('ja-JP')} 〜 ${today.toLocaleDateString('ja-JP')}</span>
      </div>
      <div class="report-stats-grid">
        <div class="report-stat-item">
          <div class="report-stat-value">${activeProjects.length}</div>
          <div class="report-stat-label">進行中</div>
        </div>
        <div class="report-stat-item">
          <div class="report-stat-value">${updatedThisWeek.length}</div>
          <div class="report-stat-label">今週更新</div>
        </div>
        <div class="report-stat-item">
          <div class="report-stat-value">${completedThisWeek.length}</div>
          <div class="report-stat-label">今週完了</div>
        </div>
      </div>
      <div class="report-section">
        <div class="report-section-title">📐 設計担当者別 案件状況</div>
        ${designerSections || '<div class="report-empty">進行中の案件はありません</div>'}
      </div>
      ${icSections ? `
      <div class="report-section">
        <div class="report-section-title">🎨 IC担当者別 案件状況</div>
        ${icSections}
      </div>` : ''}
      ${exteriorSections ? `
      <div class="report-section">
        <div class="report-section-title">🌳 外構担当者別 案件状況</div>
        ${exteriorSections}
      </div>` : ''}
      ${realestateSections ? `
      <div class="report-section">
        <div class="report-section-title">🏠 不動産担当者別 案件状況</div>
        ${realestateSections}
      </div>` : ''}
      ${completedThisWeek.length > 0 ? `
      <div class="report-section">
        <div class="report-section-title">今週の完了案件</div>
        <ul class="report-list">
          ${completedThisWeek.map(p => `<li class="report-list-item">
            <span class="report-project-name">${escapeHtml(p.customer)}</span>
            <span class="report-assignee">${escapeHtml(p.assigned_to || '未割当')}</span>
          </li>`).join('')}
        </ul>
      </div>` : ''}
    </div>
  `;

  const preview = document.getElementById('reportPreview');
  preview.style.display = 'block';
  preview.innerHTML = report;
  showToast('週報を生成しました', 'success');
}

function generateMonthlyReport() {
  const today = new Date();
  const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());

  const activeProjects = projects.filter(p => !p.is_archived);
  const completedThisMonth = projects.filter(p => {
    if (!p.is_archived) return false;
    const updated = new Date(p.updated_at);
    return updated >= monthAgo;
  });

  // 今月更新された案件
  const updatedThisMonth = projects.filter(p => {
    const updated = new Date(p.updated_at);
    return updated >= monthAgo;
  });

  const completionRate = projects.length > 0 ? Math.round(completedThisMonth.length / projects.length * 100) : 0;

  // 設計担当者別にグループ化
  const designerProjects = {};
  designers.filter(d => d.category === '設計').forEach(d => {
    designerProjects[d.name] = activeProjects.filter(p => p.assigned_to === d.name);
  });

  // IC担当者別にグループ化（間取確定済みのみ）
  const icProjects = {};
  designers.filter(d => d.category === 'IC').forEach(d => {
    icProjects[d.name] = activeProjects.filter(p => p.ic_assignee === d.name && p.layout_confirmed_date);
  });

  // 外構担当者別にグループ化
  const exteriorProjects = {};
  designers.filter(d => d.category === '外構').forEach(d => {
    exteriorProjects[d.name] = activeProjects.filter(p => p.exterior_assignee === d.name);
  });

  // 不動産担当者別にグループ化
  const realestateProjects = {};
  designers.filter(d => d.category === '不動産').forEach(d => {
    realestateProjects[d.name] = activeProjects.filter(p => p.realestate_assignee === d.name);
  });

  // 担当者ごとのセクション生成（共通関数）
  const generateMonthlySection = (projs, name, category, monthAgo) => {
    const projectDetails = projs.map(p => {
      const progressData = p.progress || {};
      const updatedAt = new Date(p.updated_at);
      const isUpdated = updatedAt >= monthAgo;

      // タスクステータスを収集（動的）
      const statuses = getMainTaskStatuses(progressData, category);

      const statusTags = statuses.map(s =>
        `<span class="report-status-tag active">${s}</span>`
      ).join('');

      return `<div class="report-project-detail ${isUpdated ? 'updated' : ''}">
        <div class="report-project-title">
          <span class="project-name">${escapeHtml(p.customer)}</span>
          ${isUpdated ? '<span class="report-updated-badge">今月更新</span>' : ''}
        </div>
        ${statusTags ? `<div class="report-status-list">${statusTags}</div>` : '<div class="report-status-list"><span class="report-status-tag">未着手</span></div>'}
      </div>`;
    }).join('');

    return `<div class="report-designer-section">
      <div class="report-designer-header">
        <span class="report-designer-name">${escapeHtml(name)}</span>
        <span class="report-designer-count">${projs.length}件</span>
      </div>
      ${projectDetails}
    </div>`;
  };

  const designerSections = Object.entries(designerProjects)
    .filter(([name, projs]) => projs.length > 0)
    .map(([name, projs]) => generateMonthlySection(projs, name, '設計', monthAgo))
    .join('');

  const icSections = Object.entries(icProjects)
    .filter(([name, projs]) => projs.length > 0)
    .map(([name, projs]) => generateMonthlySection(projs, name, 'IC', monthAgo))
    .join('');

  const exteriorSections = Object.entries(exteriorProjects)
    .filter(([name, projs]) => projs.length > 0)
    .map(([name, projs]) => generateMonthlySection(projs, name, '外構', monthAgo))
    .join('');

  const realestateSections = Object.entries(realestateProjects)
    .filter(([name, projs]) => projs.length > 0)
    .map(([name, projs]) => generateMonthlySection(projs, name, '不動産', monthAgo))
    .join('');

  const report = `
    <div class="report-card">
      <div class="report-header">
        <h2>月報</h2>
        <span class="report-period">${monthAgo.toLocaleDateString('ja-JP')} 〜 ${today.toLocaleDateString('ja-JP')}</span>
      </div>
      <div class="report-stats-grid">
        <div class="report-stat-item">
          <div class="report-stat-value">${projects.length}</div>
          <div class="report-stat-label">総案件数</div>
        </div>
        <div class="report-stat-item">
          <div class="report-stat-value">${activeProjects.length}</div>
          <div class="report-stat-label">進行中</div>
        </div>
        <div class="report-stat-item">
          <div class="report-stat-value">${updatedThisMonth.length}</div>
          <div class="report-stat-label">今月更新</div>
        </div>
        <div class="report-stat-item">
          <div class="report-stat-value">${completedThisMonth.length}</div>
          <div class="report-stat-label">今月完了</div>
        </div>
      </div>
      <div class="report-section">
        <div class="report-section-title">📐 設計担当者別 案件状況</div>
        ${designerSections || '<div class="report-empty">進行中の案件はありません</div>'}
      </div>
      ${icSections ? `
      <div class="report-section">
        <div class="report-section-title">🎨 IC担当者別 案件状況</div>
        ${icSections}
      </div>` : ''}
      ${exteriorSections ? `
      <div class="report-section">
        <div class="report-section-title">🌳 外構担当者別 案件状況</div>
        ${exteriorSections}
      </div>` : ''}
      ${realestateSections ? `
      <div class="report-section">
        <div class="report-section-title">🏠 不動産担当者別 案件状況</div>
        ${realestateSections}
      </div>` : ''}
      ${completedThisMonth.length > 0 ? `
      <div class="report-section">
        <div class="report-section-title">今月の完了案件</div>
        <ul class="report-list">
          ${completedThisMonth.map(p => `<li class="report-list-item">
            <span class="report-project-name">${escapeHtml(p.customer)}</span>
            <span class="report-assignee">${escapeHtml(p.assigned_to || '未割当')}</span>
          </li>`).join('')}
        </ul>
      </div>` : ''}
    </div>
  `;

  const preview = document.getElementById('reportPreview');
  preview.style.display = 'block';
  preview.innerHTML = report;
  showToast('月報を生成しました', 'success');
}

function exportAnalyticsCSV() {
  const headers = ['案件名', '設計担当', 'IC担当', '外構担当', '不動産担当', '商品', '進捗率', 'ステータス', '作成日'];
  const rows = projects.map(p => [
    p.customer,
    p.assigned_to || '',
    p.ic_assignee || '',
    p.exterior_assignee || '',
    p.realestate_assignee || '',
    p.specifications || '',
    calculateProgress(p) + '%',
    p.is_archived ? '完了' : '進行中',
    p.created_at ? new Date(p.created_at).toLocaleDateString('ja-JP') : ''
  ]);

  const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `archideck_analytics_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSVをダウンロードしました', 'success');
}

// ============================================
// 音声入力機能
// ============================================
let recognition = null;

function initVoiceInput() {
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = false;
    recognition.interimResults = false;
  }
}

function startVoiceInput(targetInputId) {
  if (!recognition) {
    showToast('音声入力はこのブラウザでサポートされていません', 'error');
    return;
  }

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const input = document.getElementById(targetInputId);
    if (input) {
      input.value = transcript;
      showToast('音声入力完了', 'success');
    }
  };

  recognition.onerror = (event) => {
    showToast('音声認識エラー: ' + event.error, 'error');
  };

  recognition.start();
  showToast('話してください...', 'info');
}

// 初期化時に音声入力をセットアップ
document.addEventListener('DOMContentLoaded', initVoiceInput);

// ============================================
// FC（フランチャイズ）管理
// ============================================
let fcOrganizations = [];

async function loadFcOrganizations() {
  try {
    const { data, error } = await supabaseWithTimeout(() =>
      supabase.from('fc_organizations').select('*').order('created_at', { ascending: false }),
      10000
    );

    if (error) {
      // テーブルが存在しない場合はスキップ
      if (error.code === '42P01') {
        warn('fc_organizationsテーブルが存在しません');
        return;
      }
      throw error;
    }

    fcOrganizations = data || [];
    renderFcList();
  } catch (e) {
    warn('FC組織読み込みエラーまたはタイムアウト:', e);
    fcOrganizations = [];
  }
}

function renderFcList() {
  const container = document.getElementById('fcListContainer');
  if (!container) return;

  if (fcOrganizations.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏪</div>
        <p>FCが登録されていません<br><small>「+ FC追加」ボタンから登録してください</small></p>
      </div>
    `;
    return;
  }

  const baseUrl = window.location.origin;

  container.innerHTML = `
    <div class="table-container">
      <table class="table">
        <thead>
          <tr>
            <th>FC名</th>
            <th>スラッグ</th>
            <th>専用URL</th>
            <th>ステータス</th>
            <th>作成日</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${fcOrganizations.map(fc => `
            <tr>
              <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="display: inline-block; width: 16px; height: 16px; border-radius: 4px; background: ${escapeHtml(fc.primary_color || '#2563EB')};"></span>
                  <strong>${escapeHtml(fc.name)}</strong>
                </div>
              </td>
              <td><code style="background: var(--bg-tertiary); padding: 2px 8px; border-radius: 4px;">${escapeHtml(fc.slug)}</code></td>
              <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <a href="${baseUrl}/fc/${escapeHtml(fc.slug)}/" target="_blank" style="font-size: 13px; color: var(--primary-color);">
                    /fc/${escapeHtml(fc.slug)}/
                  </a>
                  <button class="btn btn-ghost btn-small" onclick="copyFcUrl('${escapeHtml(fc.slug)}')" title="URLをコピー">📋</button>
                </div>
              </td>
              <td>
                ${fc.is_active
                  ? '<span class="badge badge-success">有効</span>'
                  : '<span class="badge badge-secondary">無効</span>'}
              </td>
              <td style="font-size: 13px; color: var(--text-secondary);">${new Date(fc.created_at).toLocaleDateString('ja-JP')}</td>
              <td>
                <div style="display: flex; gap: 8px;">
                  <button class="btn btn-ghost btn-small" onclick="editFc('${fc.id}')">編集</button>
                  <button class="btn btn-danger btn-small" onclick="deleteFc('${fc.id}')">削除</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function copyFcUrl(slug) {
  const baseUrl = window.location.origin;
  const url = `${baseUrl}/fc/${slug}/`;
  navigator.clipboard.writeText(url).then(() => {
    showToast('URLをコピーしました', 'success');
  }).catch(() => {
    showToast('コピーに失敗しました', 'error');
  });
}

function openFcModal(fcId = null) {
  const modal = document.getElementById('fcModal');
  const title = document.getElementById('fcModalTitle');

  document.getElementById('fcForm').reset();
  document.getElementById('fcId').value = '';
  document.getElementById('fcColor').value = '#2563EB';
  document.getElementById('fcColorText').value = '#2563EB';
  document.getElementById('fcIsActive').checked = true;

  if (fcId) {
    const fc = fcOrganizations.find(f => f.id === fcId);
    if (!fc) return;

    title.textContent = 'FC編集';
    document.getElementById('fcId').value = fc.id;
    document.getElementById('fcName').value = fc.name;
    document.getElementById('fcSlug').value = fc.slug;
    document.getElementById('fcEmail').value = fc.contact_email || '';
    document.getElementById('fcTel').value = fc.contact_tel || '';
    document.getElementById('fcColor').value = fc.primary_color || '#2563EB';
    document.getElementById('fcColorText').value = fc.primary_color || '#2563EB';
    document.getElementById('fcLogoUrl').value = fc.logo_url || '';
    document.getElementById('fcIsActive').checked = fc.is_active !== false;
  } else {
    title.textContent = 'FC追加';
  }

  ModalManager.open(modal, '#fcName');
}

function closeFcModal() {
  ModalManager.close(document.getElementById('fcModal'));
}

async function saveFc() {
  // 二重クリック防止
  if (SaveGuard.isLocked('saveFc')) return;

  const id = document.getElementById('fcId').value;
  const name = document.getElementById('fcName').value.trim();
  const slug = document.getElementById('fcSlug').value.trim().toLowerCase();
  const contactEmail = document.getElementById('fcEmail').value.trim();
  const contactTel = document.getElementById('fcTel').value.trim();
  const primaryColor = document.getElementById('fcColor').value;
  const logoUrl = document.getElementById('fcLogoUrl').value.trim();
  const isActive = document.getElementById('fcIsActive').checked;

  if (!name || !slug) {
    showToast('FC名とスラッグは必須です', 'error');
    return;
  }

  // スラッグの形式チェック
  if (!/^[a-z0-9-]+$/.test(slug)) {
    showToast('スラッグは半角英数字とハイフンのみ使用可能です', 'error');
    return;
  }

  await SaveGuard.run('saveFc', async () => {
    showStatus('保存中...', 'saving');

    const fcData = {
      name,
      slug,
      contact_email: contactEmail || null,
      contact_tel: contactTel || null,
      primary_color: primaryColor,
      logo_url: logoUrl || null,
      is_active: isActive,
      updated_at: new Date().toISOString()
    };

    let result;
    if (id) {
      result = await supabase
        .from('fc_organizations')
        .update(fcData)
        .eq('id', id)
        .select();
    } else {
      result = await supabase
        .from('fc_organizations')
        .insert([fcData])
        .select();
    }

    if (result.error) {
      if (result.error.code === '23505') {
        showToast('このスラッグは既に使用されています', 'error');
      } else {
        showToast('保存に失敗しました: ' + result.error.message, 'error');
      }
      showStatus('エラー', 'error');
      return;
    }

    showStatus('保存済み', 'saved');
    showToast(id ? 'FCを更新しました' : 'FCを追加しました', 'success');
    closeFcModal();
    await loadFcOrganizations();
  });
}

function editFc(fcId) {
  openFcModal(fcId);
}

async function deleteFc(fcId) {
  const fc = fcOrganizations.find(f => f.id === fcId);
  if (!fc) return;

  if (!confirm(`FC「${fc.name}」を削除しますか？\n\n削除すると、FC専用URLにアクセスできなくなります。`)) {
    return;
  }

  await SaveGuard.run(`deleteFc_${fcId}`, async () => {
    showStatus('削除中...', 'saving');

    const { error } = await supabase
      .from('fc_organizations')
      .delete()
      .eq('id', fcId);

    if (error) {
      showStatus('エラー', 'error');
      showToast('削除に失敗しました: ' + error.message, 'error');
      return;
    }

    showStatus('保存済み', 'saved');
    showToast('FCを削除しました', 'success');
    await loadFcOrganizations();
  });
}

// ============================================
// カスタマイズ機能（FC向けノーコード）
// ============================================
function loadCustomization() {
  if (!currentOrganization) return;

  document.getElementById('customOrgName').value = currentOrganization.name || '';
  document.getElementById('customLogoUrl').value = currentOrganization.logo_url || '';
  document.getElementById('customPrimaryColor').value = currentOrganization.primary_color || '#2563EB';
  document.getElementById('customPrimaryColorText').value = currentOrganization.primary_color || '#2563EB';
  document.getElementById('customSecondaryColor').value = currentOrganization.secondary_color || '#059669';
  document.getElementById('customSecondaryColorText').value = currentOrganization.secondary_color || '#059669';

  updatePreview();
}

function previewCustomization() {
  const primaryColor = document.getElementById('customPrimaryColor').value;
  const secondaryColor = document.getElementById('customSecondaryColor').value;
  const name = document.getElementById('customOrgName').value;
  const logoUrl = document.getElementById('customLogoUrl').value;

  // CSSカスタムプロパティを更新
  document.documentElement.style.setProperty('--primary-color', primaryColor);
  document.documentElement.style.setProperty('--secondary-color', secondaryColor);

  // タイトルを更新
  if (name) {
    document.title = `ArchiDeck | ${name}`;
  }

  // プレビュー領域を更新
  updatePreview();
  showToast('プレビューを適用しました', 'success');
}

function updatePreview() {
  const primaryColor = document.getElementById('customPrimaryColor')?.value || '#2563EB';
  const secondaryColor = document.getElementById('customSecondaryColor')?.value || '#1E40AF';
  const name = document.getElementById('customOrgName')?.value || '';
  const logoUrl = document.getElementById('customLogoUrl')?.value || '';

  const previewLogo = document.getElementById('previewLogo');
  const previewTitle = document.getElementById('previewTitle');

  // null チェック
  if (!previewLogo || !previewTitle) return;

  // カラー値の検証（#RRGGBB形式のみ許可）
  const isValidColor = (color) => /^#[0-9A-Fa-f]{6}$/.test(color);
  const safePrimary = isValidColor(primaryColor) ? primaryColor : '#2563EB';
  const safeSecondary = isValidColor(secondaryColor) ? secondaryColor : '#1E40AF';

  if (logoUrl) {
    // XSS対策: URLをエスケープし、httpまたはhttpsのみ許可
    const isValidUrl = /^https?:\/\//i.test(logoUrl);
    if (isValidUrl) {
      const img = document.createElement('img');
      img.src = logoUrl;
      img.style.cssText = 'max-width: 32px; max-height: 32px; object-fit: contain;';
      img.onerror = () => { previewLogo.innerHTML = '🏠'; };
      previewLogo.innerHTML = '';
      previewLogo.appendChild(img);
    } else {
      previewLogo.innerHTML = '🏠';
    }
  } else {
    previewLogo.innerHTML = '🏠';
    previewLogo.style.background = `linear-gradient(135deg, ${safePrimary}, ${safeSecondary})`;
  }

  previewTitle.textContent = name || 'ArchiDeck';
}

async function saveCustomization() {
  // 二重クリック防止
  if (SaveGuard.isLocked('saveCustomization')) return;

  if (!currentOrganization) {
    showToast('組織情報が見つかりません', 'error');
    return;
  }

  await SaveGuard.run('saveCustomization', async () => {
    const statusEl = document.getElementById('customizeStatus');
    statusEl.innerHTML = '<span style="color: var(--text-muted);">保存中...</span>';

  const updates = {
    name: document.getElementById('customOrgName').value,
    logo_url: document.getElementById('customLogoUrl').value,
    primary_color: document.getElementById('customPrimaryColor').value,
    secondary_color: document.getElementById('customSecondaryColor').value,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('organizations')
    .update(updates)
    .eq('id', currentOrganization.id);

  if (error) {
    statusEl.innerHTML = `<span style="color: var(--danger-color);">保存に失敗しました</span>`;
    logError('カスタマイズ保存エラー:', error);
    return;
  }

  // ローカルの組織情報を更新
  Object.assign(currentOrganization, updates);

  // 画面に適用
  applyWhiteLabel(currentOrganization);

  statusEl.innerHTML = '<span style="color: var(--success-color);">保存しました</span>';
  showToast('カスタマイズを保存しました', 'success');

  setTimeout(() => {
    statusEl.innerHTML = '';
  }, 3000);
  }); // SaveGuard.run
}

function resetCustomization() {
  document.getElementById('customOrgName').value = '';
  document.getElementById('customLogoUrl').value = '';
  document.getElementById('customPrimaryColor').value = '#2563EB';
  document.getElementById('customPrimaryColorText').value = '#2563EB';
  document.getElementById('customSecondaryColor').value = '#059669';
  document.getElementById('customSecondaryColorText').value = '#059669';

  // CSSカスタムプロパティをデフォルトにリセット
  document.documentElement.style.setProperty('--primary-color', '#2563EB');
  document.documentElement.style.setProperty('--secondary-color', '#059669');
  document.title = 'ArchiDeck | Gハウス 設計業務管理システム';

  updatePreview();
  showToast('デフォルト設定にリセットしました', 'success');
}

// カラーピッカーの同期
document.addEventListener('DOMContentLoaded', function() {
  const primaryColorPicker = document.getElementById('customPrimaryColor');
  const primaryColorText = document.getElementById('customPrimaryColorText');
  const secondaryColorPicker = document.getElementById('customSecondaryColor');
  const secondaryColorText = document.getElementById('customSecondaryColorText');

  if (primaryColorPicker && primaryColorText) {
    primaryColorPicker.addEventListener('input', function() {
      primaryColorText.value = this.value;
      updatePreview();
    });
  }

  if (secondaryColorPicker && secondaryColorText) {
    secondaryColorPicker.addEventListener('input', function() {
      secondaryColorText.value = this.value;
      updatePreview();
    });
  }
});

// ============================================
// 自動バックアップ機能
// ============================================
let autoBackupEnabled = localStorage.getItem('autoBackupEnabled') !== 'false';

function toggleAutoBackup() {
  const toggle = document.getElementById('autoBackupToggle');
  autoBackupEnabled = toggle.checked;
  localStorage.setItem('autoBackupEnabled', autoBackupEnabled);
  showToast(autoBackupEnabled ? '自動バックアップを有効化しました' : '自動バックアップを無効化しました', 'info');
}

function saveAutoBackup() {
  if (!autoBackupEnabled) return;

  try {
    const backup = {
      version: '4.3',
      created_at: new Date().toISOString(),
      data: {
        projects: projects,
        designers: designers,
        tasksV2: tasksV2,
        vendors: vendors,
        emailTemplates: emailTemplates,
        products: products,
        vendorCategories: vendorCategories,
        taskVendorMappings: taskVendorMappings
      }
    };

    const json = JSON.stringify(backup);

    // サイズチェック (5MB制限)
    if (json.length > 5 * 1024 * 1024) {
      warn('⚠️ バックアップサイズが大きすぎます。ローカル保存をスキップします。');
      return;
    }

    localStorage.setItem('archideck_auto_backup', json);
    localStorage.setItem('archideck_last_backup', new Date().toISOString());

    // バックアップ履歴を保持（最大3件）
    const history = safeJsonParse(localStorage.getItem('archideck_backup_history'), []);
    history.unshift({
      timestamp: new Date().toISOString(),
      projectCount: projects.length,
      designerCount: designers.length
    });
    if (history.length > 3) history.pop();
    localStorage.setItem('archideck_backup_history', JSON.stringify(history));

    updateBackupUI();
    log('✅ 自動バックアップ完了:', new Date().toLocaleString());
  } catch (e) {
    warn('自動バックアップエラー:', e);
  }
}

function updateBackupUI() {
  const lastBackupEl = document.getElementById('lastBackupTime');
  const countEl = document.getElementById('localBackupCount');
  const toggleEl = document.getElementById('autoBackupToggle');

  if (lastBackupEl) {
    const lastBackup = localStorage.getItem('archideck_last_backup');
    lastBackupEl.textContent = lastBackup ? new Date(lastBackup).toLocaleString('ja-JP') : '-';
  }

  if (countEl) {
    const history = safeJsonParse(localStorage.getItem('archideck_backup_history'), []);
    countEl.textContent = history.length.toString();
  }

  if (toggleEl) {
    toggleEl.checked = autoBackupEnabled;
  }
}

function downloadLocalBackup() {
  const backup = localStorage.getItem('archideck_auto_backup');
  if (!backup) {
    showToast('ローカルバックアップがありません', 'warning');
    return;
  }

  const blob = new Blob([backup], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `archideck_local_backup_${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  URL.revokeObjectURL(url); // メモリ解放
  showToast('ローカルバックアップをダウンロードしました', 'success');
}

// 初期化時にバックアップUIを更新
setTimeout(updateBackupUI, 1000);

// 定期的に自動バックアップ（5分ごと）
setInterval(() => {
  if (projects.length > 0 || designers.length > 0) {
    saveAutoBackup();
  }
}, 5 * 60 * 1000);

// バックアップ作成
async function createBackup() {
  const statusEl = document.getElementById('backupStatus');
  statusEl.innerHTML = '<span style="color: var(--text-muted);">バックアップを作成中...</span>';

  try {
    const backup = {
      version: '4.1',
      created_at: new Date().toISOString(),
      data: {
        projects: projects,
        designers: designers,
        tasksV2: tasksV2,
        vendors: vendors,
        emailTemplates: emailTemplates,
        products: products,
        vendorCategories: vendorCategories,
        taskVendorMappings: taskVendorMappings
      }
    };

    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `archideck_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url); // メモリ解放

    statusEl.innerHTML = '<span style="color: var(--success-color);">✅ バックアップを作成しました</span>';
    showToast('バックアップファイルをダウンロードしました', 'success');
  } catch (error) {
    logError('Backup error:', error);
    statusEl.innerHTML = '<span style="color: var(--danger-color);">❌ バックアップの作成に失敗しました</span>';
    showToast('バックアップの作成に失敗しました', 'error');
  }
}

// バックアップ復元
function restoreBackup() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm('現在のデータが上書きされます。本当に復元しますか？')) return;

    const statusEl = document.getElementById('backupStatus');
    statusEl.innerHTML = '<span style="color: var(--text-muted);">復元中...</span>';

    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (!backup.version || !backup.data) {
        throw new Error('無効なバックアップファイルです');
      }

      // 各テーブルを復元
      const tables = ['projects', 'designers', 'vendors', 'email_templates', 'products', 'vendor_categories'];
      const dataMap = {
        projects: backup.data.projects,
        designers: backup.data.designers,
        vendors: backup.data.vendors,
        email_templates: backup.data.emailTemplates,
        products: backup.data.products,
        vendor_categories: backup.data.vendorCategories
      };

      let totalItems = 0;
      let failedItems = 0;

      for (const table of tables) {
        const data = dataMap[table];
        if (data && data.length > 0) {
          // 既存データを削除して復元
          await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
          for (const item of data) {
            totalItems++;
            const { error } = await supabase.from(table).insert(item);
            if (error) {
              failedItems++;
              logError(`復元エラー (${table}):`, error);
            }
          }
        }
      }

      if (failedItems > 0) {
        statusEl.innerHTML = `<span style="color: var(--warning-color);">⚠️ 復元完了（${failedItems}/${totalItems}件失敗）。ページを再読み込みしてください。</span>`;
        showToast(`復元完了（${failedItems}件失敗）`, 'warning');
      } else {
        statusEl.innerHTML = '<span style="color: var(--success-color);">✅ 復元が完了しました。ページを再読み込みしてください。</span>';
        showToast('復元が完了しました', 'success');
      }
    } catch (error) {
      logError('Restore error:', error);
      statusEl.innerHTML = '<span style="color: var(--danger-color);">❌ 復元に失敗しました</span>';
      showToast('復元に失敗しました', 'error');
    }
  };
  fileInput.click();
}

// kintone年度別アプリ管理
let kintoneApps = []; // { year: '2025', appId: '123', label: '2025年度' }

// 年度アプリ行を追加
function addKintoneAppRow(year = '', appId = '') {
  const currentYear = new Date().getFullYear();
  if (!year) year = String(currentYear);

  const container = document.getElementById('kintoneAppsList');
  if (!container) return;

  const rowId = 'kintoneApp_' + Date.now();
  const row = document.createElement('div');
  row.id = rowId;
  row.style.cssText = 'display: flex; gap: 8px; align-items: center;';
  row.innerHTML = `
    <input type="text" class="form-input kintone-app-year" placeholder="年度（例：2025）" value="${year}" style="width: 100px;">
    <input type="text" class="form-input kintone-app-id" placeholder="アプリID" value="${appId}" style="flex: 1;">
    <button class="btn btn-danger btn-small" onclick="removeKintoneAppRow('${rowId}')" style="padding: 6px 10px;">✕</button>
  `;
  container.appendChild(row);

  updateKintoneImportYearSelect();
}

// 年度アプリ行を削除
function removeKintoneAppRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) row.remove();
  updateKintoneImportYearSelect();
}

// アプリ一覧を取得
function getKintoneAppsFromUI() {
  const apps = [];
  const rows = document.querySelectorAll('#kintoneAppsList > div');
  rows.forEach(row => {
    const year = row.querySelector('.kintone-app-year')?.value?.trim();
    const appId = row.querySelector('.kintone-app-id')?.value?.trim();
    if (year && appId) {
      apps.push({ year, appId, label: year + '年度' });
    }
  });
  return apps;
}

// アプリ一覧をUIに描画
function renderKintoneApps(apps) {
  const container = document.getElementById('kintoneAppsList');
  if (!container) return;
  container.innerHTML = '';

  if (apps && apps.length > 0) {
    apps.forEach(app => {
      addKintoneAppRow(app.year, app.appId);
    });
  } else {
    // デフォルトで今年度を追加
    addKintoneAppRow();
  }
}

// インポート年度選択を更新
function updateKintoneImportYearSelect() {
  const container = document.getElementById('kintoneImportYearSelect');
  if (!container) return;

  const apps = getKintoneAppsFromUI();
  if (apps.length === 0) {
    container.innerHTML = '<span style="color: var(--text-muted); font-size: 12px;">年度別アプリを設定してください</span>';
    return;
  }

  container.innerHTML = apps.map(app => `
    <label style="display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: var(--bg-secondary); border-radius: 6px; cursor: pointer; font-size: 13px;">
      <input type="checkbox" class="kintone-import-year" value="${app.appId}" data-year="${app.year}" checked>
      ${app.label}
    </label>
  `).join('') + `
    <label style="display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: var(--bg-secondary); border-radius: 6px; cursor: pointer; font-size: 13px;">
      <input type="checkbox" id="kintoneImportAllYears" onchange="toggleAllKintoneYears(this.checked)" checked>
      全選択
    </label>
  `;
}

// 全年度選択/解除
function toggleAllKintoneYears(checked) {
  document.querySelectorAll('.kintone-import-year').forEach(cb => {
    cb.checked = checked;
  });
}

// 選択された年度のアプリIDを取得
function getSelectedKintoneAppIds() {
  const selected = [];
  document.querySelectorAll('.kintone-import-year:checked').forEach(cb => {
    selected.push({ appId: cb.value, year: cb.dataset.year });
  });
  return selected;
}

// kintone連携設定保存
async function saveKintoneSettings() {
  // 二重クリック防止
  if (SaveGuard.isLocked('saveKintoneSettings')) return;

  await SaveGuard.run('saveKintoneSettings', async () => {
  try {
    // 年度別アプリを取得
    const apps = getKintoneAppsFromUI();

    // 後方互換性のため、最初のアプリIDをapp_idに設定
    const primaryAppId = apps.length > 0 ? apps[0].appId : '';
    document.getElementById('kintoneAppId').value = primaryAppId;

    const settings = {
      domain: document.getElementById('kintoneDomain').value,
      app_id: primaryAppId,
      api_token: document.getElementById('kintoneApiToken').value,
      field_sales: document.getElementById('kintoneFieldSales')?.value || '',
      field_design: document.getElementById('kintoneFieldDesign')?.value || '',
      field_ic: document.getElementById('kintoneFieldIC')?.value || '',
      field_construction: document.getElementById('kintoneFieldConstruction')?.value || '',
      apps: apps // 年度別アプリ配列を追加
    };

    // フィールドマッピングをlocalStorageにもバックアップ保存
    const fieldMappings = {
      customer: document.getElementById('kintoneFieldCustomer')?.value || '',
      layout: document.getElementById('kintoneFieldLayout')?.value || '',
      permit: document.getElementById('kintoneFieldPermit')?.value || '',
      meeting: document.getElementById('kintoneFieldMeeting')?.value || '',
      meetingDrawing: document.getElementById('kintoneFieldMeetingDrawing')?.value || '',
      product: document.getElementById('kintoneFieldProduct')?.value || '',
      sales: settings.field_sales,
      design: settings.field_design,
      ic: settings.field_ic,
      construction: settings.field_construction,
      exterior: document.getElementById('kintoneFieldExterior')?.value || ''
    };
    localStorage.setItem('kintone_field_mappings', JSON.stringify(fieldMappings));

    // 年度別アプリもlocalStorageに保存
    localStorage.setItem('kintone_apps', JSON.stringify(apps));

    if (!settings.domain || !settings.api_token) {
      showToast('ドメインとAPIトークンは必須です', 'error');
      return;
    }

    if (apps.length === 0) {
      showToast('少なくとも1つの年度アプリを設定してください', 'error');
      return;
    }

    // 既存レコードを確認
    const { data: existing } = await supabase
      .from('kintone_settings')
      .select('id')
      .eq('is_active', true)
      .limit(1);

    // 基本設定のみ保存（apps_json等はlocalStorageで管理）
    const dbSettings = {
      domain: settings.domain,
      app_id: settings.app_id,
      api_token: settings.api_token,
      field_sales: settings.field_sales,
      field_design: settings.field_design,
      field_ic: settings.field_ic,
      field_construction: settings.field_construction
    };

    // apps配列とフィールドマッピングはlocalStorageに保存
    localStorage.setItem('kintone_apps', JSON.stringify(apps));
    localStorage.setItem('kintone_field_mappings', JSON.stringify(fieldMappings));

    let error;
    if (existing && existing.length > 0) {
      // 既存レコードを更新
      ({ error } = await supabase
        .from('kintone_settings')
        .update({
          ...dbSettings,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing[0].id));
    } else {
      // 新規作成
      ({ error } = await supabase
        .from('kintone_settings')
        .insert({
          ...dbSettings,
          is_active: true
        }));
    }

    if (error) {
      console.error('kintone設定保存エラー:', error.message);
      showToast('設定保存に失敗しました: ' + error.message, 'error');
      return;
    }

    kintoneSettings = settings;
    kintoneApps = apps;
    showToast('kintone設定を保存しました', 'success');
  } catch (e) {
    console.error('kintone設定保存エラー:', e);
    showToast('設定保存中にエラーが発生しました', 'error');
  }
  }); // SaveGuard.run
}

// kintone接続テスト（Edge Function経由）
async function testKintoneConnection() {
  const domain = document.getElementById('kintoneDomain').value;
  const appId = document.getElementById('kintoneAppId').value;
  const apiToken = document.getElementById('kintoneApiToken').value;

  if (!domain || !appId || !apiToken) {
    showToast('すべての項目を入力してください', 'error');
    return;
  }

  // まず設定を保存
  await saveKintoneSettings();

  document.getElementById('kintoneStatus').innerHTML = '<span style="color: var(--text-muted);">接続テスト中...</span>';

  try {
    const result = await callKintoneProxy('test');

    if (result.success) {
      document.getElementById('kintoneStatus').innerHTML =
        `<span style="color: var(--success-color);">✅ 接続成功！アプリ「${result.data?.name || appId}」に接続しました</span>`;
      showToast('kintone接続に成功しました', 'success');
    } else {
      // 詳細エラー情報を表示
      let errorMsg = result.error || '接続に失敗しました';
      if (result.hint) errorMsg += `<br><small style="color: var(--text-muted);">${result.hint}</small>`;
      if (result.details) errorMsg += `<br><small style="color: var(--text-muted);">${result.details}</small>`;
      document.getElementById('kintoneStatus').innerHTML =
        `<span style="color: var(--danger-color);">❌ ${errorMsg}</span>`;
      showToast('kintone接続に失敗しました: ' + result.error, 'error');
    }
  } catch (e) {
    document.getElementById('kintoneStatus').innerHTML =
      `<span style="color: var(--danger-color);">❌ エラー: ${e.message}</span>`;
    showToast('接続テスト中にエラーが発生しました', 'error');
  }
}

// kintone Proxy呼び出し（Edge Function経由）
async function callKintoneProxy(action, data = {}) {
  try {
    const response = await supabase.functions.invoke('kintone-proxy', {
      body: { action, data }
    });

    // Edge Functionからのエラーレスポンス
    if (response.error) {
      console.error('Edge Function error:', response.error);
      return { success: false, error: response.error.message || 'Edge Function エラー' };
    }

    // レスポンスデータを確認
    if (response.data) {
      // Edge Functionがエラーを返した場合（success: falseの場合）
      if (response.data.success === false) {
        console.error('kintone-proxy returned error:', response.data);
        return response.data;
      }
      return response.data;
    }

    return { success: false, error: 'レスポンスが空です' };
  } catch (e) {
    console.error('callKintoneProxy exception:', e);
    return { success: false, error: e.message };
  }
}

// kintoneからレコード取得
async function fetchKintoneRecords(query = '', fields = []) {
  return await callKintoneProxy('getRecords', { query, fields });
}

// kintoneへレコード追加
async function addKintoneRecord(record) {
  return await callKintoneProxy('addRecord', { record });
}

// kintoneレコード更新
async function updateKintoneRecord(recordId, record) {
  return await callKintoneProxy('updateRecord', { recordId, record });
}

// kintoneインポート前のバリデーション
async function validateKintoneImport() {
  // 1. kintone設定が保存されているか確認
  const { data: settings, error: settingsError } = await supabase
    .from('kintone_settings')
    .select('*')
    .eq('is_active', true)
    .limit(1);

  if (settingsError) {
    return { valid: false, error: `DB接続エラー: ${settingsError.message}` };
  }

  if (!settings || settings.length === 0) {
    return { valid: false, error: 'kintone設定が保存されていません。先に接続設定を保存してください。' };
  }

  const config = settings[0];

  // 2. 必須フィールドの確認
  if (!config.domain || !config.app_id || !config.api_token) {
    return { valid: false, error: 'kintone接続設定が不完全です。ドメイン、アプリID、APIトークンを設定してください。' };
  }

  // 3. フィールドマッピングの確認
  const fieldMappings = safeJsonParse(localStorage.getItem('kintone_field_mappings'), {});
  if (!fieldMappings.customer) {
    return { valid: false, error: '顧客名フィールドが設定されていません。フィールドマッピングを設定してください。' };
  }

  // 4. 接続テスト（簡易）
  const testResult = await callKintoneProxy('test');
  if (!testResult.success) {
    return { valid: false, error: `kintone接続に失敗しました: ${testResult.error}` };
  }

  return { valid: true };
}

// kintoneから直接インポート - 完全修正版 v2
async function importFromKintoneDirect() {
  // 二重クリック防止
  if (SaveGuard.isLocked('importFromKintoneDirect')) return;

  await SaveGuard.run('importFromKintoneDirect', async () => {
  const statusEl = document.getElementById('kintoneImportStatus');
  statusEl.innerHTML = '<span style="color: var(--text-muted);">📥 インポート準備中...</span>';

  try {
    // 0. インポート前のバリデーション
    const validation = await validateKintoneImport();
    if (!validation.valid) {
      statusEl.innerHTML = `<span style="color: var(--danger-color);">❌ ${validation.error}</span>`;
      return;
    }

    // デモデータが存在する場合の警告
    const demoProjects = projects.filter(p => !p.kintone_record_id);
    if (demoProjects.length > 0) {
      const proceed = confirm(
        `⚠️ デモデータが${demoProjects.length}件あります\n\n` +
        `同じ顧客名のkintoneレコードがある場合、既存のデモデータがkintone連携に変換されます。\n\n` +
        `インポート前にデモデータを削除することをお勧めします。\n` +
        `（設定 > kintone > データ整理 > デモデータを削除）\n\n` +
        `このまま続行しますか？`
      );
      if (!proceed) {
        statusEl.innerHTML = '<span style="color: var(--text-muted);">インポートをキャンセルしました</span>';
        return;
      }
    }

    statusEl.innerHTML = '<span style="color: var(--text-muted);">📥 kintoneからデータを取得中...</span>';

    // 1. フィールドマッピングを取得
    const fieldMappings = safeJsonParse(localStorage.getItem('kintone_field_mappings'), {});
    const customerField = fieldMappings.customer || '文字_基本情報_お客様名_メイン';
    const salesField = fieldMappings.sales || 'ユーザー選択_基本情報_営業';
    const designField = fieldMappings.design || 'ユーザー選択_基本情報_設計';
    const icField = fieldMappings.ic || 'ユーザー選択_基本情報_IC';
    const constructionField = fieldMappings.construction || 'ユーザー選択_基本情報_工事';
    const exteriorField = fieldMappings.exterior || '';
    // 日付フィールド
    const layoutField = fieldMappings.layout || '';
    const permitField = fieldMappings.permit || '';
    const meetingField = fieldMappings.meeting || '';
    const meetingDrawingField = fieldMappings.meetingDrawing || '';
    // 商品フィールド
    const productField = fieldMappings.product || '';

    console.log('Field mappings:', { customerField, salesField, designField, icField, constructionField, exteriorField, layoutField, permitField, meetingField, meetingDrawingField, productField });

    // 2. kintoneからレコード取得（全件取得 - 500件制限回避）
    const result = await callKintoneProxy('getAllRecords');
    console.log('Kintone result:', result);

    if (!result.success) {
      statusEl.innerHTML = `<span style="color: var(--danger-color);">❌ ${result.error}</span>`;
      return;
    }

    const records = result.data?.records || [];
    const hitLimit = result.data?.hitLimit || false;
    const warning = result.data?.warning || null;

    if (records.length === 0) {
      statusEl.innerHTML = '<span style="color: var(--warning-color);">⚠️ レコードが見つかりませんでした</span>';
      return;
    }

    // 10,000件制限警告
    if (warning) {
      console.warn('kintone警告:', warning);
    }

    // デバッグ: フィールド一覧（最初の1件のみ）
    if (records.length > 0) {
      console.log('Available fields:', Object.keys(records[0]));
      console.log('Sample record $id:', records[0]['$id']);
      console.log('Sample record レコード番号:', records[0]['レコード番号']);
    }
    console.log('Total records from kintone:', records.length, hitLimit ? '(10,000件制限に到達)' : '');

    statusEl.innerHTML = `<span style="color: var(--text-muted);">📥 ${records.length}件のレコードを処理中...${hitLimit ? ' (10,000件制限)' : ''}</span>`;

    // 3. 既存案件をkintone_record_idでインデックス化（高速検索用）
    const projectsByKintoneId = new Map();
    const projectsByCustomer = new Map();
    for (const p of projects) {
      if (p.kintone_record_id) {
        projectsByKintoneId.set(String(p.kintone_record_id), p);
      }
      // 顧客名でもインデックス（kintone_record_idがない場合のフォールバック用）
      // ただし、kintoneデータでない既存データのみ（混在防止）
      if (!p.kintone_record_id && p.customer) {
        projectsByCustomer.set(p.customer, p);
      }
    }
    console.log('Existing projects indexed:', {
      byKintoneId: projectsByKintoneId.size,
      byCustomer: projectsByCustomer.size
    });

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let skippedNoCustomer = 0;
    let skippedNoRecordId = 0;
    const errors = [];
    const processedKintoneIds = new Set(); // 重複処理防止

    for (const record of records) {
      try {
        // 4. kintone レコードIDを取得（必須）
        const kintoneRecordId = extractKintoneRecordId(record);

        if (!kintoneRecordId) {
          console.warn('kintone_record_id not found in record:', record);
          skipped++;
          skippedNoRecordId++;
          continue;
        }

        // 重複チェック（同じkintone_record_idが複数回処理されないように）
        if (processedKintoneIds.has(kintoneRecordId)) {
          console.warn('Duplicate kintone_record_id:', kintoneRecordId);
          skipped++;
          continue;
        }
        processedKintoneIds.add(kintoneRecordId);

        // 5. フィールド値を安全に取得
        const getValue = (field) => {
          if (!field) return null;
          const val = record[field]?.value;
          if (val === undefined || val === null) return null;
          if (Array.isArray(val)) {
            const names = val.map(v => v.name || v.code || String(v)).filter(Boolean);
            return names.length > 0 ? names.join(', ') : null;
          }
          const strVal = String(val).trim();
          return strVal || null;
        };

        const customer = getValue(customerField);
        if (!customer) {
          skipped++;
          skippedNoCustomer++;
          continue;
        }

        // 6. 既存案件を確認（kintone_record_idを優先）
        let existingProject = projectsByKintoneId.get(kintoneRecordId);

        // kintone_record_idでマッチしない場合、顧客名でkintone未連携の既存データを検索
        // ただし、これは初回インポート時のみ有効（混在防止）
        if (!existingProject) {
          const customerMatch = projectsByCustomer.get(customer);
          if (customerMatch && !customerMatch.kintone_record_id) {
            existingProject = customerMatch;
            // この案件をkintone連携として更新するため、マップから削除
            projectsByCustomer.delete(customer);
          }
        }

        // 担当者フィールド値（名前マッチング適用）
        const designValRaw = getValue(designField);
        const icValRaw = getValue(icField);
        const salesValRaw = getValue(salesField);
        const constructionValRaw = getValue(constructionField);
        const exteriorValRaw = exteriorField ? getValue(exteriorField) : null;

        // 担当者名をシステム内の名前にマッチング
        const designVal = matchDesignerName(designValRaw, '設計');
        const icVal = matchDesignerName(icValRaw, 'IC');
        const salesVal = matchDesignerName(salesValRaw, '営業');
        const constructionVal = matchDesignerName(constructionValRaw, '工事');
        const exteriorVal = exteriorValRaw ? matchDesignerName(exteriorValRaw, '外構') : null;

        // 日付フィールド値（複数形式対応）
        const layoutDate = parseDateValue(record, layoutField);
        const permitDate = parseDateValue(record, permitField);
        const meetingDate = parseDateValue(record, meetingField);
        const meetingDrawingDate = parseDateValue(record, meetingDrawingField);

        // 商品フィールド値
        const productVal = productField ? getValue(productField) : null;

        if (existingProject) {
          // 7. 更新
          const updateData = {
            updated_at: new Date().toISOString(),
            kintone_record_id: kintoneRecordId // 必ず設定
          };

          if (designVal) updateData.assigned_to = designVal;
          if (icVal) updateData.ic_assignee = icVal;
          if (salesVal) updateData.sales_assignee = salesVal;
          if (constructionVal) updateData.construction_assignee = constructionVal;
          if (exteriorVal) updateData.exterior_assignee = exteriorVal;
          if (layoutDate) updateData.layout_confirmed_date = layoutDate;
          if (permitDate) updateData.construction_permit_date = permitDate;
          if (meetingDate) updateData.pre_contract_meeting_date = meetingDate;
          if (meetingDrawingDate) updateData.meeting_drawing_date = meetingDrawingDate;
          if (productVal) updateData.specifications = productVal;

          const { error } = await supabase
            .from('projects')
            .update(updateData)
            .eq('id', existingProject.id);

          if (error) {
            errors.push({ type: 'update', customer, kintoneRecordId, error: error.message, code: error.code });
            skipped++;
          } else {
            Object.assign(existingProject, updateData);
            // インデックスも更新
            projectsByKintoneId.set(kintoneRecordId, existingProject);
            updated++;
          }
        } else {
          // 8. 新規作成
          const insertData = {
            customer,
            status: 'active',
            progress: {},
            specifications: productVal || 'LIFE',
            kintone_record_id: kintoneRecordId // 必ず設定
          };

          if (designVal) insertData.assigned_to = designVal;
          if (icVal) insertData.ic_assignee = icVal;
          if (salesVal) insertData.sales_assignee = salesVal;
          if (constructionVal) insertData.construction_assignee = constructionVal;
          if (exteriorVal) insertData.exterior_assignee = exteriorVal;
          if (layoutDate) insertData.layout_confirmed_date = layoutDate;
          if (permitDate) insertData.construction_permit_date = permitDate;
          if (meetingDate) insertData.pre_contract_meeting_date = meetingDate;
          if (meetingDrawingDate) insertData.meeting_drawing_date = meetingDrawingDate;

          const { data: newProject, error } = await supabase
            .from('projects')
            .insert(insertData)
            .select()
            .single();

          if (error) {
            errors.push({ type: 'insert', customer, kintoneRecordId, error: error.message, code: error.code });
            console.error('Insert error:', error, insertData);
            skipped++;
          } else if (newProject) {
            projects.push(newProject);
            projectsByKintoneId.set(kintoneRecordId, newProject);
            imported++;
          }
        }
      } catch (e) {
        console.error('Record processing error:', e, record);
        errors.push({ type: 'exception', error: e.message });
        skipped++;
      }
    }

    // 9. エラーログ
    if (errors.length > 0) {
      console.error('Import errors:', errors);
      console.table(errors);
    }

    // 10. 完了表示
    renderProjects();
    renderSidebar();

    // 詳細なサマリーを作成
    const total = records.length;
    const skipDetails = [];
    if (skippedNoCustomer > 0) skipDetails.push(`顧客名なし: ${skippedNoCustomer}`);
    if (skippedNoRecordId > 0) skipDetails.push(`レコードIDなし: ${skippedNoRecordId}`);
    if (errors.length > 0) skipDetails.push(`エラー: ${errors.length}`);
    const skipInfo = skipDetails.length > 0 ? ` (${skipDetails.join(', ')})` : '';

    console.log('Import summary:', {
      total,
      imported,
      updated,
      skipped,
      skippedNoCustomer,
      skippedNoRecordId,
      errors: errors.length,
      hitLimit
    });

    if (imported + updated > 0) {
      let msg = `✅ 完了: kintone ${total}件中 → ${imported}件新規、${updated}件更新`;
      if (skipped > 0) msg += `、${skipped}件スキップ${skipInfo}`;
      if (hitLimit) msg += ' ⚠️10,000件制限';
      statusEl.innerHTML = `<span style="color: var(--success-color);">${msg}</span>`;
      showToast(`kintoneから${imported + updated}件をインポートしました`, 'success');
    } else if (skipped > 0) {
      statusEl.innerHTML = `<span style="color: var(--warning-color);">⚠️ ${total}件中${skipped}件スキップ${skipInfo}（コンソールでエラー確認）</span>`;
    } else {
      statusEl.innerHTML = `<span style="color: var(--warning-color);">⚠️ インポート対象がありませんでした</span>`;
    }

  } catch (e) {
    console.error('Import error:', e);
    statusEl.innerHTML = `<span style="color: var(--danger-color);">❌ エラー: ${e.message}</span>`;
  }
  }); // SaveGuard.run
}

// kintoneレコードIDを抽出（複数のフィールド名に対応）
function extractKintoneRecordId(record) {
  // kintone APIは $id フィールドでレコードIDを返す
  // レコード番号フィールドも確認
  const candidates = [
    record['$id']?.value,
    record['レコード番号']?.value,
    record['Record_number']?.value,
    record['record_id']?.value
  ];

  for (const val of candidates) {
    if (val !== undefined && val !== null && val !== '') {
      const strVal = String(val).trim();
      if (strVal && strVal !== '0') {
        return strVal;
      }
    }
  }

  return null;
}

// 名前を正規化（スペース除去、全半角統一）
function normalizeName(name) {
  if (!name) return '';
  return String(name)
    .trim()
    .replace(/[\s　]+/g, '') // 半角・全角スペースを除去
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)) // 全角英数字を半角に
    .toLowerCase();
}

// kintone名からdesigner名をマッチング
function matchDesignerName(kintoneNames, category = null) {
  if (!kintoneNames) return null;

  // kintoneの名前リスト（カンマ区切りの場合を処理）
  const names = String(kintoneNames).split(',').map(n => n.trim()).filter(Boolean);
  if (names.length === 0) return null;

  // 対象のdesignersリスト
  const targetDesigners = category
    ? designers.filter(d => d.category === category)
    : designers;

  for (const kName of names) {
    const normalizedKintone = normalizeName(kName);

    // 1. 完全一致
    const exactMatch = targetDesigners.find(d => d.name === kName);
    if (exactMatch) return exactMatch.name;

    // 2. trim後一致
    const trimMatch = targetDesigners.find(d => d.name.trim() === kName.trim());
    if (trimMatch) return trimMatch.name;

    // 3. 正規化後一致
    const normalizedMatch = targetDesigners.find(d => normalizeName(d.name) === normalizedKintone);
    if (normalizedMatch) return normalizedMatch.name;

    // 4. 部分一致（名前が含まれている）
    const partialMatch = targetDesigners.find(d => {
      const normalizedDesigner = normalizeName(d.name);
      return normalizedDesigner.includes(normalizedKintone) || normalizedKintone.includes(normalizedDesigner);
    });
    if (partialMatch) return partialMatch.name;

    // 5. 姓のみマッチ（2文字以上の場合）
    if (normalizedKintone.length >= 2) {
      const lastNameMatch = targetDesigners.find(d => {
        const normalizedDesigner = normalizeName(d.name);
        // 姓（最初の2-3文字）で比較
        const kSurname = normalizedKintone.substring(0, Math.min(3, normalizedKintone.length));
        const dSurname = normalizedDesigner.substring(0, Math.min(3, normalizedDesigner.length));
        return kSurname === dSurname && normalizedDesigner.length >= 2;
      });
      if (lastNameMatch) return lastNameMatch.name;
    }
  }

  // マッチなし：元の値をそのまま返す（新規担当者として登録される可能性）
  console.log(`⚠️ Designer not matched: "${kintoneNames}" (category: ${category || 'any'})`);
  return names[0]; // 最初の名前をそのまま返す
}

// 日付値をパース（複数形式対応）
function parseDateValue(record, field) {
  if (!field) return null;
  const val = record[field]?.value;
  if (!val) return null;

  const dateStr = String(val).trim();
  if (!dateStr) return null;

  // YYYY-MM-DD形式（推奨）
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // ISO 8601形式（例: 2026-01-08T00:00:00Z）
  const isoMatch = dateStr.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoMatch) {
    return isoMatch[1];
  }

  // YYYY/MM/DD形式
  const slashMatch = dateStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashMatch) {
    const [, y, m, d] = slashMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // 日本語形式（YYYY年MM月DD日）
  const jpMatch = dateStr.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (jpMatch) {
    const [, y, m, d] = jpMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  console.warn('Unknown date format:', dateStr, 'in field:', field);
  return null;
}

// データ状況を表示
function showDataStats() {
  const kintoneProjects = projects.filter(p => p.kintone_record_id);
  const demoProjects = projects.filter(p => !p.kintone_record_id);
  const archivedProjects = projects.filter(p => p.is_archived);

  const statsEl = document.getElementById('dataStatsInfo');
  if (statsEl) {
    statsEl.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px;">
        <div style="padding: 8px; background: var(--bg-color); border-radius: 4px; text-align: center;">
          <div style="font-size: 20px; font-weight: 700; color: var(--primary-color);">${projects.length}</div>
          <div style="font-size: 11px; color: var(--text-muted);">総案件数</div>
        </div>
        <div style="padding: 8px; background: var(--bg-color); border-radius: 4px; text-align: center;">
          <div style="font-size: 20px; font-weight: 700; color: var(--success-color);">${kintoneProjects.length}</div>
          <div style="font-size: 11px; color: var(--text-muted);">kintone連携</div>
        </div>
        <div style="padding: 8px; background: var(--bg-color); border-radius: 4px; text-align: center;">
          <div style="font-size: 20px; font-weight: 700; color: var(--warning-color);">${demoProjects.length}</div>
          <div style="font-size: 11px; color: var(--text-muted);">手動/デモ</div>
        </div>
        <div style="padding: 8px; background: var(--bg-color); border-radius: 4px; text-align: center;">
          <div style="font-size: 20px; font-weight: 700; color: var(--text-muted);">${archivedProjects.length}</div>
          <div style="font-size: 11px; color: var(--text-muted);">完了済み</div>
        </div>
      </div>
    `;
  }
}

// デモデータ削除確認
async function clearDemoDataConfirm() {
  const demoProjects = projects.filter(p => !p.kintone_record_id);

  if (demoProjects.length === 0) {
    showToast('削除対象のデモデータがありません', 'info');
    return;
  }

  const confirmed = confirm(
    `⚠️ デモデータを削除\n\n` +
    `${demoProjects.length}件のデモ/手動追加データを削除します。\n` +
    `kintone連携済みの案件は削除されません。\n\n` +
    `削除対象:\n${demoProjects.slice(0, 5).map(p => `  - ${p.customer}`).join('\n')}` +
    (demoProjects.length > 5 ? `\n  ... 他${demoProjects.length - 5}件` : '') +
    `\n\nこの操作は取り消せません。続行しますか？`
  );

  if (!confirmed) return;

  // 二重確認
  const doubleConfirmed = confirm(
    `本当に${demoProjects.length}件のデモデータを削除しますか？\n\n` +
    `この操作は取り消せません。`
  );

  if (!doubleConfirmed) return;

  await clearDemoData();
}

// デモデータを削除
async function clearDemoData() {
  const statusEl = document.getElementById('kintoneImportStatus');
  if (statusEl) {
    statusEl.innerHTML = '<span style="color: var(--text-muted);">🗑️ デモデータを削除中...</span>';
  }

  try {
    const demoProjects = projects.filter(p => !p.kintone_record_id);
    const demoIds = demoProjects.map(p => p.id);

    if (demoIds.length === 0) {
      if (statusEl) {
        statusEl.innerHTML = '<span style="color: var(--info-color);">削除対象のデモデータがありません</span>';
      }
      return;
    }

    // 関連データも削除（project_tasks, project_minutes, project_handovers）
    let deletedRelated = 0;

    // project_tasks
    const { error: taskError, count: taskCount } = await supabase
      .from('project_tasks')
      .delete({ count: 'exact' })
      .in('project_id', demoIds);
    if (!taskError && taskCount) deletedRelated += taskCount;

    // project_minutes
    const { error: minuteError, count: minuteCount } = await supabase
      .from('project_minutes')
      .delete({ count: 'exact' })
      .in('project_id', demoIds);
    if (!minuteError && minuteCount) deletedRelated += minuteCount;

    // project_handovers
    const { error: handoverError, count: handoverCount } = await supabase
      .from('project_handovers')
      .delete({ count: 'exact' })
      .in('project_id', demoIds);
    if (!handoverError && handoverCount) deletedRelated += handoverCount;

    // 案件本体を削除
    const { error, count } = await supabase
      .from('projects')
      .delete({ count: 'exact' })
      .in('id', demoIds);

    if (error) {
      console.error('Delete error:', error);
      if (statusEl) {
        statusEl.innerHTML = `<span style="color: var(--danger-color);">❌ 削除エラー: ${error.message}</span>`;
      }
      return;
    }

    // メモリからも削除
    projects = projects.filter(p => p.kintone_record_id);

    // 画面を更新
    renderProjects();
    renderSidebar();
    showDataStats();

    if (statusEl) {
      statusEl.innerHTML = `<span style="color: var(--success-color);">✅ ${count || demoIds.length}件のデモデータを削除しました（関連データ: ${deletedRelated}件）</span>`;
    }
    showToast(`${count || demoIds.length}件のデモデータを削除しました`, 'success');

  } catch (e) {
    console.error('Clear demo data error:', e);
    if (statusEl) {
      statusEl.innerHTML = `<span style="color: var(--danger-color);">❌ エラー: ${e.message}</span>`;
    }
  }
}

// kintone設定読み込み
async function loadKintoneSettings() {
  try {
    const { data, error } = await supabase
      .from('kintone_settings')
      .select('*')
      .eq('is_active', true)
      .limit(1);

    // DBから読み込み成功した場合
    if (!error && data && data.length > 0) {
      const settings = data[0];
      kintoneSettings = settings;

      const domainEl = document.getElementById('kintoneDomain');
      const appIdEl = document.getElementById('kintoneAppId');
      const apiTokenEl = document.getElementById('kintoneApiToken');

      if (domainEl) domainEl.value = settings.domain || '';
      if (appIdEl) appIdEl.value = settings.app_id || '';
      if (apiTokenEl) apiTokenEl.value = settings.api_token || '';

      // 担当者フィールドマッピングをDBから読み込み
      const salesEl = document.getElementById('kintoneFieldSales');
      const designEl = document.getElementById('kintoneFieldDesign');
      const icEl = document.getElementById('kintoneFieldIC');
      const constructionEl = document.getElementById('kintoneFieldConstruction');
      if (salesEl && settings.field_sales) salesEl.value = settings.field_sales;
      if (designEl && settings.field_design) designEl.value = settings.field_design;
      if (icEl && settings.field_ic) icEl.value = settings.field_ic;
      if (constructionEl && settings.field_construction) constructionEl.value = settings.field_construction;

    }

    // 年度別アプリはlocalStorageから読み込み
    kintoneApps = safeJsonParse(localStorage.getItem('kintone_apps'), []);

    // 後方互換性：app_idが設定されていてkintoneAppsが空の場合、app_idをkintoneAppsに追加
    if (kintoneApps.length === 0 && kintoneSettings?.app_id) {
      const currentYear = new Date().getFullYear();
      kintoneApps = [{ year: String(currentYear), appId: kintoneSettings.app_id, label: currentYear + '年度' }];
    }

    // 年度別アプリをUIに描画
    renderKintoneApps(kintoneApps);

    // フィールドマッピングはlocalStorageから読み込み
    const fieldMappings = safeJsonParse(localStorage.getItem('kintone_field_mappings'), {});

    const customerEl = document.getElementById('kintoneFieldCustomer');
    const layoutEl = document.getElementById('kintoneFieldLayout');
    const permitEl = document.getElementById('kintoneFieldPermit');
    const meetingEl = document.getElementById('kintoneFieldMeeting');
    const productEl = document.getElementById('kintoneFieldProduct');
    const exteriorEl = document.getElementById('kintoneFieldExterior');
    const salesEl2 = document.getElementById('kintoneFieldSales');
    const designEl2 = document.getElementById('kintoneFieldDesign');
    const icEl2 = document.getElementById('kintoneFieldIC');
    const constructionEl2 = document.getElementById('kintoneFieldConstruction');

    if (customerEl && fieldMappings.customer) customerEl.value = fieldMappings.customer;
    if (layoutEl && fieldMappings.layout) layoutEl.value = fieldMappings.layout;
    if (permitEl && fieldMappings.permit) permitEl.value = fieldMappings.permit;
    if (meetingEl && fieldMappings.meeting) meetingEl.value = fieldMappings.meeting;
    if (productEl && fieldMappings.product) productEl.value = fieldMappings.product;
    if (exteriorEl && fieldMappings.exterior) exteriorEl.value = fieldMappings.exterior;
    // 担当者フィールドはDBから読み込み済みだが、フォールバックとしてlocalStorageも確認
    if (salesEl2 && !salesEl2.value && fieldMappings.sales) salesEl2.value = fieldMappings.sales;
    if (designEl2 && !designEl2.value && fieldMappings.design) designEl2.value = fieldMappings.design;
    if (icEl2 && !icEl2.value && fieldMappings.ic) icEl2.value = fieldMappings.ic;
    if (constructionEl2 && !constructionEl2.value && fieldMappings.construction) constructionEl2.value = fieldMappings.construction;
  } catch (e) {
    // 例外発生時も静かに終了
    console.warn('kintone設定読み込みエラー:', e);
  }
}

// kintone自動同期（アプリ起動時）
async function autoSyncKintone() {
  try {
    // kintone設定を確認
    if (!kintoneSettings || !kintoneSettings.domain || !kintoneSettings.app_id || !kintoneSettings.api_token) {
      log('⏭️ kintone自動同期スキップ: 設定未完了');
      return;
    }

    log('🔄 kintone自動同期開始...');
    showToast('kintoneと同期中...', 'info', 2000);

    // フィールドマッピングを取得
    const fieldMappings = safeJsonParse(localStorage.getItem('kintone_field_mappings'), {});
    const customerField = fieldMappings.customer || '文字_基本情報_お客様名_メイン';
    const salesField = fieldMappings.sales || 'ユーザー選択_基本情報_営業';
    const designField = fieldMappings.design || 'ユーザー選択_基本情報_設計';
    const icField = fieldMappings.ic || 'ユーザー選択_基本情報_IC';
    const constructionField = fieldMappings.construction || 'ユーザー選択_基本情報_工事';
    const exteriorField = fieldMappings.exterior || '';
    const layoutField = fieldMappings.layout || '';
    const permitField = fieldMappings.permit || '';
    const meetingField = fieldMappings.meeting || '';
    const meetingDrawingField = fieldMappings.meetingDrawing || '';
    const productField = fieldMappings.product || '';

    // kintoneからレコード取得（30秒タイムアウト）
    const KINTONE_TIMEOUT = 30000;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('kintone同期タイムアウト（30秒）')), KINTONE_TIMEOUT)
    );
    const result = await Promise.race([
      callKintoneProxy('getAllRecords'),
      timeoutPromise
    ]);

    if (!result.success) {
      log('❌ kintone自動同期失敗:', result.error);
      // 失敗カウントを増加
      window._kintoneSyncFailCount = (window._kintoneSyncFailCount || 0) + 1;
      // 3回連続失敗でユーザーに通知
      if (window._kintoneSyncFailCount >= 3) {
        showToast('kintone同期に複数回失敗しています。設定を確認してください。', 'warning', 5000);
        window._kintoneSyncFailCount = 0; // リセット
      }
      return;
    }
    // 成功時は失敗カウントをリセット
    window._kintoneSyncFailCount = 0;

    const records = result.data?.records || [];
    if (records.length === 0) {
      log('⚠️ kintoneレコードなし');
      return;
    }

    // 既存案件をインデックス化
    const projectsByKintoneId = new Map();
    for (const p of projects) {
      if (p.kintone_record_id) {
        projectsByKintoneId.set(String(p.kintone_record_id), p);
      }
    }

    let updated = 0;
    let added = 0;

    for (const record of records) {
      try {
        const kintoneRecordId = extractKintoneRecordId(record);
        if (!kintoneRecordId) continue;

        const getValue = (field) => {
          if (!field) return null;
          const val = record[field]?.value;
          if (val === undefined || val === null) return null;
          if (Array.isArray(val)) {
            const names = val.map(v => v.name || v.code || String(v)).filter(Boolean);
            return names.length > 0 ? names.join(', ') : null;
          }
          const strVal = String(val).trim();
          return strVal || null;
        };

        const customer = getValue(customerField);
        if (!customer) continue;

        const existingProject = projectsByKintoneId.get(kintoneRecordId);

        if (existingProject) {
          // 既存案件を更新（日付フィールドのみ同期）
          const updates = {};
          let hasChanges = false;

          // 間取確定日
          if (layoutField) {
            const layoutDate = getValue(layoutField);
            if (layoutDate && layoutDate !== existingProject.layout_confirmed_date) {
              updates.layout_confirmed_date = layoutDate;
              hasChanges = true;
            }
          }

          // 着工許可日
          if (permitField) {
            const permitDate = getValue(permitField);
            if (permitDate && permitDate !== existingProject.construction_permit_date) {
              updates.construction_permit_date = permitDate;
              hasChanges = true;
            }
          }

          // 変更契約前会議日
          if (meetingField) {
            const meetingDate = getValue(meetingField);
            if (meetingDate && meetingDate !== existingProject.pre_contract_meeting_date) {
              updates.pre_contract_meeting_date = meetingDate;
              hasChanges = true;
            }
          }

          // 会議図面渡し日
          if (meetingDrawingField) {
            const meetingDrawingDate = getValue(meetingDrawingField);
            if (meetingDrawingDate && meetingDrawingDate !== existingProject.meeting_drawing_date) {
              updates.meeting_drawing_date = meetingDrawingDate;
              hasChanges = true;
            }
          }

          // 商品
          if (productField) {
            const product = getValue(productField);
            if (product && product !== existingProject.specifications) {
              updates.specifications = product;
              hasChanges = true;
            }
          }

          // 担当者更新（名前マッチング適用）
          const salesRaw = getValue(salesField);
          const designRaw = getValue(designField);
          const icRaw = getValue(icField);
          const constructionRaw = getValue(constructionField);
          const exteriorRaw = exteriorField ? getValue(exteriorField) : null;

          const sales = matchDesignerName(salesRaw, '営業');
          const design = matchDesignerName(designRaw, '設計');
          const ic = matchDesignerName(icRaw, 'IC');
          const construction = matchDesignerName(constructionRaw, '工事');
          const exterior = exteriorRaw ? matchDesignerName(exteriorRaw, '外構') : null;

          if (sales && sales !== existingProject.sales_assignee) {
            updates.sales_assignee = sales;
            hasChanges = true;
          }
          if (design && design !== existingProject.assigned_to) {
            updates.assigned_to = design;
            hasChanges = true;
          }
          if (ic && ic !== existingProject.ic_assignee) {
            updates.ic_assignee = ic;
            hasChanges = true;
          }
          if (construction && construction !== existingProject.construction_assignee) {
            updates.construction_assignee = construction;
            hasChanges = true;
          }
          if (exterior && exterior !== existingProject.exterior_assignee) {
            updates.exterior_assignee = exterior;
            hasChanges = true;
          }

          if (hasChanges) {
            const { error } = await supabase
              .from('projects')
              .update(updates)
              .eq('id', existingProject.id);

            if (!error) {
              Object.assign(existingProject, updates);
              updated++;
            }
          }
        } else {
          // 新規案件追加（名前マッチング適用）
          const productValue = productField ? getValue(productField) : null;
          const exteriorValue = exteriorField ? matchDesignerName(getValue(exteriorField), '外構') : null;
          const newProject = {
            customer: customer,
            kintone_record_id: kintoneRecordId,
            specifications: productValue || 'LIFE',
            status: 'active',
            assigned_to: matchDesignerName(getValue(designField), '設計'),
            ic_assignee: matchDesignerName(getValue(icField), 'IC'),
            sales_assignee: matchDesignerName(getValue(salesField), '営業'),
            construction_assignee: matchDesignerName(getValue(constructionField), '工事'),
            exterior_assignee: exteriorValue,
            layout_confirmed_date: getValue(layoutField),
            construction_permit_date: getValue(permitField),
            pre_contract_meeting_date: getValue(meetingField),
            meeting_drawing_date: getValue(meetingDrawingField),
            progress: {},
            is_archived: false
          };

          const { data, error } = await supabase
            .from('projects')
            .insert(newProject)
            .select()
            .single();

          if (!error && data) {
            projects.push(data);
            projectsByKintoneId.set(kintoneRecordId, data);
            added++;
          }
        }
      } catch (e) {
        // 個別レコードのエラーは無視
      }
    }

    if (updated > 0 || added > 0) {
      log(`✅ kintone自動同期完了: 更新${updated}件, 追加${added}件`);
      showToast(`kintone同期完了: 更新${updated}件, 追加${added}件`, 'success');
      renderSidebar();
      renderProjects();
    } else {
      log('✅ kintone自動同期完了: 変更なし');
    }
  } catch (e) {
    log('❌ kintone自動同期エラー:', e);
  }
}

// 手動kintone同期（ボタンから呼び出し）
async function manualKintoneSync() {
  const btn = document.getElementById('kintoneRefreshBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '🔄 同期中...';
  }

  try {
    // kintone設定を確認
    if (!kintoneSettings || !kintoneSettings.domain || !kintoneSettings.app_id || !kintoneSettings.api_token) {
      showToast('kintone連携が設定されていません。設定画面で設定してください。', 'error');
      return;
    }

    await autoSyncKintone();
    showToast('kintone同期が完了しました', 'success');
  } catch (e) {
    showToast('kintone同期に失敗しました: ' + e.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔄 kintone';
    }
  }
}

// kintoneからインポート（CSVベース）
async function importFromKintone() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.csv';
  fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split('\n');

    // 空ファイルまたはヘッダーのみのチェック
    if (!lines || lines.length < 2) {
      showToast('CSVファイルが空か、データがありません', 'error');
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

    // フィールドマッピングを取得
    const fieldMappings = safeJsonParse(localStorage.getItem('kintone_field_mappings'), {});

    // カラムインデックスを検索（マッピング設定があればそれを優先）
    const findColIdx = (mapping, fallbacks) => {
      if (mapping) {
        const idx = headers.findIndex(h => h === mapping || h.includes(mapping));
        if (idx !== -1) return idx;
      }
      for (const fb of fallbacks) {
        const idx = headers.findIndex(h => h.includes(fb));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const customerIdx = findColIdx(fieldMappings.customer, ['顧客', '邸名', 'customer']);
    const addressIdx = headers.findIndex(h => h.includes('建築地') || h.includes('住所') || h.includes('address'));
    const recordIdIdx = headers.findIndex(h => h.includes('レコード') || h.includes('record') || h === '$id');
    const salesIdx = findColIdx(fieldMappings.sales, ['営業担当', '営業', 'sales']);
    const designIdx = findColIdx(fieldMappings.design, ['設計担当', '設計', 'design']);
    const icIdx = findColIdx(fieldMappings.ic, ['IC担当', 'IC', 'ic']);
    const constructionIdx = findColIdx(fieldMappings.construction, ['工事担当', '工事', 'construction']);

    if (customerIdx === -1) {
      showToast('顧客名/邸名カラムが見つかりません', 'error');
      return;
    }

    let importCount = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
      if (!cols[customerIdx]) continue;

      const customer = cols[customerIdx];
      const address = addressIdx >= 0 ? cols[addressIdx] : '';
      const kintoneRecordId = recordIdIdx >= 0 ? cols[recordIdIdx] : '';
      const salesAssigneeRaw = salesIdx >= 0 ? cols[salesIdx] : '';
      const designAssigneeRaw = designIdx >= 0 ? cols[designIdx] : '';
      const icAssigneeRaw = icIdx >= 0 ? cols[icIdx] : '';
      const constructionAssigneeRaw = constructionIdx >= 0 ? cols[constructionIdx] : '';

      // 名前マッチング適用
      const salesAssignee = matchDesignerName(salesAssigneeRaw, '営業');
      const designAssignee = matchDesignerName(designAssigneeRaw, '設計');
      const icAssignee = matchDesignerName(icAssigneeRaw, 'IC');
      const constructionAssignee = matchDesignerName(constructionAssigneeRaw, '工事');

      // 既存チェック
      const existing = projects.find(p => p.customer === customer);
      if (existing) continue;

      // 新規作成
      const { error } = await supabase.from('projects').insert({
        customer,
        building_address: address,
        kintone_record_id: kintoneRecordId,
        sales_assignee: salesAssignee,
        assigned_to: designAssignee || designers.find(d => d.category === '設計')?.name || '',
        ic_assignee: icAssignee,
        construction_assignee: constructionAssignee,
        specifications: 'LIFE',
        status: 'active',
        progress: {}
      });

      if (!error) importCount++;
    }

    showToast(`${importCount}件の案件をインポートしました`, 'success');
    await loadProjects();
    renderProjects();
  };
  fileInput.click();
}

// kintoneへエクスポート（CSV）
function exportToKintone() {
  const headers = ['案件ID', 'kintone_record_id', '顧客名', '建築地', '営業担当', '設計担当', 'IC担当', '外構担当', '不動産担当', '工事担当', '商品', '進捗率', '間取確定日', '着工許可日', '変更契約前会議日', '更新日'];
  const rows = projects.map(p => [
    p.id,
    p.kintone_record_id || '',
    p.customer,
    p.building_address || '',
    p.sales_assignee || '',
    p.assigned_to,
    p.ic_assignee || '',
    p.exterior_assignee || '',
    p.realestate_assignee || '',
    p.construction_assignee || '',
    p.specifications,
    calculateProgress(p) + '%',
    p.layout_confirmed_date || '',
    p.construction_permit_date || '',
    p.pre_contract_meeting_date || '',
    p.updated_at
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `archideck_export_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url); // メモリ解放
  showToast('CSVをエクスポートしました', 'success');
}

// kintone同期対象フィールドを更新
async function syncToKintone(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project || !project.kintone_record_id) {
    showToast('kintone record IDが設定されていません', 'error');
    return;
  }

  if (!kintoneSettings?.domain || !kintoneSettings?.api_token) {
    showToast('kintone設定が完了していません', 'error');
    return;
  }

  // 実際のAPIコールはCORS制限のためサーバーサイドで実行が必要
  // ここではUIフィードバックのみ
  showToast('kintone同期をリクエストしました（サーバーサイド処理待ち）', 'info');

  // 同期リクエストをDBに記録
  try {
    const { error } = await supabase.from('kintone_sync_queue').insert({
      project_id: projectId,
      kintone_record_id: project.kintone_record_id,
      sync_type: 'push',
      status: 'pending',
      data: {
        layout_confirmed_date: project.layout_confirmed_date,
        construction_permit_date: project.construction_permit_date,
        pre_contract_meeting_date: project.pre_contract_meeting_date
      }
    });
    if (error) {
      console.error('kintone同期キュー追加エラー:', error);
    }
  } catch (e) {
    console.error('kintone同期キュー例外:', e);
  }
}

// 外構担当ドロップダウンを設定
function populateExteriorAssigneeDropdown(projectId = null, project = null) {
  const exteriorDesigners = designers.filter(d => d.category === '外構');
  const exteriorAssigneeSelect = document.getElementById('projectExteriorAssignee');

  if (exteriorAssigneeSelect) {
    exteriorAssigneeSelect.innerHTML = '<option value="">未定</option>' +
      exteriorDesigners.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');

    if (projectId && project) {
      exteriorAssigneeSelect.value = project.exterior_assignee || '';
    }
  }
}

// 不動産担当ドロップダウンを設定
function populateRealestateAssigneeDropdown(projectId = null, project = null) {
  const realestateDesigners = designers.filter(d => d.category === '不動産');
  const realestateAssigneeSelect = document.getElementById('projectRealestateAssignee');

  if (realestateAssigneeSelect) {
    realestateAssigneeSelect.innerHTML = '<option value="">未定</option>' +
      realestateDesigners.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');

    if (projectId && project) {
      realestateAssigneeSelect.value = project.realestate_assignee || '';
    }
  }
}

// 工事担当ドロップダウンを設定
function populateConstructionAssigneeDropdown(projectId = null, project = null) {
  const constructionDesigners = designers.filter(d => d.category === '工事');
  const constructionAssigneeSelect = document.getElementById('projectConstructionAssignee');

  if (constructionAssigneeSelect) {
    constructionAssigneeSelect.innerHTML = '<option value="">未定</option>' +
      constructionDesigners.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');

    if (projectId && project) {
      constructionAssigneeSelect.value = project.construction_assignee || '';
    }
  }
}

// 営業担当ドロップダウンを設定
function populateSalesAssigneeDropdown(projectId = null, project = null) {
  const salesDesigners = designers.filter(d => d.category === '営業');
  const salesAssigneeSelect = document.getElementById('projectSalesAssignee');

  if (salesAssigneeSelect) {
    salesAssigneeSelect.innerHTML = '<option value="">未定</option>' +
      salesDesigners.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');

    if (projectId && project) {
      salesAssigneeSelect.value = project.sales_assignee || '';
    }
  }
}

// openProjectModalを拡張
const originalOpenProjectModal = openProjectModal;
openProjectModal = function(projectId = null) {
  originalOpenProjectModal(projectId);

  const project = projectId ? projects.find(p => p.id === projectId) : null;
  populateExteriorAssigneeDropdown(projectId, project);
  populateRealestateAssigneeDropdown(projectId, project);
  populateConstructionAssigneeDropdown(projectId, project);
  populateSalesAssigneeDropdown(projectId, project);
};

// saveProjectを拡張
const originalSaveProject = saveProject;
saveProject = async function() {
  const customer = document.getElementById('projectCustomer').value.trim();
  const assignedTo = document.getElementById('projectAssignedTo').value.trim();
  const icAssignee = document.getElementById('projectIcAssignee').value.trim();

  // 最後に使用した担当者を記憶
  if (assignedTo) {
    localStorage.setItem('archideck_last_assignee', assignedTo);
  }
  const exteriorAssignee = document.getElementById('projectExteriorAssignee')?.value.trim() || '';
  const realestateAssignee = document.getElementById('projectRealestateAssignee')?.value.trim() || '';
  const constructionAssignee = document.getElementById('projectConstructionAssignee')?.value.trim() || '';
  const salesAssignee = document.getElementById('projectSalesAssignee')?.value.trim() || '';
  const specifications = document.getElementById('projectSpecifications').value;

  if (!customer || !assignedTo) {
    showToast('お客様名と担当（設計）は必須です', 'error');
    return;
  }

  showStatus('保存中...', 'saving');

  const projectData = {
    customer,
    assigned_to: assignedTo,
    ic_assignee: icAssignee || null,
    exterior_assignee: exteriorAssignee || null,
    realestate_assignee: realestateAssignee || null,
    construction_assignee: constructionAssignee || null,
    sales_assignee: salesAssignee || null,
    specifications,
    updated_at: new Date().toISOString()
  };

  try {
    if (editingProjectId) {
      const { error } = await supabase
        .from('projects')
        .update(projectData)
        .eq('id', editingProjectId);

      if (error) throw error;

      const idx = projects.findIndex(p => p.id === editingProjectId);
      if (idx !== -1) {
        projects[idx] = { ...projects[idx], ...projectData };
      }
    } else {
      const uid = 'P-' + Date.now();
      projectData.uid = uid;
      projectData.progress = {};
      projectData.status = 'active';

      const { data, error } = await supabase
        .from('projects')
        .insert(projectData)
        .select()
        .single();

      if (error) throw error;
      projects.push(data);
    }

    showStatus('保存済み', 'saved');
    showToast(editingProjectId ? '案件を更新しました' : '案件を追加しました', 'success');
    closeProjectModal();
    renderSidebar();
    renderProjects();
  } catch (error) {
    logError('保存エラー:', error);
    showStatus('エラー', 'error');
    showToast('保存に失敗しました', 'error');
  }
};

// ============================================
// ページ読み込み時
// ============================================
window.addEventListener('DOMContentLoaded', () => {
  initDarkMode(); // ダークモード初期化
  checkAuth();
  // URL直接アクセスの処理はcheckAuth() → init()完了後に自動実行される

  // Service Worker完全無効化（キャッシュ問題の恒久対策）
  if ('serviceWorker' in navigator) {
    (async () => {
      try {
        // 1. 全てのService Workerを登録解除
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
          log('🗑️ Service Worker登録解除完了');
        }

        // 2. 全キャッシュを削除
        const cacheNames = await caches.keys();
        for (const cacheName of cacheNames) {
          await caches.delete(cacheName);
          log('🗑️ キャッシュ削除:', cacheName);
        }
      } catch (err) {
        logError('❌ Service Worker処理エラー:', err);
      }
    })();
  }

  // プッシュ通知の許可リクエスト
  if ('Notification' in window && Notification.permission === 'default') {
    // 3秒後に通知許可を求める
    setTimeout(() => {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          log('✅ Push notifications enabled');
        }
      });
    }, 3000);
  }
});

// フローティングアクションボタン
const FAB = {
  container: null,
  button: null,
  menu: null,
  isOpen: false,

  init() {
    this.container = document.getElementById('fabContainer');
    this.button = document.getElementById('fabButton');
    this.menu = document.getElementById('fabMenu');

    // 外部クリックで閉じる
    document.addEventListener('click', (e) => {
      if (this.isOpen && !this.container?.contains(e.target)) {
        this.close();
      }
    });
  },

  toggle() {
    this.isOpen = !this.isOpen;
    this.button?.classList.toggle('active', this.isOpen);
    this.menu?.classList.toggle('show', this.isOpen);
  },

  close() {
    this.isOpen = false;
    this.button?.classList.remove('active');
    this.menu?.classList.remove('show');
  },

  action(type) {
    this.close();
    switch (type) {
      case 'new':
        createNewProject();
        break;
      case 'refresh':
        forceReloadData();
        break;
      case 'export':
        exportToCSV();
        break;
      case 'print':
        BatchReportGenerator.generateAndPrint('設計');
        break;
      case 'help':
        showShortcutHelp();
        break;
    }
  }
};

// ============================================
// 業者・依頼メール管理（タスクベース）
// ============================================

// 業者管理用の部署タブ切り替え
function switchVendorDeptTab(dept) {
  // タブのアクティブ状態を切り替え
  document.querySelectorAll('[data-vendor-dept]').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.vendorDept === dept);
  });

  // コンテンツの表示を切り替え
  document.querySelectorAll('.vendor-dept-content').forEach(content => {
    content.classList.remove('active');
    content.style.display = 'none';
  });
  const activeContent = document.getElementById(`vendorDeptContent_${dept}`);
  if (activeContent) {
    activeContent.classList.add('active');
    activeContent.style.display = 'block';
  }

  // 対応するタスク・業者一覧を描画
  renderTasksWithVendors(dept);
}

// 部署別にタスクと業者を描画
function renderTasksWithVendors(dept) {
  const grid = document.getElementById(`vendorGrid_${dept}`);
  if (!grid) return;

  // 部署のタスクを取得
  const deptTasks = tasksV2.filter(t => t.category === dept).sort((a, b) => a.display_order - b.display_order);

  if (deptTasks.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="padding: 40px;">
        <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
        <p style="color: var(--text-secondary);">この部署にはタスクが登録されていません</p>
        <p style="color: var(--text-secondary); font-size: 13px; margin-top: 8px;">業務管理画面でタスクを追加してください</p>
      </div>
    `;
    return;
  }

  // タスクごとにカードを生成
  grid.innerHTML = deptTasks.map(task => {
    // タスクに紐づくテンプレートIDを取得（taskMappingsで変換）
    const templateId = taskMappings[task.task_key] || task.task_key;
    // このテンプレートに紐づく業者を取得
    const taskVendors = vendors.filter(v => v.template_id === templateId);
    // メールが必要かどうか（業者にメール設定があるか）
    const hasEmailVendors = taskVendors.some(v => v.email);

    return `
      <div class="vendor-category-card" style="margin-bottom: 16px;">
        <div class="vendor-category-header">
          <div>
            <div class="vendor-category-title">${escapeHtml(task.task_name)}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
              ${taskVendors.length}件の業者${hasEmailVendors ? ' / メール設定あり' : ''}
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary btn-small" onclick="openAddVendorToTask('${escapeHtml(task.task_key)}')">
              + 業者追加
            </button>
          </div>
        </div>

        <div class="vendor-list">
          ${taskVendors.length > 0 ? taskVendors.map(vendor => `
            <div class="vendor-item" style="display: grid; grid-template-columns: 1fr auto; gap: 16px; padding: 12px; border-bottom: 1px solid var(--border-color);">
              <div style="display: grid; grid-template-columns: 200px 120px 1fr; gap: 12px; align-items: center;">
                <div>
                  <div style="font-weight: 500;">${escapeHtml(vendor.company || '-')}</div>
                  <div style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(vendor.contact || '-')}</div>
                </div>
                <div style="font-size: 13px; color: var(--text-secondary);">${escapeHtml(vendor.tel || '-')}</div>
                <div>
                  <div style="font-size: 13px;">${vendor.email ? '📧 ' + escapeHtml(vendor.email) : '<span style="color: var(--text-secondary);">メールなし</span>'}</div>
                  ${vendor.cc_email ? `<div style="font-size: 12px; color: var(--text-secondary);">CC: ${escapeHtml(vendor.cc_email)}</div>` : ''}
                  ${vendor.subject_format ? `<div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">件名: ${escapeHtml(vendor.subject_format.substring(0, 30))}...</div>` : ''}
                </div>
              </div>
              <div class="vendor-item-actions" style="display: flex; gap: 8px;">
                ${vendor.email ? `<button class="btn btn-ghost btn-small" onclick="openVendorEmailSettings('${escapeHtml(task.task_key)}', '${escapeHtml(vendor.vendor_id)}')">📧 メール設定</button>` : ''}
                <button class="btn btn-ghost btn-small" onclick="editVendorInfo('${escapeHtml(task.task_key)}', '${escapeHtml(vendor.vendor_id)}')">編集</button>
                <button class="btn btn-ghost btn-small" style="color: var(--danger);" onclick="deleteVendorFromTask('${escapeHtml(task.task_key)}', '${escapeHtml(vendor.vendor_id)}')">削除</button>
              </div>
            </div>
          `).join('') : `
            <div style="padding: 20px; text-align: center; color: var(--text-secondary);">
              業者が登録されていません
            </div>
          `}
        </div>
      </div>
    `;
  }).join('');
}

// 初期化時に呼び出す関数を更新
function renderRequestTemplatesGrid() {
  // デフォルトで設計タブを表示
  switchVendorDeptTab('設計');
}

// 現在編集中のタスクキー（editingVendorIdは既に宣言済み）
let editingTaskKey = null;

// タスクの業者管理モーダルを開く
function openTaskVendorManager(taskKey) {
  log('📋 openTaskVendorManager:', taskKey);
  editingTaskKey = taskKey;

  const task = tasksV2.find(t => t.task_key === taskKey);
  const taskName = task?.task_name || taskKey;

  // テンプレートIDを取得（taskMappingsで変換）
  const templateId = taskMappings[taskKey] || taskKey;
  // このタスクに紐づく業者を取得
  const taskVendors = vendors.filter(v => v.template_id === templateId);

  // モーダルコンテンツを生成
  const modalContent = `
    <div class="modal" id="taskVendorManagerModal">
      <div class="modal-content" style="max-width: 700px;">
        <div class="modal-header">
          <h2 class="modal-title">${escapeHtml(taskName)} - 業者管理</h2>
          <button class="close" onclick="closeTaskVendorManager()">&times;</button>
        </div>
        <div class="modal-body" style="max-height: 60vh; overflow-y: auto;">
          ${taskVendors.length === 0 ? `
            <div class="empty-state" style="padding: 32px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
              <p style="color: var(--text-secondary); margin-bottom: 16px;">業者が登録されていません</p>
              <button class="btn btn-primary" onclick="closeTaskVendorManager(); openAddVendorToTask('${escapeHtml(taskKey)}');">
                + 業者を追加
              </button>
            </div>
          ` : `
            <div class="vendor-list">
              ${taskVendors.map(vendor => `
                <div class="vendor-item" style="display: flex; justify-content: space-between; align-items: center; padding: 16px; border: 1px solid var(--border-color); border-radius: var(--radius-md); margin-bottom: 12px;">
                  <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px;">${escapeHtml(vendor.company || '会社名未設定')}</div>
                    <div style="font-size: 13px; color: var(--text-secondary);">
                      ${vendor.contact ? `担当: ${escapeHtml(vendor.contact)}` : ''}
                      ${vendor.email ? ` | ${escapeHtml(vendor.email)}` : ''}
                    </div>
                    ${vendor.email && (vendor.subject_format || vendor.template_text) ? `
                      <span class="badge badge-success" style="margin-top: 8px;">📧 メール設定済み</span>
                    ` : vendor.email ? `
                      <span class="badge badge-warning" style="margin-top: 8px;">📧 メールテンプレート未設定</span>
                    ` : ''}
                  </div>
                  <div style="display: flex; gap: 8px; flex-shrink: 0;">
                    ${vendor.email ? `
                      <button class="btn btn-ghost btn-small" onclick="closeTaskVendorManager(); openVendorEmailSettings('${escapeHtml(taskKey)}', '${escapeHtml(vendor.vendor_id)}')" title="メール設定">
                        📧
                      </button>
                    ` : ''}
                    <button class="btn btn-ghost btn-small" onclick="closeTaskVendorManager(); editVendorInfo('${escapeHtml(taskKey)}', '${escapeHtml(vendor.vendor_id)}')" title="編集">
                      編集
                    </button>
                    <button class="btn btn-ghost btn-small" onclick="deleteVendorFromTask('${escapeHtml(taskKey)}', '${escapeHtml(vendor.vendor_id)}')" title="削除" style="color: var(--danger-color);">
                      削除
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
        <div class="modal-footer" style="display: flex; justify-content: space-between;">
          <button class="btn btn-primary" onclick="closeTaskVendorManager(); openAddVendorToTask('${escapeHtml(taskKey)}');">
            + 業者を追加
          </button>
          <button class="btn btn-ghost" onclick="closeTaskVendorManager()">閉じる</button>
        </div>
      </div>
    </div>
  `;

  // 既存のモーダルがあれば削除
  const existingModal = document.getElementById('taskVendorManagerModal');
  if (existingModal) {
    existingModal.remove();
  }

  // モーダルをDOMに追加
  document.body.insertAdjacentHTML('beforeend', modalContent);

  // モーダルを開く
  const modal = document.getElementById('taskVendorManagerModal');
  ModalManager.open(modal);
}

// 業者管理モーダルを閉じる
function closeTaskVendorManager() {
  const modal = document.getElementById('taskVendorManagerModal');
  if (modal) {
    ModalManager.close(modal);
    // 少し待ってからDOMから削除
    setTimeout(() => modal.remove(), 300);
  }
}

// タスクに業者を追加するモーダルを開く
function openAddVendorToTask(taskKey) {
  log('➕ openAddVendorToTask:', taskKey);
  editingTaskKey = taskKey;
  editingVendorId = null;

  // フォームをリセット
  document.getElementById('vendorFormTaskKey').value = taskKey;
  document.getElementById('vendorFormVendorId').value = '';
  document.getElementById('vendorFormCompany').value = '';
  document.getElementById('vendorFormContact').value = '';
  document.getElementById('vendorFormTel').value = '';
  document.getElementById('vendorFormEmail').value = '';
  document.getElementById('vendorFormCcEmail').value = '';

  // タスク名を取得してタイトルに表示
  const task = tasksV2.find(t => t.task_key === taskKey);
  document.getElementById('vendorFormModalTitle').textContent = `${task?.task_name || taskKey} - 業者追加`;

  const modal = document.getElementById('vendorFormModal');
  ModalManager.open(modal, '#vendorFormCompany');
}

// 業者情報を編集
function editVendorInfo(taskKey, vendorId) {
  log('✏️ editVendorInfo:', taskKey, vendorId);
  editingTaskKey = taskKey;
  editingVendorId = vendorId;

  // テンプレートIDを取得（taskMappingsで変換）
  const templateId = taskMappings[taskKey] || taskKey;
  // 業者データを取得
  const vendor = vendors.find(v => v.template_id === templateId && v.vendor_id === vendorId);
  if (!vendor) {
    showToast('業者が見つかりません', 'error');
    return;
  }

  // フォームに値をセット
  document.getElementById('vendorFormTaskKey').value = taskKey;
  document.getElementById('vendorFormVendorId').value = vendorId;
  document.getElementById('vendorFormCompany').value = vendor.company || '';
  document.getElementById('vendorFormContact').value = vendor.contact || '';
  document.getElementById('vendorFormTel').value = vendor.tel || '';
  document.getElementById('vendorFormEmail').value = vendor.email || '';
  document.getElementById('vendorFormCcEmail').value = vendor.cc_email || '';

  // タスク名を取得してタイトルに表示
  const task = tasksV2.find(t => t.task_key === taskKey);
  document.getElementById('vendorFormModalTitle').textContent = `${task?.task_name || taskKey} - 業者編集`;

  const modal = document.getElementById('vendorFormModal');
  ModalManager.open(modal, '#vendorFormCompany');
}

// 業者フォームモーダルを閉じる
function closeVendorFormModal() {
  ModalManager.close(document.getElementById('vendorFormModal'));
  editingTaskKey = null;
  editingVendorId = null;
}

// 業者を保存
async function saveVendorForm() {
  const taskKey = document.getElementById('vendorFormTaskKey').value;
  const vendorId = document.getElementById('vendorFormVendorId').value || 'vendor_' + Date.now();
  const company = document.getElementById('vendorFormCompany').value.trim();
  const contact = document.getElementById('vendorFormContact').value.trim();
  const tel = document.getElementById('vendorFormTel').value.trim();
  const email = document.getElementById('vendorFormEmail').value.trim();
  const ccEmail = document.getElementById('vendorFormCcEmail').value.trim();

  if (!company) {
    showToast('会社名を入力してください', 'error');
    return;
  }

  // taskMappingsで変換、なければtask_keyをそのまま使用
  const templateId = taskMappings[taskKey] || taskKey;

  try {
    if (editingVendorId) {
      // 更新
      const { error } = await supabase
        .from('template_vendors')
        .update({
          company,
          contact,
          tel,
          email,
          cc_email: ccEmail || null
        })
        .eq('template_id', templateId)
        .eq('vendor_id', editingVendorId);

      if (error) throw error;
      showToast('業者を更新しました', 'success');
    } else {
      // 新規追加
      const { error } = await supabase
        .from('template_vendors')
        .insert({
          template_id: templateId,
          vendor_id: vendorId,
          company,
          contact,
          tel,
          email,
          cc_email: ccEmail || null
        });

      if (error) throw error;
      showToast('業者を追加しました', 'success');

      // task_template_mappingsにマッピングがなければ作成
      if (!taskMappings[taskKey]) {
        await supabase
          .from('task_template_mappings')
          .upsert({ task_key: taskKey, template_id: templateId }, { onConflict: 'task_key' });
        taskMappings[taskKey] = templateId;
      }
    }

    // データを再読み込み
    await loadVendors();
    closeVendorFormModal();

    // 現在の部署タブを再描画
    const activeDeptTab = document.querySelector('.dept-tab.active');
    if (activeDeptTab) {
      const dept = activeDeptTab.dataset.dept;
      switchDeptTab(dept);
    }

  } catch (err) {
    logError('業者保存エラー:', err);
    showToast('保存に失敗しました: ' + err.message, 'error');
  }
}

// 業者を削除
async function deleteVendorFromTask(taskKey, vendorId) {
  if (!confirm('この業者を削除しますか？')) return;

  const templateId = taskMappings[taskKey] || taskKey;

  try {
    const { error } = await supabase
      .from('template_vendors')
      .delete()
      .eq('template_id', templateId)
      .eq('vendor_id', vendorId);

    if (error) throw error;

    showToast('業者を削除しました', 'success');

    // データを再読み込み
    await loadVendors();

    // 業者管理モーダルを閉じる（開いていた場合）
    closeTaskVendorManager();

    // 現在の部署タブを再描画
    const activeDeptTab = document.querySelector('.dept-tab.active');
    if (activeDeptTab) {
      const dept = activeDeptTab.dataset.dept;
      switchDeptTab(dept);
    }

  } catch (err) {
    logError('業者削除エラー:', err);
    showToast('削除に失敗しました: ' + err.message, 'error');
  }
}

// デフォルトメールテンプレートを取得
function getDefaultEmailTemplate(taskKey, templateId) {
  // タスク名を取得
  const task = tasksV2.find(t => t.task_key === taskKey);
  const taskName = task ? task.task_name : taskKey;

  // 依頼内容別のテンプレート
  const templates = {
    // サッシ・開口部関連
    ogura: {
      subject: '【サッシ依頼】{customerName}様邸',
      body: `{company}
{contact}様

平素より大変お世話になっております。

この度、下記物件のサッシ・開口部リストをご依頼させていただきたく、ご連絡いたしました。

■ 物件情報
・お客様名：{customerName}様邸
・担当設計：{staffName}

■ ご依頼内容
サッシプレゼン資料および開口部リストの作成をお願いいたします。

■ ご提出期日
{dueDate}まで

ご多忙のところ恐れ入りますが、ご対応のほどよろしくお願いいたします。
ご不明点がございましたら、お気軽にお問い合わせください。`
    },
    // 換気システム関連
    panasonic: {
      subject: '【換気設備依頼】{customerName}様邸',
      body: `{company}
{contact}様

平素より大変お世話になっております。

この度、下記物件の換気設備配置図をご依頼させていただきたく、ご連絡いたしました。

■ 物件情報
・お客様名：{customerName}様邸
・担当設計：{staffName}

■ ご依頼内容
24時間換気システムの配置計画および換気計算書の作成をお願いいたします。

■ ご提出期日
{dueDate}まで

ご多忙のところ恐れ入りますが、ご対応のほどよろしくお願いいたします。`
    },
    // ダンパー・制振装置関連
    senpaku: {
      subject: '【ダンパー配置依頼】{customerName}様邸',
      body: `{company}
{contact}様

平素より大変お世話になっております。

この度、下記物件のダンパー配置計画をご依頼させていただきたく、ご連絡いたしました。

■ 物件情報
・お客様名：{customerName}様邸
・担当設計：{staffName}

■ ご依頼内容
制振ダンパーの配置計画および必要本数のご提案をお願いいたします。

■ ご提出期日
{dueDate}まで

図面データを添付いたしますので、ご確認のほどよろしくお願いいたします。`
    },
    // 地盤調査関連
    ground_survey: {
      subject: '【地盤調査依頼】{customerName}様邸',
      body: `{company}
{contact}様

平素より大変お世話になっております。

この度、下記物件の地盤調査をご依頼させていただきたく、ご連絡いたしました。

■ 物件情報
・お客様名：{customerName}様邸
・担当設計：{staffName}

■ ご依頼内容
スウェーデン式サウンディング試験（SWS試験）による地盤調査をお願いいたします。

■ 調査希望日
{dueDate}頃

現地の地図データを添付いたします。
調査日程のご調整をお願いいたします。`
    },
    // 給排水関連
    plumbing: {
      subject: '【給排水設備依頼】{customerName}様邸',
      body: `{company}
{contact}様

平素より大変お世話になっております。

この度、下記物件の給排水設備図をご依頼させていただきたく、ご連絡いたしました。

■ 物件情報
・お客様名：{customerName}様邸
・担当設計：{staffName}

■ ご依頼内容
給排水・衛生設備配管図および設備機器リストの作成をお願いいたします。

■ ご提出期日
{dueDate}まで

平面図を添付いたしますので、ご確認のほどよろしくお願いいたします。`
    },
    // 電気設備関連
    electric: {
      subject: '【電気設備依頼】{customerName}様邸',
      body: `{company}
{contact}様

平素より大変お世話になっております。

この度、下記物件の電気設備図をご依頼させていただきたく、ご連絡いたしました。

■ 物件情報
・お客様名：{customerName}様邸
・担当設計：{staffName}

■ ご依頼内容
電気配線図・コンセント配置図・照明配置図の作成をお願いいたします。

■ ご提出期日
{dueDate}まで

平面図およびお客様のご要望リストを添付いたしますので、ご確認のほどよろしくお願いいたします。`
    },
    // 構造計算関連
    structure: {
      subject: '【構造計算依頼】{customerName}様邸',
      body: `{company}
{contact}様

平素より大変お世話になっております。

この度、下記物件の構造計算をご依頼させていただきたく、ご連絡いたしました。

■ 物件情報
・お客様名：{customerName}様邸
・担当設計：{staffName}

■ ご依頼内容
許容応力度計算および構造計算書の作成をお願いいたします。

■ ご提出期日
{dueDate}まで

設計図面一式を添付いたします。
ご不明点がございましたら、お気軽にお問い合わせください。`
    },
    // 外構・エクステリア関連
    exterior: {
      subject: '【外構計画依頼】{customerName}様邸',
      body: `{company}
{contact}様

平素より大変お世話になっております。

この度、下記物件の外構計画をご依頼させていただきたく、ご連絡いたしました。

■ 物件情報
・お客様名：{customerName}様邸
・担当設計：{staffName}

■ ご依頼内容
外構計画図およびお見積りの作成をお願いいたします。

■ ご提出期日
{dueDate}まで

配置図および敷地資料を添付いたしますので、ご確認のほどよろしくお願いいたします。`
    },
    // プレカット関連
    precut: {
      subject: '【プレカット依頼】{customerName}様邸',
      body: `{company}
{contact}様

平素より大変お世話になっております。

この度、下記物件のプレカット図をご依頼させていただきたく、ご連絡いたしました。

■ 物件情報
・お客様名：{customerName}様邸
・担当設計：{staffName}

■ ご依頼内容
構造材プレカット図の作成をお願いいたします。

■ ご提出期日
{dueDate}まで

構造図面一式を添付いたします。
プレカット図完成後、確認をお願いいたします。`
    }
  };

  // テンプレートIDまたはタスクキーでマッチング
  const key = templateId || taskKey;
  if (templates[key]) {
    return templates[key];
  }

  // マッチしない場合は汎用テンプレート
  return {
    subject: `【${taskName}】{customerName}様邸`,
    body: `{company}
{contact}様

平素より大変お世話になっております。

この度、下記物件の件でご連絡いたしました。

■ 物件情報
・お客様名：{customerName}様邸
・担当設計：{staffName}

■ ご依頼内容
${taskName}についてご対応をお願いいたします。

■ ご希望期日
{dueDate}まで

ご多忙のところ恐れ入りますが、ご対応のほどよろしくお願いいたします。`
  };
}

// デフォルト署名を取得
function getDefaultSignature() {
  return `──────────────────────────
{staffName}

TEL: {staffPhone}
Email: {staffEmail}
──────────────────────────`;
}

// 業者のメール設定を開く
function openVendorEmailSettings(taskKey, vendorId) {
  log('📧 openVendorEmailSettings:', taskKey, vendorId);
  editingTaskKey = taskKey;
  editingVendorId = vendorId;

  const templateId = taskMappings[taskKey] || taskKey;
  const vendor = vendors.find(v => v.template_id === templateId && v.vendor_id === vendorId);
  if (!vendor) {
    showToast('業者が見つかりません', 'error');
    return;
  }

  // デフォルトテンプレートを取得
  const defaultTemplate = getDefaultEmailTemplate(taskKey, templateId);
  const defaultSignature = getDefaultSignature();

  // フォームに値をセット（既存の値があればそれを使用、なければデフォルト）
  document.getElementById('emailSettingsTaskKey').value = taskKey;
  document.getElementById('emailSettingsVendorId').value = vendorId;
  document.getElementById('emailSettingsTo').value = vendor.email || '';
  document.getElementById('emailSettingsCc').value = vendor.cc_email || '';
  document.getElementById('emailSettingsSubject').value = vendor.subject_format || defaultTemplate.subject;
  document.getElementById('emailSettingsBody').value = vendor.template_text || defaultTemplate.body;
  document.getElementById('emailSettingsSignature').value = vendor.signature || defaultSignature;

  // タスク名と会社名をタイトルに表示
  const task = tasksV2.find(t => t.task_key === taskKey);
  document.getElementById('emailSettingsModalTitle').textContent = `${vendor.company} - メール設定`;

  const modal = document.getElementById('vendorEmailSettingsModal');
  ModalManager.open(modal, '#emailSettingsSubject');
}

// メール設定モーダルを閉じる
function closeVendorEmailSettingsModal() {
  ModalManager.close(document.getElementById('vendorEmailSettingsModal'));
  editingTaskKey = null;
  editingVendorId = null;
}

// メール設定を保存
async function saveVendorEmailSettings() {
  const taskKey = document.getElementById('emailSettingsTaskKey').value;
  const vendorId = document.getElementById('emailSettingsVendorId').value;
  const email = document.getElementById('emailSettingsTo').value.trim();
  const ccEmail = document.getElementById('emailSettingsCc').value.trim();
  const subjectFormat = document.getElementById('emailSettingsSubject').value.trim();
  const templateText = document.getElementById('emailSettingsBody').value.trim();
  const signature = document.getElementById('emailSettingsSignature').value.trim();

  const templateId = taskMappings[taskKey] || taskKey;

  try {
    const { error } = await supabase
      .from('template_vendors')
      .update({
        email,
        cc_email: ccEmail || null,
        subject_format: subjectFormat || null,
        template_text: templateText || null,
        signature: signature || null
      })
      .eq('template_id', templateId)
      .eq('vendor_id', vendorId);

    if (error) throw error;

    showToast('メール設定を保存しました', 'success');

    // データを再読み込み
    await loadVendors();
    closeVendorEmailSettingsModal();

    // 現在の部署タブを再描画
    const activeDeptTab = document.querySelector('.dept-tab.active');
    if (activeDeptTab) {
      const dept = activeDeptTab.dataset.dept;
      switchDeptTab(dept);
    }

  } catch (err) {
    logError('メール設定保存エラー:', err);
    showToast('保存に失敗しました: ' + err.message, 'error');
  }
}

// カテゴリ追加モーダル（将来拡張用）
function openAddVendorCategoryModal(dept) {
  showToast(`${dept}部署へのカテゴリ追加機能は準備中です`, 'info');
}

// 旧関数（互換性のため残す）
function openAddVendorToCategory(templateId) {
  log('➕ openAddVendorToCategory (legacy):', templateId);
  // 新しい関数にリダイレクト
  openAddVendorToTask(templateId);
}

function editVendorInCategory(templateId, vendorId) {
  log('✏️ editVendorInCategory (legacy):', templateId, vendorId);
  editVendorInfo(templateId, vendorId);
}

function openEmailTemplateEditor(templateId) {
  log('📧 openEmailTemplateEditor (legacy):', templateId);
  // 旧モーダルは使わない
  showToast('メール設定は各業者の「📧 メール設定」ボタンから行ってください', 'info');
}

// 編集用の業者データを一時保存
let editingTemplateVendors = [];

// テンプレート編集モーダルを開く
function openEditTemplateModal(templateId) {
  log('📝 openEditTemplateModal:', templateId, 'emailTemplates:', emailTemplates.length);

  const template = emailTemplates.find(t => t.template_id === templateId);
  if (!template) {
    logError('❌ テンプレートが見つかりません:', templateId, '利用可能:', emailTemplates.map(t => t.template_id));
    showToast('テンプレートが見つかりません: ' + templateId, 'error');
    return;
  }

  log('✅ テンプレート取得:', template.display_name);

  // フォームに値をセット
  document.getElementById('editTemplateId').value = template.template_id;
  document.getElementById('editTemplateDisplayName').value = template.display_name || '';
  document.getElementById('editTemplateCategory').value = template.category || '設計';
  document.getElementById('editTemplateCompany').value = template.company || '';
  document.getElementById('editTemplateContact').value = template.contact || '';
  document.getElementById('editTemplateEmail').value = template.email || '';
  document.getElementById('editTemplateSubject').value = template.subject_format || '';
  document.getElementById('editTemplateBody').value = template.template_text || '';

  // モーダルタイトルを設定
  document.getElementById('editTemplateModalTitle').textContent = `${template.display_name} - 編集`;

  // 業者セクションを常に表示（全テンプレートで業者管理可能）
  const vendorsSection = document.getElementById('editTemplateVendorsSection');
  vendorsSection.style.display = 'block';
  // 業者一覧を読み込み
  editingTemplateVendors = vendors.filter(v => v.template_id === templateId);
  log('📋 業者一覧:', editingTemplateVendors.length, '件');
  renderTemplateVendorsList();

  // モーダルを開く
  const modal = document.getElementById('editRequestTemplateModal');
  ModalManager.open(modal, '#editTemplateDisplayName');
}

// テンプレート編集モーダルを閉じる
function closeEditTemplateModal() {
  ModalManager.close(document.getElementById('editRequestTemplateModal'));
  editingTemplateVendors = [];
}

// 業者一覧を描画
function renderTemplateVendorsList() {
  const list = document.getElementById('templateVendorsList');
  if (!list) return;

  if (editingTemplateVendors.length === 0) {
    list.innerHTML = '<p style="color: var(--text-secondary); font-size: 13px;">業者が登録されていません</p>';
    return;
  }

  list.innerHTML = editingTemplateVendors.map((vendor, index) => `
    <div style="display: grid; grid-template-columns: 1fr 120px 120px 1fr 1fr 40px; gap: 8px; margin-bottom: 8px; align-items: center;">
      <input type="text" class="form-input" value="${escapeHtml(vendor.company || '')}"
        onchange="editingTemplateVendors[${index}].company = this.value" placeholder="会社名">
      <input type="text" class="form-input" value="${escapeHtml(vendor.contact || '')}"
        onchange="editingTemplateVendors[${index}].contact = this.value" placeholder="担当者">
      <input type="text" class="form-input" value="${escapeHtml(vendor.tel || '')}"
        onchange="editingTemplateVendors[${index}].tel = this.value" placeholder="電話番号">
      <input type="email" class="form-input" value="${escapeHtml(vendor.email || '')}"
        onchange="editingTemplateVendors[${index}].email = this.value" placeholder="To（メール）">
      <input type="email" class="form-input" value="${escapeHtml(vendor.cc_email || '')}"
        onchange="editingTemplateVendors[${index}].cc_email = this.value" placeholder="CC（メール）">
      <button class="btn btn-ghost btn-small" onclick="removeTemplateVendorRow(${index})" style="color: var(--danger);">✕</button>
    </div>
  `).join('');
}

// 業者行を追加
function addTemplateVendorRow() {
  const templateId = document.getElementById('editTemplateId').value;
  const newVendorId = 'vendor_' + Date.now();
  editingTemplateVendors.push({
    template_id: templateId,
    vendor_id: newVendorId,
    company: '',
    contact: '',
    tel: '',
    email: '',
    cc_email: '',
    isNew: true
  });
  renderTemplateVendorsList();
}

// 業者行を削除
function removeTemplateVendorRow(index) {
  editingTemplateVendors.splice(index, 1);
  renderTemplateVendorsList();
}

// テンプレートを保存
async function saveRequestTemplate() {
  const templateId = document.getElementById('editTemplateId').value;
  const displayName = document.getElementById('editTemplateDisplayName').value.trim();
  const category = document.getElementById('editTemplateCategory').value;
  const company = document.getElementById('editTemplateCompany').value.trim();
  const contact = document.getElementById('editTemplateContact').value.trim();
  const email = document.getElementById('editTemplateEmail').value.trim();
  const subjectFormat = document.getElementById('editTemplateSubject').value.trim();
  const templateText = document.getElementById('editTemplateBody').value.trim();

  if (!displayName) {
    showToast('テンプレート名を入力してください', 'error');
    return;
  }

  try {
    // email_templatesテーブルを更新
    const { error: updateError } = await supabase
      .from('email_templates')
      .update({
        display_name: displayName,
        category: category,
        company: company,
        contact: contact,
        email: email,
        subject_format: subjectFormat,
        template_text: templateText
      })
      .eq('template_id', templateId);

    if (updateError) {
      throw updateError;
    }

    // 業者情報を更新（全テンプレートで業者管理可能）
    // 既存の業者を削除
    await supabase
      .from('template_vendors')
      .delete()
      .eq('template_id', templateId);

    // 新しい業者を挿入
    if (editingTemplateVendors.length > 0) {
      const vendorInserts = editingTemplateVendors.map((v, index) => ({
        template_id: templateId,
        vendor_id: v.vendor_id || `vendor_${index}`,
        company: v.company,
        contact: v.contact,
        tel: v.tel,
        email: v.email,
        cc_email: v.cc_email || null
      }));

      const { error: vendorError } = await supabase
        .from('template_vendors')
        .insert(vendorInserts);

      if (vendorError) {
        throw vendorError;
      }
    }

    // 業者一覧を再読み込み
    await loadVendors();

    // テンプレート一覧を再読み込み
    await loadEmailTemplates();

    showToast('テンプレートを保存しました', 'success');
    closeEditTemplateModal();
    renderRequestTemplatesGrid();

  } catch (err) {
    logError('テンプレート保存エラー:', err);
    showToast('保存に失敗しました: ' + err.message, 'error');
  }
}

// FAB初期化
document.addEventListener('DOMContentLoaded', () => FAB.init());

// ============================================
// デバッグ用: タスク-業者マッピング確認
// ============================================
// ブラウザコンソールで debugVendorMapping('evoltz') を実行
window.debugVendorMapping = function(taskKey) {
  console.log('=== タスク-業者マッピング デバッグ ===');
  console.log('taskKey:', taskKey);

  const templateId = taskMappings[taskKey] || taskKey;
  console.log('taskMappings[taskKey]:', taskMappings[taskKey]);
  console.log('templateId (使用される値):', templateId);

  console.log('全taskMappings:', taskMappings);

  const taskVendors = vendors.filter(v => v.template_id === templateId);
  console.log('マッチした業者数:', taskVendors.length);
  console.log('マッチした業者:', taskVendors);

  console.log('全vendors (template_idのみ):', vendors.map(v => ({ template_id: v.template_id, vendor_id: v.vendor_id, company: v.company })));

  return { taskKey, templateId, taskVendors, allMappings: taskMappings };
};
