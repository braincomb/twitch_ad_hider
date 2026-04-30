/**
 * Twitch Ad Hider - Firefox Extension
 * Automatically mutes Twitch streams during advertisements using browser.tabs API
 */

// Firefox provides the browser global

// Configuration constants
const CONFIG = {
  CHECK_INTERVAL_MS: 1000,
  AD_LABEL_SELECTOR: '[data-a-target="video-ad-label"]',
  AD_COUNTDOWN_SELECTOR: '[data-a-target="video-ad-countdown"]',
  VIDEO_CONTAINER_SELECTOR: '.video-player__container',
  PLAYER_CONTROLS_SELECTOR: '[data-a-target="player-controls"]',
  OVERLAY_ID: 'twitch-ad-muter-overlay',
  OVERLAY_Z_INDEX: 9000,      // Z-index for our overlay
  CONTROLS_Z_INDEX: 10000,    // Higher z-index for player controls
  DEBUG: true // Set to false to disable debug logging
};

// State variables
let state = {
  tabId: null,         // Current tab ID
  userMuted: false,    // User manually muted the tab
  prevMuted: false,    // Tab was previously muted by extension
  adMuted: false,      // Whether we muted due to an ad
  overlayActive: false, // Whether the overlay is currently shown
  oldUrl: window.location.href,
  tabTitle: document.title,
  originalTabTitle: null,
  titleUpdateInterval: null,
  stateInitialized: false, // Whether we've loaded state from storage
  errorCount: 0,       // Count of consecutive errors
  lastAdCheck: 0       // Timestamp of last ad check
};

function getBaseTabTitle(title) {
  if (!title) return '';
  return title
    .replace(/^Ad:\s*[^-]+\s*-\s*/i, '')
    .replace(/^Ad\s*\([^)]*\)\s*-\s*/i, '')
    .replace(/^Ad\s*-\s*/i, '');
}

function getAdCountdownText() {
  const countdownElement = document.querySelector(CONFIG.AD_COUNTDOWN_SELECTOR);
  if (!countdownElement) return '';
  return (countdownElement.textContent || '').trim();
}

function updateAdTabTitle() {
  if (!state.adMuted) return;

  if (!state.originalTabTitle) {
    state.originalTabTitle = getBaseTabTitle(document.title);
  }

  const countdownText = getAdCountdownText();
  const prefix = countdownText ? `${countdownText} - ` : 'Ad - ';
  const nextTitle = `${prefix}${state.originalTabTitle}`;

  if (document.title !== nextTitle) {
    document.title = nextTitle;
  }
}

function startAdTabTitleUpdates() {
  if (!state.adMuted) return;
  if (state.titleUpdateInterval) return;
  if (!state.originalTabTitle) {
    state.originalTabTitle = getBaseTabTitle(document.title);
  }
  updateAdTabTitle();
  state.titleUpdateInterval = setInterval(updateAdTabTitle, 500);
}

function stopAdTabTitleUpdates() {
  if (state.titleUpdateInterval) {
    clearInterval(state.titleUpdateInterval);
    state.titleUpdateInterval = null;
  }

  if (state.originalTabTitle) {
    const currentTitle = document.title || '';
    const currentBase = getBaseTabTitle(currentTitle);
    if (currentTitle !== state.originalTabTitle && currentBase === state.originalTabTitle) {
      document.title = state.originalTabTitle;
    }
  }

  state.originalTabTitle = null;
}

// Storage utilities
const storage = {
  async loadUserMuteState() {
    if (!state.tabId) return false;
    
    try {
      const isMuted = await browser.runtime.sendMessage({
        action: 'getUserMuteState',
        tabId: state.tabId
      });
      logger.debug(`Loaded user mute state from storage: ${isMuted}`);
      return isMuted;
    } catch (error) {
      logger.error(`Failed to load user mute state: ${error.message}`);
      return false;
    }
  },
  
  async saveUserMuteState(isMuted) {
    if (!state.tabId) return;
    
    try {
      await browser.runtime.sendMessage({
        action: 'saveUserMuteState',
        tabId: state.tabId,
        isMuted: isMuted
      });
      logger.debug(`Saved user mute state to storage: ${isMuted}`);
    } catch (error) {
      logger.error(`Failed to save user mute state: ${error.message}`);
    }
  }
};

// Create overlay elements to be used later
let adOverlay = null;
let adTimerElement = null;
let timerUpdateInterval = null;

