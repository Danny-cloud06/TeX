/**
 * TeX — Smart Teleprompter & Mobile Video Studio
 * Milestone 1: Core Script Studio & Teleprompter Engine
 * 
 * Architecture:
 * - ScriptStore: Offline CRUD via localStorage with pre-seeded sample script.
 * - SettingsStore: Prompter configuration & Smart Eye Contact geometry foundation.
 * - PrompterEngine: requestAnimationFrame delta-time scrolling, manual touch scroll,
 *   HUD auto-hiding, and distraction-free mode.
 * - UIController: Navigation, views, modals, toasts, and event wiring.
 */

'use strict';

// ============================================================================
// 1. DEFAULT DATA & SAMPLE SCRIPT
// ============================================================================

const DEFAULT_SAMPLE_SCRIPT = {
  id: 'sample-welcome-tex',
  title: 'Welcome to TeX — Creator Guide',
  body: `Welcome to TeX! This application is designed specifically for mobile content creators recording videos for TikTok, Instagram Reels, YouTube Shorts, and professional presentations.

The goal of TeX is simple: to help you speak with absolute confidence on camera without viewers noticing that you are reading from a script.

Here is how to get the most natural result:

First, notice the green marker at the top of your screen. That marker points straight at your front camera lens. By keeping the text narrow and reading directly beneath the camera, your eyes will stay locked on your audience.

Second, adjust your scrolling speed using the plus and minus buttons in the bottom control dock. Match the speed to your natural speaking pace so you never have to rush.

Third, you can tap anywhere on the screen at any time to pause or resume scrolling. If you need to review a paragraph, simply swipe up or down with your finger.

Enjoy creating with TeX!`,
  createdAt: Date.now() - 3600000,
  updatedAt: Date.now() - 3600000
};

const DEFAULT_SETTINGS = {
  // Smart Eye Contact Foundation Geometry
  readingWidth: 'compact',     // 'compact' (340px) | 'medium' (520px) | 'full' (100%)
  cameraAnchor: 'center',      // 'left' | 'center' | 'right'
  verticalOffset: 120,         // Distance (px) from top of screen / camera
  showCameraGuide: true,       // Top alignment cue pointing to front camera
  showReadingLine: true,       // Horizontal reading focus line
  
  // Future Milestone 3 AI Pipeline Foundation (Reserved schema)
  smartEyeContact: {
    version: '1.0-foundation',
    gazeCalibration: { enabled: false, sensitivity: 1.0 },
    eyeTracking: { active: false, detectedGazeX: 0, detectedGazeY: 0 }
  },

  // Teleprompter Reading Experience
  fontSize: 32,                // px
  lineHeight: 1.6,             // multiplier
  textAlign: 'center',         // 'left' | 'center' | 'right'
  scrollSpeed: 2.5,            // speed multiplier (1.0 to 10.0)
  autoHideControls: true       // Auto-hide HUD on play
};

// ============================================================================
// 2. SCRIPT STORAGE MODULE (Offline localStorage CRUD)
// ============================================================================

const ScriptStore = {
  STORAGE_KEY: 'tex_scripts_v1',

  getAll() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (!data) {
        // First launch: initialize with sample script
        const initial = [DEFAULT_SAMPLE_SCRIPT];
        this.saveAll(initial);
        return initial;
      }
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error('[ScriptStore] Error loading scripts:', err);
      return [DEFAULT_SAMPLE_SCRIPT];
    }
  },

  saveAll(scripts) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(scripts));
      return true;
    } catch (err) {
      console.error('[ScriptStore] Error saving scripts:', err);
      return false;
    }
  },

  getById(id) {
    const list = this.getAll();
    return list.find(s => s.id === id) || null;
  },

  saveScript(scriptData) {
    const list = this.getAll();
    const now = Date.now();
    let savedScript = null;

    if (scriptData.id) {
      // Update existing
      const index = list.findIndex(s => s.id === scriptData.id);
      if (index !== -1) {
        list[index] = {
          ...list[index],
          title: scriptData.title.trim() || 'Untitled Script',
          body: scriptData.body || '',
          updatedAt: now
        };
        savedScript = list[index];
      }
    }

    if (!savedScript) {
      // Create new
      savedScript = {
        id: 'script_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        title: (scriptData.title || '').trim() || 'Untitled Script',
        body: scriptData.body || '',
        createdAt: now,
        updatedAt: now
      };
      list.unshift(savedScript);
    }

    this.saveAll(list);
    return savedScript;
  },

  deleteScript(id) {
    const list = this.getAll();
    const filtered = list.filter(s => s.id !== id);
    this.saveAll(filtered);
    return filtered;
  },

  restoreSample() {
    const list = this.getAll();
    const existingSample = list.find(s => s.id === DEFAULT_SAMPLE_SCRIPT.id);
    if (!existingSample) {
      list.unshift(DEFAULT_SAMPLE_SCRIPT);
      this.saveAll(list);
    }
    return list;
  }
};

