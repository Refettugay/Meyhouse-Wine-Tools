import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Recipe Book photos are shrunk on the device (max ~900 px JPEG, usually
    // 100–300 KB) and sent with the save; 2 MB leaves room for base64.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
