/**
 * Twitch Ad Muter - Firefox Extension
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
  tabTitle: document.title
};

// Create overlay elements to be used later
let adOverlay = null;
let adTimerElement = null;
let timerUpdateInterval = null;

// Logging utilities
const logger = {
  debug: (message) => {
    if (CONFIG.DEBUG) console.debug(`[Twitch Ad Muter] ${message}`);
  },
  info: (message) => console.info(`[Twitch Ad Muter] ${message}`),
  error: (message) => console.error(`[Twitch Ad Muter] ${message}`)
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
    state.tabTitle = document.title;
  }
  return Promise.resolve();
}

/**
 * Mute the current tab
 * @returns {Promise<void>}
 */
async function muteTab() {
  if (!state.tabId) {
    state.tabId = await getCurrentTabId();
    if (!state.tabId) {
      logger.error('Could not get tab ID');
      return;
    }
  }

  try {
    await browser.runtime.sendMessage({
      action: 'muteTab',
      tabId: state.tabId
    });
    state.prevMuted = true;
    logger.info(`Tab muted due to ad: ${state.tabTitle}`);
  } catch (error) {
    logger.error(`Failed to mute tab: ${error.message}`);
  }
}

/**
 * Unmute the current tab
 * @returns {Promise<void>}
 */
async function unmuteTab() {
  if (!state.tabId) {
    state.tabId = await getCurrentTabId();
    if (!state.tabId) {
      logger.error('Could not get tab ID');
      return;
    }
  }

  try {
    await browser.runtime.sendMessage({
      action: 'unmuteTab',
      tabId: state.tabId
    });
    state.prevMuted = false;
    logger.info(`Tab unmuted after ad: ${state.tabTitle}`);
  } catch (error) {
    logger.error(`Failed to unmute tab: ${error.message}`);
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
    logger.debug('Player controls z-index increased for visibility');
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
  // Check if the tab is already muted by the user
  const currentlyMuted = await isTabMuted();
  
  // Track the user's mute preference but don't let it block our ad-related actions
  if (state.userMuted === false && currentlyMuted && !state.prevMuted) {
    // Only consider it user-muted if we didn't mute it ourselves and it's currently muted
    state.userMuted = true;
    logger.debug('Tab was already muted by user');
  }
  
  const adIsPlaying = isAdPlaying();
  
  // Mute when ad starts playing
  if (adIsPlaying && !state.prevMuted) {
    logger.info(`Ad detected on ${state.tabTitle}. Muting tab.`);
    await muteTab();
    // Remember that we muted because of an ad, not user preference
    state.adMuted = true;
    
    // Show the black overlay
    showAdOverlay();
  }
  // Unmute when ad finishes, but only if we muted it for an ad
  else if (!adIsPlaying && state.prevMuted && state.adMuted) {
    logger.info(`Ad finished on ${state.tabTitle}. Unmuting tab.`);
    await unmuteTab();
    state.adMuted = false;
    
    // Hide the black overlay
    hideAdOverlay();
    
    // If user had manually muted before, restore that state
    if (state.userMuted) {
      logger.debug(`Restoring user's mute preference`);
      await muteTab();
    }
  }
  // Handle case where overlay might be out of sync with ad state
  else if (adIsPlaying && !state.overlayActive) {
    showAdOverlay();
  }
  else if (!adIsPlaying && state.overlayActive) {
    hideAdOverlay();
  }
  
  return Promise.resolve();
}

/**
 * Initialize the extension
 */
async function initialize() {
  logger.info("Twitch Ad Muter initialized");
  
  // Get the tab ID on initialization
  state.tabId = await getCurrentTabId();
  if (!state.tabId) {
    logger.error('Could not get tab ID during initialization');
  } else {
    logger.debug(`Tab ID: ${state.tabId}`);
  }
  
  // Set up the main interval
  setInterval(async () => {
    try {
      await updateUrl();
      await main();
    } catch (error) {
      logger.error(`Error in main loop: ${error.message}`);
    }
  }, CONFIG.CHECK_INTERVAL_MS);
  
  // Listen for messages from the background script
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === 'tabMutedExternally') {
      state.userMuted = message.muted;
      logger.debug(`Tab mute state changed externally: ${message.muted}`);
    }
    return Promise.resolve();
  });
}

// Start the extension
initialize();
