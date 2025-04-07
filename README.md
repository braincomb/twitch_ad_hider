# Mute Twitch Ads - Firefox Extension

This Firefox extension automatically mutes the tab and hides the video ad when a Twitch stream plays an advertisement and unmutes it when the ad finishes.

![image](https://github.com/user-attachments/assets/0d13139a-049e-4fa2-91eb-28294ed49008)


## Features

- Automatically detects Twitch ads and mutes the tab
- Uses browser's native tab muting API for reliability
- Adds overlay to block the video ad
- Respects user preferences (won't interfere if you manually mute/unmute)
- Works across Twitch channel navigation

## Installation

### Temporary Installation
1. Clone this repository
2. Open Firefox and navigate to `about:debugging`
3. Click "This Firefox" in the sidebar
4. Click "Load Temporary Add-on..."
5. Select the `zip` or `xpi` package file.

### Build for Distribution
1. Install dependencies: `npm install`
2. Build the extension: `npx web-ext build --overwrite-dest`
3. The packaged extension will be in the `web-ext-artifacts` directory

## Permissions

This extension requires the following permissions:
- `tabs`: To mute/unmute the current tab
- Access to `*://www.twitch.tv/*`: To detect ads on Twitch

## Reporting Bugs

If you encounter any bugs, please create a GitHub Issue with detailed information about:
- Your Firefox version
- Steps to reproduce the issue
- Expected vs. actual behavior
