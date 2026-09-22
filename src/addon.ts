import * as hooks from "./hooks";

export class Addon {
  public data: {
    alive: boolean;
    prefPaneID: string | null;
    popupHandler: ((event: any) => void) | null;
    popupWin: any;
  };

  public hooks: typeof hooks;

  constructor() {
    this.data = {
      alive: true,
      prefPaneID: null,
      popupHandler: null,
      popupWin: null,
    };
    this.hooks = hooks;
  }
}

export default Addon;
