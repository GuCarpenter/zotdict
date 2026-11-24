import { config } from "../package.json";
import { onRenderTextSelectionPopup } from "./dict";
import {
  registerAnnotationSync,
  unregisterAnnotationSync,
} from "./annotation-sync";

export async function onStartup(): Promise<void> {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  registerReaderListener();
  registerPreferencePane();
  registerAnnotationSync();
}

export async function onShutdown(): Promise<void> {
  unregisterAnnotationSync();

  if (addon.data.popupHandler) {
    try {
      (Zotero.Reader as any).unregisterEventListener(
        "renderTextSelectionPopup",
        addon.data.popupHandler,
      );
    } catch (e) {
      Zotero.debug(
        `${config.addonName}: failed to unregister reader listener: ${e}`,
      );
    }
    addon.data.popupHandler = null;
  }

  if (addon.data.prefPaneID) {
    try {
      (Zotero as any).PreferencePanes.unregister(addon.data.prefPaneID);
    } catch (e) {
      Zotero.debug(`${config.addonName}: failed to unregister pref pane: ${e}`);
    }
    addon.data.prefPaneID = null;
  }

  addon.data.alive = false;
  // @ts-expect-error - plugin instance is not typed
  delete Zotero[config.addonInstance];
}

export async function onMainWindowLoad(_win: Window): Promise<void> {}

export async function onMainWindowUnload(_win: Window): Promise<void> {}

function registerReaderListener(): void {
  addon.data.popupHandler = onRenderTextSelectionPopup;
  (Zotero.Reader as any).registerEventListener(
    "renderTextSelectionPopup",
    addon.data.popupHandler,
    config.addonID,
  );
}

function registerPreferencePane(): void {
  try {
    (Zotero as any).PreferencePanes.register({
      pluginID: config.addonID,
      src: `${rootURI}content/preferences.xhtml`,
      label: config.addonName,
      image: `${rootURI}content/icons/icon.svg`,
    }).then((paneID: string) => {
      addon.data.prefPaneID = paneID;
    });
  } catch (e) {
    Zotero.debug(
      `${config.addonName}: could not register the preferences pane: ${e}`,
    );
  }
}
