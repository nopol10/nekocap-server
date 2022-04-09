export async function isInMaintenanceMode(): Promise<boolean> {
  const config = await Parse.Config.get();
  return config.get("maintenance") == true;
}