// Logging utilities
const logger = {
  debug: (message) => {
    if (CONFIG.DEBUG) console.debug(`[Twitch Ad Hider] ${message}`);
  },
  info: (message) => console.info(`[Twitch Ad Hider] ${message}`),
  error: (message) => console.error(`[Twitch Ad Hider] ${message}`)
};

/**
 * Get the current tab ID
 * @returns {Promise<number>} - The tab ID
 */
async function getCurrentTabId() {
  try {
    // We need to send a message to the background script to get the tab ID
    // since content scripts don't have direct access to the tabs API
    return await browser.runtime.sendMessage({ action: 'getTabId' });
  } catch (error) {
    logger.error(`Failed to get tab ID: ${error.message}`);
    return null;
  }
}

/**
 * Updates URL and handles page navigation
 * @returns {Promise<void>}
 */
async function updateUrl() { 
  const newUrl = window.location.href;
  if (newUrl !== state.oldUrl) {
    logger.debug(`URL changed to ${newUrl}`);
    state.oldUrl = newUrl;
    state.tabTitle = getBaseTabTitle(document.title);
    if (!state.adMuted) {
      state.originalTabTitle = null;
    }
  }
  return Promise.resolve();
}

/**
 * Mute the current tab
 * @param {boolean} isAdMute - Whether this mute is due to an ad (true) or user preference (false)
 * @returns {Promise<boolean>} - Whether the mute was successful
 */
async function muteTab(isAdMute = true) {
  if (!state.tabId) {
    state.tabId = await getCurrentTabId();
    if (!state.tabId) {
      logger.error('Could not get tab ID');
      return false;
    }
  }

  try {
    const result = await browser.runtime.sendMessage({
      action: 'muteTab',
      tabId: state.tabId
    });
    
    if (result) {
      if (isAdMute) {
        state.adMuted = true;
        state.prevMuted = true;
        logger.info(`Tab muted due to ad: ${state.tabTitle}`);
      } else {
        logger.info(`Tab muted due to user preference: ${state.tabTitle}`);
      }
      return true;
    } else {
      logger.error('Mute command returned false');
      return false;
    }
  } catch (error) {
    logger.error(`Failed to mute tab: ${error.message}`);
    return false;
  }
}

/**
 * Unmute the current tab
 * @returns {Promise<boolean>} - Whether the unmute was successful
 */
async function unmuteTab() {
  if (!state.tabId) {
    state.tabId = await getCurrentTabId();
    if (!state.tabId) {
      logger.error('Could not get tab ID');
      return false;
    }
  }

  try {
    const result = await browser.runtime.sendMessage({
      action: 'unmuteTab',
      tabId: state.tabId
    });
    
    if (result) {
      state.prevMuted = false;
      state.adMuted = false;
      logger.info(`Tab unmuted after ad: ${state.tabTitle}`);
      return true;
    } else {
      logger.error('Unmute command returned false');
      return false;
    }
  } catch (error) {
    logger.error(`Failed to unmute tab: ${error.message}`);
    return false;
  }
}

/**
 * Checks if an ad is currently playing
 * @returns {boolean} - True if ad is playing, false otherwise
 */
function isAdPlaying() {
  return document.querySelector(CONFIG.AD_LABEL_SELECTOR) !== null;
}

/**
 * Creates and shows a black overlay on top of the video player
 */
function showAdOverlay() {
  // If overlay is already active, don't create another one
  if (state.overlayActive) {
    return;
  }
  
  // Find the video container
  const videoContainer = document.querySelector(CONFIG.VIDEO_CONTAINER_SELECTOR);
  if (!videoContainer) {
    logger.error('Could not find video container to add overlay');
    return;
  }
  
  // Create the overlay if it doesn't exist
  if (!adOverlay) {
    adOverlay = document.createElement('div');
    adOverlay.id = CONFIG.OVERLAY_ID;
    adOverlay.style.position = 'absolute';
    adOverlay.style.top = '0';
    adOverlay.style.left = '0';
    adOverlay.style.width = '100%';
    adOverlay.style.height = '100%';
    adOverlay.style.backgroundColor = 'black';
    adOverlay.style.zIndex = CONFIG.OVERLAY_Z_INDEX;
    adOverlay.style.display = 'flex';
    adOverlay.style.flexDirection = 'column';
    adOverlay.style.justifyContent = 'center';
    adOverlay.style.alignItems = 'center';
    adOverlay.style.color = 'white';
    adOverlay.style.fontFamily = 'Arial, sans-serif';
    
    // Create main message
    const messageElement = document.createElement('div');
    messageElement.textContent = 'Ad Muted';
    messageElement.style.fontSize = '24px';
    messageElement.style.marginBottom = '10px';
    adOverlay.appendChild(messageElement);
    
    // Create timer element
    adTimerElement = document.createElement('div');
    adTimerElement.style.fontSize = '16px';
    adTimerElement.style.color = '#9147ff'; // Twitch purple
    adTimerElement.textContent = 'Loading ad time...';
    adOverlay.appendChild(adTimerElement);
  }
  
  // Add the overlay to the video container
  videoContainer.style.position = 'relative'; // Ensure container is positioned
  videoContainer.appendChild(adOverlay);
  state.overlayActive = true;
  
  // Ensure player controls are above our overlay
  ensureControlsVisible();
  
  // Start updating the timer
  updateAdTimer();
  timerUpdateInterval = setInterval(updateAdTimer, 500); // Update twice per second
  
  logger.info('Ad overlay shown');
}

