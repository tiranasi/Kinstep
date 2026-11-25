import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

const config: NextConfig = {
  serverExternalPackages: ["node:sqlite"],
  devIndicators: false,
  allowedDevOrigins: Object.values(networkInterfaces()).flatMap((addresses) =>
    (addresses || []).filter((a) => a.family === "IPv4" && !a.internal).map((a) => a.address),
  ),
};
export default config;