// ============================================================================
// 3. SETTINGS STORAGE MODULE
// ============================================================================

const SettingsStore = {
  STORAGE_KEY: 'tex_settings_v1',

  getSettings() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (!data) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    } catch (err) {
      console.error('[SettingsStore] Error loading settings:', err);
      return { ...DEFAULT_SETTINGS };
    }
  },

  saveSettings(newSettings) {
    try {
      const merged = { ...this.getSettings(), ...newSettings };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(merged));
      return merged;
    } catch (err) {
      console.error('[SettingsStore] Error saving settings:', err);
      return DEFAULT_SETTINGS;
    }
  },

  resetDefaults() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (e) {}
    return { ...DEFAULT_SETTINGS };
  }
};

// ============================================================================
// 4. TELEPROMPTER ENGINE (requestAnimationFrame Scrolling)
// ============================================================================

const PrompterEngine = {
  isPlaying: false,
  scrollSpeed: 2.5,        // Speed multiplier
  baseSpeedPxPerSec: 32,   // Base pixels per second at 1.0x
  lastFrameTime: 0,
  animationFrameId: null,
  viewportEl: null,
  progressFillEl: null,
  progressPctEl: null,
  autoHideTimer: null,
  autoHideDelay: 2500,     // Auto-hide HUD after 2.5 seconds of play
  onStateChange: null,     // Callback when play/pause toggles
  currentScrollY: 0,       // High-precision sub-pixel scroll accumulator

  init(viewportEl, progressFillEl, progressPctEl, onStateChange) {
    this.viewportEl = viewportEl;
    this.progressFillEl = progressFillEl;
    this.progressPctEl = progressPctEl;
    this.onStateChange = onStateChange;

    // Passive touch / scroll listeners to track manual dragging
    this.viewportEl.addEventListener('scroll', () => {
      // Sync accumulator if scrolled manually
      if (!this.isPlaying) {
        this.currentScrollY = this.viewportEl.scrollTop;
      }
      this.updateProgress();
    }, { passive: true });

    // Detect user manual dragging while playing to momentarily pause or adjust
    let touchStartY = 0;
    this.viewportEl.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY;
        this.currentScrollY = this.viewportEl.scrollTop;
      }
    }, { passive: true });

    this.viewportEl.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        this.currentScrollY = this.viewportEl.scrollTop;
        if (this.isPlaying) {
          const diff = Math.abs(e.touches[0].clientY - touchStartY);
          if (diff > 12) {
            // User is actively flicking or dragging; reveal HUD so they retain control
            UIController.revealHUD();
          }
        }
      }
    }, { passive: true });
  },

  play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.currentScrollY = this.viewportEl ? this.viewportEl.scrollTop : 0;
    this.lastFrameTime = performance.now();
    this.animationFrameId = requestAnimationFrame(this.step.bind(this));

    if (this.onStateChange) this.onStateChange(true);
    this.scheduleAutoHide();
  },

  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.viewportEl) {
      this.currentScrollY = this.viewportEl.scrollTop;
    }

    if (this.onStateChange) this.onStateChange(false);
    this.clearAutoHide();
    UIController.revealHUD();
  },

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
      UIController.flashCue('PAUSED');
    } else {
      this.play();
      UIController.flashCue('SCROLLING');
    }
  },

  restart() {
    this.pause();
    this.currentScrollY = 0;
    if (this.viewportEl) {
      this.viewportEl.scrollTo({ top: 0, behavior: 'smooth' });
    }
    this.updateProgress();
    UIController.flashCue('RESET TO TOP');
  },

  setSpeed(speed) {
    // Clamp speed between 0.5 and 10.0
    const clamped = Math.max(0.5, Math.min(10.0, Math.round(speed * 10) / 10));
    this.scrollSpeed = clamped;
    return clamped;
  },

  step(currentTime) {
    if (!this.isPlaying || !this.viewportEl) return;

    const delta = (currentTime - this.lastFrameTime) / 1000; // in seconds
    this.lastFrameTime = currentTime;

    // Guard against huge deltas if app was backgrounded
    if (delta > 0 && delta < 0.2) {
      const pxPerSec = this.baseSpeedPxPerSec * this.scrollSpeed;
      const moveDistance = pxPerSec * delta;
      
      const maxScroll = this.viewportEl.scrollHeight - this.viewportEl.clientHeight;
      if (this.viewportEl.scrollTop >= maxScroll - 1) {
        // Reached the end of script
        this.pause();
        UIController.flashCue('END OF SCRIPT');
        return;
      }

      this.currentScrollY += moveDistance;
      this.viewportEl.scrollTop = Math.round(this.currentScrollY);
      this.updateProgress();
    }

    this.animationFrameId = requestAnimationFrame(this.step.bind(this));
  },

  updateProgress() {
    if (!this.viewportEl) return;
    const maxScroll = this.viewportEl.scrollHeight - this.viewportEl.clientHeight;
    let pct = 0;
    if (maxScroll > 0) {
      pct = Math.min(100, Math.max(0, Math.round((this.viewportEl.scrollTop / maxScroll) * 100)));
    }

    if (this.progressFillEl) {
      this.progressFillEl.style.width = pct + '%';
    }
    if (this.progressPctEl) {
      this.progressPctEl.textContent = pct + '%';
    }
  },

  scheduleAutoHide() {
    this.clearAutoHide();
    const settings = SettingsStore.getSettings();
    if (!settings.autoHideControls) return;

    this.autoHideTimer = setTimeout(() => {
      if (this.isPlaying) {
        UIController.hideHUD();
      }
    }, this.autoHideDelay);
  },

  clearAutoHide() {
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
  }
};

