/**
 * Twitch Ad Muter - Background Script
 * Handles tab muting/unmuting functionality
 */

import browser from 'webextension-polyfill';

// Logging utilities
const logger = {
  debug: (message) => console.debug(`[Twitch Ad Muter BG] ${message}`),
  info: (message) => console.info(`[Twitch Ad Muter BG] ${message}`),
  error: (message) => console.error(`[Twitch Ad Muter BG] ${message}`)
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

    case 'muteTab':
      try {
        await browser.tabs.update(message.tabId || tabId, { muted: true });
        logger.info(`Tab ${message.tabId || tabId} muted`);
        return true;
      } catch (error) {
        logger.error(`Failed to mute tab: ${error.message}`);
        return false;
      }

    case 'unmuteTab':
      try {
        await browser.tabs.update(message.tabId || tabId, { muted: false });
        logger.info(`Tab ${message.tabId || tabId} unmuted`);
        return true;
      } catch (error) {
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

// Listen for tab mute changes to detect when a user manually mutes/unmutes
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only proceed if the mutedInfo property changed
  if (changeInfo.mutedInfo) {
    logger.debug(`Tab ${tabId} mute state changed to ${changeInfo.mutedInfo.muted}`);
    
    // Notify content script about the change
    browser.tabs.sendMessage(tabId, {
      action: 'tabMutedExternally',
      muted: changeInfo.mutedInfo.muted
    }).catch(error => {
      // This might fail if the content script isn't loaded yet, which is fine
      logger.debug(`Could not notify content script: ${error.message}`);
    });
  }
});

logger.info('Twitch Ad Muter background script initialized');