/**
 * Removes the black overlay from the video player
 */
function hideAdOverlay() {
  // If overlay is not active, nothing to do
  if (!state.overlayActive || !adOverlay) {
    return;
  }
  
  // Remove the overlay
  adOverlay.remove();
  state.overlayActive = false;
  
  // Stop updating the timer
  if (timerUpdateInterval) {
    clearInterval(timerUpdateInterval);
    timerUpdateInterval = null;
  }
  
  logger.info('Ad overlay hidden');
}

/**
 * Ensures player controls remain visible and accessible above the overlay
 */
function ensureControlsVisible() {
  // Find the player controls
  const playerControls = document.querySelector(CONFIG.PLAYER_CONTROLS_SELECTOR);
  
  if (playerControls) {
    // Increase z-index to be above our overlay
    playerControls.style.zIndex = CONFIG.CONTROLS_Z_INDEX;
    playerControls.style.position = 'relative'; // Ensure positioning context
  } else {
    logger.error('Could not find player controls');
  }
}

/**
 * Updates the ad countdown timer in the overlay
 */
function updateAdTimer() {
  if (!adTimerElement || !state.overlayActive) {
    return;
  }
  
  // Find the ad countdown element on the page
  const countdownElement = document.querySelector(CONFIG.AD_COUNTDOWN_SELECTOR);
  
  if (countdownElement) {
    // Extract the countdown text
    const countdownText = countdownElement.textContent.trim();
    
    // Update our timer display
    adTimerElement.textContent = `Time remaining: ${countdownText}`;
    if (state.adMuted) {
      updateAdTabTitle();
    }
  } else {
    adTimerElement.textContent = '';
  }
}

/**
 * Check if the tab is currently muted
 * @returns {Promise<boolean>} - True if muted, false otherwise
 */
async function isTabMuted() {
  if (!state.tabId) {
    state.tabId = await getCurrentTabId();
    if (!state.tabId) {
      logger.error('Could not get tab ID');
      return false;
    }
  }

  try {
    const tabInfo = await browser.runtime.sendMessage({
      action: 'getTabInfo',
      tabId: state.tabId
    });
    return tabInfo && tabInfo.mutedInfo && tabInfo.mutedInfo.muted;
  } catch (error) {
    logger.error(`Failed to check tab mute status: ${error.message}`);
    return false;
  }
}

/**
 * Main function that handles muting/unmuting based on ad presence
 * @returns {Promise<void>}
 */