// ============================================================================
// 5. UI CONTROLLER & VIEW ROUTING
// ============================================================================

const UIController = {
  currentView: 'library',
  currentScriptId: null,
  activeScript: null,
  scriptPendingDeleteId: null,

  // Cache DOM references
  elements: {},

  init() {
    this.bindElements();
    this.initPrompterEngine();
    this.applySettingsToDOM(SettingsStore.getSettings());
    this.bindEvents();
    this.renderScriptList();
  },

  bindElements() {
    this.elements = {
      // Views
      viewLibrary: document.getElementById('view-library'),
      viewEditor: document.getElementById('view-editor'),
      viewPrompter: document.getElementById('view-prompter'),

      // Library View
      btnNewScript: document.getElementById('btn-new-script'),
      searchInput: document.getElementById('search-input'),
      btnClearSearch: document.getElementById('btn-clear-search'),
      scriptList: document.getElementById('script-list'),
      emptyState: document.getElementById('empty-state'),
      scriptCountBadge: document.getElementById('script-count-badge'),
      btnEmptyCreate: document.getElementById('btn-empty-create'),
      btnRestoreSample: document.getElementById('btn-restore-sample'),

      // Editor View
      btnEditorBack: document.getElementById('btn-editor-back'),
      btnEditorSave: document.getElementById('btn-editor-save'),
      btnEditorPrompt: document.getElementById('btn-editor-prompt'),
      editorTitle: document.getElementById('editor-title'),
      editorBody: document.getElementById('editor-body'),
      editorSaveStatus: document.getElementById('editor-save-status'),
      editorWordCount: document.getElementById('editor-word-count'),
      editorReadTime: document.getElementById('editor-read-time'),
      editorCharCount: document.getElementById('editor-char-count'),

      // Prompter View
      prompterViewport: document.getElementById('prompter-viewport'),
      prompterTextTrack: document.getElementById('prompter-text-track'),
      prompterBody: document.getElementById('prompter-body'),
      prompterTitle: document.getElementById('prompter-title'),
      prompterProgressPct: document.getElementById('prompter-progress-pct'),
      prompterProgressBar: document.getElementById('prompter-progress-bar'),
      prompterTopHud: document.getElementById('prompter-top-hud'),
      prompterBottomHud: document.getElementById('prompter-bottom-hud'),
      cameraGuide: document.getElementById('camera-guide'),
      prompterFocusLine: document.getElementById('prompter-focus-line'),
      prompterTapCue: document.getElementById('prompter-tap-cue'),
      tapCueText: document.getElementById('tap-cue-text'),
      btnPrompterBack: document.getElementById('btn-prompter-back'),
      btnToggleHud: document.getElementById('btn-toggle-hud'),
      btnPrompterSettings: document.getElementById('btn-prompter-settings'),
      btnPrompterRestart: document.getElementById('btn-prompter-restart'),
      btnPrompterPlay: document.getElementById('btn-prompter-play'),
      iconPlay: document.getElementById('icon-play'),
      iconPause: document.getElementById('icon-pause'),
      btnSpeedDown: document.getElementById('btn-speed-down'),
      btnSpeedUp: document.getElementById('btn-speed-up'),
      speedLabel: document.getElementById('speed-label'),

      // Settings Modal
      modalSettings: document.getElementById('modal-settings'),
      btnCloseSettings: document.getElementById('btn-close-settings'),
      btnSaveSettings: document.getElementById('btn-save-settings'),
      btnResetSettings: document.getElementById('btn-reset-settings'),
      settingWidthDisplay: document.getElementById('setting-width-display'),
      settingAnchorDisplay: document.getElementById('setting-anchor-display'),
      settingVerticalOffset: document.getElementById('setting-vertical-offset'),
      settingOffsetDisplay: document.getElementById('setting-offset-display'),
      settingCameraGuide: document.getElementById('setting-camera-guide'),
      settingFocusLine: document.getElementById('setting-focus-line'),
      settingFontSize: document.getElementById('setting-font-size'),
      settingFontSizeVal: document.getElementById('setting-font-size-val'),
      settingLineHeight: document.getElementById('setting-line-height'),
      settingLineHeightVal: document.getElementById('setting-line-height-val'),
      settingAlignDisplay: document.getElementById('setting-align-display'),
      settingAutoHide: document.getElementById('setting-auto-hide'),

      // Delete Modal
      modalDelete: document.getElementById('modal-delete'),
      deleteScriptTitle: document.getElementById('delete-script-title'),
      btnCloseDelete: document.getElementById('btn-close-delete'),
      btnCancelDelete: document.getElementById('btn-cancel-delete'),
      btnConfirmDelete: document.getElementById('btn-confirm-delete'),

      // Toast
      toast: document.getElementById('toast')
    };
  },

  initPrompterEngine() {
    PrompterEngine.init(
      this.elements.prompterViewport,
      this.elements.prompterProgressBar,
      this.elements.prompterProgressPct,
      (isPlaying) => {
        this.updatePlayStateUI(isPlaying);
      }
    );
    const settings = SettingsStore.getSettings();
    PrompterEngine.setSpeed(settings.scrollSpeed || 2.5);
    this.elements.speedLabel.textContent = PrompterEngine.scrollSpeed.toFixed(1);
  },

  // ==========================================================================
  // NAVIGATION ROUTER
  // ==========================================================================

  navigateTo(viewName, params = {}) {
    this.currentView = viewName;

    // View switching
    this.elements.viewLibrary.classList.toggle('view-active', viewName === 'library');
    this.elements.viewEditor.classList.toggle('view-active', viewName === 'editor');
    this.elements.viewPrompter.classList.toggle('view-active', viewName === 'prompter');

    if (viewName === 'library') {
      PrompterEngine.pause();
      this.renderScriptList();
    } else if (viewName === 'editor') {
      PrompterEngine.pause();
      this.openEditor(params.scriptId);
    } else if (viewName === 'prompter') {
      this.openPrompter(params.scriptId);
    }
  },

  // ==========================================================================
  // VIEW: SCRIPT LIBRARY
  // ==========================================================================

  renderScriptList() {
    const query = (this.elements.searchInput.value || '').trim().toLowerCase();
    let scripts = ScriptStore.getAll();

    if (query) {
      scripts = scripts.filter(s => 
        (s.title || '').toLowerCase().includes(query) ||
        (s.body || '').toLowerCase().includes(query)
      );
    }

    this.elements.scriptCountBadge.textContent = scripts.length;
    this.elements.scriptList.innerHTML = '';

    if (scripts.length === 0) {
      this.elements.emptyState.classList.remove('hidden');
      return;
    }

    this.elements.emptyState.classList.add('hidden');

    scripts.forEach(script => {
      const card = this.createScriptCard(script);
      this.elements.scriptList.appendChild(card);
    });
  },

  createScriptCard(script) {
    const card = document.createElement('article');
    card.className = 'script-card';
    card.setAttribute('role', 'listitem');
    card.dataset.id = script.id;

    const stats = this.calcTextStats(script.body || '');
    const dateFormatted = this.formatDate(script.updatedAt || script.createdAt);

    // Escape title and body snippet safely
    const titleSafe = this.escapeHTML(script.title || 'Untitled Script');
    const snippetSafe = this.escapeHTML(script.body ? script.body.substring(0, 140) : 'Empty script...');

    card.innerHTML = `
      <div class="script-card-header">
        <h3 class="script-card-title">${titleSafe}</h3>
      </div>
      <p class="script-card-snippet">${snippetSafe}</p>
      <div class="script-card-meta">
        <span class="meta-pill">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          </svg>
          ${stats.words} words
        </span>
        <span class="meta-pill">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          ${stats.readTime}
        </span>
        <span class="meta-date">${dateFormatted}</span>
      </div>
      <div class="script-card-actions">
        <button class="btn btn-card-launch" data-action="prompt">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
            <polygon points="6 4 20 12 6 20 6 4"></polygon>
          </svg>
          <span>Prompt</span>
        </button>
        <button class="btn btn-card-secondary" data-action="edit">Edit</button>
        <button class="btn btn-card-delete" data-action="delete" title="Delete Script" aria-label="Delete">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    // Bind card actions directly
    card.querySelector('[data-action="prompt"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.navigateTo('prompter', { scriptId: script.id });
    });

    card.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.navigateTo('editor', { scriptId: script.id });
    });

    card.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.openDeleteModal(script.id, script.title);
    });

    // Clicking card body also opens editor
    card.addEventListener('click', () => {
      this.navigateTo('editor', { scriptId: script.id });
    });

    return card;
  },

  // ==========================================================================
  // VIEW: SCRIPT EDITOR
  // ==========================================================================

  openEditor(scriptId) {
    this.currentScriptId = scriptId || null;

    if (scriptId) {
      const script = ScriptStore.getById(scriptId);
      if (script) {
        this.elements.editorTitle.value = script.title || '';
        this.elements.editorBody.value = script.body || '';
        this.elements.editorSaveStatus.textContent = 'Saved';
        this.elements.editorSaveStatus.classList.remove('unsaved');
      } else {
        this.elements.editorTitle.value = '';
        this.elements.editorBody.value = '';
      }
    } else {
      this.elements.editorTitle.value = '';
      this.elements.editorBody.value = '';
      this.elements.editorSaveStatus.textContent = 'New Script';
      this.elements.editorSaveStatus.classList.remove('unsaved');
    }

    this.updateEditorStats();
  },

  updateEditorStats() {
    const text = this.elements.editorBody.value || '';
    const stats = this.calcTextStats(text);
    this.elements.editorWordCount.textContent = `${stats.words} words`;
    this.elements.editorReadTime.textContent = stats.readTime;
    this.elements.editorCharCount.textContent = `${stats.chars} chars`;
  },

  saveCurrentEditorScript() {
    const title = this.elements.editorTitle.value.trim() || 'Untitled Script';
    const body = this.elements.editorBody.value.trim();

    if (!body && !this.elements.editorTitle.value.trim()) {
      this.showToast('Please enter some text before saving');
      return null;
    }

    const saved = ScriptStore.saveScript({
      id: this.currentScriptId,
      title: title,
      body: body
    });

    this.currentScriptId = saved.id;
    this.elements.editorSaveStatus.textContent = 'Saved';
    this.elements.editorSaveStatus.classList.remove('unsaved');
    this.showToast('Script saved successfully');
    return saved;
  },

  // ==========================================================================
  // VIEW: TELEPROMPTER READER
  // ==========================================================================

  openPrompter(scriptId) {
    let script = null;
    if (scriptId) {
      script = ScriptStore.getById(scriptId);
    }

    if (!script) {
      // Fallback: take first available or sample
      const all = ScriptStore.getAll();
      script = all.length > 0 ? all[0] : DEFAULT_SAMPLE_SCRIPT;
    }

    this.activeScript = script;
    this.elements.prompterTitle.textContent = script.title || 'Untitled Script';

    // Parse paragraphs for prompter body
    this.elements.prompterBody.innerHTML = '';
    const paragraphs = (script.body || 'No script text entered.').split(/\n+/);
    paragraphs.forEach(para => {
      const p = document.createElement('p');
      p.textContent = para.trim();
      if (p.textContent.length > 0) {
        this.elements.prompterBody.appendChild(p);
      }
    });

    // Reset scroll to top
    if (this.elements.prompterViewport) {
      this.elements.prompterViewport.scrollTop = 0;
    }
    PrompterEngine.updateProgress();

    // Ensure HUD is visible when entering reader
    this.revealHUD();
  },

  updatePlayStateUI(isPlaying) {
    if (isPlaying) {
      this.elements.btnPrompterPlay.classList.add('is-playing');
      this.elements.iconPlay.classList.add('hidden');
      this.elements.iconPause.classList.remove('hidden');
    } else {
      this.elements.btnPrompterPlay.classList.remove('is-playing');
      this.elements.iconPlay.classList.remove('hidden');
      this.elements.iconPause.classList.add('hidden');
    }
  },

  hideHUD() {
    this.elements.prompterTopHud.classList.add('hud-hidden');
    this.elements.prompterBottomHud.classList.add('hud-hidden');
  },

  revealHUD() {
    this.elements.prompterTopHud.classList.remove('hud-hidden');
    this.elements.prompterBottomHud.classList.remove('hud-hidden');
    if (PrompterEngine.isPlaying) {
      PrompterEngine.scheduleAutoHide();
    }
  },

  toggleDistractionFree() {
    const isHidden = this.elements.prompterTopHud.classList.contains('hud-hidden');
    if (isHidden) {
      this.revealHUD();
    } else {
      this.hideHUD();
      this.flashCue('DISTRACTION FREE');
    }
  },

  flashCue(text) {
    this.elements.tapCueText.textContent = text;
    this.elements.prompterTapCue.classList.remove('hidden');
    
    // Clear previous timer
    if (this.flashCueTimer) clearTimeout(this.flashCueTimer);
    this.flashCueTimer = setTimeout(() => {
      this.elements.prompterTapCue.classList.add('hidden');
    }, 900);
  },

  // ==========================================================================
  // SETTINGS & SMART EYE CONTACT GEOMETRY
  // ==========================================================================

  applySettingsToDOM(settings) {
    const root = document.documentElement;

    // Apply Geometry
    const widthMap = {
      compact: '360px',
      medium: '540px',
      full: '100%'
    };
    root.style.setProperty('--prompter-max-width', widthMap[settings.readingWidth] || '360px');
    root.style.setProperty('--prompter-reading-offset', `${settings.verticalOffset || 120}px`);

    // Camera Anchor Alignment
    const anchor = settings.cameraAnchor || 'center';
    this.elements.cameraGuide.className = `camera-guide anchor-${anchor}`;
    if (anchor === 'left') {
      root.style.setProperty('--prompter-anchor-margin', '0 auto 0 1rem');
    } else if (anchor === 'right') {
      root.style.setProperty('--prompter-anchor-margin', '0 1rem 0 auto');
    } else {
      root.style.setProperty('--prompter-anchor-margin', 'auto');
    }

    // Toggle Camera Lens Guide Cue
    this.elements.cameraGuide.classList.toggle('hidden', !settings.showCameraGuide);

    // Toggle Reading Zone Focus Line
    this.elements.prompterFocusLine.classList.toggle('hidden', !settings.showReadingLine);

    // Typography
    root.style.setProperty('--prompter-font-size', `${settings.fontSize || 32}px`);
    root.style.setProperty('--prompter-line-height', `${settings.lineHeight || 1.6}`);
    root.style.setProperty('--prompter-text-align', settings.textAlign || 'center');

    // Sync Speed
    if (settings.scrollSpeed) {
      PrompterEngine.setSpeed(settings.scrollSpeed);
      this.elements.speedLabel.textContent = PrompterEngine.scrollSpeed.toFixed(1);
    }
  },

  syncSettingsModalControls(settings) {
    // Segmented: Reading Width
    document.querySelectorAll('[data-width]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.width === settings.readingWidth);
    });
    const widthNames = { compact: 'Compact (360px)', medium: 'Standard (540px)', full: 'Full Screen' };
    this.elements.settingWidthDisplay.textContent = widthNames[settings.readingWidth] || 'Compact (360px)';

    // Segmented: Camera Anchor
    document.querySelectorAll('[data-anchor]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.anchor === settings.cameraAnchor);
    });
    const anchorNames = { left: 'Top Left', center: 'Top Center', right: 'Top Right' };
    this.elements.settingAnchorDisplay.textContent = anchorNames[settings.cameraAnchor] || 'Top Center';

    // Range: Vertical Offset
    this.elements.settingVerticalOffset.value = settings.verticalOffset;
    this.elements.settingOffsetDisplay.textContent = `${settings.verticalOffset}px`;

    // Toggles
    this.elements.settingCameraGuide.checked = !!settings.showCameraGuide;
    this.elements.settingFocusLine.checked = !!settings.showReadingLine;
    this.elements.settingAutoHide.checked = !!settings.autoHideControls;

    // Range: Typography
    this.elements.settingFontSize.value = settings.fontSize;
    this.elements.settingFontSizeVal.textContent = `${settings.fontSize}px`;
    this.elements.settingLineHeight.value = settings.lineHeight;
    this.elements.settingLineHeightVal.textContent = `${settings.lineHeight}x`;

    // Segmented: Text Align
    document.querySelectorAll('[data-align]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.align === settings.textAlign);
    });
    this.elements.settingAlignDisplay.textContent = settings.textAlign.charAt(0).toUpperCase() + settings.textAlign.slice(1);
  },

  openSettingsModal() {
    PrompterEngine.pause();
    const settings = SettingsStore.getSettings();
    this.syncSettingsModalControls(settings);
    this.elements.modalSettings.classList.remove('hidden');
  },

  closeSettingsModal() {
    this.elements.modalSettings.classList.add('hidden');
  },

  saveSettingsFromModal() {
    const current = SettingsStore.getSettings();

    // Get active width
    const activeWidthBtn = document.querySelector('[data-width].active');
    const readingWidth = activeWidthBtn ? activeWidthBtn.dataset.width : current.readingWidth;

    // Get active anchor
    const activeAnchorBtn = document.querySelector('[data-anchor].active');
    const cameraAnchor = activeAnchorBtn ? activeAnchorBtn.dataset.anchor : current.cameraAnchor;

    // Get active alignment
    const activeAlignBtn = document.querySelector('[data-align].active');
    const textAlign = activeAlignBtn ? activeAlignBtn.dataset.align : current.textAlign;

    const newSettings = {
      readingWidth,
      cameraAnchor,
      verticalOffset: parseInt(this.elements.settingVerticalOffset.value, 10),
      showCameraGuide: this.elements.settingCameraGuide.checked,
      showReadingLine: this.elements.settingFocusLine.checked,
      autoHideControls: this.elements.settingAutoHide.checked,
      fontSize: parseInt(this.elements.settingFontSize.value, 10),
      lineHeight: parseFloat(this.elements.settingLineHeight.value),
      textAlign
    };

    const saved = SettingsStore.saveSettings(newSettings);
    this.applySettingsToDOM(saved);
    this.closeSettingsModal();
    this.showToast('Prompter settings updated');
  },

  // ==========================================================================
  // DELETE MODAL
  // ==========================================================================

  openDeleteModal(scriptId, scriptTitle) {
    this.scriptPendingDeleteId = scriptId;
    this.elements.deleteScriptTitle.textContent = `"${scriptTitle || 'Untitled Script'}"`;
    this.elements.modalDelete.classList.remove('hidden');
  },

  closeDeleteModal() {
    this.scriptPendingDeleteId = null;
    this.elements.modalDelete.classList.add('hidden');
  },

  confirmDelete() {
    if (this.scriptPendingDeleteId) {
      ScriptStore.deleteScript(this.scriptPendingDeleteId);
      this.closeDeleteModal();
      this.renderScriptList();
      this.showToast('Script deleted');
    }
  },

  // ==========================================================================
  // EVENT WIRING
  // ==========================================================================

  bindEvents() {
    // Top-Level Library Events
    this.elements.btnNewScript.addEventListener('click', () => {
      this.navigateTo('editor');
    });

    this.elements.btnEmptyCreate.addEventListener('click', () => {
      this.navigateTo('editor');
    });

    this.elements.btnRestoreSample.addEventListener('click', () => {
      ScriptStore.restoreSample();
      this.renderScriptList();
      this.showToast('Sample script restored');
    });

    // Search events
    this.elements.searchInput.addEventListener('input', () => {
      const val = this.elements.searchInput.value;
      this.elements.btnClearSearch.classList.toggle('hidden', val.length === 0);
      this.renderScriptList();
    });

    this.elements.btnClearSearch.addEventListener('click', () => {
      this.elements.searchInput.value = '';
      this.elements.btnClearSearch.classList.add('hidden');
      this.renderScriptList();
    });

    // Editor Events
    this.elements.btnEditorBack.addEventListener('click', () => {
      this.navigateTo('library');
    });

    this.elements.btnEditorSave.addEventListener('click', () => {
      this.saveCurrentEditorScript();
    });

    this.elements.btnEditorPrompt.addEventListener('click', () => {
      const saved = this.saveCurrentEditorScript();
      if (saved) {
        this.navigateTo('prompter', { scriptId: saved.id });
      }
    });

    this.elements.editorTitle.addEventListener('input', () => {
      this.elements.editorSaveStatus.textContent = 'Unsaved changes';
      this.elements.editorSaveStatus.classList.add('unsaved');
    });

    this.elements.editorBody.addEventListener('input', () => {
      this.updateEditorStats();
      this.elements.editorSaveStatus.textContent = 'Unsaved changes';
      this.elements.editorSaveStatus.classList.add('unsaved');
    });

    // Prompter Events
    this.elements.btnPrompterBack.addEventListener('click', () => {
      PrompterEngine.pause();
      this.navigateTo('library');
    });

    this.elements.btnPrompterRestart.addEventListener('click', () => {
      PrompterEngine.restart();
    });

    this.elements.btnPrompterPlay.addEventListener('click', (e) => {
      e.stopPropagation();
      PrompterEngine.togglePlay();
    });

    // Speed Step Buttons
    this.elements.btnSpeedDown.addEventListener('click', (e) => {
      e.stopPropagation();
      const current = PrompterEngine.scrollSpeed;
      const updated = PrompterEngine.setSpeed(current - 0.5);
      this.elements.speedLabel.textContent = updated.toFixed(1);
      SettingsStore.saveSettings({ scrollSpeed: updated });
      this.flashCue(`SPEED ${updated.toFixed(1)}x`);
    });

    this.elements.btnSpeedUp.addEventListener('click', (e) => {
      e.stopPropagation();
      const current = PrompterEngine.scrollSpeed;
      const updated = PrompterEngine.setSpeed(current + 0.5);
      this.elements.speedLabel.textContent = updated.toFixed(1);
      SettingsStore.saveSettings({ scrollSpeed: updated });
      this.flashCue(`SPEED ${updated.toFixed(1)}x`);
    });

    this.elements.btnToggleHud.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDistractionFree();
    });

    this.elements.btnPrompterSettings.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openSettingsModal();
    });

    // Tap on Prompter Viewport:
    // If HUD is hidden, tap reveals HUD.
    // If HUD is visible, tap toggles play/pause.
    this.elements.prompterViewport.addEventListener('click', (e) => {
      // Don't trigger if click was on a button or interactive element
      if (e.target.closest('button, .prompter-hud, .modal-backdrop')) return;

      const isHudHidden = this.elements.prompterTopHud.classList.contains('hud-hidden');
      if (isHudHidden) {
        this.revealHUD();
      } else {
        PrompterEngine.togglePlay();
      }
    });

    // Settings Modal Interactive Controls
    this.elements.btnCloseSettings.addEventListener('click', () => this.closeSettingsModal());
    this.elements.btnSaveSettings.addEventListener('click', () => this.saveSettingsFromModal());

    this.elements.btnResetSettings.addEventListener('click', () => {
      const defaults = SettingsStore.resetDefaults();
      this.syncSettingsModalControls(defaults);
      this.applySettingsToDOM(defaults);
      this.showToast('Settings reset to default');
    });

    // Segmented Buttons in Settings
    document.querySelectorAll('.segmented-control').forEach(group => {
      group.addEventListener('click', (e) => {
        const btn = e.target.closest('.segment-btn');
        if (!btn) return;
        group.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Dynamic updates for immediate feedback
        if (btn.dataset.width) {
          const names = { compact: 'Compact (360px)', medium: 'Standard (540px)', full: 'Full Screen' };
          this.elements.settingWidthDisplay.textContent = names[btn.dataset.width];
        } else if (btn.dataset.anchor) {
          const names = { left: 'Top Left', center: 'Top Center', right: 'Top Right' };
          this.elements.settingAnchorDisplay.textContent = names[btn.dataset.anchor];
        } else if (btn.dataset.align) {
          this.elements.settingAlignDisplay.textContent = btn.dataset.align.charAt(0).toUpperCase() + btn.dataset.align.slice(1);
        }
      });
    });

    // Sliders in Settings
    this.elements.settingVerticalOffset.addEventListener('input', (e) => {
      this.elements.settingOffsetDisplay.textContent = `${e.target.value}px`;
    });

    this.elements.settingFontSize.addEventListener('input', (e) => {
      this.elements.settingFontSizeVal.textContent = `${e.target.value}px`;
    });

    this.elements.settingLineHeight.addEventListener('input', (e) => {
      this.elements.settingLineHeightVal.textContent = `${parseFloat(e.target.value).toFixed(1)}x`;
    });

    // Delete Modal Events
    this.elements.btnCloseDelete.addEventListener('click', () => this.closeDeleteModal());
    this.elements.btnCancelDelete.addEventListener('click', () => this.closeDeleteModal());
    this.elements.btnConfirmDelete.addEventListener('click', () => this.confirmDelete());
  },

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  calcTextStats(text) {
    const trimmed = text.trim();
    if (!trimmed) {
      return { words: 0, chars: 0, readTime: '~0s' };
    }
    const words = trimmed.split(/\s+/).filter(Boolean).length;
    const chars = trimmed.length;

    // Average speaking speed: ~130 words per minute (2.16 words per sec)
    const totalSeconds = Math.round((words / 130) * 60);
    let readTime = '';
    if (totalSeconds < 60) {
      readTime = `~${totalSeconds}s`;
    } else {
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      readTime = secs > 0 ? `~${mins}m ${secs}s` : `~${mins}m`;
    }

    return { words, chars, readTime };
  },

  formatDate(timestamp) {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = now - timestamp;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) return 'Just now';
    if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
    if (diff < day) return `${Math.floor(diff / hour)}h ago`;
    
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  },

  escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  showToast(message) {
    const toast = this.elements.toast;
    toast.textContent = message;
    toast.classList.remove('hidden');

    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2400);
  }
};

// ============================================================================
// 6. INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  UIController.init();
});
