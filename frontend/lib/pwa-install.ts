export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallNavigator {
  install?(): Promise<unknown>;
}

/** Invoke synchronously from a click so the browser keeps user activation. */
export async function promptInstallation(event: InstallPromptEvent | null, browser: InstallNavigator): Promise<boolean> {
  try {
    if (event) {
      await event.prompt();
      await event.userChoice;
      return true; // A dismissed prompt needs no second dialog.
    }
    if (typeof browser.install === 'function') {
      await browser.install();
      return true;
    }
    return false;
  } catch (error) {
    // The Web Install API reports user cancellation as AbortError.
    return !!error && typeof error === 'object' && 'name' in error && error.name === 'AbortError';
  }
}