async function main() {
  // Get the tab ID if we don't have it yet
  if (!state.tabId) {
    state.tabId = await getCurrentTabId();
    if (!state.tabId) {
      logger.error('Could not get tab ID in main loop');
      return Promise.resolve();
    }
  }
  
  // Load user mute state from storage if not initialized
  if (!state.stateInitialized) {
    state.userMuted = await storage.loadUserMuteState();
    state.stateInitialized = true;
    logger.info(`Initialized user mute state from storage: ${state.userMuted}`);
  }
  
  // Check if the tab is currently muted
  const currentlyMuted = await isTabMuted();
  
  // Detect if user manually muted the tab (and we didn't do it)
  if (!state.userMuted && currentlyMuted && !state.prevMuted && !state.adMuted) {
    state.userMuted = true;
    await storage.saveUserMuteState(true);
    logger.debug(`Detected user manually muted tab, saved preference`);
  }
  
  // Check if an ad is playing
  const adIsPlaying = isAdPlaying();
  
  // CASE 1: Ad starts playing and tab is not muted by extension
  if (adIsPlaying && !state.adMuted) {
    logger.info(`Ad detected on ${state.tabTitle}. Muting tab.`);
    
    // Force mute regardless of current state
    const muteSuccess = await muteTab(true);
    
    if (muteSuccess) {
      state.originalTabTitle = getBaseTabTitle(document.title);
      startAdTabTitleUpdates();
      // Show overlay only if mute was successful
      showAdOverlay();
    }
  }
  // CASE 2: Ad finishes and tab was muted by extension
  else if (!adIsPlaying && state.adMuted) {
    // If user had manually muted before, don't unmute
    if (state.userMuted) {
      logger.info(`Ad finished but keeping tab muted due to user preference`);
      state.adMuted = false;
      // Keep prevMuted true since we're still muted
      
      // Just hide the overlay
      hideAdOverlay();
      stopAdTabTitleUpdates();
    } else {
      logger.info(`Ad finished on ${state.tabTitle}. Unmuting tab.`);
      const unmuteSuccess = await unmuteTab();
      
      // Always hide overlay regardless of unmute success
      hideAdOverlay();
      stopAdTabTitleUpdates();
    }
  }
  // CASE 3: Ensure overlay matches ad state
  else if (adIsPlaying && !state.overlayActive) {
    // Ad is playing but overlay isn't shown
    startAdTabTitleUpdates();
    showAdOverlay();
    
    // Double-check mute state
    if (!currentlyMuted && !state.userMuted) {
      await muteTab(true);
    }
  }
  else if (!adIsPlaying && state.overlayActive) {
    // No ad but overlay is shown
    hideAdOverlay();
    stopAdTabTitleUpdates();
    
    // Double-check unmute if needed
    if (currentlyMuted && state.adMuted && !state.userMuted) {
      await unmuteTab();
    }
  }
  
  return Promise.resolve();
}

/**
 * Initialize the extension
 */
async function initialize() {
  logger.info("Twitch Ad Hider initialized");
  
  // Get the tab ID on initialization
  state.tabId = await getCurrentTabId();
  if (!state.tabId) {
    logger.error('Could not get tab ID during initialization');
    // Retry getting tab ID after a short delay
    setTimeout(initialize, 1000);
    return;
  } else {
    logger.debug(`Tab ID: ${state.tabId}`);
  }
  
  // Load initial user mute preference
  state.userMuted = await storage.loadUserMuteState();
  state.stateInitialized = true;
  
  // Check initial mute state
  const initiallyMuted = await isTabMuted();
  if (initiallyMuted && !state.userMuted) {
    // If tab is muted but not by user preference, check if it's an ad
    const adIsPlaying = isAdPlaying();
    if (adIsPlaying) {
      state.adMuted = true;
      state.prevMuted = true;
      state.originalTabTitle = getBaseTabTitle(document.title);
      startAdTabTitleUpdates();
      showAdOverlay();
    } else {
      // If muted but no ad, assume user preference
      state.userMuted = true;
      await storage.saveUserMuteState(true);
    }
  }
  
  // Set up the main interval with error handling
  const mainLoop = setInterval(async () => {
    try {
      await updateUrl();
      await main();
    } catch (error) {
      logger.error(`Error in main loop: ${error.message}`);
      // If we get too many errors, slow down the polling to avoid flooding
      if (++state.errorCount > 5) {
        logger.warn('Too many errors, slowing down polling rate');
        clearInterval(mainLoop);
        setTimeout(() => {
          state.errorCount = 0;
          initialize(); // Reinitialize with fresh state
        }, 5000);
      }
    }
  }, CONFIG.CHECK_INTERVAL_MS);
  
  // Listen for messages from the background script
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === 'tabMutedExternally') {
      // Only update userMuted if this was a user-initiated change
      if (message.isUserInitiated) {
        state.userMuted = message.muted;
        // Save the user preference
        storage.saveUserMuteState(message.muted);
        logger.info(`User ${message.muted ? 'muted' : 'unmuted'} tab externally`);
        
        // If user unmuted while we thought it should be muted for an ad
        if (!message.muted && state.adMuted) {
          // User wants to hear the ad, respect that
          state.adMuted = false;
          logger.info('User unmuted during ad, respecting preference');
        }
      } else {
        logger.debug(`Tab mute state changed by extension: ${message.muted ? 'Muted' : 'Unmuted'}`);
      }
    }
    return Promise.resolve();
  });
}

// Start the extension
initialize();
