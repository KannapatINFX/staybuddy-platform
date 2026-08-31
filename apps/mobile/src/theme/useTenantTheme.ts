import { compiledConfig } from "../config/compiled";
import { useBootstrap } from "../state/BootstrapContext";

export function useTenantTheme() {
  const { manifest } = useBootstrap();
  return manifest?.theme ?? compiledConfig().tenant.theme;
}
