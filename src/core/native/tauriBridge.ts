/**
 * Tauri v2 Native Desktop & Mobile Service Bridge.
 * Provides unified native capabilities (file dialogs, local fs, window controls, notifications)
 * with graceful browser fallbacks.
 * Adheres strictly to docs/master_architecture_prompt_v2.md
 */

/**
 * Checks whether the current runtime is running inside a Tauri v2 native container.
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

export interface NativeFilePickResult {
  path?: string;
  name: string;
  content: string;
}

/**
 * Native file picker for importing Markdown or JSON question packs.
 */
export async function pickImportFile(): Promise<NativeFilePickResult | null> {
  if (isTauriEnvironment()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { readTextFile } = await import('@tauri-apps/plugin-fs');

      const selected = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: 'Question Packs',
            extensions: ['md', 'markdown', 'json'],
          },
        ],
      });

      if (!selected || typeof selected !== 'string') {
        return null;
      }

      const content = await readTextFile(selected);
      const name = selected.split(/[\\/]/).pop() || 'imported_file';

      return {
        path: selected,
        name,
        content,
      };
    } catch (err) {
      console.warn('Native Tauri file dialog failed, falling back to browser picker:', err);
    }
  }

  // Browser Fallback
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.json';

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          name: file.name,
          content: reader.result as string,
        });
      };
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };

    input.click();
  });
}

/**
 * Native file saver for exporting question sets and test blueprints.
 */
export async function saveExportFile(
  suggestedName: string,
  content: string,
  mimeType: string = 'text/markdown;charset=utf-8;'
): Promise<boolean> {
  if (isTauriEnvironment()) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');

      const extension = suggestedName.split('.').pop() || 'md';
      const targetPath = await save({
        defaultPath: suggestedName,
        filters: [
          {
            name: extension.toUpperCase(),
            extensions: [extension],
          },
        ],
      });

      if (!targetPath) return false;

      await writeTextFile(targetPath, content);
      return true;
    } catch (err) {
      console.warn('Native Tauri save dialog failed, falling back to browser download:', err);
    }
  }

  // Browser Fallback
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = suggestedName;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}

/**
 * Native desktop/mobile window fullscreen toggle.
 */
export async function setWindowFullscreen(fullscreen: boolean): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setFullscreen(fullscreen);
      return;
    } catch (err) {
      console.warn('Tauri window API failed:', err);
    }
  }

  // Web Fullscreen fallback
  if (fullscreen) {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => {});
    }
  } else {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }
  }
}

/**
 * Sends a native system notification (e.g. exam timer warning or exam submission complete).
 */
export async function sendNativeNotification(title: string, body: string): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      const { isPermissionGranted, requestPermission, sendNotification } = await import(
        '@tauri-apps/plugin-notification'
      );

      let permissionGranted = await isPermissionGranted();
      if (!permissionGranted) {
        const permission = await requestPermission();
        permissionGranted = permission === 'granted';
      }

      if (permissionGranted) {
        sendNotification({ title, body });
        return;
      }
    } catch (err) {
      console.warn('Tauri notification failed:', err);
    }
  }

  // Web Notification fallback
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          new Notification(title, { body });
        }
      });
    }
  }
}
