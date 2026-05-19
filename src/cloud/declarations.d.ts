/// <reference types="parse" />
export {};
declare global {
  interface Window {
    backupHotkeyParentElement: Node | null;
    backupHotkeyElement: Node | null;
  }

  // nekocap shared code reaches into browser globals; type them as optional any on the server.
  // eslint-disable-next-line no-var
  var chrome: any;
  // eslint-disable-next-line no-var
  var browser: any;

  namespace Parse {
    namespace Cloud {
      function define<P extends Params = Params, R = any>(
        name: string,
        func: (request: FunctionRequest<P>) => Promise<R> | R,
        validator?: Validator | ((request: FunctionRequest<P>) => any),
      ): void;
    }
  }
}
