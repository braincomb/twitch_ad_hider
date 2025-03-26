/**
 * Twitch Ad Muter - Firefox Extension
 * Automatically mutes Twitch streams during advertisements using browser.tabs API
 */

// Import the browser polyfill for cross-browser compatibility
import browser from 'webextension-polyfill';

// Configuration constants
const CONFIG = {
  CHECK_INTERVAL_MS: 1000,
  AD_LABEL_SELECTOR: '[data-a-target="video-ad-label"]',
  DEBUG: true // Set to false to disable debug logging
};

// State variables
let state = {
  tabId: null,         // Current tab ID
  userMuted: false,    // User manually muted the tab
  prevMuted: false,    // Tab was previously muted by extension
  oldUrl: window.location.href,
  tabTitle: document.title
};

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
  
  // If this is the first time we're checking, initialize userMuted state
  if (state.userMuted === false && currentlyMuted) {
    state.userMuted = true;
    logger.debug('Tab was already muted by user');
  }
  
  // Don't interfere if user has manually muted the tab
  if (state.userMuted) {
    logger.debug(`User has manually muted tab ${state.tabTitle}`);
    return Promise.resolve();
  }
  
  const adIsPlaying = isAdPlaying();
  
  // Mute when ad starts playing
  if (adIsPlaying && !state.prevMuted) {
    logger.info(`Ad detected on ${state.tabTitle}. Muting tab.`);
    await muteTab();
  }
  // Unmute when ad finishes
  else if (!adIsPlaying && state.prevMuted) {
    logger.info(`Ad finished on ${state.tabTitle}. Unmuting tab.`);
    await unmuteTab();
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
