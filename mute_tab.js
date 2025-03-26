/**
 * Twitch Ad Muter - Firefox Extension
 * Automatically mutes Twitch streams during advertisements
 */

// Configuration constants
const CONFIG = {
  CHECK_INTERVAL_MS: 1000,
  MUTE_BUTTON_SELECTOR: '[data-a-target="player-mute-unmute-button"]',
  AD_LABEL_SELECTOR: '[data-a-target="video-ad-label"]',
  UNMUTED_BUTTON_LABEL: "Unmute (m)",
  DEBUG: true // Set to false to disable debug logging
};

// State variables
let state = {
  userMuted: false,      // User manually muted the stream
  prevMuted: false,      // Stream was previously muted by extension
  initStatus: false,     // Initial mute status when page loads
  oldUrl: window.location.href,
  tabTitle: document.title
};

// DOM elements
let muteButton = document.querySelector(CONFIG.MUTE_BUTTON_SELECTOR);

// Logging utilities
const logger = {
  debug: (message) => {
    if (CONFIG.DEBUG) console.debug(`[Twitch Ad Muter] ${message}`);
  },
  info: (message) => console.info(`[Twitch Ad Muter] ${message}`),
  error: (message) => console.error(`[Twitch Ad Muter] ${message}`)
};

// Initialize
if (!muteButton) {
  logger.error(`Cannot find mute button on ${state.tabTitle}`);
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
    
    // When a user changes channels, the page finishes loading first before
    // the mute button element is present. We have to wait before we can
    // check the status of the mute button.
    setTimeout(updateMuteButton, CONFIG.CHECK_INTERVAL_MS);
  }
  return Promise.resolve();
}
/**
 * Updates the mute button reference and adds event listeners
 */
function updateMuteButton() {
  logger.debug("Looking for new mute button");
  
  // If the user visited a previous channel in this tab, we need to remove the previous
  // mute button event listener.
  if (muteButton) {
    muteButton.removeEventListener("click", updateUserMuted);
  }
  
  muteButton = document.querySelector(CONFIG.MUTE_BUTTON_SELECTOR);
  
  if (muteButton) {
    state.initStatus = isButtonMuted(muteButton);
    logger.debug(`Initial mute status = ${state.initStatus}`);
    muteButton.addEventListener("click", updateUserMuted);
  } else {
    logger.error(`Cannot find mute button on ${state.tabTitle}`);
    // Retry after a delay if we're on a Twitch page but button isn't found yet
    if (window.location.href.includes('twitch.tv')) {
      setTimeout(updateMuteButton, CONFIG.CHECK_INTERVAL_MS);
    }
  }
}

/**
 * Updates the user muted state when the mute button is clicked
 * @param {Event} event - Click event
 */
function updateUserMuted(event) {
  logger.debug("isTrusted = " + event.isTrusted);
  
  if (!event.isTrusted) {
    logger.debug("Not a user click. Ignoring.");
    return;
  }
  
  if (isButtonMuted(muteButton)) {
    logger.debug(`User unmuted stream on ${state.tabTitle}`);
    state.userMuted = false;
    state.initStatus = false;
  } else {
    logger.info(`User muted stream on ${state.tabTitle}`);
    state.userMuted = true;
  }
}

/**
 * Initialize the extension
 */
function initialize() {
  logger.info("Twitch Ad Muter initialized");
  updateMuteButton();
  
  // Set up the main interval
  setInterval(async () => {
    try {
      await updateUrl();
      await main();
    } catch (error) {
      logger.error(`Error in main loop: ${error.message}`);
    }
  }, CONFIG.CHECK_INTERVAL_MS);
}

// Start the extension
initialize();


/**
 * Checks if the button is in muted state
 * @param {HTMLElement} button - The mute button element
 * @returns {boolean} - True if muted, false otherwise
 */
function isButtonMuted(button) {
  if (!button || !button.ariaLabel) {
    logger.debug("Button or ariaLabel not available");
    return false;
  }
  
  logger.debug(`button.ariaLabel = ${button.ariaLabel}`);
  return button.ariaLabel === CONFIG.UNMUTED_BUTTON_LABEL;
}

/**
 * Checks if an ad is currently playing
 * @returns {boolean} - True if ad is playing, false otherwise
 */
function isAdPlaying() {
  return document.querySelector(CONFIG.AD_LABEL_SELECTOR) !== null;
}

/**
 * Main function that handles muting/unmuting based on ad presence
 * @returns {Promise<void>}
 */
async function main() {
  if (!muteButton) {
    logger.error(`Mute button is not present on ${state.tabTitle}`);
    // Try to find the button again
    updateMuteButton();
    return Promise.resolve();
  }
  
  // Don't interfere if user has manually set mute preferences
  if (state.initStatus || state.userMuted) {
    logger.debug(`Tab started muted or user muted stream on ${state.tabTitle}.`);
    return Promise.resolve();
  }
  
  const adIsPlaying = isAdPlaying();
  
  // Mute when ad starts playing
  if (adIsPlaying && !state.prevMuted) {
    logger.info(`Ad detected on ${state.tabTitle}. Muting stream.`);
    try {
      muteButton.click();
      state.prevMuted = true;
    } catch (error) {
      logger.error(`Failed to mute: ${error.message}`);
    }
  }
  // Unmute when ad finishes
  else if (!adIsPlaying && state.prevMuted) {
    logger.info(`Ad finished on ${state.tabTitle}. Unmuting stream.`);
    try {
      muteButton.click();
      state.prevMuted = false;
    } catch (error) {
      logger.error(`Failed to unmute: ${error.message}`);
    }
  }
  
  return Promise.resolve();
}
