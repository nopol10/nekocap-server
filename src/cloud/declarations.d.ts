export {};
declare global {
  interface Window {
    backupHotkeyParentElement: Node | null;
    backupHotkeyElement: Node | null;
  }
}
