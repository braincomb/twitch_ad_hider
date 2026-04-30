/**
 * Twitch Ad Muter - Background Script
 * Handles tab muting/unmuting functionality
 */

// Firefox provides the browser global

// Logging utilities
const logger = {
  debug: (message) => console.debug(`[Twitch Ad Muter BG] ${message}`),
  info: (message) => console.info(`[Twitch Ad Muter BG] ${message}`),
  error: (message) => console.error(`[Twitch Ad Muter BG] ${message}`)
};

// Storage utilities
const storage = {
  async saveUserMuteState(tabId, isMuted) {
    try {
      await browser.storage.local.set({ [`userMuted_${tabId}`]: isMuted });
      logger.debug(`Saved user mute state for tab ${tabId}: ${isMuted}`);
    } catch (error) {
      logger.error(`Failed to save user mute state: ${error.message}`);
    }
  },
  
  async getUserMuteState(tabId) {
    try {
      const result = await browser.storage.local.get(`userMuted_${tabId}`);
      const isMuted = result[`userMuted_${tabId}`] || false;
      logger.debug(`Retrieved user mute state for tab ${tabId}: ${isMuted}`);
      return isMuted;
    } catch (error) {
      logger.error(`Failed to get user mute state: ${error.message}`);
      return false;
    }
  },
  
  async clearUserMuteState(tabId) {
    try {
      await browser.storage.local.remove(`userMuted_${tabId}`);
      logger.debug(`Cleared user mute state for tab ${tabId}`);
    } catch (error) {
      logger.error(`Failed to clear user mute state: ${error.message}`);
    }
  }
};

// Listen for messages from content scripts
browser.runtime.onMessage.addListener(async (message, sender) => {
  // If no sender tab, we can't proceed
  if (!sender.tab) {
    logger.error('Message received without sender tab information');
    return null;
  }

  const tabId = sender.tab.id;

  switch (message.action) {
    case 'getTabId':
      logger.debug(`Returning tab ID ${tabId} to content script`);
      return tabId;
      
    case 'getUserMuteState':
      return await storage.getUserMuteState(message.tabId || tabId);
      
    case 'saveUserMuteState':
      await storage.saveUserMuteState(message.tabId || tabId, message.isMuted);
      return true;

    case 'muteTab':
      try {
        // Mark this tab as being muted by our extension
        extensionMutedTabs.set(message.tabId || tabId, true);
        
        await browser.tabs.update(message.tabId || tabId, { muted: true });
        logger.info(`Tab ${message.tabId || tabId} muted by extension`);
        return true;
      } catch (error) {
        // Clean up our tracking on error
        extensionMutedTabs.delete(message.tabId || tabId);
        logger.error(`Failed to mute tab: ${error.message}`);
        return false;
      }

    case 'unmuteTab':
      try {
        // Mark this tab as being unmuted by our extension
        extensionMutedTabs.set(message.tabId || tabId, false);
        
        await browser.tabs.update(message.tabId || tabId, { muted: false });
        logger.info(`Tab ${message.tabId || tabId} unmuted by extension`);
        return true;
      } catch (error) {
        // Clean up our tracking on error
        extensionMutedTabs.delete(message.tabId || tabId);
        logger.error(`Failed to unmute tab: ${error.message}`);
        return false;
      }

    case 'getTabInfo':
      try {
        const tab = await browser.tabs.get(message.tabId || tabId);
        logger.debug(`Retrieved tab info for tab ${message.tabId || tabId}`);
        return tab;
      } catch (error) {
        logger.error(`Failed to get tab info: ${error.message}`);
        return null;
      }

    default:
      logger.error(`Unknown action: ${message.action}`);
      return null;
  }
});

// Track which tabs were muted by our extension
const extensionMutedTabs = new Map();

// Listen for tab mute changes to detect when a user manually mutes/unmutes
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only proceed if the mutedInfo property changed
  if (changeInfo.mutedInfo) {
    logger.debug(`Tab ${tabId} mute state changed to ${changeInfo.mutedInfo.muted}`);
    
    // Check if this mute/unmute was initiated by our extension
    const isExtensionInitiated = extensionMutedTabs.has(tabId);
    const isUserInitiated = !isExtensionInitiated;
    
    // If this was our extension's action, clear the tracking flag
    if (isExtensionInitiated) {
      extensionMutedTabs.delete(tabId);
      logger.debug(`Extension-initiated mute state change for tab ${tabId}`);
    }
    
    if (isUserInitiated) {
      // Save the user's preference to storage
      await storage.saveUserMuteState(tabId, changeInfo.mutedInfo.muted);
      logger.info(`User ${changeInfo.mutedInfo.muted ? 'muted' : 'unmuted'} tab ${tabId}, saved preference`);
    }
    
    // Notify content script about the change
    browser.tabs.sendMessage(tabId, {
      action: 'tabMutedExternally',
      muted: changeInfo.mutedInfo.muted,
      isUserInitiated: isUserInitiated
    }).catch(error => {
      // This might fail if the content script isn't loaded yet, which is fine
      logger.debug(`Could not notify content script: ${error.message}`);
    });
  }
});

// Clean up storage when tabs are closed
browser.tabs.onRemoved.addListener(async (tabId) => {
  await storage.clearUserMuteState(tabId);
  logger.debug(`Tab ${tabId} closed, cleared mute state from storage`);
});

logger.info('Twitch Ad Muter background script initialized');
